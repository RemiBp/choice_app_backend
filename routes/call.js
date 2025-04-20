const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

// Connexion aux bases nécessaires
const usersDbChoice = mongoose.connection.useDb('choice_app');

// Modèles
const User = usersDbChoice.model(
  'User',
  new mongoose.Schema({}, { strict: false }),
  'Users'
);

const Call = usersDbChoice.model(
  'Call',
  new mongoose.Schema({
    callerId: String,
    recipientId: String,
    status: String, // 'initiated', 'accepted', 'rejected', 'completed', 'missed'
    startTime: Date,
    endTime: Date,
    duration: Number, // en secondes
    isVideo: Boolean,
    createdAt: { type: Date, default: Date.now }
  }),
  'Calls'
);

// Stockage temporaire des sessions d'appel (à remplacer par Redis en production)
const activeCalls = new Map();
const iceServers = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' }
];

// Middleware d'authentification (à implémenter avec les tokens JWT)
const authenticate = (req, res, next) => {
  // Pour la démo, on accepte tous les appels
  next();
};

// POST /api/call/start - Initier un appel
router.post('/start', authenticate, async (req, res) => {
  const { callerId, recipientId, isVideo = false } = req.body;
  
  if (!callerId || !recipientId) {
    return res.status(400).json({
      success: false,
      message: 'Les identifiants d\'appelant et de destinataire sont requis'
    });
  }
  
  try {
    // Vérifier si les utilisateurs existent
    const [caller, recipient] = await Promise.all([
      User.findById(callerId),
      User.findById(recipientId)
    ]);
    
    if (!caller || !recipient) {
      return res.status(404).json({
        success: false,
        message: 'Un ou plusieurs utilisateurs n\'existent pas'
      });
    }
    
    // Vérifier si le destinataire est déjà en appel
    if (activeCalls.has(recipientId) && activeCalls.get(recipientId).status === 'active') {
      return res.status(409).json({
        success: false,
        message: 'Le destinataire est déjà en appel'
      });
    }
    
    // Créer un nouvel appel
    const callId = new mongoose.Types.ObjectId().toString();
    const call = new Call({
      _id: callId,
      callerId,
      recipientId,
      status: 'initiated',
      startTime: new Date(),
      isVideo
    });
    
    await call.save();
    
    // Stocker l'appel dans la mémoire temporaire
    activeCalls.set(callId, {
      callerId,
      recipientId,
      status: 'initiated',
      isVideo,
      startTime: new Date(),
      signals: {
        caller: null,
        recipient: null
      }
    });
    
    // --- ENVOI DE NOTIFICATION PUSH AU DESTINATAIRE ---
    try {
      // Récupérer le nom de l'appelant
      const callerName = caller.name || caller.username || 'Utilisateur';
      // Appeler l'endpoint de notification push
      const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
      await fetch(`${process.env.BASE_URL || 'http://localhost:5000'}/api/notifications/send-push`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: recipientId,
          title: 'Appel entrant',
          body: `Vous recevez un appel de ${callerName}`,
          data: {
            type: 'call',
            callId,
            from: callerId,
            fromName: callerName,
            isVideo
          }
        })
      });
    } catch (notifErr) {
      console.error('Erreur lors de l\'envoi de la notification push d\'appel:', notifErr);
    }
    // --- FIN ENVOI NOTIF ---
    
    return res.status(200).json({
      success: true,
      callId,
      iceServers,
      message: 'Appel initié avec succès'
    });
  } catch (error) {
    console.error('Erreur lors de l\'initiation de l\'appel:', error);
    return res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de l\'initiation de l\'appel',
      error: error.message
    });
  }
});

// POST /api/call/answer - Répondre à un appel
router.post('/answer', authenticate, async (req, res) => {
  const { callId, accept = true } = req.body;
  
  if (!callId) {
    return res.status(400).json({
      success: false,
      message: 'L\'identifiant d\'appel est requis'
    });
  }
  
  try {
    // Vérifier si l'appel existe
    const call = await Call.findById(callId);
    if (!call) {
      return res.status(404).json({
        success: false,
        message: 'Appel non trouvé'
      });
    }
    
    // Vérifier si l'appel est toujours en cours d'initiation
    if (call.status !== 'initiated') {
      return res.status(409).json({
        success: false,
        message: `L'appel a déjà été ${call.status === 'accepted' ? 'accepté' : 'terminé'}`
      });
    }
    
    // Mettre à jour le statut de l'appel
    call.status = accept ? 'accepted' : 'rejected';
    if (accept) {
      // Début de l'appel
      call.startTime = new Date();
    } else {
      // Fin de l'appel (rejeté)
      call.endTime = new Date();
      call.duration = 0;
    }
    
    await call.save();
    
    // Mettre à jour l'appel dans la mémoire
    if (activeCalls.has(callId)) {
      const activeCall = activeCalls.get(callId);
      activeCall.status = accept ? 'active' : 'ended';
      
      if (!accept) {
        // Nettoyer après un certain délai
        setTimeout(() => {
          activeCalls.delete(callId);
        }, 5000);
      }
    }
    
    return res.status(200).json({
      success: true,
      callId,
      iceServers: accept ? iceServers : undefined,
      message: accept ? 'Appel accepté' : 'Appel rejeté'
    });
  } catch (error) {
    console.error('Erreur lors de la réponse à l\'appel:', error);
    return res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de la réponse à l\'appel',
      error: error.message
    });
  }
});

// POST /api/call/end - Terminer un appel
router.post('/end', authenticate, async (req, res) => {
  const { callId } = req.body;
  
  if (!callId) {
    return res.status(400).json({
      success: false,
      message: 'L\'identifiant d\'appel est requis'
    });
  }
  
  try {
    // Vérifier si l'appel existe
    const call = await Call.findById(callId);
    if (!call) {
      return res.status(404).json({
        success: false,
        message: 'Appel non trouvé'
      });
    }
    
    // Si l'appel est déjà terminé
    if (call.status === 'completed' || call.status === 'rejected') {
      return res.status(409).json({
        success: false,
        message: 'L\'appel est déjà terminé'
      });
    }
    
    // Calculer la durée de l'appel
    const endTime = new Date();
    const duration = call.startTime 
      ? Math.round((endTime - call.startTime) / 1000) 
      : 0;
    
    // Mettre à jour l'appel
    call.status = 'completed';
    call.endTime = endTime;
    call.duration = duration;
    
    await call.save();
    
    // Nettoyer la mémoire temporaire
    if (activeCalls.has(callId)) {
      activeCalls.get(callId).status = 'ended';
      
      // Nettoyer après un certain délai
      setTimeout(() => {
        activeCalls.delete(callId);
      }, 5000);
    }
    
    return res.status(200).json({
      success: true,
      callId,
      duration,
      message: 'Appel terminé avec succès'
    });
  } catch (error) {
    console.error('Erreur lors de la terminaison de l\'appel:', error);
    return res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de la terminaison de l\'appel',
      error: error.message
    });
  }
});

// POST /api/call/signal - Échanger des données de signalisation WebRTC
router.post('/signal', authenticate, async (req, res) => {
  const { callId, from, to, signal } = req.body;
  
  if (!callId || !from || !to || !signal) {
    return res.status(400).json({
      success: false,
      message: 'Les paramètres callId, from, to et signal sont requis'
    });
  }
  
  try {
    // Vérifier si l'appel existe en mémoire
    if (!activeCalls.has(callId)) {
      return res.status(404).json({
        success: false,
        message: 'Appel non trouvé ou terminé'
      });
    }
    
    const activeCall = activeCalls.get(callId);
    
    // Vérifier si l'appel est actif
    if (activeCall.status !== 'initiated' && activeCall.status !== 'active') {
      return res.status(409).json({
        success: false,
        message: 'L\'appel n\'est pas actif'
      });
    }
    
    // Stocker le signal pour qu'il soit récupéré par l'autre participant
    // En production, on utiliserait un système de websockets ou push notifications
    // pour transmettre le signal immédiatement
    
    // Pour cette démo, on stocke simplement le dernier signal
    if (from === activeCall.callerId) {
      activeCall.signals.caller = signal;
    } else if (from === activeCall.recipientId) {
      activeCall.signals.recipient = signal;
    } else {
      return res.status(403).json({
        success: false,
        message: 'Utilisateur non autorisé à signaler pour cet appel'
      });
    }
    
    return res.status(200).json({
      success: true,
      message: 'Signal enregistré avec succès'
    });
  } catch (error) {
    console.error('Erreur lors de la signalisation:', error);
    return res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de la signalisation',
      error: error.message
    });
  }
});

// GET /api/call/signal/:callId/:userId - Récupérer les signaux d'un appel pour un utilisateur
router.get('/signal/:callId/:userId', authenticate, async (req, res) => {
  const { callId, userId } = req.params;
  
  if (!callId || !userId) {
    return res.status(400).json({
      success: false,
      message: 'Les paramètres callId et userId sont requis'
    });
  }
  
  try {
    // Vérifier si l'appel existe en mémoire
    if (!activeCalls.has(callId)) {
      return res.status(404).json({
        success: false,
        message: 'Appel non trouvé ou terminé'
      });
    }
    
    const activeCall = activeCalls.get(callId);
    
    // Vérifier si l'utilisateur fait partie de l'appel
    if (userId !== activeCall.callerId && userId !== activeCall.recipientId) {
      return res.status(403).json({
        success: false,
        message: 'Utilisateur non autorisé à accéder à cet appel'
      });
    }
    
    // Récupérer le signal de l'autre participant
    let signal = null;
    if (userId === activeCall.callerId) {
      signal = activeCall.signals.recipient;
    } else {
      signal = activeCall.signals.caller;
    }
    
    return res.status(200).json({
      success: true,
      signal,
      callStatus: activeCall.status
    });
  } catch (error) {
    console.error('Erreur lors de la récupération du signal:', error);
    return res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de la récupération du signal',
      error: error.message
    });
  }
});

// GET /api/call/history/:userId - Obtenir l'historique des appels d'un utilisateur
router.get('/history/:userId', authenticate, async (req, res) => {
  const { userId } = req.params;
  const { limit = 20, offset = 0 } = req.query;
  
  if (!userId) {
    return res.status(400).json({
      success: false,
      message: 'L\'identifiant d\'utilisateur est requis'
    });
  }
  
  try {
    // Trouver tous les appels où l'utilisateur était impliqué
    const calls = await Call.find({
      $or: [
        { callerId: userId },
        { recipientId: userId }
      ]
    })
    .sort({ createdAt: -1 })
    .skip(parseInt(offset))
    .limit(parseInt(limit));
    
    // Compter le nombre total d'appels
    const totalCalls = await Call.countDocuments({
      $or: [
        { callerId: userId },
        { recipientId: userId }
      ]
    });
    
    return res.status(200).json({
      success: true,
      calls,
      total: totalCalls,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (error) {
    console.error('Erreur lors de la récupération de l\'historique des appels:', error);
    return res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de la récupération de l\'historique des appels',
      error: error.message
    });
  }
});

module.exports = router; 
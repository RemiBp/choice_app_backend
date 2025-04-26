const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { requireAuth } = require('../middleware/authMiddleware');
const { io } = require('../index'); // Socket.IO pour les notifications en temps réel
const Call = require('../models/call');
const { createModel, databases } = require('../utils/modelCreator');

// Modèles nécessaires
const User = createModel(databases.CHOICE_APP, 'User', 'Users');
const Conversation = createModel(databases.CHOICE_APP, 'Conversation', 'conversations');

// Configuration pour WebRTC
const iceServers = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' }
];

// Configuration Twilio (si utilisé)
let twilioClient;
try {
  const twilio = require('twilio');
  if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
    twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    console.log('✅ Twilio client initialized successfully');
  }
} catch (e) {
  console.log('⚠️ Twilio not available, using default WebRTC');
}

// Configuration Agora (alternative à Twilio)
let agoraClient;
try {
  const { RtcTokenBuilder, RtcRole } = require('agora-access-token');
  if (process.env.AGORA_APP_ID && process.env.AGORA_APP_CERTIFICATE) {
    agoraClient = { RtcTokenBuilder, RtcRole };
    console.log('✅ Agora SDK initialized successfully');
  }
} catch (e) {
  console.log('⚠️ Agora SDK not available');
}

/**
 * @route POST /api/call/initiate
 * @desc Initier un appel audio ou vidéo
 * @access Private
 */
router.post('/initiate', requireAuth, async (req, res) => {
  try {
    const { 
      conversationId, 
      recipientIds, 
      type = 'video',
      useExternalProvider = false
    } = req.body;
    
    const initiatorId = req.user.id;
    
    if (!initiatorId || (!conversationId && (!recipientIds || !recipientIds.length))) {
      return res.status(400).json({ 
        success: false, 
        message: 'Données incomplètes pour l\'initiation de l\'appel'
      });
    }
    
    // Valider le type d'appel
    if (!['audio', 'video'].includes(type)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Type d\'appel invalide, utilisez "audio" ou "video"'
      });
    }
    
    let targetRecipientIds = [];
    
    // Si conversationId est fourni, récupérer les participants de la conversation
    if (conversationId) {
      const conversation = await Conversation.findById(conversationId);
      if (!conversation) {
        return res.status(404).json({ 
          success: false, 
          message: 'Conversation non trouvée'
        });
      }
      
      // Vérifier que l'initiateur fait partie de la conversation
      if (!conversation.participants.some(p => p.toString() === initiatorId)) {
        return res.status(403).json({ 
          success: false, 
          message: 'Vous n\'êtes pas autorisé à initier un appel dans cette conversation'
        });
      }
      
      // Récupérer tous les participants sauf l'initiateur
      targetRecipientIds = conversation.participants
        .filter(p => p.toString() !== initiatorId)
        .map(p => p.toString());
    } else {
      // Utiliser les recipientIds fournis
      targetRecipientIds = recipientIds;
    }
    
    // Vérifier que les destinataires existent
    const recipients = await User.find({
      _id: { $in: targetRecipientIds }
    }).select('_id name username profilePicture photo_url fcm_token device_info');
    
    if (recipients.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Aucun destinataire valide trouvé'
      });
    }
    
    // Récupérer l'initiateur
    const initiator = await User.findById(initiatorId)
      .select('_id name username profilePicture photo_url');
    
    if (!initiator) {
      return res.status(404).json({ 
        success: false, 
        message: 'Initiateur non trouvé'
      });
    }
    
    // Créer un nouvel appel
    const call = new Call({
      conversationId: conversationId || null,
      initiator: initiatorId,
      recipients: recipients.map(r => r._id),
      type,
      participants: [
        {
          userId: initiatorId,
          status: 'joined',
          joinedAt: new Date(),
          device: req.body.deviceInfo || {}
        },
        ...recipients.map(r => ({
          userId: r._id,
          status: 'invited',
          device: r.device_info || {}
        }))
      ]
    });
    
    await call.save();
    
    // Générer les tokens pour le service RTC si un fournisseur externe est utilisé
    let rtcData = { provider: 'webrtc' };
    const callId = call._id.toString();
    
    if (useExternalProvider) {
      if (twilioClient) {
        // Créer une salle Twilio Video
        try {
          const room = await twilioClient.video.v1.rooms.create({ 
            uniqueName: `call-${callId}`, 
            type: 'group' 
          });
          
          // Générer un token pour l'initiateur
          const token = await twilioClient.video.v1.rooms(room.sid)
            .tokens.create({ identity: initiatorId });
          
          rtcData = {
            provider: 'twilio',
            roomId: room.sid,
            token: token.toJwt()
          };
          
          // Mettre à jour les données RTC dans l'appel
          call.rtcData = rtcData;
          await call.save();
        } catch (twilioErr) {
          console.error('Erreur Twilio:', twilioErr);
          // Fallback au WebRTC standard
        }
      } else if (agoraClient) {
        // Utiliser Agora comme alternative
        try {
          const { RtcTokenBuilder, RtcRole } = agoraClient;
          const agoraAppId = process.env.AGORA_APP_ID;
          const agoraChannelName = `call-${callId}`;
          const uid = 0; // 0 signifie que nous laissons Agora attribuer un UID
          const role = RtcRole.PUBLISHER;
          const expirationTimeInSeconds = 3600; // 1 heure
          const currentTimestamp = Math.floor(Date.now() / 1000);
          const expirationTimestamp = currentTimestamp + expirationTimeInSeconds;
          
          // Générer le token
          const token = RtcTokenBuilder.buildTokenWithUid(
            agoraAppId,
            process.env.AGORA_APP_CERTIFICATE,
            agoraChannelName,
            uid,
            role,
            expirationTimestamp
          );
          
          rtcData = {
            provider: 'agora',
            roomId: agoraChannelName,
            token,
            appId: agoraAppId
          };
          
          // Mettre à jour les données RTC dans l'appel
          call.rtcData = rtcData;
          await call.save();
        } catch (agoraErr) {
          console.error('Erreur Agora:', agoraErr);
          // Fallback au WebRTC standard
        }
      }
    }
    
    // Notifier les destinataires via WebSocket
    recipients.forEach(recipient => {
      io.to(`user_${recipient._id}`).emit('incoming_call', {
        callId,
        conversationId: conversationId || null,
        initiator: {
          _id: initiator._id,
          name: initiator.name || initiator.username || 'Utilisateur',
          profilePicture: initiator.profilePicture || initiator.photo_url
        },
        type,
        rtcData: rtcData.provider !== 'webrtc' ? rtcData : null,
        iceServers: rtcData.provider === 'webrtc' ? iceServers : null
      });
    });
    
    // Envoyer une notification push à chaque destinataire
    const notificationPromises = recipients
      .filter(r => r.fcm_token) // Filtrer ceux qui ont un token FCM
      .map(async (recipient) => {
        try {
          const response = await fetch(`${process.env.BASE_URL || 'http://localhost:5000'}/api/notifications/send-push`, {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${req.headers.authorization.split(' ')[1]}` 
            },
            body: JSON.stringify({
              userId: recipient._id,
              title: `Appel ${type === 'video' ? 'vidéo' : 'audio'} entrant`,
              body: `${initiator.name || initiator.username || 'Quelqu\'un'} vous appelle...`,
              data: {
                type: 'call',
                callId,
                conversationId: conversationId || null,
                from: initiator._id,
                callType: type
              },
              badge: 1,
              sound: 'ringtone'
            })
          });
          
          return response.ok;
        } catch (e) {
          console.error(`Erreur lors de l'envoi de la notification à ${recipient._id}:`, e);
          return false;
        }
      });
    
    // Attendre l'envoi des notifications, mais ne pas bloquer la réponse
    Promise.allSettled(notificationPromises).then(results => {
      const successCount = results.filter(r => r.status === 'fulfilled' && r.value).length;
      console.log(`✅ ${successCount}/${recipients.length} notifications d'appel envoyées`);
    });
    
    // Répondre immédiatement
    res.status(201).json({
      success: true,
      callId,
      rtcData,
      iceServers: rtcData.provider === 'webrtc' ? iceServers : null,
      recipients: recipients.map(r => ({
        _id: r._id,
        name: r.name || r.username || 'Utilisateur',
        profilePicture: r.profilePicture || r.photo_url
      }))
    });
  } catch (error) {
    console.error('❌ Erreur lors de l\'initiation de l\'appel:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Erreur serveur lors de l\'initiation de l\'appel',
      error: error.message
    });
  }
});

/**
 * @route POST /api/call/join
 * @desc Rejoindre un appel existant
 * @access Private
 */
router.post('/join', requireAuth, async (req, res) => {
  try {
    const { callId, deviceInfo } = req.body;
    const userId = req.user.id;
    
    if (!callId) {
      return res.status(400).json({ 
        success: false, 
        message: 'ID d\'appel requis'
      });
    }
    
    // Vérifier que l'appel existe
    const call = await Call.findById(callId);
    if (!call) {
      return res.status(404).json({ 
        success: false, 
        message: 'Appel non trouvé'
      });
    }
    
    // Vérifier que l'utilisateur est invité à l'appel
    const isInvited = call.initiator.toString() === userId || 
                     call.recipients.some(r => r.toString() === userId);
    
    if (!isInvited) {
      return res.status(403).json({ 
        success: false, 
        message: 'Vous n\'êtes pas autorisé à rejoindre cet appel'
      });
    }
    
    // Vérifier que l'appel n'est pas terminé
    if (call.status === 'ended') {
      return res.status(400).json({ 
        success: false, 
        message: 'Cet appel est déjà terminé'
      });
    }
    
    // Mettre à jour le statut du participant
    call.updateParticipantStatus(userId, 'joined');
    
    // Si c'est le premier participant à rejoindre (à part l'initiateur), 
    // mettre à jour le statut de l'appel
    if (call.status === 'initiated' || call.status === 'ringing') {
      call.status = 'ongoing';
      await call.save();
    }
    
    // Générer un token pour le service RTC si nécessaire
    let rtcData = call.rtcData || { provider: 'webrtc' };
    
    // Si un service externe est utilisé, générer un token pour ce participant
    if (rtcData.provider === 'twilio' && twilioClient) {
      try {
        const token = await twilioClient.video.v1.rooms(rtcData.roomId)
          .tokens.create({ identity: userId });
        
        rtcData.token = token.toJwt();
      } catch (twilioErr) {
        console.error('Erreur Twilio lors du join:', twilioErr);
        // Fallback aux données existantes
      }
    } else if (rtcData.provider === 'agora' && agoraClient) {
      try {
        const { RtcTokenBuilder, RtcRole } = agoraClient;
        const agoraAppId = process.env.AGORA_APP_ID;
        const agoraChannelName = rtcData.roomId;
        const uid = 0; // 0 signifie que nous laissons Agora attribuer un UID
        const role = RtcRole.PUBLISHER;
        const expirationTimeInSeconds = 3600; // 1 heure
        const currentTimestamp = Math.floor(Date.now() / 1000);
        const expirationTimestamp = currentTimestamp + expirationTimeInSeconds;
        
        // Générer le token
        const token = RtcTokenBuilder.buildTokenWithUid(
          agoraAppId,
          process.env.AGORA_APP_CERTIFICATE,
          agoraChannelName,
          uid,
          role,
          expirationTimestamp
        );
        
        rtcData.token = token;
      } catch (agoraErr) {
        console.error('Erreur Agora lors du join:', agoraErr);
      }
    }
    
    // Notifier les autres participants de l'appel via WebSocket
    io.to(`call_${callId}`).emit('participant_joined', {
      callId,
      userId,
      timestamp: new Date().toISOString()
    });
    
    // Faire rejoindre ce participant à la room Socket.IO de l'appel
    const socketId = req.headers['socket-id'];
    if (socketId && io.sockets.sockets.get(socketId)) {
      io.sockets.sockets.get(socketId).join(`call_${callId}`);
    }
    
    res.status(200).json({
      success: true,
      call: {
        _id: call._id,
        conversationId: call.conversationId,
        type: call.type,
        initiator: call.initiator,
        status: call.status,
        startTime: call.startTime,
        participants: call.participants
      },
      rtcData,
      iceServers: rtcData.provider === 'webrtc' ? iceServers : null
    });
  } catch (error) {
    console.error('❌ Erreur lors du join à l\'appel:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Erreur serveur',
      error: error.message
    });
  }
});

/**
 * @route POST /api/call/decline
 * @desc Refuser un appel
 * @access Private
 */
router.post('/decline', requireAuth, async (req, res) => {
  try {
    const { callId, reason = 'declined' } = req.body;
    const userId = req.user.id;
    
    if (!callId) {
      return res.status(400).json({ 
        success: false, 
        message: 'ID d\'appel requis'
      });
    }
    
    // Vérifier que l'appel existe
    const call = await Call.findById(callId);
    if (!call) {
      return res.status(404).json({ 
        success: false, 
        message: 'Appel non trouvé'
      });
    }
    
    // Vérifier que l'utilisateur est invité à l'appel
    const isInvited = call.recipients.some(r => r.toString() === userId);
    
    if (!isInvited) {
      return res.status(403).json({ 
        success: false, 
        message: 'Vous n\'êtes pas concerné par cet appel'
      });
    }
    
    // Mettre à jour le statut du participant
    call.updateParticipantStatus(userId, reason === 'busy' ? 'busy' : 'declined');
    
    // Vérifier si tous les participants ont refusé/manqué l'appel
    if (call.areAllParticipantsUnavailable()) {
      call.status = 'rejected';
      call.endTime = new Date();
      await call.save();
      
      // Notifier l'initiateur que tout le monde a refusé
      io.to(`user_${call.initiator}`).emit('call_rejected', {
        callId,
        reason: 'all_declined'
      });
    } else {
      // Notifier les autres participants qu'un utilisateur a refusé
      io.to(`call_${callId}`).emit('participant_declined', {
        callId,
        userId,
        reason,
        timestamp: new Date().toISOString()
      });
    }
    
    res.status(200).json({
      success: true,
      message: 'Appel refusé avec succès'
    });
  } catch (error) {
    console.error('❌ Erreur lors du refus de l\'appel:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Erreur serveur',
      error: error.message
    });
  }
});

/**
 * @route POST /api/call/end
 * @desc Terminer un appel
 * @access Private
 */
router.post('/end', requireAuth, async (req, res) => {
  try {
    const { callId } = req.body;
    const userId = req.user.id;
    
    if (!callId) {
      return res.status(400).json({ 
        success: false, 
        message: 'ID d\'appel requis'
      });
    }
    
    // Vérifier que l'appel existe
    const call = await Call.findById(callId);
    if (!call) {
      return res.status(404).json({ 
        success: false, 
        message: 'Appel non trouvé'
      });
    }
    
    // Vérifier que l'utilisateur est participant à l'appel
    const isParticipant = call.initiator.toString() === userId || 
                          call.recipients.some(r => r.toString() === userId);
    
    if (!isParticipant) {
      return res.status(403).json({ 
        success: false, 
        message: 'Vous n\'êtes pas autorisé à terminer cet appel'
      });
    }
    
    // Si l'initiateur termine l'appel ou si c'est le dernier participant, terminer l'appel
    const isInitiator = call.initiator.toString() === userId;
    
    if (isInitiator) {
      // L'initiateur peut toujours terminer l'appel
      await call.endCall();
    } else {
      // Mettre à jour le statut du participant
      call.updateParticipantStatus(userId, 'left');
      
      // Vérifier s'il reste des participants actifs (à part l'initiateur)
      const activeParticipants = call.participants.filter(
        p => p.status === 'joined' && p.userId.toString() !== call.initiator.toString()
      );
      
      if (activeParticipants.length === 0) {
        // Plus personne n'est en ligne, terminer l'appel
        await call.endCall();
      }
    }
    
    // Notifier tous les participants que l'appel est terminé
    io.to(`call_${callId}`).emit('call_ended', {
      callId,
      endedBy: userId,
      wasInitiator: isInitiator,
      timestamp: new Date().toISOString()
    });
    
    // Fermer la room d'appel si l'appel est terminé
    if (call.status === 'ended') {
      // Terminer l'appel WebRTC (Twilio ou autre) si nécessaire
      if (call.rtcData && call.rtcData.provider === 'twilio' && twilioClient) {
        try {
          await twilioClient.video.v1.rooms(call.rtcData.roomId).update({ status: 'completed' });
        } catch (twilioErr) {
          console.error('Erreur lors de la fermeture de la room Twilio:', twilioErr);
        }
      }
    }
    
    res.status(200).json({
      success: true,
      message: 'Appel terminé avec succès',
      duration: call.getCurrentDuration()
    });
  } catch (error) {
    console.error('❌ Erreur lors de la fin de l\'appel:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Erreur serveur',
      error: error.message
    });
  }
});

/**
 * @route GET /api/call/history
 * @desc Récupérer l'historique des appels d'un utilisateur
 * @access Private
 */
router.get('/history', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { limit = 20, skip = 0 } = req.query;
    
    // Récupérer les appels où l'utilisateur est impliqué
    const calls = await Call.find({
      $or: [
        { initiator: userId },
        { recipients: userId },
        { 'participants.userId': userId }
      ]
    })
    .sort({ startTime: -1 })
    .skip(Number(skip))
    .limit(Number(limit))
    .populate('initiator', '_id name username profilePicture photo_url')
    .populate('recipients', '_id name username profilePicture photo_url');
    
    // Formater les résultats
    const formattedCalls = await Promise.all(calls.map(async (call) => {
      // Pour les appels liés à une conversation, récupérer les infos de la conversation
      let conversationInfo = null;
      if (call.conversationId) {
        const conversation = await Conversation.findById(call.conversationId)
          .select('_id groupName groupAvatar isGroup participants');
        
        if (conversation) {
          conversationInfo = {
            _id: conversation._id,
            isGroup: conversation.isGroup,
            name: conversation.groupName,
            avatar: conversation.groupAvatar
          };
        }
      }
      
      // Déterminer si c'est un appel entrant ou sortant pour cet utilisateur
      const isOutgoing = call.initiator._id.toString() === userId;
      
      // Déterminer le statut de l'appel pour cet utilisateur
      let userCallStatus = 'missed';
      const participant = call.participants.find(p => p.userId.toString() === userId);
      
      if (participant) {
        userCallStatus = participant.status;
      } else if (isOutgoing) {
        userCallStatus = 'initiated';
      }
      
      return {
        _id: call._id,
        conversationId: call.conversationId,
        conversation: conversationInfo,
        type: call.type,
        isOutgoing,
        status: call.status,
        userStatus: userCallStatus,
        startTime: call.startTime,
        endTime: call.endTime,
        duration: call.metadata?.duration || call.getCurrentDuration(),
        participants: call.participants.map(p => ({
          userId: p.userId,
          status: p.status,
          joinedAt: p.joinedAt,
          leftAt: p.leftAt
        })),
        // Pour les appels individuels, ajouter les informations de l'autre personne
        contact: !conversationInfo && !isOutgoing ? call.initiator : 
                 !conversationInfo && isOutgoing && call.recipients.length > 0 ? call.recipients[0] : null
      };
    }));
    
    res.status(200).json({
      success: true,
      calls: formattedCalls,
      total: await Call.countDocuments({
        $or: [
          { initiator: userId },
          { recipients: userId },
          { 'participants.userId': userId }
        ]
      })
    });
  } catch (error) {
    console.error('❌ Erreur lors de la récupération de l\'historique des appels:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Erreur serveur',
      error: error.message
    });
  }
});

/**
 * @route GET /api/call/:callId
 * @desc Récupérer les détails d'un appel
 * @access Private
 */
router.get('/:callId', requireAuth, async (req, res) => {
  try {
    const { callId } = req.params;
    const userId = req.user.id;
    
    const call = await Call.findById(callId)
      .populate('initiator', '_id name username profilePicture photo_url')
      .populate('recipients', '_id name username profilePicture photo_url');
    
    if (!call) {
      return res.status(404).json({ 
        success: false, 
        message: 'Appel non trouvé'
      });
    }
    
    // Vérifier que l'utilisateur est participant à l'appel
    const isParticipant = call.initiator._id.toString() === userId || 
                          call.recipients.some(r => r._id.toString() === userId);
    
    if (!isParticipant) {
      return res.status(403).json({ 
        success: false, 
        message: 'Vous n\'êtes pas autorisé à voir cet appel'
      });
    }
    
    // Récupérer les infos de la conversation si applicable
    let conversationInfo = null;
    if (call.conversationId) {
      const conversation = await Conversation.findById(call.conversationId)
        .select('_id groupName groupAvatar isGroup participants');
      
      if (conversation) {
        conversationInfo = {
          _id: conversation._id,
          isGroup: conversation.isGroup,
          name: conversation.groupName,
          avatar: conversation.groupAvatar
        };
      }
    }
    
    res.status(200).json({
      success: true,
      call: {
        _id: call._id,
        conversationId: call.conversationId,
        conversation: conversationInfo,
        type: call.type,
        initiator: call.initiator,
        recipients: call.recipients,
        status: call.status,
        startTime: call.startTime,
        endTime: call.endTime,
        duration: call.metadata?.duration || call.getCurrentDuration(),
        participants: call.participants
      }
    });
  } catch (error) {
    console.error('❌ Erreur lors de la récupération de l\'appel:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Erreur serveur',
      error: error.message
    });
  }
});

// Exporter le routeur
module.exports = router; 
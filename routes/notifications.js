const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const notificationController = require('../controllers/notificationController'); // Import the controller

// Utiliser l'accès global aux bases de données
let admin;
try {
  admin = require('firebase-admin');
} catch (error) {
  console.warn('⚠️ firebase-admin non disponible, les notifications push seront désactivées');
  admin = { apps: [] };
}
let nodemailer;
try {
  nodemailer = require('nodemailer');
} catch (error) {
  console.warn('⚠️ nodemailer non disponible, les notifications par email seront désactivées');
}

// Modèle pour les notifications
const notificationSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, required: true },
  type: { 
    type: String, 
    enum: ['follow', 'like', 'comment', 'message', 'event', 'system', 'friend_request', 'friend_nearby'],
    required: true 
  },
  message: { type: String, required: true },
  relatedId: { type: mongoose.Schema.Types.ObjectId }, // ID du post, commentaire, événement, utilisateur concerné
  sender: { type: mongoose.Schema.Types.ObjectId }, // ID de l'utilisateur qui a déclenché la notification
  isRead: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
  imageUrl: { type: String },
  actionUrl: { type: String } // URL à ouvrir quand on clique sur la notification
});

// Définir le modèle de notification après l'initialisation de la base de données
let Notification;
let User;
const initialize = () => {
  if (!global.db || !global.db.choiceAppDb) {
    throw new Error('La base de données Choice App n\'est pas initialisée');
  }
  Notification = global.db.choiceAppDb.model('Notification', notificationSchema, 'notifications');
  User = global.db.choiceAppDb.model('User', new mongoose.Schema({}), 'Users');
}

// Tenter d'initialiser le modèle immédiatement si global.db est disponible
try {
  initialize();
} catch (error) {
  console.warn('⚠️ Notification model initialization deferred: ' + error.message);
}

// Initialiser Firebase Admin SDK (si ce n'est pas déjà fait ailleurs)
if (!admin.apps.length && admin.credential) {
  try {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')
      })
    });
    console.log('✅ Firebase Admin SDK initialized successfully');
  } catch (error) {
    console.error('❌ Erreur d\'initialisation de Firebase Admin:', error);
  }
}

// Configurer le transporteur nodemailer
let transporter;
if (nodemailer) {
  transporter = nodemailer.createTransport({
    service: process.env.EMAIL_SERVICE || 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASSWORD
    }
  });
}

// Middleware d'authentification (à importer si nécessaire)
const auth = async (req, res, next) => {
  // Votre logique d'authentification ici
  next();
};

/**
 * @route GET /api/notifications/:userId
 * @desc Obtenir les notifications d'un utilisateur
 * @access Private
 */
router.get('/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { limit = 50, skip = 0, unreadOnly = false } = req.query;
    
    if (!userId) {
      return res.status(400).json({ message: 'ID utilisateur requis.' });
    }
    
    let query = { userId: userId };
    if (unreadOnly === 'true') {
      query.isRead = false;
    }
    
    // Récupérer les notifications avec pagination
    const notifications = await Notification.find(query)
      .sort({ createdAt: -1 })
      .skip(Number(skip))
      .limit(Number(limit));
    
    // Compter le nombre total de notifications non lues
    const unreadCount = await Notification.countDocuments({ 
      userId: userId, 
      isRead: false 
    });
    
    res.status(200).json({
      notifications,
      unreadCount,
      hasMore: notifications.length === Number(limit)
    });
  } catch (error) {
    console.error('❌ Erreur lors de la récupération des notifications:', error);
    res.status(500).json({ message: 'Erreur interne du serveur.' });
  }
});

/**
 * @route POST /api/notifications/mark-read
 * @desc Marquer des notifications comme lues
 * @access Private
 */
router.post('/mark-read', async (req, res) => {
  try {
    const { userId, notificationIds, all = false } = req.body;
    
    if (!userId) {
      return res.status(400).json({ message: 'ID utilisateur requis.' });
    }
    
    if (all) {
      // Marquer toutes les notifications comme lues
      await Notification.updateMany(
        { userId: userId },
        { $set: { isRead: true } }
      );
    } else if (notificationIds && notificationIds.length > 0) {
      // Marquer les notifications spécifiées comme lues
      await Notification.updateMany(
        { _id: { $in: notificationIds }, userId: userId },
        { $set: { isRead: true } }
      );
    } else {
      return res.status(400).json({ message: 'notificationIds requis ou paramètre all=true.' });
    }
    
    // Récupérer le nouveau nombre de notifications non lues
    const unreadCount = await Notification.countDocuments({ 
      userId: userId, 
      isRead: false 
    });
    
    res.status(200).json({ 
      message: 'Notifications marquées comme lues.', 
      unreadCount 
    });
  } catch (error) {
    console.error('❌ Erreur lors du marquage des notifications:', error);
    res.status(500).json({ message: 'Erreur interne du serveur.' });
  }
});

/**
 * @route POST /api/notifications/create
 * @desc Créer une nouvelle notification
 * @access Private
 */
router.post('/create', async (req, res) => {
  try {
    const { userId, type, message, relatedId, sender, imageUrl, actionUrl } = req.body;
    
    if (!userId || !type || !message) {
      return res.status(400).json({ message: 'userId, type et message sont requis.' });
    }
    
    // Créer la notification
    const notification = new Notification({
      userId,
      type,
      message,
      relatedId,
      sender,
      imageUrl,
      actionUrl,
      isRead: false,
      createdAt: new Date()
    });
    
    await notification.save();
    
    // Ici on pourrait ajouter l'envoi de notifications push si implémenté
    
    res.status(201).json({ 
      message: 'Notification créée avec succès.', 
      notification 
    });
  } catch (error) {
    console.error('❌ Erreur lors de la création de la notification:', error);
    res.status(500).json({ message: 'Erreur interne du serveur.' });
  }
});

/**
 * @route DELETE /api/notifications/:notificationId
 * @desc Supprimer une notification
 * @access Private
 */
router.delete('/:notificationId', async (req, res) => {
  try {
    const { notificationId } = req.params;
    const { userId } = req.query;
    
    if (!notificationId || !userId) {
      return res.status(400).json({ message: 'ID notification et userId requis.' });
    }
    
    // Vérifier que la notification appartient bien à l'utilisateur
    const notification = await Notification.findOne({ 
      _id: notificationId, 
      userId: userId 
    });
    
    if (!notification) {
      return res.status(404).json({ message: 'Notification non trouvée.' });
    }
    
    // Supprimer la notification
    await Notification.findByIdAndDelete(notificationId);
    
    res.status(200).json({ message: 'Notification supprimée.' });
  } catch (error) {
    console.error('❌ Erreur lors de la suppression de la notification:', error);
    res.status(500).json({ message: 'Erreur interne du serveur.' });
  }
});

/**
 * @route DELETE /api/notifications/clear/:userId
 * @desc Supprimer toutes les notifications d'un utilisateur
 * @access Private
 */
router.delete('/clear/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    
    if (!userId) {
      return res.status(400).json({ message: 'ID utilisateur requis.' });
    }
    
    // Supprimer toutes les notifications de l'utilisateur
    await Notification.deleteMany({ userId: userId });
    
    res.status(200).json({ message: 'Toutes les notifications ont été supprimées.' });
  } catch (error) {
    console.error('❌ Erreur lors de la suppression des notifications:', error);
    res.status(500).json({ message: 'Erreur interne du serveur.' });
  }
});

/**
 * @route POST /api/notifications/batch
 * @desc Créer plusieurs notifications (pour amis, abonnés, etc.)
 * @access Private
 */
router.post('/batch', async (req, res) => {
  try {
    const { userIds, type, message, relatedId, sender, imageUrl, actionUrl } = req.body;
    
    if (!userIds || !userIds.length || !type || !message) {
      return res.status(400).json({ message: 'userIds (array), type et message sont requis.' });
    }
    
    // Créer les notifications en lot
    const notifications = userIds.map(userId => ({
      userId,
      type,
      message,
      relatedId,
      sender,
      imageUrl,
      actionUrl,
      isRead: false,
      createdAt: new Date()
    }));
    
    await Notification.insertMany(notifications);
    
    res.status(201).json({ 
      message: `${notifications.length} notifications créées avec succès.`
    });
  } catch (error) {
    console.error('❌ Erreur lors de la création des notifications par lot:', error);
    res.status(500).json({ message: 'Erreur interne du serveur.' });
  }
});

// POST /api/notifications/register-token - Enregistrer un token FCM pour un utilisateur
router.post('/register-token', auth, async (req, res) => {
  try {
    const { userId, fcm_token, deviceInfo = {} } = req.body;
    
    if (!userId || !fcm_token) {
      return res.status(400).json({ error: 'UserID et token FCM sont requis' });
    }
    
    // Mettre à jour l'utilisateur avec le nouveau token FCM
    await User.findByIdAndUpdate(userId, {
      fcm_token,
      device_info: deviceInfo,
      fcm_token_updated_at: new Date()
    });
    
    console.log(`✅ Token FCM enregistré pour l'utilisateur ${userId}`);
    res.status(200).json({ message: 'Token FCM enregistré avec succès' });
  } catch (error) {
    console.error('❌ Erreur d\'enregistrement du token FCM:', error);
    res.status(500).json({ error: 'Erreur lors de l\'enregistrement du token FCM' });
  }
});

// POST /api/notifications/send-push - Envoyer une notification push à un utilisateur
router.post('/send-push', auth, async (req, res) => {
  try {
    if (!admin.messaging) {
      return res.status(503).json({ error: 'Service de notification push non disponible' });
    }
    
    const { userId, title, body, data = {}, badge = 1, sound = 'default' } = req.body;
    
    if (!userId || !title || !body) {
      return res.status(400).json({ error: 'UserId, titre et corps du message sont requis' });
    }
    
    // Récupérer le token FCM de l'utilisateur
    const user = await User.findById(userId).select('fcm_token device_info');
    
    if (!user || !user.fcm_token) {
      return res.status(404).json({ error: 'Utilisateur introuvable ou sans token FCM enregistré' });
    }
    
    // Déterminer la plateforme de l'appareil si disponible
    const isIOS = user.device_info?.platform === 'ios';
    
    // Préparer le message avec des options spécifiques à iOS/Android
    const message = {
      notification: {
        title,
        body
      },
      data: {
        ...data,
        click_action: 'FLUTTER_NOTIFICATION_CLICK', // Nécessaire pour Flutter
        sound: sound
      },
      token: user.fcm_token,
      apns: isIOS ? {
        payload: {
          aps: {
            badge,
            sound
          }
        }
      } : undefined,
      android: {
        priority: 'high',
        notification: {
          sound,
          channelId: 'high_importance_channel'
        }
      }
    };
    
    console.log(`📱 Envoi d'une notification à l'utilisateur ${userId}`);
    // Envoyer la notification
    const response = await admin.messaging().send(message);
    
    // Stocker la notification dans la base de données
    await Notification.create({
      userId,
      type: data.type || 'system',
      message: body,
      relatedId: data.relatedId,
      sender: data.senderId,
      imageUrl: data.imageUrl,
      actionUrl: data.actionUrl,
      isRead: false
    });
    
    res.status(200).json({ 
      message: 'Notification push envoyée avec succès', 
      messageId: response 
    });
  } catch (error) {
    console.error('❌ Erreur d\'envoi de notification push:', error);
    res.status(500).json({ error: 'Erreur lors de l\'envoi de la notification push' });
  }
});

// GET /api/notifications/send-push - Endpoint alternatif pour envoyer des notifications (compatible frontend)
router.get('/send-push', auth, async (req, res) => {
  try {
    if (!admin.messaging) {
      return res.status(503).json({ error: 'Service de notification push non disponible' });
    }
    
    // Récupérer les paramètres depuis query params
    const { userId, title, body } = req.query;
    // Récupérer data comme JSON si présent
    let data = {};
    if (req.query.data) {
      try {
        data = JSON.parse(req.query.data);
      } catch (e) {
        console.warn('Impossible de parser le paramètre data:', e);
      }
    }
    
    // Paramètres par défaut
    const badge = parseInt(req.query.badge) || 1;
    const sound = req.query.sound || 'default';
    
    if (!userId || !title || !body) {
      return res.status(400).json({ error: 'UserId, titre et corps du message sont requis' });
    }
    
    // Récupérer le token FCM de l'utilisateur
    const user = await User.findById(userId).select('fcm_token device_info');
    
    if (!user || !user.fcm_token) {
      return res.status(404).json({ error: 'Utilisateur introuvable ou sans token FCM enregistré' });
    }
    
    // Déterminer la plateforme de l'appareil si disponible
    const isIOS = user.device_info?.platform === 'ios';
    
    // Préparer le message avec des options spécifiques à iOS/Android
    const message = {
      notification: {
        title,
        body
      },
      data: {
        ...data,
        click_action: 'FLUTTER_NOTIFICATION_CLICK', // Nécessaire pour Flutter
        sound: sound
      },
      token: user.fcm_token,
      apns: isIOS ? {
        payload: {
          aps: {
            badge,
            sound
          }
        }
      } : undefined,
      android: {
        priority: 'high',
        notification: {
          sound,
          channelId: 'high_importance_channel'
        }
      }
    };
    
    console.log(`📱 Envoi d'une notification à l'utilisateur ${userId} (GET)`);
    // Envoyer la notification
    const response = await admin.messaging().send(message);
    
    // Stocker la notification dans la base de données
    await Notification.create({
      userId,
      type: data.type || 'system',
      message: body,
      relatedId: data.relatedId,
      sender: data.senderId,
      imageUrl: data.imageUrl,
      actionUrl: data.actionUrl,
      isRead: false
    });
    
    res.status(200).json({ 
      message: 'Notification push envoyée avec succès', 
      messageId: response 
    });
  } catch (error) {
    console.error('❌ Erreur d\'envoi de notification push (GET):', error);
    res.status(500).json({ error: 'Erreur lors de l\'envoi de la notification push' });
  }
});

// POST /api/notifications/send-batch - Envoyer des notifications push à plusieurs utilisateurs
router.post('/send-batch', auth, async (req, res) => {
  try {
    if (!admin.messaging) {
      return res.status(503).json({ error: 'Service de notification push non disponible' });
    }
    
    const { userIds, title, body, data = {}, badge = 1, sound = 'default' } = req.body;
    
    if (!userIds || !Array.isArray(userIds) || userIds.length === 0 || !title || !body) {
      return res.status(400).json({ error: 'Liste d\'userIds, titre et corps du message sont requis' });
    }
    
    // Récupérer les tokens FCM des utilisateurs
    const users = await User.find({ _id: { $in: userIds } }).select('_id fcm_token device_info');
    
    if (users.length === 0) {
      return res.status(404).json({ error: 'Aucun utilisateur trouvé' });
    }
    
    // Filtrer les utilisateurs qui ont un token FCM
    const usersWithToken = users.filter(user => user.fcm_token);
    
    if (usersWithToken.length === 0) {
      return res.status(404).json({ error: 'Aucun utilisateur avec token FCM trouvé' });
    }
    
    console.log(`📱 Envoi de notifications à ${usersWithToken.length} utilisateurs`);
    
    // Créer les notifications dans la base de données
    const notifications = usersWithToken.map(user => ({
      userId: user._id,
      type: data.type || 'system',
      message: body,
      relatedId: data.relatedId,
      sender: data.senderId,
      imageUrl: data.imageUrl,
      actionUrl: data.actionUrl,
      isRead: false
    }));
    
    await Notification.insertMany(notifications);
    
    // Préparer et envoyer les messages push
    const messages = usersWithToken.map(user => {
      const isIOS = user.device_info?.platform === 'ios';
      
      return {
        notification: {
          title,
          body
        },
        data: {
          ...data,
          click_action: 'FLUTTER_NOTIFICATION_CLICK',
          sound: sound
        },
        token: user.fcm_token,
        apns: isIOS ? {
          payload: {
            aps: {
              badge,
              sound
            }
          }
        } : undefined,
        android: {
          priority: 'high',
          notification: {
            sound,
            channelId: 'high_importance_channel'
          }
        }
      };
    });
    
    // Envoyer par lot de 500 (limite de Firebase)
    const batchSize = 500;
    let results = [];
    
    for (let i = 0; i < messages.length; i += batchSize) {
      const batch = messages.slice(i, i + batchSize);
      try {
        const batchResponse = await admin.messaging().sendAll(batch);
        results.push(batchResponse);
      } catch (error) {
        console.error(`❌ Erreur d'envoi du lot ${i} à ${i + batch.length}:`, error);
      }
    }
    
    res.status(200).json({ 
      message: 'Notifications push envoyées',
      successCount: results.reduce((acc, res) => acc + res.successCount, 0),
      failureCount: results.reduce((acc, res) => acc + res.failureCount, 0),
      total: usersWithToken.length
    });
  } catch (error) {
    console.error('❌ Erreur d\'envoi de notifications batch:', error);
    res.status(500).json({ error: 'Erreur lors de l\'envoi des notifications batch' });
  }
});

// POST /api/notifications/send-email - Envoyer un email à un utilisateur
router.post('/send-email', auth, async (req, res) => {
  try {
    if (!nodemailer || !transporter) {
      return res.status(503).json({ error: 'Service d\'envoi d\'emails non disponible' });
    }
    
    const { userId, subject, html, text } = req.body;
    
    if (!userId || !subject || (!html && !text)) {
      return res.status(400).json({ error: 'UserId, sujet et contenu (html ou texte) sont requis' });
    }
    
    // Récupérer l'email de l'utilisateur
    const user = await User.findById(userId).select('email name');
    
    if (!user || !user.email) {
      return res.status(404).json({ error: 'Utilisateur introuvable ou sans email' });
    }
    
    // Préparer le message
    const mailOptions = {
      from: `"Choice App" <${process.env.EMAIL_USER}>`,
      to: user.email,
      subject,
      html: html || undefined,
      text: text || undefined
    };
    
    // Envoyer l'email
    await transporter.sendMail(mailOptions);
    
    res.status(200).json({ message: 'Email envoyé avec succès' });
  } catch (error) {
    console.error('Erreur d\'envoi d\'email:', error);
    res.status(500).json({ error: 'Erreur lors de l\'envoi de l\'email' });
  }
});

// POST /api/notifications/send - Envoyer une notification (push et/ou email)
router.post('/send', auth, async (req, res) => {
  try {
    const { userId, notification, channels = ['push'] } = req.body;
    
    if (!userId || !notification) {
      return res.status(400).json({ error: 'UserId et notification sont requis' });
    }
    
    const { title, body, data, emailSubject, emailHtml, emailText } = notification;
    
    // Récupérer l'utilisateur
    const user = await User.findById(userId).select('fcm_token email name');
    
    if (!user) {
      return res.status(404).json({ error: 'Utilisateur introuvable' });
    }
    
    const results = {
      push: { sent: false },
      email: { sent: false }
    };
    
    // Envoyer les notifications selon les canaux demandés
    if (channels.includes('push') && user.fcm_token && title && body && admin.messaging) {
      try {
        // Préparer le message push
        const message = {
          notification: { title, body },
          data: data || {},
          token: user.fcm_token
        };
        
        // Envoyer la notification push
        const response = await admin.messaging().send(message);
        results.push = { sent: true, messageId: response };
      } catch (error) {
        console.error('Erreur d\'envoi de notification push:', error);
        results.push = { sent: false, error: error.message };
      }
    }
    
    if (channels.includes('email') && user.email && (emailSubject && (emailHtml || emailText)) && nodemailer && transporter) {
      try {
        // Préparer le message email
        const mailOptions = {
          from: `"Choice App" <${process.env.EMAIL_USER}>`,
          to: user.email,
          subject: emailSubject,
          html: emailHtml || undefined,
          text: emailText || undefined
        };
        
        // Envoyer l'email
        await transporter.sendMail(mailOptions);
        results.email = { sent: true };
      } catch (error) {
        console.error('Erreur d\'envoi d\'email:', error);
        results.email = { sent: false, error: error.message };
      }
    }
    
    res.status(200).json({
      message: 'Notifications traitées',
      results
    });
  } catch (error) {
    console.error('Erreur d\'envoi de notifications:', error);
    res.status(500).json({ error: 'Erreur lors de l\'envoi des notifications' });
  }
});

// GET /api/notifications - Obtenir les notifications d'un utilisateur
router.get('/', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('notifications');
    
    if (!user) {
      return res.status(404).json({ error: 'Utilisateur introuvable' });
    }
    
    res.status(200).json(user.notifications || []);
  } catch (error) {
    console.error('Erreur de récupération des notifications:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des notifications' });
  }
});

// PUT /api/notifications/:notificationId/read - Marquer une notification comme lue
router.put('/:notificationId/read', auth, async (req, res) => {
  try {
    const { notificationId } = req.params;
    
    const result = await User.updateOne(
      { 
        _id: req.user.id,
        'notifications._id': notificationId
      },
      { 
        $set: { 'notifications.$.read': true } 
      }
    );
    
    if (result.nModified === 0) {
      return res.status(404).json({ error: 'Notification introuvable' });
    }
    
    res.status(200).json({ message: 'Notification marquée comme lue' });
  } catch (error) {
    console.error('Erreur de marquage de notification comme lue:', error);
    res.status(500).json({ error: 'Erreur lors du marquage de la notification comme lue' });
  }
});

// DELETE /api/notifications/:notificationId - Supprimer une notification
router.delete('/:notificationId', auth, async (req, res) => {
  try {
    const { notificationId } = req.params;
    
    const result = await User.updateOne(
      { _id: req.user.id },
      { $pull: { notifications: { _id: notificationId } } }
    );
    
    if (result.nModified === 0) {
      return res.status(404).json({ error: 'Notification introuvable' });
    }
    
    res.status(200).json({ message: 'Notification supprimée' });
  } catch (error) {
    console.error('Erreur de suppression de notification:', error);
    res.status(500).json({ error: 'Erreur lors de la suppression de la notification' });
  }
});

// Add the new routes for sending notifications

/**
 * @route POST /api/notifications/send/user
 * @desc Send a push notification to a specific user
 * @access Private (or restricted to admin/system)
 */
router.post('/send/user', notificationController.sendToUser);

/**
 * @route POST /api/notifications/send/area
 * @desc Send a push notification to users in a geographical area
 * @access Private (or restricted to admin/system)
 */
router.post('/send/area', notificationController.sendToArea);

// Exporter la fonction d'initialisation pour pouvoir l'appeler depuis index.js
module.exports = router;
module.exports.initialize = function(db) {
  if (!Notification && db.choiceAppDb) {
    Notification = db.choiceAppDb.model('Notification', notificationSchema, 'notifications');
    console.log('✅ Notification model initialized');
  }
  return router;
}; 
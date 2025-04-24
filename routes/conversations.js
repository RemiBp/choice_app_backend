const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const auth = require('../middleware/auth');
const { sendNotificationEmail } = require('../services/emailService');
const { createModel, databases } = require('../utils/modelCreator');
const Message = require('../models/message');
const { v4: uuidv4 } = require('uuid');
const { io } = require('../index'); // Import Socket.IO server instance
const bcrypt = require('bcryptjs');

// Import le schéma et la fonction de création pour Conversation
const { ConversationSchema, createConversationModel } = require('../models/conversation');

// Créer les modèles avec la bonne connexion à la base de données
const Conversation = createModel(databases.CHOICE_APP, 'Conversation', 'conversations');

// Modèles nécessaires
const User = createModel(databases.CHOICE_APP, 'User', 'Users');
const Producer = createModel(databases.RESTAURATION, 'Producer', 'producers');
const LeisureProducer = createModel(databases.LOISIR, 'LeisureProducer', 'leisureProducers');
const BeautyProducer = createModel(databases.BEAUTY_WELLNESS, 'BeautyProducer', 'beautyProducers');

/**
 * @route GET /api/conversations
 * @desc Récupérer les conversations d'un utilisateur
 * @access Private
 */
router.get('/', auth, async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Trouver toutes les conversations où l'utilisateur est participant
    const conversations = await Conversation.find({
      participants: userId
    })
    .sort({ lastMessageDate: -1 })
    .lean();
    
    // Récupérer les informations des participants pour chaque conversation
    const populatedConversations = await Promise.all(conversations.map(async (conv) => {
      // Récupérer les autres participants
      const otherParticipants = await User.find({
        _id: { $in: conv.participants.filter(p => p.toString() !== userId) }
      })
      .select('_id name username profilePicture')
      .lean();
      
      // Ajouter les informations des participants à la conversation
      return {
        ...conv,
        participantsInfo: otherParticipants
      };
    }));
    
    res.status(200).json({
      success: true,
      conversations: populatedConversations
    });
  } catch (error) {
    console.error('❌ Erreur lors de la récupération des conversations:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Erreur serveur', 
      error: error.message 
    });
  }
});

/**
 * @route GET /api/conversations/:conversationId/messages
 * @desc Récupérer les messages d'une conversation
 * @access Private
 */
router.get('/:conversationId/messages', auth, async (req, res) => {
  try {
    const { conversationId } = req.params;
    const userId = req.user.id;
    const { limit = 50, before } = req.query; // Récupérer les paramètres de pagination

    if (!mongoose.Types.ObjectId.isValid(conversationId)) {
      return res.status(400).json({ success: false, message: 'Invalid conversationId format.' });
    }
    
    // Trouver la conversation spécifique par son ID
    const conversation = await Conversation.findById(conversationId);

    if (!conversation) {
      console.log(`Conversation non trouvée avec ID: ${conversationId}`);
      return res.status(404).json({ success: false, message: 'Conversation non trouvée.' });
    }

    // Vérifier si l'utilisateur est un participant
    if (!conversation.participants.map(p => p.toString()).includes(userId)) {
        return res.status(403).json({ success: false, message: 'Non autorisé à accéder à cette conversation.' });
    }

    console.log(`Récupération des messages pour la conversation ${conversationId}`);

    // Construire la requête pour les messages
    let query = { conversationId: new mongoose.Types.ObjectId(conversationId) };
    if (before) {
        try {
        query.timestamp = { $lt: new Date(before) };
      } catch (e) {
        console.error('Date invalide pour \'before\':', before, e);
      }
    }

    // Récupérer les messages
    const messageResults = await Message.find(query)
      .sort({ timestamp: -1 })
      .limit(Number(limit))
      .populate('senderId', '_id name username profilePicture photo_url') // Populer les informations de l'expéditeur
      .lean();

    // Formater les messages
    const messages = messageResults.map(msg => ({
      _id: msg._id,
      id: msg._id.toString(),
      senderId: msg.senderId?._id?.toString() || '',
      sender: msg.senderId ? { // Inclure les infos de l'expéditeur
          _id: msg.senderId._id,
          name: msg.senderId.name || msg.senderId.username || 'Utilisateur',
          profilePicture: msg.senderId.profilePicture || msg.senderId.photo_url
      } : { _id: '', name: 'Inconnu', profilePicture: null },
      content: msg.content || '',
      timestamp: msg.timestamp ? msg.timestamp.toISOString() : new Date().toISOString(),
      media: msg.mediaInfo ? [msg.mediaInfo] : (msg.attachments || msg.media || []), // S'assurer que media est un tableau
      contentType: msg.contentType || 'text',
      mentions: msg.mentions || [],
      isRead: msg.readBy?.some(r => r.userId?.toString() === userId) || false // Vérifier si lu par l'utilisateur actuel
      // Ajouter d'autres champs si nécessaire (reactions, replyTo, etc.)
    }));

    // Marquer les messages comme lus (logique similaire à la deuxième définition de la route)
    try {
       await Message.updateMany(
         {
           conversationId: new mongoose.Types.ObjectId(conversationId),
           senderId: { $ne: new mongoose.Types.ObjectId(userId) },
           'readBy.userId': { $ne: new mongoose.Types.ObjectId(userId) } // Marquer uniquement si pas déjà lu par cet user
         },
         { $addToSet: { readBy: { userId: new mongoose.Types.ObjectId(userId), readAt: new Date() } } } // Utiliser addToSet pour éviter les doublons
       );

       // Réinitialiser le compteur de non lus pour l'utilisateur
       if (conversation && typeof conversation.resetUnreadCount === 'function') {
         await conversation.resetUnreadCount(userId); // Assurez-vous que cette méthode sauvegarde la conversation
       } else if (conversation) {
          conversation.ensureUnreadCountIsObject(); // Assurez-vous que cette méthode existe ou implémentez la logique ici
          if (conversation.unreadCount[userId.toString()]) {
            conversation.unreadCount[userId.toString()] = 0;
            conversation.markModified('unreadCount');
            await conversation.save();
          }
       }

       // Émettre un événement WebSocket si nécessaire
       if (io) {
         io.to(conversationId).emit('message_read', { conversationId, userId });
        }

    } catch (updateError) {
      console.error('Erreur lors de la mise à jour des statuts de lecture (route 1):', updateError);
      }

    res.status(200).json({
        success: true,
        messages: messages, // Les messages sont déjà triés du plus récent au plus ancien
        participants: conversation.participants // Inclure les participants
    });

  } catch (error) {
    // Correction de l'apostrophe dans le message d'erreur
    console.error('❌ Erreur lors de la récupération des messages (route 1):', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de la récupération des messages',
      error: error.message
    });
  }
});

/**
 * @route GET /api/conversations/:userId/conversations
 * @desc Récupérer les conversations d'un utilisateur spécifique (endpoint unifié pour le frontend)
 * @access Private
 */
router.get('/:userId/conversations', async (req, res) => {
  try {
    const { userId } = req.params;
    
    console.log(`Récupération des conversations pour l'utilisateur: ${userId}`);
    
    if (!userId) {
      return res.status(400).json({ message: 'userId requis.' });
    }
    
    // Vérifier que l'utilisateur existe
    const user = await User.findById(userId);
    if (!user) {
      console.log(`Utilisateur non trouvé avec ID: ${userId}`);
      return res.status(404).json({ message: 'Utilisateur non trouvé.' });
    }
    
    // Trouver toutes les conversations où l'utilisateur est participant
    const conversations = await Conversation.find({
      participants: userId
    }).sort({ lastMessageDate: -1, lastUpdated: -1, createdAt: -1 });

    // Si aucune conversation n'est trouvée, renvoyer un tableau vide
    if (!conversations || conversations.length === 0) {
      console.log(`Aucune conversation trouvée pour l'utilisateur ${userId}`);
      return res.status(200).json([]);
    }
    
    console.log(`${conversations.length} conversations trouvées pour l'utilisateur ${userId}`);
    
    // Format simplifié de la réponse pour compatibilité avec le frontend
    const simplifiedConversations = await Promise.all(conversations.map(async (conv, index) => {
      try {
        const convObj = conv.toObject();
        
        // Récupérer les infos des participants (hors l'utilisateur actuel)
        const otherParticipantIds = convObj.participants.filter(id => id.toString() !== userId);
        let otherParticipants = [];
        
        try {
          // Récupérer les infos des participants de manière sécurisée
          if (otherParticipantIds.length > 0) {
            otherParticipants = await User.find({
              _id: { $in: otherParticipantIds }
            }).select('_id name username profilePicture photo_url').lean();
          }
        } catch (participantError) {
          console.error('Erreur lors de la récupération des participants:', participantError);
          // Continuer malgré l'erreur
        }
        
        // Si c'est une conversation avec un producteur
        let producerInfo = null;
        if (convObj.isProducerConversation && convObj.producerId) {
          try {
            let producer;
            
            if (convObj.producerType === 'restaurant') {
              producer = await Producer.findById(convObj.producerId);
            } else if (convObj.producerType === 'leisure') {
              producer = await LeisureProducer.findById(convObj.producerId);
            } else if (convObj.producerType === 'beauty' || convObj.producerType === 'wellness') {
              producer = await BeautyProducer.findById(convObj.producerId);
            }
            
            if (producer) {
              producerInfo = {
                _id: producer._id,
                name: producer.name || producer.lieu || 'Établissement',
                photo: producer.photo || producer.image || null,
                address: producer.address || producer.adresse || null
              };
            }
          } catch (err) {
            console.error('Erreur lors de la récupération des infos du producteur:', err);
          }
        }
        
        // Gérer les cas où les champs essentiels ne sont pas définis
        const isGroupChat = convObj.isGroupChat || convObj.isGroup || false;
        const isRestaurant = convObj.producerType === 'restaurant' || false;
        const isLeisure = convObj.producerType === 'leisure' || false;
        const isWellness = convObj.producerType === 'wellness' || convObj.producerType === 'beauty' || false;
        
        // Construction d'un timestamp compatible pour le frontend (format ISO)
        const lastMessageDate = convObj.lastMessageDate || convObj.lastUpdated || convObj.createdAt || new Date();
        const timeISOString = new Date(lastMessageDate).toISOString();
        
        // Déterminer l'avatar en fonction du type de conversation
        let avatar = null;
        if (isGroupChat) {
          avatar = convObj.groupImage || convObj.groupAvatar;
        } else if (producerInfo) {
          avatar = producerInfo.photo;
        } else if (otherParticipants.length > 0) {
          avatar = otherParticipants[0].profilePicture || otherParticipants[0].photo_url;
        }
        
        // Si aucun avatar n'est trouvé, générer une URL pour un avatar par défaut
        if (!avatar) {
          const contactName = isGroupChat ? (convObj.groupName || 'Groupe') : 
                              (otherParticipants[0]?.name || 'Utilisateur');
          avatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(contactName)}&background=random`;
        }
        
        // Calculer le nombre de messages non lus de manière sécurisée
        let unreadCount = 0;
        try {
          if (convObj.unreadCount) {
            // Privilégier la méthode .get() si c'est une Map Mongoose
            if (typeof convObj.unreadCount.get === 'function') {
              unreadCount = convObj.unreadCount.get(userId) || 0;
            } else if (typeof convObj.unreadCount === 'object') {
              // Accéder comme un objet standard
              unreadCount = convObj.unreadCount[userId] || 0;
            } else if (typeof convObj.unreadCount === 'number') {
              // Cas où c'est déjà un nombre (ancienne structure?)
              unreadCount = convObj.unreadCount;
            }
          }
          // Assurer que c'est bien un nombre entier
          if (typeof unreadCount !== 'number' || !Number.isInteger(unreadCount)) {
              console.warn(`⚠️ Invalid unreadCount type for conv ${convObj._id}, user ${userId}: ${typeof unreadCount}, value: ${unreadCount}. Defaulting to 0.`);
              unreadCount = 0;
          }
        } catch (e) {
            console.error(`❌ Error processing unreadCount for conv ${convObj._id}, user ${userId}: ${e}. Defaulting to 0.`);
            unreadCount = 0;
        }

        // Assurer que unreadCount est au moins 0
        unreadCount = Math.max(0, unreadCount);
        
        return {
          _id: convObj._id,
          id: convObj._id.toString(),
          participants: convObj.participants,
          name: isGroupChat ? 
                (convObj.groupName || 'Groupe') : 
                (producerInfo?.name || otherParticipants[0]?.name || otherParticipants[0]?.username || 'Utilisateur'),
          lastMessage: convObj.lastMessage || '',
          lastMessageSender: convObj.lastMessageSender || '',
          time: timeISOString,
          lastMessageDate: timeISOString,
          lastUpdated: timeISOString,
          isGroup: isGroupChat,
          isRestaurant: isRestaurant,
          isLeisure: isLeisure,
          isWellness: isWellness,
          unreadCount: unreadCount,
          unreadMessages: unreadCount,
          avatar: avatar,
          producerInfo: producerInfo
        };
      } catch (itemError) {
        console.error(`Erreur lors du traitement de la conversation ${index}:`, itemError);
        return null;
      }
    }));
    
    // Filtrer les résultats nuls (en cas d'erreur) et les renvoyer
    const filteredConversations = simplifiedConversations.filter(conv => conv !== null);
    res.status(200).json(filteredConversations);
    
  } catch (error) {
    console.error('Erreur lors de la récupération des conversations:', error);
    res.status(500).json({ 
      message: 'Erreur lors de la récupération des conversations',
      error: error.message
    });
  }
});

/**
 * @route POST /api/conversations/:conversationId/send
 * @desc Route alternative pour envoyer un message sans authentification (pour Flutter)
 * @access Public
 */
router.post('/:conversationId/send', async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { senderId, content, media, contentType = 'text', gifUrl } = req.body;
    
    if (!senderId || !content) {
      return res.status(400).json({ 
        success: false, 
        message: 'senderId et content sont requis.' 
      });
    }
    
    console.log(`📨 Tentative d'envoi de message dans la conversation ${conversationId} par ${senderId}`);
    
    // Vérifier que la conversation existe
    const conversation = await Conversation.findById(conversationId);
    
    if (!conversation) {
      console.log(`❌ Conversation non trouvée avec ID: ${conversationId}`);
      return res.status(404).json({ 
        success: false, 
        message: 'Conversation non trouvée.' 
      });
    }
    
    // Vérifier que l'expéditeur fait partie de la conversation
    // !! IMPORTANT: Consider adding proper auth here if needed !!
    if (!conversation.participants.some(p => p.toString() === senderId)) {
      console.log(`🚫 L'utilisateur ${senderId} n'est pas autorisé à envoyer des messages dans cette conversation`);
      return res.status(403).json({ 
        success: false, 
        message: 'Non autorisé à envoyer des messages dans cette conversation.' 
      });
    }
    
    // Créer et sauvegarder le message
    const timestamp = new Date();
    const messageData = {
      conversationId,
      senderId: senderId,
      content,
      timestamp,
      contentType: contentType || 'text',
      attachments: media || []
    };
    
    // Si c'est un GIF, ajouter l'URL du GIF
    if (contentType === 'gif' && gifUrl) {
      messageData.gifUrl = gifUrl;
    }
    
    const message = new Message(messageData);
    
    // Initialiser isRead pour tous les participants
    message.isRead = {};
    conversation.participants.forEach(participantId => {
      const participantIdStr = participantId.toString();
      message.isRead[participantIdStr] = participantIdStr === senderId;
    });
    
    await message.save();
    console.log(`✅ Message enregistré avec ID: ${message._id}`);
    
    // Mettre à jour la conversation
    conversation.lastMessage = content;
    conversation.lastMessageDate = timestamp;
    conversation.lastUpdated = timestamp;
    conversation.lastMessageSender = senderId;
    
    // Incrémenter le compteur de messages non lus pour tous les participants sauf l'expéditeur
    conversation.participants.forEach(participantId => {
      const participantIdStr = participantId.toString();
      if (participantIdStr !== senderId.toString()) {
        // Assurer que unreadCount existe et est un objet ou une Map
        if (!conversation.unreadCount) {
          conversation.unreadCount = {}; // Initialize if missing
        }
        
        if (typeof conversation.unreadCount.get === 'function') {
          const currentCount = conversation.unreadCount.get(participantIdStr) || 0;
          conversation.unreadCount.set(participantIdStr, currentCount + 1);
        } else if (typeof conversation.unreadCount === 'object' && conversation.unreadCount !== null){
           conversation.unreadCount[participantIdStr] = (conversation.unreadCount[participantIdStr] || 0) + 1;
        } else {
           console.warn(`Unexpected type for unreadCount in conv ${conversation._id}: ${typeof conversation.unreadCount}. Initializing for user ${participantIdStr}.`);
           conversation.unreadCount = {}; // Fallback initialization
           conversation.unreadCount[participantIdStr] = 1;
        }
      }
    });
    
    // Marquer le champ comme modifié si c'est un objet standard pour que Mongoose le sauvegarde
    if (typeof conversation.unreadCount !== 'function' && conversation.unreadCount !== null) {
        conversation.markModified('unreadCount');
    }
    
    await conversation.save();
    console.log(`✅ Conversation mise à jour pour le message`);
    
    // Récupérer les infos de l'expéditeur pour l'émission WebSocket et la réponse
    let senderInfo = { _id: senderId, name: 'Utilisateur', profilePicture: null };
    try {
        const sender = await User.findById(senderId).select('_id name username profilePicture photo_url');
        if (sender) {
            senderInfo = {
              _id: sender._id,
              name: sender.name || sender.username || 'Utilisateur',
              profilePicture: sender.profilePicture || sender.photo_url
            };
        }
    } catch (userError) {
        console.error("Error fetching sender info:", userError);
        // Use default senderInfo
    }

    // --- WebSocket Emission --- 
    const messageForEmit = {
        _id: message._id,
        id: message._id.toString(),
        conversationId: conversationId,
        senderId: senderId,
        sender: senderInfo, // Include sender details
        content: content,
        timestamp: timestamp.toISOString(), // Use ISO string for consistency
        media: media || [],
        contentType: message.contentType || 'text',
        // Include GIF URL if this is a GIF message
        ...(message.contentType === 'gif' && message.gifUrl ? { gifUrl: message.gifUrl } : {})
        // Include mentions if they were part of the message saving logic (add above if needed)
        // mentions: message.mentions || [] 
    };

    if (io) { // Check if io is initialized
        io.to(conversationId).emit('new_message', messageForEmit);
        console.log(`🚀 Emitted 'new_message' to room ${conversationId}`);
    } else {
        console.warn("⚠️ Socket.IO server instance (io) not available for emitting.");
    }
    // --- End WebSocket Emission ---
    
    // Réponse HTTP pour le frontend qui a envoyé le message
    res.status(201).json({
      success: true,
      // Return the same formatted data used for emit for consistency
      message: messageForEmit 
    });
  } catch (error) {
    // Reverted to standard apostrophe, removed unnecessary escape
    console.error('❌ Erreur lors de l\'envoi du message:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Erreur interne du serveur.', 
      error: error.message 
    });
  }
});

/**
 * @route POST /api/conversations/create
 * @desc Créer une nouvelle conversation
 * @access Private
 */
router.post('/create', auth, async (req, res) => {
  try {
    const { participantIds, isGroupChat, groupName, groupImage } = req.body;
    
    if (!participantIds || !Array.isArray(participantIds) || participantIds.length < 2) {
      return res.status(400).json({ message: 'Au moins deux participants sont requis.' });
    }
    
    // Si ce n'est pas un groupe, vérifier s'il existe déjà une conversation entre ces utilisateurs
    if (!isGroupChat && participantIds.length === 2) {
      const existingConversation = await Conversation.findOne({
        participants: { $all: participantIds, $size: 2 },
        isGroupChat: false
      });
      
      if (existingConversation) {
        return res.status(200).json({
          message: 'Conversation existante trouvée',
          _id: existingConversation._id
        });
      }
    }
    
    // Créer une nouvelle conversation
    const conversation = new Conversation({
      participants: participantIds,
      isGroupChat: isGroupChat || false,
      groupName: groupName,
      groupImage: groupImage,
      unreadCount: new Map(participantIds.map(p => [p.toString(), 0]))
    });
    
    await conversation.save();
    
    res.status(201).json({
      message: 'Conversation créée avec succès',
      _id: conversation._id
    });
  } catch (error) {
    console.error('❌ Erreur lors de la création de la conversation:', error);
    res.status(500).json({ message: 'Erreur interne du serveur.' });
  }
});

/**
 * @route POST /api/conversations/create-group
 * @desc Créer un groupe de conversation
 * @access Public
 */
router.post('/create-group', async (req, res) => {
  try {
    let { creatorId, participantIds, groupName, groupType, groupAvatar } = req.body;
    
    console.log('📝 Création de groupe - Données reçues:', {
      creatorId,
      participantIds: Array.isArray(participantIds) ? participantIds.length : 'non array',
      groupName,
      groupType,
      groupAvatar: groupAvatar ? 'fourni' : 'non fourni'
    });
    
    if (!creatorId || !participantIds || !Array.isArray(participantIds) || participantIds.length < 1 || !groupName) {
      return res.status(400).json({ 
        success: false,
        message: 'creatorId, groupName et au moins un participantId sont requis.' 
      });
    }
    
    // Normaliser les IDs et s'assurer qu'ils sont des chaînes de caractères
    creatorId = creatorId.toString();
    participantIds = participantIds.map(id => id.toString());
    
    // S'assurer que le créateur est dans les participants
    if (!participantIds.includes(creatorId)) {
      participantIds.push(creatorId);
    }
    
    // Vérifier que tous les utilisateurs existent
    const userIds = [...new Set(participantIds)]; // Dédupliquer
    console.log(`🔍 Vérification de l'existence de ${userIds.length} utilisateurs`);
    
    const users = await User.find({ _id: { $in: userIds } }).select('_id name username profilePicture');
    
    if (users.length !== userIds.length) {
      const foundIds = users.map(u => u._id.toString());
      const missingIds = userIds.filter(id => !foundIds.includes(id));
      
      console.log(`❌ Certains utilisateurs n'existent pas: ${missingIds.join(', ')}`);
      return res.status(404).json({ 
        success: false,
        message: 'Certains utilisateurs n\'existent pas.',
        missingIds
      });
    }
    
    // Créer le groupe
    const conversation = new Conversation({
      participants: userIds,
      isGroup: true,
      isGroupChat: true,
      groupName,
      groupImage: groupAvatar,
      lastMessageDate: new Date(),
      createdAt: new Date(),
      unreadCount: {}
    });
    
    // Initialiser les compteurs de messages non lus à 0 pour tous les participants
    userIds.forEach(userId => {
      conversation.unreadCount[userId] = 0;
    });
    
    await conversation.save();
    console.log(`✅ Groupe créé avec ID: ${conversation._id}`);
    
    // Message de bienvenue automatique
    const message = new Message({
      conversationId: conversation._id,
      senderId: creatorId,
      content: `Groupe "${groupName}" créé`,
      timestamp: new Date(),
      isRead: {}
    });
    
    // Marquer le message comme lu par le créateur, non lu pour les autres
    userIds.forEach(userId => {
      message.isRead[userId] = userId === creatorId;
    });
    
    await message.save();
    console.log(`✅ Message de bienvenue créé avec ID: ${message._id}`);
    
    // Mettre à jour la conversation avec le premier message
    conversation.lastMessage = message.content;
    conversation.lastMessageSender = creatorId;
    await conversation.save();
    
    // Construire une réponse détaillée
    const formattedParticipants = users.map(user => ({
      _id: user._id,
      id: user._id.toString(),
      name: user.name || user.username || 'Utilisateur',
      avatar: user.profilePicture
    }));
    
    res.status(201).json({
      success: true,
      message: 'Groupe créé avec succès',
      conversation_id: conversation._id.toString(),
      groupName: conversation.groupName,
      groupAvatar: conversation.groupImage,
      participants: formattedParticipants,
      creator: formattedParticipants.find(p => p._id.toString() === creatorId) || { _id: creatorId, name: 'Créateur' }
    });
  } catch (error) {
    console.error('❌ Erreur lors de la création du groupe:', error);
    res.status(500).json({ 
      success: false,
      message: 'Erreur interne du serveur.',
      error: error.message 
    });
  }
});

/**
 * @route POST /api/conversations/create-conversation-if-not-exists
 * @desc Créer une conversation entre 2 utilisateurs si elle n'existe pas déjà
 * @access Private
 */
router.post('/create-conversation-if-not-exists', async (req, res) => {
  try {
    const { userId, targetUserId } = req.body;
    
    if (!userId || !targetUserId) {
      return res.status(400).json({ 
        success: false, 
        message: 'userId et targetUserId sont requis.' 
      });
    }
    
    // Vérifier que les deux utilisateurs existent
    const users = await User.find({
      _id: { $in: [userId, targetUserId] }
    });
    
    if (users.length < 2) {
      return res.status(404).json({ 
        success: false, 
        message: 'Un ou plusieurs utilisateurs non trouvés.' 
      });
    }
    
    // Vérifier si une conversation existe déjà entre ces utilisateurs
    const existingConversation = await Conversation.findOne({
      participants: { $all: [userId, targetUserId], $size: 2 },
      isGroup: false
    });
    
    if (existingConversation) {
      console.log('Conversation existante trouvée, id:', existingConversation._id);
      return res.status(200).json({
        success: true,
        message: 'Conversation existante trouvée',
        conversation: {
          _id: existingConversation._id,
          id: existingConversation._id.toString(),
          participants: existingConversation.participants,
          isGroup: existingConversation.isGroup,
          lastUpdated: existingConversation.lastUpdated || existingConversation.createdAt
        }
      });
    }
    
    // Créer une nouvelle conversation
    const participantIds = [userId, targetUserId];
    const conversation = new Conversation({
      participants: participantIds,
      isGroup: false,
      isGroupChat: false,
      lastUpdated: new Date(),
      lastMessageDate: new Date(),
      createdAt: new Date(),
      unreadCount: new Map(participantIds.map(p => [p.toString(), 0])),
    });
    
    await conversation.save();
    console.log('Nouvelle conversation créée, id:', conversation._id);
    
    // Renvoyer la nouvelle conversation
    res.status(201).json({
      success: true,
      message: 'Nouvelle conversation créée avec succès',
      conversation: {
        _id: conversation._id,
        id: conversation._id.toString(),
        participants: conversation.participants,
        isGroup: conversation.isGroup,
        lastUpdated: conversation.lastUpdated
      }
    });
  } catch (error) {
    console.error('❌ Erreur lors de la création/vérification de la conversation:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur interne du serveur.',
      error: error.message
    });
  }
});

/**
 * @route GET /api/unified/search
 * @desc Recherche unifiée d'utilisateurs et producteurs
 * @access Public
 */
router.get('/unified/search', async (req, res) => {
  try {
    const { query } = req.query;
    
    if (!query || query.length < 2) {
      return res.status(400).json({ 
        success: false, 
        message: 'Le paramètre de recherche doit contenir au moins 2 caractères'
      });
    }
    
    console.log(`🔍 Recherche pour le mot-clé : ${query}`);
    
    // Rechercher dans les utilisateurs
    const userSearchPromise = User.find({
      $or: [
        { name: { $regex: query, $options: 'i' } },
        { username: { $regex: query, $options: 'i' } },
        { email: { $regex: query, $options: 'i' } }
      ]
    })
    .select('_id name username email profilePicture photo_url')
    .limit(20)
    .lean();
    
    // Rechercher dans les restaurants
    const restaurantSearchPromise = Producer.find({
      $or: [
        { name: { $regex: query, $options: 'i' } },
        { lieu: { $regex: query, $options: 'i' } },
        { adresse: { $regex: query, $options: 'i' } },
        { ville: { $regex: query, $options: 'i' } }
      ]
    })
    .select('_id name lieu photo image adresse ville type')
    .limit(20)
    .lean();
    
    // Rechercher dans les lieux de loisir
    const leisureSearchPromise = LeisureProducer.find({
      $or: [
        { name: { $regex: query, $options: 'i' } },
        { lieu: { $regex: query, $options: 'i' } },
        { adresse: { $regex: query, $options: 'i' } },
        { ville: { $regex: query, $options: 'i' } }
      ]
    })
    .select('_id name lieu photo image adresse ville type')
    .limit(10)
    .lean();
    
    // Rechercher dans les lieux de bien-être
    const wellnessSearchPromise = BeautyProducer.find({
      $or: [
        { name: { $regex: query, $options: 'i' } },
        { lieu: { $regex: query, $options: 'i' } },
        { adresse: { $regex: query, $options: 'i' } },
        { ville: { $regex: query, $options: 'i' } }
      ]
    })
    .select('_id name lieu photo image adresse ville type')
    .limit(10)
    .lean();
    
    // Exécuter toutes les recherches en parallèle
    const [users, restaurants, leisures, wellness] = await Promise.all([
      userSearchPromise, 
      restaurantSearchPromise, 
      leisureSearchPromise,
      wellnessSearchPromise
    ]);
    
    console.log(`✅ Recherche effectuée - Trouvé: ${users.length} utilisateurs, ${restaurants.length} restaurants, ${leisures.length} loisirs, ${wellness.length} bien-être`);
    
    // Formater les utilisateurs
    const formattedUsers = users.map(user => ({
      id: user._id.toString(),
      _id: user._id.toString(),
      name: user.name || user.username || 'Utilisateur',
      username: user.username || user.name || 'Utilisateur',
      avatar: user.profilePicture || user.photo_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name || 'User')}&background=random`,
      type: 'user',
      category: 'Utilisateur'
    }));
    
    // Formater les restaurants
    const formattedRestaurants = restaurants.map(restaurant => ({
      id: restaurant._id.toString(),
      _id: restaurant._id.toString(),
      name: restaurant.name || restaurant.lieu || 'Restaurant',
      avatar: restaurant.photo || restaurant.image || `https://ui-avatars.com/api/?name=${encodeURIComponent(restaurant.name || 'Restaurant')}&background=random`,
      type: 'restaurant',
      category: 'Restaurant',
      address: restaurant.adresse || restaurant.ville
    }));
    
    // Formater les lieux de loisir
    const formattedLeisures = leisures.map(leisure => ({
      id: leisure._id.toString(),
      _id: leisure._id.toString(),
      name: leisure.name || leisure.lieu || 'Loisir',
      avatar: leisure.photo || leisure.image || `https://ui-avatars.com/api/?name=${encodeURIComponent(leisure.name || 'Loisir')}&background=random`,
      type: 'leisureProducer',
      category: 'Loisir',
      address: leisure.adresse || leisure.ville
    }));
    
    // Formater les lieux de bien-être
    const formattedWellness = wellness.map(place => ({
      id: place._id.toString(),
      _id: place._id.toString(),
      name: place.name || place.lieu || 'Bien-être',
      avatar: place.photo || place.image || `https://ui-avatars.com/api/?name=${encodeURIComponent(place.name || 'Bien-être')}&background=random`,
      type: 'wellnessProducer',
      category: 'Bien-être',
      address: place.adresse || place.ville
    }));
    
    // Combiner tous les résultats
    const combinedResults = [
      ...formattedUsers,
      ...formattedRestaurants,
      ...formattedLeisures,
      ...formattedWellness
    ];
    
    // Limiter à 60 résultats maximum pour éviter de surcharger l'application mobile
    const limitedResults = combinedResults.slice(0, 60);
    
    console.log(`✅ Résultats trouvés : ${limitedResults.length} résultats`);
    
    res.status(200).json({
      success: true,
      results: limitedResults
    });
  } catch (error) {
    console.error('❌ Erreur lors de la recherche unifiée:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Erreur interne du serveur.', 
      error: error.message 
    });
  }
});

/**
 * @route POST /api/conversations/create-or-get-conversation
 * @desc Créer une conversation entre 2 utilisateurs si elle n'existe pas déjà
 * @access Private
 */
router.post('/create-or-get-conversation', async (req, res) => {
  try {
    const { userId, targetUserId, producerType } = req.body; // producerType est optionnel
    
    if (!userId || !targetUserId) {
      return res.status(400).json({ 
        success: false, 
        message: 'userId et targetUserId sont requis.' 
      });
    }
    
    // Vérifier que l'utilisateur existe
    const currentUser = await User.findById(userId);
    if (!currentUser) {
      return res.status(404).json({ success: false, message: 'Utilisateur courant non trouvé.' });
    }
    
    let targetEntity = null;
    let targetEntityType = 'user'; // Type par défaut
    let finalTargetId = targetUserId;
    let isProducerConv = false;
    
    // 1. Essayer de trouver la cible comme utilisateur
    targetEntity = await User.findById(targetUserId);

    // 2. Si pas trouvé comme utilisateur OU si producerType est explicitement fourni
    if (!targetEntity || producerType) {
        console.log(`Cible ${targetUserId} non trouvée comme utilisateur ou producerType (${producerType}) fourni. Recherche comme producteur.`);
        let foundProducer = null;
        let detectedProducerType = producerType; // Utiliser le type fourni s'il existe

        // Fonction pour chercher dans les collections de producteurs
        const findProducer = async (id, type) => {
             switch(type) {
                case 'restaurant': return await Producer.findById(id).lean();
                case 'leisure': return await LeisureProducer.findById(id).lean();
        case 'wellness':
                case 'beauty': return await BeautyProducer.findById(id).lean();
                default: return null;
            }
        };

        // Si un type est fourni, chercher dans cette collection d'abord
        if (detectedProducerType) {
            foundProducer = await findProducer(targetUserId, detectedProducerType);
        }

        // Si non trouvé avec le type fourni, ou si aucun type n'était fourni, chercher dans toutes
        if (!foundProducer) {
            console.log(`Recherche du producteur ${targetUserId} dans toutes les collections...`);
            foundProducer = await findProducer(targetUserId, 'restaurant') ||
                            await findProducer(targetUserId, 'leisure') ||
                            await findProducer(targetUserId, 'wellness'); // beauty inclus dans wellness
            if (foundProducer) {
                // Déduire le type si non fourni initialement
                 if (!detectedProducerType) {
                    if (foundProducer.constructor.modelName === 'Producer') detectedProducerType = 'restaurant';
                    else if (foundProducer.constructor.modelName === 'LeisureProducer') detectedProducerType = 'leisure';
                    else detectedProducerType = 'wellness'; // ou beauty
                    console.log(`Producteur trouvé, type détecté: ${detectedProducerType}`);
      }
            }
        }

        // Si on a trouvé un producteur
        if (foundProducer) {
            targetEntity = foundProducer;
            targetEntityType = detectedProducerType;
            isProducerConv = true;
            finalTargetId = targetEntity._id.toString(); // Utiliser l'ID trouvé
            console.log(`Cible identifiée comme producteur de type: ${targetEntityType}`);
        } else if (producerType) {
             // Si un type était fourni mais le producteur non trouvé
             console.log(`❌ Producteur de type ${producerType} avec ID ${targetUserId} non trouvé.`);
             return res.status(404).json({ success: false, message: `Producteur spécifié (${producerType}) non trouvé.` });
        }
    }

    // 3. Si après toutes les recherches, on n'a pas trouvé la cible (ni user, ni producer)
        if (!targetEntity) {
        console.log(`❌ Destinataire ${targetUserId} non trouvé (ni utilisateur, ni producteur).`);
        return res.status(404).json({ success: false, message: 'Destinataire non trouvé.' });
    }
    
    // 4. Préparer la requête pour trouver la conversation existante
    let existingConversationQuery = {};
    if (isProducerConv) {
      // Recherche conversation User <-> Producer
      existingConversationQuery = {
        participants: { $in: [userId] }, // L'utilisateur doit être dedans
        isProducerConversation: true,
        producerId: finalTargetId, // L'ID du producteur
        producerType: targetEntityType, // Le type de producteur
        isGroup: false
      };
      console.log("Recherche conversation existante User-Producer:", existingConversationQuery);
    } else {
      // Recherche conversation User <-> User
      existingConversationQuery = {
        participants: { $all: [userId, finalTargetId], $size: 2 }, // Les deux utilisateurs et seulement eux
        isGroup: false, // Pas un groupe
        isProducerConversation: { $ne: true } // Pas une conversation producteur
      };
       console.log("Recherche conversation existante User-User:", existingConversationQuery);
    }

    // 5. Chercher la conversation existante
    const existingConversation = await Conversation.findOne(existingConversationQuery).lean(); // Utiliser lean()
    
    if (existingConversation) {
      console.log(`✅ Conversation existante trouvée, id: ${existingConversation._id}`);
      // Retourner les détails formatés de la conversation existante
      return res.status(200).json({
        success: true,
        message: 'Conversation existante trouvée',
        // Ajouter conversationId pour compatibilité directe avec certains appels frontend
        conversationId: existingConversation._id.toString(), 
        _id: existingConversation._id.toString(), // Garder _id aussi
        conversation: {
          _id: existingConversation._id.toString(),
          id: existingConversation._id.toString(),
          participants: existingConversation.participants,
          isGroup: existingConversation.isGroup,
          isProducerConversation: existingConversation.isProducerConversation,
          producerId: existingConversation.producerId,
          producerType: existingConversation.producerType,
          lastUpdated: existingConversation.lastUpdated || existingConversation.createdAt
        }
      });
    }
    
    // 6. Si aucune conversation n'existe, la créer
    console.log(`👋 Aucune conversation existante. Création d'une nouvelle conversation...`);
    const participantIds = isProducerConv ? [userId] : [userId, finalTargetId];
    
    // Initialiser unreadCount comme un objet simple pour compatibilité frontend/mongoose
    const initialUnreadCount = {};
    participantIds.forEach(pId => {
      initialUnreadCount[pId.toString()] = 0;
    });
    
    const newConversationData = {
      participants: participantIds,
      isGroup: false,
      isGroupChat: false,
      lastUpdated: new Date(),
      lastMessageDate: new Date(),
      createdAt: new Date(),
      unreadCount: initialUnreadCount, 
      isProducerConversation: isProducerConv,
      producerId: isProducerConv ? finalTargetId : null,
      producerType: isProducerConv ? targetEntityType : null
    };

    const conversation = new Conversation(newConversationData);
    await conversation.save();
    console.log(`✅ Nouvelle conversation créée, id: ${conversation._id}`);
    
    // Renvoyer les détails formatés de la nouvelle conversation
    res.status(201).json({
      success: true,
      message: 'Nouvelle conversation créée avec succès',
      conversationId: conversation._id.toString(), // Ajouter conversationId
      _id: conversation._id.toString(), // Garder _id
      conversation: {
        _id: conversation._id.toString(),
        id: conversation._id.toString(),
        participants: conversation.participants,
        isGroup: conversation.isGroup,
        isProducerConversation: conversation.isProducerConversation,
        producerId: conversation.producerId,
        producerType: conversation.producerType,
        lastUpdated: conversation.lastUpdated
      }
    });
  } catch (error) {
    console.error('❌ Erreur lors de la création/vérification de la conversation:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Erreur interne du serveur.', 
      error: error.message 
    });
  }
});

/**
 * @route POST /api/conversations/check-or-create
 * @desc Vérifier si une conversation existe déjà entre deux utilisateurs, sinon en créer une nouvelle
 * @access Private
 */
router.post('/check-or-create', auth, async (req, res) => {
  try {
    const { senderId, recipientId } = req.body;
    
    // Validation des entrées
    if (!senderId || !recipientId) {
      return res.status(400).json({ message: 'Les IDs d\'expéditeur et de destinataire sont requis' });
    }
    
    // Empêcher une conversation avec soi-même
    if (senderId === recipientId) {
      return res.status(400).json({ message: 'Impossible de créer une conversation avec soi-même' });
    }
    
    // Vérifier que les utilisateurs existent
    const [sender, recipient] = await Promise.all([
      User.findById(senderId),
      User.findById(recipientId)
    ]);
    
    if (!sender || !recipient) {
      return res.status(404).json({ message: 'Utilisateur non trouvé' });
    }
    
    // Vérifier si une conversation existe déjà entre ces deux utilisateurs
    const existingConversation = await Conversation.findOne({
      participants: { $all: [senderId, recipientId] },
      isGroup: { $ne: true },
      isProducerConversation: { $ne: true }
    });
    
    if (existingConversation) {
      console.log(`🔄 Conversation existante trouvée entre ${senderId} et ${recipientId}`);
      return res.status(201).json({
        message: 'Conversation existante récupérée',
        conversationId: existingConversation._id,
        isNewConversation: false
      });
    }
    
    // Créer une nouvelle conversation
    const newConversation = new Conversation({
      participants: [senderId, recipientId],
      isGroup: false,
      isProducerConversation: false,
      createdBy: senderId,
      createdAt: new Date(),
      lastMessageDate: new Date(),
      conversationName: `${sender.name || sender.username} & ${recipient.name || recipient.username}`
    });
    
    await newConversation.save();
    
    // Créer un message de bienvenue
    const welcomeMessage = new Message({
      conversationId: newConversation._id,
      senderId: senderId,
      content: 'Bonjour, je souhaite entrer en contact avec vous.',
      timestamp: new Date(),
      read: false
    });
    
    // Marquer le message comme lu par le créateur, non lu pour les autres
    recipientId.forEach(userId => {
      welcomeMessage.isRead[userId.toString()] = userId === senderId;
    });
    
    await welcomeMessage.save();
    
    // Mettre à jour la conversation avec le dernier message
    newConversation.lastMessage = welcomeMessage._id;
    newConversation.lastMessageDate = welcomeMessage.timestamp;
    await newConversation.save();
    
    console.log(`✅ Nouvelle conversation créée entre ${senderId} et ${recipientId}`);
    
    res.status(201).json({
      message: 'Nouvelle conversation créée',
      conversationId: newConversation._id,
      isNewConversation: true
    });
  } catch (error) {
    console.error('❌ Erreur lors de la vérification/création de conversation:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

/**
 * @route PUT /api/conversations/:conversationId/read
 * @desc Marquer tous les messages d'une conversation comme lus (double coche bleue)
 * @access Private
 */
router.put('/:conversationId/read', auth, async (req, res) => {
  try {
    const { conversationId } = req.params;
    const userId = req.user.id;
    const { messageId } = req.body; // ID du dernier message lu (optionnel)
    
    // Vérifier si la conversation existe
    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: 'Conversation non trouvée'
      });
    }
    
    // Vérifier que l'utilisateur est un participant de la conversation
    const participantIndex = conversation.participants.findIndex(p => 
      p.userId.toString() === userId
    );
    
    if (participantIndex === -1) {
      return res.status(403).json({
        success: false,
        message: 'Vous n\'êtes pas autorisé à accéder à cette conversation'
      });
    }
    
    // Trouver le dernier message de la conversation si non spécifié
    let lastMessageId = messageId;
    if (!lastMessageId) {
      const lastMessage = await Message.findOne({ conversationId })
        .sort({ createdAt: -1 })
        .select('_id');
      
      if (lastMessage) {
        lastMessageId = lastMessage._id;
      }
    }
    
    if (lastMessageId) {
      // Marquer la conversation comme lue jusqu'à ce message
      await conversation.markAsReadForUser(userId, lastMessageId);
      
      // Marquer tous les messages comme lus pour cet utilisateur
      await Message.updateMany(
        { 
          conversationId,
          _id: { $lte: lastMessageId },
          senderId: { $ne: userId },
          'readBy.userId': { $ne: userId }
        },
        { 
          $push: { 
            readBy: { 
              userId, 
              readAt: new Date() 
            } 
          } 
        }
      );
      
      // Notifier les autres participants de la lecture via WebSocket
      conversation.participants.forEach(participant => {
        if (participant.userId.toString() !== userId) {
          io.to(`user_${participant.userId}`).emit('messages_read', {
            conversationId,
            userId,
            lastReadMessageId: lastMessageId,
            timestamp: new Date().toISOString()
          });
        }
      });
    }
    
    res.status(200).json({
      success: true,
      message: 'Messages marqués comme lus',
      lastReadMessageId: lastMessageId
    });
  } catch (error) {
    console.error('❌ Erreur lors de la mise à jour des messages lus:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur',
      error: error.message
    });
  }
});

/**
 * @route POST /api/conversations/:conversationId/mentions
 * @desc Process mentions in a message (users, places, etc.)
 * @access Public
 */
router.post('/:conversationId/mentions', async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { messageId, mentions } = req.body;
    
    if (!conversationId || !messageId || !mentions || !Array.isArray(mentions) || mentions.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Missing required fields: conversationId, messageId, or mentions' 
      });
    }
    
    // Verify the conversation exists
    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ 
        success: false, 
        message: 'Conversation not found' 
      });
    }
    
    // Find the message in the conversation
    let messageFound = false;
    let messageIndex = -1;
    
    if (conversation.messages && conversation.messages.length > 0) {
      messageIndex = conversation.messages.findIndex(
        msg => msg._id.toString() === messageId
      );
      
      if (messageIndex !== -1) {
        messageFound = true;
      }
    }
    
    // If the message is not found in the conversation messages array, 
    // look for it in the messages collection
    if (!messageFound) {
      const message = await Message.findById(messageId);
      
      if (!message || message.conversationId.toString() !== conversationId) {
        return res.status(404).json({ 
          success: false, 
          message: 'Message not found in this conversation' 
        });
      }
      
      // Add mentions to the message
      message.mentions = mentions;
      await message.save();
      
      return res.status(200).json({
        success: true,
        message: 'Mentions added to message',
        messageId: message._id
      });
    }
    
    // If the message was found in the conversation
    // Add mentions to the message
    conversation.messages[messageIndex].mentions = mentions;
    
    // Mark the messages array as modified
    conversation.markModified('messages');
    await conversation.save();
    
    // Process notifications for user mentions
    const userMentions = mentions.filter(mention => mention.type === 'user');
    
    // Only send notifications for user mentions
    if (userMentions.length > 0) {
      try {
        // Get all the mentioned user IDs
        const mentionedUserIds = userMentions.map(mention => mention.id);
        
        // Get the message sender info
        const senderId = conversation.messages[messageIndex].senderId;
        const sender = await User.findById(senderId).select('name username');
        
        // Send email notifications to mentioned users
        for (const userId of mentionedUserIds) {
          const user = await User.findById(userId).select('email name notificationPreferences');
          
          // Check if user wants to receive mention notifications
          if (user && user.email && 
              (!user.notificationPreferences || user.notificationPreferences.mentions !== false)) {
            
            try {
              await sendNotificationEmail(
                user.email,
                'Vous avez été mentionné dans un message',
                `${sender?.name || 'Un utilisateur'} vous a mentionné dans une conversation.`,
                {
                  conversationId,
                  messageId,
                  senderId,
                  senderName: sender?.name || sender?.username || 'Utilisateur',
                  mentionType: 'message'
                }
              );
              
              console.log(`✅ Mention notification sent to ${user.name} (${user.email})`);
            } catch (emailError) {
              console.error(`❌ Failed to send mention notification email: ${emailError}`);
              // Continue despite email error
            }
          }
        }
      } catch (notificationError) {
        console.error('❌ Error processing mention notifications:', notificationError);
        // Continue despite notification errors
      }
    }
    
    res.status(200).json({
      success: true,
      message: 'Mentions added to message',
      messageId
    });
    
  } catch (error) {
    console.error('❌ Error processing mentions:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error processing mentions', 
      error: error.message 
    });
  }
});

/**
 * @route GET /api/conversations/tags/search
 * @desc Search for taggable entities (users, places, hashtags)
 * @access Public
 */
router.get('/tags/search', async (req, res) => {
  try {
    const { query, type } = req.query;
    
    if (!query || query.length < 2) {
      return res.status(400).json({ 
        success: false, 
        message: 'Search query must be at least 2 characters' 
      });
    }
    
    let results = [];
    const searchRegex = new RegExp(query, 'i');
    
    // If type is specified, only search that type
    if (type) {
      switch (type) {
        case 'user':
          // Search for users
          results = await User.find({
            $or: [
              { name: searchRegex },
              { username: searchRegex }
            ]
          })
          .select('_id name username profilePicture')
          .limit(15);
          
          results = results.map(user => ({
            id: user._id.toString(),
            type: 'user',
            name: user.name || user.username || 'User',
            username: user.username || '',
            avatar: user.profilePicture
          }));
          break;
          
        case 'place':
          // Search for places (restaurants)
          const restaurants = await Producer.find({
            $or: [
              { name: searchRegex },
              { lieu: searchRegex },
              { ville: searchRegex }
            ]
          })
          .select('_id name lieu ville photo')
          .limit(5);
          
          // Search for leisure places
          const leisurePlaces = await LeisureProducer.find({
            $or: [
              { name: searchRegex },
              { lieu: searchRegex },
              { ville: searchRegex }
            ]
          })
          .select('_id name lieu ville photo')
          .limit(5);
          
          // Search for wellness places
          const wellnessPlaces = await BeautyProducer.find({
            $or: [
              { name: searchRegex },
              { lieu: searchRegex },
              { ville: searchRegex }
            ]
          })
          .select('_id name lieu ville photo')
          .limit(5);
          
          // Combine all places
          results = [
            ...restaurants.map(place => ({
              id: place._id.toString(),
              type: 'restaurant',
              name: place.name || place.lieu || 'Restaurant',
              location: place.ville || '',
              avatar: place.photo
            })),
            ...leisurePlaces.map(place => ({
              id: place._id.toString(),
              type: 'leisure',
              name: place.name || place.lieu || 'Lieu de loisir',
              location: place.ville || '',
              avatar: place.photo
            })),
            ...wellnessPlaces.map(place => ({
              id: place._id.toString(),
              type: 'wellness',
              name: place.name || place.lieu || 'Lieu de bien-être',
              location: place.ville || '',
              avatar: place.photo
            }))
          ];
          break;
          
        case 'hashtag':
          // For hashtags, we'll just return a formatted version of the query
          // In a real app, you might search a hashtags collection
          results = [{
            id: query.replace(/\s+/g, '').toLowerCase(),
            type: 'hashtag',
            name: `#${query.replace(/\s+/g, '').toLowerCase()}`,
            count: Math.floor(Math.random() * 1000) // Simulate post count
          }];
          break;
          
        default:
          return res.status(400).json({ 
            success: false, 
            message: 'Invalid tag type' 
          });
      }
    } else {
      // If no type is specified, search all types
      
      // Search for users
      const users = await User.find({
        $or: [
          { name: searchRegex },
          { username: searchRegex }
        ]
      })
      .select('_id name username profilePicture')
      .limit(10);
      
      // Search for places (combined)
      const restaurants = await Producer.find({
        $or: [
          { name: searchRegex },
          { lieu: searchRegex }
        ]
      })
      .select('_id name lieu ville photo')
      .limit(3);
      
      const leisurePlaces = await LeisureProducer.find({
        $or: [
          { name: searchRegex },
          { lieu: searchRegex }
        ]
      })
      .select('_id name lieu ville photo')
      .limit(3);
      
      const wellnessPlaces = await BeautyProducer.find({
        $or: [
          { name: searchRegex },
          { lieu: searchRegex }
        ]
      })
      .select('_id name lieu ville photo')
      .limit(3);
      
      // Combine all results
      results = [
        ...users.map(user => ({
          id: user._id.toString(),
          type: 'user',
          name: user.name || user.username || 'User',
          username: user.username || '',
          avatar: user.profilePicture
        })),
        ...restaurants.map(place => ({
          id: place._id.toString(),
          type: 'restaurant',
          name: place.name || place.lieu || 'Restaurant',
          location: place.ville || '',
          avatar: place.photo
        })),
        ...leisurePlaces.map(place => ({
          id: place._id.toString(),
          type: 'leisure',
          name: place.name || place.lieu || 'Lieu de loisir',
          location: place.ville || '',
          avatar: place.photo
        })),
        ...wellnessPlaces.map(place => ({
          id: place._id.toString(),
          type: 'wellness',
          name: place.name || place.lieu || 'Lieu de bien-être',
          location: place.ville || '',
          avatar: place.photo
        })),
        // Add hashtag
        {
          id: query.replace(/\s+/g, '').toLowerCase(),
          type: 'hashtag',
          name: `#${query.replace(/\s+/g, '').toLowerCase()}`,
          count: Math.floor(Math.random() * 1000) // Simulate post count
        }
      ];
    }
    
    res.status(200).json({
      success: true,
      results
    });
    
  } catch (error) {
    console.error('❌ Error searching for tags:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error searching for tags', 
      error: error.message 
    });
  }
});

// --- Group Participant Management Routes ---

/**
 * @route POST /api/conversations/:conversationId/participants
 * @desc Add participants to an existing group conversation
 * @access Private (Requires auth and potentially check if user is in the group)
 */
router.post('/:conversationId/participants', auth, async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { participantIds } = req.body; // Expecting an array of user IDs to add
    const requesterId = req.user.id; // ID of the user making the request

    if (!mongoose.Types.ObjectId.isValid(conversationId)) {
      return res.status(400).json({ success: false, message: 'Invalid conversationId format.' });
    }
    if (!Array.isArray(participantIds) || participantIds.length === 0) {
      return res.status(400).json({ success: false, message: 'participantIds must be a non-empty array.' });
    }

    const conversation = await Conversation.findById(conversationId);

    if (!conversation) {
      return res.status(404).json({ success: false, message: 'Conversation not found.' });
    }
    if (!conversation.isGroup) {
      return res.status(400).json({ success: false, message: 'This conversation is not a group.' });
    }

    // Optional: Check if the requester is allowed to add members (e.g., is already a participant)
    if (!conversation.participants.map(p => p.toString()).includes(requesterId)) {
       return res.status(403).json({ success: false, message: 'You are not a member of this group.' });
    }

    // Find valid users to add (filter out invalid IDs and existing members)
    const validParticipantIds = participantIds
        .filter(id => mongoose.Types.ObjectId.isValid(id))
        .map(id => mongoose.Types.ObjectId(id))
        .filter(id => !conversation.participants.some(p => p.equals(id))); // Check ObjectId equality
        
    if (validParticipantIds.length === 0) {
        return res.status(400).json({ success: false, message: 'No valid new participants provided or users already in group.'});
    }
    
    // Verify that the users to be added actually exist in the User collection
    const existingUsers = await User.find({ '_id': { $in: validParticipantIds } }).select('_id');
    const existingUserIds = existingUsers.map(u => u._id);

    const finalParticipantIdsToAdd = validParticipantIds.filter(id => existingUserIds.some(existingId => existingId.equals(id)));

    if (finalParticipantIdsToAdd.length === 0) {
        return res.status(404).json({ success: false, message: 'None of the provided users were found.'});
    }

    // Add the valid, existing users to the participants array
    conversation.participants.push(...finalParticipantIdsToAdd);

    // Initialize unread count for new participants
    conversation.ensureUnreadCountIsObject();
    finalParticipantIdsToAdd.forEach(id => {
        if (!conversation.unreadCount[id.toString()]) {
             conversation.unreadCount[id.toString()] = 0; // Or maybe set to 1 if a notification message is added?
        }
    });
    conversation.markModified('unreadCount'); // Mark as modified if it's a plain object
    
    // Add a system message (optional)
    // TODO: Add logic to create and save a system message notifying about new members

    conversation.lastUpdated = new Date();
    await conversation.save();

    // TODO: Emit WebSocket event 'participants_updated' to notify clients?

    res.status(200).json({ 
      success: true, 
      message: 'Participants added successfully.', 
      addedIds: finalParticipantIdsToAdd.map(id => id.toString())
    });
  } catch (error) {
    console.error('❌ Error adding participants:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
});

/**
 * @route DELETE /api/conversations/:conversationId/participants/:participantId
 * @desc Remove a participant from a group conversation
 * @access Private (Requires auth and potentially check if requester can remove members)
 */
router.delete('/:conversationId/participants/:participantId', auth, async (req, res) => {
  try {
    const { conversationId, participantId } = req.params;
    const requesterId = req.user.id; // ID of the user making the request

    if (!mongoose.Types.ObjectId.isValid(conversationId) || !mongoose.Types.ObjectId.isValid(participantId)) {
      return res.status(400).json({ success: false, message: 'Invalid conversationId or participantId format.' });
    }

    const conversation = await Conversation.findById(conversationId);

    if (!conversation) {
      return res.status(404).json({ success: false, message: 'Conversation not found.' });
    }
    if (!conversation.isGroup) {
      return res.status(400).json({ success: false, message: 'This conversation is not a group.' });
    }

    // --- Authorization Checks --- 
    const requesterIsMember = conversation.participants.map(p => p.toString()).includes(requesterId);
    if (!requesterIsMember) {
       return res.status(403).json({ success: false, message: 'You are not a member of this group.' });
    }
    // Simple check: Only allow self-removal for now (can be expanded later e.g., group admin)
    if (requesterId !== participantId) {
         return res.status(403).json({ success: false, message: 'You can only remove yourself from the group currently.' });
         // TODO: Add logic for group admins to remove others
    }
    // --- End Authorization --- 

    const initialParticipantCount = conversation.participants.length;
    conversation.participants = conversation.participants.filter(p => p.toString() !== participantId);

    if (conversation.participants.length === initialParticipantCount) {
        return res.status(404).json({ success: false, message: 'Participant not found in this conversation.' });
    }

    // Remove unread count entry for the removed participant (optional)
     conversation.ensureUnreadCountIsObject();
     if (conversation.unreadCount[participantId]) {
         delete conversation.unreadCount[participantId];
         conversation.markModified('unreadCount');
     }
     
    // Add a system message (optional)
    // TODO: Add logic to create and save a system message notifying about member removal/leaving

    conversation.lastUpdated = new Date();
    await conversation.save();
    
    // TODO: Emit WebSocket event 'participants_updated' to notify clients?

    res.status(200).json({ 
        success: true, 
        message: 'Participant removed successfully.', 
        removedId: participantId,
        participants: conversation.participants // Return updated list
    });

  } catch (error) {
    console.error('❌ Error removing participant:', error);
    res.status(500).json({ success: false, message: 'Server error removing participant.', error: error.message });
  }
});

// --- End Group Participant Management --- 

/**
 * @route POST /api/conversations/create-producer-conversation
 * @desc Créer une conversation entre un utilisateur et un producteur (restaurant, loisir, etc.)
 * @access Public
 */
router.post('/create-producer-conversation', async (req, res) => {
  try {
    const { userId, producerId, producerType } = req.body;
    
    if (!userId || !producerId || !producerType) {
      return res.status(400).json({ 
        success: false, 
        message: 'userId, producerId et producerType sont requis.' 
      });
    }
    
    // Variables pour stocker les identifiants finaux (pour gérer les deux sens de conversation)
    let userDocument;
    let producerDocument;
    let finalUserId = userId;
    let finalProducerId = producerId;
    let isReversed = false;
    
    // Vérifier que l'utilisateur existe
    userDocument = await User.findById(userId);
    
    // Si l'utilisateur n'est pas trouvé, peut-être que le "userId" est en fait un producteur 
    // qui initie une conversation avec un utilisateur (dont l'ID est dans "producerId")
    if (!userDocument) {
      // Vérifier si le "userId" est un producteur
      let potentialProducer = null;
      
      switch(producerType) {
        case 'restaurant':
          potentialProducer = await Producer.findById(userId);
          break;
        case 'leisure':
          potentialProducer = await LeisureProducer.findById(userId);
          break;
        case 'beauty':
        case 'wellness':
          potentialProducer = await BeautyProducer.findById(userId);
          break;
      }
      
      // Si le "userId" est un producteur et le "producerId" est un utilisateur, inverser les rôles
      if (potentialProducer) {
        const potentialUser = await User.findById(producerId);
        if (potentialUser) {
          // Inverser les IDs pour la recherche et la création de conversation
          finalUserId = producerId;
          finalProducerId = userId;
          userDocument = potentialUser;
          producerDocument = potentialProducer;
          isReversed = true;
          console.log(`Détection d'une demande inversée: Producteur ${userId} initie une conversation avec l'utilisateur ${producerId}`);
        }
      }
    }
    
    // Si après la tentative d'inversion, nous n'avons toujours pas d'utilisateur valide
    if (!userDocument) {
      return res.status(404).json({ 
        success: false, 
        message: 'Utilisateur non trouvé.' 
      });
    }
    
    // Vérifier que le producteur existe selon son type (si pas déjà trouvé dans le cas inversé)
    if (!producerDocument) {
      switch(producerType) {
        case 'restaurant':
          producerDocument = await Producer.findById(finalProducerId);
          break;
        case 'leisure':
          producerDocument = await LeisureProducer.findById(finalProducerId);
          break;
        case 'beauty':
        case 'wellness':
          producerDocument = await BeautyProducer.findById(finalProducerId);
          break;
        default:
          return res.status(400).json({ 
            success: false, 
            message: 'Type de producteur non valide. Valeurs possibles: restaurant, leisure, beauty, wellness' 
          });
      }
    }
    
    if (!producerDocument) {
      return res.status(404).json({ 
        success: false, 
        message: `Producteur de type ${producerType} avec ID ${finalProducerId} non trouvé.` 
      });
    }
    
    // Vérifier si une conversation existe déjà entre cet utilisateur et ce producteur
    const existingConversation = await Conversation.findOne({
      participants: { $in: [finalUserId] },
      isProducerConversation: true,
      producerId: finalProducerId,
      producerType: producerType,
      isGroup: false
    });
    
    if (existingConversation) {
      console.log(`Conversation existante trouvée entre utilisateur ${finalUserId} et producteur ${finalProducerId}, id:`, existingConversation._id);
      return res.status(200).json({
        success: true,
        message: 'Conversation existante trouvée',
        conversationId: existingConversation._id.toString(),
        conversation_id: existingConversation._id.toString(),
        _id: existingConversation._id.toString(),
        isReversed: isReversed,
        conversation: {
          _id: existingConversation._id,
          id: existingConversation._id.toString(),
          participants: existingConversation.participants,
          isProducerConversation: true,
          producerId: finalProducerId,
          producerType: producerType
        }
      });
    }
    
    // Créer une nouvelle conversation
    const conversation = new Conversation({
      participants: [finalUserId],
      isGroup: false,
      isGroupChat: false,
      lastUpdated: new Date(),
      lastMessageDate: new Date(),
      createdAt: new Date(),
      unreadCount: { [finalUserId]: 0 },
      isProducerConversation: true,
      producerId: finalProducerId,
      producerType: producerType
    });
    
    await conversation.save();
    console.log(`Nouvelle conversation créée entre utilisateur ${finalUserId} et producteur ${finalProducerId}, id:`, conversation._id);
    
    res.status(201).json({
      success: true,
      message: 'Nouvelle conversation créée avec succès',
      conversationId: conversation._id.toString(),
      conversation_id: conversation._id.toString(),
      _id: conversation._id.toString(),
      isReversed: isReversed,
      conversation: {
        _id: conversation._id,
        id: conversation._id.toString(),
        participants: conversation.participants,
        isProducerConversation: true,
        producerId: finalProducerId,
        producerType: producerType
      }
    });
  } catch (error) {
    console.error('❌ Erreur lors de la création de la conversation avec le producteur:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur interne du serveur.',
      error: error.message 
    });
  }
});

router.patch('/:conversationId', async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { groupName, groupAvatar, isPinned, isMuted } = req.body;

    if (!mongoose.Types.ObjectId.isValid(conversationId)) {
      return res.status(400).json({ success: false, message: 'Invalid conversationId' });
    }

    if (!groupName && !groupAvatar && typeof isPinned === 'undefined' && typeof isMuted === 'undefined') {
      return res.status(400).json({ success: false, message: 'Nothing to update' });
    }

    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ success: false, message: 'Conversation not found' });
    }

    // Apply group-specific updates only if it's a group
    if (conversation.isGroup || conversation.isGroupChat) {
      if (groupName) conversation.groupName = groupName;
      if (groupAvatar) {
        conversation.groupImage = groupAvatar;
        conversation.groupAvatar = groupAvatar;
      }
    } else {
      // For non‑group conversations, ignore groupName/groupAvatar
      if (groupName || groupAvatar) {
        console.warn('Attempt to update group fields on non‑group conversation');
      }
    }

    // Apply pin / mute for any conversation type
    if (typeof isPinned !== 'undefined') {
      conversation.isPinned = Boolean(isPinned);
    }
    if (typeof isMuted !== 'undefined') {
      conversation.isMuted = Boolean(isMuted);
    }

    conversation.lastUpdated = new Date();
    await conversation.save();

    if (io) {
      const payload = {
        conversationId,
        groupName: conversation.groupName,
        groupAvatar: conversation.groupImage,
        isPinned: conversation.isPinned,
        isMuted: conversation.isMuted
      };
      if (conversation.isGroup || conversation.isGroupChat) {
        io.to(conversationId).emit('group_updated', payload);
      }
      io.to(conversationId).emit('conversation_updated', payload);
    }

    res.status(200).json({ success: true, message: 'Conversation updated', groupName: conversation.groupName, groupAvatar: conversation.groupImage, isPinned: conversation.isPinned, isMuted: conversation.isMuted });

  } catch (err) {
    console.error('Error updating conversation:', err);
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
});

// --- AJOUT : Marquer tous les messages comme lus pour un utilisateur dans une conversation ---
router.post('/:id/read', async (req, res) => {
  try {
    const { id } = req.params;
    const { userId } = req.body;
    if (!id || !userId) {
      return res.status(400).json({ success: false, message: 'id et userId requis.' });
    }
    const conversation = await Conversation.findById(id);
    if (!conversation) {
      return res.status(404).json({ success: false, message: 'Conversation non trouvée.' });
    }
    // Marquer tous les messages comme lus pour cet utilisateur
    await Message.updateMany(
      { conversationId: id, [`isRead.${userId}`]: { $ne: true } },
      { $set: { [`isRead.${userId}`]: true } }
    );
    // Réinitialiser le compteur de non lus
    if (typeof conversation.resetUnreadCount === 'function') {
      conversation.resetUnreadCount(userId);
      await conversation.save();
    }
    // Émettre l'event WebSocket
    if (io) {
      io.to(id).emit('message_read', { conversationId: id, userId });
    }
    res.status(200).json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erreur lors du marquage comme lu', error: error.message });
  }
});

// --- AJOUT : Route GET pour marquer une conversation comme lue (compatible avec frontend) ---
router.get('/:id/read', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    
    if (!id) {
      return res.status(400).json({ success: false, message: 'id conversation requis.' });
    }
    
    const conversation = await Conversation.findById(id);
    if (!conversation) {
      return res.status(404).json({ success: false, message: 'Conversation non trouvée.' });
    }
    
    // Marquer tous les messages comme lus pour cet utilisateur
    await Message.updateMany(
      { conversationId: id, [`isRead.${userId}`]: { $ne: true } },
      { $set: { [`isRead.${userId}`]: true } }
    );
    
    // Réinitialiser le compteur de non lus
    if (typeof conversation.resetUnreadCount === 'function') {
      conversation.resetUnreadCount(userId);
      await conversation.save();
    } else {
      // Fallback si la méthode n'existe pas
      if (!conversation.unreadCount || typeof conversation.unreadCount !== 'object') {
        conversation.unreadCount = {};
      }
      conversation.unreadCount[userId.toString()] = 0;
      conversation.markModified('unreadCount');
      await conversation.save();
    }
    
    // Émettre l'event WebSocket
    if (io) {
      io.to(id).emit('message_read', { conversationId: id, userId });
    }
    
    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Erreur lors du marquage de la conversation comme lue:', error);
    res.status(500).json({ success: false, message: 'Erreur serveur', error: error.message });
  }
});

// --- AJOUT : Ajouter un participant à un groupe ---
router.post('/:id/participants', async (req, res) => {
  try {
    const { id } = req.params;
    const { userId } = req.body;
    if (!id || !userId) {
      return res.status(400).json({ success: false, message: 'id et userId requis.' });
    }
    const conversation = await Conversation.findById(id);
    if (!conversation) {
      return res.status(404).json({ success: false, message: 'Conversation non trouvée.' });
    }
    // Vérifier si déjà présent
    if (conversation.participants.some(p => p.toString() === userId)) {
      return res.status(409).json({ success: false, message: 'Utilisateur déjà dans le groupe.' });
    }
    
    // Récupérer les informations de l'utilisateur avant de l'ajouter
    const user = await User.findById(userId).select('_id name username profilePicture photo_url email');
    
    if (!user) {
      return res.status(404).json({ success: false, message: 'Utilisateur à ajouter non trouvé.' });
    }
    
    // Ajouter l'utilisateur aux participants
    conversation.participants.push(userId);
    
    // Initialiser les compteurs de lecture pour le nouvel utilisateur
    if (!conversation.unreadCount) {
      conversation.unreadCount = {};
    }
    conversation.unreadCount[userId.toString()] = 0;
    
    conversation.markModified('participants');
    conversation.markModified('unreadCount');
    await conversation.save();
    
    // Formater les informations de l'utilisateur pour la réponse
    const userInfo = {
      _id: user._id,
      name: user.name || user.username || 'Utilisateur',
      username: user.username,
      profilePicture: user.profilePicture || user.photo_url,
      email: user.email
    };
    
    // Émettre l'event WebSocket avec les infos complètes
    if (io) {
      io.to(id).emit('participant_added', { 
        conversationId: id,
        userId,
        userInfo 
      });
    }
    
    res.status(200).json({ 
      success: true,
      participant: userInfo
    });
  } catch (error) {
    console.error('Erreur lors de l\'ajout du participant:', error);
    res.status(500).json({ success: false, message: 'Erreur lors de l\'ajout du participant', error: error.message });
  }
});

// Amélioration de la route de suppression de participant
router.delete('/:conversationId/participants/:participantId', auth, async (req, res) => {
  try {
    const { conversationId, participantId } = req.params;
    const userId = req.user.id; // Utilisateur actuel
    
    // Vérifier l'existence de la conversation
    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ success: false, message: 'Conversation non trouvée.' });
    }
    
    // Vérifier que l'utilisateur actuel est bien dans la conversation
    if (!conversation.participants.some(p => p.toString() === userId)) {
      return res.status(403).json({ success: false, message: 'Vous n\'êtes pas autorisé à modifier ce groupe.' });
    }
    
    // Vérifier que le participant à supprimer est dans la conversation
    if (!conversation.participants.some(p => p.toString() === participantId)) {
      return res.status(404).json({ success: false, message: 'Participant non trouvé dans ce groupe.' });
    }
    
    // Supprimer le participant
    conversation.participants = conversation.participants.filter(
      p => p.toString() !== participantId
    );
    
    // Nettoyer les compteurs unreadCount pour ce participant
    if (conversation.unreadCount && conversation.unreadCount[participantId]) {
      delete conversation.unreadCount[participantId];
      conversation.markModified('unreadCount');
    }
    
    conversation.markModified('participants');
    await conversation.save();
    
    // Emmettre l'événement via WebSocket
    if (io) {
      io.to(conversationId).emit('participant_removed', {
        conversationId,
        participantId,
        removedBy: userId
      });
    }
    
    res.status(200).json({ success: true, message: 'Participant supprimé avec succès.' });
  } catch (error) {
    console.error('Erreur lors de la suppression du participant:', error);
    res.status(500).json({ success: false, message: 'Erreur serveur', error: error.message });
  }
});

// Ajouter une route pour récupérer les participants d'une conversation avec leurs infos complètes
router.get('/:conversationId/participants', auth, async (req, res) => {
  try {
    const { conversationId } = req.params;
    const userId = req.user.id;
    
    if (!mongoose.Types.ObjectId.isValid(conversationId)) {
        return res.status(400).json({ success: false, message: 'Invalid conversationId format.' });
    }
    
    // Vérifier l'existence de la conversation
    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ success: false, message: 'Conversation non trouvée.' });
    }
    
    // Optionnel: Vérifier si c'est bien un groupe, bien que techniquement on puisse lister les participants d'un chat 1-1
    // if (!conversation.isGroup) {
    //   return res.status(400).json({ success: false, message: 'This is not a group conversation.' });
    // }
    
    // Vérifier que l'utilisateur actuel est bien dans la conversation
    // Utilisation de toString() pour la comparaison après récupération depuis la DB
    if (!conversation.participants.map(p => p.toString()).includes(userId)) {
      return res.status(403).json({ success: false, message: 'Vous n\'êtes pas autorisé à voir les participants de cette conversation.' });
    }
    
    // Récupérer les informations complètes des participants
    const participants = await User.find({
      _id: { $in: conversation.participants }
    }).select('_id name username email profilePicture photo_url lastSeen').lean(); // Utiliser lean() pour de meilleures performances
    
    // Formater les résultats
    const formattedParticipants = participants.map(p => ({
      id: p._id.toString(), // Ajouter un champ id standard
      _id: p._id.toString(),
      name: p.name || p.username || 'Utilisateur', // Fallback pour le nom
      username: p.username,
      email: p.email,
      avatar: p.profilePicture || p.photo_url, // Champ unifié pour l'avatar
      profilePicture: p.profilePicture || p.photo_url,
      lastSeen: p.lastSeen,
      isCurrentUser: p._id.toString() === userId
    }));
    
    res.status(200).json({
      success: true,
      participants: formattedParticipants,
      totalCount: formattedParticipants.length
    });
  } catch (error) {
    console.error('Erreur lors de la récupération des participants:', error);
    res.status(500).json({ success: false, message: 'Erreur serveur', error: error.message });
  }
});

// --- AJOUT : Support pour les GIFs dans les messages ---
// Ajouter dans le middleware de création de message
router.post('/:conversationId/messages', auth, async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { content, userId: senderId, contentType = 'text', gifUrl } = req.body;
    
    // ... existing code ...
    
    // Support pour les différents types de contenu
    const messageData = {
      conversationId,
      senderId,
      content,
      contentType: contentType || 'text'
    };
    
    // Si c'est un GIF, ajouter l'URL du GIF
    if (contentType === 'gif' && gifUrl) {
      messageData.gifUrl = gifUrl;
    }
    
    const message = new Message(messageData);
    
    // ... existing code ...
  } catch (error) {
    console.error('❌ Erreur lors de l\'envoi du message:', error);
    res.status(500).json({ error: 'Erreur lors de l\'envoi du message' });
  }
});

/**
 * @route GET /api/conversations/with-producer/:producerId
 * @desc Obtenir ou créer une conversation entre un utilisateur et un producteur
 * @access Private
 */
router.get('/with-producer/:producerId', auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { producerId } = req.params;
    
    if (!mongoose.Types.ObjectId.isValid(producerId)) {
      return res.status(400).json({ 
        success: false, 
        message: 'ID de producteur invalide' 
      });
    }
    
    console.log(`🔍 Recherche d'une conversation entre l'utilisateur ${userId} et le producteur ${producerId}`);
    
    // Chercher une conversation existante entre l'utilisateur et le producteur
    let conversation = await Conversation.findOne({
      type: 'private',
      $and: [
        { 'participants.userId': userId },
        { 'participants.userId': producerId }
      ],
      participants: { $size: 2 }
    }).populate('participants.userId', 'name username profilePicture photo_url');
    
    // Si aucune conversation n'existe, en créer une nouvelle
    if (!conversation) {
      console.log('👋 Création d\'une nouvelle conversation avec le producteur');
      
      // Vérifier que le producteur existe
      const producer = await User.findById(producerId);
      if (!producer) {
        return res.status(404).json({ 
          success: false, 
          message: 'Producteur non trouvé' 
        });
      }
      
      // Créer une nouvelle conversation
      conversation = new Conversation({
        type: 'private',
        participants: [
          { 
            userId, 
            role: 'member', 
            joinedAt: new Date(),
            settings: { notifications: true },
            unreadCount: 0
          },
          { 
            userId: producerId, 
            role: 'member', 
            joinedAt: new Date(),
            settings: { notifications: true },
            unreadCount: 0
          }
        ]
      });
      
      await conversation.save();
      
      // Recharger la conversation avec les données utilisateur
      conversation = await Conversation.findById(conversation._id)
        .populate('participants.userId', 'name username profilePicture photo_url');
    }
    
    // Récupérer les messages de la conversation
    const messages = await Message.find({ conversationId: conversation._id })
      .sort({ createdAt: -1 })
      .limit(20)
      .populate('senderId', 'name username profilePicture photo_url');
    
    // Mise à jour du statut de lecture pour l'utilisateur
    if (messages.length > 0) {
      await conversation.markAsReadForUser(userId, messages[0]._id);
    }
    
    res.status(200).json({
      success: true,
      conversation: {
        _id: conversation._id,
        type: conversation.type,
        participants: conversation.participants.map(p => ({
          _id: p.userId._id,
          name: p.userId.name || p.userId.username,
          profilePicture: p.userId.profilePicture || p.userId.photo_url,
          role: p.role,
          settings: p.settings,
          unreadCount: p.unreadCount
        })),
        lastMessage: conversation.lastMessage
      },
      messages: messages.map(m => ({
        _id: m._id,
        content: m.content,
        contentType: m.contentType,
        senderId: m.senderId._id,
        senderName: m.senderId.name || m.senderId.username,
        senderPhoto: m.senderId.profilePicture || m.senderId.photo_url,
        createdAt: m.createdAt,
        reactions: m.reactions,
        mediaInfo: m.mediaInfo
      }))
    });
  } catch (error) {
    console.error('❌ Erreur lors de la récupération de la conversation:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Erreur serveur',
      error: error.message
    });
  }
});

/**
 * @route POST /api/conversations/start-with-business
 * @desc Démarre une conversation avec un restaurant ou autre établissement via la recherche unifiée
 * @access Private
 */
router.post('/start-with-business', auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { businessType, businessId, message } = req.body;
    
    if (!businessId || !businessType) {
      return res.status(400).json({ 
        success: false, 
        message: 'Type et ID de l\'établissement requis' 
      });
    }
    
    console.log(`🔍 Démarrage d'une conversation avec ${businessType} ${businessId}`);
    
    // Vérifier si un utilisateur représentant cet établissement existe déjà
    let businessUser = await User.findOne({ 
      $or: [
        { "metadata.businessId": businessId },
        { "metadata.placeId": businessId }
      ]
    });
    
    if (!businessUser) {
      console.log("👋 Création d'un utilisateur représentant l'établissement");
      
      // Récupérer les détails de l'établissement depuis l'API unifiée
      const businessDetails = await fetch(`${process.env.BASE_URL || 'http://localhost:5000'}/api/unified/${businessId}`)
        .then(res => res.json())
        .catch(err => {
          console.error('❌ Erreur lors de la récupération des détails:', err);
          return null;
        });
      
      if (!businessDetails || !businessDetails._id) {
        return res.status(404).json({
          success: false,
          message: 'Établissement non trouvé'
        });
      }
      
      // Créer un utilisateur représentant l'établissement
      businessUser = new User({
        username: `business_${businessId.substring(0, 8)}`,
        email: `business_${businessId.substring(0, 8)}@example.com`,
        password: await bcrypt.hash(Math.random().toString(36).substring(2), 10),
        name: {
          first: businessDetails.name || 'Business'
        },
        profilePicture: businessDetails.avatar || businessDetails.photo || `https://ui-avatars.com/api/?name=${encodeURIComponent(businessDetails.name || 'B')}&background=random`,
        badges: [{ type: 'verified', description: 'Business Account' }],
        metadata: {
          businessId: businessId,
          businessType: businessType,
          placeId: businessDetails.place_id || '',
          isBusinessAccount: true,
          address: businessDetails.address || '',
          phone: businessDetails.phone || '',
          website: businessDetails.website || ''
        }
      });
      
      await businessUser.save();
    }
    
    // Chercher une conversation existante entre l'utilisateur et l'établissement
    let conversation = await Conversation.findOne({
      type: 'private',
      $and: [
        { 'participants.userId': userId },
        { 'participants.userId': businessUser._id }
      ],
      participants: { $size: 2 }
    });
    
    // Si aucune conversation n'existe, en créer une nouvelle
    if (!conversation) {
      conversation = new Conversation({
        type: 'private',
        participants: [
          { 
            userId, 
            role: 'member', 
            joinedAt: new Date(),
            settings: { notifications: true },
            unreadCount: 0
          },
          { 
            userId: businessUser._id, 
            role: 'member', 
            joinedAt: new Date(),
            settings: { notifications: true },
            unreadCount: 0
          }
        ]
      });
      
      await conversation.save();
    }
    
    // Envoyer un message initial si fourni
    if (message && message.trim()) {
      const newMessage = new Message({
        conversationId: conversation._id,
        senderId: userId,
        content: message,
        contentType: 'text',
        createdAt: new Date()
      });
      
      await newMessage.save();
      
      // Mettre à jour le dernier message de la conversation
      const sender = await User.findById(userId).select('name username');
      conversation.updateLastMessage(newMessage, sender.name?.first || sender.username);
      
      // Incrémenter le compteur de non lus pour l'établissement
      conversation.incrementUnreadCount(userId);
    }
    
    // Recharger la conversation avec les données utilisateur
    conversation = await Conversation.findById(conversation._id)
      .populate('participants.userId', 'name username profilePicture photo_url');
    
    // Récupérer les messages de la conversation
    const messages = await Message.find({ conversationId: conversation._id })
      .sort({ createdAt: -1 })
      .limit(20)
      .populate('senderId', 'name username profilePicture photo_url');
    
    res.status(200).json({
      success: true,
      conversation: {
        _id: conversation._id,
        type: conversation.type,
        participants: conversation.participants.map(p => ({
          _id: p.userId._id,
          name: p.userId.name?.first || p.userId.username,
          profilePicture: p.userId.profilePicture || p.userId.photo_url,
          role: p.role,
          settings: p.settings,
          unreadCount: p.unreadCount,
          isBusinessAccount: p.userId.metadata?.isBusinessAccount || false
        })),
        lastMessage: conversation.lastMessage
      },
      messages: messages.map(m => ({
        _id: m._id,
        content: m.content,
        contentType: m.contentType,
        senderId: m.senderId._id,
        senderName: m.senderId.name?.first || m.senderId.username,
        senderPhoto: m.senderId.profilePicture || m.senderId.photo_url,
        createdAt: m.createdAt,
        reactions: m.reactions,
        mediaInfo: m.mediaInfo
      }))
    });
  } catch (error) {
    console.error('❌ Erreur lors du démarrage de la conversation:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Erreur serveur',
      error: error.message
    });
  }
});

/**
 * @route POST /api/conversations/:conversationId/media
 * @desc Envoyer un message avec média (image, vidéo, audio, document)
 * @access Private
 */
router.post('/:conversationId/media', auth, async (req, res) => {
  try {
    const { conversationId } = req.params;
    const userId = req.user.id;
    const { mediaUrl, contentType, caption, fileName, fileSize, width, height, duration, thumbnailUrl } = req.body;
    
    if (!mediaUrl || !contentType) {
      return res.status(400).json({
        success: false,
        message: 'URL du média et type de contenu requis'
      });
    }
    
    // Vérifier si la conversation existe
    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: 'Conversation non trouvée'
      });
    }
    
    // Vérifier que l'utilisateur est un participant de la conversation
    const isParticipant = conversation.participants.some(p => p.userId.toString() === userId);
    if (!isParticipant) {
      return res.status(403).json({
        success: false,
        message: 'Vous n\'êtes pas autorisé à envoyer des messages dans cette conversation'
      });
    }
    
    // Préparer les informations du média
    const mediaInfo = {
      url: mediaUrl,
      thumbnailUrl: thumbnailUrl || '',
      fileName: fileName || '',
      fileSize: fileSize || 0,
      fileMimeType: contentType,
      width: width || null,
      height: height || null,
      duration: duration || null
    };
    
    // Créer le nouveau message
    const newMessage = new Message({
      conversationId,
      senderId: userId,
      content: caption || '',
      contentType,
      mediaInfo,
      createdAt: new Date()
    });
    
    await newMessage.save();
    
    // Mettre à jour le dernier message de la conversation
    const sender = await User.findById(userId).select('name username');
    conversation.updateLastMessage(newMessage, sender.name?.first || sender.username);
    
    // Incrémenter le compteur de non lus pour les autres participants
    conversation.incrementUnreadCount(userId);
    
    // Notifier les autres participants via WebSocket
    conversation.participants.forEach(participant => {
      if (participant.userId.toString() !== userId) {
        io.to(`user_${participant.userId}`).emit('new_message', {
          conversationId,
          message: {
            _id: newMessage._id,
            content: newMessage.content,
            contentType: newMessage.contentType,
            senderId: userId,
            senderName: sender.name?.first || sender.username,
            mediaInfo: newMessage.mediaInfo,
            createdAt: newMessage.createdAt
          }
        });
      }
    });
    
    res.status(201).json({
      success: true,
      message: {
        _id: newMessage._id,
        content: newMessage.content,
        contentType: newMessage.contentType,
        senderId: userId,
        senderName: sender.name?.first || sender.username,
        mediaInfo: newMessage.mediaInfo,
        createdAt: newMessage.createdAt
      }
    });
  } catch (error) {
    console.error('❌ Erreur lors de l\'envoi du média:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur',
      error: error.message
    });
  }
});

/**
 * @route POST /api/conversations/messages/:messageId/react
 * @desc Réagir à un message avec un emoji
 * @access Private
 */
router.post('/messages/:messageId/react', auth, async (req, res) => {
  try {
    const { messageId } = req.params;
    const userId = req.user.id;
    const { emoji } = req.body;
    
    if (!emoji) {
      return res.status(400).json({
        success: false,
        message: 'Emoji requis'
      });
    }
    
    // Vérifier si le message existe
    const message = await Message.findById(messageId);
    if (!message) {
      return res.status(404).json({
        success: false,
        message: 'Message non trouvé'
      });
    }
    
    // Vérifier que l'utilisateur est autorisé à réagir (participant à la conversation)
    const conversation = await Conversation.findById(message.conversationId);
    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: 'Conversation non trouvée'
      });
    }
    
    const isParticipant = conversation.participants.some(p => p.userId.toString() === userId);
    if (!isParticipant) {
      return res.status(403).json({
        success: false,
        message: 'Vous n\'êtes pas autorisé à réagir à ce message'
      });
    }
    
    // Ajouter la réaction en utilisant la méthode du modèle Message
    await message.addReaction(userId, emoji);
    
    // Notifier les autres participants via WebSocket
    conversation.participants.forEach(participant => {
      if (participant.userId.toString() !== userId) {
        io.to(`user_${participant.userId}`).emit('message_reaction', {
          conversationId: conversation._id,
          messageId: message._id,
          userId,
          emoji
        });
      }
    });
    
    res.status(200).json({
      success: true,
      message: 'Réaction ajoutée avec succès',
      reaction: {
        userId,
        emoji,
        createdAt: new Date()
      }
    });
  } catch (error) {
    console.error('❌ Erreur lors de l\'ajout de la réaction:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur',
      error: error.message
    });
  }
});

/**
 * @route DELETE /api/conversations/messages/:messageId/react
 * @desc Supprimer une réaction d'un message
 * @access Private
 */
router.delete('/messages/:messageId/react', auth, async (req, res) => {
  try {
    const { messageId } = req.params;
    const userId = req.user.id;
    
    // Vérifier si le message existe
    const message = await Message.findById(messageId);
    if (!message) {
      return res.status(404).json({
        success: false,
        message: 'Message non trouvé'
      });
    }
    
    // Supprimer la réaction en utilisant la méthode du modèle Message
    await message.removeReaction(userId);
    
    // Notifier les autres participants via WebSocket
    const conversation = await Conversation.findById(message.conversationId);
    if (conversation) {
      conversation.participants.forEach(participant => {
        if (participant.userId.toString() !== userId) {
          io.to(`user_${participant.userId}`).emit('message_reaction_removed', {
            conversationId: conversation._id,
            messageId: message._id,
            userId
          });
        }
      });
    }
    
    res.status(200).json({
      success: true,
      message: 'Réaction supprimée avec succès'
    });
  } catch (error) {
    console.error('❌ Erreur lors de la suppression de la réaction:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur',
      error: error.message
    });
  }
});

// Toujours exporter le router Express
module.exports = router; 
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { sendNotificationEmail } = require('../services/emailService');
const auth = require('../middleware/auth');
const { createModel, databases } = require('../utils/modelCreator');
const Message = require('../models/message');
const { v4: uuidv4 } = require('uuid');
const { io } = require('../index'); // Import Socket.IO server instance

// Import le schéma et la fonction de création pour Conversation
const { ConversationSchema, createConversationModel } = require('../models/conversation');

// Créer les modèles avec la bonne connexion à la base de données
const Conversation = createModel(databases.CHOICE_APP, 'Conversation', 'conversations');

// Attacher les méthodes personnalisées au modèle Conversation
Conversation.schema.methods.resetUnreadCount = ConversationSchema.methods.resetUnreadCount;
Conversation.schema.methods.incrementUnreadCount = ConversationSchema.methods.incrementUnreadCount;
Conversation.schema.methods.getUnreadCount = ConversationSchema.methods.getUnreadCount;
Conversation.schema.methods.ensureUnreadCountIsObject = ConversationSchema.methods.ensureUnreadCountIsObject;

// Models required for producer info, keep using createModel if needed for multi-DB
const User = createModel(databases.CHOICE_APP, 'User', 'Users');
const Producer = createModel(databases.RESTAURATION, 'Producer', 'producers');
const LeisureProducer = createModel(databases.LOISIR, 'LeisureProducer', 'leisureProducers');
const BeautyProducer = createModel(databases.BEAUTY_WELLNESS, 'BeautyProducer', 'beautyProducers');

// Routes pour les conversations
// Pas besoin de vérifier si les modèles sont initialisés puisqu'ils sont créés directement
// Remplacer le middleware précédent pour afficher un avertissement s'il y a des erreurs d'initialisation
router.use((req, res, next) => {
  if (!mongoose.connection.readyState) {
    return res.status(500).json({ message: 'La connexion à la base de données n\'est pas établie' });
  }
  next();
});

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
    .sort({ lastMessageDate: -1 });
    
    // Obtenir les informations des autres participants pour chaque conversation
    const populatedConversations = await Promise.all(conversations.map(async conv => {
      const convObj = conv.toObject();
      
      // Récupérer les infos des participants (hors l'utilisateur actuel)
      const otherParticipantIds = convObj.participants.filter(id => id.toString() !== userId);
      
      // Si c'est une conversation avec un producteur
      if (conv.isProducerConversation && conv.producerId) {
        try {
          let producer;
          
          if (conv.producerType === 'restaurant') {
            producer = await Producer.findById(conv.producerId);
          } else if (conv.producerType === 'leisure') {
            producer = await LeisureProducer.findById(conv.producerId);
          } else if (conv.producerType === 'wellness') {
            producer = await BeautyProducer.findById(conv.producerId);
          }
          
          if (producer) {
            convObj.producerInfo = {
              _id: producer._id,
              name: producer.name || producer.lieu,
              photo: producer.photo || producer.image,
              address: producer.address || producer.adresse
            };
          }
        } catch (err) {
          console.error('Erreur lors de la récupération des infos du producteur:', err);
        }
      }
      
      // Récupérer les infos des participants
      const participants = await User.find({
        _id: { $in: otherParticipantIds }
      }).select('_id name username profilePicture');
      
      convObj.participantsInfo = participants;
      
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
      
      return convObj;
    }));
    
    res.status(200).json(populatedConversations);
  } catch (error) {
    console.error('Erreur de récupération des conversations:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des conversations' });
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
 * @route GET /api/conversations/:conversationId/messages
 * @desc Récupérer les messages d'une conversation (Refactored to ONLY use Message collection)
 * @access Private (ou Public selon votre logique d'accès)
 */
router.get('/:conversationId/messages', async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { userId, limit = 50, before } = req.query; // userId needed for marking as read

    if (!mongoose.Types.ObjectId.isValid(conversationId)) {
       return res.status(400).json({ success: false, message: 'Invalid conversationId format.' });
    }

    // Check if conversation exists (optional, but good practice)
    const conversation = await Conversation.findById(conversationId).select('_id participants unreadCount'); // Select only needed fields
    if (!conversation) {
      console.log(`Conversation non trouvée avec ID: ${conversationId}`);
      return res.status(404).json({ success: false, message: 'Conversation non trouvée.' });
    }

    console.log(`Récupération des messages depuis la collection Message pour conversationId: ${conversationId}`);

    // --- Start: Logic ONLY using the Message collection --- 
    let query = { conversationId: new mongoose.Types.ObjectId(conversationId) }; // Ensure ID is ObjectId
    if (before) {
      try {
        query.timestamp = { $lt: new Date(before) };
      } catch (e) {
        console.error('Date invalide fournie pour \'before\':', before, e); // Corrected quoting
        // Optionally return error or ignore the 'before' filter
      }
    }

    // Fetch messages from the Message collection
    const messageResults = await Message.find(query)
      .sort({ timestamp: -1 })
      .limit(Number(limit))
      .lean(); // Use lean for performance

    // Fetch sender details efficiently
    const senderIds = [...new Set(messageResults.map(m => m.senderId).filter(Boolean))];
    let senders = {};
    if (senderIds.length > 0) {
      try {
        const senderList = await User.find({ _id: { $in: senderIds } })
                                     .select('_id name username profilePicture photo_url')
                                     .lean();
        senderList.forEach(sender => {
          senders[sender._id.toString()] = {
            _id: sender._id,
            name: sender.name || sender.username || 'Utilisateur',
            profilePicture: sender.profilePicture || sender.photo_url
          };
        });
      } catch (userError) {
           console.error("Error fetching sender details:", userError);
           // Continue without full sender details
      }
    }

    // Format messages
    const messages = messageResults.map(msg => {
      const senderIdStr = msg.senderId ? msg.senderId.toString() : '';
      const sender = senders[senderIdStr] || { _id: senderIdStr, name: 'Utilisateur inconnu', profilePicture: null }; // Default sender info
      
      // Check if message is read by the current user
      const isReadByCurrentUser = msg.isRead && typeof msg.isRead === 'object' && msg.isRead[userId] === true;

      return {
        _id: msg._id,
        id: msg._id.toString(),
        senderId: senderIdStr,
        sender: sender,
        content: msg.content || '',
        timestamp: msg.timestamp ? msg.timestamp.toISOString() : new Date().toISOString(), // Ensure ISO string
        media: msg.attachments || msg.media || [], // Use attachments field from message.js model
        contentType: msg.contentType || 'text',
        mentions: msg.mentions || [],
        isRead: isReadByCurrentUser // Indicate if read by the requesting user
      };
    });
    // --- End: Logic ONLY using the Message collection --- 

    // Mark messages as read for the requesting user (if userId is provided)
    if (userId) {
      try {
         // Mark messages in DB as read
         await Message.updateMany(
           { 
             conversationId: new mongoose.Types.ObjectId(conversationId),
             senderId: { $ne: new mongoose.Types.ObjectId(userId) }, // Don't mark own messages as read
             [`isRead.${userId}`]: { $ne: true } // Only update if not already true
           },
           { $set: { [`isRead.${userId}`]: true } }
         );

         // Reset unread count for the user in the conversation document
         if (conversation) { // Check if conversation was found
             conversation.resetUnreadCount(userId);
             await conversation.save();
             console.log(`✅ Unread count reset for user ${userId} in conversation ${conversationId}`);
         }

      } catch (updateError) {
        console.error('Erreur lors de la mise à jour des statuts de lecture:', updateError);
        // Continue despite the error, messages are still fetched
      }
    }

    // Renvoyer les messages (les plus récents en premier, le client inversera si besoin)
    res.status(200).json({
      success: true,
      messages: messages, // Messages are already sorted newest first by the query
      participants: conversation ? conversation.participants : [] // Include participants if conversation was found
    });

  } catch (error) {
    console.error('Erreur lors de la récupération des messages:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Erreur lors de la récupération des messages',
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
    const { senderId, content, media } = req.body;
    
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
    const message = new Message({
      conversationId,
      senderId: senderId,
      content,
      timestamp,
      attachments: media || []
      // Mentions are not handled in this specific route, add if necessary
      // mentions: req.body.mentions || [] 
    });
    
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
    const { userId, targetUserId, producerType } = req.body;
    
    if (!userId || !targetUserId) {
      return res.status(400).json({ 
        success: false, 
        message: 'userId et targetUserId sont requis.' 
      });
    }
    
    // Vérifier d'abord que l'utilisateur existe
    const currentUser = await User.findById(userId);
    if (!currentUser) {
      return res.status(404).json({ 
        success: false, 
        message: 'Utilisateur courant non trouvé.' 
      });
    }
    
    let targetEntity = null;
    let isProducerConversation = false;
    let producerId = null;
    let actualProducerType = null;
    
    // Vérifier si targetUserId est un producteur selon le producerType
    if (producerType) {
      console.log(`🔍 Recherche du producteur de type ${producerType} avec ID ${targetUserId}`);
      isProducerConversation = true;
      
      switch(producerType) {
        case 'restaurant':
          targetEntity = await Producer.findById(targetUserId);
          producerId = targetUserId;
          actualProducerType = 'restaurant';
          break;
        case 'leisure':
          targetEntity = await LeisureProducer.findById(targetUserId);
          producerId = targetUserId;
          actualProducerType = 'leisure';
          break;
        case 'beauty':
        case 'wellness':
          targetEntity = await BeautyProducer.findById(targetUserId);
          producerId = targetUserId;
          actualProducerType = producerType;
          break;
        default:
          // Tenter de trouver dans toutes les collections
          targetEntity = await Producer.findById(targetUserId) || 
                         await LeisureProducer.findById(targetUserId) ||
                         await BeautyProducer.findById(targetUserId);
                         
          if (targetEntity) {
            producerId = targetUserId;
            // Déterminer le type en fonction de la collection où il a été trouvé
            if (targetEntity.constructor.modelName === 'Producer') {
              actualProducerType = 'restaurant';
            } else if (targetEntity.constructor.modelName === 'LeisureProducer') {
              actualProducerType = 'leisure';
            } else {
              actualProducerType = 'wellness';
            }
          }
          break;
      }
      
      if (!targetEntity) {
        return res.status(404).json({ 
          success: false, 
          message: `Producteur de type ${producerType} avec ID ${targetUserId} non trouvé.` 
        });
      }
    } else {
      // Si ce n'est pas un producteur, vérifier s'il s'agit d'un utilisateur
      targetEntity = await User.findById(targetUserId);
      
      if (!targetEntity) {
        // Si l'utilisateur n'est pas trouvé, essayer de le trouver en tant que producteur
        console.log(`⚠️ Utilisateur avec ID ${targetUserId} non trouvé, recherche comme producteur...`);
        
        const producer = await Producer.findById(targetUserId);
        if (producer) {
          targetEntity = producer;
          isProducerConversation = true;
          producerId = targetUserId;
          actualProducerType = 'restaurant';
        } else {
          const leisureProducer = await LeisureProducer.findById(targetUserId);
          if (leisureProducer) {
            targetEntity = leisureProducer;
            isProducerConversation = true;
            producerId = targetUserId;
            actualProducerType = 'leisure';
          } else {
            const beautyProducer = await BeautyProducer.findById(targetUserId);
            if (beautyProducer) {
              targetEntity = beautyProducer;
              isProducerConversation = true;
              producerId = targetUserId;
              actualProducerType = 'wellness';
            }
          }
        }
        
        if (!targetEntity) {
      return res.status(404).json({ 
        success: false, 
            message: 'Destinataire non trouvé ni comme utilisateur ni comme producteur.' 
          });
        }
        
        console.log(`✅ Destinataire trouvé comme producteur de type ${actualProducerType}`);
      }
    }
    
    // Vérifier si une conversation existe déjà
    let existingConversationQuery = {
      participants: { $all: [userId] },
      isGroup: false
    };
    
    if (isProducerConversation) {
      // Pour une conversation avec un producteur
      existingConversationQuery = {
        ...existingConversationQuery,
        isProducerConversation: true,
        producerId: producerId
      };
    } else {
      // Pour une conversation entre utilisateurs
      existingConversationQuery = {
        ...existingConversationQuery,
        participants: { $all: [userId, targetUserId], $size: 2 },
        isProducerConversation: { $ne: true }
      };
    }
    
    const existingConversation = await Conversation.findOne(existingConversationQuery);
    
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
          isProducerConversation: existingConversation.isProducerConversation,
          producerId: existingConversation.producerId,
          producerType: existingConversation.producerType,
          lastUpdated: existingConversation.lastUpdated || existingConversation.createdAt
        }
      });
    }
    
    // Créer une nouvelle conversation
    const participantIds = isProducerConversation ? [userId] : [userId, targetUserId];
    const conversation = new Conversation({
      participants: participantIds,
      isGroup: false,
      isGroupChat: false,
      lastUpdated: new Date(),
      lastMessageDate: new Date(),
      createdAt: new Date(),
      unreadCount: new Map(participantIds.map(p => [p.toString(), 0])),
      // Ajouter les champs pour les conversations avec producteurs
      isProducerConversation: isProducerConversation,
      producerId: producerId,
      producerType: actualProducerType
    });
    
    await conversation.save();
    console.log('Nouvelle conversation créée, id:', conversation._id, 
                isProducerConversation ? `avec producteur de type ${actualProducerType}` : 'entre utilisateurs');
    
    // Renvoyer la nouvelle conversation
    res.status(201).json({
      success: true,
      message: 'Nouvelle conversation créée avec succès',
      conversation: {
        _id: conversation._id,
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
 * @desc Marquer une conversation comme lue pour un utilisateur
 * @access Public
 */
router.put('/:conversationId/read', async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { userId } = req.body;
    
    if (!conversationId) {
      return res.status(400).json({
        success: false,
        message: 'ID de conversation requis'
      });
    }
    
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'ID d\'utilisateur requis'
      });
    }
    
    // Vérifier que la conversation existe
    const conversation = await Conversation.findById(conversationId);
    
    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: 'Conversation non trouvée'
      });
    }
    
    // Vérifier que l'utilisateur est un participant de la conversation
    if (!conversation.participants.some(p => p.toString() === userId.toString())) {
      return res.status(403).json({
        success: false,
        message: 'Utilisateur non autorisé à accéder à cette conversation'
      });
    }
    
    // Réinitialiser le compteur de messages non lus pour cet utilisateur
    conversation.resetUnreadCount(userId);
    await conversation.save();
    
    // Marquer tous les messages comme lus pour cet utilisateur
    if (conversation.messages && conversation.messages.length > 0) {
      conversation.messages.forEach(message => {
        if (message.isRead && typeof message.isRead === 'object') {
          message.isRead[userId.toString()] = true;
        }
      });
      
      // Marquer le document comme modifié
      conversation.markModified('messages');
      await conversation.save();
    }
    
    return res.status(200).json({
      success: true,
      message: 'Conversation marquée comme lue'
    });
  } catch (error) {
    console.error('Erreur lors du marquage de la conversation comme lue:', error);
    return res.status(500).json({
      success: false,
      message: 'Erreur lors du marquage de la conversation comme lue',
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
      addedIds: finalParticipantIdsToAdd.map(id => id.toString()),
      participants: conversation.participants // Return updated list
    });

  } catch (error) {
    console.error('❌ Error adding participants:', error);
    res.status(500).json({ success: false, message: 'Server error adding participants.', error: error.message });
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

// Toujours exporter le router Express
module.exports = router; 
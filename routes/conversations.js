const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { choiceAppDb } = require('../index');
const { sendNotificationEmail } = require('../services/emailService');
const User = require('../models/User');
const Producer = require('../models/Producer');
const LeisureProducer = require('../models/leisureProducer');
const BeautyProducer = require('../models/beautyProducer');
const auth = require('../middleware/auth');

// Modèle User dans la base choice_app
const UserChoice = choiceAppDb.model(
  'User',
  new mongoose.Schema({}, { strict: false }),
  'Users'
);

// Modèle User dans la base choice_app
const UserTest = choiceAppDb.model(
  'User',
  new mongoose.Schema({
    name: { type: String },
    photo_url: { type: String },
  }),
  'Users'
);

// Schéma pour les messages
const MessageSchema = new mongoose.Schema({
  senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  content: { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
  contentType: { type: String, default: 'text' },
  attachments: [{
    type: { type: String },
    url: { type: String },
    preview: { type: String }
  }],
  readBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }]
});

// Modèle pour les conversations
const conversationSchema = new mongoose.Schema({
  participants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }],
  lastMessage: { type: String },
  lastMessageDate: { type: Date, default: Date.now },
  lastMessageSender: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  unreadCount: { type: Map, of: Number, default: {} },
  isGroupChat: { type: Boolean, default: false },
  groupName: { type: String },
  groupImage: { type: String },
  createdAt: { type: Date, default: Date.now },
  isProducerConversation: { type: Boolean, default: false },
  producerId: { type: mongoose.Schema.Types.ObjectId },
  producerType: { type: String, enum: ['restaurant', 'leisure', 'wellness'] }
});

const ConversationModel = choiceAppDb.model('Conversation', conversationSchema, 'conversations');

// Modèle pour les messages
const messageSchema = new mongoose.Schema({
  conversationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation', required: true },
  sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  content: { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
  isRead: { type: Map, of: Boolean, default: {} }, // Stocke pour chaque utilisateur si le message a été lu
  attachments: [{ 
    type: { type: String, enum: ['image', 'video', 'file'] },
    url: { type: String },
    name: { type: String },
    size: { type: Number }
  }]
});

const MessageModel = choiceAppDb.model('Message', messageSchema, 'messages');

/**
 * @route GET /api/conversations
 * @desc Récupérer les conversations d'un utilisateur
 * @access Private
 */
router.get('/', auth, async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Trouver toutes les conversations où l'utilisateur est participant
    const conversations = await ConversationModel.find({
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
      
      // Calculer le nombre de messages non lus
      convObj.unreadCount = convObj.unreadCount?.get(userId) || 0;
      
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
    
    if (!userId) {
      return res.status(400).json({ message: 'userId requis.' });
    }
    
    // Vérifier que l'utilisateur existe
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'Utilisateur non trouvé.' });
    }
    
    // Trouver toutes les conversations où l'utilisateur est participant
    const conversations = await ConversationModel.find({
      participants: userId
    })
    .sort({ lastMessageDate: -1 })
    .populate('participants', '_id name username profilePicture photo_url');
    
    // Format simplifié de la réponse pour compatibilité avec le frontend
    const simplifiedConversations = conversations.map(conv => {
      const convObj = conv.toObject();
      const otherParticipants = convObj.participants.filter(p => p._id.toString() !== userId);
      
      return {
        _id: convObj._id,
        id: convObj._id,
        participants: convObj.participants.map(p => p._id),
        name: convObj.isGroupChat ? convObj.groupName : (otherParticipants[0]?.name || otherParticipants[0]?.username || 'Utilisateur'),
        lastMessage: convObj.lastMessage || '',
        lastMessageDate: convObj.lastMessageDate || convObj.createdAt,
        lastUpdated: convObj.lastMessageDate || convObj.createdAt,
        isGroup: convObj.isGroupChat,
        isRestaurant: convObj.producerType === 'restaurant',
        isLeisure: convObj.producerType === 'leisure',
        isWellness: convObj.producerType === 'wellness',
        unreadMessages: convObj.unreadCount?.get(userId) || 0,
        avatar: convObj.isGroupChat ? convObj.groupImage : (otherParticipants[0]?.profilePicture || otherParticipants[0]?.photo_url),
      };
    });
    
    res.status(200).json(simplifiedConversations);
  } catch (error) {
    console.error('❌ Erreur lors de la récupération des conversations:', error);
    res.status(500).json({ message: 'Erreur interne du serveur.' });
  }
});

/**
 * @route GET /api/conversations/:conversationId/messages
 * @desc Récupérer les messages d'une conversation
 * @access Private
 */
router.get('/:conversationId/messages', async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { userId, limit = 50, before } = req.query;
    
    if (!conversationId) {
      return res.status(400).json({ message: 'conversationId requis.' });
    }
    
    // Vérifier que la conversation existe
    const conversation = await ConversationModel.findById(conversationId);
    
    if (!conversation) {
      return res.status(404).json({ message: 'Conversation non trouvée.' });
    }
    
    // Construire la requête pour pagination
    let query = { conversationId };
    if (before) {
      query.timestamp = { $lt: new Date(before) };
    }
    
    // Récupérer les messages
    const messages = await MessageModel.find(query)
      .sort({ timestamp: -1 })
      .limit(Number(limit))
      .populate('sender', '_id name profilePicture');
    
    // Marquer les messages comme lus si userId est fourni
    if (userId) {
      await MessageModel.updateMany(
        { 
          conversationId,
          sender: { $ne: userId }, // Ne pas marquer ses propres messages
          [`isRead.${userId}`]: { $ne: true } // Seulement les messages non lus
        },
        { $set: { [`isRead.${userId}`]: true } }
      );
      
      // Mettre à jour le compteur de messages non lus
      if (conversation.unreadCount && conversation.unreadCount.has(userId)) {
        conversation.unreadCount.set(userId, 0);
        await conversation.save();
      }
    }
    
    res.status(200).json({
      messages: messages.reverse(), // Renvoyer dans l'ordre chronologique
      hasMore: messages.length === Number(limit)
    });
  } catch (error) {
    console.error('❌ Erreur lors de la récupération des messages:', error);
    res.status(500).json({ message: 'Erreur interne du serveur.' });
  }
});

/**
 * @route POST /api/conversations/:conversationId/messages
 * @desc Envoyer un message dans une conversation existante
 * @access Private
 */
router.post('/:conversationId/messages', auth, async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { senderId, content, media } = req.body;
    
    if (!senderId || !content) {
      return res.status(400).json({ message: 'senderId et content sont requis.' });
    }
    
    // Vérifier que la conversation existe
    const conversation = await ConversationModel.findById(conversationId);
    
    if (!conversation) {
      return res.status(404).json({ message: 'Conversation non trouvée.' });
    }
    
    // Vérifier que l'expéditeur fait partie de la conversation
    if (!conversation.participants.includes(senderId)) {
      return res.status(403).json({ message: 'Non autorisé à envoyer des messages dans cette conversation.' });
    }
    
    // Créer et sauvegarder le message
    const message = new MessageModel({
      conversationId,
      sender: senderId,
      content,
      timestamp: new Date(),
      attachments: media || []
    });
    
    // Initialiser isRead pour tous les participants
    conversation.participants.forEach(participantId => {
      message.isRead.set(participantId.toString(), participantId.toString() === senderId);
    });
    
    await message.save();
    
    // Mettre à jour la conversation
    conversation.lastMessage = content;
    conversation.lastMessageDate = message.timestamp;
    conversation.lastMessageSender = senderId;
    
    // Incrémenter le compteur de messages non lus pour tous les participants sauf l'expéditeur
    conversation.participants.forEach(participantId => {
      if (participantId.toString() !== senderId) {
        const currentCount = conversation.unreadCount.get(participantId.toString()) || 0;
        conversation.unreadCount.set(participantId.toString(), currentCount + 1);
      }
    });
    
    await conversation.save();
    
    // Récupérer les infos de l'expéditeur
    const sender = await User.findById(senderId).select('_id name profilePicture');
    
    const messageResponse = {
      _id: message._id,
      sender: {
        _id: sender._id,
        name: sender.name,
        profilePicture: sender.profilePicture
      },
      content: message.content,
      timestamp: message.timestamp,
      attachments: message.attachments
    };
    
    res.status(201).json(messageResponse);
  } catch (error) {
    console.error('❌ Erreur lors de l\'envoi du message:', error);
    res.status(500).json({ message: 'Erreur interne du serveur.' });
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
      const existingConversation = await ConversationModel.findOne({
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
    const conversation = new ConversationModel({
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
 * @access Private
 */
router.post('/create-group', auth, async (req, res) => {
  try {
    const { creatorId, participantIds, groupName, groupType, groupAvatar } = req.body;
    
    if (!creatorId || !participantIds || !Array.isArray(participantIds) || participantIds.length < 2 || !groupName) {
      return res.status(400).json({ 
        message: 'creatorId, groupName et au moins deux participantIds sont requis.' 
      });
    }
    
    // S'assurer que le créateur est dans les participants
    if (!participantIds.includes(creatorId)) {
      participantIds.push(creatorId);
    }
    
    // Créer le groupe
    const conversation = new ConversationModel({
      participants: participantIds,
      isGroupChat: true,
      groupName,
      groupImage: groupAvatar,
      lastMessageDate: new Date(),
      createdAt: new Date(),
      unreadCount: new Map(participantIds.map(p => [p.toString(), 0]))
    });
    
    await conversation.save();
    
    // Message de bienvenue automatique
    const message = new MessageModel({
      conversationId: conversation._id,
      sender: creatorId,
      content: `Groupe "${groupName}" créé`,
      timestamp: new Date(),
      isRead: new Map(participantIds.map(p => [p.toString(), p === creatorId]))
    });
    
    await message.save();
    
    // Mettre à jour la conversation avec le premier message
    conversation.lastMessage = message.content;
    conversation.lastMessageSender = creatorId;
    await conversation.save();
    
    res.status(201).json({
      message: 'Groupe créé avec succès',
      conversation_id: conversation._id,
      groupAvatar: conversation.groupImage
    });
  } catch (error) {
    console.error('❌ Erreur lors de la création du groupe:', error);
    res.status(500).json({ message: 'Erreur interne du serveur.' });
  }
});

module.exports = router; 
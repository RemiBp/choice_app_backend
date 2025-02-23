const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Conversation = require('../models/conversation');

const { choiceAppDb, testDb } = require('../index'); // Import des connexions

// Modèle User dans la base choice_app
const UserChoice = choiceAppDb.model(
  'User',
  new mongoose.Schema({}, { strict: false }),
  'Users'
);

// Modèle User dans la base test
const UserTest = testDb.model(
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
});

// Schéma pour une conversation
const ConversationSchema = new mongoose.Schema({
  participants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], // Référence à UserTest
  messages: [MessageSchema],
  lastUpdated: { type: Date, default: Date.now },
});

// Modèle Conversation dans la base test
const ConversationTest = testDb.model('Conversation', ConversationSchema, 'conversations');

router.get('/:conversationId/messages', async (req, res) => {
  const { conversationId } = req.params;

  try {
    // Vérification que l'ID de la conversation est valide
    if (!mongoose.Types.ObjectId.isValid(conversationId)) {
      return res.status(400).json({ message: 'ID de conversation invalide.' });
    }

    // Récupérer la conversation et les messages associés sans utiliser 'populate' sur 'senderId'
    const conversation = await ConversationTest.findById(conversationId)
      .select('messages') // Sélectionner uniquement les messages
      .exec();

    // Si la conversation n'existe pas
    if (!conversation) {
      return res.status(404).json({ message: 'Conversation non trouvée.' });
    }

    // Si la conversation n'a pas de messages ou si elle est vide
    if (!conversation.messages || conversation.messages.length === 0) {
      return res.status(200).json({ messages: [] });
    }

    // Formater les messages pour inclure 'senderId' et vérifier si le 'content' existe bien
    const formattedMessages = conversation.messages.map((message) => {
      const senderId = message.senderId ? message.senderId.toString() : ''; // Récupérer 'senderId' sous forme de chaîne
      const content = message.content || '';  // Si 'content' est vide, retournera une chaîne vide
      const timestamp = message.timestamp || ''; // Si 'timestamp' est vide, retournera une chaîne vide

      return {
        content: content,       // Le contenu du message
        senderId: senderId,     // L'ID du sender (utilisateur)
        timestamp: timestamp,   // Le timestamp du message
      };
    });

    // Envoi des messages formatés
    res.status(200).json(formattedMessages);
  } catch (error) {
    console.error('Erreur lors de la récupération des messages :', error.message);
    res.status(500).json({ message: 'Erreur interne du serveur.' });
  }
});



// Endpoint : Récupérer les conversations d'un utilisateur
router.get('/:userId/conversations', async (req, res) => {
  const { userId } = req.params;

  try {
    console.log('🔍 [DEBUG] Étape 1 : Récupérer les conversations associées à l\'utilisateur');

    // Étape 1 : Récupérer les conversations associées à l'utilisateur dans choice_app
    const user = await UserChoice.findById(userId).select('conversations');
    console.log('✅ [DEBUG] Utilisateur trouvé :', user);

    if (!user || !user.conversations || user.conversations.length === 0) {
      console.log('⚠️ [DEBUG] Aucune conversation trouvée pour cet utilisateur');
      return res.status(404).json({ message: 'Aucune conversation trouvée pour cet utilisateur.' });
    }

    console.log('📋 [DEBUG] Conversations IDs trouvés pour l\'utilisateur :', user.conversations);

    console.log('🔍 [DEBUG] Étape 2 : Récupérer les détails des conversations dans la base "test"');

    // Étape 2 : Récupérer les détails des conversations dans test
    const conversations = await ConversationTest.find({
      _id: { $in: user.conversations },
    }).sort({ lastUpdated: -1 }); // Pas de populate

    if (!conversations || conversations.length === 0) {
      console.log('⚠️ [DEBUG] Conversations non trouvées dans la base "test"');
      return res.status(404).json({ message: 'Conversations non trouvées dans la base "test".' });
    }

    console.log('✅ [DEBUG] Conversations récupérées après population :', conversations);

    // Vérifier que chaque conversation a bien des participants
    const validatedConversations = conversations.filter((conversation) => {
      if (!conversation.participants || conversation.participants.length === 0) {
        console.warn(`⚠️ [DEBUG] La conversation ${conversation._id} n'a pas de participants valides.`);
        return false;
      }
      return true;
    });
 

    // Formater les données pour inclure les participants et les derniers messages
    const formattedConversations = validatedConversations.map((conversation) => ({
      _id: conversation._id,
      participants: conversation.participants, // Retourne uniquement les ObjectId des participants
      lastMessage: conversation.messages.length > 0
        ? conversation.messages[conversation.messages.length - 1].content
        : 'Aucun message pour l\'instant',
      lastUpdated: conversation.lastUpdated,
    }));

    console.log('📤 [DEBUG] Envoi des conversations formatées au client');
    res.status(200).json(formattedConversations);
  } catch (error) {
    console.error('❌ [DEBUG] Erreur lors de la récupération des conversations :', error.message);
    res.status(500).json({ message: 'Erreur interne du serveur.', error: error.message });
  }
});


// Endpoint : Créer une conversation et envoyer un message
router.post('/new-message', async (req, res) => {
  const { senderId, recipientIds, content } = req.body;

  if (!senderId || !recipientIds || recipientIds.length === 0 || !content) {
    return res.status(400).json({
      message: 'Le senderId, au moins un recipientId, et le contenu sont obligatoires.',
    });
  }

  try {
    // Convertir tous les IDs en ObjectId
    const participants = [senderId, ...recipientIds].map((id) => mongoose.Types.ObjectId(id));

    // Vérifie si une conversation existe déjà pour ces participants
    let conversation = await ConversationTest.findOne({
      participants: { $all: participants, $size: participants.length },
    });

    // Si elle n'existe pas, créez une nouvelle conversation
    if (!conversation) {
      conversation = new ConversationTest({
        participants,
        messages: [],
        lastUpdated: Date.now(),
      });
    }

    // Ajouter un nouveau message à la conversation
    const newMessage = {
      senderId: mongoose.Types.ObjectId(senderId), // Convertir en ObjectId
      content,
      timestamp: Date.now(),
    };

    conversation.messages.push(newMessage);
    conversation.lastUpdated = Date.now();
    await conversation.save();

    // Mettre à jour les utilisateurs concernés pour inclure la conversation
    const updateUserConversations = async (userId) => {
      await UserChoice.findByIdAndUpdate(
        userId,
        { $addToSet: { conversations: conversation._id } }, // Ajoute l'ID de la conversation sans doublons
        { new: true }
      );
    };
    await Promise.all(participants.map(updateUserConversations));

    res.status(201).json({
      message: 'Message envoyé avec succès.',
      conversationId: conversation._id,
      newMessage,
    });
  } catch (error) {
    console.error(
      'Erreur lors de la création de la conversation ou de l\'envoi du message :',
      error.message
    );
    res.status(500).json({ message: 'Erreur interne du serveur.' });
  }
});



router.post('/:id/message', async (req, res) => {
  const { id } = req.params;
  const { senderId, content } = req.body;

  if (!content || !senderId) {
    return res.status(400).json({ message: 'Le contenu et le senderId sont obligatoires.' });
  }

  try {
    const conversation = await Conversation.findById(id);

    if (!conversation) {
      return res.status(404).json({ message: 'Conversation non trouvée.' });
    }

    const newMessage = {
      senderId,
      content,
      timestamp: Date.now(),
    };

    conversation.messages.push(newMessage);
    conversation.lastUpdated = Date.now();

    await conversation.save();

    res.status(201).json(newMessage);
  } catch (error) {
    console.error('Erreur lors de l\'envoi du message :', error.message);
    res.status(500).json({ message: 'Erreur interne du serveur.' });
  }
});

router.post('/check-or-create', async (req, res) => {
  const { senderId, recipientId } = req.body;

  // Vérifier que les deux IDs sont distincts
  if (senderId === recipientId) {
    return res.status(400).json({ message: 'Le senderId et le recipientId ne peuvent pas être identiques.' });
  }

  // Logique existante pour vérifier ou créer la conversation
  try {
    let conversation = await ConversationTest.findOne({
      participants: { $all: [senderId, recipientId], $size: 2 },
    });

    // Si aucune conversation n'existe, en créer une nouvelle
    if (!conversation) {
      conversation = new ConversationTest({
        participants: [senderId, recipientId],
        messages: [],
        lastUpdated: Date.now(),
      });
      await conversation.save();
    }

    res.status(201).json({
      conversationId: conversation._id,
      recipientName: 'Nom du destinataire', // Ajoute ici la logique pour récupérer le nom du destinataire
      recipientPhoto: 'URL de l\'image', // Ajoute ici la logique pour récupérer l'image du destinataire
    });
  } catch (error) {
    console.error('Erreur lors de la création de la conversation :', error.message);
    res.status(500).json({ message: 'Erreur interne du serveur.' });
  }
});




module.exports = router; 
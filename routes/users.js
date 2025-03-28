const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Conversation = require('../models/conversation'); // Import du modèle Conversation


// Connexion à la base `choice_app`
const usersDbChoice = mongoose.createConnection(process.env.MONGO_URI, {
  dbName: 'choice_app',
});

// Modèle pour la collection Users
const UserChoice = usersDbChoice.model(
  'User',
  new mongoose.Schema({}, { strict: false }),
  'Users' // Collection des utilisateurs dans choice_app
);

// Modèle pour les posts (si nécessaire)
const PostChoice = usersDbChoice.model(
  'Post',
  new mongoose.Schema({}, { strict: false }),
  'Posts'
);

// Endpoint : Rechercher des utilisateurs par mot-clé ou ID
router.get('/search', async (req, res) => {
  const { query, id } = req.query;

  try {
    // Si une recherche par mot-clé est effectuée
    if (query && query.trim() !== '') {
      console.log('🔍 Recherche pour le mot-clé :', query);

      const users = await UserChoice.find({
        name: { $regex: query, $options: 'i' }, // Recherche insensible à la casse
      }).select('name profilePicture email followers_count');

      console.log(`🔍 ${users.length} utilisateur(s) trouvé(s)`);

      if (users.length === 0) {
        return res.status(404).json({ message: 'Aucun utilisateur trouvé.' });
      }

      return res.status(200).json(users);
    }

    // Si une recherche par ID est effectuée
    if (id) {
      if (!mongoose.isValidObjectId(id)) {
        return res.status(400).json({ message: 'ID invalide.' });
      }

      const user = await UserChoice.findById(id).select(
        'name profilePicture email followers_count posts'
      );
      if (!user) {
        return res.status(404).json({ message: 'Utilisateur non trouvé.' });
      }

      return res.status(200).json(user);
    }

    // Si aucun paramètre n'est fourni
    return res
      .status(400)
      .json({ message: 'Veuillez fournir un mot-clé ou un ID pour la recherche.' });
  } catch (error) {
    console.error('❌ Erreur lors de la recherche des utilisateurs :', error.message);
    return res.status(500).json({ message: 'Erreur serveur.' });
  }
});

// Endpoint : Récupérer un utilisateur spécifique par ID
router.get('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: 'ID invalide.' });
    }

    const user = await UserChoice.findById(id);
    if (!user) return res.status(404).json({ message: 'Utilisateur non trouvé.' });

    res.status(200).json(user);
  } catch (error) {
    console.error('❌ Erreur lors de la récupération de l\'utilisateur :', error.message);
    res.status(500).json({ message: 'Erreur serveur.' });
  }
});

// Endpoint : Récupérer les posts d'un utilisateur
router.get('/:id/posts', async (req, res) => {
  const { id } = req.params;

  try {
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: 'ID invalide.' });
    }

    const user = await UserChoice.findById(id);
    if (!user) return res.status(404).json({ message: 'Utilisateur non trouvé.' });

    const postIds = user.posts || [];
    const posts = await PostChoice.find({ _id: { $in: postIds } });

    res.status(200).json(posts);
  } catch (error) {
    console.error('❌ Erreur lors de la récupération des posts de l\'utilisateur :', error.message);
    res.status(500).json({ message: 'Erreur serveur.' });
  }
});

// Endpoint : Ajouter un nouvel utilisateur
router.post('/', async (req, res) => {
  const newUser = new UserChoice(req.body);
  try {
    const savedUser = await newUser.save();
    res.status(201).json(savedUser);
  } catch (error) {
    console.error('❌ Erreur lors de la création de l\'utilisateur :', error.message);
    res.status(500).json({ message: 'Erreur serveur.' });
  }
});

// Endpoint : Mettre à jour un utilisateur par ID
router.put('/:id', async (req, res) => {
  try {
    const updatedUser = await UserChoice.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
    });
    if (!updatedUser) {
      return res.status(404).json({ message: 'Utilisateur non trouvé.' });
    }
    res.status(200).json(updatedUser);
  } catch (error) {
    console.error('❌ Erreur lors de la mise à jour de l\'utilisateur :', error.message);
    res.status(500).json({ message: 'Erreur serveur.' });
  }
});

// Endpoint : Supprimer un utilisateur par ID
router.delete('/:id', async (req, res) => {
  try {
    const deletedUser = await UserChoice.findByIdAndDelete(req.params.id);
    if (!deletedUser) {
      return res.status(404).json({ message: 'Utilisateur non trouvé.' });
    }
    res.status(200).json({ message: 'Utilisateur supprimé avec succès.' });
  } catch (error) {
    console.error('❌ Erreur lors de la suppression de l\'utilisateur :', error.message);
    res.status(500).json({ message: 'Erreur serveur.' });
  }
});

// Endpoint : Créer une nouvelle conversation
router.post('/conversations', async (req, res) => {
  const { participantIds } = req.body;

  if (!participantIds || participantIds.length < 2) {
    return res.status(400).json({ message: 'Deux participants minimum sont nécessaires.' });
  }

  try {
    // Vérifie si la conversation existe déjà
    let conversation = await Conversation.findOne({
      participants: { $all: participantIds, $size: participantIds.length },
    });

    if (!conversation) {
      // Crée une nouvelle conversation
      conversation = new Conversation({ participants: participantIds });
      await conversation.save();
    }

    res.status(201).json(conversation);
  } catch (error) {
    console.error('Erreur lors de la création de la conversation :', error.message);
    res.status(500).json({ message: 'Erreur serveur.' });
  }
});

router.get('/:id/conversations', async (req, res) => {
  const { id } = req.params;

  try {
    // Récupère les IDs de conversation dans l'utilisateur
    const user = await UserChoice.findById(id).select('conversations');

    if (!user || !user.conversations || user.conversations.length === 0) {
      return res.status(404).json({ message: 'Aucune conversation trouvée pour cet utilisateur.' });
    }

    // Récupère les détails des conversations dans la collection `conversations`
    const conversations = await Conversation.find({ _id: { $in: user.conversations } })
      .populate({ path: 'participants', model: UserChoice, select: 'name profilePicture' })
      .sort({ lastUpdated: -1 });

    // Filtrer les conversations valides
    const validConversations = conversations.filter((conv) => conv.participants.length > 0);

    if (validConversations.length === 0) {
      return res.status(404).json({ message: 'Aucune conversation valide trouvée.' });
    }

    res.status(200).json(validConversations);
  } catch (error) {
    console.error('Erreur lors de la récupération des conversations :', error.message);
    res.status(500).json({ message: 'Erreur interne du serveur.' });
  }
});




router.post('/conversations/:id/messages', async (req, res) => {
  const { id } = req.params; // ID de la conversation
  const { senderId, content } = req.body; // Contenu et expéditeur

  if (!content || !senderId) {
    return res.status(400).json({ message: 'Le contenu et le senderId sont obligatoires.' });
  }

  try {
    let conversation = await Conversation.findById(id);

    // Si la conversation n'existe pas, la créer
    if (!conversation) {
      console.log(`Conversation ID ${id} non trouvée. Création automatique.`);
      conversation = new Conversation({
        _id: id, // Assurez-vous que cet ID correspond au format attendu
        participants: [senderId], // Initialise avec le participant qui envoie le message
        messages: [], // Initialiser avec un tableau vide de messages
        lastUpdated: Date.now(),
      });
    }

    // Vérifie si l'expéditeur est un participant
    if (!conversation.participants.includes(senderId)) {
      conversation.participants.push(senderId); // Ajouter le participant à la liste
    }

    // Ajoute le message à la conversation
    const newMessage = { senderId, content, timestamp: Date.now() };
    conversation.messages.push(newMessage);
    conversation.lastUpdated = Date.now();

    // Sauvegarde la conversation
    await conversation.save();
    console.log('Message ajouté avec succès à la conversation:', newMessage);

    res.status(201).json(newMessage);
  } catch (error) {
    console.error('Erreur lors de l\'envoi du message :', error.message);
    res.status(500).json({ message: 'Erreur serveur.' });
  }
});

// Endpoint : Récupérer les messages d'une conversation
router.get('/conversations/:id/messages', async (req, res) => {
  const { id } = req.params;

  try {
    const conversation = await Conversation.findById(id).populate('messages.senderId', 'name profilePicture');

    if (!conversation) {
      return res.status(404).json({ message: 'Conversation non trouvée.' });
    }

    res.status(200).json(conversation.messages);
  } catch (error) {
    console.error('Erreur lors de la récupération des messages :', error.message);
    res.status(500).json({ message: 'Erreur serveur.' });
  }
});

// Endpoint : Créer une conversation et envoyer un message si elle n'existe pas
router.post('/conversations/new-message', async (req, res) => {
  const { senderId, recipientIds, content } = req.body;

  if (!senderId || !recipientIds || recipientIds.length === 0 || !content) {
    return res.status(400).json({
      message: 'Le senderId, au moins un recipientId, et le contenu sont obligatoires.',
    });
  }

  try {
    // Combine senderId et recipientIds pour créer la liste des participants
    const participants = [senderId, ...recipientIds];

    // Vérifie si une conversation existe déjà pour ces participants
    let conversation = await Conversation.findOne({
      participants: { $all: participants, $size: participants.length },
    });

    // Si elle n'existe pas, la créer
    if (!conversation) {
      conversation = new Conversation({
        participants,
        messages: [],
        lastUpdated: Date.now(),
      });
    }

    // Ajouter le message initial
    const newMessage = {
      senderId,
      content,
      timestamp: Date.now(),
    };

    conversation.messages.push(newMessage);
    conversation.lastUpdated = Date.now();

    // Sauvegarde de la conversation
    await conversation.save();

    // Mettre à jour le champ `conversations` des utilisateurs concernés
    const updateUserConversations = async (userId) => {
      await UserChoice.findByIdAndUpdate(
        userId,
        { $addToSet: { conversations: conversation._id } }, // $addToSet évite les doublons
        { new: true }
      );
    };

    await Promise.all(participants.map((userId) => updateUserConversations(userId)));

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
    res.status(500).json({ message: 'Erreur serveur.' });
  }
});

module.exports = router;

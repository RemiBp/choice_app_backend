const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const conversationModule = require('../models/conversation'); // Import du module conversation
const userController = require('../controllers/userController');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { createModel, databases } = require('../utils/modelCreator');
const UserChoice = require('../models/User').UserChoice; // Ensure UserChoice is correctly imported
const Follow = require('../models/Follow'); // Import the new Follow model

// Modèles créés avec l'utilitaire createModel
const PostChoice = createModel(
  databases.CHOICE_APP,
  'Post',
  'Posts'
);

// Modèle pour les conversations
const ConversationModel = createModel(
  databases.CHOICE_APP,
  'Conversation',
  'conversations',
  conversationModule.ConversationSchema
);

// Middleware pour vérifier le token JWT
const auth = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) {
      console.log('❌ Authentification requise: aucun token fourni');
      return res.status(401).json({ error: 'Authentification requise' });
    }
    
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_jwt_secret');
      req.user = { id: decoded.id };
      console.log(`✅ Token valide pour l'utilisateur: ${decoded.id}`);
      next();
    } catch (jwtError) {
      console.log(`❌ Token JWT invalide: ${jwtError.message}`);
      res.status(401).json({ error: 'Token invalide' });
    }
  } catch (error) {
    console.log(`❌ Erreur dans le middleware auth: ${error.message}`);
    res.status(500).json({ error: 'Erreur serveur dans le middleware d\'authentification' });
  }
};

// GET /api/users/check-following/:id - Vérifier si l'utilisateur courant suit un autre utilisateur
router.get('/check-following/:id', auth, async (req, res) => {
  try {
    console.log('🔍 Vérification si l\'utilisateur suit un autre utilisateur');
    console.log(`👤 ID utilisateur courant: ${req.user.id}`);
    console.log(`👥 ID utilisateur cible: ${req.params.id}`);
    
    const targetUserId = req.params.id;
    const currentUserId = req.user.id;
    
    // Validation basique des IDs
    if (!mongoose.isValidObjectId(currentUserId)) {
      console.log(`❌ ID utilisateur courant invalide: ${currentUserId}`);
      return res.status(400).json({ 
        error: 'ID utilisateur courant invalide',
        isFollowing: false 
      });
    }
    
    if (!mongoose.isValidObjectId(targetUserId)) {
      console.log(`❌ ID utilisateur cible invalide: ${targetUserId}`);
      return res.status(400).json({ 
        error: 'ID utilisateur cible invalide',
        isFollowing: false 
      });
    }
    
    // Si l'utilisateur essaie de vérifier s'il se suit lui-même
    if (currentUserId === targetUserId) {
      console.log('⚠️ L\'utilisateur vérifie s\'il se suit lui-même, retourne false');
      return res.status(200).json({ isFollowing: false });
    }
    
    // Obtenir l'utilisateur courant avec sa liste de "following"
    const currentUser = await UserChoice.findById(currentUserId);
    if (!currentUser) {
      console.log(`❌ Utilisateur courant non trouvé: ${currentUserId}`);
      return res.status(404).json({ 
        error: 'Utilisateur courant non trouvé',
        isFollowing: false
      });
    }
    
    // Vérifier si l'utilisateur cible existe
    const targetUser = await UserChoice.findById(targetUserId);
    if (!targetUser) {
      console.log(`❌ Utilisateur cible non trouvé: ${targetUserId}`);
      return res.status(200).json({ 
        error: 'Utilisateur cible non trouvé',
        isFollowing: false
      });
    }
    
    // S'assurer que l'array following existe
    if (!currentUser.following) {
      currentUser.following = [];
      await currentUser.save();
      console.log('ℹ️ Array following créé pour l\'utilisateur courant');
    }
    
    // Vérifier si l'utilisateur cible est dans la liste des following
    console.log(`🔎 Vérification dans la liste de following (${currentUser.following.length} éléments)`);
    
    const isFollowing = currentUser.following.some(id => id.toString() === targetUserId);
    
    console.log(`✅ Résultat: isFollowing = ${Boolean(isFollowing)}`);
    res.status(200).json({ isFollowing: Boolean(isFollowing) });
  } catch (error) {
    console.error('❌ Erreur lors de la vérification du statut de suivi:', error.message);
    res.status(500).json({ 
      error: 'Erreur serveur lors de la vérification du statut de suivi',
      isFollowing: false
    });
  }
});

/**
 * Routes pour les utilisateurs
 */

// GET /api/users - Obtenir tous les utilisateurs
router.get('/', userController.getAllUsers);

// GET /api/users/search - Rechercher des utilisateurs par mot-clé ou ID
// Cette route doit être placée AVANT les routes avec des paramètres dynamiques comme :id
router.get('/search', async (req, res) => {
  const { query, id } = req.query;

  try {
    // Si une recherche par mot-clé est effectuée
    if (query && query.trim() !== '') {
      console.log('🔍 Recherche pour le mot-clé :', query);

      const users = await UserChoice.find({
        name: { $regex: query, $options: 'i' }, // Recherche insensible à la casse
      }).select('name profilePicture photo_url email followers_count');

      console.log(`🔍 ${users.length} utilisateur(s) trouvé(s)`);

      if (users.length === 0) {
        return res.status(404).json({ message: 'Aucun utilisateur trouvé.' });
      }

      return res.status(200).json(normalizeUsers(users));
    }

    // Si une recherche par ID est effectuée
    if (id) {
      if (!mongoose.isValidObjectId(id)) {
        return res.status(400).json({ message: 'ID invalide.' });
      }

      const user = await UserChoice.findById(id).select(
        'name profilePicture photo_url email followers_count posts'
      );
      if (!user) {
        return res.status(404).json({ message: 'Utilisateur non trouvé.' });
      }

      return res.status(200).json(normalizeUser(user));
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

// GET /api/users/profile - Obtenir le profil de l'utilisateur connecté
router.get('/profile', auth, async (req, res) => {
  try {
    console.log(`🔍 Récupération du profil utilisateur: ${req.user.id}`);
    
    if (!mongoose.isValidObjectId(req.user.id)) {
      console.log(`❌ ID utilisateur invalide dans le token: ${req.user.id}`);
      return res.status(400).json({ error: 'ID utilisateur invalide' });
    }
    
    const user = await UserChoice.findById(req.user.id).select('-password');
    
    if (!user) {
      console.log(`❌ Utilisateur non trouvé pour l'ID: ${req.user.id}`);
      return res.status(404).json({ error: 'Utilisateur non trouvé' });
    }
    
    console.log(`✅ Profil récupéré pour l'utilisateur: ${user.name || user.username || user._id}`);
    
    // Normaliser la réponse
    const userResponse = normalizeUser(user);
    
    res.status(200).json(userResponse);
  } catch (error) {
    console.error('❌ Erreur de récupération de profil:', error.message);
    res.status(500).json({ error: 'Erreur lors de la récupération du profil' });
  }
});

// PUT /api/users/profile - Mettre à jour le profil de l'utilisateur connecté
router.put('/profile', auth, async (req, res) => {
  try {
    const updates = req.body;
    
    // Empêcher la mise à jour du mot de passe ou de l'email par cette route
    delete updates.password;
    delete updates.email;
    
    const user = await UserChoice.findByIdAndUpdate(
      req.user.id,
      { $set: updates },
      { new: true, runValidators: true }
    ).select('-password');
    
    if (!user) {
      return res.status(404).json({ error: 'Utilisateur non trouvé' });
    }
    
    res.status(200).json(user);
  } catch (error) {
    console.error('Erreur de mise à jour de profil:', error);
    res.status(500).json({ error: 'Erreur lors de la mise à jour du profil' });
  }
});

// GET /api/users/:id/posts - Récupérer les posts d'un utilisateur
router.get('/:id/posts', async (req, res) => {
  const { id } = req.params;

  try {
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: 'ID invalide.' });
    }

    const user = await UserChoice.findById(id);
    if (!user) return res.status(404).json({ message: 'Utilisateur non trouvé.' });

    // Vérifier si l'utilisateur a des posts
    const postIds = user.posts || [];
    
    // Si aucun post, retourner un tableau vide
    if (postIds.length === 0) {
      return res.status(200).json({ posts: [] });
    }
    
    // Convertir tous les IDs en ObjectID pour la requête
    const objectIdPostIds = postIds.map(pid => 
      mongoose.Types.ObjectId.isValid(pid) ? new mongoose.Types.ObjectId(pid) : pid
    );
    
    const posts = await PostChoice.find({ 
      _id: { $in: objectIdPostIds } 
    });

    // Normaliser les posts (convertir _id en string)
    const normalizedPosts = posts.map(post => {
      const postData = post.toObject ? post.toObject() : { ...post };
      if (postData._id) postData._id = postData._id.toString();
      
      // Convertir les autres IDs en string si nécessaire
      if (postData.userId) postData.userId = postData.userId.toString();
      
      return postData;
    });

    res.status(200).json({ posts: normalizedPosts });
  } catch (error) {
    console.error('❌ Erreur lors de la récupération des posts de l\'utilisateur :', error.message);
    res.status(500).json({ message: 'Erreur serveur.' });
  }
});

// GET /api/users/:id/favorites - Obtenir les favoris d'un utilisateur
router.get('/:id/favorites', userController.getUserFavorites);

// GET /api/users/:id/profile - Obtenir le profil d'un utilisateur
router.get('/:id/profile', userController.getUserProfile);

// GET /api/users/:userId/info - Obtenir les informations d'un utilisateur
router.get('/:userId/info', async (req, res) => {
  try {
    const { userId } = req.params;
    
    if (!mongoose.isValidObjectId(userId)) {
      return res.status(400).json({ error: 'ID utilisateur invalide' });
    }
    
    const user = await UserChoice.findById(userId).select('-password');
    
    if (!user) {
      return res.status(404).json({ error: 'Utilisateur non trouvé' });
    }
    
    // Normaliser la réponse pour le frontend
    const userInfo = {
      _id: user._id.toString(),
      id: user._id.toString(),
      name: user.name || user.username || 'Utilisateur',
      username: user.username,
      email: user.email,
      profilePicture: user.profilePicture || user.photo_url || 'https://via.placeholder.com/150',
      avatar: user.profilePicture || user.photo_url || 'https://via.placeholder.com/150',
      bio: user.bio || '',
      isOnline: user.isOnline || false,
      followers_count: user.followers ? user.followers.length : 0,
      following_count: user.following ? user.following.length : 0,
      type: 'user'
    };
    
    res.status(200).json(userInfo);
  } catch (error) {
    console.error('Erreur lors de la récupération des informations de l\'utilisateur:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// PUT /api/users/:id - Mettre à jour un utilisateur
router.put('/:id', userController.updateUser);

// PUT /api/users/:id/password - Mettre à jour le mot de passe d'un utilisateur
router.put('/:id/password', userController.updatePassword);

// DELETE /api/users/:id - Supprimer un utilisateur
router.delete('/:id', userController.deleteUser);

// POST /api/users/:userId/follow - Suivre un utilisateur ou un producteur (API générale)
router.post('/:userId/follow', userController.follow);

// DELETE /api/users/:userId/follow - Ne plus suivre un utilisateur ou un producteur (ancienne méthode)
router.delete('/:userId/follow', userController.unfollow);

// POST /api/users/follow/:id - Suivre un utilisateur (pour myprofile_screen.dart)
router.post('/follow/:id', auth, async (req, res) => {
  try {
    const currentUserId = req.user.id;
    const targetUserId = req.params.id;

    if (currentUserId === targetUserId) {
      return res.status(400).json({ 
        error: 'Vous ne pouvez pas vous suivre vous-même',
        isFollowing: false
      });
    }

    // Validate IDs
    if (!mongoose.isValidObjectId(currentUserId) || !mongoose.isValidObjectId(targetUserId)) {
      return res.status(400).json({ error: 'ID utilisateur invalide' });
    }

    // Check if users exist (optional, findByIdOrCreate handles this implicitly)
    const [currentUserExists, targetUserExists] = await Promise.all([
      UserChoice.findById(currentUserId).select('_id'),
      UserChoice.findById(targetUserId).select('_id')
    ]);

    if (!currentUserExists || !targetUserExists) {
      return res.status(404).json({ error: 'Utilisateur non trouvé' });
    }

    // Check if already following using the Follow collection
    const existingFollow = await Follow.findOne({
      followerId: currentUserId,
      followingId: targetUserId
    });

    if (existingFollow) {
      // Optionally get the current follower count
      const followerCount = await Follow.countDocuments({ followingId: targetUserId });
      return res.status(200).json({
        message: 'Vous suivez déjà cet utilisateur',
        isFollowing: true,
        followers_count: followerCount // Use count from Follow collection
      });
    }

    // Create the follow relationship
    const newFollow = new Follow({
      followerId: currentUserId,
      followerType: 'User',
      followingId: targetUserId,
      followingType: 'User'
    });
    await newFollow.save();

    // Optionally get the new follower count
    const followerCount = await Follow.countDocuments({ followingId: targetUserId });

    res.status(200).json({
      message: 'Vous suivez désormais cet utilisateur',
      isFollowing: true,
      followers_count: followerCount // Use count from Follow collection
    });
  } catch (error) {
    // Handle potential duplicate key error if the index prevents duplicates
    if (error.code === 11000) { 
        const followerCount = await Follow.countDocuments({ followingId: req.params.id });
        return res.status(200).json({
            message: 'Vous suivez déjà cet utilisateur (concurrent request)',
            isFollowing: true,
            followers_count: followerCount
        });
    }
    console.error('❌ Erreur lors du suivi de l\'utilisateur:', error.message);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// POST /api/users/unfollow/:id - Ne plus suivre un utilisateur (pour myprofile_screen.dart)
router.post('/unfollow/:id', auth, async (req, res) => {
  try {
    const currentUserId = req.user.id;
    const targetUserId = req.params.id;

    if (currentUserId === targetUserId) {
      return res.status(400).json({ 
        error: 'Vous ne pouvez pas vous désabonner de vous-même',
        isFollowing: false
      });
    }

    // Validate IDs
    if (!mongoose.isValidObjectId(currentUserId) || !mongoose.isValidObjectId(targetUserId)) {
      return res.status(400).json({ error: 'ID utilisateur invalide' });
    }

    // Attempt to delete the follow relationship
    const deleteResult = await Follow.deleteOne({
      followerId: currentUserId,
      followingId: targetUserId
    });

    // Check if a document was actually deleted
    if (deleteResult.deletedCount === 0) {
      const followerCount = await Follow.countDocuments({ followingId: targetUserId });
      return res.status(200).json({
        message: 'Vous ne suivez pas cet utilisateur',
        isFollowing: false,
        followers_count: followerCount // Use count from Follow collection
      });
    }

    // Optionally get the new follower count
    const followerCount = await Follow.countDocuments({ followingId: targetUserId });

    res.status(200).json({
      message: 'Vous ne suivez plus cet utilisateur',
      isFollowing: false,
      followers_count: followerCount // Use count from Follow collection
    });
  } catch (error) {
    console.error('❌ Erreur lors du désabonnement de l\'utilisateur:', error.message);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// GET /api/users/:id - Obtenir un utilisateur par ID
// CETTE ROUTE DOIT ÊTRE EN DERNIER pour éviter les conflits avec d'autres routes comme /search, /profile, etc.
router.get('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: 'ID invalide.' });
    }

    const user = await UserChoice.findById(id);
    if (!user) return res.status(404).json({ message: 'Utilisateur non trouvé.' });

    res.status(200).json(normalizeUser(user));
  } catch (error) {
    console.error('❌ Erreur lors de la récupération de l\'utilisateur :', error.message);
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
    // Normaliser les IDs de participants (assurer qu'ils sont valides)
    const validParticipantIds = participantIds.filter(id => mongoose.isValidObjectId(id));
    
    if (validParticipantIds.length < 2) {
      return res.status(400).json({ message: 'Au moins deux IDs de participants valides sont nécessaires.' });
    }
    
    // Vérifie si la conversation existe déjà
    let conversation = await ConversationModel.findOne({
      participants: { $all: validParticipantIds, $size: validParticipantIds.length },
    });

    if (!conversation) {
      // Crée une nouvelle conversation
      conversation = new ConversationModel({ 
        participants: validParticipantIds,
        createdAt: new Date(),
        lastMessageDate: new Date()
      });
      await conversation.save();
      
      // Mettre à jour les utilisateurs pour inclure cette conversation
      for (const userId of validParticipantIds) {
        await UserChoice.findByIdAndUpdate(
          userId,
          { $addToSet: { conversations: conversation._id } },
          { new: true }
        );
      }
      
      console.log(`✅ Conversation créée avec ID: ${conversation._id}`);
    } else {
      console.log(`✅ Conversation existante trouvée avec ID: ${conversation._id}`);
    }

    // Renvoyer l'ID de conversation dans un format compatible avec le frontend
    res.status(201).json({ 
      success: true,
      conversationId: conversation._id.toString(),
      _id: conversation._id.toString(),
      participants: conversation.participants.map(p => p.toString())
    });
  } catch (error) {
    console.error('Erreur lors de la création de la conversation :', error);
    res.status(500).json({ message: 'Erreur serveur.' });
  }
});

router.get('/:id/conversations', async (req, res) => {
  const { id } = req.params;

  try {
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: 'ID utilisateur invalide.' });
    }
    
    // Récupère l'utilisateur
    const user = await UserChoice.findById(id);
    
    if (!user) {
      return res.status(404).json({ message: 'Utilisateur non trouvé.' });
    }
    
    // Vérifier si l'utilisateur a des conversations
    if (!user.conversations || user.conversations.length === 0) {
      return res.status(200).json([]);  // Retourner un tableau vide plutôt qu'une erreur
    }
    
    // Convertir les IDs de conversation en ObjectIDs valides
    const validConversationIds = user.conversations
      .filter(convId => mongoose.isValidObjectId(convId))
      .map(convId => new mongoose.Types.ObjectId(convId));
    
    if (validConversationIds.length === 0) {
      return res.status(200).json([]);
    }

    // Récupérer les conversations
    const conversations = await ConversationModel.find({ 
      _id: { $in: validConversationIds } 
    });
    
    // Récupérer les informations des participants
    const populatedConversations = [];
    
    for (const conv of conversations) {
      const participantIds = conv.participants || [];
      const participants = await UserChoice.find({
        _id: { $in: participantIds }
      }).select('name profilePicture photo_url');
      
      // Normaliser les participants
      const normalizedParticipants = participants.map(p => {
        const participant = p.toObject ? p.toObject() : { ...p };
        if (participant._id) participant._id = participant._id.toString();
        if (participant.photo_url && !participant.profilePicture) {
          participant.profilePicture = participant.photo_url;
        }
        return participant;
      });
      
      // Normaliser la conversation
      const convData = conv.toObject ? conv.toObject() : { ...conv };
      convData._id = convData._id.toString();
      convData.participants = normalizedParticipants;
      
      populatedConversations.push(convData);
    }

    // Trier par date de dernière mise à jour
    populatedConversations.sort((a, b) => {
      const dateA = a.lastUpdated || a.lastMessageDate || a.createdAt || 0;
      const dateB = b.lastUpdated || b.lastMessageDate || b.createdAt || 0;
      return new Date(dateB) - new Date(dateA);
    });

    res.status(200).json(populatedConversations);
  } catch (error) {
    console.error('❌ Erreur lors de la récupération des conversations :', error.message);
    res.status(500).json({ message: 'Erreur serveur.' });
  }
});

router.post('/conversations/:id/messages', async (req, res) => {
  const { id } = req.params; // ID de la conversation
  const { senderId, content } = req.body; // Contenu et expéditeur

  if (!content) {
    return res.status(400).json({ message: 'Le contenu du message est obligatoire.' });
  }
  
  if (!senderId || !mongoose.isValidObjectId(senderId)) {
    return res.status(400).json({ message: 'Un ID d\'expéditeur valide est obligatoire.' });
  }

  try {
    let conversation;
    
    // Si l'ID de conversation est valide, essayer de trouver la conversation
    if (mongoose.isValidObjectId(id)) {
      conversation = await ConversationModel.findById(id);
    }

    // Si la conversation n'existe pas, la créer
    if (!conversation) {
      console.log(`Conversation ID ${id} non trouvée. Création automatique.`);
      conversation = new ConversationModel({
        _id: mongoose.isValidObjectId(id) ? id : new mongoose.Types.ObjectId(),
        participants: [senderId],
        messages: [],
        lastUpdated: Date.now(),
      });
    }

    // Vérifie si l'expéditeur est un participant
    if (!conversation.participants.some(p => p.toString() === senderId.toString())) {
      conversation.participants.push(senderId);
    }

    // Ajoute le message à la conversation
    const newMessage = { 
      senderId, 
      content, 
      timestamp: Date.now(),
      _id: new mongoose.Types.ObjectId() // Ajouter un _id unique pour le message
    };
    
    conversation.messages = conversation.messages || [];
    conversation.messages.push(newMessage);
    conversation.lastUpdated = Date.now();

    // Sauvegarde la conversation
    await conversation.save();
    console.log('Message ajouté avec succès à la conversation:', newMessage);

    // Mettre à jour l'utilisateur si la conversation est nouvelle
    const sender = await UserChoice.findById(senderId);
    if (sender && (!sender.conversations || !sender.conversations.includes(conversation._id))) {
      sender.conversations = sender.conversations || [];
      sender.conversations.push(conversation._id);
      await sender.save();
    }

    // Normaliser le message pour la réponse
    const normalizedMessage = {
      ...newMessage,
      _id: newMessage._id.toString(),
      senderId: newMessage.senderId.toString()
    };

    res.status(201).json(normalizedMessage);
  } catch (error) {
    console.error('❌ Erreur lors de l\'envoi du message :', error.message);
    res.status(500).json({ message: 'Erreur serveur.' });
  }
});

// Endpoint : Récupérer les messages d'une conversation
router.get('/conversations/:id/messages', async (req, res) => {
  const { id } = req.params;

  if (!mongoose.isValidObjectId(id)) {
    return res.status(400).json({ message: 'ID de conversation invalide.' });
  }

  try {
    const conversation = await ConversationModel.findById(id);

    if (!conversation) {
      return res.status(404).json({ message: 'Conversation non trouvée.' });
    }

    // Si pas de messages, retourner un tableau vide
    if (!conversation.messages || conversation.messages.length === 0) {
      return res.status(200).json([]);
    }

    // Récupérer les informations des expéditeurs
    const senderIds = [...new Set(conversation.messages.map(m => m.senderId))];
    const senders = await UserChoice.find({
      _id: { $in: senderIds }
    }).select('_id name profilePicture photo_url');

    // Créer un map pour un accès facile
    const sendersMap = {};
    senders.forEach(sender => {
      sendersMap[sender._id.toString()] = normalizeUser(sender);
    });

    // Normaliser les messages
    const normalizedMessages = conversation.messages.map(msg => {
      const message = msg.toObject ? msg.toObject() : { ...msg };
      
      // Normaliser les IDs
      if (message._id) message._id = message._id.toString();
      if (message.senderId) {
        const senderIdStr = message.senderId.toString();
        message.senderId = senderIdStr;
        message.sender = sendersMap[senderIdStr] || null;
      }
      
      return message;
    });

    res.status(200).json(normalizedMessages);
  } catch (error) {
    console.error('❌ Erreur lors de la récupération des messages :', error.message);
    res.status(500).json({ message: 'Erreur serveur.' });
  }
});

// Endpoint : Créer une conversation et envoyer un message si elle n'existe pas
router.post('/conversations/new-message', async (req, res) => {
  const { senderId, recipientIds, content } = req.body;

  if (!senderId || !mongoose.isValidObjectId(senderId)) {
    return res.status(400).json({ message: 'ID d\'expéditeur valide obligatoire.' });
  }

  if (!recipientIds || !Array.isArray(recipientIds) || recipientIds.length === 0) {
    return res.status(400).json({ message: 'Au moins un ID de destinataire est obligatoire.' });
  }

  if (!content) {
    return res.status(400).json({ message: 'Le contenu du message est obligatoire.' });
  }

  try {
    // Filtrer les IDs valides
    const validRecipientIds = recipientIds.filter(id => mongoose.isValidObjectId(id));
    
    if (validRecipientIds.length === 0) {
      return res.status(400).json({ message: 'Aucun ID de destinataire valide fourni.' });
    }
    
    // Combine senderId et recipientIds pour créer la liste des participants
    const participants = [senderId, ...validRecipientIds];
    const uniqueParticipants = [...new Set(participants)];

    // Vérifie si une conversation existe déjà pour ces participants
    let conversation = await ConversationModel.findOne({
      participants: { $all: uniqueParticipants, $size: uniqueParticipants.length },
    });

    // Si elle n'existe pas, la créer
    if (!conversation) {
      conversation = new ConversationModel({
        participants: uniqueParticipants,
        messages: [],
        lastUpdated: Date.now(),
      });
    }

    // Ajouter le message initial
    const newMessage = {
      _id: new mongoose.Types.ObjectId(),
      senderId,
      content,
      timestamp: Date.now(),
    };

    conversation.messages = conversation.messages || [];
    conversation.messages.push(newMessage);
    conversation.lastUpdated = Date.now();

    // Sauvegarde de la conversation
    await conversation.save();

    // Mettre à jour le champ `conversations` des utilisateurs concernés
    const updateUserConversations = async (userId) => {
      try {
        await UserChoice.findByIdAndUpdate(
          userId,
          { $addToSet: { conversations: conversation._id } }, // $addToSet évite les doublons
          { new: true }
        );
      } catch (err) {
        console.error(`Erreur lors de la mise à jour de l'utilisateur ${userId}:`, err.message);
      }
    };

    await Promise.all(uniqueParticipants.map((userId) => updateUserConversations(userId)));

    // Normaliser les données de la réponse
    const normalizedConversation = {
      _id: conversation._id.toString(),
      participants: conversation.participants.map(p => p.toString()),
      lastUpdated: conversation.lastUpdated
    };

    const normalizedMessage = {
      _id: newMessage._id.toString(),
      senderId: newMessage.senderId.toString(),
      content: newMessage.content,
      timestamp: newMessage.timestamp
    };

    res.status(201).json({
      success: true,
      message: 'Message envoyé avec succès.',
      conversation: normalizedConversation,
      conversationId: conversation._id.toString(),
      newMessage: normalizedMessage
    });
  } catch (error) {
    console.error(
      '❌ Erreur lors de la création de la conversation ou de l\'envoi du message :',
      error.message
    );
    res.status(500).json({ message: 'Erreur serveur.' });
  }
});

// Inscription utilisateur
router.post('/register', async (req, res) => {
  try {
    const { name, email, username, password } = req.body;
    
    // Vérification si l'email existe déjà
    const emailExists = await UserChoice.findOne({ email });
    if (emailExists) {
      return res.status(400).json({ error: 'Email déjà utilisé' });
    }
    
    // Vérification si le nom d'utilisateur existe déjà
    const usernameExists = await UserChoice.findOne({ username });
    if (usernameExists) {
      return res.status(400).json({ error: 'Nom d\'utilisateur déjà utilisé' });
    }
    
    // Hashage du mot de passe
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    
    // Création du nouvel utilisateur
    const user = new UserChoice({
      name,
      email,
      username,
      password: hashedPassword
    });
    
    await user.save();
    
    // Création du token JWT
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET || 'your_jwt_secret', {
      expiresIn: '30d'
    });
    
    // Réponse sans le mot de passe
    const userResponse = {
      _id: user._id,
      name: user.name,
      email: user.email,
      username: user.username,
      profilePicture: user.profilePicture
    };
    
    res.status(201).json({ user: userResponse, token });
  } catch (error) {
    console.error('Erreur d\'inscription:', error);
    res.status(500).json({ error: 'Erreur lors de l\'inscription' });
  }
});

// Connexion utilisateur
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    // Vérification si l'utilisateur existe
    const user = await UserChoice.findOne({ email });
    if (!user) {
      return res.status(400).json({ error: 'Email ou mot de passe incorrect' });
    }
    
    // Vérification du mot de passe
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(400).json({ error: 'Email ou mot de passe incorrect' });
    }
    
    // Mise à jour de la date de dernière connexion
    user.last_login = new Date();
    user.isOnline = true;
    await user.save();
    
    // Création du token JWT
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET || 'your_jwt_secret', {
      expiresIn: '30d'
    });
    
    // Réponse sans le mot de passe
    const userResponse = {
      _id: user._id,
      name: user.name,
      email: user.email,
      username: user.username,
      profilePicture: user.profilePicture,
      bio: user.bio,
      followers: user.followers,
      following: user.following,
      interests: user.interests
    };
    
    res.status(200).json({ user: userResponse, token });
  } catch (error) {
    console.error('Erreur de connexion:', error);
    res.status(500).json({ error: 'Erreur lors de la connexion' });
  }
});

// Obtenir les suggestions d'utilisateurs
router.get('/suggestions/users', auth, async (req, res) => {
  try {
    const currentUser = await UserChoice.findById(req.user.id);
    
    // Obtenir des utilisateurs qui ne sont pas déjà suivis
    const suggestions = await UserChoice.find({
      _id: { $ne: req.user.id, $nin: currentUser.following },
    })
    .select('name username profilePicture bio')
    .limit(15);
    
    res.status(200).json(suggestions);
  } catch (error) {
    console.error('Erreur de récupération des suggestions:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des suggestions' });
  }
});

// Rechercher des utilisateurs
router.get('/search/users', async (req, res) => {
  try {
    const { query } = req.query;
    
    if (!query) {
      return res.status(400).json({ error: 'Requête de recherche requise' });
    }
    
    const users = await UserChoice.find({
      $or: [
        { name: { $regex: query, $options: 'i' } },
        { username: { $regex: query, $options: 'i' } },
      ],
    })
    .select('name username profilePicture bio')
    .limit(20);
    
    res.status(200).json(users);
  } catch (error) {
    console.error('Erreur de recherche:', error);
    res.status(500).json({ error: 'Erreur lors de la recherche d\'utilisateurs' });
  }
});

// GET /api/users/:userId/public-profile - Obtenir des informations publiques limitées d'un utilisateur
router.get('/:userId/public-profile', auth, async (req, res) => {
  try {
    const { userId } = req.params;

    if (!mongoose.isValidObjectId(userId)) {
      return res.status(400).json({ error: 'ID utilisateur invalide' });
    }

    // Select only non-sensitive fields suitable for producer view
    const user = await UserChoice.findById(userId).select(
      'name profilePicture photo_url bio liked_tags sector_preferences' // Example fields
    ).lean(); // Use lean() for plain object

    if (!user) {
      return res.status(404).json({ error: 'Utilisateur non trouvé' });
    }

    // Construct the public profile object
    const publicProfile = {
      id: user._id.toString(),
      name: user.name || 'Utilisateur Anonyme', // Provide default
      profilePicture: user.profilePicture || user.photo_url, // Handle multiple fields
      bio: user.bio,
      liked_tags: user.liked_tags || [], // Default to empty array
      sector_preferences: user.sector_preferences, // Include preferences if available
      // DO NOT include email, password, location, etc.
    };

    console.log(`✅ Public profile requested for user ${userId} by producer ${req.user.id}`);
    res.status(200).json(publicProfile);

  } catch (error) {
    console.error('❌ Erreur lors de la récupération du profil public:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Fonction utilitaire pour normaliser les données utilisateur (replacée ici)
const normalizeUser = (user) => {
  if (!user) return null;
  
  // Convertir l'objet Mongoose en objet JavaScript simple
  const userData = user.toObject ? user.toObject() : { ...user };
  
  // Convertir l'_id en string
  if (userData._id) {
    userData._id = userData._id.toString();
  }
  
  // Normaliser le champ de photo de profil (utiliser photo_url ou profilePicture)
  if (userData.photo_url && !userData.profilePicture) {
    userData.profilePicture = userData.photo_url;
  } else if (userData.profilePicture && !userData.photo_url) {
    userData.photo_url = userData.profilePicture;
  }
  
  // S'assurer que les tableaux existent (optionnel, peut être retiré si le schéma a des defaults)
  userData.followers = userData.followers || [];
  userData.following = userData.following || [];
  userData.posts = userData.posts || [];
  userData.conversations = userData.conversations || [];
  userData.interests = userData.interests || [];
  
  return userData;
};

// Normaliser un tableau d'utilisateurs
const normalizeUsers = (users) => {
  if (!users) return [];
  return users.map(normalizeUser);
};

module.exports = router;

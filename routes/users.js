const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Conversation = require('../models/conversation'); // Import du modèle Conversation
const userController = require('../controllers/userController');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');


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

// Middleware pour vérifier le token JWT
const auth = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ error: 'Authentification requise' });
    }
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_jwt_secret');
    req.user = { id: decoded.id };
    next();
  } catch (error) {
    res.status(401).json({ error: 'Token invalide' });
  }
};

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

/**
 * Routes pour les utilisateurs
 */

// GET /api/users - Obtenir tous les utilisateurs
router.get('/', userController.getAllUsers);

// GET /api/users/:id/favorites - Obtenir les favoris d'un utilisateur
router.get('/:id/favorites', userController.getUserFavorites);

// GET /api/users/:id/profile - Obtenir le profil d'un utilisateur
router.get('/:id/profile', userController.getUserProfile);

// PUT /api/users/:id - Mettre à jour un utilisateur
router.put('/:id', userController.updateUser);

// PUT /api/users/:id/password - Mettre à jour le mot de passe d'un utilisateur
router.put('/:id/password', userController.updatePassword);

// DELETE /api/users/:id - Supprimer un utilisateur
router.delete('/:id', userController.deleteUser);

// POST /api/users/:userId/follow - Suivre un utilisateur ou un producteur
router.post('/:userId/follow', userController.follow);

// DELETE /api/users/:userId/follow - Ne plus suivre un utilisateur ou un producteur
router.delete('/:userId/follow', userController.unfollow);

// GET /api/users/:id - Obtenir un utilisateur par ID (doit être placé à la fin pour éviter les conflits de routes)
router.get('/:id', userController.getUserById);

// Inscription utilisateur
router.post('/register', async (req, res) => {
  try {
    const { name, email, username, password } = req.body;
    
    // Vérification si l'email existe déjà
    const emailExists = await User.findOne({ email });
    if (emailExists) {
      return res.status(400).json({ error: 'Email déjà utilisé' });
    }
    
    // Vérification si le nom d'utilisateur existe déjà
    const usernameExists = await User.findOne({ username });
    if (usernameExists) {
      return res.status(400).json({ error: 'Nom d\'utilisateur déjà utilisé' });
    }
    
    // Hashage du mot de passe
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    
    // Création du nouvel utilisateur
    const user = new User({
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
    const user = await User.findOne({ email });
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

// Obtenir le profil de l'utilisateur connecté
router.get('/profile', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    if (!user) {
      return res.status(404).json({ error: 'Utilisateur non trouvé' });
    }
    
    res.status(200).json(user);
  } catch (error) {
    console.error('Erreur de récupération de profil:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération du profil' });
  }
});

// Mettre à jour le profil
router.put('/profile', auth, async (req, res) => {
  try {
    const updates = req.body;
    
    // Empêcher la mise à jour du mot de passe ou de l'email par cette route
    delete updates.password;
    delete updates.email;
    
    const user = await User.findByIdAndUpdate(
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

// Obtenir le profil d'un utilisateur par son ID
router.get('/:id', async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-password');
    if (!user) {
      return res.status(404).json({ error: 'Utilisateur non trouvé' });
    }
    
    res.status(200).json(user);
  } catch (error) {
    console.error('Erreur de récupération de profil:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération du profil' });
  }
});

// Suivre / Ne plus suivre un utilisateur
router.put('/follow/:id', auth, async (req, res) => {
  try {
    // Vérifier si on essaie de se suivre soi-même
    if (req.user.id === req.params.id) {
      return res.status(400).json({ error: 'Vous ne pouvez pas vous suivre vous-même' });
    }
    
    const userToFollow = await User.findById(req.params.id);
    if (!userToFollow) {
      return res.status(404).json({ error: 'Utilisateur non trouvé' });
    }
    
    const currentUser = await User.findById(req.user.id);
    
    // Vérifier si l'utilisateur est déjà suivi
    const isFollowing = currentUser.following.includes(req.params.id);
    
    if (isFollowing) {
      // Ne plus suivre l'utilisateur
      await User.findByIdAndUpdate(req.user.id, {
        $pull: { following: req.params.id }
      });
      
      await User.findByIdAndUpdate(req.params.id, {
        $pull: { followers: req.user.id }
      });
      
      res.status(200).json({ message: 'Vous ne suivez plus cet utilisateur' });
    } else {
      // Suivre l'utilisateur
      await User.findByIdAndUpdate(req.user.id, {
        $addToSet: { following: req.params.id }
      });
      
      await User.findByIdAndUpdate(req.params.id, {
        $addToSet: { followers: req.user.id }
      });
      
      res.status(200).json({ message: 'Vous suivez maintenant cet utilisateur' });
    }
  } catch (error) {
    console.error('Erreur lors du suivi:', error);
    res.status(500).json({ error: 'Erreur lors de la mise à jour du suivi' });
  }
});

// Obtenir les suggestions d'utilisateurs
router.get('/suggestions/users', auth, async (req, res) => {
  try {
    const currentUser = await User.findById(req.user.id);
    
    // Obtenir des utilisateurs qui ne sont pas déjà suivis
    const suggestions = await User.find({
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
    
    const users = await User.find({
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

module.exports = router;

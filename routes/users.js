const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const conversationModule = require('../models/conversation'); // Import du module conversation
const userController = require('../controllers/userController');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { createModel, databases } = require('../utils/modelCreator');
const { UserSchema } = require('../models/User'); // Import UserSchema instead of UserChoice
const Follow = require('../models/Follow'); // Import the new Follow model
const { getChoiceAppConnection } = require('../db/config'); // Importer la fonction pour obtenir la connexion choice_app
const User = require('../models/User'); // Importez le modèle User

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
    const currentUser = await UserSchema.findById(currentUserId);
    if (!currentUser) {
      console.log(`❌ Utilisateur courant non trouvé: ${currentUserId}`);
      return res.status(404).json({ 
        error: 'Utilisateur courant non trouvé',
        isFollowing: false
      });
    }
    
    // Vérifier si l'utilisateur cible existe
    const targetUser = await UserSchema.findById(targetUserId);
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

      const users = await UserSchema.find({
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

      const user = await UserSchema.findById(id).select(
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
    
    const user = await UserSchema.findById(req.user.id).select('-password');
    
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
    
    const user = await UserSchema.findByIdAndUpdate(
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
  console.log(`\n\uD83D\uDCC4 GET /api/users/:id/posts - Received User ID: ${id}`);

  try {
    if (!mongoose.isValidObjectId(id)) {
      console.log(`\t\u274C GET /api/users/:id/posts - Invalid User ID format: ${id}`);
      return res.status(400).json({ message: 'ID utilisateur invalide.' });
    }

    // Utiliser la connexion choice_app pour trouver l'utilisateur
    const choiceAppDb = getChoiceAppConnection();
    const UserOnChoiceAppDb = choiceAppDb.model('User', UserSchema, 'Users');
    const userObjectId = new mongoose.Types.ObjectId(id);
    
    let userPosts = null;

    // 1. Tentative avec Mongoose pour trouver l'utilisateur et ses posts
    console.log(`\t[Mongoose] \u23F3 Searching user in '${choiceAppDb.name}' DB ('Users' collection) for posts list...`);
    const user = await UserOnChoiceAppDb.findOne({ _id: userObjectId }).select('posts').lean(); // Utiliser lean() pour un objet JS simple

    if (user) {
        console.log(`\t[Mongoose] \u2705 User found for posts list.`);
        userPosts = user.posts || [];
    } else {
        // 2. Si Mongoose échoue, tentative avec le Driver Natif (ciblant aussi 'Users')
        console.log(`\t[Mongoose] \u274C User not found for posts list.`);
        console.log(`\t[Native Driver] \u23F3 Trying native findOne for posts list in 'Users' collection...`);
        try {
            const nativeDb = choiceAppDb.db;
            const nativeUser = await nativeDb.collection('Users').findOne({ _id: userObjectId }, { projection: { posts: 1 } });
            
            if (nativeUser) {
                console.log(`\t[Native Driver] \u2705 User found for posts list.`);
                userPosts = nativeUser.posts || [];
            } else {
                console.log(`\t[Native Driver] \u274C User not found for posts list.`);
                return res.status(404).json({ message: 'Utilisateur non trouvé pour récupérer les posts.' });
            }
        } catch (nativeError) {
            console.error(`\t[Native Driver] \u274C Error during native findOne for posts list:`, nativeError.message);
            return res.status(500).json({ message: 'Erreur serveur lors de la recherche native de l\'utilisateur.' });
        }
    }

    // Si on a une liste de postIds (de Mongoose ou Natif), on les fetch
    await fetchAndReturnPosts(res, userPosts);

  } catch (error) {
    console.error(`\t\u274C GET /api/users/:id/posts - General Server error for User ID ${id}:`, error.message);
    console.error(error.stack);
    res.status(500).json({ message: 'Erreur serveur lors de la récupération des posts.' });
  }
});

// Fonction helper pour récupérer et renvoyer les posts
async function fetchAndReturnPosts(res, postIds) {
  if (!postIds || postIds.length === 0) { // Ajout d'une vérification null
    console.log('\t\u2139\uFE0F User has no posts or postIds is null.'); 
    return res.status(200).json({ posts: [] });
  }
  
  // Convertir les IDs en ObjectId valides pour la requête $in
  const objectIdPostIds = postIds
    .map(pid => {
        try {
            const idString = pid && typeof pid === 'object' ? pid.toString() : pid;
            if (mongoose.Types.ObjectId.isValid(idString)) {
                return new mongoose.Types.ObjectId(idString);
            }
        } catch (e) { /* Ignorer les IDs invalides */ }
        return null;
    })
    .filter(id => id !== null); 

  if (objectIdPostIds.length === 0) {
    console.log('\t⚠️ No valid post ObjectIds found in user\'s posts array.'); 
    return res.status(200).json({ posts: [] });
  }

  try {
    console.log(`\t⏳ Fetching ${objectIdPostIds.length} posts using PostChoice model...`); 
    // PostChoice est déjà configuré pour utiliser la bonne DB via createModel
    const posts = await PostChoice.find({ 
      _id: { $in: objectIdPostIds } 
    }).lean(); // Utiliser lean() pour de meilleures perfs
    console.log(`\t✅ Found ${posts.length} posts.`); 

    // Normaliser les posts
    const normalizedPosts = posts.map(post => {
      // Pas besoin de .toObject() avec lean()
      if (post._id) post._id = post._id.toString();
      if (post.userId) {
          post.userId = post.userId.toString();
      }
      // Ajouter d'autres normalisations si nécessaire
      // Par exemple, s'assurer que author est un objet
      if (post.author && typeof post.author !== 'object') {
          // Tentative de transformer l'ID en objet basique
          // Il faudrait idéalement peupler l'auteur lors de la requête find()
          post.author = { _id: post.author.toString(), name: 'Auteur inconnu' }; 
      }
      return post;
    });

    res.status(200).json({ posts: normalizedPosts });
  } catch (fetchError) {
      console.error(`\t❌ Error fetching posts with IDs [${objectIdPostIds.join(', ')}]:`, fetchError.message); 
      console.error(fetchError.stack);
      res.status(500).json({ message: 'Erreur serveur lors de la récupération des détails des posts.' });
  }
}

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

    // --- START CHANGE: Use choiceAppDb connection and 'Users' collection ---
    const choiceAppDb = getChoiceAppConnection();
    const UserOnChoiceAppDb = choiceAppDb.model('User', UserSchema, 'Users');
    const user = await UserOnChoiceAppDb.findById(userId).select('_id name username profilePicture photo_url bio followers following').lean(); // Use lean() and select specific fields
    // --- END CHANGE ---
    
    if (!user) {
      return res.status(404).json({ error: 'Utilisateur non trouvé' });
    }
    
    // Normaliser la réponse pour le frontend
    const userInfo = {
      _id: user._id.toString(),
      id: user._id.toString(), // Keep both for compatibility if needed
      name: user.name || user.username || 'Utilisateur', // Use name field if available
      username: user.username,
      profilePicture: user.profilePicture || user.photo_url || '',
      avatar: user.profilePicture || user.photo_url || '', // Keep both for compatibility
      bio: user.bio || '',
      // Use length of arrays for counts, ensure arrays exist
      followers_count: user.followers ? user.followers.length : 0, 
      following_count: user.following ? user.following.length : 0,
      type: 'user' // Explicitly set type
    };
    
    res.status(200).json(userInfo);
  } catch (error) {
    console.error('Erreur lors de la récupération des informations de l\'utilisateur:', error); // Escaped quote
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
      UserSchema.findById(currentUserId).select('_id'),
      UserSchema.findById(targetUserId).select('_id')
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
  console.log(`\n\uD83D\uDD0D GET /api/users/:id - Received ID: ${id}`);

  try {
    const choiceAppDb = getChoiceAppConnection(); 
    console.log(`\t\uD83D\uDCCE Using DB: ${choiceAppDb.name}`);
    console.log(`\t\u2139\uFE0F Mongoose connection state: ${choiceAppDb.readyState} (1 = connected)`);
    
    if (!mongoose.isValidObjectId(id)) {
      console.log(`\t\u274C GET /api/users/:id - Invalid ID format: ${id}`); 
      return res.status(400).json({ message: 'ID invalide.' });
    }
    
    const objectId = new mongoose.Types.ObjectId(id); 
    console.log(`\t\uD83D\uDD0D Converted ID to ObjectId: ${objectId}`);

    // 1. Tentative avec Mongoose
    console.log(`\t[Mongoose] \u23F3 Searching user in '${choiceAppDb.name}' DB ('Users' collection) with findOne({ _id: ObjectId('${id}') })`); 
    const UserOnChoiceAppDb = choiceAppDb.model('User', UserSchema, 'Users');
    let user = await UserOnChoiceAppDb.findOne({ _id: objectId });
    
    if (user) {
      console.log(`\t[Mongoose] \u2705 User found in '${choiceAppDb.name}' DB: ${user.name || user._id}`); 
      return res.status(200).json(normalizeUser(user));
    } else {
       console.log(`\t[Mongoose] \u274C User not found in DB '${choiceAppDb.name}' using findOne({_id: ObjectId(...)}) for ID: ${id}`);
    }
    
    // 2. Si Mongoose échoue, tentative avec le Driver Natif
    console.log(`\t[Native Driver] \u23F3 Trying native findOne({ _id: ObjectId('${id}') }) on DB '${choiceAppDb.name}' in 'Users' collection`);
    try {
      const nativeDb = choiceAppDb.db; // Accéder à l'objet db natif
      const nativeUser = await nativeDb.collection('Users').findOne({ _id: objectId });
      
      if (nativeUser) {
        console.log(`\t[Native Driver] \u2705 User found in '${choiceAppDb.name}' DB: ${nativeUser.name || nativeUser._id}`);
        // On a trouvé l'utilisateur avec le driver natif, il y a un problème avec Mongoose
        // On peut renvoyer les données natives (normalisées si possible)
        // Note: Il faudra peut-être adapter la normalisation car ce n'est pas un doc Mongoose
        const normalizedNativeUser = { ...nativeUser, _id: nativeUser._id.toString() }; 
        if (normalizedNativeUser.photo_url && !normalizedNativeUser.profilePicture) {
          normalizedNativeUser.profilePicture = normalizedNativeUser.photo_url;
        } 
        // Ajouter d'autres normalisations si nécessaire
        delete normalizedNativeUser.password; // Ensure password isn't sent
        return res.status(200).json(normalizedNativeUser);
      } else {
        console.log(`\t[Native Driver] \u274C User not found in DB '${choiceAppDb.name}' using native findOne for ID: ${id}`);
        // Si même le driver natif ne trouve rien ici, le problème est ailleurs (ou l'ID est vraiment incorrect malgré les apparences)
        return res.status(404).json({ message: 'Utilisateur non trouvé (échec Mongoose et Natif).' });
      }
    } catch (nativeError) {
        console.error(`\t[Native Driver] \u274C Error during native findOne for ID ${id}:`, nativeError.message);
        console.error(nativeError.stack);
        return res.status(500).json({ message: 'Erreur serveur lors de la recherche native.' });
    }

  } catch (error) {
    console.error(`\t\u274C GET /api/users/:id - General Server error for ID ${id}:`, error.message); 
    console.error(error.stack); 
    res.status(500).json({ message: 'Erreur serveur générale.' });
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
        await UserSchema.findByIdAndUpdate(
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
    const user = await UserSchema.findById(id);
    
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
      const participants = await UserSchema.find({
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
    const sender = await UserSchema.findById(senderId);
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
    const senders = await UserSchema.find({
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
        await UserSchema.findByIdAndUpdate(
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
    const user = new UserSchema({
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

// Obtenir les suggestions d'utilisateurs
router.get('/suggestions/users', auth, async (req, res) => {
  try {
    const currentUser = await UserSchema.findById(req.user.id);
    
    // Obtenir des utilisateurs qui ne sont pas déjà suivis
    const suggestions = await UserSchema.find({
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
    
    const users = await UserSchema.find({
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

// GET /api/users/:userId/public-profile - Obtenir le profil public d'un utilisateur
// Cette route n'est pas protégée par auth pour permettre l'accès public
router.get('/:userId/public-profile', userController.getPublicProfile);

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

// PUT /api/users/stripe-customer-id - Mettre à jour l'ID client Stripe d'un utilisateur
router.put('/stripe-customer-id', auth, async (req, res) => {
  try {
    const { stripeCustomerId } = req.body;
    const userId = req.user.id;

    if (!stripeCustomerId) {
      return res.status(400).json({ error: 'L\'ID client Stripe est requis' });
    }

    // Mettre à jour l'utilisateur avec l'ID client Stripe
    const user = await User.findByIdAndUpdate(
      userId,
      { stripeCustomerId: stripeCustomerId },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({ error: 'Utilisateur non trouvé' });
    }

    res.status(200).json({ 
      success: true, 
      message: 'ID client Stripe mis à jour avec succès',
      user: {
        id: user._id,
        email: user.email,
        stripeCustomerId: user.stripeCustomerId
      }
    });
  } catch (error) {
    console.error('Erreur lors de la mise à jour de l\'ID client Stripe:', error);
    res.status(500).json({ error: 'Erreur lors de la mise à jour de l\'ID client Stripe' });
  }
});

// POST /api/users/:userId/favorite-choice - Définir le coup de cœur du mois de l'utilisateur
router.post('/:userId/favorite-choice', auth, async (req, res) => {
  try {
    const { userId } = req.params;
    const { choiceId, timestamp } = req.body;
    
    // Vérifier que l'utilisateur connecté est bien celui qui fait la demande
    if (req.user.id !== userId) {
      return res.status(403).json({ error: 'Non autorisé à modifier le coup de cœur d\'un autre utilisateur' });
    }
    
    // Vérifier que choiceId est fourni
    if (!choiceId) {
      return res.status(400).json({ error: 'choiceId est requis' });
    }
    
    // Trouver l'utilisateur
    const user = await UserSchema.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'Utilisateur non trouvé' });
    }
    
    // Trouver le choice parmi les choices de l'utilisateur
    const userChoices = user.choices || [];
    const choiceIndex = userChoices.findIndex(choice => 
      choice._id.toString() === choiceId || 
      (choice.choiceId && choice.choiceId.toString() === choiceId)
    );
    
    if (choiceIndex === -1) {
      return res.status(404).json({ error: 'Choice non trouvé dans la liste des choices de l\'utilisateur' });
    }
    
    // Récupérer le choice complet
    const selectedChoice = userChoices[choiceIndex];
    
    // Mettre à jour le favoriteChoice de l'utilisateur
    user.favoriteChoice = selectedChoice;
    user.lastFavoriteChoiceTimestamp = timestamp || new Date().toISOString();
    
    // Sauvegarder les modifications
    await user.save();
    
    res.status(200).json({ 
      success: true, 
      message: 'Coup de cœur du mois mis à jour avec succès',
      favoriteChoice: user.favoriteChoice,
      lastFavoriteChoiceTimestamp: user.lastFavoriteChoiceTimestamp
    });
  } catch (error) {
    console.error('❌ Erreur lors de la définition du coup de cœur du mois:', error);
    res.status(500).json({ error: 'Erreur serveur lors de la mise à jour du coup de cœur' });
  }
});

module.exports = router;

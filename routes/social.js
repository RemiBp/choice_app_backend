const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Post = require('../models/Post');

// Middleware d'authentification
const auth = async (req, res, next) => {
  // Votre logique d'authentification ici
  next();
};

// GET /api/social/feed - Obtenir le feed personnalisé d'un utilisateur
router.get('/feed', auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { page = 1, limit = 20 } = req.query;
    const skip = (page - 1) * parseInt(limit);
    
    // Récupérer les utilisateurs suivis
    const user = await User.findById(userId).select('following interests liked_tags');
    
    if (!user) {
      return res.status(404).json({ error: 'Utilisateur non trouvé' });
    }
    
    // Construire la requête pour le feed
    const query = {
      $or: [
        { userId: { $in: user.following } }, // Posts des utilisateurs suivis
        { userId }, // Posts de l'utilisateur lui-même
        { tags: { $in: user.liked_tags || [] } } // Posts avec tags que l'utilisateur aime
      ]
    };
    
    // Obtenir les posts pour le feed
    const posts = await Post.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));
    
    // Obtenir le nombre total de posts pour la pagination
    const total = await Post.countDocuments(query);
    
    res.status(200).json({
      posts,
      totalPages: Math.ceil(total / parseInt(limit)),
      currentPage: parseInt(page),
      hasMore: skip + posts.length < total
    });
  } catch (error) {
    console.error('Erreur de récupération du feed:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération du feed' });
  }
});

// GET /api/social/friends - Obtenir les amis d'un utilisateur
router.get('/friends', auth, async (req, res) => {
  try {
    const userId = req.user.id;
    
    const user = await User.findById(userId).select('friends');
    
    if (!user) {
      return res.status(404).json({ error: 'Utilisateur non trouvé' });
    }
    
    // Récupérer les informations détaillées des amis
    const friends = await User.find({ _id: { $in: user.friends } })
      .select('_id name username profilePicture bio isOnline last_login');
    
    res.status(200).json(friends);
  } catch (error) {
    console.error('Erreur de récupération des amis:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des amis' });
  }
});

// POST /api/social/friend-request - Envoyer une demande d'ami
router.post('/friend-request', auth, async (req, res) => {
  try {
    const { targetUserId } = req.body;
    const userId = req.user.id;
    
    if (!targetUserId) {
      return res.status(400).json({ error: 'ID de l\'utilisateur cible requis' });
    }
    
    if (targetUserId === userId) {
      return res.status(400).json({ error: 'Vous ne pouvez pas vous envoyer une demande d\'ami à vous-même' });
    }
    
    // Vérifier si l'utilisateur cible existe
    const targetUser = await User.findById(targetUserId);
    if (!targetUser) {
      return res.status(404).json({ error: 'Utilisateur cible non trouvé' });
    }
    
    // Vérifier si une demande existe déjà ou s'ils sont déjà amis
    const user = await User.findById(userId);
    
    if (user.friends && user.friends.includes(targetUserId)) {
      return res.status(400).json({ error: 'Vous êtes déjà amis avec cet utilisateur' });
    }
    
    // Vérifier si l'utilisateur actuel a déjà une demande en attente de cet utilisateur
    if (user.friend_requests && user.friend_requests.some(req => req.from.toString() === targetUserId)) {
      // Accepter automatiquement cette demande existante
      await User.findByIdAndUpdate(userId, {
        $pull: { friend_requests: { from: targetUserId } },
        $addToSet: { friends: targetUserId }
      });
      
      await User.findByIdAndUpdate(targetUserId, {
        $addToSet: { friends: userId }
      });
      
      return res.status(200).json({ message: 'Demande d\'ami acceptée', status: 'friends' });
    }
    
    // Vérifier si l'utilisateur a déjà envoyé une demande
    const targetUserRequests = targetUser.friend_requests || [];
    if (targetUserRequests.some(req => req.from.toString() === userId)) {
      return res.status(400).json({ error: 'Vous avez déjà envoyé une demande d\'ami à cet utilisateur', status: 'pending' });
    }
    
    // Ajouter la demande d'ami
    await User.findByIdAndUpdate(targetUserId, {
      $addToSet: {
        friend_requests: {
          from: userId,
          createdAt: new Date()
        }
      }
    });
    
    // Envoyer une notification à l'utilisateur cible (si implémenté)
    
    res.status(200).json({ message: 'Demande d\'ami envoyée', status: 'pending' });
  } catch (error) {
    console.error('Erreur d\'envoi de demande d\'ami:', error);
    res.status(500).json({ error: 'Erreur lors de l\'envoi de la demande d\'ami' });
  }
});

// GET /api/social/friend-requests - Obtenir les demandes d'ami reçues
router.get('/friend-requests', auth, async (req, res) => {
  try {
    const userId = req.user.id;
    
    const user = await User.findById(userId).select('friend_requests');
    
    if (!user) {
      return res.status(404).json({ error: 'Utilisateur non trouvé' });
    }
    
    // Si aucune demande n'existe, renvoyer un tableau vide
    if (!user.friend_requests || user.friend_requests.length === 0) {
      return res.status(200).json([]);
    }
    
    // Récupérer les informations détaillées des utilisateurs qui ont envoyé une demande
    const requestDetails = await Promise.all(user.friend_requests.map(async (request) => {
      const requester = await User.findById(request.from).select('_id name username profilePicture');
      return {
        _id: request._id,
        user: requester,
        createdAt: request.createdAt
      };
    }));
    
    res.status(200).json(requestDetails);
  } catch (error) {
    console.error('Erreur de récupération des demandes d\'ami:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des demandes d\'ami' });
  }
});

// POST /api/social/accept-friend - Accepter une demande d'ami
router.post('/accept-friend', auth, async (req, res) => {
  try {
    const { requestId, userId: requesterUserId } = req.body;
    const userId = req.user.id;
    
    if (!requesterUserId) {
      return res.status(400).json({ error: 'ID de l\'utilisateur demandeur requis' });
    }
    
    // Vérifier si l'utilisateur actuel a bien reçu une demande de cet utilisateur
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({ error: 'Utilisateur non trouvé' });
    }
    
    const requestExists = user.friend_requests && user.friend_requests.some(
      req => req.from.toString() === requesterUserId && (requestId ? req._id.toString() === requestId : true)
    );
    
    if (!requestExists) {
      return res.status(400).json({ error: 'Demande d\'ami non trouvée' });
    }
    
    // Accepter la demande d'ami (ajouter les utilisateurs aux listes d'amis respectivement)
    await User.findByIdAndUpdate(userId, {
      $pull: { friend_requests: requestId ? { _id: requestId } : { from: requesterUserId } },
      $addToSet: { friends: requesterUserId }
    });
    
    await User.findByIdAndUpdate(requesterUserId, {
      $addToSet: { friends: userId }
    });
    
    // Envoyer une notification à l'utilisateur demandeur (si implémenté)
    
    res.status(200).json({ message: 'Demande d\'ami acceptée' });
  } catch (error) {
    console.error('Erreur lors de l\'acceptation de la demande d\'ami:', error);
    res.status(500).json({ error: 'Erreur lors de l\'acceptation de la demande d\'ami' });
  }
});

// POST /api/social/decline-friend - Refuser une demande d'ami
router.post('/decline-friend', auth, async (req, res) => {
  try {
    const { requestId, userId: requesterUserId } = req.body;
    const userId = req.user.id;
    
    if (!requesterUserId && !requestId) {
      return res.status(400).json({ error: 'ID de la demande ou de l\'utilisateur demandeur requis' });
    }
    
    // Supprimer la demande d'ami
    const query = requestId ? { _id: requestId } : { from: requesterUserId };
    await User.findByIdAndUpdate(userId, {
      $pull: { friend_requests: query }
    });
    
    res.status(200).json({ message: 'Demande d\'ami refusée' });
  } catch (error) {
    console.error('Erreur lors du refus de la demande d\'ami:', error);
    res.status(500).json({ error: 'Erreur lors du refus de la demande d\'ami' });
  }
});

// DELETE /api/social/friend/:friendId - Supprimer un ami
router.delete('/friend/:friendId', auth, async (req, res) => {
  try {
    const { friendId } = req.params;
    const userId = req.user.id;
    
    if (!friendId) {
      return res.status(400).json({ error: 'ID de l\'ami requis' });
    }
    
    // Vérifier si l'utilisateur est bien ami avec cet utilisateur
    const user = await User.findById(userId);
    
    if (!user || !user.friends || !user.friends.includes(friendId)) {
      return res.status(400).json({ error: 'Cette personne n\'est pas dans votre liste d\'amis' });
    }
    
    // Supprimer l'ami des deux côtés
    await User.findByIdAndUpdate(userId, {
      $pull: { friends: friendId }
    });
    
    await User.findByIdAndUpdate(friendId, {
      $pull: { friends: userId }
    });
    
    res.status(200).json({ message: 'Ami supprimé avec succès' });
  } catch (error) {
    console.error('Erreur lors de la suppression de l\'ami:', error);
    res.status(500).json({ error: 'Erreur lors de la suppression de l\'ami' });
  }
});

// GET /api/social/suggestions - Obtenir des suggestions d'amis
router.get('/suggestions', auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { limit = 20 } = req.query;
    
    const user = await User.findById(userId).select('friends following interests liked_tags');
    
    if (!user) {
      return res.status(404).json({ error: 'Utilisateur non trouvé' });
    }
    
    // Exclure les utilisateurs déjà amis ou suivis
    const excludedIds = [...(user.friends || []), ...(user.following || []), userId];
    
    // Trouver des utilisateurs avec des intérêts similaires
    let suggestions = [];
    
    if (user.interests && user.interests.length > 0) {
      const interestSuggestions = await User.find({
        _id: { $nin: excludedIds },
        interests: { $in: user.interests }
      })
      .select('_id name username profilePicture bio')
      .limit(parseInt(limit) * 2);
      
      suggestions = [...suggestions, ...interestSuggestions];
    }
    
    // Compléter avec des suggestions aléatoires si nécessaire
    if (suggestions.length < parseInt(limit)) {
      const randomSuggestions = await User.find({
        _id: { $nin: [...excludedIds, ...suggestions.map(s => s._id)] }
      })
      .select('_id name username profilePicture bio')
      .limit(parseInt(limit) - suggestions.length);
      
      suggestions = [...suggestions, ...randomSuggestions];
    }
    
    // Limiter au nombre demandé
    suggestions = suggestions.slice(0, parseInt(limit));
    
    res.status(200).json(suggestions);
  } catch (error) {
    console.error('Erreur de récupération des suggestions d\'amis:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des suggestions d\'amis' });
  }
});

// GET /api/social/activity - Obtenir l'activité récente des amis et utilisateurs suivis
router.get('/activity', auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { page = 1, limit = 20 } = req.query;
    const skip = (page - 1) * parseInt(limit);
    
    const user = await User.findById(userId).select('friends following');
    
    if (!user) {
      return res.status(404).json({ error: 'Utilisateur non trouvé' });
    }
    
    // Combiner les amis et les utilisateurs suivis
    const connections = [...new Set([...(user.friends || []), ...(user.following || [])])];
    
    // Récupérer les dernières activités (posts récents) des connections
    const activities = await Post.find({
      userId: { $in: connections }
    })
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(parseInt(limit))
    .populate('userId', '_id name username profilePicture');
    
    // Obtenir le nombre total pour la pagination
    const total = await Post.countDocuments({
      userId: { $in: connections }
    });
    
    res.status(200).json({
      activities,
      totalPages: Math.ceil(total / parseInt(limit)),
      currentPage: parseInt(page),
      hasMore: skip + activities.length < total
    });
  } catch (error) {
    console.error('Erreur de récupération des activités:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des activités' });
  }
});

/**
 * @route GET /api/social/contacts
 * @desc Récupérer la liste des contacts d'un utilisateur
 * @access Private
 */
router.get('/contacts', async (req, res) => {
  try {
    const userId = req.query.userId || req.user?.id;
    
    if (!userId) {
      return res.status(400).json({ 
        success: false,
        message: 'ID utilisateur requis' 
      });
    }
    
    // Récupérer tous les amis de l'utilisateur
    const friends = await Friend.find({
      $or: [
        { userId: userId, status: 'accepted' },
        { friendId: userId, status: 'accepted' }
      ]
    }).populate('userId', 'username email profilePicture phoneNumber type')
      .populate('friendId', 'username email profilePicture phoneNumber type');
    
    // Formater la liste des contacts
    const contacts = friends.map(friend => {
      // Déterminer si l'ami est userId ou friendId
      const contact = friend.userId._id.toString() === userId ? friend.friendId : friend.userId;
      
      return {
        id: contact._id,
        name: contact.username,
        avatar: contact.profilePicture,
        email: contact.email,
        type: contact.type || 'user',
        phone: contact.phoneNumber,
        isOnline: false,  // À implémenter avec un service de présence
      };
    });
    
    // Récupérer également les producteurs suivis par l'utilisateur
    const followed = await Follow.find({ userId })
      .populate('producerId', 'name email photo_url type phone category');
    
    // Ajouter les producteurs suivis à la liste des contacts
    const producerContacts = followed.map(follow => ({
      id: follow.producerId._id,
      name: follow.producerId.name,
      avatar: follow.producerId.photo_url,
      email: follow.producerId.email,
      type: 'producer',
      producerType: follow.producerId.type || follow.producerId.category,
      isOnline: false,
      phone: follow.producerId.phone,
    }));
    
    // Combiner les résultats
    const allContacts = [...contacts, ...producerContacts];
    
    res.status(200).json({
      success: true,
      contacts: allContacts
    });
  } catch (error) {
    console.error('❌ Erreur lors de la récupération des contacts:', error);
    res.status(500).json({ 
      success: false,
      message: 'Erreur lors de la récupération des contacts', 
      error: error.message 
    });
  }
});

module.exports = router; 
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { createModel, databases } = require('../utils/modelCreator');
const { LeisureProducer } = require('../models/leisureProducer');
const WellnessPlace = require('../models/WellnessPlace');
const Producer = require('../models/Producer');
const User = require('../models/User'); // Assuming User model is correctly defined and exported

// Middleware to specifically intercept known paths that clash with /:id
// This must come BEFORE any route definitions in this file.
router.use((req, res, next) => {
  // List of known specific paths handled elsewhere or later in this router
  const specificPaths = ['/restaurants', '/leisure', '/wellness', '/feed', '/producers', '/save'];
  // Check for paths starting with /producer-feed/ as well
  if (specificPaths.includes(req.path) || req.path.startsWith('/producer-feed/') || req.path.startsWith('/user/') || req.path.startsWith('/event/') || req.path.startsWith('/producer/')) {
    // If the path matches a specific known route handled elsewhere,
    // immediately call next() to pass control to the correct handler.
    // We assume these specific routes ARE defined correctly *later* in this file
    // or in another router mounted in index.js.
    return next(); 
  }
  // For any other path, continue processing within this router
  next();
});

// Initialiser les modèles directement avec notre utilitaire
const Post = createModel(
  databases.CHOICE_APP,
  'Post',
  'Posts'
);

// Middleware d'authentification (à importer si nécessaire)
const auth = async (req, res, next) => {
  // Votre logique d'authentification ici
  req.user = { id: req.query.userId || req.body.userId || 'defaultUserId' }; // Temporaire
  next();
};

// Utilitaire pour normaliser les posts et s'assurer qu'ils ont une structure cohérente
function normalizePost(post) {
  if (!post) return null;
  
  const postObj = post instanceof mongoose.Model ? post.toObject() : post;
  
  return {
    ...postObj,
    // Assurer que le producteur est correctement identifié (nom différent selon les formats)
    producer_id: postObj.producer_id || postObj.producerId || null,
    producer_type: postObj.producer_type || postObj.producerType || null,
    
    // Assurer que le contenu est présent (différents noms selon les formats)
    content: postObj.content || postObj.text || '',
    title: postObj.title || '',
    
    // Assurer que les médias sont toujours au format attendu
    media: Array.isArray(postObj.media) ? postObj.media : 
           (postObj.media ? [postObj.media] : []),
           
    // Assurer que les tags sont toujours un tableau
    tags: Array.isArray(postObj.tags) ? postObj.tags : 
          (postObj.tags ? [postObj.tags] : []),
    
    // Assurer que la date est présente et cohérente
    posted_at: postObj.posted_at || postObj.createdAt || new Date(),
    
    // Assurer que les structures sociales sont présentes
    comments: postObj.comments || [],
    likes: postObj.likes || [],
    choices: postObj.choices || [],
    // Exposer les choix et leurs évaluations
    isChoice: postObj.isChoice === true,
    rating: postObj.rating || 0,
    aspectRatings: postObj.aspectRatings ? Object.fromEntries(postObj.aspectRatings) : {}
  };
}

// Fonction pour enrichir un post avec les informations d'auteur
async function enrichPostWithAuthorInfo(post) {
  const normalizedPost = normalizePost(post);
  
  try {
    // Si c'est un post utilisateur
    if (normalizedPost.user_id) {
      try {
        // Utiliser directement mongoose.connection pour accéder à la collection
        const db = mongoose.connection.useDb(databases.CHOICE_APP);
        const userCollection = db.collection('Users');
        
        let userId;
        try {
          userId = new mongoose.Types.ObjectId(normalizedPost.user_id);
        } catch (e) {
          userId = normalizedPost.user_id; // Utiliser l'ID tel quel si conversion impossible
        }
        
        const user = await userCollection.findOne({ _id: userId });
        
        if (user) {
          normalizedPost.author_name = user.name || user.displayName || 'Utilisateur';
          normalizedPost.author_avatar = user.avatar || user.photo || user.profile_pic;
          normalizedPost.authorName = normalizedPost.author_name; // Pour compatibilité frontend
          normalizedPost.authorAvatar = normalizedPost.author_avatar; // Pour compatibilité frontend
          normalizedPost.authorId = normalizedPost.user_id; // Pour compatibilité frontend
          
          // Définir explicitement le type pour l'affichage coloré
          normalizedPost.producer_type = 'user';
          normalizedPost.producerType = 'user';
          normalizedPost.isUserPost = true;
        }
      } catch (e) {
        console.error(`Erreur lors de la récupération de l'utilisateur: ${e}`);
      }
    } 
    // Si c'est un post de producteur
    else if (normalizedPost.producer_id) {
      try {
        let producer;
        const producerId = normalizedPost.producer_id;
        let dbName = databases.RESTAURATION; // Base par défaut (restaurants)
        let collectionName = 'Producers'; // Collection par défaut
        
        // Déterminer la base de données et la collection en fonction du type de producteur
        if (normalizedPost.producer_type === 'leisure') {
          dbName = databases.LOISIR;
          collectionName = 'Loisir_Paris_Producers';
        } else if (normalizedPost.producer_type === 'wellness') {
          dbName = databases.BEAUTY_WELLNESS;
          collectionName = 'Beauty_Wellness_Producers';
        }
        
        // Accéder à la bonne base de données
        const db = mongoose.connection.useDb(dbName);
        const producerCollection = db.collection(collectionName);
        
        let producerObjectId;
        try {
          producerObjectId = new mongoose.Types.ObjectId(producerId);
        } catch (e) {
          producerObjectId = producerId; // Utiliser l'ID tel quel si conversion impossible
        }
        
        producer = await producerCollection.findOne({ _id: producerObjectId });
        
        if (producer) {
          normalizedPost.author_name = producer.name || producer.title || 'Établissement';
          normalizedPost.author_avatar = producer.photo || producer.image || producer.logo;
          normalizedPost.authorName = normalizedPost.author_name; // Pour compatibilité frontend
          normalizedPost.authorAvatar = normalizedPost.author_avatar; // Pour compatibilité frontend
          normalizedPost.authorId = normalizedPost.producer_id; // Pour compatibilité frontend
        }
      } catch (e) {
        console.error(`Erreur lors de la récupération du producteur: ${e}`);
      }
    }
    
    // Ajout des propriétés pour les contours colorés dans l'interface
    if (normalizedPost.producer_type) {
      // Propriétés pour le type de post
      normalizedPost.isProducerPost = !!normalizedPost.producer_id;
      normalizedPost.isLeisureProducer = normalizedPost.producer_type === 'leisure';
      normalizedPost.isRestaurationProducer = normalizedPost.producer_type === 'restaurant';
      normalizedPost.isBeautyProducer = normalizedPost.producer_type === 'wellness';
      normalizedPost.isUserPost = normalizedPost.producer_type === 'user';
      
      // Ajouter aussi les versions sans "is" pour compatibilité
      normalizedPost.producerPost = normalizedPost.isProducerPost;
      normalizedPost.leisureProducer = normalizedPost.isLeisureProducer;
      normalizedPost.restaurationProducer = normalizedPost.isRestaurationProducer;
      normalizedPost.beautyProducer = normalizedPost.isBeautyProducer;
      normalizedPost.userPost = normalizedPost.isUserPost;
    } else {
      // Si pas de producer_type défini, considérer comme post utilisateur
      normalizedPost.producer_type = 'user';
      normalizedPost.producerType = 'user';
      normalizedPost.isUserPost = true;
      normalizedPost.userPost = true;
    }
  } catch (error) {
    console.error(`Erreur lors de l'enrichissement du post: ${error}`);
  }
  
  return normalizedPost;
}

// Fonction pour enrichir un post avec les informations d'auteur et les statuts spécifiques à l'utilisateur
async function enrichPostWithUserSpecificInfo(post, userId) {
  // D'abord enrichir avec les informations d'auteur
  const postWithAuthor = await enrichPostWithAuthorInfo(post);
  
  if (!userId) {
    // Si pas d'utilisateur spécifié, renvoyer simplement le post avec les infos d'auteur
    return postWithAuthor;
  }
  
  try {
    // Vérifier si l'utilisateur a aimé ce post
    postWithAuthor.isLiked = postWithAuthor.likes && 
                            (postWithAuthor.likes.includes(userId) || 
                             postWithAuthor.likes.some(like => 
                               like.toString() === userId.toString() || 
                               (typeof like === 'object' && like.user_id === userId)));
    
    // Vérifier si l'utilisateur est intéressé par ce producteur
    if (postWithAuthor.producer_id) {
      try {
        const db = mongoose.connection.useDb(databases.CHOICE_APP);
        const interestsCollection = db.collection('Interests');
        
        const interest = await interestsCollection.findOne({
          user_id: userId,
          producer_id: postWithAuthor.producer_id
        });
        
        postWithAuthor.isInterested = !!interest;
      } catch (e) {
        console.error(`Erreur lors de la vérification des intérêts: ${e}`);
        postWithAuthor.isInterested = false;
      }
    } else {
      postWithAuthor.isInterested = false;
    }
  } catch (error) {
    console.error(`Erreur lors de l'enrichissement avec les infos utilisateur: ${error}`);
  }
  
  return postWithAuthor;
}

// Helper function for fetching posts by type
async function getPostsByType(producerType, req, res) {
  try {
    const userId = req.query.userId; // Get userId for personalization
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // Base query for the specific producer type
    const query = { producer_type: producerType };

    console.log(`🔍 REQUÊTE ${producerType.toUpperCase()}: userId=${userId}, page=${page}, limit=${limit}, filter=${req.query.filter}`);

    const posts = await Post.find(query)
      .sort({ posted_at: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit);

    // Enrich posts with author and user-specific info (like, interest)
    const enrichedPostsPromises = posts.map(post => enrichPostWithUserSpecificInfo(post, userId));
    const enrichedPosts = await Promise.all(enrichedPostsPromises);

    const total = await Post.countDocuments(query);
    const hasMore = (page * limit) < total;

    res.status(200).json({
      posts: enrichedPosts,
      currentPage: page,
      totalPages: Math.ceil(total / limit),
      totalPosts: total,
      hasMore: hasMore
    });
  } catch (error) {
    console.error(`❌ Erreur lors de la récupération des posts (${producerType}):`, error);
    res.status(500).json({ message: `Erreur serveur lors de la récupération des posts ${producerType}.`, error: error.message });
  }
}

// GET /api/posts/feed - Obtenir le feed personnalisé
// DÉPLACÉ ICI pour éviter les conflits avec /:id
router.get('/feed', async (req, res) => {
  try {
    const { userId, limit = 10, page = 1 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Removed userId requirement check as auth is placeholder - RE-ADD LATER
    // if (!userId) {
    //   return res.status(400).json({ message: 'UserId requis' });
    // }
    
    // Récupérer les posts pour le feed
    const posts = await Post.find()
      .sort({ posted_at: -1, createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));
    
    // --- CHANGE: Use enrichPostWithUserSpecificInfo ---
    const enrichedPostsPromises = posts.map(post => enrichPostWithUserSpecificInfo(post, userId)); // Pass userId
    const enrichedPosts = await Promise.all(enrichedPostsPromises);
    // --- END CHANGE ---
    
    // Compter le nombre total de posts
    const total = await Post.countDocuments();
    
    res.status(200).json({
      posts: enrichedPosts, // Use enriched posts
      totalPages: Math.ceil(total / parseInt(limit)),
      currentPage: parseInt(page),
      total
    });
  } catch (error) {
    console.error('❌ Erreur de récupération du feed:', error);
    res.status(500).json({ message: 'Erreur lors de la récupération du feed', error: error.message });
  }
});

// GET /api/posts/restaurants - Obtenir les posts des restaurants
router.get('/restaurants', (req, res) => getPostsByType('restaurant', req, res));

// GET /api/posts/leisure - Obtenir les posts de loisirs
router.get('/leisure', (req, res) => getPostsByType('leisure', req, res));

// GET /api/posts/wellness - Obtenir les posts de bien-être/beauté
router.get('/wellness', (req, res) => getPostsByType('wellness', req, res));

// GET /api/posts - Obtenir tous les posts avec pagination (Generic Feed - maybe used for 'For You'?)
router.get('/', auth, async (req, res) => {
  try {
    const userId = req.query.userId;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    
    const posts = await Post.find()
      .sort({ posted_at: -1, createdAt: -1 }) // Compatibilité avec les deux formats de date
      .skip(skip)
      .limit(limit);
    
    // --- CHANGE: Use enrichPostWithUserSpecificInfo ---
    const enrichedPostsPromises = posts.map(post => enrichPostWithUserSpecificInfo(post, userId));
    const enrichedPosts = await Promise.all(enrichedPostsPromises);
    // --- END CHANGE ---
    
    const total = await Post.countDocuments();
    
    res.status(200).json({
      posts: enrichedPosts, // Use enriched posts
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      totalPosts: total
    });
  } catch (error) {
    console.error("Erreur lors de la récupération de tous les posts:", error);
    res.status(500).json({ message: "Erreur serveur lors de la récupération des posts.", error: error.message });
  }
});

// GET /api/posts/:postId - Obtenir un post spécifique par ID
// IMPORTANT: This MUST come AFTER specific routes like /restaurants, /leisure, etc.
router.get('/:postId', auth, async (req, res) => {
  try {
    const postId = req.params.postId;
    const userId = req.query.userId; // Get userId for personalization

    console.log(`🔍 Recherche du post ID: ${postId}`);

    if (!mongoose.Types.ObjectId.isValid(postId)) {
      console.warn(`⚠️ Tentative d'accès avec un ID non valide: ${postId}`);
      // Check if postId matches known specific paths to give a better warning
      const specificPaths = ['restaurants', 'leisure', 'wellness', 'feed', 'producers', 'save'];
      if (specificPaths.includes(postId)) {
         console.error(`🚫 Route /:id captured specific path "${postId}" due to likely route order issue or invalid request.`);
         return res.status(404).json({ message: `Ressource non trouvée. Le chemin '${postId}' est une catégorie, pas un ID.` });
      }
      return res.status(400).json({ message: 'Format d\'ID de post invalide.' });
    }

    const post = await Post.findById(postId);

    if (!post) {
      console.log(`🚫 Post non trouvé pour ID: ${postId}`);
      return res.status(404).json({ message: 'Post non trouvé.' });
    }

    // Enrichir le post avec les informations spécifiques à l'utilisateur
    const enrichedPost = await enrichPostWithUserSpecificInfo(post, userId);

    res.status(200).json(enrichedPost);
  } catch (error) {
    console.error(`❌ Erreur lors de la récupération du post ${req.params.postId}:`, error);
    res.status(500).json({ message: 'Erreur serveur lors de la récupération du post.', error: error.message });
  }
});

// POST /api/posts - Créer un nouveau post
router.post('/', auth, async (req, res) => {
  try {
    const { title, content, text, media, location, tags, producer_id, producerId, producer_type, producerType, event_id, eventId, isChoice, rating } = req.body;
    
    // Ensure user ID is correctly sourced from the authenticated user
    if (!req.user || !req.user.id) {
      return res.status(401).json({ error: 'Authentification requise pour créer un post' });
    }
    
    // Créer un objet post avec les champs normalisés pour assurer la cohérence
    const postData = {
      user_id: req.user.id,
      // Utiliser content ou text selon ce qui est fourni
      content: content || text || '',
      title: title || '',
      // Assurer que media est un tableau
      media: Array.isArray(media) ? media : (media ? [media] : []),
      location,
      // Assurer que tags est un tableau
      tags: Array.isArray(tags) ? tags : (tags ? [tags] : []),
      // Utiliser les champs uniformisés
      producer_id: producer_id || producerId || null,
      producer_type: producer_type || producerType || null,
      event_id: event_id || eventId || null,
      isChoice,
      rating,
      posted_at: new Date()
    };
    
    const post = new Post(postData);
    await post.save();
    
    // Renvoyer le post avec la structure normalisée
    res.status(201).json(normalizePost(post));
  } catch (error) {
    console.error('Erreur de création du post:', error);
    res.status(500).json({ error: 'Erreur lors de la création du post' });
  }
});

// PUT /api/posts/:id - Mettre à jour un post
router.put('/:id', auth, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    
    if (!post) {
      return res.status(404).json({ error: 'Post non trouvé' });
    }
    
    // Vérifier que l'utilisateur est bien le propriétaire du post
    if (post.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Vous n\'êtes pas autorisé à modifier ce post' });
    }
    
    const updates = req.body;
    
    // Empêcher la modification de certains champs
    delete updates.user_id;
    delete updates.userId;
    delete updates.posted_at;
    delete updates.createdAt;
    delete updates.likes;
    delete updates.comments;
    delete updates.shares;
    
    // Mise à jour du post
    const updatedPost = await Post.findByIdAndUpdate(
      req.params.id,
      { $set: { ...updates, updatedAt: new Date() } },
      { new: true }
    );
    
    // Renvoyer le post avec la structure normalisée
    res.status(200).json(normalizePost(updatedPost));
  } catch (error) {
    console.error('Erreur de mise à jour du post:', error);
    res.status(500).json({ error: 'Erreur lors de la mise à jour du post' });
  }
});

// DELETE /api/posts/:id - Supprimer un post
router.delete('/:id', auth, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    
    if (!post) {
      return res.status(404).json({ error: 'Post non trouvé' });
    }
    
    // Vérifier que l'utilisateur est bien le propriétaire du post
    if (post.user_id !== req.user.id && post.userId !== req.user.id) {
      return res.status(403).json({ error: 'Vous n\'êtes pas autorisé à supprimer ce post' });
    }
    
    await Post.findByIdAndDelete(req.params.id);
    
    res.status(200).json({ message: 'Post supprimé avec succès' });
  } catch (error) {
    console.error('Erreur de suppression du post:', error);
    res.status(500).json({ error: 'Erreur lors de la suppression du post' });
  }
});

// POST /api/posts/:id/like - Aimer un post
router.post('/:id/like', auth, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);

    if (!post) {
      return res.status(404).json({ error: 'Post non trouvé' });
    }

    // Assurer que 'likes' est un tableau avant toute opération
    if (!Array.isArray(post.likes)) {
      console.warn(`Post ${post._id}: Champ 'likes' n'était pas un tableau (${typeof post.likes}). Initialisation à [].`);
      post.likes = []; 
    }

    // Utiliser l'ID utilisateur de l'authentification
    // S'assurer que le type correspond à ce qui est stocké dans le tableau (string ou ObjectId)
    const userId = req.user.id; 
    
    // Convertir en string pour comparaison fiable si les IDs sont stockés comme ObjectId
    const userIdString = userId.toString(); 
    const likeIndex = post.likes.findIndex(likerId => likerId && likerId.toString() === userIdString);

    let isLiked;
    if (likeIndex > -1) {
      // L'utilisateur a déjà aimé, on retire le like
      post.likes.splice(likeIndex, 1);
      isLiked = false;
      await post.save(); // Sauvegarder le post mis à jour
      
      res.status(200).json({ 
        message: 'Like retiré', 
        isLiked: isLiked, 
        likesCount: post.likes.length // Le compte est maintenant correct
      });
    } else {
      // L'utilisateur n'a pas aimé, on ajoute le like
      // S'assurer qu'on ajoute le bon type (ObjectId ou String selon le schéma/usage)
      // Si req.user.id est un string et le schéma attend ObjectId, convertir:
      // post.likes.push(new mongoose.Types.ObjectId(userId)); 
      // Si les deux sont des strings, ou si le schéma est flexible:
      post.likes.push(userId); // Ajouter l'ID utilisateur
      isLiked = true;
      await post.save(); // Sauvegarder le post mis à jour
      
      res.status(200).json({ 
        message: 'Post aimé', 
        isLiked: isLiked, 
        likesCount: post.likes.length // Le compte est maintenant correct
      });
    }
  } catch (error) {
    console.error('Erreur lors du like du post:', error);
    // Vérifier si l'erreur est due à une validation Mongoose (par exemple type mismatch)
    if (error.name === 'ValidationError') {
        return res.status(400).json({ error: 'Validation Error: ' + error.message });
    }
    res.status(500).json({ error: 'Erreur lors de la mise à jour du like' });
  }
});

// GET /api/posts/:id/comments - Obtenir les commentaires d'un post
router.get('/:id/comments', auth, async (req, res) => {
  try {
    const postId = req.params.id;
    const userId = req.user?.id; // Get current user's ID for like status

    if (!mongoose.Types.ObjectId.isValid(postId)) {
      return res.status(400).json({ message: 'Format d\'ID de post invalide.' });
    }

    const post = await Post.findById(postId).select('comments'); // Select only comments initially

    // Retourner un tableau vide si le post n'existe pas ou si 'comments' n'est pas un tableau
    if (!post || !Array.isArray(post.comments)) {
      // Log an info message if comments field exists but isn't an array
      if (post && post.comments !== undefined && !Array.isArray(post.comments)) {
         console.info(`Post ${postId}: Champ 'comments' trouvé mais ce n'est pas un tableau (${typeof post.comments}). Retourne [].`);
      }
      return res.status(200).json([]); 
    }

    // Si post.comments est un tableau (même vide), continuer...
    // Enrich comments with author info and user's like status
    const enrichedCommentsPromises = post.comments.map(async (comment) => {
      let authorName = 'Utilisateur';
      let authorAvatar = '';
      let authorId = comment.user_id?.toString() || null; // Get author ID

      try {
          // Use the User model directly (ensure it's imported/required)
          const db = mongoose.connection.useDb(databases.CHOICE_APP);
          const Users = db.model('User'); // Or require('../models/User') if exported
          
          let userObjectId;
          try {
            userObjectId = new mongoose.Types.ObjectId(comment.user_id);
          } catch(e) { userObjectId = comment.user_id } // Use as string if not ObjectId

          const author = await Users.findById(userObjectId).select('name avatar profile_pic displayName photo').lean();
          if (author) {
            authorName = author.name || author.displayName || 'Utilisateur';
            authorAvatar = author.avatar || author.photo || author.profile_pic || '';
          }
      } catch (e) {
          console.error(`Erreur lors de la récupération de l'auteur du commentaire ${comment._id}:`, e);
      }
      
      // Determine if the current user liked this comment
      const isLiked = comment.likes && comment.likes.some(likeUserId => likeUserId && likeUserId.toString() === userId?.toString());

      // Return enriched comment structure matching frontend model
      return {
        _id: comment._id, // Include comment ID for liking
        id: comment._id.toString(), // Frontend expects 'id'
        content: comment.text || '',
        authorName: authorName,
        authorAvatar: authorAvatar,
        authorId: authorId,
        createdAt: comment.createdAt,
        likes: comment.likes?.length || 0,
        isLiked: isLiked || false // Ensure boolean
      };
    });

    const enrichedComments = await Promise.all(enrichedCommentsPromises);

    res.status(200).json(enrichedComments);
  } catch (error) {
    console.error(`❌ Erreur lors de la récupération des commentaires pour le post ${req.params.id}:`, error);
    res.status(500).json({ message: 'Erreur serveur lors de la récupération des commentaires.', error: error.message });
  }
});

// POST /api/posts/:id/comment - Commenter un post
router.post('/:id/comment', auth, async (req, res) => {
  try {
    const { text, content } = req.body; // Accept 'content' as well for frontend consistency
    const commentText = text || content; // Use whichever is provided
    
    if (!commentText) {
      return res.status(400).json({ error: 'Le texte du commentaire est requis' });
    }
    
    const post = await Post.findById(req.params.id);
    
    if (!post) {
      return res.status(404).json({ error: 'Post non trouvé' });
    }
    
    // S'assurer que le tableau comments existe et est bien un tableau
    if (!Array.isArray(post.comments)) {
      console.warn(`Post ${post._id}: Champ 'comments' n'était pas un tableau (${typeof post.comments}). Initialisation à [].`);
      post.comments = [];
    }
    
    const newComment = {
      _id: new mongoose.Types.ObjectId(), // Generate new ID for the subdocument
      user_id: req.user.id,
      text: commentText, // Use the combined variable
      createdAt: new Date(),
      likes: [] // Initialize likes array
    };
    
    // Ajouter le commentaire
    post.comments.push(newComment);
    
    await post.save();
    
    // Enrich the new comment before sending back (similar to GET /comments)
    let authorName = 'Utilisateur';
    let authorAvatar = '';
    let authorId = newComment.user_id?.toString();
    try {
        const db = mongoose.connection.useDb(databases.CHOICE_APP);
        const Users = db.model('User'); 
        const author = await Users.findById(newComment.user_id).select('name avatar profile_pic displayName photo').lean();
        if (author) {
            authorName = author.name || author.displayName || 'Utilisateur';
            authorAvatar = author.avatar || author.photo || author.profile_pic || '';
        }
    } catch (e) {
        console.error(`Erreur lors de la récupération de l'auteur du nouveau commentaire:`, e);
    }
    
    // Prepare response matching frontend Comment model
    const responseComment = {
        id: newComment._id.toString(),
        content: newComment.text,
        authorName: authorName,
        authorAvatar: authorAvatar,
        authorId: authorId,
        createdAt: newComment.createdAt,
        likes: 0,
        isLiked: false // Newly created comment is not liked by the user yet
    };

    res.status(201).json(responseComment); // Send back the enriched comment
  } catch (error) {
    console.error('Erreur lors de l\'ajout du commentaire:', error);
    res.status(500).json({ error: 'Erreur lors de l\'ajout du commentaire' });
  }
});

// --- NEW ROUTE: Like/Unlike a Comment ---
// POST /api/posts/:postId/comments/:commentId/like
router.post('/:postId/comments/:commentId/like', auth, async (req, res) => {
  try {
    const { postId, commentId } = req.params;
    const userId = req.user.id;

    if (!mongoose.Types.ObjectId.isValid(postId) || !mongoose.Types.ObjectId.isValid(commentId)) {
      return res.status(400).json({ message: 'Format d\'ID invalide.' });
    }
    
    // Find the post containing the comment
    const post = await Post.findById(postId);
    if (!post || !post.comments) {
      return res.status(404).json({ error: 'Post ou commentaires non trouvés.' });
    }

    // Find the specific comment within the post's comments array
    const comment = post.comments.id(commentId); // Mongoose subdocument .id() method
    if (!comment) {
      return res.status(404).json({ error: 'Commentaire non trouvé.' });
    }

    // Assurer que le tableau 'likes' du commentaire existe et est un tableau
    if (!Array.isArray(comment.likes)) {
       console.warn(`Comment ${comment._id} in Post ${post._id}: Champ 'likes' n'était pas un tableau (${typeof comment.likes}). Initialisation à [].`);
      comment.likes = [];
    }

    // Check if the user already liked the comment
    const userObjectId = new mongoose.Types.ObjectId(userId); // Ensure user ID is ObjectId for comparison
    const likeIndex = comment.likes.findIndex(id => id && id.equals(userObjectId));

    let isLiked;
    if (likeIndex > -1) {
      // User already liked, so unlike
      comment.likes.splice(likeIndex, 1);
      isLiked = false;
    } else {
      // User hasn't liked, so like
      comment.likes.push(userObjectId);
      isLiked = true;
    }

    // Save the parent post document to persist the change in the subdocument
    await post.save();

    res.status(200).json({ 
      message: isLiked ? 'Commentaire aimé' : 'Like retiré du commentaire', 
      isLiked: isLiked,
      likesCount: comment.likes.length 
    });

  } catch (error) {
    console.error(`❌ Erreur lors du like/unlike du commentaire ${req.params.commentId}:`, error);
    res.status(500).json({ message: 'Erreur serveur lors de l\'action sur le commentaire.', error: error.message });
  }
});

// GET /api/posts/user/:userId - Obtenir les posts d'un utilisateur
router.get('/user/:userId', async (req, res) => {
  try {
    const userId = req.params.userId;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    
    // Construire la requête (compatible avec user_id et userId)
    const query = {
      $or: [
        { user_id: userId },
        { userId: userId }
      ]
    };
    
    // Récupérer les posts avec pagination
    const posts = await Post.find(query)
      .sort({ posted_at: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .maxTimeMS(30000);
    
    // Normaliser les posts avec infos auteur
    const normalizedPostsPromises = posts.map(post => enrichPostWithAuthorInfo(post));
    const normalizedPosts = await Promise.all(normalizedPostsPromises);
    
    const total = await Post.countDocuments(query);
    
    res.status(200).json({
      posts: normalizedPosts,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total
    });
  } catch (error) {
    console.error('❌ Erreur lors de la récupération des posts de l\'utilisateur:', error);
    res.status(500).json({ 
      message: 'Erreur lors de la récupération des posts de l\'utilisateur', 
      error: error.message 
    });
  }
});

// GET /api/posts/producer/:producerId - Obtenir les posts liés à un producteur
router.get('/producer/:producerId', async (req, res) => {
  try {
    // Construire la requête (compatible avec tous les formats)
    const query = {
      $or: [
        { producer_id: req.params.producerId },
        { producerId: req.params.producerId },
        // Cas où le post est lié à un événement organisé par ce producteur
        { 
          $and: [
            { event_id: { $exists: true } },
            { producer_id: req.params.producerId }
          ]
        }
      ]
    };
    
    const posts = await Post.find(query)
      .sort({ posted_at: -1, createdAt: -1 });
    
    // Normaliser les posts avec infos auteur
    const normalizedPostsPromises = posts.map(post => enrichPostWithAuthorInfo(post));
    const normalizedPosts = await Promise.all(normalizedPostsPromises);
    
    res.status(200).json(normalizedPosts);
  } catch (error) {
    console.error('Erreur de récupération des posts du producteur:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des posts du producteur' });
  }
});

// GET /api/posts/event/:eventId - Obtenir les posts liés à un événement
router.get('/event/:eventId', async (req, res) => {
  try {
    // Construire la requête (compatible avec tous les formats)
    const query = {
      $or: [
        { event_id: req.params.eventId },
        { eventId: req.params.eventId }
      ]
    };
    
    const posts = await Post.find(query)
      .sort({ posted_at: -1, createdAt: -1 });
    
    // Normaliser les posts avec infos auteur
    const normalizedPostsPromises = posts.map(post => enrichPostWithAuthorInfo(post));
    const normalizedPosts = await Promise.all(normalizedPostsPromises);
    
    res.status(200).json(normalizedPosts);
  } catch (error) {
    console.error('Erreur de récupération des posts de l\'événement:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des posts de l\'événement' });
  }
});

// POST /api/posts/:id/share - Partager un post
router.post('/:id/share', auth, async (req, res) => {
  try {
    const originalPost = await Post.findById(req.params.id);
    
    if (!originalPost) {
      return res.status(404).json({ error: 'Post non trouvé' });
    }
    
    // Incrémenter le compteur de partages du post original
    originalPost.shares = (originalPost.shares || 0) + 1;
    await originalPost.save();
    
    // Créer un nouveau post qui partage l'original
    const { text } = req.body;
    
    const sharedPost = new Post({
      user_id: req.user.id,
      content: text || '',
      sharedPostId: originalPost._id,
      posted_at: new Date(),
      updatedAt: new Date()
    });
    
    await sharedPost.save();
    
    // Renvoyer le post avec la structure normalisée
    res.status(201).json(normalizePost(sharedPost));
  } catch (error) {
    console.error('Erreur lors du partage du post:', error);
    res.status(500).json({ error: 'Erreur lors du partage du post' });
  }
});

// GET /api/posts/producers - Obtenir les posts des producteurs
router.get('/producers', async (req, res) => {
  try {
    const { userId, limit = 10, page = 1, type } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Construire la requête pour les posts des producteurs
    // Compatible avec tous les formats
    let query = { 
      $or: [
        { producer_id: { $exists: true, $ne: null } },
        { producerId: { $exists: true, $ne: null } }
      ]
    };
    
    // Filtrer par type de producteur si spécifié
    if (type) {
      query.$and = [
        {
          $or: [
            { producer_type: type },
            { producerType: type }
          ]
        }
      ];
    }
    
    const posts = await Post.find(query)
      .sort({ posted_at: -1, createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));
    
    // Normaliser les posts avec infos auteur
    const normalizedPostsPromises = posts.map(post => enrichPostWithAuthorInfo(post));
    const normalizedPosts = await Promise.all(normalizedPostsPromises);
    
    const total = await Post.countDocuments(query);
    
    res.status(200).json({
      posts: normalizedPosts,
      totalPages: Math.ceil(total / parseInt(limit)),
      currentPage: parseInt(page),
      total
    });
  } catch (error) {
    console.error('❌ Erreur de récupération des posts producteurs:', error);
    res.status(500).json({ 
      message: 'Erreur lors de la récupération des posts producteurs', 
      error: error.message 
    });
  }
});

// POST /api/posts/:id/interest - Marquer un intérêt pour un post/producteur/événement
router.post('/:id/interest', auth, async (req, res) => {
  try {
    const postId = req.params.id;
    const userId = req.user.id; // User marking the interest

    if (!userId) {
      return res.status(401).json({ error: 'Authentification requise.' });
    }

    const post = await Post.findById(postId);
    if (!post) {
      return res.status(404).json({ error: 'Post non trouvé' });
    }

    // Déterminer la cible de l'intérêt: Producteur ou Événement
    const targetProducerId = post.producer_id || post.producerId || null;
    const targetEventId = post.event_id || post.eventId || null;
    let targetType = null;
    let targetId = null;
    let producerTypeForInterest = null; // Pour logguer le type de producteur si la cible est un producteur

    if (targetProducerId) {
        targetType = 'Producer';
        targetId = targetProducerId;
        producerTypeForInterest = post.producer_type || post.producerType || 'unknown'; // Extraire le type
    } else if (targetEventId) {
        targetType = 'Event';
        targetId = targetEventId;
    }

    if (!targetId || !targetType) {
      return res.status(400).json({ error: 'Ce post n\'est pas associé à un producteur ou événement identifiable.' });
    }

    // Accéder à la collection Interests dans CHOICE_APP DB
    const db = mongoose.connection.useDb(databases.CHOICE_APP);
    const interestCollection = db.collection('Interests');

    // Critères de recherche pour l'intérêt existant
    const existingInterestQuery = { user_id: userId };
    if (targetType === 'Producer') {
        existingInterestQuery.producer_id = targetId;
    } else { // Event
        existingInterestQuery.event_id = targetId;
    }

    const existingInterest = await interestCollection.findOne(existingInterestQuery);

    let result;
    let isInterested;

    if (existingInterest) {
      // Supprimer l'intérêt existant
      await interestCollection.deleteOne(existingInterestQuery);
      isInterested = false;
      result = { 
        message: `Intérêt pour ${targetType} retiré`,
        isInterested: isInterested,
        targetId: targetId.toString(),
        targetType: targetType
      };
    } else {
      // Ajouter un nouvel intérêt
      const interestData = {
        user_id: userId,
        target_id: targetId,
        target_type: targetType, 
        post_id: postId, // Garder une trace du post qui a déclenché l'intérêt
        created_at: new Date()
      };
      // Ajouter les champs spécifiques si nécessaire
      if (targetType === 'Producer') {
        interestData.producer_id = targetId;
        interestData.producer_type = producerTypeForInterest; // Logguer le type de producer
      } else { // Event
        interestData.event_id = targetId;
      }
      
      await interestCollection.insertOne(interestData);
      isInterested = true;
      result = { 
        message: `Intérêt pour ${targetType} ajouté`,
        isInterested: isInterested,
        targetId: targetId.toString(),
        targetType: targetType
      };
    }

    res.status(200).json(result);

  } catch (error) {
    console.error('Erreur lors de la gestion de l\'intérêt:', error);
    res.status(500).json({ error: 'Erreur serveur lors de la gestion de l\'intérêt' });
  }
});

// POST /api/posts/:id/choice - Marquer un post comme choice
router.post('/:id/choice', auth, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    
    if (!post) {
      return res.status(404).json({ error: 'Post non trouvé' });
    }
    
    // Normaliser le post pour avoir accès à ses propriétés de manière cohérente
    const normalizedPost = normalizePost(post);
    
    // S'assurer que le tableau choices existe
    if (!normalizedPost.choices) {
      normalizedPost.choices = [];
    }
    
    // Vérifier si l'utilisateur a déjà choisi ce post
    const choiceIndex = normalizedPost.choices.indexOf(req.user.id);
    
    // Mise à jour directe dans la base de données
    if (choiceIndex > -1) {
      // Retirer le choice
      await Post.findByIdAndUpdate(
        req.params.id,
        { $pull: { choices: req.user.id } }
      );
      
      res.status(200).json({ 
        message: 'Choice retiré', 
        isChoice: false
      });
    } else {
      // Ajouter le choice
      await Post.findByIdAndUpdate(
        req.params.id,
        { $addToSet: { choices: req.user.id } }
      );
      
      // Mise à jour du post complet pour compatibilité frontend
      const updatedPost = await Post.findById(req.params.id);
      const updatedNormalizedPost = normalizePost(updatedPost);
      
      res.status(200).json({ 
        message: 'Post marqué comme Choice', 
        isChoice: true,
        choiceCount: updatedNormalizedPost.choices?.length || 1
      });
    }
  } catch (error) {
    console.error('Erreur lors du choice du post:', error);
    res.status(500).json({ error: 'Erreur lors de la mise à jour du choice' });
  }
});

// Routes spécifiques pour le feed des producteurs

// GET /api/producer-feed/:producerId - Obtenir le feed principal d'un producteur
router.get('/producer-feed/:producerId', auth, async (req, res) => {
  try {
    const producerId = req.params.producerId;
    const { page = 1, limit = 10, filter = 'venue', producerType = 'restaurant' } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    console.log(`🏪 Récupération du feed producteur: ${producerId} (filtre: ${filter}, type: ${producerType})`);

    let query = {};
    let posts = [];
    let total = 0;
    let producerFollowers = [];

    // Construire la requête en fonction du filtre
    switch (filter) {
      case 'venue':
        // Posts spécifiques à l'établissement
        query = { 
          $or: [
            { producer_id: producerId },
            { producerId: producerId }
          ]
        };
        break;
      
      case 'interactions':
        // Posts d'utilisateurs mentionnant l'établissement
        query = {
          $and: [
            // Post créé par un utilisateur (non-producteur)
            { user_id: { $exists: true } },
            // Qui mentionne ce producteur
            { 
              $or: [
                { mentions: producerId },
                { target_id: producerId },
                { targetId: producerId },
                { producer_id: producerId },
                { producerId: producerId }
              ]
            }
          ]
        };
        break;
      
      case 'localTrends':
        // Tendances locales (posts populaires dans la même zone)
        // D'abord récupérer les infos du producteur pour connaître sa localisation
        const trendsDb = mongoose.connection.useDb(databases.CHOICE_APP);
        const trendsProducersCollection = trendsDb.collection('Producers');
        
        let trendProducerObjectId;
        try {
          trendProducerObjectId = new mongoose.Types.ObjectId(producerId);
        } catch (e) {
          trendProducerObjectId = producerId;
        }
        
        const trendProducer = await trendsProducersCollection.findOne({ _id: trendProducerObjectId });
        
        if (trendProducer && trendProducer.location && trendProducer.location.coordinates) {
          const { coordinates } = trendProducer.location;
          const [longitude, latitude] = coordinates;
          
          // Créer un index géospatial si nécessaire (peut être fait en dehors de la route)
          // await Post.collection.createIndex({ "location.coordinates": "2dsphere" });
          
          // Trouver les posts dans un rayon autour du producteur (par exemple 5km)
          query = {
            "location.coordinates": {
              $near: {
                $geometry: {
                  type: "Point",
                  coordinates: [longitude, latitude]
                },
                $maxDistance: 5000 // 5km en mètres
              }
            }
          };
        } else {
          // Fallback: posts les plus récents/populaires
          query = {}; // Tous les posts, triés par popularité ci-dessous
        }
        break;
      
      case 'followers':
        // NOUVEAU: Posts des followers du producteur
        console.log(`ℹ️ Récupération des followers pour ${producerId} (type: ${producerType})`);
        let targetDb;
        let TargetProducerModel;

        // Sélectionner la bonne DB et le bon Modèle
        if (producerType === 'leisure') {
          targetDb = mongoose.connection.useDb(databases.LOISIR_CULTURE);
          TargetProducerModel = targetDb.model('LeisureProducer'); // Utilise le modèle importé
        } else if (producerType === 'wellness') {
          targetDb = mongoose.connection.useDb(databases.BEAUTY_WELLNESS);
          TargetProducerModel = targetDb.model('WellnessProducer'); // Utilise le modèle importé
        } else { // default to restaurant
          targetDb = mongoose.connection.useDb(databases.RESTAURATION_OFFICIELLE);
          // Assurez-vous que le modèle Producer est correctement défini et connecté à cette DB
          // Si ProducerModel est déjà connecté à Restauration_Officielle (comme dans producers.js), c'est bon.
          // Sinon, il faut l'obtenir via targetDb.model('producer', ProducerSchema)
          TargetProducerModel = targetDb.models.producer || targetDb.model('producer', Producer.schema); // Assurez-vous que le schéma est accessible
        }

        if (!TargetProducerModel) {
           console.error(`❌ Modèle producteur non trouvé pour le type: ${producerType}`);
           posts = [];
           total = 0;
        } else {
            // Trouver le producteur pour récupérer ses followers
            let producerDoc;
            let producerObjectId;
            try {
              // Try converting to ObjectId first
              producerObjectId = new mongoose.Types.ObjectId(producerId);
            } catch (e) {
              // If conversion fails, assume it might be a string ID
              console.warn(`⚠️ Could not convert producerId ${producerId} to ObjectId, trying as string.`);
              producerObjectId = producerId; 
            }

            try {
                // Use the potentially converted/original ID for lookup
                producerDoc = await TargetProducerModel.findById(producerObjectId).select('followers').lean();
            } catch(err) {
                 console.error(`❌ Erreur lors de la recherche du producteur ${producerObjectId} (type ${producerType}): ${err}`);
            }

            if (!producerDoc || !producerDoc.followers || producerDoc.followers.length === 0) {
              console.log(`🚫 Producteur ${producerObjectId} (type ${producerType}) non trouvé ou n'a pas de followers.`);
              posts = [];
              total = 0;
            } else {
              producerFollowers = producerDoc.followers; // Array of user IDs
              console.log(`👥 ${producerFollowers.length} followers trouvés pour ${producerObjectId}`);

              // Construire la requête pour trouver les posts de ces followers
              query = {
                user_id: { $in: producerFollowers } // Assurez-vous que les posts ont bien un champ 'user_id'
              };
            }
        }
        break; // Fin du case 'followers'

      default:
        // Par défaut, renvoyer les posts de l'établissement
        query = { 
          $or: [
            { producer_id: producerId },
            { producerId: producerId }
          ]
        };
    }
    
    // Exécuter la requête et récupérer les posts (sauf si followers n'a rien trouvé)
    if (!(filter === 'followers' && total === 0 && posts.length === 0)) {
        if (filter === 'localTrends') {
          // Trier les tendances par popularité
          posts = await Post.find(query)
            .sort({ likes_count: -1, comments_count: -1, posted_at: -1 }) // Utiliser les champs comptés si possible
            .skip(skip)
            .limit(parseInt(limit));
          total = await Post.countDocuments(query);
        } else {
          // Trier les autres filtres par date
          posts = await Post.find(query)
            .sort({ posted_at: -1, createdAt: -1 })
            .skip(skip)
            .limit(parseInt(limit));
          total = await Post.countDocuments(query);
        }
    }

    // Normaliser les posts et ajouter les informations d'auteur
    // Important: Assurez-vous que enrichPostWithUserSpecificInfo est appelé si vous voulez l'état 'isLiked' etc.
    const userIdForLikeStatus = req.user?.id || null; // Récupérer l'ID de l'utilisateur authentifié (producteur)
    const normalizedPostsPromises = posts.map(post => enrichPostWithUserSpecificInfo(post, userIdForLikeStatus)); // Utiliser l'enrichissement complet
    const normalizedPosts = await Promise.all(normalizedPostsPromises);

    console.log(`✅ Posts récupérés pour le feed producteur (${filter}): ${normalizedPosts.length}`);

    res.status(200).json({
      posts: normalizedPosts,
      totalPages: Math.ceil(total / parseInt(limit)),
      currentPage: parseInt(page),
      total
    });
  } catch (error) {
    console.error('❌ Erreur lors de la récupération du feed producteur:', error);
    // Log plus détaillé
    console.error(`Error details: ${error.message}`);
    console.error(error.stack);
    res.status(500).json({
      message: 'Erreur lors de la récupération du feed producteur',
      error: error.message
    });
  }
});

// GET /api/producer-feed/:producerId/venue-posts - Obtenir les posts de l'établissement
router.get('/producer-feed/:producerId/venue-posts', auth, async (req, res) => {
  try {
    const producerId = req.params.producerId;
    const { page = 1, limit = 10 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Requête pour trouver les posts créés par ce producteur
    const query = { 
      $or: [
        { producer_id: producerId },
        { producerId: producerId }
      ]
    };
    
    const posts = await Post.find(query)
      .sort({ posted_at: -1, createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));
    
    // Normaliser les posts et ajouter les informations d'auteur
    const normalizedPostsPromises = posts.map(post => enrichPostWithAuthorInfo(post));
    const normalizedPosts = await Promise.all(normalizedPostsPromises);
    
    const total = await Post.countDocuments(query);
    
    res.status(200).json({
      posts: normalizedPosts,
      totalPages: Math.ceil(total / parseInt(limit)),
      currentPage: parseInt(page),
      total
    });
  } catch (error) {
    console.error('❌ Erreur lors de la récupération des posts de l\'établissement:', error);
    res.status(500).json({ 
      message: 'Erreur lors de la récupération des posts de l\'établissement', 
      error: error.message 
    });
  }
});

// GET /api/producer-feed/:producerId/interactions - Obtenir les interactions des utilisateurs avec l'établissement
router.get('/producer-feed/:producerId/interactions', auth, async (req, res) => {
  try {
    const producerId = req.params.producerId;
    const { page = 1, limit = 10 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Requête pour trouver les posts mentionnant ce producteur
    const query = {
      $and: [
        // Post créé par un utilisateur (non-producteur)
        { user_id: { $exists: true } },
        // Qui mentionne ce producteur
        { 
          $or: [
            { mentions: producerId },
            { target_id: producerId },
            { targetId: producerId },
            { producer_id: producerId },
            { producerId: producerId }
          ]
        }
      ]
    };
    
    const posts = await Post.find(query)
      .sort({ posted_at: -1, createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));
    
    // Normaliser les posts et ajouter les informations d'auteur
    const normalizedPostsPromises = posts.map(post => enrichPostWithAuthorInfo(post));
    const normalizedPosts = await Promise.all(normalizedPostsPromises);
    
    const total = await Post.countDocuments(query);
    
    res.status(200).json({
      posts: normalizedPosts,
      totalPages: Math.ceil(total / parseInt(limit)),
      currentPage: parseInt(page),
      total
    });
  } catch (error) {
    console.error('❌ Erreur lors de la récupération des interactions:', error);
    res.status(500).json({ 
      message: 'Erreur lors de la récupération des interactions', 
      error: error.message 
    });
  }
});

// GET /api/producer-feed/:producerId/local-trends - Obtenir les tendances locales pour un producteur
router.get('/producer-feed/:producerId/local-trends', auth, async (req, res) => {
  try {
    const producerId = req.params.producerId;
    const { page = 1, limit = 10 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // D'abord récupérer les infos du producteur pour connaître sa localisation
    const db = mongoose.connection.useDb(databases.CHOICE_APP);
    const producersCollection = db.collection('Producers');
    
    let producerObjectId;
    try {
      producerObjectId = new mongoose.Types.ObjectId(producerId);
    } catch (e) {
      producerObjectId = producerId;
    }
    
    const producer = await producersCollection.findOne({ _id: producerObjectId });
    
    let query = {};
    
    if (producer && producer.location && producer.location.coordinates) {
      // Si le producteur a des coordonnées, filtrer par localisation
      const { coordinates } = producer.location;
      const [longitude, latitude] = coordinates;
      
      // Trouver les posts dans un rayon autour du producteur (par exemple 5km)
      query = {
        "location.coordinates": {
          $near: {
            $geometry: {
              type: "Point",
              coordinates: [longitude, latitude]
            },
            $maxDistance: 5000 // 5km en mètres
          }
        }
      };
    } else if (producer && producer.address && producer.address.city) {
      // Si le producteur a une ville mais pas de coordonnées
      query = {
        $or: [
          { "location.city": producer.address.city },
          { "address.city": producer.address.city }
        ]
      };
    } else {
      // Fallback: posts les plus populaires sans filtre géographique
      query = {};
    }
    
    // Récupérer les posts les plus populaires par nombre de likes
    const posts = await Post.find(query)
      .sort({ 
        likes: -1, // Trier d'abord par nombre de likes (array length)
        comments: -1, // Puis par nombre de commentaires
        posted_at: -1 // Enfin par date
      })
      .skip(skip)
      .limit(parseInt(limit));
    
    // Normaliser les posts et ajouter les informations d'auteur
    const normalizedPostsPromises = posts.map(post => enrichPostWithAuthorInfo(post));
    const normalizedPosts = await Promise.all(normalizedPostsPromises);
    
    const total = await Post.countDocuments(query);
    
    res.status(200).json({
      posts: normalizedPosts,
      totalPages: Math.ceil(total / parseInt(limit)),
      currentPage: parseInt(page),
      total
    });
  } catch (error) {
    console.error('❌ Erreur lors de la récupération des tendances locales:', error);
    res.status(500).json({ 
      message: 'Erreur lors de la récupération des tendances locales', 
      error: error.message 
    });
  }
});

// GET /api/producer-feed/:producerId/analytics - Obtenir des statistiques pour le producteur
router.get('/producer-feed/:producerId/analytics', auth, async (req, res) => {
  try {
    const producerId = req.params.producerId;
    const { period = 'month' } = req.query;
    
    // Définir la plage de dates en fonction de la période
    const now = new Date();
    let startDate;
    
    switch (period) {
      case 'week':
        startDate = new Date();
        startDate.setDate(startDate.getDate() - 7);
        break;
      case 'month':
        startDate = new Date();
        startDate.setMonth(startDate.getMonth() - 1);
        break;
      case 'year':
        startDate = new Date();
        startDate.setFullYear(startDate.getFullYear() - 1);
        break;
      default:
        startDate = new Date();
        startDate.setMonth(startDate.getMonth() - 1);
    }
    
    // Requête pour trouver les posts du producteur dans cette période
    const query = { 
      $and: [
        {
          $or: [
            { producer_id: producerId },
            { producerId: producerId }
          ]
        },
        {
          $or: [
            { posted_at: { $gte: startDate } },
            { createdAt: { $gte: startDate } }
          ]
        }
      ]
    };
    
    // Obtenir tous les posts de la période
    const posts = await Post.find(query);
    
    // Calculer les statistiques
    const totalPosts = posts.length;
    let totalLikes = 0;
    let totalComments = 0;
    let totalShares = 0;
    
    // Extraire les métriques d'engagement
    posts.forEach(post => {
      const normalizedPost = normalizePost(post);
      
      // Compter les likes
      if (Array.isArray(normalizedPost.likes)) {
        totalLikes += normalizedPost.likes.length;
      }
      
      // Compter les commentaires
      if (Array.isArray(normalizedPost.comments)) {
        totalComments += normalizedPost.comments.length;
      }
      
      // Compter les partages
      if (normalizedPost.shares) {
        totalShares += normalizedPost.shares;
      }
    });
    
    // Calculer l'engagement total
    const totalEngagement = totalLikes + totalComments + totalShares;
    
    // Trouver le post le plus performant
    let bestPost = null;
    let bestPostEngagement = 0;
    
    posts.forEach(post => {
      const normalizedPost = normalizePost(post);
      const postLikes = Array.isArray(normalizedPost.likes) ? normalizedPost.likes.length : 0;
      const postComments = Array.isArray(normalizedPost.comments) ? normalizedPost.comments.length : 0;
      const postShares = normalizedPost.shares || 0;
      const postEngagement = postLikes + postComments + postShares;
      
      if (postEngagement > bestPostEngagement) {
        bestPostEngagement = postEngagement;
        bestPost = normalizedPost;
      }
    });
    
    // Renvoyer les statistiques
    res.status(200).json({
      period,
      totalPosts,
      engagement: {
        total: totalEngagement,
        likes: totalLikes,
        comments: totalComments,
        shares: totalShares,
        averagePerPost: totalPosts > 0 ? Math.round(totalEngagement / totalPosts) : 0
      },
      bestPerformingPost: bestPost ? await enrichPostWithAuthorInfo(bestPost) : null
    });
  } catch (error) {
    console.error('❌ Erreur lors de la récupération des statistiques:', error);
    res.status(500).json({ 
      message: 'Erreur lors de la récupération des statistiques', 
      error: error.message 
    });
  }
});

// POST /api/producer-feed/:producerId/post - Créer un nouveau post en tant que producteur
router.post('/producer-feed/:producerId/post', auth, async (req, res) => {
  try {
    const producerId = req.params.producerId;
    const { title, content, text, media, location, tags, event_id, eventId, isChoice, rating, postType } = req.body;
    
    // Vérifier que l'utilisateur a le droit de poster au nom de ce producteur
    // Cette vérification dépendra de votre logique d'authentification spécifique
    // Pour l'exemple, nous supposons que req.user.id est autorisé
    
    // Créer un objet post avec les champs normalisés pour assurer la cohérence
    const postData = {
      // Pour un post de producteur, on utilise producer_id au lieu de user_id
      producer_id: producerId,
      // Type de producteur (restaurant, leisure, wellness...)
      producer_type: req.body.producer_type || req.body.producerType || 'restaurant',
      // Utiliser content ou text selon ce qui est fourni
      content: content || text || '',
      title: title || '',
      // Assurer que media est un tableau
      media: Array.isArray(media) ? media : (media ? [media] : []),
      location,
      // Assurer que tags est un tableau
      tags: Array.isArray(tags) ? tags : (tags ? [tags] : []),
      // Lien avec un événement si spécifié
      event_id: event_id || eventId || null,
      isChoice,
      rating,
      // Marquer comme post de producteur explicitement
      isProducerPost: true,
      // Pour le tracking des posts automatisés vs manuels
      isAutomated: req.body.isAutomated || false,
      // Date de publication
      posted_at: new Date()
    };
    
    const post = new Post(postData);
    await post.save();
    
    // Enrichir le post avant de le renvoyer
    const enrichedPost = await enrichPostWithAuthorInfo(post);
    
    // Renvoyer le post avec la structure normalisée
    res.status(201).json(enrichedPost);
  } catch (error) {
    console.error('❌ Erreur lors de la création du post producteur:', error);
    res.status(500).json({ 
      message: 'Erreur lors de la création du post producteur', 
      error: error.message 
    });
  }
});

// DELETE /api/producer-feed/:producerId/post/:postId - Supprimer un post de producteur
router.delete('/producer-feed/:producerId/post/:postId', auth, async (req, res) => {
  try {
    const { producerId, postId } = req.params;
    
    // Trouver le post
    const post = await Post.findById(postId);
    
    if (!post) {
      return res.status(404).json({ error: 'Post non trouvé' });
    }
    
    // Vérifier que le post appartient bien à ce producteur
    const normalizedPost = normalizePost(post);
    const postProducerId = normalizedPost.producer_id || normalizedPost.producerId;
    
    if (postProducerId !== producerId) {
      return res.status(403).json({ 
        error: 'Vous n\'êtes pas autorisé à supprimer ce post' 
      });
    }
    
    // Supprimer le post
    await Post.findByIdAndDelete(postId);
    
    res.status(200).json({ message: 'Post supprimé avec succès' });
  } catch (error) {
    console.error('❌ Erreur lors de la suppression du post producteur:', error);
    res.status(500).json({ 
      message: 'Erreur lors de la suppression du post producteur', 
      error: error.message 
    });
  }
});

// Need to import or define logInteraction helper
// Assuming it might be available via analyticsService or a utils file
// If not available, define it here based on analyticsService.js version
async function logInteractionHelper(connections, userId, producerId, producerType, interactionType, metadata = {}) {
    // Using exports.choiceAppDb directly as connections might not be available on req here
    const { choiceAppDb } = require('../index');
    if (!choiceAppDb) { 
      console.error('Cannot log interaction: choiceAppDb connection not available.');
      return false;
    }
    try {
        const InteractionModel = choiceAppDb.model('Interaction');
        if (InteractionModel && userId) { 
            await InteractionModel.create({
                userId,
                producerId, // Note: For saving a post, producerId might not be directly relevant unless the post IS the producer
                producerType, // This also might need context from the post
                type: interactionType,
                metadata: { postId: metadata.postId, ...metadata } // Ensure postId is in metadata
            });
            return true;
        } else if (!userId) {
            console.warn(`Cannot log interaction: userId is missing`);
            return false;
        }
    } catch (error) {
        console.error(`Error logging interaction (${interactionType}):`, error);
        return false;
    }
}

// POST /api/posts/save - Save a post for a user
// TODO: Reconcile this with /api/interactions/save-post and /api/share/save
router.post('/save', auth, async (req, res) => {
  const { userId, postId } = req.body;

  if (!userId || !postId) {
    return res.status(400).json({ error: 'userId and postId are required.' });
  }

  try {
    // Assuming User model is registered on choiceAppDb
    const { choiceAppDb } = require('../index');
    if (!choiceAppDb) { return res.status(500).json({ error: 'Database connection error.' }); }
    const User = choiceAppDb.model('User'); // Get User model from the correct DB
    
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    let interactionType;
    let message;
    const savedPosts = user.saved_posts || []; // Initialize if undefined

    if (!savedPosts.includes(postId)) {
      // Save the post
      user.saved_posts.push(postId);
      interactionType = 'save';
      message = 'Post sauvegardé';
    } else {
      // Unsave the post
      user.saved_posts = savedPosts.filter(id => id.toString() !== postId.toString());
      interactionType = 'unsave'; // Log unsave action
      message = 'Post retiré des favoris';
    }

    await user.save();

    // Log the interaction (fire and forget)
    // We need producer info if we want to log it against a producer
    // For now, log against the post itself via metadata
    logInteractionHelper(null, userId, null, null, interactionType, { postId: postId });

    res.status(200).json({ message: message });

  } catch (error) {
    console.error('Error saving/unsaving post:', error);
    res.status(500).json({ error: 'Error processing save post request' });
  }
});

// GET /api/posts/:postId/likers - Obtenir la liste des utilisateurs ayant aimé un post
router.get('/:postId/likers', auth, async (req, res) => {
  try {
    const postId = req.params.postId;

    if (!mongoose.Types.ObjectId.isValid(postId)) {
      return res.status(400).json({ message: 'Format d\'ID de post invalide.' });
    }

    // Trouver le post et sélectionner uniquement le champ 'likes'
    const post = await Post.findById(postId).select('likes').lean(); // Utiliser lean() pour un objet JS simple

    if (!post) {
      return res.status(404).json({ message: 'Post non trouvé.' });
    }

    // Vérifier si 'likes' est un tableau et contient des IDs
    if (!Array.isArray(post.likes) || post.likes.length === 0) {
      return res.status(200).json([]); // Renvoyer un tableau vide si personne n'a liké ou si le champ est invalide
    }

    // Les IDs dans 'likes' peuvent être des ObjectIds ou des Strings, normaliser en ObjectId si possible
    const likerIds = post.likes.map(id => {
      try {
        return new mongoose.Types.ObjectId(id);
      } catch (e) {
        // Si la conversion échoue, l'ID n'est probablement pas un ObjectId valide, on le filtre
        console.warn(`Invalid ObjectId found in likes array for post ${postId}: ${id}`);
        return null;
      }
    }).filter(id => id !== null); // Retirer les IDs invalides

    if (likerIds.length === 0) {
       return res.status(200).json([]);
    }

    // Récupérer les détails des utilisateurs depuis la collection Users (dans CHOICE_APP DB)
    const db = mongoose.connection.useDb(databases.CHOICE_APP);
    const UserCollection = db.collection('Users');

    // Trouver les utilisateurs correspondants et sélectionner les champs nécessaires
    const likers = await UserCollection.find(
        { _id: { $in: likerIds } }
    )
    .project({ 
        _id: 1, // Garder l'ID
        name: 1, 
        displayName: 1, 
        avatar: 1, 
        photo: 1, 
        profile_pic: 1 
    })
    .toArray();

    // Formatter la réponse pour le frontend
    const formattedLikers = likers.map(user => ({
      id: user._id.toString(),
      name: user.name || user.displayName || 'Utilisateur', // Fallback name
      avatar: user.avatar || user.photo || user.profile_pic || null // Fallback avatar
    }));

    res.status(200).json(formattedLikers);

  } catch (error) {
    console.error(`❌ Erreur lors de la récupération des likers pour le post ${req.params.postId}:`, error);
    res.status(500).json({ message: 'Erreur serveur lors de la récupération des likers.', error: error.message });
  }
});

// Exporter le router
module.exports = router;

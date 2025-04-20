const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { createModel, databases } = require('../utils/modelCreator');
const { LeisureProducer } = require('../models/leisureProducer');
const WellnessPlace = require('../models/WellnessPlace');
const Producer = require('../models/Producer');

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

// GET /api/posts - Obtenir tous les posts avec pagination
router.get('/', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    
    const posts = await Post.find()
      .sort({ posted_at: -1, createdAt: -1 }) // Compatibilité avec les deux formats de date
      .skip(skip)
      .limit(limit);
    
    // Normaliser les posts et ajouter les informations d'auteur
    const normalizedPostsPromises = posts.map(post => enrichPostWithAuthorInfo(post));
    const normalizedPosts = await Promise.all(normalizedPostsPromises);
    
    const total = await Post.countDocuments();
    
    res.status(200).json({
      posts: normalizedPosts,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total
    });
  } catch (error) {
    console.error('Erreur de récupération des posts:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des posts' });
  }
});

// GET /api/posts/:id - Obtenir un post par son ID
router.get('/:id', async (req, res) => {
  const postId = req.params.id;

  // 1. PRIMARY CHECK: Validate ObjectId format FIRST
  if (!mongoose.Types.ObjectId.isValid(postId)) {
    // Log if it matches known specific paths
    if (['feed', 'restaurants', 'leisure', 'wellness', 'producers', 'save'].includes(postId)) {
      console.warn(`⚠️ Route /:id captured specific path "${postId}" due to likely route order issue or invalid request.`);
    } else {
      console.log(`ℹ️ Invalid ObjectId format received in GET /:id route: ${postId}`);
    }
    // Return 404 immediately if not a valid ObjectId format
    return res.status(404).json({ error: 'Resource non trouvé ou format d\'ID invalide' });
  }

  // 2. If it IS a valid ObjectId format, proceed with the database query
  try {
    const post = await Post.findById(postId);

    if (!post) {
      return res.status(404).json({ error: 'Post non trouvé' });
    }

    // Normaliser le post et ajouter les informations d'auteur
    const normalizedPost = await enrichPostWithAuthorInfo(post);

    res.status(200).json(normalizedPost);
  } catch (error) {
    // Catch potential errors during findById, though CastError should be caught above
    console.error('Erreur de récupération du post:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération du post' });
  }
});

// POST /api/posts - Créer un nouveau post
router.post('/', auth, async (req, res) => {
  try {
    const { title, content, text, media, location, tags, producer_id, producerId, producer_type, producerType, event_id, eventId, isChoice, rating } = req.body;
    
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
    
    // Normaliser le post pour accéder à ses propriétés de manière cohérente
    const normalizedPost = normalizePost(post);
    
    // Vérifier si l'utilisateur a déjà aimé ce post
    const isLiked = normalizedPost.likes && normalizedPost.likes.includes(req.user.id);
    
    if (isLiked) {
      // Retirer le like avec une opération MongoDB directe
      await Post.findByIdAndUpdate(
        req.params.id,
        { $pull: { likes: req.user.id } }
      );
      
      // Récupérer le post mis à jour pour le compte des likes
      const updatedPost = await Post.findById(req.params.id);
      const updatedNormalizedPost = normalizePost(updatedPost);
      
      res.status(200).json({ 
        message: 'Like retiré', 
        isLiked: false, 
        likesCount: updatedNormalizedPost.likes?.length || 0 
      });
    } else {
      // Ajouter le like avec une opération MongoDB directe
      // $addToSet garantit qu'il n'y aura pas de doublons
      await Post.findByIdAndUpdate(
        req.params.id,
        { $addToSet: { likes: req.user.id } }
      );
      
      // Récupérer le post mis à jour pour le compte des likes
      const updatedPost = await Post.findById(req.params.id);
      const updatedNormalizedPost = normalizePost(updatedPost);
      
      res.status(200).json({ 
        message: 'Post aimé', 
        isLiked: true, 
        likesCount: updatedNormalizedPost.likes?.length || 1 
      });
    }
  } catch (error) {
    console.error('Erreur lors du like du post:', error);
    res.status(500).json({ error: 'Erreur lors de la mise à jour du like' });
  }
});

// POST /api/posts/:id/comment - Commenter un post
router.post('/:id/comment', auth, async (req, res) => {
  try {
    const { text } = req.body;
    
    if (!text) {
      return res.status(400).json({ error: 'Le texte du commentaire est requis' });
    }
    
    const post = await Post.findById(req.params.id);
    
    if (!post) {
      return res.status(404).json({ error: 'Post non trouvé' });
    }
    
    // S'assurer que le tableau comments existe
    if (!post.comments) {
      post.comments = [];
    }
    
    // Ajouter le commentaire
    post.comments.push({
      user_id: req.user.id,
      text,
      createdAt: new Date()
    });
    
    await post.save();
    
    res.status(201).json({ message: 'Commentaire ajouté', comment: post.comments[post.comments.length - 1] });
  } catch (error) {
    console.error('Erreur lors de l\'ajout du commentaire:', error);
    res.status(500).json({ error: 'Erreur lors de l\'ajout du commentaire' });
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

// GET /api/posts/feed - Obtenir le feed personnalisé
router.get('/feed', async (req, res) => {
  try {
    const { userId, limit = 10, page = 1 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    if (!userId) {
      return res.status(400).json({ message: 'UserId requis' });
    }
    
    // Récupérer les posts pour le feed
    const posts = await Post.find()
      .sort({ posted_at: -1, createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));
    
    // Normaliser les posts et ajouter les informations d'auteur
    const normalizedPostsPromises = posts.map(post => enrichPostWithAuthorInfo(post));
    const normalizedPosts = await Promise.all(normalizedPostsPromises);
    
    // Compter le nombre total de posts
    const total = await Post.countDocuments();
    
    res.status(200).json({
      posts: normalizedPosts,
      totalPages: Math.ceil(total / parseInt(limit)),
      currentPage: parseInt(page),
      total
    });
  } catch (error) {
    console.error('❌ Erreur de récupération du feed:', error);
    res.status(500).json({ message: 'Erreur lors de la récupération du feed', error: error.message });
  }
});

// GET /restaurants - Obtenir les posts des restaurants
router.get('/restaurants', auth, async (req, res) => {
  try {
    const { page = 1, limit = 10, userId } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    console.log(`🍔 Récupération des posts de restaurants (page ${page}, limit ${limit})`);
    
    const query = {
      producer_type: 'restaurant',
      // Ajouter d'autres conditions si nécessaire
    };
    
    const posts = await Post.find(query)
      .sort({ posted_at: -1, createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));
    
    const total = await Post.countDocuments(query);
    
    // Enrichir les posts avec les infos d'auteur et les statuts user-specific
    const enrichedPosts = await Promise.all(
      posts.map(post => enrichPostWithUserSpecificInfo(post, userId))
    );
    
    console.log(`✅ ${enrichedPosts.length} posts de restaurants récupérés`);
    
    res.status(200).json({
      posts: enrichedPosts,
      total,
      totalPages: Math.ceil(total / parseInt(limit)),
      currentPage: parseInt(page)
    });
  } catch (error) {
    console.error('❌ Erreur lors de la récupération des posts de restaurants:', error);
    res.status(500).json({ 
      message: 'Erreur lors de la récupération des posts de restaurants', 
      error: error.message 
    });
  }
});

// GET /leisure - Obtenir les posts des établissements de loisirs
router.get('/leisure', auth, async (req, res) => {
  try {
    const { page = 1, limit = 10, userId } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    console.log(`🎮 Récupération des posts de loisirs (page ${page}, limit ${limit})`);
    
    const query = {
      producer_type: 'leisure',
      // Ajouter d'autres conditions si nécessaire
    };
    
    const posts = await Post.find(query)
      .sort({ posted_at: -1, createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));
    
    const total = await Post.countDocuments(query);
    
    // Enrichir les posts avec les infos d'auteur et les statuts user-specific
    const enrichedPosts = await Promise.all(
      posts.map(post => enrichPostWithUserSpecificInfo(post, userId))
    );
    
    console.log(`✅ ${enrichedPosts.length} posts de loisirs récupérés`);
    
    res.status(200).json({
      posts: enrichedPosts,
      total,
      totalPages: Math.ceil(total / parseInt(limit)),
      currentPage: parseInt(page)
    });
  } catch (error) {
    console.error('❌ Erreur lors de la récupération des posts de loisirs:', error);
    res.status(500).json({ 
      message: 'Erreur lors de la récupération des posts de loisirs', 
      error: error.message 
    });
  }
});

// GET /wellness - Obtenir les posts des établissements de bien-être
router.get('/wellness', auth, async (req, res) => {
  try {
    const { page = 1, limit = 10, userId } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    console.log(`💆 Récupération des posts de bien-être (page ${page}, limit ${limit})`);
    
    const query = {
      producer_type: 'wellness',
      // Ajouter d'autres conditions si nécessaire
    };
    
    const posts = await Post.find(query)
      .sort({ posted_at: -1, createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));
    
    const total = await Post.countDocuments(query);
    
    // Enrichir les posts avec les infos d'auteur et les statuts user-specific
    const enrichedPosts = await Promise.all(
      posts.map(post => enrichPostWithUserSpecificInfo(post, userId))
    );
    
    console.log(`✅ ${enrichedPosts.length} posts de bien-être récupérés`);
    
    res.status(200).json({
      posts: enrichedPosts,
      total,
      totalPages: Math.ceil(total / parseInt(limit)),
      currentPage: parseInt(page)
    });
  } catch (error) {
    console.error('❌ Erreur lors de la récupération des posts de bien-être:', error);
    res.status(500).json({ 
      message: 'Erreur lors de la récupération des posts de bien-être', 
      error: error.message 
    });
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

// POST /api/posts/:id/interest - Marquer un intérêt pour un post/producteur
router.post('/:id/interest', auth, async (req, res) => {
  try {
    const postId = req.params.id;
    const post = await Post.findById(postId);
    
    if (!post) {
      return res.status(404).json({ error: 'Post non trouvé' });
    }
    
    // Extraire l'ID du producteur du post
    const normalizedPost = normalizePost(post);
    const producerId = normalizedPost.producer_id;
    const producerType = normalizedPost.producer_type || 'restaurant';
    
    if (!producerId) {
      return res.status(400).json({ error: 'Ce post n\'est pas associé à un producteur' });
    }
    
    // Collecter des données sur l'intérêt
    const interestData = {
      user_id: req.user.id,
      producer_id: producerId,
      producer_type: producerType,
      post_id: postId,
      created_at: new Date()
    };
    
    // Déterminer quelle base de données et collection utiliser
    let dbName = databases.CHOICE_APP;
    let collectionName = 'Interests';
    
    // Accéder à la bonne base de données et collection
    const db = mongoose.connection.useDb(dbName);
    const interestCollection = db.collection(collectionName);
    
    // Vérifier si l'intérêt existe déjà
    const existingInterest = await interestCollection.findOne({
      user_id: req.user.id,
      producer_id: producerId
    });
    
    let result;
    if (existingInterest) {
      // Supprimer l'intérêt existant
      await interestCollection.deleteOne({
        user_id: req.user.id,
        producer_id: producerId
      });
      
      result = { 
        message: 'Intérêt retiré', 
        isInterested: false,
        producerId,
        producerType
      };
    } else {
      // Ajouter un nouvel intérêt
      await interestCollection.insertOne(interestData);
      
      result = { 
        message: 'Intérêt ajouté', 
        isInterested: true,
        producerId,
        producerType
      };
    }
    
    res.status(200).json(result);
  } catch (error) {
    console.error('Erreur lors de l\'ajout d\'un intérêt:', error);
    res.status(500).json({ error: 'Erreur lors de l\'ajout d\'un intérêt' });
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

// Exporter le router
module.exports = router;

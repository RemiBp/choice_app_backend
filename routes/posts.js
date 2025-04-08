const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Post = require('../models/post');

// Connexions aux bases
const postsDbChoice = mongoose.createConnection(process.env.MONGO_URI, {
  dbName: 'choice_app',
});
const postsDbRest = mongoose.createConnection(process.env.MONGO_URI, {
  dbName: 'Restauration_Officielle',
});
const leisureDb = mongoose.createConnection(process.env.MONGO_URI, {
  dbName: 'Loisir&Culture',
});

// Modèles pour les collections
const PostChoice = postsDbChoice.model(
  'Post',
  new mongoose.Schema(
    {
      title: String,
      content: String,
      tags: [String],
      user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      media: [String],
      location: {
        name: String,
        address: String,
        coordinates: [Number],
      },
      posted_at: { type: Date, default: Date.now },
      likes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], // Nouveauté : pour les likes
      choices: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], // Nouveauté : pour les choices
      comments: [
        {
          user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
          content: String,
          created_at: { type: Date, default: Date.now },
        },
      ],
    },
    { strict: false }
  ),
  'Posts'
);

const PostRest = postsDbRest.model(
  'Post',
  new mongoose.Schema({}, { strict: false }),
  'Posts' // Collection des posts dans Restauration_Officielle
);

const Event = leisureDb.model(
  'Event',
  new mongoose.Schema({}, { strict: false }),
  'Loisir_Paris_Evenements'
);

const LeisureProducer = leisureDb.model(
  'LeisureProducer',
  new mongoose.Schema({}, { strict: false }),
  'Loisir_Paris_Producers'
);

const User = postsDbChoice.model(
  'User',
  new mongoose.Schema(
    {
      name: String,
      email: String,
      liked_tags: [String],
      comments: [
        {
          post_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Post' },
          content: String,
          created_at: { type: Date, default: Date.now },
        },
      ],
      liked_posts: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Post' }], // Nouveauté : posts likés
      choices: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Post' }], // Nouveauté : posts choisis
    },
    { strict: false }
  ),
  'Users'
);

// Middleware d'authentification (à importer si nécessaire)
const auth = async (req, res, next) => {
  // Votre logique d'authentification ici
  next();
};

// GET /api/posts - Obtenir tous les posts avec pagination
router.get('/', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    
    const posts = await Post.find()
      .sort({ createdAt: -1 }) // Du plus récent au plus ancien
      .skip(skip)
      .limit(limit);
    
    const total = await Post.countDocuments();
    
    res.status(200).json({
      posts,
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
  try {
    const post = await Post.findById(req.params.id);
    
    if (!post) {
      return res.status(404).json({ error: 'Post non trouvé' });
    }
    
    res.status(200).json(post);
  } catch (error) {
    console.error('Erreur de récupération du post:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération du post' });
  }
});

// POST /api/posts - Créer un nouveau post
router.post('/', auth, async (req, res) => {
  try {
    const { text, media, location, locationName, tags, producerId, producerType, eventId, isChoice, rating } = req.body;
    
    const post = new Post({
      userId: req.user.id,
      text,
      media,
      location,
      locationName,
      tags,
      producerId,
      producerType,
      eventId,
      isChoice,
      rating
    });
    
    await post.save();
    
    res.status(201).json(post);
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
    if (post.userId !== req.user.id) {
      return res.status(403).json({ error: 'Vous n\'êtes pas autorisé à modifier ce post' });
    }
    
    const updates = req.body;
    
    // Empêcher la modification de certains champs
    delete updates.userId;
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
    
    res.status(200).json(updatedPost);
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
    if (post.userId !== req.user.id) {
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
    
    // Vérifier si l'utilisateur a déjà aimé ce post
    const likeIndex = post.likes.indexOf(req.user.id);
    
    if (likeIndex > -1) {
      // Retirer le like
      post.likes.splice(likeIndex, 1);
      await post.save();
      
      res.status(200).json({ message: 'Like retiré', isLiked: false, likesCount: post.likes.length });
    } else {
      // Ajouter le like
      post.likes.push(req.user.id);
      await post.save();
      
      res.status(200).json({ message: 'Post aimé', isLiked: true, likesCount: post.likes.length });
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
    
    // Ajouter le commentaire
    post.comments.push({
      userId: req.user.id,
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
    const posts = await Post.find({ userId: req.params.userId })
      .sort({ createdAt: -1 });
    
    res.status(200).json(posts);
  } catch (error) {
    console.error('Erreur de récupération des posts de l\'utilisateur:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des posts de l\'utilisateur' });
  }
});

// GET /api/posts/producer/:producerId - Obtenir les posts liés à un producteur
router.get('/producer/:producerId', async (req, res) => {
  try {
    const posts = await Post.find({ producerId: req.params.producerId })
      .sort({ createdAt: -1 });
    
    res.status(200).json(posts);
  } catch (error) {
    console.error('Erreur de récupération des posts du producteur:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des posts du producteur' });
  }
});

// GET /api/posts/event/:eventId - Obtenir les posts liés à un événement
router.get('/event/:eventId', async (req, res) => {
  try {
    const posts = await Post.find({ eventId: req.params.eventId })
      .sort({ createdAt: -1 });
    
    res.status(200).json(posts);
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
      userId: req.user.id,
      text: text || '',
      sharedPostId: originalPost._id,
      createdAt: new Date(),
      updatedAt: new Date()
    });
    
    await sharedPost.save();
    
    res.status(201).json(sharedPost);
  } catch (error) {
    console.error('Erreur lors du partage du post:', error);
    res.status(500).json({ error: 'Erreur lors du partage du post' });
  }
});

// POST /api/posts/:id/view - Enregistrer une vue sur un post
router.post('/:id/view', async (req, res) => {
  try {
    const postId = req.params.id;
    const { userId } = req.body;

    if (!postId) {
      return res.status(400).json({ error: 'ID du post est requis' });
    }

    // Vérifier si le post existe
    const post = await Post.findById(postId);
    
    if (!post) {
      return res.status(404).json({ error: 'Post non trouvé' });
    }
    
    // Incrémenter le compteur de vues du post
    post.views_count = (post.views_count || 0) + 1;
    
    // Si c'est la première vue, initialiser le tableau des vues
    if (!post.views) {
      post.views = [];
    }
    
    // Ajouter un enregistrement de vue si userId est fourni
    if (userId) {
      post.views.push({
        userId,
        timestamp: new Date()
      });
    }
    
    await post.save();
    
    res.status(200).json({ 
      success: true,
      views_count: post.views_count
    });
  } catch (error) {
    console.error('Erreur lors de l\'enregistrement de la vue du post:', error);
    res.status(500).json({ error: 'Erreur lors de l\'enregistrement de la vue' });
  }
});

module.exports = router;

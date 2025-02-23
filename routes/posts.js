const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

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

// Route pour liker un post
router.post('/:id/like', async (req, res) => {
  const { id } = req.params;
  const { user_id } = req.body;

  if (!user_id) {
    return res.status(400).json({ error: 'user_id est requis.' });
  }

  try {
    const post = await PostChoice.findById(id);
    if (!post) {
      return res.status(404).json({ error: 'Post introuvable.' });
    }

    if (!post.likes.includes(user_id)) {
      post.likes.push(user_id);
      await post.save();

      const user = await User.findById(user_id);
      if (user && !user.liked_posts.includes(id)) {
        user.liked_posts.push(id);
        await user.save();
      }
    }

    res.status(200).json({ message: 'Post liké avec succès.', likes: post.likes });
  } catch (error) {
    console.error('Erreur lors du like du post :', error.message);
    res.status(500).json({ error: 'Erreur interne du serveur.' });
  }
});

// Route pour choisir un post (Choice)
router.post('/:id/choice', async (req, res) => {
  const { id } = req.params;
  const { user_id } = req.body;

  if (!user_id) {
    return res.status(400).json({ error: 'user_id est requis.' });
  }

  try {
    const post = await PostChoice.findById(id);
    if (!post) {
      return res.status(404).json({ error: 'Post introuvable.' });
    }

    if (!post.choices.includes(user_id)) {
      post.choices.push(user_id);
      await post.save();

      const user = await User.findById(user_id);
      if (user && !user.choices.includes(id)) {
        user.choices.push(id);
        await user.save();
      }
    }

    res.status(200).json({ message: 'Post ajouté aux choices avec succès.', choices: post.choices });
  } catch (error) {
    console.error('Erreur lors de l\'ajout aux choices :', error.message);
    res.status(500).json({ error: 'Erreur interne du serveur.' });
  }
});

// Route pour récupérer un post spécifique avec les likes et choices
router.get('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const post = await PostChoice.findById(id)
      .populate('comments.user_id', 'name email')
      .populate('likes', 'name')
      .populate('choices', 'name');
    if (!post) {
      return res.status(404).json({ error: 'Post introuvable.' });
    }

    res.status(200).json(post);
  } catch (error) {
    console.error('Erreur lors de la récupération du post :', error.message);
    res.status(500).json({ error: 'Erreur interne du serveur.' });
  }
});


// Fonction pour calculer le score du post
function calculatePostScore(user, post, now) {
  let score = 0;

  // Correspondance des tags
  const tagsMatched = post.tags?.filter((tag) => user.liked_tags.includes(tag)).length || 0;
  score += tagsMatched * 10;

  // Cercle de confiance
  if (user.trusted_circle?.includes(post.user_id)) score += 25;

  // Bonus de récence
  const hoursSincePosted = (now - new Date(post.posted_at)) / (1000 * 60 * 60);
  score += Math.max(0, 20 - hoursSincePosted);

  return score;
}

// Fonction pour normaliser les posts
function normalizePost(post, user) {
  return {
    _id: post._id,
    author_id: post.user_id || post.producer_id || 'Inconnu',
    author_name: post.author_name || (post.producer_id ? 'Producteur' : 'Utilisateur'),
    author_photo: post.author_photo || null,
    title: post.title || 'Titre non spécifié',
    content: post.content || 'Contenu non disponible',
    tags: post.tags || [],
    location: post.location || { name: 'Localisation inconnue', coordinates: [] },
    event_id: post.event_id || null,
    media: post.media || [],
    posted_at: post.posted_at || new Date().toISOString(),
    relevance_score: calculatePostScore(user, post, new Date()),
  };
}

// Route pour récupérer tous les posts
router.get('/', async (req, res) => {
  try {
    const [postsChoice, postsRest] = await Promise.all([
      PostChoice.find().sort({ posted_at: -1 }),
      PostRest.find().sort({ posted_at: -1 }),
    ]);

    res.json([...postsChoice, ...postsRest]);
  } catch (error) {
    console.error('Erreur lors de la récupération des posts :', error.message);
    res.status(500).json({ message: 'Erreur serveur.' });
  }
});

// Route pour récupérer un post spécifique par ID
router.get('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: 'ID invalide.' });
    }

    const [postChoice, postRest, event, leisureProducer] = await Promise.all([
      PostChoice.findById(id).populate('comments.user_id', 'name email'),
      PostRest.findById(id),
      Event.findById(id),
      LeisureProducer.findById(id),
    ]);

    if (postChoice) return res.status(200).json({ type: 'postChoice', ...postChoice.toObject() });
    if (postRest) return res.status(200).json({ type: 'postRest', ...postRest.toObject() });
    if (event) return res.status(200).json({ type: 'event', ...event.toObject() });
    if (leisureProducer) return res.status(200).json({ type: 'leisureProducer', ...leisureProducer.toObject() });

    res.status(404).json({ message: 'Document non trouvé.' });
  } catch (error) {
    console.error('Erreur lors de la récupération du document :', error.message);
    res.status(500).json({ message: 'Erreur serveur.' });
  }
});

// Route pour ajouter un commentaire à un post
router.post('/:id/comments', async (req, res) => {
  const { id } = req.params;
  const { user_id, content } = req.body;

  if (!user_id || !content) {
    return res.status(400).json({ error: 'user_id et content sont requis.' });
  }

  try {
    const post = await PostChoice.findById(id);
    if (!post) {
      return res.status(404).json({ error: 'Post introuvable.' });
    }

    const newComment = { user_id, content };
    post.comments.push(newComment);
    await post.save();

    const user = await User.findById(user_id);
    if (!user) {
      return res.status(404).json({ error: 'Utilisateur introuvable.' });
    }

    user.comments.push({ post_id: id, content });
    await user.save();

    res.status(201).json({ message: 'Commentaire ajouté avec succès.', post });
  } catch (error) {
    console.error('Erreur lors de l\'ajout du commentaire :', error.message);
    res.status(500).json({ error: 'Erreur interne du serveur.' });
  }
});

// Route pour générer le feed
router.get('/feed', async (req, res) => {
  const { userId, limit = 10, query } = req.query;

  if (!userId) {
    return res.status(400).json({ error: 'User ID est requis.' });
  }

  try {
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'Utilisateur non trouvé.' });
    }

    let [postsChoice, postsRest] = await Promise.all([
      PostChoice.find().lean(),
      PostRest.find().lean(),
    ]);

    let posts = [...postsChoice, ...postsRest];

    if (query) {
      const queryRegex = new RegExp(query, 'i');
      posts = posts.filter(
        (post) =>
          queryRegex.test(post.content) ||
          post.tags.some((tag) => queryRegex.test(tag))
      );
    }

    const normalizedPosts = posts.map((post) => normalizePost(post, user));
    const sortedFeed = normalizedPosts
      .sort((a, b) => b.relevance_score - a.relevance_score)
      .slice(0, limit);

    res.json(sortedFeed);
  } catch (error) {
    console.error('Erreur lors de la génération du feed :', error.message);
    res.status(500).json({ error: 'Erreur interne du serveur.' });
  }
});

// Route pour créer un post
router.post('/', async (req, res) => {
  const { user_id, target_id, target_type, content, tags, media, choice } = req.body;

  // Vérification des champs obligatoires
  if (!user_id || !content || !target_id || !target_type) {
    return res.status(400).json({
      error: 'Les champs user_id, target_id, target_type, et content sont requis.',
    });
  }

  try {
    // Vérifier si le target_type est valide
    if (!['event', 'producer'].includes(target_type)) {
      return res.status(400).json({ error: "Le type de cible doit être 'event' ou 'producer'." });
    }

    // Récupérer le modèle correspondant (events ou producers)
    const targetModel =
      target_type === 'event'
        ? Event
        : target_type === 'producer'
        ? postsDbRest.model(
            'Producer',
            new mongoose.Schema({}, { strict: false }),
            'Restauration_Producers'
          )
        : null;

    if (!targetModel) {
      return res.status(500).json({ error: "Le modèle cible n'a pas pu être déterminé." });
    }

    // Vérifier l'existence de l'entité associée
    const targetEntity = await targetModel.findById(target_id);
    if (!targetEntity) {
      return res.status(404).json({ error: 'Cible introuvable.' });
    }

    // Création du post
    const newPost = new PostChoice({
      user_id,
      target_id,
      target_type,
      content,
      tags: tags || [],
      media: media || [],
      posted_at: new Date(),
    });

    // Sauvegarder le post
    const savedPost = await newPost.save();

    // Ajouter l'utilisateur au choix de la cible si "choice" est précisé
    if (choice) {
      targetEntity.choices = targetEntity.choices || [];
      if (!targetEntity.choices.includes(user_id)) {
        targetEntity.choices.push(user_id);
        await targetEntity.save();
      }
    }

    res.status(201).json({
      message: 'Post créé avec succès.',
      post_id: savedPost._id,
    });
  } catch (error) {
    console.error('Erreur lors de la création du post :', error.message);
    res.status(500).json({ error: 'Erreur interne du serveur.' });
  }
});

module.exports = router;

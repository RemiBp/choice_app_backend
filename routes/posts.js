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

// Route pour générer le feed - DÉPLACER CETTE ROUTE EN PREMIER
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
  const tagsMatched = post.tags?.filter((tag) => (user.liked_tags || []).includes(tag)).length || 0;
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
  // Identifier les followers de l'utilisateur - transforme en strings pour comparaison
  const followingUsers = (user.following || []).map(id => id.toString());
  const followingProducers = (user.followingProducers || []).map(id => id.toString());
  
  // Compter les interactions totales
  const likesCount = post.likes ? post.likes.length : 0;
  const choicesCount = post.choices ? post.choices.length : 0;
  const interestsCount = post.interestedUsers ? post.interestedUsers.length : 0;
  
  // Compter les interactions des followers
  const followersLikesCount = post.likes ? 
    post.likes.filter(likeId => followingUsers.includes(likeId.toString())).length : 0;
  
  const followersChoicesCount = post.choices ? 
    post.choices.filter(choiceId => followingUsers.includes(choiceId.toString())).length : 0;
  
  const followersInterestsCount = post.interestedUsers ? 
    post.interestedUsers.filter(interestId => followingUsers.includes(interestId.toString())).length : 0;
  
  // Obtenir les informations de l'entité associée si présente (restaurant/événement)
  let entityInteractions = {
    entity_type: null,
    entity_id: null,
    entity_name: null,
    interests_count: 0,
    choices_count: 0,
    followers_interests_count: 0,
    followers_choices_count: 0
  };
  
  // Si le post est associé à un producer ou event
  if (post.target_id && post.target_type) {
    entityInteractions.entity_type = post.target_type;
    entityInteractions.entity_id = post.target_id;
    entityInteractions.entity_name = post.target_name || 'Nom non disponible';
    
    // Si nous avons des données d'interactions directement sur le post
    if (post.entity_interests_count) {
      entityInteractions.interests_count = post.entity_interests_count;
    }
    
    if (post.entity_choices_count) {
      entityInteractions.choices_count = post.entity_choices_count;
    }
    
    // Note: Les compteurs de followers seraient idéalement remplis via une requête séparée
  }
  
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
    target_id: post.target_id || null,
    target_type: post.target_type || null,
    media: post.media || [],
    posted_at: post.posted_at || new Date().toISOString(),
    relevance_score: calculatePostScore(user, post, new Date()),
    
    // Interactions sur le post
    post_interactions: {
      likes_count: likesCount,
      choices_count: choicesCount,
      interests_count: interestsCount,
      followers_likes_count: followersLikesCount,
      followers_choices_count: followersChoicesCount,
      followers_interests_count: followersInterestsCount
    },
    
    // Interactions sur l'entité associée
    entity_interactions: entityInteractions,
    
    // État des interactions pour l'utilisateur actuel
    user_interactions: {
      user_liked: post.likes ? post.likes.includes(user._id.toString()) : false,
      user_choice: post.choices ? post.choices.includes(user._id.toString()) : false,
      user_interested: post.interestedUsers ? post.interestedUsers.includes(user._id.toString()) : false,
      user_entity_choice: post.entity_user_choice || false,
      user_entity_interest: post.entity_user_interest || false
    }
  };
}

// Route pour récupérer tous les posts
router.get('/', async (req, res) => {
  const { userId, page = 1, limit = 10, producerId, prioritizeFollowers = 'false', sort = 'time' } = req.query;

  try {
    console.log('🔍 GET /api/posts');
    console.log('Query params:', { userId, page, limit, producerId, prioritizeFollowers, sort });

  // Construire la requête de base
  let choiceQuery = {};
  let restQuery = {};

  // Filtrer par producerId si fourni (pour les posts spécifiques à un lieu)
  if (producerId) {
    choiceQuery.producer_id = producerId;
    restQuery.producer_id = producerId;
    console.log(`🏢 Filtering posts for producer: ${producerId}`);
    
    // Si venueOnly est true, assurer un filtrage strict des posts de ce lieu spécifique
    if (req.query.venueOnly === 'true') {
      choiceQuery.isProducerPost = true;
      restQuery.isProducerPost = true;
      console.log('🔒 Using strict venue filtering (venueOnly=true)');
    }
  }

    // Obtenir les données de l'utilisateur si userId est fourni
    let user = null;
    let followingIds = [];
    if (userId) {
      user = await User.findById(userId).select('following followingProducers interests choices');
      if (user) {
        followingIds = [
          ...(user.following || []), 
          ...(user.followingProducers || [])
        ].map(id => id.toString());
        console.log(`👥 User has ${followingIds.length} following connections`);
      }
    }

    let allPosts = [];
    
    // Gérer le cas où on priorise les posts des followers
    if (prioritizeFollowers === 'true' && followingIds.length > 0 && userId) {
      console.log('🔝 Prioritizing posts from followed users and interests');
      
      // Construire les requêtes pour les posts des followers
      const followersChoiceQuery = {
        ...choiceQuery,
        $or: [
          { user_id: { $in: followingIds } },
          { producer_id: { $in: followingIds } },
          { producer_id: { $in: user.interests || [] } },
          { producer_id: { $in: user.choices || [] } }
        ]
      };
      
      const followersRestQuery = {
        ...restQuery,
        $or: [
          { user_id: { $in: followingIds } },
          { producer_id: { $in: followingIds } },
          { producer_id: { $in: user.interests || [] } },
          { producer_id: { $in: user.choices || [] } }
        ]
      };
      
      // Récupérer d'abord les posts des followers
      const [followerPostsChoice, followerPostsRest] = await Promise.all([
        PostChoice.find(followersChoiceQuery)
          .sort({ posted_at: -1 })
          .limit(parseInt(limit))
          .lean(),
        PostRest.find(followersRestQuery)
          .sort({ posted_at: -1 })
          .limit(parseInt(limit))
          .lean()
      ]);
      
      const followerPosts = [...followerPostsChoice, ...followerPostsRest];
      console.log(`👨‍👩‍👧‍👦 Found ${followerPosts.length} posts from followed users`);
      
      // Si on n'a pas assez de posts des followers, compléter avec d'autres posts
      if (followerPosts.length < parseInt(limit)) {
        const remainingLimit = parseInt(limit) - followerPosts.length;
        console.log(`🔍 Fetching ${remainingLimit} additional posts to complete the feed`);
        
        // Exclure les IDs des posts déjà récupérés
        const excludeIds = followerPosts.map(p => p._id);
        
        const [otherPostsChoice, otherPostsRest] = await Promise.all([
          PostChoice.find({
            ...choiceQuery,
            _id: { $nin: excludeIds },
            user_id: { $nin: followingIds }
          })
            .sort({ posted_at: -1 })
            .skip((page - 1) * remainingLimit)
            .limit(remainingLimit)
            .lean(),
          PostRest.find({
            ...restQuery,
            _id: { $nin: excludeIds },
            user_id: { $nin: followingIds }
          })
            .sort({ posted_at: -1 })
            .skip((page - 1) * remainingLimit)
            .limit(remainingLimit)
            .lean()
        ]);
        
        allPosts = [...followerPosts, ...otherPostsChoice, ...otherPostsRest];
      } else {
        allPosts = followerPosts;
      }
    } else {
      // Récupération standard des posts sans prioritization
      const [postsChoice, postsRest] = await Promise.all([
        PostChoice.find(choiceQuery)
          .sort({ posted_at: -1 })
          .skip((page - 1) * limit)
          .limit(parseInt(limit))
          .lean(),
        PostRest.find(restQuery)
          .sort({ posted_at: -1 })
          .skip((page - 1) * limit)
          .limit(parseInt(limit))
          .lean(),
      ]);
      
      allPosts = [...postsChoice, ...postsRest];
    }
    
    console.log(`📦 Found ${allPosts.length} total posts`);

    // Normaliser et trier les posts avec l'algorithme amélioré
    let normalizedPosts = allPosts.map(post => {
        // Enrichir les posts avec des informations sur les interactions des followers
        if (user) {
          const isProducerPost = !!post.producer_id;
          
          // Compter les interactions des followers si l'utilisateur a des followers
          if (followingIds.length > 0 && isProducerPost) {
            // Followers qui ont liké ce post
            const followerLikes = post.likes ? 
              post.likes.filter(id => followingIds.includes(id.toString())).length : 0;
              
            // Followers intéressés par ce producer
            const followerInterests = post.interestedUsers ? 
              post.interestedUsers.filter(id => followingIds.includes(id.toString())).length : 0;
              
            // Ajouter ces métriques au post
            post.follower_likes_count = followerLikes;
            post.follower_interests_count = followerInterests;
            
            // Statistiques d'entité (producer/lieu)
            if (post.producer_id) {
              post.entity_interests_count = post.interestedUsers ? post.interestedUsers.length : 0;
              post.entity_choices_count = post.choiceUsers ? post.choiceUsers.length : 0;
            }
          }
          
          return normalizePost(post, user);
        } else {
          return {
            ...post,
            likes_count: post.likes ? post.likes.length : 0,
            choices_count: post.choices ? post.choices.length : 0,
            interests_count: post.interestedUsers ? post.interestedUsers.length : 0
          };
        }
    });
    
    // Appliquer un tri basé sur la pertinence si demandé
    if (sort === 'relevance' || prioritizeFollowers === 'true') {
      console.log('🔄 Applying relevance-based sorting algorithm');
      const followersWeight = parseInt(req.query.followersWeight) || 2;
      
      normalizedPosts.sort((a, b) => {
        let scoreA = 0;
        let scoreB = 0;
        
        // Facteur temps (posts plus récents ont un score plus élevé)
        const dateA = new Date(a.posted_at || a.time_posted);
        const dateB = new Date(b.posted_at || b.time_posted);
        const now = new Date();
        
        // Score basé sur le temps (0-10, plus récent = plus élevé)
        const timeFactorA = 10 - Math.min(10, (now - dateA) / (1000 * 60 * 60 * 24 * 3)); // max 3 jours
        const timeFactorB = 10 - Math.min(10, (now - dateB) / (1000 * 60 * 60 * 24 * 3));
        
        scoreA += timeFactorA;
        scoreB += timeFactorB;
        
        // Si on a des follower_likes_count, les utiliser pour le score
        if (a.follower_likes_count !== undefined && b.follower_likes_count !== undefined) {
          scoreA += a.follower_likes_count * followersWeight;
          scoreB += b.follower_likes_count * followersWeight;
        }
        
        // Si on a des follower_interests_count, les utiliser pour le score
        if (a.follower_interests_count !== undefined && b.follower_interests_count !== undefined) {
          scoreA += a.follower_interests_count * followersWeight;
          scoreB += b.follower_interests_count * followersWeight;
        }
        
        // Points additionnels pour les posts automatisés des followers
        if (a.is_automated && a.follower_likes_count > 0) scoreA += 1;
        if (b.is_automated && b.follower_likes_count > 0) scoreB += 1;
        
        // Facteurs d'engagement (likes, commentaires augmentent la pertinence)
        const engagementA = (a.likes_count || 0) + ((a.comments_count || 0) * 2);
        const engagementB = (b.likes_count || 0) + ((b.comments_count || 0) * 2);
        
        // Normaliser l'engagement à 0-5 et l'ajouter au score
        const maxEngagement = Math.max(engagementA, engagementB, 20);
        scoreA += (engagementA / maxEngagement) * 5;
        scoreB += (engagementB / maxEngagement) * 5;
        
        // Posts d'événements à venir ont un score plus élevé
        if (a.is_event && a.event_date && new Date(a.event_date) > now) scoreA += 3;
        if (b.is_event && b.event_date && new Date(b.event_date) > now) scoreB += 3;
        
        // Comparaison finale (score plus élevé en premier)
        return scoreB - scoreA;
      });
    } else {
      // Tri par date si pas de tri par pertinence demandé
      console.log('🕒 Applying time-based sorting');
      normalizedPosts.sort((a, b) => {
        const dateA = new Date(a.posted_at || a.time_posted);
        const dateB = new Date(b.posted_at || b.time_posted);
        return dateB - dateA;
      });
    }
    
    // Limiter au nombre demandé
    normalizedPosts = normalizedPosts.slice(0, limit);

    console.log(`🔄 Returning ${normalizedPosts.length} normalized posts with enhanced interaction data`);

    res.json(normalizedPosts);
  } catch (error) {
    console.error('❌ Error in GET /api/posts:', error);
    res.status(500).json({ 
      error: 'Erreur interne du serveur.',
      details: error.message 
    });
  }
});

// Route pour récupérer un post spécifique par ID - GARDER CETTE ROUTE APRÈS /feed
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

// Route pour récupérer les utilisateurs ayant interagi avec un post
router.get('/:id/interactions/:type', async (req, res) => {
  const { id, type } = req.params;
  const { userId } = req.query; // Optionnel: l'ID de l'utilisateur demandant l'information
  
  // Vérifier que le type est valide
  if (!['likes', 'choices', 'interests'].includes(type)) {
    return res.status(400).json({ message: 'Type d\'interaction invalide. Utilisez: likes, choices, interests' });
  }
  
  try {
    // Récupérer le post
    const post = await PostChoice.findById(id).lean();
    if (!post) {
      return res.status(404).json({ message: 'Post introuvable' });
    }
    
    // Déterminer la liste des utilisateurs ayant interagi
    let interactionUserIds = [];
    if (type === 'likes') {
      interactionUserIds = post.likes || [];
    } else if (type === 'choices') {
      interactionUserIds = post.choices || [];
    } else if (type === 'interests') {
      interactionUserIds = post.interestedUsers || [];
    }
    
    if (interactionUserIds.length === 0) {
      return res.status(200).json({ 
        all_users: [],
        follower_users: [],
        counts: {
          total: 0,
          followers: 0
        }
      });
    }
    
    // Récupérer les détails des utilisateurs
    const users = await User.find({ _id: { $in: interactionUserIds } })
      .select('_id name photo_url followers_count')
      .lean();
    
    // Si un userId est fourni, récupérer ses following
    let followingUserIds = [];
    if (userId) {
      const currentUser = await User.findById(userId).select('following followingProducers').lean();
      if (currentUser) {
        followingUserIds = [...(currentUser.following || []), ...(currentUser.followingProducers || [])].map(id => id.toString());
      }
    }
    
    // Séparer les utilisateurs en deux listes
    const allUsers = users;
    const followerUsers = userId ? users.filter(user => followingUserIds.includes(user._id.toString())) : [];
    
    res.status(200).json({
      all_users: allUsers,
      follower_users: followerUsers,
      counts: {
        total: allUsers.length,
        followers: followerUsers.length
      }
    });
    
  } catch (error) {
    console.error(`❌ Erreur lors de la récupération des ${type} du post:`, error.message);
    res.status(500).json({ message: 'Erreur interne du serveur.' });
  }
});

// Route pour récupérer les utilisateurs ayant interagi avec une entité (restaurant/événement)
router.get('/entity/:entityType/:entityId/interactions/:type', async (req, res) => {
  const { entityType, entityId, type } = req.params;
  const { userId } = req.query; // Optionnel: l'ID de l'utilisateur demandant l'information
  
  // Vérifier que les paramètres sont valides
  if (!['producer', 'event'].includes(entityType)) {
    return res.status(400).json({ message: 'Type d\'entité invalide. Utilisez: producer, event' });
  }
  
  if (!['interests', 'choices'].includes(type)) {
    return res.status(400).json({ message: 'Type d\'interaction invalide. Utilisez: interests, choices' });
  }
  
  try {
    // Déterminer le modèle à utiliser
    let entityModel;
    if (entityType === 'producer') {
      entityModel = postsDbRest.model('Producer', new mongoose.Schema({}, { strict: false }), 'producers');
    } else {
      entityModel = leisureDb.model('LeisureEvent', new mongoose.Schema({}, { strict: false }), 'Loisir_Paris_Evenements');
    }
    
    // Récupérer l'entité
    const entity = await entityModel.findById(entityId).lean();
    if (!entity) {
      return res.status(404).json({ message: 'Entité introuvable' });
    }
    
    // Déterminer la liste des utilisateurs ayant interagi
    let interactionUserIds = [];
    if (type === 'interests') {
      interactionUserIds = entity.interestedUsers || [];
    } else if (type === 'choices') {
      // Pour les choices, vérifier si c'est un tableau ou un tableau d'objets
      if (entity.choiceUsers && Array.isArray(entity.choiceUsers)) {
        if (entity.choiceUsers.length > 0 && typeof entity.choiceUsers[0] === 'object') {
          interactionUserIds = entity.choiceUsers.map(choice => choice.userId);
        } else {
          interactionUserIds = entity.choiceUsers;
        }
      }
    }
    
    if (interactionUserIds.length === 0) {
      return res.status(200).json({ 
        all_users: [],
        follower_users: [],
        counts: {
          total: 0,
          followers: 0
        }
      });
    }
    
    // Récupérer les détails des utilisateurs
    const users = await User.find({ _id: { $in: interactionUserIds } })
      .select('_id name photo_url followers_count')
      .lean();
    
    // Si un userId est fourni, récupérer ses following
    let followingUserIds = [];
    if (userId) {
      const currentUser = await User.findById(userId).select('following followingProducers').lean();
      if (currentUser) {
        followingUserIds = [...(currentUser.following || []), ...(currentUser.followingProducers || [])].map(id => id.toString());
      }
    }
    
    // Séparer les utilisateurs en deux listes
    const allUsers = users;
    const followerUsers = userId ? users.filter(user => followingUserIds.includes(user._id.toString())) : [];
    
    res.status(200).json({
      all_users: allUsers,
      follower_users: followerUsers,
      counts: {
        total: allUsers.length,
        followers: followerUsers.length
      }
    });
    
  } catch (error) {
    console.error(`❌ Erreur lors de la récupération des ${type} de l'entité:`, error.message);
    res.status(500).json({ message: 'Erreur interne du serveur.' });
  }
});

module.exports = router;

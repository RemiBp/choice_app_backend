const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

// Helper function to convert string IDs to ObjectIds
const toObjectId = (id) => {
  if (!id) return null;
  
  try {
    if (mongoose.Types.ObjectId.isValid(id)) {
      return new mongoose.Types.ObjectId(id);
    }
    return id; // Return original if not valid ObjectId format
  } catch (error) {
    console.error('Error converting to ObjectId:', error.message);
    return id; // Return original on error
  }
};

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
const testDb = mongoose.createConnection(process.env.MONGO_URI, {
  dbName: 'test',
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

// Route pour liker un post ou marquer un intérêt selon le type de post
router.post('/:id/like', async (req, res) => {
  const { id } = req.params;
  const { user_id, isLeisureProducer = false } = req.body;

  if (!user_id) {
    return res.status(400).json({ error: 'user_id est requis.' });
  }

  try {
    // Convertir les IDs en ObjectId si nécessaire
    const postId = toObjectId(id);
    const userId = toObjectId(user_id);
    
    // 1. D'abord, essayer de traiter comme un post standard
    const post = await PostChoice.findById(postId);
    
    if (post) {
      console.log(`📌 Post trouvé avec ID ${postId}, type: ${post.isLeisureProducer ? 'loisir' : (post.isProducerPost ? 'restaurant' : 'utilisateur')}`);
      
      // Gérer comme un like standard
      const userIdStr = userId.toString();
      const alreadyLiked = post.likes && post.likes.some(id => id.toString() === userIdStr);
      
      // Initialiser likes si nécessaire
      if (!post.likes) post.likes = [];
      
      if (alreadyLiked) {
        // Retirer le like
        post.likes = post.likes.filter(id => id.toString() !== userIdStr);
        console.log(`👎 Retrait du like pour le post ${postId} par l'utilisateur ${userId}`);
      } else {
        // Ajouter le like
        post.likes.push(userId);
        console.log(`👍 Like ajouté pour le post ${postId} par l'utilisateur ${userId}`);
      }
      
      await post.save();
      
      // Mettre à jour l'utilisateur aussi
      const user = await User.findById(userId);
      if (user) {
        if (!user.liked_posts) user.liked_posts = [];
        
        if (alreadyLiked) {
          // Retirer des likes de l'utilisateur
          user.liked_posts = user.liked_posts.filter(id => id.toString() !== postId.toString());
        } else if (!user.liked_posts.some(id => id.toString() === postId.toString())) {
          // Ajouter aux likes de l'utilisateur
          user.liked_posts.push(postId);
        }
        
        await user.save();
      }
      
      // Si c'est un post de producer de loisir avec un événement référencé
      if (post.isLeisureProducer && post.referenced_event_id) {
        console.log(`🎭 Post de loisir avec événement référencé: ${post.referenced_event_id}`);
        
        const eventId = toObjectId(post.referenced_event_id);
        const event = await Event.findById(eventId);
        
        if (event) {
          // Assurer que interestedUsers existe
          if (!event.interestedUsers) {
            event.interestedUsers = [];
          }
          
          // On ne retire pas automatiquement l'intérêt pour l'événement quand on retire le like
          // On veut seulement ajouter l'intérêt quand on ajoute un like
          if (!alreadyLiked) {
            const alreadyInterested = event.interestedUsers.some(id => id.toString() === userIdStr);
            
            if (!alreadyInterested) {
              event.interestedUsers.push(userId);
              await event.save();
              console.log(`🌟 Intérêt ajouté pour l'événement ${eventId}`);
              
              // Mettre à jour l'utilisateur pour les intérêts
              if (user) {
                if (!user.interests) user.interests = [];
                if (!user.interests.some(id => id.toString() === eventId.toString())) {
                  user.interests.push(eventId);
                  await user.save();
                }
              }
            }
          }
        }
      } 
      // Si c'est un post de restaurant producer
      else if (post.isProducerPost && post.producer_id) {
        console.log(`🍽️ Post de restaurant avec producer_id: ${post.producer_id}`);
        
        const producerId = toObjectId(post.producer_id);
        
        const RestaurantProducer = postsDbRest.model(
          'Producer',
          new mongoose.Schema({}, { strict: false }),
          'Restauration_Producers'
        );
        
        const producer = await RestaurantProducer.findById(producerId);
        if (producer) {
          // Assurer que interestedUsers existe
          if (!producer.interestedUsers) {
            producer.interestedUsers = [];
          }
          
          // On ne retire pas automatiquement l'intérêt pour le restaurant quand on retire le like
          // On veut seulement ajouter l'intérêt quand on ajoute un like
          if (!alreadyLiked) {
            const alreadyInterested = producer.interestedUsers.some(id => id.toString() === userIdStr);
            
            if (!alreadyInterested) {
              producer.interestedUsers.push(userId);
              await producer.save();
              console.log(`🌟 Intérêt ajouté pour le restaurant ${producerId}`);
              
              // Mettre à jour l'utilisateur pour les intérêts
              if (user) {
                if (!user.interests) user.interests = [];
                if (!user.interests.some(id => id.toString() === producerId.toString())) {
                  user.interests.push(producerId);
                  await user.save();
                }
              }
            }
          }
        }
      }
      
      return res.status(200).json({
        message: alreadyLiked ? 'Like retiré avec succès.' : 'Post liké avec succès.',
        likes_count: post.likes.length,
        isLiked: !alreadyLiked
      });
    }
    
    // 2. Si ce n'est pas un post, essayer de traiter comme un événement ou un restaurant
    console.log(`🔍 Vérification si c'est un événement ou un producer: ${id}, isLeisureProducer=${isLeisureProducer}`);
    
    if (isLeisureProducer) {
      const event = await Event.findById(postId);
      if (event) {
        console.log(`🎭 Événement trouvé avec ID ${postId}`);
        
        // Assurer que interestedUsers existe
        if (!event.interestedUsers) {
          event.interestedUsers = [];
        }
        
        // Vérifier si l'utilisateur est déjà intéressé
        const userIdStr = userId.toString();
        const alreadyInterested = event.interestedUsers.some(id => id.toString() === userIdStr);
        
        if (alreadyInterested) {
          // Retirer l'intérêt
          event.interestedUsers = event.interestedUsers.filter(id => id.toString() !== userIdStr);
          console.log(`🔕 Intérêt retiré pour l'événement ${postId} par l'utilisateur ${userId}`);
        } else {
          // Ajouter l'intérêt
          event.interestedUsers.push(userId);
          console.log(`🔔 Intérêt ajouté pour l'événement ${postId} par l'utilisateur ${userId}`);
        }
        
        await event.save();
        
        // Mettre à jour l'utilisateur
        const user = await User.findById(userId);
        if (user) {
          if (!user.interests) user.interests = [];
          
          if (alreadyInterested) {
            // Retirer l'intérêt
            user.interests = user.interests.filter(id => id.toString() !== postId.toString());
          } else if (!user.interests.some(id => id.toString() === postId.toString())) {
            // Ajouter l'intérêt
            user.interests.push(postId);
          }
          
          await user.save();
        }
        
        return res.status(200).json({
          message: alreadyInterested 
            ? 'Intérêt retiré avec succès pour l\'événement.'
            : 'Intérêt marqué avec succès pour l\'événement.',
          interested_count: event.interestedUsers.length,
          interested: !alreadyInterested
        });
      }
    } else {
      const RestaurantProducer = postsDbRest.model(
        'Producer',
        new mongoose.Schema({}, { strict: false }),
        'Restauration_Producers'
      );
      
      const producer = await RestaurantProducer.findById(postId);
      if (producer) {
        console.log(`🍽️ Restaurant trouvé avec ID ${postId}`);
        
        // Assurer que interestedUsers existe
        if (!producer.interestedUsers) {
          producer.interestedUsers = [];
        }
        
        // Vérifier si l'utilisateur est déjà intéressé
        const userIdStr = userId.toString();
        const alreadyInterested = producer.interestedUsers.some(id => id.toString() === userIdStr);
        
        if (alreadyInterested) {
          // Retirer l'intérêt
          producer.interestedUsers = producer.interestedUsers.filter(id => id.toString() !== userIdStr);
          console.log(`🔕 Intérêt retiré pour le restaurant ${postId} par l'utilisateur ${userId}`);
        } else {
          // Ajouter l'intérêt
          producer.interestedUsers.push(userId);
          console.log(`🔔 Intérêt ajouté pour le restaurant ${postId} par l'utilisateur ${userId}`);
        }
        
        await producer.save();
        
        // Mettre à jour l'utilisateur
        const user = await User.findById(userId);
        if (user) {
          if (!user.interests) user.interests = [];
          
          if (alreadyInterested) {
            // Retirer l'intérêt
            user.interests = user.interests.filter(id => id.toString() !== postId.toString());
          } else if (!user.interests.some(id => id.toString() === postId.toString())) {
            // Ajouter l'intérêt
            user.interests.push(postId);
          }
          
          await user.save();
        }
        
        return res.status(200).json({
          message: alreadyInterested 
            ? 'Intérêt retiré avec succès pour le restaurant.'
            : 'Intérêt marqué avec succès pour le restaurant.',
          interested_count: producer.interestedUsers.length,
          interested: !alreadyInterested
        });
      }
    }
    
    // Si on est arrivé ici, aucune entité n'a été trouvée
    return res.status(404).json({ error: 'Entité introuvable (post, événement ou restaurant).' });
  } catch (error) {
    console.error('❌ Erreur lors du traitement de l\'interaction :', error.message);
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

// Route pour récupérer un post spécifique par ID
router.get('/:id', async (req, res) => {
  const { id } = req.params;
  const { userId } = req.query; // Optionnel: pour normaliser avec les données de l'utilisateur

  try {
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: 'ID invalide.' });
    }

    // Récupérer l'utilisateur si userId est fourni
    let user = null;
    if (userId) {
      user = await User.findById(userId);
    }

    // Chercher dans toutes les collections en parallèle
    const [postChoice, postRest, event, leisureProducer] = await Promise.all([
      PostChoice.findById(id)
        .populate('comments.user_id', 'name email photo_url avatar')
        .populate('likes', 'name photo_url avatar')
        .populate('choices', 'name photo_url avatar'),
      PostRest.findById(id),
      Event.findById(id),
      LeisureProducer.findById(id)
    ]);

    // Déterminer le type de contenu et normaliser la réponse
    let normalizedContent;
    if (postChoice) {
      normalizedContent = await normalizePost(postChoice, user);
    } else if (postRest) {
      normalizedContent = await normalizePost(postRest, user);
    } else if (event) {
      normalizedContent = await normalizePost(event, user);
    } else if (leisureProducer) {
      normalizedContent = await normalizePost(leisureProducer, user);
    } else {
      return res.status(404).json({ message: 'Document non trouvé.' });
    }

    // Ajouter des informations supplémentaires selon le type de contenu
    if (normalizedContent.isLeisureProducer && normalizedContent.referenced_event_id) {
      const referencedEvent = await Event.findById(normalizedContent.referenced_event_id);
      if (referencedEvent) {
        normalizedContent.referenced_event = {
          name: referencedEvent.name || referencedEvent.title || 'Événement',
          date: referencedEvent.date || referencedEvent.event_date || referencedEvent.time_posted,
          location: referencedEvent.location || { name: 'Localisation inconnue' },
          description: referencedEvent.description || referencedEvent.content,
          media: referencedEvent.media || referencedEvent.images || referencedEvent.photos || [],
          interested_count: referencedEvent.interestedUsers?.length || referencedEvent.interests?.length || 0,
          choices_count: referencedEvent.choices?.length || referencedEvent.choiceUsers?.length || 0,
          followers_interests_count: user ? 
            (referencedEvent.interestedUsers || []).filter(id => 
              user.following?.includes(id.toString())
            ).length : 0,
          followers_choices_count: user ?
            (referencedEvent.choices || []).filter(id =>
              user.following?.includes(id.toString())
            ).length : 0
        };
      }
    } else if (normalizedContent.isProducerPost && normalizedContent.producer_id) {
      const RestaurantProducer = postsDbRest.model(
        'Producer',
        new mongoose.Schema({}, { strict: false }),
        'Restauration_Producers'
      );
      const producer = await RestaurantProducer.findById(normalizedContent.producer_id);
      if (producer) {
        normalizedContent.producer = {
          name: producer.name || producer.title || 'Restaurant',
          description: producer.description || producer.content,
          location: producer.location || { name: 'Localisation inconnue' },
          media: producer.media || producer.images || producer.photos || [],
          interested_count: producer.interestedUsers?.length || producer.interests?.length || 0,
          choices_count: producer.choices?.length || producer.choiceUsers?.length || 0,
          followers_interests_count: user ?
            (producer.interestedUsers || []).filter(id =>
              user.following?.includes(id.toString())
            ).length : 0,
          followers_choices_count: user ?
            (producer.choices || []).filter(id =>
              user.following?.includes(id.toString())
            ).length : 0
        };
      }
    }

    // Ajouter les interactions de l'utilisateur si userId est fourni
    if (user) {
      normalizedContent.user_interactions = {
        isLiked: normalizedContent.isLiked,
        isChoice: normalizedContent.isChoice,
        isInterested: normalizedContent.isInterested,
        entity_user_interested: normalizedContent.entity_user_interested,
        entity_user_choice: normalizedContent.entity_user_choice,
        hasCommented: normalizedContent.comments?.some(comment => 
          comment.user_id?.toString() === user._id.toString()
        ) || false
      };
    }

    res.status(200).json(normalizedContent);
  } catch (error) {
    console.error('Erreur lors de la récupération du document :', error.message);
    res.status(500).json({ message: 'Erreur serveur.' });
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

// Fonction pour normaliser les posts avec gestion de toutes les structures
async function normalizePost(post, user) {
  // Identifier les followers de l'utilisateur - transforme en strings pour comparaison
  const followingUsers = (user?.following || []).map(id => id.toString());
  const followingProducers = (user?.followingProducers || []).map(id => id.toString());
  
  // Compter les interactions totales avec gestion des champs manquants
  const likesCount = post.likes ? post.likes.length : 
                    (post.liked_posts ? post.liked_posts.length : 0);
  const choicesCount = post.choices ? post.choices.length : 
                      (post.choiceUsers ? post.choiceUsers.length : 0);
  const interestsCount = post.interestedUsers ? post.interestedUsers.length : 
                        (post.interests ? post.interests.length : 0);
  
  // Compter les interactions des followers avec gestion des champs manquants
  const followersLikesCount = post.likes ? 
    post.likes.filter(likeId => followingUsers.includes(likeId.toString())).length : 
    (post.liked_posts ? post.liked_posts.filter(likeId => followingUsers.includes(likeId.toString())).length : 0);
  
  const followersChoicesCount = post.choices ? 
    post.choices.filter(choiceId => followingUsers.includes(choiceId.toString())).length : 
    (post.choiceUsers ? post.choiceUsers.filter(choiceId => followingUsers.includes(choiceId.toString())).length : 0);
  
  const followersInterestsCount = post.interestedUsers ? 
    post.interestedUsers.filter(interestId => followingUsers.includes(interestId.toString())).length : 
    (post.interests ? post.interests.filter(interestId => followingUsers.includes(interestId.toString())).length : 0);
  
  // Déterminer précisément le type de post avec gestion des champs manquants
  const isProducerPost = !!post.producer_id || post.isProducerPost === true;
  const isLeisureProducer = post.isLeisureProducer === true || 
                           (post.author && post.author.isLeisureProducer === true) ||
                           post.type === 'leisure';
  const isUserPost = !isProducerPost || (post.user_id && !post.producer_id);
  const isAutomated = post.is_automated === true;
  const hasReferencedEvent = isLeisureProducer && !!post.referenced_event_id;
  const hasTarget = !!post.target_id && !!post.target_type;
  
  // Obtenir les informations de l'entité associée si présente
  let entityInteractions = {
    entity_type: null,
    entity_id: null,
    entity_name: null,
    interests_count: 0,
    choices_count: 0,
    followers_interests_count: 0,
    followers_choices_count: 0
  };
  
  // Chercher les métriques de l'événement ou du producer en fonction du type de post
  try {
    // Gérer le cas des posts de leisure producer avec un événement référencé
    if (hasReferencedEvent) {
      entityInteractions.entity_type = 'event';
      entityInteractions.entity_id = post.referenced_event_id;
      entityInteractions.entity_name = post.event_name || 'Événement';
      
      // Chercher l'événement pour obtenir des métriques à jour
      const eventId = toObjectId(post.referenced_event_id);
      const event = await Event.findById(eventId);
      
      if (event) {
        entityInteractions.interests_count = event.interestedUsers ? event.interestedUsers.length : 
                                          (event.interests ? event.interests.length : 0);
        entityInteractions.choices_count = event.choices ? event.choices.length : 
                                         (event.choiceUsers ? event.choiceUsers.length : 0);
        
        // Calculer les intérêts des followers
        if ((event.interestedUsers || event.interests) && followingUsers.length > 0) {
          const interestedUsers = event.interestedUsers || event.interests || [];
          entityInteractions.followers_interests_count = interestedUsers
            .filter(id => followingUsers.includes(id.toString())).length;
        }
        
        // Vérifier si l'utilisateur actuel a interagi avec cet événement
        const userIdStr = user?._id?.toString();
        if (userIdStr) {
          const interestedUsers = event.interestedUsers || event.interests || [];
          const choiceUsers = event.choices || event.choiceUsers || [];
          
          post.entity_user_interest = interestedUsers.some(id => id.toString() === userIdStr);
          post.entity_user_choice = choiceUsers.some(id => id.toString() === userIdStr);
        }
      }
    } else if (hasTarget) {
      // Gérer le cas des posts avec une cible spécifique
      entityInteractions.entity_type = post.target_type;
      entityInteractions.entity_id = post.target_id;
      entityInteractions.entity_name = post.target_name || 'Nom non disponible';
      
      if (post.target_type === 'producer') {
        const RestaurantProducer = postsDbRest.model(
          'Producer',
          new mongoose.Schema({}, { strict: false }),
          'Restauration_Producers'
        );
        
        const producer = await RestaurantProducer.findById(toObjectId(post.target_id));
        if (producer) {
          entityInteractions.interests_count = producer.interestedUsers ? producer.interestedUsers.length : 
                                            (producer.interests ? producer.interests.length : 0);
          entityInteractions.choices_count = producer.choices ? producer.choices.length : 
                                           (producer.choiceUsers ? producer.choiceUsers.length : 0);
          
          // Vérifier l'interaction de l'utilisateur avec ce producer
          const userIdStr = user?._id?.toString();
          if (userIdStr) {
            const interestedUsers = producer.interestedUsers || producer.interests || [];
            const choiceUsers = producer.choices || producer.choiceUsers || [];
            
            post.entity_user_interest = interestedUsers.some(id => id.toString() === userIdStr);
            post.entity_user_choice = choiceUsers.some(id => id.toString() === userIdStr);
          }
        }
      } else if (post.target_type === 'event') {
        const event = await Event.findById(toObjectId(post.target_id));
        if (event) {
          entityInteractions.interests_count = event.interestedUsers ? event.interestedUsers.length : 
                                            (event.interests ? event.interests.length : 0);
          entityInteractions.choices_count = event.choices ? event.choices.length : 
                                           (event.choiceUsers ? event.choiceUsers.length : 0);
          
          // Vérifier l'interaction de l'utilisateur avec cet événement
          const userIdStr = user?._id?.toString();
          if (userIdStr) {
            const interestedUsers = event.interestedUsers || event.interests || [];
            const choiceUsers = event.choices || event.choiceUsers || [];
            
            post.entity_user_interest = interestedUsers.some(id => id.toString() === userIdStr);
            post.entity_user_choice = choiceUsers.some(id => id.toString() === userIdStr);
          }
        }
      }
    }
  } catch (error) {
    console.error('Erreur lors de la normalisation des interactions:', error);
  }
  
  // Normaliser les médias avec gestion des champs manquants
  let normalizedMedia = [];
  if (post.media) {
    normalizedMedia = Array.isArray(post.media) ? post.media : [post.media];
  } else if (post.image) {
    normalizedMedia = [post.image];
  } else if (post.images) {
    normalizedMedia = Array.isArray(post.images) ? post.images : [post.images];
  }
  
  // Gérer les données d'auteur avec des valeurs par défaut
  const authorData = {
    name: post.author_name || post.author?.name || post.name || 'Anonyme',
    avatar: post.author_avatar || post.author?.avatar || post.photo_url || post.avatar || '',
    id: post.author_id || post.author?.id || post.user_id || null,
    isLeisureProducer: isLeisureProducer
  };
  
  // Gérer les dates avec des valeurs par défaut
  const postedDate = post.posted_at || post.time_posted || post.created_at || new Date().toISOString();
  
  return {
    _id: post._id,
    author: {
      ...authorData,
      display_name: isAutomated ? `${authorData.name} 🤖` : authorData.name
    },
    content: post.content || post.description || 'Contenu non disponible',
    tags: post.tags || [],
    location: post.location || { name: 'Localisation inconnue', coordinates: [] },
    referenced_event_id: post.referenced_event_id || null,
    event_id: post.event_id || null,
    target_id: post.target_id || null,
    target_type: post.target_type || null,
    producer_id: post.producer_id || null,
    media: normalizedMedia,
    posted_at: postedDate,
    time_posted: postedDate,
    relevance_score: calculatePostScore(user, post, new Date()),
    isProducerPost: isProducerPost,
    isLeisureProducer: isLeisureProducer,
    isUserPost: isUserPost,
    is_automated: isAutomated,
    hasReferencedEvent: hasReferencedEvent,
    hasTarget: hasTarget,
    likes_count: likesCount,
    comments_count: post.comments ? post.comments.length : 0,
    interested_count: interestsCount,
    choice_count: choicesCount,
    entity_interests_count: entityInteractions.interests_count,
    entity_choices_count: entityInteractions.choices_count,
    isLiked: post.likes ? post.likes.some(id => id.toString() === user?._id?.toString()) : 
             (post.liked_posts ? post.liked_posts.some(id => id.toString() === user?._id?.toString()) : 
             (post.isLiked || false)),
    isChoice: post.choices ? post.choices.some(id => id.toString() === user?._id?.toString()) : 
              (post.choiceUsers ? post.choiceUsers.some(id => id.toString() === user?._id?.toString()) : 
              (post.choice || post.isChoice || false)),
    isInterested: post.interestedUsers ? post.interestedUsers.some(id => id.toString() === user?._id?.toString()) : 
                 (post.interests ? post.interests.some(id => id.toString() === user?._id?.toString()) : 
                 (post.interested || post.isInterested || false)),
    entity_user_interested: post.entity_user_interest || false,
    entity_user_choice: post.entity_user_choice || false,
    visualBadge: isAutomated ? '🤖' : (isLeisureProducer ? '🎭' : (isProducerPost ? '🍽️' : '👤')),
    interactionType: hasReferencedEvent ? 'event_interest' : 
                    (isProducerPost && !isLeisureProducer ? 'producer_interest' : 'standard_like'),
    follower_data: {
      followers_likes_count: followersLikesCount,
      followers_choices_count: followersChoicesCount,
      followers_interests_count: followersInterestsCount
    },
    entity: entityInteractions.entity_id ? {
      id: entityInteractions.entity_id,
      type: entityInteractions.entity_type,
      name: entityInteractions.entity_name
    } : null
  };
}

// Route pour marquer un intérêt pour un événement
router.post('/event/:eventId/interest', async (req, res) => {
  const { eventId } = req.params;
  const { user_id } = req.body;

  if (!user_id) {
    return res.status(400).json({ error: 'user_id est requis.' });
  }

  try {
    // Convertir l'ID en ObjectId si nécessaire
    const eventObjectId = toObjectId(eventId);
    
    // Chercher l'événement dans la base de données Loisir&Culture
    const event = await Event.findById(eventObjectId);
    if (!event) {
      return res.status(404).json({ error: 'Événement introuvable.' });
    }

    // Assurer que interestedUsers existe
    if (!event.interestedUsers) {
      event.interestedUsers = [];
    }

    // Ajouter l'utilisateur aux personnes intéressées si pas déjà présent
    const userId = toObjectId(user_id);
    const userIdStr = userId.toString();
    
    if (!event.interestedUsers.some(id => id.toString() === userIdStr)) {
      event.interestedUsers.push(userId);
      await event.save();
      
      // Mise à jour dans la collection utilisateur
      const user = await User.findById(userId);
      if (user) {
        if (!user.interests) user.interests = [];
        if (!user.interests.some(id => id.toString() === eventId.toString())) {
          user.interests.push(eventObjectId);
          await user.save();
        }
      }
    }

    res.status(200).json({
      message: 'Intérêt marqué avec succès pour l\'événement.',
      interested_count: event.interestedUsers.length,
      interested: true
    });
  } catch (error) {
    console.error('❌ Erreur lors du marquage d\'intérêt pour l\'événement:', error.message);
    res.status(500).json({ error: 'Erreur interne du serveur.' });
  }
});

// Route pour marquer un intérêt pour un restaurant/producer
router.post('/producer/:producerId/interest', async (req, res) => {
  const { producerId } = req.params;
  const { user_id } = req.body;

  if (!user_id) {
    return res.status(400).json({ error: 'user_id est requis.' });
  }

  try {
    // Convertir l'ID en ObjectId si nécessaire
    const producerObjectId = toObjectId(producerId);
    
    // Chercher le producer dans la base de données Restauration_Officielle
    const RestaurantProducer = postsDbRest.model(
      'Producer',
      new mongoose.Schema({}, { strict: false }),
      'Restauration_Producers'
    );
    
    const producer = await RestaurantProducer.findById(producerObjectId);
    if (!producer) {
      return res.status(404).json({ error: 'Producer introuvable.' });
    }

    // Assurer que interestedUsers existe
    if (!producer.interestedUsers) {
      producer.interestedUsers = [];
    }

    // Ajouter l'utilisateur aux personnes intéressées si pas déjà présent
    const userId = toObjectId(user_id);
    const userIdStr = userId.toString();
    
    if (!producer.interestedUsers.some(id => id.toString() === userIdStr)) {
      producer.interestedUsers.push(userId);
      await producer.save();
      
      // Mise à jour dans la collection utilisateur
      const user = await User.findById(userId);
      if (user) {
        if (!user.interests) user.interests = [];
        if (!user.interests.some(id => id.toString() === producerId.toString())) {
          user.interests.push(producerObjectId);
          await user.save();
        }
      }
    }

    res.status(200).json({
      message: 'Intérêt marqué avec succès pour le restaurant.',
      interested_count: producer.interestedUsers.length,
      interested: true
    });
  } catch (error) {
    console.error('❌ Erreur lors du marquage d\'intérêt pour le restaurant:', error.message);
    res.status(500).json({ error: 'Erreur interne du serveur.' });
  }
});

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

// Route unifiée pour les interactions
router.post('/:id/interact', async (req, res) => {
  const { id } = req.params;
  const { user_id, action } = req.body;

  if (!user_id || !action) {
    return res.status(400).json({ error: 'user_id et action sont requis.' });
  }

  // Vérifier que l'action est valide
  const validActions = ['like', 'unlike', 'interest', 'uninterest', 'choice', 'unchoice'];
  if (!validActions.includes(action)) {
    return res.status(400).json({ error: 'Action invalide.' });
  }

  try {
    // Convertir les IDs en ObjectId
    const targetId = toObjectId(id);
    const userId = toObjectId(user_id);
    const userIdStr = userId.toString();

    // Chercher dans toutes les collections en parallèle
    const [postChoice, postRest, event, leisureProducer] = await Promise.all([
      PostChoice.findById(targetId),
      PostRest.findById(targetId),
      Event.findById(targetId),
      LeisureProducer.findById(targetId)
    ]);

    // Déterminer le type de contenu et l'objet cible
    let target;
    let contentType;
    if (postChoice) {
      target = postChoice;
      contentType = 'post';
    } else if (postRest) {
      target = postRest;
      contentType = 'post';
    } else if (event) {
      target = event;
      contentType = 'event';
    } else if (leisureProducer) {
      target = leisureProducer;
      contentType = 'producer';
    } else {
      return res.status(404).json({ error: 'Contenu introuvable.' });
    }

    // Gérer les différentes actions
    switch (action) {
      case 'like':
      case 'unlike':
        // Initialiser le tableau des likes si nécessaire
        if (!target.likes) target.likes = [];
        
        if (action === 'like') {
          if (!target.likes.some(id => id.toString() === userIdStr)) {
            target.likes.push(userId);
          }
        } else {
          target.likes = target.likes.filter(id => id.toString() !== userIdStr);
        }
        break;

      case 'interest':
      case 'uninterest':
        // Initialiser le tableau des interestedUsers si nécessaire
        if (!target.interestedUsers) target.interestedUsers = [];
        
        if (action === 'interest') {
          if (!target.interestedUsers.some(id => id.toString() === userIdStr)) {
            target.interestedUsers.push(userId);
          }
        } else {
          target.interestedUsers = target.interestedUsers.filter(id => id.toString() !== userIdStr);
        }
        break;

      case 'choice':
      case 'unchoice':
        // Initialiser le tableau des choices si nécessaire
        if (!target.choices) target.choices = [];
        
        if (action === 'choice') {
          if (!target.choices.some(id => id.toString() === userIdStr)) {
            target.choices.push(userId);
          }
        } else {
          target.choices = target.choices.filter(id => id.toString() !== userIdStr);
        }
        break;
    }

    // Sauvegarder les modifications
    await target.save();

    // Mettre à jour l'utilisateur
    const user = await User.findById(userId);
    if (user) {
      switch (action) {
        case 'like':
          if (!user.liked_posts) user.liked_posts = [];
          if (!user.liked_posts.some(id => id.toString() === targetId.toString())) {
            user.liked_posts.push(targetId);
          }
          break;
        case 'unlike':
          if (user.liked_posts) {
            user.liked_posts = user.liked_posts.filter(id => id.toString() !== targetId.toString());
          }
          break;
        case 'interest':
          if (!user.interests) user.interests = [];
          if (!user.interests.some(id => id.toString() === targetId.toString())) {
            user.interests.push(targetId);
          }
          break;
        case 'uninterest':
          if (user.interests) {
            user.interests = user.interests.filter(id => id.toString() !== targetId.toString());
          }
          break;
        case 'choice':
          if (!user.choices) user.choices = [];
          if (!user.choices.some(id => id.toString() === targetId.toString())) {
            user.choices.push(targetId);
          }
          break;
        case 'unchoice':
          if (user.choices) {
            user.choices = user.choices.filter(id => id.toString() !== targetId.toString());
          }
          break;
      }
      await user.save();
    }

    // Normaliser la réponse
    const normalizedTarget = await normalizePost(target, user);

    res.json({
      message: `Action ${action} effectuée avec succès.`,
      content: normalizedTarget,
      counts: {
        likes: target.likes?.length || 0,
        interests: target.interestedUsers?.length || 0,
        choices: target.choices?.length || 0
      }
    });
  } catch (error) {
    console.error('Erreur lors de l\'interaction:', error);
    res.status(500).json({ error: 'Erreur interne du serveur.' });
  }
});

// Route pour gérer les commentaires
router.post('/:id/comments', async (req, res) => {
  try {
    const { id } = req.params;
    const { user_id, content } = req.body;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: 'ID de post invalide.' });
    }

    if (!user_id || !content) {
      return res.status(400).json({ message: 'user_id et content sont requis.' });
    }

    // Rechercher le post dans toutes les collections
    const [postChoice, postRest, event, leisureProducer] = await Promise.all([
      PostChoice.findById(id),
      PostRest.findById(id),
      Event.findById(id),
      LeisureProducer.findById(id)
    ]);

    let targetPost = postChoice || postRest || event || leisureProducer;
    if (!targetPost) {
      return res.status(404).json({ message: 'Post non trouvé.' });
    }

    // Créer le commentaire
    const comment = {
      user_id: new mongoose.Types.ObjectId(user_id),
      content,
      created_at: new Date(),
      updated_at: new Date()
    };

    // Ajouter le commentaire au post
    if (!targetPost.comments) {
      targetPost.comments = [];
    }
    targetPost.comments.push(comment);
    await targetPost.save();

    // Récupérer les informations de l'utilisateur
    const user = await User.findById(user_id);
    if (!user) {
      return res.status(404).json({ message: 'Utilisateur non trouvé.' });
    }

    // Normaliser le commentaire
    const normalizedComment = {
      _id: comment._id,
      content: comment.content,
      created_at: comment.created_at,
      updated_at: comment.updated_at,
      user: {
        _id: user._id,
        name: user.name || user.author_name || 'Utilisateur',
        avatar: user.avatar || user.author_avatar || user.photo_url || null
      }
    };

    res.status(201).json({
      message: 'Commentaire ajouté avec succès.',
      comment: normalizedComment
    });
  } catch (error) {
    console.error('Erreur lors de l\'ajout du commentaire:', error);
    res.status(500).json({ message: 'Erreur lors de l\'ajout du commentaire.' });
  }
});

// Route pour supprimer un commentaire
router.delete('/:id/comments/:commentId', async (req, res) => {
  try {
    const { id, commentId } = req.params;
    const { user_id } = req.body;

    if (!mongoose.isValidObjectId(id) || !mongoose.isValidObjectId(commentId)) {
      return res.status(400).json({ message: 'ID invalide.' });
    }

    if (!user_id) {
      return res.status(400).json({ message: 'user_id est requis.' });
    }

    // Rechercher le post dans toutes les collections
    const [postChoice, postRest, event, leisureProducer] = await Promise.all([
      PostChoice.findById(id),
      PostRest.findById(id),
      Event.findById(id),
      LeisureProducer.findById(id)
    ]);

    let targetPost = postChoice || postRest || event || leisureProducer;
    if (!targetPost) {
      return res.status(404).json({ message: 'Post non trouvé.' });
    }

    // Vérifier si le commentaire existe et si l'utilisateur est l'auteur
    const comment = targetPost.comments?.find(c => c._id.toString() === commentId);
    if (!comment) {
      return res.status(404).json({ message: 'Commentaire non trouvé.' });
    }

    if (comment.user_id.toString() !== user_id) {
      return res.status(403).json({ message: 'Vous n\'êtes pas autorisé à supprimer ce commentaire.' });
    }

    // Supprimer le commentaire
    targetPost.comments = targetPost.comments.filter(c => c._id.toString() !== commentId);
    await targetPost.save();

    res.status(200).json({ message: 'Commentaire supprimé avec succès.' });
  } catch (error) {
    console.error('Erreur lors de la suppression du commentaire:', error);
    res.status(500).json({ message: 'Erreur lors de la suppression du commentaire.' });
  }
});

// Route pour créer un post
router.post('/', async (req, res) => {
  const { 
    user_id, 
    target_id, 
    target_type, 
    content, 
    tags, 
    media, 
    choice,
    title,
    description,
    location,
    producer_id,
    event_id,
    referenced_event_id,
    isLeisureProducer,
    isProducerPost,
    isAutomated,
    author_name,
    author_avatar,
    photo_url,
    avatar,
    name,
    posted_at,
    time_posted,
    created_at
  } = req.body;

  // Vérification des champs obligatoires
  if (!user_id || !content) {
    return res.status(400).json({
      error: 'Les champs user_id et content sont requis.',
    });
  }

  try {
    // Convertir les IDs en ObjectId si possible
    const userId = toObjectId(user_id);
    const targetId = target_id ? toObjectId(target_id) : null;
    const producerId = producer_id ? toObjectId(producer_id) : null;
    const eventId = event_id ? toObjectId(event_id) : null;
    const referencedEventId = referenced_event_id ? toObjectId(referenced_event_id) : null;

    // Vérifier si le target_type est valide si fourni
    if (target_type && !['event', 'producer'].includes(target_type)) {
      return res.status(400).json({ error: "Le type de cible doit être 'event' ou 'producer'." });
    }

    // Déterminer le type de post
    const isLeisure = isLeisureProducer === true || 
                     (target_type === 'event') || 
                     !!eventId || 
                     !!referencedEventId;
    const isProducer = isProducerPost === true || 
                      (target_type === 'producer') || 
                      !!producerId;

    // Création du post avec gestion des champs optionnels
    const postData = {
      user_id: userId,
      content: content,
      description: description || content, // Fallback sur content si description non fournie
      title: title || null,
      tags: Array.isArray(tags) ? tags : [],
      media: Array.isArray(media) ? media : [],
      location: location || null,
      producer_id: producerId,
      event_id: eventId,
      referenced_event_id: referencedEventId,
      isLeisureProducer: isLeisure,
      isProducerPost: isProducer,
      is_automated: isAutomated || false,
      author: {
        name: author_name || name || null,
        avatar: author_avatar || photo_url || avatar || null
      },
      posted_at: posted_at || time_posted || created_at || new Date(),
      likes: [],
      choices: [],
      interestedUsers: [],
      comments: []
    };

    // Ajouter les champs spécifiques selon le type de post
    if (isLeisure) {
      postData.type = 'leisure';
      if (referencedEventId) {
        // Vérifier l'existence de l'événement référencé
        const event = await Event.findById(referencedEventId);
        if (!event) {
          return res.status(404).json({ error: 'Événement référencé introuvable.' });
        }
        postData.event_name = event.name || event.title || 'Événement';
      }
    } else if (isProducer) {
      postData.type = 'producer';
      if (producerId) {
        // Vérifier l'existence du producer
        const RestaurantProducer = postsDbRest.model(
          'Producer',
          new mongoose.Schema({}, { strict: false }),
          'Restauration_Producers'
        );
        const producer = await RestaurantProducer.findById(producerId);
        if (!producer) {
          return res.status(404).json({ error: 'Producer introuvable.' });
        }
        postData.producer_name = producer.name || producer.title || 'Restaurant';
      }
    }

    // Créer et sauvegarder le post
    const newPost = new PostChoice(postData);
    const savedPost = await newPost.save();

    // Gérer le choice si demandé
    if (choice) {
      if (isLeisure && referencedEventId) {
        const event = await Event.findById(referencedEventId);
        if (event) {
          if (!event.choices) event.choices = [];
          if (!event.choices.some(id => id.toString() === userId.toString())) {
            event.choices.push(userId);
            await event.save();
          }
        }
      } else if (isProducer && producerId) {
        const RestaurantProducer = postsDbRest.model(
          'Producer',
          new mongoose.Schema({}, { strict: false }),
          'Restauration_Producers'
        );
        const producer = await RestaurantProducer.findById(producerId);
        if (producer) {
          if (!producer.choices) producer.choices = [];
          if (!producer.choices.some(id => id.toString() === userId.toString())) {
            producer.choices.push(userId);
            await producer.save();
          }
        }
      }
    }

    // Normaliser la réponse
    const normalizedPost = await normalizePost(savedPost, null);

    res.status(201).json({
      message: 'Post créé avec succès.',
      post: normalizedPost
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

// Route de recherche unifiée
router.get('/search', async (req, res) => {
  const { query, type, page = 1, limit = 10 } = req.query;

  if (!query) {
    return res.status(400).json({ error: 'Le paramètre query est requis.' });
  }

  try {
    // Construire la requête de base avec regex insensible à la casse
    const searchRegex = new RegExp(query, 'i');
    const baseQuery = {
      $or: [
        { content: searchRegex },
        { title: searchRegex },
        { tags: searchRegex },
        { 'location.name': searchRegex }
      ]
    };

    // Ajouter des filtres spécifiques selon le type
    let typeQuery = {};
    if (type) {
      switch (type) {
        case 'event':
          typeQuery = { isLeisureProducer: true };
          break;
        case 'producer':
          typeQuery = { isProducerPost: true };
          break;
        case 'user':
          typeQuery = { isUserPost: true };
          break;
      }
    }

    // Combiner les requêtes
    const finalQuery = {
      ...baseQuery,
      ...typeQuery
    };

    // Rechercher dans toutes les collections en parallèle
    const [postsChoice, postsRest, events, leisureProducers] = await Promise.all([
      PostChoice.find(finalQuery)
        .sort({ posted_at: -1 })
        .skip((page - 1) * limit)
        .limit(parseInt(limit))
        .lean(),
      PostRest.find(finalQuery)
        .sort({ posted_at: -1 })
        .skip((page - 1) * limit)
        .limit(parseInt(limit))
        .lean(),
      Event.find(finalQuery)
        .sort({ posted_at: -1 })
        .skip((page - 1) * limit)
        .limit(parseInt(limit))
        .lean(),
      LeisureProducer.find(finalQuery)
        .sort({ posted_at: -1 })
        .skip((page - 1) * limit)
        .limit(parseInt(limit))
        .lean()
    ]);

    // Normaliser et fusionner les résultats
    const normalizedResults = await Promise.all([
      ...postsChoice.map(post => normalizePost(post, null)),
      ...postsRest.map(post => normalizePost(post, null)),
      ...events.map(event => normalizePost(event, null)),
      ...leisureProducers.map(producer => normalizePost(producer, null))
    ]);

    // Calculer le score de pertinence pour chaque résultat
    const resultsWithScores = normalizedResults.map(result => {
      let relevanceScore = 0;

      // Score basé sur la correspondance exacte
      if (result.content.toLowerCase().includes(query.toLowerCase())) relevanceScore += 10;
      if (result.title?.toLowerCase().includes(query.toLowerCase())) relevanceScore += 8;
      if (result.tags?.some(tag => tag.toLowerCase().includes(query.toLowerCase()))) relevanceScore += 5;
      if (result.location?.name?.toLowerCase().includes(query.toLowerCase())) relevanceScore += 3;

      // Score basé sur l'engagement
      relevanceScore += (result.likes_count || 0) * 0.1;
      relevanceScore += (result.comments_count || 0) * 0.2;
      relevanceScore += (result.interested_count || 0) * 0.15;
      relevanceScore += (result.choice_count || 0) * 0.15;

      // Score basé sur la récence
      const postedDate = new Date(result.posted_at);
      const now = new Date();
      const daysOld = (now - postedDate) / (1000 * 60 * 60 * 24);
      relevanceScore += Math.max(0, 10 - daysOld);

      return {
        ...result,
        relevance_score: relevanceScore
      };
    });

    // Trier par score de pertinence
    resultsWithScores.sort((a, b) => b.relevance_score - a.relevance_score);

    // Compter le total des documents pour la pagination
    const [totalChoice, totalRest, totalEvents, totalLeisure] = await Promise.all([
      PostChoice.countDocuments(finalQuery),
      PostRest.countDocuments(finalQuery),
      Event.countDocuments(finalQuery),
      LeisureProducer.countDocuments(finalQuery)
    ]);

    const total = totalChoice + totalRest + totalEvents + totalLeisure;
    const totalPages = Math.ceil(total / limit);

    res.json({
      results: resultsWithScores,
      total,
      current_page: parseInt(page),
      total_pages: totalPages,
      limit: parseInt(limit)
    });
  } catch (error) {
    console.error('Erreur lors de la recherche:', error);
    res.status(500).json({ error: 'Erreur interne du serveur.' });
  }
});

module.exports = router;

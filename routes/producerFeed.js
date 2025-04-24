const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { createModel, databases } = require('../utils/modelCreator');

// Importer le modèle Follow
const Follow = require('../models/Follow')(mongoose.connection.useDb(databases.CHOICE_APP)); // Assurer la connexion à la bonne DB

// Initialiser les modèles avec l'utilitaire
const Post = createModel(
  databases.CHOICE_APP,
  'Post',
  'Posts'
);

// Middleware d'authentification (à implémenter si nécessaire)
const auth = async (req, res, next) => {
  // Ajouter l'authentification si nécessaire
  next();
};

// Importer la fonction d'enrichissement de posts depuis posts.js
// Cette fonction est supposée être la même que dans posts.js
async function enrichPostWithAuthorInfo(post) {
  if (!post) return null;
  
  const postObj = post instanceof mongoose.Model ? post.toObject({ virtuals: true }) : { ...post }; // Copier pour éviter de modifier l'original
  
  try {
    let authorFound = false; // Flag pour savoir si on a trouvé l'auteur
    // Si c'est un post utilisateur
    if (postObj.user_id) {
      try {
        // Utiliser directement mongoose.connection pour accéder à la collection
        const db = mongoose.connection.useDb(databases.CHOICE_APP);
        const userCollection = db.collection('Users');
        
        let userId;
        try {
          userId = new mongoose.Types.ObjectId(postObj.user_id);
        } catch (e) {
          userId = postObj.user_id; // Utiliser l'ID tel quel si conversion impossible
        }
        
        const user = await userCollection.findOne({ _id: userId });
        
        if (user) {
          postObj.author_name = user.name || user.displayName || 'Utilisateur';
          postObj.author_avatar = user.avatar || user.photo || user.profile_pic;
          postObj.authorName = postObj.author_name; // Pour compatibilité frontend
          postObj.authorAvatar = postObj.author_avatar; // Pour compatibilité frontend
          postObj.authorId = postObj.user_id.toString(); // Assurer string ID pour le frontend
          
          // Définir explicitement le type pour l'affichage coloré
          postObj.producer_type = 'user';
          postObj.producerType = 'user';
          postObj.isUserPost = true;
          authorFound = true;
        }
      } catch (e) {
        console.error(`[Enrich] Error fetching user (${postObj.user_id}): ${e}`);
      }
    } 
    // Si c'est un post de producteur
    else if (postObj.producer_id) {
      try {
        let producer;
        const producerId = postObj.producer_id;
        // Essayer de déterminer le type à partir du post lui-même si possible
        const postProducerType = postObj.producer_type || postObj.producerType; 
        
        let dbName = databases.RESTAURATION; // Base par défaut (restaurants)
        let collectionName = 'Producers'; // Collection par défaut
        
        // Déterminer la base de données et la collection en fonction du type de producteur DANS LE POST
        if (postProducerType === 'leisure') {
          dbName = databases.LOISIR;
          collectionName = 'Loisir_Paris_Producers';
        } else if (postProducerType === 'wellness') {
          dbName = databases.BEAUTY_WELLNESS;
          collectionName = 'Beauty_Wellness_Producers';
        }
        // Si aucun type n'est défini, on essaie RESTAURATION par défaut, mais ça peut échouer.

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
          postObj.author_name = producer.name || producer.title || 'Établissement';
          postObj.author_avatar = producer.photo || producer.image || producer.logo || producer.avatar; 
          postObj.authorName = postObj.author_name; // Pour compatibilité frontend
          postObj.authorAvatar = postObj.author_avatar; // Pour compatibilité frontend
          postObj.authorId = postObj.producer_id.toString(); // Assurer string ID pour le frontend
          // Assigner le type trouvé ou par défaut si non présent dans le post
          postObj.producer_type = postProducerType || 'restaurant'; 
          postObj.producerType = postObj.producer_type;
          authorFound = true;
        } else {
           // Si non trouvé dans la DB présumée, logguer une alerte
           console.warn(`[Enrich] Producer not found for ID: ${producerObjectId} in DB ${dbName}/${collectionName} (Type in post: ${postProducerType})`);
           // Tenter une recherche générique dans toutes les DBs producteur? (Coûteux)
        }
      } catch (e) {
        console.error(`[Enrich] Error fetching producer (${postObj.producer_id}, type ${postObj.producer_type}): ${e}`);
      }
    } else {
        // Ni user_id ni producer_id
        console.warn(`[Enrich] Post ID ${postObj._id} has neither user_id nor producer_id.`);
    }

    // --- Standardisation des champs pour l'affichage ---
    // Assurer que les champs booléens pour le type existent
    const finalProducerType = postObj.producer_type || (postObj.user_id ? 'user' : null); // Déterminer le type final

    postObj.isProducerPost = !!postObj.producer_id;
    postObj.isLeisureProducer = finalProducerType === 'leisure';
    postObj.isRestaurationProducer = finalProducerType === 'restaurant';
    postObj.isBeautyProducer = finalProducerType === 'wellness';
    postObj.isUserPost = finalProducerType === 'user';

    // --- Gestion des informations manquantes ---
    // Si l'auteur n'a pas été trouvé mais qu'on a un ID, mettre des placeholders
    if (!authorFound && (postObj.user_id || postObj.producer_id)) {
      console.warn(`[Enrich] Author info missing for post ${postObj._id}, using placeholders.`);
      postObj.author_name = postObj.producer_id ? 'Établissement Inconnu' : 'Utilisateur Inconnu';
      postObj.author_avatar = null; // Ou une image placeholder
      postObj.authorName = postObj.author_name;
      postObj.authorAvatar = postObj.author_avatar;
      postObj.authorId = (postObj.user_id || postObj.producer_id).toString();
      // Essayer de deviner le type si possible
      if (!finalProducerType && postObj.producer_id) postObj.producer_type = 'unknown_producer';
      else if (!finalProducerType && postObj.user_id) postObj.producer_type = 'user';
    } else if (!postObj.user_id && !postObj.producer_id) {
        // Si le post n'a aucun auteur identifiable
        postObj.author_name = 'Contenu Anonyme';
        postObj.author_avatar = null;
        postObj.authorName = postObj.author_name;
        postObj.authorAvatar = postObj.author_avatar;
        postObj.authorId = null;
        postObj.producer_type = 'anonymous';
        postObj.isProducerPost = false;
        postObj.isUserPost = false;
    }

    // --- Standardisation finale ---
    // Assurer que les champs essentiels pour le frontend sont présents
    postObj.id = postObj._id.toString(); // Frontend utilise souvent 'id'
    postObj.content = postObj.content || postObj.text || ''; // Description/Contenu
    postObj.posted_at = postObj.posted_at || postObj.createdAt; // Date
    postObj.media = postObj.media || []; // Média (toujours un tableau)
    postObj.likesCount = Array.isArray(postObj.likes) ? postObj.likes.length : (postObj.likes_count || 0); // Compteur de likes
    postObj.commentsCount = Array.isArray(postObj.comments) ? postObj.comments.length : (postObj.comments_count || 0); // Compteur de commentaires

  } catch (error) {
    console.error(`❌ Erreur G L O B A L E lors de l'enrichissement du post ${post?._id}: ${error}`);
    return null; // Renvoyer null si l'enrichissement échoue complètement pour éviter d'envoyer un post cassé
  }
  
  return postObj;
}

// GET /:producerId - Obtenir le feed principal d'un producteur
router.get('/:producerId', auth, async (req, res) => {
  try {
    const producerIdParam = req.params.producerId; // Renommer pour clarté
    // Récupérer le type de producteur ET le filtre depuis les query params
    const { page = 1, limit = 10, filter = 'venue', producerType = 'restaurant' } = req.query; 
    const skip = (parseInt(page) - 1) * parseInt(limit);

    console.log(`🏪 [Producer Feed Request] ID: ${producerIdParam}, Filter: ${filter}, Page: ${page}, Limit: ${limit}, ProducerType: ${producerType}`);

    let query = {};
    let posts = [];
    let total = 0;
    let operationSuccessful = true; // Flag pour suivre si une opération échoue

    // Essayer de convertir en ObjectId, sinon utiliser la string
    let producerObjectId;
    try {
      producerObjectId = new mongoose.Types.ObjectId(producerIdParam);
    } catch (e) {
      console.warn(`⚠️ [Producer Feed] Could not convert producerId ${producerIdParam} to ObjectId, using as string.`);
      producerObjectId = producerIdParam; // Utiliser la string si la conversion échoue
    }

    // Construire la requête en fonction du filtre
    switch (filter) {
      case 'venue':
        // Posts spécifiques à l'établissement (plus robuste)
        console.log(`[Producer Feed] Building 'venue' query for producerId: ${producerObjectId}, Type: ${producerType}`);
        query = {
          // L'établissement doit correspondre
          $or: [
            { producer_id: producerObjectId }, // Comparaison ObjectId
            { producerId: producerObjectId }, // Comparaison ObjectId (compatibilité)
            { producer_id: producerIdParam }, // Comparaison String (fallback)
            { producerId: producerIdParam } // Comparaison String (fallback)
          ],
          // ET le type doit correspondre (si fourni et non 'user')
          ...(producerType && producerType !== 'user' && { 
              $or: [
                 { producer_type: producerType },
                 { producerType: producerType }
              ]
          })
        };
        break;

      case 'interactions':
        // Posts d'utilisateurs mentionnant l'établissement
        console.log(`[Producer Feed] Building 'interactions' query for producerId: ${producerObjectId}`);
        query = {
          $and: [
            // Post créé par un utilisateur (non-producteur)
            { user_id: { $exists: true, $ne: null } }, // Ensure user_id exists and is not null
            // Qui mentionne ce producteur (plus robuste)
            {
              $or: [
                { mentions: producerObjectId },
                { mentions: producerIdParam },
                { target_id: producerObjectId },
                { targetId: producerObjectId },
                { target_id: producerIdParam },
                { targetId: producerIdParam },
                // Include posts where the producer is referenced directly (less common for interactions)
                // { producer_id: producerObjectId },
                // { producerId: producerObjectId },
                // { producer_id: producerIdParam },
                // { producerId: producerIdParam }
              ]
            }
          ]
        };
        break;

      case 'localTrends':
        // Tendances locales (posts populaires dans la même zone)
        console.log(`[Producer Feed] Building 'localTrends' query for producerId: ${producerObjectId}`);
        try {
          // D'abord récupérer les infos du producteur pour connaître sa localisation
          // Essayer différentes DBs si nécessaire, en fonction du type
          let producerLocationDb;
          let producerLocationCollectionName;
          if (producerType === 'leisure') {
            producerLocationDb = mongoose.connection.useDb(databases.LOISIR);
            producerLocationCollectionName = 'Loisir_Paris_Producers';
          } else if (producerType === 'wellness') {
            producerLocationDb = mongoose.connection.useDb(databases.BEAUTY_WELLNESS);
            producerLocationCollectionName = 'Beauty_Wellness_Producers';
          } else { // Default restaurant
            producerLocationDb = mongoose.connection.useDb(databases.RESTAURATION);
            producerLocationCollectionName = 'Producers';
          }
          
          const producerCollection = producerLocationDb.collection(producerLocationCollectionName);
          const producer = await producerCollection.findOne({ _id: producerObjectId });

          if (producer && producer.location && producer.location.coordinates && producer.location.coordinates.length === 2) {
            // Construire une requête géospatiale si coordonnées valides
            const { coordinates } = producer.location;
            const [longitude, latitude] = coordinates;
            console.log(`[Producer Feed] Found producer location: [${longitude}, ${latitude}]`);

            // Assurer l'index géospatial (normalement fait une seule fois)
             try {
               await Post.collection.createIndex({ "location.coordinates": "2dsphere" });
             } catch (indexError) {
               if (indexError.codeName !== 'IndexOptionsConflict' && indexError.codeName !== 'IndexAlreadyExists') {
                 console.warn(`[Producer Feed] Could not ensure 2dsphere index: ${indexError.message}`);
               }
             }

            query = {
              "location.coordinates": {
                $nearSphere: { // Utiliser $nearSphere pour une meilleure précision sur la sphère terrestre
                  $geometry: {
                    type: "Point",
                    coordinates: [longitude, latitude]
                  },
                  $maxDistance: 5000 // 5km en mètres
                }
              }
            };
          } else {
            console.warn(`[Producer Feed] Producer location not found or invalid for ${producerObjectId}. Falling back to recent/popular.`);
            // Fallback: posts les plus récents/populaires si pas de localisation
            query = {}; // Tous les posts, triés par popularité ci-dessous
          }
        } catch (locationError) {
            console.error(`[Producer Feed] Error fetching producer location for trends: ${locationError}. Falling back.`);
            query = {}; // Fallback en cas d'erreur
        }
        break;

      case 'followers':
        // NOUVEAU: Posts des comptes SUIVIS par le producteur
        console.log(`[Producer Feed] Building 'followers' query for producerId: ${producerObjectId} (type: ${producerType})`);

        try {
          // Utiliser l'ObjectId déjà géré (producerObjectId)
          // Trouver les enregistrements où ce producteur est le follower
          const followRecords = await Follow.find({
            followerId: producerObjectId, // Utiliser l'ObjectId
            // Assurer que le type correspond, même si le modèle Follow ne l'utilise pas toujours
            // followerType: producerType 
          }).lean(); // lean() pour performance

          if (!followRecords || followRecords.length === 0) {
            console.log(`[Producer Feed] Producteur ${producerObjectId} (type ${producerType}) ne suit personne ou enregistrements non trouvés.`);
            posts = [];
            total = 0;
            operationSuccessful = false; // Marquer comme échoué pour ne pas exécuter la requête Post.find vide
          } else {
            // Extraire les IDs des comptes suivis (peuvent être des Users ou des Producers)
            const followedIds = followRecords.map(record => record.followingId);
            console.log(`[Producer Feed] ${followedIds.length} comptes suivis trouvés pour ${producerObjectId}`);
            if (followedIds.length === 0) {
                operationSuccessful = false; // Si la liste est vide après map
            } else {
                // Construire la requête pour trouver les posts de ces comptes
                // Inclure à la fois les posts d'utilisateurs et de producteurs suivis
                query = {
                  $or: [
                    { user_id: { $in: followedIds } }, // Posts d'utilisateurs suivis
                    { producer_id: { $in: followedIds } } // Posts de producteurs suivis
                  ]
                };
                // La requête sera exécutée plus bas
            }
          }
        } catch (followError) {
            console.error(`[Producer Feed] Error fetching follow records for ${producerObjectId}: ${followError}`);
            posts = [];
            total = 0;
            operationSuccessful = false;
        }
        break; // Fin du case 'followers'

      case 'wellnessInspiration':
        // NOUVEAU: Posts d'inspiration bien-être généraux
        console.log(`[Producer Feed] Building 'wellnessInspiration' query.`);
        query = {
          $or: [
            { producer_type: 'wellness' }, // Posts marqués comme wellness
            { producerType: 'wellness' },
            { tags: { $in: ['wellness', 'bien-être', 'spa', 'yoga', 'meditation', 'fitness'] } } // Ou contenant des tags pertinents
          ]
          // Optionnel: Exclure les posts de ce producteur ?
          // $nor: [
          //   { producer_id: producerObjectId },
          //   { producerId: producerObjectId },
          //   { producer_id: producerIdParam }, 
          //   { producerId: producerIdParam } 
          // ]
        };
        // Le tri par date récente est appliqué plus bas
        operationSuccessful = true; // Assurer que la requête s'exécute
        break; 

      default:
        // Par défaut, renvoyer les posts de l'établissement (venue)
        console.log(`[Producer Feed] Defaulting to 'venue' query for producerId: ${producerObjectId}, Type: ${producerType}`);
        query = {
          $or: [
            { producer_id: producerObjectId },
            { producerId: producerObjectId },
            { producer_id: producerIdParam }, // Fallback string
            { producerId: producerIdParam } // Fallback string
          ],
          // ET le type doit correspondre (si fourni et non 'user')
          ...(producerType && producerType !== 'user' && { 
              $or: [
                 { producer_type: producerType },
                 { producerType: producerType }
              ]
          })
        };
    }

    // Exécuter la requête et récupérer les posts (si l'opération précédente a réussi)
    if (operationSuccessful) {
        console.log('[Producer Feed] Executing query:', JSON.stringify(query));
        
        if (filter === 'localTrends') {
          // Trier les tendances par popularité (si possible, ajouter d'autres métriques)
          // Assurer l'existence de ces champs ou utiliser $size pour les arrays
          posts = await Post.find(query)
            .sort({ 
              // Tentative de tri par popularité (peut nécessiter des champs dénormalisés comme likes_count)
              // 'likes_count': -1, 
              // 'comments_count': -1, 
              'posted_at': -1, // Tri principal par date récente
              'createdAt': -1 
            })
            .skip(skip)
            .limit(parseInt(limit));
          total = await Post.countDocuments(query);
        } else {
          // Trier les autres filtres par date
          posts = await Post.find(query)
            .sort({ posted_at: -1, createdAt: -1 }) // Tri par date de post ou de création
            .skip(skip)
            .limit(parseInt(limit));
          total = await Post.countDocuments(query);
        }
        
        console.log(`[Producer Feed] Found ${posts.length} raw posts (Total potential: ${total}).`);

        // Normaliser les posts et ajouter les informations d'auteur
        const normalizedPostsPromises = posts.map(post => enrichPostWithAuthorInfo(post)); // Utiliser la fonction locale
        const normalizedPosts = (await Promise.all(normalizedPostsPromises)).filter(p => p !== null); // Filtrer les posts qui n'ont pas pu être enrichis

        console.log(`[Producer Feed] Successfully enriched ${normalizedPosts.length} posts.`);

        res.status(200).json({
          // S'assurer que la clé est 'posts' comme attendu par l'ancien code (si nécessaire)
          // ou 'items' si la standardisation de fetchFeed est préférée partout
          items: normalizedPosts, // Utiliser 'items' pour cohérence avec fetchFeed
          posts: normalizedPosts, // Garder 'posts' pour rétrocompatibilité si nécessaire
          totalPages: Math.ceil(total / parseInt(limit)),
          currentPage: parseInt(page),
          total,
          hasMore: (parseInt(page) * parseInt(limit)) < total // Calculer hasMore
        });
    } else {
        // Si operationSuccessful est false (ex: le producteur ne suit personne)
        console.log(`[Producer Feed] Operation unsuccessful for filter '${filter}'. Returning empty feed.`);
        res.status(200).json({
          items: [],
          posts: [],
          totalPages: 0,
          currentPage: parseInt(page),
          total: 0,
          hasMore: false
        });
    }
  } catch (error) {
    console.error('❌ Erreur lors de la récupération du feed producteur:', error);
    res.status(500).json({ 
      message: 'Erreur lors de la récupération du feed producteur', 
      error: error.message 
    });
  }
});

// GET /:producerId/venue-posts - Obtenir les posts de l'établissement
router.get('/:producerId/venue-posts', auth, async (req, res) => {
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

// GET /:producerId/interactions - Obtenir les interactions des utilisateurs avec l'établissement
router.get('/:producerId/interactions', auth, async (req, res) => {
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

// Exporter le router
module.exports = router; 
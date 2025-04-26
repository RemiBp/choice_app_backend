const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { createModel, databases } = require('../utils/modelCreator');
const { requireAuth } = require('../middleware/authMiddleware'); // <-- IMPORT REAL AUTH

// Importer le modèle Follow
const Follow = require('../models/Follow')(mongoose.connection.useDb(databases.CHOICE_APP)); // Assurer la connexion à la bonne DB

// Importer les modèles nécessaires au début du fichier si ce n'est pas déjà fait
const Producer = require('../models/Producer')(mongoose.connection.useDb(databases.RESTAURATION)); // Assumer Restauration par défaut
const LeisureProducer = require('../models/leisureProducer')(mongoose.connection.useDb(databases.LOISIR));
const WellnessPlace = require('../models/WellnessPlace')(mongoose.connection.useDb(databases.BEAUTY_WELLNESS));

// Initialiser les modèles avec l'utilitaire
const Post = createModel(
  databases.CHOICE_APP,
  'Post',
  'Posts'
);

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
router.get('/:producerId', requireAuth, async (req, res) => {
  try {
    const producerIdParam = req.params.producerId; // ID du profil consulté (peut être le même que l'utilisateur connecté)
    const loggedInUserId = req.user?.id; // ID de l'utilisateur/producteur connecté
    const { page = 1, limit = 10, filter = 'venue', producerType: loggedInProducerType = 'restaurant' } = req.query; // Type du producteur connecté
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const numericLimit = parseInt(limit);
    const fetchLimit = Math.ceil(numericLimit * 1.5); // Fetch more for diversification

    console.log(`🏪 [Producer Feed Request] Profile ID: ${producerIdParam}, Filter: ${filter}, Page: ${page}, Limit: ${limit}, LoggedIn UserID: ${loggedInUserId}, LoggedIn Type: ${loggedInProducerType}`);

    let aggregationPipeline = [];
    let initialMatch = {};
    let sortBy = { score: -1, posted_at: -1 };
    let operationSuccessful = true;
    let loggedInProducerCoords = null;
    let likedPostIds = [];
    let interestedTargetIds = [];
    let loggedInProducerProfileTags = []; // Declare with default value here

    // --- Fetch Logged-in Producer Context (Location, Likes, Interests) ---
    if (loggedInUserId) {
      try {
        let LoggedInProducerModel;
        let dbConnection;
        // Select model and connection based on loggedInProducerType
        if (loggedInProducerType === 'leisure') {
            LoggedInProducerModel = LeisureProducer;
            dbConnection = mongoose.connection.useDb(databases.LOISIR);
        } else if (loggedInProducerType === 'wellness') {
            LoggedInProducerModel = WellnessPlace;
            dbConnection = mongoose.connection.useDb(databases.BEAUTY_WELLNESS);
        } else {
            LoggedInProducerModel = Producer;
            dbConnection = mongoose.connection.useDb(databases.RESTAURATION);
        }
        // Ensure model registration
        if (!dbConnection.models[LoggedInProducerModel.modelName]) {
             dbConnection.model(LoggedInProducerModel.modelName, LoggedInProducerModel.schema);
        }
        LoggedInProducerModel = dbConnection.model(LoggedInProducerModel.modelName);
        
        let loggedInProducerObjectId;
         try { loggedInProducerObjectId = new mongoose.Types.ObjectId(loggedInUserId); } catch (e) { loggedInProducerObjectId = loggedInUserId; }

        // Fetch location AND profile data (e.g., types, category)
        const producerData = await LoggedInProducerModel.findById(loggedInProducerObjectId)
                                   .select('location.coordinates gps_coordinates geometry.location types category cuisine_type specialties') 
                                   .lean();
        
        if (producerData) {
            // Find coordinates from available fields
            if (producerData.location?.coordinates?.length === 2) {
                loggedInProducerCoords = producerData.location.coordinates;
            } else if (producerData.gps_coordinates?.coordinates?.length === 2) {
                 loggedInProducerCoords = producerData.gps_coordinates.coordinates;
            } else if (producerData.geometry?.location?.coordinates?.length === 2) { // Check geometry format
                 loggedInProducerCoords = producerData.geometry.location.coordinates;
            }
             console.log(`[Producer Feed] Logged-in producer coords: ${loggedInProducerCoords}`);
             
             // Extract profile tags/categories
             if (producerData.types) loggedInProducerProfileTags.push(...producerData.types);
             if (producerData.category) loggedInProducerProfileTags.push(...(Array.isArray(producerData.category) ? producerData.category : [producerData.category]));
             if (producerData.cuisine_type) loggedInProducerProfileTags.push(...producerData.cuisine_type);
             if (producerData.specialties) loggedInProducerProfileTags.push(...producerData.specialties);
             // Simple deduplication and cleanup
             loggedInProducerProfileTags = [...new Set(loggedInProducerProfileTags)].map(tag => tag.toLowerCase().trim()).filter(Boolean);
             console.log(`[Producer Feed] Logged-in producer profile tags/categories: ${loggedInProducerProfileTags.join(', ')}`);

        } else {
            console.warn(`[Producer Feed] Could not find logged-in producer data for ID: ${loggedInUserId} (Type: ${loggedInProducerType})`);
        }

        // Fetch IDs of posts liked by the logged-in user
        try {
            const likedPosts = await Post.find({ likes: loggedInProducerObjectId }).select('_id').lean();
            likedPostIds = likedPosts.map(p => p._id); // Array of ObjectIds
            console.log(`[Producer Feed] Logged-in user ${loggedInUserId} liked ${likedPostIds.length} posts.`);
        } catch (likeError) {
            console.error(`[Producer Feed] Error fetching liked posts for user ${loggedInUserId}:`, likeError);
        }

      } catch (contextError) {
        console.error(`[Producer Feed] Error fetching context for logged-in user ${loggedInUserId}:`, contextError);
      }
    }
    // --- End Fetch Context ---

    // --- Définition du Pipeline d'Agrégation --- 
    // 1. Filtre Initial ($match) - Basé sur le filtre et producerIdParam
    // (La logique du switch reste similaire, utilisant producerIdParam pour le contexte du filtre)
    switch (filter) {
      case 'venue':
        // Filtre pour "Mon lieu" : posts créés par ce producteur
        initialMatch = { 
            $or: [
                // Convertir producerIdParam en ObjectId si possible pour le match
                { producer_id: mongoose.Types.ObjectId.isValid(producerIdParam) ? new mongoose.Types.ObjectId(producerIdParam) : producerIdParam }, 
                { producerId: producerIdParam } // Garder la version string pour compatibilité
            ]
         };
        console.log(`[Producer Feed] Filter 'venue': Matching posts for producer ${producerIdParam}`);
        break;
      case 'interactions':
        initialMatch = {
          $and: [
            { user_id: { $exists: true } }, // Posts d'utilisateurs
            // Mentionnant ce producer (assurer la conversion en ObjectId si pertinent)
            { $or: [
                { mentions: producerIdParam }, 
                { target_id: producerIdParam }, 
                { targetId: producerIdParam }, 
                { producer_id: mongoose.Types.ObjectId.isValid(producerIdParam) ? new mongoose.Types.ObjectId(producerIdParam) : producerIdParam }, 
                { producerId: producerIdParam }
             ] }
          ]
        };
        break;
      case 'followers':
        console.log(`[Producer Feed] Filter 'followers': Fetching followed users for producer ${producerIdParam} (type: ${loggedInProducerType})`);
        let followingIds = [];
        try {
            let TargetProducerModel;
            let dbConnection;
            // Sélectionner le bon modèle et la bonne connexion DB
            if (loggedInProducerType === 'leisure') {
              TargetProducerModel = LeisureProducer;
              dbConnection = mongoose.connection.useDb(databases.LOISIR);
            } else if (loggedInProducerType === 'wellness') {
              TargetProducerModel = WellnessPlace;
              dbConnection = mongoose.connection.useDb(databases.BEAUTY_WELLNESS);
            } else { // 'restaurant' ou par défaut
              TargetProducerModel = Producer;
              dbConnection = mongoose.connection.useDb(databases.RESTAURATION);
            }
            
            // S'assurer que le modèle est bien enregistré sur la connexion
            if (!dbConnection.models[TargetProducerModel.modelName]) {
                 console.warn(`Model ${TargetProducerModel.modelName} was not registered on DB ${dbConnection.name}. Re-registering.`);
                 dbConnection.model(TargetProducerModel.modelName, TargetProducerModel.schema);
            }
            TargetProducerModel = dbConnection.model(TargetProducerModel.modelName);

            let producerObjectId;
            try {
              producerObjectId = new mongoose.Types.ObjectId(producerIdParam);
            } catch(e) {
              producerObjectId = producerIdParam;
            }

            // Récupérer le producteur et ses 'following'
            const producerDoc = await TargetProducerModel.findById(producerObjectId).select('following').lean();

            if (!producerDoc || !producerDoc.following || !Array.isArray(producerDoc.following.users) || producerDoc.following.users.length === 0) {
              console.log(`[Producer Feed] Producer ${producerObjectId} (type ${loggedInProducerType}) not found or is not following anyone.`);
              operationSuccessful = false; // Pas d'ID à chercher, le feed sera vide
            } else {
              followingIds = producerDoc.following.users; // Array of user ObjectIds
              console.log(`[Producer Feed] Found ${followingIds.length} followed user IDs for producer ${producerObjectId}.`);
              initialMatch = {
                user_id: { $in: followingIds } // Match posts where user_id is in the list of followed users
              };
            }
        } catch (error) {
            console.error(`[Producer Feed] Error fetching producer's following list for ${producerIdParam} (type ${loggedInProducerType}):`, error);
            operationSuccessful = false;
        }
        break;
      case 'localTrends':
        // Pas de $match initial, $geoNear est ajouté plus bas
        if (!loggedInProducerCoords) {
            console.warn("[Producer Feed] Cannot apply 'localTrends' filter: Logged-in producer coordinates not available. Falling back to general feed.");
            // Option: Fallback to a default match or remove geoNear stage
        } else {
             sortBy = { score: -1, distance: 1 }; // Sort by score, then proximity
        }
        break;
      // Ajoutez d'autres cas...
      default:
        if (loggedInProducerType && loggedInProducerType !== 'user') {
           initialMatch = { $or: [{ producer_type: loggedInProducerType }, { producerType: loggedInProducerType }] };
        }
        break;
    }
    
    // Si une étape critique a échoué (ex: impossible de trouver les followers), ne pas continuer l'agrégation
    if (!operationSuccessful) {
        console.log('[Producer Feed] Operation marked as unsuccessful. Returning empty feed.');
        return res.status(200).json({ posts: [], items: [], totalPages: 0, currentPage: parseInt(page), total: 0, hasMore: false });
    }

    // Ajouter le $match initial au pipeline s'il n'est pas vide
    if (Object.keys(initialMatch).length > 0) {
        aggregationPipeline.push({ $match: initialMatch });
    }
    
    // 3. Calcul des Scores ($addFields)
    aggregationPipeline.push({
      $addFields: {
        recencyScore: {
            $divide: [
                1,
                { $add: [1, { $divide: [{ $subtract: [new Date(), "$posted_at"] }, 1000 * 60 * 60 * 24] }] } // Divise par nb jours
            ]
        },
        popularityScore: {
           $cond: { 
              if: { $isArray: "$likes" }, 
              then: { $size: "$likes" }, 
              else: 0 
           }
        },
        interactionScore: {
           $cond: {
              if: { $in: ["$_id", likedPostIds] }, // Check if current post ID is in the liked list
              then: 1,
              else: 0
           }
        },
        // Nouveau: Score de pertinence thématique
        relevanceScore: {
           $let: {
              vars: {
                 // Convertir les tags/catégories du post en minuscules et s'assurer que c'est un tableau
                 postTags: { 
                     $map: { 
                         input: { $ifNull: [ { $cond: { if: { $isArray: "$tags" }, then: "$tags", else: [] } }, [] ] }, 
                         as: "tag", 
                         in: { $toLower: "$$tag" } 
                     }
                  },
                 postCategories: { 
                      $map: { 
                          input: { $ifNull: [ { $cond: { if: { $isArray: "$categories" }, then: "$categories", else: [] } }, [] ] }, 
                          as: "cat", 
                          in: { $toLower: "$$cat" } 
                      }
                  }
              },
              in: {
                 // Calculer l'intersection entre les tags/catégories du post et ceux du profil producteur
                 $size: { 
                    $filter: { 
                        input: "$$postTags", 
                        as: "postTag",
                        cond: { $in: ["$$postTag", loggedInProducerProfileTags] } // Now always defined
                    }
                 } 
              }
           }
        }
      }
    });
    
    // 4. Calcul du Score Final Pondéré ($addFields) - Inclure relevanceScore
    let weights = { recency: 0.4, popularity: 0.2, interaction: 0.1, relevance: 0.3 }; 
    if (filter === 'localTrends') {
        // Weights for localTrends without location
        weights = { recency: 0.4, popularity: 0.2, interaction: 0.1, relevance: 0.3 }; 
    } 
    
    aggregationPipeline.push({
        $addFields: {
            score: {
                $add: [
                    { $multiply: ["$recencyScore", weights.recency || 0] },
                    { $multiply: ["$popularityScore", weights.popularity || 0] },
                    { $multiply: ["$interactionScore", weights.interaction || 0] },
                    { $multiply: ["$relevanceScore", weights.relevance || 0] } 
                ]
            }
        }
    });

    // 5. Tri ($sort) - Adjusted for removed distance
    // Default sort is by score then recency
    sortBy = { score: -1, posted_at: -1 }; 
    aggregationPipeline.push({ $sort: sortBy });

    // 6. Pagination - Récupérer PLUS de posts pour la diversification
    aggregationPipeline.push({ $skip: skip });
    aggregationPipeline.push({ $limit: fetchLimit }); // Utiliser fetchLimit
    
    // --- Exécution du Pipeline --- 
    console.log("[Producer Feed] Executing Aggregation Pipeline:", JSON.stringify(aggregationPipeline).substring(0, 500) + "...");
    const aggregatedPostsRaw = await Post.aggregate(aggregationPipeline);

    // --- Comptage Total Précis --- 
    let total = 0;
    try {
        const countPipeline = aggregationPipeline.slice(0, -2); // Pipeline sans $skip, $limit
        // Retirer le $sort aussi pour optimiser le comptage
        if (countPipeline.length > 0 && countPipeline[countPipeline.length - 1].$sort) {
            countPipeline.pop(); 
        }
        countPipeline.push({ $count: 'totalDocs' });
        
        console.log("[Producer Feed] Executing Count Pipeline:", JSON.stringify(countPipeline).substring(0, 500) + "...");
        const countResult = await Post.aggregate(countPipeline);
        if (countResult.length > 0) {
            total = countResult[0].totalDocs;
        }
         console.log(`[Producer Feed] Accurate total posts found: ${total}`);
    } catch (countError) {
        console.error("[Producer Feed] Error executing count aggregation:", countError);
        // Fallback (moins précis, surtout avec $geoNear)
        try {
            let simpleMatchQuery = {};
            const initialMatchStage = aggregationPipeline.find(stage => stage.$match);
            if (initialMatchStage) simpleMatchQuery = initialMatchStage.$match;
             // Attention: countDocuments ne gère pas $geoNear nativement
             if (filter === 'localTrends') {
                 console.warn("Fallback countDocuments may be inaccurate for localTrends.");
                 // Pourrait nécessiter une requête find avec $geoNear pour un compte fallback plus précis
             } 
             total = await Post.countDocuments(simpleMatchQuery);
             console.log("[Producer Feed] Fallback countDocuments result:", total);
        } catch (fallbackError) {
             console.error("[Producer Feed] Fallback countDocuments also failed:", fallbackError);
             total = aggregatedPostsRaw.length; // Pire cas: utiliser le nombre récupéré
        }
    }

    // --- Diversification Post-Agrégation --- 
    const finalPosts = [];
    const recentAuthors = []; // Garder une trace des derniers auteurs ajoutés
    const maxConsecutiveAuthor = 2; // Limite

    for (const post of aggregatedPostsRaw) {
        if (finalPosts.length >= numericLimit) break; // Stop when we have enough posts

        const authorId = post.authorId || post.user_id || post.producer_id || 'unknown';
        
        // Compter combien de fois cet auteur apparaît dans les X derniers posts ajoutés
        const recentCount = recentAuthors.slice(-maxConsecutiveAuthor).filter(id => id === authorId).length;

        if (recentCount < maxConsecutiveAuthor) {
            finalPosts.push(post);
            recentAuthors.push(authorId);
            if (recentAuthors.length > maxConsecutiveAuthor * 2) { // Limiter la taille de l'historique
               recentAuthors.shift();
            } 
        } else {
             console.log(`[Producer Feed Diversification] Skipping post ${post._id} from author ${authorId} to improve variety.`);
        }
    }
    console.log(`[Producer Feed] Diversified results: ${finalPosts.length} posts returned (fetched ${aggregatedPostsRaw.length}).`);

    // --- Enrichissement des Posts FINAUX --- 
    const enrichedPostsPromises = finalPosts.map(post => enrichPostWithAuthorInfo(post));
    const enrichedPosts = await Promise.all(enrichedPostsPromises);

    console.log(`[Producer Feed] Successfully enriched ${enrichedPosts.length} posts.`);

    res.status(200).json({
      posts: enrichedPosts,
      items: enrichedPosts,
      totalPages: Math.ceil(total / numericLimit), // Utiliser le total précis
      currentPage: parseInt(page),
      total, // Utiliser le total précis
      hasMore: (parseInt(page) * numericLimit) < total // Comparer avec le total précis
    });

  } catch (error) {
    console.error('❌ Erreur lors de la récupération du feed producteur (agrégation):', error);
    res.status(500).json({ 
      message: 'Erreur lors de la récupération du feed producteur', 
      error: error.message 
    });
  }
});

// GET /:producerId/venue-posts - Obtenir les posts de l'établissement
router.get('/:producerId/venue-posts', requireAuth, async (req, res) => {
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
router.get('/:producerId/interactions', requireAuth, async (req, res) => {
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
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Conversation = require('../models/conversation'); // Import du modèle

// Connexion à la base Restauration_Officielle
const producerDb = mongoose.createConnection(process.env.MONGO_URI, {
  dbName: 'Restauration_Officielle',
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

// Modèle pour la collection producers
const Producer = producerDb.model(
  'Producer',
  new mongoose.Schema({}, { strict: false }),
  'producers'
);

// Endpoint : Recherche de producteurs proches avec filtres avancés
router.get('/nearby', async (req, res) => {
  try {
    const {
      latitude,
      longitude,
      radius = 5000,
      minRating,
      minServiceRating,
      minLocationRating,
      minPortionRating,
      minAmbianceRating,
      openingHours, // Format attendu : "Monday: 9:00 AM – 12:00 AM"
      choice,
      minFavorites,
      maxCarbonFootprint,
      minCalories,
      maxCalories,
      nutriScores, // A, B, C, D, E
      itemName,
      category,
      minPrice,
      maxPrice,
      minItemRating, // Renommé pour les filtres de note des items
      maxItemRating,
    } = req.query;

    if (!latitude || !longitude) {
      return res.status(400).json({ message: 'Latitude et longitude sont nécessaires.' });
    }

    console.log(`🔍 Recherche combinée : [lat=${latitude}, long=${longitude}, rayon=${radius}m]`);

    // Filtres spécifiques aux restaurants
    const restaurantFilters = {
      gps_coordinates: {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: [parseFloat(longitude), parseFloat(latitude)],
          },
          $maxDistance: parseInt(radius),
        },
      },
      ...(minRating && { rating: { $gte: parseFloat(minRating) } }),
      ...(minServiceRating && { 'notes_globales.service': { $gte: parseFloat(minServiceRating) } }),
      ...(minLocationRating && { 'notes_globales.lieu': { $gte: parseFloat(minLocationRating) } }),
      ...(minPortionRating && { 'notes_globales.portions': { $gte: parseFloat(minPortionRating) } }),
      ...(minAmbianceRating && { 'notes_globales.ambiance': { $gte: parseFloat(minAmbianceRating) } }),
      ...(minFavorites && { abonnés: { $gte: parseInt(minFavorites) } }),
      ...(category && { category: { $regex: category, $options: 'i' } }),
      ...(choice && { choice: { $regex: choice, $options: 'i' } }),
    };

    // Gestion des horaires d'ouverture
    if (openingHours) {
      const [day, timeRange] = openingHours.split(':'); // Ex : "Monday: 9:00 AM – 12:00 AM"
      if (day && timeRange) {
        const times = timeRange.trim().split('–'); // Ex : ["9:00 AM", "12:00 AM"]
        if (times.length === 2) {
          const [startTime, endTime] = times.map((time) => time.trim());
          restaurantFilters.opening_hours = {
            $regex: new RegExp(`${day}:.*(${startTime}|${endTime})`, 'i'),
          };
        } else {
          console.error('❌ Format des horaires incorrect:', timeRange);
        }
      } else {
        console.error('❌ Format des horaires incorrect:', openingHours);
      }
    }

    // Filtres spécifiques aux items des menus
    const itemFilters = {
      ...(itemName && { 'structured_data.Items Indépendants.items.nom': { $regex: itemName, $options: 'i' } }),
      ...(minPrice && { 'structured_data.Items Indépendants.items.prix': { $gte: parseFloat(minPrice) } }),
      ...(maxPrice && { 'structured_data.Items Indépendants.items.prix': { $lte: parseFloat(maxPrice) } }),
      ...(minCalories && {
        'structured_data.Items Indépendants.items.nutrition.calories': { $gte: parseFloat(minCalories) },
      }),
      ...(maxCalories && {
        'structured_data.Items Indépendants.items.nutrition.calories': { $lte: parseFloat(maxCalories) },
      }),
      ...(maxCarbonFootprint && {
        'structured_data.Items Indépendants.items.carbon_footprint': { $lte: parseFloat(maxCarbonFootprint) },
      }),
      ...(nutriScores && {
        'structured_data.Items Indépendants.items.nutri_score': { $in: nutriScores.split(',') },
      }),
      ...(minItemRating && {
        'structured_data.Items Indépendants.items.note': {
          $gte: parseFloat(minItemRating), // Utilisation de minItemRating
        },
      }),
      ...(maxItemRating && {
        'structured_data.Items Indépendants.items.note': {
          $lte: parseFloat(maxItemRating), // Idem pour la note maximale
        },
      }),
    };

    // Combiner les deux filtres
    const query = {
      ...restaurantFilters,
      ...(Object.keys(itemFilters).length > 0 && { $and: [itemFilters] }),
    };

    // Effectuer la requête sur la base de données
    const producers = await Producer.find(query).select(
      'name address gps_coordinates photo description abonnés rating notes_globales opening_hours structured_data'
    );

    console.log(`🔍 Producteurs trouvés : ${producers.length}`);
    res.json(producers);
  } catch (err) {
    console.error('❌ Erreur lors de la recherche combinée :', err);
    res.status(500).json({ message: 'Erreur interne du serveur.' });
  }
});

// Endpoint : Recherche de producteurs par mots-clés
router.get('/search', async (req, res) => {
  try {
    const { query } = req.query;

    if (!query || query.trim() === '') {
      return res.status(400).json({ message: 'Veuillez fournir un mot-clé pour la recherche.' });
    }

    console.log('🔍 Recherche pour le mot-clé :', query);

    const producers = await Producer.find({
      $or: [
        { name: { $regex: query, $options: 'i' } },
        { address: { $regex: query, $options: 'i' } },
        { description: { $regex: query, $options: 'i' } },
      ],
    }).select('name address photo description category structured_data');

    console.log(`🔍 ${producers.length} producteur(s) trouvé(s)`);

    if (producers.length === 0) {
      return res.status(404).json({ message: 'Aucun producteur trouvé.' });
    }

    res.json(producers);
  } catch (err) {
    console.error('❌ Erreur lors de la recherche des producteurs :', err);
    res.status(500).json({ message: 'Erreur interne du serveur.' });
  }
});

// Endpoint : Détail d'un producteur par ID
router.get('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: 'ID invalide.' });
    }

    console.log(`🔍 Recherche d'un producteur avec ID : ${id}`);
    const producer = await Producer.findById(id);

    if (!producer) {
      return res.status(404).json({ message: 'Producteur non trouvé.' });
    }

    res.status(200).json(producer);
  } catch (err) {
    console.error('❌ Erreur lors de la récupération du producteur :', err.message);
    res.status(500).json({ message: 'Erreur interne du serveur.' });
  }
});

// Endpoint : Créer une conversation et envoyer un message avec un producteur
router.post('/conversations/new-message', async (req, res) => {
  const { senderId, recipientIds, content } = req.body;

  if (!senderId || !recipientIds || recipientIds.length === 0 || !content) {
    return res.status(400).json({
      message: 'Le senderId, au moins un recipientId, et le contenu sont obligatoires.',
    });
  }

  try {
    // Combine senderId et recipientIds pour créer la liste des participants
    const participants = [senderId, ...recipientIds];

    // Vérifie si une conversation existe déjà pour ces participants
    let conversation = await Conversation.findOne({
      participants: { $all: participants, $size: participants.length },
    });

    // Si elle n'existe pas, la créer
    if (!conversation) {
      conversation = new Conversation({
        participants,
        messages: [],
        lastUpdated: Date.now(),
      });
    }

    // Vérifie si participants est défini, sinon initialise-le
    if (!Array.isArray(conversation.participants)) {
      conversation.participants = [];
    }

    // Ajoute le message initial
    const newMessage = {
      senderId,
      content,
      timestamp: Date.now(),
    };

    conversation.messages.push(newMessage);
    conversation.lastUpdated = Date.now();

    // Sauvegarde de la conversation
    await conversation.save();

    // Mettre à jour le champ `conversations` des producteurs concernés
    const updateProducerConversations = async (producerId) => {
      await Producer.findByIdAndUpdate(
        producerId,
        { $addToSet: { conversations: conversation._id } }, // $addToSet évite les doublons
        { new: true }
      );
    };

    await Promise.all(participants.map((producerId) => updateProducerConversations(producerId)));

    res.status(201).json({
      message: 'Message envoyé avec succès.',
      conversationId: conversation._id,
      newMessage,
    });
  } catch (error) {
    console.error(
      'Erreur lors de la création de la conversation ou de l\'envoi du message :',
      error.message
    );
    res.status(500).json({ message: 'Erreur serveur.' });
  }
});


// Endpoint : Récupérer les conversations d’un producteur
router.get('/:producerId/conversations', async (req, res) => {
  const { producerId } = req.params;

  try {
    // Vérifiez que le producteur existe
    const producer = await Producer.findById(producerId);
    if (!producer) {
      return res.status(404).json({ message: 'Producteur non trouvé.' });
    }

    // Récupérer toutes les conversations associées au producteur
    const conversations = await Conversation.find({
      participants: producerId,
    }).populate('participants', 'name profilePicture');

    res.status(200).json(conversations);
  } catch (error) {
    console.error('Erreur lors de la récupération des conversations :', error.message);
    res.status(500).json({ message: 'Erreur serveur.' });
  }
});

// Endpoint : Récupérer les posts publiés dans un lieu (venue) du producteur
router.get('/:producerId/venue-posts', async (req, res) => {
  try {
    const { producerId } = req.params;
    const { page = 1, limit = 10 } = req.query;
    
    // Vérifier si l'ID est valide
    if (!mongoose.isValidObjectId(producerId)) {
      return res.status(400).json({ message: 'ID de producteur invalide.' });
    }

    // Récupérer le producteur
    const producer = await Producer.findById(producerId);
    if (!producer) {
      return res.status(404).json({ message: 'Producteur non trouvé.' });
    }

    // Récupérer les posts du producteur (avec pagination)
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Connexion à la base de données principale pour les posts
    const choiceAppDb = mongoose.createConnection(process.env.MONGO_URI, {
      dbName: 'ChoiceApp',
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    
    const Post = choiceAppDb.model(
      'Post',
      new mongoose.Schema({}, { strict: false }),
      'Posts'
    );
    
    // Chercher les posts publiés par ou concernant ce producteur
    const posts = await Post.find({
      $or: [
        { producer_id: producerId },                  // Posts publiés par le producteur
        { 'location._id': producerId }                // Posts taggant ce lieu
      ]
    })
    .sort({ time_posted: -1 })                        // Du plus récent au plus ancien
    .skip(skip)
    .limit(parseInt(limit))
    .lean();
    
    // Ajouter des détails du producteur à chaque post
    const enrichedPosts = posts.map(post => ({
      ...post,
      authorName: producer.name || 'Lieu sans nom',
      authorAvatar: producer.photo || '',
      isProducerPost: true
    }));
    
    // Déterminer s'il y a plus de posts à charger
    const totalPosts = await Post.countDocuments({
      $or: [
        { producer_id: producerId },
        { 'location._id': producerId }
      ]
    });
    
    const hasMore = totalPosts > skip + enrichedPosts.length;
    
    res.json({
      items: enrichedPosts,
      hasMore,
      totalCount: totalPosts
    });
  } catch (error) {
    console.error('❌ Erreur lors de la récupération des posts du lieu :', error);
    res.status(500).json({ message: 'Erreur lors de la récupération du feed: ' + error.message });
  }
});

// Endpoint : Récupérer les interactions liées à l'activité du producteur
router.get('/:producerId/interactions', async (req, res) => {
  try {
    const { producerId } = req.params;
    const { page = 1, limit = 10 } = req.query;
    
    // Vérifier si l'ID est valide
    if (!mongoose.isValidObjectId(producerId)) {
      return res.status(400).json({ message: 'ID de producteur invalide.' });
    }

    // Récupérer le producteur
    const producer = await Producer.findById(producerId);
    if (!producer) {
      return res.status(404).json({ message: 'Producteur non trouvé.' });
    }

    // Connexion à la base de données principale pour les posts
    const choiceAppDb = mongoose.createConnection(process.env.MONGO_URI, {
      dbName: 'ChoiceApp',
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    
    const Post = choiceAppDb.model(
      'Post',
      new mongoose.Schema({}, { strict: false }),
      'Posts'
    );
    
    const User = choiceAppDb.model(
      'User',
      new mongoose.Schema({}, { strict: false }),
      'Users'
    );
    
    // Récupérer les followers du producteur
    const followerIds = producer.followers || [];
    
    // Chercher les posts des followers ainsi que les interactions avec le producteur
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Récupérer les derniers posts des followers
    const followerPosts = await Post.find({
      user_id: { $in: followerIds }
    })
    .sort({ time_posted: -1 })
    .skip(skip)
    .limit(parseInt(limit))
    .lean();
    
    // Récupérer également les commentaires et likes récents sur les posts du producteur
    const recentInteractions = await Post.aggregate([
      // Match posts du producteur
      { $match: { producer_id: producerId } },
      // Dérouler les commentaires
      { $unwind: { path: "$comments", preserveNullAndEmptyArrays: true } },
      // Trier par date de commentaire
      { $sort: { "comments.time_posted": -1 } },
      // Limiter aux commentaires récents
      { $limit: parseInt(limit) },
      // Regrouper par post
      { $group: {
          _id: "$_id",
          post: { $first: "$$ROOT" },
          recentComment: { $first: "$comments" }
      }},
      // Reformater pour le résultat final
      { $project: {
          _id: "$post._id",
          content: "$post.content",
          author_id: "$post.user_id",
          producer_id: "$post.producer_id",
          time_posted: "$post.time_posted",
          media: "$post.media",
          interactionType: "comment",
          interactionUser: "$recentComment.user_id",
          interactionContent: "$recentComment.content",
          interactionTime: "$recentComment.time_posted"
      }}
    ]);
    
    // Enrichir les posts des followers avec les informations utilisateur
    const followerDetails = await User.find(
      { _id: { $in: followerIds } },
      { username: 1, profilePicture: 1 }
    ).lean();
    
    const followerDetailsMap = followerDetails.reduce((map, user) => {
      map[user._id.toString()] = {
        name: user.username,
        avatar: user.profilePicture
      };
      return map;
    }, {});
    
    const enrichedFollowerPosts = followerPosts.map(post => ({
      ...post,
      authorName: followerDetailsMap[post.user_id]?.name || 'Utilisateur',
      authorAvatar: followerDetailsMap[post.user_id]?.avatar || '',
      interaction: {
        type: 'post',
        label: 'a publié'
      }
    }));
    
    // Enrichir les interactions
    const enrichedInteractions = recentInteractions.map(interaction => ({
      ...interaction,
      authorName: producer.name || 'Lieu sans nom',
      authorAvatar: producer.photo || '',
      interaction: {
        type: interaction.interactionType,
        userId: interaction.interactionUser,
        content: interaction.interactionContent,
        time: interaction.interactionTime,
        label: interaction.interactionType === 'comment' ? 'a commenté' : 'a aimé'
      }
    }));
    
    // Combiner et trier tous les éléments par date
    const combinedItems = [...enrichedFollowerPosts, ...enrichedInteractions]
      .sort((a, b) => {
        const dateA = a.interaction?.time || a.time_posted;
        const dateB = b.interaction?.time || b.time_posted;
        return new Date(dateB) - new Date(dateA);
      })
      .slice(0, parseInt(limit));
    
    // Calculer s'il y a plus d'éléments à charger
    const totalFollowerPosts = await Post.countDocuments({
      user_id: { $in: followerIds }
    });
    
    const totalInteractions = await Post.aggregate([
      { $match: { producer_id: producerId } },
      { $unwind: { path: "$comments", preserveNullAndEmptyArrays: false } },
      { $count: "total" }
    ]);
    
    const totalCount = totalFollowerPosts + (totalInteractions[0]?.total || 0);
    const hasMore = totalCount > skip + combinedItems.length;
    
    res.json({
      items: combinedItems,
      hasMore,
      totalCount
    });
  } catch (error) {
    console.error('❌ Erreur lors de la récupération des interactions :', error);
    res.status(500).json({ message: 'Erreur lors de la récupération des interactions: ' + error.message });
  }
});

// Endpoint : Récupérer les tendances locales pour un producteur
router.get('/:producerId/local-trends', async (req, res) => {
  try {
    const { producerId } = req.params;
    const { page = 1, limit = 10 } = req.query;
    
    // Vérifier si l'ID est valide
    if (!mongoose.isValidObjectId(producerId)) {
      return res.status(400).json({ message: 'ID de producteur invalide.' });
    }
    
    // Récupérer le producteur pour obtenir sa localisation
    const producer = await Producer.findById(producerId);
    if (!producer) {
      return res.status(404).json({ message: 'Producteur non trouvé.' });
    }
    
    // Connexion à la base de données principale
    const choiceAppDb = mongoose.createConnection(process.env.MONGO_URI, {
      dbName: 'ChoiceApp',
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    
    const Post = choiceAppDb.model(
      'Post',
      new mongoose.Schema({}, { strict: false }),
      'Posts'
    );
    
    // Récupérer la localisation du producteur
    const coordinates = producer.gps_coordinates?.coordinates;
    
    // Si les coordonnées sont disponibles, rechercher les posts à proximité
    let localPosts = [];
    if (coordinates && coordinates.length === 2) {
      const [longitude, latitude] = coordinates;
      const radius = 10000; // 10km (en mètres)
      
      // Rechercher des posts dans un rayon de 10km
      const skip = (parseInt(page) - 1) * parseInt(limit);
      
      localPosts = await Post.find({
        'location.coordinates': {
          $near: {
            $geometry: {
              type: 'Point',
              coordinates: [longitude, latitude]
            },
            $maxDistance: radius
          }
        }
      })
      .sort({ time_posted: -1, likes_count: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();
    } else {
      // Si pas de coordonnées, retourner les posts les plus populaires récents
      const skip = (parseInt(page) - 1) * parseInt(limit);
      
      // Récupérer les posts les plus populaires récents
      localPosts = await Post.find({})
        .sort({ likes_count: -1, time_posted: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean();
    }
    
    // Ajouter un flag pour indiquer que ce sont des tendances locales
    const enrichedPosts = localPosts.map(post => ({
      ...post,
      isTrend: true,
      trendReason: post.likes_count > 10 ? 'Populaire dans votre région' : 'Récent dans votre région'
    }));
    
    // Calculer s'il y a plus de posts à charger
    const totalCount = await Post.countDocuments({
      'location.coordinates': coordinates && coordinates.length === 2
        ? {
            $near: {
              $geometry: {
                type: 'Point',
                coordinates: coordinates
              },
              $maxDistance: 10000 // 10km
            }
          }
        : { $exists: true }
    });
    
    const hasMore = totalCount > (parseInt(page) - 1) * parseInt(limit) + enrichedPosts.length;
    
    // Ajouter un message d'analyse IA
    const aiMessage = {
      _id: 'ai-trends-' + Date.now(),
      type: 'ai_message',
      content: `Basé sur l'analyse de votre région, nous avons identifié ${totalCount} publications récentes. ${enrichedPosts.length > 0 ? `Les sujets tendance incluent: ${Array.from(new Set(enrichedPosts.slice(0, 3).map(p => p.content?.slice(0, 30) + '...'))).join(', ')}` : 'Aucune tendance significative n\'a été identifiée pour le moment.'}`,
      timestamp: new Date()
    };
    
    res.json({
      items: [aiMessage, ...enrichedPosts],
      hasMore,
      totalCount
    });
  } catch (error) {
    console.error('❌ Erreur lors de la récupération des tendances locales :', error);
    res.status(500).json({ message: 'Erreur lors de la récupération des tendances: ' + error.message });
  }
});

// Endpoint : Récupérer les informations sur interestedUsers, choiceUsers, following, et followers d'un producteur
// Endpoint : Récupérer les relations (followers, following, interestedUsers, choiceUsers) d'un producteur
router.get('/:producerId/relations', async (req, res) => {
  const { producerId } = req.params;

  try {
    // Vérifier d'abord si l'ID est un ObjectId valide
    if (!mongoose.isValidObjectId(producerId)) {
      return res.status(400).json({ message: 'ID invalide.' });
    }

    // Vérifiez que le producteur existe
    const producer = await Producer.findById(producerId).select(
      'followers following choiceUsers interestedUsers'
    );

    if (!producer) {
      return res.status(404).json({ message: 'Producteur non trouvé.' });
    }

    console.log('Relations récupérées depuis la base de données:', producer);

    // Structure des données avec les décomptes
    const data = {
      followers: {
        count: producer.followers?.length || 0,
        users: producer.followers?.map((id) => id.toString()) || [], // Conversion en string
      },
      following: {
        count: producer.following?.length || 0,
        users: producer.following?.map((id) => id.toString()) || [], // Conversion en string
      },
      choiceUsers: {
        count: producer.choiceUsers?.length || 0,
        users: producer.choiceUsers?.map(({ userId }) => userId.toString()) || [], // Conversion en string
      },
      interestedUsers: {
        count: producer.interestedUsers?.length || 0,
        users: producer.interestedUsers?.map((id) => id.toString()) || [], // Conversion en string
      },
    };  

    console.log('Données à renvoyer au frontend:', data);

    res.status(200).json(data);
  } catch (error) {
    console.error('Erreur lors de la récupération des relations :', error.message);
    res.status(500).json({ message: 'Erreur interne du serveur.' });
  }
});

// Endpoint : Mettre à jour les menus et les items d'un producteur
router.post('/:producerId/update-items', async (req, res) => {
  console.log('Update items endpoint hit!');
  const { producerId } = req.params;
  const { structured_data } = req.body;

  if (!structured_data || typeof structured_data !== 'object') {
    return res.status(400).json({ message: 'Données structurées invalides ou manquantes.' });
  }

  try {
    const updatedProducer = await Producer.findByIdAndUpdate(
      producerId,
      { 
        $set: { structured_data }, // Met à jour uniquement le champ structured_data
      },
      { new: true, upsert: true } // `new` pour retourner l'objet mis à jour, `upsert` pour créer s'il n'existe pas
    );

    if (!updatedProducer) {
      return res.status(404).json({ message: 'Producteur non trouvé ou mise à jour échouée.' });
    }

    console.log('✅ Mise à jour réussie :', updatedProducer);
    res.status(200).json({
      message: 'Items mis à jour avec succès.',
      structured_data: updatedProducer.structured_data,
    });
  } catch (err) {
    console.error('❌ Erreur lors de la mise à jour des items :', err.message);
    res.status(500).json({ message: 'Erreur interne du serveur.' });
  }
});

// Endpoint : Mettre à jour un item
router.put('/:producerId/items/:itemId', async (req, res) => {
  const { producerId, itemId } = req.params;
  const { description, prix } = req.body;

  try {
    const producer = await Producer.findById(producerId);

    if (!producer) {
      return res.status(404).json({ message: 'Producteur non trouvé.' });
    }

    let itemUpdated = false;

    producer.structured_data['Items Indépendants'].forEach((category) => {
      category.items.forEach((item) => {
        if (item._id.toString() === itemId) {
          itemUpdated = true;
          if (description) item.description = description;
          if (prix !== undefined) item.prix = prix;
        }
      });
    });

    if (!itemUpdated) {
      return res.status(404).json({ message: 'Item non trouvé.' });
    }

    // Force Mongoose à marquer `structured_data` comme modifié
    producer.markModified('structured_data');

    await producer.save();

    res.status(200).json({ message: 'Item mis à jour avec succès.', structured_data: producer.structured_data });
  } catch (err) {
    console.error('❌ Erreur lors de la mise à jour :', err.message);
    res.status(500).json({ message: 'Erreur interne du serveur.' });
  }
});


router.delete('/:producerId/items/:itemId', async (req, res) => {
  const { producerId, itemId } = req.params;

  try {
    const producer = await Producer.findById(producerId);

    if (!producer) {
      return res.status(404).json({ message: 'Producteur non trouvé.' });
    }

    let itemDeleted = false;

    producer.structured_data['Items Indépendants'].forEach((category) => {
      const initialLength = category.items.length;
      category.items = category.items.filter((item) => item._id.toString() !== itemId);

      if (category.items.length < initialLength) {
        itemDeleted = true;
      }
    });

    if (!itemDeleted) {
      return res.status(404).json({ message: 'Item non trouvé.' });
    }

    // Force Mongoose à marquer `structured_data` comme modifié
    producer.markModified('structured_data');

    await producer.save();
    res.status(200).json({ message: 'Item supprimé avec succès.' });
  } catch (err) {
    console.error('❌ Erreur lors de la suppression de l\'item :', err.message);
    res.status(500).json({ message: 'Erreur interne du serveur.' });
  }
});


// Endpoint : Ajouter un nouvel item
router.post('/:producerId/items', async (req, res) => {
  const { producerId } = req.params;
  const { nom, description, prix, catégorie } = req.body;

  if (!nom || !catégorie) {
    return res.status(400).json({ message: 'Le nom et la catégorie sont obligatoires.' });
  }

  try {
    const producer = await Producer.findById(producerId);

    if (!producer) {
      return res.status(404).json({ message: 'Producteur non trouvé.' });
    }

    let targetCategory = producer.structured_data['Items Indépendants'].find(
      (cat) => cat.catégorie === catégorie
    );

    if (!targetCategory) {
      targetCategory = { catégorie, items: [] };
      producer.structured_data['Items Indépendants'].push(targetCategory);
    }

    targetCategory.items.push({ _id: new mongoose.Types.ObjectId(), nom, description, prix });

    // Marque structured_data comme modifié
    producer.markModified('structured_data');

    await producer.save();

    res.status(201).json({ message: 'Item ajouté avec succès.', structured_data: producer.structured_data });
  } catch (err) {
    console.error('❌ Erreur lors de l\'ajout de l\'item :', err.message);
    res.status(500).json({ message: 'Erreur interne du serveur.' });
  }
});



router.post('/:producerId/categories', async (req, res) => {
  const { producerId } = req.params;
  const { catégorie } = req.body;

  if (!catégorie) {
    return res.status(400).json({ message: 'La catégorie est obligatoire.' });
  }

  try {
    const producer = await Producer.findById(producerId);

    if (!producer) {
      return res.status(404).json({ message: 'Producteur non trouvé.' });
    }

    const existingCategory = producer.structured_data['Items Indépendants'].find(
      cat => cat.catégorie === catégorie
    );

    if (existingCategory) {
      return res.status(400).json({ message: 'La catégorie existe déjà.' });
    }

    producer.structured_data['Items Indépendants'].push({ catégorie, items: [] });

    // Marque structured_data comme modifié
    producer.markModified('structured_data');

    await producer.save();

    res.status(201).json({ message: 'Catégorie créée avec succès.' });
  } catch (err) {
    console.error('❌ Erreur lors de la création de la catégorie :', err.message);
    res.status(500).json({ message: 'Erreur interne du serveur.' });
  }
});


// Endpoint : Supprimer une catégorie
router.delete('/:producerId/categories/:categoryName', async (req, res) => {
  const { producerId, categoryName } = req.params;

  try {
    const producer = await Producer.findById(producerId);

    if (!producer) {
      return res.status(404).json({ message: 'Producteur non trouvé.' });
    }

    const initialLength = producer.structured_data['Items Indépendants'].length;
    producer.structured_data['Items Indépendants'] = producer.structured_data['Items Indépendants'].filter(
      cat => cat.catégorie !== categoryName
    );

    if (producer.structured_data['Items Indépendants'].length === initialLength) {
      return res.status(404).json({ message: 'Catégorie non trouvée.' });
    }

    // Marque structured_data comme modifié
    producer.markModified('structured_data');

    await producer.save();
    res.status(200).json({ message: 'Catégorie supprimée avec succès.' });
  } catch (err) {
    console.error('❌ Erreur lors de la suppression de la catégorie :', err.message);
    res.status(500).json({ message: 'Erreur interne du serveur.' });
  }
});


// Endpoint : Mettre à jour un menu global
router.post('/:producerId/menus', async (req, res) => {
  const { producerId } = req.params;
  const { nom, prix, inclus } = req.body;

  if (!nom || !prix) {
    return res.status(400).json({ message: 'Le nom et le prix sont obligatoires.' });
  }

  try {
    const producer = await Producer.findById(producerId);

    if (!producer) {
      return res.status(404).json({ message: 'Producteur non trouvé.' });
    }

    producer.structured_data['Menus Globaux'].push({
      _id: new mongoose.Types.ObjectId(),
      nom,
      prix,
      inclus,
    });

    // Marque structured_data comme modifié
    producer.markModified('structured_data');

    await producer.save();

    res.status(201).json({ message: 'Menu ajouté avec succès.', structured_data: producer.structured_data });
  } catch (err) {
    console.error('❌ Erreur lors de l\'ajout du menu :', err.message);
    res.status(500).json({ message: 'Erreur interne du serveur.' });
  }
});



// Endpoint : Ajouter un nouveau menu global
router.post('/:producerId/menus', async (req, res) => {
  const { producerId } = req.params;
  const { nom, prix, inclus } = req.body;

  if (!nom || !prix) {
    return res.status(400).json({ message: 'Le nom et le prix sont obligatoires.' });
  }

  try {
    const producer = await Producer.findById(producerId);

    if (!producer) {
      return res.status(404).json({ message: 'Producteur non trouvé.' });
    }

    producer.structured_data['Menus Globaux'].push({ nom, prix, inclus });
    await producer.save();

    res.status(201).json({ message: 'Menu ajouté avec succès.' });
  } catch (err) {
    console.error('❌ Erreur lors de l\'ajout du menu :', err.message);
    res.status(500).json({ message: 'Erreur interne du serveur.' });
  }
});


module.exports = router;

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Conversation = require('../models/conversation'); // Import du modèle
const producerController = require('../controllers/producerController');
const { restaurationDb } = require('../index');
const Producer = require('../models/Producer');
const crypto = require('crypto');
const bcrypt = require('bcrypt');

/**
 * IMPORTANT: L'ordre des routes est crucial!
 * Les routes spécifiques comme "/advanced-search" doivent être définies AVANT
 * les routes génériques avec paramètres comme "/:id" pour éviter les conflits.
 * Express lit les routes de haut en bas et utilise la première qui correspond.
 */

// Connexion à la base Restauration_Officielle
const producerDb = mongoose.createConnection(process.env.MONGO_URI, {
  dbName: 'Restauration_Officielle',
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

// Initialiser le contrôleur producerController avec la connexion à la base de données
producerController.initialize({ restaurationDb: producerDb });

// Modèle pour la collection producers
const ProducerSchema = new mongoose.Schema({
  place_id: String,
  name: String,
  verified: Boolean,
  photo: String,
  description: String,
  menu: Array,
  address: String,
  gps_coordinates: {
    type: { type: String, enum: ['Point'] },
    coordinates: [Number]
  },
  category: [String],
  opening_hours: [String],
  phone_number: String,
  website: String,
  notes_globales: {
    service: Number,
    lieu: Number,
    portions: Number,
    ambiance: Number
  },
  abonnés: Number,
  photos: [String],
  rating: Number,
  price_level: Number,
  promotion: {
    active: Boolean,
    discountPercentage: Number,
    endDate: Date
  },
  followers: [String]
});

// Ajouter l'index géospatial
ProducerSchema.index({ gps_coordinates: '2dsphere' });

// Création du modèle
const ProducerModel = producerDb.model('producer', ProducerSchema, 'producers');

// TODO: Define a detailed schema for structured_data (Menus Globaux, Items Indépendants)
//       within ProducerSchema for better validation, querying, and consistency.

// Middleware d'authentification (à importer si nécessaire)
const auth = async (req, res, next) => {
  // Votre logique d'authentification ici
  next();
};

/**
 * Routes pour les producteurs (restaurants)
 */

// Placer en premier la route de recherche avancée pour éviter les conflits
/**
 * @route   GET /api/producers/advanced-search
 * @desc    Recherche avancée de restaurants avec filtres multiples
 * @access  Public
 */
router.get('/advanced-search', async (req, res) => {
  try {
    // Vérifier si les index géospatiaux sont disponibles
    let hasGeoIndexes = false;
    try {
      const indexes = await ProducerModel.collection.indexes();
      hasGeoIndexes = indexes.some(index => 
        index.key && (
          (index.key['gps_coordinates'] === '2dsphere') || 
          (index.key['geometry.location'] === '2dsphere')
        )
      );
      console.log(`ℹ️ Index géospatiaux disponibles: ${hasGeoIndexes}`);
    } catch (indexError) {
      console.error(`⚠️ Erreur lors de la vérification des index: ${indexError.message}`);
    }
    
    // Paramètres de pagination
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    
    // Récupération de tous les paramètres de filtrage
    const {
      // Coordonnées géographiques
      lat,                 // Latitude
      lng,                 // Longitude
      radius,              // Rayon de recherche en mètres
      
      // Filtres pour restaurants
      searchKeyword,       // Recherche textuelle (nom, description)
      cuisine_type,        // Type de cuisine
      specialties,         // Spécialités
      business_status,     // Statut du business
      min_followers,       // Popularité minimale (abonnés)
      promotion_active,    // Promotions actives (boolean)
      min_promotion,       // Pourcentage minimum de réduction
      min_rating,          // Note minimale
      max_price_level,     // Niveau de prix maximum
      minPrice,            // Prix minimum
      maxPrice,            // Prix maximum
      
      // Filtres pour items (plats/menus)
      itemKeywords,        // Recherche dans les noms/descriptions d'items
      min_calories,        // Calories minimum
      max_calories,        // Calories maximum
      max_carbon_footprint,// Bilan carbone maximum
      nutri_scores,        // Nutri-scores (A,B,C,D,E)
      min_item_rating,     // Note minimale d'un plat
      max_item_price       // Prix maximum d'un plat
    } = req.query;
    
    // Tableau pour stocker toutes les conditions de filtrage
    const queryConditions = [];
    
    // Filtre géographique si les coordonnées sont fournies
    if (lat && lng && radius) {
      // Convertir les paramètres en nombres
      const latitude = parseFloat(lat);
      const longitude = parseFloat(lng);
      const searchRadius = parseInt(radius);
      
      // Vérifier si les coordonnées sont valides
      if (!isNaN(latitude) && !isNaN(longitude) && !isNaN(searchRadius)) {
        console.log(`🌍 Recherche géospatiale: lat=${latitude}, lng=${longitude}, radius=${searchRadius}m`);
        
        // Déterminer les critères géographiques à utiliser (avec gestion des erreurs)
        let geoQueryApplied = false;
        
        // N'essayer les requêtes géospatiales que si nous avons des index
        if (hasGeoIndexes) {
          // Essayer d'abord avec gps_coordinates
          try {
            const testQuery = {
              gps_coordinates: {
                $geoWithin: {
                  $centerSphere: [
                    [longitude, latitude],
                    searchRadius / 6371000  // Convertir en radians (rayon de la Terre = 6371km)
                  ]
                }
              }
            };
            
            // Tester si la requête est valide en exécutant une requête limitée à 1 résultat
            const testResult = await ProducerModel.find(testQuery).limit(1);
            console.log(`✅ Test avec gps_coordinates réussi`);
            
            // Si aucune erreur n'est levée, ajouter la condition à la requête
            queryConditions.push(testQuery);
            geoQueryApplied = true;
          } catch (gpsError) {
            console.error(`⚠️ Erreur avec gps_coordinates: ${gpsError.message}`);
            
            // Essayer avec geometry.location
            try {
              const geometryQuery = {
                "geometry.location": {
                  $geoWithin: {
                    $centerSphere: [
                      [longitude, latitude],
                      searchRadius / 6371000  // Convertir en radians
                    ]
                  }
                }
              };
              
              // Tester cette approche
              const geometryTest = await ProducerModel.find(geometryQuery).limit(1);
              console.log(`✅ Test avec geometry.location réussi`);
              
              queryConditions.push(geometryQuery);
              geoQueryApplied = true;
            } catch (geometryError) {
              console.error(`⚠️ Erreur avec geometry.location: ${geometryError.message}`);
            }
          }
        } else {
          console.log(`⚠️ Aucun index géospatial disponible, utilisation du fallback uniquement`);
        }
        
        // Si aucune des requêtes géospatiales n'a fonctionné, utiliser un fallback
        if (!geoQueryApplied) {
          console.log(`ℹ️ Utilisation du fallback non-géospatial (zone approximative)`);
          
          // Fallback sur une boîte géographique approximative
          // Utiliser une boîte plus petite pour une meilleure précision
          const boxSize = 0.05; // environ 5km à cette latitude
          queryConditions.push({
            $or: [
              {
                $and: [
                  { 'geometry.location.lat': { $gte: latitude - boxSize, $lte: latitude + boxSize } },
                  { 'geometry.location.lng': { $gte: longitude - boxSize, $lte: longitude + boxSize } }
                ]
              },
              {
                $and: [
                  { 'gps_coordinates.coordinates.1': { $gte: latitude - boxSize, $lte: latitude + boxSize } },
                  { 'gps_coordinates.coordinates.0': { $gte: longitude - boxSize, $lte: longitude + boxSize } }
                ]
              }
            ]
          });
        }
      }
    }
    
    // Filtres de base pour restaurants
    if (searchKeyword) {
      queryConditions.push({
        $or: [
          { name: { $regex: searchKeyword, $options: 'i' } },
          { description: { $regex: searchKeyword, $options: 'i' } }
        ]
      });
    }
    
    if (cuisine_type) {
      const cuisineTypes = Array.isArray(cuisine_type) 
        ? cuisine_type 
        : cuisine_type.includes(',') 
          ? cuisine_type.split(',').map(c => c.trim()) 
          : [cuisine_type];
      queryConditions.push({ cuisine_type: { $in: cuisineTypes } });
    }
    
    if (specialties) {
      const specialtiesList = Array.isArray(specialties) 
        ? specialties 
        : specialties.includes(',') 
          ? specialties.split(',').map(s => s.trim())
          : [specialties];
      queryConditions.push({ specialties: { $in: specialtiesList } });
    }
    
    if (business_status) {
      queryConditions.push({ business_status: business_status });
    }
    
    if (min_followers && !isNaN(parseInt(min_followers))) {
      queryConditions.push({ abonnés: { $gte: parseInt(min_followers) } });
    }
    
    if (promotion_active === 'true') {
      queryConditions.push({ 'promotion.active': true });
    }
    
    if (min_promotion && !isNaN(parseInt(min_promotion))) {
      queryConditions.push({ 'promotion.discountPercentage': { $gte: parseInt(min_promotion) } });
    }
    
    if (min_rating && !isNaN(parseFloat(min_rating))) {
      queryConditions.push({ rating: { $gte: parseFloat(min_rating) } });
    }
    
    if (max_price_level && !isNaN(parseInt(max_price_level))) {
      queryConditions.push({ price_level: { $lte: parseInt(max_price_level) } });
    }
    
    // Filtres de prix (pour compatiblité avec l'ancienne API)
    if (minPrice && !isNaN(parseFloat(minPrice))) {
      // Chercher dans les items avec un prix minimum
      const minPriceValue = parseFloat(minPrice);
      const minPriceConditions = [
        // Vérifier le prix au niveau des menus
        { 'structured_data.Menus Globaux.items.prix': { $gte: minPriceValue } },
        // Vérifier le prix au niveau des items indépendants
        { 'structured_data.Items Indépendants.prix': { $gte: minPriceValue } }
      ];
      
      queryConditions.push({ $or: minPriceConditions });
    }
    
    if (maxPrice && !isNaN(parseFloat(maxPrice))) {
      // Chercher dans les items avec un prix maximum
      const maxPriceValue = parseFloat(maxPrice);
      const maxPriceConditions = [
        // Vérifier le prix au niveau des menus
        { 'structured_data.Menus Globaux.items.prix': { $lte: maxPriceValue } },
        // Vérifier le prix au niveau des items indépendants
        { 'structured_data.Items Indépendants.prix': { $lte: maxPriceValue } }
      ];
      
      queryConditions.push({ $or: maxPriceConditions });
    }
    
    // Filtres pour items (plats/menus)
    const itemConditions = [];
    
    // Fonction pour créer des conditions de filtrage pour les items
    const createItemConditions = (path) => {
      const conditions = {};
      
      // Recherche par mots-clés dans les items (nom OU description)
      if (itemKeywords) {
        conditions[`$or`] = [
          { [`${path}.nom`]: { $regex: itemKeywords, $options: 'i' } },
          { [`${path}.description`]: { $regex: itemKeywords, $options: 'i' } }
        ];
      }
      
      // Filtres numériques pour les données nutritionnelles
      if (min_calories && !isNaN(parseFloat(min_calories))) {
        conditions[`${path}.nutrition.calories`] = { $gte: parseFloat(min_calories) };
      }
      
      if (max_calories && !isNaN(parseFloat(max_calories))) {
        conditions[`${path}.nutrition.calories`] = { 
          ...(conditions[`${path}.nutrition.calories`] || {}),
          $lte: parseFloat(max_calories)
        };
      }
      
      if (max_carbon_footprint && !isNaN(parseFloat(max_carbon_footprint))) {
        conditions[`${path}.carbon_footprint`] = { $lte: parseFloat(max_carbon_footprint) };
      }
      
      if (nutri_scores) {
        const scoresList = Array.isArray(nutri_scores) 
          ? nutri_scores 
          : nutri_scores.includes(',') 
            ? nutri_scores.split(',').map(s => s.trim())
            : [nutri_scores];
        conditions[`${path}.nutri_score`] = { $in: scoresList };
      }
      
      if (min_item_rating && !isNaN(parseFloat(min_item_rating))) {
        conditions[`${path}.note`] = { $gte: parseFloat(min_item_rating) };
      }
      
      if (max_item_price && !isNaN(parseFloat(max_item_price))) {
        conditions[`${path}.prix`] = { $lte: parseFloat(max_item_price) };
      }
      
      // Ne retourner les conditions que s'il y a au moins un filtre d'item
      return Object.keys(conditions).length > 0 ? conditions : null;
    };
    
    // Filtres pour les Menus Globaux et Items Indépendants
    const menuItemConditions = createItemConditions('structured_data.Menus Globaux.items');
    const independentItemConditions = createItemConditions('structured_data.Items Indépendants');
    
    // Ajouter les filtres d'items seulement s'ils existent
    if (menuItemConditions || independentItemConditions) {
      const itemOr = [];
      
      if (menuItemConditions) {
        itemOr.push(menuItemConditions);
      }
      
      if (independentItemConditions) {
        itemOr.push(independentItemConditions);
      }
      
      // S'il y a des filtres d'items, ajoutons-les à la requête principale avec $or
      if (itemOr.length > 0) {
        queryConditions.push({ $or: itemOr });
      }
    }
    
    // Construire la requête finale
    const finalQuery = queryConditions.length > 0 ? { $and: queryConditions } : {};
    
    console.log('🔍 Requête avancée avec paramètres:', req.query);
    
    // Exécuter la requête avec pagination
    const producers = await ProducerModel.find(finalQuery)
      .skip(skip)
      .limit(limit)
      .sort({ rating: -1 });
    
    const total = await ProducerModel.countDocuments(finalQuery);
    
    // Retourner les résultats
    res.status(200).json({
      success: true,
      results: producers,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNextPage: page < Math.ceil(total / limit),
        hasPrevPage: page > 1
      }
    });
  } catch (error) {
    console.error('❌ Erreur lors de la recherche avancée:', error);
    res.status(500).json({ 
      success: false,
      message: 'Erreur lors de la recherche avancée', 
      error: error.message 
    });
  }
});

// GET /api/producers - Obtenir tous les restaurants avec pagination
router.get('/', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    
    const producers = await ProducerModel.find()
      .skip(skip)
      .limit(limit);
    
    const total = await ProducerModel.countDocuments();
    
    res.status(200).json({
      producers,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total
    });
  } catch (error) {
    console.error('Erreur de récupération des restaurants:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des restaurants' });
  }
});

// GET /api/producers/search - Rechercher des restaurants
router.get('/search', async (req, res) => {
  try {
    const { query, category, price_level, rating } = req.query;
    const searchQuery = {};
    
    if (query) {
      searchQuery.$or = [
        { name: { $regex: query, $options: 'i' } },
        { description: { $regex: query, $options: 'i' } }
      ];
    }
    
    if (category) {
      searchQuery.category = { $in: Array.isArray(category) ? category : [category] };
    }
    
    if (price_level) {
      searchQuery.price_level = parseInt(price_level);
    }
    
    if (rating) {
      searchQuery.rating = { $gte: parseFloat(rating) };
    }
    
    const producers = await ProducerModel.find(searchQuery).limit(50);
    
    res.status(200).json(producers);
  } catch (error) {
    console.error('Erreur de recherche des restaurants:', error);
    res.status(500).json({ error: 'Erreur lors de la recherche des restaurants' });
  }
});

// GET /api/producers/featured - Obtenir les restaurants mis en avant
router.get('/featured', async (req, res) => {
  try {
    const featured = await ProducerModel.find({ featured: true }).limit(10);
    res.status(200).json(featured);
  } catch (error) {
    console.error('Erreur de récupération des restaurants en vedette:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des restaurants en vedette' });
  }
});

// GET /api/producers/by-place-id/:placeId - Obtenir un restaurant par place_id (Google Maps)
router.get('/by-place-id/:placeId', async (req, res) => {
  try {
    const producer = await ProducerModel.findOne({ place_id: req.params.placeId });
    
    if (!producer) {
      return res.status(404).json({ error: 'Restaurant non trouvé' });
    }
    
    res.status(200).json(producer);
  } catch (error) {
    console.error('Erreur de récupération du restaurant:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération du restaurant' });
  }
});

// GET /api/producers/category/:category - Obtenir les restaurants par catégorie
router.get('/category/:category', async (req, res) => {
  try {
    const producers = await ProducerModel.find({
      category: { $in: [req.params.category] }
    }).limit(50);
    
    res.status(200).json(producers);
  } catch (error) {
    console.error('Erreur de récupération des restaurants par catégorie:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des restaurants par catégorie' });
  }
});

// GET /api/producers/nearby - Obtenir les restaurants à proximité
router.get('/nearby', async (req, res) => {
  try {
    const { lat, lng, radius = 5000, limit = 20 } = req.query;
    
    if (!lat || !lng) {
      return res.status(400).json({ error: 'Les coordonnées GPS sont requises (lat, lng)' });
    }
    
    const producers = await ProducerModel.find({
      gps_coordinates: {
        $geoWithin: {
          $centerSphere: [
            [parseFloat(lng), parseFloat(lat)],
            parseInt(radius) / 6371000  // Convertir en radians (rayon de la Terre = 6371km)
          ]
        }
      }
    }).limit(parseInt(limit));
    
    res.status(200).json(producers);
  } catch (error) {
    console.error('Erreur de récupération des restaurants à proximité:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des restaurants à proximité' });
  }
});

/**
 * @route GET /api/producers/:producerId/events
 * @desc Get events for a specific producer
 * @access Public
 */
router.get('/:producerId/events', async (req, res) => {
  try {
    const { producerId } = req.params;

    // Find producer to validate it exists
    const producer = await ProducerModel.findById(producerId);
    
    if (!producer) {
      return res.status(404).json({ message: 'Producer not found' });
    }
    
    // Query events from the events collection
    // First try to get events where this producer is marked as producerId
    const EventModel = mongoose.model('Event');
    let events = await EventModel.find({ producerId: producerId })
      .sort({ startTime: 1 })
      .limit(50);
    
    // If no events found, also try to find by venueId
    if (!events || events.length === 0) {
      events = await EventModel.find({ venueId: producerId })
        .sort({ startTime: 1 })
        .limit(50);
    }
    
    // If the producer has embedded events in their data, include those too
    let combinedEvents = [...events];
    
    if (producer.events && Array.isArray(producer.events) && producer.events.length > 0) {
      // Add any events that aren't already included (check by ID)
      const existingIds = events.map(e => e._id.toString());
      
      for (const event of producer.events) {
        // Check if this embedded event is already included
        if (event._id && !existingIds.includes(event._id.toString())) {
          combinedEvents.push(event);
        } else if (!event._id) {
          // If no ID, just add it
          combinedEvents.push(event);
        }
      }
    }
    
    // Sort all events by date
    combinedEvents.sort((a, b) => {
      const dateA = new Date(a.startTime || a.date || 0);
      const dateB = new Date(b.startTime || b.date || 0);
      return dateA - dateB;
    });
    
    // Retourner toujours un tableau (même vide) pour éviter les erreurs de type
    res.status(200).json(combinedEvents);
  } catch (error) {
    console.error('Error fetching producer events:', error);
    // En cas d'erreur, retourner un tableau vide
    res.status(200).json([]);
  }
});

// GET /api/producers/:producerId/relations - Obtenir les relations d'un producteur
router.get('/:producerId/relations', producerController.getProducerRelations);

// POST /api/producers/user/:userId/favorites - Ajouter un producteur aux favoris
router.post('/user/:userId/favorites', producerController.addToFavorites);

// DELETE /api/producers/user/:userId/favorites - Retirer un producteur des favoris
router.delete('/user/:userId/favorites', producerController.removeFromFavorites);

// Endpoint : Recherche de producteurs par mots-clés
router.get('/search', async (req, res) => {
  try {
    const { query } = req.query;

    if (!query || query.trim() === '') {
      return res.status(400).json({ message: 'Veuillez fournir un mot-clé pour la recherche.' });
    }

    console.log('🔍 Recherche pour le mot-clé :', query);

    const producers = await ProducerModel.find({
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
  try {
    const { id } = req.params;
    const userId = req.user?.id; // Get userId if available from auth middleware
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: `ID invalide: ${id}` });
    }
    
    const producer = await ProducerModel.findById(id);
    
    if (!producer) {
      return res.status(404).json({ error: 'Restaurant non trouvé' });
    }

    // Log the 'view' interaction (fire and forget)
    // Assuming producerType is 'restaurant' for this route.
    // Note: auth middleware might be needed on this route to get req.user.id
    if (userId) { 
        logInteractionHelper(null, userId, id, 'restaurant', 'view');
    }
    
    res.status(200).json(producer);
  } catch (error) {
    console.error('Erreur de récupération du restaurant:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération du restaurant' });
  }
});

// POST /api/producers/:id/follow - Suivre un restaurant (nécessite authentification)
router.post('/:id/follow', auth, async (req, res) => {
  try {
    // Vérifier si l'ID est valide
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: 'ID de restaurant invalide' });
    }
    
    const producer = await ProducerModel.findById(req.params.id);
    
    if (!producer) {
      return res.status(404).json({ error: 'Restaurant non trouvé' });
    }
    
    // Si l'utilisateur suit déjà ce restaurant, le retirer de la liste
    const userIndex = producer.followers.indexOf(req.user.id);
    
    if (userIndex > -1) {
      producer.followers.splice(userIndex, 1);
      producer.abonnés = Math.max(0, producer.abonnés - 1);
      await producer.save();
      
      res.status(200).json({ message: 'Vous ne suivez plus ce restaurant', isFollowing: false });
    } else {
      // Sinon, ajouter l'utilisateur à la liste des abonnés
      producer.followers.push(req.user.id);
      producer.abonnés += 1;
      await producer.save();
      
      res.status(200).json({ message: 'Vous suivez désormais ce restaurant', isFollowing: true });
    }
  } catch (error) {
    console.error('Erreur lors du suivi du restaurant:', error);
    res.status(500).json({ error: 'Erreur lors de la mise à jour du suivi' });
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
      await ProducerModel.findByIdAndUpdate(
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

// Add initialize function to make it compatible with other route modules
router.initialize = function(db) {
  console.log('✅ producersRoutes.initialize called - providing compatibility');
  // Any initialization with the db connection could happen here
  return router;
};

// module.exports = router;
// Replace the simple export with this more flexible export:
module.exports = router;

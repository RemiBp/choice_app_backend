const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

// Connexions aux bonnes bases en utilisant les noms exacts
const restaurationDb = mongoose.createConnection(process.env.MONGO_URI, {
  dbName: 'Restauration_Officielle',
});
const loisirDb = mongoose.createConnection(process.env.MONGO_URI, {
  dbName: 'Loisir&Culture',
});
const beautyWellnessDb = mongoose.createConnection(process.env.MONGO_URI, {
  dbName: 'Beauty_Wellness',
});

// Modèles pour les collections en utilisant les noms exacts des collections
const Restaurant = restaurationDb.model(
  'Restaurant',
  new mongoose.Schema({}, { strict: false }),
  'producers'
);
const LeisureProducer = loisirDb.model(
  'LeisureProducer',
  new mongoose.Schema({}, { strict: false }),
  'Loisir_Paris_Producers'
);
const Event = loisirDb.model(
  'Event',
  new mongoose.Schema({}, { strict: false }),
  'Loisir_Paris_Evenements'
);
const BeautyPlace = beautyWellnessDb.model(
  'BeautyPlace', 
  new mongoose.Schema({}, { strict: false }),
  'BeautyPlaces'
);

// Helper function to normalize leisure producer data
const normalizeLeisureProducerData = (producer) => {
  if (!producer) return null;
  
  const normalizedData = { ...producer };
  
  // Ensure array fields are properly formatted
  const arrayFields = ['category', 'activities', 'specialties', 'photos', 'types', 'followers', 'evenements'];
  
  arrayFields.forEach(field => {
    // If the field exists
    if (normalizedData[field] !== undefined) {
      // If it's a string, convert to a single-element array
      if (typeof normalizedData[field] === 'string') {
        normalizedData[field] = [normalizedData[field]];
      } 
      // Ensure it's an array (not null or undefined)
      else if (!Array.isArray(normalizedData[field])) {
        normalizedData[field] = [];
      }
    } else {
      // If it doesn't exist, initialize an empty array
      normalizedData[field] = [];
    }
  });
  
  return normalizedData;
};

// Route pour la recherche unifiée
router.get('/search', async (req, res) => {
  const { query, type } = req.query;

  if (!query || query.trim() === '') {
    return res.status(400).json({ message: 'Veuillez fournir un mot-clé pour la recherche.' });
  }

  console.log(`🔍 Recherche pour le mot-clé : ${query}`);
  console.log(`🔍 Type spécifié: ${type || 'all'}`);

  try {
    // Créez les filtres pour chaque collection
    const filter = { $regex: query, $options: 'i' };

    console.log('📊 Début des requêtes aux collections...');

    let restaurantsPromise = Restaurant.find({
        $or: [
          { name: filter },
          { address: filter },
          { description: filter },
        ],
    }).limit(20);
    
    // Vérifier que la collection est accessible
    const restaurantCount = await Restaurant.countDocuments();
    console.log(`📊 Nombre total de restaurants dans la collection: ${restaurantCount}`);
    
    const [restaurants, leisureProducers, events, beautyPlaces] = await Promise.all([
      restaurantsPromise,
      LeisureProducer.find({
        $or: [
          { lieu: filter },
          { adresse: filter },
          { description: filter },
        ],
      }).limit(20),
      Event.find({
        $or: [
          { intitulé: filter },
          { catégorie: filter },
          { détail: filter },
        ],
      }).limit(20),
      BeautyPlace.find({
        $or: [
          { name: filter },
          { address: filter },
          { description: filter },
        ]
      }).limit(15),
    ]);
    
    console.log(`📊 Restaurants trouvés: ${restaurants.length}`);
    console.log(`📊 Lieux de loisir trouvés: ${leisureProducers.length}`);
    console.log(`📊 Événements trouvés: ${events.length}`);
    console.log(`📊 Lieux de beauté trouvés: ${beautyPlaces.length}`);
    
    if (restaurants.length > 0) {
      console.log(`📊 Premier restaurant trouvé: ${restaurants[0].name || 'Nom non défini'}`);
    }

    // Filtrer par type si spécifié
    let filteredResults = [];
    
    // Transformer les résultats
    const allResults = [
      ...restaurants.map((r) => {
        const obj = r.toObject();
        return { 
          type: 'restaurant', 
          id: obj._id.toString(),
          _id: obj._id.toString(),
          name: obj.name || obj.lieu || 'Restaurant',
          avatar: obj.photo || obj.image || `https://ui-avatars.com/api/?name=${encodeURIComponent(obj.name || 'R')}&background=random`,
          address: obj.address || obj.adresse,
          place_id: obj.place_id || ''
        };
      }),
      ...leisureProducers.map((l) => {
        const obj = l.toObject();
        // Normalize leisure producer data to handle array fields properly
        const normalizedObj = normalizeLeisureProducerData(obj);
        return { 
          type: 'leisureProducer', 
          id: obj._id.toString(),
          _id: obj._id.toString(),
          name: obj.lieu || obj.name || 'Loisir',
          avatar: obj.image || obj.photo || `https://ui-avatars.com/api/?name=${encodeURIComponent(obj.lieu || 'L')}&background=random`,
          address: obj.adresse || obj.address,
          place_id: obj.place_id || ''
        };
      }),
      ...events.map((e) => {
        const obj = e.toObject();
        return { 
          type: 'event', 
          id: obj._id.toString(),
          _id: obj._id.toString(),
          name: obj.intitulé || obj.name || 'Événement',
          avatar: obj.image || obj.photo || `https://ui-avatars.com/api/?name=${encodeURIComponent(obj.intitulé || 'E')}&background=random`,
          address: obj.lieu || obj.adresse || obj.address,
          place_id: obj.place_id || ''
        };
      }),
      ...beautyPlaces.map((b) => {
        const obj = b.toObject();
        return { 
          type: 'beautyPlace', 
          id: obj._id.toString(),
          _id: obj._id.toString(),
          name: obj.name || obj.lieu || 'Beauté',
          avatar: obj.photo || obj.image || `https://ui-avatars.com/api/?name=${encodeURIComponent(obj.name || 'B')}&background=random`,
          address: obj.address || obj.adresse,
          place_id: obj.place_id || ''
        };
      }),
    ];
    
    // Filtrer par type si demandé
    if (type && type !== 'all') {
      filteredResults = allResults.filter(item => item.type === type);
    } else {
      filteredResults = allResults;
    }

    if (filteredResults.length === 0) {
      console.log(`❌ Aucun résultat trouvé pour la recherche : ${query}`);
      
      if (filteredResults.length === 0) {
        return res.status(404).json({ message: 'Aucun résultat trouvé.' });
      }
    }

    console.log(`✅ Résultats trouvés : ${filteredResults.length} résultats`);
    
    // Retourner directement le tableau de résultats pour être compatible avec le client Flutter
    res.status(200).json(filteredResults);
  } catch (err) {
    console.error('❌ Erreur dans /api/unified/search :', err.message);
    res.status(500).json({ 
      success: false,
      message: 'Erreur interne du serveur.', 
      error: err.message 
    });
  }
});

/**
 * @route GET /api/unified/search-public
 * @description Recherche publique pour les producteurs, événements, etc.
 * @access Public
 */
router.get('/search-public', async (req, res) => {
  const { query, type } = req.query;

  if (!query || query.trim() === '') {
    return res.status(400).json({ message: 'Veuillez fournir un mot-clé pour la recherche.' });
  }

  console.log(`🔍 Recherche publique pour le mot-clé : ${query}`);
  console.log(`🔍 Type spécifié: ${type || 'all'}`);

  try {
    // Créez les filtres pour chaque collection
    const filter = { $regex: query, $options: 'i' };

    console.log('📊 Début des requêtes aux collections...');

    let restaurantsPromise = Restaurant.find({
        $or: [
          { name: filter },
          { address: filter },
          { description: filter },
        ],
    }).limit(20);
    
    const [restaurants, leisureProducers, events, beautyPlaces] = await Promise.all([
      restaurantsPromise,
      LeisureProducer.find({
        $or: [
          { lieu: filter },
          { adresse: filter },
          { description: filter },
        ],
      }).limit(20),
      Event.find({
        $or: [
          { intitulé: filter },
          { catégorie: filter },
          { détail: filter },
        ],
      }).limit(20),
      BeautyPlace.find({
        $or: [
          { name: filter },
          { address: filter },
          { description: filter },
        ]
      }).limit(15),
    ]);
    
    console.log(`📊 Recherche publique - Résultats trouvés: Restaurants: ${restaurants.length}, Loisirs: ${leisureProducers.length}, Événements: ${events.length}, Beauté: ${beautyPlaces.length}`);
    
    // Transformer les résultats
    const allResults = [
      ...restaurants.map((r) => {
        const obj = r.toObject();
        return { 
          type: 'restaurant', 
          id: obj._id.toString(),
          _id: obj._id.toString(),
          name: obj.name || obj.lieu || 'Restaurant',
          avatar: obj.photo || obj.image || `https://ui-avatars.com/api/?name=${encodeURIComponent(obj.name || 'R')}&background=random`,
          address: obj.address || obj.adresse,
          place_id: obj.place_id || ''
        };
      }),
      ...leisureProducers.map((l) => {
        const obj = l.toObject();
        // Normalize leisure producer data to handle array fields properly
        const normalizedObj = normalizeLeisureProducerData(obj);
        return { 
          type: 'leisureProducer', 
          id: obj._id.toString(),
          _id: obj._id.toString(),
          name: obj.lieu || obj.name || 'Loisir',
          avatar: obj.image || obj.photo || `https://ui-avatars.com/api/?name=${encodeURIComponent(obj.lieu || 'L')}&background=random`,
          address: obj.adresse || obj.address,
          place_id: obj.place_id || ''
        };
      }),
      ...events.map((e) => {
        const obj = e.toObject();
        return { 
          type: 'event', 
          id: obj._id.toString(),
          _id: obj._id.toString(),
          name: obj.intitulé || obj.name || 'Événement',
          avatar: obj.image || obj.photo || `https://ui-avatars.com/api/?name=${encodeURIComponent(obj.intitulé || 'E')}&background=random`,
          address: obj.lieu || obj.adresse || obj.address,
          place_id: obj.place_id || ''
        };
      }),
      ...beautyPlaces.map((b) => {
        const obj = b.toObject();
        return { 
          type: 'beautyPlace', 
          id: obj._id.toString(),
          _id: obj._id.toString(),
          name: obj.name || obj.lieu || 'Beauté',
          avatar: obj.photo || obj.image || `https://ui-avatars.com/api/?name=${encodeURIComponent(obj.name || 'B')}&background=random`,
          address: obj.address || obj.adresse,
          place_id: obj.place_id || ''
        };
      }),
    ];
    
    // Filtrer par type si demandé
    let filteredResults = [];
    if (type && type !== 'all') {
      filteredResults = allResults.filter(item => item.type === type);
    } else {
      filteredResults = allResults;
    }

    if (filteredResults.length === 0) {
      console.log(`❌ Aucun résultat trouvé pour la recherche publique : ${query}`);
      return res.status(404).json({ message: 'Aucun résultat trouvé.' });
    }

    console.log(`✅ Recherche publique - Résultats envoyés : ${filteredResults.length} résultats`);
    
    // Retourner directement le tableau de résultats pour être compatible avec le client Flutter
    res.status(200).json(filteredResults);
  } catch (err) {
    console.error('❌ Erreur dans /api/unified/search-public :', err.message);
    res.status(500).json({ 
      success: false,
      message: 'Erreur interne du serveur.', 
      error: err.message 
    });
  }
});

// ======= ENDPOINTS POUR LE DASHBOARD IA =======

/**
 * @route GET /api/unified/nearby-public
 * @description Trouve les établissements à proximité d'une position donnée
 * @access Public
 */
router.get('/nearby-public', async (req, res) => {
  try {
    const { lat, lng, radius = 5000 } = req.query;
    
    if (!lat || !lng) {
      return res.status(400).json({ message: 'Latitude et longitude requises.' });
    }
    
    console.log(`🔍 Recherche des lieux à proximité de (${lat}, ${lng}) dans un rayon de ${radius}m`);
    
    // Convertir les coordonnées en nombres
    const latitude = parseFloat(lat);
    const longitude = parseFloat(lng);
    const radiusInMeters = parseInt(radius);
    
    // Vérifier si on a des index géospatiaux pour utiliser $near
    let results = [];
    
    try {
      // Essayer d'utiliser une requête géospatiale si l'index existe
      const restaurants = await Restaurant.find({
        'location': {
          $near: {
            $geometry: { type: 'Point', coordinates: [longitude, latitude] },
            $maxDistance: radiusInMeters
          }
        }
      }).limit(15);
      
      const leisureProducers = await LeisureProducer.find({
        'localisation': {
          $near: {
            $geometry: { type: 'Point', coordinates: [longitude, latitude] },
            $maxDistance: radiusInMeters
          }
        }
      }).limit(10);
      
      const beautyPlaces = await BeautyPlace.find({
        'location': {
          $near: {
            $geometry: { type: 'Point', coordinates: [longitude, latitude] },
            $maxDistance: radiusInMeters
          }
        }
      }).limit(10);
      
      // Combiner les résultats
      results = [
        ...restaurants.map(r => ({ type: 'restaurant', ...r.toObject() })),
        ...leisureProducers.map(l => ({ type: 'leisureProducer', ...l.toObject() })),
        ...beautyPlaces.map(b => ({ type: 'beautyPlace', ...b.toObject() }))
      ];
    } catch (geoError) {
      console.error('⚠️ Erreur avec la requête géospatiale, utilisation d\'une requête simple:', geoError.message);
      
      // Fallback: en cas d'erreur avec la recherche géospatiale 
      // (index manquant ou autre), utiliser une simple requête
      const [restaurants, leisureProducers, beautyPlaces] = await Promise.all([
        Restaurant.find({}).limit(15).sort({ _id: -1 }),
        LeisureProducer.find({}).limit(10).sort({ _id: -1 }),
        BeautyPlace.find({}).limit(10).sort({ _id: -1 })
      ]);
      
      results = [
        ...restaurants.map(r => ({ type: 'restaurant', ...r.toObject() })),
        ...leisureProducers.map(l => ({ type: 'leisureProducer', ...l.toObject() })),
        ...beautyPlaces.map(b => ({ type: 'beautyPlace', ...b.toObject() }))
      ];
    }
    
    console.log(`✅ ${results.length} lieux trouvés à proximité`);
    res.status(200).json(results);
  } catch (err) {
    console.error('❌ Erreur nearby-public:', err.message);
    res.status(500).json({ message: 'Erreur serveur.', error: err.message });
  }
});

/**
 * @route GET /api/unified/surprise-public
 * @description Retourne des établissements surprises/originaux
 * @access Public
 */
router.get('/surprise-public', async (req, res) => {
  try {
    console.log('🔍 Recherche de lieux surprises');
    
    // Utiliser $sample pour sélectionner des documents aléatoires
    const [restaurants, leisureProducers, events, beautyPlaces] = await Promise.all([
      Restaurant.aggregate([{ $sample: { size: 4 } }]), // Sélection aléatoire
      LeisureProducer.aggregate([{ $sample: { size: 4 } }]),
      Event.aggregate([{ $sample: { size: 4 } }]),
      BeautyPlace.aggregate([{ $sample: { size: 4 } }])
    ]);
    
    // Combiner et formater les résultats
    const results = [
      ...restaurants.map(r => ({ type: 'restaurant', ...r })),
      ...leisureProducers.map(l => ({ type: 'leisureProducer', ...l })),
      ...events.map(e => ({ type: 'event', ...e })),
      ...beautyPlaces.map(b => ({ type: 'beautyPlace', ...b }))
    ];
    
    console.log(`✅ ${results.length} lieux surprises trouvés`);
    res.status(200).json(results);
  } catch (err) {
    console.error('❌ Erreur surprise-public:', err.message);
    res.status(500).json({ message: 'Erreur serveur.', error: err.message });
  }
});

/**
 * @route GET /api/unified/trending-public
 * @description Retourne les établissements tendances
 * @access Public
 */
router.get('/trending-public', async (req, res) => {
  try {
    const { limit = 6, page = 1 } = req.query;
    const limitNum = parseInt(limit);
    const skip = (parseInt(page) - 1) * limitNum;
    
    console.log(`🔍 Recherche des lieux tendances (page ${page}, limit ${limit})`);
    
    // Calculer une répartition équilibrée des résultats
    const restaurantLimit = Math.ceil(limitNum * 0.3); // 30% restaurants
    const leisureLimit = Math.ceil(limitNum * 0.25);   // 25% loisirs
    const eventLimit = Math.ceil(limitNum * 0.25);     // 25% événements
    const beautyLimit = Math.floor(limitNum * 0.2);    // 20% beauté/bien-être
    
    // Pour le critère "tendance", on peut utiliser:
    // - Note (rating) élevée
    // - Nombre de vues/interactions récentes (si disponible)
    // - Nouveautés (basées sur la date d'ajout)
    
    const [restaurants, leisureProducers, events, beautyPlaces] = await Promise.all([
      Restaurant.find({})
        .sort({ rating: -1 }) // Tri par note décroissante
        .skip(skip)
        .limit(restaurantLimit),
        
      LeisureProducer.find({})
        .sort({ note: -1 }) // Champ similaire à rating pour les loisirs
        .skip(skip)
        .limit(leisureLimit),
        
      Event.find({})
        .sort({ date: 1 }) // Trier par date à venir (événements proches)
        .skip(skip)
        .limit(eventLimit),
        
      BeautyPlace.find({})
        .sort({ rating: -1 })
        .skip(skip)
        .limit(beautyLimit)
    ]);
    
    // Combiner et formater les résultats
    const results = [
      ...restaurants.map(r => ({ type: 'restaurant', ...r.toObject() })),
      ...leisureProducers.map(l => ({ type: 'leisureProducer', ...l.toObject() })),
      ...events.map(e => ({ type: 'event', ...e.toObject() })),
      ...beautyPlaces.map(b => ({ type: 'beautyPlace', ...b.toObject() }))
    ];
    
    console.log(`✅ ${results.length} lieux tendances trouvés`);
    res.status(200).json(results);
  } catch (err) {
    console.error('❌ Erreur trending-public:', err.message);
    res.status(500).json({ message: 'Erreur serveur.', error: err.message });
  }
});

/**
 * @route GET /api/unified/innovative-public
 * @description Retourne les établissements innovants ou originaux
 * @access Public
 */
router.get('/innovative-public', async (req, res) => {
  try {
    console.log('🔍 Recherche des expériences innovantes');
    
    // Pour des expériences "innovantes", on cherche:
    // - Des lieux avec des mots-clés spécifiques dans leur description
    // - Des événements uniques/thématiques
    // - Des restaurants avec des concepts spéciaux
    
    // Rechercher des mots-clés liés à l'innovation dans les descriptions
    const innovativeKeywords = { $regex: 'innov|unique|original|concept|expérience|insolite', $options: 'i' };
    
    const [restaurants, leisureProducers, events, beautyPlaces] = await Promise.all([
      // Restaurants innovants
      Restaurant.find({
        $or: [
          { description: innovativeKeywords },
          { category: { $in: ['fusion', 'créative', 'concept'] } }
        ]
      }).limit(6),
      
      // Lieux de loisirs innovants
      LeisureProducer.find({
        $or: [
          { description: innovativeKeywords },
          { catégorie: { $in: ['insolite', 'virtuel', 'concept'] } }
        ]
      }).limit(6),
      
      // Événements innovants
      Event.find({
        $or: [
          { détail: innovativeKeywords },
          { catégorie: { $in: ['nouveau', 'inédit', 'première'] } }
        ]
      }).limit(4),
      
      // Lieux de beauté innovants
      BeautyPlace.find({
        $or: [
          { description: innovativeKeywords },
          { specialties: { $regex: 'innovant|unique', $options: 'i' } }
        ]
      }).limit(4)
    ]);
    
    // Fallback: Si on n'a pas trouvé assez de résultats, compléter avec des sélections aléatoires
    let finalResults = [
      ...restaurants.map(r => ({ type: 'restaurant', ...r.toObject() })),
      ...leisureProducers.map(l => ({ type: 'leisureProducer', ...l.toObject() })),
      ...events.map(e => ({ type: 'event', ...e.toObject() })),
      ...beautyPlaces.map(b => ({ type: 'beautyPlace', ...b.toObject() }))
    ];
    
    // S'il y a moins de 10 résultats, compléter avec des choix aléatoires
    if (finalResults.length < 10) {
      const additionalCount = 10 - finalResults.length;
      const additionalRestaurants = await Restaurant.aggregate([{ $sample: { size: additionalCount } }]);
      finalResults = [...finalResults, ...additionalRestaurants.map(r => ({ type: 'restaurant', ...r }))];
    }
    
    console.log(`✅ ${finalResults.length} expériences innovantes trouvées`);
    res.status(200).json(finalResults);
  } catch (err) {
    console.error('❌ Erreur innovative-public:', err.message);
    res.status(500).json({ message: 'Erreur serveur.', error: err.message });
  }
});

// Route pour récupérer les détails uniquement via l'ID
router.get('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    // Gérer spécifiquement les cas de fausses routes
    if (id === 'search-public' || id === 'search') {
      console.log(`❌ Erreur: '/${id}' ne devrait pas être accédé directement. Utilisez plutôt '/api/unified/${id}?query=...'`);
      return res.status(400).json({ 
        message: `Erreur d'accès à l'API. Pour utiliser '/${id}', veuillez fournir un paramètre de requête.`,
        example: `/api/unified/${id}?query=votre_recherche`
      });
    }

    if (!mongoose.isValidObjectId(id)) {
      console.log(`❌ ID invalide : ${id}`);
      return res.status(400).json({ 
        message: 'ID invalide. Assurez-vous d\'utiliser un ID MongoDB valide.',
        details: `'${id}' n'est pas un ObjectId valide.` 
      });
    }

    console.log(`🔍 Recherche du document avec ID : ${id}`);
    console.log(`🔍 Vérification des connexions aux bases de données...`);
    
    // Vérifier que les connexions sont établies
    const restoCount = await Restaurant.countDocuments();
    const leisureCount = await LeisureProducer.countDocuments();
    const eventCount = await Event.countDocuments();
    const beautyCount = await BeautyPlace.countDocuments();
    
    console.log(`📊 Statistiques de la base de données:`);
    console.log(`📊 Nombre de restaurants: ${restoCount}`);
    console.log(`📊 Nombre de producteurs de loisir: ${leisureCount}`);
    console.log(`📊 Nombre d'événements: ${eventCount}`);
    console.log(`📊 Nombre de lieux de beauté: ${beautyCount}`);

    const [restaurant, leisureProducer, event, beautyPlace] = await Promise.all([
      Restaurant.findById(id).catch(err => {
        console.log(`❌ Erreur lors de la recherche dans Restaurant: ${err.message}`);
        return null;
      }),
      LeisureProducer.findById(id).catch(err => {
        console.log(`❌ Erreur lors de la recherche dans LeisureProducer: ${err.message}`);
        return null;
      }),
      Event.findById(id).catch(err => {
        console.log(`❌ Erreur lors de la recherche dans Event: ${err.message}`);
        return null;
      }),
      BeautyPlace.findById(id).catch(err => {
        console.log(`❌ Erreur lors de la recherche dans BeautyPlace: ${err.message}`);
        return null;
      }),
    ]);

    if (restaurant) {
      console.log(`✅ Trouvé dans Restaurants : ${id}`);
      const result = restaurant.toObject();
      return res.status(200).json({ 
        type: 'restaurant', 
        ...result,
        _id: result._id.toString(),
        id: result._id.toString()
      });
    }

    if (leisureProducer) {
      console.log(`✅ Trouvé dans Leisure Producers : ${id}`);
      const result = leisureProducer.toObject();
      // Normalize leisure producer data to handle array fields properly
      const normalizedResult = normalizeLeisureProducerData(result);
      return res.status(200).json({ 
        type: 'leisureProducer', 
        ...normalizedResult,
        _id: result._id.toString(),
        id: result._id.toString()
      });
    }

    if (event) {
      console.log(`✅ Trouvé dans Events : ${id}`);
      const result = event.toObject();
      return res.status(200).json({ 
        type: 'event', 
        ...result,
        _id: result._id.toString(),
        id: result._id.toString()
      });
    }

    if (beautyPlace) {
      console.log(`✅ Trouvé dans Beauty Places : ${id}`);
      const result = beautyPlace.toObject();
      return res.status(200).json({ 
        type: 'beautyPlace', 
        ...result,
        _id: result._id.toString(),
        id: result._id.toString()
      });
    }

    console.log(`❌ Aucun résultat trouvé pour l'ID : ${id}`);
    res.status(404).json({ message: 'Aucun détail trouvé pour cet ID.' });
  } catch (err) {
    console.error(`❌ Erreur lors de la récupération des détails :`, err.message);
    res.status(500).json({ message: 'Erreur interne du serveur.', error: err.message });
  }
});

/**
 * @route GET /api/unified/batch
 * @description Récupérer les détails de plusieurs entités par leurs IDs.
 * @access Public
 * @queryparam ids - Liste d'IDs séparés par des virgules (ex: id1,id2,id3)
 */
router.get('/batch', async (req, res) => {
  const { ids } = req.query;

  if (!ids) {
    return res.status(400).json({ message: 'Le paramètre "ids" est requis.' });
  }

  const idList = ids.split(',').map(id => id.trim()).filter(id => id);

  if (idList.length === 0) {
    return res.status(400).json({ message: 'Aucun ID valide fourni dans le paramètre "ids".' });
  }

  console.log(`🔄 Batch fetch request for ${idList.length} IDs: [${idList.join(', ')}]`);

  // Convertir en ObjectIds valides
  const objectIds = [];
  const invalidIds = [];
  idList.forEach(id => {
    if (mongoose.isValidObjectId(id)) {
      objectIds.push(new mongoose.Types.ObjectId(id));
    } else {
      invalidIds.push(id);
    }
  });

  if (invalidIds.length > 0) {
      console.warn(`⚠️ Invalid ObjectIds provided in batch request: [${invalidIds.join(', ')}]`);
      // Optionnel: retourner une erreur ou juste ignorer les IDs invalides
      // return res.status(400).json({ message: `IDs invalides fournis: ${invalidIds.join(', ')}` });
  }

  if (objectIds.length === 0) {
      return res.status(400).json({ message: 'Aucun ObjectId valide fourni.' });
  }

  try {
    console.log('📊 Querying collections for batch IDs...');

    const [restaurants, leisureProducers, events, beautyPlaces] = await Promise.all([
      Restaurant.find({ _id: { $in: objectIds } }).lean(),
      LeisureProducer.find({ _id: { $in: objectIds } }).lean(),
      Event.find({ _id: { $in: objectIds } }).lean(),
      BeautyPlace.find({ _id: { $in: objectIds } }).lean(),
    ]);

    console.log(`📊 Found: ${restaurants.length} restaurants, ${leisureProducers.length} leisure, ${events.length} events, ${beautyPlaces.length} beauty.`);

    const resultsMap = {};

    // Helper function to add result to map
    const addToMap = (item, type) => {
        if (!item || !item._id) return;
        const idStr = item._id.toString();
        // Simple normalization example (adapt as needed)
        resultsMap[idStr] = {
            ...item,
            _id: idStr, // Ensure _id is string
            _fetched_as: type, // Add type for frontend clarity
            // Add other common fields like name, photo if possible
            name: item.name || item.lieu || item.intitulé || 'Nom inconnu',
            photos: item.photos || (item.image ? [item.image] : []) || (item.photo ? [item.photo] : []) || [],
            address: item.address || item.adresse || item.lieu || ''
        };
    };

    restaurants.forEach(item => addToMap(item, 'restaurant'));
    leisureProducers.forEach(item => addToMap(normalizeLeisureProducerData(item), 'leisureProducer')); // Use existing normalizer
    events.forEach(item => addToMap(item, 'event'));
    beautyPlaces.forEach(item => addToMap(item, 'beautyPlace'));

    console.log(`✅ Batch fetch completed. Returning ${Object.keys(resultsMap).length} results.`);
    res.status(200).json(resultsMap);

  } catch (err) {
    console.error('❌ Erreur dans /api/unified/batch :', err.message);
    res.status(500).json({
      success: false,
      message: 'Erreur interne du serveur lors du batch fetch.',
      error: err.message
    });
  }
});

module.exports = router;

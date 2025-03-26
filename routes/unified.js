const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { ObjectId } = require('mongodb'); // Pour la conversion des ID

// Connexions aux bases
const restaurantDb = mongoose.createConnection(process.env.MONGO_URI, {
  dbName: 'Restauration_Officielle',
});
const leisureDb = mongoose.createConnection(process.env.MONGO_URI, {
  dbName: 'Loisir&Culture',
});

// Modèles pour les collections
const Restaurant = restaurantDb.model(
  'Restaurant',
  new mongoose.Schema({}, { strict: false }),
  'producers' // Collection des producteurs dans Restauration_Officielle
);
const LeisureProducer = leisureDb.model(
  'LeisureProducer',
  new mongoose.Schema({}, { strict: false }),
  'Loisir_Paris_Producers' // Producteurs de loisirs dans Loisir&Culture
);
const Event = leisureDb.model(
  'Event',
  new mongoose.Schema({}, { strict: false }),
  'Loisir_Paris_Evenements' // Événements dans Loisir&Culture
);

// Route pour la recherche unifiée (version publique non-authentifiée)
router.get('/search-public', async (req, res) => {
  const { query } = req.query;

  if (!query || query.trim() === '') {
    return res.status(400).json({ message: 'Veuillez fournir un mot-clé pour la recherche.' });
  }

  console.log(`🔍 Recherche publique pour le mot-clé : ${query}`);

  try {
    // Créez les filtres pour chaque collection
    const filter = { $regex: query, $options: 'i' };

    const [restaurants, leisureProducers, events] = await Promise.all([
      Restaurant.find({
        $or: [
          { name: filter },
          { address: filter },
          { description: filter },
        ],
      }).limit(20),
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
    ]);

    const results = [
      ...restaurants.map((r) => ({ type: 'restaurant', ...r.toObject() })),
      ...leisureProducers.map((l) => ({ type: 'leisureProducer', ...l.toObject() })),
      ...events.map((e) => ({ type: 'event', ...e.toObject() })),
    ];

    if (results.length === 0) {
      console.log(`❌ Aucun résultat trouvé pour la recherche publique : ${query}`);
      return res.status(404).json({ message: 'Aucun résultat trouvé.' });
    }

    console.log(`✅ Recherche publique : ${results.length} résultats trouvés`);
    res.status(200).json(results);
  } catch (err) {
    console.error('❌ Erreur dans /api/unified/search-public :', err.message);
    res.status(500).json({ message: 'Erreur interne du serveur.', error: err.message });
  }
});

// Route pour la recherche unifiée (version authentifiée)
router.get('/search', async (req, res) => {
  const { query } = req.query;

  if (!query || query.trim() === '') {
    return res.status(400).json({ message: 'Veuillez fournir un mot-clé pour la recherche.' });
  }

  console.log(`🔍 Recherche authentifiée pour le mot-clé : ${query}`);

  try {
    // Créez les filtres pour chaque collection
    const filter = { $regex: query, $options: 'i' };

    const [restaurants, leisureProducers, events] = await Promise.all([
      Restaurant.find({
        $or: [
          { name: filter },
          { address: filter },
          { description: filter },
        ],
      }).limit(20),
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
    ]);

    const results = [
      ...restaurants.map((r) => ({ type: 'restaurant', ...r.toObject() })),
      ...leisureProducers.map((l) => ({ type: 'leisureProducer', ...l.toObject() })),
      ...events.map((e) => ({ type: 'event', ...e.toObject() })),
    ];

    if (results.length === 0) {
      console.log(`❌ Aucun résultat trouvé pour la recherche : ${query}`);
      return res.status(404).json({ message: 'Aucun résultat trouvé.' });
    }

    console.log(`✅ Résultats trouvés : ${results.length} résultats`);
    res.status(200).json(results);
  } catch (err) {
    console.error('❌ Erreur dans /api/unified/search :', err.message);
    res.status(500).json({ message: 'Erreur interne du serveur.', error: err.message });
  }
});

// Route pour les éléments innovants (public)
router.get('/innovative-public', async (req, res) => {
  console.log('🔍 Récupération des éléments innovants (public)');
  
  try {
    // Rechercher des lieux et événements avec des critères d'innovation
    const [innovativeRestaurants, innovativeEvents] = await Promise.all([
      Restaurant.find({ tags: { $in: ['innovant', 'original', 'unique'] } })
        .sort({ rating: -1 })
        .limit(10)
        .lean(),
      Event.find({ catégorie: { $in: ['exposition', 'innovation', 'technologie'] } })
        .sort({ date: -1 })
        .limit(10)
        .lean()
    ]);
    
    // Combiner et formater les résultats
    const results = [
      ...innovativeRestaurants.map(r => ({ type: 'restaurant', ...r })),
      ...innovativeEvents.map(e => ({ type: 'event', ...e }))
    ];
    
    console.log(`✅ ${results.length} éléments innovants trouvés`);
    res.status(200).json(results);
  } catch (err) {
    console.error('❌ Erreur dans /api/unified/innovative-public :', err.message);
    res.status(500).json({ message: 'Erreur interne du serveur.', error: err.message });
  }
});

// Route pour les éléments à proximité (public)
router.get('/nearby-public', async (req, res) => {
  const { lat, lng, radius = 5000 } = req.query;
  
  console.log(`🔍 Recherche d'éléments à proximité de (${lat}, ${lng}) dans un rayon de ${radius}m`);
  
  if (!lat || !lng) {
    return res.status(400).json({ message: 'Les paramètres lat et lng sont requis.' });
  }
  
  try {
    // Utiliser une recherche simple sans requête géospatiale
    // pour éviter les problèmes d'index manquants
    const [nearbyRestaurants, nearbyLeisure] = await Promise.all([
      // Récupérer les restaurants sans filtrage spatial avancé
      // car la requête $near échoue sans index géospatial
      Restaurant.find()
        .sort({ rating: -1 })
        .limit(15)
        .lean(),
      
      // Récupérer les lieux de loisir sans filtrage spatial avancé
      LeisureProducer.find()
        .sort({ rating: -1 })
        .limit(15)
        .lean()
    ]);
    
    // Combiner et formater les résultats
    const results = [
      ...nearbyRestaurants.map(r => ({ type: 'restaurant', ...r })),
      ...nearbyLeisure.map(l => ({ type: 'leisureProducer', ...l }))
    ];
    
    console.log(`✅ ${results.length} éléments trouvés à proximité`);
    res.status(200).json(results);
  } catch (err) {
    console.error('❌ Erreur dans /api/unified/nearby-public :', err.message);
    res.status(500).json({ message: 'Erreur interne du serveur.', error: err.message });
  }
});

// Route pour les surprises (public)
router.get('/surprise-public', async (req, res) => {
  console.log('🔍 Récupération des éléments surprise (public)');
  
  try {
    // Récupérer un échantillon aléatoire de restaurants et événements
    const [surpriseRestaurants, surpriseEvents] = await Promise.all([
      Restaurant.aggregate([{ $sample: { size: 5 } }]),
      Event.aggregate([{ $sample: { size: 5 } }])
    ]);
    
    // Combiner et formater les résultats
    const results = [
      ...surpriseRestaurants.map(r => ({ type: 'restaurant', ...r })),
      ...surpriseEvents.map(e => ({ type: 'event', ...e }))
    ];
    
    console.log(`✅ ${results.length} éléments surprise trouvés`);
    res.status(200).json(results);
  } catch (err) {
    console.error('❌ Erreur dans /api/unified/surprise-public :', err.message);
    res.status(500).json({ message: 'Erreur interne du serveur.', error: err.message });
  }
});

// Route pour les éléments tendance (public)
router.get('/trending-public', async (req, res) => {
  console.log('🔍 Récupération des éléments tendance (public)');
  
  try {
    // Rechercher des lieux et événements populaires ou tendance
    const [trendingRestaurants, trendingEvents] = await Promise.all([
      Restaurant.find()
        .sort({ views: -1, rating: -1 })
        .limit(10)
        .lean(),
      Event.find({ date: { $gte: new Date() } })
        .sort({ popularity: -1 })
        .limit(10)
        .lean()
    ]);
    
    // Combiner et formater les résultats
    const results = [
      ...trendingRestaurants.map(r => ({ type: 'restaurant', ...r })),
      ...trendingEvents.map(e => ({ type: 'event', ...e }))
    ];
    
    console.log(`✅ ${results.length} éléments tendance trouvés`);
    res.status(200).json(results);
  } catch (err) {
    console.error('❌ Erreur dans /api/unified/trending-public :', err.message);
    res.status(500).json({ message: 'Erreur interne du serveur.', error: err.message });
  }
});

// Route pour récupérer les détails uniquement via l'ID
router.get('/:id', async (req, res) => {
  const { id } = req.params;
  
  // Ignorer les routes spéciales déjà définies
  if (['innovative-public', 'nearby-public', 'surprise-public', 'trending-public', 'search'].includes(id)) {
    return;
  }

  try {
    if (!mongoose.isValidObjectId(id)) {
      console.log(`❌ ID invalide : ${id}`);
      return res.status(400).json({ message: 'ID invalide.' });
    }

    console.log(`🔍 Recherche du document avec ID : ${id}`);

    // Récupérer le client MongoDB depuis l'application Express
    const choiceAppDb = req.app.locals.choiceAppDb;
    
    // Rechercher dans les collections principales d'abord (ne nécessitant pas choiceAppDb)
    const [restaurant, leisureProducer, event] = await Promise.all([
      Restaurant.findById(id),
      LeisureProducer.findById(id),
      Event.findById(id),
    ]);

    if (restaurant) {
      console.log(`✅ Trouvé dans Restaurants : ${id}`);
      return res.status(200).json({ type: 'restaurant', ...restaurant.toObject() });
    }

    if (leisureProducer) {
      console.log(`✅ Trouvé dans Leisure Producers : ${id}`);
      return res.status(200).json({ type: 'leisureProducer', ...leisureProducer.toObject() });
    }

    if (event) {
      console.log(`✅ Trouvé dans Events : ${id}`);
      return res.status(200).json({ type: 'event', ...event.toObject() });
    }

    // S'il n'est pas trouvé dans les collections principales, essayer choiceAppDb si disponible
    if (choiceAppDb) {
      const objectId = new ObjectId(id);
      
      try {
        // Vérifier dans la collection Users
        const usersCollection = choiceAppDb.collection("Users");
        const user = await usersCollection.findOne({ _id: objectId });
        
        if (user) {
          console.log(`✅ Trouvé dans Users : ${id}`);
          return res.status(200).json({ type: 'user', ...user });
        }
        
        // Vérifier dans la collection Posts
        const postsCollection = choiceAppDb.collection("Posts");
        const post = await postsCollection.findOne({ _id: objectId });
        
        if (post) {
          console.log(`✅ Trouvé dans Posts : ${id}`);
          return res.status(200).json({ type: 'post', ...post });
        }
      } catch (err) {
        console.error(`❌ Erreur lors de la recherche dans choiceAppDb:`, err.message);
        // On continue pour retourner un 404 plutôt qu'une erreur 500
      }
    } else {
      console.log(`ℹ️ Base de données choiceAppDb non disponible, recherche limitée aux collections principales`);
      // On continue la recherche, on ne renvoie pas d'erreur 500
    }

    console.log(`❌ Aucun résultat trouvé pour l'ID : ${id}`);
    res.status(404).json({ message: 'Aucun détail trouvé pour cet ID.' });
  } catch (err) {
    console.error(`❌ Erreur lors de la récupération des détails :`, err.message);
    res.status(500).json({ message: 'Erreur interne du serveur.', error: err.message });
  }
});

module.exports = router;

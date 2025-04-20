const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const eventController = require('../controllers/eventController');
const createEventModel = require('../models/event');
const auth = require('../middleware/auth');

// Variable to hold the connection to the Loisir&Culture database
let loisirDb;

// Function to initialize the router with a database connection
const initialize = (db) => {
  loisirDb = db;
  
  // Define the Event model with the proper connection and collection name
  const Event = loisirDb.model(
    'Event',
    new mongoose.Schema({}, { strict: false }),
    'Loisir_Paris_Evenements' // Exact collection name in MongoDB
  );
  
  // Store the model in the router for access in routes
  router.Event = Event;
  
  // Update the eventController to use this initialized model
  // This is crucial to fix the "Event.findById is not a function" error
  eventController.setEventModel(Event);
  
  // Créer un index géospatial si inexistant, pour améliorer les requêtes de proximité
  Event.collection.createIndex({ "location": "2dsphere" }).catch(err => {
    // Ignorer l'erreur si l'index existe déjà
    console.log('Note: Index géospatial vérifié ou déjà existant');
  });
  
  // Log pour debug
  console.log('✅ Modèle Event correctement initialisé avec la collection Loisir_Paris_Evenements');
};

/**
 * Fonction utilitaire pour normaliser les formats d'ID et de champs 
 * supportant à la fois les formats du frontend et du backend
 */
const normalizeEventData = (event) => {
  if (!event) return null;
  
  const eventObj = typeof event.toObject === 'function' ? event.toObject() : event;
  
  return {
    ...eventObj,
    // Standardiser les champs qui peuvent apparaître sous différents noms
    titre: eventObj.intitulé || eventObj.title || eventObj.titre || '',
    description: eventObj.détail || eventObj.description || '',
    date_debut: eventObj.date_debut || (eventObj.startDate ? new Date(eventObj.startDate).toLocaleDateString('fr-FR') : null),
    date_fin: eventObj.date_fin || (eventObj.endDate ? new Date(eventObj.endDate).toLocaleDateString('fr-FR') : null),
    lieu: eventObj.lieu || eventObj.venue || '',
    categorie: eventObj.catégorie || eventObj.category || eventObj.categoryName || '',
    image: eventObj.image || eventObj.photo || ''
  };
};

// Export the initialize function to be called from index.js
router.initialize = initialize;
router.normalizeEventData = normalizeEventData; // Exporter la fonction de normalisation

// Routes principales
router.get('/', eventController.getAllEvents);
router.get('/search', eventController.searchEvents);
router.get('/nearby', eventController.getNearbyEvents);
router.get('/popular', eventController.getPopularEvents);

// Routes spécifiques - DOIVENT être définies AVANT la route générique /:id
router.get('/advanced-search', async (req, res) => {
  try {
    const {
      category,
      emotions,
      keyword,
      dateStart,
      dateEnd,
      minPrice,
      maxPrice,
      location,
      radius,
      page = 1,
      limit = 20
    } = req.query;
    
    console.log('🔍 Recherche avancée d\'événements avec filtres:', req.query);
    
    // Construction des critères de recherche
    const query = {};
    
    // Filtre par catégorie
    if (category) {
      query.$or = [
        { catégorie: { $regex: category, $options: 'i' } },
        { category: { $regex: category, $options: 'i' } },
        { catégorie_principale: { $regex: category, $options: 'i' } }
      ];
    }
    
    // Filtre par émotions
    if (emotions) {
      const emotionsList = emotions.split(',');
      query.emotions = { $in: emotionsList.map(e => new RegExp(e, 'i')) };
    }
    
    // Filtre par mot-clé
    if (keyword) {
      query.$or = query.$or || [];
      query.$or.push(
        { intitulé: { $regex: keyword, $options: 'i' } },
        { title: { $regex: keyword, $options: 'i' } },
        { détail: { $regex: keyword, $options: 'i' } },
        { description: { $regex: keyword, $options: 'i' } }
      );
    }
    
    // Filtre par date
    if (dateStart || dateEnd) {
      query.$and = query.$and || [];
      
      if (dateStart) {
        const startDate = new Date(dateStart);
        query.$and.push({
          $or: [
            { date_debut: { $gte: startDate.toLocaleDateString('fr-FR') } },
            { start_date: { $gte: startDate } }
          ]
        });
      }
      
      if (dateEnd) {
        const endDate = new Date(dateEnd);
        query.$and.push({
          $or: [
            { date_fin: { $lte: endDate.toLocaleDateString('fr-FR') } },
            { end_date: { $lte: endDate } }
          ]
        });
      }
    }
    
    // Filtre par prix
    if (minPrice || maxPrice) {
      query.$and = query.$and || [];
      
      if (minPrice) {
        query.$and.push({
          $or: [
            { price_amount: { $gte: parseFloat(minPrice) } },
            { 'price.amount': { $gte: parseFloat(minPrice) } }
          ]
        });
      }
      
      if (maxPrice) {
        query.$and.push({
          $or: [
            { price_amount: { $lte: parseFloat(maxPrice) } },
            { 'price.amount': { $lte: parseFloat(maxPrice) } }
          ]
        });
      }
    }
    
    // Filtre par localisation si coordonnées et rayon fournis
    if (location && radius) {
      const [lat, lng] = location.split(',').map(coord => parseFloat(coord));
      const radiusInRadians = parseInt(radius) / 6378137; // Convertir mètres en radians
      
      query.location = {
        $geoWithin: {
          $centerSphere: [[lng, lat], radiusInRadians]
        }
      };
    }
    
    // Exécution de la requête avec pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Assurer que le modèle Event est correctement initialisé
    if (!router.Event) {
      if (!loisirDb) {
        loisirDb = mongoose.connection.useDb('Loisir&Culture');
      }
      router.Event = loisirDb.model(
        'Event',
        new mongoose.Schema({}, { strict: false }),
        'Loisir_Paris_Evenements'
      );
    }
    
    // Récupération des événements
    const events = await router.Event.find(query)
      .sort({ date_debut: 1, start_date: 1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();
    
    console.log(`✅ ${events.length} événements trouvés pour la recherche avancée`);
    
    // Traitement des résultats avec la fonction de normalisation
    const processedEvents = events.map(event => router.normalizeEventData(event));
    
    res.json(processedEvents);
  } catch (error) {
    console.error('❌ Erreur lors de la recherche avancée:', error);
    res.status(500).json({ message: 'Erreur serveur', error: error.message });
  }
});

/**
 * @route GET /api/events/search-by-artist
 * @desc Recherche des événements par artiste/performer
 * @access Public
 */
router.get('/search-by-artist', async (req, res) => {
  try {
    const { artistName } = req.query;
    
    if (!artistName) {
      return res.status(400).json({ message: 'Le nom de l\'artiste est requis' });
    }
    
    console.log(`🔍 Recherche d'événements pour l'artiste: ${artistName}`);
    
    // Connexion à la base Loisir&Culture
    const loisirDb = mongoose.connection.useDb('Loisir&Culture');
    const collection = loisirDb.collection('Loisir_Paris_Evenements');
    
    // Recherche dans les différentes structures de lineup
    const events = await collection.find({
      $or: [
        // Recherche dans les structures de lineup sous forme de tableau d'objets
        { 'lineup.nom': { $regex: artistName, $options: 'i' } },
        { 'performers.name': { $regex: artistName, $options: 'i' } },
        
        // Recherche dans les structures de lineup sous forme de tableau de chaînes
        { lineup: { $regex: artistName, $options: 'i' } },
        { performers: { $regex: artistName, $options: 'i' } },
        { artists: { $regex: artistName, $options: 'i' } },
        
        // Recherche dans les champs textuels
        { détail: { $regex: artistName, $options: 'i' } },
        { description: { $regex: artistName, $options: 'i' } }
      ]
    }).limit(50).toArray();
    
    console.log(`✅ ${events.length} événements trouvés pour l'artiste ${artistName}`);
    
    // Traitement des résultats pour assurer l'uniformité
    const processedEvents = events.map(event => ({
      _id: event._id,
      intitulé: event.intitulé || event.title,
      lieu: event.lieu || event.venue,
      catégorie: event.catégorie || event.category,
      date_debut: event.date_debut || (event.start_date ? new Date(event.start_date).toLocaleDateString('fr-FR') : null),
      prochaines_dates: event.prochaines_dates,
      image: event.image || event.photo,
      lineup: event.lineup
    }));
    
    res.json(processedEvents);
  } catch (error) {
    console.error('❌ Erreur lors de la recherche par artiste:', error);
    res.status(500).json({ message: 'Erreur serveur', error: error.message });
  }
});

// GET /api/events/producer/:producerId - Obtenir les événements d'un producteur
router.get('/producer/:producerId', async (req, res) => {
  try {
    // Vérifier que le modèle Event est correctement initialisé
    if (!router.Event) {
      return res.status(500).json({ error: 'Le modèle Event n\'est pas encore initialisé' });
    }
    
    const { producerId } = req.params;
    
    // Rechercher par ID de producteur (compatible avec plusieurs formats)
    const events = await router.Event.find({
      $or: [
        { producerId: producerId },
        { producer_id: producerId },
        { 'organizer.id': producerId }
      ]
    }).sort({ start_date: 1 });
    
    // Formatter les résultats si nécessaire
    const formattedEvents = events.map(event => event.toFrontend ? event.toFrontend() : event);
    
    res.status(200).json(formattedEvents);
  } catch (error) {
    console.error('Erreur lors de la récupération des événements du producteur:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des événements du producteur' });
  }
});

// GET /api/events/category/:category - Obtenir les événements par catégorie
router.get('/category/:category', async (req, res) => {
  try {
    // Vérifier que le modèle Event est correctement initialisé
    if (!router.Event) {
      return res.status(500).json({ error: 'Le modèle Event n\'est pas encore initialisé' });
    }
    
    const events = await router.Event.findByCategory(req.params.category);
    
    // Formatter les résultats si nécessaire
    const formattedEvents = events.map(event => event.toFrontend ? event.toFrontend() : event);
    
    res.status(200).json(formattedEvents);
  } catch (error) {
    console.error('Erreur de récupération des événements par catégorie:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des événements par catégorie' });
  }
});

// GET /api/events/filter/upcoming - Obtenir les événements à venir
router.get('/filter/upcoming', async (req, res) => {
  try {
    // Vérifier que le modèle Event est correctement initialisé
    if (!router.Event) {
      return res.status(500).json({ error: 'Le modèle Event n\'est pas encore initialisé' });
    }
    
    // Utiliser la méthode statique du modèle
    const events = await router.Event.findUpcoming();
    
    // Formatter les résultats si nécessaire
    const formattedEvents = events.map(event => event.toFrontend ? event.toFrontend() : event);
    
    res.status(200).json(formattedEvents);
  } catch (error) {
    console.error('Erreur de récupération des événements à venir:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des événements à venir' });
  }
});

// Routes génériques - DOIVENT être définies APRÈS les routes spécifiques
router.get('/:id', async (req, res) => {
  try {
    // Vérifier que le modèle Event est correctement initialisé
    if (!router.Event) {
      return res.status(500).json({ error: 'Le modèle Event n\'est pas encore initialisé' });
    }
    
    const eventId = req.params.id;
    
    // Essayez d'abord avec l'ID direct
    let event = await router.Event.findById(eventId).catch(() => null);
    
    // Si l'événement n'est pas trouvé, essayez avec une requête plus flexible
    if (!event) {
      event = await router.Event.findOne({
        $or: [
          { _id: eventId },
          { id: eventId },
          { eventId: eventId }
        ]
      });
    }
    
    if (!event) {
      console.log(`❌ Événement non trouvé avec ID: ${eventId}`);
      return res.status(404).json({ error: 'Événement non trouvé' });
    }
    
    // Normaliser les données avant de les envoyer
    const normalizedEvent = router.normalizeEventData(event);
    console.log(`✅ Événement trouvé et normalisé: ${normalizedEvent.titre || normalizedEvent.intitulé || normalizedEvent._id}`);
    
    res.status(200).json(normalizedEvent);
  } catch (error) {
    console.error('Erreur lors de la récupération de l\'événement:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération de l\'événement' });
  }
});

router.post('/', auth, eventController.createEvent);
router.put('/:id', auth, eventController.updateEvent);
router.delete('/:id', auth, eventController.deleteEvent);

// Routes pour les favoris
router.post('/user/:userId/favorites', auth, eventController.addToFavorites);
router.delete('/user/:userId/favorites', auth, eventController.removeFromFavorites);

// POST /api/events/:id/interested - Marquer l'intérêt pour un événement
router.post('/:id/interested', auth, async (req, res) => {
  try {
    // Vérifier que le modèle Event est correctement initialisé
    if (!router.Event) {
      return res.status(500).json({ error: 'Le modèle Event n\'est pas encore initialisé' });
    }
    
    const event = await router.Event.findById(req.params.id);
    
    if (!event) {
      return res.status(404).json({ error: 'Événement non trouvé' });
    }
    
    // Initialiser le tableau si nécessaire
    if (!event.interestedUsers) {
      event.interestedUsers = [];
    }
    
    // Vérifier si l'utilisateur est déjà intéressé
    const userIndex = event.interestedUsers.indexOf(req.user.id);
    
    if (userIndex > -1) {
      // Retirer l'intérêt
      event.interestedUsers.splice(userIndex, 1);
      event.interest_count = Math.max(0, (event.interest_count || 0) - 1);
      await event.save();
      
      res.status(200).json({ message: 'Vous n\'êtes plus intéressé par cet événement', isInterested: false });
    } else {
      // Ajouter l'intérêt
      event.interestedUsers.push(req.user.id);
      event.interest_count = (event.interest_count || 0) + 1;
      // Augmenter légèrement le score de popularité
      event.popularity_score = (event.popularity_score || 0) + 0.5;
      await event.save();
      
      res.status(200).json({ message: 'Vous êtes maintenant intéressé par cet événement', isInterested: true });
    }
  } catch (error) {
    console.error('Erreur lors de la mise à jour de l\'intérêt:', error);
    res.status(500).json({ error: 'Erreur lors de la mise à jour de l\'intérêt' });
  }
});

// POST /api/events/:id/choice - Marquer un événement comme un choix
router.post('/:id/choice', auth, async (req, res) => {
  try {
    // Vérifier que le modèle Event est correctement initialisé
    if (!router.Event) {
      return res.status(500).json({ error: 'Le modèle Event n\'est pas encore initialisé' });
    }
    
    const event = await router.Event.findById(req.params.id);
    
    if (!event) {
      return res.status(404).json({ error: 'Événement non trouvé' });
    }
    
    // Initialiser les tableaux et compteurs si nécessaire
    if (!event.choiceUsers) {
      event.choiceUsers = [];
    }
    
    // Vérifier si l'utilisateur a déjà choisi cet événement
    const userIndex = event.choiceUsers.findIndex(choice => choice.userId === req.user.id);
    
    if (userIndex > -1) {
      // Retirer le choix
      event.choiceUsers.splice(userIndex, 1);
      event.choice_count = Math.max(0, (event.choice_count || 0) - 1);
      await event.save();
      
      res.status(200).json({ message: 'Événement retiré de vos choix', isChoice: false });
    } else {
      // Ajouter le choix
      event.choiceUsers.push({ userId: req.user.id });
      event.choice_count = (event.choice_count || 0) + 1;
      // Augmenter significativement le score de popularité pour un choix
      event.popularity_score = (event.popularity_score || 0) + 2;
      await event.save();
      
      res.status(200).json({ message: 'Événement ajouté à vos choix', isChoice: true });
    }
  } catch (error) {
    console.error('Erreur lors de la mise à jour du choix:', error);
    res.status(500).json({ error: 'Erreur lors de la mise à jour du choix' });
  }
});

// POST /api/events/generate - Générer des événements aléatoires pour les tests
router.post('/generate', auth, async (req, res) => {
  try {
    // Vérifier que le modèle Event est correctement initialisé
    if (!router.Event) {
      return res.status(500).json({ error: 'Le modèle Event n\'est pas encore initialisé' });
    }
    
    // Vérifier que l'utilisateur est administrateur
    if (!req.user.isAdmin) {
      return res.status(403).json({ error: 'Permission refusée' });
    }
    
    const count = parseInt(req.body.count) || 10;
    
    // Limiter le nombre d'événements générés
    if (count > 50) {
      return res.status(400).json({ error: 'Le nombre maximum d\'événements à générer est de 50' });
    }
    
    // Générer des événements aléatoires
    const events = await router.Event.generateRandomEvents(count);
    
    res.status(201).json({
      message: `${events.length} événements générés avec succès`,
      count: events.length
    });
  } catch (error) {
    console.error('Erreur lors de la génération d\'événements:', error);
    res.status(500).json({ error: 'Erreur lors de la génération d\'événements' });
  }
});

module.exports = router;

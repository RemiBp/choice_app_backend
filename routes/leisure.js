const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { authenticateJWT } = require('../middleware/auth');
const { createModel, databases } = require('../utils/modelCreator');

// Importer les modèles nécessaires
const Event = require('../models/event')(mongoose.connection);
const User = createModel(
  databases.CHOICE_APP,
  'User',
  'Users'
);

// Créer les modèles pour les producteurs de loisir et leurs événements
const LeisureProducer = createModel(
  databases.LOISIR,
  'LeisureProducer',
  'Loisir_Paris_Producers'
);

const LeisureEvent = createModel(
  databases.LOISIR,
  'LeisureEvent',
  'Evenements_loisirs'
);

// Initialiser les modèles avec l'utilitaire
const Post = createModel(
  databases.CHOICE_APP,
  'Post',
  'Posts'
);

/**
 * @route GET /api/leisure/events
 * @desc Récupérer les événements de loisirs à proximité
 * @access Public
 */
router.get('/events', async (req, res) => {
  try {
    const {
      latitude,
      longitude,
      radius = 5000,
      keyword,
      minRating,
      categories,
      emotions,
      dateStart,
      dateEnd,
      minPrice,
      maxPrice,
      familyFriendly
    } = req.query;

    // Validation des paramètres obligatoires
    if (!latitude || !longitude) {
      return res.status(400).json({ message: 'Latitude et longitude sont requis' });
    }

    console.log(`🔍 Recherche d'événements autour de (${latitude}, ${longitude}) dans un rayon de ${radius}m`);
    console.log(`📊 Filtres: Catégories=${categories || 'toutes'}, Émotions=${emotions || 'toutes'}, Dates=${dateStart || 'non spécifié'} à ${dateEnd || 'non spécifié'}`);

    // Connexion à la base de données
    const loisirDb = mongoose.connection.useDb('Loisir&Culture');
    const collection = loisirDb.collection('Loisir_Paris_Evenements');
    
    // Construction de la requête pour les événements
    const query = {};
    
    // Ajouter la contrainte géospatiale si les coordonnées sont valides
    if (latitude && longitude && radius) {
      const lat = parseFloat(latitude);
      const lng = parseFloat(longitude);
      
      if (!isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
        // Désactiver temporairement la recherche géospatiale pour tester
        // car de nombreux documents peuvent ne pas avoir de coordonnées
        /*
        query.location = {
          $geoWithin: {
            $centerSphere: [
              [lng, lat],
              parseInt(radius) / 6378137 // Convertir mètres en radians
            ]
          }
        };
        */
        console.log(`🔍 Contrainte géospatiale désactivée temporairement pour les tests.`);
      }
    }
    
    // Temporairement, ajouter des coordonnées factices pour tests 
    // si les documents n'ont pas de géolocalisation
    const pipeline = [
      { $match: query },
      { $limit: 50 },
      {
        $addFields: {
          location: { 
            $cond: { 
              if: { $eq: ["$location", null] }, 
              then: { 
                type: "Point", 
                coordinates: [parseFloat(longitude), parseFloat(latitude)] 
              },
              else: "$location"
            }
          },
          latitude: { 
            $cond: { 
              if: { $eq: ["$latitude", null] }, 
              then: parseFloat(latitude),
              else: "$latitude"
            }
          },
          longitude: { 
            $cond: { 
              if: { $eq: ["$longitude", null] }, 
              then: parseFloat(longitude),
              else: "$longitude"
            }
          }
        }
      }
    ];
    
    // Filtrage par catégorie
    if (categories) {
      const categoryList = categories.split(',');
      query.$or = query.$or || [];
      
      categoryList.forEach(category => {
        query.$or.push(
          { catégorie: { $regex: category, $options: 'i' } },
          { category: { $regex: category, $options: 'i' } },
          { catégorie_principale: { $regex: category, $options: 'i' } }
        );
      });
    }
    
    // Filtrage par émotions
    if (emotions) {
      const emotionsList = emotions.split(',');
      query.emotions = { $in: emotionsList.map(e => new RegExp(e, 'i')) };
    }
    
    // Filtrage par mot-clé
    if (keyword) {
      query.$or = query.$or || [];
      query.$or.push(
        { intitulé: { $regex: keyword, $options: 'i' } },
        { title: { $regex: keyword, $options: 'i' } },
        { détail: { $regex: keyword, $options: 'i' } },
        { description: { $regex: keyword, $options: 'i' } }
      );
    }
    
    // Filtrage par note minimum
    if (minRating) {
      query.$or = [
        { note: { $gte: parseFloat(minRating) } },
        { 'rating.average': { $gte: parseFloat(minRating) } }
      ];
    }
    
    // Filtrage par date
    if (dateStart || dateEnd) {
      const dateConditions = [];
      
      if (dateStart) {
        try {
          // Convertir la date de début en format ISO
          const startDate = new Date(dateStart);
          
          // Ajouter la condition pour la date de début dans les différents formats possibles
          dateConditions.push({
            $or: [
              { date_debut: { $gte: startDate.toISOString().substring(0, 10) } },
              { start_date: { $gte: startDate } },
              { startDate: { $gte: startDate } }
            ]
          });
        } catch (e) {
          console.error('Erreur lors du parsing de la date de début:', e);
        }
      }
      
      if (dateEnd) {
        try {
          // Convertir la date de fin en format ISO
          const endDate = new Date(dateEnd);
          
          // Ajouter la condition pour la date de fin dans les différents formats possibles
          dateConditions.push({
            $or: [
              { date_fin: { $lte: endDate.toISOString().substring(0, 10) } },
              { end_date: { $lte: endDate } },
              { endDate: { $lte: endDate } }
            ]
          });
        } catch (e) {
          console.error('Erreur lors du parsing de la date de fin:', e);
        }
      }
      
      // Ajouter les conditions de date à la requête si elles existent
      if (dateConditions.length > 0) {
        query.$and = dateConditions;
      }
    }
    
    // Filtrage par prix
    if (minPrice || maxPrice) {
      const priceConditions = [];
      
      if (minPrice) {
        priceConditions.push({
          $or: [
            { price_amount: { $gte: parseFloat(minPrice) } },
            { 'price.amount': { $gte: parseFloat(minPrice) } }
          ]
        });
      }
      
      if (maxPrice) {
        priceConditions.push({
          $or: [
            { price_amount: { $lte: parseFloat(maxPrice) } },
            { 'price.amount': { $lte: parseFloat(maxPrice) } }
          ]
        });
      }
      
      // Ajouter les conditions de prix à la requête si elles existent
      if (priceConditions.length > 0) {
        query.$and = query.$and || [];
        query.$and.push(...priceConditions);
      }
    }
    
    // Filtrage pour événements adaptés aux familles
    if (familyFriendly === 'true') {
      query.$or = query.$or || [];
      query.$or.push(
        { 'tags': { $regex: 'famille', $options: 'i' } },
        { 'tags': { $regex: 'enfant', $options: 'i' } },
        { 'family_friendly': true }
      );
    }
    
    console.log('🧪 Requête MongoDB pour les événements:', JSON.stringify(query));
    
    // Exécution de la requête avec limite pour éviter de surcharger le frontend
    const events = await collection.find(query).limit(50).toArray();
    console.log(`✅ ${events.length} événements trouvés`);
    
    // Transformer les données pour normaliser le format
    const formattedEvents = events.map(event => ({
      _id: event._id,
      intitulé: event.intitulé || event.title || 'Sans titre',
      lieu: event.lieu || event.venue || 'Lieu non spécifié',
      adresse: event.adresse || event.address || '',
      catégorie: event.catégorie || event.category || 'Non catégorisé',
      date_debut: event.date_debut || (event.start_date ? new Date(event.start_date).toLocaleDateString('fr-FR') : 'Date non spécifiée'),
      date_fin: event.date_fin || (event.end_date ? new Date(event.end_date).toLocaleDateString('fr-FR') : ''),
      détail: event.détail || event.description || '',
      prix_reduit: event.prix_reduit || (event.price ? event.price.formatted || event.price.amount : ''),
      image: event.image || event.photo || '',
      note: event.note || (event.rating ? event.rating.average : null),
      lineup: event.lineup || [],
      emotions: event.emotions || [],
      location: event.location || null,
      horaires: event.horaires || null,
      purchase_url: event.purchase_url || event.ticketing_url || event.site_url || null,
      source: event.source || 'Loisir&Culture'
    }));
    
    // Si nous sommes en mode développement, ajouter des infos de debug
    if (process.env.NODE_ENV === 'development') {
      res.json({
        events: formattedEvents,
        debug: {
          query: query,
          count: events.length
        }
      });
    } else {
      res.json(formattedEvents);
    }
  } catch (error) {
    console.error('❌ Erreur sur /events:', error);
    res.status(500).json({ message: 'Erreur serveur', error: error.message });
  }
});

/**
 * @route GET /api/leisure/venues
 * @desc Récupérer les lieux de loisirs à proximité
 * @access Public
 */
router.get('/venues', async (req, res) => {
  try {
    const {
      latitude,
      longitude,
      radius = 5000,
      minRating = 0,
      categories,
      keyword,
      minPrice,
      maxPrice,
      producerType,
      accessibility,
      sortBy = 'distance'
    } = req.query;

    // Validation des paramètres obligatoires
    if (!latitude || !longitude) {
      return res.status(400).json({ message: 'Latitude et longitude sont requis' });
    }

    console.log(`🔍 Recherche de lieux autour de (${latitude}, ${longitude}) dans un rayon de ${radius}m avec catégories: ${categories || 'toutes'}`);

    // Simplification pour déboguer : d'abord vérifier si la collection a des données
    const loisirDb = mongoose.connection.useDb('Loisir&Culture');
    const collection = loisirDb.collection('Loisir_Paris_Evenements');
    
    const totalCount = await collection.countDocuments({});
    console.log(`📊 Nombre total d'événements dans la collection: ${totalCount}`);
    
    if (totalCount === 0) {
      console.log('⚠️ Aucun événement trouvé dans la collection. Vérifier la connexion à la base de données.');
      return res.json([]);
    }

    // Requête avec conditions progressives pour trouver des résultats
    let query = {};
    
    // Essayer d'abord avec tous les filtres - incluant la contrainte géospatiale
    if (latitude && longitude && radius) {
      query.location = {
        $geoWithin: {
          $centerSphere: [
            [parseFloat(longitude), parseFloat(latitude)],
            parseInt(radius) / 6378137 // Convertir mètres en radians (rayon terrestre ~6378137m)
          ]
        }
      };
    }
    
    // Si la note minimale est spécifiée, l'ajouter au filtre
    if (minRating && parseFloat(minRating) > 0) {
      query.$or = [
        { note: { $gte: parseFloat(minRating) } },
        { rating: { $gte: parseFloat(minRating) } },
        { 'rating.average': { $gte: parseFloat(minRating) } }
      ];
    }
    
    // Ajouter le filtre de catégorie si spécifié
    if (categories) {
      const categoryList = categories.split(',');
      query.$or = query.$or || [];
      
      // Ajouter une condition OR pour chaque catégorie
      categoryList.forEach(category => {
        query.$or.push(
          { catégorie: { $regex: category, $options: 'i' } },
          { category: { $regex: category, $options: 'i' } },
          { catégorie_principale: { $regex: category, $options: 'i' } }
        );
      });
    }
    
    console.log('🧪 Première requête de recherche avec contraintes complètes:', JSON.stringify(query));

    // Exécution de la requête sur la collection d'événements
    let venues = await collection.aggregate([
      { $match: query },
      { $group: {
        _id: '$lieu',
        nom: { $first: '$lieu' },
        adresse: { $first: '$adresse' },
        location: { $first: '$location' },
        note: { $avg: '$note' },
        image: { $first: '$image' },
        category: { $first: '$catégorie' },
        events: { $push: {
          id: '$_id',
          title: '$title',
          intitulé: '$intitulé',
          start_date: '$start_date',
          date_debut: '$date_debut',
          image: '$image'
        }},
        count: { $sum: 1 }
      }},
      { $match: { _id: { $ne: null } } },
      { $sort: { note: -1 } },
      { $limit: 50 }
    ]).toArray();

    console.log(`✅ Première tentative: ${venues.length} lieux trouvés`);
    
    // Si pas de résultats, essayer avec moins de contraintes
    if (venues.length === 0) {
      console.log('⚠️ Aucun lieu trouvé avec tous les filtres. Assouplissement des contraintes...');
      
      // Éliminer la contrainte géospatiale mais garder les autres filtres
      delete query.location;
      
      console.log('🧪 Deuxième requête sans contrainte géospatiale:', JSON.stringify(query));
      
      venues = await collection.aggregate([
        { $match: query },
        { $group: {
          _id: '$lieu',
          nom: { $first: '$lieu' },
          adresse: { $first: '$adresse' },
          location: { $first: '$location' },
          note: { $avg: '$note' },
          image: { $first: '$image' },
          category: { $first: '$catégorie' },
          events: { $push: {
            id: '$_id',
            title: '$title',
            intitulé: '$intitulé',
            start_date: '$start_date',
            date_debut: '$date_debut',
            image: '$image'
          }},
          count: { $sum: 1 }
        }},
        { $match: { _id: { $ne: null } } },
        { $sort: { note: -1 } },
        { $limit: 50 }
      ]).toArray();
      
      console.log(`✅ Deuxième tentative: ${venues.length} lieux trouvés sans contrainte géospatiale`);
    }
    
    // Si toujours pas de résultats, essayer avec seulement la catégorie
    if (venues.length === 0 && categories) {
      console.log('⚠️ Toujours aucun lieu trouvé. Essai avec seulement la catégorie...');
      
      const categoryQuery = {
        $or: []
      };
      
      const categoryList = categories.split(',');
      categoryList.forEach(category => {
        categoryQuery.$or.push(
          { catégorie: { $regex: category, $options: 'i' } },
          { category: { $regex: category, $options: 'i' } },
          { catégorie_principale: { $regex: category, $options: 'i' } }
        );
      });
      
      console.log('🧪 Troisième requête avec seulement catégorie:', JSON.stringify(categoryQuery));
      
      venues = await collection.aggregate([
        { $match: categoryQuery },
        { $group: {
          _id: '$lieu',
          nom: { $first: '$lieu' },
          adresse: { $first: '$adresse' },
          location: { $first: '$location' },
          note: { $avg: '$note' },
          image: { $first: '$image' },
          category: { $first: '$catégorie' },
          events: { $push: {
            id: '$_id',
            title: '$title',
            intitulé: '$intitulé',
            start_date: '$start_date',
            date_debut: '$date_debut',
            image: '$image'
          }},
          count: { $sum: 1 }
        }},
        { $match: { _id: { $ne: null } } },
        { $sort: { note: -1 } },
        { $limit: 50 }
      ]).toArray();
      
      console.log(`✅ Troisième tentative: ${venues.length} lieux trouvés avec seulement la catégorie`);
    }
    
    // Si toujours pas de résultats, retourner simplement 10 lieux quelconques
    if (venues.length === 0) {
      console.log('⚠️ Dernière tentative: récupération de lieux quelconques...');
      
      venues = await collection.aggregate([
        { $match: { lieu: { $ne: null, $ne: "" } } },
        { $group: {
          _id: '$lieu',
          nom: { $first: '$lieu' },
          adresse: { $first: '$adresse' },
          location: { $first: '$location' },
          note: { $avg: '$note' },
          image: { $first: '$image' },
          category: { $first: '$catégorie' },
          events: { $push: {
            id: '$_id',
            title: '$title',
            intitulé: '$intitulé',
            start_date: '$start_date',
            date_debut: '$date_debut',
            image: '$image'
          }},
          count: { $sum: 1 }
        }},
        { $match: { _id: { $ne: null } } },
        { $sort: { count: -1 } },
        { $limit: 10 }
      ]).toArray();
      
      console.log(`✅ Dernière tentative: ${venues.length} lieux trouvés sans aucun filtre`);
    }
    
    // Traitement final des résultats
    const processedVenues = venues.map(venue => {
      // S'assurer que chaque lieu a la structure correcte des coordonnées pour le frontend
      if (venue.location && venue.location.coordinates && Array.isArray(venue.location.coordinates)) {
        const [longitude, latitude] = venue.location.coordinates;
        venue.latitude = latitude;
        venue.longitude = longitude;
      }
      
      // Si pas d'image, ajouter une image par défaut basée sur la catégorie
      if (!venue.image || venue.image === '') {
        if (venue.category && venue.category.toLowerCase().includes('concert')) {
          venue.image = 'https://images.unsplash.com/photo-1501281668745-f7f57925c3b4?ixlib=rb-1.2.1&auto=format&fit=crop&w=1350&q=80';
        } else if (venue.category && venue.category.toLowerCase().includes('théâtre')) {
          venue.image = 'https://images.unsplash.com/photo-1507924538820-ede94a04019d?ixlib=rb-1.2.1&auto=format&fit=crop&w=1350&q=80';
        } else if (venue.category && venue.category.toLowerCase().includes('expo')) {
          venue.image = 'https://images.unsplash.com/photo-1531243269054-5ebdee3d2657?ixlib=rb-1.2.1&auto=format&fit=crop&w=1350&q=80';
        } else {
          venue.image = 'https://images.unsplash.com/photo-1486591978090-58e619d37fe7?ixlib=rb-1.2.1&auto=format&fit=crop&w=1350&q=80';
        }
      }
      
      // Limiter le nombre d'événements pour réduire la taille des données
      if (venue.events && venue.events.length > 10) {
        venue.events = venue.events.slice(0, 10);
      }
      
      return venue;
    });

    console.log(`✅ Résultat final: ${processedVenues.length} lieux retournés`);
    
    // Ajouter des informations de debug dans la réponse en mode développement
    if (process.env.NODE_ENV === 'development') {
      res.json({
        venues: processedVenues,
        debug: {
          total_in_collection: totalCount,
          filters_applied: {
            geo: !!query.location,
            rating: minRating ? parseFloat(minRating) : 0,
            categories: categories || 'none'
          },
          query_performed: JSON.stringify(query)
        }
      });
    } else {
      res.json(processedVenues);
    }
  } catch (error) {
    console.error('❌ Erreur sur /venues:', error);
    res.status(500).json({ message: 'Erreur serveur', error: error.message });
  }
});

/**
 * @route GET /api/leisure/categories
 * @desc Récupérer les catégories d'événements disponibles
 * @access Public
 */
router.get('/categories', async (req, res) => {
  try {
    // Agréger pour obtenir toutes les catégories uniques
    const categories = await Event.aggregate([
      { $group: {
        _id: null,
        categories: { $addToSet: '$category' },
        catégories: { $addToSet: '$catégorie' }
      }}
    ]);
    
    // Fusionner et filtrer les catégories
    let allCategories = [];
    
    if (categories.length > 0) {
      allCategories = [...new Set([
        ...(categories[0].categories || []), 
        ...(categories[0].catégories || [])
      ])].filter(cat => cat && cat.trim().length > 0);
    }
    
    res.json(allCategories);
  } catch (error) {
    console.error('❌ Erreur lors de la récupération des catégories:', error);
    res.status(500).json({ message: 'Erreur serveur', error: error.message });
  }
});

/**
 * @route GET /api/leisure/emotions
 * @desc Récupérer les émotions disponibles pour les événements
 * @access Public
 */
router.get('/emotions', async (req, res) => {
  try {
    // Agréger pour obtenir toutes les émotions uniques
    const emotions = await Event.aggregate([
      { $unwind: '$emotions' },
      { $group: {
        _id: null,
        emotions: { $addToSet: '$emotions' }
      }}
    ]);
    
    let allEmotions = [];
    
    if (emotions.length > 0) {
      allEmotions = emotions[0].emotions.filter(emotion => emotion && emotion.trim().length > 0);
    } else {
      // Fournir une liste par défaut si aucune n'est trouvée dans la base de données
      allEmotions = [
        'Joie', 'Surprise', 'Nostalgie', 'Fascination', 'Inspiration',
        'Amusement', 'Détente', 'Excitation', 'Émerveillement', 'Réflexion'
      ];
    }
    
    res.json(allEmotions);
  } catch (error) {
    console.error('❌ Erreur lors de la récupération des émotions:', error);
    res.status(500).json({ message: 'Erreur serveur', error: error.message });
  }
});

/**
 * @route GET /api/leisure/event/:id
 * @desc Récupérer les détails complets d'un événement
 * @access Public
 */
router.get('/event/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const event = await Event.findById(id);
    
    if (!event) {
      return res.status(404).json({ message: 'Événement non trouvé' });
    }
    
    // Incrémenter le compteur de vues
    await Event.findByIdAndUpdate(id, { $inc: { views_count: 1 } });
    
    // Formatage complet pour l'API frontend
    const eventDetails = {
      id: event._id,
      title: event.title || event.intitulé || event.name,
      description: event.description || event.détail,
      category: event.category || event.catégorie,
      subcategory: event.subcategory,
      image: event.image || event.cover_image,
      images: event.images || [],
      location: {
        coordinates: event.location?.coordinates || event.localisation?.coordinates,
        venue: event.venue || event.lieu,
        address: event.address || event.adresse
      },
      date: {
        start: event.start_date || event.date_debut || event.date,
        end: event.end_date || event.date_fin,
        schedule: event.horaires || event.schedule
      },
      price: {
        amount: event.price?.amount,
        isFree: event.price?.is_free || event.is_free,
        discount: event.prix_reduit
      },
      rating: event.rating?.average || event.note,
      lineup: event.lineup,
      emotions: event.emotions,
      links: {
        ticket: event.ticket_url || event.purchase_url,
        site: event.site_url || event.url
      }
    };
    
    res.json(eventDetails);
  } catch (error) {
    console.error('❌ Erreur lors de la récupération des détails de l\'événement:', error);
    res.status(500).json({ message: 'Erreur serveur', error: error.message });
  }
});

/**
 * @route POST /api/leisure/event/:id/interest
 * @desc Marquer un intérêt pour un événement
 * @access Private
 */
router.post('/event/:id/interest', authenticateJWT, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    
    // Vérifier si l'événement existe
    const event = await Event.findById(id);
    if (!event) {
      return res.status(404).json({ message: 'Événement non trouvé' });
    }
    
    // Vérifier si l'utilisateur a déjà marqué un intérêt
    if (event.interestedUsers && event.interestedUsers.includes(userId)) {
      return res.status(400).json({ message: 'Vous avez déjà marqué un intérêt pour cet événement' });
    }
    
    // Mettre à jour l'événement
    await Event.findByIdAndUpdate(id, {
      $addToSet: { interestedUsers: userId },
      $inc: { interest_count: 1 }
    });
    
    res.json({ message: 'Intérêt marqué avec succès' });
  } catch (error) {
    console.error('❌ Erreur lors du marquage d\'intérêt:', error);
    res.status(500).json({ message: 'Erreur serveur', error: error.message });
  }
});

/**
 * @route GET /api/leisure/rating-criteria
 * @desc Récupérer les critères d'évaluation par catégorie
 * @access Public
 */
router.get('/rating-criteria', async (req, res) => {
  try {
    const { category } = req.query;
    
    // Définition des critères par défaut et spécifiques à chaque catégorie
    const defaultCriteria = {
      ambiance: "Ambiance",
      qualite_service: "Qualité du service",
      rapport_qualite_prix: "Rapport qualité/prix"
    };
    
    // Critères spécifiques par type de lieu/événement
    const categoryCriteria = {
      // Théâtre
      theatre: {
        mise_en_scene: "Mise en scène",
        jeu_acteurs: "Jeu d'acteurs",
        texte: "Texte/Scénario"
      },
      // Concert
      concert: {
        qualite_son: "Qualité du son",
        performance: "Performance des artistes",
        programmation: "Programmation"
      },
      // Exposition
      exposition: {
        scenographie: "Scénographie",
        contenu: "Richesse du contenu",
        accessibilite: "Accessibilité des explications"
      },
      // Cinéma
      cinema: {
        confort: "Confort",
        qualite_projection: "Qualité de projection",
        selection_films: "Sélection des films"
      },
      // Comédie
      comedie: {
        humour: "Qualité de l'humour",
        rythme: "Rythme",
        originalite: "Originalité"
      },
      // Danse
      danse: {
        technique: "Technique",
        choregraphie: "Chorégraphie",
        interpretation: "Interprétation"
      },
      // Festival
      festival: {
        organisation: "Organisation",
        diversite: "Diversité de la programmation",
        installations: "Qualité des installations"
      },
      // Musée
      musee: {
        collections: "Collections",
        parcours: "Parcours de visite",
        information: "Qualité des informations"
      }
    };
    
    // Si une catégorie est spécifiée et existe dans notre liste
    if (category && categoryCriteria[category.toLowerCase()]) {
      const criteria = {
        ...defaultCriteria,
        ...categoryCriteria[category.toLowerCase()]
      };
      
      res.status(200).json(criteria);
    } else if (category) {
      // Si la catégorie spécifiée n'existe pas, on essaie de la normaliser
      const normalizedCategory = standardizeCategory(category);
      if (categoryCriteria[normalizedCategory]) {
        const criteria = {
          ...defaultCriteria,
          ...categoryCriteria[normalizedCategory]
        };
        
        res.status(200).json(criteria);
      } else {
        // Si toujours pas de correspondance, retourner les critères par défaut
        res.status(200).json(defaultCriteria);
      }
    } else {
      // Si aucune catégorie n'est spécifiée, retourner toutes les catégories et leurs critères
      res.status(200).json({
        default: defaultCriteria,
        ...categoryCriteria
      });
    }
  } catch (error) {
    console.error('❌ Erreur dans getCriteresByCategory:', error);
    res.status(500).json({ message: 'Erreur lors de la récupération des critères', error: error.message });
  }
});

/**
 * Normalise une catégorie en la transformant en une clé standard
 * @param {string} category - La catégorie à standardiser
 * @returns {string} - La clé standardisée ou "default" si non trouvée
 */
function standardizeCategory(category) {
  if (!category) return "default";
  
  const categoryLower = category.toLowerCase();
  
  // Mappings de normalisation basés sur le script Python
  const mappings = {
    "théâtre": "theatre",
    "theater": "theatre",
    "piece": "theatre",
    "pièce": "theatre",
    "comedie": "comedie",
    "comédies": "comedie",
    "humour": "comedie",
    "one-man-show": "comedie",
    "one man show": "comedie",
    "stand-up": "comedie",
    "concert": "concert",
    "concerts": "concert",
    "musique": "concert",
    "spectacle musical": "concert",
    "opéra": "concert",
    "jazz": "concert",
    "exposition": "exposition",
    "expo": "exposition",
    "galerie": "exposition",
    "art": "exposition",
    "musée": "musee",
    "museum": "musee",
    "visite": "musee",
    "danse": "danse",
    "ballet": "danse",
    "chorégraphie": "danse",
    "festival": "festival",
    "cinéma": "cinema",
    "cinema": "cinema",
    "film": "cinema",
    "projection": "cinema"
  };
  
  // Recherche directe
  if (mappings[categoryLower]) {
    return mappings[categoryLower];
  }
  
  // Recherche partielle (si la catégorie contient un mot-clé)
  for (const [key, value] of Object.entries(mappings)) {
    if (categoryLower.includes(key)) {
      return value;
    }
  }
  
  return "default";
}

// Extraire les critères d'évaluation spécifiques d'une requête
function extractRatingCriteria(req) {
  const criteria = {};
  const criteriaPrefixes = ['criteria_', 'critere_', 'note_'];
  
  // Parcourir tous les paramètres de requête
  Object.keys(req.query).forEach(key => {
    for (const prefix of criteriaPrefixes) {
      if (key.startsWith(prefix)) {
        const criteriaKey = key.replace(prefix, '');
        criteria[criteriaKey] = parseFloat(req.query[key]);
      }
    }
  });
  
  return criteria;
}

// Calculer un score pour un lieu basé sur les critères d'évaluation
function calculateRatingScore(place, ratingCriteria) {
  if (!place || !ratingCriteria || Object.keys(ratingCriteria).length === 0) {
    return place.rating || place.note || 0;
  }
  
  let totalScore = 0;
  let matchedCriteria = 0;
  
  // Vérifier si le lieu a des notes détaillées
  const detailedRatings = place.detailed_ratings || place.notes_detaillees || {};
  
  // Parcourir les critères demandés
  for (const [key, minValue] of Object.entries(ratingCriteria)) {
    if (detailedRatings[key] !== undefined && detailedRatings[key] >= minValue) {
      totalScore += detailedRatings[key];
      matchedCriteria++;
    }
  }
  
  if (matchedCriteria > 0) {
    // Retourner la moyenne des critères qui correspondent
    return totalScore / matchedCriteria;
  }
  
  // Si aucun critère ne correspond, utiliser la note globale
  return place.rating || place.note || 0;
}

/**
 * @route GET /api/leisure/producer/:id
 * @desc Récupérer les détails d'un producteur de loisir
 * @access Public
 */
router.get('/producer/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'ID de producteur invalide' });
    }
    
    console.log(`🔍 Recherche du producteur de loisir avec ID: ${id}`);
    
    // Essayer de trouver le producteur dans la collection Loisir_Paris_Producers
    const producer = await LeisureProducer.findById(id);
    
    if (!producer) {
      return res.status(404).json({ message: 'Producteur de loisir non trouvé' });
    }
    
    // Enrichir avec les événements associés
    const events = await LeisureEvent.find({ producer_id: id }).sort({ date_debut: -1 }).limit(30);
    
    // Ajouter les événements à l'objet producteur
    const producerWithEvents = {
      ...producer.toObject(),
      evenements: events
    };
    
    // Récupérer les données sociales (followers, etc.)
    try {
      const user = await User.findOne({ leisure_producer_id: id });
      
      if (user) {
        producerWithEvents.user_id = user._id;
        producerWithEvents.followers = user.followers || [];
        producerWithEvents.following = user.following || [];
        producerWithEvents.interestedUsers = user.interests || [];
        producerWithEvents.choiceUsers = user.choices || [];
      }
    } catch (error) {
      console.error('❌ Erreur lors de la récupération des données sociales:', error);
    }
    
    res.status(200).json(producerWithEvents);
  } catch (error) {
    console.error('❌ Erreur lors de la récupération du producteur:', error);
    res.status(500).json({ message: 'Erreur serveur', error: error.message });
  }
});

/**
 * @route GET /api/leisureProducers/:id
 * @desc Route alternative pour la compatibilité avec l'application mobile existante
 * @access Public
 */
router.get('/leisureProducers/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'ID de producteur invalide' });
    }
    
    console.log(`🔍 Recherche du producteur de loisir (route alternative) avec ID: ${id}`);
    
    // Essayer de trouver le producteur dans la collection Loisir_Paris_Producers
    const producer = await LeisureProducer.findById(id);
    
    if (!producer) {
      return res.status(404).json({ message: 'Producteur de loisirs non trouvé' });
    }
    
    // Enrichir avec les événements associés
    const events = await LeisureEvent.find({ producer_id: id }).sort({ date_debut: -1 }).limit(30);
    
    // Ajouter les événements à l'objet producteur
    const producerWithEvents = {
      ...producer.toObject(),
      evenements: events
    };
    
    // Récupérer les données sociales (followers, etc.)
    try {
      const user = await User.findOne({ leisure_producer_id: id });
      
      if (user) {
        producerWithEvents.user_id = user._id;
        producerWithEvents.followers = user.followers || [];
        producerWithEvents.following = user.following || [];
        producerWithEvents.interestedUsers = user.interests || [];
        producerWithEvents.choiceUsers = user.choices || [];
      }
    } catch (error) {
      console.error('❌ Erreur lors de la récupération des données sociales:', error);
    }
    
    res.status(200).json(producerWithEvents);
  } catch (error) {
    console.error('❌ Erreur lors de la récupération du producteur (route alternative):', error);
    res.status(500).json({ message: 'Erreur serveur', error: error.message });
  }
});

/**
 * @route POST /api/leisure/producer/:id/update
 * @desc Mettre à jour les informations d'un producteur de loisir
 * @access Private
 */
router.post('/producer/:id/update', authenticateJWT, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, adresse, photo_url, categories, type, coordonnees } = req.body;
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'ID de producteur invalide' });
    }
    
    // Vérifier que l'utilisateur a le droit de modifier ce producteur
    // (soit l'utilisateur est le propriétaire, soit il est admin)
    const user = await User.findById(req.user.id);
    
    if (!user || (user.leisure_producer_id !== id && user.role !== 'admin')) {
      return res.status(403).json({ message: 'Non autorisé à modifier ce producteur' });
    }
    
    // Préparer les données à mettre à jour
    const updateData = {};
    
    if (name) updateData.lieu = name;
    if (description) updateData.description = description;
    if (adresse) updateData.adresse = adresse;
    if (photo_url) updateData.photo = photo_url;
    if (categories && Array.isArray(categories)) updateData.categories = categories;
    if (type) updateData.type = type;
    
    // Mise à jour des coordonnées
    if (coordonnees && coordonnees.longitude && coordonnees.latitude) {
      updateData.location = {
        type: "Point",
        coordinates: [parseFloat(coordonnees.longitude), parseFloat(coordonnees.latitude)]
      };
    }
    
    // Mettre à jour le producteur
    const updatedProducer = await LeisureProducer.findByIdAndUpdate(
      id,
      { $set: updateData },
      { new: true }
    );
    
    if (!updatedProducer) {
      return res.status(404).json({ message: 'Producteur de loisir non trouvé' });
    }
    
    res.status(200).json(updatedProducer);
  } catch (error) {
    console.error('❌ Erreur lors de la mise à jour du producteur:', error);
    res.status(500).json({ message: 'Erreur serveur', error: error.message });
  }
});

/**
 * @route POST /api/leisure/event/create
 * @desc Créer un nouvel événement pour un producteur de loisir
 * @access Private
 */
router.post('/event/create', authenticateJWT, async (req, res) => {
  try {
    const { 
      producerId, 
      title, 
      description, 
      category, 
      date_debut, 
      date_fin, 
      horaires,
      adresse,
      tarif,
      image
    } = req.body;
    
    if (!producerId || !title || !date_debut) {
      return res.status(400).json({ message: 'Données manquantes: ID producteur, titre et date de début sont requis' });
    }
    
    // Vérifier que l'utilisateur a le droit de créer un événement pour ce producteur
    const user = await User.findById(req.user.id);
    
    if (!user || (user.leisure_producer_id !== producerId && user.role !== 'admin')) {
      return res.status(403).json({ message: 'Non autorisé à créer un événement pour ce producteur' });
    }
    
    // Créer le nouvel événement
    const newEvent = new LeisureEvent({
      title,
      intitulé: title, // Pour compatibilité avec les anciens champs
      description,
      catégorie: category,
      category,
      date_debut,
      date_fin,
      horaires: horaires || [],
      adresse,
      tarif: tarif || 'Gratuit',
      image,
      producer_id: producerId
    });
    
    const savedEvent = await newEvent.save();
    
    // Mettre à jour la liste d'événements du producteur
    await LeisureProducer.findByIdAndUpdate(
      producerId,
      { $push: { evenements: savedEvent._id } }
    );
    
    res.status(201).json(savedEvent);
  } catch (error) {
    console.error('❌ Erreur lors de la création de l\'événement:', error);
    res.status(500).json({ message: 'Erreur serveur', error: error.message });
  }
});

/**
 * @route PUT /api/leisure/event/:id
 * @desc Mettre à jour un événement existant
 * @access Private
 */
router.put('/event/:id', authenticateJWT, async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      title, 
      description, 
      category, 
      date_debut, 
      date_fin, 
      horaires,
      adresse,
      tarif,
      image
    } = req.body;
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'ID d\'événement invalide' });
    }
    
    // Récupérer l'événement pour vérifier le producteur associé
    const event = await LeisureEvent.findById(id);
    
    if (!event) {
      return res.status(404).json({ message: 'Événement non trouvé' });
    }
    
    // Vérifier que l'utilisateur a le droit de modifier cet événement
    const user = await User.findById(req.user.id);
    
    if (!user || (user.leisure_producer_id !== event.producer_id.toString() && user.role !== 'admin')) {
      return res.status(403).json({ message: 'Non autorisé à modifier cet événement' });
    }
    
    // Préparer les données à mettre à jour
    const updateData = {};
    
    if (title) {
      updateData.title = title;
      updateData.intitulé = title; // Pour compatibilité
    }
    if (description) updateData.description = description;
    if (category) {
      updateData.category = category;
      updateData.catégorie = category; // Pour compatibilité
    }
    if (date_debut) updateData.date_debut = date_debut;
    if (date_fin) updateData.date_fin = date_fin;
    if (horaires) updateData.horaires = horaires;
    if (adresse) updateData.adresse = adresse;
    if (tarif) updateData.tarif = tarif;
    if (image) updateData.image = image;
    
    // Mettre à jour l'événement
    const updatedEvent = await LeisureEvent.findByIdAndUpdate(
      id,
      { $set: updateData },
      { new: true }
    );
    
    res.status(200).json(updatedEvent);
  } catch (error) {
    console.error('❌ Erreur lors de la mise à jour de l\'événement:', error);
    res.status(500).json({ message: 'Erreur serveur', error: error.message });
  }
});

/**
 * @route DELETE /api/leisure/event/:id
 * @desc Supprimer un événement
 * @access Private
 */
router.delete('/event/:id', authenticateJWT, async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'ID d\'événement invalide' });
    }
    
    // Récupérer l'événement pour vérifier le producteur associé
    const event = await LeisureEvent.findById(id);
    
    if (!event) {
      return res.status(404).json({ message: 'Événement non trouvé' });
    }
    
    // Vérifier que l'utilisateur a le droit de supprimer cet événement
    const user = await User.findById(req.user.id);
    
    if (!user || (user.leisure_producer_id !== event.producer_id.toString() && user.role !== 'admin')) {
      return res.status(403).json({ message: 'Non autorisé à supprimer cet événement' });
    }
    
    // Supprimer l'événement
    await LeisureEvent.findByIdAndDelete(id);
    
    // Supprimer la référence de l'événement dans le producteur
    await LeisureProducer.findByIdAndUpdate(
      event.producer_id,
      { $pull: { evenements: id } }
    );
    
    res.status(200).json({ message: 'Événement supprimé avec succès' });
  } catch (error) {
    console.error('❌ Erreur lors de la suppression de l\'événement:', error);
    res.status(500).json({ message: 'Erreur serveur', error: error.message });
  }
});

/**
 * @route GET /api/leisure/debug/producers
 * @desc Récupérer la liste des IDs de tous les producteurs de loisir pour diagnostic
 * @access Public
 */
router.get('/debug/producers', async (req, res) => {
  try {
    console.log('🔍 Diagnostic de la collection de loisirs');
    
    // Vérifier l'existence de la collection
    const collections = await mongoose.connection.db.listCollections().toArray();
    console.log('📊 Collections disponibles dans la base de données globale:');
    collections.forEach(coll => console.log(`- ${coll.name}`));
    
    // Liste des collections à vérifier
    const potentialCollections = [
      'Loisir_Paris_Producers',
      'loisir_paris_producers',
      'leisureProducers',
      'leisure_producers',
      'Producers'
    ];
    
    // Résultats pour le diagnostic
    const diagnosticResults = {
      databaseInfo: {
        name: mongoose.connection.name,
        status: mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected',
        collections: collections.map(c => c.name)
      },
      collectionsChecked: {},
      producersFound: []
    };
    
    for (const collName of potentialCollections) {
      try {
        // Vérifier si la collection existe
        const collExists = collections.some(c => c.name.toLowerCase() === collName.toLowerCase());
        diagnosticResults.collectionsChecked[collName] = {exists: collExists};
        
        if (collExists) {
          // Essayer de récupérer quelques documents
          const loisirDb = mongoose.connection.useDb('Loisir&Culture');
          const coll = loisirDb.collection(collName);
          const docs = await coll.find({}).limit(10).toArray();
          
          diagnosticResults.collectionsChecked[collName].count = docs.length;
          
          if (docs.length > 0) {
            // Ajouter quelques exemples d'IDs
            diagnosticResults.producersFound.push(...docs.map(d => ({
              id: d._id,
              collection: collName,
              name: d.lieu || d.name || 'Nom non spécifié'
            })));
          }
        }
      } catch (e) {
        diagnosticResults.collectionsChecked[collName] = {
          error: e.message
        };
      }
    }
    
    // Si aucun producteur n'est trouvé, essayer une approche alternative avec LeisureProducer
    if (diagnosticResults.producersFound.length === 0) {
      try {
        const LeisureProducer = createModel(
          databases.LOISIR,
          'LeisureProducer',
          'Loisir_Paris_Producers'
        );
        
        const producers = await LeisureProducer.find().limit(10);
        
        if (producers.length > 0) {
          diagnosticResults.producersFound.push(...producers.map(p => ({
            id: p._id,
            collection: 'Loisir_Paris_Producers (via model)',
            name: p.lieu || p.name || 'Nom non spécifié'
          })));
        }
      } catch (e) {
        diagnosticResults.altLookupError = e.message;
      }
    }
    
    console.log(`🔍 Diagnostic terminé. Trouvé: ${diagnosticResults.producersFound.length} producteurs`);
    
    // Retourner les résultats détaillés pour diagnostic
    return res.status(200).json({
      success: true,
      message: `${diagnosticResults.producersFound.length} producteurs trouvés pour diagnostic`,
      diagnosticResults
    });
  } catch (error) {
    console.error('❌ Erreur lors du diagnostic:', error);
    return res.status(500).json({ 
      message: 'Erreur lors du diagnostic', 
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

/**
 * @route GET /api/leisure/debug/find-id/:id
 * @desc Rechercher un ID spécifique dans toutes les collections pertinentes
 * @access Public
 */
router.get('/debug/find-id/:id', async (req, res) => {
  try {
    const id = req.params.id;
    console.log(`🔍 Recherche de l'ID spécifique: ${id} dans toutes les collections`);
    
    // Résultats de la recherche
    const results = {
      id: id,
      found: false,
      location: null,
      details: {},
      searchAttempts: []
    };
    
    // Bases de données à vérifier
    const dbsToCheck = ['choice_app', 'Restauration_Officielle', 'Loisir&Culture', 'Beauty_Wellness'];
    
    // Collections à vérifier dans chaque base de données
    const collectionsToCheck = [
      'Loisir_Paris_Producers',
      'loisir_paris_producers',
      'leisureProducers',
      'leisure_producers',
      'Producers',
      'producers',
      'Lieu',
      'Lieux',
      'Places',
      'places'
    ];
    
    // Vérifier dans toutes les bases de données et collections
    for (const dbName of dbsToCheck) {
      const db = mongoose.connection.useDb(dbName);
      
      // Essayer de lister les collections dans cette base de données
      let collections;
      try {
        collections = await db.db.listCollections().toArray();
        results.searchAttempts.push({
          database: dbName,
          collectionsCount: collections.length,
          collections: collections.map(c => c.name)
        });
      } catch (e) {
        results.searchAttempts.push({
          database: dbName,
          error: e.message
        });
        continue;
      }
      
      // Vérifier dans les collections spécifiées
      for (const collName of collectionsToCheck) {
        // Vérifier si la collection existe dans cette base de données
        if (!collections.some(c => c.name.toLowerCase() === collName.toLowerCase())) {
          continue;
        }
        
        try {
          const coll = db.collection(collName);
          let objId;
          
          // Essayer de convertir en ObjectId, attraper l'erreur si format invalide
          try {
            objId = new mongoose.Types.ObjectId(id);
          } catch (e) {
            results.searchAttempts.push({
              database: dbName,
              collection: collName,
              error: `ID invalide: ${e.message}`
            });
            continue;
          }
          
          // Rechercher l'ID dans cette collection
          const doc = await coll.findOne({ _id: objId });
          
          if (doc) {
            results.found = true;
            results.location = {
              database: dbName,
              collection: collName
            };
            results.details = doc;
            break;
          } else {
            results.searchAttempts.push({
              database: dbName,
              collection: collName,
              searched: true,
              found: false
            });
          }
        } catch (e) {
          results.searchAttempts.push({
            database: dbName,
            collection: collName,
            error: e.message
          });
        }
      }
      
      // Si trouvé, arrêter la recherche
      if (results.found) break;
    }
    
    // Recherche par nom/lieu/adresse si l'ID n'est pas trouvé
    if (!results.found) {
      try {
        // Vérifier dans la collection principale des producteurs de loisirs
        const db = mongoose.connection.useDb('Loisir&Culture');
        const coll = db.collection('Loisir_Paris_Producers');
        
        // Obtenir des échantillons pour aider à comprendre ce qui existe
        const samples = await coll.find().limit(5).toArray();
        
        results.samples = samples.map(s => ({
          id: s._id,
          nom: s.lieu || s.name,
          adresse: s.adresse || s.address
        }));
      } catch (e) {
        results.sampleError = e.message;
      }
    }
    
    // Retourner les résultats
    if (results.found) {
      return res.status(200).json({
        success: true,
        message: `ID trouvé dans ${results.location.database}/${results.location.collection}`,
        results
      });
    } else {
      return res.status(404).json({
        success: false,
        message: `ID non trouvé dans les collections scannées`,
        results
      });
    }
  } catch (error) {
    console.error('❌ Erreur lors de la recherche d\'ID:', error);
    return res.status(500).json({ 
      message: 'Erreur lors de la recherche', 
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

/**
 * @route GET /api/leisure/direct/:id
 * @desc Route de secours qui accède directement à la collection MongoDB
 * @access Public
 */
router.get('/direct/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'ID de producteur invalide' });
    }
    
    console.log(`🔍 Route DIRECTE: Recherche du producteur de loisir avec ID: ${id}`);
    
    // Accéder directement à la collection sans passer par le modèle
    const loisirDb = mongoose.connection.useDb('Loisir&Culture');
    const collection = loisirDb.collection('Loisir_Paris_Producers');
    
    // Rechercher le document directement
    const producer = await collection.findOne({ _id: new mongoose.Types.ObjectId(id) });
    
    if (!producer) {
      console.log(`❌ Document non trouvé directement avec l'ID: ${id}`);
      return res.status(404).json({ message: 'Producteur de loisir non trouvé (accès direct)' });
    }
    
    console.log(`✅ Document trouvé directement: ${producer.lieu || 'Nom inconnu'}`);
    
    // Récupérer les événements associés
    const events = [];
    if (producer.evenements && producer.evenements.length > 0) {
      const eventsCollection = loisirDb.collection('Evenements_loisirs');
      
      // Tenter de récupérer les événements par leurs IDs
      // Utiliser Promise.all pour paralléliser les requêtes
      const eventPromises = producer.evenements.map(async (eventRef) => {
        try {
          // Extraire l'ID de l'événement
          let eventId;
          if (typeof eventRef === 'string') {
            eventId = eventRef;
          } else if (eventRef._id) {
            eventId = eventRef._id;
          } else if (eventRef.lien_evenement) {
            // Format spécial où l'ID est dans un champ lien_evenement
            const parts = eventRef.lien_evenement.split('/');
            eventId = parts[parts.length - 1];
          }
          
          if (!eventId) return null;
          
          // Essayer de convertir en ObjectId, mais ne pas échouer si impossible
          try {
            eventId = new mongoose.Types.ObjectId(eventId);
          } catch (e) {
            // Garder l'ID tel quel si ce n'est pas un ObjectId valide
          }
          
          // Chercher l'événement
          const event = await eventsCollection.findOne({ _id: eventId });
          return event;
        } catch (e) {
          console.log(`Erreur lors de la récupération d'un événement: ${e.message}`);
          return null;
        }
      });
      
      // Attendre que toutes les requêtes se terminent et filtrer les événements null
      const foundEvents = (await Promise.all(eventPromises)).filter(e => e !== null);
      events.push(...foundEvents);
    }
    
    // Ajouter les événements à l'objet producteur
    const producerWithEvents = {
      ...producer,
      evenements: events
    };
    
    // Récupérer les données sociales (followers, etc.)
    try {
      const userDb = mongoose.connection.useDb('choice_app');
      const usersCollection = userDb.collection('Users');
      
      // Rechercher l'utilisateur lié à ce producteur
      const user = await usersCollection.findOne({ leisure_producer_id: id });
      
      if (user) {
        producerWithEvents.user_id = user._id;
        producerWithEvents.followers = user.followers || [];
        producerWithEvents.following = user.following || [];
        producerWithEvents.interestedUsers = user.interests || [];
        producerWithEvents.choiceUsers = user.choices || [];
      }
    } catch (error) {
      console.error('❌ Erreur lors de la récupération des données sociales:', error);
    }
    
    res.status(200).json(producerWithEvents);
  } catch (error) {
    console.error('❌ Erreur lors de la récupération directe du producteur:', error);
    res.status(500).json({ 
      message: 'Erreur serveur (accès direct)', 
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

/**
 * @route GET /api/leisure/event/direct/:id
 * @desc Route de secours qui accède directement à la collection d'événements
 * @access Public
 */
router.get('/event/direct/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'ID d\'événement invalide' });
    }
    
    console.log(`🔍 Route DIRECTE: Recherche de l'événement avec ID: ${id}`);
    
    // Accéder directement à la collection sans passer par le modèle
    const loisirDb = mongoose.connection.useDb('Loisir&Culture');
    const collection = loisirDb.collection('Loisir_Paris_Evenements');
    
    // Rechercher le document directement
    const event = await collection.findOne({ _id: new mongoose.Types.ObjectId(id) });
    
    if (!event) {
      console.log(`❌ Événement non trouvé directement avec l'ID: ${id}`);
      return res.status(404).json({ message: 'Événement non trouvé' });
    }
    
    console.log(`✅ Événement trouvé directement: ${event.intitulé || event.title || 'Titre inconnu'}`);
    
    // Incrémenter le compteur de vues
    try {
      await collection.updateOne(
        { _id: new mongoose.Types.ObjectId(id) },
        { $inc: { views_count: 1 } }
      );
    } catch (e) {
      console.warn('⚠️ Impossible d\'incrémenter le compteur de vues:', e.message);
    }
    
    // Formatage complet pour l'API frontend
    const eventDetails = {
      id: event._id,
      title: event.title || event.intitulé || event.name,
      description: event.description || event.détail,
      category: event.category || event.catégorie,
      subcategory: event.subcategory,
      image: event.image || event.cover_image,
      images: event.images || [],
      location: {
        coordinates: event.location?.coordinates || event.localisation?.coordinates,
        venue: event.venue || event.lieu,
        address: event.address || event.adresse,
        city: event.city,
        postcode: event.postal_code
      },
      date: {
        start: event.start_date || event.date_debut || event.date,
        end: event.end_date || event.date_fin,
        schedule: event.horaires || event.schedule,
        recurring: !!event.recurrence?.is_recurring,
        recurrencePattern: event.recurrence?.pattern,
        allDay: event.allDay || event.isAllDay
      },
      price: {
        amount: event.price?.amount,
        currency: event.price?.currency || '€',
        isFree: event.price?.is_free || event.is_free,
        discount: event.prix_reduit,
        options: event.catégories_prix
      },
      ratings: {
        average: event.rating?.average || event.note,
        count: event.rating?.count || 0,
        breakdown: event.notes_globales || {}
      },
      lineup: event.lineup || [],
      emotions: event.emotions || [],
      organizer: {
        id: event.producerId || event.producer_id,
        name: event.producerName || event.organizer?.name,
        contact: event.organizer_contact || event.organizer?.email,
        website: event.organizer_website || event.organizer?.website
      },
      engagement: {
        views: event.views_count || 0,
        likes: event.likes_count || 0,
        shares: event.shares_count || 0,
        attendees: event.attendees?.length || 0,
        interested: event.interested_count || 0,
        interestedUsers: event.interestedUsers || []
      },
      links: {
        ticket: event.ticket_url || event.purchase_url,
        site: event.site_url || event.url,
        social: event.organizer?.social_media
      },
      tags: event.tags || [],
      accessibility: event.accessibility || [],
      ageRestriction: event.age_restriction,
      familyFriendly: event.family_friendly || false,
      commentaires: event.commentaires || [],
      lastUpdated: event.updated_at || event.updatedAt || event.last_updated
    };
    
    res.status(200).json(eventDetails);
  } catch (error) {
    console.error('❌ Erreur lors de la récupération directe de l\'événement:', error);
    res.status(500).json({ 
      message: 'Erreur serveur (accès direct)', 
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

/**
 * @route GET /api/leisure/events/:id
 * @desc Route de compatibilité pour /api/evenements/:id utilisée dans l'app Flutter
 * @access Public
 */
router.get('/events/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'ID d\'événement invalide' });
    }
    
    console.log(`🔍 Route de compatibilité /evenements: Recherche avec ID: ${id}`);
    
    // Essayer dans différentes collections
    const loisirDb = mongoose.connection.useDb('Loisir&Culture');
    let event = null;
    let collectionUsed = '';
    
    // Essayer d'abord dans Loisir_Paris_Evenements
    try {
      const mainCollection = loisirDb.collection('Loisir_Paris_Evenements');
      event = await mainCollection.findOne({ _id: new mongoose.Types.ObjectId(id) });
      if (event) {
        collectionUsed = 'Loisir_Paris_Evenements';
      }
    } catch (e) {
      console.log(`Erreur lors de la recherche dans Loisir_Paris_Evenements: ${e.message}`);
    }
    
    // Si pas trouvé, essayer dans Evenements_loisirs
    if (!event) {
      try {
        const altCollection = loisirDb.collection('Evenements_loisirs');
        event = await altCollection.findOne({ _id: new mongoose.Types.ObjectId(id) });
        if (event) {
          collectionUsed = 'Evenements_loisirs';
        }
      } catch (e) {
        console.log(`Erreur lors de la recherche dans Evenements_loisirs: ${e.message}`);
      }
    }
    
    // Si toujours pas trouvé, essayer dans Events
    if (!event) {
      try {
        const eventsCollection = loisirDb.collection('Events');
        event = await eventsCollection.findOne({ _id: new mongoose.Types.ObjectId(id) });
        if (event) {
          collectionUsed = 'Events';
        }
      } catch (e) {
        console.log(`Erreur lors de la recherche dans Events: ${e.message}`);
      }
    }
    
    if (!event) {
      return res.status(404).json({ message: 'Événement non trouvé' });
    }
    
    console.log(`✅ Événement trouvé dans la collection: ${collectionUsed}`);
    
    // Si trouvé, incrémentez le compteur de vues
    try {
      if (collectionUsed) {
        const updateCollection = loisirDb.collection(collectionUsed);
        await updateCollection.updateOne(
          { _id: new mongoose.Types.ObjectId(id) },
          { $inc: { views_count: 1 } }
        );
      }
    } catch (e) {
      console.warn('⚠️ Impossible d\'incrémenter le compteur de vues:', e.message);
    }
    
    res.json(event);
  } catch (error) {
    console.error('❌ Erreur lors de la récupération de l\'événement:', error);
    res.status(500).json({ message: 'Erreur serveur', error: error.message });
  }
});

/**
 * @route GET /api/leisure/search-by-artist
 * @desc Rechercher des événements par nom d'artiste
 * @access Public
 */
router.get('/search-by-artist', async (req, res) => {
  try {
    const { artistName } = req.query;
    
    if (!artistName) {
      return res.status(400).json({ message: 'Nom d\'artiste requis' });
    }
    
    console.log(`🔍 Recherche d'événements pour l'artiste: ${artistName}`);
    
    const loisirDb = mongoose.connection.useDb('Loisir&Culture');
    const results = [];
    
    // Collections à vérifier
    const collections = [
      loisirDb.collection('Loisir_Paris_Evenements'),
      loisirDb.collection('Evenements_loisirs'),
      loisirDb.collection('Events')
    ];
    
    // Préparation de la regex pour une recherche insensible à la casse
    const artistRegex = new RegExp(artistName, 'i');
    
    // Effectuer la recherche dans toutes les collections
    for (const collection of collections) {
      try {
        // Rechercher les événements où l'artiste apparaît dans le lineup
        const lineupEvents = await collection.find({
          'lineup.nom': { $regex: artistRegex }
        }).limit(20).toArray();
        
        // Rechercher aussi dans le titre/description de l'événement
        const titleEvents = await collection.find({
          $or: [
            { intitulé: { $regex: artistRegex } },
            { title: { $regex: artistRegex } },
            { détail: { $regex: artistRegex } },
            { description: { $regex: artistRegex } }
          ]
        }).limit(20).toArray();
        
        // Combiner et dédupliquer les résultats
        const combinedEvents = [...lineupEvents, ...titleEvents];
        const eventIds = new Set();
        
        combinedEvents.forEach(event => {
          if (!eventIds.has(event._id.toString())) {
            eventIds.add(event._id.toString());
            results.push(event);
          }
        });
      } catch (e) {
        console.log(`Erreur lors de la recherche dans une collection: ${e.message}`);
      }
    }
    
    console.log(`✅ ${results.length} événements trouvés pour l'artiste: ${artistName}`);
    
    res.json(results);
  } catch (error) {
    console.error('❌ Erreur lors de la recherche par artiste:', error);
    res.status(500).json({ message: 'Erreur serveur', error: error.message });
  }
});

/**
 * @route GET /api/leisure/advanced-search
 * @desc Recherche avancée d'événements par catégorie et émotions
 * @access Public
 */
router.get('/advanced-search', async (req, res) => {
  try {
    const { category, emotions, limit = 20 } = req.query;
    
    console.log(`🔍 Recherche avancée - catégorie: ${category}, émotions: ${emotions}`);
    
    const loisirDb = mongoose.connection.useDb('Loisir&Culture');
    const filters = {};
    
    // Ajouter la catégorie au filtre si fournie
    if (category) {
      filters.$or = [
        { category: { $regex: category, $options: 'i' } },
        { catégorie: { $regex: category, $options: 'i' } }
      ];
    }
    
    // Ajouter les émotions au filtre si fournies
    if (emotions) {
      const emotionList = emotions.split(',').map(e => e.trim());
      if (emotionList.length > 0) {
        filters.emotions = { $in: emotionList.map(e => new RegExp(e, 'i')) };
      }
    }
    
    // Collections à vérifier
    const collections = [
      'Loisir_Paris_Evenements',
      'Evenements_loisirs',
      'Events'
    ];
    
    const allResults = [];
    
    // Effectuer la recherche dans toutes les collections
    for (const collName of collections) {
      try {
        const collection = loisirDb.collection(collName);
        let query = {};
        
        // Si des filtres sont définis, les appliquer
        if (Object.keys(filters).length > 0) {
          query = filters;
        }
        
        const events = await collection.find(query)
          .sort({ date_debut: -1, start_date: -1 })
          .limit(parseInt(limit))
          .toArray();
          
        allResults.push(...events);
      } catch (e) {
        console.log(`Erreur lors de la recherche dans ${collName}: ${e.message}`);
      }
    }
    
    // Dédupliquer les résultats par ID
    const uniqueResults = [];
    const seen = new Set();
    
    allResults.forEach(event => {
      const id = event._id.toString();
      if (!seen.has(id)) {
        seen.add(id);
        uniqueResults.push(event);
      }
    });
    
    // Trier les résultats par pertinence si des émotions sont spécifiées
    if (emotions) {
      uniqueResults.sort((a, b) => {
        const aHasEmotions = Array.isArray(a.emotions) && a.emotions.length > 0;
        const bHasEmotions = Array.isArray(b.emotions) && b.emotions.length > 0;
        
        if (aHasEmotions && !bHasEmotions) return -1;
        if (!aHasEmotions && bHasEmotions) return 1;
        return 0;
      });
    }
    
    console.log(`✅ ${uniqueResults.length} événements trouvés par recherche avancée`);
    
    res.json(uniqueResults);
  } catch (error) {
    console.error('❌ Erreur lors de la recherche avancée:', error);
    res.status(500).json({ message: 'Erreur serveur', error: error.message });
  }
});

/**
 * @route GET /api/leisure/direct/:id
 * @desc Route de secours qui accède directement à la collection Loisir_Paris_Producers
 * @access Public
 */
router.get('/direct/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'ID de producteur invalide' });
    }
    
    console.log(`🔍 Route DIRECTE: Recherche du producteur avec ID: ${id}`);
    
    // Accéder directement à la collection sans passer par le modèle
    const loisirDb = mongoose.connection.useDb('Loisir&Culture');
    const collection = loisirDb.collection('Loisir_Paris_Producers');
    
    // Rechercher le document directement
    const producer = await collection.findOne({ _id: new mongoose.Types.ObjectId(id) });
    
    if (!producer) {
      console.log(`❌ Producteur non trouvé directement avec l'ID: ${id}`);
      return res.status(404).json({ message: 'Producteur de loisir non trouvé' });
    }
    
    console.log(`✅ Producteur trouvé directement: ${producer.lieu || 'Nom inconnu'}`);
    
    // Récupérer les événements associés
    const events = [];
    if (producer.evenements && producer.evenements.length > 0) {
      const eventsCollection = loisirDb.collection('Loisir_Paris_Evenements');
      
      // Tenter de récupérer les événements par leurs IDs
      for (const eventRef of producer.evenements) {
        try {
          // Extraire l'ID de l'événement
          let eventId;
          if (typeof eventRef === 'string') {
            eventId = eventRef;
          } else if (eventRef._id) {
            eventId = eventRef._id;
          } else if (eventRef.lien_evenement) {
            // Format spécial où l'ID est dans un champ lien_evenement
            const parts = eventRef.lien_evenement.split('/');
            eventId = parts[parts.length - 1];
          }
          
          if (!eventId) continue;
          
          // Essayer de convertir en ObjectId, mais ne pas échouer si impossible
          try {
            eventId = new mongoose.Types.ObjectId(eventId);
          } catch (e) {
            // Garder l'ID tel quel si ce n'est pas un ObjectId valide
          }
          
          // Chercher l'événement
          const event = await eventsCollection.findOne({ _id: eventId });
          if (event) {
            events.push(event);
          }
        } catch (e) {
          console.log(`Erreur lors de la récupération d'un événement: ${e.message}`);
        }
      }
    }
    
    // Ajouter les événements à l'objet producteur
    const producerWithEvents = {
      ...producer,
      evenements: events
    };
    
    res.json(producerWithEvents);
  } catch (error) {
    console.error('❌ Erreur détaillée lors de la récupération du producteur (route directe):', error);
    res.status(500).json({ 
      message: 'Erreur serveur', 
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

/**
 * @route GET /api/leisure/producers/:id
 * @desc Route de compatibilité pour /api/producers/leisure/:id utilisée dans l'app Flutter
 * @access Public
 */
router.get('/producers/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'ID de producteur invalide' });
    }
    
    console.log(`🔍 Route de compatibilité /producers/leisure: Recherche avec ID: ${id}`);
    
    // Essayer d'abord dans le modèle LeisureProducer
    let producer = null;
    
    try {
      producer = await LeisureProducer.findById(id);
    } catch (e) {
      console.log(`Erreur lors de la recherche avec le modèle: ${e.message}`);
    }
    
    // Si non trouvé, essayer directement dans la collection
    if (!producer) {
      try {
        const loisirDb = mongoose.connection.useDb('Loisir&Culture');
        const collection = loisirDb.collection('Loisir_Paris_Producers');
        producer = await collection.findOne({ _id: new mongoose.Types.ObjectId(id) });
      } catch (e) {
        console.log(`Erreur lors de la recherche directe: ${e.message}`);
      }
    }
    
    if (!producer) {
      return res.status(404).json({ message: 'Producteur de loisir non trouvé' });
    }
    
    console.log(`✅ Producteur trouvé: ${producer.lieu || producer.name || 'Nom inconnu'}`);
    
    // Formater la réponse
    const result = producer instanceof mongoose.Model ? producer.toObject() : producer;
    
    res.json(result);
  } catch (error) {
    console.error('❌ Erreur lors de la récupération du producteur:', error);
    res.status(500).json({ message: 'Erreur serveur', error: error.message });
  }
});

// GET /api/leisure/posts - Obtenir les posts liés aux loisirs
router.get('/posts', async (req, res) => {
  try {
    const { userId, limit = 10, page = 1 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Construire la requête pour les posts de loisir avec tous les formats possibles
    const query = {
      $or: [
        { producer_type: 'leisure' },
        { type: 'leisure' },
        { isLeisurePost: true },
        // Cas où le post est lié à un événement de loisir
        { event_id: { $exists: true } }
      ]
    };
    
    // Récupérer les posts avec pagination
    const posts = await Post.find(query)
      .sort({ posted_at: -1 })
      .skip(skip)
      .limit(parseInt(limit));
    
    // Normaliser les posts pour assurer une structure cohérente
    const normalizedPosts = posts.map(post => {
      // Conversion en objet pour la manipulation
      const postObj = post instanceof mongoose.Model ? post.toObject() : post;
      
      // Assurer un format cohérent pour tous les champs
      return {
        ...postObj,
        // Assurer que media est toujours un tableau
        media: Array.isArray(postObj.media) ? postObj.media : 
               (postObj.media ? [postObj.media] : []),
        // Assurer que content est présent (peut être nommé text dans certains formats)
        content: postObj.content || postObj.text || '',
        // Assurer que title est présent
        title: postObj.title || '',
        // Assurer que tags est toujours un tableau
        tags: Array.isArray(postObj.tags) ? postObj.tags : 
              (postObj.tags ? [postObj.tags] : []),
        // Assurer que la structure des commentaires est présente
        comments: postObj.comments || [],
        // Assurer que la structure des likes est présente
        likes: postObj.likes || [],
        // Assurer que la structure des choix est présente
        choices: postObj.choices || []
      };
    });
    
    const total = await Post.countDocuments(query);
    
    res.status(200).json({
      posts: normalizedPosts,
      totalPages: Math.ceil(total / parseInt(limit)),
      currentPage: parseInt(page),
      total
    });
  } catch (error) {
    console.error('❌ Erreur lors de la récupération des posts de loisir:', error);
    res.status(500).json({ 
      message: 'Erreur lors de la récupération des posts de loisir', 
      error: error.message 
    });
  }
});

/**
 * @route GET /api/leisure/producer/:id/events
 * @desc Récupérer tous les événements d'un producteur (redirection vers l'API events)
 * @access Public
 */
router.get('/producer/:id/events', async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'ID de producteur invalide' });
    }
    
    // Rediriger vers l'endpoint existant dans events.js
    // Utiliser le modèle Event du module principal
    const Event = require('../models/event')(mongoose.connection);
    
    // Rechercher par ID de producteur (compatible avec plusieurs formats)
    const events = await Event.find({
      $or: [
        { producerId: id },
        { producer_id: id },
        { 'organizer.id': id }
      ]
    }).sort({ start_date: -1, date_debut: -1 });
    
    res.status(200).json(events);
  } catch (error) {
    console.error('❌ Erreur lors de la récupération des événements:', error);
    res.status(500).json({ message: 'Erreur serveur', error: error.message });
  }
});

/**
 * @route POST /api/leisure/producer/:id/photo
 * @desc Mettre à jour la photo de profil d'un producteur
 * @access Private
 */
router.post('/producer/:id/photo', authenticateJWT, async (req, res) => {
  try {
    const { id } = req.params;
    const { photo, photo_url } = req.body;
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'ID de producteur invalide' });
    }
    
    // Vérifier que l'utilisateur a le droit de modifier ce producteur
    const user = await User.findById(req.user.id);
    
    if (!user || (user.leisure_producer_id !== id && user.role !== 'admin')) {
      return res.status(403).json({ message: 'Non autorisé à modifier ce producteur' });
    }
    
    // Choisir la valeur à utiliser (photo ou photo_url)
    const photoToUse = photo || photo_url;
    
    if (!photoToUse) {
      return res.status(400).json({ message: 'Photo requise' });
    }
    
    // Mettre à jour la photo
    const updatedProducer = await LeisureProducer.findByIdAndUpdate(
      id,
      { $set: { photo: photoToUse } },
      { new: true }
    );
    
    if (!updatedProducer) {
      return res.status(404).json({ message: 'Producteur non trouvé' });
    }
    
    res.status(200).json({ message: 'Photo mise à jour avec succès', producer: updatedProducer });
  } catch (error) {
    console.error('❌ Erreur lors de la mise à jour de la photo:', error);
    res.status(500).json({ message: 'Erreur serveur', error: error.message });
  }
});

/**
 * @route POST /api/leisure/producer/:id/update-items
 * @desc Mettre à jour les informations des items d'un producteur (ex: appliquer une réduction)
 * @access Private
 */
router.post('/producer/:id/update-items', authenticateJWT, async (req, res) => {
  try {
    const { id } = req.params;
    const { structured_data } = req.body;
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'ID de producteur invalide' });
    }
    
    // Vérifier que l'utilisateur a le droit de modifier ce producteur
    const user = await User.findById(req.user.id);
    
    if (!user || (user.leisure_producer_id !== id && user.role !== 'admin')) {
      return res.status(403).json({ message: 'Non autorisé à modifier ce producteur' });
    }
    
    // Mettre à jour les données structurées
    const updatedProducer = await LeisureProducer.findByIdAndUpdate(
      id,
      { $set: { structured_data } },
      { new: true }
    );
    
    if (!updatedProducer) {
      return res.status(404).json({ message: 'Producteur non trouvé' });
    }
    
    res.status(200).json({ message: 'Données mises à jour avec succès', producer: updatedProducer });
  } catch (error) {
    console.error('❌ Erreur lors de la mise à jour des données:', error);
    res.status(500).json({ message: 'Erreur serveur', error: error.message });
  }
});

/**
 * @route GET /api/leisure/producer/:id/posts
 * @desc Récupérer les posts liés à un producteur de loisir
 * @access Public
 */
router.get('/producer/:id/posts', async (req, res) => {
  try {
    const { id } = req.params;
    const { limit = 10, page = 1 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Construire la requête pour les posts de ce producteur spécifique
    // Compatible avec toutes les structures de posts identifiées
    const query = {
      $or: [
        { producer_id: id },
        { producerId: id },
        { venue_id: id },
        { venueId: id },
        { referenced_producer_id: id },
        { referenced_venue_id: id },
        // Cas où le post est lié à un événement organisé par ce producteur
        { 
          $and: [
            { event_id: { $exists: true } },
            { producer_id: id }
          ]
        }
      ]
    };
    
    // Récupérer les posts avec pagination
    const posts = await Post.find(query)
      .sort({ posted_at: -1, createdAt: -1 }) // Prend en compte les deux formats de date
      .skip(skip)
      .limit(parseInt(limit));
    
    // Normaliser les posts pour assurer une structure cohérente
    const normalizedPosts = posts.map(post => {
      // Conversion en objet pour la manipulation
      const postObj = post instanceof mongoose.Model ? post.toObject() : post;
      
      // Assurer un format cohérent pour tous les champs
      return {
        ...postObj,
        // Assurer que media est toujours un tableau
        media: Array.isArray(postObj.media) ? postObj.media : 
               (postObj.media ? [postObj.media] : []),
        // Assurer que content est présent (peut être nommé text dans certains formats)
        content: postObj.content || postObj.text || '',
        // Assurer que title est présent
        title: postObj.title || '',
        // Assurer que tags est toujours un tableau
        tags: Array.isArray(postObj.tags) ? postObj.tags : 
              (postObj.tags ? [postObj.tags] : []),
        // Assurer que la structure de location est présente
        location: postObj.location || null,
        // Assurer que producer_type est présent (pour coloration visuelle)
        producer_type: postObj.producer_type || 'leisure',
        // Assurer que la date est présente dans un format cohérent
        posted_at: postObj.posted_at || postObj.createdAt || new Date(),
        // Assurer que les structures sociales sont présentes
        comments: postObj.comments || [],
        likes: postObj.likes || [],
        choices: postObj.choices || []
      };
    });
    
    const total = await Post.countDocuments(query);
    
    res.status(200).json({
      posts: normalizedPosts,
      totalPages: Math.ceil(total / parseInt(limit)),
      currentPage: parseInt(page),
      total
    });
  } catch (error) {
    console.error('❌ Erreur lors de la récupération des posts du producteur:', error);
    res.status(500).json({ 
      message: 'Erreur lors de la récupération des posts du producteur', 
      error: error.message 
    });
  }
});

/**
 * Routes alias pour la compatibilité avec le frontend
 */

// Alias pour la route producer/:id
router.get('/leisureProducers/:id', async (req, res) => {
  try {
    // Rediriger vers la route principale
    const { id } = req.params;
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'ID de producteur invalide' });
    }
    
    // Essayer de trouver le producteur dans la collection Loisir_Paris_Producers
    const producer = await LeisureProducer.findById(id);
    
    if (!producer) {
      return res.status(404).json({ message: 'Producteur de loisir non trouvé' });
    }
    
    res.status(200).json(producer);
  } catch (error) {
    console.error('❌ Erreur lors de la récupération du producteur (alias):', error);
    res.status(500).json({ message: 'Erreur serveur', error: error.message });
  }
});

// Alias pour la route producer/:id/photo
router.post('/leisureProducers/:id/photo', authenticateJWT, async (req, res) => {
  try {
    // Rediriger vers la route principale
    const { id } = req.params;
    const { photo, photo_url } = req.body;
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'ID de producteur invalide' });
    }
    
    // Vérifier que l'utilisateur a le droit de modifier ce producteur
    const user = await User.findById(req.user.id);
    
    if (!user || (user.leisure_producer_id !== id && user.role !== 'admin')) {
      return res.status(403).json({ message: 'Non autorisé à modifier ce producteur' });
    }
    
    // Choisir la valeur à utiliser (photo ou photo_url)
    const photoToUse = photo || photo_url;
    
    if (!photoToUse) {
      return res.status(400).json({ message: 'Photo requise' });
    }
    
    // Mettre à jour la photo
    const updatedProducer = await LeisureProducer.findByIdAndUpdate(
      id,
      { $set: { photo: photoToUse } },
      { new: true }
    );
    
    if (!updatedProducer) {
      return res.status(404).json({ message: 'Producteur non trouvé' });
    }
    
    res.status(200).json({ message: 'Photo mise à jour avec succès', producer: updatedProducer });
  } catch (error) {
    console.error('❌ Erreur lors de la mise à jour de la photo (alias):', error);
    res.status(500).json({ message: 'Erreur serveur', error: error.message });
  }
});

// Alias pour la route venues/:id/photo
router.post('/venues/:id/photo', authenticateJWT, async (req, res) => {
  // Rediriger vers la route de mise à jour de photo du producteur
  try {
    const { id } = req.params;
    const { photo, photo_url } = req.body;
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'ID de lieu invalide' });
    }
    
    // Vérifier que l'utilisateur a le droit de modifier ce lieu
    const user = await User.findById(req.user.id);
    
    if (!user || (user.leisure_producer_id !== id && user.role !== 'admin')) {
      return res.status(403).json({ message: 'Non autorisé à modifier ce lieu' });
    }
    
    // Choisir la valeur à utiliser (photo ou photo_url)
    const photoToUse = photo || photo_url;
    
    if (!photoToUse) {
      return res.status(400).json({ message: 'Photo requise' });
    }
    
    // Mettre à jour la photo
    const updatedProducer = await LeisureProducer.findByIdAndUpdate(
      id,
      { $set: { photo: photoToUse } },
      { new: true }
    );
    
    if (!updatedProducer) {
      return res.status(404).json({ message: 'Lieu non trouvé' });
    }
    
    res.status(200).json({ message: 'Photo mise à jour avec succès', venue: updatedProducer });
  } catch (error) {
    console.error('❌ Erreur lors de la mise à jour de la photo du lieu:', error);
    res.status(500).json({ message: 'Erreur serveur', error: error.message });
  }
});

// Alias pour la route producer/:id/events
router.get('/producers/:id/events', async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'ID de producteur invalide' });
    }
    
    // Rediriger vers l'endpoint existant dans events.js
    // Utiliser le modèle Event du module principal
    const Event = require('../models/event')(mongoose.connection);
    
    // Rechercher par ID de producteur (compatible avec plusieurs formats)
    const events = await Event.find({
      $or: [
        { producerId: id },
        { producer_id: id },
        { 'organizer.id': id }
      ]
    }).sort({ start_date: -1, date_debut: -1 });
    
    res.status(200).json(events);
  } catch (error) {
    console.error('❌ Erreur lors de la récupération des événements (alias):', error);
    res.status(500).json({ message: 'Erreur serveur', error: error.message });
  }
});

/**
 * @route GET /api/leisure/artists
 * @desc Récupérer la liste des artistes/lineup disponibles dans les événements
 * @access Public
 */
router.get('/artists', async (req, res) => {
  try {
    console.log('🔍 Récupération de la liste des artistes disponibles');
    
    const loisirDb = mongoose.connection.useDb('Loisir&Culture');
    const collection = loisirDb.collection('Loisir_Paris_Evenements');
    
    // Extraction des noms d'artistes à partir du champ 'lineup'
    const artistsFromLineup = await collection.aggregate([
      { $match: { lineup: { $exists: true, $ne: [] } } },
      { $unwind: '$lineup' },
      { $match: { 'lineup.nom': { $exists: true, $ne: null } } },
      { $group: { _id: '$lineup.nom' } },
      { $match: { _id: { $ne: null, $ne: '' } } },
      { $sort: { _id: 1 } }
    ]).toArray();
    
    // Collecte de noms d'artistes à partir d'autres formats possibles
    const otherArtistsFormats = await collection.aggregate([
      { 
        $match: { 
          $or: [
            { performers: { $exists: true, $ne: [] } },
            { artists: { $exists: true, $ne: [] } },
            { intervenants: { $exists: true, $ne: [] } }
          ] 
        } 
      },
      { 
        $project: {
          all_artists: { 
            $concatArrays: [
              { $ifNull: [{ $cond: { if: { $isArray: '$performers' }, then: '$performers', else: [] } }, []] },
              { $ifNull: [{ $cond: { if: { $isArray: '$artists' }, then: '$artists', else: [] } }, []] },
              { $ifNull: [{ $cond: { if: { $isArray: '$intervenants' }, then: '$intervenants', else: [] } }, []] }
            ]
          }
        }
      },
      { $unwind: '$all_artists' },
      { 
        $project: {
          artist_name: { 
            $cond: { 
              if: { $type: '$all_artists' }, 
              then: { 
                $cond: { 
                  if: { $eq: [{ $type: '$all_artists' }, 'object'] }, 
                  then: { $ifNull: ['$all_artists.name', '$all_artists.nom'] }, 
                  else: '$all_artists' 
                } 
              }, 
              else: '$all_artists' 
            } 
          }
        }
      },
      { $match: { artist_name: { $ne: null, $ne: '' } } },
      { $group: { _id: '$artist_name' } },
      { $sort: { _id: 1 } }
    ]).toArray();
    
    // Combiner et dédupliquer les résultats
    const lineupArtists = artistsFromLineup.map(item => item._id);
    const otherArtists = otherArtistsFormats.map(item => item._id);
    
    const allArtists = [...new Set([...lineupArtists, ...otherArtists])];
    
    // Limiter à 100 artistes maximum pour éviter des réponses trop volumineuses
    const limitedArtists = allArtists.slice(0, 100);
    
    console.log(`✅ ${limitedArtists.length} artistes trouvés`);
    res.json(limitedArtists);
  } catch (error) {
    console.error('❌ Erreur lors de la récupération des artistes:', error);
    res.status(500).json({ message: 'Erreur serveur', error: error.message });
  }
});

/**
 * @route GET /api/leisure/lineup/:artistName
 * @desc Récupérer les événements d'un artiste spécifique
 * @access Public
 */
router.get('/lineup/:artistName', async (req, res) => {
  try {
    const { artistName } = req.params;
    
    if (!artistName) {
      return res.status(400).json({ message: 'Nom d\'artiste requis' });
    }
    
    console.log(`🔍 Recherche d'événements pour l'artiste: ${artistName}`);
    
    const loisirDb = mongoose.connection.useDb('Loisir&Culture');
    const artistRegex = new RegExp(artistName, 'i');
    
    // Recherche dans la collection principale
    const events = await loisirDb.collection('Loisir_Paris_Evenements').find({
      $or: [
        { 'lineup.nom': artistRegex },
        { 'performers.name': artistRegex },
        { 'artists': artistRegex },
        { intitulé: artistRegex },
        { title: artistRegex }
      ]
    }).limit(30).toArray();
    
    console.log(`✅ ${events.length} événements trouvés pour l'artiste: ${artistName}`);
    
    res.status(200).json(events);
  } catch (error) {
    console.error('❌ Erreur lors de la recherche d\'événements par artiste:', error);
    res.status(500).json({ message: 'Erreur serveur', error: error.message });
  }
});

/**
 * @route GET /api/leisure/horaires
 * @desc Récupérer les plages horaires disponibles pour les événements
 * @access Public
 */
router.get('/horaires', async (req, res) => {
  try {
    console.log('🔍 Récupération des plages horaires disponibles');
    
    const loisirDb = mongoose.connection.useDb('Loisir&Culture');
    const collection = loisirDb.collection('Loisir_Paris_Evenements');
    
    // Extraction des heures à partir du format horaires[]
    const formattedHours = await collection.aggregate([
      { $match: { horaires: { $exists: true, $ne: [] } } },
      { $unwind: '$horaires' },
      { $match: { 'horaires.heure': { $exists: true, $ne: null } } },
      { $group: { _id: '$horaires.heure' } },
      { $sort: { _id: 1 } }
    ]).toArray();
    
    // Formatage des résultats
    const timeSlots = formattedHours.map(item => item._id)
      .filter(time => time && typeof time === 'string');
    
    // Trier par heure (en utilisant un regex pour extraire les heures)
    timeSlots.sort((a, b) => {
      const hourA = a.match(/(\d+)h/) ? parseInt(a.match(/(\d+)h/)[1]) : 0;
      const hourB = b.match(/(\d+)h/) ? parseInt(b.match(/(\d+)h/)[1]) : 0;
      return hourA - hourB;
    });
    
    console.log(`✅ ${timeSlots.length} plages horaires trouvées`);
    res.json(timeSlots);
  } catch (error) {
    console.error('❌ Erreur lors de la récupération des plages horaires:', error);
    res.status(500).json({ message: 'Erreur serveur', error: error.message });
  }
});

/**
 * @route GET /api/leisure/jours
 * @desc Récupérer les jours de la semaine disponibles pour les événements
 * @access Public
 */
router.get('/jours', async (req, res) => {
  try {
    console.log('🔍 Récupération des jours disponibles');
    
    const loisirDb = mongoose.connection.useDb('Loisir&Culture');
    const collection = loisirDb.collection('Loisir_Paris_Evenements');
    
    // Extraction des jours à partir du format horaires[]
    const formattedDays = await collection.aggregate([
      { $match: { horaires: { $exists: true, $ne: [] } } },
      { $unwind: '$horaires' },
      { $match: { 'horaires.jour': { $exists: true, $ne: null } } },
      { $group: { _id: '$horaires.jour' } },
      { $sort: { _id: 1 } }
    ]).toArray();
    
    // Récupérer et normaliser les jours
    const days = formattedDays.map(item => item._id)
      .filter(day => day && typeof day === 'string')
      .map(day => day.toLowerCase())
      .filter(day => day !== '');
    
    // Normaliser les jours de la semaine
    const normalizedDays = [];
    const dayMapping = {
      'lundi': 0, 'monday': 0, 
      'mardi': 1, 'tuesday': 1, 
      'mercredi': 2, 'wednesday': 2, 
      'jeudi': 3, 'thursday': 3, 
      'vendredi': 4, 'friday': 4, 
      'samedi': 5, 'saturday': 5, 
      'dimanche': 6, 'sunday': 6
    };
    
    // Créer un tableau qui contient les jours en français
    const sortedDays = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
    
    // Vérifier quels jours sont présents dans la collection
    for (const day of days) {
      for (const [key, value] of Object.entries(dayMapping)) {
        if (day.includes(key)) {
          normalizedDays.push(sortedDays[value]);
          break;
        }
      }
    }
    
    // Dédupliquer et trier
    const uniqueDays = [...new Set(normalizedDays)];
    
    // Trier selon l'ordre des jours de la semaine
    uniqueDays.sort((a, b) => {
      return sortedDays.indexOf(a) - sortedDays.indexOf(b);
    });
    
    console.log(`✅ ${uniqueDays.length} jours trouvés`);
    res.json(uniqueDays);
  } catch (error) {
    console.error('❌ Erreur lors de la récupération des jours:', error);
    res.status(500).json({ message: 'Erreur serveur', error: error.message });
  }
});

/**
 * @route GET /api/leisure/price-ranges
 * @desc Récupérer les plages de prix disponibles pour les événements
 * @access Public
 */
router.get('/price-ranges', async (req, res) => {
  try {
    console.log('🔍 Récupération des plages de prix disponibles');
    
    const loisirDb = mongoose.connection.useDb('Loisir&Culture');
    const collection = loisirDb.collection('Loisir_Paris_Evenements');
    
    // Analyse des prix dans différents formats
    const prices = await collection.aggregate([
      { 
        $project: {
          numerical_price: {
            $cond: [
              { $ifNull: ["$price_amount", false] },
              "$price_amount",
              {
                $cond: [
                  { $ifNull: ["$prix_reduit", false] },
                  {
                    $replaceAll: {
                      input: "$prix_reduit",
                      find: "€",
                      replacement: ""
                    }
                  },
                  null
                ]
              }
            ]
          }
        }
      },
      { $match: { numerical_price: { $ne: null } } },
      { 
        $group: {
          _id: null,
          min_price: { $min: { $toDouble: "$numerical_price" } },
          max_price: { $max: { $toDouble: "$numerical_price" } },
          prices: { $addToSet: { $toDouble: "$numerical_price" } }
        }
      }
    ]).toArray();
    
    if (prices.length === 0) {
      // Valeurs par défaut si aucun prix n'est trouvé
      return res.json({
        min_price: 0,
        max_price: 100,
        price_ranges: [
          { min: 0, max: 20, label: "0€ - 20€" },
          { min: 20, max: 50, label: "20€ - 50€" },
          { min: 50, max: 100, label: "50€ - 100€" },
          { min: 100, max: null, label: "100€ et plus" }
        ]
      });
    }
    
    // Récupérer les valeurs min/max
    const minPrice = Math.floor(prices[0].min_price);
    const maxPrice = Math.ceil(prices[0].max_price);
    
    // Créer des plages de prix pertinentes
    const priceRanges = [];
    
    // Prix gratuit ou très bas
    if (minPrice <= 10) {
      priceRanges.push({ min: 0, max: 10, label: "0€ - 10€" });
    }
    
    // Prix bas
    if (minPrice <= 20 && maxPrice > 10) {
      priceRanges.push({ min: 10, max: 20, label: "10€ - 20€" });
    }
    
    // Prix moyen-bas
    if (minPrice <= 35 && maxPrice > 20) {
      priceRanges.push({ min: 20, max: 35, label: "20€ - 35€" });
    }
    
    // Prix moyen
    if (minPrice <= 50 && maxPrice > 35) {
      priceRanges.push({ min: 35, max: 50, label: "35€ - 50€" });
    }
    
    // Prix moyen-haut
    if (minPrice <= 75 && maxPrice > 50) {
      priceRanges.push({ min: 50, max: 75, label: "50€ - 75€" });
    }
    
    // Prix haut
    if (minPrice <= 100 && maxPrice > 75) {
      priceRanges.push({ min: 75, max: 100, label: "75€ - 100€" });
    }
    
    // Prix très haut
    if (maxPrice > 100) {
      priceRanges.push({ min: 100, max: null, label: "100€ et plus" });
    }
    
    console.log(`✅ ${priceRanges.length} plages de prix générées`);
    res.json({
      min_price: minPrice,
      max_price: maxPrice,
      price_ranges: priceRanges
    });
  } catch (error) {
    console.error('❌ Erreur lors de la récupération des plages de prix:', error);
    res.status(500).json({ message: 'Erreur serveur', error: error.message });
  }
});

/**
 * @route GET /api/leisure/search-by-category/:category
 * @desc Rechercher des événements par catégorie
 * @access Public
 */
router.get('/search-by-category/:category', async (req, res) => {
  try {
    const { category } = req.params;
    const { limit = 20 } = req.query;
    
    if (!category) {
      return res.status(400).json({ message: 'Catégorie requise' });
    }
    
    console.log(`🔍 Recherche d'événements pour la catégorie: ${category}`);
    
    const loisirDb = mongoose.connection.useDb('Loisir&Culture');
    const collection = loisirDb.collection('Loisir_Paris_Evenements');
    
    const categoryRegex = new RegExp(category, 'i');
    
    // Recherche par catégorie
    const events = await collection.find({
      $or: [
        { catégorie: categoryRegex },
        { category: categoryRegex },
        { catégorie_principale: categoryRegex },
        { subcategory: categoryRegex },
        { catégorie_originale: categoryRegex }
      ]
    }).limit(parseInt(limit)).toArray();
    
    console.log(`✅ ${events.length} événements trouvés pour la catégorie: ${category}`);
    
    res.status(200).json(events);
  } catch (error) {
    console.error('❌ Erreur lors de la recherche par catégorie:', error);
    res.status(500).json({ message: 'Erreur serveur', error: error.message });
  }
});

/**
 * @route POST /api/leisure/event/:id/rating
 * @desc Noter un événement
 * @access Private
 */
router.post('/event/:id/rating', authenticateJWT, async (req, res) => {
  try {
    const { id } = req.params;
    const { overall_rating, criteria_ratings } = req.body;
    const userId = req.user.id;
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'ID d\'événement invalide' });
    }
    
    if (overall_rating === undefined || overall_rating < 0 || overall_rating > 5) {
      return res.status(400).json({ message: 'Note globale requise (entre 0 et 5)' });
    }
    
    const loisirDb = mongoose.connection.useDb('Loisir&Culture');
    const collection = loisirDb.collection('Loisir_Paris_Evenements');
    
    // Vérifier si l'événement existe
    const event = await collection.findOne({ _id: new mongoose.Types.ObjectId(id) });
    
    if (!event) {
      return res.status(404).json({ message: 'Événement non trouvé' });
    }
    
    // Préparer l'opération de mise à jour
    const updateOperations = {
      $push: {
        ratings: {
          userId,
          overall: overall_rating,
          criteria: criteria_ratings || {},
          timestamp: new Date()
        }
      }
    };
    
    // Mise à jour des compteurs et moyennes
    if (!event.rating) {
      event.rating = { average: 0, count: 0 };
    }
    
    const newCount = (event.rating.count || 0) + 1;
    const newAverage = ((event.rating.average || 0) * (event.rating.count || 0) + overall_rating) / newCount;
    
    updateOperations.$set = {
      'rating.average': newAverage,
      'rating.count': newCount,
      'note': newAverage // Pour compatibilité avec l'ancien format
    };
    
    // Mise à jour des notes par critère si fournies
    if (criteria_ratings && Object.keys(criteria_ratings).length > 0) {
      // S'assurer que notes_globales existe
      if (!event.notes_globales) {
        event.notes_globales = {};
      }
      
      // Mettre à jour chaque critère
      for (const [criterion, rating] of Object.entries(criteria_ratings)) {
        if (rating >= 0 && rating <= 5) {
          const criterionData = event.notes_globales[criterion] || { total: 0, count: 0, average: 0 };
          const newCriterionCount = criterionData.count + 1;
          const newCriterionAverage = (criterionData.total + rating) / newCriterionCount;
          
          updateOperations.$set[`notes_globales.${criterion}`] = {
            total: criterionData.total + rating,
            count: newCriterionCount,
            average: newCriterionAverage
          };
        }
      }
    }
    
    // Effectuer la mise à jour
    await collection.updateOne(
      { _id: new mongoose.Types.ObjectId(id) },
      updateOperations
    );
    
    res.status(200).json({ 
      message: 'Note ajoutée avec succès',
      new_rating: {
        average: newAverage,
        count: newCount
      }
    });
  } catch (error) {
    console.error('❌ Erreur lors de la notation de l\'événement:', error);
    res.status(500).json({ message: 'Erreur serveur', error: error.message });
  }
});

/**
 * @route GET /api/leisure/search-events
 * @desc Recherche avancée d'événements avec pagination
 * @access Public
 */
router.get('/search-events', async (req, res) => {
  try {
    const {
      keyword,
      category,
      emotions,
      dateStart,
      dateEnd,
      minPrice,
      maxPrice,
      lineup,
      latitude,
      longitude,
      radius,
      sortBy = 'date',
      page = 1,
      limit = 20
    } = req.query;
    
    console.log(`🔍 Recherche avancée d'événements: ${keyword || 'Tous'}`);
    
    const loisirDb = mongoose.connection.useDb('Loisir&Culture');
    const collection = loisirDb.collection('Loisir_Paris_Evenements');
    
    // Construire la requête de recherche
    const query = {};
    
    // Ajouter le filtre de texte
    if (keyword) {
      query.$or = [
        { intitulé: { $regex: keyword, $options: 'i' } },
        { title: { $regex: keyword, $options: 'i' } },
        { détail: { $regex: keyword, $options: 'i' } },
        { description: { $regex: keyword, $options: 'i' } },
        { lieu: { $regex: keyword, $options: 'i' } },
        { venue: { $regex: keyword, $options: 'i' } }
      ];
    }
    
    // Filtrer par catégorie
    if (category) {
      query.$or = query.$or || [];
      query.$or.push(
        { catégorie: { $regex: category, $options: 'i' } },
        { category: { $regex: category, $options: 'i' } }
      );
    }
    
    // Filtrer par émotions
    if (emotions) {
      const emotionsList = emotions.split(',');
      if (emotionsList.length > 0) {
        query.emotions = { $in: emotionsList.map(e => new RegExp(e, 'i')) };
      }
    }
    
    // Filtrer par dates
    if (dateStart || dateEnd) {
      query.$or = query.$or || [];
      
      if (dateStart) {
        // Convertir en Date si c'est au format ISO
        let startDate;
        if (dateStart.includes('-')) {
          startDate = new Date(dateStart);
        } else if (dateStart.includes('/')) {
          const [day, month, year] = dateStart.split('/');
          startDate = new Date(`${year}-${month}-${day}`);
        }
        
        if (startDate && !isNaN(startDate.getTime())) {
          query.$or.push(
            { start_date: { $gte: startDate } },
            { date: { $gte: startDate } },
            { date_debut: { $regex: dateStart } },
            { startDate: { $gte: startDate } }
          );
        }
      }
      
      if (dateEnd) {
        // Convertir en Date si c'est au format ISO
        let endDate;
        if (dateEnd.includes('-')) {
          endDate = new Date(dateEnd);
        } else if (dateEnd.includes('/')) {
          const [day, month, year] = dateEnd.split('/');
          endDate = new Date(`${year}-${month}-${day}`);
        }
        
        if (endDate && !isNaN(endDate.getTime())) {
          query.$or.push(
            { end_date: { $lte: endDate } },
            { date: { $lte: endDate } },
            { date_fin: { $regex: dateEnd } },
            { endDate: { $lte: endDate } }
          );
        }
      }
    }
    
    // Filtrer par prix
    if (minPrice || maxPrice) {
      query.$or = query.$or || [];
      
      const priceCondition = {};
      if (minPrice) priceCondition.$gte = parseFloat(minPrice);
      if (maxPrice) priceCondition.$lte = parseFloat(maxPrice);
      
      query.$or.push(
        { price_amount: priceCondition },
        { 'price.amount': priceCondition }
      );
    }
    
    // Filtrer par lineup
    if (lineup) {
      query.$or = query.$or || [];
      const artistRegex = new RegExp(lineup, 'i');
      
      query.$or.push(
        { 'lineup.nom': artistRegex },
        { artists: artistRegex },
        { 'performers.name': artistRegex }
      );
    }
    
    // Filtrer par localisation si les coordonnées sont fournies
    if (latitude && longitude && radius) {
      query.location = {
        $geoWithin: {
          $centerSphere: [
            [parseFloat(longitude), parseFloat(latitude)],
            parseFloat(radius) / 6378137
          ]
        }
      };
    }
    
    // Calculer le nombre total de résultats
    const total = await collection.countDocuments(query);
    
    // Définir le tri
    let sort = {};
    switch (sortBy) {
      case 'date':
        sort = { date_debut: 1, start_date: 1, date: 1 };
        break;
      case 'popularity':
        sort = { popularity_score: -1, interest_count: -1, views_count: -1 };
        break;
      case 'rating':
        sort = { note: -1, 'rating.average': -1 };
        break;
      case 'price':
        sort = { price_amount: 1, 'price.amount': 1 };
        break;
      default:
        sort = { date_debut: 1 };
    }
    
    // Calculer le skip pour la pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Exécuter la requête
    const events = await collection.find(query)
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit))
      .toArray();
    
    console.log(`✅ ${events.length} événements trouvés (total: ${total})`);
    
    res.status(200).json({
      events,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('❌ Erreur lors de la recherche avancée d\'événements:', error);
    res.status(500).json({ message: 'Erreur serveur', error: error.message });
  }
});

module.exports = router; 
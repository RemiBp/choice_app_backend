const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Conversation = require('../models/conversation'); // Import du modèle Conversation
const LeisureProducer = require('../models/leisureProducer');
const auth = require('../middleware/auth');

// Connexion à la base Loisir&Culture pour les routes qui utilisent directement MongoDB
let loisirDb;

// Cette fonction sera appelée une fois que la connexion MongoDB sera établie
const initialize = (db) => {
  loisirDb = db;
  
  // Collections où peuvent se trouver les producteurs de loisirs
  const producerCollections = [
    'producers',
    'Loisir_Paris_Producers',
    'Paris_Loisirs'
  ];
  
  // Événements
  const eventCollections = [
    'Loisir_Paris_Evenements',
    'Evenements_loisirs'
  ];
  
  // Définir les modèles après vérification de la disponibilité des collections
  const verifyAndInitializeModels = async () => {
    // Obtenir la liste des collections disponibles
    const collections = await loisirDb.db.listCollections().toArray();
    const collectionNames = collections.map(c => c.name);
    console.log('📊 Collections disponibles dans Loisir&Culture:', collectionNames.join(', '));
    
    // Trouver les collections réelles pour les producteurs et événements
    let producerCollection = producerCollections.find(name => collectionNames.includes(name));
    let eventCollection = eventCollections.find(name => collectionNames.includes(name));
    
    // Si aucune collection correspondante n'est trouvée, utiliser les valeurs par défaut
    if (!producerCollection) {
      console.warn('⚠️ Aucune collection de producteurs reconnue, utilisation de "producers" par défaut');
      producerCollection = 'producers';
    }
    
    if (!eventCollection) {
      console.warn('⚠️ Aucune collection d\'événements reconnue, utilisation de "Loisir_Paris_Evenements" par défaut');
      eventCollection = 'Loisir_Paris_Evenements';
    }
    
    console.log(`✅ Utilisation des collections: ${producerCollection} pour les producteurs, ${eventCollection} pour les événements`);
    
    // Initialiser les modèles avec les collections correctes
    const LeisureProducerModel = loisirDb.model(
      'LeisureProducer',
      new mongoose.Schema({}, { strict: false }),
      producerCollection // Utiliser la collection détectée
    );
    
    const Event = loisirDb.model(
      'Event',
      new mongoose.Schema({}, { strict: false }),
      eventCollection // Utiliser la collection détectée
    );
    
    // Stocker les modèles dans l'objet router pour les rendre accessibles
    router.LeisureProducerModel = LeisureProducerModel;
    router.Event = Event;
    
    console.log('✅ Modèles initialisés avec succès!');
  };
  
  // Exécuter l'initialisation asynchrone
  verifyAndInitializeModels().catch(err => {
    console.error('❌ Erreur lors de l\'initialisation des modèles:', err);
  });
};

/**
 * Middleware pour normaliser les données d'un producteur de loisirs
 * Assure que les champs comme category, activities sont correctement formatés
 */
const normalizeLeisureProducerData = (producer) => {
  if (!producer) return null;
  
  const normalizedData = { ...producer };
  
  // Assurer que les tableaux sont bien des tableaux
  const arrayFields = ['category', 'activities', 'specialties', 'photos', 'types', 'followers', 'evenements'];
  
  arrayFields.forEach(field => {
    // Si le champ existe
    if (normalizedData[field] !== undefined) {
      // Si c'est une chaîne, la convertir en tableau à un élément
      if (typeof normalizedData[field] === 'string') {
        normalizedData[field] = [normalizedData[field]];
      } 
      // S'assurer que c'est bien un tableau (et pas null ou undefined)
      else if (!Array.isArray(normalizedData[field])) {
        normalizedData[field] = [];
      }
    } else {
      // S'il n'existe pas, initialiser un tableau vide
      normalizedData[field] = [];
    }
  });
  
  return normalizedData;
};

/**
 * Obtenir la liste des producteurs de loisirs avec pagination
 * GET /api/leisureProducers
 */
router.get('/', async (req, res) => {
  try {
    // Vérifier que le modèle est bien initialisé
    if (!router.LeisureProducerModel) {
      return res.status(500).json({ 
        message: 'Le modèle LeisureProducer n\'est pas encore initialisé' 
      });
    }
    
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    
    // Construire des filtres si nécessaire
    const filters = {};
    if (req.query.category) {
      filters.category = { $regex: req.query.category, $options: 'i' };
    }
    
    const leisureProducers = await router.LeisureProducerModel.find(filters)
      .skip(skip)
      .limit(limit)
      .sort({ name: 1 });
    
    const total = await router.LeisureProducerModel.countDocuments(filters);
    
    // Normaliser les données pour chaque producteur
    const normalizedProducers = leisureProducers.map(producer => 
      normalizeLeisureProducerData(producer.toObject())
    );
    
    res.status(200).json({
      producers: normalizedProducers,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total
    });
  } catch (error) {
    console.error('❌ Erreur lors de la récupération des producteurs de loisirs:', error);
    res.status(500).json({ 
      message: 'Erreur lors de la récupération des producteurs de loisirs', 
      error: error.message 
    });
  }
});

/**
 * Obtenir un producteur de loisirs par ID
 * GET /api/leisureProducers/:id
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Vérifier la validité de l'ID (pour un ObjectId)
    const isValidObjectId = mongoose.Types.ObjectId.isValid(id);
    console.log(`🔍 Recherche du producteur avec ID: ${id} (ObjectId valide: ${isValidObjectId})`);
    
    // Connexion à la base de données
    if (!loisirDb) {
      console.log(`🔌 Connexion directe à la base de données Loisir&Culture car loisirDb n'est pas initialisé`);
      loisirDb = mongoose.connection.useDb('Loisir&Culture');
    }
    
    // Liste des collections à chercher
    const collectionsToSearch = [
      'Loisir_Paris_Producers',
      'producers',
      'Paris_Loisirs'
    ];
    
    let producer = null;
    let sourceCollection = null;
    
    // Rechercher dans chaque collection
    for (const collName of collectionsToSearch) {
      try {
        // Vérifier si la collection existe
        const collExists = await loisirDb.db.listCollections({ name: collName }).hasNext();
        if (!collExists) {
          console.log(`Collection ${collName} n'existe pas, passage à la suivante`);
          continue;
        }
        
        console.log(`🔍 Recherche dans la collection ${collName}`);
        const collection = loisirDb.collection(collName);
        
        // Stratégie 1: Recherche avec _id comme string
        console.log(`🔍 Tentative de recherche avec _id comme string: ${id}`);
        producer = await collection.findOne({ _id: id });
        
        // Stratégie 2: Recherche avec _id comme ObjectId
        if (!producer && isValidObjectId) {
          console.log(`🔍 Tentative de recherche avec _id comme ObjectId: ${id}`);
          try {
            producer = await collection.findOne({ _id: new mongoose.Types.ObjectId(id) });
          } catch (e) {
            console.log(`❌ Erreur lors de la recherche avec ObjectId dans ${collName}:`, e.message);
          }
        }
        
        // Stratégie 3: Recherche par champs id alternatifs
        if (!producer) {
          console.log(`🔍 Tentative de recherche avec id ou producerId: ${id}`);
          producer = await collection.findOne({
            $or: [
              { id: id },
              { producerId: id },
              { producer_id: id }
            ]
          });
        }
        
        if (producer) {
          sourceCollection = collName;
          console.log(`✅ Producteur trouvé dans la collection ${collName}`);
          break;
        }
      } catch (e) {
        console.log(`❌ Erreur lors de la recherche dans ${collName}:`, e.message);
      }
    }
    
    // Tentative de recherche via le modèle si disponible
    if (!producer && router.LeisureProducerModel) {
      console.log(`🔍 Tentative de recherche via le modèle LeisureProducerModel`);
      try {
        // Essayer d'abord findById
        producer = await router.LeisureProducerModel.findById(id);
        
        // Si échec, tenter une recherche directe
        if (!producer) {
          producer = await router.LeisureProducerModel.findOne({
            $or: [
              { _id: id },
              { id: id },
              { producerId: id },
              { producer_id: id }
            ]
          });
        }
        
        if (producer) {
          sourceCollection = 'via modèle LeisureProducerModel';
          console.log(`✅ Producteur trouvé via le modèle LeisureProducerModel`);
        }
      } catch (e) {
        console.log(`❌ Erreur lors de la recherche via le modèle:`, e.message);
      }
    }
    
    if (!producer) {
      console.log(`❌ Producteur non trouvé - ID: ${id}`);
      return res.status(404).json({ message: 'Producteur de loisirs non trouvé' });
    }
    
    // Normaliser les données avant de les envoyer
    const normalizedProducer = normalizeLeisureProducerData(producer);
    console.log(`✅ Réponse préparée pour le producteur ID: ${id} (source: ${sourceCollection})`);
    
    res.status(200).json(normalizedProducer);
  } catch (error) {
    console.error('❌ Erreur lors de la récupération du producteur de loisirs:', error);
    res.status(500).json({ 
      message: 'Erreur lors de la récupération du producteur de loisirs', 
      error: error.message 
    });
  }
});

/**
 * Suivre un producteur de loisirs
 * POST /api/leisureProducers/:id/follow
 */
router.post('/:id/follow', auth, async (req, res) => {
  try {
    const producer = await router.LeisureProducerModel.findById(req.params.id);
    
    if (!producer) {
      return res.status(404).json({ error: 'Lieu de loisirs non trouvé' });
    }
    
    // Initialiser le tableau des followers s'il n'existe pas
    if (!producer.followers) {
      producer.followers = [];
    }
    
    // Si l'utilisateur suit déjà ce lieu, le retirer de la liste
    const userIndex = producer.followers.indexOf(req.user.id);
    
    if (userIndex > -1) {
      producer.followers.splice(userIndex, 1);
      producer.abonnés = Math.max(0, (producer.abonnés || 0) - 1);
      await producer.save();
      
      res.status(200).json({ message: 'Vous ne suivez plus ce lieu', isFollowing: false });
    } else {
      // Sinon, ajouter l'utilisateur à la liste des abonnés
      producer.followers.push(req.user.id);
      producer.abonnés = (producer.abonnés || 0) + 1;
      await producer.save();
      
      res.status(200).json({ message: 'Vous suivez désormais ce lieu', isFollowing: true });
    }
  } catch (error) {
    console.error('Erreur lors du suivi/retrait de suivi:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

/**
 * Créer un nouveau producteur de loisirs
 * POST /api/leisureProducers
 */
router.post('/', auth, async (req, res) => {
  try {
    const producerData = req.body;
    
    // Valider les données minimales requises
    if (!producerData || !producerData.name) {
      return res.status(400).json({ message: 'Données de producteur incomplètes' });
    }
    
    // Créer le producteur
    const newProducer = new router.LeisureProducerModel(producerData);
    await newProducer.save();
    
    res.status(201).json({
      message: 'Producteur de loisirs créé avec succès',
      producer: newProducer
    });
  } catch (error) {
    console.error('❌ Erreur lors de la création du producteur de loisirs:', error);
    res.status(500).json({ 
      message: 'Erreur lors de la création du producteur de loisirs', 
      error: error.message 
    });
  }
});

/**
 * Mettre à jour un producteur de loisirs
 * PUT /api/leisureProducers/:id
 */
router.put('/:id', auth, async (req, res) => {
  try {
    const updateData = req.body;
    
    // Vérifier que le producteur existe
    const producer = await router.LeisureProducerModel.findById(req.params.id);
    if (!producer) {
      return res.status(404).json({ message: 'Producteur de loisirs non trouvé' });
    }
    
    // Mettre à jour le producteur
    const updatedProducer = await router.LeisureProducerModel.findByIdAndUpdate(
      req.params.id,
      { $set: updateData },
      { new: true }
    );
    
    res.status(200).json({
      message: 'Producteur de loisirs mis à jour avec succès',
      producer: updatedProducer
    });
  } catch (error) {
    console.error('❌ Erreur lors de la mise à jour du producteur de loisirs:', error);
    res.status(500).json({ 
      message: 'Erreur lors de la mise à jour du producteur de loisirs', 
      error: error.message 
    });
  }
});

/**
 * Supprimer un producteur de loisirs
 * DELETE /api/leisureProducers/:id
 */
router.delete('/:id', auth, async (req, res) => {
  try {
    // Vérifier que le producteur existe
    const producer = await router.LeisureProducerModel.findById(req.params.id);
    if (!producer) {
      return res.status(404).json({ message: 'Producteur de loisirs non trouvé' });
    }
    
    // Supprimer le producteur
    await router.LeisureProducerModel.findByIdAndDelete(req.params.id);
    
    res.status(200).json({ message: 'Producteur de loisirs supprimé avec succès' });
  } catch (error) {
    console.error('❌ Erreur lors de la suppression du producteur de loisirs:', error);
    res.status(500).json({ 
      message: 'Erreur lors de la suppression du producteur de loisirs', 
      error: error.message 
    });
  }
});

/**
 * Rechercher des producteurs de loisirs à proximité
 * GET /api/leisureProducers/nearby
 */
router.get('/search/nearby', async (req, res) => {
  try {
    const { lat, lng, radius = 5000, limit = 20 } = req.query;
    
    if (!lat || !lng) {
      return res.status(400).json({ message: 'Les coordonnées (lat, lng) sont requises' });
    }
    
    // Construire la requête géospatiale
    const producers = await router.LeisureProducerModel.find({
      location: {
        $nearSphere: {
          $geometry: {
            type: "Point",
            coordinates: [parseFloat(lng), parseFloat(lat)]
          },
          $maxDistance: parseInt(radius)
        }
      }
    }).limit(parseInt(limit));
    
    res.status(200).json(producers);
  } catch (error) {
    console.error('❌ Erreur lors de la recherche de producteurs à proximité:', error);
    res.status(500).json({ 
      message: 'Erreur lors de la recherche de producteurs à proximité', 
      error: error.message 
    });
  }
});

/**
 * Obtenir les événements d'un producteur de loisirs
 * GET /api/leisureProducers/:id/events
 */
router.get('/:id/events', async (req, res) => {
  try {
    const { id } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    
    // Vérifier que le producteur existe
    const producer = await router.LeisureProducerModel.findById(id);
    if (!producer) {
      return res.status(404).json({ message: 'Producteur de loisirs non trouvé' });
    }
    
    // Récupérer les événements associés au producteur
    const events = await router.Event.find({ 
      $or: [
        { producer_id: id },
        { producerId: id },
        { venue_id: id }
      ]
    })
    .skip(skip)
    .limit(limit)
    .sort({ date_debut: 1 });
    
    const total = await router.Event.countDocuments({ 
      $or: [
        { producer_id: id },
        { producerId: id },
        { venue_id: id }
      ]
    });
    
    res.status(200).json({
      events,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total
    });
  } catch (error) {
    console.error('❌ Erreur lors de la récupération des événements du producteur:', error);
    res.status(500).json({ 
      message: 'Erreur lors de la récupération des événements du producteur', 
      error: error.message 
    });
  }
});

/**
 * Créer un nouvel événement pour un producteur de loisirs
 * POST /api/leisureProducers/:id/events
 */
router.post('/:id/events', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const eventData = req.body;
    
    // Vérifier que le producteur existe
    const producer = await router.LeisureProducerModel.findById(id);
    if (!producer) {
      return res.status(404).json({ message: 'Producteur de loisirs non trouvé' });
    }
    
    // Valider les données minimales requises
    if (!eventData || !eventData.intitulé || !eventData.date_debut) {
      return res.status(400).json({ message: 'Données d\'événement incomplètes' });
    }
    
    // Ajouter l'ID du producteur à l'événement
    eventData.producer_id = id;
    eventData.venue_id = id;
    
    // Créer l'événement
    const newEvent = new router.Event(eventData);
    await newEvent.save();
    
    // Option: Ajouter l'événement à la liste des événements du producteur
    if (!producer.evenements) {
      producer.evenements = [];
    }
    producer.evenements.push(newEvent._id);
    await producer.save();
    
    res.status(201).json({
      message: 'Événement créé avec succès',
      event: newEvent
    });
  } catch (error) {
    console.error('❌ Erreur lors de la création de l\'événement:', error);
    res.status(500).json({ 
      message: 'Erreur lors de la création de l\'événement', 
      error: error.message 
    });
  }
});

/**
 * Mettre à jour un événement d'un producteur de loisirs
 * PUT /api/leisureProducers/:producerId/events/:eventId
 */
router.put('/:producerId/events/:eventId', auth, async (req, res) => {
  try {
    const { producerId, eventId } = req.params;
    const updateData = req.body;
    
    // Vérifier que le producteur existe
    const producer = await router.LeisureProducerModel.findById(producerId);
    if (!producer) {
      return res.status(404).json({ message: 'Producteur de loisirs non trouvé' });
    }
    
    // Vérifier que l'événement existe et appartient au producteur
    const event = await router.Event.findOne({ 
      _id: eventId,
      $or: [
        { producer_id: producerId },
        { producerId: producerId },
        { venue_id: producerId }
      ]
    });
    
    if (!event) {
      return res.status(404).json({ message: 'Événement non trouvé ou n\'appartenant pas à ce producteur' });
    }
    
    // Mettre à jour l'événement
    const updatedEvent = await router.Event.findByIdAndUpdate(
      eventId,
      { $set: updateData },
      { new: true }
    );
    
    res.status(200).json({
      message: 'Événement mis à jour avec succès',
      event: updatedEvent
    });
  } catch (error) {
    console.error('❌ Erreur lors de la mise à jour de l\'événement:', error);
    res.status(500).json({ 
      message: 'Erreur lors de la mise à jour de l\'événement', 
      error: error.message 
    });
  }
});

/**
 * Supprimer un événement d'un producteur de loisirs
 * DELETE /api/leisureProducers/:producerId/events/:eventId
 */
router.delete('/:producerId/events/:eventId', auth, async (req, res) => {
  try {
    const { producerId, eventId } = req.params;
    
    // Vérifier que le producteur existe
    const producer = await router.LeisureProducerModel.findById(producerId);
    if (!producer) {
      return res.status(404).json({ message: 'Producteur de loisirs non trouvé' });
    }
    
    // Vérifier que l'événement existe et appartient au producteur
    const event = await router.Event.findOne({ 
      _id: eventId,
      $or: [
        { producer_id: producerId },
        { producerId: producerId },
        { venue_id: producerId }
      ]
    });
    
    if (!event) {
      return res.status(404).json({ message: 'Événement non trouvé ou n\'appartenant pas à ce producteur' });
    }
    
    // Supprimer l'événement
    await router.Event.findByIdAndDelete(eventId);
    
    // Option: Supprimer l'événement de la liste des événements du producteur
    if (producer.evenements && producer.evenements.includes(eventId)) {
      producer.evenements = producer.evenements.filter(id => id.toString() !== eventId);
      await producer.save();
    }
    
    res.status(200).json({ message: 'Événement supprimé avec succès' });
  } catch (error) {
    console.error('❌ Erreur lors de la suppression de l\'événement:', error);
    res.status(500).json({ 
      message: 'Erreur lors de la suppression de l\'événement', 
      error: error.message 
    });
  }
});

/**
 * Publier un événement (changer son statut)
 * POST /api/leisureProducers/:producerId/events/:eventId/publish
 */
router.post('/:producerId/events/:eventId/publish', auth, async (req, res) => {
  try {
    const { producerId, eventId } = req.params;
    const { published = true } = req.body;
    
    // Vérifier que l'événement existe et appartient au producteur
    const event = await router.Event.findOne({ 
      _id: eventId,
      $or: [
        { producer_id: producerId },
        { producerId: producerId },
        { venue_id: producerId }
      ]
    });
    
    if (!event) {
      return res.status(404).json({ message: 'Événement non trouvé ou n\'appartenant pas à ce producteur' });
    }
    
    // Mettre à jour le statut de publication
    event.published = published;
    await event.save();
    
    res.status(200).json({
      message: published ? 'Événement publié avec succès' : 'Événement dépublié avec succès',
      event
    });
  } catch (error) {
    console.error(`❌ Erreur lors de la ${req.body.published ? 'publication' : 'dépublication'} de l'événement:`, error);
    res.status(500).json({ 
      message: `Erreur lors de la ${req.body.published ? 'publication' : 'dépublication'} de l'événement`, 
      error: error.message 
    });
  }
});

/**
 * @route GET /api/leisureProducers/:producerId/relations
 * @desc Get a leisure producer's relationships (followers, views, etc.)
 * @access Public
 */
router.get('/:producerId/relations', async (req, res) => {
  try {
    const { producerId } = req.params;
    
    // Get producer from database to verify it exists
    if (!router.LeisureProducerModel) {
      console.error('❌ LeisureProducerModel not initialized');
      return res.status(500).json({ message: 'Backend initialization error - model not ready' });
    }
    
    // Use router.LeisureProducerModel instead of LeisureProducer
    const producer = await router.LeisureProducerModel.findById(producerId);
    if (!producer) {
      return res.status(404).json({ message: 'Leisure producer not found' });
    }
    
    // Get related data (followers, views, choices, interested)
    const relations = await getProducerRelations(producerId);
    
    res.status(200).json(relations);
  } catch (error) {
    console.error('Error fetching leisure producer relations:', error);
    res.status(500).json({ message: 'Error fetching producer relations', error: error.message });
  }
});

/**
 * Helper function to get a producer's relationship data
 */
async function getProducerRelations(producerId) {
  // Initialize result with empty arrays
  const result = {
    followers: [],
    followers_count: 0,
    views: [],
    views_count: 0,
    interested: [],
    interested_count: 0,
    choices: [],
    choices_count: 0,
  };
  
  try {
    // Obtenir la référence à la base de données ChoiceApp
    const dbConnections = require('../index');
    const choiceAppDb = dbConnections.choiceAppDb;
    
    // Si aucune connexion n'est disponible, retourner le résultat vide
    if (!choiceAppDb) {
      console.log('⚠️ choiceAppDb non disponible, retour des relations vides');
      return result;
    }
    
    // Get followers (if Follow collection exists)
    try {
      const followCollection = choiceAppDb.collection('Follows');
      const follows = await followCollection.find({ followedId: producerId }).toArray();
      result.followers = follows.map(f => f.followerId);
      result.followers_count = follows.length;
    } catch (e) {
      console.log('Follow collection not found or error fetching followers:', e.message);
    }
    
    // Get views (if View collection exists)
    try {
      const viewCollection = choiceAppDb.collection('Views');
      const views = await viewCollection.find({ targetId: producerId, targetType: 'producer' }).toArray();
      result.views = views.map(v => v.userId);
      result.views_count = views.length;
    } catch (e) {
      console.log('View collection not found or error fetching views:', e.message);
    }
    
    // Get interested users (if Interest collection exists)
    try {
      const interestCollection = choiceAppDb.collection('Interests');
      const interests = await interestCollection.find({ targetId: producerId }).toArray();
      result.interested = interests.map(i => i.userId);
      result.interested_count = interests.length;
    } catch (e) {
      console.log('Interest collection not found or error fetching interests:', e.message);
    }
    
    // Get choices (if Choice collection exists)
    try {
      const choiceCollection = choiceAppDb.collection('Choices');
      const choices = await choiceCollection.find({ targetId: producerId }).toArray();
      result.choices = choices.map(c => c.userId);
      result.choices_count = choices.length;
    } catch (e) {
      console.log('Choice collection not found or error fetching choices:', e.message);
    }
    
    return result;
  } catch (e) {
    console.error('Error in getProducerRelations:', e);
    return result;
  }
}

// Exporter le router et la fonction d'initialisation
module.exports = router;
router.initialize = initialize;

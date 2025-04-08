const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Conversation = require('../models/conversation'); // Import du modèle Conversation
const LeisureProducer = require('../models/leisureProducer');
const auth = require('../middleware/auth');
const { loisirDb } = require('../index');

// Modèle pour la collection des producteurs de loisirs
const LeisureProducerModel = loisirDb.model(
  'LeisureProducer',
  new mongoose.Schema({}, { strict: false }),
  'producers' // Nom exact de la collection dans MongoDB
);

// Modèle pour la collection des événements
const Event = loisirDb.model(
  'Event',
  new mongoose.Schema({}, { strict: false }),
  'Loisir_Paris_Evenements' // Nom exact de la collection dans MongoDB
);

/**
 * Obtenir la liste des producteurs de loisirs avec pagination
 * GET /api/leisureProducers
 */
router.get('/', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    
    // Construire des filtres si nécessaire
    const filters = {};
    if (req.query.category) {
      filters.category = { $regex: req.query.category, $options: 'i' };
    }
    
    const leisureProducers = await LeisureProducerModel.find(filters)
      .skip(skip)
      .limit(limit)
      .sort({ name: 1 });
    
    const total = await LeisureProducerModel.countDocuments(filters);
    
    res.status(200).json({
      producers: leisureProducers,
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
    const producer = await LeisureProducerModel.findById(req.params.id);
    
    if (!producer) {
      return res.status(404).json({ message: 'Producteur de loisirs non trouvé' });
    }
    
    res.status(200).json(producer);
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
    const producer = await LeisureProducerModel.findById(req.params.id);
    
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
    const newProducer = new LeisureProducerModel(producerData);
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
    const producer = await LeisureProducerModel.findById(req.params.id);
    if (!producer) {
      return res.status(404).json({ message: 'Producteur de loisirs non trouvé' });
    }
    
    // Mettre à jour le producteur
    const updatedProducer = await LeisureProducerModel.findByIdAndUpdate(
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
    const producer = await LeisureProducerModel.findById(req.params.id);
    if (!producer) {
      return res.status(404).json({ message: 'Producteur de loisirs non trouvé' });
    }
    
    // Supprimer le producteur
    await LeisureProducerModel.findByIdAndDelete(req.params.id);
    
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
    const producers = await LeisureProducerModel.find({
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
    const producer = await LeisureProducerModel.findById(id);
    if (!producer) {
      return res.status(404).json({ message: 'Producteur de loisirs non trouvé' });
    }
    
    // Récupérer les événements associés au producteur
    const events = await Event.find({ 
      $or: [
        { producer_id: id },
        { producerId: id },
        { venue_id: id }
      ]
    })
    .skip(skip)
    .limit(limit)
    .sort({ date_debut: 1 });
    
    const total = await Event.countDocuments({ 
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
    const producer = await LeisureProducerModel.findById(id);
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
    const newEvent = new Event(eventData);
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
    const producer = await LeisureProducerModel.findById(producerId);
    if (!producer) {
      return res.status(404).json({ message: 'Producteur de loisirs non trouvé' });
    }
    
    // Vérifier que l'événement existe et appartient au producteur
    const event = await Event.findOne({ 
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
    const updatedEvent = await Event.findByIdAndUpdate(
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
    const producer = await LeisureProducerModel.findById(producerId);
    if (!producer) {
      return res.status(404).json({ message: 'Producteur de loisirs non trouvé' });
    }
    
    // Vérifier que l'événement existe et appartient au producteur
    const event = await Event.findOne({ 
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
    await Event.findByIdAndDelete(eventId);
    
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
    const event = await Event.findOne({ 
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
    const producer = await LeisureProducer.findById(producerId);
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
    // Get followers (if Follow model exists)
    try {
      const Follow = choiceAppDb.model('Follow');
      const follows = await Follow.find({ followedId: producerId });
      result.followers = follows.map(f => f.followerId);
      result.followers_count = follows.length;
    } catch (e) {
      console.log('Follow model not found or error fetching followers:', e.message);
    }
    
    // Get views (if View model exists)
    try {
      const View = choiceAppDb.model('View');
      const views = await View.find({ targetId: producerId, targetType: 'producer' });
      result.views = views.map(v => v.userId);
      result.views_count = views.length;
    } catch (e) {
      console.log('View model not found or error fetching views:', e.message);
    }
    
    // Get interested users (if Interest model exists)
    try {
      const Interest = choiceAppDb.model('Interest');
      const interests = await Interest.find({ targetId: producerId });
      result.interested = interests.map(i => i.userId);
      result.interested_count = interests.length;
    } catch (e) {
      console.log('Interest model not found or error fetching interests:', e.message);
    }
    
    // Get choices (if Choice model exists)
    try {
      const Choice = choiceAppDb.model('Choice');
      const choices = await Choice.find({ targetId: producerId });
      result.choices = choices.map(c => c.userId);
      result.choices_count = choices.length;
    } catch (e) {
      console.log('Choice model not found or error fetching choices:', e.message);
    }
    
    return result;
  } catch (e) {
    console.error('Error in getProducerRelations:', e);
    return result;
  }
}

module.exports = router;

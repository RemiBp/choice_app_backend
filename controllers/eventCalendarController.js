const mongoose = require('mongoose');
const { createModel, databases } = require('../utils/modelCreator');

// Initialiser les modèles directement avec notre utilitaire
const Event = createModel(
  databases.LOISIR,
  'Event',
  'Events'
);

// Créer le modèle pour les inscriptions d'événements
const EventRegistration = createModel(
  databases.CHOICE_APP,
  'EventRegistration',
  'EventRegistrations',
  new mongoose.Schema({
    eventId: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    registrationDate: { type: Date, default: Date.now },
    status: { type: String, enum: ['registered', 'cancelled', 'waitlisted'], default: 'registered' },
    notes: { type: String }
  })
);

// Fonction d'initialisation vide maintenant que nous utilisons createModel directement
const initialize = () => {
  // Aucune action nécessaire car les modèles sont créés directement
  console.log('✅ EventCalendarController models initialized directly');
};

// Contrôleur pour les événements
const eventCalendarController = {
  initialize,

  /**
   * Obtenir les événements pour la période
   */
  getEvents: async (req, res) => {
    try {
      const { start, end, categories } = req.query;
      
      // Validation des dates
      let startDate, endDate;
      if (start) {
        startDate = new Date(start);
        if (isNaN(startDate.getTime())) {
          return res.status(400).json({ message: 'Date de début invalide' });
        }
      }
      if (end) {
        endDate = new Date(end);
        if (isNaN(endDate.getTime())) {
          return res.status(400).json({ message: 'Date de fin invalide' });
        }
      }
      
      // Construction de la requête
      const query = {};
      
      // Filtrage par dates
      if (startDate || endDate) {
        query.start_date = {};
        if (startDate) query.start_date.$gte = startDate;
        if (endDate) query.start_date.$lte = endDate;
      }
      
      // Filtrage par catégories
      if (categories) {
        const categoryList = categories.split(',');
        query.category = { $in: categoryList };
      }
      
      // Récupération des événements
      const events = await Event.find(query)
        .sort({ start_date: 1 })
        .limit(500); // Limitation pour des raisons de performance
      
      res.status(200).json(events);
    } catch (error) {
      console.error('❌ Erreur lors de la récupération des événements:', error);
      res.status(500).json({ message: 'Erreur interne du serveur', error: error.message });
    }
  },
  
  /**
   * Obtenir un événement spécifique
   */
  getEventById: async (req, res) => {
    try {
      const { eventId } = req.params;
      
      // Vérification de la validité de l'ID
      if (!mongoose.Types.ObjectId.isValid(eventId)) {
        return res.status(400).json({ message: 'ID d\'événement invalide' });
      }
      
      // Récupération de l'événement
      const event = await Event.findById(eventId);
      
      if (!event) {
        return res.status(404).json({ message: 'Événement non trouvé' });
      }
      
      res.status(200).json(event);
    } catch (error) {
      console.error(`❌ Erreur lors de la récupération de l'événement ${req.params.eventId}:`, error);
      res.status(500).json({ message: 'Erreur interne du serveur', error: error.message });
    }
  },
  
  /**
   * Obtenir les événements d'un utilisateur
   */
  getUserEvents: async (req, res) => {
    try {
      const { userId } = req.params;
      const { type = 'all', start, end } = req.query;
      
      // Vérification de la validité de l'ID
      if (!mongoose.Types.ObjectId.isValid(userId)) {
        return res.status(400).json({ message: 'ID utilisateur invalide' });
      }
      
      // Construction de la requête de base
      let query = {};
      
      // Filtrage par dates
      if (start || end) {
        query.start_date = {};
        if (start) query.start_date.$gte = new Date(start);
        if (end) query.start_date.$lte = new Date(end);
      }
      
      // Différents types d'événements liés à l'utilisateur
      if (type === 'created') {
        // Événements créés par l'utilisateur
        query.createdBy = userId;
      } else if (type === 'registered') {
        // Événements auxquels l'utilisateur est inscrit
        const registrations = await EventRegistration.find({
          userId: userId,
          status: 'registered'
        }).select('eventId');
        
        const eventIds = registrations.map(reg => reg.eventId);
        query._id = { $in: eventIds };
      } else if (type === 'all') {
        // Tous les événements liés à l'utilisateur (créés ou inscrits)
        const registrations = await EventRegistration.find({
          userId: userId,
          status: 'registered'
        }).select('eventId');
        
        const eventIds = registrations.map(reg => reg.eventId);
        query.$or = [
          { createdBy: userId },
          { _id: { $in: eventIds } }
        ];
      }
      
      // Récupération des événements
      const events = await Event.find(query).sort({ start_date: 1 });
      
      res.status(200).json(events);
    } catch (error) {
      console.error(`❌ Erreur lors de la récupération des événements de l'utilisateur ${req.params.userId}:`, error);
      res.status(500).json({ message: 'Erreur interne du serveur', error: error.message });
    }
  },
  
  /**
   * Obtenir les événements d'un producteur
   */
  getProducerEvents: async (req, res) => {
    try {
      const { producerId } = req.params;
      const { start, end, status = 'active' } = req.query;
      
      // Vérification de la validité de l'ID
      if (!mongoose.Types.ObjectId.isValid(producerId)) {
        return res.status(400).json({ message: 'ID producteur invalide' });
      }
      
      // Construction de la requête
      const query = { producerId: producerId };
      
      // Filtrage par statut
      if (status !== 'all') {
        query.status = status;
      }
      
      // Filtrage par dates
      if (start || end) {
        query.start_date = {};
        if (start) query.start_date.$gte = new Date(start);
        if (end) query.start_date.$lte = new Date(end);
      }
      
      // Récupération des événements
      const events = await Event.find(query).sort({ start_date: 1 });
      
      res.status(200).json(events);
    } catch (error) {
      console.error(`❌ Erreur lors de la récupération des événements du producteur ${req.params.producerId}:`, error);
      res.status(500).json({ message: 'Erreur interne du serveur', error: error.message });
    }
  },
  
  /**
   * Créer un nouvel événement
   */
  createEvent: async (req, res) => {
    try {
      const {
        title, description, start_date, end_date, location, locationName,
        address, category, producerId, producerType, image, price,
        capacity, tags, isPublic, color, allDay, recurrence
      } = req.body;
      
      // Vérification des champs requis
      if (!title || !start_date) {
        return res.status(400).json({ message: 'Titre et date de début requis' });
      }
      
      // Création de l'événement
      const event = new Event({
        title,
        description,
        start_date: new Date(start_date),
        end_date: end_date ? new Date(end_date) : undefined,
        location,
        locationName,
        address,
        category,
        producerId,
        producerType,
        image,
        price,
        capacity,
        availableSeats: capacity,
        tags,
        isPublic,
        createdBy: req.user?.id, // Si authentification implémentée
        color,
        allDay,
        recurrence
      });
      
      // Sauvegarde de l'événement
      await event.save();
      
      res.status(201).json({
        message: 'Événement créé avec succès',
        event
      });
    } catch (error) {
      console.error('❌ Erreur lors de la création de l\'événement:', error);
      res.status(500).json({ message: 'Erreur interne du serveur', error: error.message });
    }
  },
  
  /**
   * Mettre à jour un événement
   */
  updateEvent: async (req, res) => {
    try {
      const { eventId } = req.params;
      const updateData = req.body;
      
      // Vérification de la validité de l'ID
      if (!mongoose.Types.ObjectId.isValid(eventId)) {
        return res.status(400).json({ message: 'ID d\'événement invalide' });
      }
      
      // Conversion des dates si présentes
      if (updateData.start_date) {
        updateData.start_date = new Date(updateData.start_date);
      }
      if (updateData.end_date) {
        updateData.end_date = new Date(updateData.end_date);
      }
      
      // Mise à jour de la date de modification
      updateData.updatedAt = new Date();
      
      // Mise à jour de l'événement
      const event = await Event.findByIdAndUpdate(
        eventId,
        { $set: updateData },
        { new: true, runValidators: true }
      );
      
      if (!event) {
        return res.status(404).json({ message: 'Événement non trouvé' });
      }
      
      res.status(200).json({
        message: 'Événement mis à jour avec succès',
        event
      });
    } catch (error) {
      console.error(`❌ Erreur lors de la mise à jour de l'événement ${req.params.eventId}:`, error);
      res.status(500).json({ message: 'Erreur interne du serveur', error: error.message });
    }
  },
  
  /**
   * Supprimer un événement
   */
  deleteEvent: async (req, res) => {
    try {
      const { eventId } = req.params;
      
      // Vérification de la validité de l'ID
      if (!mongoose.Types.ObjectId.isValid(eventId)) {
        return res.status(400).json({ message: 'ID d\'événement invalide' });
      }
      
      // Suppression de l'événement
      const event = await Event.findByIdAndDelete(eventId);
      
      if (!event) {
        return res.status(404).json({ message: 'Événement non trouvé' });
      }
      
      // Suppression des inscriptions associées
      await EventRegistration.deleteMany({ eventId });
      
      res.status(200).json({
        message: 'Événement supprimé avec succès'
      });
    } catch (error) {
      console.error(`❌ Erreur lors de la suppression de l'événement ${req.params.eventId}:`, error);
      res.status(500).json({ message: 'Erreur interne du serveur', error: error.message });
    }
  },
  
  /**
   * S'inscrire à un événement
   */
  registerForEvent: async (req, res) => {
    try {
      const { eventId } = req.params;
      const { userId, notes } = req.body;
      
      // Vérification des paramètres requis
      if (!eventId || !userId) {
        return res.status(400).json({ message: 'ID événement et ID utilisateur requis' });
      }
      
      // Vérification de la validité des IDs
      if (!mongoose.Types.ObjectId.isValid(eventId) || !mongoose.Types.ObjectId.isValid(userId)) {
        return res.status(400).json({ message: 'ID invalide' });
      }
      
      // Vérifier si l'événement existe
      const event = await Event.findById(eventId);
      if (!event) {
        return res.status(404).json({ message: 'Événement non trouvé' });
      }
      
      // Vérifier si l'utilisateur est déjà inscrit
      const existingRegistration = await EventRegistration.findOne({
        eventId,
        userId,
        status: 'registered'
      });
      
      if (existingRegistration) {
        return res.status(400).json({ message: 'Utilisateur déjà inscrit à cet événement' });
      }
      
      // Vérifier s'il reste des places disponibles
      if (event.capacity && event.availableSeats <= 0) {
        // Inscrire sur liste d'attente
        const waitlistRegistration = new EventRegistration({
          eventId,
          userId,
          status: 'waitlisted',
          notes
        });
        await waitlistRegistration.save();
        
        return res.status(200).json({
          message: 'Inscription sur liste d\'attente effectuée',
          registration: waitlistRegistration
        });
      }
      
      // Créer l'inscription
      const registration = new EventRegistration({
        eventId,
        userId,
        status: 'registered',
        notes
      });
      
      await registration.save();
      
      // Mettre à jour le nombre de places disponibles
      if (event.capacity) {
        event.availableSeats -= 1;
        await event.save();
      }
      
      res.status(200).json({
        message: 'Inscription réussie',
        registration
      });
    } catch (error) {
      console.error(`❌ Erreur lors de l'inscription à l'événement ${req.params.eventId}:`, error);
      res.status(500).json({ message: 'Erreur interne du serveur', error: error.message });
    }
  },
  
  /**
   * Se désinscrire d'un événement
   */
  unregisterFromEvent: async (req, res) => {
    try {
      const { eventId } = req.params;
      const { userId } = req.body;
      
      // Vérification des paramètres requis
      if (!eventId || !userId) {
        return res.status(400).json({ message: 'ID événement et ID utilisateur requis' });
      }
      
      // Vérification de la validité des IDs
      if (!mongoose.Types.ObjectId.isValid(eventId) || !mongoose.Types.ObjectId.isValid(userId)) {
        return res.status(400).json({ message: 'ID invalide' });
      }
      
      // Rechercher l'inscription
      const registration = await EventRegistration.findOne({
        eventId,
        userId,
        status: 'registered'
      });
      
      if (!registration) {
        return res.status(404).json({ message: 'Inscription non trouvée' });
      }
      
      // Supprimer l'inscription
      await EventRegistration.findByIdAndUpdate(
        registration._id,
        { $set: { status: 'cancelled' } }
      );
      
      // Mettre à jour le nombre de places disponibles
      const event = await Event.findById(eventId);
      if (event && event.capacity) {
        event.availableSeats += 1;
        await event.save();
        
        // Voir s'il y a des utilisateurs en liste d'attente à promouvoir
        if (event.availableSeats === 1) {
          const waitlistedRegistration = await EventRegistration.findOne({
            eventId,
            status: 'waitlisted'
          }).sort({ registrationDate: 1 });
          
          if (waitlistedRegistration) {
            waitlistedRegistration.status = 'registered';
            await waitlistedRegistration.save();
            
            event.availableSeats -= 1;
            await event.save();
          }
        }
      }
      
      res.status(200).json({
        message: 'Désinscription réussie'
      });
    } catch (error) {
      console.error(`❌ Erreur lors de la désinscription de l'événement ${req.params.eventId}:`, error);
      res.status(500).json({ message: 'Erreur interne du serveur', error: error.message });
    }
  },
  
  /**
   * Obtenir les événements à proximité
   */
  getNearbyEvents: async (req, res) => {
    try {
      const { lat, lng, radius = 5000, start, categories } = req.query;
      
      // Vérification des coordonnées
      if (!lat || !lng) {
        return res.status(400).json({ message: 'Coordonnées (lat, lng) requises' });
      }
      
      // Construction de la requête géospatiale
      const query = {
        location: {
          $nearSphere: {
            $geometry: {
              type: 'Point',
              coordinates: [parseFloat(lng), parseFloat(lat)]
            },
            $maxDistance: parseInt(radius)
          }
        }
      };
      
      // Filtrer les événements futurs
      if (start) {
        query.start_date = { $gte: new Date(start) };
      } else {
        query.start_date = { $gte: new Date() };
      }
      
      // Filtrer par catégories
      if (categories) {
        const categoryList = categories.split(',');
        query.category = { $in: categoryList };
      }
      
      // Récupérer les événements
      const events = await Event.find(query)
        .sort({ start_date: 1 })
        .limit(30);
      
      res.status(200).json(events);
    } catch (error) {
      console.error('❌ Erreur lors de la récupération des événements à proximité:', error);
      res.status(500).json({ message: 'Erreur interne du serveur', error: error.message });
    }
  },
  
  /**
   * Obtenir toutes les catégories d'événements
   */
  getEventCategories: async (req, res) => {
    try {
      // Agréger toutes les catégories distinctes
      const categories = await Event.distinct('category');
      
      // Filtrer les valeurs nulles ou vides
      const validCategories = categories.filter(category => category);
      
      res.status(200).json(validCategories);
    } catch (error) {
      console.error('❌ Erreur lors de la récupération des catégories d\'événements:', error);
      res.status(500).json({ message: 'Erreur interne du serveur', error: error.message });
    }
  }
};

module.exports = eventCalendarController; 
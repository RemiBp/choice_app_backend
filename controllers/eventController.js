const mongoose = require('mongoose');
const { UserChoice } = require('../models/User');
const { loisirCultureDb } = require('../index');

// Modèle pour les événements
const Event = loisirCultureDb.model('Event', new mongoose.Schema({}), 'Loisir_Paris_Evenements');

/**
 * Contrôleur pour gérer les événements
 */
const eventController = {
  /**
   * Obtenir tous les événements avec pagination
   */
  getAllEvents: async (req, res) => {
    try {
      // Paramètres de pagination
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 20;
      const skip = (page - 1) * limit;
      
      // Filtres de base
      const filterParams = {};
      
      // Filtres spécifiques
      if (req.query.category) filterParams.catégorie = req.query.category;
      if (req.query.producerId || req.query.venueId) {
        filterParams.$or = [
          { producer_id: req.query.producerId || req.query.venueId },
          { venue_id: req.query.producerId || req.query.venueId }
        ];
      }
      
      // Filtre de date
      if (req.query.dateStart || req.query.dateEnd) {
        filterParams.date = {};
        if (req.query.dateStart) filterParams.date.$gte = new Date(req.query.dateStart);
        if (req.query.dateEnd) filterParams.date.$lte = new Date(req.query.dateEnd);
      }
      
      // Obtenir les événements paginés, triés par date
      const events = await Event.find(filterParams)
        .skip(skip)
        .limit(limit)
        .sort({ date: 1 });
      
      // Compter le nombre total de résultats pour la pagination
      const totalEvents = await Event.countDocuments(filterParams);
      
      res.status(200).json({
        events,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(totalEvents / limit),
          totalItems: totalEvents,
          hasNextPage: page < Math.ceil(totalEvents / limit),
          hasPrevPage: page > 1
        }
      });
    } catch (error) {
      console.error('❌ Erreur dans getAllEvents:', error);
      res.status(500).json({ message: 'Erreur lors de la récupération des événements', error: error.message });
    }
  },
  
  /**
   * Obtenir un événement par ID
   */
  getEventById: async (req, res) => {
    try {
      const { id } = req.params;
      const event = await Event.findById(id);
      
      if (!event) {
        return res.status(404).json({ message: 'Événement non trouvé' });
      }
      
      res.status(200).json(event);
    } catch (error) {
      console.error('❌ Erreur dans getEventById:', error);
      res.status(500).json({ message: 'Erreur lors de la récupération de l\'événement', error: error.message });
    }
  },
  
  /**
   * Rechercher des événements
   */
  searchEvents: async (req, res) => {
    try {
      const { q, category, emotions, tags, dateStart, dateEnd, page = 1, limit = 20 } = req.query;
      const skip = (parseInt(page) - 1) * parseInt(limit);
      
      // Construire la requête de recherche
      const searchQuery = {};
      
      // Recherche textuelle
      if (q) {
        searchQuery.$or = [
          { intitulé: { $regex: q, $options: 'i' } },
          { lieu: { $regex: q, $options: 'i' } },
          { adresse: { $regex: q, $options: 'i' } },
          { description: { $regex: q, $options: 'i' } },
          { catégorie: { $regex: q, $options: 'i' } }
        ];
      }
      
      // Filtres supplémentaires
      if (category) searchQuery.catégorie = category;
      if (emotions) searchQuery.émotions = { $in: emotions.split(',') };
      if (tags) searchQuery.tags = { $in: tags.split(',') };
      
      // Filtre de date
      if (dateStart || dateEnd) {
        searchQuery.date = {};
        if (dateStart) searchQuery.date.$gte = new Date(dateStart);
        if (dateEnd) searchQuery.date.$lte = new Date(dateEnd);
      }
      
      // Exécuter la recherche
      const events = await Event.find(searchQuery)
        .skip(skip)
        .limit(parseInt(limit))
        .sort({ date: 1 });
      
      const totalEvents = await Event.countDocuments(searchQuery);
      
      res.status(200).json({
        events,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(totalEvents / parseInt(limit)),
          totalItems: totalEvents,
          hasNextPage: parseInt(page) < Math.ceil(totalEvents / parseInt(limit)),
          hasPrevPage: parseInt(page) > 1
        }
      });
    } catch (error) {
      console.error('❌ Erreur dans searchEvents:', error);
      res.status(500).json({ message: 'Erreur lors de la recherche d\'événements', error: error.message });
    }
  },
  
  /**
   * Obtenir les événements à proximité
   */
  getNearbyEvents: async (req, res) => {
    try {
      const { lat, lng, radius = 5000, limit = 20, dateStart, dateEnd } = req.query;
      
      if (!lat || !lng) {
        return res.status(400).json({ message: 'Les coordonnées (lat, lng) sont requises' });
      }
      
      // Construire la requête géospatiale
      const geoQuery = {
        localisation: {
          $nearSphere: {
            $geometry: {
              type: "Point",
              coordinates: [parseFloat(lng), parseFloat(lat)]
            },
            $maxDistance: parseInt(radius)
          }
        }
      };
      
      // Ajouter le filtre de date si présent
      if (dateStart || dateEnd) {
        geoQuery.date = {};
        if (dateStart) geoQuery.date.$gte = new Date(dateStart);
        if (dateEnd) geoQuery.date.$lte = new Date(dateEnd);
      }
      
      // Recherche géospatiale
      const events = await Event.find(geoQuery)
        .limit(parseInt(limit))
        .sort({ date: 1 });
      
      res.status(200).json(events);
    } catch (error) {
      console.error('❌ Erreur dans getNearbyEvents:', error);
      res.status(500).json({ message: 'Erreur lors de la récupération des événements à proximité', error: error.message });
    }
  },
  
  /**
   * Obtenir les événements populaires
   */
  getPopularEvents: async (req, res) => {
    try {
      const { limit = 10 } = req.query;
      
      // Récupérer les événements les plus populaires (basé sur les choix/intérêts)
      const events = await Event.find({})
        .sort({ choices_count: -1, interests_count: -1 })
        .limit(parseInt(limit));
      
      res.status(200).json(events);
    } catch (error) {
      console.error('❌ Erreur dans getPopularEvents:', error);
      res.status(500).json({ message: 'Erreur lors de la récupération des événements populaires', error: error.message });
    }
  },
  
  /**
   * Créer un nouvel événement
   */
  createEvent: async (req, res) => {
    try {
      const eventData = req.body;
      
      if (!eventData || !eventData.intitulé || !eventData.date || !eventData.catégorie) {
        return res.status(400).json({ message: 'Données d\'événement incomplètes' });
      }
      
      // Vérifier la structure de la localisation
      if (eventData.localisation && !eventData.localisation.type) {
        eventData.localisation = {
          type: "Point",
          coordinates: eventData.localisation.coordinates || [0, 0]
        };
      }
      
      // Créer l'événement
      const newEvent = new Event(eventData);
      await newEvent.save();
      
      res.status(201).json({
        message: 'Événement créé avec succès',
        event: newEvent
      });
    } catch (error) {
      console.error('❌ Erreur dans createEvent:', error);
      res.status(500).json({ message: 'Erreur lors de la création de l\'événement', error: error.message });
    }
  },
  
  /**
   * Mettre à jour un événement
   */
  updateEvent: async (req, res) => {
    try {
      const { id } = req.params;
      const updateData = req.body;
      
      // Vérifier que l'événement existe
      const event = await Event.findById(id);
      if (!event) {
        return res.status(404).json({ message: 'Événement non trouvé' });
      }
      
      // Vérifier la structure de la localisation si présente
      if (updateData.localisation && !updateData.localisation.type) {
        updateData.localisation = {
          type: "Point",
          coordinates: updateData.localisation.coordinates || event.localisation.coordinates
        };
      }
      
      // Mettre à jour l'événement
      const updatedEvent = await Event.findByIdAndUpdate(
        id,
        { $set: updateData },
        { new: true }
      );
      
      res.status(200).json({
        message: 'Événement mis à jour avec succès',
        event: updatedEvent
      });
    } catch (error) {
      console.error('❌ Erreur dans updateEvent:', error);
      res.status(500).json({ message: 'Erreur lors de la mise à jour de l\'événement', error: error.message });
    }
  },
  
  /**
   * Supprimer un événement
   */
  deleteEvent: async (req, res) => {
    try {
      const { id } = req.params;
      
      // Vérifier que l'événement existe
      const event = await Event.findById(id);
      if (!event) {
        return res.status(404).json({ message: 'Événement non trouvé' });
      }
      
      // Supprimer l'événement
      await Event.findByIdAndDelete(id);
      
      res.status(200).json({ message: 'Événement supprimé avec succès' });
    } catch (error) {
      console.error('❌ Erreur dans deleteEvent:', error);
      res.status(500).json({ message: 'Erreur lors de la suppression de l\'événement', error: error.message });
    }
  },
  
  /**
   * Ajouter un événement aux favoris d'un utilisateur
   */
  addToFavorites: async (req, res) => {
    try {
      const { userId } = req.params;
      const { eventId } = req.body;
      
      if (!userId || !eventId) {
        return res.status(400).json({ message: 'ID utilisateur et ID événement requis' });
      }
      
      // Vérifier que l'utilisateur existe
      const user = await UserChoice.findById(userId);
      if (!user) {
        return res.status(404).json({ message: 'Utilisateur non trouvé' });
      }
      
      // Vérifier que l'événement existe
      const event = await Event.findById(eventId);
      if (!event) {
        return res.status(404).json({ message: 'Événement non trouvé' });
      }
      
      // Vérifier si l'événement est déjà dans les favoris
      if (user.followingEvents && user.followingEvents.includes(eventId)) {
        return res.status(400).json({ message: 'Événement déjà dans les favoris' });
      }
      
      // Ajouter l'événement aux favoris
      if (!user.followingEvents) {
        user.followingEvents = [];
      }
      user.followingEvents.push(eventId);
      await user.save();
      
      res.status(200).json({ message: 'Événement ajouté aux favoris' });
    } catch (error) {
      console.error('❌ Erreur dans addToFavorites:', error);
      res.status(500).json({ message: 'Erreur lors de l\'ajout aux favoris', error: error.message });
    }
  },
  
  /**
   * Retirer un événement des favoris d'un utilisateur
   */
  removeFromFavorites: async (req, res) => {
    try {
      const { userId } = req.params;
      const { eventId } = req.body;
      
      if (!userId || !eventId) {
        return res.status(400).json({ message: 'ID utilisateur et ID événement requis' });
      }
      
      // Vérifier que l'utilisateur existe
      const user = await UserChoice.findById(userId);
      if (!user) {
        return res.status(404).json({ message: 'Utilisateur non trouvé' });
      }
      
      // Vérifier si l'événement est dans les favoris
      if (!user.followingEvents || !user.followingEvents.includes(eventId)) {
        return res.status(400).json({ message: 'Événement non trouvé dans les favoris' });
      }
      
      // Retirer l'événement des favoris
      user.followingEvents = user.followingEvents.filter(id => id.toString() !== eventId);
      await user.save();
      
      res.status(200).json({ message: 'Événement retiré des favoris' });
    } catch (error) {
      console.error('❌ Erreur dans removeFromFavorites:', error);
      res.status(500).json({ message: 'Erreur lors du retrait des favoris', error: error.message });
    }
  }
};

module.exports = eventController; 
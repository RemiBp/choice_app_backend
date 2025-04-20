const mongoose = require('mongoose');
const { UserChoice } = require('../models/User');
const createEventModel = require('../models/event');

// Initialize with a default model that will be replaced by setEventModel
let Event = createEventModel(mongoose.connection);

/**
 * Contrôleur pour gérer les événements
 */
const eventController = {
  /**
   * Permet de définir le modèle Event initialisé depuis le router
   * Cette fonction est cruciale pour résoudre l'erreur "Event.findById is not a function"
   */
  setEventModel: function(eventModel) {
    Event = eventModel;
    console.log('✅ Event model correctement initialisé dans le contrôleur');
  },

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
      if (req.query.category) {
        filterParams.$or = [
          { category: req.query.category },
          { catégorie: req.query.category }
        ];
      }
      
      if (req.query.producerId || req.query.venueId) {
        filterParams.$or = [
          { producerId: req.query.producerId || req.query.venueId },
          { producer_id: req.query.producerId || req.query.venueId }
        ];
      }
      
      // Filtre de date
      if (req.query.dateStart || req.query.dateEnd) {
        filterParams.$or = [];
        
        // Création du filtre pour start_date et date_debut
        const dateFilter = {};
        if (req.query.dateStart) {
          dateFilter.$gte = new Date(req.query.dateStart);
        }
        if (req.query.dateEnd) {
          dateFilter.$lte = new Date(req.query.dateEnd);
        }
        
        if (Object.keys(dateFilter).length > 0) {
          filterParams.$or.push({ start_date: dateFilter });
          filterParams.$or.push({ date_debut: { $regex: req.query.dateStart } });
        }
      }
      
      // Obtenir les événements paginés, triés par date
      const events = await Event.find(filterParams)
        .skip(skip)
        .limit(limit)
        .sort({ start_date: 1 });
      
      // Compter le nombre total de résultats pour la pagination
      const totalEvents = await Event.countDocuments(filterParams);
      
      // Convertir les événements au format frontend si nécessaire
      const formattedEvents = events.map(event => event.toFrontend ? event.toFrontend() : event);
      
      res.status(200).json({
        events: formattedEvents,
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
      
      // Convertir l'événement au format frontend si nécessaire
      const formattedEvent = event.toFrontend ? event.toFrontend() : event;
      
      res.status(200).json(formattedEvent);
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
          { title: { $regex: q, $options: 'i' } },
          { intitulé: { $regex: q, $options: 'i' } },
          { description: { $regex: q, $options: 'i' } },
          { détail: { $regex: q, $options: 'i' } },
          { venue: { $regex: q, $options: 'i' } },
          { lieu: { $regex: q, $options: 'i' } },
          { address: { $regex: q, $options: 'i' } },
          { category: { $regex: q, $options: 'i' } },
          { catégorie: { $regex: q, $options: 'i' } }
        ];
      }
      
      // Filtres supplémentaires
      if (category) {
        searchQuery.$or = [
          { category: category },
          { catégorie: category }
        ];
      }
      
      if (emotions) {
        const emotionsList = emotions.split(',');
        searchQuery.emotions = { $in: emotionsList };
      }
      
      if (tags) {
        const tagsList = tags.split(',');
        searchQuery.tags = { $in: tagsList };
      }
      
      // Filtre de date
      if (dateStart || dateEnd) {
        searchQuery.$or = [];
        
        // Création du filtre pour start_date
        if (dateStart || dateEnd) {
          const startDateFilter = {};
          if (dateStart) startDateFilter.$gte = new Date(dateStart);
          if (dateEnd) startDateFilter.$lte = new Date(dateEnd);
          
          searchQuery.$or.push({ start_date: startDateFilter });
        }
        
        // Gestion des formats de date alternatifs
        if (dateStart) {
          searchQuery.$or.push({ date_debut: { $regex: dateStart } });
        }
      }
      
      // Exécuter la recherche
      const events = await Event.find(searchQuery)
        .skip(skip)
        .limit(parseInt(limit))
        .sort({ start_date: 1 });
      
      const totalEvents = await Event.countDocuments(searchQuery);
      
      // Convertir les événements au format frontend si nécessaire
      const formattedEvents = events.map(event => event.toFrontend ? event.toFrontend() : event);
      
      res.status(200).json({
        events: formattedEvents,
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
      
      // Utiliser la méthode statique pour trouver des événements à proximité
      const events = await Event.findNearby(parseFloat(lng), parseFloat(lat), parseInt(radius) / 1000);
      
      // Filtrer par date si nécessaire
      let filteredEvents = events;
      if (dateStart || dateEnd) {
        filteredEvents = events.filter(event => {
          const eventDate = event.start_date || new Date(event.date_debut);
          if (!eventDate) return true;
          
          if (dateStart && dateEnd) {
            return eventDate >= new Date(dateStart) && eventDate <= new Date(dateEnd);
          } 
          else if (dateStart) {
            return eventDate >= new Date(dateStart);
          }
          else if (dateEnd) {
            return eventDate <= new Date(dateEnd);
          }
          return true;
        });
      }
      
      // Limiter les résultats
      const limitedEvents = filteredEvents.slice(0, parseInt(limit));
      
      // Convertir les événements au format frontend si nécessaire
      const formattedEvents = limitedEvents.map(event => event.toFrontend ? event.toFrontend() : event);
      
      res.status(200).json(formattedEvents);
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
      
      // Récupérer les événements les plus populaires basés sur les métriques d'engagement
      const events = await Event.find({})
        .sort({ 
          popularity_score: -1, 
          likes: -1, 
          views: -1,
          interest_count: -1,
          choice_count: -1
        })
        .limit(parseInt(limit));
      
      // Convertir les événements au format frontend si nécessaire
      const formattedEvents = events.map(event => event.toFrontend ? event.toFrontend() : event);
      
      res.status(200).json(formattedEvents);
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
      
      // Vérification minimale des données requises
      if (!eventData || (!eventData.title && !eventData.intitulé) || 
          (!eventData.start_date && !eventData.date_debut) ||
          (!eventData.category && !eventData.catégorie)) {
        return res.status(400).json({ message: 'Données d\'événement incomplètes' });
      }
      
      // Créer l'événement avec le nouveau modèle
      const newEvent = new Event(eventData);
      await newEvent.save();
      
      // Renvoyer l'événement au format frontend
      const formattedEvent = newEvent.toFrontend ? newEvent.toFrontend() : newEvent;
      
      res.status(201).json({
        message: 'Événement créé avec succès',
        event: formattedEvent
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
      
      // Mettre à jour la date de dernière modification
      updateData.updated_at = new Date();
      updateData.updatedAt = new Date();
      
      // Mettre à jour l'événement avec le nouveau modèle
      const updatedEvent = await Event.findByIdAndUpdate(
        id,
        { $set: updateData },
        { new: true }
      );
      
      // Renvoyer l'événement au format frontend
      const formattedEvent = updatedEvent.toFrontend ? updatedEvent.toFrontend() : updatedEvent;
      
      res.status(200).json({
        message: 'Événement mis à jour avec succès',
        event: formattedEvent
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
      
      // Incrémenter l'intérêt pour cet événement
      await Event.findByIdAndUpdate(eventId, {
        $inc: { interest_count: 1, popularity_score: 1 }
      });
      
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
      
      // Décrémenter l'intérêt pour cet événement
      await Event.findByIdAndUpdate(eventId, {
        $inc: { interest_count: -1 }
      });
      
      res.status(200).json({ message: 'Événement retiré des favoris' });
    } catch (error) {
      console.error('❌ Erreur dans removeFromFavorites:', error);
      res.status(500).json({ message: 'Erreur lors du retrait des favoris', error: error.message });
    }
  }
};

module.exports = eventController; 
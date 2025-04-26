const mongoose = require('mongoose');
// Keep Producer model import if it defines the schema, but we won't use the variable directly here for querying.
// const { Producer } = require('../models/Producer'); 
const { UserChoice } = require('../models/User'); // Assuming User model is on default connection or handled separately
const { getModel } = require('../models');

/**
 * Contrôleur pour gérer les producteurs (restaurants principalement)
 */
const producerController = {
  /**
   * Obtenir tous les producteurs avec pagination
   */
  getAllProducers: async (req, res) => {
    const ProducerModel = getModel('Producer');
    if (!ProducerModel) {
      return res.status(500).json({ message: 'Producer model not initialized' });
    }
    try {
      // Paramètres de pagination
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 20;
      const skip = (page - 1) * limit;
      
      // Filtres
      const filterParams = {};
      if (req.query.category) filterParams.category = req.query.category;
      if (req.query.cuisine) filterParams.cuisine = req.query.cuisine;
      if (req.query.rating) filterParams.rating = { $gte: parseFloat(req.query.rating) };
      if (req.query.price_level) filterParams.price_level = { $lte: parseInt(req.query.price_level) };
      
      // Obtenir les producteurs paginés
      const producers = await ProducerModel.find(filterParams)
        .skip(skip)
        .limit(limit)
        .sort({ rating: -1 }); // Assurez-vous que le tri est pertinent
      
      // Compter le nombre total de résultats pour la pagination
      const totalProducers = await ProducerModel.countDocuments(filterParams);
      
      res.status(200).json({
        producers,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(totalProducers / limit),
          totalItems: totalProducers,
          hasNextPage: page < Math.ceil(totalProducers / limit),
          hasPrevPage: page > 1
        }
      });
    } catch (error) {
      console.error('❌ Erreur dans getAllProducers:', error);
      res.status(500).json({ message: 'Erreur lors de la récupération des producteurs', error: error.message });
    }
  },
  
  /**
   * Obtenir un producteur par ID
   */
  getProducerById: async (req, res) => {
    const ProducerModel = getModel('Producer');
    if (!ProducerModel) {
      return res.status(500).json({ success: false, message: 'Producer model not initialized.'});
    }
    try {
      const { id } = req.params;
      console.log(`🔍 [producerController] Tentative d'accès au modèle 'Producer' sur restaurationDb.`);
      const producer = await ProducerModel.findById(id);
      
      if (!producer) {
         // Log more details if producer is not found
         console.warn(`⚠️ Producteur non trouvé pour ID: ${id}`);
        return res.status(404).json({ success: false, message: 'Producteur non trouvé' });
      }
      
      res.status(200).json(producer); // Send the producer data directly
    } catch (error) {
      console.error(`❌ Erreur dans getProducerById pour ID ${req.params.id}:`, error);
      // Check for specific Mongoose CastError (invalid ID format)
      if (error instanceof mongoose.Error.CastError) {
         return res.status(400).json({ success: false, message: 'Format ID invalide', error: error.message });
      }
      res.status(500).json({ success: false, message: 'Erreur serveur lors de la récupération du producteur', error: error.message });
    }
  },
  
  /**
   * Obtenir uniquement la localisation d\'un producteur par ID
   */
  getProducerLocationById: async (req, res) => {
    try {
      const ProducerModel = getModel('Producer');
      if (!ProducerModel) {
        console.error('Error: Producer model not initialized in getProducerLocationById.');
        return res.status(500).json({ message: 'Producer model error' });
      }
      
      const producer = await ProducerModel.findById(req.params.id).select('name geometry gps_coordinates').lean();

      if (!producer) {
        return res.status(404).json({ message: 'Producteur non trouvé.' });
      }

      let latitude = null;
      let longitude = null;

      // 1. Check geometry.location first
      if (producer.geometry?.location?.lat != null && producer.geometry?.location?.lng != null) {
        latitude = producer.geometry.location.lat;
        longitude = producer.geometry.location.lng;
        console.log(`📍 Location found for ${producer.name} in geometry.location`);
      }
      // 2. If not found, check gps_coordinates (GeoJSON format: [longitude, latitude])
      else if (producer.gps_coordinates?.coordinates?.length === 2) {
        longitude = producer.gps_coordinates.coordinates[0];
        latitude = producer.gps_coordinates.coordinates[1];
         console.log(`📍 Location found for ${producer.name} in gps_coordinates`);
      }

      // Convert to numbers just in case they are stored as strings
      latitude = typeof latitude === 'string' ? parseFloat(latitude) : latitude;
      longitude = typeof longitude === 'string' ? parseFloat(longitude) : longitude;

      // Check if valid numbers were found
      if (typeof latitude === 'number' && !isNaN(latitude) && typeof longitude === 'number' && !isNaN(longitude)) {
        res.status(200).json({ latitude, longitude });
      } else {
        // Location not found in either field or invalid
        console.warn(`⚠️ Localisation manquante ou invalide pour le producteur: ${producer.name} (ID: ${req.params.id})`);
        res.status(404).json({ message: 'Localisation du producteur introuvable.' });
      }

    } catch (error) {
      console.error(`❌ Erreur lors de la récupération de la localisation pour ${req.params.id}:`, error);
      res.status(500).json({ message: 'Erreur serveur lors de la récupération de la localisation.', error: error.message });
    }
  },
  
  /**
   * Rechercher des producteurs
   */
  searchProducers: async (req, res) => {
    const ProducerModel = getModel('Producer');
    if (!ProducerModel) {
      return res.status(500).json({ message: 'Producer model not initialized' });
    }
    try {
      const { q, category, cuisine, tags, page = 1, limit = 20 } = req.query;
      const skip = (parseInt(page) - 1) * parseInt(limit);
      
      // Construire la requête de recherche
      const searchQuery = {};
      
      // Recherche textuelle si query est fournie
      if (q) {
        // Consider adding a text index in MongoDB for better performance
        searchQuery.$or = [
          { name: { $regex: q, $options: 'i' } },
          { description: { $regex: q, $options: 'i' } },
          { cuisine: { $regex: q, $options: 'i' } },
          { tags: { $regex: q, $options: 'i' } } // Be careful searching tags with regex if it's an array
        ];
      }
      
      // Filtres supplémentaires
      if (category) searchQuery.category = category;
      if (cuisine) searchQuery.cuisine = cuisine;
      if (tags) searchQuery.tags = { $in: tags.split(',') }; // Assumes tags is a comma-separated string
      
      // Exécuter la recherche
      const producers = await ProducerModel.find(searchQuery)
        .skip(skip)
        .limit(parseInt(limit))
        .sort({ rating: -1 }); // Ensure 'rating' exists and is sortable
      
      const totalProducers = await ProducerModel.countDocuments(searchQuery);
      
      res.status(200).json({
        producers,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(totalProducers / parseInt(limit)),
          totalItems: totalProducers,
          hasNextPage: parseInt(page) < Math.ceil(totalProducers / parseInt(limit)),
          hasPrevPage: parseInt(page) > 1
        }
      });
    } catch (error) {
      console.error('❌ Erreur dans searchProducers:', error);
      res.status(500).json({ message: 'Erreur lors de la recherche de producteurs', error: error.message });
    }
  },
  
  /**
   * Obtenir les producteurs à proximité
   */
  getNearbyProducers: async (req, res) => {
    const ProducerModel = getModel('Producer');
    if (!ProducerModel) {
      return res.status(500).json({ message: 'Producer model not initialized' });
    }
    try {
      const { lat, lng, radius = 5000, limit = 20 } = req.query;
      
      if (!lat || !lng) {
        return res.status(400).json({ message: 'Les coordonnées (lat, lng) sont requises' });
      }
      
      // Assumes a 2dsphere index exists on the 'location' field
      // The location field should be GeoJSON format, e.g., { type: 'Point', coordinates: [lng, lat] }
      const producers = await ProducerModel.find({
        location: { // Ensure 'location' is the correct field name for GeoJSON
          $nearSphere: {
            $geometry: {
              type: "Point",
              coordinates: [parseFloat(lng), parseFloat(lat)]
            },
            $maxDistance: parseInt(radius) // Radius in meters
          }
        }
      }).limit(parseInt(limit));
      
      res.status(200).json(producers);
    } catch (error) {
      console.error('❌ Erreur dans getNearbyProducers:', error);
      res.status(500).json({ message: 'Erreur lors de la récupération des producteurs à proximité', error: error.message });
    }
  },
  
  /**
   * Obtenir les événements d'un producteur
   */
  getProducerEvents: async (req, res) => {
    const ProducerModel = getModel('Producer');
    if (!ProducerModel) {
      return res.status(500).json({ message: 'Producer model not initialized' });
    }
    try {
      const { id } = req.params;
      const producer = await ProducerModel.findById(id).select('events'); // Only select events
      
      if (!producer) {
        return res.status(404).json({ message: 'Producteur non trouvé' });
      }
      
      // Return events array or empty array if not present/not an array
      res.status(200).json(Array.isArray(producer.events) ? producer.events : []);
      
    } catch (error) {
      console.error(`❌ Erreur dans getProducerEvents pour ID ${req.params.id}:`, error);
       if (error instanceof mongoose.Error.CastError) {
         return res.status(400).json({ message: 'Format ID invalide', error: error.message });
      }
      res.status(500).json({ message: 'Erreur lors de la récupération des événements du producteur', error: error.message });
    }
  },
  
  /**
   * Ajouter un producteur aux favoris d'un utilisateur
   */
  addToFavorites: async (req, res) => {
    const ProducerModel = getModel('Producer');
    const UserChoiceModel = getModel('UserChoice'); // Assuming UserChoice model exists
    if (!ProducerModel || !UserChoiceModel) {
       return res.status(500).json({ message: 'Required models not initialized' });
     }
    try {
      const { userId } = req.params; // Assuming userId comes from URL param
      const { producerId } = req.body; // Assuming producerId comes from request body
      
      if (!userId || !producerId) {
        return res.status(400).json({ message: 'ID utilisateur et ID producteur requis' });
      }
      
      // --- Validate IDs ---
      if (!mongoose.Types.ObjectId.isValid(userId)) {
         return res.status(400).json({ message: 'Format ID utilisateur invalide' });
      }
       if (!mongoose.Types.ObjectId.isValid(producerId)) {
         return res.status(400).json({ message: 'Format ID producteur invalide' });
      }
      
      // --- Check if user exists (assuming UserChoice model is available) ---
      // IMPORTANT: Adjust this if UserChoice is on a different connection
      const user = await UserChoiceModel.findById(userId);
      if (!user) {
        return res.status(404).json({ message: 'Utilisateur non trouvé' });
      }
      
      // --- Check if producer exists ---
      const producer = await ProducerModel.findById(producerId);
      if (!producer) {
        return res.status(404).json({ message: 'Producteur non trouvé' });
      }
      
      // --- Add producer to favorites (if not already present) ---
      // Assuming user.favorites is an array of ObjectIds
      if (!user.favorites || !Array.isArray(user.favorites)) {
         user.favorites = []; // Initialize if doesn't exist or wrong type
      }

      if (!user.favorites.includes(producerId)) {
        user.favorites.push(producerId);
        await user.save();
        res.status(200).json({ message: 'Producteur ajouté aux favoris avec succès', favorites: user.favorites });
      } else {
        res.status(200).json({ message: 'Producteur déjà dans les favoris', favorites: user.favorites });
      }
      
    } catch (error) {
      console.error(`❌ Erreur dans addToFavorites (User: ${req.params.userId}, Producer: ${req.body.producerId}):`, error);
      res.status(500).json({ message: 'Erreur lors de l\'ajout aux favoris', error: error.message });
    }
  },
  
  /**
   * Obtenir les relations d'un producteur
   */
  getProducerRelations: async (req, res) => {
    const ProducerModel = getModel('Producer');
    if (!ProducerModel) {
      return res.status(500).json({ message: 'Producer model not initialized' });
    }
    try {
        const { id } = req.params;
        const producer = await ProducerModel.findById(id)
            .populate('followers.users', 'name photo _id')
            .populate('following.users', 'name photo _id')
            .populate('choiceUsers.userId', 'name photo _id')
            .populate('interestedUsers.users', 'name photo _id');
      
      if (!producer) {
        return res.status(404).json({ message: 'Producteur non trouvé' });
      }
      
        // Construct the response object, ensuring default structures
        const relations = {
            followers: producer.followers || { count: 0, users: [] },
            following: producer.following || { count: 0, users: [] },
            choiceUsers: producer.choiceUsers || { count: 0, users: [] },
            interestedUsers: producer.interestedUsers || { count: 0, users: [] },
        };

        res.status(200).json(relations);
    } catch (error) {
        console.error(`❌ Erreur dans getProducerRelations pour ID ${req.params.id}:`, error);
        if (error instanceof mongoose.Error.CastError) {
          return res.status(400).json({ message: 'Format ID invalide', error: error.message });
        }
        res.status(500).json({ message: 'Erreur serveur lors de la récupération des relations', error: error.message });
    }
  },

  // ... (Rest of the controller functions need similar modification) ...
  // Make sure ALL functions using RestaurantProducer now use restaurationDb.model('Producer')
  // Remember to add the !restaurationDb check at the beginning of each async function.

}; // End of producerController object

module.exports = producerController;
const mongoose = require('mongoose');
const { Producer } = require('../models/Producer');
const { UserChoice } = require('../models/User');

// Variable pour stocker la connexion à la base de données
let restaurationDb;
let RestaurantProducer;

// Fonction d'initialisation à appeler après l'établissement de la connexion MongoDB
const initialize = (db) => {
  if (db && db.restaurationDb) {
    restaurationDb = db.restaurationDb;
    
    // Initialiser le modèle RestaurantProducer
    RestaurantProducer = restaurationDb.model('Producer', new mongoose.Schema({}), 'producers');
  }
};

/**
 * Contrôleur pour gérer les producteurs (restaurants principalement)
 */
const producerController = {
  /**
   * Obtenir tous les producteurs avec pagination
   */
  getAllProducers: async (req, res) => {
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
      const producers = await RestaurantProducer.find(filterParams)
        .skip(skip)
        .limit(limit)
        .sort({ rating: -1 });
      
      // Compter le nombre total de résultats pour la pagination
      const totalProducers = await RestaurantProducer.countDocuments(filterParams);
      
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
    try {
      const { id } = req.params;
      const producer = await RestaurantProducer.findById(id);
      
      if (!producer) {
        return res.status(404).json({ message: 'Producteur non trouvé' });
      }
      
      res.status(200).json(producer);
    } catch (error) {
      console.error('❌ Erreur dans getProducerById:', error);
      res.status(500).json({ message: 'Erreur lors de la récupération du producteur', error: error.message });
    }
  },
  
  /**
   * Rechercher des producteurs
   */
  searchProducers: async (req, res) => {
    try {
      const { q, category, cuisine, tags, page = 1, limit = 20 } = req.query;
      const skip = (parseInt(page) - 1) * parseInt(limit);
      
      // Construire la requête de recherche
      const searchQuery = {};
      
      // Recherche textuelle si query est fournie
      if (q) {
        searchQuery.$or = [
          { name: { $regex: q, $options: 'i' } },
          { description: { $regex: q, $options: 'i' } },
          { cuisine: { $regex: q, $options: 'i' } },
          { tags: { $regex: q, $options: 'i' } }
        ];
      }
      
      // Filtres supplémentaires
      if (category) searchQuery.category = category;
      if (cuisine) searchQuery.cuisine = cuisine;
      if (tags) searchQuery.tags = { $in: tags.split(',') };
      
      // Exécuter la recherche
      const producers = await RestaurantProducer.find(searchQuery)
        .skip(skip)
        .limit(parseInt(limit))
        .sort({ rating: -1 });
      
      const totalProducers = await RestaurantProducer.countDocuments(searchQuery);
      
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
    try {
      const { lat, lng, radius = 5000, limit = 20 } = req.query;
      
      if (!lat || !lng) {
        return res.status(400).json({ message: 'Les coordonnées (lat, lng) sont requises' });
      }
      
      // Recherche géospatiale
      const producers = await RestaurantProducer.find({
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
      console.error('❌ Erreur dans getNearbyProducers:', error);
      res.status(500).json({ message: 'Erreur lors de la récupération des producteurs à proximité', error: error.message });
    }
  },
  
  /**
   * Obtenir les événements d'un producteur
   */
  getProducerEvents: async (req, res) => {
    try {
      const { id } = req.params;
      const producer = await RestaurantProducer.findById(id);
      
      if (!producer) {
        return res.status(404).json({ message: 'Producteur non trouvé' });
      }
      
      // Si le producteur a des événements, les retourner
      if (producer.events && Array.isArray(producer.events)) {
        return res.status(200).json(producer.events);
      }
      
      // Par défaut, retourner un tableau vide
      res.status(200).json([]);
    } catch (error) {
      console.error('❌ Erreur dans getProducerEvents:', error);
      res.status(500).json({ message: 'Erreur lors de la récupération des événements du producteur', error: error.message });
    }
  },
  
  /**
   * Ajouter un producteur aux favoris d'un utilisateur
   */
  addToFavorites: async (req, res) => {
    try {
      const { userId } = req.params;
      const { producerId } = req.body;
      
      if (!userId || !producerId) {
        return res.status(400).json({ message: 'ID utilisateur et ID producteur requis' });
      }
      
      // Vérifier que l'utilisateur existe
      const user = await UserChoice.findById(userId);
      if (!user) {
        return res.status(404).json({ message: 'Utilisateur non trouvé' });
      }
      
      // Vérifier que le producteur existe
      const producer = await RestaurantProducer.findById(producerId);
      if (!producer) {
        return res.status(404).json({ message: 'Producteur non trouvé' });
      }
      
      // Vérifier si le producteur est déjà dans les favoris
      if (user.followingProducers && user.followingProducers.includes(producerId)) {
        return res.status(400).json({ message: 'Producteur déjà dans les favoris' });
      }
      
      // Ajouter le producteur aux favoris
      if (!user.followingProducers) {
        user.followingProducers = [];
      }
      user.followingProducers.push(producerId);
      await user.save();
      
      res.status(200).json({ message: 'Producteur ajouté aux favoris' });
    } catch (error) {
      console.error('❌ Erreur dans addToFavorites:', error);
      res.status(500).json({ message: 'Erreur lors de l\'ajout aux favoris', error: error.message });
    }
  },
  
  /**
   * Retirer un producteur des favoris d'un utilisateur
   */
  removeFromFavorites: async (req, res) => {
    try {
      const { userId } = req.params;
      const { producerId } = req.body;
      
      if (!userId || !producerId) {
        return res.status(400).json({ message: 'ID utilisateur et ID producteur requis' });
      }
      
      // Vérifier que l'utilisateur existe
      const user = await UserChoice.findById(userId);
      if (!user) {
        return res.status(404).json({ message: 'Utilisateur non trouvé' });
      }
      
      // Vérifier si le producteur est dans les favoris
      if (!user.followingProducers || !user.followingProducers.includes(producerId)) {
        return res.status(400).json({ message: 'Producteur non trouvé dans les favoris' });
      }
      
      // Retirer le producteur des favoris
      user.followingProducers = user.followingProducers.filter(id => id.toString() !== producerId);
      await user.save();
      
      res.status(200).json({ message: 'Producteur retiré des favoris' });
    } catch (error) {
      console.error('❌ Erreur dans removeFromFavorites:', error);
      res.status(500).json({ message: 'Erreur lors du retrait des favoris', error: error.message });
    }
  },
  
  /**
   * Obtenir les relations d'un producteur (followers, following, choiceUsers, interestedUsers)
   */
  getProducerRelations: async (req, res) => {
    try {
      const { producerId } = req.params;
      
      // Vérifier que le producteur existe en utilisant une connexion de secours si nécessaire
      let producer;
      if (RestaurantProducer) {
        // Utiliser le modèle s'il est initialisé
        producer = await RestaurantProducer.findById(producerId).select(
          'followers following choiceUsers interestedUsers'
        );
      } else {
        // Créer un modèle temporaire si le modèle principal n'est pas initialisé
        console.log('⚠️ RestaurantProducer non initialisé, utilisation d\'un modèle temporaire');
        const tempModel = global.db.restaurationDb.model(
          'Producer', 
          new mongoose.Schema({}, { strict: false }), 
          'producers'
        );
        producer = await tempModel.findById(producerId).select(
          'followers following choiceUsers interestedUsers'
        );
      }
      
      if (!producer) {
        return res.status(404).json({ message: 'Producteur non trouvé' });
      }
      
      // Robust fallback: always return arrays, even if fields are missing or malformed
      const followersArr = Array.isArray(producer.followers) ? producer.followers : [];
      const followingArr = Array.isArray(producer.following) ? producer.following : [];
      // choiceUsers can be array of IDs or array of objects {userId}
      let choiceUsersArr = [];
      if (Array.isArray(producer.choiceUsers)) {
        if (producer.choiceUsers.length > 0 && typeof producer.choiceUsers[0] === 'object' && producer.choiceUsers[0] !== null && 'userId' in producer.choiceUsers[0]) {
          choiceUsersArr = producer.choiceUsers.map(obj => obj.userId);
        } else {
          choiceUsersArr = producer.choiceUsers;
        }
      }
      const interestedUsersArr = Array.isArray(producer.interestedUsers) ? producer.interestedUsers : [];

      const data = {
        followers: {
          count: followersArr.length,
          users: followersArr.map(id => id.toString()),
        },
        following: {
          count: followingArr.length,
          users: followingArr.map(id => id.toString()),
        },
        choiceUsers: {
          count: choiceUsersArr.length,
          users: choiceUsersArr.map(id => id.toString()),
        },
        interestedUsers: {
          count: interestedUsersArr.length,
          users: interestedUsersArr.map(id => id.toString()),
        },
      };
      
      res.status(200).json(data);
    } catch (error) {
      console.error('❌ Erreur dans getProducerRelations:', error);
      res.status(500).json({ message: 'Erreur lors de la récupération des relations', error: error.message });
    }
  }
};

// Exporter à la fois le contrôleur et la fonction d'initialisation
module.exports = producerController;
producerController.initialize = initialize; 
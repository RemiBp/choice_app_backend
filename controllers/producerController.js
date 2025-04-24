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
   * Obtenir uniquement la localisation d'un producteur par ID
   */
  getProducerLocationById: async (req, res) => {
    try {
      const { id } = req.params;
      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ message: 'ID producteur invalide' });
      }

      // Utiliser ProducerModel ou une fonction équivalente si vous utilisez initialize
      // Si RestaurantProducer est initialisé :
      const producer = await RestaurantProducer.findById(id).select('geometry.location name'); // Select name for context

      if (!producer) {
        return res.status(404).json({ message: 'Producteur non trouvé' });
      }

      // Vérifier si la localisation existe
      if (!producer.geometry || !producer.geometry.location || producer.geometry.location.lat == null || producer.geometry.location.lng == null) {
         console.log(`⚠️ Localisation manquante pour le producteur: ${producer.name} (ID: ${id})`);
         return res.status(404).json({ message: 'Localisation du producteur introuvable.' });
      }

      // Retourner uniquement les coordonnées lat/lng
      res.status(200).json({
        latitude: producer.geometry.location.lat,
        longitude: producer.geometry.location.lng
      });

    } catch (error) {
      console.error(`❌ Erreur dans getProducerLocationById pour ID ${req.params.id}:`, error);
      res.status(500).json({ message: 'Erreur serveur lors de la récupération de la localisation', error: error.message });
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
  },

  // Récupérer tous les producteurs
  async getAllProducers(req, res) {
    try {
      const producers = await Producer.find({});
      res.json(producers);
    } catch (error) {
      console.error('❌ Erreur lors de la récupération des producteurs:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Erreur serveur', 
        error: error.message 
      });
    }
  },

  // Récupérer un producteur par son ID
  async getProducerById(req, res) {
    try {
      const producer = await Producer.findById(req.params.id);
      if (!producer) {
        return res.status(404).json({ 
          success: false, 
          message: 'Producteur non trouvé' 
        });
      }
      res.json(producer);
    } catch (error) {
      console.error(`❌ Erreur lors de la récupération du producteur ${req.params.id}:`, error);
      res.status(500).json({ 
        success: false, 
        message: 'Erreur serveur', 
        error: error.message 
      });
    }
  },

  // Créer un nouvel élément de menu
  async addMenuItem(req, res) {
    try {
      const producerId = req.params.id;
      
      // Récupérer les données du plat du corps de la requête
      const { 
        name, 
        description, 
        price, 
        category,
        nutritional_info 
      } = req.body;
      
      // Validation des données
      if (!name || !price) {
        return res.status(400).json({ 
          success: false, 
          message: 'Le nom et le prix sont obligatoires' 
        });
      }
      
      // Générer un ID unique pour l'élément de menu
      const itemId = new mongoose.Types.ObjectId().toString();
      
      // Créer l'objet du nouvel élément
      const newItem = {
        _id: itemId,
        name,
        description: description || '',
        price,
        category: category || 'Autre',
        nutritional_info: nutritional_info || {},
        created_at: new Date()
      };
      
      // Ajouter l'élément à la collection menu_items du producteur
      const result = await Producer.findByIdAndUpdate(
        producerId,
        { 
          $push: { menu_items: newItem } 
        },
        { new: true }
      );
      
      if (!result) {
        return res.status(404).json({ 
          success: false, 
          message: 'Producteur non trouvé' 
        });
      }
      
      res.status(201).json({
        success: true,
        message: 'Élément de menu ajouté avec succès',
        item: newItem
      });
    } catch (error) {
      console.error('❌ Erreur lors de l\'ajout d\'un élément de menu:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Erreur serveur', 
        error: error.message 
      });
    }
  },

  // Créer un nouveau menu (ensemble de plats)
  async createMenu(req, res) {
    try {
      const producerId = req.params.id;
      
      // Récupérer les données du menu du corps de la requête
      const { 
        name, 
        description, 
        price, 
        items // Liste d'IDs d'éléments de menu
      } = req.body;
      
      // Validation des données
      if (!name || !price || !items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ 
          success: false, 
          message: 'Le nom, le prix et au moins un plat sont obligatoires' 
        });
      }
      
      // Récupérer le producteur pour vérifier les éléments de menu
      const producer = await Producer.findById(producerId);
      
      if (!producer) {
        return res.status(404).json({ 
          success: false, 
          message: 'Producteur non trouvé' 
        });
      }
      
      // Vérifier que tous les éléments existent
      const menuItems = producer.menu_items || [];
      const validItems = items.filter(itemId => 
        menuItems.some(item => item._id && item._id.toString() === itemId)
      );
      
      if (validItems.length === 0) {
        return res.status(400).json({ 
          success: false, 
          message: 'Aucun plat valide trouvé parmi les IDs fournis' 
        });
      }
      
      // Générer un ID unique pour le menu
      const menuId = new mongoose.Types.ObjectId().toString();
      
      // Créer l'objet du nouveau menu
      const newMenu = {
        _id: menuId,
        name,
        description: description || '',
        price,
        items: validItems,
        created_at: new Date()
      };
      
      // Ajouter le menu à la collection menu du producteur
      const result = await Producer.findByIdAndUpdate(
        producerId,
        { 
          $push: { menu: newMenu } 
        },
        { new: true }
      );
      
      res.status(201).json({
        success: true,
        message: 'Menu créé avec succès',
        menu: newMenu
      });
    } catch (error) {
      console.error('❌ Erreur lors de la création d\'un menu:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Erreur serveur', 
        error: error.message 
      });
    }
  },

  // Ajouter une photo au producteur
  async addPhoto(req, res) {
    try {
      const producerId = req.params.id;
      const { photo, filename } = req.body;
      
      // Validation de la photo (base64)
      if (!photo) {
        return res.status(400).json({ 
          success: false, 
          message: 'Une photo est requise' 
        });
      }
      
      // En production, il faudrait:
      // 1. Valider le format de l'image
      // 2. Redimensionner l'image si nécessaire
      // 3. Compresser l'image
      // 4. Stocker sur un service comme AWS S3, Cloudinary, etc.
      
      // Pour ce MVP, simulons un upload réussi avec une URL fictive
      // Dans un environnement de production, cette URL proviendrait du service de stockage
      const photoUrl = `https://storage.example.com/producers/${producerId}/photos/${Date.now()}_${filename || 'photo.jpg'}`;
      
      // Ajouter l'URL de la photo à la liste des photos du producteur
      const result = await Producer.findByIdAndUpdate(
        producerId,
        { 
          $push: { photos: photoUrl } 
        },
        { new: true }
      );
      
      if (!result) {
        return res.status(404).json({ 
          success: false, 
          message: 'Producteur non trouvé' 
        });
      }
      
      res.status(201).json({
        success: true,
        message: 'Photo ajoutée avec succès',
        photoUrl
      });
    } catch (error) {
      console.error('❌ Erreur lors de l\'ajout d\'une photo:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Erreur serveur', 
        error: error.message 
      });
    }
  },

  // Créer un nouveau post pour un producteur
  async createPost(req, res) {
    try {
      const producerId = req.params.id;
      const { content, media } = req.body;
      
      // Validation
      if (!content) {
        return res.status(400).json({ 
          success: false, 
          message: 'Le contenu du post est obligatoire' 
        });
      }
      
      // Récupérer le producteur pour vérifier son existence
      const producer = await Producer.findById(producerId);
      
      if (!producer) {
        return res.status(404).json({ 
          success: false, 
          message: 'Producteur non trouvé' 
        });
      }
      
      // Créer un nouvel ID pour le post
      const postId = new mongoose.Types.ObjectId().toString();
      
      // Structure du post
      const newPost = {
        _id: postId,
        producer_id: producerId,
        content,
        media: media || [],
        author_name: producer.name,
        author_photo: producer.photo,
        created_at: new Date(),
        likes: [],
        comments: [],
        interested: [],
        choices: []
      };
      
      // Dans un environnement réel, il faudrait:
      // 1. Stocker ce post dans une collection 'posts' séparée
      // 2. Créer une référence au post dans le document du producteur
      
      // Pour ce MVP, simulons l'enregistrement du post
      // Ajouter l'ID du post à la liste des posts du producteur
      await Producer.findByIdAndUpdate(
        producerId,
        { 
          $push: { posts: postId } 
        }
      );
      
      // Stocker le post dans une collection 'posts' (simulé ici)
      // Dans un environnement réel, cela serait fait avec un modèle Mongoose dédié
      console.log(`✅ Post créé pour le producteur ${producerId}: ${postId}`);
      
      res.status(201).json({
        success: true,
        message: 'Post créé avec succès',
        post: newPost
      });
    } catch (error) {
      console.error('❌ Erreur lors de la création d\'un post:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Erreur serveur', 
        error: error.message 
      });
    }
  },

  // Uploader un média (image ou vidéo)
  async uploadMedia(req, res) {
    try {
      const { file, filename, type } = req.body;
      
      // Validation du fichier (base64)
      if (!file || !filename) {
        return res.status(400).json({ 
          success: false, 
          message: 'Le fichier et le nom de fichier sont obligatoires' 
        });
      }
      
      // En production, il faudrait:
      // 1. Valider le format du fichier
      // 2. Redimensionner/Compresser si nécessaire
      // 3. Stocker sur un service comme AWS S3, Cloudinary, etc.
      
      // Pour ce MVP, simulons un upload réussi avec une URL fictive
      const mediaUrl = `https://storage.example.com/media/${Date.now()}_${filename}`;
      
      res.status(201).json({
        success: true,
        message: 'Média uploadé avec succès',
        url: mediaUrl,
        type: type || 'image'
      });
    } catch (error) {
      console.error('❌ Erreur lors de l\'upload d\'un média:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Erreur serveur', 
        error: error.message 
      });
    }
  }
};

// Exporter à la fois le contrôleur et la fonction d'initialisation
module.exports = producerController;
producerController.initialize = initialize; 
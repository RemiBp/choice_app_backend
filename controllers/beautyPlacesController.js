const BeautyPlace = require('../models/BeautyPlace');
const WellnessPlace = require('../models/WellnessPlace');
const { UserChoice } = require('../models/User');

/**
 * Contrôleur pour gérer les établissements de beauté
 */
const beautyPlacesController = {
  /**
   * Obtenir tous les établissements de beauté
   */
  getAllBeautyPlaces: async (req, res) => {
    try {
      // Paramètres de pagination
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 20;
      const skip = (page - 1) * limit;

      // Filtres
      const filterParams = {};
      if (req.query.category) filterParams.category = req.query.category;
      if (req.query.tags) filterParams.tags = { $in: req.query.tags.split(',') };
      if (req.query.specialties) filterParams.specialties = { $in: req.query.specialties.split(',') };
      if (req.query.rating) filterParams.rating = { $gte: parseFloat(req.query.rating) };
      if (req.query.price_level) filterParams.price_level = { $lte: parseInt(req.query.price_level) };
      if (req.query.is_bio === 'true') filterParams.is_bio = true;
      
      // Obtenir les établissements paginés
      const beautyPlaces = await BeautyPlace.find(filterParams)
        .skip(skip)
        .limit(limit)
        .sort({ rating: -1 });

      // Compter le nombre total de résultats pour la pagination
      const totalPlaces = await BeautyPlace.countDocuments(filterParams);

      res.status(200).json({
        beautyPlaces,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(totalPlaces / limit),
          totalItems: totalPlaces,
          hasNextPage: page < Math.ceil(totalPlaces / limit),
          hasPrevPage: page > 1
        }
      });
    } catch (error) {
      console.error('❌ Erreur dans getAllBeautyPlaces:', error);
      res.status(500).json({ message: 'Erreur lors de la récupération des établissements de beauté', error: error.message });
    }
  },

  /**
   * Obtenir un établissement de beauté par ID
   */
  getBeautyPlaceById: async (req, res) => {
    try {
      const { id } = req.params;
      const beautyPlace = await BeautyPlace.findById(id);

      if (!beautyPlace) {
        return res.status(404).json({ message: 'Établissement de beauté non trouvé' });
      }

      res.status(200).json(beautyPlace);
    } catch (error) {
      console.error('❌ Erreur dans getBeautyPlaceById:', error);
      res.status(500).json({ message: 'Erreur lors de la récupération de l\'établissement de beauté', error: error.message });
    }
  },

  /**
   * Recherche d'établissements de beauté
   */
  searchBeautyPlaces: async (req, res) => {
    try {
      const { q, category, tags, specialties, page = 1, limit = 20 } = req.query;
      const skip = (parseInt(page) - 1) * parseInt(limit);

      // Construire la requête de recherche
      const searchQuery = {};

      // Recherche textuelle si query est fournie
      if (q) {
        searchQuery.$or = [
          { name: { $regex: q, $options: 'i' } },
          { description: { $regex: q, $options: 'i' } },
          { tags: { $regex: q, $options: 'i' } },
          { specialties: { $regex: q, $options: 'i' } }
        ];
      }

      // Filtres supplémentaires
      if (category) searchQuery.category = category;
      if (tags) searchQuery.tags = { $in: tags.split(',') };
      if (specialties) searchQuery.specialties = { $in: specialties.split(',') };

      // Exécuter la recherche
      const beautyPlaces = await BeautyPlace.find(searchQuery)
        .skip(skip)
        .limit(parseInt(limit))
        .sort({ rating: -1 });

      const totalPlaces = await BeautyPlace.countDocuments(searchQuery);

      res.status(200).json({
        beautyPlaces,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(totalPlaces / parseInt(limit)),
          totalItems: totalPlaces,
          hasNextPage: parseInt(page) < Math.ceil(totalPlaces / parseInt(limit)),
          hasPrevPage: parseInt(page) > 1
        }
      });
    } catch (error) {
      console.error('❌ Erreur dans searchBeautyPlaces:', error);
      res.status(500).json({ message: 'Erreur lors de la recherche d\'établissements de beauté', error: error.message });
    }
  },

  /**
   * Obtenir les établissements de beauté à proximité
   */
  getNearbyBeautyPlaces: async (req, res) => {
    try {
      const { lat, lng, radius = 5000, limit = 20 } = req.query;

      if (!lat || !lng) {
        return res.status(400).json({ message: 'Les coordonnées (lat, lng) sont requises' });
      }

      // Recherche géospatiale
      const beautyPlaces = await BeautyPlace.find({
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

      res.status(200).json(beautyPlaces);
    } catch (error) {
      console.error('❌ Erreur dans getNearbyBeautyPlaces:', error);
      res.status(500).json({ message: 'Erreur lors de la récupération des établissements de beauté à proximité', error: error.message });
    }
  },

  /**
   * Obtenir les catégories d'établissements de beauté disponibles
   */
  getBeautyCategories: async (req, res) => {
    try {
      // Récupérer toutes les catégories uniques
      const categories = await BeautyPlace.distinct('category');

      res.status(200).json(categories);
    } catch (error) {
      console.error('❌ Erreur dans getBeautyCategories:', error);
      res.status(500).json({ message: 'Erreur lors de la récupération des catégories de beauté', error: error.message });
    }
  },

  /**
   * Obtenir les spécialités disponibles
   */
  getBeautySpecialties: async (req, res) => {
    try {
      // Récupérer toutes les spécialités uniques
      const specialties = await BeautyPlace.distinct('specialties');

      res.status(200).json(specialties);
    } catch (error) {
      console.error('❌ Erreur dans getBeautySpecialties:', error);
      res.status(500).json({ message: 'Erreur lors de la récupération des spécialités', error: error.message });
    }
  },

  /**
   * Ajouter un établissement de beauté aux favoris d'un utilisateur
   */
  addToFavorites: async (req, res) => {
    try {
      const { userId } = req.params;
      const { placeId } = req.body;

      if (!userId || !placeId) {
        return res.status(400).json({ message: 'ID utilisateur et ID établissement requis' });
      }

      // Vérifier que l'utilisateur existe
      const user = await UserChoice.findById(userId);
      if (!user) {
        return res.status(404).json({ message: 'Utilisateur non trouvé' });
      }

      // Vérifier que l'établissement existe
      const place = await BeautyPlace.findById(placeId);
      if (!place) {
        return res.status(404).json({ message: 'Établissement non trouvé' });
      }

      // Vérifier si l'établissement est déjà dans les favoris
      if (user.followingProducers && user.followingProducers.includes(placeId)) {
        return res.status(400).json({ message: 'Établissement déjà dans les favoris' });
      }

      // Ajouter l'établissement aux favoris
      if (!user.followingProducers) {
        user.followingProducers = [];
      }
      user.followingProducers.push(placeId);
      await user.save();

      res.status(200).json({ message: 'Établissement ajouté aux favoris' });
    } catch (error) {
      console.error('❌ Erreur dans addToFavorites:', error);
      res.status(500).json({ message: 'Erreur lors de l\'ajout aux favoris', error: error.message });
    }
  },

  /**
   * Retirer un établissement de beauté des favoris d'un utilisateur
   */
  removeFromFavorites: async (req, res) => {
    try {
      const { userId } = req.params;
      const { placeId } = req.body;

      if (!userId || !placeId) {
        return res.status(400).json({ message: 'ID utilisateur et ID établissement requis' });
      }

      // Vérifier que l'utilisateur existe
      const user = await UserChoice.findById(userId);
      if (!user) {
        return res.status(404).json({ message: 'Utilisateur non trouvé' });
      }

      // Vérifier si l'établissement est dans les favoris
      if (!user.followingProducers || !user.followingProducers.includes(placeId)) {
        return res.status(400).json({ message: 'Établissement non trouvé dans les favoris' });
      }

      // Retirer l'établissement des favoris
      user.followingProducers = user.followingProducers.filter(id => id.toString() !== placeId);
      await user.save();

      res.status(200).json({ message: 'Établissement retiré des favoris' });
    } catch (error) {
      console.error('❌ Erreur dans removeFromFavorites:', error);
      res.status(500).json({ message: 'Erreur lors du retrait des favoris', error: error.message });
    }
  }
};

module.exports = beautyPlacesController; 
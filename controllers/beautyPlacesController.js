const mongoose = require('mongoose');
const { UserChoice } = require('../models/User');
const { createModel, databases } = require('../utils/modelCreator');

// Initialiser les modèles directement avec notre utilitaire
const BeautyPlace = createModel(
  databases.BEAUTY_WELLNESS,
  'BeautyPlace',
  'BeautyPlaces'
);

const WellnessPlace = createModel(
  databases.BEAUTY_WELLNESS,
  'WellnessPlace',
  'WellnessPlaces'
);

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
   * Obtenir un établissement de beauté par place_id (format Google Maps)
   */
  getBeautyPlaceByPlaceId: async (req, res) => {
    try {
      const { placeId } = req.params;
      const beautyPlace = await BeautyPlace.findOne({ place_id: placeId });

      if (!beautyPlace) {
        return res.status(404).json({ message: 'Établissement de beauté non trouvé' });
      }

      res.status(200).json(beautyPlace);
    } catch (error) {
      console.error('❌ Erreur dans getBeautyPlaceByPlaceId:', error);
      res.status(500).json({ message: 'Erreur lors de la récupération de l\'établissement de beauté', error: error.message });
    }
  },

  /**
   * Recherche d'établissements de beauté
   */
  searchBeautyPlaces: async (req, res) => {
    try {
      const { 
        q, category, sous_categorie, tags, specialties,
        min_rating, min_average_score, is_bio,
        page = 1, limit = 20 
      } = req.query;
      
      const skip = (parseInt(page) - 1) * parseInt(limit);

      // Construire la requête de recherche
      const searchQuery = {};

      // Recherche textuelle si query est fournie
      if (q) {
        searchQuery.$or = [
          { name: { $regex: q, $options: 'i' } },
          { description: { $regex: q, $options: 'i' } },
          { tags: { $regex: q, $options: 'i' } },
          { specialties: { $regex: q, $options: 'i' } },
          { category: { $regex: q, $options: 'i' } },
          { sous_categorie: { $regex: q, $options: 'i' } }
        ];
      }

      // Filtres de catégorisation
      if (category) searchQuery.category = category;
      if (sous_categorie) searchQuery.sous_categorie = sous_categorie;
      if (tags) searchQuery.tags = { $in: tags.split(',') };
      if (specialties) searchQuery.specialties = { $in: specialties.split(',') };

      // Filtres de notation
      if (min_rating) searchQuery.rating = { $gte: parseFloat(min_rating) };
      if (min_average_score) searchQuery.average_score = { $gte: parseFloat(min_average_score) };
      
      // Autres filtres
      if (is_bio === 'true') searchQuery.is_bio = true;

      // Exécuter la recherche
      const beautyPlaces = await BeautyPlace.find(searchQuery)
        .skip(skip)
        .limit(parseInt(limit))
        .sort({ average_score: -1, rating: -1 });

      const totalPlaces = await BeautyPlace.countDocuments(searchQuery);

      // Enrichir la réponse avec des informations supplémentaires
      const enrichedPlaces = beautyPlaces.map(place => {
        const criteresCounts = place.notes ? Object.keys(place.notes).length : 0;
        return {
          ...place._doc,
          criteres_evaluation_count: criteresCounts,
          comments_count: place.comments ? place.comments.length : 0
        };
      });

      res.status(200).json({
        beautyPlaces: enrichedPlaces,
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

      // Recherche géospatiale avec une requête améliorée pour prendre en compte les deux formats
      const beautyPlaces = await BeautyPlace.find({
        $or: [
          // Format location.coordinates
          {
            location: {
              $nearSphere: {
                $geometry: {
                  type: "Point",
                  coordinates: [parseFloat(lng), parseFloat(lat)]
                },
                $maxDistance: parseInt(radius)
              }
            }
          },
          // Format gps_coordinates
          {
            "gps_coordinates.lat": { $gte: parseFloat(lat) - 0.05, $lte: parseFloat(lat) + 0.05 },
            "gps_coordinates.lng": { $gte: parseFloat(lng) - 0.05, $lte: parseFloat(lng) + 0.05 }
          }
        ]
      }).limit(parseInt(limit));

      // Si des résultats sont trouvés, les retourner
      if (beautyPlaces.length > 0) {
        return res.status(200).json(beautyPlaces);
      }

      // Sinon, essayer une recherche plus large
      const fallbackResults = await BeautyPlace.find({}).limit(parseInt(limit));
      
      return res.status(200).json({
        results: fallbackResults,
        message: "Aucun établissement trouvé à proximité, affichage des résultats par défaut"
      });
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
      const beautyPlace = await BeautyPlace.findById(placeId);
      if (!beautyPlace) {
        return res.status(404).json({ message: 'Établissement de beauté non trouvé' });
      }

      // Ajouter l'établissement aux favoris
      if (!user.favoriteBeautyPlaces) {
        user.favoriteBeautyPlaces = [];
      }

      // Vérifier si déjà dans les favoris
      if (user.favoriteBeautyPlaces.includes(placeId)) {
        return res.status(400).json({ message: 'Cet établissement est déjà dans vos favoris' });
      }

      user.favoriteBeautyPlaces.push(placeId);
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
      if (!user.favoriteBeautyPlaces || !user.favoriteBeautyPlaces.includes(placeId)) {
        return res.status(400).json({ message: 'Établissement non trouvé dans les favoris' });
      }

      // Retirer l'établissement des favoris
      user.favoriteBeautyPlaces = user.favoriteBeautyPlaces.filter(id => id.toString() !== placeId);
      await user.save();

      res.status(200).json({ message: 'Établissement retiré des favoris' });
    } catch (error) {
      console.error('❌ Erreur dans removeFromFavorites:', error);
      res.status(500).json({ message: 'Erreur lors du retrait des favoris', error: error.message });
    }
  },

  /**
   * Obtenir les critères d'évaluation par catégorie et sous-catégorie
   */
  getEvaluationCriteria: async (req, res) => {
    try {
      // Structure basée sur le fichier wellness.py
      const evaluationCriteria = {
        "Soins esthétiques et bien-être": {
          "sous_categories": [
            "Institut de beauté", "Spa", "Salon de massage", 
            "Centre d'épilation", "Clinique de soins de la peau", "Salon de bronzage"
          ],
          "criteres_evaluation": [
            "Qualité des soins", "Propreté", "Accueil", "Rapport qualité/prix", 
            "Ambiance", "Expertise du personnel"
          ],
          "horaires_disponibilite": true
        },
        "Coiffure et soins capillaires": {
          "sous_categories": ["Salon de coiffure", "Barbier"],
          "criteres_evaluation": [
            "Qualité de la coupe", "Respect des attentes", "Conseil", 
            "Produits utilisés", "Tarifs", "Ponctualité"
          ],
          "horaires_disponibilite": true
        },
        "Onglerie et modifications corporelles": {
          "sous_categories": ["Salon de manucure", "Salon de tatouage", "Salon de piercing"],
          "criteres_evaluation": [
            "Précision", "Hygiène", "Créativité", "Durabilité", 
            "Conseil", "Douleur ressentie"
          ],
          "horaires_disponibilite": false
        }
      };

      // Filtrer selon la catégorie et sous-catégorie si elles sont fournies
      const { category, subcategory } = req.query;
      
      if (category) {
        if (!evaluationCriteria[category]) {
          return res.status(404).json({ message: "Catégorie non trouvée" });
        }
        
        const categoryData = evaluationCriteria[category];
        
        if (subcategory) {
          // Vérifier si la sous-catégorie existe dans cette catégorie
          if (!categoryData.sous_categories.includes(subcategory)) {
            return res.status(404).json({ message: "Sous-catégorie non trouvée dans cette catégorie" });
          }
          
          // Retourner seulement les critères d'évaluation pour cette sous-catégorie
          return res.status(200).json({
            category,
            subcategory,
            criteres_evaluation: categoryData.criteres_evaluation,
            horaires_disponibilite: categoryData.horaires_disponibilite
          });
        }
        
        // Retourner toutes les informations pour cette catégorie
        return res.status(200).json({
          category,
          data: categoryData
        });
      }
      
      // Si aucune catégorie n'est spécifiée, retourner toute la structure
      res.status(200).json(evaluationCriteria);
    } catch (error) {
      console.error('❌ Erreur dans getEvaluationCriteria:', error);
      res.status(500).json({ 
        message: 'Erreur lors de la récupération des critères d\'évaluation', 
        error: error.message 
      });
    }
  },

  /**
   * Obtenir les horaires disponibles pour un établissement
   */
  getAvailableHours: async (req, res) => {
    try {
      const { placeId, date } = req.query;
      
      if (!placeId) {
        return res.status(400).json({ message: 'ID de l\'établissement requis' });
      }
      
      // Trouver l'établissement
      const beautyPlace = await BeautyPlace.findOne({ 
        $or: [
          { _id: mongoose.Types.ObjectId.isValid(placeId) ? placeId : null },
          { place_id: placeId }
        ]
      });
      
      if (!beautyPlace) {
        return res.status(404).json({ message: 'Établissement non trouvé' });
      }
      
      // Vérifier si l'établissement a des horaires d'ouverture
      if (!beautyPlace.opening_hours || beautyPlace.opening_hours.length === 0) {
        return res.status(200).json({
          message: "Aucun horaire disponible pour cet établissement",
          available_hours: []
        });
      }
      
      // Extraire le jour de la semaine à partir de la date fournie
      const requestDate = date ? new Date(date) : new Date();
      const dayOfWeek = requestDate.getDay(); // 0 = Dimanche, 1 = Lundi, etc.
      
      // Obtenir les horaires pour ce jour (format simplifié)
      // Normalement, il faudrait analyser la chaîne opening_hours mais ici on simule
      let hoursForDay = [];
      
      // Format exemple: "Lundi: 10:00-19:00"
      const dayNames = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
      const todayName = dayNames[dayOfWeek];
      
      // Chercher l'horaire correspondant au jour
      const dayHours = beautyPlace.opening_hours.find(h => h.startsWith(todayName));
      
      if (dayHours) {
        // Extraire les heures (ex: "10:00-19:00")
        const hoursMatch = dayHours.match(/(\d{1,2}:\d{2})-(\d{1,2}:\d{2})/);
        
        if (hoursMatch) {
          const openTime = hoursMatch[1];
          const closeTime = hoursMatch[2];
          
          // Générer des créneaux de 30 minutes
          const [openHour, openMinute] = openTime.split(':').map(Number);
          const [closeHour, closeMinute] = closeTime.split(':').map(Number);
          
          let currentHour = openHour;
          let currentMinute = openMinute;
          
          while (currentHour < closeHour || (currentHour === closeHour && currentMinute < closeMinute)) {
            const timeSlot = `${currentHour.toString().padStart(2, '0')}:${currentMinute.toString().padStart(2, '0')}`;
            hoursForDay.push(timeSlot);
            
            // Avancer de 30 minutes
            currentMinute += 30;
            if (currentMinute >= 60) {
              currentHour += 1;
              currentMinute = 0;
            }
          }
        }
      }
      
      res.status(200).json({
        date: requestDate.toISOString().split('T')[0],
        day_of_week: todayName,
        available_hours: hoursForDay
      });
    } catch (error) {
      console.error('❌ Erreur dans getAvailableHours:', error);
      res.status(500).json({ 
        message: 'Erreur lors de la récupération des horaires disponibles', 
        error: error.message 
      });
    }
  }
};

module.exports = beautyPlacesController; 
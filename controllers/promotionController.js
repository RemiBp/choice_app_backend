const mongoose = require('mongoose');

// Modèles pour les différents types de producteurs
let RestaurantProducer;
let LeisureProducer;
let WellnessProducer;

// Initialiser les modèles
const initializeModels = () => {
  if (!mongoose.restaurationDb || !mongoose.loisirDb || !mongoose.beautyWellnessDb) {
    throw new Error('Les connexions aux bases de données ne sont pas disponibles');
  }

  RestaurantProducer = mongoose.restaurationDb.model(
    'Producer',
    new mongoose.Schema({}, { strict: false }),
    'producers'
  );

  LeisureProducer = mongoose.loisirDb.model(
    'Producer',
    new mongoose.Schema({}, { strict: false }),
    'producers'
  );

  WellnessProducer = mongoose.beautyWellnessDb.model(
    'WellnessPlace',
    new mongoose.Schema({}, { strict: false }),
    'WellnessPlace'
  );
};

// Tenter d'initialiser les modèles immédiatement si les connexions sont disponibles
try {
  initializeModels();
} catch (error) {
  console.warn('⚠️ Promotion models initialization deferred: ' + error.message);
}

/**
 * Contrôleur pour la gestion des promotions
 */
const promotionController = {
  // Méthode d'initialisation
  initialize: function() {
    try {
      initializeModels();
      console.log('✅ Promotion models initialized');
    } catch (error) {
      console.error('❌ Erreur d\'initialisation des modèles de promotion:', error);
    }
  },

  /**
   * Obtenir les informations de promotion d'un producteur
   */
  getPromotion: async (req, res) => {
    try {
      const { producerId } = req.params;
      
      if (!mongoose.Types.ObjectId.isValid(producerId)) {
        return res.status(400).json({ message: 'ID de producteur invalide' });
      }
      
      // Essayer de trouver le producteur dans les différentes collections
      let producer = null;
      let producerType = '';
      
      // Vérifier dans les restaurants
      producer = await RestaurantProducer.findById(producerId);
      if (producer) {
        producerType = 'restaurant';
      }
      
      // Si non trouvé, vérifier dans les loisirs
      if (!producer) {
        producer = await LeisureProducer.findById(producerId);
        if (producer) {
          producerType = 'leisure';
        }
      }
      
      // Si non trouvé, vérifier dans le bien-être
      if (!producer) {
        producer = await WellnessProducer.findById(producerId);
        if (producer) {
          producerType = 'wellness';
        }
      }
      
      if (!producer) {
        return res.status(404).json({ message: 'Producteur non trouvé' });
      }
      
      // Récupérer les informations de promotion
      const promotion = {
        active: producer.promotion_active || false,
        discountPercentage: producer.promotion_discount || 10,
        startDate: producer.promotion_start_date || null,
        endDate: producer.promotion_end_date || null,
        type: producer.promotion_type || 'percentage',
        description: producer.promotion_description || '',
        producerType
      };
      
      res.status(200).json(promotion);
    } catch (error) {
      console.error('❌ Erreur lors de la récupération de la promotion:', error);
      res.status(500).json({ message: 'Erreur interne du serveur', error: error.message });
    }
  },
  
  /**
   * Activer une promotion pour un producteur
   */
  setPromotion: async (req, res) => {
    try {
      const { producerId } = req.params;
      const { 
        active, 
        discountPercentage = 10, 
        endDate, 
        type = 'percentage',
        description = ''
      } = req.body;
      
      if (!mongoose.Types.ObjectId.isValid(producerId)) {
        return res.status(400).json({ message: 'ID de producteur invalide' });
      }
      
      // Essayer de trouver le producteur dans les différentes collections
      let producer = null;
      let Model = null;
      
      // Vérifier dans les restaurants
      producer = await RestaurantProducer.findById(producerId);
      if (producer) {
        Model = RestaurantProducer;
      }
      
      // Si non trouvé, vérifier dans les loisirs
      if (!producer) {
        producer = await LeisureProducer.findById(producerId);
        if (producer) {
          Model = LeisureProducer;
        }
      }
      
      // Si non trouvé, vérifier dans le bien-être
      if (!producer) {
        producer = await WellnessProducer.findById(producerId);
        if (producer) {
          Model = WellnessProducer;
        }
      }
      
      if (!producer) {
        return res.status(404).json({ message: 'Producteur non trouvé' });
      }
      
      // Mettre à jour les champs de promotion
      const updateFields = {
        promotion_active: active,
        promotion_discount: discountPercentage,
        promotion_type: type,
        promotion_description: description,
        promotion_start_date: new Date()
      };
      
      // Ajouter la date de fin si fournie
      if (endDate) {
        updateFields.promotion_end_date = new Date(endDate);
      }
      
      // Mettre à jour le document
      const updatedProducer = await Model.findByIdAndUpdate(
        producerId,
        { $set: updateFields },
        { new: true }
      );
      
      // Envoyer la réponse
      res.status(200).json({
        message: active ? 'Promotion activée avec succès' : 'Promotion désactivée',
        promotion: {
          active: updatedProducer.promotion_active,
          discountPercentage: updatedProducer.promotion_discount,
          startDate: updatedProducer.promotion_start_date,
          endDate: updatedProducer.promotion_end_date,
          type: updatedProducer.promotion_type,
          description: updatedProducer.promotion_description
        }
      });
    } catch (error) {
      console.error('❌ Erreur lors de la définition de la promotion:', error);
      res.status(500).json({ message: 'Erreur interne du serveur', error: error.message });
    }
  },
  
  /**
   * Rechercher les promotions actives à proximité
   */
  getNearbyPromotions: async (req, res) => {
    try {
      const { latitude, longitude, radius = 5000, category } = req.query;
      
      if (!latitude || !longitude) {
        return res.status(400).json({ message: 'Latitude et longitude requises' });
      }
      
      // Convertir les coordonnées en nombres
      const lat = parseFloat(latitude);
      const lng = parseFloat(longitude);
      const maxDistance = parseInt(radius);
      
      // Définir la requête de base pour la recherche géospatiale
      const baseQuery = {
        promotion_active: true,
        location: {
          $nearSphere: {
            $geometry: {
              type: 'Point',
              coordinates: [lng, lat]
            },
            $maxDistance: maxDistance
          }
        }
      };
      
      // Ajouter un filtre de catégorie si spécifié
      if (category) {
        baseQuery.category = category;
      }
      
      // Chercher dans les trois collections
      const [restaurants, leisures, wellness] = await Promise.all([
        RestaurantProducer.find(baseQuery)
          .select('_id name photo address description promotion_discount promotion_end_date promotion_type promotion_description location')
          .limit(20),
        LeisureProducer.find(baseQuery)
          .select('_id name lieu adresse image promotion_discount promotion_end_date promotion_type promotion_description location')
          .limit(20),
        WellnessProducer.find(baseQuery)
          .select('_id name lieu adresse image promotion_discount promotion_end_date promotion_type promotion_description location')
          .limit(20)
      ]);
      
      // Normaliser les résultats
      const normalizedRestaurants = restaurants.map(r => ({
        id: r._id,
        name: r.name,
        address: r.address,
        image: r.photo,
        discountPercentage: r.promotion_discount || 10,
        endDate: r.promotion_end_date,
        type: 'restaurant',
        promotionType: r.promotion_type || 'percentage',
        description: r.promotion_description || '',
        location: r.location
      }));
      
      const normalizedLeisures = leisures.map(l => ({
        id: l._id,
        name: l.name || l.lieu,
        address: l.address || l.adresse,
        image: l.image,
        discountPercentage: l.promotion_discount || 10,
        endDate: l.promotion_end_date,
        type: 'leisure',
        promotionType: l.promotion_type || 'percentage',
        description: l.promotion_description || '',
        location: l.location
      }));
      
      const normalizedWellness = wellness.map(w => ({
        id: w._id,
        name: w.name || w.lieu,
        address: w.address || w.adresse,
        image: w.image,
        discountPercentage: w.promotion_discount || 10,
        endDate: w.promotion_end_date,
        type: 'wellness',
        promotionType: w.promotion_type || 'percentage',
        description: w.promotion_description || '',
        location: w.location
      }));
      
      // Combiner les résultats
      const allPromotions = [
        ...normalizedRestaurants,
        ...normalizedLeisures,
        ...normalizedWellness
      ];
      
      // Trier par distance (les plus proches d'abord)
      allPromotions.sort((a, b) => {
        const distA = calculateDistance(
          lat,
          lng,
          a.location.coordinates[1],
          a.location.coordinates[0]
        );
        const distB = calculateDistance(
          lat,
          lng,
          b.location.coordinates[1],
          b.location.coordinates[0]
        );
        return distA - distB;
      });
      
      res.status(200).json(allPromotions);
    } catch (error) {
      console.error('❌ Erreur lors de la recherche des promotions à proximité:', error);
      res.status(500).json({ message: 'Erreur interne du serveur', error: error.message });
    }
  }
};

// Fonction d'aide pour calculer la distance entre deux points
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Rayon de la Terre en km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  const distance = R * c; // Distance en km
  return distance;
}

module.exports = promotionController; 
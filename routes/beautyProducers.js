const express = require('express');
const router = express.Router();
const BeautyProducer = require('../models/beautyProducer');

// Middleware d'authentification (à importer si nécessaire)
const auth = async (req, res, next) => {
  // Votre logique d'authentification ici
  next();
};

// GET /api/beauty - Obtenir tous les établissements beauty/wellness avec pagination
router.get('/', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    
    const beautyProducers = await BeautyProducer.find()
      .skip(skip)
      .limit(limit);
    
    const total = await BeautyProducer.countDocuments();
    
    res.status(200).json({
      beautyProducers,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total
    });
  } catch (error) {
    console.error('Erreur de récupération des établissements beauty/wellness:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des établissements beauty/wellness' });
  }
});

// GET /api/beauty/nearby - Obtenir les établissements beauty/wellness à proximité
router.get('/nearby', async (req, res) => {
  try {
    const { lat, lng, radius = 5000, limit = 20 } = req.query;
    
    if (!lat || !lng) {
      return res.status(400).json({ error: 'Les coordonnées GPS sont requises (lat, lng)' });
    }
    
    const beautyProducers = await BeautyProducer.find({
      gps_coordinates: {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: [parseFloat(lng), parseFloat(lat)]
          },
          $maxDistance: parseInt(radius)
        }
      }
    }).limit(parseInt(limit));
    
    res.status(200).json(beautyProducers);
  } catch (error) {
    console.error('Erreur de récupération des établissements beauty/wellness à proximité:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des établissements beauty/wellness à proximité' });
  }
});

// GET /api/beauty/search - Rechercher des établissements beauty/wellness
router.get('/search', async (req, res) => {
  try {
    const { query, category, service_type, price_level, rating } = req.query;
    const searchQuery = {};
    
    if (query) {
      searchQuery.$or = [
        { name: { $regex: query, $options: 'i' } },
        { description: { $regex: query, $options: 'i' } }
      ];
    }
    
    if (category) {
      searchQuery.category = { $in: Array.isArray(category) ? category : [category] };
    }
    
    if (service_type) {
      searchQuery.service_type = { $in: Array.isArray(service_type) ? service_type : [service_type] };
    }
    
    if (price_level) {
      searchQuery.price_level = parseInt(price_level);
    }
    
    if (rating) {
      searchQuery.rating = { $gte: parseFloat(rating) };
    }
    
    const beautyProducers = await BeautyProducer.find(searchQuery).limit(50);
    
    res.status(200).json(beautyProducers);
  } catch (error) {
    console.error('Erreur de recherche des établissements beauty/wellness:', error);
    res.status(500).json({ error: 'Erreur lors de la recherche des établissements beauty/wellness' });
  }
});

// GET /api/beauty/featured - Obtenir les établissements beauty/wellness mis en avant
router.get('/featured', async (req, res) => {
  try {
    const featured = await BeautyProducer.find({ featured: true }).limit(10);
    res.status(200).json(featured);
  } catch (error) {
    console.error('Erreur de récupération des établissements beauty/wellness en vedette:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des établissements beauty/wellness en vedette' });
  }
});

// GET /api/beauty/:id - Obtenir un établissement beauty/wellness par son ID
router.get('/:id', async (req, res) => {
  try {
    const beautyProducer = await BeautyProducer.findById(req.params.id);
    
    if (!beautyProducer) {
      return res.status(404).json({ error: 'Établissement beauty/wellness non trouvé' });
    }
    
    res.status(200).json(beautyProducer);
  } catch (error) {
    console.error('Erreur de récupération de l\'établissement beauty/wellness:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération de l\'établissement beauty/wellness' });
  }
});

// POST /api/beauty/:id/follow - Suivre un établissement beauty/wellness (nécessite authentification)
router.post('/:id/follow', auth, async (req, res) => {
  try {
    const beautyProducer = await BeautyProducer.findById(req.params.id);
    
    if (!beautyProducer) {
      return res.status(404).json({ error: 'Établissement beauty/wellness non trouvé' });
    }
    
    // Si l'utilisateur suit déjà cet établissement, le retirer de la liste
    const userIndex = beautyProducer.followers.indexOf(req.user.id);
    
    if (userIndex > -1) {
      beautyProducer.followers.splice(userIndex, 1);
      beautyProducer.abonnés = Math.max(0, beautyProducer.abonnés - 1);
      await beautyProducer.save();
      
      res.status(200).json({ message: 'Vous ne suivez plus cet établissement', isFollowing: false });
    } else {
      // Sinon, ajouter l'utilisateur à la liste des abonnés
      beautyProducer.followers.push(req.user.id);
      beautyProducer.abonnés += 1;
      await beautyProducer.save();
      
      res.status(200).json({ message: 'Vous suivez désormais cet établissement', isFollowing: true });
    }
  } catch (error) {
    console.error('Erreur lors du suivi de l\'établissement beauty/wellness:', error);
    res.status(500).json({ error: 'Erreur lors de la mise à jour du suivi' });
  }
});

// GET /api/beauty/by-place-id/:placeId - Obtenir un établissement beauty/wellness par place_id (Google Maps)
router.get('/by-place-id/:placeId', async (req, res) => {
  try {
    const beautyProducer = await BeautyProducer.findOne({ place_id: req.params.placeId });
    
    if (!beautyProducer) {
      return res.status(404).json({ error: 'Établissement beauty/wellness non trouvé' });
    }
    
    res.status(200).json(beautyProducer);
  } catch (error) {
    console.error('Erreur de récupération de l\'établissement beauty/wellness:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération de l\'établissement beauty/wellness' });
  }
});

// GET /api/beauty/category/:category - Obtenir les établissements beauty/wellness par catégorie
router.get('/category/:category', async (req, res) => {
  try {
    const beautyProducers = await BeautyProducer.find({
      category: { $in: [req.params.category] }
    }).limit(50);
    
    res.status(200).json(beautyProducers);
  } catch (error) {
    console.error('Erreur de récupération des établissements beauty/wellness par catégorie:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des établissements beauty/wellness par catégorie' });
  }
});

// POST /api/beauty/:id/appointment - Réserver un créneau (nécessite authentification)
router.post('/:id/appointment', auth, async (req, res) => {
  try {
    const { slotId, date, start_time } = req.body;
    
    if (!slotId && (!date || !start_time)) {
      return res.status(400).json({ error: 'Paramètres de réservation insuffisants' });
    }
    
    const beautyProducer = await BeautyProducer.findById(req.params.id);
    
    if (!beautyProducer) {
      return res.status(404).json({ error: 'Établissement beauty/wellness non trouvé' });
    }
    
    // Vérifier si le système de rendez-vous est activé
    if (!beautyProducer.appointment_system || !beautyProducer.appointment_system.enabled) {
      return res.status(400).json({ error: 'Cet établissement n\'accepte pas les rendez-vous en ligne' });
    }
    
    let slotIndex = -1;
    
    // Chercher le créneau soit par ID soit par date et heure
    if (slotId) {
      // Trouver le créneau par ID (logique à implémenter selon la structure des données)
      beautyProducer.appointment_system.slots.forEach((slot, index) => {
        if (slot._id.toString() === slotId) {
          slotIndex = index;
        }
      });
    } else {
      // Trouver le créneau par date et heure de début
      const requestDate = new Date(date);
      beautyProducer.appointment_system.slots.forEach((slot, index) => {
        const slotDate = new Date(slot.date);
        if (slotDate.toDateString() === requestDate.toDateString() && 
            slot.start_time === start_time && 
            !slot.booked) {
          slotIndex = index;
        }
      });
    }
    
    if (slotIndex === -1) {
      return res.status(404).json({ error: 'Créneau non disponible ou déjà réservé' });
    }
    
    // Vérifier si le créneau est déjà réservé
    if (beautyProducer.appointment_system.slots[slotIndex].booked) {
      return res.status(400).json({ error: 'Ce créneau est déjà réservé' });
    }
    
    // Réserver le créneau
    beautyProducer.appointment_system.slots[slotIndex].booked = true;
    beautyProducer.appointment_system.slots[slotIndex].booked_by = req.user.id;
    
    await beautyProducer.save();
    
    res.status(200).json({ 
      message: 'Rendez-vous réservé avec succès',
      appointment: beautyProducer.appointment_system.slots[slotIndex]
    });
  } catch (error) {
    console.error('Erreur lors de la réservation du rendez-vous:', error);
    res.status(500).json({ error: 'Erreur lors de la réservation du rendez-vous' });
  }
});

// GET /api/beauty/:id/appointments - Obtenir les créneaux disponibles
router.get('/:id/appointments', async (req, res) => {
  try {
    const { date } = req.query;
    
    const beautyProducer = await BeautyProducer.findById(req.params.id);
    
    if (!beautyProducer) {
      return res.status(404).json({ error: 'Établissement beauty/wellness non trouvé' });
    }
    
    // Vérifier si le système de rendez-vous est activé
    if (!beautyProducer.appointment_system || !beautyProducer.appointment_system.enabled) {
      return res.status(400).json({ error: 'Cet établissement n\'accepte pas les rendez-vous en ligne' });
    }
    
    let slots = [];
    
    // Si une date est spécifiée, filtrer les créneaux par date
    if (date) {
      const requestDate = new Date(date);
      slots = beautyProducer.appointment_system.slots.filter(slot => {
        const slotDate = new Date(slot.date);
        return slotDate.toDateString() === requestDate.toDateString() && !slot.booked;
      });
    } else {
      // Sinon, récupérer tous les créneaux disponibles
      slots = beautyProducer.appointment_system.slots.filter(slot => !slot.booked);
    }
    
    res.status(200).json(slots);
  } catch (error) {
    console.error('Erreur de récupération des créneaux disponibles:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des créneaux disponibles' });
  }
});

module.exports = router; 
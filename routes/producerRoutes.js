const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { restaurationDb } = require('../index');
const auth = require('../middleware/auth');

// Modèle pour les producteurs restauration
const Producer = restaurationDb.model(
  'Producer', 
  new mongoose.Schema({}, { strict: false }),
  'producers'
);

/**
 * @route GET /api/restaurant-producers
 * @desc Récupérer tous les producteurs de restauration
 * @access Public
 */
router.get('/', async (req, res) => {
  try {
    const producers = await Producer.find().limit(100);
    res.json(producers);
  } catch (err) {
    console.error(err);
    res.status(500).send('Erreur serveur');
  }
});

/**
 * @route GET /api/restaurant-producers/nearby
 * @desc Récupérer les restaurants à proximité
 * @access Public
 */
router.get('/nearby', async (req, res) => {
  try {
    const { lat, lng, radius = 5000 } = req.query;
    
    if (!lat || !lng) {
      return res.status(400).json({ message: 'Latitude et longitude requises' });
    }
    
    const latitude = parseFloat(lat);
    const longitude = parseFloat(lng);
    
    if (isNaN(latitude) || isNaN(longitude)) {
      return res.status(400).json({ message: 'Coordonnées invalides' });
    }
    
    const producers = await Producer.find({
      gps_coordinates: {
        $near: {
          $geometry: {
            type: "Point",
            coordinates: [longitude, latitude]
          },
          $maxDistance: parseInt(radius)
        }
      }
    }).limit(50);
    
    res.json(producers);
  } catch (err) {
    console.error(err);
    res.status(500).send('Erreur serveur');
  }
});

/**
 * @route GET /api/restaurant-producers/:id
 * @desc Récupérer un producteur par ID
 * @access Public
 */
router.get('/:id', async (req, res) => {
  try {
    const producer = await Producer.findById(req.params.id);
    
    if (!producer) {
      return res.status(404).json({ message: 'Producteur non trouvé' });
    }
    
    res.json(producer);
  } catch (err) {
    console.error(err);
    res.status(500).send('Erreur serveur');
  }
});

module.exports = router;

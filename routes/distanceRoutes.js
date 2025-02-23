const express = require('express');
const calculateDistance = require('../services/distanceService');

const router = express.Router();

/**
 * Route POST pour calculer la distance
 * Body attendu : { origin: { lat, lng }, destination: { lat, lng }, mode }
 */
router.post('/', async (req, res) => {
  const { origin, destination, mode } = req.body;

  if (!origin || !destination) {
    return res.status(400).json({ error: 'Les coordonnées d’origine et de destination sont requises.' });
  }

  const result = await calculateDistance(origin, destination, mode);
  if (result) {
    return res.status(200).json(result);
  } else {
    return res.status(500).json({ error: 'Erreur lors du calcul de la distance.' });
  }
});

module.exports = router;

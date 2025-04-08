const express = require('express');
const router = express.Router();

router.post('/search', async (req, res) => {
  const { motCle, prixMin, prixMax, noteMin, rayon, latitude, longitude } = req.body;
  
  // Exemple de log pour déboguer
  console.log('Requête reçue avec les critères :', req.body);

  try {
    // Effectuer la recherche dans MongoDB
    const lieux = await db.collection('RestaurationParis').find({
      gps_coordinates: {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: [longitude, latitude], // Longitude, puis latitude
          },
          $maxDistance: rayon * 1000, // Conversion km -> mètres
        },
      },
      ...(motCle && { name: { $regex: motCle, $options: 'i' } }),
      ...(prixMin && { price_level: { $gte: prixMin } }),
      ...(prixMax && { price_level: { $lte: prixMax } }),
      ...(noteMin && { rating: { $gte: noteMin } }),
    }).toArray();

    res.status(200).json(lieux);
  } catch (err) {
    console.error('Erreur dans /api/search :', err.message);
    res.status(500).json({ message: 'Erreur interne du serveur' });
  }
});

module.exports = router;

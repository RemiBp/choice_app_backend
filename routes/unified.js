const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

// Connexions aux bases
const restaurantDb = mongoose.createConnection(process.env.MONGO_URI, {
  dbName: 'Restauration_Officielle',
});
const leisureDb = mongoose.createConnection(process.env.MONGO_URI, {
  dbName: 'Loisir&Culture',
});

// Modèles pour les collections
const Restaurant = restaurantDb.model(
  'Restaurant',
  new mongoose.Schema({}, { strict: false }),
  'producers' // Collection des producteurs dans Restauration_Officielle
);
const LeisureProducer = leisureDb.model(
  'LeisureProducer',
  new mongoose.Schema({}, { strict: false }),
  'Loisir_Paris_Producers' // Producteurs de loisirs dans Loisir&Culture
);
const Event = leisureDb.model(
  'Event',
  new mongoose.Schema({}, { strict: false }),
  'Loisir_Paris_Evenements' // Événements dans Loisir&Culture
);

// Route pour la recherche unifiée
router.get('/search', async (req, res) => {
  const { query } = req.query;

  if (!query || query.trim() === '') {
    return res.status(400).json({ message: 'Veuillez fournir un mot-clé pour la recherche.' });
  }

  console.log(`🔍 Recherche pour le mot-clé : ${query}`);

  try {
    // Créez les filtres pour chaque collection
    const filter = { $regex: query, $options: 'i' };

    const [restaurants, leisureProducers, events] = await Promise.all([
      Restaurant.find({
        $or: [
          { name: filter },
          { address: filter },
          { description: filter },
        ],
      }).limit(20),
      LeisureProducer.find({
        $or: [
          { lieu: filter },
          { adresse: filter },
          { description: filter },
        ],
      }).limit(20),
      Event.find({
        $or: [
          { intitulé: filter },
          { catégorie: filter },
          { détail: filter },
        ],
      }).limit(20),
    ]);

    const results = [
      ...restaurants.map((r) => ({ type: 'restaurant', ...r.toObject() })),
      ...leisureProducers.map((l) => ({ type: 'leisureProducer', ...l.toObject() })),
      ...events.map((e) => ({ type: 'event', ...e.toObject() })),
    ];

    if (results.length === 0) {
      console.log(`❌ Aucun résultat trouvé pour la recherche : ${query}`);
      return res.status(404).json({ message: 'Aucun résultat trouvé.' });
    }

    console.log(`✅ Résultats trouvés : ${results.length} résultats`);
    res.status(200).json(results);
  } catch (err) {
    console.error('❌ Erreur dans /api/unified/search :', err.message);
    res.status(500).json({ message: 'Erreur interne du serveur.', error: err.message });
  }
});

// Route pour récupérer les détails uniquement via l'ID
router.get('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    if (!mongoose.isValidObjectId(id)) {
      console.log(`❌ ID invalide : ${id}`);
      return res.status(400).json({ message: 'ID invalide.' });
    }

    console.log(`🔍 Recherche du document avec ID : ${id}`);

    const [restaurant, leisureProducer, event] = await Promise.all([
      Restaurant.findById(id),
      LeisureProducer.findById(id),
      Event.findById(id),
    ]);

    if (restaurant) {
      console.log(`✅ Trouvé dans Restaurants : ${id}`);
      return res.status(200).json({ type: 'restaurant', ...restaurant.toObject() });
    }

    if (leisureProducer) {
      console.log(`✅ Trouvé dans Leisure Producers : ${id}`);
      return res.status(200).json({ type: 'leisureProducer', ...leisureProducer.toObject() });
    }

    if (event) {
      console.log(`✅ Trouvé dans Events : ${id}`);
      return res.status(200).json({ type: 'event', ...event.toObject() });
    }

    console.log(`❌ Aucun résultat trouvé pour l'ID : ${id}`);
    res.status(404).json({ message: 'Aucun détail trouvé pour cet ID.' });
  } catch (err) {
    console.error(`❌ Erreur lors de la récupération des détails :`, err.message);
    res.status(500).json({ message: 'Erreur interne du serveur.', error: err.message });
  }
});

module.exports = router;

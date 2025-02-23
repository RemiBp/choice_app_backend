const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

// Modèle pour les restaurants
const Restaurant = mongoose.models.Restaurant || mongoose.model(
  'Restaurant',
  new mongoose.Schema({}, { strict: false }),
  'RestaurationParis'
);

// Modèle pour les producteurs de loisirs
const LeisureProducer = mongoose.models.LeisureProducer || mongoose.model(
  'LeisureProducer',
  new mongoose.Schema({}, { strict: false }),
  'LoisirParisProducers'
);

// Modèle pour les événements
const Event = mongoose.models.Event || mongoose.model(
  'Event',
  new mongoose.Schema({}, { strict: false }),
  'LoisirParisEvenements'
);

// Route GET pour une recherche unifiée
router.get('/', async (req, res) => {
  const { query, type } = req.query;

  if (!query || query.trim() === '') {
    return res.status(400).json({ message: 'Veuillez fournir un mot-clé pour la recherche.' });
  }

  if (!type) {
    return res.status(400).json({ message: 'Le paramètre "type" est obligatoire.' });
  }

  try {
    console.log(`🔍 Recherche pour le mot-clé : "${query}" et type : "${type}"`);

    // Construction du filtre
    let filtre = {};
    if (type === 'restaurant') {
      filtre = {
        $or: [
          { name: { $regex: query, $options: 'i' } },
          { address: { $regex: query, $options: 'i' } },
          { description: { $regex: query, $options: 'i' } },
        ],
      };
    } else if (type === 'leisureProducer') {
      filtre = {
        $or: [
          { lieu: { $regex: query, $options: 'i' } },
          { adresse: { $regex: query, $options: 'i' } },
          { description: { $regex: query, $options: 'i' } },
          { 'evenements.intitulé': { $regex: query, $options: 'i' } },
          { 'evenements.catégorie': { $regex: query, $options: 'i' } },
        ],
      };
    } else if (type === 'event') {
      filtre = {
        $or: [
          { name: { $regex: query, $options: 'i' } },
          { address: { $regex: query, $options: 'i' } },
          { description: { $regex: query, $options: 'i' } },
        ],
      };
    } else {
      return res.status(400).json({
        message: "Type invalide. Les types acceptés sont 'restaurant', 'leisureProducer', 'event'.",
      });
    }

    // Identifier la collection appropriée
    let collection;
    if (type === 'restaurant') {
      collection = Restaurant;
    } else if (type === 'leisureProducer') {
      collection = LeisureProducer;
    } else if (type === 'event') {
      collection = Event;
    }

    // Rechercher dans la collection choisie
    const resultats = await collection.find(filtre).limit(50);

    if (resultats.length === 0) {
      return res.status(404).json({ message: `Aucun résultat trouvé pour le type '${type}' avec ce mot-clé.` });
    }

    console.log(`🔍 ${resultats.length} résultat(s) trouvé(s) pour le type '${type}'.`);
    res.status(200).json(resultats);
  } catch (err) {
    console.error('❌ Erreur dans /api/search :', err.message);
    res.status(500).json({ message: 'Erreur interne du serveur.', erreur: err.message });
  }
});

module.exports = router;

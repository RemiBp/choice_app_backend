const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { 
  formatEventDate, 
  isEventPassed, 
  getEventImageUrl,
  normalizeCollectionRoute 
} = require('../utils/leisureHelpers');

// Connexion à la base Loisir&Culture
const eventDb = mongoose.createConnection(process.env.MONGO_URI, {
  dbName: 'Loisir&Culture',
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

// Modèle pour la collection des événements
const Event = eventDb.model(
  'Event',
  new mongoose.Schema({}, { strict: false }),
  'Loisir_Paris_Evenements' // Nom exact de la collection dans MongoDB
);

// **Recherche avancée avec filtres**
router.get('/advanced-search', async (req, res) => {
  try {
    const {
      category,           // Catégorie (ex. : "Théâtre", "Cinéma")
      minNote,            // Note minimale globale
      miseEnScene,        // Note minimale pour mise_en_scene
      jeuActeurs,         // Note minimale pour jeu_acteurs
      scenario,           // Note minimale pour scenario
      emotions,           // Émotions (array ex. : ["drôle", "joyeux"])
      minPrice,           // Prix minimum
      maxPrice            // Prix maximum
    } = req.query;

    // Construire la requête dynamique
    const query = {};

    // Filtre par catégorie
    if (category) {
      query["catégorie"] = { $regex: category, $options: 'i' }; // Insensible à la casse
    }

    // Filtre par note globale
    if (minNote) {
      query["note"] = { $gte: parseFloat(minNote) };
    }

    // Filtres par notes spécifiques
    if (miseEnScene) {
      query["notes_globales.mise_en_scene"] = { $gte: parseFloat(miseEnScene) };
    }
    if (jeuActeurs) {
      query["notes_globales.jeu_acteurs"] = { $gte: parseFloat(jeuActeurs) };
    }
    if (scenario) {
      query["notes_globales.scenario"] = { $gte: parseFloat(scenario) };
    }

    // Filtre par émotions
    if (emotions) {
      const emotionArray = Array.isArray(emotions) ? emotions : emotions.split(',');
      query["notes_globales.emotions"] = { $in: emotionArray }; // Correspondance avec au moins une émotion
    }

    // Filtre par prix
    if (minPrice || maxPrice) {
      query["catégories_prix.Prix"] = {
        $elemMatch: {
          ...(minPrice && { $gte: `${parseFloat(minPrice)} €` }),
          ...(maxPrice && { $lte: `${parseFloat(maxPrice)} €` }),
        },
      };
    }

    console.log('🔍 Recherche avancée avec les critères :', query);

    // Exécuter la requête
    const events = await Event.find(query);

    console.log(`🔍 ${events.length} événement(s) trouvé(s)`);

    if (events.length === 0) {
      return res.status(404).json({ message: 'Aucun événement trouvé.' });
    }

    // Formater les résultats
    const formattedEvents = events.map(event => ({
      _id: event._id,
      intitulé: event.intitulé || 'Intitulé non disponible',
      catégorie: event.catégorie || 'Catégorie non disponible',
      lieu: event.lieu || 'Lieu non disponible',
      note: event.note ? parseFloat(event.note).toFixed(1) : 'Note non disponible',
      notes_globales: {
        mise_en_scene: event.notes_globales?.mise_en_scene ? parseFloat(event.notes_globales.mise_en_scene).toFixed(1) : 'Non disponible',
        jeu_acteurs: event.notes_globales?.jeu_acteurs ? parseFloat(event.notes_globales.jeu_acteurs).toFixed(1) : 'Non disponible',
        scenario: event.notes_globales?.scenario ? parseFloat(event.notes_globales.scenario).toFixed(1) : 'Non disponible',
        émotions: event.notes_globales?.emotions || [],
        appréciation_globale: event.notes_globales?.appréciation_globale || 'Non disponible',
      },
      prix_reduit: event.prix_reduit || 'Prix non disponible',
      date_formatted: formatEventDate(event.date_debut || event.prochaines_dates),
      is_passed: isEventPassed(event),
      location: event.location || { coordinates: [] },
      image: getEventImageUrl(event),
      purchase_url: event.purchase_url || '',
    }));

    res.json(formattedEvents);
  } catch (err) {
    console.error('❌ Erreur lors de la recherche avancée des événements :', err);
    res.status(500).json({ message: 'Erreur interne du serveur.' });
  }
});

// **Recherche par mot-clé**
router.get('/search', async (req, res) => {
  try {
    const { query } = req.query;

    if (!query || query.trim() === '') {
      return res.status(400).json({ message: 'Veuillez fournir un mot-clé pour la recherche.' });
    }

    console.log('🔍 Recherche pour le mot-clé :', query);

    const events = await Event.find({
      $or: [
        { intitulé: { $regex: query, $options: 'i' } },
        { catégorie: { $regex: query, $options: 'i' } },
        { détail: { $regex: query, $options: 'i' } },
      ],
    }).select('intitulé catégorie photo adresse');

    console.log(`🔍 ${events.length} événement(s) trouvé(s)`);

    if (events.length === 0) {
      return res.status(404).json([]);
    }

    res.json(events);
  } catch (err) {
    console.error('❌ Erreur lors de la recherche des événements :', err);
    res.status(500).json({ message: 'Erreur interne du serveur.' });
  }
});

// **Recherche par artiste dans le lineup**
router.get('/search-by-artist', async (req, res) => {
  try {
    const { artistName } = req.query;

    if (!artistName || artistName.trim() === '') {
      return res.status(400).json({ message: 'Veuillez fournir un nom d\'artiste pour la recherche.' });
    }

    console.log('🔍 Recherche d\'événements avec l\'artiste :', artistName);

    // Recherche dans la collection avec un artiste correspondant dans le lineup
    const events = await Event.find({
      'lineup': {
        $elemMatch: {
          'nom': { $regex: artistName, $options: 'i' }
        }
      }
    });

    console.log(`🔍 ${events.length} événement(s) trouvé(s) avec l'artiste ${artistName}`);

    if (events.length === 0) {
      return res.status(404).json([]);
    }

    // Formater les résultats
    const formattedEvents = events.map(event => ({
      _id: event._id,
      intitulé: event.intitulé || 'Intitulé non disponible',
      catégorie: event.catégorie || 'Catégorie non disponible',
      lieu: event.lieu || 'Lieu non disponible',
      image: getEventImageUrl(event),
      date_formatted: formatEventDate(event.date_debut || event.prochaines_dates),
      prochaines_dates: event.prochaines_dates || 'Dates non disponibles',
      is_passed: isEventPassed(event),
      purchase_url: event.purchase_url || '',
      prix_reduit: event.prix_reduit || 'Prix non disponible',
    }));

    res.json(formattedEvents);
  } catch (err) {
    console.error('❌ Erreur lors de la recherche des événements par artiste :', err);
    res.status(500).json({ message: 'Erreur interne du serveur.' });
  }
});

// **Recherche par ID**
router.get('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: 'ID invalide.' });
    }

    console.log(`🔍 Recherche d'un événement avec ID : ${id}`);
    const event = await Event.findById(id);

    if (!event) {
      return res.status(404).json({ message: 'Événement non trouvé.' });
    }

    // Formater l'événement avec les helpers
    const formattedEvent = {
      ...event.toObject(),
      date_formatted: formatEventDate(event.date_debut || event.prochaines_dates),
      image_url: getEventImageUrl(event),
      is_passed: isEventPassed(event)
    };

    res.status(200).json(formattedEvent);
  } catch (err) {
    console.error(`❌ Erreur lors de la récupération de l'événement :`, err.message);
    res.status(500).json({ message: 'Erreur interne du serveur.' });
  }
});

module.exports = router;

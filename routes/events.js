const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { 
  formatEventDate, 
  isEventPassed, 
  getEventImageUrl,
  normalizeCollectionRoute 
} = require('../utils/leisureHelpers');
const {
  EVENT_TYPES,
  CATEGORY_MAPPING,
  MAIN_CATEGORIES,
  CATEGORY_MAPPINGS_DETAILED,
  getStandardCategory,
  getCategoryDetails,
  getEventTypeDetails
} = require('../utils/eventConstants');

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

// Mapping pour la traduction des dates
const JOURS_FR_EN = {
  "lundi": "Monday", "mardi": "Tuesday", "mercredi": "Wednesday",
  "jeudi": "Thursday", "vendredi": "Friday", "samedi": "Saturday", "dimanche": "Sunday"
};

const MOIS_FR_EN = {
  "janvier": "January", "février": "February", "mars": "March", "avril": "April",
  "mai": "May", "juin": "June", "juillet": "July", "août": "August",
  "septembre": "September", "octobre": "October", "novembre": "November", "décembre": "December"
};

const MOIS_ABBR_FR = {
  "janv.": "janvier", "févr.": "février", "mars": "mars", "avr.": "avril",
  "mai": "mai", "juin": "juin", "juil.": "juillet", "août": "août",
  "sept.": "septembre", "oct.": "octobre", "nov.": "novembre", "déc.": "décembre"
};

// **Recherche avancée avec filtres**
router.get('/advanced-search', async (req, res) => {
  try {
    const {
      latitude,          // Latitude pour recherche géolocalisée
      longitude,         // Longitude pour recherche géolocalisée
      radius = 10000,    // Rayon de recherche (10km par défaut)
      category,          // Catégorie (ex. : "Théâtre", "Cinéma")
      eventType,         // Type d'événement spécifique
      minNote,           // Note minimale globale
      miseEnScene,       // Note minimale pour mise_en_scene
      minMiseEnScene,    // Alias pour miseEnScene (compatibilité frontend)
      jeuActeurs,        // Note minimale pour jeu_acteurs
      minJeuActeurs,     // Alias pour jeuActeurs (compatibilité frontend)
      scenario,          // Note minimale pour scenario
      minScenario,       // Alias pour scenario (compatibilité frontend)
      ambiance,          // Note minimale pour ambiance
      emotions,          // Émotions (array ex. : ["drôle", "joyeux"])
      aspects,           // Aspects spécifiques (ex. : ["mise en scène", "jeu des acteurs"])
      minPrice,          // Prix minimum
      maxPrice,          // Prix maximum
      artiste,           // Recherche par artiste
      dateDebut,         // Date de début
      dateFin,           // Date de fin
      accessibilite      // Critères d'accessibilité
    } = req.query;

    // Construire la requête dynamique
    const query = {};

    // Ajout du filtre géographique si latitude et longitude sont fournies
    if (latitude && longitude) {
      query.location = {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: [parseFloat(longitude), parseFloat(latitude)],
          },
          $maxDistance: parseInt(radius),
        },
      };
    }

    // Filtres de catégorie et type d'événement
    if (category) {
      query.category = category;
    }
    if (eventType) {
      query.eventType = eventType;
    }

    // Filtres de notes
    if (minNote) {
      query['notes_globales.appréciation_globale'] = { $gte: parseFloat(minNote) };
    }
    if (miseEnScene || minMiseEnScene) {
      query['notes_globales.mise_en_scene'] = { $gte: parseFloat(miseEnScene || minMiseEnScene) };
    }
    if (jeuActeurs || minJeuActeurs) {
      query['notes_globales.jeu_acteurs'] = { $gte: parseFloat(jeuActeurs || minJeuActeurs) };
    }
    if (scenario || minScenario) {
      query['notes_globales.scenario'] = { $gte: parseFloat(scenario || minScenario) };
    }
    if (ambiance) {
      query['notes_globales.ambiance'] = { $gte: parseFloat(ambiance) };
    }

    // Filtres d'émotions et d'aspects
    if (emotions && emotions.length > 0) {
      query['notes_globales.emotions'] = { $in: emotions };
    }
    if (aspects && aspects.length > 0) {
      query['notes_globales.aspects'] = { $in: aspects };
    }

    // Filtres de prix
    if (minPrice) {
      query['prix.min'] = { $gte: parseFloat(minPrice) };
    }
    if (maxPrice) {
      query['prix.max'] = { $lte: parseFloat(maxPrice) };
    }

    // Filtre par artiste
    if (artiste) {
      query.artistes = { $regex: artiste, $options: 'i' };
    }

    // Filtres de dates
    if (dateDebut) {
      query.startDate = { $gte: new Date(dateDebut) };
    }
    if (dateFin) {
      query.endDate = { $lte: new Date(dateFin) };
    }

    // Filtre d'accessibilité
    if (accessibilite) {
      query.accessibilite = { $in: accessibilite.split(',') };
    }

    console.log('🔍 Requête de recherche avancée:', query);

    const events = await Event.find(query)
      .sort({ startDate: 1 })
      .limit(50);

    // Formater les résultats avec les catégories standardisées et détails associés
    const formattedEvents = events.map(event => {
      const eventObj = event.toObject();
      
      // Standardiser la catégorie
      const standardCategory = getStandardCategory(eventObj.category);
      eventObj.catégorie_standardisée = standardCategory;
      
      // Récupérer les aspects et émotions associés à cette catégorie
      const categoryDetails = getCategoryDetails(standardCategory);
      
      return {
        _id: eventObj._id,
        intitulé: eventObj.name || 'Intitulé non disponible',
        catégorie: eventObj.category || 'Catégorie non disponible',
        catégorie_standardisée: standardCategory,
        eventType: eventObj.eventType,
        categoryAspects: categoryDetails.aspects,
        categoryEmotions: categoryDetails.emotions,
        lieu: eventObj.address || 'Lieu non disponible',
        note: eventObj.notes_globales?.appréciation_globale ? parseFloat(eventObj.notes_globales.appréciation_globale).toFixed(1) : '0.0',
        notes_globales: {
          mise_en_scene: eventObj.notes_globales?.mise_en_scene ? parseFloat(eventObj.notes_globales.mise_en_scene).toFixed(1) : '0.0',
          jeu_acteurs: eventObj.notes_globales?.jeu_acteurs ? parseFloat(eventObj.notes_globales.jeu_acteurs).toFixed(1) : '0.0',
          scenario: eventObj.notes_globales?.scenario ? parseFloat(eventObj.notes_globales.scenario).toFixed(1) : '0.0',
          ambiance: eventObj.notes_globales?.ambiance ? parseFloat(eventObj.notes_globales.ambiance).toFixed(1) : '0.0',
          émotions: eventObj.notes_globales?.emotions || [],
          aspects: eventObj.notes_globales?.aspects || categoryDetails.aspects,
          appréciation_globale: eventObj.notes_globales?.appréciation_globale || 'Non disponible',
        },
        prix: eventObj.prix || 'Prix non disponible',
        date_formatted: formatEventDate(eventObj.startDate),
        date_debut: eventObj.startDate,
        date_fin: eventObj.endDate,
        horaires: eventObj.horaires || [],
        artistes: eventObj.artistes || [],
        capacite: eventObj.capacite,
        accessibilite: eventObj.accessibilite || [],
        is_passed: isEventPassed(eventObj),
        location: eventObj.coordinates || { coordinates: [] },
        image: getEventImageUrl(eventObj) || `https://source.unsplash.com/500x300/?${encodeURIComponent(standardCategory.split('»')[0].trim())}`,
        purchase_url: eventObj.purchase_url || '',
        interests: eventObj.interests || [],
        followers_interests: eventObj.followers_interests || [],
        followers: eventObj.followers || Array(Math.floor(Math.random() * 15) + 1).fill().map((_, i) => ({
          name: `Ami ${i+1}`,
          profilePic: `https://randomuser.me/api/portraits/${Math.random() > 0.5 ? 'men' : 'women'}/${Math.floor(Math.random() * 100)}.jpg`
        })),
        followers_count: eventObj.followers_count || Math.floor(Math.random() * 15) + 1
      };
    });

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

    const eventObj = event.toObject();
    
    // Standardiser la catégorie
    const standardCategory = getStandardCategory(eventObj.catégorie);
    
    // Récupérer les aspects et émotions associés à cette catégorie
    const categoryDetails = getCategoryDetails(standardCategory);
    
    // Formater l'événement avec les helpers et données enrichies
    const formattedEvent = {
      ...eventObj,
      catégorie_standardisée: standardCategory,
      categoryAspects: categoryDetails.aspects,
      categoryEmotions: categoryDetails.emotions,
      date_formatted: formatEventDate(event.date_debut || event.prochaines_dates),
      image_url: getEventImageUrl(event) || `https://source.unsplash.com/500x300/?${encodeURIComponent(standardCategory.split('»')[0].trim())}`,
      is_passed: isEventPassed(event),
      // Assurer que les notes et autres champs importants existent
      notes_globales: {
        mise_en_scene: eventObj.notes_globales?.mise_en_scene ? parseFloat(eventObj.notes_globales.mise_en_scene).toFixed(1) : '0.0',
        jeu_acteurs: eventObj.notes_globales?.jeu_acteurs ? parseFloat(eventObj.notes_globales.jeu_acteurs).toFixed(1) : '0.0',
        scenario: eventObj.notes_globales?.scenario ? parseFloat(eventObj.notes_globales.scenario).toFixed(1) : '0.0',
        émotions: eventObj.notes_globales?.emotions || categoryDetails.emotions,
        aspects: eventObj.notes_globales?.aspects || categoryDetails.aspects,
        appréciation_globale: eventObj.notes_globales?.appréciation_globale || 'Non disponible',
      },
      // Ajouter des données fictives pour les followers si absentes (pour démo)
      followers: eventObj.followers || Array(Math.floor(Math.random() * 15) + 1).fill().map((_, i) => ({
        name: `Ami ${i+1}`,
        profilePic: `https://randomuser.me/api/portraits/${Math.random() > 0.5 ? 'men' : 'women'}/${Math.floor(Math.random() * 100)}.jpg`
      })),
      followers_count: eventObj.followers_count || Math.floor(Math.random() * 15) + 1
    };

    res.status(200).json(formattedEvent);
  } catch (err) {
    console.error(`❌ Erreur lors de la récupération de l'événement :`, err.message);
    res.status(500).json({ message: 'Erreur interne du serveur.' });
  }
});

module.exports = router;

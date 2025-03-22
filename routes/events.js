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

// Cartographie standardisée des catégories
const CATEGORY_MAPPING = {
  // Mappage général pour standardiser les catégories
  "default": "Autre",
  
  // Catégories Shotgun -> Standard
  "deep": "Musique » Électronique",
  "techno": "Musique » Électronique",
  "house": "Musique » Électronique",
  "hip hop": "Musique » Hip-Hop",
  "rap": "Musique » Hip-Hop",
  "rock": "Musique » Rock",
  "indie": "Musique » Indie",
  "pop": "Musique » Pop",
  "jazz": "Musique » Jazz",
  "soul": "Musique » Soul",
  "funk": "Musique » Funk",
  "dj set": "Musique » DJ Set",
  "club": "Musique » Club",
  "festival": "Festival",
  "concert": "Concert",
  "live": "Concert",
  "comédie": "Théâtre » Comédie",
  "spectacle": "Spectacles",
  "danse": "Spectacles » Danse",
  "exposition": "Exposition",
  "conférence": "Conférence",
  "stand-up": "Spectacles » One-man-show",
  "one-man-show": "Spectacles » One-man-show",
  "théâtre": "Théâtre",
  "cinéma": "Cinéma",
  "projection": "Cinéma",
};

// Liste des catégories principales pour la carte
const MAIN_CATEGORIES = [
  "Théâtre",
  "Musique",
  "Spectacles",
  "Cinéma",
  "Exposition",
  "Festival",
  "Concert",
  "Conférence"
];

// Mappings détaillés pour l'analyse AI par catégorie
const CATEGORY_MAPPINGS_DETAILED = {
  "Théâtre": {
    "aspects": ["mise en scène", "jeu des acteurs", "texte", "scénographie"],
    "emotions": ["intense", "émouvant", "captivant", "enrichissant", "profond"]
  },
  "Théâtre contemporain": {
    "aspects": ["mise en scène", "jeu des acteurs", "texte", "originalité", "message"],
    "emotions": ["provocant", "dérangeant", "stimulant", "actuel", "profond"]
  },
  "Comédie": {
    "aspects": ["humour", "jeu des acteurs", "rythme", "dialogue"],
    "emotions": ["drôle", "amusant", "divertissant", "léger", "enjoué"]
  },
  "Spectacle musical": {
    "aspects": ["performance musicale", "mise en scène", "chant", "chorégraphie"],
    "emotions": ["entraînant", "mélodieux", "festif", "rythmé", "touchant"]
  },
  "One-man-show": {
    "aspects": ["humour", "présence scénique", "texte", "interaction"],
    "emotions": ["drôle", "mordant", "spontané", "énergique", "incisif"]
  },
  "Concert": {
    "aspects": ["performance", "répertoire", "son", "ambiance"],
    "emotions": ["électrisant", "envoûtant", "festif", "énergique", "intense"]
  },
  "Musique électronique": {
    "aspects": ["dj", "ambiance", "son", "rythme"],
    "emotions": ["festif", "énergique", "immersif", "exaltant", "hypnotique"]
  },
  "Danse": {
    "aspects": ["chorégraphie", "technique", "expressivité", "musique"],
    "emotions": ["gracieux", "puissant", "fluide", "émouvant", "esthétique"]
  },
  "Cirque": {
    "aspects": ["performance", "mise en scène", "acrobaties", "créativité"],
    "emotions": ["impressionnant", "magique", "époustouflant", "spectaculaire", "poétique"]
  },
  "Default": {  // Catégorie par défaut si non reconnue
    "aspects": ["qualité générale", "intérêt", "originalité"],
    "emotions": ["agréable", "intéressant", "divertissant", "satisfaisant"]
  }
};

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

// Fonction utilitaire pour standardiser une catégorie
function getStandardCategory(rawCategory) {
  if (!rawCategory) return CATEGORY_MAPPING["default"];
  
  const lowerCategory = rawCategory.toLowerCase();
  
  // Chercher dans le mapping
  for (const [key, value] of Object.entries(CATEGORY_MAPPING)) {
    if (lowerCategory.includes(key)) {
      return value;
    }
  }
  
  return CATEGORY_MAPPING["default"];
}

// Fonction pour récupérer les aspects et émotions liés à une catégorie
function getCategoryDetails(category) {
  if (!category) return CATEGORY_MAPPINGS_DETAILED["Default"];
  
  // Extraire la catégorie principale (avant le »)
  const mainCategory = category.split('»')[0].trim();
  
  // Chercher les détails de la catégorie
  if (CATEGORY_MAPPINGS_DETAILED[mainCategory]) {
    return CATEGORY_MAPPINGS_DETAILED[mainCategory];
  } else if (CATEGORY_MAPPINGS_DETAILED[category]) {
    return CATEGORY_MAPPINGS_DETAILED[category];
  }
  
  // Si aucune correspondance exacte, chercher une correspondance partielle
  for (const [key, details] of Object.entries(CATEGORY_MAPPINGS_DETAILED)) {
    if (mainCategory.includes(key) || key.includes(mainCategory)) {
      return details;
    }
  }
  
  return CATEGORY_MAPPINGS_DETAILED["Default"];
}

// **Recherche avancée avec filtres**
router.get('/advanced-search', async (req, res) => {
  try {
    const {
      latitude,          // Latitude pour recherche géolocalisée
      longitude,         // Longitude pour recherche géolocalisée
      radius = 10000,    // Rayon de recherche (10km par défaut)
      category,          // Catégorie (ex. : "Théâtre", "Cinéma")
      minNote,           // Note minimale globale
      miseEnScene,       // Note minimale pour mise_en_scene
      minMiseEnScene,    // Alias pour miseEnScene (compatibilité frontend)
      jeuActeurs,        // Note minimale pour jeu_acteurs
      minJeuActeurs,     // Alias pour jeuActeurs (compatibilité frontend)
      scenario,          // Note minimale pour scenario
      minScenario,       // Alias pour scenario (compatibilité frontend)
      emotions,          // Émotions (array ex. : ["drôle", "joyeux"])
      aspects,           // Aspects spécifiques (ex. : ["mise en scène", "jeu des acteurs"])
      minPrice,          // Prix minimum
      maxPrice           // Prix maximum
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

    // Filtrage par catégorie avec logique améliorée
    if (category) {
      // Chercher la catégorie standardisée et ses sous-catégories
      if (MAIN_CATEGORIES.includes(category)) {
        // Si c'est une catégorie principale, chercher toutes les sous-catégories
        const regex = new RegExp(`^${category}`, 'i');
        const relatedCategories = Object.values(CATEGORY_MAPPING).filter(cat => 
          regex.test(cat) || cat === category
        );
        
        // Chercher dans la catégorie originale ou standardisée
        query.$or = [
          { catégorie: { $regex: category, $options: 'i' } },
          { catégorie_standardisée: { $in: relatedCategories } }
        ];
      } else {
        // Sinon, recherche directe
        query.catégorie = { $regex: category, $options: 'i' };
      }
    }

    // Filtre par note globale
    if (minNote) {
      query.note = { $gte: parseFloat(minNote) };
    }

    // Filtres par notes spécifiques - gérer les versions "min" et standards pour compatibilité
    const effectiveMiseEnScene = miseEnScene || minMiseEnScene;
    if (effectiveMiseEnScene && parseFloat(effectiveMiseEnScene) > 0) {
      query["notes_globales.mise_en_scene"] = { $gte: parseFloat(effectiveMiseEnScene) };
    }
    
    const effectiveJeuActeurs = jeuActeurs || minJeuActeurs;
    if (effectiveJeuActeurs && parseFloat(effectiveJeuActeurs) > 0) {
      query["notes_globales.jeu_acteurs"] = { $gte: parseFloat(effectiveJeuActeurs) };
    }
    
    const effectiveScenario = scenario || minScenario;
    if (effectiveScenario && parseFloat(effectiveScenario) > 0) {
      query["notes_globales.scenario"] = { $gte: parseFloat(effectiveScenario) };
    }

    // Filtre par émotions
    if (emotions) {
      const emotionArray = Array.isArray(emotions) ? emotions : emotions.split(',');
      query["notes_globales.emotions"] = { $in: emotionArray }; // Correspondance avec au moins une émotion
    }
    
    // Filtre par aspects
    if (aspects) {
      const aspectArray = Array.isArray(aspects) ? aspects : aspects.split(',');
      query["notes_globales.aspects"] = { $in: aspectArray };
    }

    // Filtre par prix - gestion de différents formats de prix
    if (minPrice || maxPrice) {
      // On gère les différentes structures possibles pour les prix
      const priceQueries = [];
      
      // Format direct: prix_reduit est un nombre ou une chaîne avec valeur numérique
      if (minPrice) {
        priceQueries.push({ 
          prix_reduit: { 
            $gte: parseFloat(minPrice),
            $exists: true,
            $ne: null 
          } 
        });
      }
      if (maxPrice) {
        priceQueries.push({ 
          prix_reduit: { 
            $lte: parseFloat(maxPrice),
            $exists: true,
            $ne: null
          } 
        });
      }
      
      // Format avec élément et texte formatté (ex: "30 €")
      if (minPrice || maxPrice) {
        const priceConditions = {};
        if (minPrice) priceConditions.$gte = parseFloat(minPrice);
        if (maxPrice) priceConditions.$lte = parseFloat(maxPrice);
        
        priceQueries.push({
          "catégories_prix.Prix": {
            $elemMatch: priceConditions
          }
        });
      }
      
      // Si nous avons des conditions de prix, les ajouter à la requête avec $or
      if (priceQueries.length > 0) {
        query.$and = query.$and || [];
        query.$and.push({ $or: priceQueries });
      }
    }

    console.log('🔍 Recherche avancée avec les critères :', JSON.stringify(query, null, 2));

    // Exécuter la requête
    const events = await Event.find(query);

    console.log(`🔍 ${events.length} événement(s) trouvé(s)`);

    if (events.length === 0) {
      return res.status(404).json({ message: 'Aucun événement trouvé.' });
    }

    // Formater les résultats avec les catégories standardisées et détails associés
    const formattedEvents = events.map(event => {
      const eventObj = event.toObject();
      
      // Standardiser la catégorie
      const standardCategory = getStandardCategory(eventObj.catégorie);
      eventObj.catégorie_standardisée = standardCategory;
      
      // Récupérer les aspects et émotions associés à cette catégorie
      const categoryDetails = getCategoryDetails(standardCategory);
      
      return {
        _id: eventObj._id,
        intitulé: eventObj.intitulé || 'Intitulé non disponible',
        catégorie: eventObj.catégorie || 'Catégorie non disponible',
        catégorie_standardisée: standardCategory,
        categoryAspects: categoryDetails.aspects,
        categoryEmotions: categoryDetails.emotions,
        lieu: eventObj.lieu || 'Lieu non disponible',
        note: eventObj.note ? parseFloat(eventObj.note).toFixed(1) : '0.0',
        notes_globales: {
          mise_en_scene: eventObj.notes_globales?.mise_en_scene ? parseFloat(eventObj.notes_globales.mise_en_scene).toFixed(1) : '0.0',
          jeu_acteurs: eventObj.notes_globales?.jeu_acteurs ? parseFloat(eventObj.notes_globales.jeu_acteurs).toFixed(1) : '0.0',
          scenario: eventObj.notes_globales?.scenario ? parseFloat(eventObj.notes_globales.scenario).toFixed(1) : '0.0',
          émotions: eventObj.notes_globales?.emotions || [],
          aspects: eventObj.notes_globales?.aspects || categoryDetails.aspects,
          appréciation_globale: eventObj.notes_globales?.appréciation_globale || 'Non disponible',
        },
        prix_reduit: eventObj.prix_reduit || 'Prix non disponible',
        date_formatted: formatEventDate(eventObj.date_debut || eventObj.prochaines_dates),
        date_debut: eventObj.date_debut,
        prochaines_dates: eventObj.prochaines_dates,
        is_passed: isEventPassed(eventObj),
        location: eventObj.location || { coordinates: [] },
        image: getEventImageUrl(eventObj) || `https://source.unsplash.com/500x300/?${encodeURIComponent(standardCategory.split('»')[0].trim())}`,
        purchase_url: eventObj.purchase_url || '',
        interests: eventObj.interests || [],
        followers_interests: eventObj.followers_interests || [],
        // Ajouter des données fictives pour les followers si absentes (pour démo)
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

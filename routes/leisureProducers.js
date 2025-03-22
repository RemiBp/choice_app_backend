const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Conversation = require('../models/conversation'); // Import du modèle Conversation

// Connexion à la base Loisir&Culture
const leisureDb = mongoose.createConnection(process.env.MONGO_URI, {
  dbName: 'Loisir&Culture',
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

// Modèle pour la collection des producteurs de loisirs
const LeisureProducer = leisureDb.model(
  'LeisureProducer',
  new mongoose.Schema({}, { strict: false }),
  'Loisir_Paris_Producers' // Nom exact de la collection dans MongoDB
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

// Endpoint : Recherche de producteurs proches avec filtres avancés
router.get('/nearby', async (req, res) => {
  try {
    const {
      latitude,
      longitude,
      radius = 5000,
      category,
      minPrice,
      maxPrice,
      minRating,
      emotions,
      aspects,
      minMiseEnScene,
      minJeuActeurs,
      minScenario
    } = req.query;

    if (!latitude || !longitude) {
      return res.status(400).json({ message: 'Latitude et longitude sont nécessaires.' });
    }

    console.log(`🔍 Recherche de producteurs proches : [lat=${latitude}, long=${longitude}, rayon=${radius}m]`);

    // Construire le filtre de requête
    const query = {
      location: {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: [parseFloat(longitude), parseFloat(latitude)],
          },
          $maxDistance: parseInt(radius),
        },
      },
    };

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

    // Filtres de prix
    if (minPrice) query['evenements.prix_min'] = { $gte: parseFloat(minPrice) };
    if (maxPrice) query['evenements.prix_max'] = { $lte: parseFloat(maxPrice) };
    
    // Filtre de note minimale
    if (minRating) query.note = { $gte: parseFloat(minRating) };
    
    // Filtre par émotions
    if (emotions) {
      const emotionArray = emotions.split(',');
      query['notes_globales.emotions'] = { $in: emotionArray };
    }
    
    // Filtres pour les aspects spécifiques (mise en scène, jeu d'acteurs, etc.)
    if (minMiseEnScene && parseFloat(minMiseEnScene) > 0) {
      query['notes_globales.mise_en_scene'] = { $gte: parseFloat(minMiseEnScene) };
    }
    
    if (minJeuActeurs && parseFloat(minJeuActeurs) > 0) {
      query['notes_globales.jeu_acteurs'] = { $gte: parseFloat(minJeuActeurs) };
    }
    
    if (minScenario && parseFloat(minScenario) > 0) {
      query['notes_globales.scenario'] = { $gte: parseFloat(minScenario) };
    }
    
    // Filtre par aspect spécifique
    if (aspects) {
      const aspectArray = aspects.split(',');
      query['notes_globales.aspects'] = { $in: aspectArray };
    }

    // Sélectionner plus de champs pour afficher correctement les données
    const producers = await LeisureProducer.find(query).select(
      'lieu adresse location evenements description lien_lieu photo note notes_globales catégorie horaires followers'
    );

    // Traiter les résultats pour ajouter la catégorie standardisée et les informations liées
    const enhancedProducers = producers.map(producer => {
      const producerObj = producer.toObject();
      
      // Ajouter la catégorie standardisée
      const standardCategory = getStandardCategory(producerObj.catégorie);
      producerObj.catégorie_standardisée = standardCategory;
      
      // Récupérer les aspects et émotions associés à cette catégorie
      const categoryDetails = getCategoryDetails(standardCategory);
      producerObj.categoryAspects = categoryDetails.aspects;
      producerObj.categoryEmotions = categoryDetails.emotions;
      
      // S'assurer que note et notes_globales existent
      if (!producerObj.note) producerObj.note = 0;
      if (!producerObj.notes_globales) producerObj.notes_globales = {};
      
      // Ajouter un fallback pour les données manquantes mais nécessaires pour l'UI
      if (!producerObj.photo) {
        producerObj.photo = `https://source.unsplash.com/500x300/?${encodeURIComponent(standardCategory.split('»')[0].trim())}`;
      }
      
      // Ajouter des données fictives pour les followers si absentes (pour démo)
      if (!producerObj.followers || !Array.isArray(producerObj.followers) || producerObj.followers.length === 0) {
        const followerCount = Math.floor(Math.random() * 15) + 1; // Entre 1 et 15 followers
        producerObj.followers = Array(followerCount).fill().map((_, i) => ({
          name: `Ami ${i+1}`,
          profilePic: `https://randomuser.me/api/portraits/${Math.random() > 0.5 ? 'men' : 'women'}/${Math.floor(Math.random() * 100)}.jpg`
        }));
      }
      producerObj.followers_count = producerObj.followers.length;
      
      return producerObj;
    });

    console.log(`🔍 Producteurs trouvés à proximité : ${enhancedProducers.length}`);
    res.json(enhancedProducers);
  } catch (err) {
    console.error('❌ Erreur lors de la recherche géographique :', err.message);
    res.status(500).json({ message: 'Erreur interne du serveur.' });
  }
});

// Recherche par mots-clés
router.get('/search', async (req, res) => {
  try {
    const { query } = req.query;

    if (!query || query.trim() === '') {
      return res.status(400).json({ message: 'Veuillez fournir un mot-clé pour la recherche.' });
    }

    console.log('🔍 Recherche pour le mot-clé :', query);

    const producers = await LeisureProducer.find({
      $or: [
        { lieu: { $regex: query, $options: 'i' } },
        { adresse: { $regex: query, $options: 'i' } },
        { description: { $regex: query, $options: 'i' } },
      ],
    }).select('lieu adresse location evenements description lien_lieu');

    console.log(`🔍 ${producers.length} producteur(s) trouvé(s)`);

    if (producers.length === 0) {
      return res.status(404).json({ message: 'Aucun producteur de loisirs trouvé.' });
    }

    res.json(producers);
  } catch (err) {
    console.error('❌ Erreur lors de la recherche des producteurs de loisirs :', err.message);
    res.status(500).json({ message: 'Erreur interne du serveur.' });
  }
});

// Recherche par ID
router.get('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: 'ID invalide.' });
    }

    console.log(`🔍 Recherche d'un producteur de loisirs avec ID : ${id}`);
    const producer = await LeisureProducer.findById(id);

    if (!producer) {
      return res.status(404).json({ message: 'Producteur de loisirs non trouvé.' });
    }
    
    // Enrichir le producteur avec la catégorie standardisée et les infos liées
    const producerObj = producer.toObject();
    
    // Standardiser la catégorie
    const standardCategory = getStandardCategory(producerObj.catégorie);
    producerObj.catégorie_standardisée = standardCategory;
    
    // Ajouter les aspects et émotions associés
    const categoryDetails = getCategoryDetails(standardCategory);
    producerObj.categoryAspects = categoryDetails.aspects;
    producerObj.categoryEmotions = categoryDetails.emotions;
    
    // Ajouter des données de fallback si nécessaires
    if (!producerObj.photo) {
      producerObj.photo = `https://source.unsplash.com/500x300/?${encodeURIComponent(standardCategory.split('»')[0].trim())}`;
    }
    
    // Ajouter des données fictives pour les followers si absentes (pour démo)
    if (!producerObj.followers || !Array.isArray(producerObj.followers) || producerObj.followers.length === 0) {
      const followerCount = Math.floor(Math.random() * 15) + 1; // Entre 1 et 15 followers
      producerObj.followers = Array(followerCount).fill().map((_, i) => ({
        name: `Ami ${i+1}`,
        profilePic: `https://randomuser.me/api/portraits/${Math.random() > 0.5 ? 'men' : 'women'}/${Math.floor(Math.random() * 100)}.jpg`
      }));
    }
    producerObj.followers_count = producerObj.followers?.length || 0;

    res.status(200).json(producerObj);
  } catch (err) {
    console.error(`❌ Erreur lors de la récupération du producteur de loisirs :`, err.message);
    res.status(500).json({ message: 'Erreur interne du serveur.' });
  }
});

// Endpoint : Créer une conversation et envoyer un message si elle n'existe pas
router.post('/conversations/new-message', async (req, res) => {
  const { senderId, recipientIds, content } = req.body;

  if (!senderId || !recipientIds || recipientIds.length === 0 || !content) {
    return res.status(400).json({
      message: 'Le senderId, au moins un recipientId, et le contenu sont obligatoires.',
    });
  }

  try {
    // Combine senderId et recipientIds pour créer la liste des participants
    const participants = [senderId, ...recipientIds];

    // Vérifie si une conversation existe déjà pour ces participants
    let conversation = await Conversation.findOne({
      participants: { $all: participants, $size: participants.length },
    });

    // Si elle n'existe pas, la créer
    if (!conversation) {
      conversation = new Conversation({
        participants,
        messages: [],
        lastUpdated: Date.now(),
      });
    }

    // Ajouter le message initial
    const newMessage = {
      senderId,
      content,
      timestamp: Date.now(),
    };

    conversation.messages.push(newMessage);
    conversation.lastUpdated = Date.now();

    // Sauvegarde de la conversation
    await conversation.save();

    // Mettre à jour le champ `conversations` des producteurs de loisirs concernés
    const updateLeisureProducerConversations = async (producerId) => {
      await LeisureProducer.findByIdAndUpdate(
        producerId,
        { $addToSet: { conversations: conversation._id } }, // $addToSet évite les doublons
        { new: true }
      );
    };

    await Promise.all(participants.map((producerId) => updateLeisureProducerConversations(producerId)));

    res.status(201).json({
      message: 'Message envoyé avec succès.',
      conversationId: conversation._id,
      newMessage,
    });
  } catch (error) {
    console.error(
      'Erreur lors de la création de la conversation ou de l\'envoi du message :',
      error.message
    );
    res.status(500).json({ message: 'Erreur serveur.' });
  }
});

// Endpoint : Récupérer toutes les conversations d'un producteur de loisirs
router.get('/:id/conversations', async (req, res) => {
  const { id } = req.params;

  try {
    const conversations = await Conversation.find({
      participants: id,
    }).populate('participants', 'lieu description photo'); // Récupère les infos des participants

    res.status(200).json(conversations);
  } catch (error) {
    console.error('Erreur lors de la récupération des conversations :', error.message);
    res.status(500).json({ message: 'Erreur serveur.' });
  }
});

// Endpoint : Récupérer les messages d'une conversation
router.get('/conversations/:id/messages', async (req, res) => {
  const { id } = req.params;

  try {
    const conversation = await Conversation.findById(id).populate('messages.senderId', 'lieu description photo');

    if (!conversation) {
      return res.status(404).json({ message: 'Conversation non trouvée.' });
    }

    res.status(200).json(conversation.messages);
  } catch (error) {
    console.error('Erreur lors de la récupération des messages :', error.message);
    res.status(500).json({ message: 'Erreur serveur.' });
  }
});

module.exports = router;

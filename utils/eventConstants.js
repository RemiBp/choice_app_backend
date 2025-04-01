// Types d'événements spécifiques
const EVENT_TYPES = {
  concert: {
    aspects: ["performance", "son", "ambiance", "répertoire"],
    emotions: ["électrisant", "envoûtant", "festif", "énergique", "intense"]
  },
  theatre: {
    aspects: ["mise en scène", "jeu des acteurs", "texte", "scénographie"],
    emotions: ["intense", "émouvant", "captivant", "enrichissant", "profond"]
  },
  exposition: {
    aspects: ["curation", "médiation", "scénographie", "œuvres"],
    emotions: ["inspirant", "contemplatif", "enrichissant", "curieux", "émerveillé"]
  },
  festival: {
    aspects: ["programmation", "organisation", "ambiance", "diversité"],
    emotions: ["festif", "dynamique", "communautaire", "exaltant", "immersif"]
  },
  spectacle: {
    aspects: ["performance", "mise en scène", "technique", "créativité"],
    emotions: ["spectaculaire", "impressionnant", "magique", "époustouflant", "poétique"]
  },
  autre: {
    aspects: ["qualité générale", "intérêt", "originalité"],
    emotions: ["agréable", "intéressant", "divertissant", "satisfaisant"]
  }
};

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
  "Default": {
    "aspects": ["qualité générale", "intérêt", "originalité"],
    "emotions": ["agréable", "intéressant", "divertissant", "satisfaisant"]
  }
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

// Fonction pour récupérer les détails d'un type d'événement
function getEventTypeDetails(eventType) {
  return EVENT_TYPES[eventType] || EVENT_TYPES["autre"];
}

module.exports = {
  EVENT_TYPES,
  CATEGORY_MAPPING,
  MAIN_CATEGORIES,
  CATEGORY_MAPPINGS_DETAILED,
  getStandardCategory,
  getCategoryDetails,
  getEventTypeDetails
}; 
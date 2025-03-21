/**
 * Service de cartographie sensorielle pour l'IA
 * Ce service génère des métadonnées visuelles pour représenter des ambiances
 */

/**
 * Calcule l'intensité de la vibe basée sur les profils extraits
 * @param {string} vibe - L'ambiance/émotion demandée
 * @param {Array} profiles - Les profils extraits par l'IA
 * @returns {Object} - Valeurs d'intensité pour différentes dimensions
 */
function calculateVibeIntensity(vibe, profiles = []) {
  // Normaliser la vibe pour l'analyse
  const normalizedVibe = vibe.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  
  // Dimensions émotionnelles (valeurs de 0 à 1)
  const dimensions = {
    warmth: 0.5,      // Chaleur (froid à chaleureux)
    energy: 0.5,      // Énergie (calme à énergique)
    intimacy: 0.5,    // Intimité (public à intime)
    novelty: 0.5      // Nouveauté (traditionnel à innovant)
  };
  
  // Analyse simple basée sur des mots-clés
  if (normalizedVibe.includes("chaleureux") || normalizedVibe.includes("convivial")) {
    dimensions.warmth = 0.9;
  } else if (normalizedVibe.includes("froid") || normalizedVibe.includes("austere")) {
    dimensions.warmth = 0.1;
  }
  
  if (normalizedVibe.includes("energique") || normalizedVibe.includes("anime")) {
    dimensions.energy = 0.9;
  } else if (normalizedVibe.includes("calme") || normalizedVibe.includes("tranquille")) {
    dimensions.energy = 0.1;
  }
  
  if (normalizedVibe.includes("intime") || normalizedVibe.includes("romantique")) {
    dimensions.intimacy = 0.9;
  } else if (normalizedVibe.includes("public") || normalizedVibe.includes("ouvert")) {
    dimensions.intimacy = 0.1;
  }
  
  if (normalizedVibe.includes("innovant") || normalizedVibe.includes("original")) {
    dimensions.novelty = 0.9;
  } else if (normalizedVibe.includes("traditionnel") || normalizedVibe.includes("classique")) {
    dimensions.novelty = 0.1;
  }
  
  return dimensions;
}

/**
 * Extrait les mots-clés principaux de l'ambiance demandée
 * @param {string} vibe - L'ambiance/émotion demandée
 * @returns {Array} - Les mots-clés extraits
 */
function extractVibeKeywords(vibe) {
  // Liste de mots-clés à ignorer
  const stopWords = ["le", "la", "les", "un", "une", "des", "et", "ou", "en", "dans", "avec", "sans"];
  
  // Normaliser la vibe
  const normalizedVibe = vibe.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  
  // Nettoyer et diviser en mots
  const words = normalizedVibe
    .replace(/[.,;!?]/g, "")
    .split(/\s+/)
    .filter(word => word.length > 2 && !stopWords.includes(word));
  
  // Ajouter des mots-clés liés si pertinent
  const relatedKeywords = new Set(words);
  
  words.forEach(word => {
    const related = getRelatedKeywords(word);
    related.forEach(keyword => relatedKeywords.add(keyword));
  });
  
  return Array.from(relatedKeywords).slice(0, 6); // Limiter à 6 mots-clés
}

/**
 * Génère des vibes similaires à celle demandée
 * @param {string} vibe - L'ambiance/émotion demandée
 * @returns {Array} - Liste d'ambiances similaires
 */
function generateRelatedVibes(vibe) {
  const normalizedVibe = vibe.toLowerCase();
  
  // Liste prédéfinie de vibrations par catégorie
  const vibesByCategory = {
    chaleureux: ["convivial et chaleureux", "douillet et intime", "accueillant et familial"],
    calme: ["relaxant et apaisant", "tranquille et paisible", "zen et méditatif"],
    énergique: ["dynamique et animé", "festif et joyeux", "vivant et vibrant"],
    romantique: ["intime et romantique", "sensuel et élégant", "poétique et charmant"],
    artistique: ["créatif et inspirant", "artistique et bohème", "culturel et stimulant"],
    nostalgique: ["rétro et nostalgique", "vintage et authentique", "classique et intemporel"],
    moderne: ["contemporain et minimaliste", "branché et tendance", "innovant et audacieux"],
    luxueux: ["raffiné et luxueux", "élégant et sophistiqué", "chic et exclusif"],
    naturel: ["organique et naturel", "écologique et durable", "frais et verdoyant"],
    mélancolique: ["mélancolique et profond", "pensif et introspectif", "émotionnel et touchant"]
  };
  
  // Trouver la catégorie la plus proche
  let bestCategory = "chaleureux"; // Catégorie par défaut
  let bestScore = 0;
  
  for (const [category, _] of Object.entries(vibesByCategory)) {
    if (normalizedVibe.includes(category)) {
      bestCategory = category;
      break;
    }
    
    // Calculer un score de similarité simple
    const score = levenshteinDistance(normalizedVibe, category) / Math.max(normalizedVibe.length, category.length);
    if (score > bestScore) {
      bestScore = score;
      bestCategory = category;
    }
  }
  
  // Retourner les vibes de la catégorie la plus proche + quelques autres aléatoires
  const relatedVibes = [...vibesByCategory[bestCategory]];
  
  // Ajouter des vibes d'autres catégories
  const otherCategories = Object.keys(vibesByCategory).filter(cat => cat !== bestCategory);
  for (let i = 0; i < 2; i++) {
    const randomCategory = otherCategories[Math.floor(Math.random() * otherCategories.length)];
    const randomVibe = vibesByCategory[randomCategory][Math.floor(Math.random() * vibesByCategory[randomCategory].length)];
    if (!relatedVibes.includes(randomVibe)) {
      relatedVibes.push(randomVibe);
    }
  }
  
  return relatedVibes;
}

/**
 * Génère un schéma de couleurs pour une vibe
 * @param {string} vibe - L'ambiance/émotion demandée
 * @returns {Array} - Liste de codes couleur au format hex sans #
 */
function generateColorSchemeForVibe(vibe) {
  const normalizedVibe = vibe.toLowerCase();
  
  // Palettes prédéfinies par mood
  const colorPalettes = {
    chaleureux: ["ff9b54", "ff7e5f", "dd4c4f", "c04444"], // Oranges et rouges chauds
    calme: ["98c1d9", "6096ba", "468faf", "3e7e9e"],      // Bleus apaisants
    énergique: ["e63946", "f85a3e", "ff7b54", "ffac54"],   // Rouges et oranges vifs
    romantique: ["e77c8e", "d8667d", "bf5a6b", "9c5060"],  // Roses et bourgognes
    artistique: ["7269ef", "5e54cf", "4a438f", "382f6f"],  // Violets créatifs
    nostalgique: ["a17f67", "8d7157", "796049", "654d3c"], // Bruns nostalgiques
    moderne: ["2d3142", "4f5d75", "7f8fa3", "acb9c4"],     // Gris modernes
    luxueux: ["99621e", "c18238", "e0a951", "f2c166"],     // Ors luxueux
    naturel: ["679b6b", "549f56", "428a44", "347334"],     // Verts naturels
    mélancolique: ["3d5a80", "4a6fa5", "5e8abf", "7ba3d5"] // Bleus mélancoliques
  };
  
  // Trouver la palette la plus appropriée
  let bestPalette = "chaleureux"; // Palette par défaut
  
  for (const mood of Object.keys(colorPalettes)) {
    if (normalizedVibe.includes(mood)) {
      bestPalette = mood;
      break;
    }
  }
  
  return colorPalettes[bestPalette];
}

/**
 * Obtient des mots-clés liés à un mot donné
 * @param {string} word - Le mot à enrichir
 * @returns {Array} - Liste de mots-clés liés
 */
function getRelatedKeywords(word) {
  const wordMap = {
    // Mots liés à différentes ambiances
    chaleureux: ["convivial", "cosy", "douillet"],
    convivial: ["amical", "chaleureux", "sympathique"],
    calme: ["tranquille", "paisible", "relaxant", "apaisant"],
    energique: ["dynamique", "vif", "anime", "vivant"],
    anime: ["vivant", "energique", "festif"],
    intime: ["prive", "personnel", "romantique"],
    romantique: ["amoureux", "intime", "sensuel"],
    melancolique: ["nostalgique", "pensif", "emotionnel"],
    artistique: ["creatif", "boheme", "culturel"],
    luxueux: ["chic", "elegant", "raffine"],
    original: ["unique", "different", "nouveau"],
    cosy: ["confortable", "douillet", "chaleureux"]
  };
  
  return wordMap[word] || [];
}

/**
 * Calcule la distance de Levenshtein entre deux chaînes
 * @param {string} a - Première chaîne
 * @param {string} b - Deuxième chaîne
 * @returns {number} - Le score de similarité
 */
function levenshteinDistance(a, b) {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  
  const matrix = [];
  
  // Initialiser la matrice
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }
  
  // Remplir la matrice
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          Math.min(
            matrix[i][j - 1] + 1,   // insertion
            matrix[i - 1][j] + 1    // suppression
          )
        );
      }
    }
  }
  
  return matrix[b.length][a.length];
}

// Exporter les fonctions utilitaires
module.exports = {
  calculateVibeIntensity,
  extractVibeKeywords,
  generateRelatedVibes,
  generateColorSchemeForVibe
};
/**
 * Utilitaires pour la gestion des événements et producteurs de loisirs
 * Ce module fournit des fonctions pour normaliser les dates, les images et les routes
 * dans le contexte des modules Loisir&Culture
 */

// Imports nécessaires
const mongoose = require('mongoose');

/**
 * Normalise le format de date pour les événements
 * Prend en charge différents formats de dates (DD/MM/YYYY, texte, etc.)
 * et les convertit en un format standard pour l'affichage frontend
 * 
 * @param {string|Date|null} dateValue - La date à formater (divers formats possibles)
 * @param {string} format - Format de sortie ('display' ou 'iso')
 * @returns {string} - Date formatée ou message indiquant une date non disponible
 */
function formatEventDate(dateValue, format = 'display') {
  // Si pas de date, retourner un message standard
  if (!dateValue) return 'Date non disponible';

  try {
    let dateObj;
    
    // Cas 1: date au format DD/MM/YYYY
    if (typeof dateValue === 'string' && dateValue.match(/^\d{2}\/\d{2}\/\d{4}$/)) {
      const [day, month, year] = dateValue.split('/').map(Number);
      dateObj = new Date(year, month - 1, day);
    }
    // Cas 2: date au format textuel ("ven 7 mars")
    else if (typeof dateValue === 'string' && dateValue.match(/^[a-zé]{3,4}\s+\d{1,2}\s+[a-zû]{3,9}$/i)) {
      // Extraire les composants et convertir
      const parts = dateValue.split(/\s+/);
      const day = parseInt(parts[1], 10);
      const month = convertMonthNameToNumber(parts[2]);
      
      // Année courante par défaut (à adapter si besoin)
      const currentYear = new Date().getFullYear();
      dateObj = new Date(currentYear, month - 1, day);
      
      // Si la date est passée de plus de 6 mois, probablement l'année prochaine
      if (dateObj < new Date() && (new Date() - dateObj) > 15552000000) { // ~6 mois en ms
        dateObj.setFullYear(currentYear + 1);
      }
    }
    // Cas 3: objet Date déjà formaté
    else if (dateValue instanceof Date) {
      dateObj = dateValue;
    }
    // Cas 4: essai de conversion directe (ISO, etc.)
    else if (typeof dateValue === 'string') {
      dateObj = new Date(dateValue);
      if (isNaN(dateObj.getTime())) {
        return dateValue; // Retourner tel quel si pas convertible
      }
    }
    else {
      return String(dateValue); // Retourner en chaîne si type non géré
    }

    // Formats de sortie
    if (format === 'iso') {
      return dateObj.toISOString();
    } else if (format === 'yyyy-mm-dd') {
      return dateObj.toISOString().split('T')[0];
    } else {
      // Format d'affichage standard
      return dateObj.toLocaleDateString('fr-FR', {
        day: 'numeric', 
        month: 'long', 
        year: 'numeric'
      });
    }
  } catch (error) {
    console.error(`Erreur de formatage de date pour ${dateValue}:`, error);
    return String(dateValue); // Retourner la valeur originale si erreur
  }
}

/**
 * Convertit un nom de mois en français vers son numéro (1-12)
 * @param {string} monthName - Nom du mois en français
 * @returns {number} - Numéro du mois (1-12)
 */
function convertMonthNameToNumber(monthName) {
  const monthMap = {
    'janvier': 1, 'janv': 1, 'jan': 1,
    'février': 2, 'févr': 2, 'fév': 2, 'fev': 2,
    'mars': 3, 'mar': 3,
    'avril': 4, 'avr': 4,
    'mai': 5,
    'juin': 6,
    'juillet': 7, 'juil': 7,
    'août': 8, 'aout': 8,
    'septembre': 9, 'sept': 9,
    'octobre': 10, 'oct': 10,
    'novembre': 11, 'nov': 11,
    'décembre': 12, 'déc': 12, 'dec': 12
  };
  
  const normalizedName = monthName.toLowerCase().trim();
  return monthMap[normalizedName] || 1; // Défaut janvier si non trouvé
}

/**
 * Vérifie si un événement est passé
 * @param {Object} event - L'événement à vérifier
 * @returns {boolean} - true si l'événement est passé, false sinon
 */
function isEventPassed(event) {
  // Stratégie: vérifier les différents champs de date possibles
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Début de journée
    
    // Vérifier date_fin si disponible
    if (event.date_fin) {
      const dateEnd = extractDateObj(event.date_fin);
      if (dateEnd && dateEnd < today) return true;
    }
    
    // Vérifier date_debut si disponible
    if (event.date_debut) {
      const dateStart = extractDateObj(event.date_debut);
      if (dateStart && dateStart < today) return true;
    }
    
    // Vérifier les horaires si disponibles
    if (event.horaires && event.horaires.length > 0) {
      // Extraire la dernière date disponible
      const lastDate = event.horaires[event.horaires.length - 1];
      if (lastDate && lastDate.jour) {
        // Cas "ven 7 mars"
        if (typeof lastDate.jour === 'string' && 
            lastDate.jour.match(/^[a-zé]{3,4}\s+\d{1,2}\s+[a-zû]{3,9}$/i)) {
          const dateObj = extractDateObj(lastDate.jour);
          if (dateObj && dateObj < today) return true;
        }
      }
    }
    
    // Vérifier prochaines_dates si disponible
    if (event.prochaines_dates) {
      // Si contient "Dates non disponibles", considérer comme non passé
      if (event.prochaines_dates === "Dates non disponibles") {
        return false;
      }
      
      // Tenter d'extraire une date
      const dateObj = extractDateObj(event.prochaines_dates);
      if (dateObj && dateObj < today) return true;
    }
    
    // Par défaut, considérer comme non passé
    return false;
  } catch (error) {
    console.error("Erreur lors de la vérification si l'événement est passé:", error);
    return false; // Par défaut, considérer comme non passé
  }
}

/**
 * Extrait un objet Date à partir de diverses représentations de dates
 * @param {string|Date} dateValue - Valeur de date à convertir
 * @returns {Date|null} - Objet Date ou null si échec
 */
function extractDateObj(dateValue) {
  if (!dateValue) return null;
  
  try {
    // Si déjà un objet Date
    if (dateValue instanceof Date) return dateValue;
    
    // Si format DD/MM/YYYY
    if (typeof dateValue === 'string' && dateValue.match(/^\d{2}\/\d{2}\/\d{4}$/)) {
      const [day, month, year] = dateValue.split('/').map(Number);
      return new Date(year, month - 1, day);
    }
    
    // Si format "ven 7 mars" type
    if (typeof dateValue === 'string' && 
        dateValue.match(/^[a-zé]{3,4}\s+\d{1,2}\s+[a-zû]{3,9}$/i)) {
      const parts = dateValue.split(/\s+/);
      const day = parseInt(parts[1], 10);
      const month = convertMonthNameToNumber(parts[2]);
      const year = new Date().getFullYear();
      return new Date(year, month - 1, day);
    }
    
    // Tentative de conversion directe
    const date = new Date(dateValue);
    return isNaN(date.getTime()) ? null : date;
  } catch (error) {
    return null;
  }
}

/**
 * Normalise les noms de collection pour éviter les problèmes de routage
 * @param {string} collectionPath - Chemin de la collection (peut être Loisir_Paris_Evenements ou LoisirParisEvenements)
 * @returns {string} - Chemin normalisé
 */
function normalizeCollectionRoute(collectionPath) {
  if (!collectionPath) return '';
  
  // Retirer le préfixe /api/ s'il existe
  let path = collectionPath.startsWith('/api/') 
    ? collectionPath.substring(5) 
    : collectionPath;
  
  // Normaliser les formats de collection
  if (path.startsWith('Loisir_Paris_Evenements')) {
    return `/api/events/${path.split('/')[1]}`;
  } 
  else if (path.startsWith('LoisirParisEvenements')) {
    return `/api/events/${path.split('/')[1]}`;
  }
  else if (path.startsWith('Loisir_Paris_Producers')) {
    return `/api/leisureProducers/${path.split('/')[1]}`;
  }
  else if (path.startsWith('LoisirParisProducers')) {
    return `/api/leisureProducers/${path.split('/')[1]}`;
  }
  else if (path.startsWith('events/')) {
    return `/api/${path}`;
  }
  else if (path.startsWith('leisureProducers/')) {
    return `/api/${path}`;
  }
  
  // Si déjà au bon format, retourner tel quel
  return path.startsWith('/') ? path : `/${path}`;
}

/**
 * Récupère l'URL d'image pour un événement
 * avec gestion des cas où l'image n'est pas disponible
 * @param {Object} event - Événement
 * @returns {string} - URL de l'image ou URL par défaut
 */
function getEventImageUrl(event) {
  if (!event) return '/assets/images/default_event.jpg';
  
  // Vérifier les différents champs d'image possibles
  if (event.image && typeof event.image === 'string' && event.image.startsWith('http')) {
    return event.image;
  }
  
  if (event.photo && typeof event.photo === 'string' && event.photo.startsWith('http')) {
    return event.photo;
  }
  
  // Si le producteur associé a une image
  if (event.producerImage && typeof event.producerImage === 'string' && event.producerImage.startsWith('http')) {
    return event.producerImage;
  }
  
  // Image par défaut
  return '/assets/images/default_event.jpg';
}

/**
 * Récupère l'URL de la photo de profil d'un producteur de loisirs
 * @param {Object} producer - Producteur de loisirs
 * @returns {string} - URL de l'image de profil ou image par défaut
 */
function getProducerProfileImage(producer) {
  if (!producer) return '/assets/images/default_producer.jpg';
  
  // Vérifier les différents champs d'image possibles par ordre de priorité
  
  // 1. Champ image explicite
  if (producer.image && typeof producer.image === 'string' && producer.image.startsWith('http')) {
    return producer.image;
  }
  
  // 2. Champ photo
  if (producer.photo && typeof producer.photo === 'string' && producer.photo.startsWith('http')) {
    return producer.photo;
  }
  
  // 3. Premier élément du tableau photos
  if (producer.photos && Array.isArray(producer.photos) && producer.photos.length > 0) {
    const firstPhoto = producer.photos[0];
    if (typeof firstPhoto === 'string' && firstPhoto.startsWith('http')) {
      return firstPhoto;
    }
  }
  
  // 4. Image du premier événement si disponible
  if (producer.evenements && Array.isArray(producer.evenements) && producer.evenements.length > 0) {
    const firstEvent = producer.evenements[0];
    if (firstEvent && firstEvent.image && typeof firstEvent.image === 'string' && firstEvent.image.startsWith('http')) {
      return firstEvent.image;
    }
  }
  
  // Image par défaut
  return '/assets/images/default_producer.jpg';
}

// Exporter les fonctions
module.exports = {
  formatEventDate,
  isEventPassed,
  normalizeCollectionRoute,
  getEventImageUrl,
  getProducerProfileImage
};
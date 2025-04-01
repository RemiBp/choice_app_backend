const mongoose = require('mongoose');

/**
 * Normalise un document en gérant toutes les variations de noms de champs
 */
const normalizeDocument = (doc) => {
  if (!doc) return null;

  // Convertir le document en objet simple
  const document = doc.toObject ? doc.toObject() : { ...doc };

  return {
    _id: document._id,
    title: document.title || document.intitulé || document.name || '',
    description: document.description || document.détail || document.content || '',
    location: normalizeLocation(document.location || document.lieu || document.adresse),
    media: normalizeMedia(document),
    date: normalizeDate(document),
    author: normalizeAuthor(document),
    metrics: normalizeMetrics(document),
    interactions: normalizeInteractions(document),
    type: determineDocumentType(document),
    metadata: extractMetadata(document)
  };
};

/**
 * Normalise les données de localisation
 */
const normalizeLocation = (location) => {
  if (!location) return null;

  // Si c'est une chaîne, on la considère comme une adresse
  if (typeof location === 'string') {
    return {
      name: location,
      address: location,
      coordinates: null
    };
  }

  // Si on a des coordonnées au format GeoJSON
  if (location.type === 'Point' && Array.isArray(location.coordinates)) {
    return {
      name: location.name || '',
      address: location.address || '',
      coordinates: {
        longitude: location.coordinates[0],
        latitude: location.coordinates[1]
      }
    };
  }

  // Si on a des coordonnées au format {latitude, longitude}
  if (location.latitude !== undefined && location.longitude !== undefined) {
    return {
      name: location.name || '',
      address: location.address || '',
      coordinates: {
        latitude: location.latitude,
        longitude: location.longitude
      }
    };
  }

  return {
    name: location.name || '',
    address: location.address || '',
    coordinates: null
  };
};

/**
 * Normalise les médias (photos, images, etc.)
 */
const normalizeMedia = (document) => {
  const mediaArray = [];

  // Gérer les différents formats de médias
  if (document.media) mediaArray.push(...(Array.isArray(document.media) ? document.media : [document.media]));
  if (document.photos) mediaArray.push(...(Array.isArray(document.photos) ? document.photos : [document.photos]));
  if (document.image) mediaArray.push(document.image);
  if (document.photo) mediaArray.push(document.photo);
  if (document.photo_url) mediaArray.push(document.photo_url);

  return [...new Set(mediaArray)].filter(Boolean);
};

/**
 * Normalise les dates
 */
const normalizeDate = (document) => {
  return {
    created: document.posted_at || document.time_posted || document.created_at || new Date(),
    start: document.date_debut || null,
    end: document.date_fin || null,
    updated: document.updated_at || document.last_modified || null
  };
};

/**
 * Normalise les informations sur l'auteur
 */
const normalizeAuthor = (document) => {
  return {
    id: document.author_id || document.user_id || null,
    name: document.author_name || document.user_name || document.name || '',
    avatar: document.author_avatar || document.user_avatar || document.photo_url || document.avatar || null
  };
};

/**
 * Normalise les métriques
 */
const normalizeMetrics = (document) => {
  return {
    views: document.views || 0,
    likes: (document.likes?.length || 0) + (document.liked_by?.length || 0),
    interests: (document.interestedUsers?.length || 0) + (document.interests?.length || 0),
    choices: (document.choices?.length || 0) + (document.choiceUsers?.length || 0) + (document.choice || 0),
    comments: document.comments?.length || 0,
    followers: (document.followers?.length || 0) + (document.abonnés || 0),
    rating: document.rating || document.note || null
  };
};

/**
 * Normalise les interactions
 */
const normalizeInteractions = (document) => {
  return {
    likes: document.likes || document.liked_by || [],
    interests: document.interestedUsers || document.interests || [],
    choices: document.choices || document.choiceUsers || [],
    comments: normalizeComments(document.comments || [])
  };
};

/**
 * Normalise les commentaires
 */
const normalizeComments = (comments) => {
  if (!Array.isArray(comments)) return [];

  return comments.map(comment => ({
    id: comment._id || comment.id,
    content: comment.content || comment.text || '',
    author: normalizeAuthor(comment),
    created_at: comment.created_at || comment.date || new Date(),
    updated_at: comment.updated_at || null
  }));
};

/**
 * Détermine le type de document
 */
const determineDocumentType = (document) => {
  if (document.catégorie || document.date_debut) return 'event';
  if (document.menu || document.opening_hours) return 'restaurant';
  if (document.evenements || document.nombre_evenements) return 'leisure_producer';
  return 'post';
};

/**
 * Extrait les métadonnées spécifiques au type
 */
const extractMetadata = (document) => {
  const metadata = {};

  switch (determineDocumentType(document)) {
    case 'event':
      metadata.category = document.catégorie || document.category || '';
      metadata.price = document.prix_reduit || document.ancien_prix || null;
      metadata.schedule = document.horaires || [];
      break;

    case 'restaurant':
      metadata.opening_hours = document.opening_hours || [];
      metadata.menu = document.menu || [];
      metadata.price_level = document.price_level || null;
      metadata.service_options = document.service_options || {};
      break;

    case 'leisure_producer':
      metadata.events_count = document.nombre_evenements || 0;
      metadata.events = document.evenements || [];
      break;

    default:
      metadata.tags = document.tags || [];
  }

  return metadata;
};

module.exports = {
  normalizeDocument,
  normalizeLocation,
  normalizeMedia,
  normalizeDate,
  normalizeAuthor,
  normalizeMetrics,
  normalizeInteractions,
  normalizeComments
}; 
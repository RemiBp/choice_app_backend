const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { choiceAppDb } = require('../index');

// Modèles nécessaires pour les recherches
const Restaurant = choiceAppDb.model(
  'Restaurant',
  new mongoose.Schema({}, { strict: false }),
  'Restaurants'
);

const LeisureProducer = choiceAppDb.model(
  'LeisureProducer',
  new mongoose.Schema({}, { strict: false }),
  'LeisureProducers'
);

const WellnessPlace = require('../models/WellnessPlace');
const Event = choiceAppDb.model(
  'Event',
  new mongoose.Schema({}, { strict: false }),
  'Events'
);

/**
 * @route POST /api/map/vibe
 * @desc Générer une carte sensorielle basée sur un "vibe"
 */
router.post('/vibe', async (req, res) => {
  try {
    const { vibe, location, radius, limit = 10 } = req.body;
    
    if (!vibe) {
      return res.status(400).json({ 
        success: false,
        message: 'Vibe (ambiance) requis pour la recherche' 
      });
    }
    
    // Normaliser le terme "vibe" pour la recherche
    const normalizedVibe = vibe.toLowerCase();
    const vibeKeywords = normalizedVibe.split(/[\s,]+/);
    
    // Construire la requête de recherche
    const searchQuery = {
      $or: [
        { description: { $regex: normalizedVibe, $options: 'i' } },
        { 'keywords': { $in: vibeKeywords } },
        { 'atmosphere.vibe': { $regex: normalizedVibe, $options: 'i' } },
        { 'notes.atmosphere': { $regex: normalizedVibe, $options: 'i' } }
      ]
    };
    
    // Ajouter filtre de localisation si fourni
    if (location) {
      // Simplification: on cherche dans l'adresse
      searchQuery.$and = [
        { address: { $regex: location, $options: 'i' } }
      ];
    }
    
    // Rechercher dans différentes collections
    const [restaurants, leisureVenues, wellnessPlaces, events] = await Promise.all([
      Restaurant.find(searchQuery).limit(limit),
      LeisureProducer.find(searchQuery).limit(limit),
      WellnessPlace.find(searchQuery).limit(limit),
      Event.find({
        ...searchQuery,
        date: { $gte: new Date() } // uniquement les événements à venir
      }).limit(limit)
    ]);
    
    // Formater les résultats
    const profiles = [
      ...restaurants.map(r => ({
        id: r._id,
        name: r.name,
        type: 'restaurant',
        description: r.description,
        address: r.address,
        image: r.photos?.[0] || r.image || r.profile_photo,
        rating: r.rating || 0,
        vibe_match: calculateVibeMatch(r, normalizedVibe),
        location: r.gps_coordinates || r.location?.coordinates
      })),
      ...leisureVenues.map(v => ({
        id: v._id,
        name: v.name,
        type: 'leisureProducer',
        description: v.description,
        address: v.address,
        image: v.photos?.[0] || v.image || v.profile_photo,
        rating: v.rating || 0,
        vibe_match: calculateVibeMatch(v, normalizedVibe),
        location: v.gps_coordinates || v.location?.coordinates
      })),
      ...wellnessPlaces.map(w => ({
        id: w._id,
        name: w.name,
        type: 'wellnessPlace',
        description: w.description,
        address: w.address,
        image: w.photos?.[0] || w.image || w.profile_photo,
        rating: w.rating || 0,
        vibe_match: calculateVibeMatch(w, normalizedVibe),
        location: w.gps_coordinates || w.location?.coordinates
      })),
      ...events.map(e => ({
        id: e._id,
        name: e.title || e.name,
        type: 'event',
        description: e.description,
        address: e.location || e.address || e.venue?.address,
        image: e.image || e.photos?.[0],
        date: e.date,
        vibe_match: calculateVibeMatch(e, normalizedVibe),
        location: e.gps_coordinates || e.location?.coordinates
      })),
    ];
    
    // Trier par correspondance d'ambiance
    profiles.sort((a, b) => b.vibe_match - a.vibe_match);
    
    // Générer d'autres informations utiles pour la visualisation
    const vibeMapData = {
      vibe: vibe,
      location: location || 'Partout',
      timestamp: new Date(),
      profiles: profiles.slice(0, limit),
      stats: {
        total_matches: profiles.length,
        restaurant_count: restaurants.length,
        leisure_count: leisureVenues.length,
        wellness_count: wellnessPlaces.length,
        event_count: events.length,
        average_match: profiles.reduce((sum, p) => sum + p.vibe_match, 0) / (profiles.length || 1)
      },
      meta: {
        keywords: vibeKeywords
      }
    };
    
    res.status(200).json(vibeMapData);
  } catch (error) {
    console.error('❌ Erreur lors de la génération de la carte sensorielle:', error);
    res.status(500).json({ 
      success: false,
      message: 'Erreur lors de la génération de la carte sensorielle', 
      error: error.message 
    });
  }
});

/**
 * Calcule la correspondance entre un document et un "vibe"
 * @param {Object} document Document de la base de données
 * @param {String} vibe Terme d'ambiance recherché
 * @returns {Number} Score de correspondance entre 0 et 1
 */
function calculateVibeMatch(document, vibe) {
  // Extraire les champs pertinents pour l'analyse
  const relevantFields = [
    document.description || '',
    document.atmosphere?.vibe || '',
    document.notes?.atmosphere || '',
    Array.isArray(document.keywords) ? document.keywords.join(' ') : '',
    document.style || '',
    document.decor || '',
    document.ambiance || ''
  ].join(' ').toLowerCase();
  
  // Mots-clés de l'ambiance recherchée
  const vibeTerms = vibe.toLowerCase().split(/[\s,]+/);
  
  // Calculer un score simple basé sur le nombre d'occurrences
  let matchCount = 0;
  vibeTerms.forEach(term => {
    const regex = new RegExp(term, 'g');
    const matches = relevantFields.match(regex);
    matchCount += matches ? matches.length : 0;
  });
  
  // Normaliser le score (entre 0 et 1)
  const maxPossibleMatches = vibeTerms.length * 3; // Heuristique: si chaque terme apparaît 3 fois, c'est un match parfait
  return Math.min(matchCount / maxPossibleMatches, 1);
}

module.exports = router; 
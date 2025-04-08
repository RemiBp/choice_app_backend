const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { beautyWellnessDb } = require('../index');

// Modèle pour les établissements wellness
const WellnessPlace = beautyWellnessDb.model(
  'WellnessPlace',
  new mongoose.Schema({}, { strict: false }),
  'WellnessPlaces'
);

/**
 * @route GET /api/wellness/places
 * @desc Récupérer tous les établissements wellness avec pagination
 */
router.get('/places', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    
    const places = await WellnessPlace.find()
      .sort({ rating: -1 })
      .skip(skip)
      .limit(limit);
    
    const total = await WellnessPlace.countDocuments();
    
    res.status(200).json({
      places,
      pagination: {
        total,
        page,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('❌ Erreur lors de la récupération des établissements wellness:', error);
    res.status(500).json({ 
      success: false,
      message: 'Erreur lors de la récupération des établissements wellness', 
      error: error.message 
    });
  }
});

/**
 * @route GET /api/wellness/places/:id
 * @desc Récupérer un établissement wellness par son ID
 */
router.get('/places/:id', async (req, res) => {
  try {
    const place = await WellnessPlace.findById(req.params.id);
    
    if (!place) {
      return res.status(404).json({ 
        success: false,
        message: 'Établissement wellness non trouvé' 
      });
    }
    
    res.status(200).json(place);
  } catch (error) {
    console.error(`❌ Erreur lors de la récupération de l'établissement wellness ${req.params.id}:`, error);
    res.status(500).json({ 
      success: false,
      message: 'Erreur lors de la récupération de l\'établissement wellness', 
      error: error.message 
    });
  }
});

/**
 * @route POST /api/wellness/places
 * @desc Créer un nouvel établissement wellness
 */
router.post('/places', async (req, res) => {
  try {
    const newPlace = new WellnessPlace(req.body);
    await newPlace.save();
    
    res.status(201).json({
      success: true,
      message: 'Établissement wellness créé avec succès',
      place: newPlace
    });
  } catch (error) {
    console.error('❌ Erreur lors de la création de l\'établissement wellness:', error);
    res.status(500).json({ 
      success: false,
      message: 'Erreur lors de la création de l\'établissement wellness', 
      error: error.message 
    });
  }
});

/**
 * @route PUT /api/wellness/places/:id
 * @desc Mettre à jour un établissement wellness
 */
router.put('/places/:id', async (req, res) => {
  try {
    const updatedPlace = await WellnessPlace.findByIdAndUpdate(
      req.params.id,
      { $set: req.body },
      { new: true }
    );
    
    if (!updatedPlace) {
      return res.status(404).json({ 
        success: false,
        message: 'Établissement wellness non trouvé' 
      });
    }
    
    res.status(200).json({
      success: true,
      message: 'Établissement wellness mis à jour avec succès',
      place: updatedPlace
    });
  } catch (error) {
    console.error(`❌ Erreur lors de la mise à jour de l'établissement wellness ${req.params.id}:`, error);
    res.status(500).json({ 
      success: false,
      message: 'Erreur lors de la mise à jour de l\'établissement wellness', 
      error: error.message 
    });
  }
});

/**
 * @route DELETE /api/wellness/places/:id
 * @desc Supprimer un établissement wellness
 */
router.delete('/places/:id', async (req, res) => {
  try {
    const deletedPlace = await WellnessPlace.findByIdAndDelete(req.params.id);
    
    if (!deletedPlace) {
      return res.status(404).json({ 
        success: false,
        message: 'Établissement wellness non trouvé' 
      });
    }
    
    res.status(200).json({
      success: true,
      message: 'Établissement wellness supprimé avec succès'
    });
  } catch (error) {
    console.error(`❌ Erreur lors de la suppression de l'établissement wellness ${req.params.id}:`, error);
    res.status(500).json({ 
      success: false,
      message: 'Erreur lors de la suppression de l\'établissement wellness', 
      error: error.message 
    });
  }
});

/**
 * @route GET /api/wellness/places/nearby
 * @desc Récupérer les établissements wellness à proximité
 */
router.get('/places/nearby', async (req, res) => {
  try {
    const { lat, lng, radius = 5000 } = req.query;
    
    if (!lat || !lng) {
      return res.status(400).json({ 
        success: false,
        message: 'Latitude et longitude requises' 
      });
    }
    
    const places = await WellnessPlace.find({
      'location.coordinates': {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: [parseFloat(lng), parseFloat(lat)]
          },
          $maxDistance: parseInt(radius)
        }
      }
    }).limit(20);
    
    res.status(200).json(places);
  } catch (error) {
    console.error('❌ Erreur lors de la recherche des établissements wellness à proximité:', error);
    res.status(500).json({ 
      success: false,
      message: 'Erreur lors de la recherche des établissements wellness à proximité', 
      error: error.message 
    });
  }
});

/**
 * @route GET /api/wellness/categories
 * @desc Récupérer toutes les catégories de bien-être
 */
router.get('/categories', async (req, res) => {
  try {
    const categories = await WellnessPlace.distinct('category');
    const subCategories = {};
    
    for (const category of categories) {
      subCategories[category] = await WellnessPlace.distinct('sous_categorie', { category });
    }
    
    res.status(200).json({
      categories,
      subCategories
    });
  } catch (error) {
    console.error('❌ Erreur lors de la récupération des catégories wellness:', error);
    res.status(500).json({ 
      success: false,
      message: 'Erreur lors de la récupération des catégories wellness', 
      error: error.message 
    });
  }
});

/**
 * @route GET /api/wellness/search
 * @desc Rechercher des établissements wellness
 */
router.get('/search', async (req, res) => {
  try {
    const { query, category, subCategory } = req.query;
    
    const searchQuery = {};
    
    if (query) {
      searchQuery.$or = [
        { name: { $regex: query, $options: 'i' } },
        { description: { $regex: query, $options: 'i' } },
        { address: { $regex: query, $options: 'i' } }
      ];
    }
    
    if (category) {
      searchQuery.category = category;
    }
    
    if (subCategory) {
      searchQuery.sous_categorie = subCategory;
    }
    
    const places = await WellnessPlace.find(searchQuery)
      .sort({ rating: -1 })
      .limit(20);
    
    res.status(200).json(places);
  } catch (error) {
    console.error('❌ Erreur lors de la recherche des établissements wellness:', error);
    res.status(500).json({ 
      success: false,
      message: 'Erreur lors de la recherche des établissements wellness', 
      error: error.message 
    });
  }
});

module.exports = router; 
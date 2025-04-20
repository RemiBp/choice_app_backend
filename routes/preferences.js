const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Producer = require('../models/Producer');
const LeisureProducer = require('../models/leisureProducer');
const BeautyProducer = require('../models/beautyProducer');
const Event = require('../models/event');
const WellnessPlace = require('../models/WellnessPlace');

// Middleware d'authentification
const auth = async (req, res, next) => {
  // Votre logique d'authentification ici
  next();
};

// GET /api/preferences - Obtenir les préférences de l'utilisateur
router.get('/', auth, async (req, res) => {
  try {
    const userId = req.user.id;
    
    const user = await User.findById(userId).select('interests liked_tags preferences');
    
    if (!user) {
      return res.status(404).json({ error: 'Utilisateur non trouvé' });
    }
    
    res.status(200).json({
      interests: user.interests || [],
      liked_tags: user.liked_tags || [],
      preferences: user.preferences || {}
    });
  } catch (error) {
    console.error('Erreur de récupération des préférences:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des préférences' });
  }
});

// PUT /api/preferences - Mettre à jour les préférences de l'utilisateur
router.put('/', auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { interests, liked_tags, preferences } = req.body;
    
    const updateData = {};
    
    if (interests) updateData.interests = interests;
    if (liked_tags) updateData.liked_tags = liked_tags;
    if (preferences) updateData.preferences = preferences;
    
    const user = await User.findByIdAndUpdate(
      userId,
      { $set: updateData },
      { new: true }
    ).select('interests liked_tags preferences');
    
    if (!user) {
      return res.status(404).json({ error: 'Utilisateur non trouvé' });
    }
    
    res.status(200).json({
      interests: user.interests || [],
      liked_tags: user.liked_tags || [],
      preferences: user.preferences || {}
    });
  } catch (error) {
    console.error('Erreur de mise à jour des préférences:', error);
    res.status(500).json({ error: 'Erreur lors de la mise à jour des préférences' });
  }
});

// GET /api/preferences/choices - Obtenir les choix de l'utilisateur
router.get('/choices', auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { type } = req.query;
    
    const user = await User.findById(userId).select('choices');
    
    if (!user) {
      return res.status(404).json({ error: 'Utilisateur non trouvé' });
    }
    
    const choices = user.choices || [];
    
    // Si un type spécifique est demandé, on filtre les choix par type
    if (type) {
      let results = [];
      
      // Fonction pour récupérer des éléments par leur ID depuis une collection
      const getItemsByIds = async (model, ids) => {
        if (!ids || ids.length === 0) return [];
        return await model.find({ _id: { $in: ids } });
      };
      
      switch (type) {
        case 'restaurants':
          results = await getItemsByIds(Producer, choices);
          break;
        case 'leisure':
          results = await getItemsByIds(LeisureProducer, choices);
          break;
        case 'beauty':
          results = await getItemsByIds(BeautyProducer, choices);
          break;
        case 'wellness':
          results = await getItemsByIds(WellnessPlace, choices);
          break;
        case 'events':
          results = await getItemsByIds(Event, choices);
          break;
        default:
          // Si le type n'est pas reconnu, on renvoie juste les IDs
          results = choices;
      }
      
      return res.status(200).json(results);
    }
    
    // Si aucun type n'est spécifié, on renvoie juste les IDs des choix
    res.status(200).json(choices);
  } catch (error) {
    console.error('Erreur de récupération des choix:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des choix' });
  }
});

// POST /api/preferences/choices/:itemId - Ajouter un choix
router.post('/choices/:itemId', auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { itemId } = req.params;
    const { type } = req.body;
    
    if (!itemId) {
      return res.status(400).json({ error: 'ID de l\'élément requis' });
    }
    
    // Vérifier si l'élément existe selon son type
    let itemExists = false;
    let itemModel;
    
    switch (type) {
      case 'restaurant':
        itemModel = Producer;
        break;
      case 'leisure':
        itemModel = LeisureProducer;
        break;
      case 'beauty':
        itemModel = BeautyProducer;
        break;
      case 'wellness':
        itemModel = WellnessPlace;
        break;
      case 'event':
        itemModel = Event;
        break;
      default:
        // Si le type n'est pas spécifié, on vérifie dans toutes les collections
        itemExists = 
          (await Producer.exists({ _id: itemId })) ||
          (await LeisureProducer.exists({ _id: itemId })) ||
          (await BeautyProducer.exists({ _id: itemId })) ||
          (await WellnessPlace.exists({ _id: itemId })) ||
          (await Event.exists({ _id: itemId }));
        break;
    }
    
    if (itemModel && !itemExists) {
      itemExists = await itemModel.exists({ _id: itemId });
    }
    
    if (!itemExists) {
      return res.status(404).json({ error: 'Élément non trouvé' });
    }
    
    // Ajouter l'élément aux choix de l'utilisateur
    const user = await User.findByIdAndUpdate(
      userId,
      { $addToSet: { choices: itemId } },
      { new: true }
    ).select('choices');
    
    // Incrémenter le compteur de choix si on n'avait pas déjà cet élément
    if (!user.choices.includes(itemId)) {
      await User.findByIdAndUpdate(userId, { $inc: { choiceCount: 1 } });
      
      // Si c'est un élément spécifique, incrémenter son compteur de choix
      if (itemModel) {
        await itemModel.findByIdAndUpdate(itemId, { $inc: { choice_count: 1 } });
      }
    }
    
    res.status(200).json({
      message: 'Choix ajouté avec succès',
      choices: user.choices
    });
  } catch (error) {
    console.error('Erreur d\'ajout de choix:', error);
    res.status(500).json({ error: 'Erreur lors de l\'ajout du choix' });
  }
});

// DELETE /api/preferences/choices/:itemId - Supprimer un choix
router.delete('/choices/:itemId', auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { itemId } = req.params;
    const { type } = req.query;
    
    if (!itemId) {
      return res.status(400).json({ error: 'ID de l\'élément requis' });
    }
    
    // Vérifier si l'utilisateur a bien cet élément dans ses choix
    const user = await User.findById(userId).select('choices');
    
    if (!user) {
      return res.status(404).json({ error: 'Utilisateur non trouvé' });
    }
    
    if (!user.choices || !user.choices.includes(itemId)) {
      return res.status(400).json({ error: 'Cet élément n\'est pas dans vos choix' });
    }
    
    // Supprimer l'élément des choix de l'utilisateur
    await User.findByIdAndUpdate(
      userId,
      { $pull: { choices: itemId } },
      { new: true }
    );
    
    // Décrémenter le compteur de choix de l'utilisateur
    await User.findByIdAndUpdate(userId, { $inc: { choiceCount: -1 } });
    
    // Si le type est spécifié, décrémenter le compteur de choix de l'élément
    let itemModel;
    
    switch (type) {
      case 'restaurant':
        itemModel = Producer;
        break;
      case 'leisure':
        itemModel = LeisureProducer;
        break;
      case 'beauty':
        itemModel = BeautyProducer;
        break;
      case 'event':
        itemModel = Event;
        break;
    }
    
    if (itemModel) {
      await itemModel.findByIdAndUpdate(itemId, { $inc: { choice_count: -1 } });
    }
    
    res.status(200).json({
      message: 'Choix supprimé avec succès'
    });
  } catch (error) {
    console.error('Erreur de suppression de choix:', error);
    res.status(500).json({ error: 'Erreur lors de la suppression du choix' });
  }
});

// POST /api/preferences/tag/:tag - Ajouter un tag aimé
router.post('/tag/:tag', auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { tag } = req.params;
    
    if (!tag) {
      return res.status(400).json({ error: 'Tag requis' });
    }
    
    // Ajouter le tag aux tags aimés de l'utilisateur
    const user = await User.findByIdAndUpdate(
      userId,
      { $addToSet: { liked_tags: tag } },
      { new: true }
    ).select('liked_tags');
    
    res.status(200).json({
      message: 'Tag ajouté avec succès',
      liked_tags: user.liked_tags
    });
  } catch (error) {
    console.error('Erreur d\'ajout de tag:', error);
    res.status(500).json({ error: 'Erreur lors de l\'ajout du tag' });
  }
});

// DELETE /api/preferences/tag/:tag - Supprimer un tag aimé
router.delete('/tag/:tag', auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { tag } = req.params;
    
    if (!tag) {
      return res.status(400).json({ error: 'Tag requis' });
    }
    
    // Supprimer le tag des tags aimés de l'utilisateur
    const user = await User.findByIdAndUpdate(
      userId,
      { $pull: { liked_tags: tag } },
      { new: true }
    ).select('liked_tags');
    
    res.status(200).json({
      message: 'Tag supprimé avec succès',
      liked_tags: user.liked_tags
    });
  } catch (error) {
    console.error('Erreur de suppression de tag:', error);
    res.status(500).json({ error: 'Erreur lors de la suppression du tag' });
  }
});

// POST /api/preferences/interests - Mettre à jour les intérêts
router.post('/interests', auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { interests } = req.body;
    
    if (!interests || !Array.isArray(interests)) {
      return res.status(400).json({ error: 'Intérêts requis sous forme de tableau' });
    }
    
    // Mettre à jour les intérêts de l'utilisateur
    const user = await User.findByIdAndUpdate(
      userId,
      { $set: { interests } },
      { new: true }
    ).select('interests');
    
    res.status(200).json({
      message: 'Intérêts mis à jour avec succès',
      interests: user.interests
    });
  } catch (error) {
    console.error('Erreur de mise à jour des intérêts:', error);
    res.status(500).json({ error: 'Erreur lors de la mise à jour des intérêts' });
  }
});

module.exports = router; 
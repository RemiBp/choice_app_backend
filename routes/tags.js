const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { requireAuth } = require('../middleware/authMiddleware'); // Middleware d'authentification
const { getModel } = require('../models'); // Assuming models/index.js exports getModel

// Schéma pour les tags
const tagSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  type: { 
    type: String, 
    enum: ['cuisine', 'activity', 'ambiance', 'service', 'genre', 'interest', 'category', 'mood'],
    required: true 
  },
  icon: { type: String },
  color: { type: String },
  count: { type: Number, default: 0 }, // Nombre d'éléments utilisant ce tag
  parentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tag' }, // Pour les hiérarchies de tags
  created_at: { type: Date, default: Date.now },
  isActive: { type: Boolean, default: true }
});

// Schéma pour les tags de contact (si non déjà défini ailleurs)
const contactTagSchema = new mongoose.Schema({
  name: { type: String, required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  color: { type: String },
  icon: { type: String },
  count: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
});

// Schéma pour les associations de tag de contact
const contactTagAssociationSchema = new mongoose.Schema({
  tagId: { type: mongoose.Schema.Types.ObjectId, ref: 'ContactTag', required: true },
  contactId: { type: mongoose.Schema.Types.ObjectId, required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  createdAt: { type: Date, default: Date.now }
});

// Helper pour obtenir le bon modèle basé sur le type d'entité
const getModelByType = (type) => {
  // Use the central getModel function
  switch (type) {
    case 'user':
      return getModel('User'); 
    case 'restaurant':
      return getModel('Producer'); // Use the correct name 'Producer'
    case 'leisureProducer':
      return getModel('LeisureProducer');
    case 'event':
      return getModel('Event');
    case 'beautyPlace':
      return getModel('BeautyPlace'); 
    case 'wellnessPlace':
      return getModel('WellnessPlace'); 
    // Ajoutez d'autres types si nécessaire
    default:
      console.warn(`getModelByType called with unknown type: ${type}`);
      return null;
  }
};

/**
 * @route GET /api/tags
 * @desc Récupérer tous les tags ou filtrer par type
 * @access Public
 */
router.get('/', async (req, res) => {
  try {
    const TagModel = getModel('Tag'); // Get Tag model here
    if (!TagModel) return res.status(500).json({ message: 'Tag model not initialized.' });

    const { type, limit = 100, search } = req.query;
    
    let query = { isActive: true };
    
    // Filtrer par type si spécifié
    if (type) {
      query.type = type;
    }
    
    // Recherche par nom si spécifié
    if (search) {
      query.name = { $regex: search, $options: 'i' };
    }
    
    // Récupérer les tags
    const tags = await TagModel.find(query)
      .sort({ count: -1 }) // Trier par popularité
      .limit(parseInt(limit));
    
    res.status(200).json(tags);
  } catch (error) {
    console.error('❌ Erreur lors de la récupération des tags:', error);
    res.status(500).json({ message: 'Erreur interne du serveur.' });
  }
});

/**
 * @route GET /api/tags/:id
 * @desc Récupérer un tag par son ID
 * @access Public
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const tag = await getModel('Tag').findById(id);
    
    if (!tag) {
      return res.status(404).json({ message: 'Tag non trouvé.' });
    }
    
    res.status(200).json(tag);
  } catch (error) {
    console.error('❌ Erreur lors de la récupération du tag:', error);
    res.status(500).json({ message: 'Erreur interne du serveur.' });
  }
});

/**
 * @route POST /api/tags
 * @desc Créer un nouveau tag
 * @access Private (admin)
 */
router.post('/', requireAuth, async (req, res) => {
  try {
    const { name, type, icon, color, parentId } = req.body;
    
    if (!name || !type) {
      return res.status(400).json({ message: 'Nom et type du tag requis.' });
    }
    
    // Vérifier si le tag existe déjà
    const existingTag = await getModel('Tag').findOne({ name, type });
    
    if (existingTag) {
      return res.status(400).json({ message: 'Ce tag existe déjà.' });
    }
    
    // Vérifier si le parent existe si spécifié
    if (parentId) {
      const parentTag = await getModel('Tag').findById(parentId);
      
      if (!parentTag) {
        return res.status(400).json({ message: 'Tag parent non trouvé.' });
      }
    }
    
    // Créer le nouveau tag
    const newTag = new getModel('Tag')({
      name,
      type,
      icon,
      color,
      parentId,
      created_at: new Date(),
      count: 0,
      isActive: true
    });
    
    await newTag.save();
    
    res.status(201).json(newTag);
  } catch (error) {
    console.error('❌ Erreur lors de la création du tag:', error);
    res.status(500).json({ message: 'Erreur interne du serveur.' });
  }
});

/**
 * @route PUT /api/tags/:id
 * @desc Mettre à jour un tag
 * @access Private (admin)
 */
router.put('/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, type, icon, color, parentId, isActive } = req.body;
    
    // Vérifier si le tag existe
    const tag = await getModel('Tag').findById(id);
    
    if (!tag) {
      return res.status(404).json({ message: 'Tag non trouvé.' });
    }
    
    // Mettre à jour les champs
    if (name) tag.name = name;
    if (type) tag.type = type;
    if (icon !== undefined) tag.icon = icon;
    if (color !== undefined) tag.color = color;
    if (parentId !== undefined) tag.parentId = parentId;
    if (isActive !== undefined) tag.isActive = isActive;
    
    // Sauvegarder les modifications
    await tag.save();
    
    res.status(200).json(tag);
  } catch (error) {
    console.error('❌ Erreur lors de la mise à jour du tag:', error);
    res.status(500).json({ message: 'Erreur interne du serveur.' });
  }
});

/**
 * @route DELETE /api/tags/:id
 * @desc Supprimer un tag
 * @access Private (admin)
 */
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Option pour désactiver plutôt que supprimer complètement
    const { deactivateOnly = true } = req.query;
    
    if (deactivateOnly === 'true') {
      // Désactiver le tag plutôt que le supprimer
      const result = await getModel('Tag').findByIdAndUpdate(id, { isActive: false }, { new: true });
      
      if (!result) {
        return res.status(404).json({ message: 'Tag non trouvé.' });
      }
      
      return res.status(200).json({ message: 'Tag désactivé avec succès.', tag: result });
    }
    
    // Supprimer définitivement le tag
    const result = await getModel('Tag').findByIdAndDelete(id);
    
    if (!result) {
      return res.status(404).json({ message: 'Tag non trouvé.' });
    }
    
    res.status(200).json({ message: 'Tag supprimé avec succès.' });
  } catch (error) {
    console.error('❌ Erreur lors de la suppression du tag:', error);
    res.status(500).json({ message: 'Erreur interne du serveur.' });
  }
});

/**
 * @route POST /api/tags/increment
 * @desc Incrémenter le compteur d'un tag
 * @access Private
 */
router.post('/increment', requireAuth, async (req, res) => {
  try {
    const { tagIds } = req.body;
    
    if (!tagIds || !Array.isArray(tagIds)) {
      return res.status(400).json({ message: 'Liste de tagIds requise.' });
    }
    
    // Incrémenter le compteur pour chaque tag
    const updatePromises = tagIds.map(tagId => 
      getModel('Tag').findByIdAndUpdate(tagId, { $inc: { count: 1 } }, { new: true })
    );
    
    const results = await Promise.all(updatePromises);
    
    // Filtrer les résultats null (tags non trouvés)
    const validResults = results.filter(r => r !== null);
    
    res.status(200).json({
      message: `${validResults.length} tag(s) incrémenté(s) avec succès.`,
      updatedTags: validResults
    });
  } catch (error) {
    console.error('❌ Erreur lors de l\'incrémentation des tags:', error);
    res.status(500).json({ message: 'Erreur interne du serveur.' });
  }
});

/**
 * @route POST /api/tags/decrement
 * @desc Décrémenter le compteur d'un tag
 * @access Private
 */
router.post('/decrement', requireAuth, async (req, res) => {
  try {
    const { tagIds } = req.body;
    
    if (!tagIds || !Array.isArray(tagIds)) {
      return res.status(400).json({ message: 'Liste de tagIds requise.' });
    }
    
    // Décrémenter le compteur pour chaque tag
    const updatePromises = tagIds.map(tagId => 
      getModel('Tag').findByIdAndUpdate(tagId, { $inc: { count: -1 } }, { new: true })
    );
    
    const results = await Promise.all(updatePromises);
    
    // Filtrer les résultats null (tags non trouvés)
    const validResults = results.filter(r => r !== null);
    
    res.status(200).json({
      message: `${validResults.length} tag(s) décrémenté(s) avec succès.`,
      updatedTags: validResults
    });
  } catch (error) {
    console.error('❌ Erreur lors de la décrémentation des tags:', error);
    res.status(500).json({ message: 'Erreur interne du serveur.' });
  }
});

/**
 * @route POST /api/tags/bulk
 * @desc Créer plusieurs tags en une seule opération
 * @access Private (admin)
 */
router.post('/bulk', requireAuth, async (req, res) => {
  try {
    const { tags } = req.body;
    
    if (!tags || !Array.isArray(tags) || tags.length === 0) {
      return res.status(400).json({ message: 'Liste de tags requise.' });
    }
    
    // Valider chaque tag
    for (const tag of tags) {
      if (!tag.name || !tag.type) {
        return res.status(400).json({ 
          message: 'Chaque tag doit avoir un nom et un type.',
          invalidTag: tag
        });
      }
    }
    
    // Préparer les tags avec des valeurs par défaut
    const tagsToInsert = tags.map(tag => ({
      ...tag,
      created_at: new Date(),
      count: 0,
      isActive: true
    }));
    
    // Insérer les tags
    const result = await getModel('Tag').insertMany(tagsToInsert, { ordered: false });
    
    res.status(201).json({
      message: `${result.length} tag(s) créé(s) avec succès.`,
      tags: result
    });
  } catch (error) {
    // Gérer les erreurs de duplication
    if (error.code === 11000) {
      return res.status(400).json({ 
        message: 'Certains tags existent déjà.', 
        error: error.message
      });
    }
    
    console.error('❌ Erreur lors de la création en masse de tags:', error);
    res.status(500).json({ message: 'Erreur interne du serveur.' });
  }
});

/**
 * @route GET /api/tags/entity/:entityType/:entityId
 * @desc Récupérer les tags associés à une entité
 * @access Public (or Private depending on use case - leaving public for now)
 */
router.get('/entity/:entityType/:entityId', async (req, res) => {
  // ... route logic ...
});

/**
 * @route GET /api/tags/contact-tags
 * @desc Récupérer tous les tags de contacts pour un utilisateur
 * @access Private
 */
router.get('/contact-tags', requireAuth, async (req, res) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ message: 'Authentification requise' });
    }

    // Rechercher les tags de contacts de l'utilisateur
    const contactTags = await getModel('ContactTag').find({ 
      userId,
      isActive: true 
    }).sort({ name: 1 });

    // Rechercher les associations entre tags et contacts
    const associations = await getModel('ContactTagAssociation').find({ userId });

    res.status(200).json({
      tags: contactTags,
      associations: associations
    });
  } catch (error) {
    console.error('❌ Erreur lors de la récupération des tags de contacts:', error);
    res.status(500).json({ message: 'Erreur interne du serveur.' });
  }
});

/**
 * @route POST /api/tags/contact-tags/sync
 * @desc Synchroniser un tag de contact
 * @access Private
 */
router.post('/contact-tags/sync', requireAuth, async (req, res) => {
  try {
    const { tag } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ message: 'Authentification requise' });
    }

    if (!tag) {
      return res.status(400).json({ message: 'Le tag est requis.' });
    }

    // Vérifier si le tag existe déjà
    let existingTag = await getModel('ContactTag').findOne({ 
      userId,
      id: tag.id 
    });

    if (existingTag) {
      // Mettre à jour le tag existant
      existingTag.name = tag.name;
      existingTag.color = tag.color;
      existingTag.icon = tag.icon;
      existingTag.description = tag.description;
      existingTag.updatedAt = new Date();
      
      await existingTag.save();
    } else {
      // Créer un nouveau tag
      existingTag = new getModel('ContactTag')({
        ...tag,
        userId,
        createdAt: new Date(),
        updatedAt: new Date()
      });
      
      await existingTag.save();
    }

    res.status(200).json({
      message: 'Tag synchronisé avec succès',
      tag: existingTag
    });
  } catch (error) {
    console.error('❌ Erreur lors de la synchronisation du tag:', error);
    res.status(500).json({ message: 'Erreur interne du serveur.' });
  }
});

/**
 * @route DELETE /api/tags/contact-tags/:id
 * @desc Supprimer un tag de contact
 * @access Private
 */
router.delete('/contact-tags/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ message: 'Authentification requise' });
    }

    // Supprimer le tag
    const result = await getModel('ContactTag').findOneAndDelete({ 
      userId,
      id 
    });

    if (!result) {
      return res.status(404).json({ message: 'Tag non trouvé.' });
    }

    // Supprimer toutes les associations liées à ce tag
    await getModel('ContactTagAssociation').deleteMany({ 
      userId,
      tagId: id 
    });

    res.status(200).json({ message: 'Tag et associations supprimés avec succès.' });
  } catch (error) {
    console.error('❌ Erreur lors de la suppression du tag:', error);
    res.status(500).json({ message: 'Erreur interne du serveur.' });
  }
});

/**
 * @route POST /api/tags/contact-tags/association
 * @desc Ajouter une association tag-contact
 * @access Private
 */
router.post('/contact-tags/association', requireAuth, async (req, res) => {
  try {
    const { contactId, tagId } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ message: 'Authentification requise' });
    }

    if (!contactId || !tagId) {
      return res.status(400).json({ message: 'ContactId et tagId sont requis.' });
    }

    // Vérifier si l'association existe déjà
    const existingAssociation = await getModel('ContactTagAssociation').findOne({ 
      userId,
      contactId,
      tagId 
    });

    if (existingAssociation) {
      return res.status(200).json({ 
        message: 'Association déjà existante',
        association: existingAssociation
      });
    }

    // Créer nouvelle association
    const newAssociation = new getModel('ContactTagAssociation')({
      userId,
      contactId,
      tagId,
      createdAt: new Date()
    });

    await newAssociation.save();

    res.status(201).json({
      message: 'Association créée avec succès',
      association: newAssociation
    });
  } catch (error) {
    console.error('❌ Erreur lors de la création de l\'association:', error);
    res.status(500).json({ message: 'Erreur interne du serveur.' });
  }
});

/**
 * @route DELETE /api/tags/contact-tags/association
 * @desc Supprimer une association tag-contact
 * @access Private
 */
router.delete('/contact-tags/association', requireAuth, async (req, res) => {
  try {
    const { contactId, tagId } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ message: 'Authentification requise' });
    }

    if (!contactId || !tagId) {
      return res.status(400).json({ message: 'ContactId et tagId sont requis.' });
    }

    // Supprimer l'association
    const result = await getModel('ContactTagAssociation').findOneAndDelete({ 
      userId,
      contactId,
      tagId 
    });

    if (!result) {
      return res.status(404).json({ message: 'Association non trouvée.' });
    }

    res.status(200).json({ message: 'Association supprimée avec succès.' });
  } catch (error) {
    console.error('❌ Erreur lors de la suppression de l\'association:', error);
    res.status(500).json({ message: 'Erreur interne du serveur.' });
  }
});

/**
 * @route POST /api/tags/:tagId/associate
 * @desc Ajouter une association tag-contact
 * @access Private
 */
router.post('/:tagId/associate', requireAuth, async (req, res) => {
  try {
    const { contactId } = req.body;
    const tagId = req.params.tagId;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ message: 'Authentification requise' });
    }

    if (!contactId || !tagId) {
      return res.status(400).json({ message: 'ContactId et tagId sont requis.' });
    }

    // Vérifier si l'association existe déjà
    const existingAssociation = await getModel('ContactTagAssociation').findOne({ 
      userId,
      contactId,
      tagId 
    });

    if (existingAssociation) {
      return res.status(200).json({ 
        message: 'Association déjà existante',
        association: existingAssociation
      });
    }

    // Créer nouvelle association
    const newAssociation = new getModel('ContactTagAssociation')({
      userId,
      contactId,
      tagId,
      createdAt: new Date()
    });

    await newAssociation.save();

    res.status(201).json({
      message: 'Association créée avec succès',
      association: newAssociation
    });
  } catch (error) {
    console.error('❌ Erreur lors de la création de l\'association:', error);
    res.status(500).json({ message: 'Erreur interne du serveur.' });
  }
});

/**
 * @route DELETE /api/tags/:tagId/dissociate
 * @desc Supprimer une association tag-contact
 * @access Private
 */
router.delete('/:tagId/dissociate', requireAuth, async (req, res) => {
  try {
    const { contactId } = req.body;
    const tagId = req.params.tagId;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ message: 'Authentification requise' });
    }

    if (!contactId || !tagId) {
      return res.status(400).json({ message: 'ContactId et tagId sont requis.' });
    }

    // Supprimer l'association
    const result = await getModel('ContactTagAssociation').findOneAndDelete({ 
      userId,
      contactId,
      tagId 
    });

    if (!result) {
      return res.status(404).json({ message: 'Association non trouvée.' });
    }

    res.status(200).json({ message: 'Association supprimée avec succès.' });
  } catch (error) {
    console.error('❌ Erreur lors de la suppression de l\'association:', error);
    res.status(500).json({ message: 'Erreur interne du serveur.' });
  }
});

/**
 * @route POST /api/tags/contacts/add
 * @desc Ajouter un tag à un contact
 * @access Private
 */
router.post('/contacts/add', requireAuth, async (req, res) => {
  try {
    const { contactId, tagId } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ message: 'Authentification requise' });
    }

    if (!contactId || !tagId) {
      return res.status(400).json({ message: 'ContactId et tagId sont requis.' });
    }

    // Vérifier si le contact existe
    const contact = await getModel('User').findById(contactId);
    if (!contact) {
      return res.status(404).json({ message: 'Contact non trouvé.' });
    }

    // Vérifier si le tag existe
    const tag = await getModel('Tag').findById(tagId);
    if (!tag) {
      return res.status(404).json({ message: 'Tag non trouvé.' });
    }

    // Ajouter le tag au contact
    const result = await getModel('User').findByIdAndUpdate(
      contactId,
      { $addToSet: { tags: tagId } },
      { new: true }
    ).select('tags');

    res.status(200).json({ 
      message: 'Tag ajouté avec succès', 
      contactId,
      tags: result ? result.tags : []
    });
  } catch (error) {
    console.error('❌ Erreur lors de l\'ajout du tag au contact:', error);
    res.status(500).json({ message: 'Erreur interne du serveur.', error: error.message });
  }
});

/**
 * @route DELETE /api/tags/contacts/remove
 * @desc Supprimer un tag d'un contact
 * @access Private
 */
router.delete('/contacts/remove', requireAuth, async (req, res) => {
  try {
    const { contactId, tagId } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ message: 'Authentification requise' });
    }

    if (!contactId || !tagId) {
      return res.status(400).json({ message: 'ContactId et tagId sont requis.' });
    }

    // Supprimer le tag du contact
    const result = await getModel('User').findByIdAndUpdate(
      contactId,
      { $pull: { tags: tagId } },
      { new: true }
    ).select('tags');

    res.status(200).json({ 
      message: 'Tag supprimé avec succès', 
      contactId,
      tags: result ? result.tags : []
    });
  } catch (error) {
    console.error('❌ Erreur lors de la suppression du tag du contact:', error);
    res.status(500).json({ message: 'Erreur interne du serveur.', error: error.message });
  }
});

/**
 * @route GET /api/tags/contacts/user
 * @desc Récupérer les tags d'un utilisateur
 * @access Private
 */
router.get('/contacts/user', requireAuth, async (req, res) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ message: 'Authentification requise' });
    }

    // Récupérer les tags de l'utilisateur
    const tags = await getModel('Tag').find({
      userId,
      isActive: true
    }).sort({ name: 1 });

    res.status(200).json({
      tags: tags
    });
  } catch (error) {
    console.error('❌ Erreur lors de la récupération des tags de l\'utilisateur:', error);
    res.status(500).json({ message: 'Erreur interne du serveur.' });
  }
});

module.exports = router; 
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const auth = require('../middleware/auth'); // Middleware d'authentification
const { createModel, databases } = require('../utils/modelCreator');

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

// Créer les modèles directement
const Tag = createModel(databases.CHOICE_APP, 'Tag', 'tags', tagSchema);
const ContactTag = createModel(databases.CHOICE_APP, 'ContactTag', 'ContactTags', contactTagSchema);
const ContactTagAssociation = createModel(databases.CHOICE_APP, 'ContactTagAssociation', 'ContactTagAssociations', contactTagAssociationSchema);

// Initialisation des modèles - maintenant supprimée car on crée les modèles directement
// Non utilisé, mais gardé pour compatibilité
const initialize = (db) => {
  // Rien à faire ici maintenant
};

// Connexions aux DBs (alternative à createModel si vous préférez)
const choiceAppDb = mongoose.connection.useDb('choice_app');
const restaurationDb = mongoose.connection.useDb('Restauration_Officielle');
const loisirDb = mongoose.connection.useDb('Loisir&Culture');
const beautyWellnessDb = mongoose.connection.useDb('Beauty_Wellness');

// Modèles
const User = choiceAppDb.model('User', new mongoose.Schema({}, { strict: false }), 'Users');
const Restaurant = restaurationDb.model('Restaurant', new mongoose.Schema({}, { strict: false }), 'producers');
const LeisureProducer = loisirDb.model('LeisureProducer', new mongoose.Schema({}, { strict: false }), 'Loisir_Paris_Producers');
const Event = loisirDb.model('Event', new mongoose.Schema({}, { strict: false }), 'Loisir_Paris_Evenements');
const BeautyPlace = beautyWellnessDb.model('BeautyPlace', new mongoose.Schema({}, { strict: false }), 'BeautyPlaces');
const WellnessPlace = beautyWellnessDb.model('WellnessPlace', new mongoose.Schema({}, { strict: false }), 'WellnessPlaces');

// Helper pour obtenir le bon modèle basé sur le type d'entité
const getModelByType = (type) => {
  switch (type) {
    case 'user':
      return User;
    case 'restaurant':
      return Restaurant;
    case 'leisureProducer':
      return LeisureProducer;
    case 'event':
      return Event;
    case 'beautyPlace':
      return BeautyPlace;
    case 'wellnessPlace':
      return WellnessPlace;
    // Ajoutez d'autres types si nécessaire
    default:
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
    const tags = await Tag.find(query)
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
    
    const tag = await Tag.findById(id);
    
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
router.post('/', async (req, res) => {
  try {
    const { name, type, icon, color, parentId } = req.body;
    
    if (!name || !type) {
      return res.status(400).json({ message: 'Nom et type du tag requis.' });
    }
    
    // Vérifier si le tag existe déjà
    const existingTag = await Tag.findOne({ name, type });
    
    if (existingTag) {
      return res.status(400).json({ message: 'Ce tag existe déjà.' });
    }
    
    // Vérifier si le parent existe si spécifié
    if (parentId) {
      const parentTag = await Tag.findById(parentId);
      
      if (!parentTag) {
        return res.status(400).json({ message: 'Tag parent non trouvé.' });
      }
    }
    
    // Créer le nouveau tag
    const newTag = new Tag({
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
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, type, icon, color, parentId, isActive } = req.body;
    
    // Vérifier si le tag existe
    const tag = await Tag.findById(id);
    
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
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Option pour désactiver plutôt que supprimer complètement
    const { deactivateOnly = true } = req.query;
    
    if (deactivateOnly === 'true') {
      // Désactiver le tag plutôt que le supprimer
      const result = await Tag.findByIdAndUpdate(id, { isActive: false }, { new: true });
      
      if (!result) {
        return res.status(404).json({ message: 'Tag non trouvé.' });
      }
      
      return res.status(200).json({ message: 'Tag désactivé avec succès.', tag: result });
    }
    
    // Supprimer définitivement le tag
    const result = await Tag.findByIdAndDelete(id);
    
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
router.post('/increment', async (req, res) => {
  try {
    const { tagIds } = req.body;
    
    if (!tagIds || !Array.isArray(tagIds)) {
      return res.status(400).json({ message: 'Liste de tagIds requise.' });
    }
    
    // Incrémenter le compteur pour chaque tag
    const updatePromises = tagIds.map(tagId => 
      Tag.findByIdAndUpdate(tagId, { $inc: { count: 1 } }, { new: true })
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
 * @route POST /api/tags/bulk
 * @desc Créer plusieurs tags en une seule opération
 * @access Private (admin)
 */
router.post('/bulk', async (req, res) => {
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
    const result = await Tag.insertMany(tagsToInsert, { ordered: false });
    
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
 * @route GET /api/contact-tags
 * @desc Récupérer tous les tags de contacts pour un utilisateur
 * @access Private
 */
router.get('/contact-tags', async (req, res) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ message: 'Authentification requise' });
    }

    // Rechercher les tags de contacts de l'utilisateur
    const contactTags = await ContactTag.find({ 
      userId,
      isActive: true 
    }).sort({ name: 1 });

    // Rechercher les associations entre tags et contacts
    const associations = await ContactTagAssociation.find({ userId });

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
 * @route POST /api/contact-tags/sync
 * @desc Synchroniser un tag de contact
 * @access Private
 */
router.post('/contact-tags/sync', async (req, res) => {
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
    let existingTag = await ContactTag.findOne({ 
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
      existingTag = new ContactTag({
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
 * @route DELETE /api/contact-tags/:id
 * @desc Supprimer un tag de contact
 * @access Private
 */
router.delete('/contact-tags/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ message: 'Authentification requise' });
    }

    // Supprimer le tag
    const result = await ContactTag.findOneAndDelete({ 
      userId,
      id 
    });

    if (!result) {
      return res.status(404).json({ message: 'Tag non trouvé.' });
    }

    // Supprimer toutes les associations liées à ce tag
    await ContactTagAssociation.deleteMany({ 
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
 * @route POST /api/contact-tags/association
 * @desc Ajouter une association tag-contact
 * @access Private
 */
router.post('/contact-tags/association', async (req, res) => {
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
    const existingAssociation = await ContactTagAssociation.findOne({ 
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
    const newAssociation = new ContactTagAssociation({
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
 * @route DELETE /api/contact-tags/association
 * @desc Supprimer une association tag-contact
 * @access Private
 */
router.delete('/contact-tags/association', async (req, res) => {
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
    const result = await ContactTagAssociation.findOneAndDelete({ 
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
 * @route POST /api/tags
 * @desc Ajouter un tag à une entité (User, Producer, Event, etc.)
 * @access Private (authentification requise)
 * @body { entityType: string, entityId: string, tag: string }
 */
router.post('/', auth, async (req, res) => {
  const { entityType, entityId, tag } = req.body;

  if (!entityType || !entityId || !tag) {
    return res.status(400).json({ message: 'entityType, entityId et tag sont requis.' });
  }

  const Model = getModelByType(entityType);
  if (!Model) {
    return res.status(400).json({ message: 'Type d\'entité invalide.' });
  }

  try {
    const entity = await Model.findById(entityId);
    if (!entity) {
      return res.status(404).json({ message: 'Entité non trouvée.' });
    }

    // Ajouter le tag à la liste (en évitant les doublons)
    // Assurez-vous que le champ 'tags' existe dans vos modèles !
    const result = await Model.findByIdAndUpdate(
      entityId,
      { $addToSet: { tags: tag } }, // $addToSet évite les doublons
      { new: true, upsert: false } // new: true retourne le document mis à jour
    ).select('tags'); // Sélectionne seulement le champ tags pour la réponse

    res.status(200).json({ 
      message: 'Tag ajouté avec succès', 
      entityType,
      entityId,
      tags: result ? result.tags : []
    });

  } catch (error) {
    console.error(`Erreur lors de l'ajout du tag à ${entityType} ${entityId}:`, error);
    res.status(500).json({ message: 'Erreur interne du serveur.', error: error.message });
  }
});

/**
 * @route DELETE /api/tags
 * @desc Supprimer un tag d'une entité
 * @access Private
 * @body { entityType: string, entityId: string, tag: string }
 */
router.delete('/', auth, async (req, res) => {
  const { entityType, entityId, tag } = req.body;

  if (!entityType || !entityId || !tag) {
    return res.status(400).json({ message: 'entityType, entityId et tag sont requis.' });
  }

  const Model = getModelByType(entityType);
  if (!Model) {
    return res.status(400).json({ message: 'Type d\'entité invalide.' });
  }

  try {
    const entity = await Model.findById(entityId);
    if (!entity) {
      return res.status(404).json({ message: 'Entité non trouvée.' });
    }

    // Supprimer le tag de la liste
    // Assurez-vous que le champ 'tags' existe dans vos modèles !
    const result = await Model.findByIdAndUpdate(
      entityId,
      { $pull: { tags: tag } }, // $pull supprime l'élément du tableau
      { new: true, upsert: false }
    ).select('tags');

    res.status(200).json({ 
      message: 'Tag supprimé avec succès', 
      entityType,
      entityId,
      tags: result ? result.tags : []
    });

  } catch (error) {
    console.error(`Erreur lors de la suppression du tag de ${entityType} ${entityId}:`, error);
    res.status(500).json({ message: 'Erreur interne du serveur.', error: error.message });
  }
});

module.exports = router; 
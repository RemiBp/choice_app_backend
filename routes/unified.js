const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { normalizeDocument } = require('../utils/normalizers');

// Modèles pour chaque base de données
const models = {
  choice_app: {
    Posts: mongoose.connection.useDb('choice_app').model('Posts', new mongoose.Schema({}, { strict: false })),
    Users: mongoose.connection.useDb('choice_app').model('Users', new mongoose.Schema({}, { strict: false }))
  },
  restauration: {
    Producers: mongoose.connection.useDb('Restauration_Officielle').model('producers', new mongoose.Schema({}, { strict: false }))
  },
  leisure: {
    Events: mongoose.connection.useDb('Loisir&Culture').model('Loisir_Paris_Evenements', new mongoose.Schema({}, { strict: false })),
    Producers: mongoose.connection.useDb('Loisir&Culture').model('Loisir_Paris_Producers', new mongoose.Schema({}, { strict: false }))
  }
};

// Route de recherche unifiée
router.get('/search', async (req, res) => {
  try {
    const { query, type, page = 1, limit = 10 } = req.query;
    const skip = (page - 1) * limit;

    if (!query) {
      return res.status(400).json({ message: 'Le paramètre query est requis.' });
    }

    // Créer la requête de recherche
    const searchQuery = {
      $or: [
        { title: { $regex: query, $options: 'i' } },
        { name: { $regex: query, $options: 'i' } },
        { intitulé: { $regex: query, $options: 'i' } },
        { description: { $regex: query, $options: 'i' } },
        { détail: { $regex: query, $options: 'i' } },
        { content: { $regex: query, $options: 'i' } },
        { 'location.name': { $regex: query, $options: 'i' } },
        { lieu: { $regex: query, $options: 'i' } },
        { adresse: { $regex: query, $options: 'i' } },
        { tags: { $regex: query, $options: 'i' } },
        { catégorie: { $regex: query, $options: 'i' } }
      ]
    };

    // Sélectionner les collections à rechercher selon le type
    let collectionsToSearch = [];
    switch (type) {
      case 'event':
        collectionsToSearch = [models.leisure.Events];
        break;
      case 'restaurant':
        collectionsToSearch = [models.restauration.Producers];
        break;
      case 'leisure':
        collectionsToSearch = [models.leisure.Producers];
        break;
      case 'post':
        collectionsToSearch = [models.choice_app.Posts];
        break;
      default:
        collectionsToSearch = [
          models.choice_app.Posts,
          models.restauration.Producers,
          models.leisure.Events,
          models.leisure.Producers
        ];
    }

    // Effectuer les recherches en parallèle
    const [results, totalCount] = await Promise.all([
      Promise.all(collectionsToSearch.map(model => 
        model.find(searchQuery).skip(skip).limit(limit).lean()
      )),
      Promise.all(collectionsToSearch.map(model => 
        model.countDocuments(searchQuery)
      ))
    ]);

    // Aplatir et normaliser les résultats
    const flatResults = results.flat();
    const normalizedResults = flatResults.map(doc => normalizeDocument(doc));

    // Trier les résultats par pertinence
    const sortedResults = normalizedResults.sort((a, b) => {
      const scoreA = calculateRelevanceScore(a, query);
      const scoreB = calculateRelevanceScore(b, query);
      return scoreB - scoreA;
    });

    // Calculer la pagination
    const total = totalCount.reduce((acc, count) => acc + count, 0);
    const totalPages = Math.ceil(total / limit);

    res.json({
      results: sortedResults,
      page: parseInt(page),
      total_pages: totalPages,
      total_results: total
    });

  } catch (error) {
    console.error('Erreur lors de la recherche:', error);
    res.status(500).json({ message: 'Erreur lors de la recherche.' });
  }
});

// Route pour récupérer un document par ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { user_id } = req.query;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: 'ID invalide.' });
    }

    console.log(`🔍 Recherche d'un document avec ID: ${id}`);

    // Rechercher dans toutes les collections
    const collectionsToSearch = [
      models.choice_app.Posts,
      models.restauration.Producers,
      models.leisure.Events,
      models.leisure.Producers
    ];

    const results = await Promise.all(
      collectionsToSearch.map(async (model) => {
        try {
          const doc = await model.findById(id).lean();
          if (doc) {
            console.log(`✅ Document trouvé dans la collection ${model.collection.name}`);
          }
          return doc;
        } catch (err) {
          console.error(`❌ Erreur lors de la recherche dans ${model.collection.name}:`, err.message);
          return null;
        }
      })
    );

    // Filtrer les résultats nuls et prendre le premier document trouvé
    const filteredResults = results.filter(doc => doc !== null);
    
    if (filteredResults.length === 0) {
      console.log(`❌ Aucun document trouvé avec ID: ${id}`);
      return res.status(404).json({ message: 'Document non trouvé.' });
    }

    const document = filteredResults[0];

    // Si un user_id est fourni, récupérer l'utilisateur
    let user = null;
    if (user_id && mongoose.isValidObjectId(user_id)) {
      user = await models.choice_app.Users.findById(user_id).lean();
    }

    // Normaliser le document
    const normalizedDoc = normalizeDocument(document);

    // Ajouter les interactions de l'utilisateur si disponible
    if (user) {
      normalizedDoc.user_interactions = {
        isLiked: normalizedDoc.interactions.likes.includes(user._id),
        isChoice: normalizedDoc.interactions.choices.includes(user._id),
        isInterested: normalizedDoc.interactions.interests.includes(user._id)
      };
    }

    res.json(normalizedDoc);

  } catch (error) {
    console.error('❌ Erreur lors de la récupération du document:', error);
    res.status(500).json({ message: 'Erreur lors de la récupération du document.' });
  }
});

// Route pour gérer les interactions
router.post('/:id/interact', async (req, res) => {
  try {
    const { id } = req.params;
    const { user_id, action } = req.body;

    if (!mongoose.isValidObjectId(id) || !mongoose.isValidObjectId(user_id)) {
      return res.status(400).json({ message: 'ID invalide.' });
    }

    if (!action || !['like', 'unlike', 'interest', 'uninterest', 'choice', 'unchoice'].includes(action)) {
      return res.status(400).json({ message: 'Action invalide.' });
    }

    // Rechercher l'utilisateur
    const user = await models.choice_app.Users.findById(user_id);
    if (!user) {
      return res.status(404).json({ message: 'Utilisateur non trouvé.' });
    }

    // Rechercher le document dans toutes les collections
    const collectionsToSearch = [
      models.choice_app.Posts,
      models.restauration.Producers,
      models.leisure.Events,
      models.leisure.Producers
    ];

    const results = await Promise.all(
      collectionsToSearch.map(model => model.findById(id))
    );

    const document = results.find(doc => doc !== null);
    if (!document) {
      return res.status(404).json({ message: 'Document non trouvé.' });
    }

    // Initialiser les tableaux si nécessaire
    document.likes = document.likes || document.liked_by || [];
    document.interestedUsers = document.interestedUsers || document.interests || [];
    document.choices = document.choices || document.choiceUsers || [];

    // Gérer l'action
    switch (action) {
      case 'like':
        if (!document.likes.includes(user_id)) {
          document.likes.push(user_id);
        }
        break;
      case 'unlike':
        document.likes = document.likes.filter(id => id.toString() !== user_id.toString());
        break;
      case 'interest':
        if (!document.interestedUsers.includes(user_id)) {
          document.interestedUsers.push(user_id);
        }
        break;
      case 'uninterest':
        document.interestedUsers = document.interestedUsers.filter(id => id.toString() !== user_id.toString());
        break;
      case 'choice':
        if (!document.choices.includes(user_id)) {
          document.choices.push(user_id);
        }
        break;
      case 'unchoice':
        document.choices = document.choices.filter(id => id.toString() !== user_id.toString());
        break;
    }

    // Sauvegarder les modifications
    await document.save();

    // Normaliser et renvoyer le document mis à jour
    const normalizedDoc = normalizeDocument(document);
    normalizedDoc.user_interactions = {
      isLiked: normalizedDoc.interactions.likes.includes(user_id),
      isChoice: normalizedDoc.interactions.choices.includes(user_id),
      isInterested: normalizedDoc.interactions.interests.includes(user_id)
    };

    res.json(normalizedDoc);

  } catch (error) {
    console.error('Erreur lors de l\'interaction:', error);
    res.status(500).json({ message: 'Erreur lors de l\'interaction.' });
  }
});

// Fonction pour calculer le score de pertinence
function calculateRelevanceScore(doc, query) {
  let score = 0;
  const queryLower = query.toLowerCase();

  // Points pour les correspondances exactes
  if (doc.title.toLowerCase().includes(queryLower)) score += 10;
  if (doc.description.toLowerCase().includes(queryLower)) score += 5;
  if (doc.location?.name.toLowerCase().includes(queryLower)) score += 3;

  // Points pour les métriques d'engagement
  score += (doc.metrics.likes || 0) * 0.1;
  score += (doc.metrics.interests || 0) * 0.2;
  score += (doc.metrics.choices || 0) * 0.3;
  score += (doc.metrics.comments || 0) * 0.1;

  // Points pour la fraîcheur du contenu
  const age = new Date() - new Date(doc.date.created);
  score += Math.max(0, 100 - Math.floor(age / (1000 * 60 * 60 * 24))); // Bonus décroissant sur 100 jours

  return score;
}

module.exports = router;

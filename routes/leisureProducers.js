const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Conversation = require('../models/conversation'); // Import du modèle Conversation

// Connexion à la base Loisir&Culture
const leisureDb = mongoose.createConnection(process.env.MONGO_URI, {
  dbName: 'Loisir&Culture',
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

// Modèle pour la collection des producteurs de loisirs
const LeisureProducer = leisureDb.model(
  'LeisureProducer',
  new mongoose.Schema({}, { strict: false }),
  'Loisir_Paris_Producers' // Nom exact de la collection dans MongoDB
);

// Endpoint : Recherche de producteurs proches avec filtres avancés
router.get('/nearby', async (req, res) => {
  try {
    const {
      latitude,
      longitude,
      radius = 5000,
      category,
      minPrice,
      maxPrice,
    } = req.query;

    if (!latitude || !longitude) {
      return res.status(400).json({ message: 'Latitude et longitude sont nécessaires.' });
    }

    console.log(`🔍 Recherche de producteurs proches : [lat=${latitude}, long=${longitude}, rayon=${radius}m]`);

    // Construire le filtre de requête
    const query = {
      location: {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: [parseFloat(longitude), parseFloat(latitude)],
          },
          $maxDistance: parseInt(radius),
        },
      },
      ...(category && { catégorie: { $regex: category, $options: 'i' } }),
      ...(minPrice && { 'evenements.prix_min': { $gte: parseFloat(minPrice) } }),
      ...(maxPrice && { 'evenements.prix_max': { $lte: parseFloat(maxPrice) } }),
    };

    // Sélectionner uniquement les champs nécessaires
    const producers = await LeisureProducer.find(query).select(
      'lieu adresse location evenements description lien_lieu'
    );

    console.log(`🔍 Producteurs trouvés à proximité : ${producers.length}`);
    res.json(producers);
  } catch (err) {
    console.error('❌ Erreur lors de la recherche géographique :', err.message);
    res.status(500).json({ message: 'Erreur interne du serveur.' });
  }
});

// Recherche par mots-clés
router.get('/search', async (req, res) => {
  try {
    const { query } = req.query;

    if (!query || query.trim() === '') {
      return res.status(400).json({ message: 'Veuillez fournir un mot-clé pour la recherche.' });
    }

    console.log('🔍 Recherche pour le mot-clé :', query);

    const producers = await LeisureProducer.find({
      $or: [
        { lieu: { $regex: query, $options: 'i' } },
        { adresse: { $regex: query, $options: 'i' } },
        { description: { $regex: query, $options: 'i' } },
      ],
    }).select('lieu adresse location evenements description lien_lieu');

    console.log(`🔍 ${producers.length} producteur(s) trouvé(s)`);

    if (producers.length === 0) {
      return res.status(404).json({ message: 'Aucun producteur de loisirs trouvé.' });
    }

    res.json(producers);
  } catch (err) {
    console.error('❌ Erreur lors de la recherche des producteurs de loisirs :', err.message);
    res.status(500).json({ message: 'Erreur interne du serveur.' });
  }
});

// Recherche par ID
router.get('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: 'ID invalide.' });
    }

    console.log(`🔍 Recherche d'un producteur de loisirs avec ID : ${id}`);
    const producer = await LeisureProducer.findById(id);

    if (!producer) {
      return res.status(404).json({ message: 'Producteur de loisirs non trouvé.' });
    }

    res.status(200).json(producer);
  } catch (err) {
    console.error(`❌ Erreur lors de la récupération du producteur de loisirs :`, err.message);
    res.status(500).json({ message: 'Erreur interne du serveur.' });
  }
});

// Endpoint : Créer une conversation et envoyer un message si elle n'existe pas
router.post('/conversations/new-message', async (req, res) => {
  const { senderId, recipientIds, content } = req.body;

  if (!senderId || !recipientIds || recipientIds.length === 0 || !content) {
    return res.status(400).json({
      message: 'Le senderId, au moins un recipientId, et le contenu sont obligatoires.',
    });
  }

  try {
    // Combine senderId et recipientIds pour créer la liste des participants
    const participants = [senderId, ...recipientIds];

    // Vérifie si une conversation existe déjà pour ces participants
    let conversation = await Conversation.findOne({
      participants: { $all: participants, $size: participants.length },
    });

    // Si elle n'existe pas, la créer
    if (!conversation) {
      conversation = new Conversation({
        participants,
        messages: [],
        lastUpdated: Date.now(),
      });
    }

    // Ajouter le message initial
    const newMessage = {
      senderId,
      content,
      timestamp: Date.now(),
    };

    conversation.messages.push(newMessage);
    conversation.lastUpdated = Date.now();

    // Sauvegarde de la conversation
    await conversation.save();

    // Mettre à jour le champ `conversations` des producteurs de loisirs concernés
    const updateLeisureProducerConversations = async (producerId) => {
      await LeisureProducer.findByIdAndUpdate(
        producerId,
        { $addToSet: { conversations: conversation._id } }, // $addToSet évite les doublons
        { new: true }
      );
    };

    await Promise.all(participants.map((producerId) => updateLeisureProducerConversations(producerId)));

    res.status(201).json({
      message: 'Message envoyé avec succès.',
      conversationId: conversation._id,
      newMessage,
    });
  } catch (error) {
    console.error(
      'Erreur lors de la création de la conversation ou de l\'envoi du message :',
      error.message
    );
    res.status(500).json({ message: 'Erreur serveur.' });
  }
});

// Endpoint : Récupérer toutes les conversations d'un producteur de loisirs
router.get('/:id/conversations', async (req, res) => {
  const { id } = req.params;

  try {
    const conversations = await Conversation.find({
      participants: id,
    }).populate('participants', 'lieu description photo'); // Récupère les infos des participants

    res.status(200).json(conversations);
  } catch (error) {
    console.error('Erreur lors de la récupération des conversations :', error.message);
    res.status(500).json({ message: 'Erreur serveur.' });
  }
});

// Endpoint : Récupérer les messages d'une conversation
router.get('/conversations/:id/messages', async (req, res) => {
  const { id } = req.params;

  try {
    const conversation = await Conversation.findById(id).populate('messages.senderId', 'lieu description photo');

    if (!conversation) {
      return res.status(404).json({ message: 'Conversation non trouvée.' });
    }

    res.status(200).json(conversation.messages);
  } catch (error) {
    console.error('Erreur lors de la récupération des messages :', error.message);
    res.status(500).json({ message: 'Erreur serveur.' });
  }
});

module.exports = router;

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Conversation = require('../models/conversation'); // Import du modèle
const producerController = require('../controllers/producerController');
const { restaurationDb } = require('../index');
const Producer = require('../models/Producer');
const crypto = require('crypto');
const bcrypt = require('bcrypt');

// Connexion à la base Restauration_Officielle
const producerDb = mongoose.createConnection(process.env.MONGO_URI, {
  dbName: 'Restauration_Officielle',
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

// Modèle pour la collection producers
const ProducerSchema = new mongoose.Schema({
  place_id: String,
  name: String,
  verified: Boolean,
  photo: String,
  description: String,
  menu: Array,
  address: String,
  gps_coordinates: {
    type: { type: String, enum: ['Point'] },
    coordinates: [Number]
  },
  category: [String],
  opening_hours: [String],
  phone_number: String,
  website: String,
  notes_globales: {
    service: Number,
    lieu: Number,
    portions: Number,
    ambiance: Number
  },
  abonnés: Number,
  photos: [String],
  rating: Number,
  price_level: Number,
  promotion: {
    active: Boolean,
    discountPercentage: Number,
    endDate: Date
  }
});

// Ajouter l'index géospatial
ProducerSchema.index({ gps_coordinates: '2dsphere' });

// Création du modèle
const ProducerModel = producerDb.model('producer', ProducerSchema, 'producers');

// Middleware d'authentification (à importer si nécessaire)
const auth = async (req, res, next) => {
  // Votre logique d'authentification ici
  next();
};

/**
 * Routes pour les producteurs (restaurants)
 */

// GET /api/producers - Obtenir tous les restaurants avec pagination
router.get('/', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    
    const producers = await ProducerModel.find()
      .skip(skip)
      .limit(limit);
    
    const total = await ProducerModel.countDocuments();
    
    res.status(200).json({
      producers,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total
    });
  } catch (error) {
    console.error('Erreur de récupération des restaurants:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des restaurants' });
  }
});

// GET /api/producers/search - Rechercher des restaurants
router.get('/search', async (req, res) => {
  try {
    const { query, category, price_level, rating } = req.query;
    const searchQuery = {};
    
    if (query) {
      searchQuery.$or = [
        { name: { $regex: query, $options: 'i' } },
        { description: { $regex: query, $options: 'i' } }
      ];
    }
    
    if (category) {
      searchQuery.category = { $in: Array.isArray(category) ? category : [category] };
    }
    
    if (price_level) {
      searchQuery.price_level = parseInt(price_level);
    }
    
    if (rating) {
      searchQuery.rating = { $gte: parseFloat(rating) };
    }
    
    const producers = await ProducerModel.find(searchQuery).limit(50);
    
    res.status(200).json(producers);
  } catch (error) {
    console.error('Erreur de recherche des restaurants:', error);
    res.status(500).json({ error: 'Erreur lors de la recherche des restaurants' });
  }
});

// GET /api/producers/featured - Obtenir les restaurants mis en avant
router.get('/featured', async (req, res) => {
  try {
    const featured = await ProducerModel.find({ featured: true }).limit(10);
    res.status(200).json(featured);
  } catch (error) {
    console.error('Erreur de récupération des restaurants en vedette:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des restaurants en vedette' });
  }
});

// GET /api/producers/:id - Obtenir un restaurant par son ID
router.get('/:id', async (req, res) => {
  try {
    const producer = await ProducerModel.findById(req.params.id);
    
    if (!producer) {
      return res.status(404).json({ error: 'Restaurant non trouvé' });
    }
    
    res.status(200).json(producer);
  } catch (error) {
    console.error('Erreur de récupération du restaurant:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération du restaurant' });
  }
});

// POST /api/producers/:id/follow - Suivre un restaurant (nécessite authentification)
router.post('/:id/follow', auth, async (req, res) => {
  try {
    const producer = await ProducerModel.findById(req.params.id);
    
    if (!producer) {
      return res.status(404).json({ error: 'Restaurant non trouvé' });
    }
    
    // Si l'utilisateur suit déjà ce restaurant, le retirer de la liste
    const userIndex = producer.followers.indexOf(req.user.id);
    
    if (userIndex > -1) {
      producer.followers.splice(userIndex, 1);
      producer.abonnés = Math.max(0, producer.abonnés - 1);
      await producer.save();
      
      res.status(200).json({ message: 'Vous ne suivez plus ce restaurant', isFollowing: false });
    } else {
      // Sinon, ajouter l'utilisateur à la liste des abonnés
      producer.followers.push(req.user.id);
      producer.abonnés += 1;
      await producer.save();
      
      res.status(200).json({ message: 'Vous suivez désormais ce restaurant', isFollowing: true });
    }
  } catch (error) {
    console.error('Erreur lors du suivi du restaurant:', error);
    res.status(500).json({ error: 'Erreur lors de la mise à jour du suivi' });
  }
});

// GET /api/producers/by-place-id/:placeId - Obtenir un restaurant par place_id (Google Maps)
router.get('/by-place-id/:placeId', async (req, res) => {
  try {
    const producer = await ProducerModel.findOne({ place_id: req.params.placeId });
    
    if (!producer) {
      return res.status(404).json({ error: 'Restaurant non trouvé' });
    }
    
    res.status(200).json(producer);
  } catch (error) {
    console.error('Erreur de récupération du restaurant:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération du restaurant' });
  }
});

// GET /api/producers/category/:category - Obtenir les restaurants par catégorie
router.get('/category/:category', async (req, res) => {
  try {
    const producers = await ProducerModel.find({
      category: { $in: [req.params.category] }
    }).limit(50);
    
    res.status(200).json(producers);
  } catch (error) {
    console.error('Erreur de récupération des restaurants par catégorie:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des restaurants par catégorie' });
  }
});

// GET /api/producers/nearby - Obtenir les restaurants à proximité
router.get('/nearby', async (req, res) => {
  try {
    const { lat, lng, radius = 5000, limit = 20 } = req.query;
    
    if (!lat || !lng) {
      return res.status(400).json({ error: 'Les coordonnées GPS sont requises (lat, lng)' });
    }
    
    const producers = await ProducerModel.find({
      gps_coordinates: {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: [parseFloat(lng), parseFloat(lat)]
          },
          $maxDistance: parseInt(radius)
        }
      }
    }).limit(parseInt(limit));
    
    res.status(200).json(producers);
  } catch (error) {
    console.error('Erreur de récupération des restaurants à proximité:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des restaurants à proximité' });
  }
});

/**
 * @route GET /api/producers/:producerId/events
 * @desc Get events for a specific producer
 * @access Public
 */
router.get('/:producerId/events', async (req, res) => {
  try {
    const { producerId } = req.params;

    // Find producer to validate it exists
    const producer = await ProducerModel.findById(producerId);
    
    if (!producer) {
      return res.status(404).json({ message: 'Producer not found' });
    }
    
    // Query events from the events collection
    // First try to get events where this producer is marked as producerId
    const EventModel = mongoose.model('Event');
    let events = await EventModel.find({ producerId: producerId })
      .sort({ startTime: 1 })
      .limit(50);
    
    // If no events found, also try to find by venueId
    if (!events || events.length === 0) {
      events = await EventModel.find({ venueId: producerId })
        .sort({ startTime: 1 })
        .limit(50);
    }
    
    // If the producer has embedded events in their data, include those too
    let combinedEvents = [...events];
    
    if (producer.events && Array.isArray(producer.events) && producer.events.length > 0) {
      // Add any events that aren't already included (check by ID)
      const existingIds = events.map(e => e._id.toString());
      
      for (const event of producer.events) {
        // Check if this embedded event is already included
        if (event._id && !existingIds.includes(event._id.toString())) {
          combinedEvents.push(event);
        } else if (!event._id) {
          // If no ID, just add it
          combinedEvents.push(event);
        }
      }
    }
    
    // Sort all events by date
    combinedEvents.sort((a, b) => {
      const dateA = new Date(a.startTime || a.date || 0);
      const dateB = new Date(b.startTime || b.date || 0);
      return dateA - dateB;
    });
    
    res.status(200).json(combinedEvents);
  } catch (error) {
    console.error('Error fetching producer events:', error);
    res.status(500).json({ message: 'Error fetching producer events', error: error.message });
  }
});

// GET /api/producers/:producerId/relations - Obtenir les relations d'un producteur
router.get('/:producerId/relations', producerController.getProducerRelations);

// POST /api/producers/user/:userId/favorites - Ajouter un producteur aux favoris
router.post('/user/:userId/favorites', producerController.addToFavorites);

// DELETE /api/producers/user/:userId/favorites - Retirer un producteur des favoris
router.delete('/user/:userId/favorites', producerController.removeFromFavorites);

// Endpoint : Recherche de producteurs par mots-clés
router.get('/search', async (req, res) => {
  try {
    const { query } = req.query;

    if (!query || query.trim() === '') {
      return res.status(400).json({ message: 'Veuillez fournir un mot-clé pour la recherche.' });
    }

    console.log('🔍 Recherche pour le mot-clé :', query);

    const producers = await ProducerModel.find({
      $or: [
        { name: { $regex: query, $options: 'i' } },
        { address: { $regex: query, $options: 'i' } },
        { description: { $regex: query, $options: 'i' } },
      ],
    }).select('name address photo description category structured_data');

    console.log(`🔍 ${producers.length} producteur(s) trouvé(s)`);

    if (producers.length === 0) {
      return res.status(404).json({ message: 'Aucun producteur trouvé.' });
    }

    res.json(producers);
  } catch (err) {
    console.error('❌ Erreur lors de la recherche des producteurs :', err);
    res.status(500).json({ message: 'Erreur interne du serveur.' });
  }
});

// Endpoint : Détail d'un producteur par ID
router.get('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: 'ID invalide.' });
    }

    console.log(`🔍 Recherche d'un producteur avec ID : ${id}`);
    const producer = await ProducerModel.findById(id);

    if (!producer) {
      return res.status(404).json({ message: 'Producteur non trouvé.' });
    }

    res.status(200).json(producer);
  } catch (err) {
    console.error('❌ Erreur lors de la récupération du producteur :', err.message);
    res.status(500).json({ message: 'Erreur interne du serveur.' });
  }
});

// Endpoint : Créer une conversation et envoyer un message avec un producteur
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

    // Vérifie si participants est défini, sinon initialise-le
    if (!Array.isArray(conversation.participants)) {
      conversation.participants = [];
    }

    // Ajoute le message initial
    const newMessage = {
      senderId,
      content,
      timestamp: Date.now(),
    };

    conversation.messages.push(newMessage);
    conversation.lastUpdated = Date.now();

    // Sauvegarde de la conversation
    await conversation.save();

    // Mettre à jour le champ `conversations` des producteurs concernés
    const updateProducerConversations = async (producerId) => {
      await ProducerModel.findByIdAndUpdate(
        producerId,
        { $addToSet: { conversations: conversation._id } }, // $addToSet évite les doublons
        { new: true }
      );
    };

    await Promise.all(participants.map((producerId) => updateProducerConversations(producerId)));

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

// Endpoint : Récupérer les conversations d'un producteur
router.get('/:producerId/conversations', async (req, res) => {
  const { producerId } = req.params;

  try {
    // Vérifiez que le producteur existe
    const producer = await ProducerModel.findById(producerId);
    if (!producer) {
      return res.status(404).json({ message: 'Producteur non trouvé.' });
    }

    // Récupérer toutes les conversations associées au producteur
    const conversations = await Conversation.find({
      participants: producerId,
    }).populate('participants', 'name profilePicture');

    res.status(200).json(conversations);
  } catch (error) {
    console.error('Erreur lors de la récupération des conversations :', error.message);
    res.status(500).json({ message: 'Erreur serveur.' });
  }
});

// Endpoint : Mettre à jour les menus et les items d'un producteur
router.post('/:producerId/update-items', async (req, res) => {
  console.log('Update items endpoint hit!');
  const { producerId } = req.params;
  const { structured_data } = req.body;

  if (!structured_data || typeof structured_data !== 'object') {
    return res.status(400).json({ message: 'Données structurées invalides ou manquantes.' });
  }

  try {
    const updatedProducer = await ProducerModel.findByIdAndUpdate(
      producerId,
      { 
        $set: { structured_data }, // Met à jour uniquement le champ structured_data
      },
      { new: true, upsert: true } // `new` pour retourner l'objet mis à jour, `upsert` pour créer s'il n'existe pas
    );

    if (!updatedProducer) {
      return res.status(404).json({ message: 'Producteur non trouvé ou mise à jour échouée.' });
    }

    console.log('✅ Mise à jour réussie :', updatedProducer);
    res.status(200).json({
      message: 'Items mis à jour avec succès.',
      structured_data: updatedProducer.structured_data,
    });
  } catch (err) {
    console.error('❌ Erreur lors de la mise à jour des items :', err.message);
    res.status(500).json({ message: 'Erreur interne du serveur.' });
  }
});

// Endpoint : Mettre à jour un item
router.put('/:producerId/items/:itemId', async (req, res) => {
  const { producerId, itemId } = req.params;
  const { description, prix } = req.body;

  try {
    const producer = await ProducerModel.findById(producerId);

    if (!producer) {
      return res.status(404).json({ message: 'Producteur non trouvé.' });
    }

    let itemUpdated = false;

    producer.structured_data['Items Indépendants'].forEach((category) => {
      category.items.forEach((item) => {
        if (item._id.toString() === itemId) {
          itemUpdated = true;
          if (description) item.description = description;
          if (prix !== undefined) item.prix = prix;
        }
      });
    });

    if (!itemUpdated) {
      return res.status(404).json({ message: 'Item non trouvé.' });
    }

    // Force Mongoose à marquer `structured_data` comme modifié
    producer.markModified('structured_data');

    await producer.save();

    res.status(200).json({ message: 'Item mis à jour avec succès.', structured_data: producer.structured_data });
  } catch (err) {
    console.error('❌ Erreur lors de la mise à jour :', err.message);
    res.status(500).json({ message: 'Erreur interne du serveur.' });
  }
});

router.delete('/:producerId/items/:itemId', async (req, res) => {
  const { producerId, itemId } = req.params;

  try {
    const producer = await ProducerModel.findById(producerId);

    if (!producer) {
      return res.status(404).json({ message: 'Producteur non trouvé.' });
    }

    let itemDeleted = false;

    producer.structured_data['Items Indépendants'].forEach((category) => {
      const initialLength = category.items.length;
      category.items = category.items.filter((item) => item._id.toString() !== itemId);

      if (category.items.length < initialLength) {
        itemDeleted = true;
      }
    });

    if (!itemDeleted) {
      return res.status(404).json({ message: 'Item non trouvé.' });
    }

    // Force Mongoose à marquer `structured_data` comme modifié
    producer.markModified('structured_data');

    await producer.save();
    res.status(200).json({ message: 'Item supprimé avec succès.' });
  } catch (err) {
    console.error('❌ Erreur lors de la suppression de l\'item :', err.message);
    res.status(500).json({ message: 'Erreur interne du serveur.' });
  }
});

// Endpoint : Ajouter un nouvel item
router.post('/:producerId/items', async (req, res) => {
  const { producerId } = req.params;
  const { nom, description, prix, catégorie } = req.body;

  if (!nom || !catégorie) {
    return res.status(400).json({ message: 'Le nom et la catégorie sont obligatoires.' });
  }

  try {
    const producer = await ProducerModel.findById(producerId);

    if (!producer) {
      return res.status(404).json({ message: 'Producteur non trouvé.' });
    }

    let targetCategory = producer.structured_data['Items Indépendants'].find(
      (cat) => cat.catégorie === catégorie
    );

    if (!targetCategory) {
      targetCategory = { catégorie, items: [] };
      producer.structured_data['Items Indépendants'].push(targetCategory);
    }

    targetCategory.items.push({ _id: new mongoose.Types.ObjectId(), nom, description, prix });

    // Marque structured_data comme modifié
    producer.markModified('structured_data');

    await producer.save();

    res.status(201).json({ message: 'Item ajouté avec succès.', structured_data: producer.structured_data });
  } catch (err) {
    console.error('❌ Erreur lors de l\'ajout de l\'item :', err.message);
    res.status(500).json({ message: 'Erreur interne du serveur.' });
  }
});

router.post('/:producerId/categories', async (req, res) => {
  const { producerId } = req.params;
  const { catégorie } = req.body;

  if (!catégorie) {
    return res.status(400).json({ message: 'La catégorie est obligatoire.' });
  }

  try {
    const producer = await ProducerModel.findById(producerId);

    if (!producer) {
      return res.status(404).json({ message: 'Producteur non trouvé.' });
    }

    const existingCategory = producer.structured_data['Items Indépendants'].find(
      cat => cat.catégorie === catégorie
    );

    if (existingCategory) {
      return res.status(400).json({ message: 'La catégorie existe déjà.' });
    }

    producer.structured_data['Items Indépendants'].push({ catégorie, items: [] });

    // Marque structured_data comme modifié
    producer.markModified('structured_data');

    await producer.save();

    res.status(201).json({ message: 'Catégorie créée avec succès.' });
  } catch (err) {
    console.error('❌ Erreur lors de la création de la catégorie :', err.message);
    res.status(500).json({ message: 'Erreur interne du serveur.' });
  }
});

// Endpoint : Supprimer une catégorie
router.delete('/:producerId/categories/:categoryName', async (req, res) => {
  const { producerId, categoryName } = req.params;

  try {
    const producer = await ProducerModel.findById(producerId);

    if (!producer) {
      return res.status(404).json({ message: 'Producteur non trouvé.' });
    }

    const initialLength = producer.structured_data['Items Indépendants'].length;
    producer.structured_data['Items Indépendants'] = producer.structured_data['Items Indépendants'].filter(
      cat => cat.catégorie !== categoryName
    );

    if (producer.structured_data['Items Indépendants'].length === initialLength) {
      return res.status(404).json({ message: 'Catégorie non trouvée.' });
    }

    // Marque structured_data comme modifié
    producer.markModified('structured_data');

    await producer.save();
    res.status(200).json({ message: 'Catégorie supprimée avec succès.' });
  } catch (err) {
    console.error('❌ Erreur lors de la suppression de la catégorie :', err.message);
    res.status(500).json({ message: 'Erreur interne du serveur.' });
  }
});

// Endpoint : Mettre à jour un menu global
router.post('/:producerId/menus', async (req, res) => {
  const { producerId } = req.params;
  const { nom, prix, inclus } = req.body;

  if (!nom || !prix) {
    return res.status(400).json({ message: 'Le nom et le prix sont obligatoires.' });
  }

  try {
    const producer = await ProducerModel.findById(producerId);

    if (!producer) {
      return res.status(404).json({ message: 'Producteur non trouvé.' });
    }

    producer.structured_data['Menus Globaux'].push({
      _id: new mongoose.Types.ObjectId(),
      nom,
      prix,
      inclus,
    });

    // Marque structured_data comme modifié
    producer.markModified('structured_data');

    await producer.save();

    res.status(201).json({ message: 'Menu ajouté avec succès.', structured_data: producer.structured_data });
  } catch (err) {
    console.error('❌ Erreur lors de l\'ajout du menu :', err.message);
    res.status(500).json({ message: 'Erreur interne du serveur.' });
  }
});

// Récupérer les relations d'un producteur (followers, suivis...)
router.get('/:id/relations', async (req, res) => {
  try {
    // Cette route serait liée à d'autres collections comme les utilisateurs
    // Pour l'instant, on renvoie une structure simplifiée
    res.json({
      followers: [],
      following: [],
      total_followers: 0,
      total_following: 0
    });
  } catch (error) {
    console.error(`Erreur lors de la récupération des relations du producteur ${req.params.id}:`, error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Récupérer les posts d'un producteur
router.get('/:id/posts', async (req, res) => {
  try {
    // Simulation de posts à renvoyer
    res.json({
      posts: [],
      total: 0,
      hasMore: false
    });
  } catch (error) {
    console.error(`Erreur lors de la récupération des posts du producteur ${req.params.id}:`, error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Récupérer les posts génériques pour tous les producteurs
router.get('/posts', async (req, res) => {
  try {
    const userId = req.query.userId;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    
    if (!userId) {
      return res.status(400).json({ message: 'userId est requis' });
    }
    
    // Simulation de posts à renvoyer
    res.json([
      {
        id: '1',
        content: 'Nouveau plat disponible !',
        authorId: userId,
        authorName: 'Restaurant Test',
        authorAvatar: 'https://via.placeholder.com/150',
        postedAt: new Date(),
        isProducerPost: true,
        isLeisureProducer: false,
        isAutomated: false,
        likesCount: 5,
        media: [
          {
            type: 'image',
            url: 'https://via.placeholder.com/500x300'
          }
        ],
        comments: []
      },
      {
        id: '2',
        content: 'Offre spéciale ce weekend !',
        authorId: userId,
        authorName: 'Restaurant Test',
        authorAvatar: 'https://via.placeholder.com/150',
        postedAt: new Date(),
        isProducerPost: true,
        isLeisureProducer: false,
        isAutomated: false,
        likesCount: 8,
        media: [],
        comments: []
      }
    ]);
  } catch (error) {
    console.error('Erreur lors de la récupération des posts:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Récupérer les interactions du producteur
router.get('/interactions/:userId', async (req, res) => {
  try {
    // Simulation d'interactions à renvoyer
    res.json([
      {
        id: '1',
        content: 'Un utilisateur a aimé votre post',
        type: 'like',
        timestamp: new Date(),
        user: {
          id: 'user123',
          name: 'John Doe',
          avatar: 'https://via.placeholder.com/150'
        },
        postId: 'post123'
      }
    ]);
  } catch (error) {
    console.error(`Erreur lors de la récupération des interactions du producteur ${req.params.userId}:`, error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Récupérer les tendances locales
router.get('/trends/:userId', async (req, res) => {
  try {
    // Simulation de tendances à renvoyer
    res.json([
      {
        id: '1',
        content: 'Les restaurants italiens sont populaires dans votre quartier',
        type: 'trend',
        timestamp: new Date()
      }
    ]);
  } catch (error) {
    console.error(`Erreur lors de la récupération des tendances pour ${req.params.userId}:`, error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Récupérer les conversations d'un producteur
router.get('/:id/conversations', async (req, res) => {
  try {
    const producerType = req.query.producerType || 'restaurant';
    
    // Simulation de conversations à renvoyer
    res.json([
      {
        id: 'conv1',
        name: 'John Doe',
        avatar: 'https://via.placeholder.com/150',
        lastMessage: 'Bonjour, êtes-vous ouvert aujourd\'hui ?',
        time: new Date().toISOString(),
        unreadCount: 1,
        isUser: true,
        isGroup: false
      },
      {
        id: 'conv2',
        name: 'Restaurants du quartier',
        avatar: 'https://via.placeholder.com/150',
        lastMessage: 'Bienvenue dans le groupe !',
        time: new Date().toISOString(),
        unreadCount: 0,
        isUser: false,
        isGroup: true
      }
    ]);
  } catch (error) {
    console.error(`Erreur lors de la récupération des conversations du producteur ${req.params.id}:`, error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

/**
 * @route POST /api/recovery/producer
 * @desc Récupérer un compte producteur
 * @access Public
 */
router.post('/recovery', async (req, res) => {
  try {
    const { email, phone, name, type } = req.body;
    
    if (!email && !phone) {
      return res.status(400).json({ 
        success: false,
        message: 'Email ou téléphone requis pour la récupération' 
      });
    }
    
    // Construire la requête de recherche
    let query = {};
    
    if (email) {
      query.email = email;
    }
    
    if (phone) {
      query.phone = phone;
    }
    
    if (name) {
      query.name = { $regex: name, $options: 'i' };
    }
    
    // Déterminer le modèle à utiliser en fonction du type
    let Producer;
    if (type === 'leisure') {
      Producer = LeisureProducer;
    } else if (type === 'wellness' || type === 'beauty') {
      Producer = BeautyProducer;
    } else {
      // Par défaut utiliser le modèle restaurant
      Producer = RestaurantProducer;
    }
    
    // Chercher le producteur
    const producer = await Producer.findOne(query);
    
    if (!producer) {
      return res.status(404).json({
        success: false,
        message: 'Aucun compte producteur trouvé avec ces informations'
      });
    }
    
    // Générer un token de récupération
    const recoveryToken = crypto.randomBytes(20).toString('hex');
    
    // Stocker le token et sa date d'expiration
    producer.recoveryToken = recoveryToken;
    producer.recoveryTokenExpires = Date.now() + 3600000; // 1 heure
    
    await producer.save();
    
    // Envoyer un email avec le lien de récupération
    // TODO: Implémenter l'envoi d'email
    
    res.status(200).json({
      success: true,
      message: 'Instructions de récupération envoyées à votre adresse email',
      recoveryToken // À retirer en production
    });
  } catch (error) {
    console.error('❌ Erreur lors de la récupération du compte:', error);
    res.status(500).json({ 
      success: false,
      message: 'Erreur lors de la récupération du compte', 
      error: error.message 
    });
  }
});

/**
 * @route POST /api/recovery/producer/reset
 * @desc Réinitialiser le mot de passe d'un compte producteur
 * @access Public
 */
router.post('/recovery/reset', async (req, res) => {
  try {
    const { token, newPassword, producerType } = req.body;
    
    if (!token || !newPassword) {
      return res.status(400).json({ 
        success: false,
        message: 'Token et nouveau mot de passe requis' 
      });
    }
    
    // Déterminer le modèle à utiliser en fonction du type
    let Producer;
    if (producerType === 'leisure') {
      Producer = LeisureProducer;
    } else if (producerType === 'wellness' || producerType === 'beauty') {
      Producer = BeautyProducer;
    } else {
      // Par défaut utiliser le modèle restaurant
      Producer = RestaurantProducer;
    }
    
    // Chercher le producteur avec le token valide
    const producer = await Producer.findOne({
      recoveryToken: token,
      recoveryTokenExpires: { $gt: Date.now() }
    });
    
    if (!producer) {
      return res.status(400).json({
        success: false,
        message: 'Token invalide ou expiré'
      });
    }
    
    // Hashage du nouveau mot de passe
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);
    
    // Mise à jour du mot de passe et suppression du token
    producer.password = hashedPassword;
    producer.recoveryToken = undefined;
    producer.recoveryTokenExpires = undefined;
    
    await producer.save();
    
    res.status(200).json({
      success: true,
      message: 'Mot de passe réinitialisé avec succès'
    });
  } catch (error) {
    console.error('❌ Erreur lors de la réinitialisation du mot de passe:', error);
    res.status(500).json({ 
      success: false,
      message: 'Erreur lors de la réinitialisation du mot de passe', 
      error: error.message 
    });
  }
});

/**
 * @route GET /api/producers/:producerId/promotion
 * @desc Get active promotion for a producer
 * @access Private
 */
router.get('/:producerId/promotion', async (req, res) => {
  try {
    const { producerId } = req.params;

    // Find producer
    const producer = await ProducerModel.findById(producerId);
    
    if (!producer) {
      return res.status(404).json({ message: 'Producer not found' });
    }
    
    // Check if there's an active promotion
    if (!producer.promotion || !producer.promotion.active) {
      return res.status(200).json({
        active: false,
        message: 'No active promotion'
      });
    }
    
    // Check if promotion has expired
    const now = new Date();
    const endDate = new Date(producer.promotion.endDate);
    
    if (endDate < now) {
      // Update producer to deactivate expired promotion
      producer.promotion.active = false;
      await producer.save();
      
      return res.status(200).json({
        active: false,
        message: 'Promotion has expired'
      });
    }
    
    // Return active promotion
    return res.status(200).json({
      active: true,
      discountPercentage: producer.promotion.discountPercentage,
      endDate: producer.promotion.endDate,
      message: 'Active promotion found'
    });
    
  } catch (error) {
    console.error('Error fetching promotion:', error);
    res.status(500).json({ message: 'Error fetching promotion', error: error.message });
  }
});

/**
 * @route POST /api/producers/:producerId/promotion
 * @desc Create or update promotion for a producer
 * @access Private
 */
router.post('/:producerId/promotion', async (req, res) => {
  try {
    const { producerId } = req.params;
    const { active, discountPercentage, endDate } = req.body;

    // Find producer
    const producer = await ProducerModel.findById(producerId);
    
    if (!producer) {
      return res.status(404).json({ message: 'Producer not found' });
    }
    
    // Initialize promotion object if not exists
    if (!producer.promotion) {
      producer.promotion = {
        active: false,
        discountPercentage: 0,
        endDate: null
      };
    }
    
    // Update promotion based on request
    if (active !== undefined) {
      producer.promotion.active = active;
    }
    
    if (discountPercentage !== undefined && active) {
      // Ensure discount percentage is between 0 and 100
      producer.promotion.discountPercentage = Math.min(100, Math.max(0, discountPercentage));
    }
    
    if (endDate !== undefined && active) {
      producer.promotion.endDate = new Date(endDate);
    }
    
    // Save the updated producer
    await producer.save();
    
    // Return the updated promotion
    return res.status(200).json({
      active: producer.promotion.active,
      discountPercentage: producer.promotion.discountPercentage,
      endDate: producer.promotion.endDate,
      message: producer.promotion.active ? 'Promotion activated' : 'Promotion deactivated'
    });
    
  } catch (error) {
    console.error('Error updating promotion:', error);
    res.status(500).json({ message: 'Error updating promotion', error: error.message });
  }
});

module.exports = router;

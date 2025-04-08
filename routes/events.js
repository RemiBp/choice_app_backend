const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const eventController = require('../controllers/eventController');
const Event = require('../models/event');
const auth = require('../middleware/auth');

// Connexion à la base Loisir&Culture
const eventDb = mongoose.createConnection(process.env.MONGO_URI, {
  dbName: 'Loisir&Culture',
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

// Modèle pour la collection des événements
const EventModel = eventDb.model(
  'Event',
  new mongoose.Schema({}, { strict: false }),
  'Loisir_Paris_Evenements' // Nom exact de la collection dans MongoDB
);

// Utiliser le contrôleur pour les routes standard
router.get('/', eventController.getAllEvents);
router.post('/', eventController.createEvent);
router.put('/:id', eventController.updateEvent);
router.delete('/:id', eventController.deleteEvent);

// **Recherche avancée avec filtres**
router.get('/advanced-search', async (req, res) => {
  try {
    const {
      category,           // Catégorie (ex. : "Théâtre", "Cinéma")
      minNote,            // Note minimale globale
      miseEnScene,        // Note minimale pour mise_en_scene
      jeuActeurs,         // Note minimale pour jeu_acteurs
      scenario,           // Note minimale pour scenario
      emotions,           // Émotions (array ex. : ["drôle", "joyeux"])
      minPrice,           // Prix minimum
      maxPrice            // Prix maximum
    } = req.query;

    // Construire la requête dynamique
    const query = {};

    // Filtre par catégorie
    if (category) {
      query["catégorie"] = { $regex: category, $options: 'i' }; // Insensible à la casse
    }

    // Filtre par note globale
    if (minNote) {
      query["note"] = { $gte: parseFloat(minNote) };
    }

    // Filtres par notes spécifiques
    if (miseEnScene) {
      query["notes_globales.mise_en_scene"] = { $gte: parseFloat(miseEnScene) };
    }
    if (jeuActeurs) {
      query["notes_globales.jeu_acteurs"] = { $gte: parseFloat(jeuActeurs) };
    }
    if (scenario) {
      query["notes_globales.scenario"] = { $gte: parseFloat(scenario) };
    }

    // Filtre par émotions
    if (emotions) {
      const emotionArray = Array.isArray(emotions) ? emotions : emotions.split(',');
      query["notes_globales.emotions"] = { $in: emotionArray }; // Correspondance avec au moins une émotion
    }

    // Filtre par prix
    if (minPrice || maxPrice) {
      query["catégories_prix.Prix"] = {
        $elemMatch: {
          ...(minPrice && { $gte: `${parseFloat(minPrice)} €` }),
          ...(maxPrice && { $lte: `${parseFloat(maxPrice)} €` }),
        },
      };
    }

    console.log('🔍 Recherche avancée avec les critères :', query);

    // Exécuter la requête
    const events = await EventModel.find(query);

    console.log(`🔍 ${events.length} événement(s) trouvé(s)`);

    if (events.length === 0) {
      return res.status(404).json({ message: 'Aucun événement trouvé.' });
    }

    // Formater les résultats
    const formattedEvents = events.map(event => ({
      _id: event._id,
      intitulé: event.intitulé || 'Intitulé non disponible',
      catégorie: event.catégorie || 'Catégorie non disponible',
      lieu: event.lieu || 'Lieu non disponible',
      note: event.note ? parseFloat(event.note).toFixed(1) : 'Note non disponible',
      notes_globales: {
        mise_en_scene: event.notes_globales?.mise_en_scene ? parseFloat(event.notes_globales.mise_en_scene).toFixed(1) : 'Non disponible',
        jeu_acteurs: event.notes_globales?.jeu_acteurs ? parseFloat(event.notes_globales.jeu_acteurs).toFixed(1) : 'Non disponible',
        scenario: event.notes_globales?.scenario ? parseFloat(event.notes_globales.scenario).toFixed(1) : 'Non disponible',
        émotions: event.notes_globales?.emotions || [],
        appréciation_globale: event.notes_globales?.appréciation_globale || 'Non disponible',
      },
      prix_reduit: event.prix_reduit || 'Prix non disponible',
      location: event.location || { coordinates: [] },
      image: event.image || 'Image non disponible',
      purchase_url: event.purchase_url || '',
    }));

    res.json(formattedEvents);
  } catch (err) {
    console.error('❌ Erreur lors de la recherche avancée des événements :', err);
    res.status(500).json({ message: 'Erreur interne du serveur.' });
  }
});

// **Recherche par mot-clé**
router.get('/search', eventController.searchEvents);

// GET /api/events/category/:category - Obtenir les événements par catégorie
router.get('/category/:category', async (req, res) => {
  try {
    const events = await EventModel.find({
      $or: [
        { catégorie: { $regex: req.params.category, $options: 'i' } },
        { category: { $regex: req.params.category, $options: 'i' } }
      ]
    }).limit(50);
    
    res.status(200).json(events);
  } catch (error) {
    console.error('Erreur de récupération des événements par catégorie:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des événements par catégorie' });
  }
});

// GET /api/events/filter/upcoming - Obtenir les événements à venir
router.get('/filter/upcoming', async (req, res) => {
  try {
    const today = new Date();
    
    const events = await EventModel.find({
      $or: [
        { date_debut: { $gte: today } },
        { date: { $gte: today } },
        { startDate: { $gte: today } },
        { prochaines_dates: { $gte: today } }
      ]
    }).limit(50).sort({ date_debut: 1 });
    
    res.status(200).json(events);
  } catch (error) {
    console.error('Erreur de récupération des événements à venir:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des événements à venir' });
  }
});

// GET /api/events/nearby - Obtenir les événements à proximité
router.get('/nearby', eventController.getNearbyEvents);

// GET /api/events/popular - Obtenir les événements populaires
router.get('/popular', eventController.getPopularEvents);

// POST /api/events/:id/interested - Marquer l'intérêt pour un événement
router.post('/:id/interested', auth, async (req, res) => {
  try {
    const event = await EventModel.findById(req.params.id);
    
    if (!event) {
      return res.status(404).json({ error: 'Événement non trouvé' });
    }
    
    // Initialiser le tableau si nécessaire
    if (!event.interestedUsers) {
      event.interestedUsers = [];
    }
    
    // Vérifier si l'utilisateur est déjà intéressé
    const userIndex = event.interestedUsers.indexOf(req.user.id);
    
    if (userIndex > -1) {
      // Retirer l'intérêt
      event.interestedUsers.splice(userIndex, 1);
      await event.save();
      
      res.status(200).json({ message: 'Vous n\'êtes plus intéressé par cet événement', isInterested: false });
    } else {
      // Ajouter l'intérêt
      event.interestedUsers.push(req.user.id);
      await event.save();
      
      res.status(200).json({ message: 'Vous êtes maintenant intéressé par cet événement', isInterested: true });
    }
  } catch (error) {
    console.error('Erreur lors de la mise à jour de l\'intérêt:', error);
    res.status(500).json({ error: 'Erreur lors de la mise à jour de l\'intérêt' });
  }
});

// POST /api/events/:id/choice - Marquer un événement comme un choix
router.post('/:id/choice', auth, async (req, res) => {
  try {
    const event = await EventModel.findById(req.params.id);
    
    if (!event) {
      return res.status(404).json({ error: 'Événement non trouvé' });
    }
    
    // Initialiser le tableau si nécessaire
    if (!event.choiceUsers) {
      event.choiceUsers = [];
    }
    
    // Vérifier si l'utilisateur a déjà choisi cet événement
    const userIndex = event.choiceUsers.findIndex(choice => choice.userId === req.user.id);
    
    if (userIndex > -1) {
      // Retirer le choix
      event.choiceUsers.splice(userIndex, 1);
      event.choice_count = Math.max(0, (event.choice_count || 0) - 1);
      await event.save();
      
      res.status(200).json({ message: 'Événement retiré de vos choix', isChoice: false });
    } else {
      // Ajouter le choix
      event.choiceUsers.push({ userId: req.user.id });
      event.choice_count = (event.choice_count || 0) + 1;
      await event.save();
      
      res.status(200).json({ message: 'Événement ajouté à vos choix', isChoice: true });
    }
  } catch (error) {
    console.error('Erreur lors de la mise à jour du choix:', error);
    res.status(500).json({ error: 'Erreur lors de la mise à jour du choix' });
  }
});

// POST /api/events/user/:userId/favorites - Ajouter un événement aux favoris
router.post('/user/:userId/favorites', eventController.addToFavorites);

// DELETE /api/events/user/:userId/favorites - Retirer un événement des favoris
router.delete('/user/:userId/favorites', eventController.removeFromFavorites);

// GET /api/events/producer/:producerId - Obtenir les événements d'un producteur
router.get('/producer/:producerId', async (req, res) => {
  try {
    const { producerId } = req.params;
    
    const events = await EventModel.find({
      $or: [
        { producer_id: producerId },
        { producerId: producerId },
        { venue_id: producerId }
      ]
    }).sort({ date_debut: 1 });
    
    res.status(200).json({ events });
  } catch (error) {
    console.error('Erreur de récupération des événements du producteur:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des événements du producteur' });
  }
});

// GET /api/events/:id - Obtenir un événement par ID (doit être placé à la fin pour éviter les conflits de routes)
router.get('/:id', eventController.getEventById);

module.exports = router;

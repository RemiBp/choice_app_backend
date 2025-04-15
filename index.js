// Vérifier les dépendances requises au démarrage
try {
  require('./scripts/check-dependencies');
} catch (error) {
  console.error('❌ Erreur lors de la vérification des dépendances:', error);
  // Continuer quand même, au cas où le script n'est pas accessible
}

// Verification of required dependencies
try {
  const requiredDependencies = [
    'express', 'cors', 'morgan', 'helmet', 'mongoose', 'dotenv'
  ];
  
  for (const dependency of requiredDependencies) {
    require(dependency);
  }
  console.log('✅ All required dependencies are available');
} catch (error) {
  console.error(`❌ Missing dependency: ${error.message}`);
  console.error('Please run: npm install');
  process.exit(1);
}

const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const helmet = require('helmet');
const path = require('path');
const mongoose = require('mongoose');
const dbConfig = require('./db/config');
const http = require('http');
const { Server } = require("socket.io");
const InteractionModelFactory = require('./models/Interaction'); // Import the factory

// Chargement des variables d'environnement
require('dotenv').config();
console.log('✅ Variables d\'environnement chargées:', Object.keys(process.env).join(', '));

// Initialisation de l'application Express
const app = express();
const PORT = process.env.PORT || 5000;

// ADDED: Create HTTP server and initialize Socket.IO
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    // origin: "http://localhost:3000", // Allow your frontend origin
    origin: "*", // Allow all origins for now (adjust for production)
    methods: ["GET", "POST"]
  }
});

// MODIFIED: Socket.IO connection handling with Rooms
io.on('connection', (socket) => {
  console.log(`🔌 WebSocket client connected: ${socket.id}`);

  // Get producerId from handshake query
  const producerId = socket.handshake.query.producerId;
  const producerRoom = `producer_${producerId}`;

  if (producerId) {
    console.log(`   Producer ${producerId} joining room: ${producerRoom}`);
    socket.join(producerRoom); // Join the room specific to this producer
  } else {
    console.warn('   Client connected without producerId. Cannot assign to a room.');
  }

  socket.on('disconnect', () => {
    console.log(`🔌 WebSocket client disconnected: ${socket.id}`);
    // Socket automatically leaves rooms on disconnect, no need for explicit leave here
    // We also don't need to track the socket ID manually anymore
     if (producerId) {
         console.log(`   Producer ${producerId} left room: ${producerRoom}`);
     }
  });

  // Example: Handle a message from client (can still use producerId if needed)
  socket.on('message_from_producer', (data) => {
    console.log(`✉️ Message from producer (${producerId || 'unknown'}) in room ${producerRoom}:`, data);
    // Can broadcast to the room, or handle differently
    // io.to(producerRoom).emit('message_for_producer_room', { sender: socket.id, message: data });
  });
});

// MODIFIED: Function to emit event to a specific producer room
function emitToProducer(producerId, eventName, data) {
   const producerRoom = `producer_${producerId}`;
   const roomSockets = io.sockets.adapter.rooms.get(producerRoom);

   if (roomSockets && roomSockets.size > 0) {
       io.to(producerRoom).emit(eventName, data);
       console.log(`🚀 Emitting [${eventName}] to room ${producerRoom} (${roomSockets.size} clients)`);
   } else {
       // console.log(`💨 Room ${producerRoom} is empty or doesn't exist, cannot emit [${eventName}]`);
   }
}
// Exports remain the same (io, emitToProducer)
module.exports.io = io;
module.exports.emitToProducer = emitToProducer;

// Middlewares
app.use(cors());
app.use(helmet());
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ADDED: Import and initialize Push Notification Service
const pushNotificationService = require('./services/pushNotificationService');

// Initialisations asynchrones
const initializeApp = async () => {
  try {
    // ADDED: Initialize Firebase Admin
    pushNotificationService.initializeFirebase();

    // Établir la connexion MongoDB
    await dbConfig.connectToMongoDB();
    
    // Initialiser les modèles de base de données
    const modelsInitialized = await dbConfig.initializeModels();
    if (!modelsInitialized) {
      console.error('❌ Échec de l\'initialisation des modèles, le serveur pourrait ne pas fonctionner correctement');
    }

    // Initialiser les connexions dans le module routes/index.js
    const dbConnections = require('./routes/index');
    dbConnections.initializeDatabaseConnections();
    
    // Exposer les connexions aux bases de données pour les modules qui les importent
    // C'est important de le faire après l'initialisation des modèles
    exports.choiceAppDb = dbConnections.choiceAppDb;
    exports.restaurationDb = dbConnections.restaurationDb;
    exports.loisirsDb = dbConnections.loisirsDb;
    exports.beautyWellnessDb = dbConnections.beautyWellnessDb;

    // --- Register Interaction Model --- 
    if (exports.choiceAppDb) {
      InteractionModelFactory(exports.choiceAppDb); // Register Interaction model on choiceAppDb
      console.log('✅ Interaction model registered on choiceAppDb');
    } else {
      console.error('❌ choiceAppDb connection not available, Interaction model cannot be registered.');
    }
    // --- End Register Interaction Model ---

    // Routes API - chargées après l'initialisation des modèles
    const usersRoutes = require('./routes/users');
    const authRoutes = require('./routes/auth');
    const producersRoutes = require('./routes/producers');
    const eventsRoutes = require('./routes/events');
    const wellnessRoutes = require('./routes/wellness');
    const preferencesRoutes = require('./routes/preferences');
    const paymentsRoutes = require('./routes/payments');
    const postsRoutes = require('./routes/posts');
    const choicesRoutes = require('./routes/choices');
    const statsRoutes = require('./routes/stats');
    const unifiedRoutes = require('./routes/unified');
    const newuserRoutes = require('./routes/newuser');
    const aiRoutes = require('./routes/ai'); // Routes pour l'IA avec accès MongoDB
    const leisureProducersRoutes = require('./routes/leisureProducers'); // Routes pour les producteurs de loisirs
    const finderRoutes = require('./routes/finder'); // Routes pour le finder universel
    const locationHistoryRoutes = require('./routes/location-history'); // Routes pour la vérification de l'historique des visites
    const friendsRoutesModule = require('./routes/friends'); // Routes pour les amis et leurs activités
    const translationsRoutes = require('./routes/translations'); // Routes pour les traductions et l'internationalisation
    const producerFeedRoutes = require('./routes/producerFeed'); // Routes pour le feed des producteurs
    const growthAnalyticsRoutes = require('./routes/growthAnalytics'); // Routes pour les analyses de croissance
    const conversationsRoutes = require('./routes/conversations');
    const dataIngestionRoutes = require('./routes/dataIngestion');
    const producerActionsRoutes = require('./routes/producerActions');
    const analyticsRoutes = require('./routes/analytics'); // Use the updated routes
    const interactionsRoutes = require('./routes/interactions'); // Import interactions route
    
    // Vérifier que les routes sont bien des fonctions middleware
    const routeModules = {
      usersRoutes, authRoutes, producersRoutes, eventsRoutes, wellnessRoutes, 
      preferencesRoutes, paymentsRoutes, postsRoutes, choicesRoutes, statsRoutes, 
      unifiedRoutes, newuserRoutes, aiRoutes, leisureProducersRoutes, finderRoutes,
      locationHistoryRoutes, translationsRoutes, producerFeedRoutes, growthAnalyticsRoutes,
      conversationsRoutes,
      dataIngestionRoutes,
      producerActionsRoutes,
      analyticsRoutes,
      interactionsRoutes // Add to verification
    };
    
    let allRoutesValid = true;
    for (const [name, route] of Object.entries(routeModules)) {
      if (typeof route !== 'function') {
        console.error(`❌ ${name} is not a function`);
        allRoutesValid = false;
      }
    }
    
    // Vérifier spécifiquement le module friends
    if (!(friendsRoutesModule && typeof friendsRoutesModule.initialize === 'function')) {
      console.error('❌ friendsRoutesModule.initialize is not a function');
      allRoutesValid = false;
    }
    
    if (!allRoutesValid) {
      console.error('❌ Une ou plusieurs routes sont invalides, arrêt du serveur');
      process.exit(1);
    }

    // Routes principales
    app.use('/api/users', usersRoutes);
    app.use('/api/auth', authRoutes);
    app.use('/api/producers', producersRoutes);
    app.use('/api/events', eventsRoutes);
    // Redirection de /api/evenements vers /api/events pour compatibilité
    app.use('/api/evenements', eventsRoutes);
    app.use('/api/posts', postsRoutes);
    app.use('/api/choices', choicesRoutes);
    app.use('/api/stats', statsRoutes);
    app.use('/api/unified', unifiedRoutes);
    app.use('/api/newuser', newuserRoutes);
    app.use('/api/feed', postsRoutes);
    app.use('/api/leisure', require('./routes/leisure'));
    app.use('/api/analytics', analyticsRoutes); // Use the updated routes
    app.use('/api/ai', aiRoutes); // Intégration des routes IA avec accès MongoDB
    app.use('/api/leisureProducers', leisureProducersRoutes); // Routes pour les producteurs de loisirs
    app.use('/api/finder', finderRoutes); // Routes pour le finder universel
    app.use('/api/location-history', locationHistoryRoutes); // Routes pour la vérification de l'historique des visites
    app.use('/api/translations', translationsRoutes); // Routes pour les traductions et l'internationalisation
    app.use('/api/friends', friendsRoutesModule.initialize(exports.choiceAppDb)); // Routes pour les amis et leurs activités
    app.use('/api/producer-feed', producerFeedRoutes); // Routes pour le feed des producteurs
    app.use('/api/growth-analytics', growthAnalyticsRoutes); // Routes pour les analyses de croissance
    app.use('/api/conversations', conversationsRoutes);
    app.use('/api/ingest', dataIngestionRoutes);
    app.use('/api/producer-actions', producerActionsRoutes);
    app.use('/api/interactions', interactionsRoutes); // Mount interactions route
    
    // Ajouter les routes pour beauty et wellness
    app.use('/api/beauty_places', require('./routes/beautyPlaces')); 
    app.use('/api/beauty', require('./routes/beautyProducers')); 
    app.use('/api/wellness', wellnessRoutes);
    
    // Ajouter TOUTES les routes manquantes
    try {
      // Routes pour les appels (vidéo, audio)
      app.use('/api/call', require('./routes/call'));
      
      // Routes pour le calendrier
      app.use('/api/calendar', require('./routes/calendar'));
      
      // Routes pour les préférences (déjà importées via preferencesRoutes)
      app.use('/api/preferences', preferencesRoutes);
      
      // Routes pour les paiements (déjà importées via paymentsRoutes)
      app.use('/api/payments', paymentsRoutes);
      
      // Routes peut-être requises par le frontend mais non déclarées
      app.use('/api/notifications', require('./routes/notifications'));
      app.use('/api/chat', require('./routes/chat'));
      app.use('/api/messages', require('./routes/messages'));
      app.use('/api/search', require('./routes/search'));
      app.use('/api/profile', require('./routes/profile'));
      app.use('/api/reels', require('./routes/reels'));
      app.use('/api/booking', require('./routes/booking'));
      app.use('/api/favorites', require('./routes/favorites'));
      app.use('/api/reviews', require('./routes/reviews'));
      app.use('/api/menu', require('./routes/menu'));
      app.use('/api/items', require('./routes/items'));
      app.use('/api/upload', require('./routes/upload'));
      app.use('/api/filters', require('./routes/filters'));
      
      // Support de l'API avancée pour les différents types de producteurs
      app.use('/api/restaurants', require('./routes/restaurants'));
      app.use('/api/wellnessProducers', require('./routes/wellnessProducers'));
      
      console.log('✅ Routes supplémentaires chargées avec succès');
    } catch (error) {
      console.warn('⚠️ Certaines routes n\'ont pas pu être chargées :', error.message);
      // En mode développement, afficher les détails pour faciliter le débogage
      if (process.env.NODE_ENV === 'development') {
        console.warn('Détails de l\'erreur:', error);
      }
    }
    
    // Créer une route de fallback pour les anciennes versions de l'app et la compatibilité
    app.use('/api/:service/advanced-search', (req, res) => {
      console.log(`Redirection de /api/${req.params.service}/advanced-search vers le bon endpoint`);
      
      // Rediriger vers les endpoints appropriés en fonction du service
      const service = req.params.service;
      if (service === 'producers') {
        // Rediriger vers les restaurants par défaut (compatibilité ancienne app)
        res.redirect(307, `/api/restaurants/search?${new URLSearchParams(req.query).toString()}`);
      } else if (service === 'beauty' || service === 'wellness') {
        // Rediriger vers beauty_places pour les requêtes beauty/wellness
        res.redirect(307, `/api/beauty_places/search?${new URLSearchParams(req.query).toString()}`);
      } else if (service === 'leisure') {
        // Rediriger vers leisureProducers pour les requêtes loisirs
        res.redirect(307, `/api/leisureProducers/search?${new URLSearchParams(req.query).toString()}`);
      } else {
        // Endpoint par défaut ou non pris en charge
        res.status(404).json({ error: `Service '${service}' non pris en charge pour la recherche avancée` });
      }
    });

    // Initialisation des modèles qui nécessitent une connexion à la base de données
    if (exports.loisirsDb) {
      // Initialiser les routes qui ont besoin d'une fonction d'initialisation
      if (typeof eventsRoutes.initialize === 'function') {
        eventsRoutes.initialize(exports.loisirsDb);
        console.log('✅ Routes events initialisées avec la base de données Loisir&Culture');
      }
      
      if (typeof leisureProducersRoutes.initialize === 'function') {
        leisureProducersRoutes.initialize(exports.loisirsDb);
        console.log('✅ Routes leisureProducers initialisées avec la base de données Loisir&Culture');
      }
      
      if (typeof finderRoutes.initialize === 'function') {
        finderRoutes.initialize(exports.loisirsDb);
        console.log('✅ Routes finder initialisées avec la base de données Loisir&Culture');
      }
    } else {
      console.warn('⚠️ Base de données Loisir&Culture non disponible, certaines routes ne fonctionneront pas correctement');
    }

    // Importer le contrôleur de statistiques
    const statsController = require('./controllers/statsController');

    // Initialiser le contrôleur de statistiques avec les connexions
    statsController.initialize({ restaurationDb: exports.restaurationDb });

    // Route de test pour vérifier que le serveur fonctionne
    app.get('/api/ping', (req, res) => {
      res.json({ message: 'Server is running!', timestamp: new Date().toISOString() });
    });
    
    // Middleware pour gérer les erreurs
    app.use((err, req, res, next) => {
      console.error('❌ Erreur Express:', err);
      res.status(500).json({ error: 'Server error', details: err.message });
    });

    // Servir le frontend (React/Flutter Web) en production
    if (process.env.NODE_ENV === 'production') {
      app.use(express.static(path.join(__dirname, '../frontend/build')));
      app.get('*', (req, res) => {
        res.sendFile(path.join(__dirname, '../frontend/build', 'index.html'));
      });
    }

    // Démarrage du serveur - MODIFIED: Use http server instead of app
    server.listen(PORT, () => {
      console.log(`✅ Serveur démarré sur le port ${PORT}`);
      console.log(`✅ WebSocket Server listening...`);
      console.log(`API disponible à l'adresse: http://localhost:${PORT}/api`);
      
      if (process.env.NODE_ENV === 'development') {
        console.log('⚙️ Running in development mode');
      } else {
        console.log('⚙️ Running in production mode');
      }
    });
  } catch (error) {
    console.error('❌ Erreur critique lors de l\'initialisation du serveur:', error);
    process.exit(1);
  }
};

// Lancer l'initialisation
initializeApp().catch(err => {
  console.error('❌ Erreur critique lors du démarrage:', err);
  process.exit(1);
});

// Gestion des erreurs non interceptées
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
});
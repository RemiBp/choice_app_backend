// Vérifier les dépendances requises au démarrage
// Le script scripts/check-dependencies.js n'existe plus, donc cette vérification est supprimée

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
const producerController = require('./controllers/producerController'); // <-- ADD THIS IMPORT

// Chargement des variables d'environnement
require('dotenv').config();
console.log('✅ Variables d\'environnement chargées:', Object.keys(process.env).join(', '));

// Initialisation de l'application Express
const app = express();
const PORT = process.env.PORT || 5000;
const HOST = '0.0.0.0'; // Ajouté pour écouter sur toutes les interfaces

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

  // --- ADDED: Handle joining conversation rooms --- 
  socket.on('join_conversation', (conversationId) => {
    if (conversationId) {
      socket.join(conversationId);
      console.log(`   Socket ${socket.id} joined conversation room: ${conversationId}`);
    } else {
       console.warn(`   Socket ${socket.id} tried to join a room without providing conversationId.`);
    }
  });
  // --- END ADDED --- 

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

// --- START SERVER FUNCTION ---
async function startServer() {
  try {
    console.log("⏳ Initialisation de l'application...");

    // 1. Initialize Firebase Admin
    console.log("🔥 Initialisation de Firebase Admin...");
    pushNotificationService.initializeFirebase();
    console.log("✅ Firebase Admin initialisé.");

    // 2. Connect to MongoDB
    console.log("🔌 Connexion à MongoDB...");
    await dbConfig.connectToMongoDB();
    console.log("✅ Connexion MongoDB établie.");

    // 3. Initialize Database Models (CRUCIAL: MUST COMPLETE BEFORE ROUTES)
    console.log("🧱 Initialisation des modèles Mongoose...");
    const modelsInitialized = await dbConfig.initializeModels();
    if (!modelsInitialized) {
      console.error("❌ Échec critique de l'initialisation des modèles. Arrêt.");
      process.exit(1); // Stop if models fail
    }
    console.log('✅ Modèles Mongoose initialisés.');

    // 4. Register Interaction Model (Depends on choiceAppDb being ready from initializeModels)
    console.log("💬 Enregistrement du modèle Interaction...");
    const choiceAppDbConnection = dbConfig.getChoiceAppConnection();
    if (choiceAppDbConnection) {
      InteractionModelFactory(choiceAppDbConnection);
      console.log('✅ Modèle Interaction enregistré sur choiceAppDb.');
    } else {
      console.error('❌ Connexion choiceAppDb non disponible. Le modèle Interaction ne peut pas être enregistré.');
      // Decide if this is critical enough to stop the server
      // process.exit(1);
    }

    // --- Configure Express Middlewares AFTER DB/Models Init ---
    console.log("⚙️ Configuration des middlewares Express...");
    app.use(cors());
    app.use(helmet());
    app.use(morgan('dev'));
    // Increase payload limits if necessary
    app.use(express.json({ limit: '50mb' }));
    app.use(express.urlencoded({ limit: '50mb', extended: true }));
    console.log("✅ Middlewares Express configurés.");

    // --- Require Routes AFTER DB/Models Init ---
    console.log('🔄 Chargement des définitions de routes API...');
    const usersRoutes = require('./routes/users');
    const authRoutes = require('./routes/auth');
    const producersRoutes = require('./routes/producers');
    const eventsRoutes = require('./routes/events');
    const preferencesRoutes = require('./routes/preferences');
    const paymentsRoutes = require('./routes/payments');
    const postsRoutes = require('./routes/posts');
    const choicesRoutes = require('./routes/choices');
    const statsRoutes = require('./routes/stats');
    const unifiedRoutes = require('./routes/unified');
    const newuserRoutes = require('./routes/newuser');
    const aiRoutes = require('./routes/ai');
    const leisureProducersRoutes = require('./routes/leisureProducers');
    const wellnessRoutes = require('./routes/wellness');
    const finderRoutes = require('./routes/finder');
    const locationHistoryRoutes = require('./routes/location-history');
    const friendsRoutesModule = require('./routes/friends');
    const translationsRoutes = require('./routes/translations');
    const producerFeedRoutes = require('./routes/producerFeed');
    const growthAnalyticsRoutes = require('./routes/growthAnalytics');
    const conversationsRoutes = require('./routes/conversations');
    const dataIngestionRoutes = require('./routes/dataIngestion');
    const producerActionsRoutes = require('./routes/producerActions');
    const analyticsRoutes = require('./routes/analytics');
    const interactionsRoutes = require('./routes/interactions');
    const subscriptionRoutes = require('./routes/subscription');
    const premiumFeaturesRoutes = require('./routes/premium_features');
    const tagsRoutes = require('./routes/tags');
    const searchRoutes = require('./routes/searchRoutes');
    const stripeWebhooksRoutes = require('./routes/stripe_webhooks');
    const offerRoutes = require('./routes/offers');
    const heatmapRoutes = require('./routes/heatmap');
    console.log('✅ Définitions de routes API chargées.');

    // --- Mount Routes AFTER DB/Models Init ---
    console.log('🚀 Montage des routes API sur les endpoints...');
    app.use('/api/users', usersRoutes);
    app.use('/api/auth', authRoutes);
    app.use('/api/producers', producersRoutes);
    app.use('/api/events', eventsRoutes);
    app.use('/api/preferences', preferencesRoutes);
    app.use('/api/payments', paymentsRoutes);
    app.use('/api/posts', postsRoutes);
    // Use router property if exported that way
    if (choicesRoutes && typeof choicesRoutes.router === 'function') {
        app.use('/api/choices', choicesRoutes.router);
    } else if (typeof choicesRoutes === 'function') {
        app.use('/api/choices', choicesRoutes);
    } else { console.error('❌ Invalid choicesRoutes type'); }

    app.use('/api/stats', statsRoutes);
    app.use('/api/unified', unifiedRoutes);
    app.use('/api/newuser', newuserRoutes);

    if (aiRoutes && typeof aiRoutes.router === 'function') {
        app.use('/api/ai', aiRoutes.router);
    } else if (typeof aiRoutes === 'function') {
        app.use('/api/ai', aiRoutes);
    } else { console.error('❌ Invalid aiRoutes type'); }

    app.use('/api/leisure-producers', leisureProducersRoutes); // Note: Changed endpoint for clarity
    app.use('/api/wellness', wellnessRoutes); // <-- ADDED WELLNESS ROUTE USAGE
    app.use('/api/finder', finderRoutes);
    app.use('/api/location-history', locationHistoryRoutes);

    if (friendsRoutesModule && typeof friendsRoutesModule.router === 'function') {
        app.use('/api/friends', friendsRoutesModule.router);
    } else { console.error('❌ Invalid friendsRoutes type'); }

    app.use('/api/translations', translationsRoutes);
    app.use('/api/producer-feed', producerFeedRoutes);
    app.use('/api/growth-analytics', growthAnalyticsRoutes);
    app.use('/api/conversations', conversationsRoutes);
    app.use('/api/ingestion', dataIngestionRoutes);
    app.use('/api/producer-actions', producerActionsRoutes);
    app.use('/api/analytics', analyticsRoutes);
    app.use('/api/interactions', interactionsRoutes);
    app.use('/api/subscription', subscriptionRoutes);
    app.use('/api/premium-features', premiumFeaturesRoutes);
    app.use('/api/tags', tagsRoutes);
    app.use('/api/search', searchRoutes);
    app.use('/stripe-webhooks', stripeWebhooksRoutes); // No /api prefix for webhooks typically
    app.use('/api/offers', offerRoutes);
    app.use('/api/heatmap', heatmapRoutes);
    console.log('✅ Routes API montées.');

    // --- Static files serving (Optional) ---
    if (process.env.NODE_ENV === 'production' || process.env.SERVE_FRONTEND === 'true') {
        console.log('📁 Service des fichiers statiques du frontend activé...');
        const frontendPath = path.join(__dirname, '..', 'frontend', 'build', 'web');
        console.log(`   Chemin du frontend: ${frontendPath}`);
        if (require('fs').existsSync(frontendPath)) {
            app.use(express.static(frontendPath));
            // Catch-all route for SPA history mode
            app.get('*', (req, res, next) => {
                // Avoid catching API routes
                if (req.path.startsWith('/api/') || req.path.startsWith('/stripe-webhooks')) {
                   return next();
                }
                res.sendFile(path.resolve(frontendPath, 'index.html'));
            });
            console.log("✅ Service des fichiers statiques configuré.");
        } else {
            console.warn("⚠️ Répertoire build du frontend non trouvé. Assurez-vous d'avoir build le frontend (flutter build web).");
        }
    }

    // --- Start HTTP Server ---
    server.listen(PORT, HOST, () => {
      console.log(`
✨ Serveur démarré et écoutant sur http://${HOST}:${PORT}`);
      console.log(`   Mode: ${process.env.NODE_ENV || 'development'}`);
      console.log(`   WebSocket: Activé`);
      console.log("🎉 Initialisation de l'application terminée avec succès.");
    });

  } catch (error) {
    console.error("❌ Erreur critique lors de l'initialisation de l'application:", error);
    process.exit(1); // Stop the application on critical initialization error
  }
}

// --- Global Error Handlers ---
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  // Consider logging more details or exiting gracefully in production
});

process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  // It's generally recommended to exit after an uncaught exception
  process.exit(1);
});

// --- Launch the server initialization ---
startServer();
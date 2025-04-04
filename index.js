const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const cron = require('node-cron');
const { exec } = require('child_process');

// Charger les variables d'environnement
dotenv.config();

if (!process.env.MONGO_URI) {
  console.error('❌ La variable MONGO_URI est manquante.');
  process.exit(1);
}

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors({
  origin: ['http://localhost:3000', 'http://10.0.2.2:3000', 'http://10.0.2.2:5000', 'http://localhost:5000', '*'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
  credentials: true
}));

// Gestion explicite des requêtes CORS OPTIONS
app.options('*', (req, res) => {
  console.log('🔄 Requête OPTIONS reçue pour le preflight CORS');
  res.status(200).end();
});

app.use(express.json());
app.use((req, res, next) => {
  console.log(`\n🔍 REQUÊTE REÇUE [${new Date().toISOString()}]`);
  console.log(`📌 ${req.method} ${req.url}`);
  console.log('📋 Headers:', JSON.stringify(req.headers, null, 2));
  console.log('📦 Body:', JSON.stringify(req.body, null, 2));
  
  // Tracer spécifiquement les requêtes aux endpoints AI
  if (req.url.includes('/api/ai/')) {
    console.log('🤖 REQUÊTE AI DÉTECTÉE! ');
    console.log(`🔍 Path: ${req.url}`);
    console.log(`📦 Payload:`, req.body);
  }
  
  // Capturer également la réponse
  const originalSend = res.send;
  res.send = function(body) {
    console.log(`📤 RÉPONSE [${res.statusCode}]`);
    if (res.statusCode >= 400) {
      console.log('❌ Erreur:', body);
    } else if (req.url.includes('/api/ai/')) {
      console.log('🤖 Réponse AI:', typeof body === 'string' ? body.substring(0, 150) + '...' : 'Objet non-string');
    }
    originalSend.apply(res, arguments);
  };
  
  next();
});


// Connexion principale à MongoDB
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log(`✅ Connexion au cluster MongoDB réussie`))
  .catch((err) => {
    console.error('❌ Erreur de connexion MongoDB :', err.message);
    process.exit(1);
  });

// Connexions secondaires pour différentes bases de données
const choiceAppDb = mongoose.connection.useDb('choice_app');
const testDb = mongoose.connection.useDb('test'); // Ajout de la connexion à la base "test"

// Exporter les connexions pour utilisation dans d'autres fichiers
module.exports = { choiceAppDb, testDb };

// Rendre les connexions disponibles via app.locals
app.locals.choiceAppDb = choiceAppDb;
app.locals.testDb = testDb;

const leisureProducerRoutes = require('./routes/leisureProducers');
const eventRoutes = require('./routes/events');
const unifiedRoutes = require('./routes/unified');
const postRoutes = require('./routes/posts');
const userRoutes = require('./routes/users');
const producerRoutes = require('./routes/producers');
const conversationRoutes = require('./routes/conversations');
const newUserRoutes = require('./routes/newuser');
const linkedRoutes = require('./routes/linked');
const choicexinterestRoutes = require('./routes/choicexinterest');
const subscriptionRoutes = require('./routes/subscription');
const chatRoutes = require("./routes/chat");
const shareRoutes = require('./routes/share');
const interactionsRoutes = require('./routes/interactions');
const aiRoutes = require('./routes/ai'); // Nouvelles routes pour l'IA avec accès MongoDB en temps réel
const mediaRoutes = require('./routes/media'); // Routes pour l'upload de médias et photos de profil
const locationHistoryRoutes = require('./routes/location-history'); // Routes pour la vérification de l'historique des visites
const friendsRoutes = require('./routes/friends'); // Routes pour les amis et leurs activités
const choicesRoutes = require('./routes/choices'); // Routes pour la création et vérification des choices
const producerFeedRoutes = require('./routes/producerFeed'); // Routes pour le feed des producteurs
const growthAnalyticsRoutes = require('./routes/growthAnalytics'); // Routes pour les analyses de croissance et de portée
const feedRoutes = require('./routes/feed'); // Routes pour le feed principal

// Configuration des routes
app.use('/api/unified', unifiedRoutes);
app.use('/api/leisureProducers', leisureProducerRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/posts', postRoutes);
app.use('/api/choices', choicesRoutes);
app.use('/api/users', userRoutes);
app.use('/api/producers', producerRoutes);
app.use('/api/conversations', conversationRoutes);
app.use('/api/newuser', newUserRoutes);
app.use('/api/linked', linkedRoutes);
app.use('/api/choicexinterest', choicexinterestRoutes);
app.use('/api/subscription', subscriptionRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/share', shareRoutes);
app.use('/api/interactions', interactionsRoutes);
app.use('/api/ai', aiRoutes); // Intégration des routes IA avec accès MongoDB en temps réel
app.use('/api/media', mediaRoutes); // Routes pour l'upload de médias et photos de profil
app.use('/api/location-history', locationHistoryRoutes); // Routes pour la vérification de l'historique des visites
app.use('/api/friends', friendsRoutes); // Routes pour les amis et leurs activités
app.use('/api/producer-feed', producerFeedRoutes); // Routes pour le feed des producteurs
app.use('/api/growth-analytics', growthAnalyticsRoutes); // Routes pour les analyses de croissance
app.use('/api/feed', feedRoutes); // Routes pour le feed principal

// Intégration du service d'automatisation des posts
const postAutomationService = require('./services/postAutomationService');
postAutomationService.integrateWithApp(app);
console.log('🤖 Service d\'automatisation des posts initialisé et intégré');


// Planification Cron : Mise à jour des producteurs
cron.schedule('0 0 */3 * *', () => {
  console.log('🕒 Exécution du script generateProducers.js pour mettre à jour les producteurs...');
  exec('node ./scripts/generateProducers.js', (error, stdout, stderr) => {
    if (error) {
      console.error(`❌ Erreur lors de l'exécution du script : ${error.message}`);
      return;
    }
    if (stderr) {
      console.error(`⚠️ Avertissement : ${stderr}`);
    }
    console.log(`✅ Script terminé avec succès :\n${stdout}`);
  });
});

// Route par défaut
app.get('/', (req, res) => {
  res.send('Le backend de Choice App fonctionne 🎉');
});

// Gestion des erreurs globales
app.use((err, req, res, next) => {
  console.error('❌ Erreur serveur :', err.message);
  res.status(500).json({ message: 'Erreur interne du serveur.' });
});

// Gestion des routes inexistantes
app.use((req, res) => {
  res.status(404).json({ message: 'Route non trouvée.' });
});

// Lancement du serveur
app.listen(PORT, () => {
  console.log(`🚀 Serveur lancé sur le port ${PORT}`);
});
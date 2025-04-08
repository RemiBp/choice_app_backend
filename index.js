const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const cron = require('node-cron');
const { exec } = require('child_process');
const bodyParser = require('body-parser');
const path = require('path');
const helmet = require('helmet');
const compression = require('compression');

// Charger les variables d'environnement
dotenv.config();

if (!process.env.MONGO_URI) {
  console.error('❌ La variable MONGO_URI est manquante.');
  process.exit(1);
}

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(helmet()); // Sécurité
app.use(compression()); // Compression des réponses
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '50mb' }));
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  if (req.method !== 'GET') {
    // Éviter de loguer les gros payloads et les données sensibles
    const body = { ...req.body };
    if (body.password) body.password = '[REDACTED]';
    if (body.media && body.media.length > 100) body.media = '[MEDIA DATA]';
    console.log('Body:', body);
  }
  next();
});

// Configuration de MongoDB - Connexions multiples
const mongoURI = process.env.MONGO_URI || 'mongodb+srv://remibarbier:Calvi8Pierc2@lieuxrestauration.szq31.mongodb.net/?retryWrites=true&w=majority&appName=lieuxrestauration';

// Connexions aux différentes bases de données
const choiceAppDb = mongoose.createConnection(mongoURI, {
  dbName: 'choice_app',
  useNewUrlParser: true,
  useUnifiedTopology: true
});

const restaurationDb = mongoose.createConnection(mongoURI, {
  dbName: 'Restauration_Officielle',
  useNewUrlParser: true,
  useUnifiedTopology: true
});

const loisirDb = mongoose.createConnection(mongoURI, {
  dbName: 'Loisir&Culture',
  useNewUrlParser: true,
  useUnifiedTopology: true
});

const beautyWellnessDb = mongoose.createConnection(mongoURI, {
  dbName: 'Beauty_Wellness',
  useNewUrlParser: true,
  useUnifiedTopology: true
});

// Gestion des connexions
choiceAppDb.on('error', err => console.error('Erreur de connexion à choice_app:', err));
restaurationDb.on('error', err => console.error('Erreur de connexion à Restauration_Officielle:', err));
loisirDb.on('error', err => console.error('Erreur de connexion à Loisir&Culture:', err));
beautyWellnessDb.on('error', err => console.error('Erreur de connexion à Beauty_Wellness:', err));

choiceAppDb.once('open', () => console.log('Connecté à la base de données choice_app'));
restaurationDb.once('open', () => console.log('Connecté à la base de données Restauration_Officielle'));
loisirDb.once('open', () => console.log('Connecté à la base de données Loisir&Culture'));
beautyWellnessDb.once('open', () => console.log('Connecté à la base de données Beauty_Wellness'));

// Exporter les connexions pour utilisation dans d'autres fichiers
module.exports = { 
  choiceAppDb, 
  restaurationDb,
  loisirDb: loisirDb,
  loisirCultureDb: loisirDb,
  beautyWellnessDb,
  app
};

// Import des routes
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
const chatRoutes = require('./routes/chat');
const shareRoutes = require('./routes/share');
const interactionsRoutes = require('./routes/interactions');
// Réactiver les routes essentielles pour le backup
const aiRoutes = require('./routes/ai'); 
const wellnessRoutes = require('./routes/wellness');
const wellnessAuthRoutes = require('./routes/wellnessAuth');
const searchRoutes = require('./routes/searchRoutes');
const beautyPlacesRoutes = require('./routes/beautyPlaces');
const mapRoutes = require('./routes/map');
const feedRoutes = require('./routes/feed'); 
// Ajouter la route de synchronisation
const syncRoutes = require('./routes/sync');
// Réactiver les routes nécessaires pour backup
const distanceRoutes = require('./routes/distanceRoutes');
const menuRoutes = require('./routes/menuRoutes');
const friendsRoutes = require('./routes/friends');
const analyticsRoutes = require('./routes/analytics');
const growthAnalyticsRoutes = require('./routes/growth_analytics');
const calendarRoutes = require('./routes/calendar');
const authRoutes = require('./routes/auth');
const notificationRoutes = require('./routes/notifications');
const tagRoutes = require('./routes/tags');
const beautyRoutes = require('./routes/beautyProducers');
const paymentsRoutes = require('./routes/payments');
const socialRoutes = require('./routes/social');
const preferencesRoutes = require('./routes/preferences');
const statsRoutes = require('./routes/stats');
const promotionRoutes = require('./routes/promotionRoutes');
const heatmapRoutes = require('./routes/heatmap');
// Ajouter les routes manquantes pour les vues et commentaires détaillés
const commentsRoutes = require('./routes/comments');
const viewsRoutes = require('./routes/views');
const callRoutes = require('./routes/call');
const recoveryRoutes = require('./routes/recovery');
const apiServiceRoutes = require('./routes/api_service');
const choicesRoutes = require('./routes/choices');

// Additional route imports
const emailRoutes = require('./routes/email');
const contactsRoutes = require('./routes/contacts');
const premiumFeaturesRoutes = require('./routes/premium_features');
const marketingRoutes = require('./routes/marketing');
const badgesRoutes = require('./routes/badges');

// Configuration des routes
app.use('/api/leisureProducers', leisureProducerRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/unified', unifiedRoutes);
app.use('/api/posts', postRoutes);
app.use('/api/users', userRoutes);
app.use('/api/user', userRoutes); // Alias pour la compatibilité avec le frontend
app.use('/api/producers', producerRoutes);
app.use('/api/conversations', conversationRoutes);
app.use('/api/newuser', newUserRoutes);
app.use('/api/linked', linkedRoutes);
app.use('/api/choicexinterest', choicexinterestRoutes);
app.use('/api/subscription', subscriptionRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/share', shareRoutes);
app.use('/api/interactions', interactionsRoutes);
// Réactiver les routes essentielles
app.use('/api/ai', aiRoutes);
app.use('/api/wellness', wellnessRoutes);
app.use('/api/wellness/auth', wellnessAuthRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/beauty_places', beautyPlacesRoutes);
app.use('/api/map', mapRoutes);
app.use('/api/map', apiServiceRoutes);
app.use('/api/feed', feedRoutes);
// Ajouter la route de synchronisation
app.use('/api/sync', syncRoutes);
// Réactiver les routes nécessaires pour backup
app.use('/api/distance', distanceRoutes);
app.use('/api/menu', menuRoutes);
app.use('/api/friends', friendsRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/growth-analytics', growthAnalyticsRoutes);
app.use('/api/calendar', calendarRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/tags', tagRoutes);
app.use('/api/beauty', beautyRoutes);
app.use('/api/payments', paymentsRoutes);
app.use('/api/payment', paymentsRoutes); // Alias pour la nouvelle version du frontend
app.use('/api/social', socialRoutes);
app.use('/api/preferences', preferencesRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/promotions', promotionRoutes);
app.use('/api/heatmap', heatmapRoutes);
// Ajouter les nouvelles routes 
app.use('/api/comments', commentsRoutes);
app.use('/api/views', viewsRoutes);
app.use('/api/calls', callRoutes);
app.use('/api/recovery', recoveryRoutes);
app.use('/api/contacts', contactsRoutes);
app.use('/api/choices', choicesRoutes);

// Alias de routes pour compatibilité avec l'ancien frontend
app.use('/api/restaurant-items/nearby', (req, res, next) => {
  req.url = ''; // Rediriger vers l'endpoint approprié
  producerRoutes(req, res, next);
});

app.use('/api/leisure/venues', (req, res, next) => {
  req.url = ''; // Rediriger vers l'endpoint approprié
  leisureProducerRoutes(req, res, next);
});

app.use('/api/leisure/events', (req, res, next) => {
  req.url = ''; // Rediriger vers l'endpoint approprié
  eventRoutes(req, res, next);
});

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

// Planification Cron : Sauvegarde de la base de données
cron.schedule('0 0 * * 0', () => {
  console.log('🕒 Exécution du script backupMongoDB.js pour sauvegarder la base de données...');
  exec('node ./scripts/backupMongoDB.js', (error, stdout, stderr) => {
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

// Planification Cron : Vérification quotidienne des collections
cron.schedule('0 1 * * *', () => {
  console.log('🕒 Exécution du script check_all_mongodb.js pour vérifier l\'intégrité de la base de données...');
  exec('node check_all_mongodb.js > mongodb_report_$(date +%Y-%m-%dT%H-%M-%S).txt', (error, stdout, stderr) => {
    if (error) {
      console.error(`❌ Erreur lors de l'exécution du script : ${error.message}`);
      return;
    }
    console.log(`✅ Vérification de la base de données terminée`);
  });
});

// Route pour la vérification de l'état du serveur
app.get('/api/health-check', (req, res) => {
  res.status(200).json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    message: 'Le serveur fonctionne correctement'
  });
});

// Route pour les mises à jour manuelles de la base de données
app.get('/api/admin/repair-db', (req, res) => {
  // Vérifier si la requête est autorisée (à implémenter avec authentification)
  exec('npm run repair-db', (error, stdout, stderr) => {
    if (error) {
      console.error(`❌ Erreur lors de la réparation : ${error.message}`);
      return res.status(500).json({ success: false, message: 'Erreur de réparation', error: error.message });
    }
    
    res.status(200).json({ 
      success: true, 
      message: 'Réparation de la base de données effectuée avec succès',
      details: stdout
    });
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

// Add new routes
app.use('/api/email', emailRoutes);
app.use('/api/premium-features', premiumFeaturesRoutes);
app.use('/api/marketing', marketingRoutes);
app.use('/', badgesRoutes); // Ces routes commencent déjà par /api/users/

// Lancement du serveur
app.listen(PORT, () => {
  console.log(`🚀 Serveur lancé sur le port ${PORT}`);
});
/**
 * Service d'Automatisation des Posts pour Choice App
 * 
 * Ce service planifie et gère la génération automatique de posts
 * en utilisant le générateur de posts DeepSeek et node-cron pour la planification.
 */

const cron = require('node-cron');
const mongoose = require('mongoose');
const { 
  generateRandomPosts,
  generateRestaurantPost, 
  generateLeisurePost,
  generateUpcomingEventsPosts,
  generateTopRestaurantsPosts,
  generateTopLeisurePosts,
  isEventEnded,
  isDuplicate
} = require('./autoPostGenerator');

// Connexions MongoDB
const usersDb = mongoose.createConnection(process.env.MONGO_URI, {
  dbName: "choice_app",
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

const restaurationDb = mongoose.createConnection(process.env.MONGO_URI, {
  dbName: "Restauration_Officielle",
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

const loisirsDb = mongoose.createConnection(process.env.MONGO_URI, {
  dbName: "Loisir&Culture",
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

// Modèles MongoDB
const Post = usersDb.model("Post", new mongoose.Schema({}, { strict: false }), "Posts");
const Producer = restaurationDb.model("Producer", new mongoose.Schema({}, { strict: false }), "producers");
const LeisureProducer = loisirsDb.model("LeisureProducer", new mongoose.Schema({}, { strict: false }), "Loisir_Paris_Producers");
const Event = loisirsDb.model("Event", new mongoose.Schema({}, { strict: false }), "Loisir_Paris_Evenements");

// Configuration des planifications
const SCHEDULE_CONFIG = {
  // Génération aléatoire de posts tous les jours de 3h à 7h du matin
  daily: '0 3-7 * * *'
};

// Intervalle entre les générations (en minutes) - Plus fréquent pour une activité "non-stop"
const GENERATION_INTERVAL = 5; // Un post toutes les 5 minutes en moyenne

// Configuration de la diversité des posts et prévention des doublons
const POST_CONFIG = {
  postsPerBatch: 2,      // Nombre de posts à générer par batch
  maxPostsPerDay: 48,    // Nombre maximum de posts par jour (jusqu'à 12 par heure sur 4h)
  minTimeBetweenSamePosts: 7, // Nombre minimum de jours entre deux posts identiques
  maxPostsPerProducer: 1 // Maximum 1 post par producteur par jour
};

// Historique des posts générés aujourd'hui pour contrôler le volume
let todayPostCount = 0;
let lastPostsByEntity = new Map(); // Map des entités -> timestamp du dernier post

// État du service
let isEnabled = true;
let cronJobs = {};
let isCurrentlyGenerating = false; // Flag pour éviter les exécutions simultanées

/**
 * Vérifie si on peut encore générer des posts aujourd'hui
 * @returns {boolean} - Vrai si on n'a pas atteint la limite quotidienne
 */
function canGenerateMorePostsToday() {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  
  // Réinitialiser le compteur à minuit
  if (lastDayReset && lastDayReset < today) {
    todayPostCount = 0;
    lastDayReset = today;
  }
  
  return todayPostCount < POST_CONFIG.maxPostsPerDay;
}

// Jour de la dernière réinitialisation du compteur
let lastDayReset = new Date();

/**
 * Initialise les tâches cron pour la génération automatique de posts
 */
function initCronJobs() {
  console.log("⏰ Initialisation de la tâche planifiée pour la génération de posts...");
  
  // Planification quotidienne de 3h à 7h du matin
  cronJobs.daily = cron.schedule(SCHEDULE_CONFIG.daily, async () => {
    if (!isEnabled) return;
    
    // Vérifier l'heure actuelle
    const currentHour = new Date().getHours();
    if (currentHour < 3 || currentHour >= 7) return;
    
    // Éviter les exécutions simultanées
    if (isCurrentlyGenerating) {
      console.log("⏳ Une génération est déjà en cours, cette exécution est ignorée");
      return;
    }
    
    // Vérifier si on peut générer plus de posts aujourd'hui
    if (!canGenerateMorePostsToday()) {
      console.log(`🛑 Limite quotidienne atteinte (${POST_CONFIG.maxPostsPerDay} posts), les générations sont suspendues jusqu'à demain`);
      return;
    }

    console.log(`🔄 Exécution planifiée à ${new Date().toLocaleTimeString()}: Génération de posts aléatoires`);
    
    try {
      isCurrentlyGenerating = true;
      
      // Générer 1-2 posts aléatoires, s'assurer que c'est au moins 1
      const postCount = Math.floor(Math.random() * 2) + 1; // 1 ou 2 posts
      const posts = await generateRandomPosts(postCount);
      
      if (posts.length > 0) {
        todayPostCount += posts.length;
        console.log(`✅ ${posts.length} posts générés avec succès (total aujourd'hui: ${todayPostCount}/${POST_CONFIG.maxPostsPerDay})`);
      } else {
        console.log("⚠️ Aucun post n'a pu être généré cette fois-ci");
      }
    } catch (error) {
      console.error("❌ Erreur lors de la génération des posts:", error.message);
    } finally {
      isCurrentlyGenerating = false;
      
      // Planifier la prochaine génération dans un délai aléatoire pour une distribution plus naturelle
      const randomDelay = Math.floor((Math.random() * GENERATION_INTERVAL * 0.5) + GENERATION_INTERVAL * 0.75) * 60 * 1000;
      setTimeout(() => {
        // Vérifier que nous sommes toujours dans la plage horaire 3-7h
        const newHour = new Date().getHours();
        if (isEnabled && newHour >= 3 && newHour < 7) {
          console.log(`⏱️ Planification de la prochaine génération dans ${randomDelay/60000} minutes`);
          cronJobs.daily.now();
        }
      }, randomDelay);
    }
  });
  
  console.log("✅ Tâches planifiées initialisées avec succès");
}

/**
 * Arrête toutes les tâches cron
 */
function stopCronJobs() {
  Object.values(cronJobs).forEach(job => {
    if (job && typeof job.stop === 'function') {
      job.stop();
    }
  });
  console.log("⏹️ Toutes les tâches planifiées ont été arrêtées");
}

/**
 * Active ou désactive le service d'automatisation
 * @param {boolean} enabled - Nouvel état d'activation
 */
function setEnabled(enabled) {
  isEnabled = !!enabled;
  console.log(`${isEnabled ? "✅ Service d'automatisation activé" : "⏸️ Service d'automatisation désactivé"}`);
}

/**
 * Génère manuellement un post pour un restaurant spécifique
 * @param {string} producerId - ID du restaurant
 * @param {Object} options - Options de génération
 * @returns {Promise<Object>} - Le post généré
 */
async function generateRestaurantPostManually(producerId, options = {}) {
  console.log(`🍽️ Génération manuelle d'un post pour le restaurant ${producerId}`);
  return await generateRestaurantPost(producerId, options);
}

/**
 * Génère manuellement un post pour un lieu de loisir spécifique
 * @param {string} producerId - ID du lieu de loisir
 * @param {Object} options - Options de génération
 * @returns {Promise<Object>} - Le post généré
 */
async function generateLeisurePostManually(producerId, options = {}) {
  console.log(`🏛️ Génération manuelle d'un post pour le lieu de loisir ${producerId}`);
  return await generateLeisurePost(producerId, options);
}

/**
 * Génère un lot de posts de manière automatique
 * @param {string} type - Type de posts à générer ('events', 'restaurants', 'leisure', 'mixed')
 * @param {number} count - Nombre de posts à générer
 * @returns {Promise<Array>} - Les posts générés
 */
async function generateBatchPosts(type, count = 5) {
  // S'assurer que count est toujours positif pour éviter les erreurs MongoDB
  const safeCount = Math.max(1, count);
  console.log(`🔄 Génération manuelle d'un lot de posts de type "${type}" (count: ${safeCount})`);
  
  switch (type) {
    case 'events':
      return await generateUpcomingEventsPosts(safeCount);
      
    case 'restaurants':
      return await generateTopRestaurantsPosts(safeCount);
      
    case 'leisure':
      return await generateTopLeisurePosts(safeCount);
      
    case 'mixed':
      return await generateRandomPosts(safeCount);
      
    default:
      throw new Error(`Type de lot inconnu: ${type}`);
  }
}

/**
 * Initialise le service d'automatisation des posts
 */
function init() {
  console.log("🚀 Initialisation du service d'automatisation des posts...");
  
  // Réinitialiser le compteur quotidien
  todayPostCount = 0;
  lastDayReset = new Date();
  
  // Démarrer les tâches cron
  initCronJobs();
  
  // Exécuter immédiatement la tâche si nous sommes entre 3h et 7h du matin
  const currentHour = new Date().getHours();
  if (isEnabled && currentHour >= 3 && currentHour < 7) {
    console.log("▶️ Démarrage immédiat de la génération de posts (heure actuelle dans la plage cible)");
    setTimeout(() => cronJobs.daily.now(), 5000);
  }
}

/**
 * Exécution immédiate pour tester la génération de posts
 * @returns {Promise<Object>} - Résultats du test
 */
async function runTest() {
  console.log("🧪 Exécution du test de génération de posts...");
  
  try {
    // Générer un post aléatoire pour test
    const posts = await generateRandomPosts(1);
    const success = posts && posts.length > 0;
    
    // Récupérer le statut du service
    const currentHour = new Date().getHours();
    const inScheduleWindow = currentHour >= 3 && currentHour < 7;
    
    return {
      success,
      message: success 
        ? `Test réussi! ${posts.length} post(s) généré(s)` 
        : "Échec du test: aucun post généré",
      posts: posts,
      service_status: {
        enabled: isEnabled,
        currentlyGenerating: isCurrentlyGenerating,
        todayPostCount,
        maxPostsPerDay: POST_CONFIG.maxPostsPerDay,
        inScheduleWindow,
        nextGeneration: inScheduleWindow ? "Actif maintenant" : "3h-7h du matin"
      }
    };
  } catch (error) {
    console.error("❌ Erreur lors du test:", error);
    return {
      success: false,
      message: `Échec du test: ${error.message}`,
      error_details: error.toString()
    };
  }
}

/**
 * Intègre le service d'automatisation avec l'application Express
 * @param {Object} app - Application Express
 */
function integrateWithApp(app) {
  console.log("🔌 Intégration du service d'automatisation des posts avec l'application Express...");
  
  // Initialiser le service
  init();
  
  // Route pour générer manuellement un post de restaurant
  app.post('/api/ai/generate-post/restaurant/:id', async (req, res) => {
    try {
      const producerId = req.params.id;
      const options = req.body || {};
      
      const post = await generateRestaurantPostManually(producerId, options);
      res.json({ success: true, post });
    } catch (error) {
      console.error("❌ Erreur lors de la génération du post de restaurant:", error);
      res.status(500).json({ 
        success: false, 
        error: error.message,
        details: error.toString() 
      });
    }
  });
  
  // Route pour générer manuellement un post de lieu de loisir
  app.post('/api/ai/generate-post/leisure/:id', async (req, res) => {
    try {
      const producerId = req.params.id;
      const options = req.body || {};
      
      const post = await generateLeisurePostManually(producerId, options);
      res.json({ success: true, post });
    } catch (error) {
      console.error("❌ Erreur lors de la génération du post de lieu de loisir:", error);
      res.status(500).json({ 
        success: false, 
        error: error.message,
        details: error.toString()
      });
    }
  });
  
  // Route pour générer un lot de posts
  app.post('/api/ai/generate-posts/:type', async (req, res) => {
    try {
      const type = req.params.type;
      // Assurer que count est toujours positif
      const count = Math.max(1, parseInt(req.body.count || 5, 10));
      
      const posts = await generateBatchPosts(type, count);
      res.json({ 
        success: true, 
        count: posts.length,
        posts 
      });
    } catch (error) {
      console.error(`❌ Erreur lors de la génération du lot de posts de type ${req.params.type}:`, error);
      res.status(500).json({ 
        success: false, 
        error: error.message,
        details: error.toString()
      });
    }
  });
  
  // Route pour contrôler l'activation/désactivation du service
  app.post('/api/ai/auto-posts/control', (req, res) => {
    const { enabled } = req.body;
    
    if (enabled !== undefined) {
      setEnabled(enabled);
    }
    
    res.json({ 
      success: true, 
      enabled: isEnabled,
      todayPostCount,
      maxPostsPerDay: POST_CONFIG.maxPostsPerDay
    });
  });
  
  // Route pour tester le service
  app.get('/api/ai/auto-posts/test', async (req, res) => {
    try {
      const result = await runTest();
      res.json(result);
    } catch (error) {
      // Capturer les erreurs non gérées dans runTest pour éviter les crashs
      console.error("❌ Erreur non gérée lors du test:", error);
      res.status(500).json({
        success: false,
        message: "Erreur système lors du test",
        error: error.message,
        details: error.toString()
      });
    }
  });
  
  // Route pour obtenir les statistiques du service
  app.get('/api/ai/auto-posts/stats', async (req, res) => {
    try {
      // Récupérer le nombre de posts automatiques générés aujourd'hui
      const now = new Date();
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      
      const postCount = await Post.countDocuments({
        is_automated: true,
        time_posted: { $gte: startOfDay }
      });
      
      // Vérifier l'heure actuelle
      const currentHour = now.getHours();
      const inScheduleWindow = currentHour >= 3 && currentHour < 7;
      
      res.json({
        success: true,
        stats: {
          todayPostCount: postCount,
          servicePostCount: todayPostCount,
          maxPostsPerDay: POST_CONFIG.maxPostsPerDay,
          enabled: isEnabled,
          nextGenerationWindow: `3:00 - 7:00 AM`,
          inScheduleWindow,
          currentlyGenerating: isCurrentlyGenerating
        }
      });
    } catch (error) {
      console.error("❌ Erreur lors de la récupération des statistiques:", error);
      res.status(500).json({ 
        success: false, 
        error: error.message,
        details: error.toString()
      });
    }
  });
  
  console.log("✅ Routes d'automatisation de posts intégrées avec succès");
}

module.exports = {
  init,
  integrateWithApp,
  setEnabled,
  generateRestaurantPostManually,
  generateLeisurePostManually,
  generateBatchPosts,
  runTest
};
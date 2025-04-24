const mongoose = require('mongoose');
const { createModel, databases, getProducerModel } = require('../utils/modelCreator');
const analyticsService = require('../services/analyticsService');

// Require Schemas for our custom models - these export schemas
const ProfileViewSchema = require('../models/ProfileView'); 
const RatingSchema = require('../models/Rating');

// Get the DB connections from index
const getDbConnections = require('../index');

// --- Model Initialization --- 
// We need the correct DB connections to initialize models.
let Post, User, Follow, ProfileView, Rating, Subscription, AnalyticsEvent;

function initializeModels() {
    try {
        const { choiceAppDb } = getDbConnections; 
        if (!choiceAppDb) {
            console.error("❌ choiceAppDb connection not available for Analytics Controller Models");
            return false;
        }

        // For ProfileView and Rating, we use our schemas
        ProfileView = createModel(choiceAppDb, 'ProfileView', 'profile_views', ProfileViewSchema);
        Rating = createModel(choiceAppDb, 'Rating', 'ratings', RatingSchema);
        
        // For Post, User, Follow, we need to access existing models or import differently
        // Try to access the models if they're already registered with mongoose
        try {
            Post = choiceAppDb.model('Post'); // Try to get existing model
            console.log("✅ Using existing Post model");
        } catch (err) {
            console.warn("⚠️ Couldn't access Post model:", err.message);
            Post = null; // Set to null to handle absence in controller methods
        }

        try {
            User = choiceAppDb.model('User'); // Try to get existing model
            console.log("✅ Using existing User model");
        } catch (err) {
            console.warn("⚠️ Couldn't access User model:", err.message);
            User = null;
        }

        try {
            Follow = choiceAppDb.model('Follow'); // Try to get existing model
            console.log("✅ Using existing Follow model");
        } catch (err) {
            console.warn("⚠️ Couldn't access Follow model:", err.message);
            Follow = null;
        }

        try {
            Subscription = choiceAppDb.model('Subscription'); // Try to get existing model
            console.log("✅ Using existing Subscription model");
        } catch (err) {
            console.warn("⚠️ Couldn't access Subscription model:", err.message);
            Subscription = null;
        }

        // Create the Analytics event model (assuming it doesn't conflict)
        try {
            AnalyticsEvent = createModel(choiceAppDb, 'AnalyticsEvent', 'analytics_events');
            console.log("✅ Created AnalyticsEvent model");
        } catch (err) {
            console.warn("⚠️ Couldn't create AnalyticsEvent model:", err.message);
            // Try to get the existing model
            try {
                AnalyticsEvent = choiceAppDb.model('AnalyticsEvent');
                console.log("✅ Using existing AnalyticsEvent model");
            } catch (err2) {
                console.error("❌ Couldn't access AnalyticsEvent model");
                AnalyticsEvent = null;
            }
        }

        console.log("✅ Analytics Controller Models Initialization Completed");
        return true;
    } catch (error) {
        console.error("❌ Error in initializeModels:", error);
        return false;
    }
}

// Call initialization
const modelsInitialized = initializeModels();
if (!modelsInitialized) {
    console.warn("⚠️ Models were not properly initialized. Some analytics features may not work.");
}

// --- Helpers globaux ---
function getPeriodDates(period) {
  const now = new Date();
  let daysToSubtract = 30; // Default
  if (period && period.endsWith('d')) {
    const days = parseInt(period.slice(0, -1), 10);
    if (!isNaN(days)) {
      daysToSubtract = days;
    }
  }
  // Handle 'm' or 'y' if needed

  const endDate = new Date(now);
  // Ensure end date is set to the end of the day for accurate range queries
  endDate.setHours(23, 59, 59, 999);

  const startDate = new Date(now);
  startDate.setDate(now.getDate() - daysToSubtract);
  // Ensure start date is set to the beginning of the day
  startDate.setHours(0, 0, 0, 0);

  // Previous period
  const prevEndDate = new Date(startDate);
  prevEndDate.setDate(startDate.getDate() - 1); // Day before current period starts
  prevEndDate.setHours(23, 59, 59, 999);

  const prevStartDate = new Date(prevEndDate);
  prevStartDate.setDate(prevEndDate.getDate() - daysToSubtract + 1); // Ensure same duration
  prevStartDate.setHours(0, 0, 0, 0);

  return { startDate, endDate, prevStartDate, prevEndDate };
}

function calculateChange(current, previous) {
  const change = current - previous;
  const changePercent = (previous !== 0) ? ((change / previous) * 100) : (current !== 0 ? 100 : 0); // Handle division by zero
  return { change, changePercent: parseFloat(changePercent.toFixed(1)) };
}

/**
 * Contrôleur pour les événements d'analytique
 */
const analyticsController = {
  /**
   * Enregistrer un lot d'événements
   */
  logEvents: async (req, res) => {
    try {
      const { events } = req.body;
      
      if (!events || !Array.isArray(events) || events.length === 0) {
        return res.status(400).json({ message: 'Format d\'événements invalide' });
      }
      
      // Préparer les événements pour l'insertion
      const eventsToInsert = events.map(event => ({
        name: event.name,
        parameters: event.parameters,
        timestamp: new Date(event.timestamp || Date.now()),
        userId: event.parameters?.userId,
        sessionId: event.parameters?.sessionId,
        deviceInfo: event.parameters?.deviceInfo
      }));
      
      // Insérer tous les événements
      await AnalyticsEvent.insertMany(eventsToInsert);
      
      res.status(200).json({ message: `${events.length} événements enregistrés avec succès` });
    } catch (error) {
      console.error('❌ Erreur dans logEvents:', error);
      res.status(500).json({ message: 'Erreur lors de l\'enregistrement des événements', error: error.message });
    }
  },
  
  /**
   * Enregistrer un seul événement
   */
  logEvent: async (req, res) => {
    try {
      const { type, data } = req.body;
      
      if (!type || !data) {
        return res.status(400).json({ message: 'Type et données de l\'événement requis' });
      }
      
      // Créer l'événement
      const event = new AnalyticsEvent({
        name: type,
        parameters: data,
        timestamp: new Date(data.timestamp || Date.now()),
        userId: data.userId,
        sessionId: data.sessionId,
        deviceInfo: data.deviceInfo
      });
      
      // Enregistrer l'événement
      await event.save();
      
      res.status(200).json({ message: 'Événement enregistré avec succès' });
    } catch (error) {
      console.error('❌ Erreur dans logEvent:', error);
      res.status(500).json({ message: 'Erreur lors de l\'enregistrement de l\'événement', error: error.message });
    }
  },
  
  /**
   * Obtenir un rapport d'analytics pour un producteur
   */
  getProducerAnalytics: async (req, res) => {
    try {
      const { producerId } = req.params;
      const { startDate, endDate } = req.query;
      
      // Valider les paramètres
      if (!producerId) {
        return res.status(400).json({ message: 'ID du producteur requis' });
      }
      
      // Préparer les filtres de date
      let dateFilter = {};
      if (startDate) {
        dateFilter.$gte = new Date(startDate);
      }
      if (endDate) {
        dateFilter.$lte = new Date(endDate);
      }
      
      // Requête pour les événements liés au producteur avec filtrage par date
      const query = {
        'parameters.producerId': producerId
      };
      
      if (Object.keys(dateFilter).length > 0) {
        query.timestamp = dateFilter;
      }
      
      // Récupérer tous les événements liés au producteur
      const events = await AnalyticsEvent.find(query)
        .sort({ timestamp: -1 })
        .lean();
      
      // Agréger les données pour le rapport
      const pageViews = events.filter(e => e.name === 'page_view' && e.parameters.page_name === 'producer_profile');
      const userInteractions = events.filter(e => e.name === 'user_interaction');
      const contentInteractions = events.filter(e => e.name === 'content_interaction');
      
      // Calculer les métriques
      const uniqueUsers = new Set(events.map(e => e.userId).filter(Boolean)).size;
      const pageViewsCount = pageViews.length;
      const interactionsCount = userInteractions.length;
      const contentInteractionsCount = contentInteractions.length;
      
      // Générer le rapport
      const report = {
        overview: {
          uniqueUsers,
          totalEvents: events.length,
          pageViews: pageViewsCount,
          interactions: interactionsCount,
          contentInteractions: contentInteractionsCount
        },
        eventsByType: {
          pageViews: pageViewsCount,
          userInteractions: interactionsCount,
          contentInteractions: contentInteractionsCount
        },
        // Données temporelles (compter les événements par jour)
        timeSeries: generateTimeSeries(events, startDate, endDate)
      };
      
      res.status(200).json(report);
    } catch (error) {
      console.error('❌ Erreur dans getProducerAnalytics:', error);
      res.status(500).json({ message: 'Erreur lors de la récupération des analytics du producteur', error: error.message });
    }
  },
  
  /**
   * Obtenir les données de tendance pour la page de growth analytics
   */
  getGrowthAnalyticsOverview: async (req, res) => {
    try {
      const { producerId } = req.params;
      const { period = '30d' } = req.query;
      
      // Valider les paramètres
      if (!producerId) {
        return res.status(400).json({ message: 'ID du producteur requis' });
      }
      
      // Déterminer l'intervalle de temps basé sur la période
      const endDate = new Date();
      const startDate = new Date();
      
      switch (period) {
        case '7d':
          startDate.setDate(startDate.getDate() - 7);
          break;
        case '30d':
          startDate.setDate(startDate.getDate() - 30);
          break;
        case '90d':
          startDate.setDate(startDate.getDate() - 90);
          break;
        case '1y':
          startDate.setFullYear(startDate.getFullYear() - 1);
          break;
        default:
          startDate.setDate(startDate.getDate() - 30);
      }
      
      // Requête pour les événements liés au producteur dans l'intervalle
      const events = await AnalyticsEvent.find({
        'parameters.producerId': producerId,
        timestamp: { $gte: startDate, $lte: endDate }
      }).lean();
      
      // Agréger les données pour le rapport de croissance
      const viewsCount = events.filter(e => e.name === 'page_view' && e.parameters.page_name === 'producer_profile').length;
      const uniqueVisitors = new Set(events.filter(e => e.name === 'page_view' && e.parameters.page_name === 'producer_profile').map(e => e.userId)).size;
      const interactionsCount = events.filter(e => e.name === 'user_interaction').length;
      const contentEngagementCount = events.filter(e => e.name === 'content_interaction').length;
      
      // Calculer les tendances (comparaison avec la période précédente)
      const previousStartDate = new Date(startDate);
      const previousEndDate = new Date(startDate);
      
      switch (period) {
        case '7d':
          previousStartDate.setDate(previousStartDate.getDate() - 7);
          break;
        case '30d':
          previousStartDate.setDate(previousStartDate.getDate() - 30);
          break;
        case '90d':
          previousStartDate.setDate(previousStartDate.getDate() - 90);
          break;
        case '1y':
          previousStartDate.setFullYear(previousStartDate.getFullYear() - 1);
          break;
        default:
          previousStartDate.setDate(previousStartDate.getDate() - 30);
      }
      
      // Requête pour les événements de la période précédente
      const previousEvents = await AnalyticsEvent.find({
        'parameters.producerId': producerId,
        timestamp: { $gte: previousStartDate, $lte: previousEndDate }
      }).lean();
      
      // Calculer les métriques de la période précédente
      const previousViewsCount = previousEvents.filter(e => e.name === 'page_view' && e.parameters.page_name === 'producer_profile').length;
      const previousUniqueVisitors = new Set(previousEvents.filter(e => e.name === 'page_view' && e.parameters.page_name === 'producer_profile').map(e => e.userId)).size;
      const previousInteractionsCount = previousEvents.filter(e => e.name === 'user_interaction').length;
      const previousContentEngagementCount = previousEvents.filter(e => e.name === 'content_interaction').length;
      
      // Calculer les pourcentages de croissance
      const viewsGrowth = calculateGrowthPercentage(previousViewsCount, viewsCount);
      const visitorsGrowth = calculateGrowthPercentage(previousUniqueVisitors, uniqueVisitors);
      const interactionsGrowth = calculateGrowthPercentage(previousInteractionsCount, interactionsCount);
      const engagementGrowth = calculateGrowthPercentage(previousContentEngagementCount, contentEngagementCount);
      
      // Rapport d'aperçu de croissance
      const overview = {
        period,
        metrics: {
          views: {
            current: viewsCount,
            previous: previousViewsCount,
            growth: viewsGrowth
          },
          uniqueVisitors: {
            current: uniqueVisitors,
            previous: previousUniqueVisitors,
            growth: visitorsGrowth
          },
          interactions: {
            current: interactionsCount,
            previous: previousInteractionsCount,
            growth: interactionsGrowth
          },
          contentEngagement: {
            current: contentEngagementCount,
            previous: previousContentEngagementCount,
            growth: engagementGrowth
          }
        },
        timeSeries: generateTimeSeries(events, startDate, endDate)
      };
      
      res.status(200).json(overview);
    } catch (error) {
      console.error('❌ Erreur dans getGrowthAnalyticsOverview:', error);
      res.status(500).json({ message: 'Erreur lors de la récupération des données de croissance', error: error.message });
    }
  },

  /**
   * Obtenir les tendances temporelles des performances
   */
  getGrowthAnalyticsTrends: async (req, res) => {
    try {
      const { producerId } = req.params;
      const { period = '90' } = req.query;
      
      // Valider les paramètres
      if (!producerId) {
        return res.status(400).json({ message: 'ID du producteur requis' });
      }
      
      // Déterminer l'intervalle de temps basé sur la période
      const endDate = new Date();
      const startDate = new Date();
      const periodDays = parseInt(period, 10);
      
      startDate.setDate(startDate.getDate() - periodDays);
      
      // Requête pour les événements liés au producteur dans l'intervalle
      const events = await AnalyticsEvent.find({
        'parameters.producerId': producerId,
        timestamp: { $gte: startDate, $lte: endDate }
      }).lean();
      
      // Déterminer le type d'intervalle selon la période
      const intervalType = periodDays <= 30 ? 'day' : (periodDays <= 90 ? 'week' : 'month');
      
      // Générer les données de série temporelle avec le bon intervalle
      const timeSeries = generateTimeSeriesWithInterval(events, startDate, endDate, intervalType);
      
      // Récupérer les posts les plus engageants
      const postEvents = events.filter(e => e.name === 'content_interaction' && e.parameters.content_type === 'post');
      
      // Agréger par post ID
      const postEngagement = {};
      postEvents.forEach(event => {
        const postId = event.parameters.content_id;
        if (!postId) return;
        
        if (!postEngagement[postId]) {
          postEngagement[postId] = {
            id: postId,
            content: event.parameters.content_snippet || '',
            posted_at: event.timestamp,
            media: event.parameters.media_url || '',
            engagement: {
              likes: 0,
              comments: 0,
              shares: 0
            },
            score: 0
          };
        }
        
        // Incrémenter les compteurs d'engagement
        if (event.parameters.interaction_type === 'like') {
          postEngagement[postId].engagement.likes++;
        } else if (event.parameters.interaction_type === 'comment') {
          postEngagement[postId].engagement.comments++;
        } else if (event.parameters.interaction_type === 'share') {
          postEngagement[postId].engagement.shares++;
        }
        
        // Calculer le score d'engagement (avec pondération)
        postEngagement[postId].score = 
          postEngagement[postId].engagement.likes * 1 + 
          postEngagement[postId].engagement.comments * 3 + 
          postEngagement[postId].engagement.shares * 5;
      });
      
      // Convertir en tableau et trier par score
      const topPosts = Object.values(postEngagement)
        .sort((a, b) => b.score - a.score)
        .slice(0, 5); // Limiter aux 5 meilleurs
      
      // Analyser les heures de pic d'engagement
      const hourlyEngagement = new Array(24).fill(0).map(() => ({ 
        posts: 0, 
        engagement: 0 
      }));
      
      postEvents.forEach(event => {
        const hour = new Date(event.timestamp).getHours();
        hourlyEngagement[hour].engagement++;
        
        // Compter les posts uniques par heure
        if (event.parameters.interaction_type === 'view') {
          hourlyEngagement[hour].posts++;
        }
      });
      
      // Calculer l'engagement moyen et formater les données
      const peakTimes = hourlyEngagement
        .map((item, hour) => ({
          hour,
          posts: item.posts,
          average_engagement: item.posts > 0 ? item.engagement / item.posts : 0
        }))
        .filter(item => item.posts > 0)
        .sort((a, b) => b.average_engagement - a.average_engagement)
        .slice(0, 3); // Top 3 heures
      
      // Analyser la distribution par jour de la semaine
      const daysOfWeek = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
      const weeklyDistribution = daysOfWeek.map(day => ({
        day,
        posts: 0,
        engagement: 0,
        average_engagement: 0
      }));
      
      postEvents.forEach(event => {
        const dayIndex = new Date(event.timestamp).getDay();
        weeklyDistribution[dayIndex].engagement++;
        
        if (event.parameters.interaction_type === 'view') {
          weeklyDistribution[dayIndex].posts++;
        }
      });
      
      // Calculer l'engagement moyen par jour
      weeklyDistribution.forEach(day => {
        day.average_engagement = day.posts > 0 ? day.engagement / day.posts : 0;
      });
      
      // Construire la réponse complète
      const trendsResponse = {
        engagement: timeSeries,
        top_posts: topPosts,
        peak_times: peakTimes,
        weekly_distribution: weeklyDistribution
      };
      
      res.status(200).json(trendsResponse);
    } catch (error) {
      console.error('❌ Erreur dans getGrowthAnalyticsTrends:', error);
      res.status(500).json({ message: 'Erreur lors de la récupération des tendances', error: error.message });
    }
  },

  /**
   * Obtenir les recommandations stratégiques pour le producteur
   */
  getGrowthAnalyticsRecommendations: async (req, res) => {
    try {
      const { producerId } = req.params;
      
      // Valider les paramètres
      if (!producerId) {
        return res.status(400).json({ message: 'ID du producteur requis' });
      }
      
      // Récupérer tous les événements des 90 derniers jours pour analyse
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 90);
      
      const events = await AnalyticsEvent.find({
        'parameters.producerId': producerId,
        timestamp: { $gte: startDate, $lte: endDate }
      }).lean();
      
      // Analyse de base pour générer des recommandations
      const postEvents = events.filter(e => e.name === 'content_interaction');
      const viewEvents = events.filter(e => e.name === 'page_view');
      const interactionEvents = events.filter(e => e.name === 'user_interaction');
      
      // Calculer des métriques clés pour les recommandations
      
      // 1. Fréquence de publication
      const postDates = [...new Set(postEvents
        .filter(e => e.parameters.interaction_type === 'create')
        .map(e => new Date(e.timestamp).toISOString().split('T')[0]))];
      
      const publishFrequency = postDates.length / (90 / 7); // Posts par semaine
      
      // 2. Types de contenu et leur engagement
      const contentTypes = {};
      postEvents.forEach(event => {
        const mediaType = event.parameters.media_type || 'text';
        if (!contentTypes[mediaType]) {
          contentTypes[mediaType] = {
            count: 0,
            engagement: 0
          };
        }
        contentTypes[mediaType].count++;
        
        if (['like', 'comment', 'share'].includes(event.parameters.interaction_type)) {
          contentTypes[mediaType].engagement++;
        }
      });
      
      // Calculer l'engagement moyen par type de contenu
      Object.keys(contentTypes).forEach(type => {
        contentTypes[type].average_engagement = 
          contentTypes[type].count > 0 ? 
          contentTypes[type].engagement / contentTypes[type].count : 0;
      });
      
      // 3. Temps de réponse aux commentaires
      const comments = postEvents.filter(e => e.parameters.interaction_type === 'comment');
      const replies = postEvents.filter(e => e.parameters.interaction_type === 'reply');
      
      // Générer des recommandations basées sur l'analyse
      const recommendations = {
        content_strategy: [
          {
            title: publishFrequency < 1 ? 
              "Augmentez votre fréquence de publication" : 
              "Maintenez votre rythme de publication régulier",
            description: publishFrequency < 1 ? 
              "Vous publiez en moyenne moins d'une fois par semaine. Augmenter la fréquence peut améliorer votre visibilité." :
              "Votre fréquence de publication actuelle est bonne. Continuez à publier régulièrement.",
            action: publishFrequency < 1 ? 
              "Planifiez au moins une publication par semaine" : 
              "Continuez à publier selon votre calendrier actuel"
          },
          {
            title: "Diversifiez vos formats de contenu",
            description: contentTypes.video ? 
              "Les vidéos génèrent en moyenne plus d'engagement que les autres types de contenu." :
              "Essayez d'ajouter des vidéos à votre stratégie de contenu pour augmenter l'engagement.",
            action: "Intégrez davantage de contenu vidéo à votre stratégie"
          }
        ],
        engagement_tactics: [
          {
            title: "Interagissez avec vos commentaires",
            description: replies.length < comments.length / 2 ?
              "Vous répondez à moins de la moitié des commentaires. Augmenter ce taux peut améliorer l'engagement." :
              "Vous répondez bien aux commentaires. Continuez cette pratique.",
            action: replies.length < comments.length / 2 ?
              "Répondez à plus de commentaires pour stimuler les conversations" :
              "Maintenez votre niveau actuel d'interaction avec les commentaires"
          },
          {
            title: "Publiez aux moments optimaux",
            description: "Analysez vos statistiques pour identifier les meilleurs moments pour publier.",
            action: "Planifiez vos publications pendant les heures de pointe d'activité de votre audience"
          }
        ],
        growth_opportunities: [
          {
            title: "Collaborations et partenariats",
            description: "Les collaborations avec d'autres établissements peuvent élargir votre audience.",
            action: "Identifiez des partenaires potentiels complémentaires à votre activité"
          },
          {
            title: "Programme de fidélité",
            description: "Récompenser vos clients fidèles peut encourager les visites récurrentes.",
            action: "Mettez en place un programme de fidélité via l'application"
          }
        ]
      };
      
      res.status(200).json(recommendations);
    } catch (error) {
      console.error('❌ Erreur dans getGrowthAnalyticsRecommendations:', error);
      res.status(500).json({ message: 'Erreur lors de la récupération des recommandations', error: error.message });
    }
  },

  /**
   * Enregistrer un événement analytique
   */
  trackEvent: async (req, res) => {
    try {
      const { event_type, user_id, properties } = req.body;
      
      if (!event_type) {
        return res.status(400).json({ message: 'Le type d\'événement est requis' });
      }
      
      // Créer un nouvel événement analytique
      const analyticsEvent = new AnalyticsEvent({
        event_type,
        user_id,
        properties,
        timestamp: new Date()
      });
      
      // Sauvegarder l'événement
      await analyticsEvent.save();
      
      res.status(201).json({ message: 'Événement enregistré avec succès', id: analyticsEvent._id });
    } catch (error) {
      console.error('❌ Erreur lors de l\'enregistrement de l\'événement analytique:', error);
      res.status(500).json({ message: 'Erreur lors de l\'enregistrement de l\'événement', error: error.message });
    }
  },

  // GET /api/analytics/:producerType/:producerId/kpis
  getKpis: async (req, res) => {
    try {
      const { producerType, producerId } = req.params;
      
      // Validate producerType if necessary
      const validTypes = ['restaurant', 'leisureProducer', 'wellnessProducer', 'beautyPlace'];
      if (!validTypes.includes(producerType)) {
        return res.status(400).json({ message: 'Invalid producer type' });
      }

      // Pass necessary DB connections to the service
      const connections = {
        choiceAppDb: getDbConnections.choiceAppDb,
        restaurationDb: getDbConnections.restaurationDb,
        loisirsDb: getDbConnections.loisirsDb,
        beautyWellnessDb: getDbConnections.beautyWellnessDb
      }
      
      const kpis = await analyticsService.fetchKpisForProducer(producerId, producerType, connections);
      res.json(kpis);
    } catch (error) {
      console.error('Error fetching KPIs:', error);
      res.status(500).json({ message: 'Error fetching KPIs', error: error.message });
    }
  },

  // GET /api/analytics/:producerType/:producerId/trends
  getTrends: async (req, res) => {
    try {
      const { producerType, producerId } = req.params;
      const { period = req.query.period || 'Semaine', metrics = 'followers,profileViews,choices' } = req.query; // Default to Week
      
      const validTypes = ['restaurant', 'leisureProducer', 'wellnessProducer', 'beautyPlace'];
      if (!validTypes.includes(producerType)) {
        return res.status(400).json({ message: 'Invalid producer type' });
      }

      const connections = {
        choiceAppDb: getDbConnections.choiceAppDb,
        restaurationDb: getDbConnections.restaurationDb,
        loisirsDb: getDbConnections.loisirsDb,
        beautyWellnessDb: getDbConnections.beautyWellnessDb
      }

      const trends = await analyticsService.fetchTrendsForProducer(producerId, producerType, period, connections);
      res.json(trends);
    } catch (error) {
      console.error('Error fetching trends:', error);
      res.status(500).json({ message: 'Error fetching trends', error: error.message });
    }
  },

  // GET /api/analytics/:producerType/:producerId/competitors
  getCompetitors: async (req, res) => {
    try {
      const { producerType, producerId } = req.params;
      
      const validTypes = ['restaurant', 'leisureProducer', 'wellnessProducer', 'beautyPlace'];
      if (!validTypes.includes(producerType)) {
        return res.status(400).json({ message: 'Invalid producer type' });
      }

      const connections = {
        choiceAppDb: getDbConnections.choiceAppDb,
        restaurationDb: getDbConnections.restaurationDb,
        loisirsDb: getDbConnections.loisirsDb,
        beautyWellnessDb: getDbConnections.beautyWellnessDb
      }

      const competitors = await analyticsService.fetchCompetitorsForProducer(producerId, producerType, connections);
      res.json(competitors);
    } catch (error) {
      console.error('Error fetching competitors:', error);
      res.status(500).json({ message: 'Error fetching competitors', error: error.message });
    }
  },

  // Controller Functions

  logGenericEvent: async (req, res) => {
    // Implementation for logging generic events (if kept from original file)
    console.log("Logging generic event:", req.body);
    // Add saving logic using a generic event model if needed
    res.status(200).json({ message: "Event logged (placeholder)" });
  },

  getOverview: async (req, res) => {
    const { producerId } = req.params;
    const { period = '30d', producerType } = req.query; // Read producerType from query

    // Ensure models are initialized
    if (!Follow || !ProfileView || !Post || !Rating || !User) {
      initializeModels(); // Attempt re-initialization
      if (!Follow || !ProfileView || !Post || !Rating || !User) {
          return res.status(500).json({ error: 'Analytics models not initialized' });
      }
    }

    // --- Validate producerType --- 
    if (!producerType) {
        return res.status(400).json({ error: 'Missing required query parameter: producerType' });
    }

    try {
      const { startDate, endDate, prevStartDate, prevEndDate } = getPeriodDates(period);
      const producerObjectId = new mongoose.Types.ObjectId(producerId);

      // --- Fetch Producer Model based on type --- 
      let producerModel;
      try {
        // Use the producerType from the query parameter
        producerModel = getProducerModel(producerType);
        if (!producerModel) throw new Error(`Producer model type '${producerType}' not found/initialized.`);
      } catch (err) {
        console.error(`Error getting producer model for overview (${producerId}, type ${producerType}):`, err);
        return res.status(500).json({ error: 'Could not determine producer model', details: err.message });
      } 

      // --- Fetch Data Concurrently ---
      const [
        // Current Period Data
        profileViewsCount,
        postsInPeriod, 
        avgRatingData,
        choicesData, // Added for choices

        // Previous Period Data
        prevProfileViewsCount,
        prevAvgRatingData,
        prevChoicesData, // Added for choices
        
        // Follower counts for specific dates
        followersAtStartOfCurrentPeriod,
        currentTotalFollowers

      ] = await Promise.all([
        // Current
        ProfileView.countDocuments({ producerId: producerObjectId, timestamp: { $gte: startDate, $lte: endDate } }),
        Post.find({ producer_id: producerObjectId, posted_at: { $gte: startDate, $lte: endDate } }).select('_id'), // Use producer_id and posted_at
        Rating.aggregate([ 
          { $match: { producerId: producerObjectId, createdAt: { $gte: startDate, $lte: endDate } } },
          { $group: { _id: null, avgRating: { $avg: '$rating' }, count: { $sum: 1 } } }
        ]).catch(err => { console.warn('Rating aggregation failed (current):', err); return []; }), // Gracefully handle Rating model errors
        producerModel.aggregate([ // Aggregate choices from the producer model
            { $match: { _id: producerObjectId } },
            { $project: { 
                choiceUsersInPeriod: { 
                    $filter: { 
                        input: "$choiceUsers", 
                        as: "choice", 
                        cond: { $and: [ { $gte: [ "$$choice.createdAt", startDate ] }, { $lte: [ "$$choice.createdAt", endDate ] } ] }
                    }
                }
            } },
            { $project: { count: { $size: "$choiceUsersInPeriod" } } }
        ]).catch(err => { console.warn('Choices aggregation failed (current):', err); return [{ count: 0 }]; }), // Default to 0 on error

        // Previous
        ProfileView.countDocuments({ producerId: producerObjectId, timestamp: { $gte: prevStartDate, $lte: prevEndDate } }),
        Rating.aggregate([ 
          { $match: { producerId: producerObjectId, createdAt: { $gte: prevStartDate, $lte: prevEndDate } } },
          { $group: { _id: null, avgRating: { $avg: '$rating' }, count: { $sum: 1 } } }
        ]).catch(err => { console.warn('Rating aggregation failed (previous):', err); return []; }), // Gracefully handle Rating model errors
         producerModel.aggregate([ // Aggregate choices from the producer model for previous period
            { $match: { _id: producerObjectId } },
            { $project: { 
                choiceUsersInPrevPeriod: { 
                    $filter: { 
                        input: "$choiceUsers", 
                        as: "choice", 
                        cond: { $and: [ { $gte: [ "$$choice.createdAt", prevStartDate ] }, { $lte: [ "$$choice.createdAt", prevEndDate ] } ] }
                    }
                }
            } },
            { $project: { count: { $size: "$choiceUsersInPrevPeriod" } } }
        ]).catch(err => { console.warn('Choices aggregation failed (previous):', err); return [{ count: 0 }]; }), // Default to 0 on error
        
        // Follower counts
        Follow.countDocuments({ producerId: producerObjectId, createdAt: { $lte: prevEndDate } }), // Followers at END of previous period
        Follow.countDocuments({ producerId: producerObjectId, createdAt: { $lte: endDate } }) // Total followers at END of current period
      ]);

       // --- Calculate Follower Change ---
       const followersChange = calculateChange(currentTotalFollowers, followersAtStartOfCurrentPeriod);

      // --- Calculate Engagement (Likes/Comments on posts created in the period) ---
      const postIdsInPeriod = postsInPeriod.map(p => p._id);
      // Assuming likes/comments are stored in separate collections or embedded in Post
      // Placeholder implementation - replace with actual fetching logic
      // Example: Use Post model if likes/comments are embedded or separate Like/Comment models
      const likesInPeriod = await Post.aggregate([
          { $match: { _id: { $in: postIdsInPeriod } } },
          { $project: { likeCount: { $size: "$likes" } } }, // Assuming likes is an array of userIds
          { $group: { _id: null, totalLikes: { $sum: "$likeCount" } } }
      ]).then(res => res[0]?.totalLikes || 0).catch(err => { console.warn('Like aggregation failed:', err); return 0; });
      
      const commentsInPeriod = await Post.aggregate([
          { $match: { _id: { $in: postIdsInPeriod } } },
          { $project: { commentCount: { $size: "$comments" } } }, // Assuming comments is an array of comment objects/ids
          { $group: { _id: null, totalComments: { $sum: "$commentCount" } } }
      ]).then(res => res[0]?.totalComments || 0).catch(err => { console.warn('Comment aggregation failed:', err); return 0; });

       // Engagement Rate: (Likes + Comments on posts in period) / Posts in period / Followers at START of period
       const engagementRateValue = (postsInPeriod.length > 0 && followersAtStartOfCurrentPeriod > 0) 
            ? parseFloat((((likesInPeriod + commentsInPeriod) / postsInPeriod.length / followersAtStartOfCurrentPeriod) * 100).toFixed(1))
            : 0;
       // TODO: Calculate previous period engagement rate for comparison (needs prev posts, likes, comments, followers at start of prev period)
       const engagementRateChange = { change: 0, changePercent: 0 }; // Placeholder

      // --- Process Results & Calculate Changes ---
      const profileViewsChange = calculateChange(profileViewsCount, prevProfileViewsCount);
      
      const currentAvgRating = avgRatingData.length > 0 ? avgRatingData[0].avgRating : 0;
      const prevAvgRating = prevAvgRatingData.length > 0 ? prevAvgRatingData[0].avgRating : 0;
      const avgRatingChange = calculateChange(currentAvgRating, prevAvgRating);
      
      const currentChoicesCount = choicesData.length > 0 ? choicesData[0].count : 0;
      const prevChoicesCount = prevChoicesData.length > 0 ? prevChoicesData[0].count : 0;
      const choicesChange = calculateChange(currentChoicesCount, prevChoicesCount);

      // --- Format Response ---
      const responseData = {
          period: period,
          kpis: {
              followers: { current: currentTotalFollowers, ...followersChange },
              profileViews: { current: profileViewsCount, ...profileViewsChange },
              engagementRate: { current: engagementRateValue, ...engagementRateChange }, // Placeholder change
              choices: { current: currentChoicesCount, ...choicesChange, label: 'Choices' }, // Added Choices KPI
              avgRating: { current: parseFloat(currentAvgRating.toFixed(1)), ...avgRatingChange, label: 'Note Moyenne' },
              // conversions: { current: 0, change: 0, changePercent: 0, label: 'Réservations' }, // Example Placeholder
          },
          engagementSummary: {
              posts: postsInPeriod.length,
              likes: likesInPeriod,
              comments: commentsInPeriod,
          }
      };

      res.status(200).json(responseData);

    } catch (error) {
       // Handle potential CastError if producerId is invalid
       if (error.name === 'CastError') {
           return res.status(400).json({ error: 'Invalid producerId format' });
       }
      console.error(`Error in getOverview for producer ${producerId}:`, error);
      res.status(500).json({ error: 'Failed to fetch overview analytics', details: error.message });
    }
  },

  getTrends: async (req, res) => {
    const { producerId } = req.params;
    const { period = '30d', metrics = 'followers,profileViews,choices', producerType } = req.query; // Read producerType
    const metricsList = metrics.split(',');

    // Ensure models are initialized
    if (!Follow || !ProfileView || !Post || !Rating || !User) {
       initializeModels(); // Attempt re-initialization
       if (!Follow || !ProfileView || !Post || !Rating || !User) {
           return res.status(500).json({ error: 'Analytics models not initialized' });
       }
    }
    
    // --- Validate producerType --- 
    if (!producerType && metricsList.includes('choices')) { // Only required if choices metric is requested
        return res.status(400).json({ error: 'Missing required query parameter: producerType (needed for choices metric)' });
    }

    try {
      const { startDate, endDate } = getPeriodDates(period);
      const producerObjectId = new mongoose.Types.ObjectId(producerId);

      // --- Fetch Producer Model (only if needed for choices) ---
      let producerModel;
      if (metricsList.includes('choices')) {
          try {
            producerModel = getProducerModel(producerType);
            if (!producerModel) throw new Error(`Producer model type '${producerType}' not found/initialized.`);
          } catch (err) {
            console.error(`Error getting producer model for trends (${producerId}, type ${producerType}):`, err);
            return res.status(500).json({ error: 'Could not determine producer model for choices', details: err.message });
          } 
      }

      // Determine interval based on period length
      const durationDays = (endDate.getTime() - startDate.getTime()) / (1000 * 3600 * 24);
      let interval = 'day';
      let dateFormat = '%Y-%m-%d';
      let dateTrunc = 'day';
      if (durationDays > 90) {
        interval = 'month';
        dateFormat = '%Y-%m';
        dateTrunc = 'month';
      } else if (durationDays > 30) {
        interval = 'week';
        dateFormat = '%G-%V'; // ISO week date
        dateTrunc = 'week';
      }

      const trendsData = {};

      // Fetch data for each requested metric
      for (const metric of metricsList) {
        let aggregationPipeline = [];
        let modelToUse = null;
        let dateField = 'timestamp';

        switch (metric) {
          case 'followers':
             modelToUse = Follow;
             dateField = 'createdAt';
             aggregationPipeline = [
               { $match: { producerId: producerObjectId, [dateField]: { $gte: startDate, $lte: endDate } } },
               { $group: {
                 _id: { $dateToString: { format: dateFormat, date: `$${dateField}` } }, // Group by formatted date string
                 value: { $sum: 1 } // Count documents per interval
               }},
               { $sort: { _id: 1 } }, // Sort by date string
               { $project: { _id: 0, date: '$_id', value: '$value' } }
             ];
             break;
          case 'profileViews':
             modelToUse = ProfileView;
             dateField = 'timestamp';
             aggregationPipeline = [
               { $match: { producerId: producerObjectId, [dateField]: { $gte: startDate, $lte: endDate } } },
               { $group: {
                 _id: { $dateToString: { format: dateFormat, date: `$${dateField}` } },
                 value: { $sum: 1 }
               }},
               { $sort: { _id: 1 } },
               { $project: { _id: 0, date: '$_id', value: '$value' } }
             ];
             break;
           case 'choices':
             if (!producerModel) { // Should have been caught earlier, but double-check
                console.warn(`Skipping choices trend for ${producerId} as producerModel is not available.`);
                trendsData[metric] = [];
                continue; // Skip to next metric
             }
             modelToUse = producerModel; // Use the specific producer model
             dateField = 'createdAt'; // Date field within choiceUsers array
             aggregationPipeline = [
               { $match: { _id: producerObjectId } },
               { $unwind: "$choiceUsers" }, 
               { $match: { [`choiceUsers.${dateField}`]: { $gte: startDate, $lte: endDate } } }, 
               { $group: {
                 _id: { $dateToString: { format: dateFormat, date: `$choiceUsers.${dateField}` } }, 
                 value: { $sum: 1 } 
               }},
               { $sort: { _id: 1 } },
               { $project: { _id: 0, date: '$_id', value: '$value' } }
             ];
             break;
          case 'engagementRate':
              modelToUse = Post;
              dateField = 'posted_at'; 
              aggregationPipeline = [
                  { $match: { producer_id: producerObjectId, [dateField]: { $gte: startDate, $lte: endDate } } },
                  { $project: { 
                      _id: 1, 
                      dateStr: { $dateToString: { format: dateFormat, date: `$${dateField}` } },
                      likes: { $size: { $ifNull: ["$likes", []] } }, // Count likes
                      comments: { $size: { $ifNull: ["$comments", []] } } // Count comments
                  } },
                  { $group: {
                      _id: "$dateStr",
                      value: { $sum: { $add: ["$likes", "$comments"] } } // Sum likes and comments per interval
                  } },
                  { $sort: { _id: 1 } },
                  { $project: { _id: 0, date: "$_id", value: "$value" } }
              ];
              break;
          default:
            console.warn(`Trend metric '${metric}' not implemented.`);
            trendsData[metric] = [];
        }

        // Execute aggregation
        if (modelToUse && aggregationPipeline.length > 0) {
          try {
              trendsData[metric] = await modelToUse.aggregate(aggregationPipeline);
          } catch (aggError) {
              console.error(`Aggregation failed for metric '${metric}':`, aggError);
              trendsData[metric] = [];
          }
        } else if (!trendsData[metric]) {
             trendsData[metric] = [];
        }
      }

      res.status(200).json({
        period: period,
        interval: interval,
        trends: trendsData
      });

    } catch (error) {
       if (error.name === 'CastError') {
           return res.status(400).json({ error: 'Invalid producerId format' });
       }
      console.error(`Error in getTrends for producer ${producerId}:`, error);
      res.status(500).json({ error: 'Failed to fetch trend analytics', details: error.message });
    }
  },

   getRecommendations: async (req, res) => {
     const { producerId } = req.params;
      // Ensure models are initialized if needed by recommendation logic
      if (!Follow || !Post) {
           initializeModels();
           if (!Follow || !Post) {
               console.warn('Models not initialized for recommendations');
               // Proceed with limited recommendations or return error
           }
       }
     try {
       // --- Fetch relevant producer data (using initialized models) ---
       // Example: const posts = await Post.find({ producer_id: producerId }).sort({ posted_at: -1 }).limit(10);
       // Example: const followerCount = await Follow.countDocuments({ producerId: producerId });
       
       // --- Generate Recommendations based on rules/logic ---
       let recommendations = [];

       // Placeholder Recommendations (Keep these as fallback)
       if (recommendations.length === 0) {
         recommendations.push({ id: 'rec_placeholder_1', title: 'Interagissez avec vos abonnés', description: 'Répondez aux commentaires et messages pour renforcer les liens.', priority: 'medium', action: { type: 'navigate_to_messaging' } });
         recommendations.push({ id: 'rec_placeholder_2', title: 'Explorez les campagnes', description: 'Augmentez votre visibilité grâce aux campagnes marketing.', priority: 'low', action: { type: 'create_campaign' } });
         // Add a recommendation related to viewing analytics
         recommendations.push({ id: 'rec_placeholder_3', title: 'Analysez vos performances', description: 'Consultez régulièrement vos tendances pour ajuster votre stratégie.', priority: 'low', action: { type: 'view_analytics' } }); 
       }

       res.status(200).json({ recommendations });
     } catch (error) {
       console.error(`Error in getRecommendations for producer ${producerId}:`, error);
       res.status(500).json({ error: 'Failed to fetch recommendations', details: error.message });
     }
   },
 
   // --- Premium Controllers --- 
 
   getDemographics: async (req, res) => {
     const { producerId } = req.params;
     const { period = '30d' } = req.query;
      // Ensure models are initialized if needed
      if (!Follow || !User) {
           initializeModels();
           if (!Follow || !User) { return res.status(500).json({ error: 'Models not initialized for demographics' }); }
       }
     try {
       console.log(`Fetching demographics for ${producerId} (Premium)`);

       // TODO: Implement actual aggregation using Follow and User models
       const ageDistribution = { "18-24": 35.0, "25-34": 45.0, "35-44": 15.0, "45+": 5.0 }; // Simulated
       const genderDistribution = { "Homme": 40.0, "Femme": 55.0, "Autre": 5.0 }; // Simulated
       const topLocations = [ { "city": "Paris", "percentage": 70.0 }, { "city": "Lyon", "percentage": 10.0 }, { "city": "Lille", "percentage": 8.0 } ]; // Simulated

       res.status(200).json({ ageDistribution, genderDistribution, topLocations });
     } catch (error) {
       console.error(`Error in getDemographics for producer ${producerId}:`, error);
       res.status(500).json({ error: 'Failed to fetch demographics', details: error.message });
     }
   },
 
   getPredictions: async (req, res) => {
     const { producerId } = req.params;
     const { horizon = '30d' } = req.query;
       // Ensure models are initialized if needed
       if (!Follow || !ProfileView) {
           initializeModels();
            if (!Follow || !ProfileView) { return res.status(500).json({ error: 'Models not initialized for predictions' }); }
       }
     try {
       console.log(`Fetching predictions for producer ${producerId} with horizon ${horizon}`);

       // TODO: Implement better prediction logic (e.g., based on recent trends)
       const currentFollowers = await Follow.countDocuments({ producerId: producerId });
       const currentViews = await ProfileView.countDocuments({ producerId: producerId, timestamp: { $gte: new Date(Date.now() - 30*24*60*60*1000) } }); // Views in last 30d

       const predictedFollowersData = { value: Math.round(currentFollowers * 1.05 + 10), confidence: 'medium' }; // Simulated: +5% + 10
       const predictedViewsData = { value: Math.round(currentViews * 1.1 + 20), confidence: 'low' }; // Simulated: +10% + 20
       const predictedConversionsData = { value: Math.round(currentFollowers * 0.02 + 5), confidence: 'low' }; // Simulated conversion based on followers

       res.status(200).json({
         predictions: { // Match frontend model structure
           predictedFollowers: predictedFollowersData,
           predictedViews: predictedViewsData,
           predictedConversions: predictedConversionsData
         }
       });
     } catch (error) {
       console.error(`Error in getPredictions for producer ${producerId}:`, error);
       res.status(500).json({ error: 'Failed to fetch predictions', details: error.message });
     }
   },
  
    getCompetitorAnalysis: async (req, res) => {
    const { producerId } = req.params;
    const { period = '30d' } = req.query;
    // Ensure models are initialized if needed
    // Requires logic to find competitors and their metrics
    try {
      console.log(`Fetching competitor analysis for producer ${producerId} (Premium)`);

      // TODO: Implement competitor identification & metric fetching logic
      // Placeholder data:
      const yourMetrics = { followers: 150, engagementRate: 3.8 }; // Simulated
      const averageCompetitorMetrics = { followers: 220, engagementRate: 4.1 }; // Simulated
      const topCompetitors = [ // Simulated
        { id: "comp1", name: "Le Concurrent Chic", followers: 280, engagementRate: 4.5 },
        { id: "comp2", name: "Voisin Populaire", followers: 190, engagementRate: 3.9 },
        { id: "comp3", name: "L'Autre Endroit", followers: 150, engagementRate: 4.0 },
      ];

      res.status(200).json({
        yourMetrics,
        averageCompetitorMetrics,
        topCompetitors
      });
    } catch (error) { 
      console.error(`Error in getCompetitorAnalysis for producer ${producerId}:`, error);
      res.status(500).json({ error: 'Failed to fetch competitor analysis', details: error.message });
    }
  }
};

// --- Utility Functions ---
function getPeriodDates(period) {
  const now = new Date();
  let daysToSubtract = 30; // Default
  if (period && period.endsWith('d')) {
    const days = parseInt(period.slice(0, -1), 10);
    if (!isNaN(days)) {
      daysToSubtract = days;
    }
  }
  const endDate = new Date(now);
  endDate.setHours(23, 59, 59, 999);
  const startDate = new Date(now);
  startDate.setDate(now.getDate() - daysToSubtract);
  startDate.setHours(0, 0, 0, 0);
  const prevEndDate = new Date(startDate);
  prevEndDate.setDate(startDate.getDate() - 1);
  prevEndDate.setHours(23, 59, 59, 999);
  const prevStartDate = new Date(prevEndDate);
  prevStartDate.setDate(prevEndDate.getDate() - daysToSubtract + 1);
  prevStartDate.setHours(0, 0, 0, 0);
  return { startDate, endDate, prevStartDate, prevEndDate };
}

function calculateChange(current, previous) {
  const change = current - previous;
  const changePercent = (previous !== 0) ? ((change / previous) * 100) : (current !== 0 ? 100 : 0);
  return { change, changePercent: parseFloat(changePercent.toFixed(1)) };
}

// These might be defined elsewhere if used by other controllers
function generateTimeSeries(events, startDate, endDate) {
  // ... placeholder implementation ...
  return [];
}
function generateTimeSeriesWithInterval(events, startDate, endDate, intervalType) {
  // ... placeholder implementation ...
 return [];
}
function calculateGrowthPercentage(previous, current) {
 // ... placeholder implementation ...
 return 0;
}

module.exports = analyticsController;
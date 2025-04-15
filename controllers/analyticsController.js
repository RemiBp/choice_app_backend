const mongoose = require('mongoose');
const { createModel, databases, getProducerModel } = require('../utils/modelCreator');
const analyticsService = require('../services/analyticsService');
const Post = require('../models/Post'); // Assuming Post model in choice_app db
const User = require('../models/User'); // Make sure User model is required
const Follow = require('../models/Follow'); // Use the new Follow model
// const ProfileView = require('../models/ProfileView'); // *** Model file doesn't exist yet, commented out ***
// const Rating = require('../models/Rating'); // *** Model file doesn't exist yet, commented out ***
const Subscription = require('../models/Subscription'); // Use the Subscription model

// Placeholder for getting DB connections (replace with actual mechanism, e.g., from req or global)
const getDbConnections = require('../index'); // Assuming connections are exported from index.js

// Initialiser les modèles directement avec notre utilitaire
const AnalyticsEvent = createModel(
  databases.CHOICE_APP,
  'AnalyticsEvent',
  'analytics_events'
);

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
      const period = req.query.period || 'Semaine'; // Default to Week
      
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

  // Helper function to parse period string (e.g., '30d', '7d') into dates
  getPeriodDates: (period) => {
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
  },

  // Helper to calculate change percentage
  calculateChange: (current, previous) => {
    const change = current - previous;
    const changePercent = (previous !== 0) ? ((change / previous) * 100) : (current !== 0 ? 100 : 0); // Handle division by zero
    return { change, changePercent: parseFloat(changePercent.toFixed(1)) };
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
    const { period = '30d' } = req.query; // Default to 30 days

    try {
      // --- Date Ranges ---
      const { startDate, endDate, prevStartDate, prevEndDate } = getPeriodDates(period);

      // --- Fetch Data Concurrently ---
      const [
        // Current Period Data
        followersCount,
        profileViewsCount,
        // engagementData, // Fetch posts, likes, comments separately or aggregate
        postsInPeriod,
        avgRatingData,
        // Type-specific conversions (Example: Bookings)
        // conversionsCount,

        // Previous Period Data
        prevFollowersCount,
        prevProfileViewsCount,
        // prevEngagementData,
        prevAvgRatingData,
        // prevConversionsCount

      ] = await Promise.all([
        // Current
        Follow.countDocuments({ producerId: producerId, createdAt: { $lte: endDate } }), // Total followers *by end date*
        ProfileView.countDocuments({ producerId: producerId, timestamp: { $gte: startDate, $lte: endDate } }),
        Post.find({ authorId: producerId, createdAt: { $gte: startDate, $lte: endDate } }).select('_id'), // Get IDs for like/comment counts
        Rating.aggregate([ // Assuming Rating model has producerId and rating fields
          { $match: { producerId: new mongoose.Types.ObjectId(producerId), createdAt: { $gte: startDate, $lte: endDate } } },
          { $group: { _id: null, avgRating: { $avg: '$rating' }, count: { $sum: 1 } } }
        ]),
        // Example: Booking.countDocuments({ producerId: producerId, bookingDate: { $gte: startDate, $lte: endDate } }),

        // Previous
         Follow.countDocuments({ producerId: producerId, createdAt: { $gte: prevStartDate, $lte: prevEndDate } }), // Followers gained *in previous period*
       // Follow.countDocuments({ producerId: producerId, createdAt: { $lte: prevEndDate } }), // Total followers *by end of previous period*
        ProfileView.countDocuments({ producerId: producerId, timestamp: { $gte: prevStartDate, $lte: prevEndDate } }),
        Rating.aggregate([
          { $match: { producerId: new mongoose.Types.ObjectId(producerId), createdAt: { $gte: prevStartDate, $lte: prevEndDate } } },
          { $group: { _id: null, avgRating: { $avg: '$rating' }, count: { $sum: 1 } } }
        ]),
        // Example: Booking.countDocuments({ producerId: producerId, bookingDate: { $gte: prevStartDate, $lte: prevEndDate } }),
      ]);

       // --- Calculate Follower Change more accurately ---
       // Followers at the START of the current period = followers at the END of the previous period
       const followersAtStartOfCurrentPeriod = await Follow.countDocuments({ producerId: producerId, createdAt: { $lte: prevEndDate } });
       const currentTotalFollowers = await Follow.countDocuments({ producerId: producerId, createdAt: { $lte: endDate } }); // Total now
       const followersChange = calculateChange(currentTotalFollowers, followersAtStartOfCurrentPeriod);


      // --- Calculate Engagement (Likes/Comments on posts created in the period) ---
      const postIdsInPeriod = postsInPeriod.map(p => p._id);
      const likesInPeriod = await mongoose.connection.db.collection('likes').countDocuments({ postId: { $in: postIdsInPeriod } }); // Assuming 'likes' collection
      const commentsInPeriod = await mongoose.connection.db.collection('comments').countDocuments({ postId: { $in: postIdsInPeriod } }); // Assuming 'comments' collection

      const engagementRate = (likesInPeriod + commentsInPeriod) > 0 && followersAtStartOfCurrentPeriod > 0
           ? parseFloat((((likesInPeriod + commentsInPeriod) / postsInPeriod.length / followersAtStartOfCurrentPeriod) * 100).toFixed(1))
           : 0;
        // TODO: Calculate previous period engagement rate for comparison


      // --- Process Results & Calculate Changes ---
      const profileViewsChange = calculateChange(profileViewsCount, prevProfileViewsCount);
      const currentAvgRating = avgRatingData.length > 0 ? avgRatingData[0].avgRating : 0;
      const prevAvgRating = prevAvgRatingData.length > 0 ? prevAvgRatingData[0].avgRating : 0;
      const avgRatingChange = calculateChange(currentAvgRating, prevAvgRating);
      // const conversionsChange = calculateChange(conversionsCount, prevConversionsCount);

      // --- Format Response ---
      const responseData = {
          period: period,
          kpis: {
              followers: { current: currentTotalFollowers, ...followersChange },
              profileViews: { current: profileViewsCount, ...profileViewsChange },
              engagementRate: { current: engagementRate, change: 0, changePercent: 0 }, // TODO: Add change calc
              // conversions: { current: conversionsCount, ...conversionsChange, label: 'Réservations' }, // Example
              avgRating: { current: parseFloat(currentAvgRating.toFixed(1)), ...avgRatingChange },
              // Add other KPIs like reach if calculated
          },
          engagementSummary: {
              posts: postsInPeriod.length,
              likes: likesInPeriod,
              comments: commentsInPeriod,
          }
      };

      res.status(200).json(responseData);

    } catch (error) {
      console.error(`Error in getOverview for producer ${producerId}:`, error);
      res.status(500).json({ error: 'Failed to fetch overview analytics', details: error.message });
    }
  },

  getTrends: async (req, res) => {
    const { producerId } = req.params;
    const { period = '30d', metrics = 'followers,profileViews' } = req.query;
    const metricsList = metrics.split(',');

    try {
      const { startDate, endDate } = getPeriodDates(period);

      // Determine interval based on period length
      const durationDays = (endDate.getTime() - startDate.getTime()) / (1000 * 3600 * 24);
      let interval = 'day';
      let dateFormat = '%Y-%m-%d';
      if (durationDays > 90) {
        interval = 'month';
        dateFormat = '%Y-%m';
      } else if (durationDays > 30) {
        interval = 'week';
        dateFormat = '%G-%V'; // ISO week date
      }

      const trendsData = {};

      // Fetch data for each requested metric using aggregation
      for (const metric of metricsList) {
        let aggregationPipeline = [];
        let dateField = 'timestamp'; // Default date field

        // Define pipeline based on metric
        switch (metric) {
          case 'followers':
            // Requires tracking follower gains over time (more complex than simple count)
            // Placeholder: Count new follows per interval
            aggregationPipeline = [
              { $match: { producerId: new mongoose.Types.ObjectId(producerId), createdAt: { $gte: startDate, $lte: endDate } } },
              { $group: {
                _id: { $dateToString: { format: dateFormat, date: "$createdAt" } },
                value: { $sum: 1 }
              }},
              { $sort: { _id: 1 } }, // Sort by date string
              { $project: { _id: 0, date: '$_id', value: '$value' } }
            ];
            // Use Follow model for this
            trendsData[metric] = await Follow.aggregate(aggregationPipeline);
            break;
          case 'profileViews':
            dateField = 'timestamp'; // ProfileView schema needs 'timestamp'
            aggregationPipeline = [
              { $match: { producerId: new mongoose.Types.ObjectId(producerId), [dateField]: { $gte: startDate, $lte: endDate } } },
              { $group: {
                _id: { $dateToString: { format: dateFormat, date: `$${dateField}` } },
                value: { $sum: 1 }
              }},
              { $sort: { _id: 1 } },
              { $project: { _id: 0, date: '$_id', value: '$value' } }
            ];
            trendsData[metric] = await ProfileView.aggregate(aggregationPipeline);
            break;
          case 'engagementRate':
            // Complex: Needs daily followers, daily posts, daily likes/comments on those posts
            trendsData[metric] = []; // Placeholder - implement detailed logic
            break;
          case 'conversions':
            // Example: Bookings
            // dateField = 'bookingDate';
            // aggregationPipeline = [ ... similar aggregation ... ];
            // trendsData[metric] = await Booking.aggregate(aggregationPipeline);
            trendsData[metric] = []; // Placeholder
            break;
          // Add cases for other metrics
          default:
            console.warn(`Trend metric '${metric}' not implemented.`);
            trendsData[metric] = [];
        }
      }

      res.status(200).json({
        period: period,
        interval: interval,
        trends: trendsData
      });

    } catch (error) {
      console.error(`Error in getTrends for producer ${producerId}:`, error);
      res.status(500).json({ error: 'Failed to fetch trend analytics', details: error.message });
    }
  },

  getRecommendations: async (req, res) => {
    const { producerId } = req.params;
    try {
      // --- Fetch relevant producer data ---
      // const producer = await findProducerById(producerId); // Get producer details
      // const posts = await Post.find({ authorId: producerId }).sort({ createdAt: -1 }).limit(10);
      // const followerCount = await Follow.countDocuments({ producerId: producerId });
      // ... fetch other relevant data ...

      // --- Generate Recommendations based on rules/logic ---
      let recommendations = [];

      // Example Rule 1: Profile Completeness
      // if (!producer.businessHours || producer.businessHours.length === 0) {
      //    recommendations.push({ id: 'rec_hours', title: 'Ajouter vos horaires', description: 'Complétez vos horaires pour informer vos clients.', priority: 'medium', action: { type: 'navigate_to_profile_edit', section: 'hours' } });
      // }

      // Example Rule 2: Posting Frequency
      // const lastPost = posts[0];
      // if (!lastPost || new Date() - lastPost.createdAt > 7 * 24 * 60 * 60 * 1000) { // More than 7 days ago
      //    recommendations.push({ id: 'rec_post_freq', title: 'Publier plus souvent', description: 'Engagez votre audience en publiant au moins une fois par semaine.', priority: 'high', action: { type: 'navigate_to_post_creation' } }); // Need a post creation action type
      // }

      // Example Rule 3: High Performing Post
      // const highPerformingPost = posts.find(p => (p.likes > 50 || p.comments > 10)); // Define criteria
      // if (highPerformingPost) {
      //     recommendations.push({ id: 'rec_boost', title: 'Booster un Post Populaire', description: `Votre post "${highPerformingPost.content.substring(0, 20)}..." performe bien. Envisagez de le booster.`, priority: 'medium', action: { type: 'boost_post', postId: highPerformingPost._id.toString() } });
      // }

      // Placeholder Recommendations
      if (recommendations.length === 0) {
        recommendations.push({ id: 'rec_placeholder_1', title: 'Interagissez avec vos abonnés', description: 'Répondez aux commentaires et messages pour renforcer les liens.', priority: 'medium', action: { type: 'navigate_to_messaging' } });
        recommendations.push({ id: 'rec_placeholder_2', title: 'Explorez les campagnes', description: 'Augmentez votre visibilité grâce aux campagnes marketing.', priority: 'low', action: { type: 'create_campaign' } });
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
    try {
      // Requires Follower model with demographic info or a separate AnalyticsUser collection
      // --- Placeholder Implementation ---
      console.log(`Fetching demographics for ${producerId} (Premium)`);

      // TODO: Implement actual aggregation on follower data based on age, gender, location stored during user registration/updates
      const ageDistribution = { "18-24": 25.0, "25-34": 40.0, "35-44": 20.0, "45+": 15.0 };
      const genderDistribution = { "Homme": 48.0, "Femme": 50.0, "Autre": 2.0 };
      const topLocations = [ { "city": "Paris", "percentage": 65.0 }, { "city": "Lyon", "percentage": 15.0 }, { "city": "Marseille", "percentage": 10.0 } ];

      res.status(200).json({ ageDistribution, genderDistribution, topLocations });
    } catch (error) {
      console.error(`Error in getDemographics for producer ${producerId}:`, error);
      res.status(500).json({ error: 'Failed to fetch demographics', details: error.message });
    }
  },

  getPredictions: async (req, res) => {
    const { producerId } = req.params;
    const { horizon = '30d' } = req.query;
    try {
      // --- Placeholder Implementation ---
      console.log(`Fetching predictions for ${producerId} (Premium)`);

      // TODO: Implement prediction logic (e.g., based on recent trends)
      const predictedFollowers = { value: (await Follow.countDocuments({ producerId: producerId })) * 1.1, confidence: 'medium' }; // Simple 10% growth
      const predictedViews = { value: (await ProfileView.countDocuments({ producerId: producerId })) * 1.15, confidence: 'low' }; // Simple 15% growth

      res.status(200).json({
        predictedFollowers: predictedFollowers,
        predictedViews: predictedViews,
        // predictedConversions: ...
      });
    } catch (error) {
      console.error(`Error in getPredictions for producer ${producerId}:`, error);
      res.status(500).json({ error: 'Failed to fetch predictions', details: error.message });
    }
  },

  getCompetitorAnalysis: async (req, res) => {
    const { producerId } = req.params;
    const { period = '30d' } = req.query;
    try {
      // --- Placeholder Implementation ---
      console.log(`Fetching competitor analysis for ${producerId} (Premium)`);

      // TODO: Implement competitor identification logic
      // TODO: Fetch metrics for producer and competitors over the period
      const yourMetrics = { followers: 125, engagementRate: 4.5 };
      const averageCompetitorMetrics = { followers: 200, engagementRate: 4.2 };
      const topCompetitors = [
        { id: "comp1", name: "Concurrent A", followers: 250, engagementRate: 4.8 },
        { id: "comp2", name: "Concurrent B", followers: 180, engagementRate: 4.0 },
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

/**
 * Fonction utilitaire pour générer une série temporelle d'événements
 */
function generateTimeSeries(events, startDate, endDate) {
  const start = startDate ? new Date(startDate) : new Date(Math.min(...events.map(e => e.timestamp)));
  const end = endDate ? new Date(endDate) : new Date(Math.max(...events.map(e => e.timestamp)));
  
  // Créer un tableau de dates entre start et end (par jour)
  const dates = [];
  const current = new Date(start);
  
  while (current <= end) {
    dates.push(new Date(current));
    current.setDate(current.getDate() + 1);
  }
  
  // Initialiser les comptes pour chaque date
  const timeSeries = dates.map(date => {
    // Format de date YYYY-MM-DD
    const dateString = date.toISOString().split('T')[0];
    
    // Filtrer les événements pour cette date
    const dayEvents = events.filter(e => {
      const eventDate = new Date(e.timestamp);
      return eventDate.toISOString().split('T')[0] === dateString;
    });
    
    return {
      date: dateString,
      total: dayEvents.length,
      pageViews: dayEvents.filter(e => e.name === 'page_view').length,
      userInteractions: dayEvents.filter(e => e.name === 'user_interaction').length,
      contentInteractions: dayEvents.filter(e => e.name === 'content_interaction').length
    };
  });
  
  return timeSeries;
}

/**
 * Fonction utilitaire pour générer une série temporelle avec intervalle spécifique
 */
function generateTimeSeriesWithInterval(events, startDate, endDate, intervalType) {
  const start = startDate ? new Date(startDate) : new Date(Math.min(...events.map(e => e.timestamp)));
  const end = endDate ? new Date(endDate) : new Date(Math.max(...events.map(e => e.timestamp)));
  
  // Créer des groupes selon l'intervalle
  const groupedData = {};
  
  events.forEach(event => {
    const date = new Date(event.timestamp);
    let key;
    
    if (intervalType === 'day') {
      key = date.toISOString().split('T')[0]; // YYYY-MM-DD
    } else if (intervalType === 'week') {
      // Calculer le lundi de la semaine
      const dayOfWeek = date.getDay() || 7; // Transformer 0 (dimanche) en 7
      const daysToSubtract = dayOfWeek - 1;
      const monday = new Date(date);
      monday.setDate(date.getDate() - daysToSubtract);
      key = monday.toISOString().split('T')[0]; // YYYY-MM-DD du lundi
    } else { // month
      key = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padLeft(2, '0')}`; // YYYY-MM
    }
    
    if (!groupedData[key]) {
      groupedData[key] = {
        date: key,
        posts: 0,
        likes: 0,
        comments: 0,
        shares: 0
      };
    }
    
    // Incrémenter les compteurs appropriés
    if (event.name === 'content_interaction') {
      if (event.parameters.interaction_type === 'create') {
        groupedData[key].posts++;
      } else if (event.parameters.interaction_type === 'like') {
        groupedData[key].likes++;
      } else if (event.parameters.interaction_type === 'comment') {
        groupedData[key].comments++;
      } else if (event.parameters.interaction_type === 'share') {
        groupedData[key].shares++;
      }
    }
  });
  
  // Convertir en tableau et trier par date
  return Object.values(groupedData).sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Fonction utilitaire pour calculer le pourcentage de croissance
 */
function calculateGrowthPercentage(previous, current) {
  if (previous === 0) {
    return current > 0 ? 100 : 0;
  }
  return ((current - previous) / previous) * 100;
}

// Extension pour ajouter un padding à gauche d'une chaîne
String.prototype.padLeft = function(length, char) {
  return char.repeat(Math.max(0, length - this.length)) + this;
};

module.exports = analyticsController; 
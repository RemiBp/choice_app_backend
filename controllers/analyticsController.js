const mongoose = require('mongoose');
const { choiceAppDb } = require('../index');

// Modèle pour les événements analytiques
const AnalyticsEvent = choiceAppDb.model(
  'AnalyticsEvent',
  new mongoose.Schema({
    name: String,
    parameters: Object,
    timestamp: {
      type: Date,
      default: Date.now
    },
    userId: String,
    sessionId: String,
    deviceInfo: Object
  }),
  'analyticsEvents'
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
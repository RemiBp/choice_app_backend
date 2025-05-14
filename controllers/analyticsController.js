const mongoose = require('mongoose');
const { createModel, databases, getProducerModel } = require('../utils/modelCreator');
const analyticsService = require('../services/analyticsService');
const { getModel } = require('../models'); // Import getModel

// Require Schemas for our custom models - these export schemas
// const ProfileViewSchema = require('../models/ProfileView');
// const RatingSchema = require('../models/Rating');

// --- MODIFIED: Get db connections directly from dbConfig --- 
// const dbConfig = require('../db/config'); // Import dbConfig

// --- REMOVED Model Initialization Block --- 
// The global initialization was causing timing issues.
// Models will be fetched within each controller function as needed.

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

  // --- REMOVED _getRequiredModels function ---
  // Models will be fetched directly using getModel() where needed.

  /**
   * Enregistrer un lot d'événements
   */
  logEvents: async (req, res) => {
    try {
      // --- MODIFIED: Use getModel ---
      const AnalyticsEvent = getModel('AnalyticsEvent');
      if (!AnalyticsEvent) {
        return res.status(500).json({ message: 'Modèle AnalyticsEvent non initialisé.' });
      }
      // --- END MODIFICATION ---
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
      res.status(500).json({ message: error.message || 'Erreur lors de l\'enregistrement des événements' });
    }
  },
  
  /**
   * Enregistrer un seul événement
   */
  logEvent: async (req, res) => {
    try {
      // --- MODIFIED: Use getModel ---
      const AnalyticsEvent = getModel('AnalyticsEvent');
       if (!AnalyticsEvent) {
        return res.status(500).json({ message: 'Modèle AnalyticsEvent non initialisé.' });
      }
      // --- END MODIFICATION ---
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
      res.status(500).json({ message: error.message || 'Erreur lors de l\'enregistrement de l\'événement' });
    }
  },

  /**
   * Obtenir l'aperçu
   */
  getOverview: async (req, res) => {
    try {
      const { producerId } = req.params;
      const { period = '30d', producerType } = req.query;

      if (!producerType || !['restaurant', 'leisure', 'wellness'].includes(producerType)) {
        return res.status(400).json({ message: 'Paramètre producerType valide requis (restaurant, leisure, wellness)' });
      }

      // Generate mock data for demonstration
      // In a real implementation, you would query the database for real data
      const kpis = {
        followers: {
          current: 245,
          change: 12,
          changePercent: 5.1
        },
        profileViews: {
          current: 1253,
          change: 83,
          changePercent: 7.1
        },
        engagementRate: {
          current: 3.7,
          change: 0.4,
          changePercent: 12.1
        },
        conversions: {
          current: 52,
          change: 8,
          changePercent: 18.2,
          label: 'Réservations'
        },
        reach: {
          current: 2850,
          change: 150,
          changePercent: 5.6
        },
        avgRating: {
          current: 4.2,
          change: 0.2,
          changePercent: 5.0
        }
      };
      
      const engagementSummary = {
        posts: 15,
        likes: 342,
        comments: 87
      };

      const overviewData = {
        period: period,
        kpis: kpis,
        engagementSummary: engagementSummary
      };
      
      res.status(200).json(overviewData);

    } catch (error) {
      console.error(`❌ Erreur dans getOverview pour ${req.params.producerId}:`, error);
      // Return a friendly error with a 200 status code to avoid 502 errors
      res.status(200).json({ 
        kpis: {},
        engagementSummary: {
          posts: 0,
          likes: 0,
          comments: 0
        },
        period: req.query.period || '30d',
        error: 'Erreur lors de la récupération des données de l\'aperçu'
      });
    }
  },

  /**
   * Obtenir les tendances
   */
  getTrends: async (req, res) => {
    try {
      const { producerId } = req.params;
      const { period = '30d', producerType, metrics } = req.query;
      
      if (!producerType || !['restaurant', 'leisure', 'wellness'].includes(producerType)) {
          return res.status(400).json({ message: 'Paramètre producerType valide requis (restaurant, leisure, wellness)' });
      }
      
      if (!metrics) {
          return res.status(400).json({ message: 'Paramètre metrics requis (ex: followers,profileViews)' });
      }
      
      const metricsList = metrics.split(',');
      
      // Generate mock data
      const trendsMap = {}; 
      
      // Get start and end dates from period
      const now = new Date();
      const dayCount = parseInt(period.replace(/[^0-9]/g, ''), 10) || 30;
      
      // Generate data points for each requested metric
      metricsList.forEach(metric => {
        const dataPoints = [];
        for (let i = dayCount; i >= 0; i--) {
          const date = new Date(now);
          date.setDate(date.getDate() - i);
          const dateString = date.toISOString().split('T')[0];
          
          // Generate a reasonable random value based on the metric
          let value;
          switch(metric) {
            case 'followers':
              value = Math.floor(Math.random() * 5) + (i < 5 ? 3 : 0);
              break;
            case 'profileViews':
              value = Math.floor(Math.random() * 20) + 10 + (i % 7 === 0 ? 15 : 0);
              break;
            case 'engagementRate':
              value = (Math.random() * 2) + 2 + (i % 7 === 0 ? 1 : 0);
              break;
            case 'conversions':
              value = Math.floor(Math.random() * 3) + (i % 7 === 0 ? 2 : 0);
              break;
            default:
              value = Math.floor(Math.random() * 10);
          }
          
          dataPoints.push({
            date: dateString,
            value: value
          });
        }
        
        trendsMap[metric] = dataPoints;
      });
      
      const trendsData = {
        period: period,
        interval: 'day',
        trends: trendsMap
      };

      res.status(200).json(trendsData);

    } catch (error) {
      console.error(`❌ Erreur dans getTrends pour ${req.params.producerId}:`, error);
      // Return empty structure with a 200 status code to avoid 502 errors
      res.status(200).json({ 
        period: req.query.period || '30d',
        interval: 'day',
        trends: {}
      });
    }
  },

  /**
   * Obtenir les recommandations
   */
  getRecommendations: async (req, res) => {
    try {
      const { producerId } = req.params;

      // Generate mock recommendations
      const recommendations = [
        {
          id: 'rec_1',
          title: 'Augmentez votre fréquence de publication',
          description: 'Nous constatons que vous publiez environ une fois par semaine. Essayez d\'augmenter à 3-4 publications hebdomadaires pour améliorer votre visibilité et votre engagement.',
          priority: 'high',
          action: {
            type: 'content_schedule',
            section: 'posts'
          }
        },
        {
          id: 'rec_2',
          title: 'Répondez plus rapidement aux commentaires',
          description: 'Votre temps de réponse moyen est de 48 heures. Les utilisateurs s\'attendent à une réponse dans les 24 heures. Cela pourrait améliorer votre taux de satisfaction client.',
          priority: 'medium',
          action: {
            type: 'navigate_to_messaging',
            section: 'comments'
          }
        },
        {
          id: 'rec_3',
          title: 'Créez une campagne de visibilité locale',
          description: 'Une campagne ciblée peut augmenter votre visibilité de 40% auprès de votre clientèle locale.',
          priority: 'medium',
          action: {
            type: 'create_campaign',
            section: 'marketing'
          }
        }
      ];

      res.status(200).json({ recommendations });

    } catch (error) {
      console.error(`❌ Erreur dans getRecommendations pour ${req.params.producerId}:`, error);
      // Return empty recommendations with a 200 status code to avoid 502 errors
      res.status(200).json({ recommendations: [] });
    }
  },

  /**
   * Obtenir les données démographiques
   */
  getDemographics: async (req, res) => {
     try {
       const { User } = getModel('User');
       const { producerId } = req.params;
       const { period = '30d', producerType } = req.query;

        if (!producerType) {
          return res.status(400).json({ message: 'Paramètre producerType requis' });
        }
       const { startDate, endDate } = getPeriodDates(period);

       const demographicsData = await analyticsService.getDemographicsData({
           producerId,
           producerType,
           startDate,
           endDate,
           UserModel: User
           // Pass FollowModel if needed to link followers to users
       });

       res.status(200).json(demographicsData);

     } catch (error) {
       console.error(`❌ Erreur dans getDemographics pour ${req.params.producerId}:`, error);
       res.status(500).json({ message: error.message || 'Erreur lors de la récupération des données démographiques' });
     }
  },

  /**
   * Obtenir les prédictions de croissance
   */
  getPredictions: async (req, res) => {
     try {
       // May need Follow, ProfileView models etc.
       const { Follow, ProfileView } = getModel('Follow', 'ProfileView'); 
       const { producerId } = req.params;
       const { producerType } = req.query;

       if (!producerType) {
         return res.status(400).json({ message: 'Paramètre producerType requis' });
       }

       const predictionsData = await analyticsService.getGrowthPredictions({
           producerId,
           producerType,
           FollowModel: Follow,
           ProfileViewModel: ProfileView
           // Pass other models needed for prediction
       });

       res.status(200).json(predictionsData);

     } catch (error) {
       console.error(`❌ Erreur dans getPredictions pour ${req.params.producerId}:`, error);
       res.status(500).json({ message: error.message || 'Erreur lors de la récupération des prédictions' });
     }
  },

  /**
   * Obtenir l'analyse concurrentielle
   */
  getCompetitorAnalysis: async (req, res) => {
     try {
       // Needs Producer model for the specific type, and maybe Follow model
       const { Follow } = getModel('Follow'); 
       const { producerId } = req.params;
       const { period = '30d', producerType } = req.query;

       if (!producerType) {
         return res.status(400).json({ message: 'Paramètre producerType requis' });
       }
       // --- MODIFIED: Use getModel based on producerType ---
       let ProducerModel;
       if (producerType === 'restaurant') {
         ProducerModel = getModel('Producer');
       } else if (producerType === 'leisure') {
         ProducerModel = getModel('LeisureProducer');
       } else if (producerType === 'wellness') {
         ProducerModel = getModel('WellnessPlace') || getModel('BeautyPlace');
       }
       // --- REMOVED: const ProducerModel = getProducerModel(producerType); ---
       if (!ProducerModel) {
         console.error(`❌ Erreur dans getCompetitorAnalysis: Modèle pour producerType '${producerType}' non trouvé ou non initialisé.`);
         return res.status(500).json({ message: `Modèle pour producerType '${producerType}' non trouvé ou non initialisé.` });
       }
       // --- END MODIFICATION ---

       const { startDate, endDate } = getPeriodDates(period);

       const competitorData = await analyticsService.getCompetitorAnalysisData({
           producerId,
           ProducerModel, // Pass the correct producer model
           FollowModel: Follow,
           startDate, // Pass dates if needed for analysis
           endDate
       });

       res.status(200).json(competitorData);

     } catch (error) {
       console.error(`❌ Erreur dans getCompetitorAnalysis pour ${req.params.producerId}:`, error);
       res.status(500).json({ message: error.message || 'Erreur lors de la récupération de l\'analyse concurrentielle' });
     }
  },

   /**
    * Enregistrer un événement générique (utilisé par le middleware ou directement)
    * DEPRECATED? Prefer logEvents or logEvent
    */
   logGenericEvent: async (req, res) => {
     try {
       const { AnalyticsEvent } = getModel('AnalyticsEvent');
       const { eventName, userId, parameters } = req.body;
       if (!eventName) {
         return res.status(400).json({ message: 'Nom de l\'événement manquant (eventName)' });
       }
       
       const newEvent = new AnalyticsEvent({
         name: eventName,
         userId: userId || 'anonymous', 
         parameters: parameters || {},
         timestamp: new Date()
       });
       await newEvent.save();
       res.status(201).json({ message: 'Événement enregistré.' });
     } catch (error) {
       console.error("❌ Erreur logGenericEvent:", error);
       res.status(500).json({ message: error.message || 'Erreur serveur.' });
     }
   },

  /**
   * Obtenir les données démographiques des abonnés
   */
  getFollowerDemographics: async (req, res) => {
    try {
        // --- MODIFIED: Use getModel ---
        const Follow = getModel('Follow');
        const User = getModel('User');
        if (!Follow || !User) {
            console.error("❌ Erreur dans getFollowerDemographics: Impossible de charger Follow ou User.", { Follow: !!Follow, User: !!User });
            return res.status(500).json({ message: 'Erreur interne: Impossible de charger les modèles requis.' });
        }
        // --- END MODIFICATION ---
        const { producerId } = req.params;
        const { producerType } = req.query; // producerType might be needed if Follow model differs

        // --- Logic moved to analyticsService ---
        const demographicsData = await analyticsService.getFollowerDemographicsData({
            producerId,
            producerType, // Pass if needed by service
            FollowModel: Follow,
            UserModel: User
        });

        res.status(200).json(demographicsData);

    } catch (error) {
        console.error(`❌ Erreur dans getFollowerDemographics pour ${req.params.producerId}:`, error);
        res.status(500).json({ message: error.message || 'Erreur lors de la récupération des données démographiques' });
    }
  },

  /**
   * Obtenir les données d'engagement
   */
  getEngagementData: async (req, res) => {
      try {
          // --- MODIFIED: Use getModel ---
          const Post = getModel('Post');
          const Rating = getModel('Rating'); // Assuming Rating model stores likes/comments? Or Interaction?
          const Follow = getModel('Follow'); // For follower count context
          // Add Interaction model if it stores likes/comments/shares
          const Interaction = getModel('Interaction'); 
           if (!Post || !Rating || !Follow || !Interaction) {
               console.error("❌ Erreur dans getEngagementData: Un ou plusieurs modèles requis non chargés.", { Post: !!Post, Rating: !!Rating, Follow: !!Follow, Interaction: !!Interaction });
               return res.status(500).json({ message: 'Erreur interne: Impossible de charger les modèles requis.' });
           }
           // --- END MODIFICATION ---
          const { producerId } = req.params;
          const { period = '30d', producerType } = req.query;

          if (!producerType || !['restaurant', 'leisure', 'wellness'].includes(producerType)) {
               return res.status(400).json({ message: 'Paramètre producerType valide requis (restaurant, leisure, wellness)' });
           }
           // --- MODIFIED: Use getModel based on producerType ---
           let ProducerModel;
           if (producerType === 'restaurant') {
             ProducerModel = getModel('Producer');
           } else if (producerType === 'leisure') {
             ProducerModel = getModel('LeisureProducer');
           } else if (producerType === 'wellness') {
             ProducerModel = getModel('WellnessPlace') || getModel('BeautyPlace');
           }
           // --- REMOVED: const ProducerModel = getProducerModel(producerType); ---
            if (!ProducerModel) {
                console.error(`❌ Erreur dans getEngagementData: Modèle pour producerType '${producerType}' non trouvé ou non initialisé.`);
                return res.status(500).json({ message: `Modèle pour producerType '${producerType}' non trouvé ou non initialisé.` });
            }
           // --- END MODIFICATION ---

          const { startDate, endDate, prevStartDate, prevEndDate } = getPeriodDates(period);

          // --- Logic potentially moved to analyticsService ---
          // This might get complex, good candidate for the service layer
          const engagementData = await analyticsService.getEngagementMetrics({
              producerId,
              producerType,
              ProducerModel,
              PostModel: Post,
              RatingModel: Rating,
              FollowModel: Follow,
              InteractionModel: Interaction, // Pass Interaction model
              startDate,
              endDate,
              prevStartDate,
              prevEndDate
          });

          res.status(200).json(engagementData);

      } catch (error) {
          console.error(`❌ Erreur dans getEngagementData pour ${req.params.producerId}:`, error);
          res.status(500).json({ message: error.message || 'Erreur lors de la récupération des données d\'engagement' });
     }
   }

}; // End of analyticsController object

module.exports = analyticsController;
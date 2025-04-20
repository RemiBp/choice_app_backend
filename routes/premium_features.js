const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const auth = require('../middleware/auth');
// Import database connections if needed (assuming they are exported from index.js or db/config.js)
const { restaurationDb, loisirsDb, beautyWellnessDb } = require('../index'); // Adjust path if necessary

// --- Helper Function to find Producer across DBs ---
async function findProducerById(producerId) {
  if (!mongoose.Types.ObjectId.isValid(producerId)) {
    return null;
  }
  
  // Potential models (adjust names if needed)
  const Producer = restaurationDb?.models?.Producer || restaurationDb?.model('Producer');
  const LeisureProducer = loisirsDb?.models?.LeisureProducer || loisirsDb?.model('LeisureProducer');
  const WellnessProducer = beautyWellnessDb?.models?.WellnessProducer || beautyWellnessDb?.model('WellnessProducer'); // Adjust model name if necessary

  let producer = null;
  if (Producer) {
    producer = await Producer.findById(producerId).select('subscription name lieu photo').lean();
    if (producer) return { ...producer, producerType: 'restaurant' };
  }
  if (LeisureProducer) {
    producer = await LeisureProducer.findById(producerId).select('subscription name lieu photo').lean();
    if (producer) return { ...producer, producerType: 'leisure' };
  }
  if (WellnessProducer) {
    producer = await WellnessProducer.findById(producerId).select('subscription name lieu photo').lean(); // Adjust field names if needed
    if (producer) return { ...producer, producerType: 'wellness' };
  }
  
  return null; // Not found in any DB
}
// --- End Helper Function ---


// Définitions des fonctionnalités disponibles par niveau d'abonnement
// Updated keys to match frontend usage in GrowthAndReachScreen
const featuresBySubscriptionLevel = {
  gratuit: {
    advanced_analytics: false,
    growth_predictions: false,
    audience_demographics: false,
    simple_campaigns: false,
    advanced_targeting: false,
    campaign_automation: false,
    // Add other features if needed, defaulting to false for free tier
    premium_placement: false,
    customizable_menu: false,
    detailed_heatmap: false,
    marketing_tools: false // Kept from original for reference, might be covered by campaign features
  },
  starter: {
    advanced_analytics: true, // Example: Starter gets basic analytics
    growth_predictions: false,
    audience_demographics: false,
    simple_campaigns: false,
    advanced_targeting: false,
    campaign_automation: false,
    premium_placement: true,
    customizable_menu: false,
    detailed_heatmap: false,
    marketing_tools: false
  },
  pro: {
    advanced_analytics: true,
    growth_predictions: true,
    audience_demographics: true,
    simple_campaigns: true, // Example: Pro gets simple campaigns
    advanced_targeting: false,
    campaign_automation: false,
    premium_placement: true,
    customizable_menu: true,
    detailed_heatmap: true,
    marketing_tools: false
  },
  legend: {
    advanced_analytics: true,
    growth_predictions: true,
    audience_demographics: true,
    simple_campaigns: true,
    advanced_targeting: true, // Example: Legend gets advanced targeting
    campaign_automation: true, // Example: Legend gets automation
    premium_placement: true,
    customizable_menu: true,
    detailed_heatmap: true,
    marketing_tools: true
  }
};

/**
 * @route GET /api/premium-features/subscription-info/:producerId
 * @desc Obtenir les informations d'abonnement pour un producteur (using Producer model)
 * @access Private (Assumes auth middleware runs before this)
 */
router.get('/subscription-info/:producerId', auth, async (req, res) => {
  try {
    const { producerId } = req.params;

    const producer = await findProducerById(producerId);

    if (!producer) {
      // If producer not found, return default 'gratuit' state
      return res.status(404).json({
         message: 'Producer not found',
         subscription: {
           level: 'gratuit',
           startDate: null,
           endDate: null,
           status: 'not_found' // Indicate producer wasn't found
         },
         features: featuresBySubscriptionLevel.gratuit
      });
    }

    // Get subscription details from the producer document, default to 'gratuit' if missing
    const subscriptionData = producer.subscription || {};
    const currentLevel = subscriptionData.level || 'gratuit';
    const features = featuresBySubscriptionLevel[currentLevel] || featuresBySubscriptionLevel.gratuit;

    res.status(200).json({
      subscription: {
        level: currentLevel,
        startDate: subscriptionData.start_date || null,
        endDate: subscriptionData.end_date || null,
        status: subscriptionData.status || 'active' // Default to active if level is set
      },
      features: features // Return the map of features for this level
    });
  } catch (error) {
    console.error('Erreur lors de la récupération des informations d\'abonnement:', error);
    res.status(500).json({ message: 'Erreur serveur', error: error.message });
  }
});

/**
 * @route GET /api/premium-features/can-access/:producerId/:featureId
 * @desc Vérifier si un producteur a accès à une fonctionnalité premium (using Producer model)
 * @access Private (Assumes auth middleware runs before this)
 */
router.get('/can-access/:producerId/:featureId', auth, async (req, res) => {
  try {
    const { producerId, featureId } = req.params;

    const producer = await findProducerById(producerId);

    // If producer not found, access denied
    if (!producer) {
        return res.status(404).json({ hasAccess: false, reason: 'Producer not found' });
    }

    // Get subscription level, default to 'gratuit'
    const subscriptionData = producer.subscription || {};
    const currentLevel = subscriptionData.level || 'gratuit';
    const subscriptionStatus = subscriptionData.status || 'active';
    const endDate = subscriptionData.end_date;

    // Check if subscription is active
    const now = new Date();
    const isActive = subscriptionStatus === 'active' && (!endDate || new Date(endDate) > now);

    if (!isActive) {
        // If subscription isn't active, check if the feature is available in the 'gratuit' tier
        const hasAccessInFree = featuresBySubscriptionLevel.gratuit[featureId] || false;
        return res.status(200).json({ hasAccess: hasAccessInFree, reason: 'Subscription inactive' });
    }

    // Check access based on the producer's active subscription level
    const levelFeatures = featuresBySubscriptionLevel[currentLevel] || featuresBySubscriptionLevel.gratuit;
    const hasAccess = levelFeatures[featureId] || false;

    res.status(200).json({ hasAccess });
  } catch (error) {
    console.error('Erreur lors de la vérification de l\'accès à la fonctionnalité:', error);
    res.status(500).json({ message: 'Erreur serveur', error: error.message });
  }
});


// REMOVED: POST /api/premium-features/update-subscription/:producerId
// This logic should be handled by the payment webhook or post-payment flow


/**
 * @route GET /api/premium-features/pricing
 * @desc Obtenir les informations de prix pour les différents niveaux d'abonnement
 * @access Public
 */
router.get('/pricing', async (req, res) => {
  try {
    // Informations de prix statiques (à remplacer par des données de base de données ou config)
    // TODO: Potentially fetch this from Stripe Plans/Prices API or a config file
    const pricingInfo = {
      starter: {
        id: 'starter', // Use level ID
        name: 'Starter',
        description: 'Pour bien démarrer',
        monthlyPrice: 9.99,
        yearlyPrice: 99.90, // Example
        features: [
          'Analyse de clientèle de base',
          'Placement préférentiel',
          'Support email prioritaire'
        ]
      },
      pro: {
        id: 'pro',
        name: 'Pro',
        description: 'Fonctionnalités avancées',
        monthlyPrice: 19.99,
        yearlyPrice: 199.90,
        features: [
          'Toutes les fonctionnalités Starter',
          'Personnalisation avancée du menu/profil',
          'Carte de chaleur détaillée',
          'Analyses & Prédictions',
          'Campagnes simples',
          'Support téléphonique'
        ]
      },
      legend: {
        id: 'legend',
        name: 'Legend',
        description: 'Le package complet',
        monthlyPrice: 39.99,
        yearlyPrice: 399.90,
        features: [
          'Toutes les fonctionnalités Pro',
          'Outils marketing & Automatisation',
          'Ciblage avancé',
          'Recommandations IA personnalisées',
          'Manager de compte dédié'
        ]
      }
    };

    res.status(200).json(pricingInfo);
  } catch (error) {
    console.error('Erreur lors de la récupération des informations de prix:', error);
    res.status(500).json({ message: 'Erreur serveur', error: error.message });
  }
});

module.exports = router; 
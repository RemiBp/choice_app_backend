const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { requireAuth } = require('../middleware/authMiddleware');
// REMOVE: Direct DB connection import
// const { restaurationDb, loisirsDb, beautyWellnessDb } = require('../index'); 
// --- ADD: Import central model getter --- 
const { getModel } = require('../models'); 

// --- Helper Function to find Producer across DBs using getModel --- 
async function findProducerById(producerId) {
  if (!mongoose.Types.ObjectId.isValid(producerId)) {
    return null;
  }
  
  let producer = null;
  let producerType = null;
  const objectId = new mongoose.Types.ObjectId(producerId);

  try {
    // 1. Check Restaurant Producers
    const ProducerModel = getModel('Producer');
    if (ProducerModel) {
      producer = await ProducerModel.findById(objectId).select('subscription name lieu photo').lean();
      if (producer) producerType = 'restaurant';
    } else {
      console.warn('PremiumFeatures: Producer model not available via getModel');
    }
    
    // 2. Check Leisure Producers
    if (!producer) {
      const LeisureProducerModel = getModel('LeisureProducer');
      if (LeisureProducerModel) {
         producer = await LeisureProducerModel.findById(objectId).select('subscription name lieu photo').lean();
         if (producer) producerType = 'leisure';
      } else {
         console.warn('PremiumFeatures: LeisureProducer model not available via getModel');
      }
    }
    
    // 3. Check Wellness Producers (Assuming model name is WellnessPlace)
    if (!producer) {
      const WellnessPlaceModel = getModel('WellnessPlace'); 
      if (WellnessPlaceModel) {
         producer = await WellnessPlaceModel.findById(objectId).select('subscription name lieu photo').lean(); 
         if (producer) producerType = 'wellness'; // Or 'wellnessPlace' depending on your convention
      } else {
         console.warn('PremiumFeatures: WellnessPlace model not available via getModel');
      }
    }

    if (producer) {
      return { ...producer, producerType };
    }
    
  } catch (error) {
    console.error(`Error finding producer ${producerId} in premium_features/findProducerById:`, error);
    // Don't throw, just return null
  }

  return null; // Not found or error occurred
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
router.get('/subscription-info/:producerId', requireAuth, async (req, res) => {
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
router.get('/can-access/:producerId/:featureId', requireAuth, async (req, res) => {
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
const mongoose = require('mongoose');
// const { getProducerModel } = require('../utils/producerModelResolver'); // File doesn't exist
// const Subscription = require('../models/Subscription');
// const { createModel, databases } = require('../utils/modelCreator');
// const RestaurantProducer = createModel(databases.RESTAURATION, 'Producer', 'producers');
// const LeisureProducer = createModel(databases.LOISIR, 'LeisureProducer', 'leisureProducers');
// const BeautyProducer = createModel(databases.BEAUTY_WELLNESS, 'BeautyProducer', 'beautyProducers');
const { getModel } = require('../models');

/**
 * Middleware to check if a producer has access to a premium feature based on their subscription.
 * 
 * Expects:
 * - req.producerInfo: Contains producerId and producerType (e.g., from checkProducerAccess middleware)
 * - Required feature level passed as an argument to the middleware factory.
 */

const featureLevels = {
  gratuit: 0,
  starter: 1,
  pro: 2,
  legend: 3
};

function requirePremiumFeature(requiredLevel) {
  return async (req, res, next) => {
    try {
      // Ensure producer info is available
      if (!req.producerInfo || !req.producerInfo.producerId || !req.producerInfo.producerType) {
        console.warn('⚠️ requirePremiumFeature: Producer info missing in request.');
        // Fallback: If no producer info, deny access as a precaution
        // Alternatively, could allow access if the route doesn't strictly require producer context
        return res.status(403).json({ message: 'Accès refusé. Contexte producteur manquant.' }); 
      }

      const { producerId, producerType } = req.producerInfo;
      const requiredLevelNum = featureLevels[requiredLevel] ?? 99; // Default to high number if level invalid

      console.log(`🔒 Checking premium feature access for producer ${producerId} (type: ${producerType}). Required level: ${requiredLevel} (${requiredLevelNum})`);

      // Use getModel to access Subscription
      const SubscriptionModel = getModel('Subscription');
      if (!SubscriptionModel) {
        console.error('❌ requirePremiumFeature Error: Subscription model not initialized via getModel.');
        return res.status(500).json({ message: 'Erreur interne: Modèle Subscription non initialisé.' });
      }
      
      // Find the producer's subscription using the retrieved model
      const subscription = await SubscriptionModel.findOne({
        producerId: producerId,
        producerModel: producerType // Match based on the producer type string
      }).sort({ createdAt: -1 });

      let currentLevelNum = featureLevels.gratuit; // Default to lowest level
      let isActive = false;

      if (subscription) {
          console.log(`   - Subscription found: ID=${subscription._id}, Level=${subscription.level}, Status=${subscription.status}`);
          // Check if the subscription is active
          isActive = subscription.status === 'active' && 
                      (!subscription.endDate || subscription.endDate > new Date());
                      
          if (isActive) {
              currentLevelNum = featureLevels[subscription.level] ?? featureLevels.gratuit;
              console.log(`   - Subscription active. Current level: ${subscription.level} (${currentLevelNum})`);
          } else {
              console.log(`   - Subscription not active (Status: ${subscription.status}, End Date: ${subscription.endDate})`);
          }
      } else {
          console.log('   - No active subscription found for this producer. Assuming level \'gratuit\'.');
      }

      // Compare current level with required level
      if (currentLevelNum >= requiredLevelNum) {
        console.log(`   - ✅ Access granted (Current: ${currentLevelNum} >= Required: ${requiredLevelNum})`);
        next(); // User has sufficient level
      } else {
        console.log(`   - ❌ Access denied (Current: ${currentLevelNum} < Required: ${requiredLevelNum})`);
        res.status(403).json({ 
          message: `Accès refusé. Cette fonctionnalité requiert un abonnement de niveau '${requiredLevel}' ou supérieur.`,
          requiredLevel: requiredLevel,
          currentLevel: Object.keys(featureLevels).find(key => featureLevels[key] === currentLevelNum) || 'gratuit'
        });
      }
    } catch (error) {
      console.error('❌ Erreur dans le middleware requirePremiumFeature:', error);
      res.status(500).json({ message: 'Erreur interne lors de la vérification de l\'abonnement.' });
    }
  };
}

module.exports = requirePremiumFeature;
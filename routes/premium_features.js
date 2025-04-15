const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const auth = require('../middleware/auth');
const { choiceAppDb } = require('../index');

// Schema pour les abonnements premium
const subscriptionSchema = new mongoose.Schema({
  producerId: { type: String, required: true, index: true },
  level: { 
    type: String, 
    required: true, 
    enum: ['gratuit', 'starter', 'pro', 'legend'] 
  },
  features: { type: Map, of: Boolean },
  startDate: { type: Date, default: Date.now },
  endDate: { type: Date },
  paymentStatus: { 
    type: String, 
    default: 'active',
    enum: ['active', 'pending', 'failed', 'cancelled'] 
  },
  lastPaymentDate: { type: Date },
  nextPaymentDate: { type: Date },
  stripeCustomerId: { type: String },
  stripeSubscriptionId: { type: String },
});

// Création ou récupération du modèle
let SubscriptionModel;
try {
  SubscriptionModel = choiceAppDb.model('Subscription');
} catch (error) {
  SubscriptionModel = choiceAppDb.model('Subscription', subscriptionSchema);
}

// Définitions des fonctionnalités disponibles par niveau d'abonnement
const featuresBySubscriptionLevel = {
  gratuit: {
    advanced_analytics: false,
    premium_placement: false,
    customizable_menu: false,
    detailed_heatmap: false,
    marketing_tools: false
  },
  starter: {
    advanced_analytics: true,
    premium_placement: true,
    customizable_menu: false,
    detailed_heatmap: false,
    marketing_tools: false
  },
  pro: {
    advanced_analytics: true,
    premium_placement: true,
    customizable_menu: true,
    detailed_heatmap: true,
    marketing_tools: false
  },
  legend: {
    advanced_analytics: true,
    premium_placement: true,
    customizable_menu: true,
    detailed_heatmap: true,
    marketing_tools: true
  }
};

/**
 * @route GET /api/premium-features/subscription-info/:producerId
 * @desc Obtenir les informations d'abonnement pour un producteur
 * @access Private
 */
router.get('/subscription-info/:producerId', auth, async (req, res) => {
  try {
    const { producerId } = req.params;

    // Trouver l'abonnement du producteur
    let subscription = await SubscriptionModel.findOne({ producerId });

    // Si aucun abonnement n'existe, en créer un gratuit par défaut
    if (!subscription) {
      subscription = new SubscriptionModel({
        producerId,
        level: 'gratuit',
        features: featuresBySubscriptionLevel.gratuit,
        startDate: new Date(),
        endDate: null
      });
      await subscription.save();
    }

    res.status(200).json({
      subscription: {
        level: subscription.level,
        startDate: subscription.startDate,
        endDate: subscription.endDate,
        paymentStatus: subscription.paymentStatus
      },
      features: subscription.features || featuresBySubscriptionLevel[subscription.level]
    });
  } catch (error) {
    console.error('Erreur lors de la récupération des informations d\'abonnement:', error);
    res.status(500).json({ message: 'Erreur serveur', error: error.message });
  }
});

/**
 * @route GET /api/premium-features/can-access/:producerId/:featureId
 * @desc Vérifier si un producteur a accès à une fonctionnalité premium
 * @access Private
 */
router.get('/can-access/:producerId/:featureId', auth, async (req, res) => {
  try {
    const { producerId, featureId } = req.params;

    // Récupérer l'abonnement du producteur
    let subscription = await SubscriptionModel.findOne({ producerId });

    // Si aucun abonnement n'existe, le producteur a le niveau gratuit
    if (!subscription) {
      const hasAccess = featuresBySubscriptionLevel.gratuit[featureId] || false;
      return res.status(200).json({ hasAccess });
    }

    // Vérifier si l'abonnement est actif
    const now = new Date();
    const isActive = !subscription.endDate || subscription.endDate > now;
    
    if (!isActive || subscription.paymentStatus !== 'active') {
      return res.status(200).json({ hasAccess: false });
    }

    // Vérifier l'accès à la fonctionnalité spécifique
    let hasAccess = false;
    if (subscription.features && subscription.features.has(featureId)) {
      // Si la fonctionnalité est explicitement définie dans les features du producer
      hasAccess = subscription.features.get(featureId);
    } else {
      // Sinon utiliser les valeurs par défaut basées sur le niveau d'abonnement
      hasAccess = featuresBySubscriptionLevel[subscription.level][featureId] || false;
    }

    res.status(200).json({ hasAccess });
  } catch (error) {
    console.error('Erreur lors de la vérification de l\'accès à la fonctionnalité:', error);
    res.status(500).json({ message: 'Erreur serveur', error: error.message });
  }
});

/**
 * @route POST /api/premium-features/update-subscription/:producerId
 * @desc Mettre à jour l'abonnement d'un producteur
 * @access Private
 */
router.post('/update-subscription/:producerId', auth, async (req, res) => {
  try {
    const { producerId } = req.params;
    const { level, customFeatures } = req.body;

    if (!level || !['gratuit', 'starter', 'pro', 'legend'].includes(level)) {
      return res.status(400).json({ message: 'Niveau d\'abonnement invalide' });
    }

    // Trouver l'abonnement existant ou en créer un nouveau
    let subscription = await SubscriptionModel.findOne({ producerId });
    
    if (!subscription) {
      subscription = new SubscriptionModel({
        producerId,
        level: 'gratuit',
        features: featuresBySubscriptionLevel.gratuit,
        startDate: new Date()
      });
    }

    // Mettre à jour le niveau d'abonnement
    subscription.level = level;
    
    // Définir ou mettre à jour les fonctionnalités personnalisées si fournies
    if (customFeatures) {
      subscription.features = new Map(
        Object.entries({
          ...featuresBySubscriptionLevel[level],
          ...customFeatures
        })
      );
    } else {
      // Utiliser les fonctionnalités par défaut pour ce niveau
      subscription.features = new Map(Object.entries(featuresBySubscriptionLevel[level]));
    }

    // Mise à jour de la date de début pour les nouveaux abonnements ou les changements de niveau
    if (subscription.level !== level) {
      subscription.startDate = new Date();
    }

    // Calcul de la date de fin (1 an à partir de maintenant)
    if (level !== 'gratuit') {
      const endDate = new Date();
      endDate.setFullYear(endDate.getFullYear() + 1);
      subscription.endDate = endDate;
    } else {
      subscription.endDate = null; // Pas de date de fin pour le niveau gratuit
    }

    // Mise à jour du statut de paiement (à intégrer avec Stripe ou autre)
    subscription.paymentStatus = 'active';
    subscription.lastPaymentDate = new Date();
    
    // Calculer la prochaine date de paiement (mensuel)
    if (level !== 'gratuit') {
      const nextPaymentDate = new Date();
      nextPaymentDate.setMonth(nextPaymentDate.getMonth() + 1);
      subscription.nextPaymentDate = nextPaymentDate;
    } else {
      subscription.nextPaymentDate = null;
    }

    await subscription.save();

    res.status(200).json({
      message: 'Abonnement mis à jour avec succès',
      subscription: {
        level: subscription.level,
        startDate: subscription.startDate,
        endDate: subscription.endDate,
        paymentStatus: subscription.paymentStatus,
        nextPaymentDate: subscription.nextPaymentDate
      }
    });
  } catch (error) {
    console.error('Erreur lors de la mise à jour de l\'abonnement:', error);
    res.status(500).json({ message: 'Erreur serveur', error: error.message });
  }
});

/**
 * @route GET /api/premium-features/pricing
 * @desc Obtenir les informations de prix pour les différents niveaux d'abonnement
 * @access Public
 */
router.get('/pricing', async (req, res) => {
  try {
    // Informations de prix statiques (à remplacer par des données de base de données)
    const pricingInfo = {
      starter: {
        monthlyPrice: 9.99,
        yearlyPrice: 99.90,
        features: [
          'Analyse de clientèle de base',
          'Placement préférentiel dans les recherches',
          'Support email prioritaire',
          'Meilleure visibilité sur la carte',
        ]
      },
      pro: {
        monthlyPrice: 19.99,
        yearlyPrice: 199.90,
        features: [
          'Toutes les fonctionnalités Starter',
          'Personnalisation avancée du menu',
          'Carte de chaleur détaillée',
          'Analyse approfondie des performances',
          'Support téléphonique',
        ]
      },
      legend: {
        monthlyPrice: 39.99,
        yearlyPrice: 399.90,
        features: [
          'Toutes les fonctionnalités Pro',
          'Outils marketing avancés',
          'Campagnes de promotion automatisées',
          'Recommandations IA personnalisées',
          'Manager de compte dédié',
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
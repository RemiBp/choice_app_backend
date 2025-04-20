const express = require('express');
const router = express.Router();
// Vérifier si la variable STRIPE_SECRET_KEY existe et utiliser une valeur fallback sinon
const stripeSecretKey = process.env.STRIPE_SECRET_KEY || 'sk_test_dummy_key_for_development_only';
// Initialiser Stripe avec une clé qui existe
const stripe = process.env.STRIPE_SECRET_KEY ? require('stripe')(stripeSecretKey) : { 
  // Mock Stripe API pour le développement
  customers: {
    create: async () => ({ id: 'cus_mock_' + Math.random().toString(36).substring(2, 10) }),
    update: async () => ({}),
  },
  subscriptions: {
    create: async () => ({ id: 'sub_mock_' + Math.random().toString(36).substring(2, 10) }),
    update: async () => ({}),
  },
  paymentMethods: {
    attach: async () => ({}),
  },
  checkout: {
    sessions: {
      create: async () => ({ url: 'https://example.com/checkout' }),
    },
  },
};
const mongoose = require('mongoose');

// Connexion à la base `Restauration_Officielle`
const producerDb = mongoose.connection.useDb('Restauration_Officielle');
const loisirDb = mongoose.connection.useDb('Loisir&Culture');
const beautyWellnessDb = mongoose.connection.useDb('Beauty_Wellness');

// Modèle pour la collection `producers` dans différentes bases
const Producer = producerDb.model(
  'Producer',
  new mongoose.Schema({}, { strict: false }), 
  'producers'
);

const LeisureProducer = loisirDb.model(
  'LeisureProducer',
  new mongoose.Schema({}, { strict: false }), 
  'producers'
);

const WellnessProducer = beautyWellnessDb.model(
  'WellnessProducer',
  new mongoose.Schema({}, { strict: false }), 
  'WellnessPlace'
);

// Définition des niveaux d'abonnement et de leurs fonctionnalités
const subscriptionLevels = {
  'gratuit': {
    price: 0,
    name: 'Gratuit',
    features: [
      { id: 'basic_profile', name: 'Profil de base', description: 'Créez votre profil entreprise' },
      { id: 'basic_posting', name: 'Publications de base', description: 'Partagez vos contenus avec les utilisateurs' },
      { id: 'basic_analytics', name: 'Statistiques basiques', description: 'Accédez aux métriques essentielles' }
    ]
  },
  'starter': {
    price: 5,
    name: 'Starter',
    features: [
      { id: 'advanced_analytics', name: 'Statistiques avancées', description: 'Accédez à des données détaillées sur votre audience' },
      { id: 'premium_placement', name: 'Positionnement premium', description: 'Soyez mieux visible sur la carte et dans les résultats de recherche' },
      { id: 'simple_campaigns', name: 'Campagnes simples', description: 'Lancez des campagnes promotionnelles basiques' }
    ]
  },
  'pro': {
    price: 10,
    name: 'Pro',
    features: [
      { id: 'customizable_menu', name: 'Menu personnalisable', description: 'Personnalisez entièrement votre carte de restaurant' },
      { id: 'detailed_heatmap', name: 'Heatmap détaillée', description: 'Visualisez où se trouvent vos clients potentiels' },
      { id: 'growth_predictions', name: 'Prédictions de croissance', description: 'Accédez à des prévisions basées sur l\'IA' }
    ]
  },
  'legend': {
    price: 15,
    name: 'Legend',
    features: [
      { id: 'marketing_tools', name: 'Outils marketing avancés', description: 'Obtenez des outils marketing professionnels' },
      { id: 'campaign_automation', name: 'Automatisation des campagnes', description: 'Planifiez et automatisez vos campagnes marketing' },
      { id: 'ai_content_generation', name: 'Génération de contenu IA', description: 'Créez du contenu attrayant avec l\'aide de l\'IA' }
    ]
  }
};

// Obtenir les différents niveaux d'abonnement disponibles
router.get('/levels', async (req, res) => {
  try {
    const levels = Object.keys(subscriptionLevels).map(key => ({
      id: key,
      name: subscriptionLevels[key].name,
      price: subscriptionLevels[key].price,
      description: `Abonnement ${key}`
    }));
    
    res.status(200).json({ levels });
  } catch (error) {
    console.error('❌ Erreur lors de la récupération des niveaux d\'abonnement:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Obtenir les fonctionnalités pour un niveau d'abonnement
router.get('/features/:level', async (req, res) => {
  try {
    const { level } = req.params;
    
    if (!subscriptionLevels[level]) {
      return res.status(404).json({ error: 'Niveau d\'abonnement non trouvé' });
    }
    
    res.status(200).json({ features: subscriptionLevels[level].features });
  } catch (error) {
    console.error('❌ Erreur lors de la récupération des fonctionnalités:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Vérifier si une fonctionnalité est disponible pour un producteur
router.get('/producer/:producerId/feature/:featureId', async (req, res) => {
  try {
    const { producerId, featureId } = req.params;
    
    // Trouver le producteur et son niveau d'abonnement
    const producer = await findProducerInAnyCollection(producerId);
    
    if (!producer) {
      return res.status(404).json({ error: 'Producteur non trouvé' });
    }
    
    // Déterminer le niveau d'abonnement
    const subscriptionLevel = producer.subscription?.level || 'gratuit';
    
    // Vérifier si la fonctionnalité est disponible pour ce niveau
    let hasAccess = false;
    let requiredLevel = '';
    
    // Parcourir les niveaux d'abonnement pour vérifier l'accès
    for (const [level, data] of Object.entries(subscriptionLevels)) {
      const hasFeature = data.features.some(feature => feature.id === featureId);
      
      if (hasFeature) {
        requiredLevel = level;
        
        // Vérifier si le niveau actuel donne accès à cette fonctionnalité
        const levels = ['gratuit', 'starter', 'pro', 'legend'];
        const currentLevelIndex = levels.indexOf(subscriptionLevel);
        const requiredLevelIndex = levels.indexOf(level);
        
        if (currentLevelIndex >= requiredLevelIndex) {
          hasAccess = true;
        }
        
        // Pas besoin de continuer si on a déjà trouvé la fonctionnalité
        break;
      }
    }
    
    res.status(200).json({ 
      hasAccess, 
      currentLevel: subscriptionLevel,
      requiredLevel
    });
  } catch (error) {
    console.error('❌ Erreur lors de la vérification de l\'accès:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Récupérer l'abonnement d'un producteur
router.get('/producer/:producerId', async (req, res) => {
  try {
    const { producerId } = req.params;
    
    // Trouver le producteur dans toutes les collections
    const producer = await findProducerInAnyCollection(producerId);
    
    if (!producer) {
      return res.status(404).json({ error: 'Producteur non trouvé' });
    }
    
    // Renvoyer les informations d'abonnement
    res.status(200).json({
      subscription: producer.subscription || { level: 'gratuit', active: true },
      producerId: producerId,
      producerType: getProducerType(producer)
    });
  } catch (error) {
    console.error('❌ Erreur lors de la récupération de l\'abonnement:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Changer le niveau d'abonnement
router.post('/change-subscription', async (req, res) => {
  try {
    const { producerId, newSubscriptionLevel, customerId } = req.body;
    
    if (!producerId || !newSubscriptionLevel) {
      return res.status(400).json({ error: 'ID du producteur et nouveau niveau requis' });
    }
    
    // Vérifier que le niveau existe
    if (!subscriptionLevels[newSubscriptionLevel]) {
      return res.status(400).json({ error: 'Niveau d\'abonnement non valide' });
    }
    
    // Si le niveau est gratuit, pas besoin de paiement
    if (newSubscriptionLevel === 'gratuit') {
      await updateSubscriptionInAllCollections(producerId, {
        level: 'gratuit',
        active: true,
        updatedAt: new Date()
      });
      
      return res.status(200).json({
        success: true,
        message: 'Abonnement mis à jour avec succès',
        subscription: { level: 'gratuit', active: true }
      });
    }
    
    // Pour les niveaux payants, créer un intent de paiement
    const amount = subscriptionLevels[newSubscriptionLevel].price;
    
    // Créer un intent de paiement via Stripe
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amount * 100, // Conversion en centimes
      currency: 'eur',
      customer: customerId,
      payment_method_types: ['card'],
      metadata: {
        producerId,
        subscriptionLevel: newSubscriptionLevel
      }
    });
    
    // Créer une clé éphémère pour le client
    const ephemeralKey = await stripe.ephemeralKeys.create(
      { customer: customerId },
      { apiVersion: '2023-10-16' }
    );
    
    // Mettre à jour l'état comme "en attente"
    await updateSubscriptionInAllCollections(producerId, {
      level: newSubscriptionLevel,
      active: false,
      pendingPayment: true,
      pendingPaymentIntentId: paymentIntent.id,
      updatedAt: new Date()
    });
    
    res.status(200).json({
      clientSecret: paymentIntent.client_secret,
      ephemeralKey: ephemeralKey.secret,
      customerId: customerId,
      paymentIntentId: paymentIntent.id
    });
  } catch (error) {
    console.error('❌ Erreur lors du changement d\'abonnement:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Mettre à jour l'abonnement gratuit
router.post('/update-free-tier', async (req, res) => {
  try {
    const { producerId } = req.body;
    
    if (!producerId) {
      return res.status(400).json({ error: 'ID du producteur requis' });
    }
    
    // Mettre à jour l'abonnement comme gratuit
    await updateSubscriptionInAllCollections(producerId, {
      level: 'gratuit',
      active: true,
      updatedAt: new Date()
    });
    
    res.status(200).json({
      success: true,
      message: 'Abonnement gratuit activé avec succès'
    });
  } catch (error) {
    console.error('❌ Erreur lors de la mise à jour vers l\'abonnement gratuit:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Créer un intent de paiement pour un abonnement
router.post('/create-payment-intent', async (req, res) => {
  try {
    const { amount, currency = 'eur', producerId, plan } = req.body;
    
    if (!amount || !producerId || !plan) {
      return res.status(400).json({ error: 'Montant, ID producteur et plan sont requis' });
    }
    
    // Créer l'intention de paiement avec Stripe
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100), // Convertir en centimes
      currency,
      description: `Abonnement ${plan} - Choice App`,
      metadata: { 
        producerId,
        plan,
        subscriptionType: 'recurring',
        subscriptionStart: new Date().toISOString()
      },
      payment_method_types: ['card', 'sepa_debit'],
    });
    
    // Mettre à jour le statut d'abonnement comme "en attente"
    await updateSubscriptionInAllCollections(producerId, {
      level: plan,
      active: false,
      pendingPayment: true,
      pendingPaymentIntentId: paymentIntent.id,
      updatedAt: new Date()
    });
    
    // Retourner les données nécessaires au client
    res.status(200).json({
      client_secret: paymentIntent.client_secret,
      payment_intent_id: paymentIntent.id
    });
  } catch (error) {
    console.error('❌ Erreur lors de la création de l\'intention de paiement:', error);
    res.status(500).json({ error: 'Erreur lors de la création de l\'intention de paiement' });
  }
});

// Webhook Stripe pour activer un abonnement après paiement réussi
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    const sig = req.headers['stripe-signature'];
    
    if (!sig) {
      return res.status(400).json({ error: 'Signature Stripe manquante' });
    }
    
    // Vérifier la signature de l'événement
    const event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
    
    if (event.type === 'payment_intent.succeeded') {
      const paymentIntent = event.data.object;
      const { producerId, subscriptionLevel } = paymentIntent.metadata;
      
      if (producerId && subscriptionLevel) {
        // Activer l'abonnement
        await updateSubscriptionInAllCollections(producerId, {
          level: subscriptionLevel,
          active: true,
          pendingPayment: false,
          pendingPaymentIntentId: null,
          updatedAt: new Date(),
          startDate: new Date(),
          endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // +30 jours
        });
        
        console.log(`✅ Abonnement ${subscriptionLevel} activé pour le producteur: ${producerId}`);
      }
    }
    
    res.status(200).json({ received: true });
  } catch (error) {
    console.error('❌ Erreur lors du traitement du webhook Stripe:', error);
    res.status(400).json({ error: 'Erreur lors du traitement du webhook' });
  }
});

/**
 * @route GET /api/subscription/check-feature-access
 * @desc Vérifier si un producteur a accès à une fonctionnalité spécifique
 * @access Public
 */
router.get('/check-feature-access', async (req, res) => {
  try {
    const { producerId, featureId } = req.query;
    
    if (!producerId || !featureId) {
      return res.status(400).json({ message: 'ID du producteur et ID de fonctionnalité requis' });
    }
    
    // Trouver le producteur dans toutes les collections
    const producer = await findProducerInAnyCollection(producerId);
    
    if (!producer) {
      return res.status(404).json({ error: 'Producteur non trouvé' });
    }
    
    // Déterminer le niveau d'abonnement
    const subscriptionLevel = producer.subscription?.level || 'gratuit';
    
    // Mapping des fonctionnalités par niveau
    const featureLevelMap = {
      'advanced_analytics': 'starter',
      'premium_placement': 'starter',
      'simple_campaigns': 'starter',
      'customizable_menu': 'pro',
      'detailed_heatmap': 'pro',
      'growth_predictions': 'pro',
      'audience_demographics': 'pro',
      'marketing_tools': 'legend',
      'campaign_automation': 'legend',
      'advanced_targeting': 'legend',
      'ai_content_generation': 'legend',
    };
    
    // Niveau requis pour la fonctionnalité
    const requiredLevel = featureLevelMap[featureId] || 'gratuit';
    
    // Vérifier si le niveau actuel donne accès à cette fonctionnalité
    const levels = ['gratuit', 'starter', 'pro', 'legend'];
    const currentLevelIndex = levels.indexOf(subscriptionLevel);
    const requiredLevelIndex = levels.indexOf(requiredLevel);
    
    const hasAccess = currentLevelIndex >= requiredLevelIndex;
    
    res.status(200).json({ 
      hasAccess, 
      currentLevel: subscriptionLevel,
      requiredLevel
    });
  } catch (error) {
    console.error('❌ Erreur lors de la vérification de l\'accès:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Fonction pour trouver un producteur dans n'importe quelle collection
async function findProducerInAnyCollection(producerId) {
  if (!mongoose.Types.ObjectId.isValid(producerId)) {
    return null;
  }
  
  const id = new mongoose.Types.ObjectId(producerId);
  
  // Chercher dans la base de restauration
  let producer = await Producer.findById(id);
  if (producer) return producer;
  
  // Chercher dans la base de loisirs
  producer = await LeisureProducer.findById(id);
  if (producer) return producer;
  
  // Chercher dans la base de bien-être
  producer = await WellnessProducer.findById(id);
  return producer;
}

// Fonction pour mettre à jour l'abonnement dans toutes les collections
async function updateSubscriptionInAllCollections(producerId, subscriptionData) {
  if (!mongoose.Types.ObjectId.isValid(producerId)) {
    return false;
  }
  
  const id = new mongoose.Types.ObjectId(producerId);
  
  // Mettre à jour dans toutes les collections pour être sûr
  const updatePromises = [
    Producer.findByIdAndUpdate(id, { $set: { subscription: subscriptionData } }),
    LeisureProducer.findByIdAndUpdate(id, { $set: { subscription: subscriptionData } }),
    WellnessProducer.findByIdAndUpdate(id, { $set: { subscription: subscriptionData } })
  ];
  
  await Promise.all(updatePromises);
  return true;
}

// Fonction pour déterminer le type de producteur
function getProducerType(producer) {
  // Utiliser la structure des données pour déterminer le type
  if (producer.type_cuisine || producer.cuisine_type) {
    return 'restaurant';
  } else if (producer.type_activite || producer.activity_type) {
    return 'leisureProducer';
  } else if (producer.services || producer.treatments) {
    return 'wellnessProducer';
  } else {
    return 'unknown';
  }
}

module.exports = router;

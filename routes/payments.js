const express = require('express');
const router = express.Router();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const User = require('../models/User');
const BeautyProducer = require('../models/beautyProducer');
const Producer = require('../models/Producer');

// Middleware d'authentification (à importer si nécessaire)
const auth = async (req, res, next) => {
  // Votre logique d'authentification ici
  next();
};

// POST /api/payments/create-payment-intent - Créer une intention de paiement
router.post('/create-payment-intent', auth, async (req, res) => {
  try {
    const { amount, currency = 'eur', description, metadata = {}, payment_method_types = ['card'] } = req.body;
    
    if (!amount) {
      return res.status(400).json({ error: 'Le montant est requis' });
    }
    
    // Créer l'intention de paiement avec Stripe
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100), // Convertir en centimes
      currency,
      description,
      metadata: { 
        userId: req.user?.id,
        ...metadata
      },
      payment_method_types,
    });
    
    // Retourner le client secret pour terminer le paiement côté client
    res.status(200).json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id
    });
  } catch (error) {
    console.error('Erreur lors de la création de l\'intention de paiement:', error);
    res.status(500).json({ error: 'Erreur lors de la création de l\'intention de paiement' });
  }
});

// POST /api/payments/create-customer - Créer un client Stripe
router.post('/create-customer', async (req, res) => {
  try {
    const { email, name } = req.body;
    
    if (!email) {
      return res.status(400).json({ error: 'L\'email est requis pour créer un client' });
    }
    
    // Créer un client Stripe
    const customer = await stripe.customers.create({
      email,
      name: name || email.split('@')[0],
      metadata: {
        appSource: 'choice_app'
      }
    });
    
    // Créer une clé éphémère pour ce client
    const ephemeralKey = await stripe.ephemeralKeys.create(
      { customer: customer.id },
      { apiVersion: '2023-10-16' }
    );
    
    res.status(200).json({
      customerId: customer.id,
      ephemeralKey: ephemeralKey.secret
    });
  } catch (error) {
    console.error('Erreur lors de la création du client Stripe:', error);
    res.status(500).json({ error: 'Erreur lors de la création du client Stripe' });
  }
});

// POST /api/payments/setup-intent - Créer un intent de configuration pour enregistrer une carte
router.post('/setup-intent', async (req, res) => {
  try {
    const { customerId } = req.body;
    
    if (!customerId) {
      return res.status(400).json({ error: 'L\'ID du client est requis' });
    }
    
    // Créer un intent de configuration pour enregistrer une méthode de paiement
    const setupIntent = await stripe.setupIntents.create({
      customer: customerId,
      payment_method_types: ['card'],
    });
    
    res.status(200).json({
      clientSecret: setupIntent.client_secret,
      setupIntentId: setupIntent.id
    });
  } catch (error) {
    console.error('Erreur lors de la création de l\'intent de configuration:', error);
    res.status(500).json({ error: 'Erreur lors de la création de l\'intent de configuration' });
  }
});

// POST /api/payments/book-appointment - Réserver un rendez-vous avec paiement
router.post('/book-appointment', auth, async (req, res) => {
  try {
    const { beautyProducerId, slotId, amount, currency = 'eur', service } = req.body;
    
    if (!beautyProducerId || !slotId || !amount || !service) {
      return res.status(400).json({ error: 'Données de réservation incomplètes' });
    }
    
    // Vérifier que l'établissement existe
    const beautyProducer = await BeautyProducer.findById(beautyProducerId);
    if (!beautyProducer) {
      return res.status(404).json({ error: 'Établissement non trouvé' });
    }
    
    // Vérifier que le créneau existe et est disponible
    let slotIndex = -1;
    beautyProducer.appointment_system.slots.forEach((slot, index) => {
      if (slot._id.toString() === slotId && !slot.booked) {
        slotIndex = index;
      }
    });
    
    if (slotIndex === -1) {
      return res.status(400).json({ error: 'Créneau non disponible ou déjà réservé' });
    }
    
    // Créer l'intention de paiement avec Stripe
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100), // Convertir en centimes
      currency,
      description: `Réservation: ${service} chez ${beautyProducer.name}`,
      metadata: {
        userId: req.user.id,
        beautyProducerId,
        slotId,
        service
      },
      payment_method_types: ['card'],
    });
    
    // Marquer le créneau comme temporairement réservé (il sera confirmé après paiement réussi)
    beautyProducer.appointment_system.slots[slotIndex].booked = true;
    beautyProducer.appointment_system.slots[slotIndex].booked_by = req.user.id;
    beautyProducer.appointment_system.slots[slotIndex].payment_intent_id = paymentIntent.id;
    await beautyProducer.save();
    
    res.status(200).json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      appointment: {
        date: beautyProducer.appointment_system.slots[slotIndex].date,
        start_time: beautyProducer.appointment_system.slots[slotIndex].start_time,
        end_time: beautyProducer.appointment_system.slots[slotIndex].end_time,
        service
      }
    });
  } catch (error) {
    console.error('Erreur lors de la réservation avec paiement:', error);
    res.status(500).json({ error: 'Erreur lors de la réservation avec paiement' });
  }
});

// POST /api/payments/webhook - Webhook pour les événements Stripe
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    const signature = req.headers['stripe-signature'];
    
    if (!signature) {
      return res.status(400).json({ error: 'Signature Stripe manquante' });
    }
    
    // Vérifier la signature de l'événement avec la clé de webhook
    const event = stripe.webhooks.constructEvent(
      req.body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    );
    
    // Traiter les différents types d'événements
    switch (event.type) {
      case 'payment_intent.succeeded':
        // Paiement réussi
        await handleSuccessfulPayment(event.data.object);
        break;
      
      case 'payment_intent.payment_failed':
        // Paiement échoué
        await handleFailedPayment(event.data.object);
        break;
        
      case 'payment_intent.canceled':
        // Paiement annulé
        await handleCanceledPayment(event.data.object);
        break;
    }
    
    res.status(200).json({ received: true });
  } catch (error) {
    console.error('Erreur lors du traitement du webhook Stripe:', error);
    res.status(400).json({ error: 'Erreur lors du traitement du webhook' });
  }
});

// POST /api/payments/update-subscription - Mettre à jour un abonnement et enregistrer la transaction
router.post('/update-subscription', async (req, res) => {
  try {
    const { producerId, plan, paymentIntentId } = req.body;
    
    if (!producerId || !plan) {
      return res.status(400).json({ error: 'ProducerId et plan sont requis' });
    }
    
    // Trouver le producer
    const producer = await Producer.findById(producerId);
    if (!producer) {
      return res.status(404).json({ error: 'Producteur non trouvé' });
    }
    
    // Vérifier si le plan est différent de l'actuel
    const currentPlan = producer.subscription?.level || 'gratuit';
    const newPlan = plan.toLowerCase();
    
    if (newPlan === currentPlan) {
      return res.status(200).json({ 
        message: "Le producteur est déjà sur ce plan d'abonnement",
        subscription: producer.subscription
      });
    }
    
    // Récupérer le prix du plan
    const planPrices = {
      'gratuit': 0,
      'starter': 500, // 5€
      'pro': 1000,    // 10€
      'legend': 1500  // 15€
    };
    
    const amount = planPrices[newPlan] || 0;
    
    // Mettre à jour l'abonnement
    const previousLevel = producer.subscription?.level || 'gratuit';
    
    // Si le producer n'a pas encore de subscription, créer un objet
    if (!producer.subscription) {
      producer.subscription = {
        level: newPlan,
        start_date: new Date(),
        end_date: new Date(new Date().setMonth(new Date().getMonth() + 1)), // +1 mois
        status: 'active',
        auto_renew: true
      };
    } else {
      // Mettre à jour l'abonnement existant
      producer.subscription.level = newPlan;
      producer.subscription.start_date = new Date();
      producer.subscription.end_date = new Date(new Date().setMonth(new Date().getMonth() + 1));
      producer.subscription.status = 'active';
    }
    
    // Ajouter à l'historique des abonnements
    if (!producer.subscription_history) {
      producer.subscription_history = [];
    }
    
    producer.subscription_history.push({
      previous_level: previousLevel,
      new_level: newPlan,
      date: new Date(),
      reason: 'user_upgrade',
      subscription_id: paymentIntentId
    });
    
    // Ajouter à l'historique des transactions si ce n'est pas un plan gratuit
    if (newPlan !== 'gratuit' && amount > 0) {
      if (!producer.transaction_history) {
        producer.transaction_history = [];
      }
      
      producer.transaction_history.push({
        transaction_id: paymentIntentId || `manual_${Date.now()}`,
        type: 'subscription',
        amount: amount / 100, // Convertir les centimes en euros
        currency: 'EUR',
        status: 'succeeded',
        payment_method: 'stripe',
        description: `Abonnement ${newPlan}`,
        created_at: new Date()
      });
    }
    
    await producer.save();
    
    res.status(200).json({
      message: "Abonnement mis à jour avec succès",
      subscription: producer.subscription,
      subscription_history: producer.subscription_history,
      transaction_history: producer.transaction_history
    });
    
  } catch (error) {
    console.error('Erreur lors de la mise à jour de l\'abonnement:', error);
    res.status(500).json({ error: 'Erreur lors de la mise à jour de l\'abonnement' });
  }
});

// GET /api/payments/transaction-history/:producerId - Récupérer l'historique des transactions
router.get('/transaction-history/:producerId', async (req, res) => {
  try {
    const { producerId } = req.params;
    
    if (!producerId) {
      return res.status(400).json({ error: 'ProducerId est requis' });
    }
    
    // Trouver le producer
    const producer = await Producer.findById(producerId);
    if (!producer) {
      return res.status(404).json({ error: 'Producteur non trouvé' });
    }
    
    // Récupérer l'historique des transactions
    const transactions = producer.transaction_history || [];
    const subscriptionHistory = producer.subscription_history || [];
    
    res.status(200).json({
      transactions,
      subscription_history: subscriptionHistory,
      current_subscription: producer.subscription || { level: 'gratuit', status: 'active' }
    });
    
  } catch (error) {
    console.error('Erreur lors de la récupération de l\'historique des transactions:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération de l\'historique des transactions' });
  }
});

// Fonction pour traiter un paiement réussi
async function handleSuccessfulPayment(paymentIntent) {
  const { userId, beautyProducerId, slotId, service } = paymentIntent.metadata;
  
  // Si c'est une réservation de rendez-vous
  if (beautyProducerId && slotId) {
    // Confirmer la réservation du créneau
    await BeautyProducer.updateOne(
      { 
        _id: beautyProducerId,
        'appointment_system.slots._id': slotId,
        'appointment_system.slots.payment_intent_id': paymentIntent.id
      },
      { 
        $set: { 
          'appointment_system.slots.$.confirmed': true,
          'appointment_system.slots.$.payment_status': 'paid'
        }
      }
    );
    
    // Créer un enregistrement de la transaction
    // Logique à implémenter selon vos besoins
    
    // Envoyer une notification ou un email de confirmation
    // Logique à implémenter selon vos besoins
  }
  
  // Si c'est un paiement d'abonnement
  if (paymentIntent.metadata.subscription_plan && paymentIntent.metadata.producerId) {
    try {
      const { producerId, subscription_plan } = paymentIntent.metadata;
      
      // Trouver le producer
      const producer = await Producer.findById(producerId);
      if (!producer) {
        console.error(`Producer non trouvé pour l'ID: ${producerId}`);
        return;
      }
      
      // Mettre à jour l'abonnement
      if (!producer.subscription) {
        producer.subscription = {};
      }
      
      const previousLevel = producer.subscription.level || 'gratuit';
      
      producer.subscription.level = subscription_plan;
      producer.subscription.start_date = new Date();
      producer.subscription.end_date = new Date(new Date().setMonth(new Date().getMonth() + 1));
      producer.subscription.status = 'active';
      producer.subscription.stripe_subscription_id = paymentIntent.id;
      
      // Ajouter à l'historique
      if (!producer.subscription_history) {
        producer.subscription_history = [];
      }
      
      producer.subscription_history.push({
        previous_level: previousLevel,
        new_level: subscription_plan,
        date: new Date(),
        reason: 'payment_successful',
        subscription_id: paymentIntent.id
      });
      
      // Ajouter la transaction
      if (!producer.transaction_history) {
        producer.transaction_history = [];
      }
      
      producer.transaction_history.push({
        transaction_id: paymentIntent.id,
        type: 'subscription',
        amount: paymentIntent.amount / 100,
        currency: paymentIntent.currency,
        status: 'succeeded',
        payment_method: paymentIntent.payment_method_types[0],
        description: `Abonnement ${subscription_plan}`,
        created_at: new Date()
      });
      
      await producer.save();
      console.log(`✅ Abonnement mis à jour pour le producteur ${producerId} au plan ${subscription_plan}`);
    } catch (error) {
      console.error('Erreur lors de la mise à jour de l\'abonnement:', error);
    }
  }
}

// Fonction pour traiter un paiement échoué
async function handleFailedPayment(paymentIntent) {
  const { beautyProducerId, slotId } = paymentIntent.metadata;
  
  // Si c'est une réservation de rendez-vous
  if (beautyProducerId && slotId) {
    // Libérer le créneau qui était temporairement réservé
    await BeautyProducer.updateOne(
      {
        _id: beautyProducerId,
        'appointment_system.slots._id': slotId,
        'appointment_system.slots.payment_intent_id': paymentIntent.id
      },
      {
        $set: {
          'appointment_system.slots.$.booked': false,
          'appointment_system.slots.$.booked_by': null,
          'appointment_system.slots.$.payment_intent_id': null,
          'appointment_system.slots.$.payment_status': 'failed'
        }
      }
    );
  }
}

// Fonction pour traiter un paiement annulé
async function handleCanceledPayment(paymentIntent) {
  // Même logique que pour un paiement échoué
  await handleFailedPayment(paymentIntent);
}

module.exports = router; 
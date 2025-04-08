const express = require('express');
const router = express.Router();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const User = require('../models/user');
const BeautyProducer = require('../models/beautyProducer');
const Producer = require('../models/producer');

// Middleware d'authentification (à importer si nécessaire)
const auth = async (req, res, next) => {
  // Votre logique d'authentification ici
  next();
};

// POST /api/payment/create-payment-intent - Alias pour la compatibilité avec la nouvelle version du frontend
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

// POST /api/payment/create-customer - Alias pour la compatibilité avec la nouvelle version du frontend
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
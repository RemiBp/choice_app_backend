const express = require('express');
const router = express.Router();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const User = require('../models/User');
const mongoose = require('mongoose'); // Import mongoose

// Import producer models and database connections (adjust paths if necessary)
const { restaurationDb, loisirsDb, beautyWellnessDb } = require('../index');
const Producer = restaurationDb?.models?.Producer; 
const LeisureProducer = loisirsDb?.models?.LeisureProducer;
const WellnessProducer = beautyWellnessDb?.models?.WellnessProducer; // Adjust model name if necessary

// Middleware d'authentification (à importer si nécessaire)
const { requireAuth } = require('../middleware/authMiddleware');

// --- Helper Function to find Producer across DBs --- 
async function findProducerById(producerId) {
  if (!mongoose.Types.ObjectId.isValid(producerId)) {
    return null;
  }
  
  let producer = null;
  let producerType = null;

  // Get models safely, checking if connections exist
  const ProducerModel = restaurationDb?.models?.Producer || (restaurationDb ? restaurationDb.model('Producer') : null);
  const LeisureProducerModel = loisirsDb?.models?.LeisureProducer || (loisirsDb ? loisirsDb.model('LeisureProducer') : null);
  const WellnessProducerModel = beautyWellnessDb?.models?.WellnessProducer || (beautyWellnessDb ? beautyWellnessDb.model('WellnessProducer') : null);

  try {
      if (ProducerModel) {
        const found = await ProducerModel.findById(producerId).select('subscription name lieu photo'); 
        if (found) {
            producer = found;
            producerType = 'restaurant';
        } 
      }
      if (!producer && LeisureProducerModel) {
        const found = await LeisureProducerModel.findById(producerId).select('subscription name lieu photo');
        if (found) {
            producer = found;
            producerType = 'leisure';
        }
      }
      if (!producer && WellnessProducerModel) {
        const found = await WellnessProducerModel.findById(producerId).select('subscription name lieu photo'); 
        if (found) {
            producer = found;
            producerType = 'wellness';
        }
      }
  } catch (dbError) {
      console.error(`Database error finding producer ${producerId}:`, dbError);
      return null; // Return null on database error
  }
  
  if (!producer) return null;

  return { producer, producerType }; // Return the Mongoose document and its type
}
// --- End Helper Function ---

// POST /api/payments/create-payment-intent - Créer une intention de paiement
// Ensure metadata includes producerId, producerType (if known), and newLevel for subscriptions
router.post('/create-payment-intent', requireAuth, async (req, res) => {
  try {
    const { amount, currency = 'eur', description, metadata = {}, payment_method_types = ['card'] } = req.body;
    
    if (!amount) {
      return res.status(400).json({ error: 'Le montant est requis' });
    }

    // Ensure user ID is included if available from auth middleware
    const userId = req.user?.id || metadata.userId; // Prioritize auth middleware
    const finalMetadata = { 
        ...metadata, // Keep original metadata
        userId: userId, // Add or overwrite userId
      };

    // Create payment intent with Stripe
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100), // Convert to cents
      currency,
      description,
      metadata: finalMetadata, // Use the combined metadata
      payment_method_types,
    });
    
    // Return client secret to complete payment on client-side
    res.status(200).json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id
    });
  } catch (error) {
    console.error(`Erreur lors de la création de l'intention de paiement:`, error);
    res.status(500).json({ error: `Erreur lors de la création de l'intention de paiement` });
  }
});

// POST /api/payments/create-customer - Créer un client Stripe
router.post('/create-customer', async (req, res) => {
  try {
    const { email, name } = req.body;
    
    if (!email) {
      return res.status(400).json({ error: 'L\'email est requis pour créer un client' });
    }
    
    // Create Stripe customer
    const customer = await stripe.customers.create({
      email,
      name: name || email.split('@')[0],
      metadata: {
        appSource: 'choice_app'
      }
    });
    
    // Create ephemeral key for this customer
    const ephemeralKey = await stripe.ephemeralKeys.create(
      { customer: customer.id },
      { apiVersion: '2023-10-16' } // Use a recent API version
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

// POST /api/payments/setup-intent - Créer un intent de configuration
router.post('/setup-intent', async (req, res) => {
  try {
    const { customerId } = req.body;
    
    if (!customerId) {
      return res.status(400).json({ error: 'L\'ID du client est requis' });
    }
    
    // Create setup intent to save payment method
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

// POST /api/payments/book-appointment - Réserver un rendez-vous
router.post('/book-appointment', requireAuth, async (req, res) => {
  const BeautyProducerModel = beautyWellnessDb?.models?.WellnessProducer || beautyWellnessDb?.model('WellnessProducer');
  if (!BeautyProducerModel) {
      return res.status(500).json({ error: 'BeautyProducer model not available' });
  }
  
  try {
      const { beautyProducerId, slotId, amount, currency = 'eur', service } = req.body;
      const userId = req.user?.id; // Get user ID from auth middleware

      if (!userId) {
         return res.status(401).json({ error: 'Authentication required' });
      }
      
      if (!beautyProducerId || !slotId || !amount || !service) {
        return res.status(400).json({ error: 'Données de réservation incomplètes' });
      }
      
      // Find the establishment
      const beautyProducer = await BeautyProducerModel.findById(beautyProducerId);
      if (!beautyProducer) {
        return res.status(404).json({ error: 'Établissement non trouvé' });
      }
      
      // Find the slot and check availability
      const slot = beautyProducer.appointment_system?.slots?.id(slotId);
      if (!slot || slot.booked) {
         return res.status(400).json({ error: 'Créneau non disponible ou déjà réservé' });
      }
      
      // Create payment intent with Stripe
      const paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(amount * 100), // Convert to cents
        currency,
        description: `Réservation: ${service} chez ${beautyProducer.name || 'Établissement'}`,
        metadata: {
          userId: userId,
          beautyProducerId,
          slotId,
          service,
          type: 'appointment_booking' // Add type for webhook identification
        },
        payment_method_types: ['card'],
      });
      
      // Temporarily mark the slot as booked
      slot.booked = true;
      slot.booked_by = userId;
      slot.payment_intent_id = paymentIntent.id;
      await beautyProducer.save();
      
      res.status(200).json({
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id,
        appointment: {
          date: slot.date,
          start_time: slot.start_time,
          end_time: slot.end_time,
          service
        }
      });
  } catch (error) {
      console.error('Erreur lors de la réservation avec paiement:', error);
      // Attempt to revert booking status if payment intent creation failed or something else went wrong before response
      // This part might need more robust error handling (e.g., if producer.save() fails)
      // For now, just log and return error
      res.status(500).json({ error: 'Erreur lors de la réservation avec paiement' });
  }
});

// POST /api/payments/webhook - Webhook pour les événements Stripe
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  let event;
  try {
    const signature = req.headers['stripe-signature'];
    
    if (!process.env.STRIPE_WEBHOOK_SECRET) {
        console.error('❌ STRIPE_WEBHOOK_SECRET not set');
        return res.status(500).json({ error: 'Webhook secret not configured' });
    }
    if (!signature) {
      return res.status(400).json({ error: 'Signature Stripe manquante' });
    }
    
    // Verify the event signature with the webhook secret
    event = stripe.webhooks.constructEvent(
      req.body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    );

  } catch (err) {
      console.error(`❌ Erreur vérification webhook Stripe: ${err.message}`);
      return res.status(400).send(`Webhook Error: ${err.message}`);
  }
    
  // Handle the event
  switch (event.type) {
    case 'payment_intent.succeeded':
      const paymentIntentSucceeded = event.data.object;
      console.log(`✅ Webhook: PaymentIntent succeeded: ${paymentIntentSucceeded.id}`);
      await handleSuccessfulPayment(paymentIntentSucceeded);
      break;
    
    case 'payment_intent.payment_failed':
      const paymentIntentFailed = event.data.object;
      console.log(`❌ Webhook: PaymentIntent failed: ${paymentIntentFailed.id}`);
      await handleFailedPayment(paymentIntentFailed);
      break;
      
    case 'payment_intent.canceled':
      const paymentIntentCanceled = event.data.object;
      console.log(`🚫 Webhook: PaymentIntent canceled: ${paymentIntentCanceled.id}`);
      await handleCanceledPayment(paymentIntentCanceled);
      break;
    // ... handle other event types needed
    
    default:
      console.log(`🤷‍♀️ Webhook: Unhandled event type ${event.type}`);
  }
  
  // Return a 200 response to acknowledge receipt of the event
  res.status(200).json({ received: true });
});

// GET /api/payments/transaction-history/:producerId - Récupérer l'historique des transactions
router.get('/transaction-history/:producerId', requireAuth, async (req, res) => { // Added auth middleware
  try {
    const { producerId } = req.params;
    
    if (!producerId) {
      return res.status(400).json({ error: 'ProducerId est requis' });
    }
    
    // Find the producer across all types
    const result = await findProducerById(producerId);
    if (!result || !result.producer) {
      return res.status(404).json({ error: 'Producteur non trouvé' });
    }
    
    const producer = result.producer; // The actual producer document (Mongoose object)
    
    // Retrieve transaction history and subscription history
    const transactions = producer.transaction_history || [];
    const subscriptionHistory = producer.subscription_history || [];
    
    res.status(200).json({
      transactions,
      subscription_history: subscriptionHistory,
      current_subscription: producer.subscription || { level: 'gratuit', status: 'active' }
    });
    
  } catch (error) {
    console.error(`Erreur lors de la récupération de l'historique:`, error);
    res.status(500).json({ error: `Erreur lors de la récupération de l'historique` });
  }
});

// --- Webhook Handler Functions --- 

// Fonction pour traiter un paiement réussi
async function handleSuccessfulPayment(paymentIntent) {
  const metadata = paymentIntent.metadata || {};
  const { userId, producerId, subscription_plan, producerType, type } = metadata; // producerType might be needed

  // ---- Handle Subscription Payment ----
  if ((type === 'subscription' || subscription_plan) && producerId) { // Check if it's a subscription payment
    console.log(`Processing successful subscription payment for producer ${producerId}, plan ${subscription_plan}`);
    try {
      // Find the correct producer (Restaurant, Leisure, or Wellness)
      const result = await findProducerById(producerId);
      if (!result || !result.producer) {
        console.error(`[Webhook] Producer not found for ID: ${producerId}`);
        return; // Cannot proceed without producer
      }
      const producer = result.producer; // This is the Mongoose document
      const actualProducerType = result.producerType;
      
      // Update subscription details on the producer document
      const previousLevel = producer.subscription?.level || 'gratuit';
      const newPlan = subscription_plan;
      const now = new Date();
      const endDate = new Date(now.getFullYear(), now.getMonth() + 1, now.getDate()); // Simple +1 month logic
      // TODO: Add more robust end_date calculation (e.g., based on yearly/monthly plan type)

      producer.subscription = {
        ...(producer.subscription || {}),
        level: newPlan,
        start_date: now,
        end_date: endDate,
        status: 'active',
        stripe_subscription_id: paymentIntent.id, // Or link to a Stripe Subscription ID if using Stripe Subscriptions
        auto_renew: true // Default auto-renew, adjust as needed
      };
      
      // Add to subscription history
      if (!producer.subscription_history) {
        producer.subscription_history = [];
      }
      producer.subscription_history.push({
        previous_level: previousLevel,
        new_level: newPlan,
        date: now,
        reason: 'payment_successful',
        transaction_id: paymentIntent.id // Link history to payment intent
      });
      
      // Add to transaction history
      if (!producer.transaction_history) {
        producer.transaction_history = [];
      }
      producer.transaction_history.push({
        transaction_id: paymentIntent.id,
        type: 'subscription',
        amount: paymentIntent.amount / 100,
        currency: paymentIntent.currency.toUpperCase(),
        status: 'succeeded',
        payment_method: paymentIntent.payment_method_types ? paymentIntent.payment_method_types[0] : 'card',
        description: `Abonnement ${newPlan}`,
        created_at: new Date(paymentIntent.created * 1000) // Use Stripe timestamp
      });
      
      // Save the updated producer document
      await producer.save();
      console.log(`✅ [Webhook] Subscription updated for ${actualProducerType} producer ${producerId} to plan ${newPlan}`);

    } catch (error) {
      console.error(`[Webhook] Error updating subscription for producer ${producerId}:`, error);
      // Consider adding retry logic or logging for investigation
    }
  }
  // ---- Handle Appointment Booking Payment ----
  else if (type === 'appointment_booking' && metadata.beautyProducerId && metadata.slotId) {
      const { beautyProducerId, slotId } = metadata;
      console.log(`Processing successful appointment payment for beautyProducer ${beautyProducerId}, slot ${slotId}`);
      try {
        const BeautyProducerModel = beautyWellnessDb?.models?.WellnessProducer || beautyWellnessDb?.model('WellnessProducer');
        if (!BeautyProducerModel) {
           console.error("[Webhook] BeautyProducer model not available for appointment confirmation.");
           return;
        }
        // Confirm the booking slot
        const updateResult = await BeautyProducerModel.updateOne(
          { 
            _id: beautyProducerId,
            'appointment_system.slots._id': slotId,
            'appointment_system.slots.payment_intent_id': paymentIntent.id // Ensure we update the correct slot linked to this payment
          },
          { 
            $set: { 
              'appointment_system.slots.$.confirmed': true,
              'appointment_system.slots.$.payment_status': 'paid'
            }
          }
        );

        if (updateResult.modifiedCount > 0) {
             console.log(`✅ [Webhook] Appointment confirmed for beautyProducer ${beautyProducerId}, slot ${slotId}`);
             // TODO: Send confirmation notification/email to user and/or producer
        } else {
             console.warn(`[Webhook] Appointment slot ${slotId} for beautyProducer ${beautyProducerId} not updated. Already confirmed or paymentIntentId mismatch?`);
        }

      } catch(error) {
           console.error(`[Webhook] Error confirming appointment for beautyProducer ${beautyProducerId}, slot ${slotId}:`, error);
      }
  }
  // ---- Handle Other Payment Types ----
  else {
    console.log(`[Webhook] Successful payment processed for intent ${paymentIntent.id}, but not recognized as subscription or appointment.`);
    // Handle other potential payment types here if needed
  }
}

// Fonction pour traiter un paiement échoué
async function handleFailedPayment(paymentIntent) {
  const metadata = paymentIntent.metadata || {};
  const { type } = metadata;
  console.log(`Processing failed/canceled payment for intent ${paymentIntent.id}, type: ${type}`);

  // ---- Handle Failed/Canceled Appointment Booking ----
  if (type === 'appointment_booking' && metadata.beautyProducerId && metadata.slotId) {
    const { beautyProducerId, slotId } = metadata;
    try {
        const BeautyProducerModel = beautyWellnessDb?.models?.WellnessProducer || beautyWellnessDb?.model('WellnessProducer');
        if (!BeautyProducerModel) {
            console.error("[Webhook] BeautyProducer model not available for appointment cancellation.");
            return;
        }
      // Release the slot that was temporarily booked
      const updateResult = await BeautyProducerModel.updateOne(
        {
          _id: beautyProducerId,
          'appointment_system.slots._id': slotId,
          'appointment_system.slots.payment_intent_id': paymentIntent.id // Match the payment intent
        },
        {
          $set: {
            'appointment_system.slots.$.booked': false,
            'appointment_system.slots.$.booked_by': null,
            'appointment_system.slots.$.payment_intent_id': null,
            'appointment_system.slots.$.payment_status': 'failed' // Or 'canceled'
          }
        }
      );
      if (updateResult.modifiedCount > 0) {
            console.log(`✅ [Webhook] Appointment slot ${slotId} released for beautyProducer ${beautyProducerId} due to failed/canceled payment.`);
            // TODO: Notify user of failure/cancellation
      } else {
            console.warn(`[Webhook] Appointment slot ${slotId} for beautyProducer ${beautyProducerId} not updated during failure/cancellation. Already released or paymentIntentId mismatch?`);
      }
    } catch(error) {
        console.error(`[Webhook] Error releasing appointment slot ${slotId} for beautyProducer ${beautyProducerId}:`, error);
    }
  }
  // ---- Handle Failed Subscription Payment ----
  else if (type === 'subscription' && metadata.producerId) {
      const { producerId } = metadata;
      console.warn(`[Webhook] Subscription payment failed/canceled for producer ${producerId}. Action: Check producer status, potentially downgrade.`);
      // TODO: Implement logic if needed (e.g., mark subscription as 'past_due' or 'unpaid' after grace period)
  }
  // ---- Handle Other Failed/Canceled Payments ----
  else {
      console.log(`[Webhook] Failed/canceled payment processed for intent ${paymentIntent.id}, but not recognized type or missing metadata.`);
  }
}

// Fonction pour traiter un paiement annulé (often same logic as failed)
async function handleCanceledPayment(paymentIntent) {
  await handleFailedPayment(paymentIntent); // Delegate to the same logic
}

module.exports = router; 
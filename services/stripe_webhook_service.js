/**
 * Service unifié pour la gestion des webhooks Stripe
 * Centralise le traitement des événements Stripe pour éviter les doublons
 * et simplifier la maintenance
 */

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const mongoose = require('mongoose');

// Connexions aux différentes bases de données
const producerDb = mongoose.connection.useDb('Restauration_Officielle');
const loisirDb = mongoose.connection.useDb('Loisir&Culture');
const beautyWellnessDb = mongoose.connection.useDb('Beauty_Wellness');

// Modèles pour les différentes bases de données
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

// Modèle User
const User = mongoose.connection.useDb('Choice_App').model(
  'User',
  new mongoose.Schema({}, { strict: false }),
  'users'
);

/**
 * Recherche un producteur dans toutes les bases de données
 * @param {string} producerId - ID du producteur à rechercher
 * @returns {Promise<Object|null>} - Producteur trouvé et son type, ou null
 */
async function findProducerById(producerId) {
  if (!mongoose.Types.ObjectId.isValid(producerId)) {
    return null;
  }
  
  let producer = null;
  let producerType = null;

  try {
    // Essayer de trouver dans la collection Restaurant
    producer = await Producer.findById(producerId);
    if (producer) {
      return { producer, producerType: 'restaurant' };
    }

    // Essayer de trouver dans la collection Loisir
    producer = await LeisureProducer.findById(producerId);
    if (producer) {
      return { producer, producerType: 'leisure' };
    }

    // Essayer de trouver dans la collection Bien-être
    producer = await WellnessProducer.findById(producerId);
    if (producer) {
      return { producer, producerType: 'wellness' };
    }

    return null;
  } catch (error) {
    console.error('Erreur lors de la recherche du producteur:', error);
    return null;
  }
}

/**
 * Met à jour l'abonnement dans toutes les collections possibles
 * @param {string} producerId - ID du producteur
 * @param {Object} subscriptionData - Données de l'abonnement à mettre à jour
 */
async function updateSubscriptionInAllCollections(producerId, subscriptionData) {
  if (!mongoose.Types.ObjectId.isValid(producerId)) {
    console.error('ID de producteur invalide:', producerId);
    return;
  }

  try {
    const result = await findProducerById(producerId);
    if (!result) {
      console.error('Producteur non trouvé pour l\'ID:', producerId);
      return;
    }

    const { producer } = result;
    
    // Mise à jour de l'abonnement
    producer.subscription = {
      ...producer.subscription,
      ...subscriptionData
    };
    
    await producer.save();
    console.log(`Abonnement mis à jour pour le producteur: ${producerId}`);
    
  } catch (error) {
    console.error('Erreur lors de la mise à jour de l\'abonnement:', error);
  }
}

/**
 * Traite un paiement réussi
 * @param {Object} paymentIntent - Objet PaymentIntent de Stripe
 */
async function handleSuccessfulPayment(paymentIntent) {
  const metadata = paymentIntent.metadata || {};
  const { userId, producerId, subscription_plan, subscriptionLevel, plan, type } = metadata;

  // ---- Handle Subscription Payment ----
  if ((type === 'subscription' || subscription_plan || subscriptionLevel || plan) && producerId) {
    console.log(`Traitement du paiement d'abonnement réussi pour le producteur ${producerId}`);
    try {
      // Trouver le bon producteur
      const result = await findProducerById(producerId);
      if (!result || !result.producer) {
        console.error(`Producteur non trouvé pour l'ID: ${producerId}`);
        return;
      }
      
      const producer = result.producer;
      const actualProducerType = result.producerType;
      
      // Déterminer le plan d'abonnement (gérer les différentes clés possibles)
      const newPlan = subscriptionLevel || subscription_plan || plan || 'starter';
      const previousLevel = producer.subscription?.level || 'gratuit';
      
      // Dates de début et fin
      const now = new Date();
      const endDate = new Date(now.getFullYear(), now.getMonth() + 1, now.getDate());
      
      // Mettre à jour l'abonnement
      producer.subscription = {
        ...(producer.subscription || {}),
        level: newPlan,
        active: true,
        start_date: now,
        end_date: endDate,
        status: 'active',
        stripe_payment_intent_id: paymentIntent.id,
        auto_renew: true
      };
      
      // Ajouter à l'historique d'abonnement
      if (!producer.subscription_history) {
        producer.subscription_history = [];
      }
      
      producer.subscription_history.push({
        previous_level: previousLevel,
        new_level: newPlan,
        date: now,
        reason: 'payment_successful',
        transaction_id: paymentIntent.id
      });
      
      // Ajouter à l'historique des transactions
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
        created_at: new Date(paymentIntent.created * 1000)
      });
      
      // Sauvegarder les modifications
      await producer.save();
      console.log(`✅ Abonnement mis à jour pour le producteur ${producerId} au plan ${newPlan}`);
    } catch (error) {
      console.error(`Erreur lors de la mise à jour de l'abonnement pour le producteur ${producerId}:`, error);
    }
  }
  // ---- Handle Appointment Booking Payment ----
  else if (type === 'appointment_booking' && metadata.producerId && metadata.slotId) {
    const { producerId, slotId } = metadata;
    console.log(`Traitement du paiement de rendez-vous réussi pour le producteur (Wellness) ${producerId}, créneau ${slotId}`);
    
    try {
      // Update the slot status in the WellnessPlace model
      const wellness = await WellnessProducer.findById(producerId);
      if (!wellness) {
        console.error(`Producteur de bien-être non trouvé pour l'ID: ${producerId}`);
        return;
      }
      
      // Mise à jour du statut du créneau
      const updatedProducer = await wellness.updateOne(
        { 'appointment_system.slots._id': slotId },
        { $set: { 'appointment_system.slots.$.booked': true, 'appointment_system.slots.$.booked_by': metadata.userId } },
        { new: true }
      );

      if (updatedProducer) {
        console.log(`✅ Rendez-vous confirmé pour le producteur (Wellness) ${producerId}, créneau ${slotId}`);
        // TODO: Notify user and producer (e.g., email, push notification)
      } else {
        console.warn(`Créneau de rendez-vous ${slotId} pour le producteur (Wellness) ${producerId} non trouvé ou non mis à jour.`);
      }
    } catch (error) {
      console.error(`Erreur lors de la confirmation du rendez-vous pour le producteur (Wellness) ${producerId}, créneau ${slotId}:`, error);
    }
  }
  // ---- Handle Other Payment Types ----
  else {
    console.log(`Paiement réussi traité pour l'intent ${paymentIntent.id}, mais non reconnu comme abonnement ou rendez-vous.`);
  }
}

/**
 * Traite un paiement échoué
 * @param {Object} paymentIntent - Objet PaymentIntent de Stripe
 */
async function handleFailedPayment(paymentIntent) {
  const metadata = paymentIntent.metadata || {};
  const { userId, producerId, type, slotId } = metadata;
  
  // ---- Handle Failed Appointment Booking ----
  if (type === 'appointment_booking' && producerId && slotId) {
    console.log(`Paiement de rendez-vous échoué pour le producteur (Wellness) ${producerId}, créneau ${slotId}`);
    
    try {
      // Update the slot status in the WellnessPlace model to make it available again
      const wellness = await WellnessProducer.findById(producerId);
      if (!wellness) {
         console.error("❌ Modèle WellnessPlace non trouvé dans stripe_webhook_service (échec paiement)");
         return;
      }
      try {
        const updatedProducer = await wellness.updateOne(
          { _id: producerId, 'appointment_system.slots._id': slotId, 'appointment_system.slots.booked_by': userId },
          { $set: { 'appointment_system.slots.$.booked': false, 'appointment_system.slots.$.booked_by': null } },
          { new: true }
        );

        if (updatedProducer) {
          console.log(`✅ Créneau libéré pour le producteur (Wellness) ${producerId}, créneau ${slotId}`);
          // TODO: Notify user about payment failure and slot release
        } else {
          console.warn(`Créneau ${slotId} pour le producteur (Wellness) ${producerId} non trouvé ou non mis à jour après échec du paiement.`);
        }
      } catch (error) {
        console.error(`Erreur lors de la libération du créneau ${slotId} pour le producteur (Wellness) ${producerId}:`, error);
      }
    } catch (error) {
      console.error(`Erreur lors de la confirmation du rendez-vous pour le producteur (Wellness) ${producerId}, créneau ${slotId}:`, error);
    }
  }
  // ---- Handle Failed Subscription Payment ----
  else if ((type === 'subscription' || metadata.subscription_plan || metadata.subscriptionLevel || metadata.plan) && producerId) {
    console.log(`Paiement d'abonnement échoué pour le producteur ${producerId}`);
    
    try {
      const result = await findProducerById(producerId);
      if (!result || !result.producer) {
        console.error(`Producteur non trouvé pour l'ID: ${producerId}`);
        return;
      }
      
      const producer = result.producer;
      
      // Mettre à jour le statut de l'abonnement
      if (producer.subscription) {
        producer.subscription.pendingPayment = false;
        producer.subscription.pendingPaymentIntentId = null;
        
        // Si l'abonnement était en attente de mise à niveau, conserver le niveau actuel
        if (producer.subscription.pendingUpgrade) {
          producer.subscription.pendingUpgrade = false;
        }
        
        await producer.save();
        console.log(`✅ Statut d'abonnement mis à jour pour le producteur ${producerId} après échec du paiement`);
      }
    } catch (error) {
      console.error(`Erreur lors de la mise à jour du statut d'abonnement pour le producteur ${producerId}:`, error);
    }
  }
  // ---- Handle Other Failed Payments ----
  else {
    console.log(`Paiement échoué traité pour l'intent ${paymentIntent.id}, mais non reconnu comme abonnement ou rendez-vous.`);
  }
}

/**
 * Traite un paiement annulé
 * @param {Object} paymentIntent - Objet PaymentIntent de Stripe
 */
async function handleCanceledPayment(paymentIntent) {
  // Réutiliser la même logique que pour les paiements échoués
  await handleFailedPayment(paymentIntent);
}

/**
 * Vérifie et construit un événement Stripe à partir d'une requête webhook
 * @param {Object} req - Requête HTTP
 * @returns {Promise<Object|null>} - Événement Stripe ou null en cas d'erreur
 */
async function constructStripeEvent(req) {
  try {
    const signature = req.headers['stripe-signature'];
    
    if (!process.env.STRIPE_WEBHOOK_SECRET) {
      console.error('❌ STRIPE_WEBHOOK_SECRET non définie');
      return null;
    }
    
    if (!signature) {
      console.error('❌ Signature Stripe manquante');
      return null;
    }
    
    // Vérifier la signature de l'événement avec le secret du webhook
    const event = stripe.webhooks.constructEvent(
      req.body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    );
    
    return event;
  } catch (error) {
    console.error(`❌ Erreur lors de la vérification du webhook Stripe: ${error.message}`);
    return null;
  }
}

/**
 * Point d'entrée principal pour le traitement des webhooks Stripe
 * @param {Object} req - Requête HTTP
 * @returns {Promise<Object|null>} - Résultat du traitement ou null en cas d'erreur
 */
async function processWebhook(req) {
  const event = await constructStripeEvent(req);
  
  if (!event) {
    return { success: false, error: 'Impossible de construire l\'événement Stripe' };
  }
  
  try {
    // Traiter l'événement en fonction de son type
    switch (event.type) {
      case 'payment_intent.succeeded':
        const paymentIntentSucceeded = event.data.object;
        console.log(`✅ Webhook: PaymentIntent réussi: ${paymentIntentSucceeded.id}`);
        await handleSuccessfulPayment(paymentIntentSucceeded);
        break;
      
      case 'payment_intent.payment_failed':
        const paymentIntentFailed = event.data.object;
        console.log(`❌ Webhook: PaymentIntent échoué: ${paymentIntentFailed.id}`);
        await handleFailedPayment(paymentIntentFailed);
        break;
      
      case 'payment_intent.canceled':
        const paymentIntentCanceled = event.data.object;
        console.log(`🚫 Webhook: PaymentIntent annulé: ${paymentIntentCanceled.id}`);
        await handleCanceledPayment(paymentIntentCanceled);
        break;
      
      // Autres types d'événements à gérer si nécessaire
      
      default:
        console.log(`🤷‍♀️ Webhook: Type d'événement non géré ${event.type}`);
    }
    
    return { success: true, event: event.type };
  } catch (error) {
    console.error(`❌ Erreur lors du traitement du webhook Stripe: ${error.message}`);
    return { success: false, error: error.message };
  }
}

module.exports = {
  processWebhook,
  handleSuccessfulPayment,
  handleFailedPayment,
  handleCanceledPayment,
  findProducerById,
  updateSubscriptionInAllCollections
}; 
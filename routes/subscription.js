const express = require('express');
const router = express.Router();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const mongoose = require('mongoose');

// Connexion à la base `Restauration_Officielle`
const producerDb = mongoose.createConnection(process.env.MONGO_URI, {
  dbName: 'Restauration_Officielle',
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

// Modèle pour la collection `producers`
const Producer = producerDb.model(
  'Producer',
  new mongoose.Schema({}, { strict: false }), 
  'producers'
);

// 📌 Route pour initier un paiement
router.post('/create-payment-intent', async (req, res) => {
  try {
    const { amount, currency, producerId, plan } = req.body;

    // ✅ Vérification si producerId est valide
    if (!mongoose.Types.ObjectId.isValid(producerId)) {
      return res.status(400).json({ error: "Invalid producerId format" });
    }

    const validProducerId = new mongoose.Types.ObjectId(producerId);

    // ✅ Vérifier que le producteur existe
    const producer = await Producer.findById(validProducerId);
    if (!producer) {
      return res.status(404).json({ error: "Producer not found" });
    }

    // ✅ Créer un paiement avec Stripe
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amount * 100, // Montant en cents
      currency: currency,
      automatic_payment_methods: { enabled: true } // ✅ Stripe gère Apple Pay & Google Pay
    });

    // ✅ Enregistrer la souscription (en attente de paiement)
    await Producer.findByIdAndUpdate(validProducerId, {
      $set: {
        subscription: {
          plan: plan, // "bronze", "silver", "gold"
          active: false, // Activation après paiement réussi
          createdAt: new Date(),
        }
      }
    });

    res.json({ client_secret: paymentIntent.client_secret });
  } catch (error) {
    console.error("❌ Erreur backend lors de la création du paiement :", error);
    res.status(500).json({ error: "Erreur lors de la création du paiement" });
  }
});

// 📌 Route pour récupérer l'abonnement d'un producteur
router.get('/producer/:id/subscription', async (req, res) => {
  try {
    const { id } = req.params;

    // ✅ Vérification si id est valide
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid producer ID format" });
    }

    const validProducerId = new mongoose.Types.ObjectId(id);

    // ✅ Vérifier que le producteur existe
    const producer = await Producer.findById(validProducerId);
    if (!producer) {
      return res.status(404).json({ error: "Producer not found" });
    }

    res.json({ subscription: producer.subscription });
  } catch (error) {
    console.error("❌ Erreur serveur lors de la récupération de l'abonnement :", error);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// 📌 Webhook Stripe pour activer un abonnement après paiement réussi
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error("❌ Erreur Webhook Stripe :", err);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'payment_intent.succeeded') {
    const paymentIntent = event.data.object;

    // ✅ Trouver le producteur correspondant au montant payé
    const producer = await Producer.findOne({ "subscription.plan": paymentIntent.amount / 100 });

    if (producer) {
      await Producer.findByIdAndUpdate(producer._id, { $set: { "subscription.active": true } });
      console.log(`✅ Abonnement activé pour le producteur: ${producer._id}`);
    } else {
      console.warn("⚠️ Aucun producteur trouvé pour ce paiement.");
    }
  }

  res.json({ received: true });
});

module.exports = router;

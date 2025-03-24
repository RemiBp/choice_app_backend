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

// Définition des niveaux d'abonnement et leurs caractéristiques
const subscriptionLevels = {
  'gratuit': {
    price: 0,
    name: 'Gratuit',
    features: ['Profil lieu', 'Poster', 'Voir les posts clients', 'Reco IA 1x/semaine', 'Stats basiques']
  },
  'starter': {
    price: 5,
    name: 'Starter',
    features: ['Recos IA quotidiennes', 'Stats avancées', 'Accès au feed de tendances locales']
  },
  'pro': {
    price: 10,
    name: 'Pro',
    features: ['Boosts illimités sur la map/feed', 'Accès à la Heatmap & Copilot IA', 'Campagnes simples']
  },
  'legend': {
    price: 15,
    name: 'Legend',
    features: ['Classement public', 'Ambassadeurs', 'Campagnes avancées (ciblage fin)', 'Visuels IA stylisés']
  }
};

// Fonction pour mapper l'ancien plan au nouveau système
function mapLegacyPlanToNew(oldPlan) {
  switch(oldPlan) {
    case 'bronze': return 'starter';
    case 'silver': return 'pro';
    case 'gold': return 'legend';
    default: return 'gratuit';
  }
}

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

    // Convertir l'ancien plan vers le nouveau système si nécessaire
    const newPlan = plan.startsWith('bronze') || plan.startsWith('silver') || plan.startsWith('gold') 
      ? mapLegacyPlanToNew(plan)
      : plan;

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
          plan: newPlan, // "gratuit", "starter", "pro", "legend"
          active: plan === 'gratuit' ? true : false, // Gratuit est toujours actif
          createdAt: new Date(),
          features: subscriptionLevels[newPlan]?.features || []
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

    // Si le producteur n'a pas d'abonnement, on lui attribue le niveau gratuit par défaut
    if (!producer.subscription) {
      const defaultSubscription = {
        plan: 'gratuit',
        active: true,
        createdAt: new Date(),
        features: subscriptionLevels.gratuit.features
      };
      
      // Sauvegarder cette information dans la base de données
      await Producer.findByIdAndUpdate(validProducerId, {
        $set: { subscription: defaultSubscription }
      });
      
      res.json({ subscription: defaultSubscription });
    } else {
      // Enrichir l'abonnement avec les informations du niveau
      const plan = producer.subscription.plan || 'gratuit';
      const enrichedSubscription = {
        ...producer.subscription,
        details: subscriptionLevels[plan] || subscriptionLevels.gratuit,
        // Assurer que les features sont toujours présentes
        features: producer.subscription.features || subscriptionLevels[plan]?.features || []
      };
      
      res.json({ subscription: enrichedSubscription });
    }
  } catch (error) {
    console.error("❌ Erreur serveur lors de la récupération de l'abonnement :", error);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// 📌 Nouvelle route pour obtenir tous les niveaux d'abonnement
router.get('/levels', (req, res) => {
  try {
    res.json({ levels: subscriptionLevels });
  } catch (error) {
    console.error("❌ Erreur lors de la récupération des niveaux d'abonnement :", error);
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
    const amountPaid = paymentIntent.amount / 100;

    // Déterminer le niveau d'abonnement en fonction du montant payé
    let planLevel = 'gratuit';
    if (amountPaid >= 15) {
      planLevel = 'legend';
    } else if (amountPaid >= 10) {
      planLevel = 'pro';
    } else if (amountPaid >= 5) {
      planLevel = 'starter';
    }

    // ✅ Trouver le producteur correspondant à ce paiement
    const producer = await Producer.findOne({ 
      "subscription.plan": { $in: [planLevel, 'bronze', 'silver', 'gold'] },
      "subscription.active": false
    }).sort({ "subscription.createdAt": -1 });

    if (producer) {
      await Producer.findByIdAndUpdate(producer._id, { 
        $set: { 
          "subscription.active": true,
          "subscription.plan": planLevel,
          "subscription.features": subscriptionLevels[planLevel].features
        } 
      });
      console.log(`✅ Abonnement ${planLevel} activé pour le producteur: ${producer._id}`);
    } else {
      console.warn("⚠️ Aucun producteur trouvé pour ce paiement.");
    }
  }

  res.json({ received: true });
});

module.exports = router;

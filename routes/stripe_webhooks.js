const express = require('express');
const router = express.Router();
const stripeWebhookService = require('../services/stripe_webhook_service');

/**
 * Route principale pour tous les webhooks Stripe
 * Point d'entrée unique qui gère tous les types d'événements Stripe
 */
router.post('/', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    const result = await stripeWebhookService.processWebhook(req);
    
    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }
    
    // Retourner un 200 pour indiquer que l'événement a été traité avec succès
    return res.status(200).json({ received: true, event: result.event });
  } catch (error) {
    console.error('❌ Erreur lors du traitement du webhook:', error);
    return res.status(500).json({ error: 'Erreur interne lors du traitement du webhook' });
  }
});

module.exports = router; 
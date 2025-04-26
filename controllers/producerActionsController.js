const pushNotificationService = require('../services/pushNotificationService');
const pushLogService = require('../services/pushLogService');
const { createModel, databases, getModel } = require('../utils/modelCreator');
const mongoose = require('mongoose');

// --- Define Producer Models (Simplified for finding name) ---
// Need these to potentially include producer name in the notification
const RestaurantProducer = createModel(databases.RESTAURATION, 'RestaurationProducerSimple', 'producers', null, { strict: false });
const LeisureProducer = createModel(databases.LOISIR, 'LoisirProducerSimple', 'Loisir_Paris_Producers', null, { strict: false });
const WellnessProducer = createModel(databases.BEAUTY_WELLNESS, 'WellnessProducerSimple', 'WellnessPlaces', null, { strict: false });

// Helper to find any producer by ID and get basic info (like name)
async function findProducerName(producerId) {
  if (!mongoose.Types.ObjectId.isValid(producerId)) return 'un producteur'; // Default

  try {
    let producer = await RestaurantProducer.findById(producerId).select('name').lean();
    if (producer) return producer.name || 'un restaurant';

    producer = await LeisureProducer.findById(producerId).select('lieu').lean();
    if (producer) return producer.lieu || 'un lieu de loisir';

    producer = await WellnessProducer.findById(producerId).select('name').lean();
    if (producer) return producer.name || 'un lieu de bien-être';

    return 'un producteur';
  } catch (error) {
    console.error('Error finding producer name:', error);
    return 'un producteur';
  }
}


const producerActionsController = {

  /**
   * Send Targeted Push Notification
   * POST /api/producer-actions/send-push
   * Body: {
   *   targetUserId: string,
   *   query?: string,         // Original query that triggered the event
   *   customTitle?: string,   // Optional custom title from producer
   *   customMessage?: string, // Optional custom body from producer
   *   discount?: number,      // Discount percentage (used if no custom message)
   *   durationHours?: number  // Offer duration (used if no custom message)
   * }
   * Requires producer authentication (via auth middleware)
   */
  sendTargetedPush: async (req, res) => {
    const producerId = req.user.id; // Assuming auth middleware sets req.user.id
    // Destructure all potential fields from body
    const { 
        targetUserId, 
        query, 
        customTitle, 
        customMessage, 
        discount = 30, // Default discount
        durationHours = 1 // Default duration
    } = req.body;

    // Validation (remain the same)
    if (!targetUserId) { return res.status(400).json({ message: 'targetUserId is required' }); }
    if (!mongoose.Types.ObjectId.isValid(targetUserId)) { return res.status(400).json({ message: 'Invalid targetUserId format' }); }
    if (!producerId) { return res.status(401).json({ message: 'Producer authentication required' }); }

    let logEntry = { // Prepare data for logging
        producerId,
        targetUserId,
        queryTrigger: query,
        offerDetails: {
            discount: customMessage ? null : discount,
            durationHours: customMessage ? null : durationHours,
            customMessage: !!customMessage,
        },
        status: 'failure', // Default to failure
    };

    try {
      // 1. Construct Notification Content
      const producerName = await findProducerName(producerId);
      
      // Use custom title if provided, otherwise generate default
      const title = customTitle || `Offre spéciale chez ${producerName}!`;
      let body;

      // Use custom message if provided
      if (customMessage) {
        body = customMessage;
      } else if (query) {
        // Use query-based default if no custom message
        body = `Intéressé(e) par "${query}"? Profitez de ${discount}% de réduction pendant ${durationHours}h chez ${producerName}!`;
      } else {
        // Use generic default if no custom message and no query
        body = `Offre exclusive: ${discount}% de réduction pendant ${durationHours}h chez ${producerName} près de vous!`;
      }

      // Update log entry with final title/body
      logEntry.title = title;
      logEntry.body = body;

      // Data payload remains the same, carrying offer details
      const dataPayload = {
        type: 'PROMOTION',
        producerId: producerId,
        discount: discount.toString(),
        durationHours: durationHours.toString(),
        query: query || '', // Include original query if available
      };

      // 2. Send Notification via Service
      const fcmResponse = await pushNotificationService.sendPushNotification(
        targetUserId,
        title,
        body,
        dataPayload,
        true // Request full response
      );

      if (fcmResponse.success) {
        logEntry.status = 'success';
        logEntry.fcmMessageId = fcmResponse.messageId;
        // Log success asynchronously (don't wait)
        pushLogService.logSentPush(logEntry);
        res.status(200).json({ message: 'Push notification sent successfully' });
      } else {
        logEntry.status = 'failure';
        logEntry.failureReason = fcmResponse.errorInfo?.message || 'Unknown FCM error';
        // Log failure asynchronously
        pushLogService.logSentPush(logEntry);
        res.status(500).json({ message: 'Failed to send push notification' });
      }

    } catch (error) {
      console.error('❌ Error in sendTargetedPush controller:', error);
       logEntry.status = 'failure';
       logEntry.failureReason = error.message;
       // Log error asynchronously
       pushLogService.logSentPush(logEntry);
      res.status(500).json({ message: 'Server error sending push notification', error: error.message });
    }
  }
};

module.exports = producerActionsController; 
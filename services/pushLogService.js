const { createModel, databases } = require('../utils/modelCreator');
const SentPushSchema = require('../models/SentPush');

// Create the Mongoose model using the utility
const SentPush = createModel(
    databases.CHOICE_APP, // Store logs in the main app DB (or dedicated DB if preferred)
    'SentPush',
    'sentPushes',
    SentPushSchema
);

/**
 * Logs the details of a sent push notification.
 * @param {object} logData - Data to log.
 * @param {string} logData.producerId - ID of the producer sending the push.
 * @param {string} logData.targetUserId - ID of the user receiving the push.
 * @param {string} logData.title - Notification title.
 * @param {string} logData.body - Notification body.
 * @param {string} [logData.queryTrigger] - The user query that triggered the push.
 * @param {object} logData.offerDetails - Details about the offer.
 * @param {string} [logData.fcmMessageId] - The message ID returned by FCM on success.
 * @param {string} logData.status - 'success' or 'failure'.
 * @param {string} [logData.failureReason] - Reason for failure.
 */
async function logSentPush(logData) {
  try {
    const newLog = new SentPush(logData);
    await newLog.save();
    console.log(`📝 Push notification logged for user ${logData.targetUserId} from producer ${logData.producerId}`);
  } catch (error) {
    console.error(`❌ Error logging sent push notification:`, error);
    // Decide if this error should block the main flow or just be logged
  }
}

module.exports = {
  logSentPush,
}; 
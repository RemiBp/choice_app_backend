const admin = require('firebase-admin');
const path = require('path');
const { createModel, databases } = require('../utils/modelCreator');
const mongoose = require('mongoose');

// --- Configuration ---
// IMPORTANT: Replace with the actual path to your downloaded service account key
const serviceAccountPath = path.join(__dirname, '../config/firebase-service-account.json');
let firebaseInitialized = false;

// --- User Model (to get FCM token) ---
// Ensure this model definition matches your actual User model, especially the fcmToken field
const User = createModel(
  databases.CHOICE_APP, // Or wherever your Users collection is
  'User',
  'Users',
  new mongoose.Schema({
    fcmToken: { type: String } // Assuming the FCM token is stored here
    // ... other user fields
  }, { strict: false })
);

// --- Initialize Firebase Admin ---
function initializeFirebase() {
  if (firebaseInitialized) {
    return;
  }
  try {
    const serviceAccount = require(serviceAccountPath);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
    firebaseInitialized = true;
    console.log('✅ Firebase Admin initialized successfully.');
  } catch (error) {
    console.error('❌ Failed to initialize Firebase Admin:', error);
    console.error(`   Ensure service account key exists at: ${serviceAccountPath}`);
    console.error('   Push notifications will not work.');
    // Optionally throw error or exit process if Firebase is critical
  }
}

// --- Send Push Notification Function ---

/**
 * Sends a push notification to a specific user via FCM.
 * @param {string} userId - The MongoDB ObjectId of the target user.
 * @param {string} title - The notification title.
 * @param {string} body - The notification body.
 * @param {object} [data] - Optional data payload to send with the notification.
 * @param {boolean} [returnFullResponse=false] - If true, returns {success: boolean, messageId?: string, errorInfo?: object}, otherwise returns boolean.
 * @returns {Promise<boolean | {success: boolean, messageId?: string, errorInfo?: object}>} - Success status or detailed response object.
 */
async function sendPushNotification(userId, title, body, data = {}, returnFullResponse = false) {
  if (!firebaseInitialized) {
    console.warn('⚠️ Firebase Admin not initialized. Cannot send push notification.');
    return returnFullResponse ? { success: false, errorInfo: { message: 'Firebase not initialized' } } : false;
  }

  try {
    // 1. Get the user's FCM token
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      console.error(`sendPushNotification: Invalid userId format: ${userId}`);
      return returnFullResponse ? { success: false, errorInfo: { message: 'Invalid userId format' } } : false;
    }
    const user = await User.findById(userId).select('fcmToken').lean();

    if (!user) {
      console.error(`sendPushNotification: User not found: ${userId}`);
      return returnFullResponse ? { success: false, errorInfo: { message: 'User not found' } } : false;
    }
    if (!user.fcmToken) {
      console.warn(`sendPushNotification: User ${userId} does not have an FCM token.`);
      return returnFullResponse ? { success: false, errorInfo: { message: 'No FCM token' } } : false;
    }

    const token = user.fcmToken;

    // 2. Construct the message payload
    const message = {
      notification: {
        title: title,
        body: body,
      },
      token: token,
      data: {
        ...data, // Include any custom data
        click_action: 'FLUTTER_NOTIFICATION_CLICK', // Standard for Flutter FCM handling
      },
      // Optional: Android specific configuration
      android: {
        priority: 'high',
        notification: {
          // Add Android specific options like sound, channel ID, icon etc.
          // sound: 'default',
          // channelId: 'your_channel_id', // Make sure channel exists in Flutter app
        },
      },
      // Optional: APNS (iOS) specific configuration
      apns: {
        payload: {
          aps: {
            // Add iOS specific options like sound, badge count etc.
            // sound: 'default',
            // badge: 1, 
          },
        },
      },
    };

    // 3. Send the message
    console.log(`🚀 Sending push notification to user ${userId} (token: ...${token.slice(-6)})`);
    const response = await admin.messaging().send(message);
    console.log('✅ Push notification sent successfully:', response);
    return returnFullResponse ? { success: true, messageId: response } : true;

  } catch (error) {
    console.error(`❌ Error sending push notification to user ${userId}:`, error);
    // Handle specific errors, e.g., invalid token, unregistered token
    if (error.code === 'messaging/invalid-registration-token' ||
        error.code === 'messaging/registration-token-not-registered') {
      console.warn(`   Token for user ${userId} is invalid/unregistered. Consider removing it.`);
      // Optionally, remove the invalid token from the user's profile here
      // await User.updateOne({ _id: userId }, { $unset: { fcmToken: "" } });
    }
    return returnFullResponse ? { success: false, errorInfo: error } : false;
  }
}

// --- Export ---

module.exports = {
  initializeFirebase,
  sendPushNotification,
}; 
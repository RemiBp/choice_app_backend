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

/**
 * Sends a push notification to all users within a specific geographical area.
 * IMPORTANT: Requires a 2dsphere index on the User model's location field (e.g., 'currentLocation').
 * @param {number} latitude - The center latitude of the area.
 * @param {number} longitude - The center longitude of the area.
 * @param {number} radiusMeters - The radius of the area in meters.
 * @param {string} title - The notification title.
 * @param {string} body - The notification body.
 * @param {object} [data] - Optional data payload.
 * @param {boolean} [returnFullResponse=false] - If true, returns detailed response object.
 * @returns {Promise<boolean | {success: boolean, successCount?: number, failureCount?: number, errorInfo?: object}>} - Success status or detailed response object.
 */
async function sendNotificationToArea(latitude, longitude, radiusMeters, title, body, data = {}, returnFullResponse = false) {
  if (!firebaseInitialized) {
    console.warn('⚠️ Firebase Admin not initialized. Cannot send area notification.');
    return returnFullResponse ? { success: false, errorInfo: { message: 'Firebase not initialized' } } : false;
  }

  try {
    // 1. Validate coordinates and radius
    if (typeof latitude !== 'number' || typeof longitude !== 'number' || typeof radiusMeters !== 'number' || radiusMeters <= 0) {
      console.error('sendNotificationToArea: Invalid coordinates or radius.');
      return returnFullResponse ? { success: false, errorInfo: { message: 'Invalid coordinates or radius' } } : false;
    }

    // 2. Find users within the area
    // Assumes User model has a GeoJSON Point field named 'currentLocation'
    // Requires a 2dsphere index: db.Users.createIndex({ currentLocation: "2dsphere" })
    console.log(`🔍 Finding users within ${radiusMeters}m of [${longitude}, ${latitude}]...`);
    const usersInArea = await User.find({
      currentLocation: {
        $geoWithin: {
          $centerSphere: [[longitude, latitude], radiusMeters / 6378100] // Convert radius to radians
        }
      },
      fcmToken: { $exists: true, $ne: null, $ne: '' } // Ensure they have a valid token
    }).select('fcmToken').lean(); // Only select the token

    if (!usersInArea || usersInArea.length === 0) {
      console.log('🤷 No users with FCM tokens found in the specified area.');
      return returnFullResponse ? { success: true, successCount: 0, failureCount: 0, message: 'No users found in area' } : true;
    }

    const tokens = usersInArea.map(user => user.fcmToken).filter(token => token); // Get valid tokens

    if (tokens.length === 0) {
      console.log('🤷 No valid FCM tokens found for users in the area.');
      return returnFullResponse ? { success: true, successCount: 0, failureCount: 0, message: 'No valid tokens found' } : true;
    }

    console.log(`🎯 Found ${tokens.length} tokens in the area. Preparing to send multicast message.`);

    // 3. Construct the multicast message payload
    const message = {
      notification: {
        title: title,
        body: body,
      },
      data: {
        ...data,
        click_action: 'FLUTTER_NOTIFICATION_CLICK',
      },
      // Optional platform-specific configurations (can be added like in sendPushNotification)
      android: { priority: 'high' },
      apns: { payload: { aps: { /* sound: 'default', badge: 1 */ } } },
    };

    // 4. Send the multicast message
    const response = await admin.messaging().sendMulticast({ tokens, ...message });

    console.log(`✅ Multicast notification sent to area. Success: ${response.successCount}, Failure: ${response.failureCount}`);

    // Optional: Handle failures (e.g., remove invalid tokens)
    if (response.failureCount > 0) {
      const failedTokens = [];
      response.responses.forEach((resp, idx) => {
        if (!resp.success) {
          failedTokens.push(tokens[idx]);
          console.warn(`   Failed token [${idx}]: ${tokens[idx]}, Error: ${resp.error?.code}`);
          // Consider removing invalid tokens here
        }
      });
      // Example: await User.updateMany({ fcmToken: { $in: failedTokens } }, { $unset: { fcmToken: "" } });
    }

    return returnFullResponse ? {
      success: true,
      successCount: response.successCount,
      failureCount: response.failureCount
    } : true;

  } catch (error) {
    console.error(`❌ Error sending notification to area [${longitude}, ${latitude}], radius ${radiusMeters}:`, error);
     // Specific check for missing geo index
    if (error.code === 51024 || (error.message && error.message.includes('$geoWithin requires a 2dsphere index'))) {
      console.error('   Hint: Missing 2dsphere index on users.currentLocation field!');
      return returnFullResponse ? { success: false, errorInfo: { message: 'Database geo index missing', code: 'DB_GEO_INDEX_MISSING' } } : false;
    }
    return returnFullResponse ? { success: false, errorInfo: error } : false;
  }
}

/**
 * Sends a push notification alert to a specific producer about a nearby search.
 * @param {string} producerId - The MongoDB ObjectId of the target producer (assuming they are a User).
 * @param {object} searchDetails - Details about the nearby search.
 * @param {string} searchDetails.query - The user's search query.
 * @param {string} searchDetails.userName - The name of the user searching (or "Someone").
 * @param {number} [searchDetails.distance] - Optional distance in meters.
 * @param {boolean} [returnFullResponse=false] - If true, returns detailed response object.
 * @returns {Promise<boolean | {success: boolean, messageId?: string, errorInfo?: object}>} - Success status or detailed response object.
 */
async function sendNearbySearchAlertToProducer(producerId, searchDetails, returnFullResponse = false) {
  if (!firebaseInitialized) {
    console.warn('⚠️ Firebase Admin not initialized. Cannot send producer alert.');
    return returnFullResponse ? { success: false, errorInfo: { message: 'Firebase not initialized' } } : false;
  }

  const { query, userName = 'Someone', distance } = searchDetails;

  // Construct notification content
  const title = 'Nearby Search Alert!';
  let body = `${userName} is searching for "${query}" nearby`;
  if (distance) {
    body += ` (~${Math.round(distance)}m away)`;
  }
  body += `. Send an offer?`;

  // Construct data payload for the producer app
  const pushData = {
    type: 'nearby_search_alert', // Custom type for producer app handling
    searchQuery: query,
    searchUserName: userName,
    // Include userId if the producer needs it to send a targeted offer later
    // searchUserId: searchDetails.userId, 
    searchTimestamp: new Date().toISOString(), // Or pass the original search timestamp
  };

  // Send notification using the existing single-user function
  console.log(`🔔 Sending Nearby Search Alert to Producer ${producerId} about query "${query}"`);
  return sendPushNotification(producerId, title, body, pushData, returnFullResponse);
}

// --- Export ---

module.exports = {
  initializeFirebase,
  sendPushNotification,
  sendNotificationToArea,
  sendNearbySearchAlertToProducer,
}; 
const mongoose = require('mongoose');
const { createModel, databases } = require('../utils/modelCreator');
// Import the emitToProducer function from index.js (or wherever it's defined)
const { emitToProducer } = require('../index'); // Adjust path if needed

// --- Define Mongoose Models (or import them) ---
// It's crucial these models exist and match the expected data structure

// Assuming LocationHistory model is defined elsewhere (e.g., in heatmapController or a dedicated models file)
// If not, define it here based on heatmapController.js schema
const LocationHistory = createModel(
  databases.CHOICE_APP, // Ensure this points to the correct DB connection
  'LocationHistory',
  'locationHistories',
  new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    timestamp: { type: Date, default: Date.now, required: true },
    location: {
      type: {
        type: String,
        enum: ['Point'],
        required: true,
        default: 'Point'
      },
      coordinates: {
        type: [Number], // [longitude, latitude]
        required: true,
        index: '2dsphere' // Ensure geospatial index
      }
    },
    accuracy: { type: Number },
    speed: { type: Number },
    activity: { type: String }, // e.g., 'still', 'walking', 'in_vehicle'
    metadata: { type: Object }
  }, {
    timestamps: true
  })
);

// Assuming UserActivity model is defined elsewhere (e.g., in heatmapController or a dedicated models file)
// If not, define it here based on heatmapController.js schema
const UserActivity = createModel(
  databases.CHOICE_APP, // Ensure this points to the correct DB connection
  'UserActivity',
  'userActivities',
  new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    producerId: { type: mongoose.Schema.Types.ObjectId },
    producerType: { type: String, enum: ['restaurant', 'leisure', 'wellness'] },
    action: { type: String, enum: ['view', 'search', 'favorite', 'click', 'share', 'call'], required: true },
    timestamp: { type: Date, default: Date.now, required: true },
    location: { // Location at the time of the activity
      type: {
        type: String,
        enum: ['Point'],
        required: true,
        default: 'Point'
      },
      coordinates: { // [longitude, latitude]
        type: [Number],
        required: true
      }
    },
    query: { type: String },  // For 'search' actions
    metadata: { type: Object } // e.g., viewedItemId, clickedUrl
  }, {
    timestamps: true
  })
);

// Define models for producer collections needed for proximity search
// Using createModel with strict: false as we only care about _id and location field here
const RestaurantProducer = createModel(
  databases.RESTAURATION,
  'RestaurationProducer', // Use a distinct name if 'Producer' is used elsewhere
  'producers',
  new mongoose.Schema({ gps_coordinates: { type: Object, index: '2dsphere' } }, { strict: false })
);

const LeisureProducer = createModel(
  databases.LOISIR,
  'LoisirProducer', // Distinct name
  'Loisir_Paris_Producers',
  new mongoose.Schema({ location: { type: Object, index: '2dsphere' } }, { strict: false })
);

const BeautyProducer = createModel(
  databases.BEAUTY_WELLNESS,
  'BeautyProducer', // Distinct name
  'BeautyPlaces',
  new mongoose.Schema({ location: { type: Object, index: '2dsphere' } }, { strict: false })
);

const WellnessProducer = createModel(
  databases.BEAUTY_WELLNESS,
  'WellnessProducer', // Distinct name
  'WellnessPlaces',
  new mongoose.Schema({ location: { type: Object, index: '2dsphere' } }, { strict: false })
);

// --- Helper Functions ---

// Basic validation for GeoJSON Point coordinates
function isValidGeoJSONPoint(location) {
  return location &&
         location.type === 'Point' &&
         Array.isArray(location.coordinates) &&
         location.coordinates.length === 2 &&
         typeof location.coordinates[0] === 'number' && // longitude
         typeof location.coordinates[1] === 'number';   // latitude
}

// Find producers near a location (IMPLEMENTED)
async function findProducersNear(coordinates, radiusM = 5000) {
  // Coordinates are expected as [longitude, latitude]
  const geoQuery = {
    $near: {
      $geometry: {
        type: "Point",
        coordinates: coordinates
      },
      $maxDistance: radiusM
    }
  };

  let allNearbyIds = [];

  try {
    // Query Restaurants
    // Note: Assumes 'gps_coordinates' field exists and is indexed
    const restaurants = await RestaurantProducer.find({
      gps_coordinates: geoQuery
    }).select('_id').limit(50).lean(); // Limit results per type
    allNearbyIds.push(...restaurants.map(p => p._id.toString()));

    // Query Leisure Producers
    // Note: Assumes 'location' field exists and is indexed
    const leisure = await LeisureProducer.find({
      location: geoQuery
    }).select('_id').limit(50).lean();
    allNearbyIds.push(...leisure.map(p => p._id.toString()));

    // Query Beauty Places
    // Note: Assumes 'location' field exists and is indexed
    const beauty = await BeautyProducer.find({
      location: geoQuery
    }).select('_id').limit(50).lean();
    allNearbyIds.push(...beauty.map(p => p._id.toString()));

    // Query Wellness Places
    // Note: Assumes 'location' field exists and is indexed
    const wellness = await WellnessProducer.find({
      location: geoQuery
    }).select('_id').limit(50).lean();
    allNearbyIds.push(...wellness.map(p => p._id.toString()));

    // Remove duplicates and return
    const uniqueIds = [...new Set(allNearbyIds)];
    console.log(`🔍 Found ${uniqueIds.length} unique producers near [${coordinates.join(',')}]`);
    return uniqueIds;

  } catch (error) {
    console.error(`❌ Error in findProducersNear for coordinates [${coordinates.join(',')}]:`, error);
    return []; // Return empty on error
  }
}

// --- Controller Methods ---

const dataIngestionController = {
  /**
   * Record Location History from User App
   * POST /api/ingest/location-history
   * Body: { userId: string, timestamp: ISOString, location: GeoJSONPoint, accuracy?: number, ... }
   */
  recordLocationHistory: async (req, res) => {
    const { userId, timestamp, location, accuracy, speed, activity, metadata } = req.body;

    // Basic Validation
    if (!userId || !timestamp || !location) {
      return res.status(400).json({ message: 'Missing required fields: userId, timestamp, location' });
    }
    if (!mongoose.Types.ObjectId.isValid(userId)) {
        return res.status(400).json({ message: 'Invalid userId format' });
    }
    if (!isValidGeoJSONPoint(location)) {
      return res.status(400).json({ message: 'Invalid location format. Expected GeoJSON Point: { type: "Point", coordinates: [lon, lat] }' });
    }

    try {
      const newLocation = new LocationHistory({
        userId,
        timestamp: new Date(timestamp), // Ensure it's a Date object
        location,
        accuracy,
        speed,
        activity,
        metadata
      });

      await newLocation.save();

      console.log(`💾 Location recorded for user ${userId}`);

      // --- Trigger WebSocket Event (Placeholder Proximity Logic) ---
      // In a real scenario, you might query nearby producers here or have
      // another service monitor the DB and emit events.
      const nearbyProducers = await findProducersNear(location.coordinates);
      nearbyProducers.forEach(producerId => {
        emitToProducer(producerId, 'user_nearby', {
          userId: userId,
          location: location // Send the GeoJSON location
        });
      });
      // --- End WebSocket Trigger ---

      res.status(201).json({ message: 'Location history recorded successfully' });

    } catch (error) {
      console.error('❌ Error recording location history:', error);
      res.status(500).json({ message: 'Server error recording location history', error: error.message });
    }
  },

  /**
   * Record User Activity from User App
   * POST /api/ingest/user-activity
   * Body: { userId: string, action: string, timestamp: ISOString, location: GeoJSONPoint, query?: string, producerId?: string, ... }
   */
  recordUserActivity: async (req, res) => {
    const { userId, action, timestamp, location, query, producerId, producerType, metadata } = req.body;

    // Basic Validation
    if (!userId || !action || !timestamp || !location) {
      return res.status(400).json({ message: 'Missing required fields: userId, action, timestamp, location' });
    }
    if (!mongoose.Types.ObjectId.isValid(userId)) {
        return res.status(400).json({ message: 'Invalid userId format' });
    }
    if (producerId && !mongoose.Types.ObjectId.isValid(producerId)) {
        return res.status(400).json({ message: 'Invalid producerId format' });
    }
    if (!isValidGeoJSONPoint(location)) {
        return res.status(400).json({ message: 'Invalid location format. Expected GeoJSON Point: { type: "Point", coordinates: [lon, lat] }' });
    }
    // Add more validation based on 'action' type if needed

    try {
      const newActivity = new UserActivity({
        userId,
        action,
        timestamp: new Date(timestamp),
        location,
        query,
        producerId,
        producerType,
        metadata
      });

      await newActivity.save();

      console.log(`💾 Activity [${action}] recorded for user ${userId}`);

      // --- Trigger WebSocket Event for Searches (Placeholder Proximity Logic) ---
      if (action === 'search' && query) {
        const nearbyProducers = await findProducersNear(location.coordinates);
        nearbyProducers.forEach(nearbyProducerId => {
          emitToProducer(nearbyProducerId, 'user_search_nearby', {
            userId: userId,
            query: query,
            location: location // Send the GeoJSON location
          });
        });
      }
      // --- End WebSocket Trigger ---

      res.status(201).json({ message: 'User activity recorded successfully' });

    } catch (error) {
      console.error('❌ Error recording user activity:', error);
      res.status(500).json({ message: 'Server error recording user activity', error: error.message });
    }
  }
};

module.exports = dataIngestionController; 
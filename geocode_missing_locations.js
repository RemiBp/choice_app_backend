const { MongoClient, ObjectId } = require('mongodb');
const axios = require('axios');
require('dotenv').config();

// --- Configuration ---
const ATLAS_URI = process.env.MONGODB_URI || 'mongodb+srv://remibarbier:Calvi8Pierc2@lieuxrestauration.szq31.mongodb.net/?retryWrites=true&w=majority&appName=lieuxrestauration'; // Use env var or direct connection
const DB_CHOICE_APP = 'choice_app';
const DB_LOISIR_CULTURE = 'Loisir&Culture';
const COLLECTIONS_TO_GEOCODE = [
  { dbName: DB_CHOICE_APP, collectionName: 'Posts' },
  { dbName: DB_LOISIR_CULTURE, collectionName: 'Loisir_Paris_Evenements' }
];
const BATCH_SIZE = 50; // Process 50 documents at a time
const DELAY_MS = 1100; // Delay between Nominatim requests (IMPORTANT: Nominatim requires >= 1 second)
const NOMINATIM_ENDPOINT = 'https://nominatim.openstreetmap.org/search';
const USER_AGENT = 'ChoiceAppBackendGeocoder/1.0 (remib@choice.app)'; // Replace with your app info and contact

// --- Helper Functions ---

// Delay function
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

// Geocoding function using Nominatim
async function geocodeAddress(address) {
  if (!address || typeof address !== 'string' || address.trim() === '') {
    return null;
  }
  try {
    console.log(`  -> Geocoding: "${address.substring(0, 100)}${address.length > 100 ? '...' : ''}"`);
    const response = await axios.get(NOMINATIM_ENDPOINT, {
      params: {
        q: address,
        format: 'json',
        limit: 1 // We only need the best match
      },
      headers: {
        'User-Agent': USER_AGENT // Required by Nominatim's usage policy
      }
    });

    if (response.data && response.data.length > 0) {
      const result = response.data[0];
      const lon = parseFloat(result.lon);
      const lat = parseFloat(result.lat);
      if (!isNaN(lon) && !isNaN(lat)) {
        // IMPORTANT: MongoDB expects [longitude, latitude]
        return { type: 'Point', coordinates: [lon, lat] };
      }
    }
    console.warn(`     Could not geocode address: ${address}`);
    return null;
  } catch (error) {
    const truncatedAddress = address.substring(0, 100) + (address.length > 100 ? '...' : '');
    // Handle potential rate limiting errors (429 Too Many Requests)
    if (error.response && error.response.status === 429) {
      console.error(`     ERROR: Rate limited by Nominatim for address "${truncatedAddress}". Waiting longer before retrying...`);
      await delay(5000); // Wait 5 seconds
      return 'RATE_LIMITED'; // Signal to retry this address later
    } 
    // Handle other HTTP errors from Nominatim
    else if (error.response) {
      console.error(`     ERROR geocoding address "${truncatedAddress}": Nominatim responded with ${error.response.status} ${error.response.statusText}`);
    } 
    // Handle network errors or other issues with the request
    else {
      console.error(`     ERROR during geocoding request for "${truncatedAddress}": ${error.message}`);
    }
    return null; // Indicate geocoding failed for non-rate-limit reasons
  }
}

// --- Main Function ---
async function geocodeMissingLocations() {
  const client = new MongoClient(ATLAS_URI);
  let totalUpdated = 0;
  let totalErrors = 0;

  try {
    console.log(`🔄 Connecting to MongoDB Atlas (${ATLAS_URI})...`);
    await client.connect();
    console.log('✅ Connected to MongoDB Atlas.\n');

    for (const { dbName, collectionName } of COLLECTIONS_TO_GEOCODE) {
      console.log(`--- Processing ${dbName}.${collectionName} ---`);
      const db = client.db(dbName);
      const collection = db.collection(collectionName);
      let documentsProcessedInCollection = 0;
      let updatesInCollection = 0;
      let errorsInCollection = 0;
      let hasMore = true;
      let skip = 0;

      while (hasMore) {
        console.log(`
🔍 Finding documents in ${collectionName} (Batch starting at ${skip})...`);
        // Find documents with location.address but missing/default coordinates
        const query = {
          'location.address': { $exists: true, $ne: null, $ne: '' },
          $or: [
            { 'location.coordinates': { $exists: false } },
            { 'location.coordinates': { $eq: [0, 0] } }, // Check for default [0,0]
            { 'location.coordinates': { $size: 0 } }, // Check for empty array
            { 'location.type': { $ne: 'Point' } } // Ensure type is Point if coordinates exist
          ]
        };

        const documentsToUpdate = await collection.find(query).skip(skip).limit(BATCH_SIZE).toArray();

        if (documentsToUpdate.length === 0) {
          console.log('✅ No more documents found needing geocoding in this batch.');
          hasMore = false;
          continue;
        }

        console.log(`🚚 Found ${documentsToUpdate.length} documents to process in this batch.`);

        for (const doc of documentsToUpdate) {
          documentsProcessedInCollection++;
          console.log(`
📄 Processing Doc ID: ${doc._id}`);
          const address = doc.location?.address;

          if (!address) {
            console.warn(`   Skipping doc ${doc._id}: Missing address.`);
            continue;
          }

          let geocodedLocation = await geocodeAddress(address);
          
          // Handle potential rate limiting by retrying once after a longer delay
          if(geocodedLocation === 'RATE_LIMITED') {
              console.log(`   Retrying geocoding for ${doc._id} after delay...`);
              await delay(DELAY_MS * 2); // Extra delay before retry
              geocodedLocation = await geocodeAddress(address);
          }

          if (geocodedLocation && geocodedLocation !== 'RATE_LIMITED') {
            try {
              const updateResult = await collection.updateOne(
                { _id: doc._id },
                { $set: { 'location.type': 'Point', 'location.coordinates': geocodedLocation.coordinates } }
              );

              if (updateResult.modifiedCount === 1) {
                console.log(`   ✅ Updated doc ${doc._id} with coordinates: ${geocodedLocation.coordinates}`);
                updatesInCollection++;
              } else {
                console.warn(`   ⚠️ Doc ${doc._id} was targeted but not modified. Maybe already updated?`);
              }
            } catch (updateError) {
              console.error(`   ❌ Error updating doc ${doc._id}: ${updateError.message}`);
              errorsInCollection++;
            }
          } else {
            console.warn(`   Could not geocode or update doc ${doc._id}.`);
            if(geocodedLocation !== 'RATE_LIMITED') errorsInCollection++; // Don't count rate limit pauses as errors initially
          }

          // Wait before the next API call
          await delay(DELAY_MS);
        }
        // Prepare for the next batch
        skip += documentsToUpdate.length; 
        // Safety break if something goes wrong (optional)
        // if (skip > 10000) { 
        //     console.warn("Stopping after processing 10000 documents to prevent infinite loops.");
        //     hasMore = false; 
        // }
      }
      console.log(`
--- Finished ${dbName}.${collectionName} ---`);
      console.log(`   Documents Processed: ${documentsProcessedInCollection}`);
      console.log(`   Documents Updated: ${updatesInCollection}`);
      console.log(`   Errors Encountered: ${errorsInCollection}`);
      totalUpdated += updatesInCollection;
      totalErrors += errorsInCollection;
    }

  } catch (error) {
    console.error('\n❌ An unexpected error occurred:', error);
    totalErrors++;
  } finally {
    await client.close();
    console.log('\n👋 MongoDB connection closed.');
    console.log(`
=== SUMMARY ===`);
    console.log(`Total Documents Updated Across Collections: ${totalUpdated}`);
    console.log(`Total Errors Encountered: ${totalErrors}`);
    console.log('================');
  }
}

// Run the main function
geocodeMissingLocations(); 
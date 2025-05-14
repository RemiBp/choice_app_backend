/**
 * Script to create necessary geospatial indexes for MongoDB collections
 * Run with: node create_geo_index.js
 */
const mongoose = require('mongoose');
require('dotenv').config();

// Connection URI (use environment variables if available)
const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/choice_app';
let client;

async function createGeospatialIndexes() {
  try {
    console.log('Connecting to MongoDB...');
    client = await mongoose.connect(uri, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    
    console.log('Successfully connected to MongoDB!');
    
    // Create indexes on the locationHistories collection
    console.log('Creating index on locationHistories.location...');
    await mongoose.connection.db.collection('locationHistories').createIndex(
      { location: "2dsphere" },
      { background: true }
    );
    console.log('✅ Created 2dsphere index on locationHistories.location');
    
    // Create indexes on the userActivities collection
    console.log('Creating index on userActivities.location...');
    await mongoose.connection.db.collection('userActivities').createIndex(
      { location: "2dsphere" },
      { background: true }
    );
    console.log('✅ Created 2dsphere index on userActivities.location');
    
    // Create indexes on any other collections that need geospatial indexing
    console.log('Creating index on Users.currentLocation...');
    await mongoose.connection.db.collection('Users').createIndex(
      { currentLocation: "2dsphere" },
      { background: true }
    );
    console.log('✅ Created 2dsphere index on Users.currentLocation');
    
    // List all collections and their indexes to verify
    console.log('\nVerifying indexes on all collections:');
    const collections = await mongoose.connection.db.listCollections().toArray();
    
    for (const collection of collections) {
      const indexes = await mongoose.connection.db.collection(collection.name).indexes();
      console.log(`\nIndexes for collection '${collection.name}':`);
      indexes.forEach(index => {
        console.log(`- ${index.name}: ${JSON.stringify(index.key)}`);
      });
    }
    
    console.log('\n✅ All geospatial indexes created successfully!');
    
  } catch (error) {
    console.error('❌ Error creating geospatial indexes:', error);
  } finally {
    // Close the connection
    if (client) {
      await mongoose.connection.close();
      console.log('MongoDB connection closed.');
    }
  }
}

// Run the function
createGeospatialIndexes()
  .then(() => console.log('Script completed.'))
  .catch(err => console.error('Script failed:', err)); 
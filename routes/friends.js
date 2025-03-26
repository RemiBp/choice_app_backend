const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { ObjectId } = mongoose.Types;

// Connection to choice_app database
const choiceDb = mongoose.createConnection(process.env.MONGO_URI, {
  dbName: 'choice_app',
});

// Connection to Restauration_Officielle database
const restaurationDb = mongoose.createConnection(process.env.MONGO_URI, {
  dbName: 'Restauration_Officielle',
});

// Connection to Loisir&Culture database
const loisirDb = mongoose.createConnection(process.env.MONGO_URI, {
  dbName: 'Loisir&Culture',
});

// User model
const User = choiceDb.model(
  'User',
  new mongoose.Schema({}, { strict: false }),
  'Users'
);

// Restaurant model
const Restaurant = restaurationDb.model(
  'Restaurant',
  new mongoose.Schema({}, { strict: false }),
  'producers'
);

// Event model
const Event = loisirDb.model(
  'Event',
  new mongoose.Schema({}, { strict: false }),
  'Loisir_Paris_Evenements'
);

// Leisure venue model
const LeisureVenue = loisirDb.model(
  'LeisureVenue',
  new mongoose.Schema({}, { strict: false }),
  'Loisir_Paris_Producers'
);

/**
 * Get the authenticated user's friends (people they follow)
 * 
 * @route GET /api/friends
 * @query {string} [userId] - ID of the user (optional, defaults to authenticated user)
 * @returns {Array} List of friends with details
 */
router.get('/', async (req, res) => {
  try {
    const { userId } = req.query;
    
    // If no userId provided, return error
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'Le paramètre userId est requis.'
      });
    }
    
    // Get the user with their following list
    const user = await User.findById(userId).select('following');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Utilisateur non trouvé.'
      });
    }
    
    // Check if following array exists and is not empty
    if (!user.following || !Array.isArray(user.following) || user.following.length === 0) {
      return res.status(200).json([]);
    }
    
    // Convert string IDs to ObjectIds for the query
    let followingIds = [];
    try {
      followingIds = user.following.map(id => new ObjectId(id));
    } catch (error) {
      console.error('Error converting following IDs to ObjectIds:', error);
      return res.status(500).json({
        success: false,
        message: 'Erreur lors de la conversion des IDs des amis.',
        error: error.message
      });
    }
    
    // Get user details for all users being followed
    const friends = await User.find(
      { _id: { $in: followingIds } },
      'name email photo_url bio gender interests'
    );
    
    // Format the response
    const formattedFriends = friends.map(friend => ({
      id: friend._id.toString(),
      name: friend.name || 'Utilisateur',
      avatar: friend.photo_url || 'https://api.dicebear.com/6.x/adventurer/png?seed=default',
      interests: friend.interests || [],
      gender: friend.gender || 'unknown',
      bio: friend.bio || '',
    }));
    
    return res.status(200).json(formattedFriends);
  } catch (error) {
    console.error('Error fetching friends:', error);
    return res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de la récupération des amis.',
      error: error.message
    });
  }
});

/**
 * Get activities of user's friends based on their frequent locations
 * 
 * @route GET /api/friendsActivity
 * @query {string} [userId] - ID of the user (optional, defaults to authenticated user)
 * @query {number} [latitude] - Center latitude for search
 * @query {number} [longitude] - Center longitude for search
 * @query {number} [radius=10000] - Search radius in meters
 * @query {boolean} [showInterests=true] - Whether to show interests
 * @query {boolean} [showChoices=true] - Whether to show visited places
 * @query {string} [friends] - Comma-separated list of friend IDs to filter by
 * @query {string} [categories] - Comma-separated list of categories to filter by
 * @returns {Array} Friend activities with details
 */
router.get('/friendsActivity', async (req, res) => {
  try {
    const { 
      userId, 
      latitude, 
      longitude, 
      radius = 10000,
      showInterests = true, 
      showChoices = true,
      friends,
      categories
    } = req.query;
    
    // Validate required parameters
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'Le paramètre userId est requis.'
      });
    }
    
    // Get the user with their following list
    const user = await User.findById(userId).select('following');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Utilisateur non trouvé.'
      });
    }
    
    // Check if following array exists and is not empty
    if (!user.following || !Array.isArray(user.following) || user.following.length === 0) {
      return res.status(200).json([]);
    }
    
    // Parse the friends filter if provided
    let selectedFriendIds = [];
    if (friends && friends.trim() !== '') {
      selectedFriendIds = friends.split(',');
    }
    
    // Parse the categories filter if provided
    let selectedCategories = [];
    if (categories && categories.trim() !== '') {
      selectedCategories = categories.split(',');
    }
    
    // Convert string IDs to ObjectIds for the query
    let followingIds = [];
    try {
      // If specific friends are selected, use only those, otherwise use all following
      const idsToUse = selectedFriendIds.length > 0 
        ? selectedFriendIds 
        : user.following;
      
      followingIds = idsToUse.map(id => new ObjectId(id));
    } catch (error) {
      console.error('Error converting following IDs to ObjectIds:', error);
      return res.status(500).json({
        success: false,
        message: 'Erreur lors de la conversion des IDs des amis.',
        error: error.message
      });
    }
    
    // Get friends with their frequent locations
    const friendsData = await User.find(
      { _id: { $in: followingIds } },
      'name photo_url frequent_locations'
    );
    
    const activities = [];
    let activityId = 1;
    
    // Process each friend's frequent locations
    for (const friend of friendsData) {
      if (!friend.frequent_locations || !Array.isArray(friend.frequent_locations)) {
        continue;
      }
      
      for (const location of friend.frequent_locations) {
        if (!location.id || !location.name || !location.coordinates) {
          continue;
        }
        
        // Skip if we don't have coordinates
        if (!location.coordinates || !location.coordinates.lat || !location.coordinates.lng) {
          continue;
        }
        
        // Apply category filter if needed
        if (selectedCategories.length > 0 && 
            location.category && 
            !selectedCategories.includes(location.category)) {
          continue;
        }
        
        // Determine if this is an interest or a visited place
        const hasVisited = location.visits && location.visits.length > 0;
        const activityType = hasVisited ? 'choice' : 'interest';
        
        // Skip if we're not showing this type of activity
        if ((activityType === 'interest' && !showInterests) || 
            (activityType === 'choice' && !showChoices)) {
          continue;
        }
        
        // Filter by location if coordinates provided
        if (latitude && longitude) {
          const lat1 = parseFloat(latitude);
          const lon1 = parseFloat(longitude);
          const lat2 = location.coordinates.lat;
          const lon2 = location.coordinates.lng;
          
          // Calculate distance using Haversine formula
          const R = 6371e3; // Earth radius in meters
          const φ1 = lat1 * Math.PI/180;
          const φ2 = lat2 * Math.PI/180;
          const Δφ = (lat2-lat1) * Math.PI/180;
          const Δλ = (lon2-lon1) * Math.PI/180;
          
          const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
                    Math.cos(φ1) * Math.cos(φ2) *
                    Math.sin(Δλ/2) * Math.sin(Δλ/2);
          const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
          const distance = R * c;
          
          // Skip if outside the radius
          if (distance > parseFloat(radius)) {
            continue;
          }
        }
        
        // Lookup for additional location details
        let venueDetails = {
          id: location.id,
          name: location.name,
          category: location.category || 'Lieu',
          address: location.address || 'Adresse non disponible',
          photo: location.photo_url || 'https://images.unsplash.com/photo-1518998053901-5348d3961a04?w=500&q=80'
        };
        
        // Format the activity object
        const activity = {
          id: `act${activityId++}`,
          type: activityType,
          location: {
            type: 'Point',
            coordinates: [location.coordinates.lng, location.coordinates.lat]
          },
          venue: venueDetails,
          friends: [{
            id: friend._id.toString(),
            name: friend.name || 'Utilisateur',
            avatar: friend.photo_url || 'https://api.dicebear.com/6.x/adventurer/png?seed=default'
          }],
          date: hasVisited && location.visits.length > 0 
            ? location.visits[0].date 
            : new Date().toISOString()
        };
        
        // Check if this location already exists in our activities
        const existingActivityIndex = activities.findIndex(
          a => a.venue.id === location.id
        );
        
        if (existingActivityIndex >= 0) {
          // Add this friend to the existing activity
          activities[existingActivityIndex].friends.push({
            id: friend._id.toString(),
            name: friend.name || 'Utilisateur',
            avatar: friend.photo_url || 'https://api.dicebear.com/6.x/adventurer/png?seed=default'
          });
        } else {
          // Add as a new activity
          activities.push(activity);
        }
      }
    }
    
    return res.status(200).json(activities);
  } catch (error) {
    console.error('Error fetching friend activities:', error);
    return res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de la récupération des activités des amis.',
      error: error.message
    });
  }
});

module.exports = router;
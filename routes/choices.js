const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const geolib = require('../utils/geolib');

// Import models
const LocationHistory = require('../models/location-history');
const Restaurant = require('../models/restaurant');
const Event = require('../models/event');
const Choice = require('../models/choice');

// Constants
const REQUIRED_DURATION_MINUTES = 30;
const LOCATION_RADIUS_METERS = 100;
const RATING_ADJUSTMENT_PERCENTAGE = 0.10; // 10% adjustment

/**
 * Verify if user has spent enough time at a location
 * POST /api/choices/verify
 */
router.post('/verify', async (req, res) => {
  try {
    const { userId, locationId, locationType } = req.body;

    // Get location coordinates based on type
    let location;
    if (locationType === 'restaurant') {
      location = await Restaurant.findById(locationId);
    } else if (locationType === 'event') {
      location = await Event.findById(locationId);
    }

    if (!location || !location.coordinates) {
      return res.status(404).json({
        verified: false,
        message: 'Location not found or missing coordinates'
      });
    }

    // Get user's location history for the past 7 days
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const locationHistory = await LocationHistory.find({
      userId,
      timestamp: { $gte: sevenDaysAgo }
    }).sort({ timestamp: 1 });

    if (!locationHistory.length) {
      return res.status(200).json({
        verified: false,
        message: 'Aucun historique de localisation trouvé'
      });
    }

    // Calculate time spent near location
    let timeSpentMinutes = 0;
    let currentStreak = 0;
    let lastTimestamp = null;

    for (const record of locationHistory) {
      const isNearby = geolib.isPointWithinRadius(
        {
          latitude: record.coordinates[1],
          longitude: record.coordinates[0]
        },
        {
          latitude: location.coordinates[1],
          longitude: location.coordinates[0]
        },
        LOCATION_RADIUS_METERS
      );

      if (isNearby) {
        if (lastTimestamp) {
          const timeDiff = (record.timestamp - lastTimestamp) / 1000 / 60; // Convert to minutes
          if (timeDiff <= 35) { // Allow for some flexibility in tracking intervals
            currentStreak += timeDiff;
          } else {
            currentStreak = 0;
          }
        }
        lastTimestamp = record.timestamp;
      } else {
        timeSpentMinutes = Math.max(timeSpentMinutes, currentStreak);
        currentStreak = 0;
        lastTimestamp = null;
      }
    }

    // Final check for last streak
    timeSpentMinutes = Math.max(timeSpentMinutes, currentStreak);

    const verified = timeSpentMinutes >= REQUIRED_DURATION_MINUTES;
    return res.status(200).json({
      verified,
      timeSpent: Math.floor(timeSpentMinutes),
      message: verified
        ? 'Visite vérifiée avec succès'
        : `Temps passé insuffisant (${Math.floor(timeSpentMinutes)} minutes sur ${REQUIRED_DURATION_MINUTES} requises)`
    });
  } catch (error) {
    console.error('Error verifying location:', error);
    res.status(500).json({
      verified: false,
      message: 'Erreur lors de la vérification'
    });
  }
});

/**
 * Create a new choice with rating adjustments
 * POST /api/choices
 */
router.post('/', async (req, res) => {
  try {
    const {
      userId,
      locationId,
      locationType,
      ratings,
      emotions,
      menuItems,
      createPost,
      comment
    } = req.body;

    // Verify location first
    const verificationResult = await verifyLocation(userId, locationId, locationType);
    if (!verificationResult.verified) {
      return res.status(403).json({
        error: 'Location verification failed',
        details: verificationResult.message
      });
    }

    // Adjust ratings with ±10% random variation
    const adjustedRatings = {};
    for (const [aspect, rating] of Object.entries(ratings)) {
      const adjustment = (Math.random() * 2 - 1) * RATING_ADJUSTMENT_PERCENTAGE;
      let adjustedRating = rating * (1 + adjustment);
      // Ensure rating stays within bounds
      adjustedRating = Math.min(Math.max(adjustedRating, 0), 10);
      adjustedRatings[aspect] = Number(adjustedRating.toFixed(2));
    }

    // Create choice
    const choice = new Choice({
      userId,
      locationId,
      locationType,
      ratings: adjustedRatings,
      emotions,
      menuItems,
      timestamp: new Date()
    });

    await choice.save();

    // Update location ratings
    if (locationType === 'restaurant') {
      await updateRestaurantRatings(locationId, adjustedRatings);
    } else if (locationType === 'event') {
      await updateEventRatings(locationId, adjustedRatings, emotions);
    }

    // Create post if requested
    if (createPost && comment) {
      // Post creation logic here
    }

    res.status(201).json({
      success: true,
      choice: choice
    });
  } catch (error) {
    console.error('Error creating choice:', error);
    res.status(500).json({ error: 'Error creating choice' });
  }
});

// Helper function to verify location
async function verifyLocation(userId, locationId, locationType) {
  try {
    const response = await fetch(`${process.env.API_URL}/api/choices/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, locationId, locationType })
    });
    return await response.json();
  } catch (error) {
    console.error('Error verifying location:', error);
    return { verified: false, message: 'Error during verification' };
  }
}

// Helper function to update restaurant ratings
async function updateRestaurantRatings(restaurantId, newRatings) {
  const restaurant = await Restaurant.findById(restaurantId);
  if (!restaurant) return;

  const currentRatings = restaurant.ratings || {};
  const ratingCounts = restaurant.ratingCounts || {};

  // Update each aspect's rating
  for (const [aspect, rating] of Object.entries(newRatings)) {
    const currentCount = ratingCounts[aspect] || 0;
    const currentRating = currentRatings[aspect] || 0;
    
    // Calculate new average
    const newCount = currentCount + 1;
    const newAverage = ((currentRating * currentCount) + rating) / newCount;
    
    currentRatings[aspect] = Number(newAverage.toFixed(2));
    ratingCounts[aspect] = newCount;
  }

  await Restaurant.findByIdAndUpdate(restaurantId, {
    ratings: currentRatings,
    ratingCounts: ratingCounts
  });
}

// Helper function to update event ratings
async function updateEventRatings(eventId, newRatings, newEmotions) {
  const event = await Event.findById(eventId);
  if (!event) return;

  // Update ratings similar to restaurant
  const currentRatings = event.ratings || {};
  const ratingCounts = event.ratingCounts || {};

  for (const [aspect, rating] of Object.entries(newRatings)) {
    const currentCount = ratingCounts[aspect] || 0;
    const currentRating = currentRatings[aspect] || 0;
    
    const newCount = currentCount + 1;
    const newAverage = ((currentRating * currentCount) + rating) / newCount;
    
    currentRatings[aspect] = Number(newAverage.toFixed(2));
    ratingCounts[aspect] = newCount;
  }

  // Update emotion counts and find popular emotions
  const emotionCounts = event.emotionCounts || {};
  const popularEmotions = event.popularEmotions || [];

  for (const emotion of newEmotions) {
    emotionCounts[emotion] = (emotionCounts[emotion] || 0) + 1;
    
    // Check if emotion should be added to popular list
    if (emotionCounts[emotion] >= 10 && !popularEmotions.includes(emotion)) {
      popularEmotions.push(emotion);
    }
  }

  // Sort popular emotions by count
  popularEmotions.sort((a, b) => (emotionCounts[b] || 0) - (emotionCounts[a] || 0));

  await Event.findByIdAndUpdate(eventId, {
    ratings: currentRatings,
    ratingCounts: ratingCounts,
    emotionCounts: emotionCounts,
    popularEmotions: popularEmotions
  });
}

module.exports = router;
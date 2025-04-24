const offerService = require('../services/offerService');
const pushNotificationService = require('../services/pushNotificationService');

/**
 * Controller to handle sending a new offer from a producer to a user.
 */
exports.sendOffer = async (req, res) => {
  // Assuming auth middleware adds user info to req.user
  const producerId = req.user?.id; 
  if (!producerId) {
    return res.status(401).json({ message: 'Authentication required.' });
  }

  const {
    targetUserId,
    title,
    body,
    discountPercentage,
    validityDurationMinutes = 60, // Default validity: 1 hour
    originalSearchQuery,
    triggeringSearchId
  } = req.body;

  // Basic validation
  if (!targetUserId || !title || !body) {
    return res.status(400).json({ message: 'Missing required fields: targetUserId, title, body.' });
  }

  try {
    // 1. Create the offer in the database
    const createdOffer = await offerService.createOffer(
      producerId,
      targetUserId,
      title,
      body,
      discountPercentage,
      validityDurationMinutes,
      originalSearchQuery,
      triggeringSearchId
    );

    // 2. Send push notification to the target user
    const pushData = {
      type: 'new_offer', // Custom type for frontend handling
      offerId: createdOffer._id.toString(),
      offerCode: createdOffer.offerCode,
      producerId: producerId,
      discount: discountPercentage,
      // Add other relevant info for the push notification payload
    };

    // We need a function like sendOfferNotificationToUser (or adapt sendPushNotification)
    // For now, let's assume sendPushNotification can be used directly if it handles data payload correctly
    const pushSent = await pushNotificationService.sendPushNotification(
      targetUserId,
      title, // Use offer title for push title
      body, // Use offer body for push body
      pushData
    );

    if (pushSent) {
        // Optionally update offer status to 'sent' after successful push
        // await Offer.findByIdAndUpdate(createdOffer._id, { status: 'sent' });
        console.log(` Pushed offer ${createdOffer._id} to user ${targetUserId}`);
    } else {
        console.warn(` Offer ${createdOffer._id} created, but failed to push to user ${targetUserId}`);
        // Decide how to handle push failure - maybe retry?
    }

    // 3. Respond to the producer
    res.status(201).json({
      message: 'Offer created and notification sent (or attempted).' ,
      offer: createdOffer,
      pushSent: pushSent
    });

  } catch (error) {
    console.error('❌ Error in sendOffer controller:', error);
    res.status(500).json({ message: 'Failed to send offer.', error: error.message });
  }
};

/**
 * Controller to handle a user accepting an offer.
 */
exports.acceptOffer = async (req, res) => {
  const userId = req.user?.id;
  const { offerId } = req.params;

  if (!userId) {
    return res.status(401).json({ message: 'Authentication required.' });
  }
  if (!offerId) {
    return res.status(400).json({ message: 'Offer ID is required.' });
  }

  try {
    // Call the service function to handle the acceptance logic
    const acceptedOffer = await offerService.acceptOffer(offerId, userId);

    res.status(200).json({
      message: 'Offer accepted successfully.',
      offer: acceptedOffer,
    });

  } catch (error) {
    console.error(`❌ Error in acceptOffer controller for offer ${offerId} by user ${userId}:`, error);
    // Send specific error messages based on error type from service
    if (error.message === 'Offer not found.' || error.message === 'Offer does not belong to this user.') {
      return res.status(404).json({ message: error.message });
    }
    if (error.message === 'Offer cannot be accepted.') {
        return res.status(400).json({ message: error.message });
    }
    res.status(500).json({ message: 'Failed to accept offer.', error: error.message });
  }
};

/**
 * Controller to get offers received by the logged-in user.
 */
exports.getReceivedOffers = async (req, res) => {
  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json({ message: 'Authentication required.' });
  }

  // Optional query parameters for filtering (e.g., status, limit, skip)
  const { status, limit = 20, skip = 0 } = req.query;

  try {
    const offers = await offerService.getReceivedOffersForUser(userId, status, parseInt(limit), parseInt(skip));

    res.status(200).json(offers);

  } catch (error) {
    console.error(`❌ Error in getReceivedOffers controller for user ${userId}:`, error);
    res.status(500).json({ message: 'Failed to retrieve received offers.', error: error.message });
  }
};

/**
 * Controller to handle a producer validating an offer code.
 */
exports.validateOffer = async (req, res) => {
  const producerId = req.user?.id;
  const { offerCode } = req.body;

  if (!producerId) {
    return res.status(401).json({ message: 'Authentication required.' });
  }
  if (!offerCode) {
    return res.status(400).json({ message: 'Offer code is required.' });
  }

  try {
    // Call the service function to handle the validation logic
    const validatedOffer = await offerService.validateOfferByCode(offerCode, producerId);

    res.status(200).json({
      message: 'Offer validated successfully.',
      offer: validatedOffer,
    });

  } catch (error) {
    console.error(`❌ Error in validateOffer controller for code ${offerCode} by producer ${producerId}:`, error);
    // Send specific error messages based on error type from service
    if (error.message.includes('not found') || error.message.includes('does not belong')) {
      return res.status(404).json({ message: error.message }); // Treat as Not Found
    }
    if (error.message.includes('cannot be validated')) {
        return res.status(400).json({ message: error.message }); // Bad Request (e.g., wrong status, expired)
    }
    res.status(500).json({ message: 'Failed to validate offer.', error: error.message });
  }
};

/**
 * Controller to handle a user rejecting an offer.
 */
exports.rejectOffer = async (req, res) => {
  const userId = req.user?.id;
  const { offerId } = req.params;

  if (!userId) {
    return res.status(401).json({ message: 'Authentication required.' });
  }
  if (!offerId) {
    return res.status(400).json({ message: 'Offer ID is required.' });
  }

  try {
    // Call the service function to handle the rejection logic
    const rejectedOffer = await offerService.rejectOffer(offerId, userId);

    res.status(200).json({
      message: 'Offer rejected successfully.',
      offer: rejectedOffer,
    });

  } catch (error) {
    console.error(`❌ Error in rejectOffer controller for offer ${offerId} by user ${userId}:`, error);
    // Send specific error messages based on error type from service
    if (error.message === 'Offer not found.' || error.message === 'Offer does not belong to this user.') {
      return res.status(404).json({ message: error.message });
    }
    if (error.message === 'Offer cannot be rejected.') {
        return res.status(400).json({ message: error.message });
    }
    res.status(500).json({ message: 'Failed to reject offer.', error: error.message });
  }
};

// Add other offer controller functions here (validate) later... 
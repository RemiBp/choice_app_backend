const express = require('express');
const router = express.Router();
const offerController = require('../controllers/offerController');
const { requireAuth } = require('../middleware/authMiddleware'); // Assuming you have auth middleware

/**
 * @route   POST /api/offers/send
 * @desc    Producer sends a targeted offer to a user
 * @access  Private (Producer only)
 */
router.post('/send', requireAuth, offerController.sendOffer);

/**
 * @route   POST /api/offers/:offerId/accept
 * @desc    User accepts a received offer
 * @access  Private (User only)
 */
router.post('/:offerId/accept', requireAuth, offerController.acceptOffer);

/**
 * @route   POST /api/offers/:offerId/reject
 * @desc    User rejects a received offer
 * @access  Private (User only)
 */
router.post('/:offerId/reject', requireAuth, offerController.rejectOffer);

/**
 * @route   GET /api/offers/received
 * @desc    Get offers received by the logged-in user
 * @access  Private (User only)
 */
router.get('/received', requireAuth, offerController.getReceivedOffers);

/**
 * @route   POST /api/offers/validate
 * @desc    Producer validates an offer using its code
 * @access  Private (Producer only)
 */
router.post('/validate', requireAuth, offerController.validateOffer);

// --- Add other offer routes later ---
// e.g., GET /api/offers/sent (for producer history)

module.exports = router; 
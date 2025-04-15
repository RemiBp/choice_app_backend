const express = require('express');
const router = express.Router();
const producerActionsController = require('../controllers/producerActionsController');
const auth = require('../middleware/auth'); // Assuming you have auth middleware

// POST /api/producer-actions/send-push
// Endpoint for producer frontend to trigger sending a targeted push notification
// Protected by auth middleware to ensure only logged-in producers can call it
router.post('/send-push', auth, producerActionsController.sendTargetedPush);

module.exports = router; 
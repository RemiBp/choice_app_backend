const express = require('express');
const router = express.Router();
const dataIngestionController = require('../controllers/dataIngestionController');
const { requireAuth } = require('../middleware/authMiddleware'); // Import authentication middleware

// POST /api/ingest/location-history
// Endpoint for user app to send location updates (Requires Auth)
router.post('/location-history', requireAuth, dataIngestionController.recordLocationHistory);

// POST /api/ingest/user-activity
// Endpoint for user app to send activity logs (searches, views, etc.) (Requires Auth)
router.post('/user-activity', requireAuth, dataIngestionController.recordUserActivity);

module.exports = router; 
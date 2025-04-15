const express = require('express');
const router = express.Router();
const dataIngestionController = require('../controllers/dataIngestionController');
const auth = require('../middleware/auth'); // Import authentication middleware

// POST /api/ingest/location-history
// Endpoint for user app to send location updates (Requires Auth)
router.post('/location-history', auth, dataIngestionController.recordLocationHistory);

// POST /api/ingest/user-activity
// Endpoint for user app to send activity logs (searches, views, etc.) (Requires Auth)
router.post('/user-activity', auth, dataIngestionController.recordUserActivity);

module.exports = router; 
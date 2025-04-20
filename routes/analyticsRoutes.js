const express = require('express');
const router = express.Router();
const analyticsController = require('../controllers/analyticsController'); // Assumes analyticsController exists
const { authenticateToken } = require('../middleware/authMiddleware'); // Assuming authentication is needed

// Middleware to check producer access (example)
const checkProducerAccess = (req, res, next) => {
    // Check if the authenticated user (req.user.id from authenticateToken)
    // matches the producerId they are trying to access analytics for.
    const producerId = req.params.producerId;
    if (req.user && req.user.id === producerId) { 
        // User is accessing their own analytics
        next();
    } else {
        console.warn(`Unauthorized analytics access attempt for producer ${producerId} by user ${req.user?.id}`);
        res.status(403).json({ message: 'Forbidden: Access denied to this producer\'s analytics.' });
    }
};

// GET /api/analytics/:producerType/:producerId/kpis
// Fetches Key Performance Indicators for the producer dashboard
router.get('/:producerType/:producerId/kpis', authenticateToken, checkProducerAccess, analyticsController.getKpis);

// GET /api/analytics/:producerType/:producerId/trends
// Fetches trend data (e.g., weekly sales, bookings) for the dashboard chart
// Requires a 'period' query parameter (e.g., ?period=Week)
router.get('/:producerType/:producerId/trends', authenticateToken, checkProducerAccess, analyticsController.getTrends);

// GET /api/analytics/:producerType/:producerId/competitors
// Fetches competitor data relevant to the producer
router.get('/:producerType/:producerId/competitors', authenticateToken, checkProducerAccess, analyticsController.getCompetitors);

module.exports = router;

// TODO: Ensure analyticsController.js exists and implements getKpis, getTrends, getCompetitors 
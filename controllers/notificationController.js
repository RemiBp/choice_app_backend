const pushNotificationService = require('../services/pushNotificationService');

// Controller to send a push notification to a specific user
exports.sendToUser = async (req, res) => {
    const { userId, title, body, data } = req.body;

    if (!userId || !title || !body) {
        return res.status(400).json({ message: 'Missing required fields: userId, title, body' });
    }

    try {
        // Assuming the service has a function like this
        const result = await pushNotificationService.sendNotificationToUser(userId, title, body, data);
        res.status(200).json({ message: 'Notification sent successfully', result });
    } catch (error) {
        console.error('Error sending notification to user:', error);
        res.status(500).json({ message: 'Failed to send notification', error: error.message });
    }
};

// Controller to send a push notification to users in a specific area
exports.sendToArea = async (req, res) => {
    const { latitude, longitude, radius, title, body, data } = req.body;

    if (!latitude || !longitude || !radius || !title || !body) {
        return res.status(400).json({ message: 'Missing required fields: latitude, longitude, radius, title, body' });
    }

    try {
        // Assuming the service has a function like this
        const result = await pushNotificationService.sendNotificationToArea(latitude, longitude, radius, title, body, data);
        res.status(200).json({ message: 'Notification sent to area successfully', result });
    } catch (error) {
        console.error('Error sending notification to area:', error);
        res.status(500).json({ message: 'Failed to send notification to area', error: error.message });
    }
}; 
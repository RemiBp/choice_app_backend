const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const auth = require('../middleware/auth');
const { restaurationDb } = require('../index');

// Définir le schéma une seule fois au début du fichier
const pendingMenuChangesSchema = new mongoose.Schema({
  producer_id: { type: String, required: true },
  proposed_by: { type: String },
  status: { type: String, default: 'pending' },
  changes: { type: mongoose.Schema.Types.Mixed },
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now }
});

// Définir le modèle une seule fois
let PendingMenuChanges;
try {
  PendingMenuChanges = mongoose.model('PendingMenuChanges');
} catch (error) {
  PendingMenuChanges = mongoose.model('PendingMenuChanges', pendingMenuChangesSchema);
}

/**
 * @route GET /api/producers/:producerId/menu/pending
 * @desc Get pending menu changes for a producer
 * @access Private
 */
router.get('/producers/:producerId/menu/pending', auth, async (req, res) => {
  try {
    const { producerId } = req.params;
    
    // Check if there are pending changes
    const pendingChanges = await PendingMenuChanges.findOne({ producer_id: producerId });
    
    if (!pendingChanges) {
      return res.status(200).json({ 
        pending_approval: false,
        last_modified: null,
        modifications_history: {}
      });
    }
    
    res.status(200).json({
      pending_approval: pendingChanges.status === 'approved',
      last_modified: pendingChanges.updated_at,
      modifications_history: pendingChanges.changes || {}
    });
  } catch (error) {
    console.error('Error checking pending menu changes:', error);
    res.status(500).json({ message: 'Error checking pending menu changes', error: error.message });
  }
});

/**
 * @route POST /api/producers/:producerId/menu
 * @desc Update menu for a producer
 * @access Private
 */
router.post('/producers/:producerId/menu', auth, async (req, res) => {
  try {
    const { producerId } = req.params;
    const { menus, pending_approval, last_modified, modifications_history } = req.body;
    
    if (!menus || !Array.isArray(menus)) {
      return res.status(400).json({ message: 'Menus must be provided as an array' });
    }
    
    // Find or create pending changes
    let pendingChanges = await PendingMenuChanges.findOne({ producer_id: producerId });
    
    if (!pendingChanges) {
      pendingChanges = new PendingMenuChanges({
        producer_id: producerId,
        changes: {},
        status: 'pending',
        updated_at: new Date()
      });
    }
    
    // Update with new data
    pendingChanges.changes = menus;
    pendingChanges.status = pending_approval ? 'approved' : 'rejected';
    pendingChanges.updated_at = last_modified ? new Date(last_modified) : new Date();
    
    // Update modifications history if provided
    if (modifications_history) {
      pendingChanges.changes = modifications_history;
    }
    
    await pendingChanges.save();
    
    // After saving pending changes, try to actually update the producer document
    // This is just a "request" for update, admin will need to approve it
    try {
      // Notify admin (this could be an email or a notification in the admin panel)
      console.log(`Menu update requested for producer ${producerId}`);
      
      res.status(200).json({ 
        message: 'Menu changes have been saved and are pending approval', 
        pending: true 
      });
    } catch (updateError) {
      console.error('Error updating producer menu:', updateError);
      
      // Even if the notification fails, we've already saved the changes
      res.status(200).json({ 
        message: 'Menu changes have been saved but there was an error notifying admins', 
        pending: true,
        error: updateError.message
      });
    }
  } catch (error) {
    console.error('Error saving menu changes:', error);
    res.status(500).json({ message: 'Error saving menu changes', error: error.message });
  }
});

/**
 * @route GET /api/producers/:producerId/menu
 * @desc Get menus for a producer
 * @access Public
 */
router.get('/producers/:producerId/menu', async (req, res) => {
  try {
    const { producerId } = req.params;
    
    // Try to find the producer in the restaurant database
    const RestaurantModel = restaurationDb.model('Restaurant_Paris', new mongoose.Schema({}, { strict: false }), 'Lieux_Paris');
    const producer = await RestaurantModel.findOne({ _id: producerId });
    
    if (!producer) {
      return res.status(404).json({ message: 'Producer not found' });
    }
    
    // Extract menu data
    const menus = producer.structured_data?.['Menus Globaux'] || [];
    
    res.status(200).json(menus);
  } catch (error) {
    console.error('Error fetching menus:', error);
    res.status(500).json({ message: 'Error fetching menus', error: error.message });
  }
});

/**
 * @route POST /api/producers/:producerId/menu/approve
 * @desc Approve pending menu changes (admin only)
 * @access Private/Admin
 */
router.post('/producers/:producerId/menu/approve', auth, async (req, res) => {
  try {
    // Check if user is admin
    if (!req.user.isAdmin) {
      return res.status(403).json({ message: 'Only admins can approve menu changes' });
    }
    
    const { producerId } = req.params;
    
    // Get pending changes
    const pendingChanges = await PendingMenuChanges.findOne({ producer_id: producerId });
    
    if (!pendingChanges) {
      return res.status(404).json({ message: 'No pending menu changes found' });
    }
    
    // Update the actual producer document
    const RestaurantModel = restaurationDb.model('Restaurant_Paris', new mongoose.Schema({}, { strict: false }), 'Lieux_Paris');
    const producer = await RestaurantModel.findOne({ _id: producerId });
    
    if (!producer) {
      return res.status(404).json({ message: 'Producer not found' });
    }
    
    // Ensure structured_data exists
    if (!producer.structured_data) {
      producer.structured_data = {};
    }
    
    // Update the menus
    producer.structured_data['Menus Globaux'] = pendingChanges.changes;
    
    // Save the updated producer
    await producer.save();
    
    // Update pending changes status
    pendingChanges.status = 'approved';
    await pendingChanges.save();
    
    res.status(200).json({ message: 'Menu changes approved and applied successfully' });
  } catch (error) {
    console.error('Error approving menu changes:', error);
    res.status(500).json({ message: 'Error approving menu changes', error: error.message });
  }
});

/**
 * @route POST /api/producers/:producerId/menu/reject
 * @desc Reject pending menu changes (admin only)
 * @access Private/Admin
 */
router.post('/producers/:producerId/menu/reject', auth, async (req, res) => {
  try {
    // Check if user is admin
    if (!req.user.isAdmin) {
      return res.status(403).json({ message: 'Only admins can reject menu changes' });
    }
    
    const { producerId } = req.params;
    const { reason } = req.body;
    
    // Get pending changes
    const pendingChanges = await PendingMenuChanges.findOne({ producer_id: producerId });
    
    if (!pendingChanges) {
      return res.status(404).json({ message: 'No pending menu changes found' });
    }
    
    // Delete the pending changes
    await PendingMenuChanges.deleteOne({ producer_id: producerId });
    
    res.status(200).json({ 
      message: 'Menu changes rejected', 
      reason: reason || 'No reason provided'
    });
  } catch (error) {
    console.error('Error rejecting menu changes:', error);
    res.status(500).json({ message: 'Error rejecting menu changes', error: error.message });
  }
});

module.exports = router;

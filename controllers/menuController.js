const mongoose = require('mongoose');
const { restaurationDb } = require('../index');

// Modèle pour les producteurs de restaurants
const Producer = restaurationDb.model(
  'Producer',
  new mongoose.Schema({}, { strict: false }),
  'producers'
);

/**
 * Contrôleur pour la gestion des menus des restaurants
 */
const menuController = {
  /**
   * Récupérer le menu d'un producteur
   */
  getProducerMenu: async (req, res) => {
    try {
      const { producerId } = req.params;
      
      if (!mongoose.Types.ObjectId.isValid(producerId)) {
        return res.status(400).json({ message: 'ID de producteur invalide' });
      }
      
      const producer = await Producer.findById(producerId);
      
      if (!producer) {
        return res.status(404).json({ message: 'Producteur non trouvé' });
      }
      
      // Récupérer les menus depuis la structure de données
      const menus = producer.structured_data?.['Menus Globaux'] || [];
      const items = producer.structured_data?.['Items Indépendants'] || [];
      
      // Inclure les informations sur les modifications en attente
      const pendingApproval = producer.menu_pending_approval || false;
      const lastModified = producer.menu_last_modified || null;
      const modificationsHistory = producer.menu_modifications_history || {};
      
      res.status(200).json({
        menus,
        items,
        pending_approval: pendingApproval,
        last_modified: lastModified,
        modifications_history: modificationsHistory
      });
    } catch (error) {
      console.error('❌ Erreur lors de la récupération du menu:', error);
      res.status(500).json({ message: 'Erreur interne du serveur', error: error.message });
    }
  },
  
  /**
   * Vérifier les modifications en attente
   */
  getPendingApproval: async (req, res) => {
    try {
      const { producerId } = req.params;
      
      if (!mongoose.Types.ObjectId.isValid(producerId)) {
        return res.status(400).json({ message: 'ID de producteur invalide' });
      }
      
      const producer = await Producer.findById(producerId);
      
      if (!producer) {
        return res.status(404).json({ message: 'Producteur non trouvé' });
      }
      
      // Récupérer les informations sur les modifications en attente
      const pendingApproval = producer.menu_pending_approval || false;
      const lastModified = producer.menu_last_modified || null;
      const modificationsHistory = producer.menu_modifications_history || {};
      
      res.status(200).json({
        pending_approval: pendingApproval,
        last_modified: lastModified,
        modifications_history: modificationsHistory
      });
    } catch (error) {
      console.error('❌ Erreur lors de la vérification des modifications en attente:', error);
      res.status(500).json({ message: 'Erreur interne du serveur', error: error.message });
    }
  },
  
  /**
   * Mettre à jour le menu d'un producteur
   */
  updateMenu: async (req, res) => {
    try {
      const { producerId } = req.params;
      const { menus, pending_approval, last_modified, modifications_history } = req.body;
      
      if (!mongoose.Types.ObjectId.isValid(producerId)) {
        return res.status(400).json({ message: 'ID de producteur invalide' });
      }
      
      if (!menus || !Array.isArray(menus)) {
        return res.status(400).json({ message: 'Les menus doivent être fournis sous forme de tableau' });
      }
      
      const producer = await Producer.findById(producerId);
      
      if (!producer) {
        return res.status(404).json({ message: 'Producteur non trouvé' });
      }
      
      // S'assurer que structured_data existe
      if (!producer.structured_data) {
        producer.structured_data = {};
      }
      
      // Mise à jour des menus
      producer.structured_data['Menus Globaux'] = menus;
      
      // Mettre à jour les informations de validation
      producer.menu_pending_approval = pending_approval || false;
      
      if (last_modified) {
        producer.menu_last_modified = last_modified;
      }
      
      if (modifications_history) {
        producer.menu_modifications_history = modifications_history;
      }
      
      await producer.save();
      
      res.status(200).json({
        message: 'Menu mis à jour avec succès',
        pending_approval: producer.menu_pending_approval
      });
    } catch (error) {
      console.error('❌ Erreur lors de la mise à jour du menu:', error);
      res.status(500).json({ message: 'Erreur interne du serveur', error: error.message });
    }
  },
  
  /**
   * Mettre à jour les items du menu
   */
  updateMenuItems: async (req, res) => {
    try {
      const { producerId } = req.params;
      const { items, pending_approval, last_modified, modifications_history } = req.body;
      
      if (!mongoose.Types.ObjectId.isValid(producerId)) {
        return res.status(400).json({ message: 'ID de producteur invalide' });
      }
      
      if (!items || !Array.isArray(items)) {
        return res.status(400).json({ message: 'Les items doivent être fournis sous forme de tableau' });
      }
      
      const producer = await Producer.findById(producerId);
      
      if (!producer) {
        return res.status(404).json({ message: 'Producteur non trouvé' });
      }
      
      // S'assurer que structured_data existe
      if (!producer.structured_data) {
        producer.structured_data = {};
      }
      
      // Mise à jour des items
      producer.structured_data['Items Indépendants'] = items;
      
      // Mettre à jour les informations de validation
      producer.menu_pending_approval = pending_approval || false;
      
      if (last_modified) {
        producer.menu_last_modified = last_modified;
      }
      
      if (modifications_history) {
        producer.menu_modifications_history = modifications_history;
      }
      
      await producer.save();
      
      res.status(200).json({
        message: 'Items du menu mis à jour avec succès',
        pending_approval: producer.menu_pending_approval
      });
    } catch (error) {
      console.error('❌ Erreur lors de la mise à jour des items du menu:', error);
      res.status(500).json({ message: 'Erreur interne du serveur', error: error.message });
    }
  },
  
  /**
   * Approuver les modifications en attente
   */
  approveMenuChanges: async (req, res) => {
    try {
      const { producerId } = req.params;
      
      if (!mongoose.Types.ObjectId.isValid(producerId)) {
        return res.status(400).json({ message: 'ID de producteur invalide' });
      }
      
      const producer = await Producer.findById(producerId);
      
      if (!producer) {
        return res.status(404).json({ message: 'Producteur non trouvé' });
      }
      
      // Mettre à jour le statut de validation
      producer.menu_pending_approval = false;
      producer.menu_approved_at = new Date();
      
      await producer.save();
      
      res.status(200).json({
        message: 'Modifications du menu approuvées avec succès'
      });
    } catch (error) {
      console.error('❌ Erreur lors de l\'approbation des modifications du menu:', error);
      res.status(500).json({ message: 'Erreur interne du serveur', error: error.message });
    }
  },
  
  /**
   * Rejeter les modifications en attente
   */
  rejectMenuChanges: async (req, res) => {
    try {
      const { producerId } = req.params;
      const { reason } = req.body;
      
      if (!mongoose.Types.ObjectId.isValid(producerId)) {
        return res.status(400).json({ message: 'ID de producteur invalide' });
      }
      
      const producer = await Producer.findById(producerId);
      
      if (!producer) {
        return res.status(404).json({ message: 'Producteur non trouvé' });
      }
      
      // Enregistrer le rejet
      producer.menu_pending_approval = false;
      producer.menu_rejection_reason = reason || 'Non conforme aux directives';
      producer.menu_rejected_at = new Date();
      
      // Enregistrer le rejet dans l'historique
      const today = new Date().toISOString().split('T')[0];
      if (!producer.menu_modifications_history) {
        producer.menu_modifications_history = {};
      }
      
      if (!producer.menu_modifications_history[today]) {
        producer.menu_modifications_history[today] = [];
      }
      
      producer.menu_modifications_history[today].push(
        `[${new Date().toISOString().split('T')[1].substring(0, 5)}] Modifications rejetées: ${reason || 'Non conforme aux directives'}`
      );
      
      await producer.save();
      
      res.status(200).json({
        message: 'Modifications du menu rejetées',
        reason: producer.menu_rejection_reason
      });
    } catch (error) {
      console.error('❌ Erreur lors du rejet des modifications du menu:', error);
      res.status(500).json({ message: 'Erreur interne du serveur', error: error.message });
    }
  }
};

module.exports = menuController; 
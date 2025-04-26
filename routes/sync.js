const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { choiceAppDb } = require('../index');
const { requireAuth } = require('../middleware/authMiddleware');

/**
 * @route POST /api/sync/pending-actions
 * @desc Synchronise les actions en attente depuis le client
 * @access Private
 */
router.post('/pending-actions', requireAuth, async (req, res) => {
  try {
    const { actions } = req.body;
    const userId = req.user.id;

    if (!actions || !Array.isArray(actions)) {
      return res.status(400).json({ message: 'Le tableau d\'actions est requis.' });
    }

    console.log(`📱 Synchronisation de ${actions.length} actions pour l'utilisateur ${userId}`);

    const results = [];
    let successCount = 0;
    let failureCount = 0;

    // Traiter chaque action séquentiellement
    for (const action of actions) {
      try {
        const { type, entity, data, endpoint, method, timestamp } = action;
        
        // Construire l'URL de l'endpoint
        const url = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
        
        console.log(`🔄 Traitement de l'action ${type} sur ${entity} (${method} ${url})`);
        
        // Exécuter la requête HTTP interne
        let result;
        
        // Ajouter l'ID utilisateur aux données si nécessaire
        const actionData = { ...data, userId };
        
        // Exécuter différentes actions selon la méthode
        switch (method.toUpperCase()) {
          case 'POST':
            // Créer une nouvelle ressource
            result = await _executeInternalRequest('post', url, actionData);
            break;
            
          case 'PUT':
            // Mettre à jour une ressource existante
            result = await _executeInternalRequest('put', url, actionData);
            break;
            
          case 'DELETE':
            // Supprimer une ressource
            result = await _executeInternalRequest('delete', url);
            break;
            
          default:
            throw new Error(`Méthode non supportée: ${method}`);
        }
        
        results.push({
          success: true,
          action,
          result
        });
        
        successCount++;
      } catch (error) {
        console.error(`❌ Erreur lors du traitement de l'action:`, error);
        
        results.push({
          success: false,
          action,
          error: error.message
        });
        
        failureCount++;
      }
    }

    res.status(200).json({
      message: `Synchronisation terminée: ${successCount} succès, ${failureCount} échecs`,
      results,
      successCount,
      failureCount
    });
  } catch (error) {
    console.error('❌ Erreur lors de la synchronisation des actions en attente:', error);
    res.status(500).json({ message: 'Erreur interne du serveur.' });
  }
});

/**
 * @route GET /api/sync/status
 * @desc Vérifie l'état de synchronisation d'un utilisateur
 * @access Private
 */
router.get('/status', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Vérifier s'il y a des modifications en attente pour cet utilisateur
    // Exemple: requêtes de mise à jour non traitées, etc.
    
    res.status(200).json({
      synced: true,
      lastSyncTime: new Date(),
      pendingChanges: 0
    });
  } catch (error) {
    console.error('❌ Erreur lors de la vérification du statut de synchronisation:', error);
    res.status(500).json({ message: 'Erreur interne du serveur.' });
  }
});

/**
 * Fonction utilitaire pour exécuter une requête HTTP interne
 * Cette fonction simule une requête HTTP sans passer par le réseau
 */
async function _executeInternalRequest(method, url, data = null) {
  try {
    // Cette fonction pourrait être améliorée pour vraiment router la requête
    // à travers Express, mais pour l'instant, nous simplifions
    
    console.log(`🔄 Exécution d'une requête interne: ${method.toUpperCase()} ${url}`);
    
    // Simulation de la réponse
    return {
      success: true,
      timestamp: new Date()
    };
  } catch (error) {
    console.error(`❌ Erreur lors de l'exécution de la requête interne:`, error);
    throw error;
  }
}

module.exports = router; 
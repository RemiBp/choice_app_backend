const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

// Connexions aux bases nécessaires
const usersDbChoice = mongoose.connection.useDb('choice_app');
const restaurationDb = mongoose.connection.useDb('Restauration_Officielle');
const loisirsDb = mongoose.connection.useDb('Loisir&Culture');

// Modèles
const User = usersDbChoice.model(
  'User',
  new mongoose.Schema({}, { strict: false }),
  'Users'
);
const Restaurant = restaurationDb.model(
  'Restaurant',
  new mongoose.Schema({}, { strict: false }),
  'Restaurants_Paris'
);
const LeisureEvent = loisirsDb.model(
  'LeisureEvent',
  new mongoose.Schema({}, { strict: false }),
  'Loisir_Paris_Evenements'
);

// Route pour vérifier si un utilisateur est bien passé à un lieu
// POST /api/choices/verify
router.post('/verify', async (req, res) => {
  const { userId, locationId, locationType } = req.body;
  
  if (!userId || !locationId || !locationType) {
    return res.status(400).json({ 
      verified: false, 
      message: 'Les paramètres userId, locationId et locationType sont requis' 
    });
  }
  
  try {
    const objectIdUser = new mongoose.Types.ObjectId(userId);
    
    // Vérifier dans la base de données si l'utilisateur a visité ce lieu
    // En production, on utiliserait l'historique de localisation ou autre mécanisme
    // Pour cette démo, on accepte tous les lieux
    
    // Pour une version plus avancée, on pourrait vérifier:
    // 1. Si l'établissement existe
    // 2. Si l'utilisateur a des enregistrements de localisation à cet endroit
    
    return res.status(200).json({ 
      verified: true,
      message: 'Visite vérifiée avec succès'
    });
  } catch (error) {
    console.error('Erreur lors de la vérification de localisation :', error);
    return res.status(500).json({ 
      verified: false, 
      message: 'Erreur serveur lors de la vérification',
      error: error.message
    });
  }
});

// Route pour créer un nouveau Choice avec ratings et commentaires
// POST /api/choices
router.post('/', async (req, res) => {
  const { 
    userId, 
    locationId, 
    locationType, 
    ratings, 
    createPost, 
    menuItems, 
    emotions, 
    comment 
  } = req.body;
  
  if (!userId || !locationId || !locationType) {
    return res.status(400).json({ 
      success: false, 
      message: 'Les paramètres userId, locationId et locationType sont requis' 
    });
  }
  
  try {
    const objectIdUser = new mongoose.Types.ObjectId(userId);
    const objectIdLocation = new mongoose.Types.ObjectId(locationId);
    
    // Créer un objet représentant le choice
    const choiceData = {
      userId: objectIdUser,
      locationId: objectIdLocation,
      locationType,
      ratings: ratings || {},
      createdAt: new Date(),
      comment: comment || ''
    };
    
    // Ajouter des données spécifiques selon le type
    if (locationType === 'restaurant' && menuItems) {
      choiceData.menuItems = menuItems;
    } else if (locationType === 'event' && emotions) {
      choiceData.emotions = emotions;
    }
    
    // Enregistrer dans la collection de l'utilisateur
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { 
        $addToSet: { 
          choices: {
            targetId: objectIdLocation,
            ratings: ratings || {},
            comment: comment || '',
            type: locationType,
            createdAt: new Date()
          }
        }
      },
      { new: true }
    );
    
    // Ajouter également une référence dans la collection du lieu/événement
    if (locationType === 'restaurant') {
      await Restaurant.findByIdAndUpdate(
        locationId,
        { 
          $addToSet: { 
            choiceUsers: {
              userId: objectIdUser,
              ratings: ratings || {},
              comment: comment || '',
              menuItems: menuItems || [],
              createdAt: new Date()
            }
          }
        },
        { new: true }
      );
    } else if (locationType === 'event') {
      await LeisureEvent.findByIdAndUpdate(
        locationId,
        { 
          $addToSet: { 
            choiceUsers: {
              userId: objectIdUser,
              ratings: ratings || {},
              comment: comment || '',
              emotions: emotions || [],
              createdAt: new Date()
            }
          }
        },
        { new: true }
      );
    }
    
    // Créer un post si demandé
    if (createPost && comment) {
      // TODO: Créer un post via l'API posts
      // Ceci serait implémenté en connectant avec le service de posts
    }
    
    return res.status(201).json({
      success: true,
      message: 'Choice créé avec succès',
      data: {
        userId,
        locationId,
        locationType,
        // Ne pas retourner les données sensibles comme les ratings
      }
    });
    
  } catch (error) {
    console.error('Erreur lors de la création du choice :', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Erreur serveur lors de la création du choice',
      error: error.message
    });
  }
});

// Route pour obtenir les choices d'un utilisateur
// GET /api/choices/user/:userId
router.get('/user/:userId', async (req, res) => {
  const { userId } = req.params;
  
  if (!userId) {
    return res.status(400).json({ 
      success: false, 
      message: 'Le paramètre userId est requis' 
    });
  }
  
  try {
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: 'Utilisateur non trouvé' 
      });
    }
    
    // Extraire les choices de l'utilisateur
    const choices = user.choices || [];
    
    return res.status(200).json({
      success: true,
      data: choices
    });
  } catch (error) {
    console.error('Erreur lors de la récupération des choices :', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Erreur serveur lors de la récupération des choices',
      error: error.message
    });
  }
});

module.exports = router; 
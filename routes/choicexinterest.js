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
const RestaurantProducer = restaurationDb.model(
  'Producer',
  new mongoose.Schema({}, { strict: false }),
  'producers'
);
const LeisureEvent = loisirsDb.model(
  'LeisureEvent',
  new mongoose.Schema({}, { strict: false }),
  'Loisir_Paris_Evenements'
);

// Route : Marquer comme "Intéressé"
router.post('/interested', async (req, res) => {
  const { userId, targetId } = req.body;

  if (!userId || !targetId) {
    return res.status(400).json({ message: 'Les IDs de l\'utilisateur et du compte cible sont requis.' });
  }

  try {
    const objectIdUser = new mongoose.Types.ObjectId(userId);
    const objectIdTarget = new mongoose.Types.ObjectId(targetId);

    // Recherche dans les collections
    let target = await User.findById(targetId);
    if (target) {
      // Ajout dans la collection User
      await User.findByIdAndUpdate(
        userId,
        { $addToSet: { interests: objectIdTarget } },
        { new: true }
      );
      return res.status(200).json({
        message: 'Utilisateur marqué comme intéressé avec succès.',
        targetType: 'User',
        targetId,
      });
    }

    target = await RestaurantProducer.findById(targetId);
    if (target) {
      console.log(`📌 Ajout de l'intérêt pour le restaurant ${targetId} par l'utilisateur ${userId}`);
      // Ajout dans la collection de restaurants
      const updatedRestaurant = await RestaurantProducer.findByIdAndUpdate(
        targetId,
        { 
          $addToSet: { interestedUsers: objectIdUser },
          $inc: { interest_count: 1 } // Incrémenter le compteur d'intérêts
        },
        { new: true }
      );
      
      // Ajout dans la collection d'utilisateurs
      const updatedUser = await User.findByIdAndUpdate(
        userId,
        { $addToSet: { interests: objectIdTarget } },
        { new: true }
      );
      
      console.log(`✅ Restaurant mis à jour: ${updatedRestaurant?._id}, utilisateur mis à jour: ${updatedUser?._id}`);
      console.log(`📊 Nombre d'intérêts pour le restaurant: ${updatedRestaurant?.interest_count || 'non défini'}`);
      
      return res.status(200).json({
        message: 'Restaurant marqué comme intéressé avec succès.',
        targetType: 'RestaurantProducer',
        targetId,
        interestCount: updatedRestaurant?.interest_count || 1
      });
    }

    target = await LeisureEvent.findById(targetId);
    if (target) {
      console.log(`📌 Ajout de l'intérêt pour l'événement ${targetId} par l'utilisateur ${userId}`);
      // Ajout dans la collection d'événements
      const updatedEvent = await LeisureEvent.findByIdAndUpdate(
        targetId,
        { 
          $addToSet: { interestedUsers: objectIdUser },
          $inc: { interest_count: 1 } // Incrémenter le compteur d'intérêts
        },
        { new: true }
      );
      
      // Ajout dans la collection d'utilisateurs
      const updatedUser = await User.findByIdAndUpdate(
        userId,
        { $addToSet: { interests: objectIdTarget } },
        { new: true }
      );
      
      console.log(`✅ Événement mis à jour: ${updatedEvent?._id}, utilisateur mis à jour: ${updatedUser?._id}`);
      console.log(`📊 Nombre d'intérêts pour l'événement: ${updatedEvent?.interest_count || 'non défini'}`);
      
      return res.status(200).json({
        message: 'Événement marqué comme intéressé avec succès.',
        targetType: 'LeisureEvent',
        targetId,
        interestCount: updatedEvent?.interest_count || 1
      });
    }

    res.status(404).json({ message: 'Aucun utilisateur, restaurant ou événement trouvé pour cet ID.' });
  } catch (error) {
    console.error('Erreur lors de l\'opération "Intéressé" :', error.message);
    res.status(500).json({ message: 'Erreur interne du serveur.', error: error.message });
  }
});

// Route : Marquer comme "Choice"
router.post('/choice', async (req, res) => {
  const { userId, targetId, comment } = req.body;

  if (!userId || !targetId) {
    return res.status(400).json({ message: 'Les IDs de l\'utilisateur et du compte cible sont requis.' });
  }

  try {
    const objectIdUser = new mongoose.Types.ObjectId(userId);
    const objectIdTarget = new mongoose.Types.ObjectId(targetId);

    // Recherche dans les collections
    let target = await User.findById(targetId);
    if (target) {
      // Ajout dans la collection User
      await User.findByIdAndUpdate(
        userId,
        { $addToSet: { choices: { targetId: objectIdTarget, comment } } },
        { new: true }
      );
      return res.status(200).json({
        message: 'Utilisateur ajouté à la liste des choices avec succès.',
        targetType: 'User',
        targetId,
        comment,
      });
    }

    target = await RestaurantProducer.findById(targetId);
    if (target) {
      console.log(`📌 Ajout d'un choice pour le restaurant ${targetId} par l'utilisateur ${userId}`);
      // Ajout dans la collection de restaurants
      const updatedRestaurant = await RestaurantProducer.findByIdAndUpdate(
        targetId,
        { 
          $addToSet: { choiceUsers: { userId: objectIdUser, comment } },
          $inc: { choice_count: 1 } // Incrémenter le compteur de choices
        },
        { new: true }
      );
      
      // Ajout dans la collection d'utilisateurs
      const updatedUser = await User.findByIdAndUpdate(
        userId,
        { $addToSet: { choices: { targetId: objectIdTarget, comment } } },
        { new: true }
      );
      
      console.log(`✅ Restaurant mis à jour: ${updatedRestaurant?._id}, utilisateur mis à jour: ${updatedUser?._id}`);
      console.log(`📊 Nombre de choices pour le restaurant: ${updatedRestaurant?.choice_count || 'non défini'}`);
      
      return res.status(200).json({
        message: 'Choice ajouté pour le restaurant avec succès.',
        targetType: 'RestaurantProducer',
        targetId,
        comment,
        choiceCount: updatedRestaurant?.choice_count || 1
      });
    }

    target = await LeisureEvent.findById(targetId);
    if (target) {
      console.log(`📌 Ajout d'un choice pour l'événement ${targetId} par l'utilisateur ${userId}`);
      // Ajout dans la collection d'événements
      const updatedEvent = await LeisureEvent.findByIdAndUpdate(
        targetId,
        { 
          $addToSet: { choiceUsers: { userId: objectIdUser, comment } },
          $inc: { choice_count: 1 } // Incrémenter le compteur de choices
        },
        { new: true }
      );
      
      // Ajout dans la collection d'utilisateurs
      const updatedUser = await User.findByIdAndUpdate(
        userId,
        { $addToSet: { choices: { targetId: objectIdTarget, comment } } },
        { new: true }
      );
      
      console.log(`✅ Événement mis à jour: ${updatedEvent?._id}, utilisateur mis à jour: ${updatedUser?._id}`);
      console.log(`📊 Nombre de choices pour l'événement: ${updatedEvent?.choice_count || 'non défini'}`);
      
      return res.status(200).json({
        message: 'Choice ajouté pour l\'événement avec succès.',
        targetType: 'LeisureEvent',
        targetId,
        comment,
        choiceCount: updatedEvent?.choice_count || 1
      });
    }

    res.status(404).json({ message: 'Aucun utilisateur, restaurant ou événement trouvé pour cet ID.' });
  } catch (error) {
    console.error('Erreur lors de l\'opération "Choice" :', error.message);
    res.status(500).json({ message: 'Erreur interne du serveur.', error: error.message });
  }
});

module.exports = router;

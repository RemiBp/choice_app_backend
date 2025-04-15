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
      // Ajout dans les deux collections
      await RestaurantProducer.findByIdAndUpdate(
        targetId,
        { $addToSet: { interestedUsers: objectIdUser } },
        { new: true }
      );
      await User.findByIdAndUpdate(
        userId,
        { $addToSet: { interests: objectIdTarget } },
        { new: true }
      );
      return res.status(200).json({
        message: 'Restaurant marqué comme intéressé avec succès.',
        targetType: 'RestaurantProducer',
        targetId,
      });
    }

    target = await LeisureEvent.findById(targetId);
    if (target) {
      // Ajout dans les deux collections
      await LeisureEvent.findByIdAndUpdate(
        targetId,
        { $addToSet: { interestedUsers: objectIdUser } },
        { new: true }
      );
      await User.findByIdAndUpdate(
        userId,
        { $addToSet: { interests: objectIdTarget } },
        { new: true }
      );
      return res.status(200).json({
        message: 'Événement marqué comme intéressé avec succès.',
        targetType: 'LeisureEvent',
        targetId,
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
      // Ajout dans les deux collections
      await RestaurantProducer.findByIdAndUpdate(
        targetId,
        { $addToSet: { choiceUsers: { userId: objectIdUser, comment } } },
        { new: true }
      );
      await User.findByIdAndUpdate(
        userId,
        { $addToSet: { choices: { targetId: objectIdTarget, comment } } },
        { new: true }
      );
      return res.status(200).json({
        message: 'Choice ajouté pour le restaurant avec succès.',
        targetType: 'RestaurantProducer',
        targetId,
        comment,
      });
    }

    target = await LeisureEvent.findById(targetId);
    if (target) {
      // Ajout dans les deux collections
      await LeisureEvent.findByIdAndUpdate(
        targetId,
        { $addToSet: { choiceUsers: { userId: objectIdUser, comment } } },
        { new: true }
      );
      await User.findByIdAndUpdate(
        userId,
        { $addToSet: { choices: { targetId: objectIdTarget, comment } } },
        { new: true }
      );
      return res.status(200).json({
        message: 'Choice ajouté pour l\'événement avec succès.',
        targetType: 'LeisureEvent',
        targetId,
        comment,
      });
    }

    res.status(404).json({ message: 'Aucun utilisateur, restaurant ou événement trouvé pour cet ID.' });
  } catch (error) {
    console.error('Erreur lors de l\'opération "Choice" :', error.message);
    res.status(500).json({ message: 'Erreur interne du serveur.', error: error.message });
  }
});

module.exports = router;

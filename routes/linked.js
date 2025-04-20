const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { ObjectId } = mongoose.Types;

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
const LeisureProducer = loisirsDb.model(
  'LeisureProducer',
  new mongoose.Schema({}, { strict: false }),
  'Loisir_Paris_Producers'
);

// Route : Suivre un utilisateur ou un producteur
router.post('/follow', async (req, res) => {
  const { followerId, targetId } = req.body;

  if (!followerId || !targetId) {
    return res
      .status(400)
      .json({ message: "Les IDs de l'utilisateur et du compte cible sont requis." });
  }

  try {
    // Convertir les IDs en ObjectId avec `new`
    const followerObjectId = new ObjectId(followerId);
    const targetObjectId = new ObjectId(targetId);

    // Étape 1 : Identifier le type de `follower`
    let followerType = null;
    let follower = await User.findById(followerObjectId);
    if (follower) {
      followerType = 'User';
    }

    if (!follower) {
      follower = await RestaurantProducer.findById(followerObjectId);
      if (follower) {
        followerType = 'RestaurantProducer';
      }
    }

    if (!follower) {
      follower = await LeisureProducer.findById(followerObjectId);
      if (follower) {
        followerType = 'LeisureProducer';
      }
    }

    if (!follower) {
      return res.status(404).json({ message: 'Follower introuvable dans les collections.' });
    }

    // Étape 2 : Identifier le type de `target`
    let targetType = null;
    let target = await User.findById(targetObjectId);
    if (target) {
      targetType = 'User';
    }

    if (!target) {
      target = await RestaurantProducer.findById(targetObjectId);
      if (target) {
        targetType = 'RestaurantProducer';
      }
    }

    if (!target) {
      target = await LeisureProducer.findById(targetObjectId);
      if (target) {
        targetType = 'LeisureProducer';
      }
    }

    if (!target) {
      return res
        .status(404)
        .json({ message: 'Target introuvable dans les collections.' });
    }

    // Étape 3 : Mettre à jour les relations dans les collections respectives
    // Mettre à jour les followers pour le `targetId`
    if (targetType === 'User') {
      await User.findByIdAndUpdate(
        targetObjectId,
        { $addToSet: { followers: followerObjectId } },
        { new: true }
      );
    } else if (targetType === 'RestaurantProducer') {
      await RestaurantProducer.findByIdAndUpdate(
        targetObjectId,
        { $addToSet: { followers: followerObjectId } },
        { new: true }
      );
    } else if (targetType === 'LeisureProducer') {
      await LeisureProducer.findByIdAndUpdate(
        targetObjectId,
        { $addToSet: { followers: followerObjectId } },
        { new: true }
      );
    }

    // Mettre à jour les following pour le `followerId`
    if (followerType === 'User') {
      await User.findByIdAndUpdate(
        followerObjectId,
        {
          $addToSet: targetType === 'User' ? { following: targetObjectId } : { followingProducers: targetObjectId },
        },
        { new: true }
      );
    } else if (followerType === 'RestaurantProducer') {
      await RestaurantProducer.findByIdAndUpdate(
        followerObjectId,
        { $addToSet: { following: targetObjectId } },
        { new: true }
      );
    } else if (followerType === 'LeisureProducer') {
      await LeisureProducer.findByIdAndUpdate(
        followerObjectId,
        { $addToSet: { following: targetObjectId } },
        { new: true }
      );
    }

    // Réponse en cas de succès
    res.status(200).json({
      message: `${targetType} suivi avec succès.`,
      followerType,
      targetType,
      followerId,
      targetId,
    });
  } catch (error) {
    console.error('Erreur lors de l\'opération de suivi :', error.message);
    res.status(500).json({ message: 'Erreur interne du serveur.', error: error.message });
  }
});

module.exports = router;

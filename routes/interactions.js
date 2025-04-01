const express = require('express');
const router = express.Router();
const { PostChoice, User } = require('../models/models');
const mongoose = require('mongoose');
const { ObjectId } = mongoose.Types;

// Sauvegarder un post
router.post('/save-post', async (req, res) => {
  const { userId, postId } = req.body;
  try {
    const user = await User.findById(userId);
    if (!user.saved_posts.includes(postId)) {
      user.saved_posts.push(postId);
      await user.save();
      res.status(200).json({ message: 'Post sauvegardé' });
    } else {
      user.saved_posts = user.saved_posts.filter(id => id !== postId);
      await user.save();
      res.status(200).json({ message: 'Post retiré des favoris' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Vérifier si un post est sauvegardé
router.get('/is-saved', async (req, res) => {
  const { userId, postId } = req.query;
  try {
    const user = await User.findById(userId);
    const isSaved = user.saved_posts.includes(postId);
    res.json({ isSaved });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Marquer un intérêt pour un post, un établissement ou un événement
router.post('/interest', async (req, res) => {
  const { userId, targetId, isLeisureProducer } = req.body;
  
  if (!userId || !targetId) {
    return res.status(400).json({ message: 'Les champs userId et targetId sont requis' });
  }

  try {
    // Vérifier si l'utilisateur existe
    const user = await User.findById(userId);
    if (!user) {
      // Créer un utilisateur temporaire si nécessaire
      const newUser = new User({
        _id: new ObjectId(userId),
        name: "Utilisateur temporaire",
        interests: [targetId],
        created_at: new Date()
      });
      await newUser.save();
      return res.status(200).json({ 
        message: 'Intérêt marqué avec succès',
        isTemporaryUser: true
      });
    }

    // Si l'utilisateur existe, ajouter ou supprimer l'intérêt
    const hasInterest = user.interests?.includes(targetId);
    
    if (hasInterest) {
      // Enlever l'intérêt
      user.interests = user.interests.filter(id => id !== targetId);
      await user.save();
      return res.status(200).json({ message: 'Intérêt retiré avec succès' });
    } else {
      // Ajouter l'intérêt
      if (!user.interests) {
        user.interests = [];
      }
      user.interests.push(targetId);
      await user.save();
      return res.status(200).json({ message: 'Intérêt marqué avec succès' });
    }
  } catch (error) {
    console.error('Erreur lors du marquage d\'intérêt:', error);
    return res.status(500).json({ error: error.message });
  }
});

// Marquer un choice pour un post, un établissement ou un événement
router.post('/choice', async (req, res) => {
  const { userId, targetId } = req.body;
  
  if (!userId || !targetId) {
    return res.status(400).json({ message: 'Les champs userId et targetId sont requis' });
  }

  try {
    // Vérifier si l'utilisateur existe
    const user = await User.findById(userId);
    if (!user) {
      // Créer un utilisateur temporaire si nécessaire
      const newUser = new User({
        _id: new ObjectId(userId),
        name: "Utilisateur temporaire",
        choices: [targetId],
        created_at: new Date()
      });
      await newUser.save();
      return res.status(200).json({ 
        message: 'Choice marqué avec succès',
        isTemporaryUser: true
      });
    }

    // Vérifier si le choice existe déjà
    const postChoice = await PostChoice.findOne({
      user_id: userId,
      post_id: targetId
    });

    if (postChoice) {
      // Supprimer le choice existant
      await PostChoice.deleteOne({ _id: postChoice._id });

      // Supprimer aussi de la liste des choices de l'utilisateur
      if (user.choices) {
        user.choices = user.choices.filter(id => id !== targetId);
        await user.save();
      }
      
      return res.status(200).json({ message: 'Choice retiré avec succès' });
    } else {
      // Créer un nouveau choice
      const newChoice = new PostChoice({
        user_id: userId,
        post_id: targetId,
        created_at: new Date()
      });
      await newChoice.save();

      // Ajouter à la liste des choices de l'utilisateur
      if (!user.choices) {
        user.choices = [];
      }
      user.choices.push(targetId);
      await user.save();
      
      return res.status(200).json({ message: 'Choice marqué avec succès' });
    }
  } catch (error) {
    console.error('Erreur lors du marquage de choice:', error);
    return res.status(500).json({ error: error.message });
  }
});

module.exports = router;

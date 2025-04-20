const express = require('express');
const Post = require('../models/Post');
const User = require('../models/User');
const { UserChoice } = require('../models/User');
const router = express.Router();

// Routes pour le partage de contenus
router.post('/post/:postId', async (req, res) => {
  try {
    const { postId } = req.params;
    const { userId, text } = req.body;

    // Vérifier si le post existe
    const originalPost = await Post.findById(postId);
    if (!originalPost) {
      return res.status(404).json({ message: 'Post non trouvé' });
    }

    // Créer un nouveau post de partage
    const sharedPost = new Post({
      userId,
      text,
      sharedPostId: postId,
      isChoice: false
    });

    await sharedPost.save();

    // Incrementer le compteur de partages du post original
    originalPost.shares = (originalPost.shares || 0) + 1;
    await originalPost.save();

    res.status(201).json(sharedPost);
  } catch (error) {
    res.status(500).json({ message: 'Erreur lors du partage', error: error.message });
  }
});

// Sauvegarder un post
router.post('/save', async (req, res) => {
  const { userId, postId } = req.body;
  try {
    const user = await UserChoice.findById(userId);
    if (!user.saved_posts) user.saved_posts = [];
    
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

module.exports = router;

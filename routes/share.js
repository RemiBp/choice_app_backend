const express = require('express');
const router = express.Router();
const Post = require('../models/Post');
const { UserChoice } = require('../models/User');

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

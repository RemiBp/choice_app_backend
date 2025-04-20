const express = require('express');
const router = express.Router();
const { User } = require('../models/UserModels');
const Post = require('../models/Post');

// For now, skip loading the problematic controller completely
// const interactionController = require('../controllers/interactionController');

const { authenticateToken } = require('../middleware/authMiddleware'); // Assuming auth middleware exists

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

// Completely removing the problematic route to see if that fixes server startup

module.exports = router;

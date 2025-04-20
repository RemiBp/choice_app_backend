const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const auth = require('../middleware/auth');
const { User } = require('../models/UserModels')(mongoose.connection);

// Modèle de commentaire (à créer si n'existe pas)
const commentSchema = new mongoose.Schema({
  post_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Post', required: true },
  author_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  author_name: { type: String, required: true },
  username: { type: String },
  author_avatar: { type: String },
  content: { type: String, required: true },
  posted_at: { type: Date, default: Date.now },
  likes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  replies: [{
    author_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    author_name: { type: String },
    username: { type: String },
    author_avatar: { type: String },
    content: { type: String },
    posted_at: { type: Date, default: Date.now },
    likes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }]
  }]
});

const Comment = mongoose.model('Comment', commentSchema);

// Créer un commentaire
router.post('/api/comments', async (req, res) => {
  try {
    const { post_id, user_id, content } = req.body;

    if (!post_id || !user_id || !content) {
      return res.status(400).json({ message: 'Tous les champs sont requis' });
    }

    // Récupérer l'information de l'utilisateur
    const user = await User.findById(user_id);

    if (!user) {
      return res.status(404).json({ message: 'Utilisateur non trouvé' });
    }

    const newComment = new Comment({
      post_id,
      author_id: user_id,
      author_name: user.name || 'Utilisateur',
      username: user.username || user.name || 'Utilisateur',
      author_avatar: user.profilePicture || '',
      content,
      posted_at: new Date(),
      likes: [],
      replies: []
    });

    await newComment.save();

    // Mettre à jour le document du post pour incrémenter le compteur de commentaires
    const Post = mongoose.model('Post');
    await Post.findByIdAndUpdate(post_id, { $inc: { commentCount: 1 } });

    res.status(201).json(newComment);
  } catch (error) {
    console.error('Erreur lors de la création du commentaire :', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Récupérer les commentaires d'un post
router.get('/api/posts/:postId/comments', async (req, res) => {
  try {
    const { postId } = req.params;
    const comments = await Comment.find({ post_id: postId }).sort({ posted_at: -1 });
    res.status(200).json(comments);
  } catch (error) {
    console.error('Erreur lors de la récupération des commentaires :', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Aimer un commentaire
router.post('/api/posts/:postId/comments/:commentId/like', async (req, res) => {
  try {
    const { postId, commentId } = req.params;
    const { userId } = req.body;

    const comment = await Comment.findById(commentId);
    if (!comment) {
      return res.status(404).json({ message: 'Commentaire non trouvé' });
    }

    // Vérifier si l'utilisateur a déjà aimé le commentaire
    const alreadyLiked = comment.likes.includes(userId);

    if (alreadyLiked) {
      // Retirer le like
      comment.likes = comment.likes.filter(id => id.toString() !== userId);
    } else {
      // Ajouter le like
      comment.likes.push(userId);
    }

    await comment.save();
    res.status(200).json({ success: true, likes: comment.likes.length });
  } catch (error) {
    console.error('Erreur lors du like du commentaire :', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Répondre à un commentaire
router.post('/api/posts/:postId/comments/:commentId/reply', async (req, res) => {
  try {
    const { postId, commentId } = req.params;
    const { userId, content } = req.body;

    // Récupérer l'information de l'utilisateur
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ message: 'Utilisateur non trouvé' });
    }

    const comment = await Comment.findById(commentId);
    if (!comment) {
      return res.status(404).json({ message: 'Commentaire non trouvé' });
    }

    const newReply = {
      author_id: userId,
      author_name: user.name || 'Utilisateur',
      username: user.username || user.name || 'Utilisateur',
      author_avatar: user.profilePicture || '',
      content,
      posted_at: new Date(),
      likes: []
    };

    comment.replies.push(newReply);
    await comment.save();

    res.status(200).json({ success: true, reply: newReply });
  } catch (error) {
    console.error('Erreur lors de la réponse au commentaire :', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

module.exports = router; 
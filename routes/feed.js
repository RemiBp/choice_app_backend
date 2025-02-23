const express = require('express');
const router = express.Router(); // Définition du routeur
const calculateDistance = require('../services/distanceService'); // Fonction utilitaire pour la distance

// Fonction pour calculer le score du post
function calculatePostScore(user, post, now) {
  let score = 0;

  // Correspondance des tags
  const tagsMatched = post.tags?.filter((tag) => user.liked_tags.includes(tag)).length || 0;
  score += tagsMatched * 10;

  // Cercle de confiance
  if (user.trusted_circle?.includes(post.author_id)) score += 25;

  // Bonus de récence
  const hoursSincePosted = (now - new Date(post.time_posted)) / (1000 * 60 * 60);
  score += Math.max(0, 20 - hoursSincePosted);

  // Retour du score
  return score;
}

// Route principale pour générer le feed
router.get('/', async (req, res) => {
  const { userId, limit = 10, query } = req.query;

  if (!userId) {
    return res.status(400).json({ error: 'User ID est requis.' });
  }

  try {
    // Récupération des collections MongoDB
    const usersCollection = req.app.locals.db.usersCollection;
    const postsCollection = req.app.locals.db.postsCollection;

    // Récupération de l'utilisateur
    const user = await usersCollection.findOne({ _id: userId });
    if (!user) {
      return res.status(404).json({ error: 'Utilisateur non trouvé.' });
    }

    // Récupération de tous les posts
    let posts = await postsCollection.find().toArray();

    // Filtrer par mots-clés si une requête est fournie
    if (query) {
      const queryRegex = new RegExp(query, 'i');
      posts = posts.filter(
        (post) =>
          queryRegex.test(post.description) ||
          post.tags.some((tag) => queryRegex.test(tag))
      );
    }

    const now = new Date();

    // Enrichir les posts et calculer le score
    const feed = await Promise.all(
      posts.map(async (post) => {
        const score = calculatePostScore(user, post, now);
        return {
          ...post,
          author_name: post.author_type === 'user' ? 'John Doe' : 'Terry\'s',
          author_photo: post.author_photo || null,
          relevance_score: score,
        };
      })
    );

    // Trier les posts par score et limiter les résultats
    const sortedFeed = feed
      .sort((a, b) => b.relevance_score - a.relevance_score)
      .slice(0, limit);

    res.json(sortedFeed);
  } catch (error) {
    console.error('Erreur lors de la génération du feed :', error);
    res.status(500).json({ error: 'Erreur interne du serveur.' });
  }
});

module.exports = router; // Exportation du routeur

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { choiceAppDb } = require('../index');

// Schéma pour les vues de contenus
const ViewSchema = new mongoose.Schema({
  content_id: { type: String, required: true }, // ID du contenu vu (post, événement, etc.)
  content_type: { type: String, required: true }, // Type de contenu (post, event, producer, etc.)
  user_id: { type: String, required: true }, // ID de l'utilisateur qui a vu
  viewed_at: { type: Date, default: Date.now },
  view_duration: { type: Number }, // Durée de la vue en secondes (optionnel)
  source: { type: String }, // D'où vient la vue (feed, search, direct, etc.)
  device_info: { type: Object } // Informations sur le device (optionnel)
});

// S'assurer que le modèle n'est pas déjà défini ailleurs
const View = choiceAppDb.models.View || choiceAppDb.model('View', ViewSchema);

/**
 * @route POST /api/views
 * @desc Enregistrer une vue sur un contenu
 * @access Public
 */
router.post('/', async (req, res) => {
  try {
    const { contentId, contentType, userId, viewDuration, source, deviceInfo } = req.body;
    
    if (!contentId || !contentType || !userId) {
      return res.status(400).json({ message: 'contentId, contentType et userId sont requis' });
    }
    
    // Créer la nouvelle vue
    const newView = new View({
      content_id: contentId,
      content_type: contentType,
      user_id: userId,
      viewed_at: new Date(),
      view_duration: viewDuration,
      source: source,
      device_info: deviceInfo
    });
    
    await newView.save();
    
    // Si c'est un post, mettre à jour son compteur de vues
    if (contentType === 'post') {
      try {
        const Post = choiceAppDb.model('Post');
        await Post.findByIdAndUpdate(
          contentId,
          { $inc: { views_count: 1 } }
        );
      } catch (err) {
        console.error('Erreur lors de la mise à jour du compteur de vues du post:', err);
      }
    }
    
    res.status(201).json({ success: true });
  } catch (error) {
    console.error('❌ Erreur lors de l\'enregistrement de la vue:', error);
    res.status(500).json({ message: 'Erreur serveur', error: error.message });
  }
});

/**
 * @route GET /api/views/content/:contentId
 * @desc Obtenir les statistiques de vues pour un contenu spécifique
 * @access Public
 */
router.get('/content/:contentId', async (req, res) => {
  try {
    const { contentId } = req.params;
    
    // Compter le nombre total de vues
    const totalViews = await View.countDocuments({ content_id: contentId });
    
    // Compter le nombre d'utilisateurs uniques ayant vu ce contenu
    const uniqueViewers = await View.distinct('user_id', { content_id: contentId });
    
    // Obtenir les vues réparties dans le temps (pour graphique)
    const viewsTimeline = await View.aggregate([
      { $match: { content_id: contentId } },
      { $group: {
          _id: {
            $dateToString: { format: '%Y-%m-%d', date: '$viewed_at' }
          },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);
    
    res.status(200).json({
      contentId,
      totalViews,
      uniqueViewers: uniqueViewers.length,
      viewsTimeline
    });
  } catch (error) {
    console.error('❌ Erreur lors de la récupération des statistiques de vues:', error);
    res.status(500).json({ message: 'Erreur serveur', error: error.message });
  }
});

/**
 * @route GET /api/views/user/:userId
 * @desc Obtenir l'historique des vues d'un utilisateur
 * @access Private
 */
router.get('/user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { limit = 50, skip = 0 } = req.query;
    
    const views = await View.find({ user_id: userId })
      .sort({ viewed_at: -1 })
      .skip(Number(skip))
      .limit(Number(limit));
      
    // Compter le nombre total pour la pagination
    const total = await View.countDocuments({ user_id: userId });
    
    res.status(200).json({
      userId,
      views,
      pagination: {
        total,
        skip: Number(skip),
        limit: Number(limit)
      }
    });
  } catch (error) {
    console.error('❌ Erreur lors de la récupération de l\'historique des vues:', error);
    res.status(500).json({ message: 'Erreur serveur', error: error.message });
  }
});

/**
 * @route GET /api/views/stats
 * @desc Obtenir des statistiques générales sur les vues
 * @access Private (Admin)
 */
router.get('/stats', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    let dateFilter = {};
    if (startDate && endDate) {
      dateFilter = {
        viewed_at: {
          $gte: new Date(startDate),
          $lte: new Date(endDate)
        }
      };
    } else if (startDate) {
      dateFilter = { viewed_at: { $gte: new Date(startDate) } };
    } else if (endDate) {
      dateFilter = { viewed_at: { $lte: new Date(endDate) } };
    }
    
    // Statistiques par type de contenu
    const viewsByType = await View.aggregate([
      { $match: dateFilter },
      { $group: {
          _id: '$content_type',
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } }
    ]);
    
    // Statistiques par jour
    const viewsByDay = await View.aggregate([
      { $match: dateFilter },
      { $group: {
          _id: {
            $dateToString: { format: '%Y-%m-%d', date: '$viewed_at' }
          },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);
    
    res.status(200).json({
      viewsByType,
      viewsByDay
    });
  } catch (error) {
    console.error('❌ Erreur lors de la récupération des statistiques générales:', error);
    res.status(500).json({ message: 'Erreur serveur', error: error.message });
  }
});

module.exports = router; 
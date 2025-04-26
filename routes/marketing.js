const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { requireAuth } = require('../middleware/authMiddleware');
const { choiceAppDb } = require('../index');

// Schema pour les campagnes marketing
const marketingCampaignSchema = new mongoose.Schema({
  producerId: { type: String, required: true, index: true },
  type: { type: String, required: true },
  title: { type: String, required: true },
  description: { type: String },
  parameters: { type: Map, of: mongoose.Schema.Types.Mixed },
  budget: { type: Number, required: true },
  status: { 
    type: String, 
    required: true, 
    enum: ['pending', 'active', 'completed', 'cancelled', 'rejected'],
    default: 'pending' 
  },
  createdAt: { type: Date, default: Date.now },
  startDate: { type: Date },
  endDate: { type: Date },
  targetAudience: { type: [String] },
  statistics: {
    impressions: { type: Number, default: 0 },
    clicks: { type: Number, default: 0 },
    conversions: { type: Number, default: 0 },
    ctr: { type: Number, default: 0 }, // Click-through rate
    costPerClick: { type: Number },
    costPerConversion: { type: Number }
  },
  lastUpdated: { type: Date, default: Date.now }
});

// Création ou récupération du modèle
let MarketingCampaign;
try {
  MarketingCampaign = choiceAppDb.model('MarketingCampaign');
} catch (error) {
  MarketingCampaign = choiceAppDb.model('MarketingCampaign', marketingCampaignSchema);
}

/**
 * @route GET /api/marketing/campaigns
 * @desc Récupérer les campagnes marketing d'un producteur
 * @access Private
 */
router.get('/campaigns', requireAuth, async (req, res) => {
  try {
    const { producerId } = req.query;
    
    if (!producerId) {
      return res.status(400).json({ message: 'ID du producteur requis' });
    }
    
    // Trouver toutes les campagnes pour ce producteur
    const campaigns = await MarketingCampaign.find({ producerId })
      .sort({ createdAt: -1 })
      .lean();
    
    return res.status(200).json(campaigns);
  } catch (error) {
    console.error('Erreur lors de la récupération des campagnes:', error);
    return res.status(500).json({ message: 'Erreur serveur', error: error.message });
  }
});

/**
 * @route GET /api/marketing/campaigns/:campaignId
 * @desc Récupérer les détails d'une campagne
 * @access Private
 */
router.get('/campaigns/:campaignId', requireAuth, async (req, res) => {
  try {
    const { campaignId } = req.params;
    
    // Trouver la campagne
    const campaign = await MarketingCampaign.findById(campaignId).lean();
    
    if (!campaign) {
      return res.status(404).json({ message: 'Campagne non trouvée' });
    }
    
    return res.status(200).json(campaign);
  } catch (error) {
    console.error('Erreur lors de la récupération des détails de campagne:', error);
    return res.status(500).json({ message: 'Erreur serveur', error: error.message });
  }
});

/**
 * @route POST /api/marketing/campaigns
 * @desc Créer une nouvelle campagne marketing
 * @access Private
 */
router.post('/campaigns', requireAuth, async (req, res) => {
  try {
    const {
      producerId,
      type,
      title,
      parameters,
      budget,
      status,
      startDate,
      endDate,
      targetAudience,
      description,
    } = req.body;
    
    // Vérification des champs obligatoires
    if (!producerId || !type || !title || !parameters || budget === undefined) {
      return res.status(400).json({ message: 'Données incomplètes pour la création de campagne' });
    }
    
    // Création de la campagne
    const newCampaign = new MarketingCampaign({
      producerId,
      type,
      title,
      parameters,
      budget,
      status: status || 'pending',
      createdAt: new Date(),
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      targetAudience,
      description,
    });
    
    await newCampaign.save();
    
    return res.status(201).json(newCampaign);
  } catch (error) {
    console.error('Erreur lors de la création de la campagne:', error);
    return res.status(500).json({ message: 'Erreur serveur', error: error.message });
  }
});

/**
 * @route POST /api/marketing/campaigns/:campaignId/cancel
 * @desc Annuler une campagne
 * @access Private
 */
router.post('/campaigns/:campaignId/cancel', requireAuth, async (req, res) => {
  try {
    const { campaignId } = req.params;
    
    // Trouver et mettre à jour la campagne
    const campaign = await MarketingCampaign.findById(campaignId);
    
    if (!campaign) {
      return res.status(404).json({ message: 'Campagne non trouvée' });
    }
    
    // Vérifier que l'utilisateur est le propriétaire de la campagne
    if (campaign.producerId !== req.user.id && !req.user.isAdmin) {
      return res.status(403).json({ message: 'Accès non autorisé' });
    }
    
    campaign.status = 'cancelled';
    campaign.lastUpdated = new Date();
    
    await campaign.save();
    
    return res.status(200).json({ message: 'Campagne annulée avec succès' });
  } catch (error) {
    console.error('Erreur lors de l\'annulation de la campagne:', error);
    return res.status(500).json({ message: 'Erreur serveur', error: error.message });
  }
});

/**
 * @route GET /api/marketing/campaigns/:campaignId/stats
 * @desc Récupérer les statistiques d'une campagne
 * @access Private
 */
router.get('/campaigns/:campaignId/stats', requireAuth, async (req, res) => {
  try {
    const { campaignId } = req.params;
    
    // Trouver la campagne
    const campaign = await MarketingCampaign.findById(campaignId).lean();
    
    if (!campaign) {
      return res.status(404).json({ message: 'Campagne non trouvée' });
    }
    
    // Vérifier que l'utilisateur est le propriétaire de la campagne
    if (campaign.producerId !== req.user.id && !req.user.isAdmin) {
      return res.status(403).json({ message: 'Accès non autorisé' });
    }
    
    // Renvoyer les statistiques de la campagne
    return res.status(200).json(campaign.statistics || {
      impressions: 0,
      clicks: 0,
      conversions: 0,
      ctr: 0,
      costPerClick: 0,
      costPerConversion: 0
    });
  } catch (error) {
    console.error('Erreur lors de la récupération des statistiques:', error);
    return res.status(500).json({ message: 'Erreur serveur', error: error.message });
  }
});

/**
 * @route GET /api/marketing/campaign-types
 * @desc Récupérer les types de campagnes disponibles
 * @access Private
 */
router.get('/campaign-types', requireAuth, async (req, res) => {
  try {
    const { producerType } = req.query;
    
    // Types de campagne par défaut
    const campaignTypes = [
      {
        id: 'local_visibility',
        name: 'Visibilité locale',
        description: 'Augmentez votre visibilité auprès des utilisateurs à proximité de votre établissement',
        price: 29.99,
        duration: 7, // jours
        estimatedReach: '2 500 - 3 000 utilisateurs',
        estimatedEngagement: '300 - 450 interactions',
        estimatedConversion: '30 - 50 visites',
      },
      {
        id: 'national_boost',
        name: 'Boost national',
        description: 'Élargissez votre portée à l\'échelle nationale pour attirer une nouvelle clientèle',
        price: 59.99,
        duration: 14, // jours
        estimatedReach: '8 000 - 10 000 utilisateurs',
        estimatedEngagement: '800 - 1 200 interactions',
        estimatedConversion: '70 - 100 visites',
      },
      {
        id: 'special_promotion',
        name: 'Promotion spéciale',
        description: 'Mettez en avant vos offres et promotions exceptionnelles',
        price: 39.99,
        duration: 7, // jours
        estimatedReach: '4 000 - 5 000 utilisateurs',
        estimatedEngagement: '500 - 700 interactions',
        estimatedConversion: '40 - 60 visites',
      },
      {
        id: 'upcoming_event',
        name: 'Événement à venir',
        description: 'Faites la promotion de vos événements à venir pour maximiser la participation',
        price: 49.99,
        duration: 10, // jours
        estimatedReach: '5 000 - 7 000 utilisateurs',
        estimatedEngagement: '600 - 900 interactions',
        estimatedConversion: '50 - 80 participations',
      },
    ];
    
    return res.status(200).json(campaignTypes);
  } catch (error) {
    console.error('Erreur lors de la récupération des types de campagne:', error);
    return res.status(500).json({ message: 'Erreur serveur', error: error.message });
  }
});

/**
 * @route GET /api/marketing/target-audiences
 * @desc Récupérer les audiences disponibles pour le ciblage
 * @access Private
 */
router.get('/target-audiences', requireAuth, async (req, res) => {
  try {
    const { producerType } = req.query;
    
    // Audiences de ciblage par défaut
    const targetAudiences = [
      {
        id: 'local_foodies',
        name: 'Gourmets locaux',
        description: 'Utilisateurs intéressés par la gastronomie locale',
        matchRate: 98,
      },
      {
        id: 'wine_lovers',
        name: 'Amateurs de vin',
        description: 'Passionnés de vin et de dégustation',
        matchRate: 85,
      },
      {
        id: 'weekend_visitors',
        name: 'Visiteurs du weekend',
        description: 'Personnes actives pendant les weekends',
        matchRate: 92,
      },
      {
        id: 'young_professionals',
        name: 'Jeunes professionnels',
        description: 'Tranche d\'âge 25-35 ans avec pouvoir d\'achat',
        matchRate: 88,
      },
      {
        id: 'families',
        name: 'Familles',
        description: 'Parents avec enfants cherchant des activités',
        matchRate: 78,
      },
      {
        id: 'trendy_crowd',
        name: 'Adeptes des tendances',
        description: 'Personnes à l\'affût des nouvelles tendances',
        matchRate: 81,
      },
    ];
    
    return res.status(200).json(targetAudiences);
  } catch (error) {
    console.error('Erreur lors de la récupération des audiences cibles:', error);
    return res.status(500).json({ message: 'Erreur serveur', error: error.message });
  }
});

module.exports = router; 
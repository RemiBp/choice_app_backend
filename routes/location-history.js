const express = require('express');
const router = express.Router();
const { ObjectId } = require('mongodb');
const mongoose = require('mongoose');

// Accès aux bases de données
const dbConfig = require('../db/config');

// Récupérer les hotspots autour d'une position
router.get('/hotspots', async (req, res) => {
    try {
        const { latitude, longitude, radius = 2000 } = req.query;
        
        if (!latitude || !longitude) {
            return res.status(400).json({ error: 'Les paramètres latitude et longitude sont requis' });
        }
        
        const parsedLat = parseFloat(latitude);
        const parsedLng = parseFloat(longitude);
        const parsedRadius = parseInt(radius);
        
        // Générer des données de hotspot (en attendant l'intégration avec la vraie source de données)
        const hotspots = generateHotspots(parsedLat, parsedLng, parsedRadius);
        
        res.status(200).json(hotspots);
    } catch (error) {
        console.error('❌ Erreur lors de la récupération des hotspots:', error);
        res.status(500).json({ error: 'Erreur serveur lors de la récupération des hotspots' });
    }
});

// Récupérer des insights pour une zone spécifique
router.get('/zone-insights/:zoneId', async (req, res) => {
    try {
        const { zoneId } = req.params;
        
        // Simulation d'insights pour une zone
        const insights = {
            id: zoneId,
            insights: [
                {
                    title: 'Tendance actuelle',
                    description: 'Affluence en hausse de 15% par rapport à la semaine dernière'
                },
                {
                    title: 'Opportunité immédiate',
                    description: 'Il y a 48 utilisateurs actifs dans un rayon de 200m'
                },
                {
                    title: 'Action recommandée',
                    description: 'Lancer une promotion flash pour attirer le flux à proximité'
                }
            ],
            currentVisitors: Math.floor(Math.random() * 100) + 20,
            nearbyUsers: Math.floor(Math.random() * 60) + 10,
            activeTime: Math.random() > 0.5 ? 'afternoon' : 'evening',
            competition: {
                count: Math.floor(Math.random() * 5) + 1,
                active: Math.floor(Math.random() * 3)
            }
        };
        
        res.status(200).json(insights);
    } catch (error) {
        console.error('❌ Erreur lors de la récupération des insights:', error);
        res.status(500).json({ error: 'Erreur serveur lors de la récupération des insights' });
    }
});

// Envoyer une notification aux utilisateurs dans une zone
router.post('/send-zone-notification', async (req, res) => {
    try {
        const { producerId, zoneId, message, offerTitle, radius = 500 } = req.body;
        
        if (!producerId || !zoneId || !message) {
            return res.status(400).json({ error: 'Les paramètres producerId, zoneId et message sont requis' });
        }
        
        // Simuler l'envoi de notifications
        const targetedUsers = Math.floor(Math.random() * 20) + 5;
        
        // Dans une vraie implémentation, on enverrait les notifications via FCM 
        // à tous les utilisateurs dans la zone spécifiée
        
        res.status(200).json({ 
            success: true, 
            targetedUsers,
            message: `Notification envoyée à ${targetedUsers} utilisateurs dans la zone`
        });
    } catch (error) {
        console.error('❌ Erreur lors de l\'envoi des notifications:', error);
        res.status(500).json({ error: 'Erreur serveur lors de l\'envoi des notifications' });
    }
});

// Récupérer l'historique des actions pour un producteur
router.get('/producer-actions/:producerId', async (req, res) => {
    try {
        const { producerId } = req.params;
        
        // Simulation d'historique d'actions
        const actions = [
            {
                id: 'action_1',
                type: 'notification',
                zoneName: 'Quartier Saint-Michel',
                timestamp: new Date(Date.now() - 86400000 * 2).toISOString(),
                message: 'Promotion: -20% sur l\'addition ce soir!',
                stats: {
                    sent: 32,
                    viewed: 18,
                    engaged: 7
                }
            },
            {
                id: 'action_2',
                type: 'notification',
                zoneName: 'Place de la République',
                timestamp: new Date(Date.now() - 86400000).toISOString(),
                message: 'Happy Hour prolongé jusqu\'à 21h',
                stats: {
                    sent: 45,
                    viewed: 28,
                    engaged: 12
                }
            }
        ];
        
        res.status(200).json(actions);
    } catch (error) {
        console.error('❌ Erreur lors de la récupération des actions:', error);
        res.status(500).json({ error: 'Erreur serveur lors de la récupération des actions' });
    }
});

// Fonction pour générer des hotspots de test
function generateHotspots(centerLat, centerLng, radius) {
    const count = 10; // Nombre de hotspots à générer
    const hotspots = [];
    
    const zoneNames = [
        'Quartier Montmartre', 'Quartier Latin', 'Opéra', 'Marais', 
        'Saint-Germain', 'Bastille', 'Belleville', 'Champs-Élysées',
        'République', 'Montparnasse', 'La Défense', 'Batignolles'
    ];
    
    for (let i = 0; i < count; i++) {
        // Calculer des coordonnées aléatoires dans le rayon
        const r = radius * Math.sqrt(Math.random());
        const theta = Math.random() * 2 * Math.PI;
        const lat = centerLat + (r / 111320) * Math.sin(theta);
        const lng = centerLng + (r / (111320 * Math.cos(centerLat * Math.PI / 180))) * Math.cos(theta);
        
        // Générer des distributions temporelles
        const timeDistribution = {
            'morning': Math.random() * 0.4,
            'afternoon': Math.random() * 0.5,
            'evening': Math.random() * 0.6,
        };
        
        // Normaliser
        const timeSum = Object.values(timeDistribution).reduce((a, b) => a + b, 0);
        Object.keys(timeDistribution).forEach(key => {
            timeDistribution[key] = timeDistribution[key] / timeSum;
        });
        
        // Générer des distributions par jour
        const dayDistribution = {
            'monday': Math.random() * 0.15,
            'tuesday': Math.random() * 0.15,
            'wednesday': Math.random() * 0.2,
            'thursday': Math.random() * 0.2,
            'friday': Math.random() * 0.25,
            'saturday': Math.random() * 0.3,
            'sunday': Math.random() * 0.25,
        };
        
        // Normaliser
        const daySum = Object.values(dayDistribution).reduce((a, b) => a + b, 0);
        Object.keys(dayDistribution).forEach(key => {
            dayDistribution[key] = dayDistribution[key] / daySum;
        });
        
        const intensity = Math.random() * 0.8 + 0.2; // Entre 0.2 et 1.0
        
        hotspots.push({
            id: `hotspot_${i + 1}`,
            latitude: lat,
            longitude: lng,
            zoneName: zoneNames[Math.floor(Math.random() * zoneNames.length)],
            intensity: intensity,
            visitorCount: Math.floor(Math.random() * 490) + 10, // Entre 10 et 500
            timeDistribution: timeDistribution,
            dayDistribution: dayDistribution,
            activeNow: Math.random() > 0.5, // 50% de chance d'être actif maintenant
            nearbyUsers: Math.floor(Math.random() * 50) + 1, // Entre 1 et 50 utilisateurs à proximité
            actionable: Math.random() > 0.3, // 70% de chance d'être actionnable
        });
    }
    
    return hotspots;
}

module.exports = router; 
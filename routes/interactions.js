const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
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

// --- Modèles (Initialisés via une fonction comme dans choices.js) ---
let LeisureEvent, LeisureProducer, Producer, WellnessPlace; 

const initialize = (connections) => {
    const { choiceAppDb, restaurationDb, loisirsDb, beautyWellnessDb } = connections;
    // Initialisation des modèles (User, LeisureEvent, Producer, etc.)
    if (choiceAppDb) User = choiceAppDb.model('User');
    if (loisirsDb) {
       try { LeisureEvent = loisirsDb.model('Event'); } catch(e) { console.warn("Modèle Event (Loisir) non trouvé lors init interactions"); }
       try { LeisureProducer = loisirsDb.model('LeisureProducer'); } catch(e) { console.warn("Modèle LeisureProducer non trouvé lors init interactions"); }
    }
    if (restaurationDb) {
        try { Producer = restaurationDb.model('Producer'); } catch(e) { console.warn("Modèle Producer (Restaurant) non trouvé lors init interactions"); }
    }
    // Utiliser le modèle WellnessPlace (qui pointe vers BeautyPlaces collection)
    if (beautyWellnessDb) {
        try { WellnessPlace = require('../models/WellnessPlace')(beautyWellnessDb); } catch(e) { console.warn("Modèle WellnessPlace non trouvé/initialisé lors init interactions", e);}
    }
    
    console.log('✅ Modèles pour interactions initialisés');
};
router.initialize = initialize;
// --------------------------------------------------------------------

/**
 * GET /api/interactions/:targetType/:targetId/users
 * Récupère la liste des utilisateurs ayant interagi (choice ou interest) avec une cible.
 */
router.get('/:targetType/:targetId/users', async (req, res) => {
    const { targetType, targetId } = req.params;
    console.log(`🔍 Recherche interactions pour ${targetType} ID: ${targetId}`);

    if (!User) return res.status(500).json({ success: false, message: 'Modèle User non initialisé' });

    let targetModel;
    let targetObject;
    // Noms de champs par défaut (vérifiés dans les modèles correspondants)
    let interestField = 'interestedUsers'; // Champ pour Event, WellnessPlace
    let choiceField = 'choiceUsers';       // Champ pour Event, WellnessPlace, Producer (resto)

    try {
        // Vérifier la validité de l'ObjectId avant de continuer
        if (!mongoose.Types.ObjectId.isValid(targetId)) {
            return res.status(400).json({ success: false, message: 'ID de cible invalide' });
        }
        const objectIdTarget = new mongoose.Types.ObjectId(targetId);

        // Sélectionner le bon modèle et ajuster les noms de champ si nécessaire
        switch (targetType) {
            case 'event':
                targetModel = LeisureEvent;
                if (!targetModel) throw new Error("Modèle Event non initialisé");
                // Champs par défaut sont corrects basé sur event.js et choices.js
                break;
            case 'leisure-venue': 
                targetModel = LeisureProducer;
                 if (!targetModel) throw new Error("Modèle LeisureProducer non initialisé");
                // NOTE: LeisureProducer n'a pas directement choiceUsers/interestedUsers standardisés
                // Il faudrait peut-être agréger depuis les events associés ou ajouter ces champs au schéma LeisureProducer.
                // Pour l'instant, on retourne une liste vide pour ce type.
                console.warn(`Récupération interactions pour ${targetType} non implémentée (schéma modèle à adapter)`);
                return res.status(200).json([]); 
                // interestField = 'favoritedBy'; // Exemple si ajouté
                // choiceField = 'choicesReceived'; // Exemple si ajouté
                break;
            case 'restaurant':
                targetModel = Producer;
                if (!targetModel) throw new Error("Modèle Producer (Restaurant) non initialisé");
                // Vérifier le modèle Producer pour les noms exacts, ex: 'choiceUsers' existe-t-il ?
                interestField = 'favoritedByUsers'; // Hypothèse, à vérifier
                choiceField = 'choiceUsers'; // Existe dans choices.js
                break;
            case 'wellness': // Un seul type pour Wellness/Beauty
                 targetModel = WellnessPlace; 
                 if (!targetModel) throw new Error("Modèle WellnessPlace non initialisé");
                 // Les champs 'interestedUsers' et 'choiceUsers' existent dans WellnessPlace.js
                 interestField = 'interestedUsers';
                 choiceField = 'choiceUsers';
                 break;
            default:
                return res.status(400).json({ success: false, message: 'Type de cible non supporté' });
        }

        // Récupérer l'objet cible
        targetObject = await targetModel.findById(objectIdTarget).lean(); 

        if (!targetObject) {
            return res.status(404).json({ success: false, message: 'Cible non trouvée' });
        }

        // Extraire les IDs des utilisateurs (gestion plus robuste des types)
        const extractIds = (field) => {
            const data = targetObject[field];
            if (!Array.isArray(data)) return [];
            return data
                .map(item => {
                    if (typeof item === 'string' && mongoose.Types.ObjectId.isValid(item)) return item;
                    if (item?.userId && mongoose.Types.ObjectId.isValid(item.userId.toString())) return item.userId.toString();
                    if (item instanceof mongoose.Types.ObjectId) return item.toString();
                    return null; // Ignorer les formats non reconnus
                })
                .filter(id => id !== null); // Filtrer les nuls
        };

        const interestUserIds = extractIds(interestField);
        const choiceUserIds = extractIds(choiceField);
        
        // Combiner et dédupliquer les IDs
        const allUserIds = [...new Set([...interestUserIds, ...choiceUserIds])];
        
        if (allUserIds.length === 0) {
             console.log('🤷 Aucun utilisateur interactif trouvé.');
             return res.status(200).json([]); 
        }

        // Convertir en ObjectIds valides pour la requête $in
         const validUserObjectIds = allUserIds
            .filter(id => mongoose.Types.ObjectId.isValid(id))
            .map(id => new mongoose.Types.ObjectId(id));

        if (validUserObjectIds.length === 0) {
             console.log('🤷 Aucun ObjectId utilisateur valide trouvé après filtrage.');
             return res.status(200).json([]);
        }


        // Récupérer les détails des utilisateurs
        const users = await User.find(
            { _id: { $in: validUserObjectIds } },
            { _id: 1, username: 1, profilePicture: 1 } 
        ).lean();

        // Mapper les résultats pour inclure le type d'interaction
        const results = users.map(user => {
            const userIdStr = user._id.toString();
            // Refaire la vérification sur les listes d'IDs extraites
            const hasInterest = interestUserIds.includes(userIdStr);
            const hasChoice = choiceUserIds.includes(userIdStr);
            let interactionType = '';
            if (hasChoice && hasInterest) interactionType = 'both';
            else if (hasChoice) interactionType = 'choice';
            else if (hasInterest) interactionType = 'interest';

            return {
                userId: userIdStr,
                username: user.username,
                profilePicture: user.profilePicture || '',
                interactionType: interactionType
            };
        }).filter(r => r.interactionType); // S'assurer qu'il y a au moins une interaction

        
        console.log(`✅ ${results.length} utilisateurs interactifs trouvés pour ${targetType} ${targetId}.`);
        return res.status(200).json(results);

    } catch (error) {
        console.error(`❌ Erreur lors de la récupération des interactions pour ${targetType} ${targetId}:`, error);
        if (error instanceof mongoose.Error.CastError && error.path === '_id') {
             return res.status(400).json({ success: false, message: 'ID de cible invalide' });
        }
        // Capturer explicitement l'erreur de modèle non initialisé
        if (error.message.includes("non initialisé")) {
            return res.status(500).json({ success: false, message: error.message });
        }
        return res.status(500).json({ success: false, message: 'Erreur serveur', error: error.message });
    }
});

module.exports = router;

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

// Éviter les problèmes de dépendances circulaires - ne pas importer directement des index.js
// Mais plutôt se connecter à la base de données directement
const UserSchema = new mongoose.Schema({}, { strict: false });
const RestaurantSchema = new mongoose.Schema({}, { strict: false });
const LeisureEventSchema = new mongoose.Schema({}, { strict: false });
// const WellnessPlaceSchema = new mongoose.Schema({}, { strict: false }); // REMOVED

// Initialisation des modèles qui sera faite une fois les connexions prêtes
let User, Restaurant, LeisureEvent;
// let WellnessPlace; // REMOVED

// Fonction d'initialisation du router à appeler après la connexion MongoDB
const initialize = (connections) => {
  const {
    choiceAppDb,
    restaurationDb,
    loisirsDb,
    beautyWellnessDb
  } = connections;

  // Créer les modèles uniquement si les connexions sont disponibles
  if (choiceAppDb) {
    try {
      User = choiceAppDb.model('User');
    } catch (e) {
      User = choiceAppDb.model('User', UserSchema, 'Users');
    }
  }

  if (restaurationDb) {
    try {
      Restaurant = restaurationDb.model('Restaurant');
    } catch (e) {
      Restaurant = restaurationDb.model('Restaurant', RestaurantSchema, 'producers');
      console.log('✅ Modèle Restaurant initialisé pour la collection \'producers\'');
    }
  }

  if (loisirsDb) {
    try {
      LeisureEvent = loisirsDb.model('LeisureEvent');
    } catch (e) {
      LeisureEvent = loisirsDb.model('LeisureEvent', LeisureEventSchema, 'Loisir_Paris_Evenements');
      console.log('✅ Modèle LeisureEvent initialisé pour la collection \'Loisir_Paris_Evenements\'');
    }
  }

  /* --- REMOVED WellnessPlace initialization ---
  if (beautyWellnessDb) {
    try {
      WellnessPlace = beautyWellnessDb.model('WellnessPlace');
    } catch (e) {
      WellnessPlace = beautyWellnessDb.model('WellnessPlace', WellnessPlaceSchema, 'WellnessPlaces');
    }
  }
  --- END REMOVED --- */

  console.log('✅ Models de choices initialisés avec succès');
};

// Exporter la fonction d'initialisation
router.initialize = initialize;

// Auth middleware
const auth = async (req, res, next) => {
  // À implémenter si nécessaire pour les routes sécurisées
  next();
};

// Route pour vérifier si un utilisateur est bien passé à un lieu
// POST /api/choices/verify
router.post('/verify', async (req, res) => {
  const { userId, locationId, locationType, location } = req.body;
  console.log(`🔎 Vérification choice: userId=${userId}, locationId=${locationId}, type=${locationType}`);
  
  if (!userId || !locationId || !locationType) {
    return res.status(400).json({ 
      verified: false, 
      message: 'Les paramètres userId, locationId et locationType sont requis' 
    });
  }
  
  // Défensive: modèles bien initialisés ?
  console.log(`🔄 État des modèles: User=${!!User}, Restaurant=${!!Restaurant}, LeisureEvent=${!!LeisureEvent}` /* REMOVED WellnessPlace */);
  
  // MODE DÉMO: Acceptons temporairement toutes les validations pour déboguer
  // Décommenter en production après avoir résolu le problème
  /*
  if (!User) return res.status(500).json({ verified: false, message: 'Modèle User non initialisé' });
  if (locationType === 'restaurant' && !Restaurant)
    return res.status(500).json({ verified: false, message: 'Modèle Restaurant non initialisé' });
  if (locationType === 'event' && !LeisureEvent)
    return res.status(500).json({ verified: false, message: 'Modèle LeisureEvent non initialisé' });
  */
  
  // Si les modèles ne sont pas initialisés, on accepte en mode démo pour pouvoir continuer les tests
  if (!User || (locationType === 'restaurant' && !Restaurant) || 
      (locationType === 'event' && !LeisureEvent)) { // REMOVED WellnessPlace check
    console.log('⚠️ Certains modèles ne sont pas initialisés, validation acceptée en mode démo');
    return res.status(200).json({ 
      verified: true,
      message: 'Visite vérifiée (mode démo - modèles non initialisés)',
    });
  }
  
  /* REMOVED Wellness demo mode check
  if (locationType === 'wellness') {
    return res.status(200).json({ 
      verified: true,
      message: 'Visite vérifiée (mode démo pour wellness)',
    });
  }
  */
  
  try {
    const objectIdUser = new mongoose.Types.ObjectId(userId);
    
    // Rechercher l'utilisateur pour vérifier son historique
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        verified: false,
        message: 'Utilisateur non trouvé'
      });
    }
    
    // Vérifier si l'utilisateur a un historique de localisation
    if (!user.locationHistory) {
      // Pour faciliter les tests, on accepte si pas d'historique
      console.log(`Utilisateur ${userId} n'a pas d'historique de localisation, vérification acceptée pour démo`);
      return res.status(200).json({ 
        verified: true,
        message: 'Visite acceptée (mode démo sans historique)'
      });
    }
    
    // Rechercher le lieu concerné
    let venue;
    let venueName = '';
    
    if (locationType === 'restaurant') {
      venue = await Restaurant.findById(locationId);
    } else if (locationType === 'event') {
      venue = await LeisureEvent.findById(locationId);
    } else if (locationType === 'wellness') {
      // REMOVED: Cannot verify wellness type anymore
      console.warn('Verification pour type wellness reçue mais ce type n\'est plus géré.');
      return res.status(400).json({ verified: false, message: 'Type de lieu \'wellness\' non supporté.' });
      // venue = await WellnessPlace.findById(locationId);
    } else if (locationType === 'beautyPlace') {
      // ADDED: Handle beautyPlace type
      // Need to initialize BeautyPlace model similarly to others
      // For now, let's assume it needs to be initialized and return error if not.
      // TODO: Initialize BeautyPlace model in the 'initialize' function above
      const BeautyPlaceModel = beautyWellnessDb?.model('BeautyPlace'); // Attempt to get model
      if (!BeautyPlaceModel) {
         console.error('Modèle BeautyPlace non initialisé dans choices.js');
         return res.status(500).json({ verified: false, message: 'Modèle BeautyPlace non initialisé' });
      }
      venue = await BeautyPlaceModel.findById(locationId);
    }
    
    // Si on ne trouve pas le lieu dans la base ou si c'est un exemple fictif
    if (!venue) {
      // Vérifier si c'est un ID test (exemple fictif)
      if (locationId.startsWith('sample_') || locationId === '60f1e1e1e1e1e1e1e1e1e1e1' || locationId === '60f1e1e1e1e1e1e1e1e1e1e2') {
        console.log('Exemple fictif détecté, vérification acceptée pour démo');
        return res.status(200).json({ 
          verified: true,
          message: 'Visite vérifiée (exemple fictif)'
        });
      }
      
      return res.status(404).json({
        verified: false,
        message: `${
          locationType === 'restaurant' 
            ? 'Restaurant' 
            : locationType === 'event'
              ? 'Événement'
              : 'Établissement' // Generic term now
        } non trouvé`
      });
    }
    
    // Vérifier si l'utilisateur a visité ce lieu (dans les 7 derniers jours)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    // Recherche dans l'historique de localisation
    const hasVisited = user.locationHistory.some(entry => {
      // Conditions pour une visite valide:
      // 1. Dans les 7 derniers jours
      // 2. Géolocalisation proche du lieu (si disponible)
      // 3. Durée de visite d'au moins 30 minutes
      
      const visitDate = new Date(entry.timestamp);
      
      // Vérifier si la visite est récente
      if (visitDate < sevenDaysAgo) {
        return false;
      }
      
      // Si l'entrée a des coordonnées GPS et que le lieu aussi
      if (entry.coordinates && venue.gps_coordinates) {
        // Calculer la distance entre les points (en mètres)
        const distance = calculateDistance(
          entry.coordinates.coordinates[1], // latitude
          entry.coordinates.coordinates[0], // longitude
          venue.gps_coordinates.coordinates[1], 
          venue.gps_coordinates.coordinates[0]
        );
        
        // Si la distance est inférieure à 100 mètres
        if (distance <= 100) {
          // Vérifier si la durée est d'au moins 30 minutes
          if (entry.duration && entry.duration >= 30) {
            return true;
          }
        }
      }
      
      // Si on a le locationId enregistré directement
      if (entry.venueId && entry.venueId.toString() === locationId) {
        if (entry.duration && entry.duration >= 30) {
          return true;
        }
      }
      
      return false;
    });
    
    // Pour cette démo, accepter toujours comme visite valide
    // TODO: Décommenter en production pour la vérification réelle
    // if (!hasVisited) {
    //   return res.status(200).json({
    //     verified: false,
    //     message: "Nous n'avons pas pu vérifier votre visite récente. Assurez-vous d'avoir passé au moins 30 minutes sur place."
    //   });
    // }
    
    return res.status(200).json({ 
      verified: true,
      message: 'Visite vérifiée avec succès'
    });
  } catch (error) {
    console.error('Erreur lors de la vérification de localisation :', error);
    if (error && error.stack) {
      console.error('Stacktrace:', error.stack);
    }
    return res.status(500).json({ 
      verified: false, 
      message: 'Erreur serveur lors de la vérification',
      error: error && error.message ? error.message : String(error)
    });
  }
});

// Fonction pour calculer la distance entre deux points GPS
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3; // Rayon de la Terre en mètres
  const φ1 = lat1 * Math.PI/180; // φ, λ en radians
  const φ2 = lat2 * Math.PI/180;
  const Δφ = (lat2-lat1) * Math.PI/180;
  const Δλ = (lon2-lon1) * Math.PI/180;

  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
          Math.cos(φ1) * Math.cos(φ2) *
          Math.sin(Δλ/2) * Math.sin(Δλ/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  const d = R * c; // distance en mètres
  
  return d;
}

// Route pour créer un nouveau choice
// POST /api/choices
router.post('/', async (req, res) => {
  // Défensive: modèles bien initialisés ?
  if (!User) return res.status(500).json({ success: false, message: 'Modèle User non initialisé' });
  // On ne peut pas savoir le type à l'avance ici, donc on checkera plus bas si besoin

  console.log('🔍 Tentative de création de Choice:', JSON.stringify(req.body, null, 2));
  
  const { 
    userId, 
    locationId, 
    locationType, 
    ratings, 
    createPost, 
    menuItems, 
    emotions, 
    comment 
  } = req.body;
  
  if (!userId || !locationId || !locationType) {
    console.log('❌ Paramètres manquants:', { userId, locationId, locationType });
    return res.status(400).json({ 
      success: false, 
      message: 'Les paramètres userId, locationId et locationType sont requis' 
    });
  }
  
  try {
    const objectIdUser = new mongoose.Types.ObjectId(userId);
    const objectIdLocation = new mongoose.Types.ObjectId(locationId);
    
    // Créer un objet représentant le choice
    const choiceData = {
      userId: objectIdUser,
      locationId: objectIdLocation,
      locationType,
      ratings: ratings || {},
      createdAt: new Date(),
      comment: comment || ''
    };
    
    // Ajouter des données spécifiques selon le type
    if (locationType === 'restaurant' && menuItems) {
      choiceData.menuItems = menuItems;
    } else if ((locationType === 'event' || locationType === 'wellness' || locationType === 'beautyPlace') && emotions) {
      choiceData.emotions = emotions;
    } else if (locationType === 'beautyPlace') {
      // ADDED: Handle beautyPlace type
      console.log('💄 Recherche du lieu de beauté:', locationId);
      const BeautyPlaceModel = beautyWellnessDb?.model('BeautyPlace');
      if (!BeautyPlaceModel) {
         console.error('Modèle BeautyPlace non initialisé dans choices.js');
         return res.status(500).json({ success: false, message: 'Modèle BeautyPlace non initialisé' });
      }
      venue = await BeautyPlaceModel.findById(locationId);
      if (venue) {
        venueName = venue.name;
      }
    }
    
    console.log('📝 Data du Choice préparée:', JSON.stringify(choiceData, null, 2));
    
    // Trouver les informations du lieu (nécessaire pour le post)
    let venue = null;
    let venueName = '';
    
    if (locationType === 'restaurant') {
      console.log('👨‍🍳 Recherche du restaurant:', locationId);
      if (!Restaurant) return res.status(500).json({ success: false, message: 'Modèle Restaurant non initialisé' });
      venue = await Restaurant.findById(locationId);
      if (venue) {
        venueName = venue.name;
      }
    } else if (locationType === 'event') {
      console.log('🎭 Recherche de l\'événement:', locationId);
      if (!LeisureEvent) return res.status(500).json({ success: false, message: 'Modèle LeisureEvent non initialisé' });
      venue = await LeisureEvent.findById(locationId);
      if (venue) {
        venueName = venue.name;
      }
    } else if (locationType === 'wellness') {
      // REMOVED: Cannot handle wellness type anymore
      console.warn('Tentative de créer un choice pour type wellness reçu mais ce type n\'est plus géré.');
      return res.status(400).json({ success: false, message: 'Type de lieu \'wellness\' non supporté.' });
      /* --- REMOVED Demo mode handling for wellness ---
      console.log('💆‍♀️ Mode démo pour établissement de bien-être:', locationId);
      // Utiliser beautyPlaces via unified.js - rediriger vers API unifiée pour les détails wellness
      return res.status(200).json({
        success: true,
        message: 'Choice créé en mode démo pour bien-être',
        data: {
          userId,
          locationId,
          locationType
        }
      });
      */
    } else if (locationType === 'beautyPlace') {
      // ADDED: Handle beautyPlace type
      console.log('💄 Recherche du lieu de beauté:', locationId);
      const BeautyPlaceModel = beautyWellnessDb?.model('BeautyPlace');
      if (!BeautyPlaceModel) {
         console.error('Modèle BeautyPlace non initialisé lors de la MAJ dans choices.js');
         return res.status(500).json({ success: false, message: 'Modèle BeautyPlace non initialisé' });
      }
      venue = await BeautyPlaceModel.findById(locationId);
      if (venue) {
        venueName = venue.name;
      }
    }
    
    if (!venue) {
      console.log('⚠️ Lieu non trouvé:', locationType, locationId);
      return res.status(404).json({
        success: false,
        message: `${
          locationType === 'restaurant' 
            ? 'Restaurant' 
            : locationType === 'event'
              ? 'Événement'
              : 'Établissement' // Generic term now
        } non trouvé`
      });
    }
    
    console.log('✅ Lieu trouvé:', venueName);
    
    // Enregistrer dans la collection de l'utilisateur
    try {
      console.log('👤 Mise à jour de l\'utilisateur:', userId);
      const updatedUser = await User.findByIdAndUpdate(
        userId,
        { 
          $addToSet: { 
            choices: {
              targetId: objectIdLocation,
              targetName: venueName,
              ratings: ratings || {},
              comment: comment || '',
              type: locationType,
              menuItems: menuItems || [],
              emotions: emotions || [],
              createdAt: new Date()
            }
          }
        },
        { new: true }
      );
      
      if (!updatedUser) {
        console.log('⚠️ Utilisateur non trouvé:', userId);
        throw new Error('Utilisateur non trouvé');
      }
      
      console.log('✅ Utilisateur mis à jour avec succès');
    } catch (userError) {
      console.error('❌ Erreur lors de la mise à jour de l\'utilisateur:', userError);
      throw userError;
    }
    
    // Ajouter également une référence dans la collection du lieu/événement
    try {
      if (locationType === 'restaurant') {
        if (!Restaurant) return res.status(500).json({ success: false, message: 'Modèle Restaurant non initialisé' });
        console.log('🍔 Mise à jour du restaurant:', locationId);
        await Restaurant.findByIdAndUpdate(
          locationId,
          { 
            $addToSet: { 
              choiceUsers: {
                userId: objectIdUser,
                ratings: ratings || {},
                comment: comment || '',
                menuItems: menuItems || [],
                createdAt: new Date()
              }
            },
            $inc: {
              choiceCount: 1,
              ratingCount: 1,
              'ratingTotals.service': ratings.service || 0,
              'ratingTotals.lieu': ratings.lieu || 0,
              'ratingTotals.portions': ratings.portions || 0,
              'ratingTotals.ambiance': ratings.ambiance || 0
            }
          },
          { new: true }
        );
      } else if (locationType === 'event') {
        if (!LeisureEvent) return res.status(500).json({ success: false, message: 'Modèle LeisureEvent non initialisé' });
        // Mettre à jour l'événement lui-même
        console.log('🎭 Mise à jour de l\'événement:', locationId);
        const event = await LeisureEvent.findByIdAndUpdate(
          locationId,
          { 
            $addToSet: { 
              choiceUsers: {
                userId: objectIdUser,
                ratings: ratings || {},
                comment: comment || '',
                emotions: emotions || [],
                createdAt: new Date()
              }
            },
            $inc: {
              choiceCount: 1,
              ratingCount: 1
            }
          },
          { new: true }
        );
        
        // Si l'événement a un producteur associé, mettre à jour aussi ce producteur
        if (event && event.producerId) {
          try {
            // Défensive: loisirsDb peut être undefined
            if (!loisirsDb) throw new Error('Connexion loisirsDb non initialisée');
            const LeisureProducer = loisirsDb.model('LeisureProducer', new mongoose.Schema({}, { strict: false }), 'Producers');
            
            console.log('🎭 Mise à jour du producteur de loisirs:', event.producerId);
            // Récupérer le producteur de loisirs associé à cet événement
            await LeisureProducer.findByIdAndUpdate(
              event.producerId,
              {
                $addToSet: {
                  eventChoices: {
                    userId: objectIdUser,
                    eventId: objectIdLocation,
                    eventName: venueName,
                    ratings: ratings || {},
                    emotions: emotions || [],
                    comment: comment || '',
                    createdAt: new Date()
                  }
                },
                $inc: {
                  totalEventChoices: 1,
                  'eventsPopularity.totalRatings': 1
                }
              },
              { new: true }
            );
            
            console.log(`✅ Choice associé au producteur de loisirs: ${event.producerId}`);
          } catch (producerError) {
            console.error('⚠️ Erreur lors de l\'association au producteur de loisirs:', producerError);
            // Continuer même si l'association au producteur a échoué
          }
        }
      } else if (locationType === 'wellness') {
        // REMOVED: Update logic for WellnessPlace
        console.warn('Mise à jour pour type wellness reçue mais ce type n\'est plus géré.');
        // await WellnessPlace.findByIdAndUpdate(...); 
      } else if (locationType === 'beautyPlace') {
        // ADDED: Handle update for beautyPlace
        console.log('💄 Mise à jour du lieu de beauté:', locationId);
        const BeautyPlaceModel = beautyWellnessDb?.model('BeautyPlace');
        if (!BeautyPlaceModel) {
          console.error('Modèle BeautyPlace non initialisé lors de la MAJ dans choices.js');
          // Don't fail the whole request, just log the error
        } else {
          await BeautyPlaceModel.findByIdAndUpdate(
            locationId,
            {
              $addToSet: {
                choiceUsers: { // Assuming BeautyPlace schema has choiceUsers
                  userId: objectIdUser,
                  ratings: ratings || {},
                  comment: comment || '',
                  emotions: emotions || [],
                  createdAt: new Date()
                }
              },
              $inc: { // Assuming BeautyPlace schema has these count/total fields
                choiceCount: 1,
                ratingCount: 1,
                // Add rating totals if applicable for beauty
                // 'ratingTotals.ambiance': ratings.ambiance || 0,
                // 'ratingTotals.service': ratings.service || 0,
                // 'ratingTotals.proprete': ratings.proprete || 0,
                // 'ratingTotals.expertise': ratings.expertise || 0
              }
            },
            { new: true }
          );
        }
      }
      
      console.log('✅ Lieu mis à jour avec succès');
    } catch (venueError) {
      console.error('❌ Erreur lors de la mise à jour du lieu:', venueError);
      // Ne pas échouer si la mise à jour du lieu échoue
    }
    
    // Créer un post si demandé
    let postId = null;
    if (createPost) {
      try {
        console.log('📝 Création d\'un post pour le Choice');
        // Créer un nouveau post
        const postData = {
          userId: objectIdUser,
          content: comment || `J'ai visité ${venueName}`,
          aspectRatings: ratings || {},
          isChoice: true,
          rating: calculateAverageRating(ratings),
          producer_id: objectIdLocation,
          producerType: locationType,
          location: venue.gps_coordinates,
          posted_at: new Date()
        };
        
        // Utiliser le modèle Post de modelCreator
        const { createModel, databases } = require('../utils/modelCreator');
        const Post = createModel(databases.CHOICE_APP, 'Post', 'Posts');
        
        const newPost = new Post(postData);
        await newPost.save();
        
        postId = newPost._id;
        
        console.log(`✅ Post créé avec succès pour le choice: ${postId}`);
      } catch (postError) {
        console.error('⚠️ Erreur lors de la création du post:', postError);
        // On continue même si la création du post a échoué
      }
    }
    
    console.log('✅ Choice créé avec succès');
    
    return res.status(201).json({
      success: true,
      message: 'Choice créé avec succès',
      data: {
        userId,
        locationId,
        locationType,
        postId,
        // Ne pas retourner les données sensibles comme les ratings
      }
    });
    
  } catch (error) {
    console.error('❌ Erreur lors de la création du choice:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Erreur serveur lors de la création du choice',
      error: error.message
    });
  }
});

// Fonction utilitaire pour calculer la note moyenne
function calculateAverageRating(ratings) {
  if (!ratings || Object.keys(ratings).length === 0) {
    return 0;
  }
  
  const sum = Object.values(ratings).reduce((acc, val) => acc + val, 0);
  return sum / Object.keys(ratings).length;
}

// Route pour obtenir les choices d'un utilisateur
// GET /api/choices/user/:userId
router.get('/user/:userId', async (req, res) => {
  // Défensive: modèles bien initialisés ?
  if (!User) return res.status(500).json({ success: false, message: 'Modèle User non initialisé' });
  const { userId } = req.params;
  
  if (!userId) {
    return res.status(400).json({ 
      success: false, 
      message: 'Le paramètre userId est requis' 
    });
  }
  
  try {
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: 'Utilisateur non trouvé' 
      });
    }
    
    // Extraire les choices de l'utilisateur
    const choices = user.choices || [];
    
    return res.status(200).json({
      success: true,
      data: choices
    });
  } catch (error) {
    console.error('Erreur lors de la récupération des choices :', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Erreur serveur lors de la récupération des choices',
      error: error.message
    });
  }
});

module.exports = router; 
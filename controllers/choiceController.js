const Choice = require('../models/choiceModel');
const Producer = require('../models/producerModel'); // Assurez-vous que ce modèle existe
const Post = require('../models/postModel'); // Assurez-vous que ce modèle existe
const { validationResult } = require('express-validator');
const mongoose = require('mongoose');
const UserChoice = require('../models/userChoiceModel'); // Implied import for UserChoice model

/**
 * Fonction pour mettre à jour les notes d'un producteur avec une influence pondérée.
 * @param {object} choiceData - Les données du choice créé.
 */
async function updateProducerRatings(choiceData) {
  const { locationId, ratings } = choiceData;

  if (!mongoose.Types.ObjectId.isValid(locationId)) {
      console.error('updateProducerRatings: Invalid locationId:', locationId);
      return; // Ne rien faire si l'ID n'est pas valide
  }
  if (typeof ratings !== 'object' || ratings === null) {
      console.error('updateProducerRatings: Invalid ratings object:', ratings);
      return; // Ne rien faire si les ratings ne sont pas valides
  }

  try {
    // Récupérer les données actuelles du producteur
    const producer = await Producer.findById(locationId);
    if (!producer) {
      console.warn(`updateProducerRatings: Producer not found with ID: ${locationId}`);
      return; // Le producteur n'existe pas ou plus
    }

    // Initialiser ou récupérer les notes actuelles et le compteur
    const currentRatings = producer.ratings || {};
    const updatedRatings = { ...currentRatings }; // Copie pour la mise à jour
    const newRatingsCount = (producer.ratingsCount || 0) + 1;
    const influenceWeight = 0.1; // Poids de 10% pour la nouvelle note

    console.log(`Updating ratings for producer ${locationId}. Current count: ${producer.ratingsCount || 0}`);
    console.log('Current ratings:', currentRatings);
    console.log('New choice ratings:', ratings);

    // Pour chaque aspect noté dans le nouveau choice
    for (const [aspect, newRatingValue] of Object.entries(ratings)) {
        // S'assurer que la nouvelle note est un nombre valide (entre 1 et 10 par ex.)
        const newRating = parseFloat(newRatingValue);
        if (isNaN(newRating) || newRating < 1 || newRating > 10) {
             console.warn(`updateProducerRatings: Invalid rating value for aspect "${aspect}": ${newRatingValue}. Skipping.`);
             continue; // Ignorer cet aspect si la note n'est pas valide
        }

      // Récupérer la note actuelle pour cet aspect (ou utiliser 5 par défaut si première note)
      const currentRating = parseFloat(currentRatings[aspect]);
      const effectiveCurrentRating = isNaN(currentRating) ? 5.0 : currentRating; // Utiliser 5.0 si pas de note existante

      // Calculer la nouvelle note pondérée
      // Formule: (Ancienne Note * (1 - Poids)) + (Nouvelle Note * Poids)
      const weightedRating = (effectiveCurrentRating * (1 - influenceWeight)) + (newRating * influenceWeight);

      // Arrondir à une décimale
      updatedRatings[aspect] = Math.round(weightedRating * 10) / 10;
      console.log(`  -> Aspect "${aspect}": Current=${effectiveCurrentRating.toFixed(1)}, New=${newRating.toFixed(1)}, Weighted=${updatedRatings[aspect].toFixed(1)}`);
    }

    console.log('Updated ratings object:', updatedRatings);

    // Mettre à jour le document du producteur dans MongoDB
    await Producer.findByIdAndUpdate(locationId, {
      $set: {
        ratings: updatedRatings,
        ratingsCount: newRatingsCount,
        ratingsUpdatedAt: new Date() // Marquer la date de mise à jour
      }
    });

    console.log(`Producer ${locationId} ratings updated successfully. New count: ${newRatingsCount}`);

  } catch (error) {
    console.error(`Error updating ratings for producer ${locationId}:`, error);
    // Ne pas bloquer la création du choice pour une erreur de mise à jour des stats
  }
}

/**
 * Fonction pour créer un post associé à un choice.
 * @param {object} choice - L'objet Choice créé.
 */
async function createPostFromChoice(choice) {
    if (!choice.comment || choice.comment.trim() === '') {
        console.log(`Skipping post creation for choice ${choice._id}: no comment provided.`);
        return; // Ne pas créer de post s'il n'y a pas de commentaire
    }

    try {
        const postData = {
            userId: choice.userId,
            type: 'choice_review', // Type spécifique pour les posts issus de choices
            text: choice.comment,
            choiceRef: choice._id, // Référence vers le choice
            locationRef: choice.locationId, // Référence vers le lieu (Producer)
            // Pas de mediaUrl pour ce type de post, sauf si on veut ajouter une photo du lieu?
            createdAt: new Date(),
            updatedAt: new Date(),
        };

        const newPost = new Post(postData);
        await newPost.save();
        console.log(`Post created successfully for choice ${choice._id}. Post ID: ${newPost._id}`);

        // Optionnel: Mettre à jour l'utilisateur pour ajouter l'ID du post
        // await User.findByIdAndUpdate(choice.userId, { $push: { posts: newPost._id } });

    } catch (error) {
        console.error(`Error creating post for choice ${choice._id}:`, error);
    }
}


// --- Contrôleurs des routes ---

/**
 * Vérifie si l'utilisateur a visité un lieu récemment (Placeholder).
 * TODO: Implémenter la logique de vérification réelle (GPS, historique, etc.)
 */
exports.verifyLocationVisit = async (req, res) => {
    // Logique de vérification de la visite (pour l'instant, on approuve automatiquement en démo)
    console.log('Verification request received:', req.body);
    // Exemple: vérifier l'historique de localisation de l'utilisateur,
    // ou utiliser un système de check-in manuel.
    // Pour la démo, on retourne toujours true.
    res.status(200).json({ verified: true, message: 'Visite vérifiée (mode démo)' });
};

/**
 * Crée un nouveau Choice et met à jour les notes du producteur.
 */
exports.createChoice = async (req, res) => {
  // Validation des entrées (peut être fait avec express-validator dans les routes)
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const choiceData = req.body;
    console.log('Received choice data:', choiceData);

    // S'assurer que les IDs sont valides
    if (!mongoose.Types.ObjectId.isValid(choiceData.userId) || !mongoose.Types.ObjectId.isValid(choiceData.locationId)) {
        return res.status(400).json({ message: 'Invalid User ID or Location ID' });
    }

    // Créer le choice dans la base de données
    const newChoice = new Choice({
        ...choiceData,
        createdAt: new Date(), // Assurer la date de création serveur
    });
    await newChoice.save();
    console.log('Choice saved successfully:', newChoice._id);

    // AJOUT ICI: Mettre à jour le tableau 'choices' de l'utilisateur
    try {
        await UserChoice.findByIdAndUpdate(newChoice.userId, { $push: { choices: newChoice._id } });
        console.log(`User ${newChoice.userId} updated with new choice ${newChoice._id}`);
    } catch (userUpdateError) {
        // Logguer l'erreur mais ne pas bloquer la réponse principale
        console.error(`Failed to add choice reference to user ${newChoice.userId}:`, userUpdateError);
    }

    // Mettre à jour les notes du producteur de manière asynchrone (ne bloque pas la réponse)
    updateProducerRatings(choiceData).catch(err => {
        console.error("Background rating update failed:", err); // Log l'erreur si la mise à jour échoue en arrière-plan
    });

    // Créer un post si demandé et s'il y a un commentaire
    if (choiceData.createPost && choiceData.comment && choiceData.comment.trim() !== '') {
        createPostFromChoice(newChoice).catch(err => {
             console.error("Background post creation failed:", err);
        });
    }

    // Répondre avec succès
    res.status(201).json({
      message: 'Choice créé avec succès!',
      choice: newChoice // Renvoyer le choice créé
    });

  } catch (error) {
    console.error('Error creating choice:', error);
    res.status(500).json({ message: 'Erreur serveur lors de la création du choice.', details: error.message });
  }
};

/**
 * Récupère les choices d'un utilisateur spécifique.
 */
exports.getUserChoices = async (req, res) => {
    try {
        const userId = req.params.userId;
        if (!mongoose.Types.ObjectId.isValid(userId)) {
            return res.status(400).json({ message: 'Invalid User ID' });
        }

        const choices = await Choice.find({ userId: userId })
                                     .sort({ createdAt: -1 }) // Trier par date décroissante
                                     .populate('locationId', 'name address category'); // Populater infos de base du lieu

        res.status(200).json(choices);
    } catch (error) {
        console.error('Error fetching user choices:', error);
        res.status(500).json({ message: 'Erreur serveur lors de la récupération des choices.' });
    }
};

// TODO: Ajouter d'autres contrôleurs si nécessaire (getChoiceById, deleteChoice, etc.) 
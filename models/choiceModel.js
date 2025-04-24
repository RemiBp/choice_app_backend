const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const choiceSchema = new Schema({
    userId: {
        type: Schema.Types.ObjectId,
        ref: 'UserChoice', // Référence au modèle utilisateur
        required: true,
        index: true // Indexer pour recherche rapide par utilisateur
    },
    locationId: {
        type: Schema.Types.ObjectId,
        required: true,
        index: true,
        // ref: 'Producer' // Ou 'Location' si modèle unifié, ou dynamiquement basé sur locationType
        // Pour la flexibilité, on peut omettre 'ref' ici et le gérer lors du populate
    },
    locationType: {
        type: String,
        required: true,
        enum: ['restaurant', 'event', 'wellness', 'leisure', 'producer', 'unknown'] // Types possibles
    },
    // Stocker les notes spécifiques données dans CE choice
    ratings: {
        type: Map,
        of: Number // Ex: { service: 8, ambiance: 7 }
    },
    // Ancienne structure ? À vérifier si 'aspects' est toujours utilisé
    aspects: {
        type: Map,
        of: Number
    },
    comment: {
        type: String,
        trim: true
    },
    // Champs spécifiques par type
    menuItems: [String], // Pour restaurants
    emotions: [String], // Pour wellness, events
    // Garder une référence au post si un post a été créé
    postRef: {
        type: Schema.Types.ObjectId,
        ref: 'Post'
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    // On pourrait ajouter un champ pour la date de la visite si différent de createdAt
    // visitDate: Date,
});

// Optionnel : Ajouter un index combiné si on cherche souvent par utilisateur et lieu
choiceSchema.index({ userId: 1, locationId: 1 });

// Vérifier si le modèle existe déjà pour éviter l'erreur OverwriteModelError
module.exports = mongoose.models.Choice || mongoose.model('Choice', choiceSchema); 
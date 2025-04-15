const mongoose = require('mongoose');

// Schéma pour les tags de contacts
const contactTagSchema = new mongoose.Schema({
  id: { type: String, required: true }, // ID client-side unique
  userId: { type: String, required: true }, // ID de l'utilisateur
  name: { type: String, required: true },
  description: { type: String },
  color: { 
    // Stockage des valeurs de couleur au format hexadécimal
    type: String, 
    default: '#2196F3' 
  },
  icon: { 
    // Stockage du codePoint de l'icône
    type: Number, 
    default: 0xe570 // Un code par défaut pour un icon
  },
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Création d'un index composé pour assurer l'unicité par utilisateur
contactTagSchema.index({ userId: 1, id: 1 }, { unique: true });

// Schéma pour les associations de tags de contacts
const contactTagAssociationSchema = new mongoose.Schema({
  userId: { type: String, required: true }, // ID de l'utilisateur
  contactId: { type: String, required: true }, // ID du contact
  tagId: { type: String, required: true }, // ID du tag
  createdAt: { type: Date, default: Date.now }
});

// Création d'un index composé pour assurer l'unicité par utilisateur, contact et tag
contactTagAssociationSchema.index({ userId: 1, contactId: 1, tagId: 1 }, { unique: true });

// Fonction d'initialisation qui retourne les modèles
module.exports = function(db) {
  const ContactTag = db.model('ContactTag', contactTagSchema, 'contact_tags');
  const ContactTagAssociation = db.model('ContactTagAssociation', contactTagAssociationSchema, 'contact_tag_associations');
  
  return { ContactTag, ContactTagAssociation };
}; 
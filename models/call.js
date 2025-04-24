const mongoose = require('mongoose');
const Schema = mongoose.Schema;

/**
 * Schéma pour les appels audio et vidéo
 * Supporte les appels individuels et de groupe
 */
const CallSchema = new Schema({
  // Conversation liée à cet appel (peut être null pour les appels directs)
  conversationId: {
    type: Schema.Types.ObjectId,
    ref: 'Conversation',
    default: null
  },
  
  // Utilisateur qui a initié l'appel
  initiator: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  // Liste des destinataires de l'appel
  recipients: [{
    type: Schema.Types.ObjectId,
    ref: 'User'
  }],
  
  // Type d'appel : audio ou vidéo
  type: {
    type: String,
    enum: ['audio', 'video'],
    required: true
  },
  
  // État de l'appel
  status: {
    type: String,
    enum: ['initiated', 'ringing', 'ongoing', 'ended', 'missed', 'rejected'],
    default: 'initiated'
  },
  
  // Horaires de l'appel
  startTime: {
    type: Date,
    default: Date.now
  },
  
  endTime: {
    type: Date
  },
  
  // Participants à l'appel avec leur statut
  participants: [{
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User'
    },
    joinedAt: Date,
    leftAt: Date,
    status: {
      type: String,
      enum: ['invited', 'ringing', 'joined', 'left', 'declined', 'missed'],
      default: 'invited'
    },
    device: {
      platform: String,
      model: String,
      networkType: String
    }
  }],
  
  // Métadonnées de l'appel
  metadata: {
    duration: Number, // en secondes
    quality: String,
    recordingUrl: String,
    hasVideo: Boolean,
    hasMicrophoneIssues: Boolean,
    hasConnectivityIssues: Boolean
  },
  
  // Identifiants pour l'intégration WebRTC/Twilio/Agora
  rtcData: {
    roomId: String,
    sessionId: String,
    token: String,
    provider: {
      type: String,
      enum: ['twilio', 'agora', 'webrtc', 'other'],
      default: 'webrtc'
    }
  }
}, {
  timestamps: true
});

// Méthode pour terminer un appel
CallSchema.methods.endCall = function(reason = 'normal') {
  this.status = 'ended';
  this.endTime = new Date();
  
  // Calculer la durée de l'appel
  if (this.startTime) {
    const durationMs = this.endTime - this.startTime;
    this.metadata = this.metadata || {};
    this.metadata.duration = Math.round(durationMs / 1000); // Conversion en secondes
  }
  
  return this.save();
};

// Méthode pour changer le statut d'un participant
CallSchema.methods.updateParticipantStatus = function(userId, status) {
  const userIdStr = userId.toString();
  const participantIndex = this.participants.findIndex(
    p => p.userId.toString() === userIdStr
  );
  
  if (participantIndex === -1) {
    // Si le participant n'existe pas, l'ajouter
    this.participants.push({
      userId,
      status,
      joinedAt: status === 'joined' ? new Date() : undefined,
      leftAt: status === 'left' ? new Date() : undefined
    });
  } else {
    // Mettre à jour le statut du participant existant
    this.participants[participantIndex].status = status;
    
    // Mettre à jour les horodatages en fonction du statut
    if (status === 'joined') {
      this.participants[participantIndex].joinedAt = new Date();
    } else if (status === 'left' || status === 'declined') {
      this.participants[participantIndex].leftAt = new Date();
    }
  }
  
  this.markModified('participants');
  return this.save();
};

// Vérifier si tous les participants ont refusé ou manqué l'appel
CallSchema.methods.areAllParticipantsUnavailable = function() {
  // Exclure l'initiateur
  const recipients = this.participants.filter(
    p => p.userId.toString() !== this.initiator.toString()
  );
  
  // Vérifier si tous les destinataires ont un statut "declined" ou "missed"
  return recipients.length > 0 && recipients.every(
    p => ['declined', 'missed'].includes(p.status)
  );
};

// Méthode pour obtenir la durée actuelle de l'appel
CallSchema.methods.getCurrentDuration = function() {
  if (this.status === 'ended' && this.metadata && this.metadata.duration) {
    return this.metadata.duration;
  }
  
  const end = this.endTime || new Date();
  const start = this.startTime || end;
  return Math.round((end - start) / 1000);
};

// Index pour améliorer les performances des requêtes
CallSchema.index({ conversationId: 1 });
CallSchema.index({ initiator: 1 });
CallSchema.index({ 'participants.userId': 1 });
CallSchema.index({ startTime: -1 });
CallSchema.index({ status: 1, startTime: -1 });

// Créer le modèle
const Call = mongoose.model('Call', CallSchema);

module.exports = Call; 
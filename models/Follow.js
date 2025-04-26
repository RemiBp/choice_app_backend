const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const followSchema = new Schema({
    followerId: {
        type: Schema.Types.ObjectId,
        required: true,
        refPath: 'followerType' // Ref vers User ou Producer (selon le type)
    },
    followerType: {
        type: String,
        required: true,
        enum: ['User', 'Producer', 'LeisureProducer'] // Removed 'BeautyProducer'
    },
    followedId: {
        type: Schema.Types.ObjectId,
        required: true,
        refPath: 'followedType' // Ref vers User ou Producer
    },
    followedType: {
        type: String,
        required: true,
        enum: ['User', 'Producer', 'LeisureProducer', 'WellnessPlace'] // Use WellnessPlace, Removed 'BeautyProducer'
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
}, { timestamps: true });

// Index pour optimiser les recherches courantes
followSchema.index({ followerId: 1, followedId: 1 }, { unique: true });
followSchema.index({ followedId: 1 });

module.exports = (connection) => {
    return connection.model('Follow', followSchema);
}; 
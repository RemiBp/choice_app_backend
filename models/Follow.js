const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const FollowSchema = new Schema({
    followerId: {
        type: Schema.Types.ObjectId, // ID of the user/producer doing the following
        required: true,
        index: true
    },
    followerType: {
        type: String, // Type: 'User', 'RestaurantProducer', 'LeisureProducer', 'BeautyProducer'
        required: true,
        enum: ['User', 'RestaurantProducer', 'LeisureProducer', 'BeautyProducer']
    },
    followingId: {
        type: Schema.Types.ObjectId, // ID of the user/producer being followed
        required: true,
        index: true
    },
    followingType: {
        type: String, // Type: 'User', 'RestaurantProducer', 'LeisureProducer', 'BeautyProducer'
        required: true,
        enum: ['User', 'RestaurantProducer', 'LeisureProducer', 'BeautyProducer']
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Ensure a user/producer can only follow another entity once
FollowSchema.index({ followerId: 1, followingId: 1 }, { unique: true });

// Explicitly create the model on the 'choice_app' database connection
// Assuming you have a connection object named 'choiceAppDb' available
// If not, adjust this part based on how you manage DB connections.
// For now, we'll use the default mongoose connection.
// Consider centralizing model creation like in your 'modelCreator' util if applicable.
module.exports = mongoose.model('Follow', FollowSchema); 
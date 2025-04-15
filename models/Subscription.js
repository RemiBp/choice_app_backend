const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const subscriptionSchema = new Schema({
    producerId: { type: Schema.Types.ObjectId, required: true, refPath: 'producerModel' }, // Reference producer
    producerModel: { type: String, required: true, enum: ['RestaurantProducer', 'LeisureProducer', 'WellnessProducer'] }, // Specific producer model
    planId: { type: String, required: true }, // e.g., 'starter_monthly', 'pro_yearly'
    level: { type: String, required: true, enum: ['gratuit', 'starter', 'pro', 'legend'] },
    status: { type: String, required: true, enum: ['active', 'cancelled', 'expired', 'pending'], default: 'active' },
    startDate: { type: Date, default: Date.now },
    endDate: { type: Date }, // For fixed-term or cancellation date
    stripeSubscriptionId: { type: String }, // Link to Stripe if used
    // ... other relevant fields (features included, price, etc.)
}, { timestamps: true });

// Use the default mongoose connection to define the model
// const choiceAppDb = require('../db/config').choiceAppDb; // Avoid requiring connection here
module.exports = mongoose.model('Subscription', subscriptionSchema);
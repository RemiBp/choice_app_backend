const mongoose = require('mongoose');
require('dotenv').config();

let choiceAppDb;
let testDb;

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    console.log('✅ Connexion MongoDB réussie');

    // Définir les bases secondaires uniquement après la connexion
    choiceAppDb = conn.connection.useDb('choice_app');
    testDb = conn.connection.useDb('test');

  } catch (error) {
    console.error('❌ Erreur connexion MongoDB:', error);
    process.exit(1);
  }
};

module.exports = { connectDB, getChoiceAppDb: () => choiceAppDb, getTestDb: () => testDb };

const mongoose = require('mongoose');
require('dotenv').config();

let choiceAppDb, testDb, loisirsDb, restaurationDb, beautyWellnessDb;

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
    loisirsDb = conn.connection.useDb('Loisir&Culture');
    restaurationDb = conn.connection.useDb('Restauration');
    beautyWellnessDb = conn.connection.useDb('Beauty_Wellness');

  } catch (error) {
    console.error('❌ Erreur connexion MongoDB:', error);
    process.exit(1);
  }
};

module.exports = {
  connectDB,
  getChoiceAppDb: () => choiceAppDb,
  getTestDb: () => testDb,
  getLoisirsDb: () => loisirsDb,
  getRestaurationDb: () => restaurationDb,
  getBeautyWellnessDb: () => beautyWellnessDb
};

const mongoose = require('mongoose');

// Module pour gérer les connexions aux bases de données

// Déclarer les variables pour stocker les connexions aux bases de données
let choiceAppDb;
let restaurationDb;
let loisirsDb;
let beautyWellnessDb;

// Fonction pour initialiser les connexions
const initializeDatabaseConnections = () => {
  try {
    // Connexion aux différentes bases de données
    choiceAppDb = mongoose.connection.useDb('choice_app');
    restaurationDb = mongoose.connection.useDb('Restauration_Officielle');
    loisirsDb = mongoose.connection.useDb('Loisir&Culture');
    beautyWellnessDb = mongoose.connection.useDb('Beauty_Wellness');
    
    console.log('✅ Database connections initialized in routes/index.js');
    return true;
  } catch (error) {
    console.error('❌ Error initializing database connections:', error);
    return false;
  }
};

// Exporter les connexions pour les rendre accessibles à d'autres modules
module.exports = {
  // Initialisation
  initializeDatabaseConnections,
  
  // Getters pour les connexions
  get choiceAppDb() {
    return choiceAppDb || mongoose.connection.useDb('choice_app');
  },
  
  get restaurationDb() {
    return restaurationDb || mongoose.connection.useDb('Restauration_Officielle');
  },
  
  get loisirsDb() {
    return loisirsDb || mongoose.connection.useDb('Loisir&Culture');
  },
  
  get beautyWellnessDb() {
    return beautyWellnessDb || mongoose.connection.useDb('Beauty_Wellness');
  }
}; 
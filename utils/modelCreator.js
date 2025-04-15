/**
 * Utilitaire pour simplifier la création de modèles MongoDB dans les routes et controllers
 * Suite à la simplification de l'architecture du backend
 */
const mongoose = require('mongoose');

/**
 * Crée ou récupère un modèle pour une base de données spécifique
 * @param {string} databaseName - Nom de la base de données (ex: 'choice_app')
 * @param {string} modelName - Nom du modèle (ex: 'User', 'Post')
 * @param {string} collectionName - Nom de la collection (ex: 'Users', 'Posts')
 * @param {mongoose.Schema} [schema] - Schéma Mongoose (optionnel, un schéma vide sera utilisé si non spécifié)
 * @returns {mongoose.Model} - Modèle Mongoose
 */
function createModel(databaseName, modelName, collectionName, schema = null) {
  try {
    // Se connecter à la bonne base de données
    const db = mongoose.connection.useDb(databaseName);
    
    // Utiliser le schéma fourni ou créer un schéma vide avec strict: false
    const modelSchema = schema || new mongoose.Schema({}, { strict: false });
    
    // Créer et retourner le modèle
    return db.model(modelName, modelSchema, collectionName);
  } catch (error) {
    console.error(`❌ Erreur lors de la création du modèle ${modelName}:`, error);
    
    // En cas d'erreur, créer un modèle fallback
    try {
      const fallbackSchema = new mongoose.Schema({}, { strict: false });
      return mongoose.model(modelName, fallbackSchema);
    } catch (fallbackError) {
      console.error(`❌ Erreur fallback pour ${modelName}:`, fallbackError);
      throw new Error(`Impossible de créer le modèle ${modelName}`);
    }
  }
}

module.exports = {
  createModel,
  
  // Bases de données principales
  databases: {
    CHOICE_APP: 'choice_app',
    RESTAURATION: 'Restauration_Officielle',
    LOISIR: 'Loisir&Culture',
    BEAUTY_WELLNESS: 'Beauty_Wellness'
  }
}; 
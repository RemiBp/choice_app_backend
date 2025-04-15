/**
 * Script pour créer un index géospatial sur le champ location.coordinates
 * dans la collection Users
 */

const mongoose = require('mongoose');
require('dotenv').config();

// URL de connexion MongoDB
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/choice_app';

async function createGeoSpatialIndex() {
  try {
    // Connexion à MongoDB
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connecté à MongoDB');
    
    // Utiliser la base de données choice_app
    const db = mongoose.connection.useDb('choice_app');
    
    // Accéder à la collection Users
    const usersCollection = db.collection('Users');
    
    // Vérifier si l'index existe déjà
    const indexes = await usersCollection.indexes();
    const hasGeoIndex = indexes.some(index => 
      index.key && index.key['location.coordinates'] === '2dsphere'
    );
    
    if (hasGeoIndex) {
      console.log('✅ L\'index géospatial existe déjà');
    } else {
      // Créer l'index géospatial
      await usersCollection.createIndex(
        { 'location.coordinates': '2dsphere' }, 
        { name: 'location_2dsphere' }
      );
      console.log('✅ Index géospatial créé avec succès');
    }
    
    // Vérifier qu'un document a la bonne structure
    const sampleUser = await usersCollection.findOne({});
    if (sampleUser) {
      console.log('Structure de l\'utilisateur sample:');
      console.log('location:', sampleUser.location);
      
      if (!sampleUser.location || !sampleUser.location.coordinates) {
        console.log('⚠️ Attention: les utilisateurs ne semblent pas avoir le champ location.coordinates correctement défini');
        console.log('Format attendu pour location dans MongoDB:');
        console.log({
          location: {
            type: 'Point',
            coordinates: [longitude, latitude] // Tableau avec longitude d'abord, puis latitude
          }
        });
      }
    }
    
  } catch (error) {
    console.error('❌ Erreur:', error);
  } finally {
    // Fermer la connexion
    await mongoose.connection.close();
    console.log('📝 Connexion fermée');
  }
}

// Exécuter la fonction
createGeoSpatialIndex()
  .then(() => console.log('📝 Script terminé'))
  .catch(err => console.error('❌ Erreur lors de l\'exécution du script:', err)); 
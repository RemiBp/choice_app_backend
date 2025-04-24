/**
 * Script pour créer un index géospatial sur le champ location
 * dans la collection Loisir_Paris_Evenements
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
    
    // Utiliser la base de données Loisir&Culture
    const db = mongoose.connection.useDb('Loisir&Culture');
    
    // Accéder à la collection Loisir_Paris_Evenements
    const collection = db.collection('Loisir_Paris_Evenements');
    
    // Vérifier si l'index existe déjà
    const indexes = await collection.indexes();
    const hasGeoIndex = indexes.some(index => 
      index.key && index.key['location'] === '2dsphere'
    );
    
    if (hasGeoIndex) {
      console.log('✅ L\'index géospatial sur "location" existe déjà dans Loisir_Paris_Evenements');
    } else {
      // Créer l'index géospatial sur le champ 'location'
      await collection.createIndex(
        { 'location': '2dsphere' },
        { name: 'location_2dsphere' }
      );
      console.log('✅ Index géospatial "location_2dsphere" créé avec succès sur Loisir_Paris_Evenements');
    }
    
    // Vérifier qu'un document a la bonne structure
    const sampleEvent = await collection.findOne({});
    if (sampleEvent) {
      console.log('Structure de l\'événement sample:');
      console.log('location:', sampleEvent.location);
      
      if (!sampleEvent.location || !sampleEvent.location.coordinates || !Array.isArray(sampleEvent.location.coordinates) || sampleEvent.location.coordinates.length !== 2) {
        console.log('⚠️ Attention: les événements ne semblent pas avoir le champ location correctement défini au format GeoJSON Point');
        console.log('Format GeoJSON Point attendu pour location dans MongoDB:');
        console.log({
          location: {
            type: 'Point',
            coordinates: [longitude, latitude] // Tableau avec longitude d'abord, puis latitude
          }
        });
      } else {
        console.log('✅ La structure du champ "location" semble correcte.');
      }
    } else {
      console.log('ℹ️ Aucun événement trouvé pour vérifier la structure.');
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
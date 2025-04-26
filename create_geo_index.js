/**
 * Script pour créer un index géospatial sur le champ location
 * dans la collection Loisir_Paris_Evenements
 */

const mongoose = require('mongoose');
require('dotenv').config();

// URL de connexion MongoDB
const ATLAS_URI = 'mongodb+srv://remibarbier:Calvi8Pierc2@lieuxrestauration.szq31.mongodb.net/?retryWrites=true&w=majority&appName=lieuxrestauration'; // Direct Atlas URI
const LOCAL_URI = 'mongodb://localhost:27017/choice_app'; // Default local URI

// Use Atlas URI if MONGODB_URI env var is not set or is empty
const MONGODB_URI = process.env.MONGODB_URI || ATLAS_URI;

console.log(`🔌 Tentative de connexion à: ${MONGODB_URI === ATLAS_URI ? 'Atlas (URI directe)' : 'URI depuis env'}`);

async function createGeoSpatialIndex() {
  try {
    // Connexion à MongoDB
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connecté à MongoDB');
    
    // --- 1. Index pour Loisir_Paris_Evenements --- 
    // Utiliser la base de données Loisir&Culture
    const loisirDb = mongoose.connection.useDb('Loisir&Culture');
    const eventsCollection = loisirDb.collection('Loisir_Paris_Evenements');
    
    // Vérifier si l'index existe déjà pour les événements
    const eventIndexes = await eventsCollection.indexes();
    const hasEventGeoIndex = eventIndexes.some(index => 
      index.key && index.key['location'] === '2dsphere'
    );
    
    if (hasEventGeoIndex) {
      console.log('✅ [Events] L\'index géospatial sur "location" existe déjà dans Loisir_Paris_Evenements');
    } else {
      await eventsCollection.createIndex(
        { 'location': '2dsphere' },
        { name: 'location_2dsphere_events' }
      );
      console.log('✅ [Events] Index géospatial "location_2dsphere_events" créé avec succès sur Loisir_Paris_Evenements');
    }
    
    // --- 2. Index pour Posts --- 
    // Utiliser la base de données CHOICE_APP
    const appDb = mongoose.connection.useDb('choice_app'); // Assurez-vous que c'est le bon nom de DB
    const postsCollection = appDb.collection('Posts'); // Assurez-vous que c'est le bon nom de collection
    
    // Vérifier si l'index existe déjà pour les posts
    const postIndexes = await postsCollection.indexes();
    const hasPostGeoIndex = postIndexes.some(index => 
      // Vérifiez le nom exact du champ de localisation dans vos posts (ex: 'location', 'coordinates', 'geometry.location')
      index.key && (index.key['location'] === '2dsphere' || index.key['gps_coordinates'] === '2dsphere' || index.key['geometry.location'] === '2dsphere') 
    );
    
    // **Important**: Assurez-vous que le champ indexé ci-dessous ('location')
    // est bien celui qui contient vos coordonnées GeoJSON dans la collection Posts.
    const postLocationField = 'location'; // MODIFIEZ SI NECESSAIRE (ex: 'gps_coordinates', 'geometry.location')
    
    if (hasPostGeoIndex) {
      console.log(`✅ [Posts] L\'index géospatial sur "${postLocationField}" semble déjà exister dans Posts`);
    } else {
      await postsCollection.createIndex(
        { [postLocationField]: '2dsphere' }, // Utilisation de la variable pour le nom du champ
        { name: `${postLocationField}_2dsphere_posts` }
      );
      console.log(`✅ [Posts] Index géospatial "${postLocationField}_2dsphere_posts" créé avec succès sur Posts`);
    }

    // --- Vérification optionnelle de la structure des données (pour les événements) ---
    const sampleEvent = await eventsCollection.findOne({});
    if (sampleEvent) {
      console.log('[Events] Structure de l\'événement sample:');
      console.log('location:', sampleEvent.location);
      
      if (!sampleEvent.location || !sampleEvent.location.coordinates || !Array.isArray(sampleEvent.location.coordinates) || sampleEvent.location.coordinates.length !== 2) {
        console.log('⚠️ [Events] Attention: les événements ne semblent pas avoir le champ location correctement défini au format GeoJSON Point');
        console.log('Format GeoJSON Point attendu pour location dans MongoDB:');
        console.log({
          location: {
            type: 'Point',
            coordinates: [longitude, latitude] // Tableau avec longitude d'abord, puis latitude
          }
        });
      } else {
        console.log('✅ [Events] La structure du champ "location" semble correcte.');
      }
    } else {
      console.log('ℹ️ [Events] Aucun événement trouvé pour vérifier la structure.');
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
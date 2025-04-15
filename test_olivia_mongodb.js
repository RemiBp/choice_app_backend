/**
 * Script de test pour accéder directement à MongoDB et vérifier la connexion
 * Se concentre sur la recherche du restaurant Olivia et l'affichage de sa structure complète
 */

const { MongoClient } = require('mongodb');
require('dotenv').config();

// Vérification de la variable d'environnement MONGO_URI
if (!process.env.MONGO_URI) {
  console.error('❌ La variable MONGO_URI est manquante dans le fichier .env');
  process.exit(1);
}

// Configuration de la connexion MongoDB
const mongoURI = process.env.MONGO_URI;
const dbName = 'Restauration_Officielle';
const collectionName = 'producers';

// Connexion à MongoDB et recherche du restaurant Olivia
async function testMongoConnection() {
  let client;

  try {
    console.log('📊 TEST DE CONNEXION DIRECTE À MONGODB');
    console.log('======================================');
    console.log(`🔌 Connexion à MongoDB: ${mongoURI.split('@')[1]}`);
    
    // Connexion à MongoDB
    client = new MongoClient(mongoURI);
    await client.connect();
    console.log('✅ Connexion à MongoDB réussie!');
    
    // Accéder à la base de données et à la collection
    const db = client.db(dbName);
    const collection = db.collection(collectionName);
    
    // Liste des bases de données disponibles
    const dbs = await client.db().admin().listDatabases();
    console.log('\n📁 BASES DE DONNÉES DISPONIBLES:');
    dbs.databases.forEach(db => {
      console.log(`- ${db.name} (${db.sizeOnDisk / (1024 * 1024)} MB)`);
    });
    
    // Compter le nombre de documents dans la collection
    const count = await collection.countDocuments();
    console.log(`\n📊 COLLECTION "${collectionName}": ${count} documents`);
    
    // Rechercher le restaurant Olivia
    const olivia = await collection.findOne({ name: 'Olivia' });
    
    if (olivia) {
      console.log('\n✅ RESTAURANT OLIVIA TROUVÉ:');
      // Afficher la structure complète du document Olivia
      console.log(JSON.stringify(olivia, null, 2));
    } else {
      console.log('\n❌ Restaurant Olivia non trouvé dans la base de données');
    }
    
    return true;
  } catch (error) {
    console.error('\n❌ ERREUR DE CONNEXION MongoDB:', error);
    return false;
  } finally {
    if (client) {
      await client.close();
      console.log('\n🔒 Connexion MongoDB fermée');
    }
  }
}

// Exécuter le test
testMongoConnection()
  .then(success => {
    if (success) {
      console.log('\n✅ TEST RÉUSSI: Connexion à MongoDB et recherche d\'Olivia');
    } else {
      console.error('\n❌ TEST ÉCHOUÉ: Problème de connexion à MongoDB');
      process.exit(1);
    }
  })
  .catch(error => {
    console.error('\n❌ ERREUR FATALE:', error);
    process.exit(1);
  });
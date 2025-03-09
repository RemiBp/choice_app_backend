const { MongoClient } = require('mongodb');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// Charger les variables d'environnement
dotenv.config();

// Informations de connexion
const mongoUri = process.env.MONGO_URI;
const outputFilePath = path.join(__dirname, `mongodb_report_${new Date().toISOString().replace(/:/g, '-')}.txt`);

// Fonction pour écrire dans le fichier de sortie
function writeToFile(content) {
  fs.appendFileSync(outputFilePath, content + '\n');
}

// Fonction principale
async function exportMongoDBData() {
  // Initialiser le fichier de sortie
  fs.writeFileSync(outputFilePath, `# MongoDB Export - ${new Date().toISOString()}\n\n`);

  if (!mongoUri) {
    writeToFile('❌ Erreur: Variable MONGO_URI manquante dans le fichier .env');
    return;
  }

  let client;
  try {
    writeToFile('🔄 Connexion à MongoDB Atlas...');
    client = new MongoClient(mongoUri);
    await client.connect();
    writeToFile('✅ Connexion réussie à MongoDB Atlas!\n');

    // 1. Lister toutes les bases de données
    writeToFile('## BASES DE DONNÉES DISPONIBLES:');
    const databasesList = await client.db().admin().listDatabases();
    databasesList.databases.forEach((db) => {
      writeToFile(`- ${db.name} (${(db.sizeOnDisk / 1024 / 1024).toFixed(2)} MB)`);
    });
    writeToFile('');

    // 2. Explorer la base de données principale (restaurants)
    const mainDb = client.db();
    writeToFile(`## BASE DE DONNÉES: ${mainDb.databaseName}`);
    
    // Lister les collections
    const mainCollections = await mainDb.listCollections().toArray();
    writeToFile('### Collections:');
    for (const collection of mainCollections) {
      writeToFile(`- ${collection.name}`);
    }
    writeToFile('');

    // Examiner la collection Restaurant (si elle existe)
    if (mainCollections.some(c => c.name === 'restaurants')) {
      writeToFile('### Échantillon de Restaurants:');
      const restaurants = await mainDb.collection('restaurants').find().limit(2).toArray();
      restaurants.forEach((restaurant, index) => {
        writeToFile(`#### Restaurant ${index + 1}:`);
        writeToFile('```json');
        writeToFile(JSON.stringify(restaurant, null, 2));
        writeToFile('```\n');
      });
    }

    // 3. Explorer la base de données Loisir&Culture
    const leisureDb = client.db('Loisir&Culture');
    writeToFile(`## BASE DE DONNÉES: Loisir&Culture`);
    
    // Lister les collections
    const leisureCollections = await leisureDb.listCollections().toArray();
    writeToFile('### Collections:');
    for (const collection of leisureCollections) {
      writeToFile(`- ${collection.name}`);
    }
    writeToFile('');

    // Examiner la collection Loisir_Paris_Producers
    if (leisureCollections.some(c => c.name === 'Loisir_Paris_Producers')) {
      writeToFile('### Échantillon de Lieux de Loisirs:');
      const producers = await leisureDb.collection('Loisir_Paris_Producers').find().limit(2).toArray();
      producers.forEach((producer, index) => {
        writeToFile(`#### Lieu de Loisirs ${index + 1}:`);
        writeToFile('```json');
        writeToFile(JSON.stringify(producer, null, 2));
        writeToFile('```\n');
      });
    }

    // Examiner la collection Loisir_Paris_Evenements
    if (leisureCollections.some(c => c.name === 'Loisir_Paris_Evenements')) {
      writeToFile('### Échantillon d\'Événements:');
      const events = await leisureDb.collection('Loisir_Paris_Evenements').find().limit(2).toArray();
      events.forEach((event, index) => {
        writeToFile(`#### Événement ${index + 1}:`);
        writeToFile('```json');
        writeToFile(JSON.stringify(event, null, 2));
        writeToFile('```\n');
      });
    }

    writeToFile('## Rapport d\'export terminé');
    console.log(`✅ Export terminé: ${outputFilePath}`);
  } catch (error) {
    writeToFile(`❌ Erreur: ${error.message}`);
    console.error('Erreur:', error);
  } finally {
    if (client) {
      await client.close();
      writeToFile('🔒 Connexion fermée');
    }
  }
}

// Exécuter la fonction principale
exportMongoDBData().catch(console.error);
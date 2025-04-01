const mongoose = require('mongoose');
const dotenv = require('dotenv');

// Charger les variables d'environnement
dotenv.config();

if (!process.env.MONGO_URI) {
  console.error('❌ La variable MONGO_URI est manquante.');
  process.exit(1);
}

// Fonction pour analyser une collection
async function analyzeCollection(db, collectionName) {
  try {
    const collection = db.collection(collectionName);
    const sample = await collection.findOne();
    
    if (!sample) {
      console.log(`📁 Collection ${collectionName} est vide`);
      return;
    }

    console.log(`\n📊 Analyse de la collection: ${collectionName}`);
    console.log('Structure des champs:');
    
    // Analyser la structure récursivement
    function analyzeStructure(obj, prefix = '') {
      for (const [key, value] of Object.entries(obj)) {
        const fullKey = prefix ? `${prefix}.${key}` : key;
        
        if (value === null) {
          console.log(`  ${fullKey}: null`);
        } else if (Array.isArray(value)) {
          console.log(`  ${fullKey}: Array[${value.length}]`);
          if (value.length > 0) {
            console.log(`    Type d'éléments: ${typeof value[0]}`);
            if (typeof value[0] === 'object' && value[0] !== null) {
              analyzeStructure(value[0], `${fullKey}[0]`);
            }
          }
        } else if (typeof value === 'object') {
          console.log(`  ${fullKey}: Object`);
          analyzeStructure(value, fullKey);
        } else {
          console.log(`  ${fullKey}: ${typeof value}`);
        }
      }
    }

    analyzeStructure(sample);
    
    // Compter les documents
    const count = await collection.countDocuments();
    console.log(`\n📈 Nombre total de documents: ${count}`);
    
  } catch (error) {
    console.error(`❌ Erreur lors de l'analyse de ${collectionName}:`, error.message);
  }
}

// Fonction principale
async function analyzeAllDatabases() {
  try {
    // Connexion à MongoDB
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connecté à MongoDB');

    // Liste des bases de données à analyser
    const databases = [
      'choice_app',
      'Restauration_Officielle',
      'Loisir&Culture',
      'test'
    ];

    for (const dbName of databases) {
      console.log(`\n🔍 Analyse de la base de données: ${dbName}`);
      
      // Obtenir la liste des collections
      const db = mongoose.connection.useDb(dbName);
      const collections = await db.db.listCollections().toArray();
      
      for (const collection of collections) {
        await analyzeCollection(db, collection.name);
      }
    }

    console.log('\n✅ Analyse terminée');
    process.exit(0);
  } catch (error) {
    console.error('❌ Erreur lors de l\'analyse:', error);
    process.exit(1);
  }
}

// Exécuter l'analyse
analyzeAllDatabases(); 
const path = require('path');
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const { MongoClient } = require('mongodb');

// Charger le fichier .env avec le chemin complet
dotenv.config({ path: path.join(__dirname, '.env') });

// Vérification de la présence de l'URI MongoDB
if (!process.env.MONGO_URI) {
  console.error('❌ Erreur: MONGO_URI n\'est pas défini dans le fichier .env');
  process.exit(1);
}

// Fonction pour analyser la structure d'un document
function analyzeDocumentStructure(doc, path = '', depth = 0, maxDepth = 5) {
  if (depth >= maxDepth) return { type: 'Max Depth Reached' };
  if (doc === null) return { type: 'null' };

  // Traitement des cas spéciaux
  if (doc._bsontype === 'ObjectID' || doc._bsontype === 'ObjectId') {
    return { type: 'ObjectId', value: doc.toString() };
  }
  
  if (Array.isArray(doc)) {
    // Analyser les différents types dans l'array pour détecter les variantes
    const arrayStructures = [];
    const sampleLimit = Math.min(doc.length, 5); // Analyser jusqu'à 5 éléments
    
    for (let i = 0; i < sampleLimit; i++) {
      const item = doc[i];
      arrayStructures.push(analyzeDocumentStructure(item, `${path}[${i}]`, depth + 1, maxDepth));
    }
    
    // Regrouper par type pour une vue résumée
    return { 
      type: 'Array', 
      length: doc.length,
      samples: arrayStructures 
    };
  }
  
  if (typeof doc === 'object') {
    if (doc instanceof Date) {
      return { type: 'Date', value: doc.toISOString() };
    }
    
    const result = {};
    for (const [key, value] of Object.entries(doc)) {
      // Ignorer les champs internes de MongoDB commençant par _
      if (key !== '_id' && key.startsWith('_') && typeof value !== 'object') continue;
      
      result[key] = analyzeDocumentStructure(value, path ? `${path}.${key}` : key, depth + 1, maxDepth);
    }
    return result;
  }
  
  return { type: typeof doc, example: String(doc).substring(0, 50) };
}

// Fonction pour fusionner les structures détectées
function mergeStructures(structures) {
  if (!Array.isArray(structures) || structures.length === 0) return {};
  
  let merged = {};
  for (const struct of structures) {
    for (const [key, value] of Object.entries(struct)) {
      if (!(key in merged)) {
        merged[key] = value;
      } else if (typeof merged[key] === 'object' && typeof value === 'object') {
        merged[key] = {...merged[key], ...value};
      }
    }
  }
  return merged;
}

// Fonction principale
async function exploreMongoDBInstance() {
  let client;
  
  try {
    console.log('🔄 Connexion à MongoDB...');
    client = await MongoClient.connect(process.env.MONGO_URI);
    console.log('✅ Connecté à MongoDB');
    
    // Récupérer la liste de toutes les bases de données
    const admin = client.db().admin();
    const dbs = await admin.listDatabases();
    
    console.log(`\n📚 Bases de données trouvées: ${dbs.databases.length}`);
    
    for (const db of dbs.databases) {
      // Ignorer les bases de données système
      if (['admin', 'local', 'config'].includes(db.name)) continue;
      
      console.log(`\n\n==== 📁 BASE DE DONNÉES: ${db.name} ====`);
      
      const database = client.db(db.name);
      const collections = await database.listCollections().toArray();
      
      console.log(`\n🗂️ Collections: ${collections.length}`);
      
      for (const collection of collections) {
        console.log(`\n\n📋 COLLECTION: ${collection.name}`);
        
        try {
          const coll = database.collection(collection.name);
          const count = await coll.countDocuments();
          
          // Afficher le nombre de documents
          console.log(`📊 Nombre de documents: ${count}`);
          
          if (count > 0) {
            // Récupérer les index
            const indexes = await coll.indexes();
            console.log('\n🔍 Index:');
            indexes.forEach(index => {
              console.log(`  - ${index.name}: ${JSON.stringify(index.key)}`);
            });
            
            // Analyser la structure avec un échantillonnage
            const sampleSize = Math.min(10, count);
            console.log(`\n🔎 Analyse de ${sampleSize} documents sur ${count}:`);
            
            const sampleDocs = await coll.find().limit(sampleSize).toArray();
            const structures = sampleDocs.map(doc => analyzeDocumentStructure(doc));
            
            // Afficher les structures individuelles
            sampleDocs.forEach((doc, idx) => {
              console.log(`\n--- Document #${idx+1} ---`);
              console.log(JSON.stringify(structures[idx], null, 2));
            });
            
            // Fusionner les structures pour une vue complète
            if (sampleDocs.length > 1) {
              console.log('\n🔄 Structure fusionnée:');
              console.log(JSON.stringify(mergeStructures(structures), null, 2));
            }
          } else {
            console.log('❌ Aucun document dans cette collection');
          }
          
          // Obtenir les statistiques de la collection
          const stats = await database.command({collStats: collection.name});
          console.log('\n📈 Statistiques:');
          console.log(`  - Taille: ${(stats.size/1024/1024).toFixed(2)} MB`);
          console.log(`  - Stockage: ${(stats.storageSize/1024/1024).toFixed(2)} MB`);
          console.log(`  - Index: ${(stats.totalIndexSize/1024/1024).toFixed(2)} MB`);
          
        } catch (collErr) {
          console.error(`❌ Erreur analyse collection ${collection.name}:`, collErr.message);
        }
      }
    }
    
  } catch (err) {
    console.error('❌ Erreur:', err.message);
  } finally {
    if (client) {
      await client.close();
      console.log('\n✅ Connexion MongoDB fermée');
    }
  }
}

// Exécuter la fonction
console.log('🔍 Analyse complète de l\'instance MongoDB');
exploreMongoDBInstance().catch(console.error);

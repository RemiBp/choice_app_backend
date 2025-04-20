const { MongoClient } = require('mongodb');
const readline = require('readline');
const dotenv = require('dotenv');

// Charger les variables d'environnement
dotenv.config();

/**
 * MongoDB Explorer - Outil interactif pour explorer vos bases de données MongoDB
 * 
 * Ce script vous permet d'explorer facilement vos bases de données MongoDB
 * en utilisant des commandes simples dans un terminal interactif.
 */

// Initialiser l'interface de ligne de commande
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Informations de connexion
const mongoUri = process.env.MONGO_URI;
let client = null;
let currentDb = null;
let currentCollection = null;

// Fonctions principales
async function connectToMongo() {
  if (!mongoUri) {
    console.error('❌ Erreur: Variable MONGO_URI manquante dans le fichier .env');
    return false;
  }

  try {
    console.log('🔄 Connexion à MongoDB Atlas...');
    client = new MongoClient(mongoUri);
    await client.connect();
    console.log('✅ Connexion réussie à MongoDB Atlas!');
    return true;
  } catch (error) {
    console.error(`❌ Erreur de connexion: ${error.message}`);
    return false;
  }
}

async function listDatabases() {
  try {
    const databasesList = await client.db().admin().listDatabases();
    console.log('\n📋 BASES DE DONNÉES DISPONIBLES:');
    databasesList.databases.forEach((db, index) => {
      console.log(`${index + 1}. ${db.name} (${(db.sizeOnDisk / 1024 / 1024).toFixed(2)} MB)`);
    });
  } catch (error) {
    console.error(`❌ Erreur: ${error.message}`);
  }
}

async function useDatabase(dbName) {
  try {
    currentDb = client.db(dbName);
    console.log(`✅ Base de données active: ${dbName}`);
    return true;
  } catch (error) {
    console.error(`❌ Erreur: ${error.message}`);
    return false;
  }
}

async function listCollections() {
  if (!currentDb) {
    console.log('❌ Aucune base de données sélectionnée. Utilisez "use <dbName>" d\'abord.');
    return;
  }

  try {
    const collections = await currentDb.listCollections().toArray();
    console.log(`\n📋 COLLECTIONS DANS "${currentDb.databaseName}":`);
    collections.forEach((collection, index) => {
      console.log(`${index + 1}. ${collection.name}`);
    });
  } catch (error) {
    console.error(`❌ Erreur: ${error.message}`);
  }
}

async function useCollection(collectionName) {
  if (!currentDb) {
    console.log('❌ Aucune base de données sélectionnée. Utilisez "use <dbName>" d\'abord.');
    return false;
  }

  try {
    currentCollection = currentDb.collection(collectionName);
    console.log(`✅ Collection active: ${collectionName}`);
    return true;
  } catch (error) {
    console.error(`❌ Erreur: ${error.message}`);
    return false;
  }
}

async function countDocuments() {
  if (!currentCollection) {
    console.log('❌ Aucune collection sélectionnée. Utilisez "collection <collectionName>" d\'abord.');
    return;
  }

  try {
    const count = await currentCollection.countDocuments();
    console.log(`📊 Nombre de documents dans "${currentCollection.collectionName}": ${count}`);
  } catch (error) {
    console.error(`❌ Erreur: ${error.message}`);
  }
}

async function findDocuments(limit = 5, query = {}) {
  if (!currentCollection) {
    console.log('❌ Aucune collection sélectionnée. Utilisez "collection <collectionName>" d\'abord.');
    return;
  }

  try {
    const documents = await currentCollection.find(query).limit(limit).toArray();
    console.log(`\n📄 ${documents.length} DOCUMENTS DE "${currentCollection.collectionName}":`);
    documents.forEach((doc, index) => {
      console.log(`\n--- Document ${index + 1} ---`);
      console.log(JSON.stringify(doc, null, 2));
    });
  } catch (error) {
    console.error(`❌ Erreur: ${error.message}`);
  }
}

async function findById(id) {
  if (!currentCollection) {
    console.log('❌ Aucune collection sélectionnée. Utilisez "collection <collectionName>" d\'abord.');
    return;
  }

  try {
    // Vérifier si l'ID est un ObjectId valide
    let objectId;
    try {
      objectId = new MongoClient.ObjectId(id);
    } catch (error) {
      console.log(`⚠️ ID non valide pour un ObjectId. Recherche par champ _id comme string.`);
      objectId = id;
    }

    const document = await currentCollection.findOne({ _id: objectId });
    if (document) {
      console.log(`\n📄 DOCUMENT TROUVÉ:`);
      console.log(JSON.stringify(document, null, 2));
    } else {
      console.log(`❌ Aucun document trouvé avec _id: ${id}`);
    }
  } catch (error) {
    console.error(`❌ Erreur: ${error.message}`);
  }
}

async function getCollectionStats() {
  if (!currentCollection) {
    console.log('❌ Aucune collection sélectionnée. Utilisez "collection <collectionName>" d\'abord.');
    return;
  }

  try {
    const stats = await currentDb.command({ collStats: currentCollection.collectionName });
    console.log(`\n📊 STATISTIQUES DE LA COLLECTION "${currentCollection.collectionName}":`);
    console.log(`- Nombre de documents: ${stats.count}`);
    console.log(`- Taille: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
    console.log(`- Taille moyenne des documents: ${(stats.avgObjSize / 1024).toFixed(2)} KB`);
    console.log(`- Nombre d'index: ${stats.nindexes}`);
  } catch (error) {
    console.error(`❌ Erreur: ${error.message}`);
  }
}

async function showIndexes() {
  if (!currentCollection) {
    console.log('❌ Aucune collection sélectionnée. Utilisez "collection <collectionName>" d\'abord.');
    return;
  }

  try {
    const indexes = await currentCollection.indexes();
    console.log(`\n🔍 INDEX DE LA COLLECTION "${currentCollection.collectionName}":`);
    indexes.forEach((index, i) => {
      console.log(`${i + 1}. ${index.name}: ${JSON.stringify(index.key)}`);
    });
  } catch (error) {
    console.error(`❌ Erreur: ${error.message}`);
  }
}

function showHelp() {
  console.log(`
📚 COMMANDES DISPONIBLES:

  help                     - Affiche cette aide
  dbs                      - Liste toutes les bases de données
  use <dbName>             - Utilise une base de données spécifique
  collections              - Liste toutes les collections de la base de données active
  collection <name>        - Sélectionne une collection spécifique
  count                    - Compte le nombre de documents dans la collection active
  find [n]                 - Affiche les n premiers documents (défaut: 5)
  findById <id>            - Recherche un document par son _id
  stats                    - Affiche les statistiques de la collection active
  indexes                  - Affiche les index de la collection active
  clear                    - Efface l'écran
  exit                     - Quitte l'application
  
EXEMPLES:
  use choice_app           - Sélectionne la base de données "choice_app"
  collection Users         - Sélectionne la collection "Users"
  find 3                   - Affiche les 3 premiers documents
  `);
}

function clearScreen() {
  console.clear();
  console.log('🔍 MongoDB Explorer - Terminal Interactif');
  console.log('=======================================');
}

// Traitement des commandes
async function processCommand(command) {
  const args = command.trim().split(' ');
  const cmd = args[0].toLowerCase();

  switch (cmd) {
    case 'help':
      showHelp();
      break;
    case 'dbs':
      await listDatabases();
      break;
    case 'use':
      if (args[1]) {
        await useDatabase(args[1]);
      } else {
        console.log('❌ Spécifiez le nom de la base de données: use <dbName>');
      }
      break;
    case 'collections':
      await listCollections();
      break;
    case 'collection':
      if (args[1]) {
        await useCollection(args[1]);
      } else {
        console.log('❌ Spécifiez le nom de la collection: collection <name>');
      }
      break;
    case 'count':
      await countDocuments();
      break;
    case 'find':
      const limit = args[1] ? parseInt(args[1]) : 5;
      await findDocuments(limit);
      break;
    case 'findbyid':
      if (args[1]) {
        await findById(args[1]);
      } else {
        console.log('❌ Spécifiez l\'ID: findById <id>');
      }
      break;
    case 'stats':
      await getCollectionStats();
      break;
    case 'indexes':
      await showIndexes();
      break;
    case 'clear':
      clearScreen();
      break;
    case 'exit':
      if (client) {
        await client.close();
        console.log('🔒 Connexion fermée');
      }
      rl.close();
      return false;
    default:
      console.log(`❌ Commande inconnue: ${cmd}. Tapez "help" pour voir les commandes disponibles.`);
  }
  return true;
}

// Fonction principale
async function startMongoExplorer() {
  clearScreen();
  console.log('\nConnexion à votre base de données MongoDB Atlas...\n');

  const connected = await connectToMongo();
  if (!connected) {
    console.log('\n❌ Impossible de se connecter à MongoDB. Vérifiez votre connexion et réessayez.');
    rl.close();
    return;
  }

  console.log(`
✅ Connexion réussie à MongoDB Atlas!

🚀 Bienvenue dans l'explorateur MongoDB interactif!
Tapez "help" pour voir les commandes disponibles ou "exit" pour quitter.
  `);

  // Prompt interactif
  const promptUser = () => {
    rl.question('\n📊 mongo> ', async (input) => {
      const shouldContinue = await processCommand(input);
      if (shouldContinue) {
        promptUser();
      }
    });
  };

  promptUser();
}

// Démarrer l'application
startMongoExplorer();
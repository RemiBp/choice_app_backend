const mongoose = require('mongoose');
const { MongoClient } = require('mongodb');
const dotenv = require('dotenv');
const fs = require('fs');

// Charger les variables d'environnement
dotenv.config();

/**
 * Script de test de connexion MongoDB Atlas
 * Ce script permet de vérifier la connexion à MongoDB Atlas et d'explorer les bases de données
 * Version corrigée pour éviter les erreurs de session expirée
 */

// Fonction pour afficher les informations de manière plus lisible
function prettify(obj) {
  return JSON.stringify(obj, null, 2);
}

// Variable pour stocker les logs
let logs = [];

// Rediriger console.log pour capturer les logs
const originalConsoleLog = console.log;
const originalConsoleError = console.error;

console.log = function() {
  logs.push(Array.from(arguments).join(' '));
  originalConsoleLog.apply(console, arguments);
};

console.error = function() {
  logs.push('[ERROR] ' + Array.from(arguments).join(' '));
  originalConsoleError.apply(console, arguments);
};

// Sauvegarder le rapport dans un fichier
function saveReport() {
  const timestamp = new Date().toISOString().replace(/:/g, '-');
  const filename = `mongodb_report_${timestamp}.txt`;
  
  fs.writeFileSync(filename, logs.join('\n'), 'utf8');
  
  // Restaurer console.log
  console.log = originalConsoleLog;
  console.error = originalConsoleError;
  
  console.log(`\n📝 Rapport sauvegardé dans le fichier "${filename}"`);
}

// Fonction principale de test - utilise MongoClient directement pour éviter les problèmes de session
async function testMongoConnection() {
  console.log('🔍 TEST DE CONNEXION MONGODB ATLAS');
  console.log('================================\n');
  
  // Afficher les informations de connexion (masquées pour sécurité)
  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) {
    console.error('❌ ERREUR: Variable MONGO_URI manquante dans le fichier .env');
    return;
  }
  
  const maskedUri = mongoUri.replace(/(mongodb\+srv:\/\/)([^:]+):([^@]+)@/, '$1******:******@');
  console.log(`🔌 URI de connexion: ${maskedUri}`);
  
  let client;
  
  try {
    console.log('\n🔄 Tentative de connexion à MongoDB Atlas...');
    
    // Utiliser MongoClient directement pour plus de contrôle sur les sessions
    client = new MongoClient(mongoUri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    
    await client.connect();
    
    console.log('✅ CONNEXION RÉUSSIE à MongoDB Atlas !');
    
    // Informations de connexion
    const connectionInfo = client.options;
    console.log('\n📊 INFORMATIONS DE CONNEXION:');
    console.log(`- Host: ${client.s.options.hosts[0].host}`);
    console.log(`- Port: ${client.s.options.hosts[0].port}`);
    
    // Obtenir la liste des bases de données
    const adminDb = client.db('admin');
    const dbInfo = await adminDb.admin().listDatabases();
    
    console.log('\n📂 BASES DE DONNÉES DISPONIBLES:');
    dbInfo.databases.forEach(db => {
      console.log(`- ${db.name} (${(db.sizeOnDisk / 1024 / 1024).toFixed(2)} MB)`);
    });
    
    // Liste des bases à analyser
    const databasesToAnalyze = ['test', 'choice_app', 'Restauration_Officielle'];
    
    // Analyser chaque base de données
    for (const dbName of databasesToAnalyze) {
      await analyzeDatabase(client, dbName);
    }
    
    // Vérifier les utilisateurs
    try {
      const users = await adminDb.admin().command({ usersInfo: 1 });
      console.log('\n👤 UTILISATEURS:');
      users.users.forEach(user => {
        console.log(`- Utilisateur: ${user.user}, Rôles: ${user.roles.map(r => r.role).join(', ')}`);
      });
    } catch (error) {
      console.log('\n👤 UTILISATEURS: Impossible de récupérer les informations (droits insuffisants)');
    }
    
    // Vérifier les connexions actives
    try {
      const currentOps = await adminDb.admin().command({ currentOp: true });
      console.log('\n🔄 CONNEXIONS ACTIVES:');
      console.log(`- Total connexions actives: ${currentOps.inprog.length}`);
    } catch (error) {
      console.log('\n🔄 CONNEXIONS ACTIVES: Impossible de récupérer les informations (droits insuffisants)');
    }
    
  } catch (error) {
    console.error(`❌ ERREUR DE CONNEXION: ${error.message}`);
    if (error.message.includes('Authentication failed')) {
      console.error('👉 Cause probable: Identifiants invalides (nom d\'utilisateur ou mot de passe incorrect)');
    } else if (error.message.includes('getaddrinfo')) {
      console.error('👉 Cause probable: Problème de résolution DNS ou de connectivité réseau');
    } else if (error.message.includes('connection timed out')) {
      console.error('👉 Cause probable: Délai d\'attente dépassé, vérifiez votre connectivité ou les règles de pare-feu');
    }
  } finally {
    // Fermeture de la connexion
    if (client) {
      await client.close();
      console.log('\n🔒 Connexion fermée');
    }
    
    // Sauvegarder le rapport dans un fichier
    saveReport();
  }
}

// Fonction pour analyser une base de données - version améliorée
async function analyzeDatabase(client, dbName) {
  console.log(`\n📊 ANALYSE DE LA BASE DE DONNÉES "${dbName}":`);
  
  try {
    // Obtenir une référence à la base de données
    const db = client.db(dbName);
    
    // Obtenir la liste des collections
    const collections = await db.listCollections().toArray();
    
    if (collections.length === 0) {
      console.log(`- Aucune collection trouvée dans la base "${dbName}"`);
      return;
    }
    
    console.log(`- ${collections.length} collections trouvées:`);
    
    // Pour chaque collection, obtenir des informations
    for (const collection of collections) {
      try {
        // Obtenir des statistiques sur la collection
        const collectionObj = db.collection(collection.name);
        const stats = await db.command({ collStats: collection.name });
        
        console.log(`  • ${collection.name}: ${stats.count || 0} documents, ${(stats.size / 1024 / 1024).toFixed(2)} MB, ${stats.nindexes || 0} index(es)`);
        
        // Obtenir un échantillon de documents
        const sampleDocs = await collectionObj.find().limit(1).toArray();
        if (sampleDocs.length > 0) {
          console.log(`    - Structure du document: ${Object.keys(sampleDocs[0]).join(', ')}`);
        } else {
          console.log('    - Collection vide');
        }
        
        // Obtenir les index
        const indexes = await collectionObj.indexes();
        if (indexes.length > 0) {
          console.log(`    - Index: ${indexes.map(idx => idx.name).join(', ')}`);
        }
      } catch (collError) {
        console.log(`  • ${collection.name}: Erreur lors de l'analyse: ${collError.message}`);
      }
    }
  } catch (error) {
    console.error(`❌ Erreur lors de l'analyse de la base "${dbName}": ${error.message}`);
  }
}

// Explication des informations de connexion MongoDB pour l'utilisateur
console.log(`
🔍 COMPRENDRE VOTRE CONNEXION MONGODB

Ce script analyse votre connexion MongoDB Atlas actuelle. Voici ce que vous devez savoir:

1. Votre application est connectée à MongoDB Atlas (service cloud) et non à une instance locale
2. Les connexions réseau montrent des connexions aux adresses MongoDB Atlas:
   - 13.36.193.74:27017
   - 13.37.253.144:27017
   - 15.236.189.229:27017

3. Ces adresses correspondent aux serveurs de votre cluster MongoDB Atlas "lieuxrestauration"

4. Pour se connecter localement à cette base de données, vous devez:
   - Avoir un client MongoDB installé (comme MongoDB Compass)
   - Utiliser la même chaîne de connexion que celle dans votre fichier .env
   - Avoir accès à Internet pour atteindre les serveurs MongoDB Atlas

5. Si vous souhaitez utiliser une base MongoDB locale à la place:
   - Installez MongoDB sur votre machine
   - Créez une base de données locale
   - Modifiez votre fichier .env pour utiliser "mongodb://localhost:27017/nom_de_votre_base"

Lancement de l'analyse de votre connexion actuelle...
`);

// Exécuter le test
testMongoConnection();
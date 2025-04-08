/**
 * Script pour sauvegarder les bases de données MongoDB
 * 
 * Ce script crée une sauvegarde des bases de données importantes
 * et les stocke dans un dossier de sauvegardes local.
 */

const { exec } = require('child_process');
const { MongoClient } = require('mongodb');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// URL MongoDB - Utiliser la variable d'environnement ou la valeur par défaut
const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://remibarbier:Calvi8Pierc2@lieuxrestauration.szq31.mongodb.net/?retryWrites=true&w=majority&appName=lieuxrestauration';

// Bases de données à sauvegarder
const DATABASES_TO_BACKUP = [
  'Beauty_Wellness',
  'Loisir&Culture',
  'Restauration_Officielle',
  'Events_Loisirs',
  'ChoiceApp',
  'choice_app'
];

// Configuration du dossier de sauvegarde
const backupDir = path.join(__dirname, '../backups');
const timestamp = new Date().toISOString().replace(/:/g, '-').replace(/\..+/, '');
const backupFolderName = `mongodb_backup_${timestamp}`;
const backupPath = path.join(backupDir, backupFolderName);

// Créer le dossier de sauvegarde s'il n'existe pas
if (!fs.existsSync(backupDir)) {
  fs.mkdirSync(backupDir, { recursive: true });
}
fs.mkdirSync(backupPath, { recursive: true });

/**
 * Fonction pour exécuter une commande shell
 */
function executeCommand(command) {
  return new Promise((resolve, reject) => {
    exec(command, (error, stdout, stderr) => {
      if (error) {
        reject(error);
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

/**
 * Fonction pour sauvegarder une base de données
 */
async function backupDatabase(dbName) {
  console.log(`🔄 Sauvegarde de la base de données: ${dbName}`);
  
  const dbBackupPath = path.join(backupPath, dbName);
  if (!fs.existsSync(dbBackupPath)) {
    fs.mkdirSync(dbBackupPath, { recursive: true });
  }
  
  try {
    // Utiliser mongoexport pour extraire les collections (plus flexible que mongodump)
    const client = new MongoClient(MONGO_URI);
    await client.connect();
    
    // Récupérer la liste des collections
    const db = client.db(dbName);
    const collections = await db.listCollections().toArray();
    
    if (collections.length === 0) {
      console.log(`⚠️ Aucune collection trouvée dans ${dbName}, sauvegarde ignorée`);
      await client.close();
      return;
    }
    
    console.log(`📊 Trouvé ${collections.length} collections dans ${dbName}`);
    
    // Sauvegarder chaque collection
    for (const collInfo of collections) {
      const collName = collInfo.name;
      
      // Ignorer les collections système
      if (collName.startsWith('system.')) {
        continue;
      }
      
      const collectionBackupPath = path.join(dbBackupPath, `${collName}.json`);
      
      // Extraire les données de la collection
      console.log(`📤 Exportation de ${dbName}.${collName}`);
      
      // Utiliser mongoexport via l'URL de connexion
      const mongoExportCmd = `mongoexport --uri="${MONGO_URI}" --db="${dbName}" --collection="${collName}" --out="${collectionBackupPath}" --jsonArray --pretty`;
      
      try {
        const { stdout, stderr } = await executeCommand(mongoExportCmd);
        if (stderr && !stderr.includes('connected to:')) {
          console.warn(`⚠️ Avertissement lors de l'exportation de ${dbName}.${collName}: ${stderr}`);
        }
        
        // Vérifier si le fichier de sauvegarde existe et a une taille
        if (fs.existsSync(collectionBackupPath) && fs.statSync(collectionBackupPath).size > 0) {
          console.log(`✅ Collection ${dbName}.${collName} sauvegardée avec succès (${fs.statSync(collectionBackupPath).size} octets)`);
        } else {
          console.log(`⚠️ Exportation de ${dbName}.${collName} a échoué ou est vide`);
          
          // Approche alternative: utiliser la méthode native pour les petites collections
          try {
            console.log(`🔄 Tentative d'exportation alternative pour ${dbName}.${collName}`);
            const collection = db.collection(collName);
            const data = await collection.find({}).toArray();
            
            if (data.length > 0) {
              fs.writeFileSync(collectionBackupPath, JSON.stringify(data, null, 2));
              console.log(`✅ Collection ${dbName}.${collName} sauvegardée (méthode alternative) avec ${data.length} documents`);
            } else {
              console.log(`⚠️ Collection ${dbName}.${collName} est vide`);
            }
          } catch (altErr) {
            console.error(`❌ Échec de l'exportation alternative pour ${dbName}.${collName}: ${altErr.message}`);
          }
        }
      } catch (cmdErr) {
        console.error(`❌ Erreur lors de l'exportation de ${dbName}.${collName}: ${cmdErr.message}`);
        
        // Approche alternative si mongoexport échoue
        try {
          console.log(`🔄 Tentative d'exportation alternative pour ${dbName}.${collName}`);
          const collection = db.collection(collName);
          const data = await collection.find({}).toArray();
          
          if (data.length > 0) {
            fs.writeFileSync(collectionBackupPath, JSON.stringify(data, null, 2));
            console.log(`✅ Collection ${dbName}.${collName} sauvegardée (méthode alternative) avec ${data.length} documents`);
          } else {
            console.log(`⚠️ Collection ${dbName}.${collName} est vide`);
          }
        } catch (altErr) {
          console.error(`❌ Échec de l'exportation alternative pour ${dbName}.${collName}: ${altErr.message}`);
        }
      }
    }
    
    await client.close();
    console.log(`✅ Sauvegarde de ${dbName} terminée`);
  } catch (err) {
    console.error(`❌ Erreur lors de la sauvegarde de ${dbName}: ${err.message}`);
  }
}

/**
 * Fonction principale pour effectuer la sauvegarde
 */
async function backupAllDatabases() {
  console.log('🔄 Démarrage de la sauvegarde MongoDB...');
  console.log(`📂 Sauvegarde vers: ${backupPath}`);
  
  try {
    // Sauvegarder chaque base de données
    for (const dbName of DATABASES_TO_BACKUP) {
      await backupDatabase(dbName);
    }
    
    // Créer un fichier d'informations sur la sauvegarde
    const infoFilePath = path.join(backupPath, 'backup_info.json');
    const backupInfo = {
      timestamp: new Date().toISOString(),
      databases: DATABASES_TO_BACKUP,
      mongo_uri: MONGO_URI.replace(/:[^\/]+@/, ':****@'), // Masquer le mot de passe
      backup_path: backupPath
    };
    
    fs.writeFileSync(infoFilePath, JSON.stringify(backupInfo, null, 2));
    
    console.log('\n=================================================');
    console.log('✅ SAUVEGARDE TERMINÉE');
    console.log('=================================================');
    console.log(`📂 Sauvegarde enregistrée dans: ${backupPath}`);
    console.log(`📊 Bases de données sauvegardées: ${DATABASES_TO_BACKUP.length}`);
    console.log('=================================================');
  } catch (err) {
    console.error('❌ Erreur globale lors de la sauvegarde:', err);
  }
}

// Exécuter la sauvegarde
backupAllDatabases(); 
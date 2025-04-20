const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

// Charger les variables d'environnement
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// URL de connexion MongoDB
const mongoURI = process.env.MONGO_URI || 'mongodb+srv://remibarbier:Calvi8Pierc2@lieuxrestauration.szq31.mongodb.net/?retryWrites=true&w=majority&appName=lieuxrestauration';

// Tableau des bases de données à vérifier
const databases = [
  { name: 'choice_app', collections: ['users', 'posts', 'conversations'] },
  { name: 'Restauration_Officielle', collections: ['Paris_Restaurants'] },
  { name: 'Loisir&Culture', collections: ['Loisir_Paris_Producers', 'Loisir_Paris_Evenements'] },
  { name: 'Beauty_Wellness', collections: ['BeautyPlaces'] }
];

// Fonction pour obtenir les statistiques d'une collection
async function getCollectionStats(db, collectionName) {
  try {
    const stats = await db.collection(collectionName).stats();
    const count = await db.collection(collectionName).countDocuments();
    
    return {
      name: collectionName,
      count,
      size: formatSize(stats.size),
      avgObjSize: formatSize(stats.avgObjSize),
      storageSize: formatSize(stats.storageSize),
      indexes: stats.nindexes
    };
  } catch (error) {
    console.error(`❌ Erreur lors de la récupération des statistiques pour ${collectionName}:`, error.message);
    return {
      name: collectionName,
      count: 'Erreur',
      size: 'Erreur',
      avgObjSize: 'Erreur',
      storageSize: 'Erreur',
      indexes: 'Erreur'
    };
  }
}

// Fonction pour formater la taille en unités lisibles
function formatSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Fonction principale
async function main() {
  console.log('\n📊 STATISTIQUES MONGODB\n');
  
  for (const database of databases) {
    try {
      // Connexion à la base de données
      const client = await mongoose.connect(mongoURI, {
        dbName: database.name,
        useNewUrlParser: true,
        useUnifiedTopology: true
      });
      
      console.log(`\n🗄️  BASE DE DONNÉES: ${database.name}`);
      console.log('-----------------------------------------------');
      
      // Obtenir les statistiques pour chaque collection
      for (const collectionName of database.collections) {
        const stats = await getCollectionStats(client.connection.db, collectionName);
        
        console.log(`📁 Collection: ${stats.name}`);
        console.log(`   Documents: ${stats.count}`);
        console.log(`   Taille totale: ${stats.size}`);
        console.log(`   Taille moyenne des objets: ${stats.avgObjSize}`);
        console.log(`   Taille de stockage: ${stats.storageSize}`);
        console.log(`   Nombre d'index: ${stats.indexes}`);
        console.log('-----------------------------------------------');
      }
      
      // Fermer la connexion
      await client.disconnect();
    } catch (error) {
      console.error(`❌ Erreur lors de la connexion à la base de données ${database.name}:`, error.message);
    }
  }
  
  console.log('\n✅ Vérification terminée!\n');
  process.exit(0);
}

// Exécuter la fonction principale
main().catch(error => {
  console.error('❌ Erreur globale:', error);
  process.exit(1);
}); 
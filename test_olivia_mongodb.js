/**
 * Script de test pour accéder directement à MongoDB et vérifier la connexion
 * Se concentre sur la recherche du restaurant Olivia et de son plat Norvegese
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
      console.log(`- Nom: ${olivia.name}`);
      console.log(`- Adresse: ${olivia.address}`);
      console.log(`- Note: ${olivia.rating}/5`);
      console.log(`- Prix: ${olivia.price_level}/4`);
      
      // Rechercher le plat Norvegese dans Items Indépendants
      let norvegese = null;
      
      if (olivia['Items Indépendants'] && Array.isArray(olivia['Items Indépendants'])) {
        // Parcourir les catégories
        for (const category of olivia['Items Indépendants']) {
          if (category.items && Array.isArray(category.items)) {
            // Parcourir les items de chaque catégorie
            for (const item of category.items) {
              if (item.nom === 'Norvegese') {
                norvegese = item;
                break;
              }
            }
          }
          if (norvegese) break;
        }
      }
      
      if (norvegese) {
        console.log('\n🍽️ PLAT NORVEGESE TROUVÉ:');
        console.log(`- Nom: ${norvegese.nom}`);
        console.log(`- Description: ${norvegese.description}`);
        console.log(`- Prix: ${norvegese.prix}`);
        console.log(`- Note: ${norvegese.note}`);
        
        // Confirmer que le plat contient du saumon
        const contientSaumon = norvegese.description.toLowerCase().includes('saumon');
        console.log(`- Contient du saumon: ${contientSaumon ? 'OUI ✅' : 'NON ❌'}`);
      } else {
        console.log('\n❌ Plat Norvegese non trouvé dans le menu d\'Olivia');
      }
      
      // Extraire la structure des menus
      console.log('\n🧩 STRUCTURE DES MENUS:');
      if (olivia['Items Indépendants']) {
        console.log(`Items Indépendants: ${olivia['Items Indépendants'].length} catégories`);
        olivia['Items Indépendants'].forEach(category => {
          console.log(`- ${category.catégorie}: ${category.items ? category.items.length : 0} plats`);
        });
      }
      
      if (olivia['Menus Globaux']) {
        console.log(`Menus Globaux: ${olivia['Menus Globaux'].length} menus`);
      }
      
      // Compter les plats contenant "saumon" dans leur description
      console.log('\n🔍 RECHERCHE DE PLATS AVEC SAUMON:');
      let platsAvecSaumon = [];
      
      if (olivia['Items Indépendants'] && Array.isArray(olivia['Items Indépendants'])) {
        for (const category of olivia['Items Indépendants']) {
          if (category.items && Array.isArray(category.items)) {
            for (const item of category.items) {
              if (item.description && item.description.toLowerCase().includes('saumon')) {
                platsAvecSaumon.push({
                  nom: item.nom,
                  description: item.description,
                  catégorie: category.catégorie
                });
              }
            }
          }
        }
      }
      
      if (platsAvecSaumon.length > 0) {
        console.log(`Trouvé ${platsAvecSaumon.length} plats contenant "saumon":`);
        platsAvecSaumon.forEach(plat => {
          console.log(`- ${plat.nom} (${plat.catégorie}): ${plat.description}`);
        });
      } else {
        console.log('Aucun plat contenant "saumon" trouvé dans les descriptions');
      }
      
      // Vérifier la structure du document pour guider l'implémentation de l'IA
      console.log('\n🔎 ANALYSE DE LA STRUCTURE DU DOCUMENT:');
      console.log('Champs principaux:', Object.keys(olivia).join(', '));
      
      // Rechercher la structure des menus pour comprendre où se trouve l'information
      if (olivia['Items Indépendants'] && olivia['Items Indépendants'].length > 0) {
        const sampleCategory = olivia['Items Indépendants'][0];
        console.log('Structure d\'une catégorie:', Object.keys(sampleCategory).join(', '));
        
        if (sampleCategory.items && sampleCategory.items.length > 0) {
          const sampleItem = sampleCategory.items[0];
          console.log('Structure d\'un item:', Object.keys(sampleItem).join(', '));
        }
      }
    } else {
      console.log('\n❌ Restaurant Olivia non trouvé dans la base de données');
    }
    
    // Rechercher d'autres restaurants qui pourraient avoir du saumon
    console.log('\n🔍 RECHERCHE D\'AUTRES RESTAURANTS AVEC SAUMON:');
    const query = {
      $or: [
        { "Items Indépendants.items.description": { $regex: "saumon", $options: "i" } },
        { "Menus Globaux.inclus.items.description": { $regex: "saumon", $options: "i" } },
        { description: { $regex: "saumon", $options: "i" } }
      ]
    };
    
    const restaurantsAvecSaumon = await collection.find(query).limit(5).toArray();
    
    if (restaurantsAvecSaumon.length > 0) {
      console.log(`Trouvé ${restaurantsAvecSaumon.length} restaurants avec "saumon" dans leurs menus:`);
      restaurantsAvecSaumon.forEach(restaurant => {
        console.log(`- ${restaurant.name} (${restaurant.address || 'Adresse inconnue'})`);
      });
    } else {
      console.log('Aucun autre restaurant avec "saumon" trouvé');
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
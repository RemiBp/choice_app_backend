/**
 * Script pour créer les index géospatiaux manquants dans les collections MongoDB
 * 
 * Ce script analysera les collections spatiales et ajoutera les index 2dsphere manquants
 * pour garantir les fonctionnalités de recherche géographique.
 * 
 * Options:
 * --check-only: Uniquement vérifier les index manquants sans les créer
 */

const { MongoClient } = require('mongodb');
require('dotenv').config();

// Vérifier les arguments de ligne de commande
const args = process.argv.slice(2);
const CHECK_ONLY_MODE = args.includes('--check-only');

// URL MongoDB - Utiliser la variable d'environnement ou la valeur par défaut
const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://remibarbier:Calvi8Pierc2@lieuxrestauration.szq31.mongodb.net/?retryWrites=true&w=majority&appName=lieuxrestauration';

// Bases de données à analyser
const DATABASES_TO_CHECK = [
  'Beauty_Wellness',
  'Loisir&Culture',
  'Restauration_Officielle',
  'Events_Loisirs',
  'ChoiceApp',
  'choice_app'
];

// Définir les collections et leurs champs géospatiaux
const GEO_COLLECTIONS = {
  // Restaurants
  'Restauration_Officielle.producers': 'location',
  'Restauration_Officielle.Restaurants_Paris': 'localisation',
  
  // Loisirs
  'Loisir&Culture.Loisir_Paris_Producers': 'localisation',
  'Loisir&Culture.Loisir_Paris_Evenements': 'localisation',
  
  // Bien-être
  'Beauty_Wellness.BeautyPlaces': 'location',
  'Beauty_Wellness.WellnessPlaces': 'location',
  
  // Événements
  'Events_Loisirs.events': 'location'
};

// Fonction pour créer les index manquants
async function createMissingIndexes() {
  const client = new MongoClient(MONGO_URI);
  
  try {
    await client.connect();
    console.log('✅ Connecté à MongoDB Atlas');
    
    // Statistiques
    let totalIndexesNeeded = 0;
    let totalIndexesCreated = 0;
    let totalCollectionsFixed = 0;
    let errors = [];
    
    // Analyser chaque paire base.collection du mapping
    for (const [dbCollection, geoField] of Object.entries(GEO_COLLECTIONS)) {
      const [dbName, collName] = dbCollection.split('.');
      
      if (!dbName || !collName) {
        console.log(`⚠️ Format incorrect pour ${dbCollection}`);
        continue;
      }
      
      const db = client.db(dbName);
      
      try {
        console.log(`\n🔍 Vérification de la collection ${dbName}.${collName} pour le champ ${geoField}`);
        
        // Vérifier si la collection existe
        const collections = await db.listCollections({ name: collName }).toArray();
        if (collections.length === 0) {
          console.log(`   ⚠️ Collection ${dbName}.${collName} introuvable`);
          continue;
        }
        
        const collection = db.collection(collName);
        
        // Vérifier si l'index existe déjà
        const indexes = await collection.indexes();
        const geoIndexExists = indexes.some(index => 
          index.key[geoField] === '2dsphere' || 
          index.key[`${geoField}.coordinates`] === '2dsphere'
        );
        
        if (geoIndexExists) {
          console.log(`   ✅ Index géospatial déjà existant pour ${geoField}`);
          continue;
        }
        
        totalIndexesNeeded++;
        
        // Vérifier le format des données (examiner le premier document)
        const sampleDocument = await collection.findOne({ [geoField]: { $exists: true } });
        
        if (!sampleDocument) {
          console.log(`   ⚠️ Aucun document avec le champ ${geoField} n'a été trouvé`);
          continue;
        }
        
        // Déterminer le bon chemin pour créer l'index
        let indexPath = geoField;
        if (sampleDocument[geoField] && 
            typeof sampleDocument[geoField] === 'object' && 
            sampleDocument[geoField].coordinates && 
            Array.isArray(sampleDocument[geoField].coordinates)) {
          // Format GeoJSON standard - déjà correct, on indexe le champ entier
        } else if (sampleDocument[geoField] && Array.isArray(sampleDocument[geoField]) && sampleDocument[geoField].length === 2) {
          // Format [lng, lat] - on convertira plus tard
          console.log(`   ⚠️ Format de coordonnées [lng, lat] détecté. Considérez la conversion au format GeoJSON`);
        } else {
          console.log(`   ⚠️ Format géospatial non reconnu pour ${geoField}: ${JSON.stringify(sampleDocument[geoField]).substring(0, 100)}`);
          errors.push(`Format géospatial non reconnu dans ${dbName}.${collName}.${geoField}`);
          continue;
        }
        
        // Créer l'index 2dsphere si nous ne sommes pas en mode check-only
        if (!CHECK_ONLY_MODE) {
          console.log(`   🔧 Création de l'index 2dsphere sur ${indexPath}...`);
          await collection.createIndex({ [indexPath]: "2dsphere" });
          console.log(`   ✅ Index 2dsphere créé avec succès sur ${indexPath}`);
          
          totalIndexesCreated++;
          totalCollectionsFixed++;
        } else {
          console.log(`   🔍 Index 2dsphere manquant sur ${indexPath} (mode vérification uniquement)`);
        }
      } catch (err) {
        console.error(`   ❌ Erreur pour ${dbName}.${collName}: ${err.message}`);
        errors.push(`${dbName}.${collName}: ${err.message}`);
      }
    }
    
    // Rechercher d'autres collections potentiellement géographiques
    console.log('\n🔍 Recherche d\'autres collections potentiellement géographiques...');
    
    // Parcourir toutes les bases de données
    for (const dbName of DATABASES_TO_CHECK) {
      const db = client.db(dbName);
      const collections = await db.listCollections().toArray();
      
      for (const collInfo of collections) {
        const collName = collInfo.name;
        const dbCollection = `${dbName}.${collName}`;
        
        // Ignorer les collections déjà traitées
        if (GEO_COLLECTIONS[dbCollection]) {
          continue;
        }
        
        // Ignorer les collections système
        if (collName.startsWith('system.')) {
          continue;
        }
        
        // Vérifier si c'est une collection géographique en fonction du nom
        if (collName.toLowerCase().includes('place') || 
            collName.toLowerCase().includes('producer') ||
            collName.toLowerCase().includes('event') ||
            collName.toLowerCase().includes('restaurant') ||
            collName.toLowerCase().includes('location')) {
          
          const collection = db.collection(collName);
          
          // Essayer de trouver un champ géospatial
          const geoFields = ['location', 'localisation', 'coordinates', 'position', 'geo'];
          const sampleDocument = await collection.findOne({});
          
          if (!sampleDocument) {
            console.log(`   ⚠️ Collection ${dbName}.${collName} vide, ignorée`);
            continue;
          }
          
          let geoField = null;
          
          for (const field of geoFields) {
            if (sampleDocument[field]) {
              geoField = field;
              break;
            }
          }
          
          if (!geoField) {
            console.log(`   ⚠️ Aucun champ géospatial trouvé dans ${dbName}.${collName}, ignorée`);
            continue;
          }
          
          // Vérifier si l'index existe déjà
          const indexes = await collection.indexes();
          const geoIndexExists = indexes.some(index => 
            index.key[geoField] === '2dsphere' || 
            index.key[`${geoField}.coordinates`] === '2dsphere'
          );
          
          if (geoIndexExists) {
            console.log(`   ✅ Index géospatial déjà existant pour ${dbName}.${collName}.${geoField}`);
            continue;
          }
          
          totalIndexesNeeded++;
          
          // Vérifier le format des données
          const hasGeoJSONFormat = sampleDocument[geoField] && 
                                  typeof sampleDocument[geoField] === 'object' && 
                                  sampleDocument[geoField].coordinates && 
                                  Array.isArray(sampleDocument[geoField].coordinates);
          
          console.log(`   ⚙️ Collection potentiellement géographique: ${dbName}.${collName}, champ: ${geoField}`);
          console.log(`   ⚙️ Format GeoJSON: ${hasGeoJSONFormat ? 'Oui' : 'Non'}`);
          
          // Créer l'index si nous ne sommes pas en mode check-only
          if (!CHECK_ONLY_MODE) {
            try {
              // Créer l'index 2dsphere
              console.log(`   🔧 Création de l'index 2dsphere sur ${geoField}...`);
              await collection.createIndex({ [geoField]: "2dsphere" });
              console.log(`   ✅ Index 2dsphere créé avec succès sur ${geoField}`);
              
              totalIndexesCreated++;
              totalCollectionsFixed++;
            } catch (err) {
              console.error(`   ❌ Erreur lors de la création de l'index pour ${dbName}.${collName}: ${err.message}`);
              errors.push(`${dbName}.${collName}: ${err.message}`);
            }
          } else {
            console.log(`   🔍 Index 2dsphere manquant sur ${geoField} (mode vérification uniquement)`);
          }
        }
      }
    }
    
    // Afficher le résumé
    console.log('\n=================================================');
    console.log('📊 RAPPORT D\'ANALYSE DES INDEX');
    console.log('=================================================');
    console.log(`Total des index géospatiaux requis: ${totalIndexesNeeded}`);
    
    if (!CHECK_ONLY_MODE) {
      console.log(`Total des index géospatiaux créés: ${totalIndexesCreated}`);
      console.log(`Collections corrigées: ${totalCollectionsFixed}`);
    } else {
      console.log(`⚠️ Mode vérification uniquement: aucun index créé.`);
      if (totalIndexesNeeded > 0) {
        console.log(`Pour créer les index manquants, exécutez sans l'option --check-only:`);
        console.log(`$ node scripts/createIndexes.js`);
      }
    }
    
    if (errors.length > 0) {
      console.log('\n⚠️ ERREURS RENCONTRÉES:');
      errors.forEach((err, index) => {
        console.log(`  ${index + 1}. ${err}`);
      });
    }
    
    console.log('\n✅ Opération terminée!');
    
  } catch (err) {
    console.error('❌ Erreur:', err);
  } finally {
    await client.close();
    console.log('\n👋 Connexion MongoDB fermée');
  }
}

// Exécuter le script
const mode = CHECK_ONLY_MODE ? 'vérification uniquement' : 'création d\'index';
console.log(`🚀 Démarrage du script en mode ${mode}...`);
createMissingIndexes(); 
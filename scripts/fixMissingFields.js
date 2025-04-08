/**
 * Script pour ajouter les champs requis manquants dans les collections MongoDB
 * 
 * Ce script analysera les documents de chaque collection et ajoutera les champs
 * requis manquants avec des valeurs par défaut appropriées.
 */

const { MongoClient } = require('mongodb');
require('dotenv').config();

// URL MongoDB - Utiliser la variable d'environnement ou la valeur par défaut
const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://remibarbier:Calvi8Pierc2@lieuxrestauration.szq31.mongodb.net/?retryWrites=true&w=majority&appName=lieuxrestauration';

// Définir les structures attendues pour chaque collection
const EXPECTED_STRUCTURES = {
  // Restaurants
  'Restauration_Officielle.producers': {
    requiredFields: ['name', 'address', 'location', 'category', 'rating', 'price_level'],
    defaultValues: {
      name: 'Restaurant sans nom',
      address: 'Adresse inconnue',
      location: { type: 'Point', coordinates: [2.3522, 48.8566] }, // Paris par défaut
      category: 'Non classé',
      rating: 0,
      price_level: 1
    }
  },
  'Restauration_Officielle.Restaurants_Paris': {
    requiredFields: ['name', 'address', 'localisation', 'category', 'rating', 'price_level'],
    defaultValues: {
      name: 'Restaurant sans nom',
      address: 'Adresse inconnue',
      localisation: { type: 'Point', coordinates: [2.3522, 48.8566] }, // Paris par défaut
      category: 'Non classé',
      rating: 0,
      price_level: 1
    }
  },
  // Loisirs (lieux)
  'Loisir&Culture.Loisir_Paris_Producers': {
    requiredFields: ['lieu', 'adresse', 'localisation', 'catégorie', 'note', 'accessibilité'],
    defaultValues: {
      lieu: 'Lieu sans nom',
      adresse: 'Adresse inconnue',
      localisation: { type: 'Point', coordinates: [2.3522, 48.8566] }, // Paris par défaut
      catégorie: 'Non classé',
      note: 0,
      accessibilité: 'standard'
    }
  },
  // Loisirs (événements)
  'Loisir&Culture.Loisir_Paris_Evenements': {
    requiredFields: ['intitulé', 'lieu', 'adresse', 'localisation', 'catégorie', 'date', 'émotions', 'prix'],
    defaultValues: {
      intitulé: 'Événement sans nom',
      lieu: 'Lieu inconnu',
      adresse: 'Adresse inconnue',
      localisation: { type: 'Point', coordinates: [2.3522, 48.8566] }, // Paris par défaut
      catégorie: 'Non classé',
      date: new Date(),
      émotions: ['divers'],
      prix: '€'
    }
  },
  // Bien-être
  'Beauty_Wellness.BeautyPlaces': {
    requiredFields: ['name', 'address', 'location', 'category', 'rating', 'specialties', 'amenities'],
    defaultValues: {
      name: 'Établissement sans nom',
      address: 'Adresse inconnue',
      location: { type: 'Point', coordinates: [2.3522, 48.8566] }, // Paris par défaut
      category: 'Non classé',
      rating: 0,
      specialties: ['général'],
      amenities: ['standard']
    }
  },
  'Beauty_Wellness.WellnessPlaces': {
    requiredFields: ['name', 'address', 'location', 'category', 'rating', 'service_types'],
    defaultValues: {
      name: 'Établissement sans nom',
      address: 'Adresse inconnue',
      location: { type: 'Point', coordinates: [2.3522, 48.8566] }, // Paris par défaut
      category: 'Non classé',
      rating: 0,
      service_types: ['général']
    }
  }
};

// Fonction pour corriger les champs manquants
async function fixMissingFields() {
  const client = new MongoClient(MONGO_URI);
  
  try {
    await client.connect();
    console.log('✅ Connecté à MongoDB Atlas');
    
    // Statistiques
    let totalDocumentsFixed = 0;
    let totalFieldsAdded = 0;
    let errors = [];
    
    // Traiter chaque paire base.collection du mapping
    for (const [dbCollection, structure] of Object.entries(EXPECTED_STRUCTURES)) {
      const [dbName, collName] = dbCollection.split('.');
      
      if (!dbName || !collName) {
        console.log(`⚠️ Format incorrect pour ${dbCollection}`);
        continue;
      }
      
      const db = client.db(dbName);
      
      try {
        console.log(`\n🔍 Vérification de la collection ${dbName}.${collName}`);
        
        // Vérifier si la collection existe
        const collections = await db.listCollections({ name: collName }).toArray();
        if (collections.length === 0) {
          console.log(`   ⚠️ Collection ${dbName}.${collName} introuvable`);
          continue;
        }
        
        const collection = db.collection(collName);
        
        // Compter les documents dans la collection
        const totalDocuments = await collection.countDocuments();
        console.log(`   📊 Nombre total de documents: ${totalDocuments}`);
        
        if (totalDocuments === 0) {
          console.log(`   ⚠️ Collection vide, aucune correction nécessaire`);
          continue;
        }
        
        // Pour chaque champ requis, trouver les documents où il manque
        for (const field of structure.requiredFields) {
          const query = { [field]: { $exists: false } };
          const missingFieldCount = await collection.countDocuments(query);
          
          if (missingFieldCount === 0) {
            console.log(`   ✅ Tous les documents possèdent le champ "${field}"`);
            continue;
          }
          
          // Valeur par défaut pour ce champ
          const defaultValue = structure.defaultValues[field];
          
          console.log(`   ⚠️ ${missingFieldCount} documents sans le champ "${field}"`);
          console.log(`   🔧 Ajout de la valeur par défaut: ${JSON.stringify(defaultValue)}`);
          
          // Mettre à jour les documents
          const result = await collection.updateMany(
            query,
            { $set: { [field]: defaultValue } }
          );
          
          console.log(`   ✅ ${result.modifiedCount} documents mis à jour avec le champ "${field}"`);
          
          totalDocumentsFixed += result.modifiedCount;
          totalFieldsAdded += result.modifiedCount;
        }
        
      } catch (err) {
        console.error(`   ❌ Erreur pour ${dbName}.${collName}: ${err.message}`);
        errors.push(`${dbName}.${collName}: ${err.message}`);
      }
    }
    
    // Afficher le résumé
    console.log('\n=================================================');
    console.log('📊 RAPPORT DE CORRECTION DE CHAMPS');
    console.log('=================================================');
    console.log(`Total des documents corrigés: ${totalDocumentsFixed}`);
    console.log(`Total des champs ajoutés: ${totalFieldsAdded}`);
    
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
fixMissingFields(); 
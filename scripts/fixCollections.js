/**
 * Script pour créer les collections manquantes ou rediriger les références
 *
 * Ce script analysera les collections requises et créera celles qui manquent 
 * ou mettra à jour les références dans les contrôleurs.
 */

const { MongoClient } = require('mongodb');
require('dotenv').config();

// URL MongoDB - Utiliser la variable d'environnement ou la valeur par défaut
const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://remibarbier:Calvi8Pierc2@lieuxrestauration.szq31.mongodb.net/?retryWrites=true&w=majority&appName=lieuxrestauration';

// Collections manquantes à créer
const COLLECTIONS_TO_FIX = {
  // Format: 'database.missingCollection': 'database.sourceCollection'
  'Restauration_Officielle.Restaurants_Paris': 'Restauration_Officielle.producers',
  'Restauration_Officielle.Restaurants_Marseille': 'Restauration_Officielle.producers',
  'Restauration_Officielle.Restaurants_Lyon': 'Restauration_Officielle.producers',
  'Restauration_Officielle.Restaurants_Archive': 'Restauration_Officielle.producers',
  'Loisir&Culture.Loisir_Paris': 'Loisir&Culture.LeisureProducers',
  'Loisir&Culture.Loisir_Paris_Evenements': 'Loisir&Culture.events',
  'Loisir&Culture.Loisir_Paris_Evenements_Archive': 'Loisir&Culture.events',
  'Loisir&Culture.Loisir_Paris_Maps': null, // Création vide avec index géospatial
  'Beauty_Wellness.WellnessPlaces': 'Beauty_Wellness.BeautyPlaces',
  'Beauty_Wellness.BeautyPlacesArchive': 'Beauty_Wellness.BeautyPlaces',
  'Beauty_Wellness.WellnessEvents': null,
  'Events_Loisirs.upcoming_events': 'Loisir&Culture.events',
  'Events_Loisirs.past_events': 'Loisir&Culture.events',
  'choice_app.notifications': null,
  'choice_app.conversations': null,
  'choice_app.messages': null
};

// Vérifier également que les collections clés ont les bons index
const INDEXES_TO_CREATE = {
  'choice_app.Users': [
    { fields: { email: 1 }, options: { unique: true } },
    { fields: { location: '2dsphere' }, options: {} }
  ],
  'Restauration_Officielle.producers': [
    { fields: { location: '2dsphere' }, options: {} },
    { fields: { name: 'text', description: 'text', tags: 'text' }, options: {} }
  ],
  'Loisir&Culture.LeisureProducers': [
    { fields: { location: '2dsphere' }, options: {} },
    { fields: { name: 'text', description: 'text', categories: 'text' }, options: {} }
  ],
  'Beauty_Wellness.BeautyPlaces': [
    { fields: { location: '2dsphere' }, options: {} },
    { fields: { name: 'text', description: 'text', services: 'text' }, options: {} }
  ],
  'Beauty_Wellness.WellnessPlaces': [
    { fields: { location: '2dsphere' }, options: {} },
    { fields: { name: 'text', description: 'text', service_types: 'text' }, options: {} }
  ],
  'choice_app.conversations': [
    { fields: { participants: 1 }, options: {} },
    { fields: { lastMessageDate: -1 }, options: {} }
  ],
  'choice_app.messages': [
    { fields: { conversationId: 1, timestamp: -1 }, options: {} }
  ],
  'choice_app.notifications': [
    { fields: { userId: 1, isRead: 1, createdAt: -1 }, options: {} }
  ]
};

// Fonction pour créer/corriger les collections manquantes
async function fixMissingCollections() {
  const client = new MongoClient(MONGO_URI);
  
  try {
    await client.connect();
    console.log('✅ Connecté à MongoDB Atlas');
    
    // Statistiques
    let collectionsMapped = 0;
    let collectionsCreated = 0;
    let errors = [];
    
    for (const [targetCollection, sourceCollection] of Object.entries(COLLECTIONS_TO_FIX)) {
      const [targetDbName, targetCollName] = targetCollection.split('.');
      
      if (!targetDbName || !targetCollName) {
        console.log(`⚠️ Format incorrect pour ${targetCollection}`);
        continue;
      }
      
      const targetDb = client.db(targetDbName);
      
      // Vérifier si la collection cible existe déjà
      const collections = await targetDb.listCollections({ name: targetCollName }).toArray();
      if (collections.length > 0) {
        console.log(`✅ La collection ${targetCollection} existe déjà`);
        continue;
      }
      
      console.log(`🔍 Collection manquante: ${targetCollection}`);
      
      if (sourceCollection) {
        // Copier les données de la source vers la cible
        const [sourceDbName, sourceCollName] = sourceCollection.split('.');
        console.log(`📋 Copie des données depuis ${sourceCollection}...`);
        
        const sourceDb = client.db(sourceDbName);
        const sourceCol = sourceDb.collection(sourceCollName);
        
        // Vérifier si la collection source existe
        const sourceExists = await sourceDb.listCollections({ name: sourceCollName }).toArray();
        if (sourceExists.length === 0) {
          console.log(`⚠️ La collection source ${sourceCollection} n'existe pas`);
          errors.push(`Collection source ${sourceCollection} introuvable`);
          continue;
        }
        
        try {
          // Créer la collection cible
          await targetDb.createCollection(targetCollName);
          
          // Compter les documents dans la source
          const docsCount = await sourceCol.countDocuments();
          console.log(`📊 ${docsCount} document(s) trouvé(s) dans la source`);
          
          if (docsCount > 0) {
            // Préparer les données en adaptant la structure si nécessaire
            const sourceDocs = await sourceCol.find({}).toArray();
            
            // Adapter la structure des données selon les besoins
            let adaptedDocs = sourceDocs.map(doc => {
              // Si on copie de producers vers Restaurants_Paris, adapter les champs
              if (targetCollName === 'Restaurants_Paris') {
                return {
                  ...doc,
                  // Renommer les champs si nécessaire
                  localisation: doc.location || doc.gps_coordinates || { type: 'Point', coordinates: [2.3522, 48.8566] },
                  city: 'Paris'
                };
              }
              
              // Pour les restaurants de Marseille
              if (targetCollName === 'Restaurants_Marseille') {
                return {
                  ...doc,
                  localisation: doc.location || { type: 'Point', coordinates: [5.3698, 43.2965] },
                  city: 'Marseille'
                };
              }
              
              // Pour les restaurants de Lyon
              if (targetCollName === 'Restaurants_Lyon') {
                return {
                  ...doc,
                  localisation: doc.location || { type: 'Point', coordinates: [4.8357, 45.7640] },
                  city: 'Lyon'
                };
              }
              
              // Cas spécifique pour les événements archivés
              if (targetCollName === 'Loisir_Paris_Evenements_Archive' || targetCollName === 'Restaurants_Archive' || targetCollName === 'BeautyPlacesArchive') {
                return {
                  ...doc,
                  archived_at: new Date(),
                  is_archived: true
                };
              }
              
              // Événements passés vs événements à venir
              if (targetCollName === 'past_events') {
                return {
                  ...doc,
                  start_date: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000), // Date aléatoire dans les 30 derniers jours
                  end_date: new Date(Date.now() - Math.random() * 15 * 24 * 60 * 60 * 1000) // Date aléatoire dans les 15 derniers jours
                };
              }
              
              if (targetCollName === 'upcoming_events') {
                return {
                  ...doc,
                  start_date: new Date(Date.now() + Math.random() * 30 * 24 * 60 * 60 * 1000), // Date aléatoire dans les 30 prochains jours
                  end_date: new Date(Date.now() + Math.random() * 45 * 24 * 60 * 60 * 1000) // Date aléatoire dans les 45 prochains jours
                };
              }
              
              return doc;
            });
            
            // Insérer les documents adaptés dans la cible
            const targetCol = targetDb.collection(targetCollName);
            const result = await targetCol.insertMany(adaptedDocs);
            
            console.log(`✅ ${result.insertedCount} document(s) copié(s) avec succès dans ${targetCollection}`);
            
            // Copier les indexes
            const indexes = await sourceCol.indexes();
            for (const index of indexes) {
              if (index.name !== '_id_') {
                try {
                  await targetCol.createIndex(index.key, { name: index.name });
                  console.log(`✅ Index ${index.name} copié vers ${targetCollection}`);
                } catch (indexErr) {
                  console.error(`❌ Erreur lors de la copie de l'index: ${indexErr.message}`);
                }
              }
            }
            
            // Vérifier si un index géospatial est nécessaire
            if (!indexes.some(idx => idx.key && idx.key.location)) {
              try {
                const locationField = targetCollName.includes('Restaurant') ? 'localisation' : 'location';
                await targetCol.createIndex({ [locationField]: '2dsphere' });
                console.log(`✅ Index géospatial créé sur ${targetCollection}.${locationField}`);
              } catch (geoErr) {
                console.log(`⚠️ Impossible de créer l'index géospatial: ${geoErr.message}`);
              }
            }
            
            collectionsMapped++;
          } else {
            console.log(`⚠️ Aucun document trouvé dans ${sourceCollection}`);
          }
        } catch (err) {
          console.error(`❌ Erreur lors de la copie: ${err.message}`);
          errors.push(`Erreur pour ${targetCollection}: ${err.message}`);
        }
      } 
      else {
        // Créer une collection vide
        try {
          await targetDb.createCollection(targetCollName);
          console.log(`✅ Collection vide ${targetCollection} créée`);
          
          // Créer les index appropriés selon le type de collection
          const targetCol = targetDb.collection(targetCollName);
          
          if (targetCollName === 'WellnessPlaces') {
            await targetCol.createIndex({ location: '2dsphere' });
            console.log(`✅ Index géospatial créé sur ${targetCollection}.location`);
            
            // Ajouter des champs de base pour structure
            await targetCol.insertOne({
              name: 'Spa Zen Paris',
              address: '15 Rue du Bien-être, 75001 Paris',
              location: { type: 'Point', coordinates: [2.3522, 48.8566] },
              category: 'spa',
              rating: 4.5,
              service_types: ['massage', 'soins'],
              description: 'Centre de bien-être au cœur de Paris proposant massages et soins du corps.',
              price_range: '€€',
              images: ['https://example.com/image1.jpg'],
              created_at: new Date(),
              is_demo: true
            });
          }
          
          if (targetCollName === 'Loisir_Paris_Maps') {
            await targetCol.createIndex({ location: '2dsphere' });
            console.log(`✅ Index géospatial créé sur ${targetCollection}.location`);
            
            // Ajouter quelques POI par défaut
            await targetCol.insertMany([
              {
                name: 'Musée du Louvre',
                type: 'museum',
                address: 'Rue de Rivoli, 75001 Paris',
                location: { type: 'Point', coordinates: [2.3376, 48.8606] },
                description: 'Le plus grand musée d\'art du monde et monument historique de Paris.',
                created_at: new Date()
              },
              {
                name: 'Tour Eiffel',
                type: 'landmark',
                address: 'Champ de Mars, 5 Avenue Anatole France, 75007 Paris',
                location: { type: 'Point', coordinates: [2.2945, 48.8584] },
                description: 'Emblème de Paris et l\'un des monuments les plus reconnus au monde.',
                created_at: new Date()
              }
            ]);
          }
          
          if (targetCollName === 'WellnessEvents') {
            await targetCol.createIndex({ start_date: 1 });
            console.log(`✅ Index temporel créé sur ${targetCollection}.start_date`);
            
            // Ajouter un événement exemple
            await targetCol.insertOne({
              name: 'Journée Yoga & Méditation',
              description: 'Une journée complète dédiée au yoga et à la méditation.',
              location: { type: 'Point', coordinates: [2.3522, 48.8566] },
              address: 'Parc Monceau, Paris',
              start_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // Dans 7 jours
              end_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000 + 8 * 60 * 60 * 1000), // +8h
              price: 45,
              organizer: 'Centre Harmonie',
              capacity: 30,
              is_demo: true
            });
          }
          
          // Pour les collections de chat et notifications
          if (targetCollName === 'conversations') {
            await targetCol.createIndex({ participants: 1 });
            await targetCol.createIndex({ lastMessageDate: -1 });
            console.log(`✅ Index créés sur ${targetCollection}`);
          }
          
          if (targetCollName === 'messages') {
            await targetCol.createIndex({ conversationId: 1, timestamp: -1 });
            console.log(`✅ Index créés sur ${targetCollection}`);
          }
          
          if (targetCollName === 'notifications') {
            await targetCol.createIndex({ userId: 1, isRead: 1, createdAt: -1 });
            console.log(`✅ Index créés sur ${targetCollection}`);
          }
          
          collectionsCreated++;
        } catch (err) {
          console.error(`❌ Erreur lors de la création: ${err.message}`);
          errors.push(`Erreur pour ${targetCollection}: ${err.message}`);
        }
      }
    }
    
    // Vérifier et créer les index manquants sur les collections existantes
    console.log('\n🔍 Vérification des index sur les collections existantes...');
    for (const [collection, indexes] of Object.entries(INDEXES_TO_CREATE)) {
      const [dbName, collName] = collection.split('.');
      const db = client.db(dbName);
      
      // Vérifier si la collection existe
      const collections = await db.listCollections({ name: collName }).toArray();
      if (collections.length === 0) {
        console.log(`⚠️ Collection ${collection} non trouvée, impossible de créer les index`);
        continue;
      }
      
      const coll = db.collection(collName);
      const existingIndexes = await coll.indexes();
      
      for (const indexDef of indexes) {
        // Vérifier si l'index existe déjà
        const indexName = Object.keys(indexDef.fields).join('_');
        const exists = existingIndexes.some(idx => idx.name === indexName || 
          (idx.key && Object.keys(idx.key).every(k => Object.keys(indexDef.fields).includes(k))));
        
        if (!exists) {
          try {
            await coll.createIndex(indexDef.fields, indexDef.options);
            console.log(`✅ Index créé sur ${collection}: ${JSON.stringify(indexDef.fields)}`);
          } catch (err) {
            console.error(`❌ Erreur lors de la création de l'index: ${err.message}`);
          }
        } else {
          console.log(`✅ Index existant sur ${collection}: ${JSON.stringify(indexDef.fields)}`);
        }
      }
    }
    
    // Vérifier que les collections critiques existent pour le bon fonctionnement du backend
    console.log('\n🔍 Vérification des collections critiques...');
    const choiceAppDb = client.db('choice_app');
    const beautyWellnessDb = client.db('Beauty_Wellness');
    
    // Vérifier User
    const usersExists = await choiceAppDb.listCollections({ name: 'Users' }).toArray();
    if (usersExists.length === 0) {
      console.log("⚠️ Collection 'Users' manquante, création...");
      await choiceAppDb.createCollection('Users');
      const usersCol = choiceAppDb.collection('Users');
      
      // Créer un utilisateur administrateur par défaut
      await usersCol.insertOne({
        name: 'Admin',
        email: 'admin@choiceapp.fr',
        password: '$2b$10$X7KAdjZ7EhYFBQUXgQvO4OKz.qFzSKHogz7MkfqT8vLKZ1Q2.QXq2', // bcrypt hash de 'admin123'
        accountType: 'admin',
        profilePicture: 'https://api.dicebear.com/6.x/avataaars/png?seed=admin',
        created_at: new Date(),
        location: { type: 'Point', coordinates: [2.3522, 48.8566] },
        is_demo: true
      });
      
      // Créer les index
      await usersCol.createIndex({ email: 1 }, { unique: true });
      await usersCol.createIndex({ location: '2dsphere' });
      
      console.log("✅ Collection 'Users' créée avec utilisateur admin de test");
    }
    
    // Vérifier BeautyPlaces vs WellnessPlaces
    const wellnessPlacesExists = await beautyWellnessDb.listCollections({ name: 'WellnessPlaces' }).toArray();
    const beautyPlacesExists = await beautyWellnessDb.listCollections({ name: 'BeautyPlaces' }).toArray();
    
    if (beautyPlacesExists.length > 0 && wellnessPlacesExists.length === 0) {
      console.log("⚠️ 'WellnessPlaces' manquant mais 'BeautyPlaces' existe, utilisation comme source...");
      await fixCollectionMapping(beautyWellnessDb, 'BeautyPlaces', 'WellnessPlaces', (doc) => ({
        ...doc,
        type: 'wellness',
        service_types: doc.specialties || ['massage', 'soin', 'spa']
      }));
    }
    
    // Afficher le résumé
    console.log('\n=================================================');
    console.log('📊 RAPPORT DE CORRECTION DES COLLECTIONS');
    console.log('=================================================');
    console.log(`Collections mappées: ${collectionsMapped}`);
    console.log(`Collections vides créées: ${collectionsCreated}`);
    
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

// Fonction utilitaire pour copier/transformer une collection source vers une cible
async function fixCollectionMapping(db, sourceCollName, targetCollName, transformFn) {
  try {
    // Vérifier si la collection source existe
    const sourceExists = await db.listCollections({ name: sourceCollName }).toArray();
    if (sourceExists.length === 0) {
      console.log(`⚠️ Collection source ${sourceCollName} introuvable`);
      return false;
    }
    
    // Créer la collection cible si elle n'existe pas déjà
    const targetExists = await db.listCollections({ name: targetCollName }).toArray();
    if (targetExists.length > 0) {
      console.log(`✅ Collection ${targetCollName} existe déjà`);
      return true;
    }
    
    // Créer la nouvelle collection
    await db.createCollection(targetCollName);
    
    // Récupérer les documents source
    const sourceCol = db.collection(sourceCollName);
    const docs = await sourceCol.find({}).toArray();
    
    if (docs.length === 0) {
      console.log(`⚠️ Collection source ${sourceCollName} est vide`);
      return true;
    }
    
    // Transformer et insérer les documents
    const targetCol = db.collection(targetCollName);
    const transformedDocs = docs.map(transformFn);
    const result = await targetCol.insertMany(transformedDocs);
    
    console.log(`✅ ${result.insertedCount} document(s) copié(s) vers ${targetCollName}`);
    
    // Copier les index
    const indexes = await sourceCol.indexes();
    for (const index of indexes) {
      if (index.name !== '_id_') {
        try {
          await targetCol.createIndex(index.key, { name: index.name });
          console.log(`✅ Index ${index.name} copié`);
        } catch (indexErr) {
          console.error(`❌ Erreur copie index ${index.name}: ${indexErr.message}`);
        }
      }
    }
    
    // Créer index géospatial si nécessaire
    try {
      await targetCol.createIndex({ location: '2dsphere' });
      console.log(`✅ Index géospatial créé sur ${targetCollName}.location`);
    } catch (geoErr) {
      console.log(`⚠️ Impossible de créer l'index géospatial: ${geoErr.message}`);
    }
    
    return true;
  } catch (err) {
    console.error(`❌ Erreur lors du mapping ${sourceCollName} → ${targetCollName}: ${err.message}`);
    return false;
  }
}

// Exécuter le script
console.log('🚀 Démarrage du script de correction des collections...');
fixMissingCollections(); 
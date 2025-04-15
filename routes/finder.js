const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

// Variable pour stocker les connexions aux collections MongoDB
let loisirDb;
let collections = {};
let models = {};

/**
 * Initialisation du router avec la connexion à la base de données
 */
const initialize = (db) => {
  loisirDb = db;
  
  // Vérifier les collections disponibles
  const initializeCollections = async () => {
    try {
      const availableCollections = await loisirDb.db.listCollections().toArray();
      const collectionNames = availableCollections.map(c => c.name);
      console.log('📊 Collections disponibles dans Loisir&Culture:', collectionNames.join(', '));
      
      // Stockage des références aux collections principales
      if (collectionNames.includes('Loisir_Paris_Evenements')) {
        collections.events = loisirDb.collection('Loisir_Paris_Evenements');
      } else if (collectionNames.includes('Evenements_loisirs')) {
        collections.events = loisirDb.collection('Evenements_loisirs');
      }
      
      if (collectionNames.includes('Loisir_Paris_Producers')) {
        collections.producers = loisirDb.collection('Loisir_Paris_Producers');
      } else if (collectionNames.includes('producers')) {
        collections.producers = loisirDb.collection('producers');
      } else if (collectionNames.includes('Paris_Loisirs')) {
        collections.producers = loisirDb.collection('Paris_Loisirs');
      }
      
      // Initialiser les modèles Mongoose
      models.Event = loisirDb.model(
        'Event',
        new mongoose.Schema({}, { strict: false }),
        collections.events ? collections.events.collectionName : 'Loisir_Paris_Evenements'
      );
      
      models.LeisureProducer = loisirDb.model(
        'LeisureProducer',
        new mongoose.Schema({}, { strict: false }),
        collections.producers ? collections.producers.collectionName : 'Loisir_Paris_Producers'
      );
      
      console.log('✅ Finder service initialisé avec succès!');
    } catch (err) {
      console.error('❌ Erreur lors de l\'initialisation du finder service:', err);
    }
  };
  
  // Démarrer l'initialisation
  initializeCollections();
};

/**
 * @route GET /api/finder/:id
 * @desc Rechercher une entité par ID (producteur ou événement)
 * @access Public
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { type } = req.query; // Optionnel: 'event' ou 'producer'
    
    console.log(`🔍 Recherche d'entité avec ID: ${id}, type spécifié: ${type || 'non spécifié'}`);
    
    // Vérifier si l'ID est un ObjectId valide
    const isValidObjectId = mongoose.Types.ObjectId.isValid(id);
    
    // Connexion à la base de données si non initialisée
    if (!loisirDb) {
      loisirDb = mongoose.connection.useDb('Loisir&Culture');
    }
    
    // Initialiser les résultats
    let result = null;
    let entityType = null;
    
    // Si le type est spécifié, rechercher uniquement dans ce type
    if (type === 'event' || type === 'evenement') {
      // Rechercher un événement
      result = await findEvent(id, isValidObjectId);
      entityType = 'event';
    } else if (type === 'producer' || type === 'producteur' || type === 'leisureProducer') {
      // Rechercher un producteur
      result = await findProducer(id, isValidObjectId);
      entityType = 'producer';
    } else {
      // Si aucun type spécifié, chercher dans les deux
      result = await findEvent(id, isValidObjectId);
      
      if (result) {
        entityType = 'event';
      } else {
        result = await findProducer(id, isValidObjectId);
        entityType = result ? 'producer' : null;
      }
    }
    
    // Si aucun résultat trouvé
    if (!result) {
      console.log(`❌ Aucune entité trouvée avec l'ID: ${id}`);
      return res.status(404).json({ message: 'Entité non trouvée' });
    }
    
    // Répondre avec le résultat
    console.log(`✅ Entité trouvée avec ID: ${id}, type: ${entityType}`);
    res.status(200).json({
      type: entityType,
      data: result
    });
  } catch (error) {
    console.error('❌ Erreur lors de la recherche d\'entité:', error);
    res.status(500).json({
      message: 'Erreur lors de la recherche d\'entité',
      error: error.message
    });
  }
});

/**
 * Fonction pour rechercher un événement par ID
 */
async function findEvent(id, isValidObjectId) {
  console.log(`🔍 Recherche d'un événement avec ID: ${id}`);
  
  // Stratégies de recherche en cascade
  let event = null;
  
  // 1. Utiliser le modèle Mongoose si disponible
  if (models.Event) {
    try {
      event = await models.Event.findById(id);
      
      if (!event) {
        event = await models.Event.findOne({
          $or: [
            { _id: id },
            { id: id },
            { eventId: id }
          ]
        });
      }
      
      if (event) {
        console.log(`✅ Événement trouvé via modèle Mongoose`);
        return event;
      }
    } catch (err) {
      console.log(`⚠️ Erreur lors de la recherche via Mongoose:`, err.message);
    }
  }
  
  // 2. Accès direct à la collection
  if (collections.events) {
    try {
      // Recherche avec _id comme string
      event = await collections.events.findOne({ _id: id });
      
      // Recherche avec _id comme ObjectId
      if (!event && isValidObjectId) {
        try {
          event = await collections.events.findOne({ _id: new mongoose.Types.ObjectId(id) });
        } catch (e) {
          console.log(`⚠️ Erreur ObjectId:`, e.message);
        }
      }
      
      // Recherche avec des champs d'ID alternatifs
      if (!event) {
        event = await collections.events.findOne({
          $or: [
            { id: id },
            { eventId: id }
          ]
        });
      }
      
      if (event) {
        console.log(`✅ Événement trouvé via accès direct à la collection`);
        return event;
      }
    } catch (err) {
      console.log(`⚠️ Erreur lors de la recherche via collection:`, err.message);
    }
  }
  
  // 3. Recherche dans toutes les collections d'événements possibles
  const eventCollections = ['Loisir_Paris_Evenements', 'Evenements_loisirs'];
  
  for (const collName of eventCollections) {
    if (collections.events && collections.events.collectionName === collName) {
      continue; // Déjà vérifié
    }
    
    try {
      const collection = loisirDb.collection(collName);
      
      // Recherche avec _id comme string
      event = await collection.findOne({ _id: id });
      
      // Recherche avec _id comme ObjectId
      if (!event && isValidObjectId) {
        try {
          event = await collection.findOne({ _id: new mongoose.Types.ObjectId(id) });
        } catch (e) {
          console.log(`⚠️ Erreur ObjectId dans ${collName}:`, e.message);
        }
      }
      
      if (event) {
        console.log(`✅ Événement trouvé dans la collection ${collName}`);
        return event;
      }
    } catch (err) {
      console.log(`⚠️ Erreur lors de la recherche dans ${collName}:`, err.message);
    }
  }
  
  console.log(`❌ Aucun événement trouvé avec l'ID: ${id}`);
  return null;
}

/**
 * Fonction pour rechercher un producteur par ID
 */
async function findProducer(id, isValidObjectId) {
  console.log(`🔍 Recherche d'un producteur avec ID: ${id}`);
  
  // Stratégies de recherche en cascade
  let producer = null;
  
  // 1. Utiliser le modèle Mongoose si disponible
  if (models.LeisureProducer) {
    try {
      producer = await models.LeisureProducer.findById(id);
      
      if (!producer) {
        producer = await models.LeisureProducer.findOne({
          $or: [
            { _id: id },
            { id: id },
            { producerId: id },
            { producer_id: id }
          ]
        });
      }
      
      if (producer) {
        console.log(`✅ Producteur trouvé via modèle Mongoose`);
        return producer;
      }
    } catch (err) {
      console.log(`⚠️ Erreur lors de la recherche via Mongoose:`, err.message);
    }
  }
  
  // 2. Accès direct à la collection
  if (collections.producers) {
    try {
      // Recherche avec _id comme string
      producer = await collections.producers.findOne({ _id: id });
      
      // Recherche avec _id comme ObjectId
      if (!producer && isValidObjectId) {
        try {
          producer = await collections.producers.findOne({ _id: new mongoose.Types.ObjectId(id) });
        } catch (e) {
          console.log(`⚠️ Erreur ObjectId:`, e.message);
        }
      }
      
      // Recherche avec des champs d'ID alternatifs
      if (!producer) {
        producer = await collections.producers.findOne({
          $or: [
            { id: id },
            { producerId: id },
            { producer_id: id }
          ]
        });
      }
      
      if (producer) {
        console.log(`✅ Producteur trouvé via accès direct à la collection`);
        return producer;
      }
    } catch (err) {
      console.log(`⚠️ Erreur lors de la recherche via collection:`, err.message);
    }
  }
  
  // 3. Recherche dans toutes les collections de producteurs possibles
  const producerCollections = ['Loisir_Paris_Producers', 'producers', 'Paris_Loisirs'];
  
  for (const collName of producerCollections) {
    if (collections.producers && collections.producers.collectionName === collName) {
      continue; // Déjà vérifié
    }
    
    try {
      const collection = loisirDb.collection(collName);
      
      // Recherche avec _id comme string
      producer = await collection.findOne({ _id: id });
      
      // Recherche avec _id comme ObjectId
      if (!producer && isValidObjectId) {
        try {
          producer = await collection.findOne({ _id: new mongoose.Types.ObjectId(id) });
        } catch (e) {
          console.log(`⚠️ Erreur ObjectId dans ${collName}:`, e.message);
        }
      }
      
      if (producer) {
        console.log(`✅ Producteur trouvé dans la collection ${collName}`);
        return producer;
      }
    } catch (err) {
      console.log(`⚠️ Erreur lors de la recherche dans ${collName}:`, err.message);
    }
  }
  
  console.log(`❌ Aucun producteur trouvé avec l'ID: ${id}`);
  return null;
}

// Exporter le routeur et la fonction d'initialisation
router.initialize = initialize;
module.exports = router; 
// AISERVICE FIXES - COPIER CES FONCTIONS DANS aiDataService.js

// 1. CORRECTION DE LA FONCTION sanitizeMongoQuery
// Remplacer la fonction existante par celle-ci

/**
 * Nettoie une requête MongoDB pour éviter les problèmes de format d'ObjectId
 * @param {Object} query - La requête MongoDB originale
 * @param {string} collection - Le nom de la collection (pour des traitements spécifiques)
 * @returns {Object} - La requête nettoyée
 */
function sanitizeMongoQuery(query, collection) {
  // Vérifier si la requête est valide avant de la traiter
  if (!query || typeof query !== 'object') {
    console.warn('⚠️ Requête MongoDB invalide:', query);
    return {};
  }
  
  // Copie profonde de la requête pour éviter de modifier l'originale
  let sanitized;
  try {
    sanitized = JSON.parse(JSON.stringify(query));
  } catch (error) {
    console.error('❌ Erreur lors de la copie de la requête MongoDB:', error);
    return {};
  }
  
  // Traitement spécial pour les _id
  if (sanitized._id) {
    if (typeof sanitized._id === 'object' && sanitized._id.$eq && sanitized._id.$eq.$oid) {
      // Forme problématique: { _id: { $eq: { $oid: "..." } } }
      sanitized._id = sanitized._id.$eq.$oid;
    } else if (typeof sanitized._id === 'object' && sanitized._id.$eq) {
      // Forme: { _id: { $eq: "..." } }
      sanitized._id = sanitized._id.$eq;
    } else if (typeof sanitized._id === 'object' && sanitized._id.$oid) {
      // Forme: { _id: { $oid: "..." } }
      sanitized._id = sanitized._id.$oid;
    }
    
    // S'assurer que l'_id est une chaîne propre
    if (typeof sanitized._id === 'string') {
      sanitized._id = sanitized._id.replace(/[{}"'$]/g, '').replace(/oid:/i, '').trim();
    }
  }
  
  // NOUVELLE FONCTION: Convertir tous les objets $oid en strings
  sanitized = convertObjectIds(sanitized);
  
  // Traitement spécial pour les dates
  sanitized = convertDates(sanitized);
  
  return sanitized;
}

// 2. AJOUTER CES NOUVELLES FONCTIONS UTILITAIRES

/**
 * Convertit tous les objets $oid en strings simples
 * @param {Object} obj - L'objet à traiter
 * @returns {Object} - L'objet avec ObjectIds convertis
 */
function convertObjectIds(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  
  // Si c'est un tableau, convertir chaque élément
  if (Array.isArray(obj)) {
    return obj.map(item => convertObjectIds(item));
  }
  
  const result = {};
  
  for (const key in obj) {
    if (obj.hasOwnProperty(key)) {
      const val = obj[key];
      
      // Cas spécial: objet avec $oid
      if (val && typeof val === 'object' && val.$oid) {
        result[key] = val.$oid;
      } 
      // Cas récursif pour les objets
      else if (val && typeof val === 'object') {
        result[key] = convertObjectIds(val);
      } 
      // Cas simple: valeur non-objet
      else {
        result[key] = val;
      }
    }
  }
  
  return result;
}

/**
 * Convertit les formats de date complexes en dates JavaScript
 * @param {Object} obj - L'objet à traiter
 * @returns {Object} - L'objet avec dates converties
 */
function convertDates(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  
  // Si c'est un tableau, convertir chaque élément
  if (Array.isArray(obj)) {
    return obj.map(item => convertDates(item));
  }
  
  const result = {};
  
  for (const key in obj) {
    if (obj.hasOwnProperty(key)) {
      const val = obj[key];
      
      // Cas spécial: champ date_debut
      if (key === 'date_debut' && val && typeof val === 'object') {
        // Format { $date: "2023-01-01" }
        if (val.$date) {
          result[key] = new Date(val.$date);
        } 
        // Format { $gte: { $date: "2023-01-01" }, $lt: { $date: "2023-01-02" } }
        else if (val.$gte && val.$gte.$date) {
          result[key] = {
            $gte: new Date(val.$gte.$date)
          };
          
          if (val.$lt && val.$lt.$date) {
            result[key].$lt = new Date(val.$lt.$date);
          }
        }
        // Format { $gte: "2023-01-01", $lt: "2023-01-02" }
        else if (val.$gte) {
          result[key] = {
            $gte: new Date(val.$gte)
          };
          
          if (val.$lt) {
            result[key].$lt = new Date(val.$lt);
          }
        }
        else {
          result[key] = convertDates(val);
        }
      } 
      // Cas récursif pour les objets
      else if (val && typeof val === 'object') {
        result[key] = convertDates(val);
      } 
      // Cas simple: valeur non-objet
      else {
        result[key] = val;
      }
    }
  }
  
  return result;
}

// 3. IMPLEMENTER LES OPERATIONS MANQUANTES

/**
 * Applique une opération de fusion (merge) sur les résultats
 * @param {Object} results - Les résultats à fusionner
 * @param {Object} operation - Les paramètres de l'opération
 * @returns {Object} - Les résultats fusionnés
 */
function applyMergeOperation(results, operation) {
  console.log("📊 Exécution de l'opération de fusion");
  
  // Si nous n'avons pas de résultats, retourner tels quels
  if (!results || !results.results) {
    console.log("⚠️ Aucun résultat à fusionner");
    return results;
  }
  
  try {
    // Extraire tous les résultats dans un seul tableau
    const allResults = [];
    
    // Parcourir chaque collection de résultats
    Object.keys(results.results).forEach(collection => {
      if (Array.isArray(results.results[collection])) {
        // Ajouter le type à chaque résultat
        const typedResults = results.results[collection].map(item => ({
          ...item,
          sourceCollection: collection
        }));
        
        allResults.push(...typedResults);
      }
    });
    
    // Enrichir les résultats avec des informations additionnelles
    const enrichedResults = allResults.map(result => {
      // Cas spécifique: lier les producteurs aux événements
      if (result.sourceCollection === 'Event' && result.producer_id) {
        const producer = allResults.find(r => 
          (r.sourceCollection === 'Producer' || r.sourceCollection === 'LeisureProducer') && 
          r._id && r._id.toString() === result.producer_id.toString()
        );
        
        if (producer) {
          result.producerName = producer.name || producer.nom;
          result.producerRating = producer.rating;
        }
      }
      
      return result;
    });
    
    // Mettre à jour les résultats
    const resultsCopy = { ...results };
    resultsCopy.mergedResults = enrichedResults;
    
    console.log("📊 Fusion terminée:", enrichedResults.length, "éléments fusionnés");
    return resultsCopy;
    
  } catch (error) {
    console.error("❌ Erreur lors de la fusion:", error);
    return results;
  }
}

/**
 * Applique une opération d'analyse sur les résultats
 * @param {Object} results - Les résultats à analyser
 * @param {Object} operation - Les paramètres de l'opération
 * @returns {Object} - Les résultats avec analyses
 */
function applyAnalyzeOperation(results, operation) {
  console.log("📊 Exécution de l'opération d'analyse");
  
  // Si nous n'avons pas de résultats, retourner tels quels
  if (!results || !results.results) {
    console.log("⚠️ Aucun résultat à analyser");
    return results;
  }
  
  try {
    // Créer une copie des résultats
    const resultsCopy = { ...results };
    
    // Initialiser l'objet d'analyse
    resultsCopy.analysis = {};
    
    // Analyser chaque collection
    Object.keys(resultsCopy.results).forEach(collection => {
      if (Array.isArray(resultsCopy.results[collection])) {
        // Calculer des statistiques de base
        const items = resultsCopy.results[collection];
        
        // Compter par type ou catégorie
        const categoryCounts = {};
        items.forEach(item => {
          const category = Array.isArray(item.category) 
            ? item.category[0] 
            : (typeof item.category === 'string' ? item.category : 'unknown');
            
          categoryCounts[category] = (categoryCounts[category] || 0) + 1;
        });
        
        // Calculer la note moyenne
        const ratings = items
          .map(item => item.rating)
          .filter(rating => rating !== undefined && rating !== null);
          
        const avgRating = ratings.length > 0
          ? ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length
          : 0;
        
        // Stocker les résultats d'analyse
        resultsCopy.analysis[collection] = {
          count: items.length,
          categoryBreakdown: categoryCounts,
          averageRating: avgRating,
          // Ajouter d'autres statistiques selon les besoins
        };
      }
    });
    
    console.log("📊 Analyse terminée avec", Object.keys(resultsCopy.analysis).length, "collections analysées");
    return resultsCopy;
    
  } catch (error) {
    console.error("❌ Erreur lors de l'analyse:", error);
    return results;
  }
}

// 4. GUIDE D'IMPLÉMENTATION

/* 
COMMENT IMPLÉMENTER CES CORRECTIONS:

1. Remplacez la fonction sanitizeMongoQuery existante par la nouvelle version
2. Ajoutez les nouvelles fonctions convertObjectIds et convertDates
3. Remplacez les fonctions applyMergeOperation et applyAnalyzeOperation

Ces corrections résoudront:
- Les erreurs "Can't use $oid" lors des requêtes MongoDB
- Les erreurs avec les formats de date pour les recherches d'événements
- Les erreurs "Opération inconnue: merge" et "Opération inconnue: analyze"

TESTS AVEC POSTMAN:

Test 1: Recherche de restaurants par plat et localisation
POST https://api.choiceapp.fr/api/ai/user/query
{
  "userId": "67deb5f13de6d0adf9ee76c3",
  "query": "donne moi un restaurant à Meudon ou manger du saumon"
}

Test 2: Recherche d'événements avec dates
POST https://api.choiceapp.fr/api/ai/user/query
{
  "userId": "67deb5f13de6d0adf9ee76c3",
  "query": "donne moi une pièce de théâtre sympa à voir ce soir"
}

Test 3: Cartographie sensorielle avec opérations merge/analyze
POST https://api.choiceapp.fr/api/ai/vibe-map
{
  "userId": "67deb5f13de6d0adf9ee76c3",
  "vibe": "Romantique et intime",
  "location": "Paris"
}
*/
# Guide d'implémentation et correction de Choice App

Ce guide complet résume toutes les améliorations apportées à l'application Choice et fournit des instructions étape par étape pour les implémenter.

## 1. Corrections du Backend

### 1.1 Problèmes identifiés dans aiDataService.js

1. **Erreurs JSON avec valeurs undefined/null**
   - Problème: `SyntaxError: "undefined" is not valid JSON` lors du traitement des requêtes
   - Impact: Les recherches de restaurants échouent, notamment avec des requêtes de type ingrédient/plat

2. **Format de date incompatible avec MongoDB**
   - Problème: Les dates pour les événements ne sont pas correctement formatées
   - Impact: Les recherches d'événements (comme "pièce de théâtre ce soir") retournent 0 résultat

3. **Opérations "merge" et "analyze" non implémentées**
   - Problème: Erreurs `⚠️ Opération inconnue: merge` et `⚠️ Opération inconnue: analyze`
   - Impact: La cartographie sensorielle (vibe map) ne fonctionne pas correctement

4. **Problème avec ObjectId dans les requêtes MongoDB**
   - Problème: Erreur `Can't use $oid` lors des requêtes utilisant des références d'objets
   - Impact: Les recherches impliquant des références entre collections échouent

### 1.2 Implémentation des corrections

Vous avez deux options pour implémenter les corrections backend:

#### Option A: Copier les fonctions du fichier aiDataService_fixes.js

Le fichier `aiDataService_fixes.js` contient toutes les fonctions corrigées. Vous pouvez:
1. Ouvrir ce fichier et copier son contenu
2. Ouvrir `services/aiDataService.js`
3. Remplacer les implémentations existantes des fonctions suivantes:
   - `sanitizeMongoQuery`
   - `applyMergeOperation`
   - `applyAnalyzeOperation`
4. Ajouter les nouvelles fonctions `convertObjectIds` et `convertDates`

#### Option B: Édition manuelle

Pour une approche plus précise, modifiez `services/aiDataService.js` comme suit:

1. **Améliorer sanitizeMongoQuery**:
```javascript
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
      sanitized._id = sanitized._id.$eq.$oid;
    } else if (typeof sanitized._id === 'object' && sanitized._id.$eq) {
      sanitized._id = sanitized._id.$eq;
    } else if (typeof sanitized._id === 'object' && sanitized._id.$oid) {
      sanitized._id = sanitized._id.$oid;
    }
    
    // S'assurer que l'_id est une chaîne propre
    if (typeof sanitized._id === 'string') {
      sanitized._id = sanitized._id.replace(/[{}"'$]/g, '').replace(/oid:/i, '').trim();
    }
  }
  
  // Convertir tous les objets $oid en strings
  sanitized = convertObjectIds(sanitized);
  
  // Traitement spécial pour les dates
  sanitized = convertDates(sanitized);
  
  return sanitized;
}
```

2. **Ajouter les fonctions de conversion**:
```javascript
// Fonction pour convertir les ObjectId
function convertObjectIds(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  
  if (Array.isArray(obj)) {
    return obj.map(item => convertObjectIds(item));
  }
  
  const result = {};
  
  for (const key in obj) {
    if (obj.hasOwnProperty(key)) {
      const val = obj[key];
      
      if (val && typeof val === 'object' && val.$oid) {
        result[key] = val.$oid;
      } else if (val && typeof val === 'object') {
        result[key] = convertObjectIds(val);
      } else {
        result[key] = val;
      }
    }
  }
  
  return result;
}

// Fonction pour convertir les dates
function convertDates(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  
  if (Array.isArray(obj)) {
    return obj.map(item => convertDates(item));
  }
  
  const result = {};
  
  for (const key in obj) {
    if (obj.hasOwnProperty(key)) {
      const val = obj[key];
      
      if (key === 'date_debut' && val && typeof val === 'object') {
        if (val.$date) {
          result[key] = new Date(val.$date);
        } else if (val.$gte && val.$gte.$date) {
          result[key] = {
            $gte: new Date(val.$gte.$date)
          };
          
          if (val.$lt && val.$lt.$date) {
            result[key].$lt = new Date(val.$lt.$date);
          }
        } else if (val.$gte) {
          result[key] = {
            $gte: new Date(val.$gte)
          };
          
          if (val.$lt) {
            result[key].$lt = new Date(val.$lt);
          }
        } else {
          result[key] = convertDates(val);
        }
      } else if (val && typeof val === 'object') {
        result[key] = convertDates(val);
      } else {
        result[key] = val;
      }
    }
  }
  
  return result;
}
```

3. **Implémenter applyMergeOperation**:
```javascript
function applyMergeOperation(results, operation) {
  console.log("📊 Exécution de l'opération de fusion");
  
  if (!results || !results.results) {
    console.log("⚠️ Aucun résultat à fusionner");
    return results;
  }
  
  try {
    // Extraire tous les résultats dans un seul tableau
    const allResults = [];
    
    Object.keys(results.results).forEach(collection => {
      if (Array.isArray(results.results[collection])) {
        const typedResults = results.results[collection].map(item => ({
          ...item,
          sourceCollection: collection
        }));
        
        allResults.push(...typedResults);
      }
    });
    
    // Enrichir les résultats
    const enrichedResults = allResults.map(result => {
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
    
    const resultsCopy = { ...results };
    resultsCopy.mergedResults = enrichedResults;
    
    console.log("📊 Fusion terminée:", enrichedResults.length, "éléments fusionnés");
    return resultsCopy;
    
  } catch (error) {
    console.error("❌ Erreur lors de la fusion:", error);
    return results;
  }
}
```

4. **Implémenter applyAnalyzeOperation**:
```javascript
function applyAnalyzeOperation(results, operation) {
  console.log("📊 Exécution de l'opération d'analyse");
  
  if (!results || !results.results) {
    console.log("⚠️ Aucun résultat à analyser");
    return results;
  }
  
  try {
    const resultsCopy = { ...results };
    resultsCopy.analysis = {};
    
    Object.keys(resultsCopy.results).forEach(collection => {
      if (Array.isArray(resultsCopy.results[collection])) {
        const items = resultsCopy.results[collection];
        
        // Compter par catégorie
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
        
        resultsCopy.analysis[collection] = {
          count: items.length,
          categoryBreakdown: categoryCounts,
          averageRating: avgRating
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
```

## 2. Correction des animations Flutter

Voir le fichier `flutter_animation_fix.md` pour les instructions détaillées sur la correction des problèmes d'animation dans le frontend.

En résumé, vous avez trois options:

1. **Installer correctement le package flutter_animate**:
   ```powershell
   cd C:\Users\remib\Choice\new_project
   flutter clean
   Remove-Item -Force -Recurse .dart_tool
   flutter pub get
   ```

2. **Utiliser notre version de remplacement**: Copier le contenu de `copilot_screen_replacement.dart` dans `copilot_screen.dart`

3. **Convertir manuellement les animations problématiques** en utilisant les widgets d'animation standard de Flutter (voir `flutter_animation_fix.md` pour des exemples)

## 3. Tests et vérification

### 3.1 Tests Postman pour vérifier les corrections

#### Test 1: Recherche de restaurant avec filtrage d'ingrédients
```
POST https://api.choiceapp.fr/api/ai/user/query
Content-Type: application/json

{
  "userId": "67deb5f13de6d0adf9ee76c3",
  "query": "donne moi un restau sympa vers Meudon ou manger des frites"
}
```
**Résultat attendu**: Réponse 200 OK avec des restaurants, sans erreur `undefined is not valid JSON`

#### Test 2: Recherche d'événements avec filtrage par date
```
POST https://api.choiceapp.fr/api/ai/user/query
Content-Type: application/json

{
  "userId": "67deb5f13de6d0adf9ee76c3",
  "query": "donne moi une pièce de théâtre sympa à voir ce soir"
}
```
**Résultat attendu**: Réponse 200 OK avec des événements de théâtre pour aujourd'hui

#### Test 3: Cartographie sensorielle (test des opérations merge/analyze)
```
POST https://api.choiceapp.fr/api/ai/vibe-map
Content-Type: application/json

{
  "userId": "67deb5f13de6d0adf9ee76c3",
  "vibe": "Romantique et intime",
  "location": "Paris"
}
```
**Résultat attendu**: Réponse 200 OK sans erreurs "Opération inconnue", et incluant les données de cartographie sensorielle dans le format:
```json
{
    "success": true,
    "vibe": "Romantique et intime",
    "location": "Paris",
    "response": "...",
    "profiles": [...],
    "resultCount": X,
    "executionTimeMs": Y,
    "vibeData": {
        "intensity": {
            "warmth": 0.5,
            "energy": 0.5,
            "intimacy": 0.9,
            "novelty": 0.5
        },
        "keywords": [...],
        "relatedVibes": [...],
        "colorScheme": [...]
    }
}
```

### 3.2 Tests Frontend

Pour vérifier que les corrections d'animation fonctionnent:

1. Lancez l'application Flutter:
   ```powershell
   cd C:\Users\remib\Choice\new_project
   flutter run
   ```

2. Vérifiez que les animations suivantes fonctionnent correctement:
   - Animations des cartes dans l'écran Copilot
   - Animation du bouton d'envoi
   - Animations des suggestions
   - Animation du message de bienvenue

## 4. Améliorations futures recommandées

Pour améliorer davantage les performances et la robustesse de l'AI:

1. **Amélioration de la recherche par ingrédient**:
   - Implémenter une indexation des plats et ingrédients
   - Ajouter un système de synonymes pour les ingrédients (ex: "saumon" = "salmon")

2. **Gestion plus robuste des dates**:
   - Ajouter un parser de date français plus puissant
   - Gérer les expressions relatives comme "ce soir", "demain"

3. **Amélioration de la localisation**:
   - Implémenter une recherche géospatiale avec la syntaxe $near
   - Ajouter un système de geocoding pour transformer des adresses en coordonnées

4. **Logging et monitoring**:
   - Ajouter un système de logging plus détaillé pour identifier les requêtes problématiques
   - Implémenter des métriques de performance pour suivre les temps de réponse

## 5. Points d'attention

- **Date de mise à jour**: Ces corrections ont été implémentées le 22/03/2025
- **Tester après déploiement**: Exécutez les tests Postman après chaque déploiement
- **Surveiller les logs**: Vérifiez régulièrement les logs pour détecter d'éventuelles nouvelles erreurs

Ces améliorations devraient résoudre tous les problèmes identifiés et améliorer significativement les performances de l'IA dans l'application Choice.
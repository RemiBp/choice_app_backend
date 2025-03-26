# Pipeline Hybride de Remplacement Google Places API 🍽️

Ce projet implémente un pipeline hybride et gratuit pour remplacer Google Places API dans la collecte de données de restaurants parisiens. Il combine plusieurs sources de données et techniques d'extraction pour obtenir des informations complètes et structurées.

## 🌟 Caractéristiques

- **Gratuit en Phase 1** : Utilise OpenStreetMap et techniques d'extraction sans API
- **Pipeline Hybride** : Combine plusieurs sources pour des données complètes
- **Gestion Intelligente des Ressources** : Nettoyage automatique des fichiers temporaires
- **Compatible MongoDB** : Structure de données identique à l'ancien système
- **Mode Debug** : Statistiques détaillées de performance pour optimisation
- **Traitement par Lots** : Possibilité de traiter les restaurants par tranches

## 🔄 Pipeline en 5 Étapes

1. **Étape 1 - Liste des Restaurants (OpenStreetMap)**
   - Utilisation d'Overpass Turbo API (gratuit)
   - Découpage de Paris en grille pour optimisation
   - Filtrage intelligent des restaurants valides

2. **Étape 2 - Extraction Google Maps**
   - Screenshots automatisés avec gestion des sessions Chrome
   - OCR optimisé pour le français (Tesseract)
   - Analyse GPT pour structuration des données

3. **Étape 3 - Recherche Intelligente (Bing)**
   - Identification des liens TheFork/TripAdvisor
   - Gestion efficace des sessions de navigation

4. **Étape 4 - Scraping des Plateformes**
   - Support BrightData pour contourner l'anti-bot
   - Extraction enrichie (horaires, photos, avis)
   - Fusion intelligente des données

5. **Étape 5 - Sauvegarde MongoDB**
   - Format compatible avec l'existant
   - Gestion des doublons via upsert
   - Vérification préalable d'existence

## 🛠️ Prérequis

- Python 3.8+
- Chrome installé
- Tesseract OCR
- Clé API OpenAI
- MongoDB
- BrightData (optionnel)

## 📦 Installation

```bash
# Installation des dépendances Python
pip install selenium webdriver-manager pytesseract pillow beautifulsoup4 openai pymongo requests

# Installation de Tesseract OCR
## Linux
sudo apt-get install tesseract-ocr tesseract-ocr-fra

## Windows
# Télécharger depuis https://github.com/UB-Mannheim/tesseract/wiki
# Ajouter à PATH

## Mac
brew install tesseract tesseract-lang
```

## ⚙️ Configuration

1. Configurer les variables d'environnement ou modifier directement dans le script :
   ```python
   OPENAI_API_KEY = "votre_clé_api"
   BRIGHTDATA_TOKEN = "votre_token"  # Optionnel
   MONGO_URI = "votre_uri_mongodb"
   ```

2. Vérifier la configuration MongoDB :
   ```python
   DB_NAME = "Restauration_Officielle"
   COLLECTION_NAME = "producers"
   ```

## 🚀 Utilisation

### Mode Test
```bash
# Test sur un seul restaurant
python pipeline_complet_fixed.py --test

# Test avec debug activé
python pipeline_complet_fixed.py --test --debug
```

### Traitement par Lots
```bash
# Traiter 100 restaurants à partir de l'index 0
python pipeline_complet_fixed.py --start 0 --limit 100

# Traiter une petite zone avec debug
python pipeline_complet_fixed.py --small-area --debug

# Forcer le retraitement des restaurants existants
python pipeline_complet_fixed.py --force
```

### Options Disponibles
```
--test            Mode test (un seul restaurant)
--start N         Index de départ
--limit N         Nombre de restaurants à traiter
--threads N       Nombre de threads (défaut: 4)
--skip-existing   Ignorer les restaurants en base (défaut: True)
--force           Forcer le retraitement
--small-area      Utiliser une zone de test
--brightdata      Activer BrightData
--debug           Mode debug avec statistiques
```

## 📊 Mode Debug

Le mode debug (`--debug`) fournit des statistiques détaillées :

```
📊 STATISTIQUES DE PERFORMANCE:
================================================================================
FONCTION                                | APPELS  | MOYENNE (s)  | MIN (s)    | MAX (s)    
--------------------------------------------------------------------------------
process_restaurant_with_maps_screenshots| 10      | 12.54        | 10.23      | 15.67      
extract_with_brightdata                 | 8       | 4.73         | 3.12       | 5.92       
search_google_maps                      | 10      | 5.42         | 3.27       | 8.65       
...
```

## 🔍 Structure des Données

La structure des données suit le format de l'ancien système :

```python
{
    "name": str,
    "place_id": str,  # URL Google Maps
    "address": str,
    "phone_number": str,
    "rating": float,
    "user_ratings_total": int,
    "gps_coordinates": {
        "lat": float,
        "lng": float
    },
    "category": list,
    "opening_hours": dict,
    "website": str,
    "price_level": str,
    "popular_times": dict,
    "service_options": dict,
    "photos": list,
    "reviews": list,
    "platform_links": {
        "thefork": str,
        "tripadvisor": str
    }
}
```

## 🔧 Dépannage

### Erreurs Communes

1. **Erreur Chrome :**
   ```
   Message: session not created: probably user data directory is already in use
   ```
   ➡️ Le script nettoie automatiquement les sessions. Relancez si persistant.

2. **Erreur OCR :**
   ```
   OCR erreur : ...
   ```
   ➡️ Vérifiez l'installation de Tesseract et le pack français.

3. **Erreur MongoDB :**
   ```
   Erreur MongoDB: ...
   ```
   ➡️ Vérifiez la connexion et les permissions.

### Optimisation

- Ajustez `NUM_THREADS` selon vos ressources
- Utilisez `--small-area` pour les tests
- Activez `--debug` pour identifier les goulots d'étranglement

## 📈 Performances

- **Temps moyen par restaurant** : 30-45 secondes
- **Taux de succès** : ~80% avec BrightData
- **Utilisation mémoire** : ~200MB par thread

## 🔐 Sécurité

- Nettoyage automatique des fichiers temporaires
- Gestion sécurisée des sessions Chrome
- Pas de stockage de données sensibles

## 🤝 Contribution

Les contributions sont bienvenues ! Assurez-vous de :
1. Tester vos modifications
2. Maintenir la compatibilité MongoDB
3. Documenter les changements

## 📝 Notes

- Le script crée des répertoires temporaires uniques pour chaque session Chrome
- Les screenshots sont automatiquement nettoyés
- Les statistiques de performance sont disponibles en mode debug
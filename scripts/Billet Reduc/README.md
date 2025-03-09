# BilletReduc - Script Combiné

Ce script automatisé combine les fonctionnalités de trois scripts précédents pour collecter, enrichir et analyser les données d'événements culturels depuis BilletReduc.

## Fonctionnalités

- **Scraping d'événements** : Collecte automatique des événements, détails, prix, et commentaires depuis BilletReduc
- **Génération de producteurs** : Création et mise à jour de fiches pour les lieux avec leurs événements associés
- **Géolocalisation** : Ajout automatique des coordonnées géographiques aux lieux et événements
- **Analyse IA** : Traitement intelligent des commentaires pour générer des notes analytiques par catégorie
- **Exécution automatisée** : Planification quotidienne avec contrôle des composants coûteux

## Particularité de l'analyse IA

**Important** : Le composant d'analyse IA utilisant le modèle Mistral n'est exécuté qu'une seule fois pour éviter des coûts supplémentaires. Le script maintient un flag dans MongoDB pour suivre cet état.

L'analyse IA est adaptée selon la catégorie de l'événement :
- Théâtre contemporain
- Comédie
- Spectacle musical
- One-man-show
- Concert
- Danse
- Cirque
- etc.

Chaque catégorie utilise des critères d'évaluation et émotions spécifiques pour une analyse pertinente.

## Utilisation

### Exécution basique

```bash
python billetreduc_combined.py
```
Cette commande exécute un cycle complet (scraping, génération des producteurs, analyse IA si jamais effectuée), puis configure une exécution quotidienne à 3h du matin.

### Options disponibles

```bash
# Exécution unique sans planification quotidienne
python billetreduc_combined.py --no-schedule

# Forcer l'exécution de l'analyse IA même si déjà effectuée
python billetreduc_combined.py --force-ai

# Ignorer l'analyse IA même si jamais effectuée
python billetreduc_combined.py --skip-ai

# Exécution unique sans IA
python billetreduc_combined.py --no-schedule --skip-ai
```

## Structure de données

Le script interagit avec trois collections MongoDB :

1. **Loisir_Paris_Evenements** : Tous les événements avec leurs détails, commentaires et notes
2. **Loisir_Paris_Producers** : Les lieux/producteurs avec leurs événements associés
3. **Configuration** : Stocke les flags techniques comme l'état d'exécution de l'IA

## Logs

Le script génère des logs détaillés dans le fichier `billetreduc_combined.log` pour faciliter le suivi et le débogage.

## Dépendances

- Python 3.8+
- MongoDB
- Requests, BeautifulSoup4
- Playwright (pour le scraping avancé)
- PyTorch, Transformers (pour l'analyse IA)
- Schedule (pour l'automatisation)

Pour installer les dépendances :

```bash
pip install pymongo requests beautifulsoup4 playwright schedule torch transformers
playwright install chromium
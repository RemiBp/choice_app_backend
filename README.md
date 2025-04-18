# Choice App Backend

Backend pour l'application Choice App, permettant de proposer des choix personnalisés aux utilisateurs.

## Prérequis

- Node.js (v14+)
- MongoDB
- npm

## Installation

1. Cloner le dépôt
2. Installer les dépendances:
   ```bash
   npm install
   ```
3. Configurer le fichier `.env` avec les variables d'environnement nécessaires (voir `.env.example`)

## Démarrage du serveur

```bash
npm start
```

Pour le développement:
```bash
npm run dev
```

## Structure du projet

- `models/` - Définitions des modèles de données Mongoose
- `controllers/` - Logique de contrôle pour les routes
- `routes/` - Définitions des routes API
- `services/` - Services partagés
- `scripts/` - Scripts utilitaires
- `middleware/` - Middleware Express

## Vérification de l'intégrité de MongoDB

### Utilisation de `check_all_mongodb.js`

Ce script analyse les bases de données MongoDB pour vérifier:
- La présence des collections attendues
- L'existence des index géospatiaux nécessaires
- La présence des champs requis dans les documents

Pour l'exécuter:
```bash
npm run check-db
```

### Correction des problèmes détectés

#### 1. Collections manquantes

Si `check_all_mongodb.js` détecte des collections manquantes, exécutez:

```bash
npm run fix-collections
```

Ce script:
- Crée les collections manquantes nécessaires au bon fonctionnement
- Copie les données des collections existantes si nécessaire
- Adapte la structure des données lors de la copie
- Crée les index appropriés

#### 2. Index géospatiaux manquants

Les index géospatiaux sont essentiels pour les recherches de proximité. Si des index sont manquants, exécutez:

```bash
npm run fix-indexes
```

Ce script:
- Analyse toutes les collections spatiales
- Crée les index 2dsphere manquants
- Détecte automatiquement le format des coordonnées

#### 3. Champs requis manquants

Si certains documents n'ont pas tous les champs requis, exécutez:

```bash
npm run fix-fields
```

Ce script:
- Recherche les documents avec des champs manquants
- Ajoute les champs manquants avec des valeurs par défaut appropriées
- Génère un rapport des corrections effectuées

#### 4. Réparation complète de la base de données

Pour effectuer toutes les corrections en une seule commande:

```bash
npm run repair-db
```

Cette commande exécute dans l'ordre:
1. `fix-collections` - Création des collections manquantes
2. `fix-indexes` - Ajout des index géospatiaux manquants  
3. `fix-fields` - Ajout des champs requis manquants

#### 5. Sauvegarde de la base de données

Pour créer une sauvegarde complète de toutes les bases de données:

```bash
npm run backup-db
```

## API Endpoints

Le backend expose les endpoints suivants pour répondre aux besoins du frontend Flutter:

### Authentification
- `POST /api/auth/login` - Connexion utilisateur
- `POST /api/auth/register` - Inscription utilisateur
- `POST /api/auth/reset-password` - Demande de réinitialisation mot de passe
- `POST /api/auth/confirm-reset` - Confirmer réinitialisation mot de passe

### Utilisateurs
- `GET /api/users` - Récupérer tous les utilisateurs
- `GET /api/users/:id` - Récupérer un utilisateur spécifique
- `PUT /api/users/:id` - Mettre à jour un utilisateur
- `DELETE /api/users/:id` - Supprimer un utilisateur
- `POST /api/users/:userId/follow/:producerId` - Suivre un producteur
- `DELETE /api/users/:userId/unfollow/:producerId` - Ne plus suivre un producteur

### Producteurs (Restaurants, Loisirs, Bien-être)
- `GET /api/producers` - Récupérer tous les producteurs
- `GET /api/producers/search` - Recherche de producteurs
- `GET /api/producers/nearby` - Producteurs à proximité
- `GET /api/producers/:id` - Détails d'un producteur
- `GET /api/producers/:id/events` - Événements d'un producteur
- `GET /api/leisureProducers` - Récupérer les producteurs de loisirs
- `GET /api/leisureProducers/nearby` - Producteurs de loisirs à proximité
- `GET /api/wellness` - Récupérer les établissements de bien-être
- `GET /api/wellness/nearby` - Établissements de bien-être à proximité
- `GET /api/wellness/categories` - Catégories de bien-être

### Événements
- `GET /api/events` - Récupérer tous les événements
- `GET /api/events/search` - Recherche d'événements
- `GET /api/events/nearby` - Événements à proximité
- `GET /api/events/:id` - Détails d'un événement
- `POST /api/events` - Créer un événement
- `PUT /api/events/:id` - Mettre à jour un événement
- `DELETE /api/events/:id` - Supprimer un événement

### Recherche unifiée
- `POST /api/search` - Recherche globale sur toutes les collections
- `GET /api/search/restaurants` - Recherche de restaurants
- `GET /api/search/leisure/places` - Recherche de lieux de loisirs  
- `GET /api/search/leisure/events` - Recherche d'événements
- `GET /api/search/wellness` - Recherche d'établissements de bien-être
- `GET /api/search/users` - Recherche d'utilisateurs
- `GET /api/search/nearby` - Recherche à proximité (tous types)
- `GET /api/search/trending` - Recherches tendances

### Messagerie
- `GET /api/conversations/:userId` - Conversations d'un utilisateur
- `GET /api/conversations/:conversationId/messages` - Messages d'une conversation
- `POST /api/conversations/new-message` - Envoyer un message

### Feed
- `GET /api/feed/:userId` - Feed d'un utilisateur
- `GET /api/feed/producer/:producerId` - Feed d'un producteur

### Cartes
- `GET /api/map/heatmap/:producerId` - Données heatmap pour un producteur
- `GET /api/map/friends/:userId` - Amis à proximité pour la carte

## Correspondance avec le frontend

Les endpoints API sont alignés avec les besoins du frontend Flutter, notamment:
- Les cartes (restaurant, loisir, bien-être, amis)
- Les profils producteurs (restaurant, loisir, bien-être)
- Le système de messagerie
- La recherche unifiée
- Le système de feed

## Dépannage

### Erreurs de géolocalisation

Les requêtes géospatiales échouent généralement pour deux raisons:
1. **Index 2dsphere manquants** - Exécutez `npm run fix-indexes`
2. **Format de coordonnées incorrect** - Les coordonnées doivent être au format GeoJSON: `{ type: "Point", coordinates: [longitude, latitude] }`

### Erreurs de collection manquante

Si vous rencontrez des erreurs "Collection not found":
1. Exécutez `npm run fix-collections` pour créer les collections manquantes
2. Redémarrez le serveur

### Incohérences dans les données

En cas d'erreurs dans les données:
1. Exécutez la réparation complète: `npm run repair-db`  
2. Vérifiez les résultats avec `npm run check-db`

## Contribution

1. Faire un fork du projet
2. Créer une branche de fonctionnalité (`git checkout -b feature/amazing-feature`)
3. Commiter vos changements (`git commit -m 'Add some amazing feature'`)
4. Pousser la branche (`git push origin feature/amazing-feature`)
5. Ouvrir une Pull Request

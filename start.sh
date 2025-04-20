#!/bin/bash

# Script pour s'assurer que toutes les dépendances sont installées puis démarrer l'application

echo "🚀 Démarrage de l'application avec vérification préalable des dépendances"

# Installer explicitement les dépendances critiques
echo "📦 Installation des dépendances critiques..."
npm install morgan express cors helmet mongoose dotenv --no-save

# Vérifier si l'installation a réussi
if [ $? -ne 0 ]; then
  echo "❌ Erreur lors de l'installation des dépendances"
  exit 1
fi

# Corriger les problèmes de casse dans les imports
echo "🔧 Vérification des problèmes de casse dans les imports..."

# Liste des modèles avec la casse exacte
echo "Modèles avec la casse exacte:"
MODELS_WITH_CAPITALIZATION=$(find models -name "*.js" -type f | sort)
echo "$MODELS_WITH_CAPITALIZATION"

# Fixer automatiquement les problèmes de casse courants
echo "Correction des problèmes de casse courants..."

# Pour User.js
find . -type f -name "*.js" -not -path "./node_modules/*" -exec sed -i 's/models\/user/models\/User/g' {} \;

# Pour Producer.js
find . -type f -name "*.js" -not -path "./node_modules/*" -exec sed -i 's/models\/producer/models\/Producer/g' {} \;

# Pour Post.js
find . -type f -name "*.js" -not -path "./node_modules/*" -exec sed -i 's/models\/post/models\/Post/g' {} \;

# Pour WellnessPlace.js
find . -type f -name "*.js" -not -path "./node_modules/*" -exec sed -i 's/models\/wellnessPlace/models\/WellnessPlace/g' {} \;

# Pour BeautyPlace.js
find . -type f -name "*.js" -not -path "./node_modules/*" -exec sed -i 's/models\/beautyPlace/models\/BeautyPlace/g' {} \;

# Pour RestaurantStats.js
find . -type f -name "*.js" -not -path "./node_modules/*" -exec sed -i 's/models\/restaurantStats/models\/RestaurantStats/g' {} \;

echo "✅ Corrections des problèmes de casse terminées"

# Afficher la version de Node.js
echo "📊 Node.js version: $(node -v)"
echo "📊 NPM version: $(npm -v)"

# Configuration de l'environnement
echo "💾 Configuration de l'application pour Render..."

# Augmenter la limite de mémoire heap pour Node.js (2GB)
export NODE_OPTIONS="--max-old-space-size=2048"

# Activer le garbage collector plus agressif
export NODE_OPTIONS="$NODE_OPTIONS --expose-gc"

# Afficher les options Node.js
echo "🔧 NODE_OPTIONS: $NODE_OPTIONS"

# Démarrer l'application avec un wrapper qui force le GC périodiquement
node -e "
const { fork } = require('child_process');
console.log('🚀 Démarrage du serveur avec gestion optimisée de la mémoire...');

// Démarrer le processus principal
const app = fork('./index.js');

// Surveiller la mémoire et forcer le GC périodiquement (toutes les 30 minutes)
const gcIntervalMinutes = 30;
console.log('⏱️ Configuration du nettoyage mémoire toutes les ' + gcIntervalMinutes + ' minutes');

setInterval(() => {
  console.log('🧹 Exécution du nettoyage mémoire planifié...');
  global.gc();
  
  // Afficher l'utilisation actuelle de la mémoire
  const memoryUsage = process.memoryUsage();
  console.log('📊 Utilisation mémoire (MB):');
  console.log('   RSS: ' + (memoryUsage.rss / 1024 / 1024).toFixed(2));
  console.log('   Heap Total: ' + (memoryUsage.heapTotal / 1024 / 1024).toFixed(2));
  console.log('   Heap Used: ' + (memoryUsage.heapUsed / 1024 / 1024).toFixed(2));
  console.log('   External: ' + (memoryUsage.external / 1024 / 1024).toFixed(2));
}, gcIntervalMinutes * 60 * 1000);

// Gérer les erreurs et la terminaison
app.on('error', (err) => {
  console.error('❌ Erreur dans le processus principal:', err);
});

app.on('exit', (code) => {
  console.log('⛔ Le processus principal s\'est arrêté avec le code:', code);
  process.exit(code);
});

// Gérer les signaux de terminaison
process.on('SIGTERM', () => {
  console.log('📣 Signal SIGTERM reçu, arrêt propre...');
  app.kill('SIGTERM');
});

process.on('SIGINT', () => {
  console.log('📣 Signal SIGINT reçu, arrêt propre...');
  app.kill('SIGINT');
});
" 
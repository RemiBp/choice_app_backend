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

# Démarrer l'application
echo "✅ Dépendances installées, démarrage de l'application..."
node index.js 
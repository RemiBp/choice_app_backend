/**
 * Script de migration pour corriger les contrôleurs qui utilisent encore global.models
 * Exécuter avec: node scripts/fix-controllers.js
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Bannière d'information
console.log('======================================================');
console.log('📝 Script de correction des contrôleurs');
console.log('======================================================');
console.log('Ce script aide à migrer les contrôleurs qui utilisent');
console.log('encore global.models vers la nouvelle architecture.');
console.log('======================================================\n');

// Trouver tous les fichiers qui contiennent "global.models"
const controllersDir = path.join(__dirname, '..', 'controllers');
console.log(`🔍 Recherche dans le dossier: ${controllersDir}`);

try {
  // Récupérer la liste des fichiers contenant "global.models"
  const result = execSync(`grep -l "global.models" ${controllersDir}/*.js`).toString();
  const files = result.split('\n').filter(file => file.trim() !== '');
  
  console.log(`\n🔎 Trouvé ${files.length} fichiers contenant global.models:\n`);
  
  // Créer le dossier backup s'il n'existe pas
  const backupDir = path.join(__dirname, '..', 'controllers_backup');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir);
    console.log(`📁 Dossier de sauvegarde créé: ${backupDir}`);
  }
  
  // Traiter chaque fichier
  files.forEach(filePath => {
    const fileName = path.basename(filePath);
    console.log(`\n📄 Traitement de: ${fileName}`);
    
    // Créer une sauvegarde
    const backupPath = path.join(backupDir, fileName);
    fs.copyFileSync(filePath, backupPath);
    console.log(`✅ Sauvegarde créée: ${backupPath}`);
    
    // Lire le contenu
    let content = fs.readFileSync(filePath, 'utf8');
    
    // Ajouter l'import de modelCreator
    if (!content.includes('modelCreator')) {
      content = content.replace(
        /const mongoose = require\('mongoose'\);/,
        "const mongoose = require('mongoose');\nconst { createModel, databases } = require('../utils/modelCreator');"
      );
      console.log(`✅ Import de modelCreator ajouté`);
    }
    
    // Compter les occurrences de global.models
    const modelMatches = content.match(/global\.models\.(\w+)/g) || [];
    const uniqueModels = [...new Set(modelMatches.map(m => m.replace('global.models.', '')))];
    
    console.log(`📊 Modèles utilisés (${uniqueModels.length}): ${uniqueModels.join(', ')}`);
    
    // Ajouter au début du fichier (après les imports) la création directe des modèles
    let modelInitCode = '\n// Modèles initialisés directement\n';
    
    uniqueModels.forEach(modelName => {
      // Déterminer la database selon le nom du modèle
      let dbName = 'databases.CHOICE_APP'; // Par défaut
      
      if (modelName.includes('Leisure') || modelName.includes('Event')) {
        dbName = 'databases.LOISIR';
      } else if (modelName.includes('Beauty') || modelName.includes('Wellness')) {
        dbName = 'databases.BEAUTY_WELLNESS';
      } else if (modelName.includes('Restaurant') || modelName.includes('Producer')) {
        dbName = 'databases.RESTAURATION';
      }
      
      // Générer le code d'initialisation pour ce modèle
      modelInitCode += `const ${modelName} = createModel(${dbName}, '${modelName}', '${modelName}s');\n`;
    });
    
    // Ajouter la déclaration des modèles après les imports
    content = content.replace(
      /(\bconst.*require.*;\s*)+/s,
      '$&' + modelInitCode
    );
    
    // Sauvegarder le fichier modifié
    fs.writeFileSync(filePath, content);
    console.log(`✅ Code d'initialisation des modèles ajouté pour ${uniqueModels.length} modèles`);
    
    // Avertissement
    console.log('⚠️ Attention: Ce script a seulement ajouté les déclarations de modèles.');
    console.log('⚠️ Vous devez encore remplacer manuellement les utilisations de global.models.');
    console.log('⚠️ Exemple: remplacer "global.models.User" par "User"');
  });
  
  console.log('\n======================================================');
  console.log('✅ Traitement terminé!');
  console.log('======================================================');
  console.log('Les sauvegardes sont dans: ' + backupDir);
  console.log('Vous devez encore:');
  console.log('1. Remplacer manuellement les appels à global.models');
  console.log('2. Supprimer les appels à initialize() si présent');
  console.log('3. Tester que les contrôleurs fonctionnent correctement');
  console.log('======================================================');
} catch (error) {
  console.error('❌ Erreur:', error.message);
  process.exit(1);
} 
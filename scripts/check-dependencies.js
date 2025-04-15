/**
 * Script pour vérifier et installer automatiquement les dépendances manquantes
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🔍 Vérification des dépendances critiques...');

// Liste des dépendances critiques pour le démarrage de l'application
const CRITICAL_DEPENDENCIES = [
  'express',
  'cors',
  'morgan',
  'helmet',
  'mongoose',
  'dotenv'
];

// Fonction pour vérifier si une dépendance est installée
function isDependencyInstalled(dependency) {
  try {
    require.resolve(dependency);
    return true;
  } catch (error) {
    return false;
  }
}

// Vérifier et installer les dépendances manquantes
const missingDependencies = CRITICAL_DEPENDENCIES.filter(dep => !isDependencyInstalled(dep));

if (missingDependencies.length > 0) {
  console.log(`⚠️ Dépendances manquantes détectées: ${missingDependencies.join(', ')}`);
  console.log('📦 Installation des dépendances manquantes...');
  
  try {
    // Installer les dépendances manquantes
    execSync(`npm install ${missingDependencies.join(' ')} --no-save`, { 
      stdio: 'inherit',
      cwd: path.join(__dirname, '..')
    });
    
    console.log('✅ Dépendances installées avec succès.');
    
    // Vérifier à nouveau que toutes les dépendances sont maintenant installées
    const stillMissing = missingDependencies.filter(dep => !isDependencyInstalled(dep));
    
    if (stillMissing.length > 0) {
      console.error(`❌ Impossible d'installer certaines dépendances: ${stillMissing.join(', ')}`);
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ Erreur lors de l\'installation des dépendances:', error.message);
    process.exit(1);
  }
} else {
  console.log('✅ Toutes les dépendances critiques sont installées.');
}

// Mise à jour du fichier package.json si nécessaire
try {
  const packageJsonPath = path.join(__dirname, '..', 'package.json');
  const packageJson = require(packageJsonPath);
  
  let packageJsonUpdated = false;
  
  // Vérifier que toutes les dépendances critiques sont dans package.json
  CRITICAL_DEPENDENCIES.forEach(dep => {
    if (!packageJson.dependencies[dep]) {
      console.log(`⚠️ Dépendance ${dep} manquante dans package.json, ajout automatique...`);
      packageJson.dependencies[dep] = '*';  // Utiliser la dernière version
      packageJsonUpdated = true;
    }
  });
  
  // Sauvegarder le package.json mis à jour
  if (packageJsonUpdated) {
    fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
    console.log('✅ package.json mis à jour avec toutes les dépendances critiques.');
  }
} catch (error) {
  console.error('⚠️ Erreur lors de la mise à jour de package.json:', error.message);
  // Ne pas sortir pour cette erreur, permettre à l'application de démarrer quand même
}

console.log('✅ Vérification des dépendances terminée.'); 
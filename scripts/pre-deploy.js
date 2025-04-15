/**
 * Pre-deployment script to verify dependencies
 * Run this before deployment to check if all dependencies are correctly available
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Read package.json
const packageJsonPath = path.join(__dirname, '..', 'package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

// Get all dependencies
const dependencies = packageJson.dependencies || {};
const devDependencies = packageJson.devDependencies || {};
const allDependencies = { ...dependencies, ...devDependencies };

console.log('Checking dependencies...');
let missingDeps = [];

// Try to require each dependency
for (const [dep, version] of Object.entries(dependencies)) {
  try {
    require(dep);
    console.log(`✅ ${dep}@${version}`);
  } catch (error) {
    console.error(`❌ Missing: ${dep}@${version}`);
    missingDeps.push(dep);
  }
}

// If missing dependencies, try to install them
if (missingDeps.length > 0) {
  console.log(`Installing ${missingDeps.length} missing dependencies...`);
  try {
    execSync(`npm install ${missingDeps.join(' ')}`, { stdio: 'inherit' });
    console.log('✅ Dependencies installed successfully');
  } catch (error) {
    console.error('❌ Failed to install dependencies:', error.message);
    process.exit(1);
  }
} else {
  console.log('✅ All dependencies are correctly installed');
}

console.log('Pre-deployment check completed'); 
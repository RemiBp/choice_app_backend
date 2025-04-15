const { exec } = require('child_process');
const cron = require('node-cron');

/**
 * Planifie l'exécution du script generateProducers.js tous les 3 jours.
 */
cron.schedule('0 0 */3 * *', () => {
  console.log('🕒 Exécution planifiée : Mise à jour des producteurs...');

  exec('node ./scripts/generateProducers.js', (error, stdout, stderr) => {
    if (error) {
      console.error(`❌ Erreur lors de l'exécution de generateProducers.js : ${error.message}`);
      return;
    }
    if (stderr) {
      console.error(`⚠️ Avertissement de generateProducers.js : ${stderr}`);
    }
    console.log(`✅ Script generateProducers.js exécuté avec succès :\n${stdout}`);
  });
});

/**
 * Planifie l'exécution du script shotgunpro.py tous les jours à 2h du matin.
 */
cron.schedule('0 2 * * *', () => {
  console.log('🚀 Exécution planifiée : Lancement de shotgunpro.py...');

  exec('python "C:/Users/remib/choice_app/backend/scripts/shotgunpro.py"', (error, stdout, stderr) => {
    if (error) {
      console.error(`❌ Erreur lors de l'exécution de shotgunpro.py : ${error.message}`);
      return;
    }
    if (stderr) {
      console.error(`⚠️ Avertissement de shotgunpro.py : ${stderr}`);
    }
    console.log(`✅ Script shotgunpro.py exécuté avec succès :\n${stdout}`);
  });
});

/**
 * Planifie l'exécution du script shotgunproevent.py tous les jours à 3h du matin.
 */
cron.schedule('0 3 * * *', () => {
  console.log('🚀 Exécution planifiée : Lancement de shotgunproevent.py...');

  exec('python "C:/Users/remib/choice_app/backend/scripts/shotgunproevent.py"', (error, stdout, stderr) => {
    if (error) {
      console.error(`❌ Erreur lors de l'exécution de shotgunproevent.py : ${error.message}`);
      return;
    }
    if (stderr) {
      console.error(`⚠️ Avertissement de shotgunproevent.py : ${stderr}`);
    }
    console.log(`✅ Script shotgunproevent.py exécuté avec succès :\n${stdout}`);
  });
});

/**
 * Fonction pour exécuter manuellement les scripts (pour des tests ou un besoin immédiat).
 */
const runManualUpdate = () => {
  console.log('▶️ Exécution manuelle : Mise à jour des producteurs et lancement des scripts Shotgun...');

  exec('node ./scripts/generateProducers.js', (error, stdout, stderr) => {
    if (error) {
      console.error(`❌ Erreur lors de l'exécution manuelle de generateProducers.js : ${error.message}`);
      return;
    }
    if (stderr) {
      console.error(`⚠️ Avertissement de generateProducers.js : ${stderr}`);
    }
    console.log(`✅ Mise à jour manuelle des producteurs exécutée avec succès :\n${stdout}`);
  });

  exec('python "C:/Users/remib/choice_app/backend/scripts/shotgunpro.py"', (error, stdout, stderr) => {
    if (error) {
      console.error(`❌ Erreur lors de l'exécution manuelle de shotgunpro.py : ${error.message}`);
      return;
    }
    if (stderr) {
      console.error(`⚠️ Avertissement de shotgunpro.py : ${stderr}`);
    }
    console.log(`✅ Lancement manuel de shotgunpro.py exécuté avec succès :\n${stdout}`);
  });

  exec('python "C:/Users/remib/choice_app/backend/scripts/shotgunproevent.py"', (error, stdout, stderr) => {
    if (error) {
      console.error(`❌ Erreur lors de l'exécution manuelle de shotgunproevent.py : ${error.message}`);
      return;
    }
    if (stderr) {
      console.error(`⚠️ Avertissement de shotgunproevent.py : ${stderr}`);
    }
    console.log(`✅ Lancement manuel de shotgunproevent.py exécuté avec succès :\n${stdout}`);
  });
};

// Exporter la fonction manuelle pour des tests ou des déclenchements à la demande
module.exports = { runManualUpdate };

console.log('⏳ Scheduler en attente de la prochaine exécution...');

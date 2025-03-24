const { MongoClient } = require('mongodb');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config();

const mongoUri = process.env.MONGO_URI;
const outputFilePath = path.join(__dirname, `mongodb_report_${new Date().toISOString().replace(/:/g, '-')}.txt`);

const DEFAULT_SAMPLE_LIMIT = 1;
const LARGE_SAMPLE_LIMIT = 3;
const MAX_STRING_LENGTH = 50;

const largeSampleDbNames = ['choice_app', 'Loisir&Culture'];

function writeToFile(content) {
  fs.appendFileSync(outputFilePath, content + '\n');
}

// Fonction pour tronquer les longues chaînes
function truncateLongStrings(obj, maxLength = MAX_STRING_LENGTH) {
  return JSON.parse(JSON.stringify(obj, (key, value) => {
    if (typeof value === 'string' && value.length > maxLength) {
      return value.slice(0, maxLength) + '...';
    }
    return value;
  }));
}

async function exportMongoDBData() {
  fs.writeFileSync(outputFilePath, `# MongoDB Export - ${new Date().toISOString()}\n\n`);

  if (!mongoUri) {
    writeToFile('❌ Erreur: Variable MONGO_URI manquante dans le fichier .env');
    return;
  }

  let client;
  try {
    writeToFile('🔄 Connexion à MongoDB Atlas...');
    client = new MongoClient(mongoUri);
    await client.connect();
    writeToFile('✅ Connexion réussie à MongoDB Atlas!\n');

    const admin = client.db().admin();
    const databasesList = await admin.listDatabases();

    writeToFile('## BASES DE DONNÉES DISPONIBLES:');
    for (const dbInfo of databasesList.databases) {
      writeToFile(`- ${dbInfo.name} (${(dbInfo.sizeOnDisk / 1024 / 1024).toFixed(2)} MB)`);
    }
    writeToFile('');

    for (const dbInfo of databasesList.databases) {
      const dbName = dbInfo.name;
      const db = client.db(dbName);

      const sampleLimit = (
        dbName === 'Loisir&Culture' ||
        dbName.includes('choice_app')
      ) ? LARGE_SAMPLE_LIMIT : DEFAULT_SAMPLE_LIMIT;

      writeToFile(`## BASE DE DONNÉES: ${dbName}`);

      const collections = await db.listCollections().toArray();
      if (collections.length === 0) {
        writeToFile('Aucune collection trouvée.\n');
        continue;
      }

      writeToFile('### Collections:');
      collections.forEach(col => writeToFile(`- ${col.name}`));
      writeToFile('');

      for (const col of collections) {
        writeToFile(`### Échantillons de la collection \`${col.name}\` :`);
        try {
          const collection = db.collection(col.name);
          const count = await collection.countDocuments();
          const actualLimit = Math.min(sampleLimit, count);

          if (actualLimit === 0) {
            writeToFile('Aucun document disponible.\n');
            continue;
          }

          const documents = await collection
            .aggregate([{ $sample: { size: actualLimit } }])
            .toArray();

          documents.forEach((doc, index) => {
            const truncated = truncateLongStrings(doc);
            writeToFile(`#### Document ${index + 1}:`);
            writeToFile(JSON.stringify(truncated, null, 2));
            writeToFile('');
          });
        } catch (err) {
          writeToFile(`❌ Erreur lors de la lecture de la collection "${col.name}": ${err.message}\n`);
        }
      }
    }

    writeToFile('✅ Rapport d\'export terminé');
    console.log(`✅ Export terminé: ${outputFilePath}`);
  } catch (error) {
    writeToFile(`❌ Erreur: ${error.message}`);
    console.error('Erreur:', error);
  } finally {
    if (client) {
      await client.close();
      writeToFile('🔒 Connexion fermée');
    }
  }
}

exportMongoDBData().catch(console.error);

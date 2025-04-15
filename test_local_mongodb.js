const mongoose = require('mongoose');

// Configuration pour la connexion locale
const LOCAL_MONGO_URI = 'mongodb://localhost:27017/';
const DB_NAME = 'choice_app'; // Nom de la base de données par défaut, vous pouvez le changer

async function testLocalMongoConnection() {
  try {
    // Tentative de connexion à MongoDB en local
    console.log('🔄 Tentative de connexion à MongoDB en local...');
    await mongoose.connect(LOCAL_MONGO_URI + DB_NAME, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    
    console.log('✅ Connexion réussie à MongoDB en local !');
    
    // Afficher la liste des collections
    const collections = await mongoose.connection.db.listCollections().toArray();
    console.log('📁 Collections disponibles dans la base de données :');
    collections.forEach(collection => {
      console.log(` - ${collection.name}`);
    });
    
    // Optionnel : Tester une requête simple
    if (collections.length > 0) {
      const firstCollection = collections[0].name;
      console.log(`🔍 Test de requête sur la collection "${firstCollection}"...`);
      const documents = await mongoose.connection.db.collection(firstCollection).find({}).limit(3).toArray();
      console.log(`📄 ${documents.length} documents trouvés dans "${firstCollection}"`);
      if (documents.length > 0) {
        console.log('📝 Exemple de document :', JSON.stringify(documents[0], null, 2));
      }
    }
    
  } catch (error) {
    console.error('❌ Erreur de connexion :', error.message);
    if (error.message.includes('ECONNREFUSED')) {
      console.error('\n⚠️ Impossible de se connecter à MongoDB en local.');
      console.error('📋 Vérifiez que :');
      console.error(' 1. MongoDB est installé sur votre machine');
      console.error(' 2. Le service MongoDB est démarré');
      console.error(' 3. MongoDB écoute sur le port par défaut (27017)');
      console.error('\n📌 Si vous utilisez MongoDB Compass, assurez-vous qu\'il est ouvert et connecté.');
    }
  } finally {
    // Fermeture de la connexion
    await mongoose.connection.close();
    console.log('🔒 Connexion fermée');
  }
}

// Exécution du test
testLocalMongoConnection();

/*
INSTRUCTIONS D'UTILISATION :

1. Assurez-vous que MongoDB est installé localement sur votre machine
   - Vous pouvez télécharger MongoDB Community Edition sur: https://www.mongodb.com/try/download/community

2. Vérifiez que le service MongoDB est démarré
   - Sur Windows : Vérifiez dans les Services ou lancez "mongod" dans un terminal
   - Sur Mac/Linux : Utilisez "sudo systemctl status mongodb" ou équivalent

3. Exécutez ce script avec Node.js :
   $ node test_local_mongodb.js

4. Si vous souhaitez vous connecter à une autre base de données que "choice_app",
   modifiez la constante DB_NAME dans ce script.

5. Pour utiliser cette connexion locale dans votre application principale,
   vous devrez modifier la variable MONGO_URI dans votre fichier .env :
   MONGO_URI=mongodb://localhost:27017/choice_app
*/
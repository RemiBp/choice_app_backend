const { MongoClient } = require('mongodb');
const bcrypt = require('bcrypt');

// Connexion à votre MongoDB Atlas
const MONGO_URI = 'mongodb+srv://remibarbier:Calvi8Pierc2@lieuxrestauration.szq31.mongodb.net/?retryWrites=true&w=majority&appName=lieuxrestauration';
const DATABASE_NAME = 'choice_app';
const COLLECTION_NAME = 'Users';

// Fonction principale
async function updatePasswords() {
  const client = new MongoClient(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });

  try {
    // Connexion au client MongoDB
    await client.connect();
    console.log('Connecté à MongoDB');

    // Accès à la base et à la collection
    const db = client.db(DATABASE_NAME);
    const usersCollection = db.collection(COLLECTION_NAME);

    // Générer le hash du mot de passe "123456"
    const plainPassword = '123456';
    const hashedPassword = await bcrypt.hash(plainPassword, 10);
    console.log('Mot de passe crypté :', hashedPassword);

    // Mise à jour de tous les utilisateurs
    const result = await usersCollection.updateMany(
      {}, // Filtre vide pour inclure tous les documents
      {
        $set: { password: hashedPassword } // Ajout du mot de passe crypté
      }
    );

    console.log(`${result.matchedCount} utilisateurs trouvés.`);
    console.log(`${result.modifiedCount} utilisateurs mis à jour avec un mot de passe crypté.`);
  } catch (error) {
    console.error('Erreur lors de la mise à jour des mots de passe :', error);
  } finally {
    // Fermer la connexion
    await client.close();
    console.log('Connexion MongoDB fermée');
  }
}

// Exécution du script
updatePasswords();

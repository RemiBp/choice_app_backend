const mongoose = require('mongoose');
const Producer = require('../models/Producer'); // Modèle pour les producteurs

const MONGO_URI = "mongodb+srv://remibarbier:Calvi8Pierc2@lieuxrestauration.szq31.mongodb.net/Restauration_Officielle?retryWrites=true&w=majority";

// Connexion à MongoDB avec Mongoose
async function connectToDatabase() {
  try {
    await mongoose.connect(MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log("✅ Connexion à MongoDB réussie");
  } catch (err) {
    console.error("❌ Erreur lors de la connexion à MongoDB :", err.message);
    process.exit(1);
  }
}

// Fonction principale pour mettre à jour les coordonnées GPS
async function updateGPSCoordinates() {
  try {
    console.log("🔍 Récupération des producteurs et des lieux...");

    const db = mongoose.connection.db;
    const restaurationParisCollection = db.collection("RestaurationParis");

    // Récupérer tous les producteurs de la base
    const producers = await Producer.find();

    for (const producer of producers) {
      // Vérifier si les coordonnées GPS sont [0, 0] ou manquantes
      if (
        !producer.gps_coordinates ||
        producer.gps_coordinates.coordinates[0] === 0 ||
        producer.gps_coordinates.coordinates[1] === 0
      ) {
        // Rechercher les coordonnées dans la collection RestaurationParis
        const correspondingPlace = await restaurationParisCollection.findOne({
          place_id: producer.place_id,
        });

        if (
          correspondingPlace &&
          correspondingPlace.gps_coordinates &&
          correspondingPlace.gps_coordinates.coordinates &&
          correspondingPlace.gps_coordinates.coordinates.length === 2
        ) {
          // Mettre à jour les coordonnées GPS du producteur
          producer.gps_coordinates = correspondingPlace.gps_coordinates;

          await producer.save();
          console.log(
            `✅ Coordonnées GPS mises à jour pour le producteur : ${producer.name} (${producer.place_id})`
          );
        } else {
          console.warn(
            `⚠️ Coordonnées GPS non trouvées pour le lieu avec place_id : ${producer.place_id}`
          );
        }
      } else {
        console.log(
          `ℹ️ Coordonnées GPS valides déjà présentes pour le producteur : ${producer.name}`
        );
      }
    }

    console.log("🎉 Mise à jour des coordonnées GPS terminée.");
  } catch (err) {
    console.error("❌ Erreur lors de la mise à jour des coordonnées GPS :", err);
  } finally {
    await mongoose.disconnect();
    console.log("🔌 Déconnexion de MongoDB.");
  }
}

// Exécution principale
(async () => {
  await connectToDatabase();
  await updateGPSCoordinates();
})();

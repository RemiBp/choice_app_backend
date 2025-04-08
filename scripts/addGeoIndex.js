const mongoose = require('mongoose');

const MONGO_URI = "mongodb+srv://remibarbier:Calvi8Pierc2@lieuxrestauration.szq31.mongodb.net/Restauration_Officielle?retryWrites=true&w=majority";

async function addGeoIndex() {
  try {
    await mongoose.connect(MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    console.log("✅ Connexion à MongoDB réussie");

    const db = mongoose.connection.db; // Accès direct à la base
    const producersCollection = db.collection("producers");

    // Ajout de l'index géospatial
    await producersCollection.createIndex({ gps_coordinates: "2dsphere" });
    console.log("✅ Index géospatial ajouté avec succès sur gps_coordinates");
  } catch (err) {
    console.error("❌ Erreur lors de l'ajout de l'index :", err.message);
  } finally {
    mongoose.disconnect();
    console.log("🔌 Déconnexion de MongoDB");
  }
}

addGeoIndex();

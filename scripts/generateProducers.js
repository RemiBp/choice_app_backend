const mongoose = require('mongoose');
const Producer = require('../models/Producer');

const MONGO_URI = "mongodb+srv://remibarbier:Calvi8Pierc2@lieuxrestauration.szq31.mongodb.net/Restauration_Officielle?retryWrites=true&w=majority";
const BATCH_SIZE = 500; // Nombre de producteurs par lot

async function connectToDatabase() {
  try {
    await mongoose.connect(MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log("Connexion à MongoDB réussie");
  } catch (err) {
    console.error("Erreur lors de la connexion à MongoDB :", err.message);
    process.exit(1);
  }
}

async function generateProducers() {
  try {
    console.log("🔍 Récupération des lieux dans la collection...");
    const db = mongoose.connection.db;
    const collection = db.collection("RestaurationParis");

    // Compter le nombre total de documents
    const totalPlaces = await collection.countDocuments();
    console.log(`Total des lieux à traiter : ${totalPlaces}`);

    let processed = 0;

    for (let skip = 0; skip < totalPlaces; skip += BATCH_SIZE) {
      // Récupérer un lot de lieux
      const places = await collection.find({}).skip(skip).limit(BATCH_SIZE).toArray();

      for (const place of places) {
        // Vérification des champs obligatoires
        if (!place.place_id || !place.name || !place.address) {
          console.warn(
            `⚠️ Champs obligatoires manquants pour le lieu : ${
              place.name || "Sans nom"
            } (place_id: ${place.place_id}, address: ${place.address})`
          );
          continue; // Ignorer ce lieu
        }

        const gpsCoordinates = place.gps_coordinates || {
          type: "Point",
          coordinates: [0, 0],
        };

        if (
          !gpsCoordinates.coordinates ||
          gpsCoordinates.coordinates.length !== 2
        ) {
          console.warn(
            `⚠️ Coordonnées manquantes ou invalides pour le lieu : ${
              place.name || "Sans nom"
            }`
          );
          continue; // Ignorer ce lieu
        }

        const validPhotos = (place.photos || []).filter(photo => 
          typeof photo === 'string' && photo.startsWith('http')
        );

        const existingProducer = await Producer.findOne({
          place_id: place.place_id,
        });

        const updatedFields = {
          name: place.name || place.restaurant_name,
          address: place.address,
          business_status: place.business_status || "OPERATIONAL",
          category: place.category || [],
          gps_coordinates: gpsCoordinates,
          international_phone_number:
            place.international_phone_number || null,
          phone_number: place.phone_number || null,
          maps_url: place.maps_url || null,
          opening_hours: place.opening_hours || [],
          photos: validPhotos,
          popular_times: place.popular_times || [],
          price_level: place.price_level || null,
          rating: place.rating || null,
          serves_vegetarian_food: place.serves_vegetarian_food || "Non spécifié",
          service_options: place.service_options || {},
          user_ratings_total: place.user_ratings_total || null,
          website: place.website || null,
          notes_globales: place.notes_globales || {},
          structured_data: place.structured_data || {},
          menus_structures: place.menus_structures || {},
        };

        if (existingProducer) {
          const changes = Object.keys(updatedFields).filter(
            (key) =>
              JSON.stringify(existingProducer[key]) !==
              JSON.stringify(updatedFields[key])
          );

          if (changes.length > 0) {
            await Producer.updateOne(
              { place_id: place.place_id },
              { $set: updatedFields }
            );
            console.log(
              `Mise à jour : ${place.name} (Changements : ${changes.join(
                ", "
              )})`
            );
          } else {
            console.log(`ℹ Aucun changement pour : ${place.name}`);
          }
        } else {
          const newProducer = new Producer({
            place_id: place.place_id,
            ...updatedFields,
          });

          try {
            await newProducer.save();
            console.log(`Création : ${place.name}`);
          } catch (saveErr) {
            console.error(
              `❌ Erreur lors de la création pour ${place.name}:`,
              saveErr.message
            );
          }
        }
      }

      processed += places.length;
      console.log(`Traitement en cours : ${processed}/${totalPlaces}`);
    }

    console.log("🎉 Tous les producteurs ont été générés ou mis à jour avec succès.");
  } catch (err) {
    console.error("Erreur :", err);
  } finally {
    await mongoose.disconnect();
    console.log("🔌 Déconnexion de MongoDB.");
  }
}

(async () => {
  await connectToDatabase();
  await generateProducers();
})();

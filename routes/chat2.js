const express = require('express');
const OpenAI = require('openai');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const router = express.Router();

dotenv.config();

// Initialisation de l'API OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const app = express();
app.use(express.json());

// Connexion à MongoDB et à la base "Restauration_Officielle"
mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log('✅ Connexion MongoDB réussie');
  })
  .catch((error) => {
    console.error('❌ Erreur de connexion MongoDB:', error.message);
    process.exit(1);
  });

const restaurationDb = mongoose.connection.useDb("Restauration_Officielle");

// 📌 Modèles MongoDB
const RestaurantProducer = restaurationDb.model("Producer", new mongoose.Schema({}, { strict: false }), "producers");

// Route pour interroger OpenAI et la base MongoDB
async function extractCriteria(userMessage) {
  const response = await openai.chat.completions.create({
    model: 'gpt-4',
    messages: [
      {
        role: 'system',
        content: "Vous êtes un assistant qui aide à comprendre des requêtes naturelles. Votre tâche est d'extraire les critères de recherche suivants : plat, localisation, horaire d'ouverture, et tout autre critère pertinent."
      },
      {
        role: 'user',
        content: userMessage,
      },
    ],
  });

  const extractedData = response.choices[0].message.content;
  return JSON.parse(extractedData); // Il faut que la réponse soit un JSON ou un format structuré pour être traité
}

// Route pour interroger la base de données et obtenir des résultats basés sur les critères
app.post('/chat', async (req, res) => {
  try {
    const { userMessage } = req.body;

    // Extraire les critères de la requête avec GPT
    const criteria = await extractCriteria(userMessage);
    
    // Rechercher dans la base de données en fonction des critères extraits
    let query = {};

    if (criteria.location) {
      query['address'] = new RegExp(criteria.location, 'i'); // Recherche de la localisation
    }

    if (criteria.dish) {
      // Rechercher les plats dans le menu
      query['structured_data.‘Items Indépendants’.items.nom'] = new RegExp(criteria.dish, 'i');
    }

    if (criteria.openNow) {
      // Rechercher les restaurants ouverts en fonction de l'heure actuelle
      const currentDay = new Date().toLocaleString('en-us', { weekday: 'long' }).toLowerCase();
      query[`opening_hours.${currentDay}`] = { $regex: /open/i };
    }

    // Requête dans la base de données
    const matchingRestaurants = await RestaurantProducer.find(query).limit(10);

    if (matchingRestaurants.length === 0) {
      return res.status(404).json({ error: 'Aucun restaurant trouvé.' });
    }

    // Retourner les résultats à l'utilisateur
    const responseText = matchingRestaurants.map((restaurant) => {
      return {
        name: restaurant.name,
        address: restaurant.address,
        menu: restaurant.structured_data?.['Menus Globaux']?.map(menu => menu.nom).join(", "),
      };
    });

    res.json({ reply: responseText });
  } catch (error) {
    console.error("Erreur :", error);
    res.status(500).json({ error: "Erreur lors de la récupération de la réponse." });
  }
});




module.exports = router;

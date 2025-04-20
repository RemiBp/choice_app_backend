const express = require('express');
const OpenAI = require('openai');
const dotenv = require('dotenv').config();

const app = express();
app.use(express.json());

// Configuration OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Exemple de données pour le restaurant
const restaurantData = {
  name: "Pizza O'Klm81",
  address: "Pl. Tony de Graaf, 92190 Meudon, France",
  phone_number: "06 12 77 07 29",
  rating: 4.1,
  description: "Bienvenue chez Pizza O'Klm81. Profitez de nos services !",
  business_status: "OPERATIONAL",
  website: "https://pizzamoreparis.fr/",
  opening_hours: [
    "Monday: Closed",
    "Tuesday: 6:00 – 9:00 PM",
    "Wednesday: Closed",
    "Thursday: Closed",
    "Friday: 6:00 – 9:00 PM",
    "Saturday: Closed",
    "Sunday: Closed",
  ],
  menu: {
    global_menus: [
      {
        name: "PIZZE GOURMET",
        price: "N/A",
        items: [
          {
            name: "Burrata pugliese prosciutto di Parma",
            description: "Burrata des Pouilles 125 g accompagnée de jambon de Parme DOP, salade …",
            price: 20,
            rating: "7.8/10",
          },
        ],
      },
    ],
  },
};

// API de chat
app.post("/api/chat", async (req, res) => {
  try {
    const { userMessage } = req.body;
    
    // Création du contexte de la réponse
    const context = `Restaurant : ${restaurantData.name}.\n` +
      `Description : ${restaurantData.description}\n` +
      `Adresse : ${restaurantData.address}\n` +
      `Numéro de téléphone : ${restaurantData.phone_number}\n` +
      `Menu : ${restaurantData.menu.global_menus[0].name} - ${restaurantData.menu.global_menus[0].items[0].name} à ${restaurantData.menu.global_menus[0].items[0].price}€\n`;

    // Interroger GPT avec le contexte et la requête de l'utilisateur
    const response = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        { role: "system", content: context },
        { role: "user", content: userMessage },
      ],
    });

    // Récupérer la réponse du bot
    const botReply = response.choices[0].message.content;

    res.json({ reply: botReply });
  } catch (error) {
    console.error("Erreur :", error);
    res.status(500).json({ error: "Erreur lors de la récupération de la réponse." });
  }
});

// Lancer le serveur sur un autre port si nécessaire
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Serveur lancé sur le port ${PORT}`);
});

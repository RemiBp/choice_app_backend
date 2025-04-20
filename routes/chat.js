const express = require("express");
const OpenAI = require("openai");
const mongoose = require("mongoose");
require("dotenv").config();

const router = express.Router();

// 📌 Configuration OpenAI avec GPT-4o-mini
let openai;
try {
  if (process.env.OPENAI_API_KEY) {
    openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    console.log("✅ OpenAI API client initialisé avec succès");
  } else {
    console.warn("⚠️ Clé OpenAI API manquante - La fonction de chat ne sera pas disponible");
    // Créer un objet factice qui ne fait rien mais évite les erreurs
    openai = {
      chat: {
        completions: {
          create: async () => ({
            choices: [{ message: { content: "Le service de chat est temporairement indisponible." }}]
          })
        }
      }
    };
  }
} catch (error) {
  console.error("❌ Erreur lors de l'initialisation du client OpenAI:", error);
  // Créer un objet factice
  openai = {
    chat: {
      completions: {
        create: async () => ({
          choices: [{ message: { content: "Le service de chat est temporairement indisponible." }}]
        })
      }
    }
  };
}

const usersDb = mongoose.createConnection(process.env.MONGO_URI, {
  dbName: "choice_app",
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

const restaurationDb = mongoose.createConnection(process.env.MONGO_URI, {
  dbName: "Restauration_Officielle",
  useNewUrlParser: true,
  useUnifiedTopology: true,
});


const loisirsDb = mongoose.createConnection(process.env.MONGO_URI, {
  dbName: "Loisir&Culture",
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

usersDb.on("connected", () => console.log("✅ Connected to usersDb"));
restaurationDb.on("connected", () => console.log("✅ Connected to restaurationDb"));
loisirsDb.on("connected", () => console.log("✅ Connected to loisirsDb"));

// 📌 Modèles MongoDB
const User = usersDb.model("User", new mongoose.Schema({}, { strict: false }), "Users");
const RestaurantProducer = restaurationDb.model("Producer", new mongoose.Schema({}, { strict: false }), "producers");
const LeisureProducer = loisirsDb.model("LeisureProducer", new mongoose.Schema({}, { strict: false }), "Loisir_Paris_Producers");
const Event = loisirsDb.model("Event", new mongoose.Schema({}, { strict: false }), "Loisir_Paris_Evenements");
const Producer = restaurationDb.model("Producer", new mongoose.Schema({}, { strict: false }), "producers");
// 🔹 Tester la récupération des restaurants pour vérifier l'accès à la base
// 🔹 Tester la récupération des restaurants pour vérifier l'accès à la base
(async () => {
  try {
    // Limiter à 1000 producteurs pour éviter de saturer la mémoire
    const allProducers = await Producer.find({}).limit(1000); 
    console.log("📂 Nombre total de restaurants récupérés :", allProducers.length);

    if (allProducers.length > 0) {
      // Debug : Afficher un exemple de producteur récupéré
      console.log("🔍 Exemple d'un producteur dans les 1000 premiers :", allProducers[0]);
    } else {
      console.log("🚨 Aucun restaurant trouvé dans la base.");
    }
  } catch (error) {
    console.error("❌ Erreur lors de la récupération des restaurants :", error);
  }
})();

// 🔹 Tester la récupération des restaurants pour vérifier l'accès à la base
(async () => {
  try {
      const allProducers = await Producer.find({});
      console.log("📂 Nombre total de restaurants récupérés :", allProducers.length);
      if (allProducers.length > 0) {
          console.log("🔍 Exemple d'un restaurant en base :", allProducers[0]);
      } else {
          console.log("🚨 Aucun restaurant trouvé dans la base.");
      }
  } catch (error) {
      console.error("❌ Erreur lors de la récupération des restaurants :", error);
  }
})();


// 📌 Modèle pour stocker l'historique des messages
const UserChatMessage = usersDb.model("ChatMessage", new mongoose.Schema({
  userId: String,
  role: String, // "user" ou "assistant"
  text: String,
  timestamp: { type: Date, default: Date.now },
}), "chat_messages");

const ProducerChatMessage = restaurationDb.model("ChatMessage", new mongoose.Schema({
  producerId: String,
  role: String, // "user" ou "assistant"
  text: String,
  timestamp: { type: Date, default: Date.now },
}), "chat_messages");

// 📌 🔹 Route principale : Chat avec GPT-4o-mini
router.post("/chat", async (req, res) => {
  try {
    const { producerId, userMessage } = req.body;

    if (!producerId || !userMessage) {
      return res.status(400).json({ error: "Données invalides." });
    }

    console.log(`🟢 Requête reçue : ${userMessage}`);

    // 🔹 Récupérer les infos du producer en temps réel
    const producer = await Producer.findOne({ _id: producerId });

    if (!producer) {
      console.log(`❌ Producer introuvable avec l'ID : ${producerId}`);
      return res.status(404).json({ error: "Producer introuvable." });
    }

    console.log(`🔍 Restaurant trouvé : ${producer.name}`);

    // 🔹 Récupérer l'historique de conversation du producer
    const messages = await ProducerChatMessage.find({ producerId }).sort({ timestamp: 1 }).limit(10);
    let ProducerChatHistory = messages.map((msg) => ({
      role: msg.role,
      content: msg.text,
    }));

    // 🔍 Extraire les informations de quartier et de menu de la requête utilisateur
    const locationRegex = /quartier (.*)/i;  // Capture la mention de quartier
    const locationMatch = userMessage.match(locationRegex);
    const location = locationMatch ? locationMatch[1].trim() : null;

    let otherRestaurantData = null;
    let otherRestaurantContext = "";

    // 🔹 Vérification explicite de la présence d'un autre restaurant
    let otherRestaurant = extractRestaurantName(userMessage);
    console.log(`🔍 Autre restaurant détecté : ${otherRestaurant || "Aucun"}`);

    // Recherche dans la base pour le restaurant concurrent
    if (otherRestaurant) {
      console.log(`🔍 Recherche du restaurant concurrent : ${otherRestaurant}`);
      otherRestaurantData = await Producer.findOne({
        name: { $regex: new RegExp(otherRestaurant, "i") }, // Recherche souple
      });

      if (otherRestaurantData) {
        console.log(`✅ Restaurant concurrent trouvé : ${otherRestaurantData.name}`);
        otherRestaurantContext = 
          `📍 **${otherRestaurantData.name}**\n` +
          `- Adresse : ${otherRestaurantData.address}\n` +
          `- Note : ${otherRestaurantData.rating}/5 (${otherRestaurantData.user_ratings_total} avis)\n` +
          `- Services proposés : ${JSON.stringify(otherRestaurantData.service_options, null, 2)}\n` +
          `- Menu : ${otherRestaurantData.structured_data ? formatMenu(otherRestaurantData.structured_data) : "Non disponible"}`;
      } else {
        console.log(`🚨 Aucune donnée trouvée pour "${otherRestaurant}".`);
        otherRestaurantContext = `Je n'ai pas trouvé d'informations sur **${otherRestaurant}** dans ma base.`;
      }
    }

    // 🔹 Recherche des concurrents dans le même quartier et offrant des services similaires
    let competitorContext = "";
    if (location) {
      console.log(`🔍 Recherche des concurrents dans le quartier : ${location}`);
      const competitors = await Producer.find({
        _id: { $ne: producerId },
        address: { $regex: new RegExp(location, "i") },  // Recherche dans le même quartier
      }).sort({ rating: -1 }).limit(5);

      if (competitors.length > 0) {
        console.log(`🔍 ${competitors.length} concurrents trouvés dans ${location}.`);
        competitorContext = competitors.map((competitor, index) => 
          `${index + 1}. **${competitor.name}**\n` +
          `📍 Adresse : ${competitor.address}\n` +
          `📞 Téléphone : ${competitor.phone_number || "Non spécifié"}\n` +
          `⭐ Note : ${competitor.rating}/5 (${competitor.user_ratings_total} avis)\n` +
          `🍽️ Menu : ${competitor.structured_data ? formatMenu(competitor.structured_data) : "Non disponible"}`
        ).join("\n\n");
      } else {
        competitorContext = `Aucun concurrent trouvé dans le quartier **${location}**.`;
      }
    }

    // 🔹 Récupérer les 1000 premiers producteurs (paginer si nécessaire)
    console.log("🔍 Récupération des 1000 premiers producteurs...");
    const allProducers = await Producer.find({}).limit(1000); // Limite à 1000
    console.log(`📂 Nombre total de producteurs récupérés : ${allProducers.length}`);
    
    // Debug : Afficher les détails de l'un des producteurs récupérés
    if (allProducers.length > 0) {
      console.log("🔍 Exemple de producteur dans les 1000 premiers :");
      console.log(allProducers[0]); // Afficher un exemple de producteur
    }

    // 🔹 Ajouter toutes les informations dans le contexte
    const producerContext = 
      `📌 **Informations sur ${producer.name}** :\n` +
      `- Adresse : ${producer.address}\n` +
      `- Téléphone : ${producer.phone_number}\n` +
      `- Site Web : ${producer.website}\n` +
      `- Note globale : ${producer.rating}/5 (${producer.user_ratings_total} avis)\n` +
      `- Services proposés : ${JSON.stringify(producer.service_options, null, 2)}\n` +
      `- Menu : ${producer.structured_data ? JSON.stringify(producer.structured_data, null, 2) : "Non disponible"}`;

    let systemContext = `Voici les informations sur **${producer.name}** ainsi que ses concurrents :\n\n${producerContext}\n\n**Concurrents similaires :**\n\n${competitorContext}\n\n`;

    if (otherRestaurantContext.length > 0) {
      systemContext += `\n\n🔎 **Autre restaurant recherché :**\n\n${otherRestaurantContext}`;
    }

    // Ajouter l'historique de la conversation avec le contexte
    ProducerChatHistory.push({ role: "system", content: systemContext });
    ProducerChatHistory.push({ role: "user", content: userMessage });

    // 🔹 Envoyer la requête à GPT-4o-mini
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: ProducerChatHistory,
    });

    const botReply = response.choices[0].message.content;

    // 🔹 Sauvegarde des messages (user & bot) dans MongoDB
    await ProducerChatMessage.create({ producerId, role: "user", text: userMessage });
    await ProducerChatMessage.create({ producerId, role: "assistant", text: botReply });

    res.json({ reply: botReply });
  } catch (error) {
    console.error("❌ Erreur ChatBot :", error);
    res.status(500).json({ error: "Erreur interne du serveur." });
  }
});


// Fonction pour formater les menus d'un restaurant
function formatMenu(menuData) {
  if (!menuData || typeof menuData !== "object") return "Non disponible.";

  let menuFormatted = [];
  if (Array.isArray(menuData)) {
    menuFormatted = menuData.map((item) =>
      `🍽️ **${item.name || "Plat inconnu"}** - ${item.price || "Prix non spécifié"}${item.description ? `\n   📝 ${item.description}` : ""}`
    );
  } else {
    // Si structured_data est un objet avec des catégories de menus
    Object.keys(menuData).forEach((category) => {
      if (Array.isArray(menuData[category])) {
        menuFormatted.push(`📌 **${category}**`);
        menuData[category].forEach((item) => {
          menuFormatted.push(`🍽️ **${item.name || "Plat inconnu"}** - ${item.price || "Prix non spécifié"}${item.description ? `\n   📝 ${item.description}` : ""}`);
        });
      }
    });
  }

  return menuFormatted.length > 0 ? menuFormatted.join("\n") : "Non disponible.";
}


// 📌 🔹 Route pour récupérer l'historique des conversations d'un producer
router.get("/history/:producerId", async (req, res) => {
  try {
    const { producerId } = req.params;
    if (!producerId) {
      return res.status(400).json({ error: "Producer ID manquant." });
    }

    const messages = await ProducerChatMessage.find({ producerId }).sort({ timestamp: -1 }).limit(50);
    res.json({ history: messages });
  } catch (error) {
    console.error("❌ Erreur lors de la récupération de l'historique :", error);
    res.status(500).json({ error: "Erreur interne du serveur." });
  }
});

// 📌 🔹 Route de test pour vérifier la connexion à OpenAI avec GPT-4o-mini
router.get("/test", async (req, res) => {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini", // ✅ Vérification avec GPT-4o-mini
      messages: [{ role: "user", content: "Hello, how are you?" }],
    });

    res.json({ reply: response.choices[0].message.content });
  } catch (error) {
    console.error("❌ Erreur OpenAI :", error);
    res.status(500).json({ error: "Impossible de se connecter à OpenAI." });
  }
});

router.post("/user/chat", async (req, res) => {
  try {
    const { userId, userMessage } = req.body;

    if (!userId || !userMessage) {
      return res.status(400).json({ error: "Données invalides." });
    }

    console.log(`🟢 Requête reçue de ${userId} : ${userMessage}`);

    // 🔍 Récupération du profil utilisateur pour personnaliser la réponse
    const user = await User.findOne({ _id: userId });
    if (!user) {
      return res.status(404).json({ error: "Utilisateur introuvable." });
    }

    const { liked_tags, sector_preferences, followers_count, influence_score } = user;
    const isVegan = sector_preferences?.food?.vegan || false;
    const avgSpending = sector_preferences?.food?.avg_spending || null;
    const preferredStyles = sector_preferences?.culture?.preferred_styles || [];
    const eventTypes = sector_preferences?.culture?.event_types || [];

    // 🔹 Détection de la catégorie de la requête en fonction des préférences utilisateur
    const isRestaurantQuery = /restaurant|dîner|repas|cuisine|menu|table|plats|bistronomique|gastronomique|réserver|carte/i.test(userMessage) || liked_tags.includes("restaurant");
    const isLeisureQuery = /théâtre|cinéma|musée|concert|spectacle|activité|loisir|parc|exposition/i.test(userMessage) || preferredStyles.length > 0;
    const isEventQuery = /événement|festival|agenda|programme|soirée|activité spéciale/i.test(userMessage) || eventTypes.length > 0;

    let dbModel;
    if (isRestaurantQuery) {
      dbModel = RestaurantProducer;
    } else if (isLeisureQuery) {
      dbModel = LeisureProducer;
    } else if (isEventQuery) {
      dbModel = Event;
    }

    if (!dbModel) {
      return res.status(400).json({ error: "Aucune catégorie de recherche identifiée." });
    }

    // 🔹 Recherche dans la base de données avec filtres utilisateur (vegan, budget, styles préférés)
    let queryFilters = {};
    if (isRestaurantQuery) {
      queryFilters = isVegan ? { category: "Vegan" } : {};
      if (avgSpending) queryFilters.price_level = { $lte: avgSpending / 10 };
    } else if (isLeisureQuery) {
      queryFilters = preferredStyles.length > 0 ? { category: { $in: preferredStyles } } : {};
    } else if (isEventQuery) {
      queryFilters = eventTypes.length > 0 ? { category: { $in: eventTypes } } : {};
    }

    const foundData = await dbModel.find({ name: { $regex: new RegExp(userMessage, "i") }, ...queryFilters }).limit(5);
    let systemContext = "";

    if (foundData.length > 0) {
      systemContext = `Voici les résultats trouvés selon vos préférences (${user.bio ? user.bio : "aucune description"}) :\n\n`;
      systemContext += foundData.map((item, index) => formatFoundData(item, index + 1)).join("\n");
    } else {
      systemContext = `🚨 Aucun résultat trouvé pour \"${userMessage}\".`;
    }

    // 🔹 Prise en compte du niveau d'influence (followers, interactions)
    if (followers_count > 500) {
      systemContext += "\n🎉 En tant qu'utilisateur influent, voici des recommandations exclusives pour vous !";
    }
    
    // 🔹 Récupération de l'historique de conversation
    const messages = await UserChatMessage.find({ userId }).sort({ timestamp: 1 }).limit(10);
    let chatHistory = messages.map((msg) => ({ role: msg.role, content: msg.text }));

    // 🔹 Ajout du contexte au chat avant envoi à GPT
    chatHistory.push({ role: "system", content: systemContext });
    chatHistory.push({ role: "user", content: userMessage });

    console.log(`🛠️ Contexte envoyé à GPT:`, chatHistory);

    // 🔹 Envoi de la requête à GPT-4o-mini
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: chatHistory,
    });

    const botReply = response.choices[0].message.content;

    // 🔹 Sauvegarde des messages (user & bot) dans MongoDB
    await UserChatMessage.create({ userId, role: "user", text: userMessage });
    await UserChatMessage.create({ userId, role: "assistant", text: botReply });

    res.json({ reply: botReply });
  } catch (error) {
    console.error("❌ Erreur ChatBot :", error);
    res.status(500).json({ error: "Erreur interne du serveur." });
  }
});



// 📌 Fonction pour formater les restaurants
function formatRestaurant(restaurant, index = null) {
  return `
  ${index ? `${index}.` : ""} **🍽️ ${restaurant.name}**  
  📍 Adresse : ${restaurant.address}  
  📞 Téléphone : ${restaurant.phone_number || "Non renseigné"}  
  🌐 Site Web : ${restaurant.website || "Non renseigné"}  
  ⭐ Note : ${restaurant.rating}/5 (${restaurant.user_ratings_total} avis)  
  💰 Niveau de prix : ${restaurant.price_level}/4  
  🍕 Type de cuisine : ${restaurant.category ? restaurant.category.join(", ") : "Non spécifié"}  
  🍽️ Services : ${JSON.stringify(restaurant.service_options, null, 2)}  
  📖 Menu : ${restaurant.structured_data && restaurant.structured_data.length > 0 ? formatMenu(restaurant.structured_data) : "Non disponible"}
  👥 Nombre d'abonnés : ${restaurant.abonnés}  
  `;
}

// 📌 Fonction pour formater les loisirs
function formatLeisure(leisure, index = null) {
  return `
  ${index ? `${index}.` : ""} **${leisure.lieu}**  
  📍 Adresse : ${leisure.adresse}  
  📌 [Lien](${leisure.lien_lieu})  
  📝 Nombre de posts : ${leisure.posts.length || 0}  
  💬 Conversations en cours : ${leisure.conversations.length || 0}  
  👥 Nombre de followers : ${leisure.followers.length || 0}  
  `;
}

// 📌 Fonction pour formater les événements
function formatEvent(event, index = null) {
  return `
  ${index ? `${index}.` : ""} **${event.intitulé}**  
  🎭 Lieu : ${event.lieu}  
  🗓️ Dates : ${event.date_debut} → ${event.date_fin}  
  🕒 Horaires : ${event.horaires.map(h => `${h.jour} à ${h.heure}`).join(", ")}  
  ⭐ Note : ${event.note || "Non disponible"}  
  🌐 [Détails](${event.site_url})  
  🛒 [Réserver](${event.purchase_url})  
  `;
// 📌 Fonction pour formater un menu structuré

}

function formatFoundData(data, index = null) {
  if (!data) return "⚠️ Aucune donnée disponible.";

  let formatted = `${index ? `${index}. ` : ""} **${data.name || data.intitulé || data.lieu || "Nom inconnu"}**\n`;

  if (data.address) formatted += `📍 Adresse : ${data.address}\n`;
  if (data.phone_number) formatted += `📞 Téléphone : ${data.phone_number}\n`;
  if (data.website) formatted += `🌐 Site Web : [Voir ici](${data.website})\n`;
  if (data.rating) formatted += `⭐ Note : ${data.rating}/5 (${data.user_ratings_total || "0"} avis)\n`;
  if (data.price_level !== undefined) formatted += `💰 Niveau de prix : ${data.price_level}/4\n`;
  if (data.service_options) formatted += `🛎️ Services proposés : ${JSON.stringify(data.service_options, null, 2)}\n`;

  if (data.structured_data && Object.keys(data.structured_data).length > 0) {
    formatted += `📖 Menu :\n${formatMenu(data.structured_data)}\n`;
  } else {
    formatted += `📖 Menu : Non disponible\n`;
  }

  if (data.abonnés !== undefined) formatted += `👥 Nombre d'abonnés : ${data.abonnés}\n`;
  if (data.lien_lieu) formatted += `📌 [Lieu ici](${data.lien_lieu})\n`;

  return formatted.trim();
}

function formatMenu(menuData) {
  if (!menuData || typeof menuData !== "object") return "Non disponible.";

  let menuFormatted = [];

  if (Array.isArray(menuData)) {
    menuFormatted = menuData.map((item) =>
      `🍽️ **${item.name || "Plat inconnu"}** - ${item.price || "Prix non spécifié"}${item.description ? `\n   📝 ${item.description}` : ""}`
    );
  } else {
    // Si structured_data est un objet avec des catégories de menus
    Object.keys(menuData).forEach((category) => {
      if (Array.isArray(menuData[category])) {
        menuFormatted.push(`📌 **${category}**`);
        menuData[category].forEach((item) => {
          menuFormatted.push(`🍽️ **${item.name || "Plat inconnu"}** - ${item.price || "Prix non spécifié"}${item.description ? `\n   📝 ${item.description}` : ""}`);
        });
      }
    });
  }

  return menuFormatted.length > 0 ? menuFormatted.join("\n") : "Non disponible.";
}

function extractRestaurantName(userMessage) {
  // Recherche du mot-clé "restaurant" suivi d'un nom
  const match = userMessage.match(/restaurant concurrent (.*)/i);
  let otherRestaurant = match ? match[1].trim() : null;

  console.log("Nom extrait de la requête utilisateur :", otherRestaurant); // Debugging line
  
  return otherRestaurant;
}

async function checkDatabaseConnection() {
  try {
    const allProducers = await Producer.find({});
    console.log(`📂 Nombre total de restaurants récupérés : ${allProducers.length}`);
  } catch (error) {
    console.error("❌ Erreur lors de la récupération des restaurants :", error);
  }
}

// Exécuter après la connexion MongoDB
restaurationDb.once("connected", checkDatabaseConnection);



module.exports = router;



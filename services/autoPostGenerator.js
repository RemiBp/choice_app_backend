/**
 * Auto Post Generator pour Choice App
 * Service de génération automatique de posts utilisant DeepSeek
 * 
 * Ce service se connecte au serveur vast.ai terminal 4 pour générer des posts
 * engageants en se basant sur les événements à venir et les profils de producteurs.
 */

const axios = require('axios');
const mongoose = require('mongoose');
require('dotenv').config();

// Configuration de la connexion à DeepSeek
// Utiliser une variable d'environnement si disponible, sinon utiliser la valeur par défaut
const DEEPSEEK_SERVER_URL = process.env.DEEPSEEK_URL || 'https://79.116.152.57:39370/terminals/4';
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || 'sk-vastai-demo-key';
const API_TIMEOUT = 60000; // 60 secondes

console.log(`🔌 Configuration DeepSeek: utilisation du terminal ${DEEPSEEK_SERVER_URL}`);

// Connexions MongoDB
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

// Modèles MongoDB
const User = usersDb.model("User", new mongoose.Schema({}, { strict: false }), "Users");
const Post = usersDb.model("Post", new mongoose.Schema({}, { strict: false }), "Posts");
const Producer = restaurationDb.model("Producer", new mongoose.Schema({}, { strict: false }), "producers");
const LeisureProducer = loisirsDb.model("LeisureProducer", new mongoose.Schema({}, { strict: false }), "Loisir_Paris_Producers");
const Event = loisirsDb.model("Event", new mongoose.Schema({}, { strict: false }), "Loisir_Paris_Evenements");

/**
 * Configure axios pour accepter les certificats auto-signés
 * (Nécessaire pour le serveur vast.ai)
 */
const axiosInstance = axios.create({
  httpsAgent: new (require('https').Agent)({
    rejectUnauthorized: false
  }),
  headers: {
    // Ajout d'en-têtes d'authentification pour DeepSeek
    'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  },
  timeout: API_TIMEOUT
});

/**
 * Parse une date au format français (DD/MM/YYYY)
 * @param {string} dateStr - La date sous forme de chaîne
 * @returns {Date|null} - Objet Date ou null si format invalide
 */
function parseFrenchDate(dateStr) {
  if (!dateStr) return null;
  
  // Handle textual dates like "sam 15 févr."
  if (dateStr.includes('janv')) return new Date(new Date().getFullYear(), 0, parseInt(dateStr.match(/\d+/)?.[0] || 1));
  if (dateStr.includes('févr')) return new Date(new Date().getFullYear(), 1, parseInt(dateStr.match(/\d+/)?.[0] || 1));
  if (dateStr.includes('mars')) return new Date(new Date().getFullYear(), 2, parseInt(dateStr.match(/\d+/)?.[0] || 1));
  if (dateStr.includes('avr')) return new Date(new Date().getFullYear(), 3, parseInt(dateStr.match(/\d+/)?.[0] || 1));
  if (dateStr.includes('mai')) return new Date(new Date().getFullYear(), 4, parseInt(dateStr.match(/\d+/)?.[0] || 1));
  if (dateStr.includes('juin')) return new Date(new Date().getFullYear(), 5, parseInt(dateStr.match(/\d+/)?.[0] || 1));
  if (dateStr.includes('juil')) return new Date(new Date().getFullYear(), 6, parseInt(dateStr.match(/\d+/)?.[0] || 1));
  if (dateStr.includes('août')) return new Date(new Date().getFullYear(), 7, parseInt(dateStr.match(/\d+/)?.[0] || 1));
  if (dateStr.includes('sept')) return new Date(new Date().getFullYear(), 8, parseInt(dateStr.match(/\d+/)?.[0] || 1));
  if (dateStr.includes('oct')) return new Date(new Date().getFullYear(), 9, parseInt(dateStr.match(/\d+/)?.[0] || 1));
  if (dateStr.includes('nov')) return new Date(new Date().getFullYear(), 10, parseInt(dateStr.match(/\d+/)?.[0] || 1));
  if (dateStr.includes('déc')) return new Date(new Date().getFullYear(), 11, parseInt(dateStr.match(/\d+/)?.[0] || 1));
  
  // Format DD/MM/YYYY
  const parts = dateStr.split('/');
  if (parts.length === 3) {
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1; // Les mois commencent à 0 en JS
    const year = parseInt(parts[2], 10);
    
    if (!isNaN(day) && !isNaN(month) && !isNaN(year)) {
      return new Date(year, month, day);
    }
  }
  
  // Essayer le format standard Date de JS en dernier recours
  const standardDate = new Date(dateStr);
  return isNaN(standardDate.getTime()) ? null : standardDate;
}

/**
 * Vérifie si un événement est terminé (sa date de fin est passée)
 * @param {Object} event - L'événement à vérifier
 * @returns {boolean} - Vrai si l'événement est terminé
 */
function isEventEnded(event) {
  const today = new Date();
  
  // Si date_fin existe, utiliser cette date
  if (event.date_fin) {
    const endDate = parseFrenchDate(event.date_fin);
    if (endDate && endDate < today) {
      return true;
    }
  }
  
  // Si prochaines_dates existe, vérifier si la dernière date est passée
  if (event.prochaines_dates && typeof event.prochaines_dates === 'string') {
    // Si "Dates non disponibles", considérer comme non terminé
    if (event.prochaines_dates === "Dates non disponibles") {
      return false;
    }
    
    // Chercher la dernière date dans la chaîne
    const dateMatches = event.prochaines_dates.match(/\d{1,2}\/\d{1,2}\/\d{4}|\d{1,2} (janv|févr|mars|avr|mai|juin|juil|août|sept|oct|nov|déc)/g);
    
    if (dateMatches && dateMatches.length > 0) {
      const lastDate = parseFrenchDate(dateMatches[dateMatches.length - 1]);
      if (lastDate && lastDate < today) {
        return true;
      }
    }
  }
  
  // Par défaut, considérer comme non terminé si pas d'info claire
  return false;
}

/**
 * Extrait les informations pertinentes d'un événement pour la génération de post
 * @param {Object} event - L'événement à analyser
 * @returns {Object} - Les données structurées pour le prompt
 */
function extractEventData(event) {
  // Extraire le prix formaté (ou null si indisponible)
  let price = null;
  if (event.prix_reduit && event.prix_reduit !== "") {
    price = event.prix_reduit;
  } else if (event.catégories_prix && Array.isArray(event.catégories_prix) && event.catégories_prix.length > 0) {
    const firstCategory = event.catégories_prix[0];
    if (firstCategory.Prix && Array.isArray(firstCategory.Prix) && firstCategory.Prix.length > 0) {
      price = firstCategory.Prix[0];
    }
  }
  
  // Extraire le lineup
  let lineup = [];
  if (event.lineup && Array.isArray(event.lineup) && event.lineup.length > 0) {
    lineup = event.lineup
      .filter(artist => artist.nom)
      .map(artist => ({
        name: artist.nom,
        image: artist.image || null
      }));
  }
  
  // Extraire les dates formatées
  let dates = [];
  if (event.prochaines_dates && typeof event.prochaines_dates === 'string') {
    if (event.prochaines_dates !== "Dates non disponibles") {
      dates = event.prochaines_dates.split(',').map(d => d.trim());
    }
  }
  
  // Extraire les horaires
  let schedule = [];
  if (event.horaires && Array.isArray(event.horaires) && event.horaires.length > 0) {
    schedule = event.horaires.map(h => ({
      day: h.jour || '',
      time: h.heure || ''
    })).filter(h => h.day || h.time);
  }
  
  return {
    id: event._id,
    title: event.intitulé || event.nom || 'Événement sans titre',
    category: event.catégorie || '',
    description: event.détail || event.description || '',
    venue: event.lieu || '',
    venueLink: event.lien_lieu || '',
    price: price,
    originalPrice: event.ancien_prix || null,
    dates: dates,
    schedule: schedule,
    rating: event.note || null,
    image: event.image || '',
    lineup: lineup,
    location: event.location || null
  };
}

/**
 * Extrait les informations pertinentes d'un producteur pour la génération de post
 * @param {Object} producer - Le producteur à analyser
 * @returns {Object} - Les données structurées pour le prompt
 */
function extractProducerData(producer) {
  // Extraire les plats notables pour les restaurants
  let notableItems = [];
  
  if (producer.structured_data?.menu?.items) {
    notableItems = producer.structured_data.menu.items
      .filter(item => item.name && item.price)
      .slice(0, 5)
      .map(item => ({
        name: item.name,
        price: item.price,
        description: item.description || ''
      }));
  } else if (producer['Items Indépendants'] && Array.isArray(producer['Items Indépendants'])) {
    // Parcourir toutes les catégories et extraire jusqu'à 5 plats
    for (const category of producer['Items Indépendants']) {
      if (category.items && Array.isArray(category.items)) {
        const items = category.items
          .filter(item => item.nom && (item.prix || item.note))
          .map(item => ({
            name: item.nom,
            price: item.prix || '',
            description: item.description || '',
            rating: item.note || null,
            category: category.catégorie || ''
          }));
        
        notableItems.push(...items);
        
        if (notableItems.length >= 5) {
          notableItems = notableItems.slice(0, 5);
          break;
        }
      }
    }
  }
  
  return {
    id: producer._id,
    name: producer.name || producer.nom || 'Producteur sans nom',
    category: producer.category || [],
    description: producer.description || '',
    address: producer.address || producer.adresse || '',
    rating: producer.rating || null,
    price_level: producer.price_level || null,
    notableItems: notableItems,
    contacts: producer.contacts || null,
    image: producer.photo_url || producer.photo || (producer.photos && producer.photos.length > 0 ? producer.photos[0] : null)
  };
}

/**
 * Génère un prompt pour DeepSeek adapté au type d'entité
 * @param {string} type - Le type d'entité ('restaurant', 'leisure')
 * @param {Object} data - Les données structurées de l'entité
 * @param {Object} referencedEvent - Données d'un événement référencé (optionnel)
 * @param {Object} options - Options supplémentaires pour la génération
 * @returns {string} - Le prompt formaté pour DeepSeek
 */
function generatePrompt(type, data, referencedEvent = null, options = {}) {
  const { tone = 'enthousiaste', length = 'moyen' } = options;
  
  let systemPrompt = `Tu es un créateur de contenu engageant pour l'application Choice qui aide les utilisateurs à découvrir des expériences locales. 
Ton objectif est de générer un post qui donne envie aux utilisateurs de découvrir ce lieu ou cet événement.

RÈGLES CRITIQUES:
1. Tu dois UNIQUEMENT utiliser les informations fournies. N'INVENTE JAMAIS de faits, de caractéristiques, de prix ou d'autres détails.
2. Si une information n'est pas disponible, adapte ton texte sans l'inventer.
3. Adopte un ton ${tone} et créatif qui donne envie d'y aller.
4. Écris un post de longueur ${length} (100-150 mots maximum).
5. Inclus uniquement des facts réels mentionnés dans les données fournies.
6. Ne mentionne pas "Choice" dans le texte.
7. Utilise la 2ème personne du pluriel (vous) pour t'adresser aux utilisateurs.
8. Ne jamais inclure d'informations qui ne sont pas présentes dans les données fournies.
`;

  let userPrompt = '';
  
  switch (type) {
    case 'restaurant':
      systemPrompt += `\nPour ce restaurant:
- Mets en valeur les plats spécifiques s'ils sont mentionnés
- S'il y a une spécialité mentionnée dans la description ou la catégorie, mets-la en avant
- Ne crée JAMAIS de plats ou de spécialités qui ne sont pas mentionnés dans les données
- Évite les phrases génériques sur la "cuisine délicieuse" sans mentionner des spécificités réelles`;

      userPrompt = `Génère un post engageant pour ce restaurant:\n
Nom: ${data.name}
Adresse: ${data.address}
Catégorie(s): ${Array.isArray(data.category) ? data.category.join(', ') : data.category}
Description: ${data.description}
Note: ${data.rating !== null ? `${data.rating}/5` : 'Non notée'}
Niveau de prix: ${data.price_level !== null ? `${data.price_level}/4` : 'Non spécifié'}`;

      // Ajouter les plats notables s'ils existent
      if (data.notableItems && data.notableItems.length > 0) {
        userPrompt += `\nPlats notables:`;
        data.notableItems.forEach(item => {
          userPrompt += `\n- ${item.name}${item.price ? ` (${item.price})` : ''}${item.description ? `: ${item.description}` : ''}`;
        });
      }
      break;
      
    case 'leisure':
      if (referencedEvent) {
        // Post de lieu de loisir avec référence à un événement spécifique
        systemPrompt += `\nPour ce lieu de loisir qui présente un événement spécifique:
- Mets en valeur le lieu ET l'événement qu'il accueille
- Présente l'événement comme quelque chose d'organisé par le lieu, pas comme une entité séparée
- Mentionne les dates de l'événement si elles sont disponibles
- Si des détails de prix sont disponibles pour l'événement, inclus-les
- Si l'événement a un lineup d'artistes, mentionne-les de manière naturelle
- Évite les phrases génériques et crée un contenu qui montre la spécificité de cet événement dans ce lieu`;

        userPrompt = `Génère un post pour ce lieu de loisir qui présente un événement spécifique:\n
Lieu: ${data.name}
Adresse: ${data.address}
Catégorie du lieu: ${Array.isArray(data.category) ? data.category.join(', ') : data.category}
Description du lieu: ${data.description}

Événement présenté: ${referencedEvent.title}
Catégorie de l'événement: ${referencedEvent.category}
Description de l'événement: ${referencedEvent.description}
Date(s): ${referencedEvent.dates.join(', ') || 'Non spécifiée'}
Horaires: ${referencedEvent.schedule.map(h => `${h.day} ${h.time}`).join(', ') || 'Non spécifiés'}
Prix: ${referencedEvent.price || 'Non spécifié'}`;

        // Ajouter le lineup si disponible
        if (referencedEvent.lineup && referencedEvent.lineup.length > 0) {
          userPrompt += `\nArtistes: ${referencedEvent.lineup.map(a => a.name).join(', ')}`;
        }
      } else {
        // Post standard de lieu de loisir sans événement spécifique
        systemPrompt += `\nPour ce lieu de loisir:
- Mets en valeur l'expérience unique offerte par ce lieu
- Si des particularités sont mentionnées, souligne-les
- Ne crée JAMAIS d'attractions ou d'activités qui ne sont pas mentionnées dans les données
- Évite les phrases génériques sur "l'expérience incroyable" sans mentionner des spécificités réelles`;

        userPrompt = `Génère un post engageant pour ce lieu de loisir:\n
Nom: ${data.name}
Adresse: ${data.address}
Catégorie(s): ${Array.isArray(data.category) ? data.category.join(', ') : data.category}
Description: ${data.description}
Note: ${data.rating !== null ? `${data.rating}/5` : 'Non notée'}`;
      }
      break;
      
    default:
      userPrompt = `Génère un post engageant pour cette entité:\n${JSON.stringify(data, null, 2)}`;
  }
  
  return {
    systemPrompt,
    userPrompt
  };
}

/**
 * Génère un post en utilisant DeepSeek
 * @param {string} type - Le type d'entité ('restaurant', 'leisure')
 * @param {Object} data - Les données structurées de l'entité
 * @param {Object} referencedEvent - Données d'un événement référencé (optionnel)
 * @param {Object} options - Options supplémentaires pour la génération
 * @returns {Promise<string>} - Le texte du post généré
 */
async function generatePost(type, data, referencedEvent = null, options = {}) {
  try {
    console.log(`🤖 Génération de post pour un ${type}${referencedEvent ? ' avec événement référencé' : ''}...`);
    const { systemPrompt, userPrompt } = generatePrompt(type, data, referencedEvent, options);
    
    const payload = {
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      temperature: 0.7,
      top_p: 0.9,
      max_tokens: 500
    };
    
    console.log(`🔄 Connexion à DeepSeek (${DEEPSEEK_SERVER_URL})...`);
    try {
      const response = await axiosInstance.post(`${DEEPSEEK_SERVER_URL}/v1/chat/completions`, payload);
      
      if (response.data && response.data.choices && response.data.choices.length > 0) {
        const generatedText = response.data.choices[0].message.content.trim();
        console.log(`✅ Post généré avec succès via DeepSeek (${generatedText.length} caractères)`);
        return generatedText;
      } else {
        console.error('❌ Réponse DeepSeek invalide:', response.data);
        throw new Error('Format de réponse DeepSeek invalide');
      }
    } catch (error) {
      // Log détaillé de l'erreur pour diagnostic
      console.error(`❌ Erreur DeepSeek (${DEEPSEEK_SERVER_URL}):`, error.message);
      if (error.response) {
        console.error('📌 Statut:', error.response.status);
        console.error('📌 Headers:', JSON.stringify(error.response.headers, null, 2));
        console.error('📌 Données:', JSON.stringify(error.response.data, null, 2));
      }
      throw error;
    }
  } catch (error) {
    console.error('❌ Erreur lors de la génération du post:', error.message);
    
    // En cas d'erreur, générer un post de secours simple
    return generateFallbackPost(type, data, referencedEvent);
  }
}

/**
 * Génère un post de secours sans IA en cas d'échec
 * @param {string} type - Le type d'entité
 * @param {Object} data - Les données de l'entité
 * @param {Object} referencedEvent - Données d'un événement référencé (optionnel)
 * @returns {string} - Post de secours
 */
function generateFallbackPost(type, data, referencedEvent = null) {
  switch (type) {
    case 'restaurant':
      return `🍽️ Découvrez ${data.name}${data.category ? `, ${Array.isArray(data.category) ? data.category[0] : data.category}` : ''} à ${data.address}.${data.rating ? ` Note: ${data.rating}/5.` : ''}`;
      
    case 'leisure':
      if (referencedEvent) {
        return `🎭 ${data.name} présente: ${referencedEvent.title}${referencedEvent.dates.length > 0 ? ` le ${referencedEvent.dates[0]}` : ''}${referencedEvent.price ? ` à partir de ${referencedEvent.price}` : ''}.`;
      } else {
        return `🎭 Explorez ${data.name} à ${data.address}.${data.description ? ` ${data.description.substring(0, 100)}...` : ''}`;
      }
      
    default:
      return `Découvrez cette nouvelle expérience sur Choice !`;
  }
}

/**
 * Vérifie si un post similaire existe déjà pour éviter les doublons
 * @param {string} type - Le type d'entité
 * @param {string} entityId - ID de l'entité
 * @param {string} eventId - ID de l'événement référencé (optionnel)
 * @returns {Promise<boolean>} - Vrai si un post similaire existe
 */
async function isDuplicate(type, entityId, eventId = null) {
  try {
    // Critères de base
    let criteria = {
      is_automated: true
    };
    
    // Ajouter critères spécifiques selon le type
    switch (type) {
      case 'restaurant':
        criteria.isProducerPost = true;
        criteria.isLeisureProducer = false;
        criteria.producer_id = entityId;
        break;
      
      case 'leisure':
        criteria.isProducerPost = true;
        criteria.isLeisureProducer = true;
        criteria.producer_id = entityId;
        
        // Si événement référencé, ajouter à la requête
        if (eventId) {
          criteria.referenced_event_id = eventId;
        }
        break;
    }
    
    // Vérifier s'il existe un post récent (dernières 48h) avec ces critères
    const twoDaysAgo = new Date();
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
    
    criteria.time_posted = { $gt: twoDaysAgo };
    
    const count = await Post.countDocuments(criteria);
    return count > 0;
  } catch (error) {
    console.error('❌ Erreur lors de la vérification des doublons:', error);
    // En cas d'erreur, supposer qu'il n'y a pas de doublon pour permettre la création
    return false;
  }
}

/**
 * Crée un post dans la base de données
 * @param {string} type - Le type d'entité
 * @param {Object} entity - L'entité liée au post
 * @param {string} content - Le contenu du post
 * @param {Object} options - Options supplémentaires
 * @returns {Promise<Object>} - Le post créé
 */
async function createPost(type, entity, content, options = {}) {
  try {
    const { authorId = null, eventId = null } = options;
    
    // Récupérer les informations de l'auteur
    let authorName = 'Choice';
    let authorAvatar = '/defaultAppAvatar.png';
    
    if (authorId) {
      const authorModel = type === 'restaurant' ? Producer : LeisureProducer;
      const author = await authorModel.findById(authorId);
      if (author) {
        authorName = author.name || author.nom || 'Producteur';
        authorAvatar = author.photo_url || author.photo || author.avatar || '/defaultAppAvatar.png';
      }
    }
    
    // Déterminer les attributs selon le type
    let postData = {
      content: content,
      time_posted: new Date(),
      is_automated: true,
      author: {
        id: authorId || 'auto',
        name: authorName,
        avatar: authorAvatar
      },
      likes: 0,
      comments: 0,
      media: entity.image ? [
        {
          type: 'image',
          url: entity.image,
          width: 800,
          height: 600
        }
      ] : []
    };
    
    // Ajouter les attributs spécifiques selon le type
    switch (type) {
      case 'restaurant':
        postData.isProducerPost = true;
        postData.isLeisureProducer = false;
        postData.producer_id = entity.id;
        break;
        
      case 'leisure':
        postData.isProducerPost = true;
        postData.isLeisureProducer = true;
        postData.producer_id = entity.id;
        
        // Si le post référence un événement
        if (eventId) {
          postData.referenced_event_id = eventId;
          
          // Si l'entité a un événement référencé, ajouter ses médias
          if (options.referencedEvent && options.referencedEvent.image) {
            // Pour les événements avec lineup, ajouter les images des artistes
            if (options.referencedEvent.lineup && options.referencedEvent.lineup.length > 0) {
              const artistImages = options.referencedEvent.lineup
                .filter(artist => artist.image)
                .map(artist => ({
                  type: 'image',
                  url: artist.image,
                  width: 400,
                  height: 400,
                  is_artist: true
                }))
                .slice(0, 3); // Limiter à 3 images d'artistes
              
              postData.media = [...postData.media, ...artistImages];
            }
            
            // Ajouter l'image principale de l'événement
            if (!postData.media.some(m => m.url === options.referencedEvent.image)) {
              postData.media.push({
                type: 'image',
                url: options.referencedEvent.image,
                width: 800,
                height: 600,
                is_event: true
              });
            }
          }
        }
        break;
    }
    
    // Ajouter localisation si disponible
    if (entity.location && entity.location.coordinates) {
      postData.location = {
        type: 'Point',
        coordinates: entity.location.coordinates
      };
    }
    
    // Créer le post dans la base de données
    const newPost = await Post.create(postData);
    console.log(`✅ Post créé avec succès dans la base de données. ID: ${newPost._id}`);
    
    // Si le post référence un événement, mettre à jour l'événement
    if (eventId) {
      await Event.findByIdAndUpdate(eventId, {
        $push: { posts: newPost._id }
      });
      console.log(`✅ Événement ${eventId} mis à jour avec le nouveau post référencé`);
    }
    
    // Si le post est lié à un producteur, mettre à jour le producteur
    if ((type === 'restaurant' || type === 'leisure') && entity.id) {
      const model = type === 'restaurant' ? Producer : LeisureProducer;
      await model.findByIdAndUpdate(entity.id, {
        $push: { posts: newPost._id }
      });
      console.log(`✅ Producteur ${entity.id} mis à jour avec le nouveau post`);
    }
    
    return newPost;
  } catch (error) {
    console.error('❌ Erreur lors de la création du post:', error);
    throw error;
  }
}

/**
 * Trouve des événements appropriés pour un lieu de loisir
 * @param {string} leisureId - ID du lieu de loisir
 * @param {number} limit - Nombre maximum d'événements à trouver
 * @returns {Promise<Array>} - Événements appropriés
 */
async function findEventsForLeisure(leisureId, limit = 3) {
  try {
    // Assurer que limit est positif
    const safeLimit = Math.max(1, limit);
    
    // Récupérer le lieu de loisir
    const leisure = await LeisureProducer.findById(leisureId);
    if (!leisure) {
      return [];
    }
    
    // Critères de recherche
    let criteria = {};
    
    // Si le lieu a un nom, chercher des événements dans ce lieu
    if (leisure.nom) {
      criteria.$or = [
        { lieu: leisure.nom },
        { lieu: { $regex: leisure.nom, $options: 'i' } }
      ];
    }
    
    // Si le lieu a des coordonnées, chercher des événements à proximité
    if (leisure.location && leisure.location.coordinates) {
      if (!criteria.$or) criteria.$or = [];
      
      criteria.$or.push({
        location: {
          $near: {
            $geometry: {
              type: 'Point',
              coordinates: leisure.location.coordinates
            },
            $maxDistance: 1000 // 1km
          }
        }
      });
    }
    
    // Si pas de critères valides, retourner vide
    if (!criteria.$or || criteria.$or.length === 0) {
      return [];
    }
    
    // Trouver des événements qui ne sont pas terminés
    const events = await Event.find(criteria).limit(safeLimit * 3);
    
    // Filtrer les événements terminés
    const activeEvents = events.filter(event => !isEventEnded(event));
    
    // Retourner les événements actifs, limités
    return activeEvents.slice(0, safeLimit);
  } catch (error) {
    console.error('❌ Erreur lors de la recherche d\'événements pour le lieu:', error);
    return [];
  }
}

/**
 * Génère un post automatique pour un restaurant
 * @param {string} producerId - ID du restaurant
 * @param {Object} options - Options de génération
 * @returns {Promise<Object>} - Le post généré
 */
async function generateRestaurantPost(producerId, options = {}) {
  try {
    console.log(`🍽️ Génération de post pour le restaurant: ${producerId}`);
    
    // Vérifier si un post similaire existe déjà
    const isDuplicatePost = await isDuplicate('restaurant', producerId);
    if (isDuplicatePost) {
      console.log(`⚠️ Un post similaire existe déjà pour ce restaurant, génération annulée`);
      return null;
    }
    
    // Récupérer le restaurant
    const restaurant = await Producer.findById(producerId);
    if (!restaurant) {
      throw new Error(`Restaurant non trouvé: ${producerId}`);
    }
    
    // Extraire les données structurées
    const restaurantData = extractProducerData(restaurant);
    
    // Générer le contenu du post
    const postContent = await generatePost('restaurant', restaurantData, null, {
      ...options,
      authorId: producerId // Utiliser le restaurant comme auteur
    });
    
    // Créer le post dans la base de données
    const post = await createPost('restaurant', restaurantData, postContent, {
      ...options,
      authorId: producerId
    });
    
    return post;
  } catch (error) {
    console.error(`❌ Erreur lors de la génération du post pour le restaurant ${producerId}:`, error.message);
    throw error;
  }
}

/**
 * Génère un post automatique pour un lieu de loisir
 * @param {string} producerId - ID du lieu de loisir
 * @param {Object} options - Options de génération
 * @returns {Promise<Object>} - Le post généré
 */
async function generateLeisurePost(producerId, options = {}) {
  try {
    console.log(`🎭 Génération de post pour le lieu de loisir: ${producerId}`);
    
    // Récupérer le lieu de loisir
    const leisure = await LeisureProducer.findById(producerId);
    if (!leisure) {
      throw new Error(`Lieu de loisir non trouvé: ${producerId}`);
    }
    
    // 50% de chance de créer un post avec référence à un événement
    const shouldReferenceEvent = Math.random() < 0.5;
    
    let referencedEvent = null;
    let eventData = null;
    
    if (shouldReferenceEvent) {
      // Chercher des événements appropriés pour ce lieu
      const events = await findEventsForLeisure(producerId, 3);
      
      if (events.length > 0) {
        // Choisir un événement aléatoire
        const randomEvent = events[Math.floor(Math.random() * events.length)];
        
        // Vérifier si un post similaire existe déjà pour cet événement
        const isDuplicatePost = await isDuplicate('leisure', producerId, randomEvent._id);
        if (isDuplicatePost) {
          console.log(`⚠️ Un post similaire existe déjà pour ce lieu et cet événement, génération sans référence`);
        } else {
          referencedEvent = randomEvent;
          eventData = extractEventData(referencedEvent);
        }
      }
    }
    
    // Si pas d'événement trouvé, vérifier s'il existe un post récent pour ce lieu
    if (!referencedEvent) {
      const isDuplicatePost = await isDuplicate('leisure', producerId);
      if (isDuplicatePost) {
        console.log(`⚠️ Un post similaire existe déjà pour ce lieu, génération annulée`);
        return null;
      }
    }
    
    // Extraire les données structurées
    const leisureData = extractProducerData(leisure);
    
    // Générer le contenu du post
    const postContent = await generatePost('leisure', leisureData, eventData, {
      ...options,
      authorId: producerId // Utiliser le lieu comme auteur
    });
    
    // Créer le post dans la base de données
    const post = await createPost('leisure', leisureData, postContent, {
      ...options,
      authorId: producerId,
      eventId: referencedEvent ? referencedEvent._id : null,
      referencedEvent: eventData
    });
    
    return post;
  } catch (error) {
    console.error(`❌ Erreur lors de la génération du post pour le lieu ${producerId}:`, error.message);
    throw error;
  }
}

/**
 * Génère un lot de posts pour les événements via les producteurs de loisir
 * @param {number} count - Nombre de posts à générer
 * @returns {Promise<Array>} - Les posts générés
 */
async function generateUpcomingEventsPosts(count = 5) {
  try {
    // Assurer que count est au moins 1
    const safeCount = Math.max(1, count);
    console.log(`🗓️ Génération de ${safeCount} posts avec référence à des événements à venir...`);
    
    // Récupérer la date actuelle
    const now = new Date();
    
    // Récupérer les événements à venir 
    const events = await Event.aggregate([
      { $match: { date_debut: { $exists: true } } },
      { $sample: { size: safeCount * 2 } }
    ]);
    
    console.log(`🔍 ${events.length} événements récupérés pour analyse`);
    
    // Filtrer les événements dont la date n'est pas passée
    const validEvents = events.filter(event => !isEventEnded(event));
    console.log(`✅ ${validEvents.length} événements valides après filtrage par date`);
    
    // Pour chaque événement, trouver un lieu de loisir associé
    const posts = [];
    const eventsToPost = validEvents.slice(0, safeCount);
    
    for (const event of eventsToPost) {
      try {
        // Chercher le lieu associé à l'événement
        let leisureProducer = null;
        
        if (event.lieu) {
          // Rechercher par nom du lieu
          leisureProducer = await LeisureProducer.findOne({ 
            $or: [
              { nom: event.lieu },
              { nom: { $regex: event.lieu, $options: 'i' } }
            ]
          });
        }
        
        // Si aucun lieu trouvé et que l'événement a une localisation, chercher par proximité
        if (!leisureProducer && event.location && event.location.coordinates) {
          leisureProducer = await LeisureProducer.findOne({
            location: {
              $near: {
                $geometry: {
                  type: 'Point',
                  coordinates: event.location.coordinates
                },
                $maxDistance: 500 // 500m
              }
            }
          });
        }
        
        // Si toujours aucun lieu trouvé, en prendre un au hasard
        if (!leisureProducer) {
          const randomProducers = await LeisureProducer.aggregate([
            { $match: { auto_post_enabled: { $ne: false } } },
            { $sample: { size: 1 } }
          ]);
          
          if (randomProducers.length > 0) {
            leisureProducer = randomProducers[0];
          }
        }
        
        // Si on a trouvé un lieu, générer un post
        if (leisureProducer) {
          // Vérifier si un post similaire existe déjà
          const isDuplicatePost = await isDuplicate('leisure', leisureProducer._id, event._id);
          if (isDuplicatePost) {
            console.log(`⚠️ Un post similaire existe déjà pour ce lieu et cet événement, génération annulée`);
            continue;
          }
          
          // Extraire les données
          const leisureData = extractProducerData(leisureProducer);
          const eventData = extractEventData(event);
          
          // Générer le contenu du post
          const postContent = await generatePost('leisure', leisureData, eventData, {
            authorId: leisureProducer._id
          });
          
          // Créer le post dans la base de données
          const post = await createPost('leisure', leisureData, postContent, {
            authorId: leisureProducer._id,
            eventId: event._id,
            referencedEvent: eventData
          });
          
          posts.push(post);
          console.log(`✅ Post généré pour l'événement: ${event.intitulé || event.nom || event._id} via ${leisureProducer.nom}`);
        } else {
          console.log(`⚠️ Aucun lieu trouvé pour l'événement ${event._id}, génération annulée`);
        }
      } catch (error) {
        console.error(`❌ Échec de génération pour l'événement ${event._id}:`, error.message);
      }
    }
    
    return posts;
  } catch (error) {
    console.error('❌ Erreur lors de la génération des posts pour événements:', error);
    throw error;
  }
}

/**
 * Génère un lot de posts pour les restaurants
 * @param {number} count - Nombre de posts à générer
 * @returns {Promise<Array>} - Les posts générés
 */
async function generateTopRestaurantsPosts(count = 3) {
  try {
    // Assurer que count est au moins 1
    const safeCount = Math.max(1, count);
    console.log(`🍽️ Génération de ${safeCount} posts pour des restaurants populaires...`);
    
    // Récupérer des restaurants bien notés qui ont l'automatisation activée
    const restaurants = await Producer.aggregate([
      { 
        $match: { 
          rating: { $gte: 4.0 },
          auto_post_enabled: { $ne: false } // Inclure ceux où le champ n'existe pas ou est true
        } 
      },
      { $sort: { rating: -1 } },
      { $limit: safeCount * 2 } // Prendre plus que nécessaire pour avoir de la marge
    ]);
    
    console.log(`🔍 ${restaurants.length} restaurants récupérés`);
    
    // Générer des posts pour les restaurants (jusqu'au nombre demandé)
    const posts = [];
    const restaurantsToPost = restaurants.slice(0, safeCount);
    
    for (const restaurant of restaurantsToPost) {
      try {
        // Vérifier si un post similaire existe déjà
        const isDuplicatePost = await isDuplicate('restaurant', restaurant._id);
        if (isDuplicatePost) {
          console.log(`⚠️ Un post similaire existe déjà pour ce restaurant, génération annulée`);
          continue;
        }
        
        const post = await generateRestaurantPost(restaurant._id);
        if (post) {
          posts.push(post);
          console.log(`✅ Post généré pour le restaurant: ${restaurant.name || restaurant._id}`);
        }
      } catch (error) {
        console.error(`❌ Échec de génération pour le restaurant ${restaurant._id}:`, error.message);
      }
    }
    
    return posts;
  } catch (error) {
    console.error('❌ Erreur lors de la génération des posts pour restaurants:', error);
    throw error;
  }
}

/**
 * Génère un lot de posts pour les lieux de loisir
 * @param {number} count - Nombre de posts à générer
 * @returns {Promise<Array>} - Les posts générés
 */
async function generateTopLeisurePosts(count = 3) {
  try {
    // Assurer que count est au moins 1
    const safeCount = Math.max(1, count);
    console.log(`🎭 Génération de ${safeCount} posts pour des lieux de loisir populaires...`);
    
    // Récupérer des lieux de loisir qui ont l'automatisation activée
    const leisureVenues = await LeisureProducer.aggregate([
      { 
        $match: { 
          auto_post_enabled: { $ne: false } // Inclure ceux où le champ n'existe pas ou est true
        } 
      },
      { $sample: { size: safeCount * 2 } } // Échantillon aléatoire
    ]);
    
    console.log(`🔍 ${leisureVenues.length} lieux de loisir récupérés`);
    
    // Générer des posts pour les lieux (jusqu'au nombre demandé)
    const posts = [];
    const venuesToPost = leisureVenues.slice(0, safeCount);
    
    for (const venue of venuesToPost) {
      try {
        const post = await generateLeisurePost(venue._id);
        if (post) {
          posts.push(post);
          console.log(`✅ Post généré pour le lieu: ${venue.nom || venue._id}`);
        }
      } catch (error) {
        console.error(`❌ Échec de génération pour le lieu ${venue._id}:`, error.message);
      }
    }
    
    return posts;
  } catch (error) {
    console.error('❌ Erreur lors de la génération des posts pour lieux de loisir:', error);
    throw error;
  }
}

/**
 * Génère un nombre aléatoire de posts de différents types
 * @param {number} maxCount - Nombre maximum de posts à générer
 * @returns {Promise<Array>} - Tous les posts générés
 */
async function generateRandomPosts(maxCount = 5) {
  try {
    // Assurer que maxCount est au moins 1
    const safeMaxCount = Math.max(1, maxCount);
    console.log(`🎲 Génération aléatoire de posts (max ${safeMaxCount})...`);
    
    // Répartir le nombre total entre les différents types, en s'assurant qu'aucune valeur n'est négative ou nulle
    const eventPostsCount = Math.floor(Math.random() * Math.min(3, safeMaxCount)) + 1;
    const remainingCount = Math.max(0, safeMaxCount - eventPostsCount);
    
    // S'assurer que nous avons toujours au moins 1 post de chaque type si possible
    let restaurantPostsCount = 0;
    let leisurePostsCount = 0;
    
    if (remainingCount > 0) {
      // Si nous avons de la marge, répartir entre restaurants et lieux
      if (remainingCount >= 2) {
        restaurantPostsCount = Math.max(1, Math.floor(Math.random() * (remainingCount - 1)));
        leisurePostsCount = Math.max(1, remainingCount - restaurantPostsCount);
      } else {
        // Si nous n'avons qu'un seul restant, l'affecter aléatoirement
        if (Math.random() > 0.5) {
          restaurantPostsCount = 1;
          leisurePostsCount = 0;
        } else {
          restaurantPostsCount = 0;
          leisurePostsCount = 1;
        }
      }
    }
    
    console.log(`📊 Répartition: ${eventPostsCount} posts d'événements, ${restaurantPostsCount} posts de restaurants, ${leisurePostsCount} posts de lieux`);
    
    // Générer les différents types de posts (uniquement s'il y a une quantité positive)
    const eventPosts = await generateUpcomingEventsPosts(eventPostsCount);
    const restaurantPosts = restaurantPostsCount > 0 ? await generateTopRestaurantsPosts(restaurantPostsCount) : [];
    const leisurePosts = leisurePostsCount > 0 ? await generateTopLeisurePosts(leisurePostsCount) : [];
    
    // Combiner tous les posts
    const allPosts = [
      ...eventPosts,
      ...restaurantPosts,
      ...leisurePosts
    ].filter(post => post !== null); // Filtrer les posts null (échecs)
    
    console.log(`✅ Génération terminée avec ${allPosts.length} posts au total`);
    
    return allPosts;
  } catch (error) {
    console.error('❌ Erreur lors de la génération aléatoire de posts:', error);
    throw error;
  }
}

// Exporter les fonctions du module
module.exports = {
  generateRandomPosts,
  generateRestaurantPost,
  generateLeisurePost,
  generateUpcomingEventsPosts,
  generateTopRestaurantsPosts,
  generateTopLeisurePosts,
  isEventEnded,
  extractEventData,
  extractProducerData,
  isDuplicate
};
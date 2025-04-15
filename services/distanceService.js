const axios = require('axios');
const dotenv = require('dotenv');

// Charger les variables d'environnement
dotenv.config();

const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

if (!GOOGLE_MAPS_API_KEY) {
  console.error('❌ Clé API Google Maps manquante. Assurez-vous de l’avoir ajoutée dans .env');
  process.exit(1);
}

/**
 * Fonction pour calculer la distance entre deux points à l'aide de l'API Google Maps
 * @param {Object} origin - Coordonnées d'origine { lat: 48.8566, lng: 2.3522 }
 * @param {Object} destination - Coordonnées de destination { lat: 48.8584, lng: 2.2945 }
 * @param {String} mode - Mode de transport ("driving", "walking", "bicycling", "transit")
 * @returns {Promise<Object>} - Distance et durée, ou null si une erreur survient
 */
const calculateDistance = async (origin, destination, mode = 'driving') => {
  try {
    const url = 'https://maps.googleapis.com/maps/api/distancematrix/json';
    const params = {
      origins: `${origin.lat},${origin.lng}`,
      destinations: `${destination.lat},${destination.lng}`,
      key: GOOGLE_MAPS_API_KEY,
      mode, // Peut être "driving", "walking", "bicycling", etc.
    };

    const response = await axios.get(url, { params });
    const data = response.data;

    if (data.rows[0].elements[0].status === 'OK') {
      return {
        distance: data.rows[0].elements[0].distance.text, // Ex. : "1.2 km"
        duration: data.rows[0].elements[0].duration.text, // Ex. : "15 mins"
      };
    } else {
      throw new Error(`Erreur de l’API Google Maps : ${data.rows[0].elements[0].status}`);
    }
  } catch (error) {
    console.error('❌ Erreur lors de l’appel à l’API Google Maps :', error.message);
    return null;
  }
};

module.exports = calculateDistance;

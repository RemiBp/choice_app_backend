const mongoose = require('mongoose');
const Schema = mongoose.Schema;

/**
 * Schéma pour les établissements de bien-être / beauté (selon la structure fournie par l'utilisateur)
 * NOTE: Pointe vers la collection BeautyPlaces.
 */
module.exports = (connection) => {
  const WellnessPlaceSchema = new Schema({
    place_id: { // String (Identifiant Google Place)
      type: String, 
      unique: true,
      sparse: true // Permet plusieurs documents sans place_id (si nécessaire)
    }, 
    name: { // String
      type: String,
      required: true,
      trim: true
    },
    category: { // String (Type Google principal, ex: 'spa', 'beauty_salon', 'hair_salon')
      type: String,
      required: true,
      trim: true
    },
    type: { // Type du producteur (pour l'unification)
      type: String,
      default: 'wellnessProducer',
      enum: ['wellnessProducer']
    },
    sous_categorie: { // String (Déterminé par le script, ex: 'Institut de beauté', 'Spa', 'Salon de coiffure')
      type: String,
      trim: true
    },
    location: { // Object (Informations de localisation)
      type: { // String (GeoJSON)
        type: String,
        enum: ['Point'],
        default: 'Point'
      },
      coordinates: { // [Number (Longitude), Number (Latitude)]
        type: [Number],
        required: true,
        index: '2dsphere', // Index géospatial
        validate: {
          validator: function(v) {
            return Array.isArray(v) && v.length === 2 &&
                   v[0] >= -180 && v[0] <= 180 && 
                   v[1] >= -90 && v[1] <= 90;
          },
          message: props => `${props.value} n'est pas une coordonnée valide [longitude, latitude]!`
        }
      },
      address: { // String (Partie rue/numéro)
        type: String,
        trim: true
      },
      city: { // String
        type: String,
        trim: true
      },
      postal_code: { // String
        type: String,
        trim: true
      },
      country: { // String
        type: String,
        trim: true,
        default: 'France'
      }
    },
    contact: { // Object (Informations de contact)
      phone: { // String (Numéro formaté)
        type: String,
        trim: true
      }, 
      email: { // String
        type: String,
        trim: true,
        lowercase: true,
        default: null
      }, 
      website: { // String (URL du site web)
        type: String,
        trim: true
      },
      social_media: { // Object (Placeholders)
        facebook: { type: String, default: null },
        instagram: { type: String, default: null },
        twitter: { type: String, default: null }
      }
    },
    business_hours: { // Object (Horaires d'ouverture)
      type: Map, // Utiliser Map pour flexibilité
      of: mongoose.Schema.Types.Mixed, // Allow varied structures (object or null)
      default: {}
    },
    rating: { // Object (Note globale Google)
      average: { // Number
        type: Number,
        min: 0,
        max: 5 // En supposant une échelle de 0 à 5
      }, 
      count: { // Number (Nombre total d'avis Google)
        type: Number,
        min: 0,
        default: 0
      } 
    },
    description: { // String (Générée par l'IA)
      type: String,
      trim: true
    }, 
    profile_photo: { // String (URL Data Base64 ou URL statique)
      type: String
    }, 
    comments: [{ // Array of Objects (Commentaires clients)
      source: String, 
      text: String 
    }], 
    tripadvisor_url: { // String (Si trouvée via Bing)
      type: String,
      trim: true
    }, 
    criteria_ratings: { // Object (Si analyse AI effectuée)
      type: Map,
      of: mongoose.Schema.Types.Mixed // Allow varied structures (numbers and average_score)
    },
    services: [{ // Array of Objects (Services proposés)
      // Définir la structure d'un service si connue, sinon Mixed
      type: Schema.Types.Mixed 
    }], 
    images: [String], // Array of Strings (URLs d'images)

    // === Champs potentiellement utiles des anciens schémas / User.js ===
    // (À adapter/ajouter si nécessaire pour la logique Copilot)
    choiceUsers: [{
      userId: { type: Schema.Types.ObjectId, ref: 'User' },
      ratings: { type: Map, of: Number },
      comment: String,
      emotions: [String],
      createdAt: { type: Date, default: Date.now }
    }],
    interestedUsers: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    favorites: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    choice_count: { type: Number, default: 0 },
    interest_count: { type: Number, default: 0 },
    favorite_count: { type: Number, default: 0 },
    is_verified: { type: Boolean, default: false },
    is_active: { type: Boolean, default: true },
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now }
    
  }, { 
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }, // Utiliser les noms de champs spécifiés
    strict: false // Permettre des champs non définis dans le schéma
  });

  // Assurer l'index géospatial sur location.coordinates
  WellnessPlaceSchema.index({ "location.coordinates": '2dsphere' });
  WellnessPlaceSchema.index({ name: 'text', description: 'text', category: 'text', sous_categorie: 'text' }); // Index texte pour recherche

  if (!connection) {
    console.error("WellnessPlace model requires a valid DB connection! (connection is undefined)");
    // Retourner un modèle factice ou lancer une erreur plus explicite selon la gestion d'erreur souhaitée
    // throw new Error("WellnessPlace model requires a valid DB connection!"); 
    // Ou retourner un objet vide pour éviter des erreurs immédiates mais signaler le problème
    return mongoose.model('WellnessPlace_Dummy', new Schema({})); // Crée un modèle temporaire si pas de connexion
  }
  try {
    // Pointe vers la collection 'BeautyPlaces' comme dans le code original, mais avec le nouveau schéma.
    // Renommer 'WellnessPlace' en 'BeautyPlace' serait plus cohérent si la collection est 'BeautyPlaces'.
    // Pour l'instant, on garde 'WellnessPlace' pour la rétrocompatibilité du nom de modèle.
    return connection.model('WellnessPlace', WellnessPlaceSchema, 'BeautyPlaces');
  } catch (error) {
    // Si le modèle est déjà compilé (par exemple, lors de rechargements HMR)
    if (error.name === 'OverwriteModelError' || error.name === 'MissingSchemaError') {
      return connection.model('WellnessPlace');
    } else {
      console.error("Error creating/retrieving WellnessPlace model:", error);
      throw error; // Relancer d'autres erreurs
    }
  }
}; 
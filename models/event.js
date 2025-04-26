const mongoose = require('mongoose');
const Schema = mongoose.Schema;

/**
 * Crée et retourne un modèle Event configuré pour la connexion spécifiée
 * @param {mongoose.Connection} connection - Connexion à la base de données
 * @param {string} collectionName - Nom de la collection (optionnel, défaut: Loisir_Paris_Evenements)
 * @returns {mongoose.Model} Modèle Event configuré
 */
const createEventModel = (connection, collectionName = 'Loisir_Paris_Evenements') => {
  /**
   * Schéma pour les événements (format unifié)
   */
  const EventSchema = new Schema({
    // === Champs d'identification ===
    title: { type: String, required: true, trim: true },
    intitulé: { type: String, required: true, trim: true },
    name: { type: String, trim: true },
    description: { type: String, trim: true },
    détail: { type: String, trim: true },
    soustitre: { type: String, trim: true },
    short_description: { type: String, trim: true },
    summary: { type: String, trim: true },
    content: { type: String, trim: true },
    
    // === Champs de catégorisation ===
    category: { 
      type: String,
      required: true,
      trim: true,
    },
    catégorie: { 
      type: String, 
      required: true,
      trim: true,
    },
    // Champ pour la hiérarchie de catégories (ex: "Théâtre » Comédie » Théâtre de l'absurde")
    categoryPath: {
      type: Array,
      default: function() {
        // Extraire automatiquement à partir de catégorie/category
        const source = this.catégorie || this.category || '';
        if (source.includes('»')) {
          return source.split('»').map(part => part.trim());
        }
        return [source];
      }
    },
    subcategory: { type: String, trim: true },
    catégorie_principale: { type: String, required: true },
    catégorie_originale: String,
    tags: [{ type: String, trim: true }],
    type: { type: String },
    
    // === Champs de dates ===
    date: { type: Date },
    start_date: { 
      type: Date, 
    },
    date_debut: { type: String, trim: true },
    end_date: { type: Date },
    date_fin: { type: String, trim: true },
    startDate: { type: Date },
    endDate: { type: Date },
    publish_date: { type: Date, default: Date.now },
    unpublish_date: { type: Date },
    prochaines_dates: { type: String, required: true },
    time: { type: String },
    duration: { type: Number }, // en minutes
    
    // === Champs de localisation ===
    venue: { type: String, trim: true },
    lieu: { type: String, required: true, trim: true },
    address: { type: String, trim: true },
    adresse: { type: String, trim: true },
    city: { type: String, trim: true },
    state: { type: String, trim: true },
    country: { type: String, trim: true },
    postal_code: { type: String, trim: true },
    location: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point'
      },
      coordinates: {
        type: [Number],
        default: [2.3522, 48.8566] // Paris par défaut
      },
      adresse: String
    },
    localisation: {
      type: {
        type: String,
        enum: ['Point']
      },
      coordinates: [Number]
    },
    virtual: { type: Boolean, default: false },
    lien_lieu: { type: String, required: true },
    
    // === Horaires et programmation ===
    schedule: [{
      date: { type: Date },
      start_time: { type: String },
      end_time: { type: String },
      title: { type: String },
      description: { type: String }
    }],
    horaires: [{
      jour: String,
      heure: String
    }],
    
    // === Prix et billetterie ===
    price: {
      amount: { type: Number },
      currency: { type: String, default: 'EUR' },
      is_free: { type: Boolean, default: false },
      formatted: { type: String } // Pour stocker le format original (ex: "10€95")
    },
    prix: { type: Schema.Types.Mixed },
    is_free: { type: Boolean, default: false },
    ticket_url: { type: String },
    purchase_url: { type: String, required: true },
    site_url: { type: String, required: true },
    ticketing_url: { type: String },
    registration_url: { type: String },
    discount_code: { type: String },
    prix_reduit: { type: String, required: true },
    ancien_prix: String,
    // Stocke montant numérique extrait du prix formaté
    price_amount: {
      type: Number,
      default: function() {
        // Extraire le montant numérique de prix_reduit si possible
        if (this.prix_reduit) {
          const match = this.prix_reduit.match(/(\d+)[,.]?(\d*)[\s€]?/);
          if (match) {
            return parseFloat(`${match[1]}.${match[2] || '0'}`);
          }
        }
        return null;
      }
    },
    catégories_prix: [{
      Catégorie: String,
      Prix: [String]
    }],
    
    // === Médias ===
    images: [{
      url: { type: String },
      alt_text: { type: String },
      is_primary: { type: Boolean, default: false }
    }],
    cover_image: { type: String },
    image: { type: String, required: true },
    photo: { type: String },
    thumbnail: { type: String },
    video_url: { type: String },
    video: { type: String },
    
    // === Relations ===
    producerId: { type: mongoose.Schema.Types.ObjectId },
    producerName: String,
    producer_id: String, // Format alternatif
    organizerId: String,
    organizerName: String,
    organizerAvatar: String,
    organizer: {
      name: { type: String },
      email: { type: String },
      phone: { type: String },
      website: { type: String },
      social_media: {
        facebook: { type: String },
        twitter: { type: String },
        instagram: { type: String },
        linkedin: { type: String }
      }
    },
    organizer_contact: { type: String },
    organizer_website: { type: String },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    lineup: [{
      nom: String,
      image: String
    }],
    
    // === Engagement utilisateur ===
    interestedUsers: [{ type: String }],
    interest_count: { type: Number, default: 0 },
    choice_count: { type: Number, default: 0 },
    choiceUsers: [{ type: mongoose.Schema.Types.Mixed }],
    comments_count: { type: Number, default: 0 },
    commentaires: [{
      titre: String,
      note: String,
      contenu: String 
    }],
    registrations: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    attendees: [{ type: String }],
    
    // === Métriques et évaluations ===
    note: { type: mongoose.Schema.Types.Mixed },
    note_ai: Number,
    notes_globales: {
      type: Map,
      of: mongoose.Schema.Types.Mixed
    },
    emotions: [String],
    views_count: { type: Number, default: 0 },
    likes_count: { type: Number, default: 0 },
    shares_count: { type: Number, default: 0 },
    rating: { 
      average: { type: Number, default: 0 },
      count: { type: Number, default: 0 }
    },
    likes: { type: Number, default: 0 },
    shares: { type: Number, default: 0 },
    views: { type: Number, default: 0 },
    attending_count: { type: Number, default: 0 },
    interested_count: { type: Number, default: 0 },
    
    // === Configuration et statut ===
    capacity: { type: Number },
    availableSeats: { type: Number },
    isPublic: { type: Boolean, default: true },
    isPrivate: { type: Boolean, default: false },
    published: { type: Boolean, default: true },
    allDay: { type: Boolean, default: false },
    isAllDay: { type: Boolean, default: false },
    color: { type: String },
    status: { 
      type: String, 
      enum: ['active', 'cancelled', 'completed', 'published', 'draft'], 
      default: 'active' 
    },
    
    // === Récurrence ===
    recurrence: {
      is_recurring: { type: Boolean, default: false },
      pattern: { type: String, enum: ['daily', 'weekly', 'monthly', 'yearly', 'custom', 'none'], default: 'none' },
      interval: { type: Number, default: 1 },
      end_date: { type: Date },
      end_after: { type: Number },
      daysOfWeek: [{ type: Number }]
    },
    
    // === Métadonnées ===
    source: { type: String, required: true },
    source_id: String,
    externalId: String,
    externalSource: String,
    lastSynced: { type: Date },
    url: String,
    additionalData: { type: Map, of: mongoose.Schema.Types.Mixed },
    metaData: { type: Map, of: mongoose.Schema.Types.Mixed },
    posts: [{ type: String }],
    
    // === Custom fields for frontend display ===
    formatted_location: { type: String }, // For display
    
    // === Metrics and sorting ===
    popularity_score: { type: Number, default: 0 },
    relevance_score: { type: Number, default: 0 },
    
    // === Config ===
    visibility: { 
      type: String, 
      enum: ['public', 'private', 'featured'],
      default: 'public'
    },
    
    // === Métadonnées ===
    age_restriction: { type: String },
    accessibility: { type: [String] },
    language: { type: String, default: 'fr' },
    
    // === Timestamps ===
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
    last_updated: Date
  }, {
    timestamps: true,
    // Permettre des champs supplémentaires pour flexibilité future
    strict: false,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
    // Convertir tous les ID en chaînes pour compatibilité frontend
    id: true,
    collection: collectionName // Nom explicite de la collection
  });

  // Custom validators
  EventSchema.path('title').validate(function(value) {
    return value && value.length >= 2 && value.length <= 200;
  }, 'Title must be between 2 and 200 characters');

  EventSchema.path('start_date').validate(function(value) {
    if (!value) return true; // Skip if not provided
    return value instanceof Date && !isNaN(value);
  }, 'Invalid start date format');

  EventSchema.path('end_date').validate(function(value) {
    if (!value) return true; // Skip if not provided
    return value instanceof Date && !isNaN(value);
  }, 'Invalid end date format');

  EventSchema.path('end_date').validate(function(value) {
    if (!value || !this.start_date) return true; // Skip if either date is not provided
    return value >= this.start_date;
  }, 'End date must be after or equal to start date');

  // Validate location coordinates if provided
  EventSchema.path('location.coordinates').validate(function(value) {
    if (!value || !Array.isArray(value)) return true;
    if (value.length !== 2) return false;
    
    const [longitude, latitude] = value;
    return (
      typeof longitude === 'number' && 
      typeof latitude === 'number' &&
      longitude >= -180 && longitude <= 180 &&
      latitude >= -90 && latitude <= 90
    );
  }, 'Invalid coordinates format. Must be [longitude, latitude] with valid ranges');

  // Compound uniqueness validation for preventing duplicates
  EventSchema.pre('save', async function(next) {
    if (this.isNew || this.isModified('title') || this.isModified('start_date') || this.isModified('location.coordinates')) {
      const query = {
        _id: { $ne: this._id },
        title: this.title,
        source: this.source
      };
      
      // Add date proximity check if date exists
      if (this.start_date) {
        const oneDay = 24 * 60 * 60 * 1000; // One day in milliseconds
        query.start_date = {
          $gte: new Date(this.start_date.getTime() - oneDay),
          $lte: new Date(this.start_date.getTime() + oneDay)
        };
      }
      
      // Add location proximity check if coordinates exist
      if (this.location && this.location.coordinates && this.location.coordinates.length === 2) {
        query.location = {
          $geoWithin: {
            $centerSphere: [
              this.location.coordinates,
              100 / 6378137 // Convertir 100 mètres en radians (rayon terrestre ~6378137m)
            ]
          }
        };
      }
      
      const existingEvent = await this.constructor.findOne(query);
      if (existingEvent) {
        const error = new Error('A similar event already exists in the database');
        error.code = 11000; // Duplicate key error
        return next(error);
      }
    }
    
    // Synchroniser les champs équivalents
    if (this.intitulé && !this.title) {
      this.title = this.intitulé;
    } else if (this.title && !this.intitulé) {
      this.intitulé = this.title;
    }
    
    if (this.name && !this.title && !this.intitulé) {
      this.title = this.name;
      this.intitulé = this.name;
    }
    
    if (this.détail && !this.description) {
      this.description = this.détail;
    } else if (this.description && !this.détail) {
      this.détail = this.description;
    }
    
    if (this.catégorie && !this.category) {
      this.category = this.catégorie;
    } else if (this.category && !this.catégorie) {
      this.catégorie = this.category;
    }
    
    // Conversion des dates (format français DD/MM/YYYY)
    if (this.date_debut && !this.start_date) {
      try {
        if (this.date_debut.includes('/')) {
          const parts = this.date_debut.split('/');
          if (parts.length === 3) {
            const [day, month, year] = parts;
            this.start_date = new Date(`${year}-${month}-${day}`);
          }
        } else {
          this.start_date = new Date(this.date_debut);
        }
      } catch (e) {
        console.error('Erreur lors de la conversion de date_debut:', e);
      }
    }
    
    if (this.date_fin && !this.end_date) {
      try {
        if (this.date_fin.includes('/')) {
          const parts = this.date_fin.split('/');
          if (parts.length === 3) {
            const [day, month, year] = parts;
            this.end_date = new Date(`${year}-${month}-${day}`);
          }
        } else {
          this.end_date = new Date(this.date_fin);
        }
      } catch (e) {
        console.error('Erreur lors de la conversion de date_fin:', e);
      }
    }
    
    // Support pour startDate/endDate (format frontend)
    if (this.startDate && !this.start_date) {
      this.start_date = this.startDate;
    } else if (this.start_date && !this.startDate) {
      this.startDate = this.start_date;
    }
    
    if (this.endDate && !this.end_date) {
      this.end_date = this.endDate;
    } else if (this.end_date && !this.endDate) {
      this.endDate = this.end_date;
    }
    
    // Support pour date simple
    if (this.date && !this.start_date && !this.startDate) {
      this.start_date = this.date;
      this.startDate = this.date;
    }
    
    // Si end_date n'est toujours pas définie mais start_date l'est, utiliser start_date
    if (!this.end_date && this.start_date) {
      const endDate = new Date(this.start_date);
      endDate.setHours(23, 59, 59);
      this.end_date = endDate;
      if (!this.endDate) {
        this.endDate = endDate;
      }
    }
    
    // Conversion du lieu et venue
    if (this.lieu && !this.venue) {
      this.venue = this.lieu;
    } else if (this.venue && !this.lieu) {
      this.lieu = this.venue;
    }
    
    // Gestion des URLs d'achat
    if (this.purchase_url && !this.ticket_url) {
      this.ticket_url = this.purchase_url;
    } else if (this.ticket_url && !this.purchase_url) {
      this.purchase_url = this.ticket_url;
    }
    
    if (this.ticketing_url && !this.ticket_url && !this.purchase_url) {
      this.ticket_url = this.ticketing_url;
      this.purchase_url = this.ticketing_url;
    }
    
    // Normalisation des images
    if (this.image && !this.cover_image) {
      this.cover_image = this.image;
    } else if (this.cover_image && !this.image) {
      this.image = this.cover_image;
    }
    
    if (this.photo && !this.image && !this.cover_image) {
      this.image = this.photo;
      this.cover_image = this.photo;
    }
    
    // Normalisation de la localisation
    if (!this.location || !this.location.type) {
      this.location = { 
        type: 'Point', 
        coordinates: [0, 0]
      };
    }
    
    // Support pour adresse/address
    if (this.adresse && !this.address) {
      this.address = this.adresse;
    } else if (this.address && !this.adresse) {
      this.adresse = this.address;
    }
    
    // Création du location formaté
    const locationParts = [this.venue || this.lieu, this.city, this.state, this.country]
      .filter(part => part && part.trim().length > 0);
    this.formatted_location = locationParts.join(', ');
    
    // Synchroniser isAllDay et allDay
    if (this.isAllDay !== undefined && this.allDay === undefined) {
      this.allDay = this.isAllDay;
    } else if (this.allDay !== undefined && this.isAllDay === undefined) {
      this.isAllDay = this.allDay;
    }
    
    // Synchroniser isPrivate et isPublic
    if (this.isPrivate === true && this.isPublic === undefined) {
      this.isPublic = false;
    } else if (this.isPublic === true && this.isPrivate === undefined) {
      this.isPrivate = false;
    }
    
    // Extraction et normalisation des prix
    if (this.prix_reduit && !this.price_amount) {
      const match = this.prix_reduit.match(/(\d+)[,.]?(\d*)[\s€]?/);
      if (match) {
        this.price_amount = parseFloat(`${match[1]}.${match[2] || '0'}`);
        // Synchroniser avec le format standard
        if (!this.price || !this.price.amount) {
          this.price = this.price || {};
          this.price.amount = this.price_amount;
          this.price.formatted = this.prix_reduit;
          this.price.currency = 'EUR';
          this.price.is_free = this.price_amount === 0;
        }
      }
    }
    
    // Amélioration du traitement des catégories
    if ((this.catégorie || this.category) && !this.categoryPath) {
      const sourceCat = this.catégorie || this.category;
      if (sourceCat.includes('»')) {
        this.categoryPath = sourceCat.split('»').map(part => part.trim());
        // Extraire et stocker la catégorie principale et sous-catégorie
        if (this.categoryPath.length > 0) {
          if (!this.catégorie_principale) {
            this.catégorie_principale = this.categoryPath[0];
          }
          if (!this.subcategory && this.categoryPath.length > 1) {
            this.subcategory = this.categoryPath[1];
          }
        }
      } else {
        this.categoryPath = [sourceCat];
      }
    }
    
    // Normalisation de la localisation
    if (this.location) {
      // Si nous avons un objet location avec adresse mais sans coordinates
      if (this.location.adresse && (!this.location.coordinates || 
          !Array.isArray(this.location.coordinates) || 
          this.location.coordinates.length !== 2 ||
          (this.location.coordinates[0] === 0 && this.location.coordinates[1] === 0))) {
          
        // Valeurs par défaut pour Paris si nous n'avons pas de coordonnées
        this.location.type = 'Point';
        this.location.coordinates = [2.3522, 48.8566]; // Paris
      }
      
      // S'assurer que location est au format GeoJSON Point
      if (!this.location.type) {
        this.location.type = 'Point';
      }
    }
    
    next();
  });
  
  // Ajouter des index pour optimiser les recherches
  EventSchema.index({ localisation: '2dsphere' }); // Index pour le format alternatif
  EventSchema.index({ start_date: 1 }); // Index pour les recherches par date
  EventSchema.index({ end_date: 1 });
  EventSchema.index({ date: 1 }); // Ajouter un index pour le champ 'date' simple
  EventSchema.index({ category: 1 }); // Index pour les recherches par catégorie
  EventSchema.index({ catégorie: 1 }); // Pour le format original
  EventSchema.index({ 
    title: 'text', 
    intitulé: 'text',
    name: 'text',
    description: 'text', 
    détail: 'text',
    category: 'text',
    catégorie: 'text',
    tags: 'text',
    lieu: 'text'
  }); // Index textuel pour la recherche
  EventSchema.index({ producerId: 1 }); // Index pour les recherches par producteur

  // Méthode statique pour rechercher des événements proches
  EventSchema.statics.findNearby = async function(longitude, latitude, maxDistanceInKm = 10) {
    return this.find({
      location: {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: [longitude, latitude]
          },
          $maxDistance: maxDistanceInKm * 1000
        }
      }
    });
  };

  // Méthode statique pour rechercher des événements par catégorie
  EventSchema.statics.findByCategory = async function(category, options = {}) {
    const query = {};
    
    if (options.exactMatch) {
      // Recherche exacte
      query.$or = [
        { category: category },
        { catégorie: category },
        { categoryPath: category }
      ];
    } else {
      // Recherche avec RegExp pour trouver dans les hiérarchies comme "Théâtre » Comédie"
      const regex = new RegExp(category, 'i');
      query.$or = [
        { category: regex },
        { catégorie: regex },
        { categoryPath: regex },
        { catégorie_principale: regex },
        { subcategory: regex }
      ];
    }
    
    return this.find(query);
  };

  // Méthode statique pour rechercher des événements à venir
  EventSchema.statics.findUpcoming = async function(options = {}) {
    const { limit = 50, offset = 0 } = options;
    
    // Requête complexe pour trouver les événements à venir
    const query = {
      $or: [
        // 1. Événements avec date_debut au format DD/MM/YYYY
        {
          date_debut: { 
            $regex: /^\d{2}\/\d{2}\/\d{4}$/ 
          }
        },
        // 2. Événements avec date au format Date
        {
          date: { 
            $type: "date", 
            $gte: new Date() 
          }
        }
      ]
    };
    
    return this.find(query)
      .sort({ date_debut: 1, date: 1 })
      .skip(offset)
      .limit(limit);
  };

  // Static methods for advanced querying
  EventSchema.statics.findByDateRange = function(startDate, endDate, options = {}) {
    const query = {
      $or: [
        // Events that start within the range
        {
          start_date: { 
            $gte: new Date(startDate), 
            $lte: new Date(endDate) 
          }
        },
        // Events that end within the range
        {
          end_date: { 
            $gte: new Date(startDate), 
            $lte: new Date(endDate) 
          }
        },
        // Events that span across the range
        {
          start_date: { $lte: new Date(startDate) },
          end_date: { $gte: new Date(endDate) }
        }
      ]
    };
    
    if (options.category) {
      query.$or = query.$or.map(condition => ({
        ...condition,
        $or: [
          { category: options.category },
          { catégorie: options.category }
        ]
      }));
    }

    if (options.location && options.radius) {
      const { longitude, latitude, radius } = options.location;
      return this.find(query).where('location').near({
        center: {
          type: 'Point',
          coordinates: [longitude, latitude]
        },
        maxDistance: radius * 1000, // Convert km to meters
        spherical: true
      });
    }
    
    return this.find(query).sort({ start_date: 1 });
  };

  EventSchema.statics.findTrending = function(limit = 10, timeframe = 7) {
    // Get events from recent timeframe (default 7 days)
    const recentDate = new Date();
    recentDate.setDate(recentDate.getDate() - timeframe);
    
    return this.find({
      start_date: { $gte: recentDate }
    })
    .sort({ 
      views_count: -1, 
      likes_count: -1,
      shares_count: -1,
      popularity_score: -1
    })
    .limit(limit);
  };

  EventSchema.statics.findSimilar = function(eventId, limit = 5) {
    return this.findById(eventId)
      .then(event => {
        if (!event) return [];
        
        // Build query to find events with similar attributes
        const query = {
          _id: { $ne: event._id }, // Exclude the current event
          $or: [
            { category: event.category },
            { catégorie: event.catégorie }
          ]
        };
        
        // Add date proximity if available
        if (event.start_date) {
          const startWindow = new Date(event.start_date);
          const endWindow = new Date(event.start_date);
          startWindow.setDate(startWindow.getDate() - 30); // 30 days before
          endWindow.setDate(endWindow.getDate() + 30);    // 30 days after
          
          query.start_date = {
            $gte: startWindow,
            $lte: endWindow
          };
        }
        
        // If location available, prioritize nearby events
        if (event.location && event.location.coordinates) {
          return this.find(query)
            .where('location')
            .near({
              center: {
                type: 'Point',
                coordinates: event.location.coordinates
              },
              maxDistance: 50000, // 50km radius
              spherical: true
            })
            .limit(limit);
        }
        
        // Otherwise just find category matches
        return this.find(query).limit(limit);
      });
  };

  // Enhanced toFrontend method with more detailed configuration
  EventSchema.methods.toFrontend = function(config = {}) {
    const doc = this.toObject();
    
    // Apply transformations based on config
    const result = {
      id: doc._id,
      title: doc.title,
      description: doc.description,
      category: doc.category || doc.catégorie,
      start_date: doc.start_date,
      end_date: doc.end_date,
      location: {
        name: doc.formatted_location || doc.location?.name,
        address: doc.location?.address,
        city: doc.location?.city,
        coordinates: doc.location?.coordinates
      },
      media: {
        images: doc.media?.images || [],
        thumbnail: doc.media?.thumbnail || doc.media?.images?.[0] || '',
        cover: doc.media?.cover || doc.media?.images?.[0] || ''
      },
      pricing: {
        isFree: doc.pricing?.is_free,
        price: doc.pricing?.amount,
        currency: doc.pricing?.currency || '€',
        ticketUrl: doc.pricing?.ticket_url
      },
      organizer: doc.organizer,
      engagement: {
        likes: doc.likes_count || 0,
        views: doc.views_count || 0,
        shares: doc.shares_count || 0
      },
      tags: doc.tags || [],
      source: doc.source,
      source_id: doc.source_id,
      url: doc.url,
      is_recurring: !!doc.recurrence,
      created_at: doc.createdAt,
      updated_at: doc.updatedAt
    };

    // Include detailed schedule if requested
    if (config.includeSchedule && doc.schedule && doc.schedule.length) {
      result.schedule = doc.schedule;
    }

    // Include audience info if available
    if (doc.audience) {
      result.audience = doc.audience;
    }

    // Include recurrence info if present and requested
    if (config.includeRecurrence && doc.recurrence) {
      result.recurrence = doc.recurrence;
    }

    // Include raw data for debugging if explicitly requested
    if (config.includeRaw === true) {
      result._raw = doc;
    }

    return result;
  };

  // Add static methods for filtering
  EventSchema.statics.filterByPrice = function(options = {}) {
    const query = {};
    
    if (options.isFree === true) {
      query.$or = [
        { 'price.is_free': true },
        { price_amount: 0 },
        { prix_reduit: /^0[,.]?00?\s?€?$/ }
      ];
    } else if (options.isFree === false) {
      query.$or = [
        { 'price.is_free': false },
        { price_amount: { $gt: 0 } },
        { prix_reduit: { $not: /^0[,.]?00?\s?€?$/ } }
      ];
    }
    
    if (options.maxPrice !== undefined) {
      const maxPrice = parseFloat(options.maxPrice);
      if (!isNaN(maxPrice)) {
        query.$or = [
          { 'price.amount': { $lte: maxPrice } },
          { price_amount: { $lte: maxPrice } }
        ];
      }
    }
    
    if (options.minPrice !== undefined) {
      const minPrice = parseFloat(options.minPrice);
      if (!isNaN(minPrice)) {
        query.$or = [
          { 'price.amount': { $gte: minPrice } },
          { price_amount: { $gte: minPrice } }
        ];
      }
    }
    
    return this.find(query);
  };

  EventSchema.statics.filterByTags = function(tags = [], options = {}) {
    if (!Array.isArray(tags) || tags.length === 0) {
      return this.find({});
    }
    
    const query = options.matchAll 
      ? { tags: { $all: tags } }  // Must match all tags
      : { tags: { $in: tags } };  // Match any of the tags
      
    return this.find(query);
  };

  EventSchema.statics.searchByText = function(text, options = {}) {
    if (!text || typeof text !== 'string') {
      return this.find({});
    }
    
    // Use text index if it exists
    if (options.useTextIndex) {
      return this.find({ $text: { $search: text } })
        .sort({ score: { $meta: "textScore" } });
    }
    
    // Otherwise use regex for more flexible but slower search
    const searchRegex = new RegExp(text, 'i');
    return this.find({
      $or: [
        { title: searchRegex },
        { description: searchRegex },
        { 'location.name': searchRegex },
        { 'location.city': searchRegex },
        { 'organizer.name': searchRegex },
        { tags: searchRegex }
      ]
    });
  };

  // Static method to generate random events for testing
  EventSchema.statics.generateRandomEvents = async function(count = 10) {
    const events = [];
    const categories = [
      'Théâtre', 'Concert', 'Exposition', 'Festival', 'Cinéma',
      'Spectacle', 'Danse', 'Musée', 'Opéra', 'Cirque'
    ];
    
    // Lieux à Paris
    const venues = [
      'Théâtre du Châtelet', 'Olympia', 'Centre Pompidou', 'Palais de Tokyo',
      'Le Trianon', 'Zénith de Paris', 'Bataclan', 'Opéra Garnier',
      'Philharmonie de Paris', 'La Cigale', 'Théâtre Mogador'
    ];
    
    // Adresses à Paris
    const addresses = [
      '1 Place du Châtelet, 75001 Paris',
      '28 Boulevard des Capucines, 75009 Paris',
      'Place Georges-Pompidou, 75004 Paris',
      '13 Avenue du Président Wilson, 75116 Paris',
      '80 Boulevard de Rochechouart, 75018 Paris',
      '211 Avenue Jean Jaurès, 75019 Paris',
      '50 Boulevard Voltaire, 75011 Paris',
      '8 Rue Scribe, 75009 Paris',
      '221 Avenue Jean Jaurès, 75019 Paris',
      '120 Boulevard de Rochechouart, 75018 Paris',
      '25 Rue Mogador, 75009 Paris'
    ];
    
    // Coordonnées approximatives de Paris
    const parisCoordinates = [
      [2.3522, 48.8566], // Paris center
      [2.3488, 48.8534], // Notre-Dame
      [2.2945, 48.8584], // Eiffel Tower
      [2.339, 48.8872],  // Montmartre
      [2.3376, 48.8606], // Louvre
      [2.3699, 48.8529], // Bastille
      [2.295, 48.8738],  // Arc de Triomphe
      [2.3464, 48.8400], // Montparnasse
      [2.3912, 48.8648], // République
      [2.2845, 48.8316]  // Roland Garros
    ];
    
    for (let i = 0; i < count; i++) {
      const today = new Date();
      const futureDate = new Date(today.getTime() + Math.random() * 30 * 24 * 60 * 60 * 1000); // jusqu'à 30 jours dans le futur
      const endDate = new Date(futureDate.getTime() + Math.random() * 5 * 24 * 60 * 60 * 1000); // jusqu'à 5 jours après la date de début
      
      const randomHour = Math.floor(Math.random() * 12) + 10; // entre 10h et 22h
      const randomMinute = Math.floor(Math.random() * 4) * 15; // 0, 15, 30, 45
      
      const categoryIndex = Math.floor(Math.random() * categories.length);
      const venueIndex = Math.floor(Math.random() * venues.length);
      const addressIndex = Math.floor(Math.random() * addresses.length);
      const coordinatesIndex = Math.floor(Math.random() * parisCoordinates.length);
      
      const event = {
        intitulé: `Événement test ${i+1} - ${categories[categoryIndex]}`,
        détail: `Ceci est un événement de test généré automatiquement pour la catégorie ${categories[categoryIndex]}`,
        lieu: venues[venueIndex],
        adresse: addresses[addressIndex],
        catégorie: categories[categoryIndex],
        note: Math.random() * 5 + 5, // Note entre 5 et 10
        prix_reduit: `${Math.floor(Math.random() * 50) + 10}€`, // Prix entre 10€ et 60€
        date_debut: `${futureDate.getDate().toString().padStart(2, '0')}/${(futureDate.getMonth() + 1).toString().padStart(2, '0')}/${futureDate.getFullYear()}`,
        date_fin: `${endDate.getDate().toString().padStart(2, '0')}/${(endDate.getMonth() + 1).toString().padStart(2, '0')}/${endDate.getFullYear()}`,
        horaires: [
          {
            jour: ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'][futureDate.getDay()],
            heure: `${randomHour}h${randomMinute > 0 ? randomMinute : '00'}`
          }
        ],
        image: `https://picsum.photos/id/${Math.floor(Math.random() * 1000)}/300/200`,
        location: {
          type: 'Point',
          coordinates: parisCoordinates[coordinatesIndex]
        },
        views_count: Math.floor(Math.random() * 100),
        interest_count: Math.floor(Math.random() * 50),
        popularity_score: Math.random() * 10
      };
      
      events.push(event);
    }
    
    return this.create(events);
  };

  // Méthode pour la recherche d'événements à une date spécifique
  EventSchema.statics.findBySpecificDate = function(date, options = {}) {
    // On accepte soit un objet Date, soit une chaîne ISO, soit une chaîne DD/MM/YYYY
    let targetDate;
    
    if (date instanceof Date) {
      targetDate = date;
    } else if (typeof date === 'string') {
      if (date.match(/^\d{2}\/\d{2}\/\d{4}$/)) {
        // Format DD/MM/YYYY
        const [day, month, year] = date.split('/');
        targetDate = new Date(`${year}-${month}-${day}`);
      } else {
        // Format ISO ou autre
        targetDate = new Date(date);
      }
    } else {
      throw new Error('Date invalide');
    }
    
    // Vérifier si la date est valide
    if (isNaN(targetDate.getTime())) {
      throw new Error('Date invalide');
    }
    
    // Créer des limites pour le jour entier
    const startOfDay = new Date(targetDate);
    startOfDay.setHours(0, 0, 0, 0);
    
    const endOfDay = new Date(targetDate);
    endOfDay.setHours(23, 59, 59, 999);
    
    // Formater en DD/MM/YYYY pour la recherche sur date_debut et date_fin
    const dayStr = targetDate.getDate().toString().padStart(2, '0');
    const monthStr = (targetDate.getMonth() + 1).toString().padStart(2, '0');
    const yearStr = targetDate.getFullYear().toString();
    const formattedDate = `${dayStr}/${monthStr}/${yearStr}`;
    
    // Créer la requête pour trouver les événements à cette date
    const query = {
      $or: [
        // Événements qui commencent ce jour
        { start_date: { $gte: startOfDay, $lte: endOfDay } },
        { date: { $gte: startOfDay, $lte: endOfDay } },
        { date_debut: formattedDate },
        
        // Événements qui finissent ce jour
        { end_date: { $gte: startOfDay, $lte: endOfDay } },
        { date_fin: formattedDate },
        
        // Événements qui couvrent ce jour
        {
          $and: [
            { start_date: { $lte: startOfDay } },
            { end_date: { $gte: endOfDay } }
          ]
        },
        {
          $and: [
            { date_debut: { $lte: formattedDate } },
            { date_fin: { $gte: formattedDate } }
          ]
        }
      ]
    };
    
    return this.find(query);
  };

  // Méthode pour trouver les événements pour aujourd'hui
  EventSchema.statics.findToday = function(options = {}) {
    const today = new Date();
    return this.findBySpecificDate(today, options);
  };

  // Méthode pour trouver les événements pour demain
  EventSchema.statics.findTomorrow = function(options = {}) {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return this.findBySpecificDate(tomorrow, options);
  };

  // Méthode pour trouver les événements pour ce week-end
  EventSchema.statics.findWeekend = function(options = {}) {
    const today = new Date();
    const currentDay = today.getDay(); // 0 = Dimanche, 6 = Samedi
    
    // Calculer le prochain samedi
    const nextSaturday = new Date(today);
    nextSaturday.setDate(today.getDate() + (6 - currentDay));
    nextSaturday.setHours(0, 0, 0, 0);
    
    // Calculer le prochain dimanche (fin du week-end)
    const nextSunday = new Date(nextSaturday);
    nextSunday.setDate(nextSaturday.getDate() + 1);
    nextSunday.setHours(23, 59, 59, 999);
    
    // Si on est déjà le week-end, utiliser aujourd'hui comme début
    if (currentDay === 0 || currentDay === 6) {
      nextSaturday.setTime(today.getTime());
      nextSaturday.setHours(0, 0, 0, 0);
    }
    
    // Optimiser la requête pour les formats de date multiples
    return this.findByDateRange(nextSaturday, nextSunday, options);
  };

  // Compiler le modèle
  const Event = connection.model('Event', EventSchema, collectionName);

  return Event; // Retourner le modèle compilé
};

module.exports = createEventModel;
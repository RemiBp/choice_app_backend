const mongoose = require('mongoose');
const Producer = require('../models/Producer');
const { UserChoice } = require('../models/User');
const { createModel, databases } = require('../utils/modelCreator');

// Initialiser les modèles directement avec notre utilitaire
const WellnessPlace = createModel(
  databases.BEAUTY_WELLNESS, 
  'WellnessPlace', 
  'WellnessPlaces'
);

const BeautyPlace = createModel(
  databases.BEAUTY_WELLNESS,
  'BeautyPlace',
  'BeautyPlaces'
);

/**
 * Contrôleur pour gérer les producteurs de bien-être et les services associés
 */
const wellnessController = {
  /**
   * Obtenir tous les producteurs de bien-être
   */
  getAllWellnessProducers: async (req, res) => {
    try {
      // S'assurer que les modèles sont initialisés
      if (!WellnessPlace) initialize();

      // Paramètres de pagination
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 20;
      const skip = (page - 1) * limit;

      // Filtres
      const filterParams = {};
      if (req.query.category) filterParams.category = req.query.category;
      if (req.query.tags) filterParams.tags = { $in: req.query.tags.split(',') };
      
      // Filtrer seulement les producteurs dans la catégorie "wellness"
      filterParams.type = "wellness";

      // Obtenir les producteurs paginés
      const producers = await Producer.find(filterParams)
        .skip(skip)
        .limit(limit)
        .sort({ rating: -1 });

      // Compter le nombre total de résultats pour la pagination
      const totalProducers = await Producer.countDocuments(filterParams);

      res.status(200).json({
        producers,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(totalProducers / limit),
          totalItems: totalProducers,
          hasNextPage: page < Math.ceil(totalProducers / limit),
          hasPrevPage: page > 1
        }
      });
    } catch (error) {
      console.error('❌ Erreur dans getAllWellnessProducers:', error);
      res.status(500).json({ message: 'Erreur lors de la récupération des producteurs wellness', error: error.message });
    }
  },

  /**
   * Obtenir un producteur de bien-être par ID
   */
  getWellnessProducerById: async (req, res) => {
    try {
      // S'assurer que les modèles sont initialisés
      if (!WellnessPlace) initialize();

      const { id } = req.params;
      const producer = await Producer.findOne({ _id: id, type: "wellness" });

      if (!producer) {
        // Chercher aussi dans WellnessPlace et BeautyPlace
        const wellnessPlace = await WellnessPlace.findById(id);
        if (wellnessPlace) {
          return res.status(200).json(wellnessPlace);
        }
        
        const beautyPlace = await BeautyPlace.findById(id);
        if (beautyPlace) {
          return res.status(200).json(beautyPlace);
        }
        
        return res.status(404).json({ message: 'Producteur wellness non trouvé' });
      }

      res.status(200).json(producer);
    } catch (error) {
      console.error('❌ Erreur dans getWellnessProducerById:', error);
      res.status(500).json({ message: 'Erreur lors de la récupération du producteur wellness', error: error.message });
    }
  },

  /**
   * Recherche de producteurs de bien-être
   */
  searchWellnessProducers: async (req, res) => {
    try {
      // S'assurer que les modèles sont initialisés
      if (!WellnessPlace) initialize();

      const { q, category, tags, page = 1, limit = 20 } = req.query;
      const skip = (parseInt(page) - 1) * parseInt(limit);

      // Construire la requête de recherche
      const searchQuery = {
        type: "wellness"
      };

      // Recherche textuelle si query est fournie
      if (q) {
        searchQuery.$or = [
          { name: { $regex: q, $options: 'i' } },
          { description: { $regex: q, $options: 'i' } },
          { tags: { $regex: q, $options: 'i' } }
        ];
      }

      // Filtres supplémentaires
      if (category) searchQuery.category = category;
      if (tags) searchQuery.tags = { $in: tags.split(',') };

      // Exécuter la recherche
      const producers = await Producer.find(searchQuery)
        .skip(skip)
        .limit(parseInt(limit))
        .sort({ rating: -1 });

      const totalProducers = await Producer.countDocuments(searchQuery);

      res.status(200).json({
        producers,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(totalProducers / parseInt(limit)),
          totalItems: totalProducers,
          hasNextPage: parseInt(page) < Math.ceil(totalProducers / parseInt(limit)),
          hasPrevPage: parseInt(page) > 1
        }
      });
    } catch (error) {
      console.error('❌ Erreur dans searchWellnessProducers:', error);
      res.status(500).json({ message: 'Erreur lors de la recherche de producteurs wellness', error: error.message });
    }
  },

  /**
   * Obtenir les producteurs de bien-être à proximité
   */
  getNearbyWellnessProducers: async (req, res) => {
    try {
      // S'assurer que les modèles sont initialisés
      if (!WellnessPlace) initialize();

      const { lat, lng, radius = 5000, limit = 20, category, sousCategory, minRating, services } = req.query;

      if (!lat || !lng) {
        return res.status(400).json({ message: 'Les coordonnées (lat, lng) sont requises' });
      }

      // Recherche géospatiale de base
      const geoQuery = {
        location: {
          $nearSphere: {
            $geometry: {
              type: "Point",
              coordinates: [parseFloat(lng), parseFloat(lat)]
            },
            $maxDistance: parseInt(radius)
          }
        }
      };

      // Ajout des filtres supplémentaires
      if (category && category !== 'Tous') {
        geoQuery.category = category;
      }
      
      if (sousCategory) {
        geoQuery.sousCategory = sousCategory;
      }
      
      if (minRating) {
        geoQuery.rating = { $gte: parseFloat(minRating) };
      }
      
      let parsedServices = [];
      if (services) {
        try {
          parsedServices = JSON.parse(services);
          if (Array.isArray(parsedServices) && parsedServices.length > 0) {
            geoQuery.services = { $in: parsedServices };
          }
        } catch (e) {
          console.error('❌ Erreur parsing des services:', e);
        }
      }

      // Exécuter les requêtes en parallèle sur les deux collections
      const [wellnessPlaces, beautyPlaces, wellnessProducers] = await Promise.all([
        WellnessPlace.find(geoQuery).limit(parseInt(limit)),
        BeautyPlace.find(geoQuery).limit(parseInt(limit)),
        Producer.find({
          ...geoQuery,
          type: "wellness"
        }).limit(parseInt(limit))
      ]);

      // Fusionner les résultats et retourner
      const allPlaces = [...wellnessPlaces, ...beautyPlaces, ...wellnessProducers];
      
      res.status(200).json(allPlaces);
    } catch (error) {
      console.error('❌ Erreur dans getNearbyWellnessProducers:', error);
      res.status(500).json({ message: 'Erreur lors de la récupération des producteurs wellness à proximité', error: error.message });
    }
  },

  /**
   * Obtenir les services d'un producteur de bien-être
   */
  getWellnessServices: async (req, res) => {
    try {
      const { id } = req.params;
      
      // Chercher dans les différentes collections
      const producer = await Producer.findOne({ _id: id, type: "wellness" });
      if (producer && producer.services && Array.isArray(producer.services)) {
        return res.status(200).json(producer.services);
      }
      
      const wellnessPlace = await WellnessPlace.findById(id);
      if (wellnessPlace && wellnessPlace.services && Array.isArray(wellnessPlace.services)) {
        return res.status(200).json(wellnessPlace.services);
      }
      
      const beautyPlace = await BeautyPlace.findById(id);
      if (beautyPlace && beautyPlace.services && Array.isArray(beautyPlace.services)) {
        return res.status(200).json(beautyPlace.services);
      }

      // Par défaut, retourner un tableau vide
      res.status(200).json([]);
    } catch (error) {
      console.error('❌ Erreur dans getWellnessServices:', error);
      res.status(500).json({ message: 'Erreur lors de la récupération des services wellness', error: error.message });
    }
  },

  /**
   * Obtenir toutes les catégories de bien-être disponibles
   */
  getWellnessCategories: async (req, res) => {
    try {
      // Récupérer les catégories depuis les différentes collections
      const [producerCategories, wellnessCategories, beautyCategories] = await Promise.all([
        Producer.distinct('category', { type: "wellness" }),
        WellnessPlace.distinct('category'),
        BeautyPlace.distinct('category')
      ]);
      
      // Fusionner les catégories et sous-catégories
      const allCategories = new Set([...producerCategories, ...wellnessCategories, ...beautyCategories]);
      
      // Structure à retourner (catégories et sous-catégories)
      const categoriesMap = {};
      
      // Remplir la map avec les sous-catégories
      for (const category of allCategories) {
        // Récupérer les sous-catégories pour cette catégorie
        const [producerSubCategories, wellnessSubCategories, beautySubCategories] = await Promise.all([
          Producer.distinct('sousCategory', { type: "wellness", category }),
          WellnessPlace.distinct('sousCategory', { category }),
          BeautyPlace.distinct('sousCategory', { category })
        ]);
        
        // Fusionner les sous-catégories
        const subCategories = [...new Set([...producerSubCategories, ...wellnessSubCategories, ...beautySubCategories])];
        
        // Ajouter à la map
        categoriesMap[category] = subCategories.filter(Boolean); // Filtrer les valeurs null/undefined
      }
      
      res.status(200).json(categoriesMap);
    } catch (error) {
      console.error('❌ Erreur dans getWellnessCategories:', error);
      res.status(500).json({ message: 'Erreur lors de la récupération des catégories wellness', error: error.message });
    }
  },

  /**
   * Obtenir les producteurs de bien-être favoris d'un utilisateur
   */
  getUserFavoriteWellnessProducers: async (req, res) => {
    try {
      const { userId } = req.params;
      
      // Vérifier que l'utilisateur existe
      const user = await UserChoice.findById(userId);
      if (!user) {
        return res.status(404).json({ message: 'Utilisateur non trouvé' });
      }

      // Si l'utilisateur a des producteurs favoris
      if (user.followingProducers && Array.isArray(user.followingProducers) && user.followingProducers.length > 0) {
        // Récupérer tous les producteurs wellness favoris
        const favoriteProducers = await Producer.find({
          _id: { $in: user.followingProducers },
          type: "wellness"
        });

        return res.status(200).json(favoriteProducers);
      }

      // Par défaut, retourner un tableau vide
      res.status(200).json([]);
    } catch (error) {
      console.error('❌ Erreur dans getUserFavoriteWellnessProducers:', error);
      res.status(500).json({ message: 'Erreur lors de la récupération des producteurs wellness favoris', error: error.message });
    }
  },
  
  /**
   * Mettre à jour les photos d'un producteur de bien-être
   */
  updateWellnessProducerPhotos: async (req, res) => {
    try {
      const { id } = req.params;
      const { photos } = req.body;
      
      if (!Array.isArray(photos)) {
        return res.status(400).json({ message: 'Photos doit être un tableau de URLs' });
      }
      
      // Chercher le producteur dans les différentes collections
      let producer = await Producer.findOne({ _id: id, type: "wellness" });
      if (producer) {
        producer.photos = photos;
        await producer.save();
        return res.status(200).json(producer);
      }
      
      let wellnessPlace = await WellnessPlace.findById(id);
      if (wellnessPlace) {
        wellnessPlace.photos = photos;
        await wellnessPlace.save();
        return res.status(200).json(wellnessPlace);
      }
      
      let beautyPlace = await BeautyPlace.findById(id);
      if (beautyPlace) {
        beautyPlace.photos = photos;
        await beautyPlace.save();
        return res.status(200).json(beautyPlace);
      }
      
      return res.status(404).json({ message: 'Producteur wellness non trouvé' });
    } catch (error) {
      console.error('❌ Erreur dans updateWellnessProducerPhotos:', error);
      res.status(500).json({ message: 'Erreur lors de la mise à jour des photos', error: error.message });
    }
  },
  
  /**
   * Ajouter des photos à un producteur de bien-être
   */
  addWellnessProducerPhotos: async (req, res) => {
    try {
      const { id } = req.params;
      const { photoUrls } = req.body;
      
      if (!Array.isArray(photoUrls)) {
        return res.status(400).json({ message: 'photoUrls doit être un tableau de URLs' });
      }
      
      // Chercher le producteur dans les différentes collections
      let producer = await Producer.findOne({ _id: id, type: "wellness" });
      if (producer) {
        producer.photos = [...(producer.photos || []), ...photoUrls];
        await producer.save();
        return res.status(200).json(producer.photos);
      }
      
      let wellnessPlace = await WellnessPlace.findById(id);
      if (wellnessPlace) {
        wellnessPlace.photos = [...(wellnessPlace.photos || []), ...photoUrls];
        await wellnessPlace.save();
        return res.status(200).json(wellnessPlace.photos);
      }
      
      let beautyPlace = await BeautyPlace.findById(id);
      if (beautyPlace) {
        beautyPlace.photos = [...(beautyPlace.photos || []), ...photoUrls];
        await beautyPlace.save();
        return res.status(200).json(beautyPlace.photos);
      }
      
      return res.status(404).json({ message: 'Producteur wellness non trouvé' });
    } catch (error) {
      console.error('❌ Erreur dans addWellnessProducerPhotos:', error);
      res.status(500).json({ message: 'Erreur lors de l\'ajout des photos', error: error.message });
    }
  },
  
  /**
   * Supprimer une photo d'un producteur de bien-être
   */
  deleteWellnessProducerPhoto: async (req, res) => {
    try {
      const { id, photoUrl } = req.params;
      
      // Chercher le producteur dans les différentes collections
      let producer = await Producer.findOne({ _id: id, type: "wellness" });
      if (producer && producer.photos) {
        producer.photos = producer.photos.filter(photo => photo !== photoUrl);
        await producer.save();
        return res.status(204).send();
      }
      
      let wellnessPlace = await WellnessPlace.findById(id);
      if (wellnessPlace && wellnessPlace.photos) {
        wellnessPlace.photos = wellnessPlace.photos.filter(photo => photo !== photoUrl);
        await wellnessPlace.save();
        return res.status(204).send();
      }
      
      let beautyPlace = await BeautyPlace.findById(id);
      if (beautyPlace && beautyPlace.photos) {
        beautyPlace.photos = beautyPlace.photos.filter(photo => photo !== photoUrl);
        await beautyPlace.save();
        return res.status(204).send();
      }
      
      return res.status(404).json({ message: 'Producteur wellness ou photo non trouvés' });
    } catch (error) {
      console.error('❌ Erreur dans deleteWellnessProducerPhoto:', error);
      res.status(500).json({ message: 'Erreur lors de la suppression de la photo', error: error.message });
    }
  },
  
  /**
   * Mettre à jour les services d'un producteur de bien-être
   */
  updateWellnessProducerServices: async (req, res) => {
    try {
      const { id } = req.params;
      const { services } = req.body;
      
      if (!Array.isArray(services)) {
        return res.status(400).json({ message: 'Services doit être un tableau' });
      }
      
      // Chercher le producteur dans les différentes collections
      let producer = await Producer.findOne({ _id: id, type: "wellness" });
      if (producer) {
        producer.services = services;
        await producer.save();
        return res.status(200).json(services);
      }
      
      let wellnessPlace = await WellnessPlace.findById(id);
      if (wellnessPlace) {
        wellnessPlace.services = services;
        await wellnessPlace.save();
        return res.status(200).json(services);
      }
      
      let beautyPlace = await BeautyPlace.findById(id);
      if (beautyPlace) {
        beautyPlace.services = services;
        await beautyPlace.save();
        return res.status(200).json(services);
      }
      
      return res.status(404).json({ message: 'Producteur wellness non trouvé' });
    } catch (error) {
      console.error('❌ Erreur dans updateWellnessProducerServices:', error);
      res.status(500).json({ message: 'Erreur lors de la mise à jour des services', error: error.message });
    }
  },
  
  /**
   * Mettre à jour les notes d'un producteur de bien-être
   */
  updateWellnessProducerNotes: async (req, res) => {
    try {
      const { id } = req.params;
      const { notes } = req.body;
      
      // Chercher le producteur dans les différentes collections
      let producer = await Producer.findOne({ _id: id, type: "wellness" });
      if (producer) {
        producer.notes = notes;
        await producer.save();
        return res.status(200).json({ notes });
      }
      
      let wellnessPlace = await WellnessPlace.findById(id);
      if (wellnessPlace) {
        wellnessPlace.notes = notes;
        await wellnessPlace.save();
        return res.status(200).json({ notes });
      }
      
      let beautyPlace = await BeautyPlace.findById(id);
      if (beautyPlace) {
        beautyPlace.notes = notes;
        await beautyPlace.save();
        return res.status(200).json({ notes });
      }
      
      return res.status(404).json({ message: 'Producteur wellness non trouvé' });
    } catch (error) {
      console.error('❌ Erreur dans updateWellnessProducerNotes:', error);
      res.status(500).json({ message: 'Erreur lors de la mise à jour des notes', error: error.message });
    }
  },

  /**
   * Mettre à jour les informations générales d'un producteur de bien-être
   */
  updateWellnessProducer: async (req, res) => {
    try {
      const { id } = req.params;
      const updateData = req.body;

      // Valider que l'ID est un ObjectId valide
      if (!mongoose.isValidObjectId(id)) {
        return res.status(400).json({ message: 'ID invalide' });
      }

      // Retirer les champs non modifiables ou potentiellement dangereux
      delete updateData._id; 
      delete updateData.created_at; 
      delete updateData.type; // Le type ne devrait pas changer
      delete updateData.rating; // La note est généralement calculée
      delete updateData.reviews; // Les avis sont gérés par d'autres routes
      delete updateData.choice_count; // Compteurs gérés par le système
      delete updateData.interest_count;
      delete updateData.favorite_count;
      delete updateData.choiceUsers;
      delete updateData.interestedUsers;
      delete updateData.favorites;
      // On ne met pas à jour les photos ici, elles ont leurs propres routes
      delete updateData.photos; 
      delete updateData.images;
      delete updateData.profilePhoto;

      // Gérer les mises à jour imbriquées (contact, location)
      // On utilise $set pour éviter de remplacer tout l'objet si seulement un sous-champ est envoyé
      const updatePayload = {};
      for (const key in updateData) {
        if (key === 'contact' && typeof updateData.contact === 'object') {
          for (const contactKey in updateData.contact) {
            updatePayload[`contact.${contactKey}`] = updateData.contact[contactKey];
          }
        } else if (key === 'location' && typeof updateData.location === 'object') {
          for (const locationKey in updateData.location) {
            // Ne pas permettre la modification directe des coordonnées ou du type Point ici
            if (locationKey !== 'coordinates' && locationKey !== 'type') {
              updatePayload[`location.${locationKey}`] = updateData.location[locationKey];
            }
          }
        } else if (key === 'services' && Array.isArray(updateData.services)) {
          // Valider la structure des services si nécessaire avant de mettre à jour
          updatePayload[key] = updateData.services; 
        } else if (key === 'business_hours' && typeof updateData.business_hours === 'object') {
           updatePayload[key] = updateData.business_hours; // Remplacer les horaires
        } else if (key !== 'services' && key !== 'business_hours') {
          // Mettre à jour les champs simples directement
          updatePayload[key] = updateData[key];
        }
      }

      // Ajouter la date de mise à jour
      updatePayload.updated_at = new Date();

      // Essayer de trouver et mettre à jour dans BeautyPlaces (via WellnessPlace model)
      const updatedProducer = await WellnessPlace.findByIdAndUpdate(
        id,
        { $set: updatePayload },
        { new: true, runValidators: true } // new: retourne le doc mis à jour, runValidators: active les validations du schéma
      );

      if (!updatedProducer) {
        return res.status(404).json({ message: 'Producteur wellness non trouvé' });
      }

      console.log(`✅ Producteur wellness ${id} mis à jour.`);
      res.status(200).json(updatedProducer);

    } catch (error) {
      console.error('❌ Erreur dans updateWellnessProducer:', error);
       // Gérer les erreurs de validation Mongoose
       if (error.name === 'ValidationError') {
         return res.status(400).json({ message: 'Erreur de validation', errors: error.errors });
       }
      res.status(500).json({ message: 'Erreur lors de la mise à jour du producteur wellness', error: error.message });
    }
  },
};

module.exports = wellnessController; 
const mongoose = require('mongoose');
const { UserChoice } = require('../models/User');
const { createModel, databases } = require('../utils/modelCreator');
const { getModel } = require('../models');

const WellnessPlace = getModel('WellnessPlace');
const BeautyPlace = getModel('BeautyPlace') || WellnessPlace;

function checkWellnessModels() {
  if (!WellnessPlace || !BeautyPlace) {
    console.error("❌ Erreur critique: Modèles WellnessPlace ou BeautyPlace non initialisés.");
    throw new Error("Modèles Wellness/Beauty non initialisés.");
  }
}

/**
 * Contrôleur pour gérer les producteurs de bien-être et les services associés
 */
const wellnessController = {
  /**
   * Obtenir tous les producteurs de bien-être
   */
  getAllWellnessProducers: async (req, res) => {
    try {
      checkWellnessModels();

      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 20;
      const skip = (page - 1) * limit;

      const filterParams = {};
      if (req.query.category) filterParams.category = req.query.category;
      if (req.query.tags) filterParams.tags = { $in: req.query.tags.split(',') };
      
      const producers = await WellnessPlace.find(filterParams)
        .skip(skip)
        .limit(limit)
        .sort({ rating: -1 });

      const totalProducers = await WellnessPlace.countDocuments(filterParams);

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
      checkWellnessModels();

      const { id } = req.params;
      
      let producer = await WellnessPlace.findById(id);
      if (!producer && BeautyPlace !== WellnessPlace) { 
        producer = await BeautyPlace.findById(id);
      }

      if (!producer) {
        return res.status(404).json({ message: 'Producteur wellness non trouvé' });
      }

      res.status(200).json(producer);
    } catch (error) {
      console.error('❌ Erreur dans getWellnessProducerById:', error);
      
      if (error.name === 'CastError') {
        return res.status(400).json({ message: `Format de l'ID invalide: ${req.params.id}` });
      }
      res.status(500).json({ message: 'Erreur lors de la récupération du producteur wellness', error: error.message });
    }
  },

  /**
   * Recherche de producteurs de bien-être
   */
  searchWellnessProducers: async (req, res) => {
    try {
      checkWellnessModels();

      const { q, category, tags, page = 1, limit = 20 } = req.query;
      const skip = (parseInt(page) - 1) * parseInt(limit);

      const searchQuery = {};

      if (q) {
        searchQuery.$text = { $search: q };
      }

      if (category) searchQuery.category = category;
      if (tags) searchQuery.tags = { $in: tags.split(',') };

      const producers = await WellnessPlace.find(searchQuery)
        .skip(skip)
        .limit(parseInt(limit))
        .sort({ score: { $meta: "textScore" }, rating: -1 });

      const totalProducers = await WellnessPlace.countDocuments(searchQuery);

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
      checkWellnessModels();

      const { lat, lng, radius = 5000, limit = 20, category, sousCategory, minRating, services } = req.query;

      if (!lat || !lng) {
        return res.status(400).json({ message: 'Les coordonnées (lat, lng) sont requises' });
      }

      const geoQuery = {
        "location.coordinates": {
          $nearSphere: {
            $geometry: {
              type: "Point",
              coordinates: [parseFloat(lng), parseFloat(lat)]
            },
            $maxDistance: parseInt(radius)
          }
        }
      };

      if (category && category !== 'Tous') {
        geoQuery.category = category;
      }
      
      if (sousCategory) {
        geoQuery.sous_categorie = sousCategory;
      }
      
      if (minRating) {
        geoQuery["rating.average"] = { $gte: parseFloat(minRating) };
      }
      
      let parsedServices = [];
      if (services) {
        try {
          parsedServices = JSON.parse(services);
          if (Array.isArray(parsedServices) && parsedServices.length > 0) {
            geoQuery["services.name"] = { $in: parsedServices };
          }
        } catch (e) {
          console.error('❌ Erreur parsing des services:', e);
        }
      }

      const nearbyPlaces = await WellnessPlace.find(geoQuery).limit(parseInt(limit));
      
      const allPlaces = nearbyPlaces;
      
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
      checkWellnessModels();
      const { id } = req.params;
      
      let place = await WellnessPlace.findById(id).select('services');
      if (!place && BeautyPlace !== WellnessPlace) { 
        place = await BeautyPlace.findById(id).select('services');
      }

      if (place && place.services && Array.isArray(place.services)) {
        return res.status(200).json(place.services);
      }

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
      const [producerCategories, wellnessCategories, beautyCategories] = await Promise.all([
        Producer.distinct('category', { type: "wellness" }),
        WellnessPlace.distinct('category'),
        BeautyPlace.distinct('category')
      ]);
      
      const allCategories = new Set([...producerCategories, ...wellnessCategories, ...beautyCategories]);
      
      const categoriesMap = {};
      
      for (const category of allCategories) {
        const [producerSubCategories, wellnessSubCategories, beautySubCategories] = await Promise.all([
          Producer.distinct('sousCategory', { type: "wellness", category }),
          WellnessPlace.distinct('sousCategory', { category }),
          BeautyPlace.distinct('sousCategory', { category })
        ]);
        
        const subCategories = [...new Set([...producerSubCategories, ...wellnessSubCategories, ...beautySubCategories])];
        
        categoriesMap[category] = subCategories.filter(Boolean);
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
      
      const user = await UserChoice.findById(userId);
      if (!user) {
        return res.status(404).json({ message: 'Utilisateur non trouvé' });
      }

      if (user.followingProducers && Array.isArray(user.followingProducers) && user.followingProducers.length > 0) {
        const favoriteProducers = await Producer.find({
          _id: { $in: user.followingProducers },
          type: "wellness"
        });

        return res.status(200).json(favoriteProducers);
      }

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
      
      let producer = await WellnessPlace.findById(id);
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
      
      let producer = await WellnessPlace.findById(id);
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
      
      let producer = await WellnessPlace.findById(id);
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
      
      let producer = await WellnessPlace.findById(id);
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
      
      let producer = await WellnessPlace.findById(id);
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
      checkWellnessModels();
      const { id } = req.params;
      const updateData = req.body;

      if (!mongoose.isValidObjectId(id)) {
        return res.status(400).json({ message: 'ID invalide' });
      }

      delete updateData._id; 
      delete updateData.created_at; 
      delete updateData.type;
      delete updateData.rating;
      delete updateData.reviews;
      delete updateData.choice_count;
      delete updateData.interest_count;
      delete updateData.favorite_count;
      delete updateData.choiceUsers;
      delete updateData.interestedUsers;
      delete updateData.favorites;
      delete updateData.photos; 
      delete updateData.images;
      delete updateData.profilePhoto;

      const updatePayload = {};
      for (const key in updateData) {
        if (key === 'contact' && typeof updateData.contact === 'object') {
          for (const contactKey in updateData.contact) {
            updatePayload[`contact.${contactKey}`] = updateData.contact[contactKey];
          }
        } else if (key === 'location' && typeof updateData.location === 'object') {
          for (const locationKey in updateData.location) {
            if (locationKey !== 'coordinates' && locationKey !== 'type') {
              updatePayload[`location.${locationKey}`] = updateData.location[locationKey];
            }
          }
        } else if (key === 'services' && Array.isArray(updateData.services)) {
          updatePayload[key] = updateData.services; 
        } else if (key === 'business_hours' && typeof updateData.business_hours === 'object') {
           updatePayload[key] = updateData.business_hours;
        } else if (key !== 'services' && key !== 'business_hours') {
          updatePayload[key] = updateData[key];
        }
      }

      updatePayload.updated_at = new Date();

      const updatedPlace = await WellnessPlace.findByIdAndUpdate(
        id,
        { $set: updatePayload },
        { new: true, runValidators: true }
      );

      if (!updatedPlace) {
        return res.status(404).json({ message: 'Producteur wellness non trouvé' });
      }

      console.log(`✅ Producteur wellness ${id} mis à jour.`);
      res.status(200).json(updatedPlace);

    } catch (error) {
      console.error('❌ Erreur dans updateWellnessProducer:', error);
      
      if (error.name === 'ValidationError') {
         return res.status(400).json({ message: 'Erreur de validation', errors: error.errors });
       }
      res.status(500).json({ message: 'Erreur lors de la mise à jour du producteur wellness', error: error.message });
    }
  },

  /**
   * Ajouter ou mettre à jour un service pour un producteur
   */
  upsertWellnessService: async (req, res) => {
    try {
      checkWellnessModels();
      const { id } = req.params;
      const serviceData = req.body;

      if (!serviceData || !serviceData.name || !serviceData.price) {
        return res.status(400).json({ message: 'Données de service invalides (nom et prix requis)' });
      }

      const place = await WellnessPlace.findById(id);

      if (!place) {
        return res.status(404).json({ message: 'Producteur wellness non trouvé' });
      }

      const existingServiceIndex = place.services.findIndex(s => s.name === serviceData.name);

      if (existingServiceIndex > -1) {
        place.services[existingServiceIndex] = { ...place.services[existingServiceIndex], ...serviceData };
      } else {
        place.services.push(serviceData);
      }

      await place.save();
      res.status(200).json(place.services);
    } catch (error) {
      console.error('❌ Erreur dans upsertWellnessService:', error);
      res.status(500).json({ message: 'Erreur lors de l\'ajout/mise à jour du service wellness', error: error.message });
    }
  },

  /**
   * Supprimer un service d'un producteur
   */
  deleteWellnessService: async (req, res) => {
    try {
      checkWellnessModels();
      const { id, serviceName } = req.params;

      if (!serviceName) {
        return res.status(400).json({ message: 'Nom du service requis pour la suppression' });
      }

      const place = await WellnessPlace.findById(id);

      if (!place) {
        return res.status(404).json({ message: 'Producteur wellness non trouvé' });
      }

      const initialLength = place.services.length;
      place.services = place.services.filter(s => s.name !== serviceName);

      if (place.services.length === initialLength) {
        return res.status(404).json({ message: `Service "${serviceName}" non trouvé pour ce producteur` });
      }

      await place.save();
      res.status(200).json({ message: `Service "${serviceName}" supprimé avec succès` });
    } catch (error) {
      console.error('❌ Erreur dans deleteWellnessService:', error);
      res.status(500).json({ message: 'Erreur lors de la suppression du service wellness', error: error.message });
    }
  },

  /**
   * Supprimer un producteur de bien-être
   */
  deleteWellnessProducer: async (req, res) => {
    try {
      checkWellnessModels();
      const { id } = req.params;

      const deletedPlace = await WellnessPlace.findByIdAndDelete(id);

      if (!deletedPlace) {
        return res.status(404).json({ message: 'Producteur wellness non trouvé' });
      }
      res.status(200).json({ message: 'Producteur wellness supprimé avec succès' });
    } catch (error) {
      console.error('❌ Erreur dans deleteWellnessProducer:', error);
      res.status(500).json({ message: 'Erreur lors de la suppression du producteur wellness', error: error.message });
    }
  }
};

module.exports = wellnessController; 
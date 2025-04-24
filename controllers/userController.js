const mongoose = require('mongoose');
const User = require('../models/User');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { choiceAppDb } = require('../index');
const Choice = require('../models/choiceModel');
const Producer = require('../models/Producer');

/**
 * Contrôleur pour gérer les utilisateurs
 */
const userController = {
  /**
   * Obtenir tous les utilisateurs avec pagination
   */
  getAllUsers: async (req, res) => {
    try {
      // Paramètres de pagination
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 20;
      const skip = (page - 1) * limit;
      
      // Filtres
      const filterParams = {};
      if (req.query.status) filterParams.status = req.query.status;
      
      // Obtenir les utilisateurs paginés
      const users = await User.find(filterParams)
        .skip(skip)
        .limit(limit)
        .select('-password -refreshToken -resetToken'); // Exclure les informations sensibles
      
      // Compter le nombre total de résultats pour la pagination
      const totalUsers = await User.countDocuments(filterParams);
      
      res.status(200).json({
        users,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(totalUsers / limit),
          totalItems: totalUsers,
          hasNextPage: page < Math.ceil(totalUsers / limit),
          hasPrevPage: page > 1
        }
      });
    } catch (error) {
      console.error('❌ Erreur dans getAllUsers:', error);
      res.status(500).json({ message: 'Erreur lors de la récupération des utilisateurs', error: error.message });
    }
  },
  
  /**
   * Obtenir un utilisateur par ID
   */
  getUserById: async (req, res) => {
    try {
      const { id } = req.params;
      const user = await User.findById(id).select('-password -refreshToken -resetToken');
      
      if (!user) {
        return res.status(404).json({ message: 'Utilisateur non trouvé' });
      }
      
      res.status(200).json(user);
    } catch (error) {
      console.error('❌ Erreur dans getUserById:', error);
      res.status(500).json({ message: 'Erreur lors de la récupération de l\'utilisateur', error: error.message });
    }
  },
  
  /**
   * Mettre à jour un utilisateur
   */
  updateUser: async (req, res) => {
    try {
      const { id } = req.params;
      const updateData = req.body;
      
      // Vérifier que l'utilisateur existe
      const user = await User.findById(id);
      if (!user) {
        return res.status(404).json({ message: 'Utilisateur non trouvé' });
      }
      
      // Ne pas permettre la mise à jour de certains champs sensibles
      const protectedFields = ['password', 'refreshToken', 'resetToken', 'email'];
      protectedFields.forEach(field => {
        if (updateData[field]) {
          delete updateData[field];
        }
      });
      
      // Mettre à jour l'utilisateur
      const updatedUser = await User.findByIdAndUpdate(
        id,
        { $set: updateData },
        { new: true }
      ).select('-password -refreshToken -resetToken');
      
      res.status(200).json({
        message: 'Utilisateur mis à jour avec succès',
        user: updatedUser
      });
    } catch (error) {
      console.error('❌ Erreur dans updateUser:', error);
      res.status(500).json({ message: 'Erreur lors de la mise à jour de l\'utilisateur', error: error.message });
    }
  },
  
  /**
   * Supprimer un utilisateur
   */
  deleteUser: async (req, res) => {
    try {
      const { id } = req.params;
      
      // Vérifier que l'utilisateur existe
      const user = await User.findById(id);
      if (!user) {
        return res.status(404).json({ message: 'Utilisateur non trouvé' });
      }
      
      // Supprimer l'utilisateur
      await User.findByIdAndDelete(id);
      
      res.status(200).json({ message: 'Utilisateur supprimé avec succès' });
    } catch (error) {
      console.error('❌ Erreur dans deleteUser:', error);
      res.status(500).json({ message: 'Erreur lors de la suppression de l\'utilisateur', error: error.message });
    }
  },
  
  /**
   * Obtenir les favoris d'un utilisateur
   */
  getUserFavorites: async (req, res) => {
    try {
      const { id } = req.params;
      
      // Vérifier que l'utilisateur existe
      const user = await User.findById(id).select('followingProducers followingEvents');
      
      if (!user) {
        return res.status(404).json({ message: 'Utilisateur non trouvé' });
      }
      
      res.status(200).json({
        followingProducers: user.followingProducers || [],
        followingEvents: user.followingEvents || []
      });
    } catch (error) {
      console.error('❌ Erreur dans getUserFavorites:', error);
      res.status(500).json({ message: 'Erreur lors de la récupération des favoris', error: error.message });
    }
  },
  
  /**
   * Obtenir le profil d'un utilisateur
   */
  getUserProfile: async (req, res) => {
    try {
      const { id } = req.params;

      // Vérifier que l'ID est valide
      if (!mongoose.Types.ObjectId.isValid(id)) {
          return res.status(400).json({ message: 'Invalid User ID format' });
      }

      // Récupérer l'utilisateur et peupler les choices et leurs lieux associés
      const user = await User.findById(id)
        .select('-password -refreshToken -resetToken') // Exclure les champs sensibles
        .populate({
            path: 'choices', // Le champ dans UserChoice qui référence les Choices
            model: 'Choice', // Le nom du modèle Choice
            populate: {       // Peupler le lieu à l'intérieur de chaque choice
                path: 'locationId',
                select: 'name address category photos image photo_url type', // Sélectionner les champs utiles du lieu
                 // Si 'locationId' peut référencer plusieurs modèles (Producer, Event, etc.)
                 // Mongoose peut essayer de deviner, mais il est préférable d'avoir un champ 'locationType' dans Choice
                 // ou d'utiliser des discriminants si Producer/Event/etc. héritent d'un modèle de base.
                 // Pour l'instant, on suppose que populate peut le résoudre ou que locationId pointe vers un modèle unifié/Producer.
            }
        })
        .populate('posts') // Peuple également les posts si nécessaire
        .populate('followers', 'name profilePicture') // Infos de base des followers
        .populate('following', 'name profilePicture'); // Infos de base des followings

      if (!user) {
        return res.status(404).json({ message: 'Utilisateur non trouvé' });
      }

      // Conversion en objet JS pour potentiellement manipuler avant envoi
      const userObject = user.toObject();

      // Optionnel: Assurer que les champs peuplés sont bien des tableaux (même si vides)
      userObject.choices = userObject.choices || [];
      userObject.posts = userObject.posts || [];
      userObject.followers = userObject.followers || [];
      userObject.following = userObject.following || [];

      console.log(`Fetched profile for ${id} with ${userObject.choices.length} populated choices.`);

      res.status(200).json(userObject);
    } catch (error) {
      console.error('❌ Erreur dans getUserProfile:', error);
      // Vérifier si l'erreur est due à un ID mal formaté
      if (error.name === 'CastError' && error.kind === 'ObjectId') {
            return res.status(400).json({ message: 'Invalid User ID format' });
      }
      res.status(500).json({ message: 'Erreur lors de la récupération du profil utilisateur', error: error.message });
    }
  },
  
  /**
   * Mettre à jour le mot de passe d'un utilisateur
   */
  updatePassword: async (req, res) => {
    try {
      const { id } = req.params;
      const { currentPassword, newPassword } = req.body;
      
      if (!currentPassword || !newPassword) {
        return res.status(400).json({ message: 'Mot de passe actuel et nouveau mot de passe requis' });
      }
      
      // Vérifier que l'utilisateur existe
      const user = await User.findById(id);
      if (!user) {
        return res.status(404).json({ message: 'Utilisateur non trouvé' });
      }
      
      // Vérifier le mot de passe actuel
      const isMatch = await bcrypt.compare(currentPassword, user.password);
      if (!isMatch) {
        return res.status(401).json({ message: 'Mot de passe actuel incorrect' });
      }
      
      // Hacher le nouveau mot de passe
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(newPassword, salt);
      
      // Mettre à jour le mot de passe
      user.password = hashedPassword;
      await user.save();
      
      res.status(200).json({ message: 'Mot de passe mis à jour avec succès' });
    } catch (error) {
      console.error('❌ Erreur dans updatePassword:', error);
      res.status(500).json({ message: 'Erreur lors de la mise à jour du mot de passe', error: error.message });
    }
  },
  
  /**
   * Suivre un utilisateur ou un producteur
   */
  follow: async (req, res) => {
    try {
      const { userId } = req.params;
      const { targetId, targetType } = req.body;
      
      if (!userId || !targetId || !targetType) {
        return res.status(400).json({ message: 'ID utilisateur, ID cible et type cible requis' });
      }
      
      // Vérifier que l'utilisateur existe
      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({ message: 'Utilisateur non trouvé' });
      }
      
      // Suivre un utilisateur ou un producteur selon le type
      if (targetType === 'user') {
        // Vérifier que l'utilisateur cible existe
        const targetUser = await User.findById(targetId);
        if (!targetUser) {
          return res.status(404).json({ message: 'Utilisateur cible non trouvé' });
        }
        
        // Vérifier si l'utilisateur suit déjà la cible
        if (user.following && user.following.includes(targetId)) {
          return res.status(400).json({ message: 'Déjà suivi' });
        }
        
        // Ajouter la cible aux suivis de l'utilisateur
        if (!user.following) {
          user.following = [];
        }
        user.following.push(targetId);
        
        // Ajouter l'utilisateur aux followers de la cible
        if (!targetUser.followers) {
          targetUser.followers = [];
        }
        targetUser.followers.push(userId);
        
        // Sauvegarder les modifications
        await Promise.all([user.save(), targetUser.save()]);
      } else if (targetType === 'producer') {
        // Vérifier si l'utilisateur suit déjà le producteur
        if (user.followingProducers && user.followingProducers.includes(targetId)) {
          return res.status(400).json({ message: 'Déjà suivi' });
        }
        
        // Ajouter le producteur aux producteurs suivis
        if (!user.followingProducers) {
          user.followingProducers = [];
        }
        user.followingProducers.push(targetId);
        
        // Sauvegarder les modifications
        await user.save();
      } else {
        return res.status(400).json({ message: 'Type cible invalide' });
      }
      
      res.status(200).json({ message: 'Suivi avec succès' });
    } catch (error) {
      console.error('❌ Erreur dans follow:', error);
      res.status(500).json({ message: 'Erreur lors du suivi', error: error.message });
    }
  },
  
  /**
   * Ne plus suivre un utilisateur ou un producteur
   */
  unfollow: async (req, res) => {
    try {
      const { userId } = req.params;
      const { targetId, targetType } = req.body;
      
      if (!userId || !targetId || !targetType) {
        return res.status(400).json({ message: 'ID utilisateur, ID cible et type cible requis' });
      }
      
      // Vérifier que l'utilisateur existe
      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({ message: 'Utilisateur non trouvé' });
      }
      
      // Ne plus suivre un utilisateur ou un producteur selon le type
      if (targetType === 'user') {
        // Vérifier que l'utilisateur cible existe
        const targetUser = await User.findById(targetId);
        if (!targetUser) {
          return res.status(404).json({ message: 'Utilisateur cible non trouvé' });
        }
        
        // Vérifier si l'utilisateur suit la cible
        if (!user.following || !user.following.includes(targetId)) {
          return res.status(400).json({ message: 'Non suivi' });
        }
        
        // Retirer la cible des suivis de l'utilisateur
        user.following = user.following.filter(id => id.toString() !== targetId);
        
        // Retirer l'utilisateur des followers de la cible
        targetUser.followers = targetUser.followers.filter(id => id.toString() !== userId);
        
        // Sauvegarder les modifications
        await Promise.all([user.save(), targetUser.save()]);
      } else if (targetType === 'producer') {
        // Vérifier si l'utilisateur suit le producteur
        if (!user.followingProducers || !user.followingProducers.includes(targetId)) {
          return res.status(400).json({ message: 'Non suivi' });
        }
        
        // Retirer le producteur des producteurs suivis
        user.followingProducers = user.followingProducers.filter(id => id.toString() !== targetId);
        
        // Sauvegarder les modifications
        await user.save();
      } else {
        return res.status(400).json({ message: 'Type cible invalide' });
      }
      
      res.status(200).json({ message: 'Suivi retiré avec succès' });
    } catch (error) {
      console.error('❌ Erreur dans unfollow:', error);
      res.status(500).json({ message: 'Erreur lors du retrait du suivi', error: error.message });
    }
  },

  /**
   * Obtenir le profil public d'un utilisateur
   */
  getPublicProfile: async (req, res) => {
    try {
      const { userId } = req.params;

      // Vérifier que l'ID est valide
      if (!mongoose.Types.ObjectId.isValid(userId)) {
        return res.status(400).json({ message: 'Invalid User ID format' });
      }

      // Récupérer l'utilisateur et sélectionner uniquement les champs publics
      const user = await User.findById(userId)
        .select('_id name profilePicture bio liked_tags'); // Champs publics

      if (!user) {
        return res.status(404).json({ message: 'Utilisateur non trouvé' });
      }

      res.status(200).json(user); // Renvoyer le profil public

    } catch (error) {
      console.error('❌ Erreur dans getPublicProfile:', error);
      res.status(500).json({ message: 'Erreur lors de la récupération du profil public', error: error.message });
    }
  },

  /**
   * Endpoint pour suggérer des utilisateurs
   */
  // ... existing code ...
};

module.exports = userController; 
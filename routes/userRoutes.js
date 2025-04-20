const express = require('express');
const bcrypt = require('bcrypt'); // Pour le hashage des mots de passe
const User = require('../models/User'); // Modèle utilisateur
const router = express.Router();

// **1. Inscription utilisateur**
router.post('/register', async (req, res) => {
  const { name, email, password } = req.body;

  // Validation basique des données
  if (!name || !email || !password) {
    return res.status(400).json({ message: 'Veuillez fournir un nom, un email et un mot de passe' });
  }

  try {
    // Vérifier si l'email existe déjà
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(409).json({ message: 'Cet email est déjà utilisé' });
    }

    // Hashage du mot de passe
    const hashedPassword = await bcrypt.hash(password, 10);

    // Créer un nouvel utilisateur
    const user = new User({ name, email, password: hashedPassword });
    await user.save();

    res.status(201).json({ message: 'Utilisateur créé avec succès', user });
  } catch (err) {
    res.status(500).json({ message: 'Erreur lors de l\'inscription', error: err.message });
  }
});

// **2. Connexion utilisateur**
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  // Validation basique des données
  if (!email || !password) {
    return res.status(400).json({ message: 'Veuillez fournir un email et un mot de passe' });
  }

  try {
    // Vérifier si l'utilisateur existe
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: 'Utilisateur introuvable' });
    }

    // Vérifier le mot de passe
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ message: 'Mot de passe incorrect' });
    }

    // Réponse avec les informations utilisateur (sans le mot de passe)
    const { password: _, ...userWithoutPassword } = user.toObject();
    res.json({ message: 'Connexion réussie', user: userWithoutPassword });
  } catch (err) {
    res.status(500).json({ message: 'Erreur lors de la connexion', error: err.message });
  }
});

// **3. Modifier le profil utilisateur**
router.put('/:id', async (req, res) => {
  try {
    // Vérifier si l'utilisateur existe
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: 'Utilisateur introuvable' });
    }

    // Mettre à jour les champs spécifiés
    const updates = req.body;
    if (updates.password) {
      // Hashage du mot de passe si mis à jour
      updates.password = await bcrypt.hash(updates.password, 10);
    }

    const updatedUser = await User.findByIdAndUpdate(req.params.id, updates, { new: true });
    res.json(updatedUser);
  } catch (err) {
    res.status(500).json({ message: 'Erreur lors de la mise à jour du profil', error: err.message });
  }
});

// **4. Récupérer les statistiques utilisateur**
router.get('/:id/stats', async (req, res) => {
  try {
    // Trouver l'utilisateur par son ID
    const user = await User.findById(req.params.id)
      .populate('favorites', 'name') // Charger les favoris pour obtenir leurs noms
      .populate('history', 'name'); // Charger l'historique

    if (!user) {
      return res.status(404).json({ message: 'Utilisateur introuvable' });
    }

    // Calculer les statistiques
    const stats = {
      favoritesCount: user.favorites.length,
      historyCount: user.history.length,
      categories: user.preferences, // Catégories enregistrées dans les préférences
    };

    res.json(stats);
  } catch (err) {
    res.status(500).json({ message: 'Erreur lors de la récupération des statistiques', error: err.message });
  }
});

module.exports = router;

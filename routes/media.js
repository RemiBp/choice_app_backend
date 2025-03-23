const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { upload } = require('../controllers/mediaController');
const { UserChoice } = require('../models/user');

// Utilisation du modèle UserChoice importé depuis models/user.js
const User = UserChoice;

// Créer le dossier d'uploads s'il n'existe pas
const uploadDir = path.join(__dirname, '../uploads');
const profileDir = path.join(uploadDir, 'profile');

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

if (!fs.existsSync(profileDir)) {
  fs.mkdirSync(profileDir, { recursive: true });
}

// Servir les fichiers statiques depuis le dossier uploads
router.use('/files', express.static(uploadDir));

// Route pour l'upload de médias génériques
router.post('/upload', upload.single('media'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Aucun fichier n\'a été téléchargé' });
    }

    // Construire l'URL du fichier
    const baseUrl = process.env.BASE_URL || `http://${req.get('host')}`;
    const mediaUrl = `${baseUrl}/api/media/files/${req.file.filename}`;

    console.log(`✅ Média téléchargé avec succès: ${mediaUrl}`);
    res.status(200).json({ mediaUrl });
  } catch (error) {
    console.error('❌ Erreur lors de l\'upload du média:', error);
    res.status(500).json({ error: 'Erreur serveur lors de l\'upload du média' });
  }
});

// Route pour l'upload de photos de profil
router.post('/upload/profile', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Aucune image n\'a été téléchargée' });
    }

    // Construire l'URL du fichier
    const baseUrl = process.env.BASE_URL || `http://${req.get('host')}`;
    const imageUrl = `${baseUrl}/api/media/files/${req.file.filename}`;

    console.log(`✅ Photo de profil téléchargée avec succès: ${imageUrl}`);
    res.status(200).json({ imageUrl });
  } catch (error) {
    console.error('❌ Erreur lors de l\'upload de la photo de profil:', error);
    res.status(500).json({ error: 'Erreur serveur lors de l\'upload de la photo de profil' });
  }
});

// Route pour mettre à jour la photo de profil d'un utilisateur
router.post('/profile/:userId', upload.single('image'), async (req, res) => {
  try {
    const { userId } = req.params;

    if (!req.file) {
      return res.status(400).json({ error: 'Aucune image n\'a été téléchargée' });
    }

    // Trouver l'utilisateur
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'Utilisateur non trouvé' });
    }

    // Construire l'URL du fichier
    const baseUrl = process.env.BASE_URL || `http://${req.get('host')}`;
    const imageUrl = `${baseUrl}/api/media/files/${req.file.filename}`;

    // Mettre à jour l'URL de la photo de profil de l'utilisateur
    user.photo_url = imageUrl;
    await user.save();

    console.log(`✅ Photo de profil mise à jour pour l'utilisateur ${userId}: ${imageUrl}`);
    res.status(200).json({ 
      imageUrl,
      message: 'Photo de profil mise à jour avec succès' 
    });
  } catch (error) {
    console.error('❌ Erreur lors de la mise à jour de la photo de profil:', error);
    res.status(500).json({ error: 'Erreur serveur lors de la mise à jour de la photo de profil' });
  }
});

module.exports = router;
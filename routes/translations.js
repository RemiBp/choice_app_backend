const express = require('express');
const router = express.Router();
const axios = require('axios');
const fs = require('fs');
const path = require('path');

// Emplacement des fichiers de traduction
const TRANSLATIONS_DIR = path.join(__dirname, '../translations');

// Cache des traductions
let translationsCache = {};
let lastCacheUpdate = 0;
const CACHE_DURATION = 3600000; // 1 heure

/**
 * @route GET /api/translations/:lang
 * @desc Récupérer les traductions pour une langue spécifique
 * @access Public
 */
router.get('/:lang', async (req, res) => {
  try {
    const { lang } = req.params;
    
    // Vérifier que la langue est valide
    if (!['fr', 'en', 'es', 'de', 'it', 'pl'].includes(lang)) {
      return res.status(400).json({ message: 'Langue non supportée' });
    }
    
    // Vérifier le cache
    if (translationsCache[lang] && Date.now() - lastCacheUpdate < CACHE_DURATION) {
      return res.status(200).json(translationsCache[lang]);
    }
    
    // Construire le chemin du fichier
    const filePath = path.join(TRANSLATIONS_DIR, `${lang}.json`);
    
    // Vérifier si le fichier existe
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ message: 'Traductions non disponibles pour cette langue' });
    }
    
    // Lire le fichier
    const translations = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    
    // Mettre à jour le cache
    translationsCache[lang] = translations;
    lastCacheUpdate = Date.now();
    
    res.status(200).json(translations);
  } catch (error) {
    console.error('❌ Erreur lors de la récupération des traductions:', error);
    res.status(500).json({ message: 'Erreur interne du serveur' });
  }
});

/**
 * @route POST /api/translations/translate
 * @desc Traduire un texte à la volée avec l'API Google Translate
 * @access Public
 */
router.post('/translate', async (req, res) => {
  try {
    const { text, targetLang, sourceLang } = req.body;
    
    if (!text || !targetLang) {
      return res.status(400).json({ message: 'Texte et langue cible requis' });
    }
    
    // Vérifier que la clé API est disponible
    if (!process.env.GOOGLE_TRANSLATE_API_KEY) {
      return res.status(503).json({ message: 'Service de traduction non disponible' });
    }
    
    // Préparer la requête pour l'API Google Translate
    const url = 'https://translation.googleapis.com/language/translate/v2';
    const params = {
      q: text,
      target: targetLang,
      key: process.env.GOOGLE_TRANSLATE_API_KEY
    };
    
    // Ajouter la langue source si spécifiée
    if (sourceLang) {
      params.source = sourceLang;
    }
    
    // Appeler l'API
    const response = await axios.post(url, null, { params });
    
    // Extraire la traduction
    const translation = response.data.data.translations[0].translatedText;
    
    res.status(200).json({ 
      translation,
      detected_source_language: response.data.data.translations[0].detectedSourceLanguage || sourceLang
    });
  } catch (error) {
    console.error('❌ Erreur de traduction:', error);
    res.status(500).json({ message: 'Erreur de traduction', error: error.message });
  }
});

/**
 * @route GET /api/translations/languages
 * @desc Obtenir la liste des langues disponibles
 * @access Public
 */
router.get('/languages', async (req, res) => {
  try {
    // Liste des langues supportées avec leurs noms localisés
    const supportedLanguages = [
      { code: 'fr', name: 'Français', name_en: 'French', flag: '🇫🇷' },
      { code: 'en', name: 'English', name_en: 'English', flag: '🇬🇧' },
      { code: 'es', name: 'Español', name_en: 'Spanish', flag: '🇪🇸' },
      { code: 'de', name: 'Deutsch', name_en: 'German', flag: '🇩🇪' },
      { code: 'it', name: 'Italiano', name_en: 'Italian', flag: '🇮🇹' },
      { code: 'pl', name: 'Polski', name_en: 'Polish', flag: '🇵🇱' }
    ];
    
    res.status(200).json({ languages: supportedLanguages });
  } catch (error) {
    console.error('❌ Erreur lors de la récupération des langues:', error);
    res.status(500).json({ message: 'Erreur interne du serveur' });
  }
});

/**
 * @route POST /api/translations/detect
 * @desc Détecter la langue d'un texte
 * @access Public
 */
router.post('/detect', async (req, res) => {
  try {
    const { text } = req.body;
    
    if (!text) {
      return res.status(400).json({ message: 'Texte requis' });
    }
    
    // Vérifier que la clé API est disponible
    if (!process.env.GOOGLE_TRANSLATE_API_KEY) {
      return res.status(503).json({ message: 'Service de détection de langue non disponible' });
    }
    
    // Préparer la requête pour l'API Google Translate (détection)
    const url = 'https://translation.googleapis.com/language/translate/v2/detect';
    const params = {
      q: text,
      key: process.env.GOOGLE_TRANSLATE_API_KEY
    };
    
    // Appeler l'API
    const response = await axios.post(url, null, { params });
    
    // Extraire la langue détectée
    const detectedLanguage = response.data.data.detections[0][0].language;
    
    res.status(200).json({ 
      language: detectedLanguage,
      confidence: response.data.data.detections[0][0].confidence
    });
  } catch (error) {
    console.error('❌ Erreur de détection de langue:', error);
    res.status(500).json({ message: 'Erreur de détection de langue', error: error.message });
  }
});

module.exports = router; 
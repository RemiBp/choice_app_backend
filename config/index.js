require('dotenv').config();

/**
 * Configuration centralisée pour l'application
 */
const config = {
  // Clés API
  GOOGLE_MAPS_API_KEY: process.env.GOOGLE_MAPS_API_KEY || 'AIzaSyB41DRUbKWJHPxaFjMAwdrzWzbVKartNGg', // Clé de fallback (restrictive)
  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
  STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  
  // Configuration SendGrid
  SENDGRID_API_KEY: process.env.SENDGRID_API_KEY,
  SENDGRID_FROM_EMAIL: process.env.SENDGRID_FROM_EMAIL || 'contact@choiceapp.fr',
  SENDGRID_FROM_NAME: process.env.SENDGRID_FROM_NAME || 'Choice App',
  
  // Configuration Email de secours
  SMTP_HOST: process.env.SMTP_HOST || 'smtp.gmail.com',
  SMTP_PORT: parseInt(process.env.SMTP_PORT || '587'),
  EMAIL_USER: process.env.EMAIL_USER,
  EMAIL_PASS: process.env.EMAIL_PASS,
  
  // Configuration serveur
  PORT: parseInt(process.env.PORT || '5000'),
  NODE_ENV: process.env.NODE_ENV || 'development',
  
  // Configuration base de données
  MONGO_URI: process.env.MONGO_URI,
  
  // Configuration des URLs d'images par défaut
  DEFAULT_USER_AVATAR: 'https://choice-app-resources.s3.amazonaws.com/default/default-avatar.png',
  DEFAULT_PRODUCER_IMAGE: 'https://choice-app-resources.s3.amazonaws.com/default/default-producer.png',
  DEFAULT_POST_IMAGE: 'https://choice-app-resources.s3.amazonaws.com/default/default-post.png',
  
  // Limites de taille pour les médias
  MAX_IMAGE_SIZE_MB: 10, // 10 Mo
  MAX_VIDEO_SIZE_MB: 100, // 100 Mo
  
  // Configuration des formats d'image acceptés
  ACCEPTED_IMAGE_FORMATS: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
  ACCEPTED_VIDEO_FORMATS: ['video/mp4', 'video/quicktime', 'video/x-msvideo'],
  
  // Fallback pour les coordonnées par défaut (Paris)
  DEFAULT_LATITUDE: 48.8566,
  DEFAULT_LONGITUDE: 2.3522
};

module.exports = config; 
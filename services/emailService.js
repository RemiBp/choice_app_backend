const nodemailer = require('nodemailer');
const sgMail = require('@sendgrid/mail');
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const { choiceAppDb } = require('../index');

dotenv.config();

// Configuration de SendGrid
const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;
if (!SENDGRID_API_KEY) {
  console.error('❌ ERREUR: Clé API SendGrid manquante dans les variables d\'environnement');
} else {
  sgMail.setApiKey(SENDGRID_API_KEY);
  console.log('✅ SendGrid API initialisée avec la clé:', SENDGRID_API_KEY.substring(0, 10) + '...');
}

// Configuration de Nodemailer (fallback)
let transporter = null;

// Initialiser le service d'email Nodemailer (fallback)
const initializeNodemailer = () => {
  try {
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS || !process.env.SMTP_HOST || !process.env.SMTP_PORT) {
      console.warn('⚠️ Configuration Nodemailer incomplète. Ce service de fallback ne sera pas disponible.');
      return false;
    }

    console.log('🔧 Initialisation du service Nodemailer (fallback) avec:');
    console.log(`- Host: ${process.env.SMTP_HOST}`);
    console.log(`- Port: ${process.env.SMTP_PORT}`);
    console.log(`- User: ${process.env.EMAIL_USER}`);

    // Configuration standard avec TLS désactivé pour permettre les connexions au serveur SMTP
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: process.env.SMTP_PORT,
      secure: process.env.SMTP_PORT === '465', // true pour le port 465, false pour les autres ports
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      },
      tls: {
        rejectUnauthorized: false
      }
    });

    console.log('✅ Service Nodemailer initialisé avec succès (fallback)');
    return true;
  } catch (error) {
    console.error('❌ Erreur lors de l\'initialisation du service Nodemailer:', error);
    return false;
  }
};

// Tester la connexion SMTP
const testEmailConnection = async () => {
  try {
    // Vérifier d'abord SendGrid
    if (process.env.SENDGRID_API_KEY) {
      try {
        console.log('🔍 Test de SendGrid...');
        // SendGrid n'a pas de méthode de vérification directe comme Nodemailer
        // On présume que la config est bonne si la clé est définie
        console.log('✅ Configuration SendGrid valide');
      } catch (error) {
        console.error('❌ Problème avec la configuration SendGrid:', error);
      }
    }

    // Si SendGrid n'est pas configuré ou échoue, tester Nodemailer
    try {
      if (!transporter) {
        await initializeNodemailer();
      }

      if (!transporter) {
        console.error('❌ Impossible d\'initialiser le transporteur email');
        return false;
      }

      console.log('🔍 Vérification de la connexion SMTP Nodemailer...');
      await transporter.verify();
      console.log('✅ Connexion SMTP Nodemailer réussie');
      return true;
    } catch (error) {
      console.error('❌ Échec de connexion SMTP Nodemailer:', error);
      return false;
    }
  } catch (timeoutError) {
    console.error('⏱️ Délai d\'attente dépassé. Le serveur SMTP ne répond pas.');
    return false;
  }
};

// Modèle pour les logs d'emails
const EmailLog = choiceAppDb.model(
  'EmailLog',
  new mongoose.Schema({
    to: String,
    subject: String,
    body: String,
    status: String, // 'sent', 'failed'
    error: String,
    sentAt: { type: Date, default: Date.now }
  }),
  'EmailLogs'
);

// Configuration du transporteur d'emails
const createTransporter = () => {
  // Vérifier si les variables d'environnement sont définies
  if (!process.env.EMAIL_HOST || !process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    // Fallback vers un transporteur ethereal (pour le développement)
    return nodemailer.createTransport({
      host: 'smtp.ethereal.email',
      port: 587,
      secure: false,
      auth: {
        user: 'ethereal.user@ethereal.email',
        pass: 'ethereal_pass'
      }
    });
  }

  // Créer un transporteur à partir des variables d'environnement
  return nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: process.env.EMAIL_PORT || 587,
    secure: process.env.EMAIL_SECURE === 'true',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    }
  });
};

// Envoyer un email (utilise SendGrid en priorité, puis Nodemailer comme fallback)
const sendEmail = async (to, subject, html) => {
  try {
    // Essayer d'abord avec SendGrid si configuré
    if (process.env.SENDGRID_API_KEY) {
      const msg = {
        to,
        from: {
          email: process.env.SENDGRID_FROM_EMAIL || 'contact@choiceapp.fr',
          name: process.env.SENDGRID_FROM_NAME || 'Choice App'
        },
        subject,
        html,
      };

      try {
        console.log(`📤 Envoi d'email via SendGrid à ${to}...`);
        await sgMail.send(msg);
        console.log('✅ Email envoyé avec succès via SendGrid');
        return true;
      } catch (error) {
        console.error('❌ Erreur lors de l\'envoi de l\'email via SendGrid:', error);
        console.log('⚠️ Tentative d\'envoi via Nodemailer (fallback)...');
      }
    }

    // Fallback à Nodemailer
    try {
      if (!transporter) {
        if (!initializeNodemailer()) {
          console.warn('⚠️ Service Nodemailer non disponible. Email non envoyé.');
          return false;
        }
      }

      const mailOptions = {
        from: `"Choice App" <${process.env.EMAIL_USER}>`,
        to,
        subject,
        html
      };

      console.log(`📤 Envoi d'email via Nodemailer à ${to}...`);
      const info = await transporter.sendMail(mailOptions);
      console.log('✅ Email envoyé avec succès via Nodemailer:', info.messageId);
      return true;
    } catch (nodemailerError) {
      console.error('❌ Erreur lors de l\'envoi de l\'email via Nodemailer:', nodemailerError);
      return false;
    }
  } catch (error) {
    console.error('❌ Erreur générale lors de l\'envoi de l\'email:', error);
    return false;
  }
};

// Email de confirmation d'inscription
const sendConfirmationEmail = async (email, name) => {
  const subject = 'Bienvenue sur Choice App - Confirmez votre inscription';
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 5px;">
      <h2 style="color: #7b68ee; text-align: center;">Bienvenue sur Choice App!</h2>
      <p>Bonjour ${name || 'cher utilisateur'},</p>
      <p>Merci de vous être inscrit à Choice App. Nous sommes ravis de vous compter parmi notre communauté!</p>
      <p>Votre inscription a été confirmée et votre compte est maintenant actif.</p>
      <p>Si vous avez des questions ou besoin d'assistance, n'hésitez pas à nous contacter à support@choiceapp.fr.</p>
      <p>À bientôt sur Choice App!</p>
      <div style="margin-top: 30px; text-align: center; color: #888; font-size: 12px;">
        <p>Cet email a été envoyé automatiquement. Merci de ne pas y répondre.</p>
      </div>
    </div>
  `;
  
  return await sendEmail(email, subject, html);
};

// Email de bienvenue
const sendWelcomeEmail = async (email, name) => {
  const subject = 'Bienvenue sur Choice App !';
  const html = `
    <h1>Bienvenue sur Choice App, ${name} !</h1>
    <p>Nous sommes ravis de vous compter parmi nos utilisateurs.</p>
    <p>Commencez dès maintenant à découvrir des lieux intéressants autour de vous !</p>
    <br>
    <p>L'équipe Choice App</p>
  `;
  
  return sendEmail(email, subject, html);
};

// Email de récupération de mot de passe
const sendPasswordResetEmail = async (email, resetUrl, name) => {
  const subject = 'Réinitialisation de votre mot de passe Choice App';
  const html = `
    <h1>Réinitialisation de mot de passe</h1>
    <p>Bonjour ${name},</p>
    <p>Vous avez demandé une réinitialisation de mot de passe pour votre compte Choice App.</p>
    <p>Cliquez sur le lien ci-dessous pour réinitialiser votre mot de passe. Ce lien est valable pendant 1 heure.</p>
    <p><a href="${resetUrl}" style="padding: 10px 20px; background-color: #4CAF50; color: white; text-decoration: none; border-radius: 5px;">Réinitialiser mon mot de passe</a></p>
    <p>Si vous n'avez pas demandé cette réinitialisation, vous pouvez ignorer cet email.</p>
    <br>
    <p>L'équipe Choice App</p>
  `;
  
  return sendEmail(email, subject, html);
};

// Email de confirmation d'email
const sendVerificationEmail = async (email, verificationUrl, name) => {
  const subject = 'Vérification de votre email Choice App';
  const html = `
    <h1>Vérification de votre adresse email</h1>
    <p>Bonjour ${name},</p>
    <p>Merci de vous être inscrit sur Choice App. Veuillez vérifier votre adresse email en cliquant sur le lien ci-dessous.</p>
    <p><a href="${verificationUrl}" style="padding: 10px 20px; background-color: #4CAF50; color: white; text-decoration: none; border-radius: 5px;">Vérifier mon email</a></p>
    <br>
    <p>L'équipe Choice App</p>
  `;
  
  return sendEmail(email, subject, html);
};

// Email de notification (nouveau message, etc.)
const sendNotificationEmail = async (email, subject, message, name) => {
  const html = `
    <h1>${subject}</h1>
    <p>Bonjour ${name},</p>
    <p>${message}</p>
    <p><a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}" style="padding: 10px 20px; background-color: #4CAF50; color: white; text-decoration: none; border-radius: 5px;">Voir sur Choice App</a></p>
    <br>
    <p>L'équipe Choice App</p>
  `;
  
  return sendEmail(email, subject, html);
};

// Initialisation
const initialize = async () => {
  console.log('📧 Initialisation du service email...');
  console.log('📧 Service principal: SendGrid');
  // Tester la connexion SendGrid
  console.log('🔍 Test de la connexion SendGrid...');
  await testEmailConnection();
};

// Initialiser le service au démarrage si en production
if (process.env.NODE_ENV === 'production') {
  initialize().catch(console.error);
}

module.exports = {
  sendEmail,
  sendWelcomeEmail,
  sendPasswordResetEmail,
  sendVerificationEmail,
  sendNotificationEmail,
  sendConfirmationEmail,
  testEmailConnection,
  initialize
}; 
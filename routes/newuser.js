const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const crypto = require('crypto');

// Configuration simplifiée des connexions MongoDB
const usersDbChoice = mongoose.connection.useDb('choice_app');
const restaurationDb = mongoose.connection.useDb('Restauration_Officielle');
const loisirsDb = mongoose.connection.useDb('Loisir&Culture');

// Modèle pour la collection Users
const UserChoice = usersDbChoice.model(
    'User',
    new mongoose.Schema({}, { strict: false }),
    'Users'
);

// Modèle pour la collection Producers dans la base "restauration"
const RestaurantProducer = restaurationDb.model(
    'Producer',
    new mongoose.Schema({}, { strict: false }),
    'producers'
);

// Modèle pour la collection Producers dans la base "loisirs"
const LeisureProducer = loisirsDb.model(
    'LeisureProducer',
    new mongoose.Schema({}, { strict: false }),
    'Loisir_Paris_Producers'
);

const router = express.Router();

// Route pour inscription ou récupération de compte producer
router.post('/register-or-recover', async (req, res) => {
    const { producerId } = req.body;
    
    try {
        console.log('--- DEBUG: Requête reçue pour /register-or-recover ---');
        console.log('Payload reçu :', req.body);
        
        if (!producerId) {
            console.log('Aucun ID de producteur fourni');
            return res.status(400).json({ error: 'No producerId was provided' });
        }
        
        console.log('Recherche du producteur avec ID:', producerId);
        
        // Déterminer quel modèle utiliser en fonction du préfixe de l'ID ou de l'ID lui-même
        let Producer;
        let query = { _id: producerId };
        const beautyWellnessDb = mongoose.connection.useDb('BeautyWellness');
        
        try {
            // Vérifier si c'est un ObjectId valide
            if (!mongoose.Types.ObjectId.isValid(producerId)) {
                console.log('ID de producteur non valide:', producerId);
                return res.status(400).json({ error: 'Invalid producer ID format' });
            }
            
            if (producerId.startsWith('beauty_')) {
                console.log('Recherche dans la base BeautyWellness...');
                Producer = beautyWellnessDb.model('BeautyProducer');
            } else if (producerId.startsWith('res_')) {
                console.log('Recherche dans la base Restauration_Officielle...');
                Producer = restaurationDb.model('Producer');
            } else if (producerId.startsWith('loi_')) {
                console.log('Recherche dans la base Loisirs_Activites...');
                Producer = loisirsDb.model('LeisureProducer');
            } else {
                // Si pas de préfixe, essayer les bases de données dans l'ordre
                console.log('Pas de préfixe détecté, essai dans les trois bases de données...');
                
                // Essayer d'abord Restauration_Officielle
                Producer = restaurationDb.model('Producer');
                const restaurantProducer = await Producer.findOne(query).maxTimeMS(10000);
                
                if (restaurantProducer) {
                    console.log('Producteur trouvé dans Restauration_Officielle');
                    return res.status(200).json({
                        message: 'Producer found successfully',
                        producer: {
                            _id: restaurantProducer._id,
                            name: restaurantProducer.name,
                            email: restaurantProducer.email,
                            phone: restaurantProducer.phone,
                            location: restaurantProducer.location,
                            logo: restaurantProducer.logo,
                            description: restaurantProducer.description,
                        },
                    });
                }
                
                // Essayer ensuite Loisirs_Activites
                Producer = loisirsDb.model('LeisureProducer');
                const leisureProducer = await Producer.findOne(query).maxTimeMS(10000);
                
                if (leisureProducer) {
                    console.log('Producteur trouvé dans Loisirs_Activites');
                    return res.status(200).json({
                        message: 'Producer found successfully',
                        producer: {
                            _id: leisureProducer._id,
                            name: leisureProducer.name,
                            email: leisureProducer.email,
                            phone: leisureProducer.phone,
                            location: leisureProducer.location,
                            logo: leisureProducer.logo,
                            description: leisureProducer.description,
                        },
                    });
                }
                
                // Enfin, essayer BeautyWellness
                Producer = beautyWellnessDb.model('BeautyProducer');
                const beautyProducer = await Producer.findOne(query).maxTimeMS(10000);
                
                if (beautyProducer) {
                    console.log('Producteur trouvé dans BeautyWellness');
                    return res.status(200).json({
                        message: 'Producer found successfully',
                        producer: {
                            _id: beautyProducer._id,
                            name: beautyProducer.name,
                            email: beautyProducer.email,
                            phone: beautyProducer.phone,
                            location: beautyProducer.location,
                            logo: beautyProducer.logo,
                            description: beautyProducer.description,
                        },
                    });
                }
                
                // Si aucun producteur n'est trouvé dans les trois bases
                console.log('Producteur non trouvé dans aucune base de données avec ID:', producerId);
                return res.status(404).json({ error: 'Producer not found' });
            }
            
            // Rechercher le producteur avec un timeout augmenté
            console.log('Recherche du producteur dans la base sélectionnée...');
            const producer = await Producer.findOne(query).maxTimeMS(30000);
            
            if (!producer) {
                console.log('Producteur non trouvé avec ID:', producerId);
                return res.status(404).json({ error: 'Producer not found' });
            }
            
            console.log('Producteur trouvé:', producer);
            
            const response = {
                message: 'Producer found successfully',
                producer: {
                    _id: producer._id,
                    name: producer.name,
                    email: producer.email,
                    phone: producer.phone,
                    location: producer.location,
                    logo: producer.logo,
                    description: producer.description,
                },
            };
            
            return res.status(200).json(response);
        } catch (idError) {
            console.error('Erreur lors de la vérification de l\'ID:', idError);
            return res.status(400).json({ error: 'Invalid producer ID format', details: idError.message });
        }
    } catch (error) {
        console.error('Erreur serveur lors de /register-or-recover:', error);
        
        // Ajouter des informations spécifiques pour les erreurs liées à MongoDB
        if (error.name === 'MongooseError' || error.name === 'MongoServerError') {
            console.error('Erreur de connexion MongoDB:', error.message);
            return res.status(503).json({ 
                error: 'Database connection error', 
                details: 'La connexion à la base de données a pris trop de temps. Veuillez réessayer.' 
            });
        }
        
        return res.status(500).json({ error: 'Server error', details: error.message });
    }
});

// Route pour vérifier si un utilisateur est connecté
router.get('/auth/check', async (req, res) => {
    // Accepter un token avec ou sans le préfixe 'Bearer '
    let token = req.headers['authorization'];

    console.log('--- DEBUG: Requête pour /auth/check ---');
    console.log('Token brut reçu :', token);

    if (!token) {
        console.log('Token manquant dans la requête');
        return res.status(401).json({ error: 'Token is missing' });
    }

    // Supprimer le préfixe 'Bearer ' si présent
    if (token.startsWith('Bearer ')) {
        token = token.slice(7);
    }

    console.log('Token nettoyé :', token);

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_jwt_secret');
        console.log('Token décodé :', decoded);

        // Augmenter le timeout pour la recherche d'utilisateur
        const user = await UserChoice.findById(decoded.id).maxTimeMS(30000);
        
        if (!user) {
            console.log('Utilisateur non trouvé avec ID :', decoded.id);
            return res.status(404).json({ error: 'User not found' });
        }

        console.log('Utilisateur authentifié :', user);
        res.status(200).json({
            message: 'User authenticated',
            user,
        });
    } catch (error) {
        console.error('Erreur de vérification du token :', error);
        
        // Gestion spécifique des erreurs MongoDB
        if (error.name === 'MongooseError' || error.name === 'MongoServerError') {
            console.error('Erreur de connexion MongoDB:', error.message);
            return res.status(503).json({ 
                error: 'Database connection error', 
                details: 'La connexion à la base de données a pris trop de temps. Veuillez réessayer.' 
            });
        }
        
        // Gestion des erreurs JWT
        if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
            return res.status(401).json({ error: 'Invalid token', details: error.message });
        }
        
        return res.status(500).json({ error: 'Server error', details: error.message });
    }
});

router.get('/auth/user', async (req, res) => {
    // Accepter un token avec ou sans le préfixe 'Bearer '
    let token = req.headers['authorization'];

    console.log('--- DEBUG: Requête pour /auth/user ---');
    console.log('Token brut reçu :', token);

    if (!token) {
        console.log('Token manquant dans la requête');
        return res.status(401).json({ error: 'Token is missing' });
    }

    // Supprimer le préfixe 'Bearer ' si présent
    if (token.startsWith('Bearer ')) {
        token = token.slice(7);
    }

    console.log('Token nettoyé :', token);

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_jwt_secret');
        console.log('Token décodé :', decoded);
        
        // Augmenter le timeout pour la recherche d'utilisateur
        const user = await UserChoice.findById(decoded.id).maxTimeMS(30000);

        if (!user) {
            console.log('Utilisateur non trouvé avec ID :', decoded.id);
            return res.status(404).json({ error: 'User not found' });
        }

        console.log('Utilisateur récupéré avec succès :', user);
        res.status(200).json({
            message: 'User retrieved successfully',
            user,
        });
    } catch (error) {
        console.error('Erreur de vérification du token :', error);
        
        // Gestion spécifique des erreurs MongoDB
        if (error.name === 'MongooseError' || error.name === 'MongoServerError') {
            console.error('Erreur de connexion MongoDB:', error.message);
            return res.status(503).json({ 
                error: 'Database connection error', 
                details: 'La connexion à la base de données a pris trop de temps. Veuillez réessayer.' 
            });
        }
        
        // Gestion des erreurs JWT
        if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
            return res.status(401).json({ error: 'Invalid token', details: error.message });
        }
        
        return res.status(500).json({ error: 'Server error', details: error.message });
    }
});

// Route pour la connexion simplifiée
router.post('/login', async (req, res) => {
    const { email, password } = req.body;

    try {
        console.log('--- DEBUG: Requête reçue pour /login ---');
        console.log('Payload reçu :', { ...req.body, password: '[REDACTED]' });

        // Vérifier si l'utilisateur existe avec un timeout augmenté
        const user = await UserChoice.findOne({ email }).maxTimeMS(60000);
        if (!user) {
            console.log('Utilisateur non trouvé avec cet email :', email);
            return res.status(404).json({ error: 'User not found' });
        }

        // Vérifier si le mot de passe est correct
        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
            console.log('Mot de passe incorrect pour l\'utilisateur avec cet email :', email);
            return res.status(401).json({ error: 'Invalid password' });
        }

        // Signaler la réussite et générer le token JWT
        // Assurez-vous que le payload du token inclut toutes les informations nécessaires
        const token = jwt.sign({ id: user._id, accountType: user.accountType }, process.env.JWT_SECRET || 'your_jwt_secret', {
            expiresIn: '7d'
        });

        // Vérifier si l'utilisateur a complété l'onboarding
        const hasCompletedOnboarding = user.onboarding_completed === true;

        console.log('Utilisateur connecté avec succès');
        return res.status(200).json({
            success: true,
            message: 'User logged in successfully',
            token,
            userId: user._id.toString(),
            accountType: user.accountType || 'user',
            needsOnboarding: !hasCompletedOnboarding,
            user: {
                ...user.toObject(),
                password: undefined
            },
        });
    } catch (error) {
        console.error('Erreur serveur lors de /login :', error);
        return res.status(500).json({ error: 'Server error', details: error.message });
    }
});

// Route pour déconnexion (supprimer les données côté client)
router.post('/auth/logout', (req, res) => {
    res.status(200).json({ message: 'User logged out successfully' });
});

// Route ping pour tester la connectivité API
router.get('/ping', (req, res) => {
    console.log('Ping reçu à', new Date().toISOString());
    res.status(200).json({ message: 'API is alive!', timestamp: new Date().toISOString() });
});

// Route pour la réinitialisation de mot de passe
router.post('/forgot-password', async (req, res) => {
    const { email } = req.body;
    
    try {
        console.log('--- DEBUG: Requête reçue pour /forgot-password ---');
        console.log('Email reçu :', email);
        
        if (!email) {
            return res.status(400).json({ error: 'Email is required' });
        }
        
        // Vérifier si l'utilisateur existe
        const user = await UserChoice.findOne({ email });
        
        // Pour des raisons de sécurité, ne pas divulguer si l'email existe ou non
        if (!user) {
            console.log('Utilisateur non trouvé avec cet email, mais envoi d\'une réponse de succès pour des raisons de sécurité');
            return res.status(200).json({ 
                message: 'Si cet email existe dans notre base de données, un message de récupération a été envoyé.' 
            });
        }
        
        // Générer un token de réinitialisation
        const resetToken = crypto.randomBytes(32).toString('hex');
        user.reset_password_token = resetToken;
        user.reset_password_expires = Date.now() + 3600000; // 1 heure
        await user.save();
        
        // Si un service d'envoi d'email est configuré, envoyer l'email ici
        // Note: L'implémentation dépend de votre service d'envoi d'emails
        console.log(`Un email de récupération serait envoyé à ${email} avec le token ${resetToken}`);
        
        return res.status(200).json({
            message: 'Si cet email existe dans notre base de données, un message de récupération a été envoyé.'
        });
    } catch (error) {
        console.error('Erreur serveur lors de /forgot-password :', error);
        return res.status(500).json({ 
            error: 'Server error', 
            details: 'Une erreur est survenue lors du traitement de votre demande.' 
        });
    }
});

// Route pour valider un token de réinitialisation et définir un nouveau mot de passe
router.post('/reset-password', async (req, res) => {
    const { token, password } = req.body;
    
    try {
        console.log('--- DEBUG: Requête reçue pour /reset-password ---');
        
        if (!token || !password) {
            return res.status(400).json({ error: 'Token and password are required' });
        }
        
        // Trouver l'utilisateur avec ce token valide
        const user = await UserChoice.findOne({
            reset_password_token: token,
            reset_password_expires: { $gt: Date.now() }
        });
        
        if (!user) {
            return res.status(400).json({ error: 'Invalid or expired token' });
        }
        
        // Hasher le nouveau mot de passe
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);
        
        // Mettre à jour le mot de passe
        user.password = hashedPassword;
        user.reset_password_token = undefined;
        user.reset_password_expires = undefined;
        await user.save();
        
        return res.status(200).json({ message: 'Password has been reset successfully' });
    } catch (error) {
        console.error('Erreur serveur lors de /reset-password :', error);
        return res.status(500).json({ 
            error: 'Server error', 
            details: 'Une erreur est survenue lors de la réinitialisation du mot de passe.' 
        });
    }
});

// Exporter le routeur
module.exports = router;

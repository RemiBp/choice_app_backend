const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

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
    const { name, email, password, gender, liked_tags, producerId } = req.body;

    try {
        console.log('--- DEBUG: Requête reçue pour /register-or-recover ---');
        console.log('Payload reçu :', req.body);

        if (producerId) {
            console.log('Mode récupération de compte producer');

            // Chercher dans les deux bases : RestaurantProducer et LeisureProducer
            let producer = await RestaurantProducer.findById(producerId);
            if (!producer) {
                console.log('Producer non trouvé dans la base "restauration". Vérification dans la base "loisirs".');
                producer = await LeisureProducer.findById(producerId);
            }

            if (!producer) {
                console.log('Producer non trouvé dans les deux bases avec ID :', producerId);
                return res.status(404).json({ error: 'Producer not found' });
            }

            console.log('Producer trouvé :', producer);
            return res.status(200).json({
                message: 'Producer account retrieved successfully',
                producer,
                type: 'producer',
            });
        } else {
            console.log('Mode création utilisateur');
            const existingUser = await UserChoice.findOne({ email });
            if (existingUser) {
                console.log('Email déjà utilisé :', email);
                return res.status(400).json({ error: 'Email already exists' });
            }

            const hashedPassword = await bcrypt.hash(password, 10);

            const newUser = new UserChoice({
                name,
                email,
                password: hashedPassword,
                gender: gender || 'Non spécifié',
                liked_tags: liked_tags || [],
                photo_url: `https://api.dicebear.com/6.x/adventurer/png?seed=${new mongoose.Types.ObjectId()}`,
            });

            await newUser.save();
            console.log('Nouvel utilisateur créé :', newUser);

            const token = jwt.sign({ id: newUser._id }, process.env.JWT_SECRET || 'your_jwt_secret', {
                expiresIn: '1d',
            });

            return res.status(201).json({
                message: 'User registered successfully',
                token,
                user: newUser,
                type: 'user',
            });
        }
    } catch (error) {
        console.error('Erreur serveur lors de /register-or-recover :', error);
        return res.status(500).json({ error: 'Server error' });
    }
});

// Route pour vérifier si un utilisateur est connecté
router.get('/auth/check', async (req, res) => {
    const token = req.headers['authorization'];

    console.log('--- DEBUG: Requête pour /auth/check ---');
    console.log('Token reçu :', token);

    if (!token) {
        console.log('Token manquant dans la requête');
        return res.status(401).json({ error: 'Token is missing' });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_jwt_secret');
        console.log('Token décodé :', decoded);

        const user = await UserChoice.findById(decoded.id);
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
        return res.status(401).json({ error: 'Invalid token' });
    }
});

router.get('/auth/user', async (req, res) => {
    const token = req.headers['authorization'];

    if (!token) {
        return res.status(401).json({ error: 'Token is missing' });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_jwt_secret');
        const user = await UserChoice.findById(decoded.id);

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.status(200).json({
            message: 'User retrieved successfully',
            user,
        });
    } catch (error) {
        console.error('Token verification error:', error);
        return res.status(401).json({ error: 'Invalid token' });
    }
});

// Ajout de la route pour la connexion
router.post('/login', async (req, res) => {
    const { email, password } = req.body;

    try {
        console.log('--- DEBUG: Requête reçue pour /login ---');
        console.log('Payload reçu :', req.body);

        // Vérifier si l'utilisateur existe
        const user = await UserChoice.findOne({ email });
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

        // Générer un token JWT
        const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET || 'your_jwt_secret', {
            expiresIn: '1d',
        });

        console.log('Utilisateur connecté avec succès :', user);
        return res.status(200).json({
            message: 'User logged in successfully',
            token,
            user,
        });
    } catch (error) {
        console.error('Erreur serveur lors de /login :', error);
        return res.status(500).json({ error: 'Server error' });
    }
});


// Route pour déconnexion (supprimer les données côté client)
router.post('/auth/logout', (req, res) => {
    res.status(200).json({ message: 'User logged out successfully' });
});

/**
 * @route POST /api/newuser/:userId/onboarding
 * @description Endpoint pour sauvegarder les données du processus d'onboarding
 * @access Private
 */
router.post('/:userId/onboarding', async (req, res) => {
    try {
        const { userId } = req.params;
        const { photo_url, liked_tags, contacts_permission_granted } = req.body;

        console.log(`📱 Onboarding request received for user ${userId}`);
        console.log(`✅ Payload:`, JSON.stringify(req.body, null, 2));

        // Vérifier si l'utilisateur existe
        const user = await UserChoice.findById(userId);
        if (!user) {
            console.log(`❌ Utilisateur non trouvé avec l'ID: ${userId}`);
            return res.status(404).json({ error: 'User not found' });
        }

        // Préparer les updates
        const updates = {};
        
        // Mettre à jour la photo de profil si fournie
        if (photo_url) {
            updates.photo_url = photo_url;
        }
        
        // Mettre à jour les tags aimés si fournis
        if (liked_tags && Array.isArray(liked_tags)) {
            updates.liked_tags = liked_tags;
        }
        
        // Enregistrer le statut de la permission des contacts
        if (contacts_permission_granted !== undefined) {
            updates.contacts_permission = contacts_permission_granted;
        }

        // Marquer l'onboarding comme complété
        updates.onboarding_completed = true;
        updates.onboarding_date = new Date();

        // Mettre à jour l'utilisateur
        const updatedUser = await UserChoice.findByIdAndUpdate(
            userId,
            { $set: updates },
            { new: true }
        );

        console.log(`✅ Onboarding successful for user ${userId}`);
        return res.status(200).json({
            message: 'Onboarding data saved successfully',
            user: updatedUser
        });
    } catch (error) {
        console.error('❌ Erreur lors du traitement de l\'onboarding:', error);
        return res.status(500).json({ error: 'Server error' });
    }
});

// Exporter le routeur
module.exports = router;

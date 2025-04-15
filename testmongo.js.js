const { getChoiceAppDb } = require('../mongo/config/db');
const mongoose = require('mongoose');

const testConnection = async () => {
    try {
        const db = getChoiceAppDb();
        if (!db) {
            console.error("❌ Impossible d'obtenir choiceAppDb");
            return;
        }
        console.log("✅ Accès à la base choice_app réussi :", db.name);

        // Vérifions si une collection existe
        const collections = await db.db.listCollections().toArray();
        console.log("📁 Collections disponibles :", collections.map(c => c.name));
    } catch (error) {
        console.error("❌ Erreur lors du test MongoDB :", error);
    } finally {
        mongoose.connection.close();
    }
};

testConnection();

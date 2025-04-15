const { MongoClient } = require('mongodb');

async function checkPosts() {
  const uri = process.env.MONGO_URI || 'mongodb+srv://remibarbier:Calvi8Pierc2@lieuxrestauration.szq31.mongodb.net/?retryWrites=true&w=majority&appName=lieuxrestauration';
  const client = new MongoClient(uri);

  try {
    await client.connect();
    console.log('⏳ Connecté à MongoDB...');

    const db = client.db('choice_app');
    const postsCollection = db.collection('Posts');
    const usersCollection = db.collection('Users');
    const producersCollection = db.collection('Producers');
    const leisureProducersCollection = db.collection('LeisureProducers');
    const wellnessProducersCollection = db.collection('WellnessProducers');
    
    // Analyser les différentes structures
    console.log('\n🔍 Analyse des structures de posts...');
    
    // Récupérer un échantillon de posts
    const samplePosts = await postsCollection.find({}).limit(20).toArray();
    
    // Regrouper les posts par structure
    const structures = {};
    samplePosts.forEach(post => {
      const structure = Object.keys(post).sort().join(',');
      if (!structures[structure]) {
        structures[structure] = {
          count: 0,
          example: post
        };
      }
      structures[structure].count++;
    });

    // Afficher les différentes structures trouvées
    console.log('\n📊 Structures différentes trouvées:');
    Object.entries(structures).forEach(([structure, data], index) => {
      console.log(`\n=== Structure ${index + 1} (${data.count} posts) ===`);
      console.log('Champs:', structure);
      console.log('\nExemple de document:');
      console.log(JSON.stringify(data.example, null, 2));
    });

    // Analyser les types de contenu
    console.log('\n📝 Analyse des types de contenu:');
    const contentTypes = await postsCollection.aggregate([
      { $group: { _id: "$content_type", count: { $sum: 1 } } }
    ]).toArray();
    console.log('Types de contenu:', contentTypes);

    // Analyser les types de media
    console.log('\n🎥 Analyse des types de media:');
    const mediaTypes = await postsCollection.aggregate([
      { $unwind: "$media" },
      { $group: { _id: "$media.type", count: { $sum: 1 } } }
    ]).toArray();
    console.log('Types de media:', mediaTypes);

    // Compter les posts par type de producteur
    console.log('\n🏢 Analyse des posts par type de producteur:');
    const producerTypes = await postsCollection.aggregate([
      { 
        $facet: {
          "userPosts": [
            { $match: { producer_id: { $exists: false } } },
            { $count: "count" }
          ],
          "restaurantPosts": [
            { $match: { 
              producer_id: { $exists: true },
              producer_type: "restaurant" 
            }},
            { $count: "count" }
          ],
          "leisurePosts": [
            { $match: { 
              producer_id: { $exists: true },
              producer_type: "leisure" 
            }},
            { $count: "count" }
          ],
          "wellnessPosts": [
            { $match: { 
              producer_id: { $exists: true },
              producer_type: "wellness" 
            }},
            { $count: "count" }
          ]
        }
      }
    ]).toArray();
    console.log('Distribution des posts par producteur:', producerTypes);

    // Compter le nombre total de posts
    const totalPosts = await postsCollection.countDocuments();
    console.log(`\n📝 Nombre total de posts dans la base: ${totalPosts}`);

    // Vérifier les utilisateurs
    const users = await usersCollection.find({}).limit(5).toArray();
    console.log(`\n👥 Nombre total d'utilisateurs trouvés: ${users.length}`);
    
    if (users.length > 0) {
      console.log('\n👤 Utilisateurs trouvés:');
      users.forEach(user => {
        console.log('\n--- Utilisateur ---');
        console.log('ID:', user._id);
        console.log('Nom:', user.name || user.displayName || 'Non défini');
        console.log('Email:', user.email || 'Non défini');
        console.log('Posts:', user.posts?.length || 0);
        console.log('Route d\'accès:', `/api/users/${user._id}`);
        console.log('------------------');
      });
    } else {
      console.log('❌ Aucun utilisateur trouvé');
    }

    // Vérifier les producteurs de restaurants
    const producers = await producersCollection.find({}).limit(3).toArray();
    console.log(`\n🍽️ Producteurs de restaurants trouvés: ${producers.length}`);
    producers.forEach(producer => {
      console.log('\n--- Restaurant ---');
      console.log('ID:', producer._id);
      console.log('Nom:', producer.name || 'Non défini');
      console.log('Route d\'accès:', `/api/producers/${producer._id}`);
      console.log('------------------');
    });

    // Vérifier les producteurs de loisirs
    const leisureProducers = await leisureProducersCollection.find({}).limit(3).toArray();
    console.log(`\n🎭 Producteurs de loisirs trouvés: ${leisureProducers.length}`);
    leisureProducers.forEach(producer => {
      console.log('\n--- Loisir ---');
      console.log('ID:', producer._id);
      console.log('Nom:', producer.name || 'Non défini');
      console.log('Route d\'accès:', `/api/leisureProducers/${producer._id}`);
      console.log('------------------');
    });

    // Vérifier la disponibilité des routes API
    console.log('\n🔄 Vérification des routes API:');
    console.log('- Route pour profils utilisateurs: /api/users/:id');
    console.log('- Route pour restaurants: /api/producers/:id');
    console.log('- Route pour loisirs: /api/leisureProducers/:id');
    console.log('- Route pour posts: /api/posts/:id');
    
    // Conseils pour résoudre les problèmes courants
    console.log('\n🛠️ Conseils de résolution:');
    console.log('1. Si erreur "Could not find a generator for route": vérifier que toutes les routes sont définies dans le routage principal');
    console.log('2. Pour les avatars colorés: s\'assurer que producer_type est correctement défini pour chaque post');
    console.log('3. Pour distinguer visuellement les posts:');
    console.log('   - Utilisateurs: contour jaune');
    console.log('   - Restaurants: contour rouge/orange');
    console.log('   - Loisirs: contour violet');
    console.log('   - Bien-être: contour vert');

  } catch (error) {
    console.error('❌ Erreur:', error);
  } finally {
    await client.close();
  }
}

checkPosts(); 
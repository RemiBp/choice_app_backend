# Guide de correction des erreurs dans les scripts Mistral sur VastAI

Ce guide explique comment résoudre les erreurs que vous rencontrez avec les scripts Mistral sur votre instance VastAI.

## 1. Problèmes d'importation ("No module named 'xxx'")

Le script `fix_imports_vastai.py` corrige automatiquement les problèmes d'importation des modules.

```bash
# Rendre le script exécutable
chmod +x fix_imports_vastai.py

# Exécuter le script
python fix_imports_vastai.py
```

Ce script:
- Ajoute le chemin `scripts/Restauration/` au PYTHONPATH dans tous les fichiers Python des scripts Mistral
- Crée des liens vers les modules nécessaires ou les copie dans `scripts/vast_ai_scripts/`
- Résout les erreurs "No module named 'xxx'"

## 2. Problème d'URL null ("Invalid URL 'None'")

L'erreur "Invalid URL 'None'" dans l'extraction de menus se produit car les restaurants n'ont pas d'URL dans la base de données. Voici comment résoudre ce problème:

### Option 1: Modifier la base de données (recommandé)

Modifiez les restaurants dans MongoDB pour ajouter des URLs valides:

```bash
# Créer un script MongoDB pour corriger les URLs
cat > fix_restaurant_urls.js << 'EOL'
// Script pour ajouter des URLs factices aux restaurants qui n'en ont pas
db = db.getSiblingDB("Restauration_Officielle");
db.producers.updateMany(
  { website: null },
  { $set: { website: "https://example.com" } }
);
print("URLs mises à jour pour " + db.producers.countDocuments({ website: "https://example.com" }) + " restaurants");
EOL

# Exécuter le script avec MongoDB
mongo fix_restaurant_urls.js
```

### Option 2: Modifier le code d'extraction de menus

```bash
# Créer un script Python pour modifier menu_sur_mongo_mistral.py
cat > fix_url_none.py << 'EOL'
#!/usr/bin/env python

import os
import re

# Fichier à modifier
file_path = "scripts/vast_ai_scripts/menu_sur_mongo_mistral.py"

# Lire le contenu
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Ajouter une vérification d'URL
replacement = """
    # Vérifier si l'URL est valide
    if url is None or url.strip() == "":
        logger.warning(f"URL invalide pour {restaurant_name}: {url}")
        url = "https://example.com"  # URL factice pour éviter l'erreur
"""

# Chercher l'endroit où l'URL est utilisée (ajuste selon le code réel)
pattern = r'(def extract_links.*?url\s*=\s*[^,\n]+)'
if re.search(pattern, content, re.DOTALL):
    modified_content = re.sub(pattern, r'\1\n' + replacement, content, flags=re.DOTALL)
    
    # Écrire le contenu modifié
    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(modified_content)
    
    print(f"✓ Correction d'URL null appliquée à {file_path}")
else:
    print(f"⚠️ Motif non trouvé dans {file_path}")
EOL

# Rendre exécutable et lancer
chmod +x fix_url_none.py
python fix_url_none.py
```

## 3. Lancer les scripts corrigés

Après avoir appliqué ces corrections:

```bash
# Configurer PYTHONPATH (à faire une fois par session)
export PYTHONPATH=$PYTHONPATH:/workspace

# Lancer l'extraction de menus
./run_mistral_scripts.sh
```

## Problèmes persistants

Si vous rencontrez encore des erreurs:

1. Vérifiez les logs pour identifier l'erreur précise
2. Pour les erreurs d'importation:
   ```bash
   python -c "import sys; print(sys.path)"  # Vérifier le PYTHONPATH
   ```
3. Pour les erreurs MongoDB, vérifiez la connexion:
   ```bash
   python -c "import pymongo; print(pymongo.MongoClient().list_database_names())"
   ```

## Structure de répertoires recommandée

Conservez cette structure:
```
/workspace/
├── module/                  # modules factices (renommé en 'modules' si possible)
│   └── frontend_mock.py     # frontend renommé pour éviter les collisions
├── scripts/
│   ├── Restauration/        # modules originaux
│   └── vast_ai_scripts/     # scripts Mistral adaptés
├── fix_imports_vastai.py    # script de correction des imports
└── run_mistral_scripts.sh   # script de lancement
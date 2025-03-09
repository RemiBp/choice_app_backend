# Scripts d'Extraction et d'Analyse de Restaurants

Ce projet contient plusieurs scripts Python pour extraire, structurer et analyser des données de restaurants, incluant leurs menus, avis clients, et empreinte carbone.

## Optimisations Importantes

Ces scripts ont été optimisés pour réduire significativement les coûts d'API (50-70%) tout en maintenant la qualité des résultats:

1. **Intégration Hugging Face**: Utilisation de modèles comme Mistral-7B ou Mixtral-8x7B hébergés sur Hugging Face Spaces
2. **Gestion automatique des instances**: Démarrage/arrêt automatique des instances pour économiser les coûts
3. **Système de cache avancé**: Réutilisation maximale des requêtes API précédentes
4. **Traitement par lots**: Regroupement des requêtes pour minimiser les appels API
5. **Reconnaissance d'images**: Extraction de texte des menus au format image

## Installation

1. Installez les dépendances:

```bash
pip install -r requirements.txt
```

2. Configuration des variables d'environnement (créez un fichier `.env` à la racine du projet):

```env
# API Keys
OPENAI_API_KEY=sk-votre-clé-openai
HF_API_TOKEN=hf_votre-token-huggingface

# Configuration Hugging Face
HF_SPACE_NAME=votre-username/nom-du-space
USE_HUGGING_FACE=true
AUTO_SHUTDOWN=true

# MongoDB (optionnel, si différent de la valeur par défaut)
MONGO_URI=mongodb+srv://...
```

## Déploiement du Modèle sur Hugging Face Spaces

Pour utiliser un modèle comme Mixtral-8x7B sur Hugging Face Spaces:

1. Créez un compte sur [Hugging Face](https://huggingface.co/)
2. Créez un nouveau Space:
   - Type: Gradio
   - Hardware: GPU (A10G recommandé pour Mixtral)
   - Modèle: Mistral-7B ou Mixtral-8x7B

3. Clonez et personnalisez ce template d'API pour votre Space:

```python
import gradio as gr
from transformers import AutoModelForCausalLM, AutoTokenizer, pipeline

# Charger le modèle (avec quantification pour économiser de la mémoire)
model_id = "mistralai/Mixtral-8x7B-Instruct-v0.1"
tokenizer = AutoTokenizer.from_pretrained(model_id)
model = AutoModelForCausalLM.from_pretrained(
    model_id,
    device_map="auto",
    load_in_8bit=True  # Quantification 8-bit
)

# Créer un pipeline de génération de texte
pipe = pipeline(
    "text-generation",
    model=model,
    tokenizer=tokenizer,
    max_new_tokens=1024,
    temperature=0.3,
    top_p=0.95,
    do_sample=True
)

def generate_text(prompt):
    formatted_prompt = f"<s>[INST] {prompt} [/INST]"
    response = pipe(formatted_prompt)
    return response[0]['generated_text'].split('[/INST]')[-1].strip()

# Interface Gradio
iface = gr.Interface(
    fn=generate_text,
    inputs=gr.Textbox(lines=5, label="Prompt"),
    outputs=gr.Textbox(lines=10, label="Réponse"),
)

# Lancer l'interface
iface.launch()
```

4. Obtenez un token d'API dans vos paramètres Hugging Face et ajoutez-le à votre fichier `.env`

## Ordre d'Exécution des Scripts

⚠️ **IMPORTANT**: Respectez cet ordre d'exécution pour éviter les problèmes:

```bash
# 1. Extraction des restaurants (TOUJOURS EN PREMIER)
python maps_code_restauration.py

# 2. Extraction des URLs Tripadvisor et avis
python scraping_pages_menus.py

# 3. Extraction et structuration des menus
python menu_sur_mongo.py

# 4. Enrichissement nutritionnel et empreinte carbone
python ajuster_carbone_cal_nutri_mongo.py
```

## Configuration Avancée

### Ajustement des Paramètres

Dans chaque script, vous pouvez modifier ces variables:

```python
# Nombre de restaurants à traiter par exécution
limit = 20

# Nombre d'éléments traités en parallèle
batch_size = 5

# Utilisation de Hugging Face vs OpenAI
USE_HUGGING_FACE = True  # Mettre à False pour n'utiliser qu'OpenAI
```

### Reconnaissance d'Images (OCR)

Pour la reconnaissance d'images de menus:

1. **OpenAI Vision** (par défaut): Utilisé automatiquement si OpenAI est configuré
2. **Tesseract OCR** (optionnel):
   - Installez [Tesseract OCR](https://github.com/UB-Mannheim/tesseract/wiki)
   - Ajoutez le chemin à votre PATH ou spécifiez-le dans le code
3. **Google Cloud Vision** (optionnel):
   - Créez une clé API Google Cloud
   - Activez l'API Vision
   - Configurez `GOOGLE_APPLICATION_CREDENTIALS` dans .env

## Estimation des Coûts

| Service | Coût initial | Coût optimisé | Économie |
|---------|--------------|---------------|----------|
| OpenAI (GPT-3.5/4) | ~$0.10-0.20/menu | ~$0.01-0.03/menu | 70-90% |
| Google Maps API | ~50€/IDF | ~50€/IDF | Couverture améliorée |
| ScraperAPI | Variable selon volume | Réduction 50-70% | Cache + render sélectif |
| Hugging Face | ~$1-2/heure d'utilisation | ~$0.1-0.3/heure effective | Arrêt auto quand inactif |

## Structure du Cache

Le système crée un répertoire `api_cache/` qui stocke:

```
api_cache/
├── maps_*.json         # Cache des recherches Maps 
├── places_*.json       # Cache des détails de lieux
├── search_*.json       # Cache des recherches Google
├── tripadvisor_*.json  # Cache des pages Tripadvisor
├── reviews_*.json      # Cache des avis
├── menu_text_*.json    # Cache des textes extraits
├── gpt_menus_*.json    # Cache des analyses GPT
└── nutrition_*.json    # Cache des données nutritionnelles
```

## Dépannage

### Problèmes courants:

1. **Erreurs MongoDB**: Vérifiez la connexion et que les index sont correctement configurés
2. **Erreurs d'API Hugging Face**: 
   - Vérifiez que votre token est valide
   - Assurez-vous que votre Space est correctement configuré
   - Attendez que le modèle soit complètement chargé (~5 min au premier démarrage)
3. **Problèmes de reconnaissance d'images**:
   - Pour Tesseract: vérifiez l'installation et le chemin
   - Pour Google Vision: vérifiez les permissions API
   - Pour OpenAI Vision: vérifiez votre quota API

## Évolutions Futures Recommandées

1. **Pipeline automatisé**: Créer un script principal qui exécute la séquence complète
2. **API alternatives**: Implémenter d'autres modèles comme alternatives à OpenAI
3. **UI de monitoring**: Interface pour suivre l'avancement et les coûts
4. **Système de mise à jour**: Rafraîchissement automatique des données anciennes

## Licence et Contact

Cette documentation et les scripts associés sont destinés à un usage interne uniquement.
Pour toute question ou assistance, veuillez contacter l'équipe de développement.
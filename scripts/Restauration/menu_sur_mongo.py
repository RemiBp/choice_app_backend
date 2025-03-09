import os
import re
import time
import json
import hashlib
import requests
import tempfile
from bs4 import BeautifulSoup
import fitz  # PyMuPDF
import openai
from bson.objectid import ObjectId
from urllib.parse import urljoin
from PIL import Image
import io
import logging
from dotenv import load_dotenv
from utils import get_db_connection, make_api_request, get_from_cache, save_to_cache

# Toggle pour activer/désactiver la fonctionnalité IA
AI_ENABLED = False  # Mettre à True pour réactiver l'IA

# Charger les variables d'environnement
load_dotenv()

# Configuration du logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# --- Configuration MongoDB ---
db, collection = get_db_connection()

# --- Configuration des APIs ---
# OpenAI (utilisé comme fallback)
openai.api_key = os.getenv("OPENAI_API_KEY", "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")

# Hugging Face
HF_API_TOKEN = os.getenv("HF_API_TOKEN", "")  # Votre token Hugging Face
HF_SPACE_NAME = os.getenv("HF_SPACE_NAME", "your-username/mixtral-space")  # Nom de votre espace
HF_SPACE_URL = f"https://huggingface.co/spaces/{HF_SPACE_NAME}"
HF_API_URL = f"https://api-inference.huggingface.co/models/{HF_SPACE_NAME}"
HF_MANAGEMENT_API = "https://huggingface.co/api/spaces"

# Clé API Google Cloud Vision (laissez vide si non disponible)
GOOGLE_VISION_API_KEY = os.getenv("GOOGLE_VISION_API_KEY", "")

# --- Configuration de l'instance Hugging Face ---
USE_HUGGING_FACE = True  # Activer/désactiver l'utilisation de HF
AUTO_SHUTDOWN = True     # Désactiver l'instance après traitement

# --- Répertoires temporaires ---
TMP_DIR = "tmp_files"
TMP_PDF_DIR = os.path.join(TMP_DIR, "pdf")
TMP_IMG_DIR = os.path.join(TMP_DIR, "img")
os.makedirs(TMP_PDF_DIR, exist_ok=True)
os.makedirs(TMP_IMG_DIR, exist_ok=True)

# --- Fonctions de gestion Hugging Face Space ---
def hf_is_space_running():
    """Vérifie si l'instance Hugging Face Space est en cours d'exécution"""
    if not HF_API_TOKEN:
        logger.warning("Token Hugging Face non configuré. Utilisation d'OpenAI par défaut.")
        return False
    
    try:
        space_name = HF_SPACE_NAME.split('/')[-1]
        username = HF_SPACE_NAME.split('/')[0]
        
        response = requests.get(
            f"{HF_MANAGEMENT_API}/{username}/{space_name}",
            headers={"Authorization": f"Bearer {HF_API_TOKEN}"}
        )
        
        if response.status_code == 200:
            space_info = response.json()
            return space_info.get("runtime", {}).get("stage") == "RUNNING"
        else:
            logger.error(f"Erreur lors de la vérification du status: {response.status_code}")
            return False
    
    except Exception as e:
        logger.error(f"Erreur lors de la vérification du status: {e}")
        return False

def hf_start_space():
    """Démarre l'instance Hugging Face Space"""
    if not HF_API_TOKEN:
        logger.warning("Token Hugging Face non configuré. Impossible de démarrer l'instance.")
        return False
    
    try:
        space_name = HF_SPACE_NAME.split('/')[-1]
        username = HF_SPACE_NAME.split('/')[0]
        
        response = requests.post(
            f"{HF_MANAGEMENT_API}/{username}/{space_name}/restart",
            headers={"Authorization": f"Bearer {HF_API_TOKEN}"}
        )
        
        if response.status_code in [200, 202]:
            logger.info(f"Instance {HF_SPACE_NAME} en cours de démarrage...")
            
            # Attendre que l'instance soit prête (max 5 minutes)
            for i in range(30):  # 30 * 10s = 5 minutes
                if hf_is_space_running():
                    logger.info(f"Instance {HF_SPACE_NAME} démarrée avec succès!")
                    return True
                logger.info(f"En attente du démarrage de l'instance... ({i+1}/30)")
                time.sleep(10)
            
            logger.warning("Timeout lors du démarrage de l'instance.")
            return False
        else:
            logger.error(f"Erreur lors du démarrage: {response.status_code} - {response.text}")
            return False
    
    except Exception as e:
        logger.error(f"Erreur lors du démarrage de l'instance: {e}")
        return False

def hf_stop_space():
    """Arrête l'instance Hugging Face Space"""
    if not HF_API_TOKEN:
        logger.warning("Token Hugging Face non configuré. Impossible d'arrêter l'instance.")
        return False
    
    try:
        space_name = HF_SPACE_NAME.split('/')[-1]
        username = HF_SPACE_NAME.split('/')[0]
        
        response = requests.delete(
            f"{HF_MANAGEMENT_API}/{username}/{space_name}/runtime",
            headers={"Authorization": f"Bearer {HF_API_TOKEN}"}
        )
        
        if response.status_code in [200, 202]:
            logger.info(f"Instance {HF_SPACE_NAME} arrêtée avec succès!")
            return True
        else:
            logger.error(f"Erreur lors de l'arrêt: {response.status_code} - {response.text}")
            return False
    
    except Exception as e:
        logger.error(f"Erreur lors de l'arrêt de l'instance: {e}")
        return False

def hf_query_model(prompt, max_retries=3, backoff_factor=2):
    """
    Interroge le modèle Hugging Face avec un prompt donné
    """
    # Vérifier si la fonctionnalité IA est activée
    if not AI_ENABLED:
        logger.info("La fonctionnalité IA est désactivée. Retour de None.")
        return None
    
    if not USE_HUGGING_FACE or not HF_API_TOKEN:
        logger.info("Hugging Face désactivé ou non configuré. Utilisation d'OpenAI.")
        return None
    
    # Vérifier et démarrer l'instance si nécessaire
    if not hf_is_space_running():
        logger.info("L'instance Hugging Face n'est pas en cours d'exécution. Démarrage...")
        if not hf_start_space():
            logger.warning("Impossible de démarrer l'instance. Utilisation d'OpenAI comme fallback.")
            return None
    
    headers = {"Authorization": f"Bearer {HF_API_TOKEN}"}
    payload = {
        "inputs": prompt,
        "parameters": {
            "max_new_tokens": 1024,
            "temperature": 0.3,
            "top_p": 0.95,
            "do_sample": True
        }
    }
    
    for attempt in range(max_retries):
        try:
            response = requests.post(HF_API_URL, headers=headers, json=payload, timeout=120)
            
            if response.status_code == 200:
                result = response.json()
                # Format peut varier selon le modèle, adapter si nécessaire
                if isinstance(result, list) and result:
                    return result[0].get("generated_text", "")
                return result.get("generated_text", "")
            
            elif response.status_code == 503:
                # Modèle en cours de chargement, attendre
                logger.info(f"Modèle en cours de chargement. Attente... Tentative {attempt+1}/{max_retries}")
                time.sleep(backoff_factor * (2 ** attempt))
            
            else:
                logger.warning(f"Erreur Hugging Face API: {response.status_code} - {response.text}")
                if attempt == max_retries - 1:
                    return None
                time.sleep(backoff_factor * (2 ** attempt))
        
        except Exception as e:
            logger.error(f"Erreur lors de l'appel à l'API Hugging Face: {e}")
            if attempt == max_retries - 1:
                return None
            time.sleep(backoff_factor * (2 ** attempt))
    
    return None
# --- Fonctions Utilitaires ---
def fetch_restaurant_websites(limit=3, processed_only=True):
    """
    Récupère les restaurants ayant un site web dans MongoDB.
    Avec l'option processed_only=False, récupère seulement les restaurants
    sans menus_structures.
    """
    try:
        query = {"website": {"$exists": True}}
        if not processed_only:
            query["menus_structures"] = {"$exists": False}
        
        return list(collection.find(query, {"_id": 1, "name": 1, "website": 1, "rating": 1}).limit(limit))
    except Exception as e:
        print(f"Erreur lors de la récupération des restaurants : {e}")
        return []
def extract_links_from_website(url, retries=3, backoff_factor=2):
    """
    Extrait tous les liens d'un site web en utilisant BeautifulSoup, avec gestion des timeouts et retries.
    """
    # Vérifier le cache
    cache_key = f"links_{url}"
    cached_links = get_from_cache(cache_key, max_age_hours=168, prefix="websites")
    if cached_links:
        return cached_links
    
    attempt = 0
    while attempt < retries:
        try:
            response = requests.get(url, timeout=10)
            response.raise_for_status()
            soup = BeautifulSoup(response.content, "html.parser")
            links = [{"href": link["href"], "text": link.get_text(strip=True)} for link in soup.find_all("a", href=True)]
            
            # Extraire aussi les images qui pourraient être des menus
            img_links = []
            for img in soup.find_all("img", src=True):
                img_src = img["src"]
                if not img_src.startswith("http"):
                    img_src = urljoin(url, img_src)
                img_alt = img.get("alt", "")
                img_links.append({"href": img_src, "text": img_alt})
            
            links.extend(img_links)
            
            # Sauvegarder dans le cache
            save_to_cache(cache_key, links, prefix="websites")
            
            return links
        except requests.exceptions.Timeout:
            attempt += 1
            print(f"Timeout lors de la tentative {attempt} pour {url}. Réessayer...")
            time.sleep(backoff_factor * attempt)
        except requests.exceptions.RequestException as e:
            print(f"Erreur lors de la connexion à {url}: {e}")
            break
    
    print(f"Échec de l'extraction des liens après {retries} tentatives pour {url}")
    return []
def is_menu_link(link):
    """Identifie si un lien est pertinent pour un menu."""
    menu_keywords = ["menu", "carte", "plats", "boissons", "pdf", "dejeuner", "diner", "déjeuner", "dîner", "formule"]
    href = link["href"].lower()
    text = link["text"].lower()
    return any(keyword in href or keyword in text for keyword in menu_keywords)
def filter_menu_links(all_links, base_url):
    """
    Filtre les liens pour ne conserver que ceux liés aux menus et complète les liens relatifs.
    Détecte aussi les liens vers des images qui pourraient être des menus.
    """
    menu_links = []
    seen_links = set()
    
    # Mots-clés pour le menu
    menu_keywords = ["menu", "carte", "plats", "boissons", "pdf", "dejeuner", "diner", "déjeuner", "dîner", "formule"]
    
    # Extensions d'images
    image_extensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp']
    
    for link in all_links:
        href = link["href"]
        text = link["text"].lower()
        
        # Convertir en URL absolue si c'est un lien relatif
        if not href.startswith("http"):
            href = urljoin(base_url, href)
        
        # Éviter les doublons
        if href in seen_links:
            continue
        
        is_relevant = False
        
        # 1. Vérifier les mots-clés de menu dans le texte ou l'URL
        if any(keyword in text or keyword in href.lower() for keyword in menu_keywords):
            is_relevant = True
        
        # 2. Vérifier si c'est une image qui pourrait être un menu (basé sur contexte)
        if any(href.lower().endswith(ext) for ext in image_extensions):
            # Si le texte évoque un menu ou la carte
            if any(keyword in text for keyword in menu_keywords):
                is_relevant = True
            # Ou si le lien a "menu" dans son URL
            elif "menu" in href.lower():
                is_relevant = True
        
        # Ajouter le lien s'il est pertinent
        if is_relevant:
            seen_links.add(href)
            menu_links.append({"href": href, "text": link["text"]})
    
    return menu_links
def extract_text_from_link(url):
    """
    Extrait le texte d'un lien, qu'il soit PDF, HTML ou image.
    Détecte automatiquement le type de contenu.
    """
    # Vérifier le cache
    cache_key = f"text_{url}"
    cached_text = get_from_cache(cache_key, max_age_hours=168, prefix="menu_text")
    if cached_text:
        return cached_text
    
    try:
        # Obtenir les en-têtes pour vérifier le type de contenu
        response = requests.head(url, timeout=10)
        content_type = response.headers.get('content-type', '').lower()
        
        # Extraire le texte en fonction du type de contenu
        if url.lower().endswith(".pdf") or "application/pdf" in content_type:
            text = extract_text_from_pdf(url)
        elif (url.lower().endswith(('.jpg', '.jpeg', '.png', '.gif', '.webp')) or 
              any(img_type in content_type for img_type in ['image/jpeg', 'image/png', 'image/gif', 'image/webp'])):
            text = extract_text_from_image(url)
        else:
            text = extract_text_from_html(url)
        
        if text:
            # Sauvegarder dans le cache
            save_to_cache(cache_key, text, prefix="menu_text")
        
        return text
    except Exception as e:
        print(f"Erreur lors de l'extraction du texte de {url}: {e}")
        return ""
def extract_text_from_html(url):
    """Extrait le texte brut d'une page HTML."""
    try:
        response = requests.get(url, timeout=10)
        response.raise_for_status()
        soup = BeautifulSoup(response.content, "html.parser")
        return soup.get_text(separator="\n").strip()
    except Exception as e:
        print(f"[ERREUR] Problème lors de l'extraction HTML ({url}) : {e}")
        return ""

def extract_text_from_image(image_url):
    """
    Extrait le texte d'une image de menu en utilisant l'OCR.
    Utilise d'abord l'API OpenAI Vision, puis Google Vision API si disponible.
    """
    # Vérifier si la fonctionnalité IA est activée
    if not AI_ENABLED:
        logger.info("La fonctionnalité IA est désactivée. OCR non disponible pour l'image.")
        return "Image non traitée - IA désactivée"
        
    try:
        # Créer un nom de fichier unique basé sur l'URL
        img_filename = hashlib.md5(image_url.encode()).hexdigest() + ".jpg"
        img_path = os.path.join(TMP_IMG_DIR, img_filename)
        
        # Télécharger l'image si non présente
        if not os.path.exists(img_path):
            response = requests.get(image_url, timeout=15)
            response.raise_for_status()
            with open(img_path, "wb") as f:
                f.write(response.content)
        
        # Méthode 1: Utiliser Hugging Face si disponible (avec modèle multimodal)
        if USE_HUGGING_FACE and HF_API_TOKEN:
            try:
                # Charger l'image en base64
                with open(img_path, "rb") as img_file:
                    import base64
                    image_data = base64.b64encode(img_file.read()).decode('utf-8')
                
                # Utilisez un format spécifique au modèle multimodal que vous avez déployé
                # Cet exemple suppose un modèle similaire à LLaVA ou BLIP
                prompt = {
                    "image": image_data,
                    "prompt": "Il s'agit d'une image d'un menu de restaurant. Extrais tout le texte visible, en conservant la structure du menu (sections, plats, prix, descriptions). Si c'est un menu, organise-le comme un menu."
                }
                
                # La requête doit être adaptée au format exact attendu par votre modèle
                headers = {"Authorization": f"Bearer {HF_API_TOKEN}"}
                response = requests.post(
                    HF_API_URL, 
                    headers=headers, 
                    json=prompt,
                    timeout=120
                )
                
                if response.status_code == 200:
                    text_content = response.json().get("text", "")
                    if text_content and len(text_content) > 50:
                        logger.info(f"Texte extrait avec Hugging Face: {len(text_content)} caractères")
                        return text_content
            except Exception as e:
                logger.error(f"Erreur lors de l'extraction avec Hugging Face: {e}")
        
        # Méthode 2: Utiliser OpenAI Vision avec gpt-4-vision-preview (fallback)
        try:
            # Encodage de l'image en base64
            with open(img_path, "rb") as img_file:
                import base64
                image_data = base64.b64encode(img_file.read()).decode('utf-8')
            
            response = openai.ChatCompletion.create(
                model="gpt-4-vision-preview",
                messages=[
                    {
                        "role": "user",
                        "content": [
                            {"type": "text", "text": "Il s'agit d'une image d'un menu de restaurant. Extrais tout le texte visible, en conservant la structure du menu (sections, plats, prix, descriptions). Si c'est un menu, organise-le comme un menu."},
                            {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{image_data}"}}
                        ]
                    }
                ],
                max_tokens=1500
            )
            
            text_content = response['choices'][0]['message']['content']
            if text_content and len(text_content) > 50:  # Vérifier si le contenu est significatif
                logger.info(f"Texte extrait avec OpenAI Vision: {len(text_content)} caractères")
                return text_content
        
        except Exception as e:
            logger.error(f"Erreur lors de l'extraction avec OpenAI Vision: {e}")
        
        # Méthode 2: Google Cloud Vision API (si clé disponible)
        if GOOGLE_VISION_API_KEY:
            try:
                from google.cloud import vision
                
                client = vision.ImageAnnotatorClient()
                
                with open(img_path, "rb") as image_file:
                    content = image_file.read()
                
                image = vision.Image(content=content)
                response = client.text_detection(image=image)
                texts = response.text_annotations
                
                if texts:
                    # Le premier élément contient tout le texte
                    extracted_text = texts[0].description
                    logger.info(f"Texte extrait avec Google Vision: {len(extracted_text)} caractères")
                    return extracted_text
            
            except Exception as e:
                logger.error(f"Erreur lors de l'extraction avec Google Vision: {e}")
        
        # Méthode 3: Utiliser pytesseract (OCR local)
        try:
            import pytesseract
            from PIL import Image
            
            img = Image.open(img_path)
            extracted_text = pytesseract.image_to_string(img, lang='fra+eng')
            
            if extracted_text and len(extracted_text) > 50:
                logger.info(f"Texte extrait avec Tesseract: {len(extracted_text)} caractères")
                return extracted_text
        
        except Exception as e:
            logger.error(f"Erreur lors de l'extraction avec Tesseract: {e}")
        
        logger.warning(f"Aucune méthode d'OCR n'a pu extraire du texte de {image_url}")
        return ""
    
    except Exception as e:
        logger.error(f"Erreur générale lors de l'extraction d'image ({image_url}): {e}")
        return ""

def extract_text_from_pdf(pdf_url):
    """Télécharge et extrait le texte brut d'un PDF, avec OCR pour les PDF scannés."""
    try:
        # Créer un nom de fichier unique basé sur l'URL
        pdf_filename = hashlib.md5(pdf_url.encode()).hexdigest() + ".pdf"
        pdf_path = os.path.join(TMP_PDF_DIR, pdf_filename)
        
        # Télécharger le PDF si non présent
        if not os.path.exists(pdf_path):
            response = requests.get(pdf_url, timeout=15)
            response.raise_for_status()
            with open(pdf_path, "wb") as f:
                f.write(response.content)
        
        # Extraire le texte normalement
        pdf = fitz.open(pdf_path)
        text = "".join(page.get_text() for page in pdf)
        
        # Si peu de texte, le PDF pourrait être scanné - essayer OCR sur les images
        if len(text.strip()) < 200:
            logger.info(f"PDF avec peu de texte, tentative d'OCR...")
            full_text = []
            
            for page_num in range(len(pdf)):
                page = pdf[page_num]
                pix = page.get_pixmap(dpi=300)
                
                # Sauvegarder l'image temporairement
                img_path = os.path.join(TMP_IMG_DIR, f"{pdf_filename}_page{page_num}.png")
                pix.save(img_path)
                
                # Extraire le texte de l'image
                page_text = extract_text_from_image(f"file://{img_path}")
                full_text.append(page_text)
            
            # Concaténer le texte de toutes les pages
            if any(full_text):
                text = "\n\n".join(full_text)
                logger.info(f"OCR réussi sur PDF scanné: {len(text)} caractères")
        
        pdf.close()
        return text.strip()
    
    except Exception as e:
        logger.error(f"[ERREUR] Problème lors de l'extraction PDF ({pdf_url}) : {e}")
        return ""

def batch_structure_menus_with_gpt(raw_texts, restaurant_name, default_rating):
    """
    Analyse en lot plusieurs textes de menu avec GPT pour créer une structure cohérente.
    Utilise Hugging Face si disponible, sinon fallback sur gpt-3.5-turbo.
    """
    # Vérifier si la fonctionnalité IA est activée
    if not AI_ENABLED:
        logger.info("La fonctionnalité IA est désactivée. Retour d'une structure de menu vide.")
        return {"Menus Globaux": [], "Plats Indépendants": []}
    
    # Combiner les textes s'ils sont courts, sinon les traiter séparément
    combined_texts = []
    current_text = ""
    
    for text in raw_texts:
        if not text:
            continue
        
        # Si le texte est très long, le traiter séparément
        if len(text) > 4000:
            combined_texts.append(text[:4000])  # Tronquer pour limiter les tokens
        else:
            # Sinon combiner les textes courts
            if len(current_text) + len(text) > 4000:
                combined_texts.append(current_text)
                current_text = text
            else:
                current_text += "\n\n" + text
    
    if current_text:
        combined_texts.append(current_text)
    
    all_menus = {"Menus Globaux": [], "Plats Indépendants": []}
    
    for i, text in enumerate(combined_texts):
        cache_key = f"menu_structure_{restaurant_name}_{i}_{hashlib.md5(text[:100].encode()).hexdigest()}"
        cached_result = get_from_cache(cache_key, max_age_hours=720, prefix="gpt_menus")  # 30 jours
        
        if cached_result:
            logger.info(f"Utilisation du cache pour le menu de {restaurant_name} (batch {i+1})")
            result = cached_result
        else:
            prompt = f"""
            Analyse ce menu de restaurant "{restaurant_name}" et structure-le en JSON:

            {text}

            Structure attendue:
            {{
              "Menus Globaux": [
                {{
                  "nom": "Nom du menu",
                  "prix": "Prix",
                  "inclus": [
                    {{ "nom": "Plat 1", "description": "Description" }},
                    {{ "nom": "Plat 2", "description": "Description" }}
                  ]
                }}
              ],
              "Plats Indépendants": [
                {{
                  "nom": "Nom du plat",
                  "catégorie": "Entrée/Plat/Dessert/Boisson",
                  "prix": "Prix",
                  "description": "Description"
                }}
              ]
            }}

            Assure-toi d'extraire le maximum d'informations pertinentes.
            """
            
            # Essayer d'abord avec Hugging Face
            if USE_HUGGING_FACE:
                logger.info(f"Utilisation de Hugging Face pour analyser le menu de {restaurant_name} (batch {i+1})")
                result_text = hf_query_model(prompt)
            else:
                result_text = None
            
            # Si Hugging Face échoue, utiliser OpenAI comme fallback
            if not result_text:
                logger.info(f"Fallback sur OpenAI pour analyser le menu de {restaurant_name} (batch {i+1})")
                try:
                    response = openai.ChatCompletion.create(
                        model="gpt-3.5-turbo",
                        messages=[{"role": "user", "content": prompt}],
                        max_tokens=2000,
                        temperature=0.3
                    )
                    
                    result_text = response['choices'][0]['message']['content']
                except Exception as e:
                    logger.error(f"Erreur lors de l'appel à OpenAI: {e}")
                    result_text = "{}"
                
                # Essayer d'extraire le JSON
                try:
                    # Rechercher les accolades JSON
                    json_match = re.search(r'({[\s\S]*})', result_text)
                    if json_match:
                        result_text = json_match.group(1)
                    
                    result = json.loads(result_text)
                    
                    # Sauvegarder dans le cache
                    save_to_cache(cache_key, result, prefix="gpt_menus")
                    
                except json.JSONDecodeError:
                    logger.error(f"Erreur de décodage JSON pour {restaurant_name}. Utilisation d'une structure vide.")
                result = {"Menus Globaux": [], "Plats Indépendants": []}
        
        # Fusionner les résultats
        all_menus["Menus Globaux"].extend(result.get("Menus Globaux", []))
        all_menus["Plats Indépendants"].extend(result.get("Plats Indépendants", []))
    
    return all_menus
def deduplicate_items(items):
    """Supprime les doublons dans une liste d'items."""
    seen = set()
    unique_items = []
    for item in items:
        identifier = (
            item.get("nom", "").strip().lower(),
            item.get("description", "").strip().lower(),
            item.get("prix", "").strip().lower()
        )
        if identifier not in seen:
            seen.add(identifier)
            unique_items.append(item)
    return unique_items
def validate_and_enrich_items(items, default_rating):
    """Valide et enrichit les plats avec des valeurs par défaut."""
    validated_items = []
    for item in items:
        if isinstance(item, dict):
            # Normalisation des champs
            validated_item = {
                "nom": str(item.get("nom", "Nom non spécifié")).strip(),
                "description": str(item.get("description", "")).strip(),
                "prix": str(item.get("prix", "Non spécifié")).strip(),
                "note": str(item.get("note", f"{default_rating}/10")).strip(),
                "catégorie": item.get("catégorie", "Non spécifié")
            }
            
            # Gestion de la taille pour les boissons
            taille_match = re.search(r"(\d{2,4}\s*(?:cl|ml|L|litres?))", validated_item["description"], re.IGNORECASE)
            if taille_match:
                validated_item["taille"] = taille_match.group(1)
            
            validated_items.append(validated_item)
    
    return validated_items
def process_restaurant_menus(limit=3):
    """Pipeline principal pour extraire et structurer les menus."""
    restaurants = fetch_restaurant_websites(limit=limit, processed_only=False)
    
    for restaurant in restaurants:
        name = restaurant["name"]
        website = restaurant["website"]
        restaurant_id = restaurant["_id"]
        rating = restaurant.get("rating", 3.5) * 2  # Conversion en notation sur 10
        
        logger.info(f"\n=== Restaurant : {name} ===")
        
        # VÉRIFICATION CRITIQUE: ne jamais retraiter un restaurant déjà dans la base
        if collection.find_one({"_id": ObjectId(restaurant_id), "menus_structures": {"$exists": True}}):
            logger.info(f"Restaurant {name} déjà traité. Ignoré.")
            continue
        
        # Extraire les liens du site
        links = extract_links_from_website(website)
        menu_links = filter_menu_links(links, website)
        
        if not menu_links:
            logger.warning(f"Aucun lien de menu trouvé pour {name}")
            continue
        
        # Extraire le texte des menus
        raw_texts = []
        for link in menu_links:
            logger.info(f"Extraction du menu depuis: {link['href']}")
            text = extract_text_from_link(link["href"])
            if text:
                raw_texts.append(text)
        
        if not raw_texts:
            logger.warning(f"Aucun texte de menu extrait pour {name}")
            continue
        
        # Analyser les menus avec GPT
        logger.info(f"Analyse des menus pour {name}...")
        structured_menus = batch_structure_menus_with_gpt(raw_texts, name, rating)
        
        # Validation et déduplication
        structured_menus["Plats Indépendants"] = deduplicate_items(
            validate_and_enrich_items(structured_menus["Plats Indépendants"], rating)
        )
        
        # Sauvegarder dans MongoDB
        if structured_menus["Menus Globaux"] or structured_menus["Plats Indépendants"]:
            collection.update_one(
                {"_id": ObjectId(restaurant_id)},
                {"$set": {"menus_structures": structured_menus}}
            )
            logger.info(f"Menus sauvegardés pour {name}: {len(structured_menus['Menus Globaux'])} menus, {len(structured_menus['Plats Indépendants'])} plats")
        else:
            logger.warning(f"Aucun menu structuré obtenu pour {name}")

# Lancer le processus
if __name__ == "__main__":
    # Vérifier d'abord si la collection ingredients_reference existe
    if "ingredients_reference" not in db.list_collection_names():
        logger.warning("ATTENTION: La collection ingredients_reference n'existe pas.")
        logger.warning("Exécutez d'abord maps_code_restauration.py pour initialiser la base de données.")
    
    # Vérifier si tous les modules requis sont installés
    try:
        import PIL
        import fitz
        import openai
        logger.info("Tous les modules nécessaires sont installés.")
        
        # Vérification OCR optionnelle
        try:
            import pytesseract
            logger.info("Module OCR pytesseract disponible.")
        except ImportError:
            logger.warning("Module OCR pytesseract non disponible. L'OCR local ne sera pas utilisé.")
            logger.info("Installer avec: pip install pytesseract")
            logger.info("Et installez Tesseract OCR: https://github.com/UB-Mannheim/tesseract/wiki")
        
        # Démarrer l'instance Hugging Face si nécessaire
        if USE_HUGGING_FACE and HF_API_TOKEN:
            if not hf_is_space_running():
                logger.info("Démarrage de l'instance Hugging Face...")
                if not hf_start_space():
                    logger.warning("Impossible de démarrer l'instance Hugging Face. Utilisation d'OpenAI.")
        
        try:
            # Procéder au traitement
            process_restaurant_menus(limit=20)
        finally:
            # Arrêter l'instance Hugging Face si demandé
            if USE_HUGGING_FACE and HF_API_TOKEN and AUTO_SHUTDOWN:
                logger.info("Arrêt de l'instance Hugging Face pour économiser les coûts...")
                hf_stop_space()
    
    except ImportError as e:
        logger.error(f"Module manquant: {e}")
        logger.info("Installez les dépendances avec: pip install -r requirements.txt")
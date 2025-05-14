import os
import requests
import time
import re
import json
from bs4 import BeautifulSoup
from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer
from pymongo import MongoClient
from collections import OrderedDict
import logging
import base64
from datetime import datetime, timedelta
import httpx
import sys
import argparse  # Pour les arguments de ligne de commande
import hashlib
import shutil
from io import BytesIO
from PIL import Image
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.common.by import By
from geopy.geocoders import Nominatim
from geopy.exc import GeocoderTimedOut
import random

# Ajouter le chemin pour accéder aux utilitaires Mistral
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from mistral_utilities_fixed import generate_ai_response_mistral, CACHE_DIR, set_test_mode, clear_mistral_cache

# Configuration du logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger("BeautyWellnessProcessor")

# Configuration API et MongoDB
API_KEY = "AIzaSyDRvEPM8JZ1Wpn_J6ku4c3r5LQIocFmzOE"
MONGO_URI = "mongodb+srv://remibarbier:Calvi8Pierc2@lieuxrestauration.szq31.mongodb.net/?retryWrites=true&w=majority&appName=lieuxrestauration"
DB_NAME = "Beauty_Wellness"

# Configuration Brightdata
BRIGHTDATA_TOKEN = "14a8a2521435aca7cc3ff0b83465f21e2f4ac60739728f0457fc97ce5fe502e1"
BRIGHTDATA_ZONE = "web_unlocker1"
BRIGHTDATA_ENABLED = bool(BRIGHTDATA_TOKEN)

# Configuration pour Bing Search
BING_SEARCH_CACHE = {}

# Obtenir le client MongoDB
client = MongoClient(MONGO_URI)
db = client[DB_NAME]
analyzer = SentimentIntensityAnalyzer()

# Définition des catégories, sous-catégories et critères d'évaluation
CATEGORIES = {
    "Soins esthétiques et bien-être": {
        "sous_categories": [
            "Institut de beauté", "Spa", "Salon de massage", 
            "Centre d'épilation", "Clinique de soins de la peau", "Salon de bronzage"
        ],
        "google_types": ["spa", "beauty_salon", "massage_therapist", "hair_removal_service"],
        "criteres_evaluation": [
            "Qualité des soins", "Propreté", "Accueil", "Rapport qualité/prix", 
            "Ambiance", "Expertise du personnel"
        ]
    },
    "Coiffure et soins capillaires": {
        "sous_categories": ["Salon de coiffure", "Barbier"],
        "google_types": ["hair_salon", "barber_shop"],
        "criteres_evaluation": [
            "Qualité de la coupe", "Respect des attentes", "Conseil", 
            "Produits utilisés", "Tarifs", "Ponctualité"
        ]
    },
    "Onglerie et modifications corporelles": {
        "sous_categories": ["Salon de manucure", "Salon de tatouage", "Salon de piercing"],
        "google_types": ["nail_salon", "tattoo_parlor", "piercing_shop"],
        "criteres_evaluation": [
            "Précision", "Hygiène", "Créativité", "Durabilité", 
            "Conseil", "Douleur ressentie"
        ]
    }
}

# Expressions et termes à rechercher dans les commentaires pour chaque critère
MOTS_CLES = {
    "Soins esthétiques et bien-être": {
        "Qualité des soins": ["soin", "massage", "traitement", "qualité", "professionnel"],
        "Propreté": ["propre", "hygiène", "hygiénique", "nettoyage", "sanitaire"],
        "Accueil": ["accueil", "réception", "amabilité", "gentil", "sympathique"],
        "Rapport qualité/prix": ["prix", "tarif", "cher", "abordable", "valeur", "qualité-prix"],
        "Ambiance": ["ambiance", "atmosphère", "décor", "calme", "relaxant", "musique"],
        "Expertise du personnel": ["expert", "compétent", "professionnel", "expérience", "savoir-faire"]
    },
    "Coiffure et soins capillaires": {
        "Qualité de la coupe": ["coupe", "coiffure", "style", "résultat", "satisfait"],
        "Respect des attentes": ["attente", "demande", "photo", "souhaité", "voulu", "imaginé"],
        "Conseil": ["conseil", "suggestion", "recommandation", "avis", "guider"],
        "Produits utilisés": ["produit", "shampooing", "soin", "coloration", "marque"],
        "Tarifs": ["prix", "tarif", "cher", "abordable", "supplément", "coût"],
        "Ponctualité": ["heure", "attente", "retard", "rendez-vous", "ponctuel", "rapidité"]
    },
    "Onglerie et modifications corporelles": {
        "Précision": ["précis", "détail", "fin", "minutieux", "exact", "ligne"],
        "Hygiène": ["propre", "stérile", "gant", "aiguille", "hygiène", "désinfecté"],
        "Créativité": ["créatif", "original", "idée", "design", "motif", "artistique"],
        "Durabilité": ["tenir", "durer", "longtemps", "solide", "permanent", "semaine"],
        "Conseil": ["conseil", "suggestion", "recommandation", "avis", "information"],
        "Douleur ressentie": ["douleur", "mal", "doux", "supportable", "indolore", "aie"]
    }
}

# Classe pour gérer les requêtes Brightdata
def get_brightdata_request(url, timeout=30):
    """
    Effectue une requête via Bright Data Web Unlocker API.
    
    Args:
        url: URL à scraper
        timeout: Délai d'attente maximum en secondes
        
    Returns:
        Texte HTML de la page ou None en cas d'erreur
    """
    if not BRIGHTDATA_ENABLED:
        logger.warning("BrightData n'est pas activé (token manquant)")
        return None
        
    try:
        # Configuration complète pour Web Unlocker API
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {BRIGHTDATA_TOKEN}"
        }
        
        # Configuration des paramètres - retirer "device" qui cause l'erreur 400
        payload = {
            "zone": BRIGHTDATA_ZONE,
            "url": url,
            "format": "raw",
            "country": "fr",
            # "device": "desktop",  # Supprimé car non autorisé
            "render": True
        }
        
        logger.info(f"Requête BrightData vers: {url}")
        
        # Requête avec BrightData Web Unlocker API
        response = requests.post(
            "https://api.brightdata.com/request", 
            headers=headers, 
            json=payload,
            timeout=timeout
        )
        
        # Log détaillé en cas d'erreur
        if response.status_code != 200:
            logger.error(f"Réponse BrightData {response.status_code}: {response.text[:200]}")
            return None
            
        return response.text
    except Exception as e:
        logger.error(f"Erreur de requête BrightData: {e}")
        return None

def get_places_by_category(category_name, google_types, lat, lng, radius=5000):
    """Récupère les lieux d'une catégorie spécifique dans une zone donnée.
    Optimise en faisant une seule requête par type et en stockant les résultats en cache."""
    places = []
    for type_name in google_types:
        # Vérifier si les résultats sont déjà en cache
        cache_collection = db.PlacesCache
        cache_key = f"{lat}_{lng}_{radius}_{type_name}"
        cached_results = cache_collection.find_one({"key": cache_key})
        
        if cached_results and (datetime.now() - cached_results["timestamp"]).days < 7:
            logger.info(f"Utilisation des résultats en cache pour {type_name}")
            place_results = cached_results["results"]
        else:
            logger.info(f"Récupération des lieux de type {type_name} depuis Google Maps API")
            url = f"https://maps.googleapis.com/maps/api/place/nearbysearch/json?location={lat},{lng}&radius={radius}&type={type_name}&key={API_KEY}"
            response = requests.get(url)
            data = response.json()
            
            if 'results' in data:
                place_results = data['results']
                # Mise en cache des résultats
                cache_collection.update_one(
                    {"key": cache_key},
                    {"$set": {
                        "key": cache_key,
                        "results": place_results,
                        "timestamp": datetime.now()
                    }},
                    upsert=True
                )
            else:
                place_results = []
        
        for place in place_results:
            # Déterminer la sous-catégorie
            sous_categorie = determiner_sous_categorie(place.get("name", ""), category_name)
            
            places.append({
                "place_id": place.get("place_id"),
                "name": place.get("name"),
                "address": place.get("vicinity"),
                "gps_coordinates": place.get("geometry", {}).get("location"),
                "rating": place.get("rating"),
                "user_ratings_total": place.get("user_ratings_total"),
                "category": category_name,
                "sous_categorie": sous_categorie,
                "google_type": type_name,
                "photos": place.get("photos", [])  # Récupérer les références de photos
            })
    
    return places

def determiner_sous_categorie(place_name, category_name):
    """Détermine la sous-catégorie en fonction du nom du lieu et de la catégorie principale."""
    place_name_lower = place_name.lower()
    
    for sous_cat in CATEGORIES[category_name]["sous_categories"]:
        sous_cat_mots = sous_cat.lower().split()
        # Vérifier si un des mots-clés de la sous-catégorie est dans le nom du lieu
        if any(mot in place_name_lower for mot in sous_cat_mots):
            return sous_cat
    
    # Par défaut, retourner la première sous-catégorie
    return CATEGORIES[category_name]["sous_categories"][0]

def extract_place_details(place_id):
    """Récupère les détails d'un lieu depuis Google Maps, y compris les avis et photos."""
    # Vérifier si déjà en cache
    cache_collection = db.PlaceDetailsCache
    cached_place = cache_collection.find_one({"place_id": place_id})
    
    if cached_place and (datetime.now() - cached_place["timestamp"]).days < 7:
        logger.info(f"Utilisation des détails en cache pour {place_id}")
        return cached_place["details"]
    
    url = f"https://maps.googleapis.com/maps/api/place/details/json?place_id={place_id}&fields=name,formatted_address,rating,reviews,photos,website,formatted_phone_number&key={API_KEY}"
    response = requests.get(url)
    data = response.json()
    
    if "result" in data:
        place_details = data["result"]
        
        # Mise en cache des détails
        cache_collection.update_one(
            {"place_id": place_id},
            {"$set": {
                "place_id": place_id,
                "details": place_details,
                "timestamp": datetime.now()
            }},
            upsert=True
        )
        
        return place_details
    
    return None

def extract_reviews(place_details):
    """Extrait et analyse les avis d'un lieu depuis les détails Google Maps."""
    reviews = []
    
    if not place_details or "reviews" not in place_details:
        return reviews
    
    for review in place_details["reviews"][:10]:  # Limite à 10 avis
        sentiment = analyzer.polarity_scores(review["text"])['compound']
        sentiment_label = "Positif" if sentiment >= 0.05 else "Négatif" if sentiment <= -0.05 else "Neutre"
        reviews.append({
            "source": "Google Maps",
            "author_name": review.get("author_name", ""),
            "text": review["text"],
            "sentiment": sentiment_label,
            "sentiment_score": sentiment,
            "rating": review.get("rating", 0),
            "time": review.get("time", 0)
        })
    
    return reviews

def extract_photos(place_details, max_photos=5):
    """Extrait les URLs des photos depuis les détails Google Maps."""
    photos = []
    
    if not place_details or "photos" not in place_details:
        return photos
    
    for photo in place_details["photos"][:max_photos]:
        if "photo_reference" in photo:
            photo_url = f"https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photoreference={photo['photo_reference']}&key={API_KEY}"
            photos.append({
                "source": "Google Maps",
                "url": photo_url,
                "height": photo.get("height", 0),
                "width": photo.get("width", 0)
            })
    
    return photos

def search_links_bing(name, city="Paris"):
    """
    Recherche une URL Tripadvisor via Bing pour un établissement
    Implémentation améliorée pour extraire correctement les URLs
    
    Args:
        name: Nom de l'établissement
        city: Ville (par défaut Paris)
        
    Returns:
        URL Tripadvisor ou None si rien n'est trouvé
    """
    # Nettoyage du nom et de la ville
    name = name.strip()
    city = city.strip()
    
    # Construction de la requête Bing
    query = f"{name} {city} site:tripadvisor.fr"
    search_url = f"https://www.bing.com/search?q={requests.utils.quote(query)}"
    
    logger.info(f"Recherche Bing pour Tripadvisor: {query}")
    
    try:
        # Headers réalistes pour éviter d'être bloqué
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
            "Accept-Language": "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
            "Referer": "https://www.bing.com/",
            "Sec-Ch-Ua": '"Not A(Brand";v="99", "Google Chrome";v="121", "Chromium";v="121"',
            "Sec-Ch-Ua-Mobile": "?0",
            "Sec-Ch-Ua-Platform": '"Windows"',
            "Sec-Fetch-Dest": "document",
            "Sec-Fetch-Mode": "navigate",
            "Sec-Fetch-Site": "same-origin",
            "Sec-Fetch-User": "?1",
            "Upgrade-Insecure-Requests": "1"
        }
        
        response = requests.get(search_url, headers=headers, timeout=10)
        
        if response.status_code != 200:
            logger.error(f"Échec de la requête Bing: code {response.status_code}")
            return None
        
        # Parser les résultats
        soup = BeautifulSoup(response.text, 'html.parser')
        
        # Méthode 1: Chercher dans les éléments <a> avec href
        tripadvisor_urls = []
        
        # Chercher d'abord les citations directes
        for cite in soup.find_all('cite'):
            cite_text = cite.text.strip()
            if 'tripadvisor.fr' in cite_text:
                url_parts = cite_text.split()
                for part in url_parts:
                    if part.startswith('https://') or part.startswith('http://'):
                        if 'tripadvisor.fr' in part and ('Restaurant_Review' in part or 'Attraction_Review' in part or 'Hotel_Review' in part):
                            tripadvisor_urls.append(part)
        
        # Ensuite chercher dans les liens
        for link in soup.find_all('a'):
            href = link.get('href', '')
            # Chercher des URLs Tripadvisor dans href
            if 'tripadvisor.fr' in href and ('bing.com/ck' in href or '/search?q=' not in href):
                # Soit extraire directement le href
                if 'http' in href and 'tripadvisor.fr' in href:
                    tripadvisor_urls.append(href)
                # Soit chercher dans le texte de l'attribut data-url si disponible
                elif link.get('data-url') and 'tripadvisor.fr' in link.get('data-url'):
                    tripadvisor_urls.append(link.get('data-url'))
                # Soit chercher dans le texte du lien
                elif 'tripadvisor.fr' in link.text:
                    url_match = re.search(r'(https?://(?:www\.)?tripadvisor\.fr/[^\s]+)', link.text)
                    if url_match:
                        tripadvisor_urls.append(url_match.group(1))
        
        # Méthode 2: Extraire les URLs avec regex du HTML complet (fallback)
        if not tripadvisor_urls:
            # Regex pour trouver des URLs Tripadvisor
            url_pattern = r'(https?://(?:www\.)?tripadvisor\.fr/(?:Restaurant|Attraction|Hotel)_Review[^"\s\'&]+)'
            urls = re.findall(url_pattern, response.text)
            tripadvisor_urls.extend(urls)
        
        # Nettoyer et trier les URLs
        cleaned_urls = []
        for url in tripadvisor_urls:
            # Nettoyer l'URL (enlever les paramètres et fragments)
            clean_url = url.split('#')[0].split('?')[0]
            if clean_url not in cleaned_urls:
                cleaned_urls.append(clean_url)
        
        # Filtrer pour ne garder que les URLs de type Review
        review_urls = [url for url in cleaned_urls if 'Review' in url]
        
        if review_urls:
            best_url = review_urls[0]  # Prendre la première URL
            logger.info(f"URL Tripadvisor trouvée pour {name}: {best_url}")
            return best_url
        
        logger.warning(f"Aucune URL Tripadvisor trouvée pour {name} {city}")
        return None
            
    except Exception as e:
        logger.error(f"Erreur lors de la recherche Bing: {e}")
        return None

def find_tripadvisor_url(place_name, address=None):
    """Version simplifiée pour trouver l'URL Tripadvisor d'un lieu."""
    # Extraire la ville de l'adresse ou utiliser Paris par défaut
    city = "Paris"
    if address:
        address_parts = address.split(',')
        if len(address_parts) > 1:
            city = address_parts[-1].strip()
    
    # Rechercher l'URL directement via Bing
    return search_links_bing(place_name, city)

def extract_google_maps_reviews(place_id):
    """
    Extrait les commentaires directement depuis l'API Google Maps.
    
    Args:
        place_id: Identifiant Google Maps du lieu
        
    Returns:
        list: Liste des textes des commentaires
    """
    logger.info(f"Extraction des commentaires Google Maps pour place_id: {place_id}")
    
    try:
        place_details = extract_place_details(place_id)
        
        if not place_details or "reviews" not in place_details:
            logger.warning(f"Aucun commentaire trouvé dans les détails de place_id: {place_id}")
            return []
        
        comments = []
        for review in place_details.get("reviews", []):
            if "text" in review and review["text"].strip():
                comments.append(review["text"].strip())
        
        logger.info(f"Extraction réussie: {len(comments)} commentaires trouvés")
        return comments
        
    except Exception as e:
        logger.error(f"Erreur lors de l'extraction des commentaires Google Maps: {e}")
        return []

def extract_place_screenshot(place_id, place_name):
    """
    Génère une capture d'écran du lieu via Google Maps avec Chrome headless
    en utilisant la même méthode que billetreduc_shotgun_mistral.py
    
    Args:
        place_id: Identifiant Google Maps du lieu
        place_name: Nom du lieu pour le log
        
    Returns:
        URL de l'image en format data:image/jpeg;base64 ou URL statique
    """
    try:
        # Vérification du cache
        cache_collection = db.ScreenshotCache
        cache_key = place_id
        cached_screenshot = cache_collection.find_one({"place_id": cache_key})
        
        if cached_screenshot and cached_screenshot.get("screenshot_url"):
            logger.info(f"Utilisation du screenshot en cache pour {place_name}")
            return cached_screenshot.get("screenshot_url")
            
        # Construire l'URL Google Maps
        maps_url = f"https://www.google.com/maps/place/?q=place_id:{place_id}"
        
        # En mode test, on utilise une URL statique si spécifié
        if '--test' in sys.argv and not '--real-screenshots' in sys.argv:
            static_url = f"https://maps.googleapis.com/maps/api/staticmap?center=place_id:{place_id}&zoom=17&size=800x600&maptype=roadmap&markers=color:red%7Cplace_id:{place_id}&key={API_KEY}"
            
            try:
                # Télécharger l'image et la convertir en base64
                import base64 as b64_module  # Renommer l'import pour éviter la confusion
                response = requests.get(static_url, timeout=10)
                if response.status_code == 200:
                    image_base64 = b64_module.b64encode(response.content).decode('utf-8')
                    data_url = f"data:image/jpeg;base64,{image_base64}"
                    
                    # Mise en cache
                    cache_collection.update_one(
                        {"place_id": cache_key},
                        {"$set": {
                            "place_id": cache_key,
                            "screenshot_url": data_url,
                            "is_test_data": True,
                            "timestamp": datetime.now()
                        }},
                        upsert=True
                    )
                    
                    logger.info(f"Image statique convertie en base64 pour {place_name}")
                    return data_url
            except Exception as e:
                logger.error(f"Erreur lors de la conversion de l'image statique: {e}")
                return static_url
        
        # MÉTHODE DE BILLETREDUC: Utiliser Selenium pour naviguer et capturer l'écran
        from selenium import webdriver
        from selenium.webdriver.chrome.options import Options
        from selenium.webdriver.chrome.service import Service
        from selenium.webdriver.common.by import By
        from selenium.webdriver.support.ui import WebDriverWait
        from selenium.webdriver.support import expected_conditions as EC
        from webdriver_manager.chrome import ChromeDriverManager
        import time
        from PIL import Image
        import io
        import base64 as b64_module  # Correction de la référence base64
        
        # Options Chrome - EXACTEMENT comme dans billetreduc
        chrome_options = Options()
        chrome_options.add_argument("--headless=new")
        chrome_options.add_argument("--no-sandbox")
        chrome_options.add_argument("--disable-dev-shm-usage")
        chrome_options.add_argument("--disable-gpu")
        chrome_options.add_argument("--window-size=1280,800")
        
        # Ne pas ajouter trop d'options qui peuvent causer des problèmes
        chrome_options.add_argument("--lang=fr-FR")
        chrome_options.add_argument("--mute-audio")
        
        # Génération d'un ID unique pour ce screenshot
        screenshot_id = hashlib.md5(f"{place_id}_{place_name}".encode()).hexdigest()[:10]
        
        # Créer le répertoire des images s'il n'existe pas
        workspace_dir = os.path.dirname(os.path.abspath(__file__))
        image_dir = os.path.join(workspace_dir, "venue_images")
        os.makedirs(image_dir, exist_ok=True)
        
        # Chemins des fichiers
        screenshot_path = os.path.join(image_dir, f"maps_raw_{screenshot_id}.png")
        cropped_path = os.path.join(image_dir, f"maps_{screenshot_id}.jpg")
        
        # Initialisation du driver
        driver = webdriver.Chrome(service=Service(ChromeDriverManager().install()), options=chrome_options)
        
        try:
            # Définir un timeout plus long
            driver.set_page_load_timeout(30)
            
            logger.info(f"Navigation vers Google Maps pour {place_name}: {maps_url}")
            driver.get(maps_url)
            
            # Attendre que la page se charge (10 secondes max)
            time.sleep(2)
            
            # IMPORTANT: Gestion des cookies exactement comme billetreduc
            try:
                logger.info("Recherche et acceptation de la boîte de dialogue des cookies")
                
                # Méthode 1: Recherche par texte (plus fiable)
                cookie_buttons = driver.find_elements(By.XPATH, 
                    "//button[contains(., 'Tout accepter') or contains(., 'Accept all') or contains(., 'Accepter')]")
                if cookie_buttons:
                    for button in cookie_buttons:
                        try:
                            button.click()
                            logger.info("Cookies acceptés via bouton textuel")
                            time.sleep(1)
                            break
                        except:
                            pass
                
                # Méthode 2: Recherche par attributs (fallback)
                if not cookie_buttons:
                    cookie_buttons = driver.find_elements(By.CSS_SELECTOR, 
                        "button.VfPpkd-LgbsSe, button.VfPpkd-LgbsSe-OWXEXe-k8QpJ")
                    if cookie_buttons:
                        for button in cookie_buttons:
                            try:
                                button.click()
                                logger.info("Cookies acceptés via bouton CSS")
                                time.sleep(1)
                                break
                            except:
                                pass
            except Exception as e:
                logger.warning(f"Impossible d'accepter les cookies: {e}")
            
            # Attendre que la carte se charge complètement
            time.sleep(5)
            
            # Capturer l'écran entier
            logger.info("Capture de l'écran complet")
            driver.save_screenshot(screenshot_path)
            logger.info(f"Screenshot brut capturé et sauvegardé: {screenshot_path}")
            
            # Ouvrir l'image pour la recadrer
            img = Image.open(screenshot_path)
            
            # Coordonnées du crop (à ajuster si nécessaire selon la mise en page de Google Maps)
            left = 30
            top = 70
            right = 330
            bottom = 230
            
            crop_box = (left, top, right, bottom)
            logger.info(f"Recadrage de l'image: {crop_box}")
            cropped_img = img.crop(crop_box)
            
            # Sauvegarder l'image recadrée
            cropped_img.save(cropped_path, format="JPEG", quality=90)
            logger.info(f"Image recadrée sauvegardée: {cropped_path}")
            
            # Convertir l'image en base64 pour l'application web
            buffer = io.BytesIO()
            cropped_img.save(buffer, format="JPEG", quality=90)
            buffer.seek(0)
            img_base64 = b64_module.b64encode(buffer.read()).decode()
            data_url = f"data:image/jpeg;base64,{img_base64}"
            
            # Mise en cache
            cache_collection.update_one(
                {"place_id": cache_key},
                {"$set": {
                    "place_id": cache_key,
                    "screenshot_url": data_url,
                    "local_path": cropped_path,
                    "timestamp": datetime.now()
                }},
                upsert=True
            )
            
            logger.info(f"Screenshot converti en base64 pour {place_name}")
            return data_url
            
        except Exception as e:
            logger.error(f"Erreur lors de la capture d'écran pour {place_name}: {e}")
            
            # Fallback vers l'URL statique en cas d'erreur
            static_url = f"https://maps.googleapis.com/maps/api/staticmap?center=place_id:{place_id}&zoom=17&size=800x600&maptype=roadmap&markers=color:red%7Cplace_id:{place_id}&key={API_KEY}"
            
            # Mise en cache de l'URL statique
            cache_collection.update_one(
                {"place_id": cache_key},
                {"$set": {
                    "place_id": cache_key,
                    "screenshot_url": static_url,
                    "error": str(e),
                    "timestamp": datetime.now()
                }},
                upsert=True
            )
            
            return static_url
            
        finally:
            # Fermer le navigateur
            driver.quit()
            
            # Supprimer le screenshot brut pour économiser de l'espace (facultatif)
            try:
                if os.path.exists(screenshot_path):
                    os.remove(screenshot_path)
            except:
                pass
    
    except Exception as e:
        logger.error(f"Erreur générale lors de la génération du screenshot pour {place_name}: {e}")
        # Fallback vers URL statique en cas d'erreur
        return f"https://maps.googleapis.com/maps/api/staticmap?center=place_id:{place_id}&zoom=17&size=800x600&maptype=roadmap&markers=color:red%7Cplace_id:{place_id}&key={API_KEY}"

def scrape_place_details(place_id, name, city="Paris"):
    """
    Récupère et structure les détails d'un établissement de beauté/bien-être.
    
    Args:
        place_id: ID Google Maps de l'établissement
        name: Nom de l'établissement
        city: Ville de l'établissement
    
    Returns:
        dict: Détails structurés de l'établissement
    """
    logger.info(f"Récupération des détails pour {name} (ID: {place_id})")
    
    # Vérifier le cache MongoDB, même en mode test
    is_test_mode = '--test' in sys.argv
    cache_collection = db.PlaceDetailsCache
    
    # Toujours vérifier le cache, même en mode test
    cached_data = cache_collection.find_one({"place_id": place_id})
    if cached_data and (datetime.now() - cached_data["timestamp"]).days < 7:
        logger.info(f"Utilisation des détails en cache pour {place_id}")
        return cached_data["details"]
    
    # Récupérer les détails de base via Google Maps
    place_details = extract_place_details(place_id)
    if not place_details:
        logger.error(f"Impossible de récupérer les détails pour {name}")
        return None
    
    # Déterminer la catégorie et sous-catégorie
    category = "Soins esthétiques et bien-être"
    sous_categorie = determiner_sous_categorie(name, category)
    
    # Obtenir les critères d'évaluation pour cette catégorie
    criteres = CATEGORIES[category]["criteres_evaluation"]
    
    # Structure simplifiée
    structured_data = {
        "place_id": place_id,
        "name": name,
        "category": category,
        "sous_categorie": sous_categorie,
        "address": place_details.get("formatted_address", ""),
        "full_address": place_details.get("formatted_address", ""),
        "gps_coordinates": place_details.get("geometry", {}).get("location", {}),
        "rating": place_details.get("rating"),
        "user_ratings_total": place_details.get("user_ratings_total"),
        "google_type": "massage_therapist",  # À adapter selon le type réel
        "website": place_details.get("website", ""),
        "phone": place_details.get("formatted_phone_number", ""),
        "comments": [],
        "comments_source": "",
        "photos": [],
        "notes": {critere: 0 for critere in criteres},
        "last_updated": datetime.now(),
        "creation_date": datetime.now()
    }
    
    # 1. Essayer d'abord Tripadvisor via Bing
    tripadvisor_comments = []
    tripadvisor_url = search_links_bing(name, city)
    
    if tripadvisor_url:
        logger.info(f"URL Tripadvisor trouvée pour {name}: {tripadvisor_url}")
        structured_data["tripadvisor_url"] = tripadvisor_url
        
        # Récupérer les commentaires Tripadvisor
        tripadvisor_comments = get_full_tripadvisor_comments(tripadvisor_url, max_pages=3)
        
        if tripadvisor_comments and len(tripadvisor_comments) > 0:
            logger.info(f"Récupéré {len(tripadvisor_comments)} commentaires Tripadvisor pour {name}")
            structured_data["comments"] = tripadvisor_comments
            structured_data["comments_source"] = "Tripadvisor"
        else:
            logger.warning(f"Aucun commentaire Tripadvisor récupéré pour {name}, utilisation de Google Maps")
    else:
        logger.info(f"Aucune URL Tripadvisor trouvée pour {name}, utilisation de Google Maps")
    
    # 2. Si pas de commentaires Tripadvisor, utiliser Google Maps
    if not tripadvisor_comments:
        logger.info(f"Extraction des commentaires Google Maps pour {name}")
        google_comments = extract_google_maps_reviews(place_id)
        
        if google_comments and len(google_comments) > 0:
            logger.info(f"Récupéré {len(google_comments)} commentaires Google Maps pour {name}")
            structured_data["comments"] = google_comments
            structured_data["comments_source"] = "Google Maps"
            
            # En mode test, limiter à 5 commentaires maximum
            if is_test_mode and len(google_comments) > 5:
                structured_data["comments"] = google_comments[:5]
                logger.info(f"Mode TEST: Limité à 5 commentaires Google Maps")
        else:
            logger.warning(f"Aucun commentaire trouvé pour {name} - ni sur Tripadvisor ni sur Google Maps")
    
    # Ajouter les photos Google Maps
    google_photos = extract_photos(place_details)
    for photo in google_photos:
        structured_data["photos"].append(photo["url"])
    
    # Ajouter le screenshot Google Maps
    screenshot_url = extract_place_screenshot(place_id, name)
    if screenshot_url:
        structured_data["photos"].append(screenshot_url)
        structured_data["profile_photo"] = screenshot_url
    
    # Calculer le score moyen
    notes = [note for note in structured_data["notes"].values() if note > 0]
    if notes:
        structured_data["average_score"] = round(sum(notes) / len(notes), 1)
    else:
        structured_data["average_score"] = 0
    
    # Mise en cache des données (sauf en mode test)
    if not is_test_mode:
        cache_collection.update_one(
            {"place_id": place_id},
            {"$set": {
                "place_id": place_id,
                "details": structured_data,
                "timestamp": datetime.now()
            }},
            upsert=True
        )
    
    return structured_data

def process_place(place):
    """Traitement complet d'un lieu: collecte et analyse des avis, sauvegarde."""
    place_id = place["place_id"]
    place_name = place["name"]
    
    logger.info(f"Début du traitement de {place_name} (ID: {place_id})")
    
    # Récupérer les détails et commentaires (Tripadvisor ou Google Maps)
    enriched_place = scrape_place_details(place_id, place_name)
    
    # Si aucun commentaire n'a été trouvé, ignorer ce lieu
    if not enriched_place:
        logger.warning(f"Lieu {place_name} ignoré car aucun commentaire trouvé")
        return None
    
    # Récupérer les commentaires pour analyse
    comments = enriched_place.get("comments", [])
    comments_source = enriched_place.get("comments_source", "Google Maps")
    
    logger.info(f"Analyse des {len(comments)} commentaires de {comments_source} pour {place_name}")
    
    # Préparer les commentaires au format attendu par analyze_reviews_with_mistral
    formatted_reviews = []
    for i, comment in enumerate(comments):
        # Vérifier si le commentaire est une chaîne ou un dictionnaire
        if isinstance(comment, str):
            formatted_reviews.append({
                "source": comments_source,
                "author_name": f"Utilisateur {i+1}",
                "text": comment,
                "sentiment": "Non analysé",
                "sentiment_score": 0,
                "rating": 0,
                "time": 0
            })
        else:
            # Si c'est déjà un dictionnaire, l'utiliser tel quel
            formatted_reviews.append({
                "source": comments_source,
                "author_name": comment.get("author_name", f"Utilisateur {i+1}"),
                "text": comment.get("text", ""),
                "sentiment": comment.get("sentiment", "Non analysé"),
                "sentiment_score": comment.get("sentiment_score", 0),
                "rating": comment.get("rating", 0),
                "time": comment.get("time", 0)
            })
    
    # En mode test, forcer l'utilisation de l'analyse de secours pour éviter les erreurs Mistral
    is_test_mode = '--test' in sys.argv
    
    # Analyser les commentaires
    if formatted_reviews:
        category_name = place["category"] 
        criteria = CATEGORIES[category_name]["criteres_evaluation"]
        
        try:
            # En mode test, on peut utiliser directement le fallback pour être sûr
            if is_test_mode and not '--force-analysis' in sys.argv:
                logger.info(f"Mode TEST: Utilisation de l'analyse simplifiée pour {place_name}")
                mistral_analysis = simple_analysis_fallback(formatted_reviews, criteria)
            else:
                # Sinon, on essaie d'abord avec Mistral-7B-Instruct-v0.3
                logger.info(f"Analyse avec Mistral-7B-Instruct-v0.3 pour {place_name} (catégorie: {category_name})")
                mistral_analysis = analyze_reviews_with_mistral(formatted_reviews, category_name)
            
            # Ajouter l'analyse aux données du lieu
            enriched_place["mistral_analysis"] = mistral_analysis
            
            # Calculer un score global basé sur l'analyse
            if "analyse" in mistral_analysis:
                criteria_scores = [data.get("note", 0) for criterion, data in mistral_analysis["analyse"].items() if data.get("note")]
                if criteria_scores:
                    enriched_place["average_score"] = round(sum(criteria_scores) / len(criteria_scores), 1)
                    logger.info(f"Score moyen calculé pour {place_name}: {enriched_place['average_score']}")
                else:
                    # Garantir qu'il y a toujours un score moyen
                    enriched_place["average_score"] = 2.5
                    logger.info(f"Aucun score trouvé, score par défaut (2.5) attribué à {place_name}")
            else:
                # Fallback en cas d'absence de la clé analyse
                enriched_place["average_score"] = 2.5
                logger.info(f"Structure d'analyse incorrecte, score par défaut (2.5) attribué à {place_name}")
            
            # Enregistrer la note dans les données pour correspondre au format attendu
            if "analyse" in mistral_analysis and mistral_analysis["analyse"]:
                enriched_place["notes"] = {
                    critere: data.get("note", 0) 
                    for critere, data in mistral_analysis["analyse"].items()
                }
            else:
                # Créer des notes par défaut
                enriched_place["notes"] = {critere: 2 for critere in criteria}
            
            # Sauvegarder l'entrée complète dans MongoDB (avec l'analyse)
            logger.info(f"Sauvegarde dans MongoDB pour {place_name} avec score {enriched_place['average_score']}")
            save_success = save_to_mongo(enriched_place)
            
            if save_success:
                logger.info(f"Analyse terminée et sauvegardée pour {place_name}")
            else:
                logger.error(f"ÉCHEC DE SAUVEGARDE MongoDB pour {place_name}")
                
        except Exception as e:
            logger.error(f"Erreur lors de l'analyse pour {place_name}: {e}")
            
            # Analyse de secours en cas d'erreur
            fallback_analysis = simple_analysis_fallback(formatted_reviews, criteria)
            enriched_place["mistral_analysis"] = fallback_analysis
            
            # Scores par défaut
            enriched_place["average_score"] = 2.0
            enriched_place["notes"] = {critere: 2 for critere in criteria}
            
            # Ajouter l'erreur aux données et sauvegarder quand même
            enriched_place["analysis_error"] = str(e)
            enriched_place["analysis_date"] = datetime.now()
            
            # Tentative de sauvegarde avec logs détaillés
            logger.info(f"Tentative de sauvegarde malgré erreur pour {place_name}")
            save_success = save_to_mongo(enriched_place)
            
            if save_success:
                logger.info(f"Données de base sauvegardées pour {place_name} malgré l'erreur d'analyse")
            else:
                logger.error(f"ÉCHEC DE SAUVEGARDE MongoDB pour {place_name}")
    else:
        logger.warning(f"Aucun commentaire formaté pour {place_name}, sauvegarde basique")
        # Créer une analyse de base pour sauvegarder quand même
        criteria = CATEGORIES[place["category"]]["criteres_evaluation"]
        enriched_place["mistral_analysis"] = {
            "analyse": {critere: {"note": 2} for critere in criteria},
            "sentiment_general": "neutre",
            "resume": "Aucun commentaire à analyser"
        }
        enriched_place["average_score"] = 2.0
        enriched_place["notes"] = {critere: 2 for critere in criteria}
        
        # Sauvegarder malgré l'absence de commentaires
        save_success = save_to_mongo(enriched_place)
        
        if save_success:
            logger.info(f"Données basiques sauvegardées pour {place_name} sans commentaires")
        else:
            logger.error(f"ÉCHEC DE SAUVEGARDE MongoDB pour {place_name}")
    
    return enriched_place

def analyze_reviews_with_mistral(reviews, category):
    """Analyse les reviews avec Mistral-7B-Instruct-v0.3 en fonction de la catégorie"""
    try:
        # Vider le cache de Mistral avant chaque analyse
        clear_mistral_cache()
        
        # Construire le prompt pour l'analyse optimisé pour Mistral v0.3
        prompt = f"""Analyse les reviews suivantes pour un établissement de type {category} :
        
        Reviews à analyser :
        {reviews}
        
        Donne uniquement une note sur 5 pour chaque aspect mentionné dans les reviews.
        Ne génère pas de texte explicatif, uniquement les notes.
        """
        
        # Générer la réponse avec Mistral avec paramètres optimisés pour v0.3
        response = generate_ai_response_mistral(prompt, max_tokens=100, temperature=0.3, top_p=0.95)
        
        if not response:
            logger.error("Erreur lors de l'analyse des reviews")
            return None
        
        # Nettoyer et parser la réponse
        try:
            # Extraire les notes de la réponse
            notes = {}
            for line in response.split('\n'):
                if ':' in line:
                    aspect, note = line.split(':', 1)
                    aspect = aspect.strip().lower()
                    try:
                        note = float(note.strip())
                        if 0 <= note <= 5:
                            notes[aspect] = note
                    except ValueError:
                        continue
            
            return {"analyse": {aspect: {"note": note} for aspect, note in notes.items()},
                    "sentiment_general": "positif" if sum(notes.values())/len(notes) > 3 else "mitigé",
                    "resume": f"Analyse basée sur les reviews fournies."}
            
        except Exception as e:
            logger.error(f"Erreur lors du parsing de la réponse: {e}")
            return None
            
    except Exception as e:
        logger.error(f"Erreur lors de l'analyse des reviews: {e}")
        return None

def simple_analysis_fallback(reviews, criteria):
    """
    Analyse de secours simplifiée qui retourne uniquement les notes
    """
    results = {"analyse": {}}
    
    # Initialiser tous les critères avec une note de base
    for criterion in criteria:
        results["analyse"][criterion] = {"note": 0}
    
    # Analyse simple basée sur le sentiment général
    positive_count = 0
    negative_count = 0
    
    for review in reviews:
        sentiment_score = review.get("sentiment_score", 0)
        if sentiment_score > 0.05:
            positive_count += 1
        elif sentiment_score < -0.05:
            negative_count += 1
    
    # Déterminer le sentiment général
    sentiment_general = "mitigé"
    if len(reviews) > 0:
        if positive_count > len(reviews) * 0.6:
            sentiment_general = "positif"
            # Attribuer des notes meilleures aux critères si sentiment positif
            for criterion in criteria:
                results["analyse"][criterion]["note"] = 3
        elif negative_count > len(reviews) * 0.6:
            sentiment_general = "négatif"
            # Attribuer des notes faibles aux critères si sentiment négatif
            for criterion in criteria:
                results["analyse"][criterion]["note"] = 2
        else:
            # Notes moyennes pour sentiment mitigé
            for criterion in criteria:
                results["analyse"][criterion]["note"] = 2
    
    results["sentiment_general"] = sentiment_general
    results["resume"] = f"Analyse simplifiée basée sur {len(reviews)} avis."
    
    return results

def save_to_mongo(place):
    """
    Sauvegarde les lieux et leurs analyses dans MongoDB 
    avec une structure compatible avec billetreduc_shotgun_mistral.py
    
    Args:
        place: Dictionnaire avec les données du lieu
        
    Returns:
        bool: True si sauvegarde réussie, False sinon
    """
    # Vérifier si on est en mode test (pour log spécifique)
    is_test_mode = '--test' in sys.argv
    
    # Vérifier les champs requis
    if "place_id" not in place:
        logger.error("Impossible de sauvegarder sans place_id")
        return False
        
    place_id = place.get("place_id")
    place_name = place.get("name", "Établissement inconnu")
    
    # Vérifier la connexion à MongoDB
    try:
        # Ping pour vérifier la connexion
        client.admin.command('ping')
        logger.debug(f"Connexion MongoDB OK pour {place_name}")
    except Exception as e:
        logger.error(f"Erreur de connexion à MongoDB: {e}")
        return False
    
    try:
        # Structure de données compatible avec billetreduc_shotgun_mistral.py
        structured_data = {
            # Informations de base
            "place_id": place_id,
            "name": place.get("name", ""),
            "category": place.get("category", ""),
            "sous_categorie": place.get("sous_categorie", ""),
            "address": place.get("address", ""),
            "full_address": place.get("full_address", place.get("address", "")),
            "gps_coordinates": place.get("gps_coordinates", {}),
            "rating": place.get("rating"),
            "user_ratings_total": place.get("user_ratings_total"),
            "google_type": place.get("google_type", ""),
            
            # Sources des données
            "tripadvisor_url": place.get("tripadvisor_url", ""),
            "comments_source": place.get("comments_source", ""),
            
            # Coordonnées pour l'affichage sur la carte
            "location": {
                "type": "Point",
                "coordinates": [
                    place.get("gps_coordinates", {}).get("lng", 2.3522),  # Longitude (Paris par défaut)
                    place.get("gps_coordinates", {}).get("lat", 48.8566)  # Latitude (Paris par défaut)
                ]
            },
            
            # Informations de contact
            "website": place.get("website", ""),
            "phone": place.get("phone", ""),
            
            # Commentaires
            "comments": place.get("comments", []),
            
            # Images
            "photos": [],  # Sera rempli ci-dessous
            
            # Image du profil (screenshot principal)
            "profile_photo": place.get("profile_photo", ""),
            
            # Notes selon critères (assurer la présence de cette clé)
            "notes": place.get("notes", {}),
            
            # Score moyen global
            "average_score": place.get("average_score", 2.5),
            
            # Analyse Mistral (pour être complet)
            "mistral_analysis": place.get("mistral_analysis", {}),
            
            # Métadonnées
            "last_updated": datetime.now(),
            "creation_date": place.get("creation_date", datetime.now())
        }
        
        # Log détaillé en mode test
        if is_test_mode:
            logger.info(f"Structure préparée pour MongoDB: {place_name} - {len(structured_data.get('comments', []))} commentaires, average_score: {structured_data.get('average_score')}")
        
        # Traitement des photos pour correspondre au format attendu
        photos = place.get("photos", [])
        for i, photo in enumerate(photos):
            if isinstance(photo, dict) and "url" in photo:
                photo_url = photo["url"]
            elif isinstance(photo, str):
                photo_url = photo
            else:
                continue
                
            # Ajouter la photo au format attendu
            photo_obj = {
                "url": photo_url,
                "source": "Google Maps"
            }
            
            # Marquer la première photo ou le screenshot comme image principale
            if i == 0 or (photo_url == place.get("profile_photo")):
                photo_obj["is_main_screenshot"] = True
                
            structured_data["photos"].append(photo_obj)
        
        # Assurer une image de profil est toujours présente
        if not structured_data["profile_photo"] and structured_data["photos"]:
            structured_data["profile_photo"] = structured_data["photos"][0]["url"]
        
        # En mode test, vérifier qu'on a bien l'average_score
        if is_test_mode and "average_score" not in structured_data:
            logger.warning(f"Score moyen manquant pour {place_name}, ajout d'un score par défaut")
            structured_data["average_score"] = 2.5
        
        # Mise à jour ou insertion dans la collection
        # D'abord vérifier si le document existe déjà
        existing = db.BeautyPlaces.find_one({"place_id": place_id})
        
        if existing:
            # Si le document existe, préserver la date de création
            structured_data["creation_date"] = existing.get("creation_date", datetime.now())
            
            # Préserver les notes existantes si aucune nouvelle note
            if not structured_data["notes"] and "notes" in existing:
                structured_data["notes"] = existing["notes"]
                
                # Recalculer le score moyen si nécessaire
                notes = [note for note in structured_data["notes"].values() if note > 0]
                if notes:
                    structured_data["average_score"] = round(sum(notes) / len(notes), 1)
            
            # Mise à jour
            result = db.BeautyPlaces.update_one(
                {"place_id": place_id}, 
                {"$set": structured_data}
            )
            
            if is_test_mode:
                logger.info(f"[TEST] Établissement mis à jour dans MongoDB: {place_name} (matched: {result.matched_count}, modified: {result.modified_count})")
            else:
                logger.info(f"Établissement mis à jour dans MongoDB: {place_name} (matched: {result.matched_count})")
        else:
            # Insertion nouvelle
            result = db.BeautyPlaces.insert_one(structured_data)
            if is_test_mode:
                logger.info(f"[TEST] Nouvel établissement ajouté dans MongoDB: {place_name} (id: {result.inserted_id})")
            else:
                logger.info(f"Nouvel établissement ajouté dans MongoDB: {place_name} (id: {result.inserted_id})")
        
        # Vérification après sauvegarde
        saved_document = db.BeautyPlaces.find_one({"place_id": place_id})
        if saved_document:
            if is_test_mode:
                logger.info(f"[TEST] Vérification : établissement {place_name} correctement sauvegardé avec {len(saved_document.get('comments', []))} commentaires et {len(saved_document.get('photos', []))} photos, score moyen: {saved_document.get('average_score')}")
            else:
                logger.info(f"Vérification : établissement {place_name} correctement sauvegardé avec {len(saved_document.get('comments', []))} commentaires et {len(saved_document.get('photos', []))} photos")
                
            # En mode test, vérifier également que les notes sont bien là
            if is_test_mode:
                notes = saved_document.get("notes", {})
                logger.info(f"[TEST] Vérification notes: {len(notes)} critères évalués pour {place_name}")
        else:
            logger.error(f"Échec de vérification après sauvegarde pour {place_name} - Document non trouvé!")
            return False
        
        return True
    except Exception as e:
        logger.error(f"Erreur lors de la sauvegarde dans MongoDB pour {place_name}: {str(e)}")
        
        # En mode test, afficher une trace plus détaillée
        if is_test_mode:
            import traceback
            logger.error(f"[TEST] Trace d'erreur détaillée: {traceback.format_exc()}")
        
        return False

def process_zone(lat, lng):
    """Scrape les lieux pour une zone donnée et stocke en base de données."""
    for category_name, category_data in CATEGORIES.items():
        google_types = category_data["google_types"]
        
        logger.info(f"Recherche des établissements de catégorie '{category_name}' à {lat},{lng}")
        places = get_places_by_category(category_name, google_types, lat, lng)
        
        for place in places:
            # Vérifier si déjà traité récemment
            existing = db.BeautyPlaces.find_one({"place_id": place["place_id"]})
            if existing and (datetime.now() - existing.get("last_updated", datetime(2000, 1, 1))).days < 30:
                logger.info(f"Établissement {place['name']} déjà traité récemment, ignoré")
                continue
                
            logger.info(f"Traitement de: {place['name']} ({place['sous_categorie']})")
            process_place(place)
            
            # Pause pour éviter les limitations d'API
            time.sleep(2)

def scrape_all_zones():
    """Divise Paris en zones et lance le scraping."""
    lat_min, lat_max = 48.8156, 48.9022
    lng_min, lng_max = 2.2242, 2.4699
    step = 0.01  # Espacement de la grille (env. 1 km)
    
    lat_points = [lat_min + i * step for i in range(int((lat_max - lat_min) / step) + 1)]
    lng_points = [lng_min + i * step for i in range(int((lng_max - lng_min) / step) + 1)]
    
    total_zones = len(lat_points) * len(lng_points)
    logger.info(f"Scraping complet planifié sur {total_zones} zones au total")
    
    # Vérifier le dernier point traité
    checkpoint = db.Checkpoints.find_one({"name": "wellness_scraping"})
    start_idx = 0
    total_places_processed = 0
    
    if checkpoint:
        start_idx = checkpoint.get("zone_index", 0)
        total_places_processed = checkpoint.get("total_places_processed", 0)
        logger.info(f"Reprise du scraping à partir de la zone {start_idx+1}/{total_zones}")
        logger.info(f"Places déjà traitées: {total_places_processed}")
    else:
        # Initialiser le checkpoint au démarrage
        db.Checkpoints.insert_one({
            "name": "wellness_scraping",
            "zone_index": 0,
            "total_places_processed": 0,
            "start_time": datetime.now(),
            "last_updated": datetime.now()
        })
        logger.info("Nouveau checkpoint initialisé pour le scraping")
    
    # Compteurs pour les statistiques
    zone_count = 0
    places_this_session = 0
    session_start_time = datetime.now()
    
    zone_index = 0
    for lat_idx, lat in enumerate(lat_points):
        for lng_idx, lng in enumerate(lng_points):
            # Calculer l'index actuel de la zone
            current_idx = lat_idx * len(lng_points) + lng_idx
            
            if current_idx < start_idx:
                continue
            
            zone_count += 1
            start_zone_time = datetime.now()
            logger.info(f"Traitement de la zone {current_idx+1}/{total_zones} à {lat},{lng}")
            
            # Nombre de lieux dans cette zone
            places_count_before = db.BeautyPlaces.count_documents({})
            
            # Traiter la zone
            process_zone(lat, lng)
            
            # Compter combien de nouveaux lieux ont été ajoutés
            places_count_after = db.BeautyPlaces.count_documents({})
            places_added = places_count_after - places_count_before
            places_this_session += places_added
            total_places_processed += places_added
            
            # Calculer le temps pour cette zone
            zone_duration = (datetime.now() - start_zone_time).total_seconds()
            
            # Mettre à jour le checkpoint avec des statistiques détaillées
            db.Checkpoints.update_one(
                {"name": "wellness_scraping"},
                {"$set": {
                    "zone_index": current_idx,
                    "last_lat": lat,
                    "last_lng": lng,
                    "last_updated": datetime.now(),
                    "total_places_processed": total_places_processed,
                    "places_this_session": places_this_session,
                    "zones_processed_this_session": zone_count,
                    "last_zone_duration_seconds": zone_duration,
                    "session_start_time": session_start_time
                }},
                upsert=True
            )
            
            # Log détaillé après chaque zone
            logger.info(f"Zone {current_idx+1}/{total_zones} terminée en {zone_duration:.1f} secondes")
            logger.info(f"Lieux trouvés dans cette zone: {places_added}")
            logger.info(f"Total des lieux traités: {total_places_processed}")
            
            # Estimer le temps restant
            if zone_count > 0:
                avg_time_per_zone = (datetime.now() - session_start_time).total_seconds() / zone_count
                zones_remaining = total_zones - current_idx - 1
                est_time_remaining = zones_remaining * avg_time_per_zone
                est_completion_time = datetime.now() + timedelta(seconds=est_time_remaining)
                
                logger.info(f"Temps moyen par zone: {avg_time_per_zone:.1f} secondes")
                logger.info(f"Temps restant estimé: {est_time_remaining/3600:.1f} heures")
                logger.info(f"Date de fin estimée: {est_completion_time.strftime('%Y-%m-%d %H:%M:%S')}")
    
    # Marquer comme terminé
    db.Checkpoints.update_one(
        {"name": "wellness_scraping"},
        {"$set": {
            "status": "completed",
            "completion_time": datetime.now(),
            "total_places_processed": total_places_processed
        }},
        upsert=True
    )
    
    logger.info(f"Scraping terminé! {total_places_processed} lieux au total ont été traités.")
    return total_places_processed

def test_small_zone():
    """Fonction de test qui scrape une petite zone pour obtenir environ 30 lieux."""
    # Zone de test: petit secteur autour de Paris (quartier touristique)
    # Cette zone est susceptible d'avoir plusieurs établissements de beauté
    lat, lng = 48.8566, 2.3552  # Coordonnées de Paris centre
    radius = 100  # Rayon de 100m (petit rayon)

    logger.info(f"Démarrage du test sur une petite zone autour de {lat},{lng} avec rayon {radius}m")
    
    # Collecter tous les lieux pour toutes les catégories
    all_places = []
    for category_name, category_data in CATEGORIES.items():
        google_types = category_data["google_types"]
        
        logger.info(f"Recherche des établissements de catégorie '{category_name}' à {lat},{lng}")
        places = get_places_by_category(category_name, google_types, lat, lng, radius)
        all_places.extend(places)
        
        logger.info(f"Trouvé {len(places)} établissements pour la catégorie {category_name}")
    
    # Limiter à ~30 lieux pour le test
    places_to_process = all_places[:min(30, len(all_places))]
    logger.info(f"Test sur {len(places_to_process)} établissements")
    
    # Traiter chaque lieu
    processed_places = []
    for i, place in enumerate(places_to_process):
        logger.info(f"[{i+1}/{len(places_to_process)}] Traitement de: {place['name']} ({place['category']} - {place['sous_categorie']})")
        processed_place = process_place(place)
        if processed_place:
            processed_places.append(processed_place)
        time.sleep(2)  # Pause pour éviter les limitations d'API
    
    logger.info(f"Test terminé! {len(processed_places)}/{len(places_to_process)} lieux traités avec succès.")
    
    # Générer des insights sur les données collectées
    insights = generate_insights()
    logger.info(f"Insights générés: {len(insights['general']['categories'])} catégories analysées")
    
    return processed_places

def generate_insights():
    """Génère des insights sur les données collectées."""
    pipeline = [
        {
            "$group": {
                "_id": "$category",
                "count": {"$sum": 1},
                "avg_score": {"$avg": "$average_score"},
                "places": {"$push": {"name": "$name", "sous_categorie": "$sous_categorie", "score": "$average_score"}}
            }
        }
    ]
    
    results = list(db.BeautyPlaces.aggregate(pipeline))
    
    insights = {
        "general": {
            "total_places": sum(r["count"] for r in results),
            "categories": {}
        }
    }
    
    for result in results:
        category = result["_id"]
        insights["general"]["categories"][category] = {
            "count": result["count"],
            "avg_score": round(result["avg_score"], 2) if result["avg_score"] else None,
            "top_places": sorted([p for p in result["places"] if p["score"]], key=lambda x: x["score"], reverse=True)[:5]
        }
    
    # Sauvegarder les insights
    db.Insights.update_one(
        {"name": "general_insights"},
        {"$set": {
            "data": insights,
            "timestamp": datetime.now()
        }},
        upsert=True
    )
    
    logger.info("Insights générés et sauvegardés")
    return insights

def get_full_tripadvisor_comments(url, max_pages=3):
    """Récupère les commentaires de Tripadvisor sur plusieurs pages."""
    try:
        comments = []
        current_page = 1
        current_url = url
        
        while current_page <= max_pages:
            logger.info(f"Récupération des commentaires Tripadvisor page {current_page} pour {url}")
            
            try:
                # Bloc try pour la requête de la page
                headers = {
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
                }
                
                response = requests.get(current_url, headers=headers, timeout=10)
                response.raise_for_status() # Lève une exception si code d'erreur HTTP
                
                soup = BeautifulSoup(response.text, 'html.parser')
                review_elements = soup.find_all("div", class_="review-container")
                
                page_comments_found = False
                for review in review_elements:
                    text_elem = review.find("p", class_="partial_entry")
                    if text_elem and text_elem.text.strip():
                        comments.append(text_elem.text.strip())
                        page_comments_found = True
                
                if not page_comments_found:
                     logger.debug(f"Aucun commentaire trouvé sur la page {current_page} avec le sélecteur principal.")

                # Chercher la page suivante
                next_page = soup.find("a", class_="nav next")
                if next_page and current_page < max_pages:
                    next_url = next_page.get("href")
                    if next_url:
                        if not next_url.startswith("http"):
                            base_url = "/".join(url.split("/")[:3])
                            next_url = base_url + next_url
                        current_url = next_url
                        current_page += 1
                        time.sleep(1) # Petite pause
                    else:
                        logger.info("Plus d'URL suivante trouvée.")
                        break
                else:
                    logger.info("Plus de page suivante ou limite atteinte.")
                    break
                    
            except requests.exceptions.RequestException as req_err:
                logger.error(f"Erreur de requête lors de la récupération de la page {current_page}: {req_err}")
                break # Sortir de la boucle while si une page échoue
            except Exception as page_err:
                logger.error(f"Erreur lors du traitement de la page {current_page}: {page_err}")
                break # Sortir de la boucle while
        
        logger.info(f"Total de {len(comments)} commentaires récupérés pour {url}")
        return comments
        
    except Exception as e:
        logger.error(f"Erreur générale lors de la récupération des commentaires Tripadvisor: {e}")
        return []

def clean_cache():
    """
    Nettoie radicalement tous les caches Mistral pour éviter les problèmes de réponses incorrectes.
    Supprime également tous les fichiers problématiques mentionnant des plats ou contenant du cyrillique.
    """
    try:
        import glob
        import shutil
        import json
        import re
        
        logger.info("Nettoyage complet des caches Mistral...")
        
        # 1. Supprimer complètement les caches de Mistral 
        mistral_cache_dir = os.path.join(CACHE_DIR, "mistral_responses")
        if os.path.exists(mistral_cache_dir):
            logger.info(f"Suppression du répertoire de cache Mistral: {mistral_cache_dir}")
            shutil.rmtree(mistral_cache_dir, ignore_errors=True)
            os.makedirs(mistral_cache_dir, exist_ok=True)
            
        # 2. Rechercher et supprimer tous les fichiers de cache contenant des références à des plats
        problematic_patterns = [
            "*plat*.json", "*entrée*.json", "*dessert*.json", "*repas*.json", 
            "*restaurant*.json", "*meal*.json", "*food*.json", "*dish*.json",
            "*cuisin*.json", "*chef*.json", "*dîner*.json", "*déjeuner*.json",
            "*manger*.json", "*goût*.json", "*saveur*.json"
        ]
        
        # Chercher dans tout le répertoire de cache
        files_to_delete = []
        cache_root = os.path.dirname(CACHE_DIR)
        
        # Premier passage: recherche par nom de fichier
        for pattern in problematic_patterns:
            pattern_path = os.path.join(cache_root, "**", pattern)
            matches = glob.glob(pattern_path, recursive=True)
            files_to_delete.extend(matches)
        
        # Deuxième passage: vérification du contenu (plus lent mais plus sûr)
        all_json_files = glob.glob(os.path.join(cache_root, "**", "*.json"), recursive=True)
        checked_files = 0
        found_problematic = 0
        
        for json_file in all_json_files:
            # Ne pas revérifier les fichiers déjà marqués pour suppression
            if json_file in files_to_delete:
                continue
                
            try:
                checked_files += 1
                with open(json_file, 'r', encoding='utf-8', errors='ignore') as f:
                    content = f.read()
                    
                    # 1. Vérifier présence de cyrillique
                    if re.search(r'[\u0400-\u04FF]', content):
                        files_to_delete.append(json_file)
                        found_problematic += 1
                        continue
                        
                    # 2. Vérifier présence des termes problématiques
                    food_terms = ["plat", "entrée", "dessert", "restaurant", "menu", "cuisine", 
                                  "nourriture", "repas", "gastronomie", "cuisinier", "chef", 
                                  "manger", "goût", "saveur", "déjeuner", "dîner"]
                    
                    if any(term in content.lower() for term in food_terms):
                        files_to_delete.append(json_file)
                        found_problematic += 1
                        continue
                        
                    # 3. Vérifier si le fichier contient du JSON valide avec références à des plats
                    try:
                        data = json.loads(content)
                        response = ""
                        
                        # Chercher dans différentes structures possibles
                        if isinstance(data, dict):
                            if "response" in data:
                                response = data["response"]
                            elif "content" in data:
                                response = data["content"]
                                
                        if response and any(term in response.lower() for term in food_terms):
                            files_to_delete.append(json_file)
                            found_problematic += 1
                    except:
                        # Si le JSON n'est pas valide, on l'ignore
                        pass
                        
            except Exception as e:
                # Si erreur de lecture, on supprime par précaution
                files_to_delete.append(json_file)
                logger.warning(f"Erreur lors de la vérification de {json_file}: {e}")
        
        # Log des statistiques
        if checked_files > 0:
            logger.info(f"Vérification approfondie: {checked_files} fichiers analysés, {found_problematic} problématiques détectés")
            
        # Supprimer tous les fichiers problématiques
        if files_to_delete:
            logger.info(f"Suppression de {len(files_to_delete)} fichiers de cache potentiellement problématiques")
            for file_path in files_to_delete:
                try:
                    os.remove(file_path)
                    logger.debug(f"Supprimé: {file_path}")
                except Exception as e:
                    logger.error(f"Erreur lors de la suppression de {file_path}: {e}")
        
        # 3. Supprimer également les fichiers de cache Mistral dans le répertoire parent
        mistral_patterns = [
            os.path.join(os.path.dirname(CACHE_DIR), "**", "mistral*.json"),
            os.path.join(os.path.dirname(CACHE_DIR), "**", "*mistral*.pickle"),
            os.path.join(os.path.dirname(CACHE_DIR), "**", "*mistral*.pkl")
        ]
        
        for pattern in mistral_patterns:
            matches = glob.glob(pattern, recursive=True)
            if matches:
                logger.info(f"Suppression de {len(matches)} fichiers de cache Mistral additionnels")
                for file_path in matches:
                    try:
                        os.remove(file_path)
                    except Exception as e:
                        logger.error(f"Erreur lors de la suppression de {file_path}: {e}")
        
        logger.info("Nettoyage du cache terminé avec succès")
        
    except Exception as e:
        logger.error(f"Erreur lors du nettoyage du cache: {e}")
        logger.info("Poursuite du script malgré l'erreur de nettoyage")

def extract_screenshot_billetreduc_method(place_id, place_name):
    """
    Utilise EXACTEMENT la même méthode que billetreduc_shotgun_mistral.py pour
    capturer des screenshots. Cette fonction est appelée si l'option --billetreduc-screenshots est activée.
    
    Args:
        place_id: Identifiant Google Maps du lieu
        place_name: Nom du lieu pour le log
        
    Returns:
        URL de l'image en format data:image/jpeg;base64
    """
    try:
        # Vérification du cache
        cache_collection = db.ScreenshotCache
        cache_key = place_id
        cached_screenshot = cache_collection.find_one({"place_id": cache_key})
        
        if cached_screenshot and cached_screenshot.get("screenshot_url"):
            logger.info(f"Utilisation du screenshot en cache pour {place_name}")
            return cached_screenshot.get("screenshot_url")
        
        # Essayer d'utiliser directement la fonction de billetreduc_shotgun_mistral.py
        try:
            # Vérifier si la fonction est importée
            if 'get_venue_image_url' in globals():
                # Appel direct de la fonction (compatible billetreduc_shotgun_mistral.py)
                logger.info(f"MÉTHODE BILLETREDUC: Tentative de capture d'écran pour {place_name}")
                
                # Construire l'URL pour la capture
                maps_url = f"https://www.google.com/maps/place/?q=place_id:{place_id}"
                
                # Appel à la fonction de billetreduc avec l'URL construite
                screenshot_result = get_venue_image_url(place_name, maps_url)
                
                if screenshot_result:
                    logger.info(f"MÉTHODE BILLETREDUC: Capture d'écran réussie pour {place_name}")
                    
                    # Mise en cache
                    cache_collection.update_one(
                        {"place_id": cache_key},
                        {"$set": {
                            "place_id": cache_key,
                            "screenshot_url": screenshot_result,
                            "source": "billetreduc_method",
                            "timestamp": datetime.now()
                        }},
                        upsert=True
                    )
                    
                    return screenshot_result
                else:
                    logger.error(f"MÉTHODE BILLETREDUC: Échec de la capture d'écran pour {place_name}")
            else:
                logger.error("Fonction get_venue_image_url non disponible")
        except Exception as e:
            logger.error(f"Erreur lors de l'utilisation de la méthode billetreduc: {e}")
            
        # Si on arrive ici, la méthode billetreduc a échoué
        # Fallback vers la méthode normale
        logger.info(f"Fallback vers la méthode normale pour {place_name}")
        return extract_place_screenshot(place_id, place_name)
    
    except Exception as e:
        logger.error(f"Erreur générale lors de l'extraction de screenshot (méthode billetreduc) pour {place_name}: {e}")
        # Fallback vers URL statique
        return f"https://maps.googleapis.com/maps/api/staticmap?center=place_id:{place_id}&zoom=17&size=800x600&maptype=roadmap&markers=color:red%7Cplace_id:{place_id}&key={API_KEY}"


# Fonction d'aide pour décider quelle méthode de screenshot utiliser
def get_place_screenshot(place_id, place_name):
    """
    Récupère un screenshot en utilisant la méthode appropriée selon les options
    
    Args:
        place_id: Identifiant Google Maps du lieu
        place_name: Nom du lieu pour le log
        
    Returns:
        URL du screenshot
    """
    # Vérifier si l'option billetreduc est active
    if '--billetreduc-screenshots' in sys.argv:
        logger.info(f"Utilisation de la méthode billetreduc pour {place_name}")
        return extract_screenshot_billetreduc_method(place_id, place_name)
    else:
        # Méthode standard
        return extract_place_screenshot(place_id, place_name)

def screenshot_photo(driver, prefix, max_retries=2):
    """
    Capture la photo principale du lieu sur Google Maps
    
    Args:
        driver: WebDriver Selenium
        prefix: Préfixe pour le nom du fichier
        max_retries: Nombre maximum de tentatives
    
    Returns:
        Tuple (chemin de l'image, version base64, image PIL)
    """
    last_error = None
    for attempt in range(max_retries):
        try:
            if attempt > 0 and DEBUG_MODE:
                print(f"  ↳ Tentative {attempt + 1}/{max_retries} de capture photo")
            
            # Attendre que la page soit complètement chargée
            WebDriverWait(driver, 10).until(
                EC.presence_of_element_located((By.CLASS_NAME, "DUwDvf"))
            )
            
            # Prendre la capture d'écran
            screenshot = driver.get_screenshot_as_png()
            image = Image.open(BytesIO(screenshot))
            
            # Coordonnées du crop (à ajuster si nécessaire selon la mise en page de Google Maps)
            left = 30
            top = 70
            right = 330
            bottom = 230
            
            cropped = image.crop((left, top, right, bottom))
            
            # Vérifier que l'image n'est pas vide ou trop petite
            if cropped.size[0] < 100 or cropped.size[1] < 100:
                raise ValueError("Image trop petite, possible erreur de capture")
            
            path = f"{prefix}_photo.png"
            cropped.save(path)
            
            if DEBUG_MODE and attempt > 0:
                print(f"  ↳ Capture photo réussie après {attempt + 1} tentative(s)")
            
            return path, encode_image_base64(cropped), cropped
            
        except Exception as e:
            last_error = e
            if DEBUG_MODE:
                print(f"⚠️ Échec de capture photo (tentative {attempt + 1}): {e}")
            if attempt < max_retries - 1:
                time.sleep(2)  # Pause avant nouvelle tentative
                continue
    
    raise RuntimeError(f"Impossible de capturer la photo après {max_retries} tentatives") from last_error

def main():
    """Fonction principale pour l'exécution du script"""
    # Récupérer les arguments
    if args.place_id and args.place_name:
        logger.info(f"Mode test avec place_id: {args.place_id}, nom: {args.place_name}")
        # Construire un objet place factice
        place = {
            "place_id": args.place_id,
            "name": args.place_name,
            "category": "Soins esthétiques et bien-être",
            "sous_categorie": "Institut de beauté"
        }
        # Traiter ce lieu spécifique
        processed_place = process_place(place)
        if processed_place:
            logger.info(f"Traitement réussi pour {args.place_name}")
            return [processed_place]
        else:
            logger.error(f"Échec du traitement pour {args.place_name}")
            return []
    elif args.area:
        # Obtenir les coordonnées GPS de la zone
        from geopy.geocoders import Nominatim
        from geopy.exc import GeocoderTimedOut
        
        # Configurer geocoder avec un timeout plus long et activer le cache
        geolocator = Nominatim(user_agent="wellness_script", timeout=10)
        
        # Fonction avec retries pour la géolocalisation
        def geocode_with_retry(query, max_retries=3):
            for attempt in range(max_retries):
                try:
                    logger.info(f"Tentative de géolocalisation ({attempt+1}/{max_retries}) : {query}")
                    return geolocator.geocode(query)
                except GeocoderTimedOut:
                    logger.warning(f"Timeout lors de la géolocalisation (tentative {attempt+1}/{max_retries})")
                    if attempt < max_retries - 1:
                        time.sleep(2)  # Pause avant nouvelle tentative
                    else:
                        logger.error(f"Toutes les tentatives de géolocalisation ont échoué pour {query}")
                        return None
        
        # Essayer d'abord avec format exact
        location = geocode_with_retry(args.area)
        
        # Si échec, essayer avec un format alternatif
        if not location and "arrondissement" in args.area.lower():
            # Essayer format alternatif: "Paris 4e" au lieu de "Paris, 4ème arrondissement"
            alt_query = args.area.replace("ème arrondissement", "e").replace(", ", " ")
            logger.info(f"Tentative avec format alternatif: {alt_query}")
            location = geocode_with_retry(alt_query)
            
        # Dernier essai avec format très simplifié
        if not location:
            simple_query = args.area.split(",")[0].strip()
            if simple_query != args.area:
                logger.info(f"Tentative avec format simplifié: {simple_query}")
                location = geocode_with_retry(simple_query)
                
        if not location:
            logger.error(f"Zone introuvable: {args.area}")
            return []
        
        logger.info(f"Zone trouvée: {args.area} à {location.latitude}, {location.longitude}")
        
        # Déterminer les catégories à traiter
        categories_to_process = []
        if args.categories:
            category_names = args.categories.split(',')
            for name in category_names:
                if name.strip() in CATEGORIES:
                    categories_to_process.append(name.strip())
        else:
            # Utiliser toutes les catégories par défaut
            categories_to_process = list(CATEGORIES.keys())
        
        logger.info(f"Catégories à traiter: {categories_to_process}")
        
        # Collecter les lieux
        all_places = []
        for category_name in categories_to_process:
            google_types = CATEGORIES[category_name]["google_types"]
            places = get_places_by_category(category_name, google_types, location.latitude, location.longitude, args.radius)
            all_places.extend(places)
        
        # Limiter le nombre de lieux si nécessaire
        places_to_process = all_places[:min(args.limit, len(all_places))]
        logger.info(f"Traitement de {len(places_to_process)} établissements")
        
        # Traiter chaque lieu
        processed_places = []
        for place in places_to_process:
            logger.info(f"Traitement de: {place['name']}")
            processed_place = process_place(place)
            if processed_place:
                processed_places.append(processed_place)
        
        logger.info(f"Terminé! {len(processed_places)}/{len(places_to_process)} lieux traités.")
        return processed_places
    else:
        # Mode par défaut
        return test_small_zone()

def simulate_analysis(prompt):
    """Simule une analyse en mode test sans utiliser de modèle AI"""
    logger.info("Simulation d'analyse en mode TEST")
    
    # Extraire la catégorie du prompt
    category = ""
    if "établissement de type" in prompt:
        category = prompt.split("établissement de type")[1].split(":")[0].strip()
    
    # Générer des notes simulées variées basées sur l'empreinte du prompt pour éviter toujours le même score
    import hashlib
    import random
    
    # Générer un nombre entre 0 et 1 basé sur le hachage du prompt
    hash_value = hashlib.md5(prompt.encode()).hexdigest()
    random.seed(int(hash_value, 16) % 10000)  # Utiliser une partie du hash comme seed
    
    # Générer des notes aléatoires mais cohérentes pour le même prompt
    base_score = round(2.5 + random.random() * 2.5, 1)  # Entre 2.5 et 5.0
    
    if "Soins esthétiques" in category:
        return f"""
Qualité des soins: {round(base_score + random.uniform(-0.5, 0.5), 1)}
Propreté: {round(base_score + random.uniform(-0.5, 0.5), 1)}
Accueil: {round(base_score + random.uniform(-0.5, 0.5), 1)}
Rapport qualité/prix: {round(base_score + random.uniform(-0.5, 0.5), 1)}
Ambiance: {round(base_score + random.uniform(-0.5, 0.5), 1)}
Expertise du personnel: {round(base_score + random.uniform(-0.5, 0.5), 1)}
"""
    elif "Coiffure" in category:
        return f"""
Qualité de la coupe: {round(base_score + random.uniform(-0.5, 0.5), 1)}
Respect des attentes: {round(base_score + random.uniform(-0.5, 0.5), 1)}
Conseil: {round(base_score + random.uniform(-0.5, 0.5), 1)}
Produits utilisés: {round(base_score + random.uniform(-0.5, 0.5), 1)}
Tarifs: {round(base_score + random.uniform(-0.5, 0.5), 1)}
Ponctualité: {round(base_score + random.uniform(-0.5, 0.5), 1)}
"""
    else:
        return f"""
Précision: {round(base_score + random.uniform(-0.5, 0.5), 1)}
Hygiène: {round(base_score + random.uniform(-0.5, 0.5), 1)}
Créativité: {round(base_score + random.uniform(-0.5, 0.5), 1)}
Durabilité: {round(base_score + random.uniform(-0.5, 0.5), 1)}
Conseil: {round(base_score + random.uniform(-0.5, 0.5), 1)}
Douleur ressentie: {round(base_score + random.uniform(-0.5, 0.5), 1)}
"""

# Point d'entrée principal
if __name__ == "__main__":
    try:
        # Configuration des arguments de ligne de commande
        parser = argparse.ArgumentParser(description="Script de scraping pour les établissements de beauté et bien-être")
        parser.add_argument("--test", action="store_true", help="Mode test")
        parser.add_argument("--real-screenshots", action="store_true", help="Activer les screenshots réels")
        parser.add_argument("--billetreduc-screenshots", action="store_true", help="Activer les screenshots avec billetreduc")
        parser.add_argument("--force-analysis", action="store_true", help="Forcer l'analyse avec Mistral")
        parser.add_argument("--place-id", type=str, help="ID du lieu à scraper")
        parser.add_argument("--place-name", type=str, help="Nom du lieu à scraper")
        parser.add_argument("--area", type=str, help="Zone à analyser (ex: 'Paris, France')")
        parser.add_argument("--radius", type=int, default=1000, help="Rayon de recherche en mètres")
        parser.add_argument("--categories", type=str, help="Catégories à analyser, séparées par des virgules")
        parser.add_argument("--limit", type=int, default=5, help="Nombre maximum de lieux à traiter")
        args = parser.parse_args()

        # Configuration des paramètres de scraping
        TEST_MODE = args.test
        REAL_SCREENSHOTS = args.real_screenshots
        BILLETREDUC_SCREENSHOTS = args.billetreduc_screenshots
        FORCE_ANALYSIS = args.force_analysis
        
        # Activer le mode test pour Mistral si --test est présent
        if TEST_MODE:
            logger.info("Activation du mode test pour Mistral")
            set_test_mode(True)
            
            # Vider le cache au démarrage
            logger.info("Nettoyage du cache au démarrage")
            clear_mistral_cache()
        
        # Exécuter la fonction principale
        main()
        
    except Exception as error:
        logger.error(f"ERREUR CRITIQUE pendant l'exécution: {error}")
        import traceback
        logger.error(traceback.format_exc())
        sys.exit(1)
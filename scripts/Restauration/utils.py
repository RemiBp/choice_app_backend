import os
import json
import time
import hashlib
import requests
from pymongo import MongoClient, ASCENDING, DESCENDING
from concurrent.futures import ThreadPoolExecutor
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

# --- Configuration MongoDB ---
MONGO_URI = "mongodb+srv://remibarbier:Calvi8Pierc2@lieuxrestauration.szq31.mongodb.net/?retryWrites=true&w=majority&appName=lieuxrestauration"
DB_NAME = "Restauration_Officielle"
COLLECTION_NAME = "RestaurationParis"

# --- Connexion MongoDB ---
def get_db_connection():
    """Établit et retourne une connexion à MongoDB"""
    client = MongoClient(MONGO_URI)
    db = client[DB_NAME]
    
    try:
        # Création des index nécessaires s'ils n'existent pas
        indexes = db[COLLECTION_NAME].index_information()
        
        # Index place_id unique mais seulement pour les valeurs non-null
        if "place_id_1" not in indexes:
            db[COLLECTION_NAME].create_index(
                "place_id", 
                unique=True, 
                partialFilterExpression={"place_id": {"$type": "string"}}
            )
            print("Index unique créé sur place_id (excluant les valeurs null)")
        
        # Autres index non-uniques
        if "name_1" not in indexes:
            db[COLLECTION_NAME].create_index("name")
        
        if "website_1" not in indexes:
            db[COLLECTION_NAME].create_index("website")
        
        if "coordinates_1" not in indexes:
            db[COLLECTION_NAME].create_index([
                ("gps_coordinates.lat", ASCENDING), 
                ("gps_coordinates.lng", ASCENDING)
            ])
        
        print("Connexion à MongoDB établie et indexes vérifiés")
    except Exception as e:
        print(f"Avertissement lors de la création des index: {e}")
        print("Certains index n'ont pas pu être créés, mais la connexion est établie")
    
    return db, db[COLLECTION_NAME]

# --- Gestion du cache ---
CACHE_DIR = "api_cache"
os.makedirs(CACHE_DIR, exist_ok=True)

def get_cache_path(key, prefix=""):
    """Génère un chemin de fichier cache basé sur une clé"""
    hash_key = hashlib.md5(f"{prefix}_{key}".encode()).hexdigest()
    return os.path.join(CACHE_DIR, f"{hash_key}.json")

def get_from_cache(key, max_age_hours=24*7, prefix=""):
    """Récupère des données du cache si elles existent et ne sont pas expirées"""
    cache_path = get_cache_path(key, prefix)
    if os.path.exists(cache_path):
        file_age_seconds = time.time() - os.path.getmtime(cache_path)
        if file_age_seconds < max_age_hours * 3600:
            try:
                with open(cache_path, 'r', encoding='utf-8') as f:
                    return json.load(f)
            except:
                pass
    return None

def save_to_cache(key, data, prefix=""):
    """Sauvegarde des données dans le cache"""
    cache_path = get_cache_path(key, prefix)
    with open(cache_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False)

# --- Clients API avec retry et backoff ---
def create_session_with_retry(retries=3, backoff_factor=0.5):
    """Crée une session HTTP avec retry et backoff exponentiel"""
    session = requests.Session()
    retry_strategy = Retry(
        total=retries,
        backoff_factor=backoff_factor,
        status_forcelist=[429, 500, 502, 503, 504],
    )
    adapter = HTTPAdapter(max_retries=retry_strategy)
    session.mount("http://", adapter)
    session.mount("https://", adapter)
    return session

# --- Parallélisation ---
def process_in_parallel(items, process_func, max_workers=10):
    """Traite des items en parallèle avec un nombre limité de workers"""
    results = []
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = [executor.submit(process_func, item) for item in items]
        for future in futures:
            try:
                result = future.result()
                if result:
                    results.append(result)
            except Exception as e:
                print(f"Erreur de traitement parallèle: {e}")
    return results

# --- Vérification de restaurant existant ---
def is_restaurant_already_processed(collection, place_id=None, name=None, address=None):
    """Vérifie si un restaurant est déjà dans la base de données"""
    query = {}
    if place_id:
        query["place_id"] = place_id
    elif name and address:
        query = {"name": name, "address": address}
    elif name:
        query = {"name": name}
    
    if query:
        return collection.find_one(query, {"_id": 1}) is not None
    return False

# --- Requêtes API optimisées ---
def make_api_request(url, params=None, headers=None, render_js=False, cache_key=None, 
                     cache_prefix="", max_age_hours=24, session=None):
    """
    Effectue une requête API avec cache, retry et gestion d'erreur.
    Utilise render_js uniquement si demandé (pour ScraperAPI).
    """
    if cache_key:
        cached_data = get_from_cache(cache_key, max_age_hours, cache_prefix)
        if cached_data:
            return cached_data
    
    if session is None:
        session = create_session_with_retry()
    
    try:
        if render_js and "api.scraperapi.com" in url:
            if "render=true" not in url:
                separator = "&" if "?" in url else "?"
                url = f"{url}{separator}render=true"
        
        response = session.get(url, params=params, headers=headers, timeout=30)
        response.raise_for_status()
        
        if response.headers.get('content-type', '').startswith('application/json'):
            data = response.json()
        else:
            data = response.text
        
        if cache_key:
            save_to_cache(cache_key, data, cache_prefix)
        
        return data
    
    except Exception as e:
        print(f"Erreur API ({url}): {e}")
        return None
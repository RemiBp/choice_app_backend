import os
import requests
import time
import json
from collections import OrderedDict
from multiprocessing import Pool
from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer
from utils import get_db_connection, make_api_request, is_restaurant_already_processed, get_from_cache, save_to_cache

# Configuration des API
API_KEY = 'AIzaSyDRvEPM8JZ1Wpn_J6ku4c3r5LQIocFmzOE'

# Obtenir la connexion à MongoDB
db, collection = get_db_connection()

# Initialiser l'analyseur de sentiment
analyzer = SentimentIntensityAnalyzer()

# Catégories de restaurants
RESTAURANT_CATEGORIES = {
    "restaurant", "cafe", "bar", "meal_takeaway", "bakery", "fast_food",
    "sushi_restaurant", "pizza_restaurant", "chinese_restaurant",
    "indian_restaurant", "french_restaurant", "italian_restaurant",
    "thai_restaurant", "mexican_restaurant", "vietnamese_restaurant",
    "seafood_restaurant", "steakhouse", "burger_restaurant",
    "ice_cream_shop", "brewery", "pub"
}

def generate_paris_grid(precision=0.001):
    """
    Génère une grille de points couvrant toute l'Île-de-France avec haute précision
    pour garantir que tous les restaurants sont trouvés.
    """
    # Limites géographiques de l'Île-de-France (étendu pour couvrir toute la région)
    lat_min, lat_max = 48.1200, 49.2413  # Du sud au nord
    lng_min, lng_max = 1.4461, 3.5590     # De l'ouest à l'est
    
    grid_points = []
    lat = lat_min
    while lat <= lat_max:
        lng = lng_min
        while lng <= lng_max:
            grid_points.append({"lat": lat, "lng": lng})
            lng += precision
        lat += precision
    
    print(f"Grille générée avec {len(grid_points)} points de recherche")
    return grid_points

def get_restaurants_near_point(point, radius=200):
    """
    Récupère les restaurants autour d'un point avec mise en cache
    pour éviter les requêtes répétées.
    """
    lat, lng = point["lat"], point["lng"]
    cache_key = f"restaurants_{lat}_{lng}_{radius}"
    
    # Vérifier le cache
    cached_results = get_from_cache(cache_key, max_age_hours=168, prefix="maps")
    if cached_results:
        return cached_results
    
    restaurants = []
    
    # URL de base pour l'API
    url = f"https://maps.googleapis.com/maps/api/place/nearbysearch/json?location={lat},{lng}&radius={radius}&type=restaurant&key={API_KEY}"
    next_page_token = None
    
    # Récupérer les résultats de toutes les pages
    while True:
        if next_page_token:
            page_url = f"https://maps.googleapis.com/maps/api/place/nearbysearch/json?pagetoken={next_page_token}&key={API_KEY}"
        else:
            page_url = url
        
        response = requests.get(page_url)
        data = response.json()
        
        if "error_message" in data:
            print(f"Erreur API: {data['error_message']}")
            break
        
        if "results" in data:
            # Filtrer les lieux pour inclure uniquement les catégories pertinentes
            filtered_places = [
                place for place in data.get("results", [])
                if set(place.get("types", [])).intersection(RESTAURANT_CATEGORIES)
            ]
            restaurants.extend(filtered_places)
        
        next_page_token = data.get("next_page_token")
        if not next_page_token:
            break
        
        # Pause requise par l'API Google Places
        time.sleep(2)
    
    # Sauvegarder dans le cache
    save_to_cache(cache_key, restaurants, prefix="maps")
    
    return restaurants

def get_place_details(place_id):
    """
    Récupère et met en cache les détails d'un lieu.
    Vérifie d'abord si le lieu existe déjà dans MongoDB.
    """
    # Vérifier si déjà dans MongoDB
    existing = collection.find_one({"place_id": place_id}, {"_id": 1})
    if existing:
        print(f"Place ID {place_id} déjà dans la base de données.")
        return None
    
    # Vérifier le cache
    cache_key = f"place_details_{place_id}"
    cached_details = get_from_cache(cache_key, max_age_hours=168, prefix="places")
    if cached_details:
        return cached_details
    
    # Récupérer tous les détails en une seule requête
    fields = "name,formatted_address,geometry,opening_hours,website,price_level,reviews,business_status,types,formatted_phone_number,international_phone_number,rating,user_ratings_total,photos"
    url = f"https://maps.googleapis.com/maps/api/place/details/json?place_id={place_id}&fields={fields}&key={API_KEY}"
    
    response = requests.get(url)
    data = response.json()
    
    if "error_message" in data:
        print(f"Erreur API pour place_id {place_id}: {data['error_message']}")
        return None
    
    place_details = data.get("result", {})
    if not place_details:
        print(f"Aucun détail trouvé pour place_id {place_id}")
        return None
    
    # Enrichir le résultat
    place_details["place_id"] = place_id
    place_details["maps_url"] = f"https://www.google.com/maps/place/?q=place_id:{place_id}"
    
    # Traiter les photos pour obtenir des URLs
    if "photos" in place_details:
        photos = []
        for photo in place_details.get("photos", [])[:5]:  # Limiter à 5 photos maximum
            photo_reference = photo.get("photo_reference")
            if photo_reference:
                photo_url = f"https://maps.googleapis.com/maps/api/place/photo?maxwidth=400&photoreference={photo_reference}&key={API_KEY}"
                photos.append(photo_url)
        place_details["photos"] = photos
    
    # Traiter les avis avec analyse de sentiment
    if "reviews" in place_details:
        for review in place_details["reviews"]:
            sentiment = analyzer.polarity_scores(review.get("text", ""))
            review["sentiment"] = {
                "score": sentiment["compound"],
                "label": "Positif" if sentiment["compound"] >= 0.05 else "Négatif" if sentiment["compound"] <= -0.05 else "Neutre"
            }
    
    # Sauvegarder dans le cache
    save_to_cache(cache_key, place_details, prefix="places")
    
    return place_details

def process_restaurant_batch(restaurants):
    """
    Traite un lot de restaurants, récupère leurs détails et les enregistre dans MongoDB.
    """
    # Obtenir une nouvelle connexion pour le process parallèle
    db, collection = get_db_connection()
    
    for restaurant in restaurants:
        place_id = restaurant.get("place_id")
        if not place_id:
            continue
        
        # Vérifier si le restaurant existe déjà
        if is_restaurant_already_processed(collection, place_id):
            print(f"Restaurant avec place_id {place_id} déjà traité. Ignoré.")
            continue
        
        # Récupérer les détails
        place_details = get_place_details(place_id)
        if not place_details:
            continue
        
        # Créer un dictionnaire ordonné pour garantir l'ordre des champs
        cuisine_type = [t for t in place_details.get("types", []) if t in RESTAURANT_CATEGORIES]
        
        ordered_details = OrderedDict([
            ("name", place_details.get("name")),
            ("place_id", place_id),
            ("address", place_details.get("formatted_address")),
            ("phone_number", place_details.get("formatted_phone_number")),
            ("international_phone_number", place_details.get("international_phone_number")),
            ("rating", place_details.get("rating")),
            ("user_ratings_total", place_details.get("user_ratings_total")),
            ("gps_coordinates", place_details.get("geometry", {}).get("location")),
            ("category", cuisine_type),
            ("opening_hours", place_details.get("opening_hours", {}).get("weekday_text", [])),
            ("website", place_details.get("website")),
            ("price_level", place_details.get("price_level")),
            ("photos", place_details.get("photos", [])),
            ("reviews", place_details.get("reviews", [])),
            ("maps_url", place_details.get("maps_url")),
            ("business_status", place_details.get("business_status")),
            ("cuisine_type", cuisine_type),
        ])
        
        # Insérer dans MongoDB
        collection.update_one(
            {"place_id": place_id}, 
            {"$set": dict(ordered_details)}, 
            upsert=True
        )
        
        print(f"Enregistré : {ordered_details['name']}")

def scan_paris_for_restaurants():
    """
    Scanne toute l'Île-de-France pour trouver les restaurants et les enregistre dans MongoDB.
    Utilise une grille dense pour ne manquer aucun établissement.
    """
    # Générer une grille de points couvrant l'Île-de-France
    grid_points = generate_paris_grid(precision=0.003)  # ~300m entre les points pour l'IDF
    
    all_restaurants = set()  # Utilisation d'un set pour éviter les doublons
    
    # Récupérer les restaurants pour chaque point
    for i, point in enumerate(grid_points):
        if i % 50 == 0:
            print(f"Traitement du point {i+1}/{len(grid_points)}")
        
        try:
            restaurants = get_restaurants_near_point(point)
            for restaurant in restaurants:
                # Utiliser place_id comme identifiant unique
                all_restaurants.add(restaurant["place_id"])
        except Exception as e:
            print(f"Erreur au point {point}: {e}")
    
    # Convertir les IDs en objets restaurant complets
    unique_restaurants = []
    unique_place_ids = list(all_restaurants)
    
    for i, place_id in enumerate(unique_place_ids):
        if i % 100 == 0:
            print(f"Préparation des détails {i+1}/{len(unique_place_ids)}")
        
        # Vérifier si le restaurant existe déjà
        if is_restaurant_already_processed(collection, place_id):
            continue
        
        # Ajouter à la liste à traiter
        unique_restaurants.append({"place_id": place_id})
    
    print(f"Traitement de {len(unique_restaurants)} restaurants uniques")
    
    # Traiter par lots pour éviter de surcharger l'API
    batch_size = 20
    for i in range(0, len(unique_restaurants), batch_size):
        batch = unique_restaurants[i:i+batch_size]
        process_restaurant_batch(batch)
        print(f"Lot {i//batch_size + 1}/{(len(unique_restaurants) + batch_size - 1)//batch_size} traité")
        # Pause pour respecter les quotas d'API
        time.sleep(2)

# Exécuter le code
if __name__ == "__main__":
    print("Démarrage du scan de tous les restaurants de l'Île-de-France")
    print("ATTENTION: Ce processus peut prendre plusieurs heures et consommer des crédits API Google Maps")
    print("Coût estimé: environ 50€ pour toute l'Île-de-France (basé sur l'expérience de ~4000 restaurants à Paris)")
    print("NB: Les restaurants déjà présents dans la base de données ne seront PAS retraités")
    print("Pressez Ctrl+C pour annuler ou n'importe quelle touche pour continuer...")
    try:
        input()  # Attend une confirmation de l'utilisateur
        scan_paris_for_restaurants()
    except KeyboardInterrupt:
        print("Opération annulée par l'utilisateur")
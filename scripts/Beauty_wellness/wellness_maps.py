import os
import requests
import time
from pymongo import MongoClient
from collections import OrderedDict
 
# Configuration API et MongoDB
API_KEY = "AIzaSyDRvEPM8JZ1Wpn_J6ku4c3r5LQIocFmzOE"
MONGO_URI = "mongodb+srv://remibarbier:Calvi8Pierc2@lieuxrestauration.szq31.mongodb.net/?retryWrites=true&w=majority&appName=lieuxrestauration"
DB_NAME = "Beauty_Wellness"
 
client = MongoClient(MONGO_URI)
db = client[DB_NAME]
 
# Définition des catégories et sous-catégories
CATEGORIES_MAPS = { "Soins esthétiques et bien-être": ["spa", "beauty_salon", "massage_therapist", "hair_removal_service"], "Coiffure et soins capillaires": ["hair_salon", "barber_shop"], "Onglerie et modifications corporelles": ["nail_salon", "tattoo_parlor", "piercing_shop"] }
 
def get_places_by_category(category_name, sub_categories, lat, lng, radius=5000):
    """Récupère les lieux d'une catégorie spécifique dans une zone donnée."""
    places = []
    for sub_category in sub_categories:
        url = f"https://maps.googleapis.com/maps/api/place/nearbysearch/json?location={lat},{lng}&radius={radius}&type={sub_category}&key={API_KEY}"
        response = requests.get(url)
        data = response.json()
        
        if 'results' in data:
            for place in data['results']:
                places.append({
                    "place_id": place.get("place_id"),
                    "name": place.get("name"),
                    "address": place.get("vicinity"),
                    "gps_coordinates": place.get("geometry", {}).get("location"),
                    "rating": place.get("rating"),
                    "user_ratings_total": place.get("user_ratings_total"),
                    "category": category_name,
                    "sub_category": sub_category
                })
    return places
 
def extract_details(place_id):
    """Récupère les avis (uniquement texte et rating) et le site web d'un lieu."""
    url = f"https://maps.googleapis.com/maps/api/place/details/json?place_id={place_id}&fields=reviews,website&key={API_KEY}"
    response = requests.get(url)
    data = response.json()

    place_details = data.get("result", {})

    # Récupérer uniquement le texte et la note des avis
    reviews = [
        {"text": review.get("text", ""), "rating": review.get("rating", None)}
        for review in place_details.get("reviews", [])
    ]

    website = place_details.get("website")  # Récupération du site web
    maps_url = f"https://www.google.com/maps/place/?q=place_id:{place_id}"  # Lien Google Maps

    return {
        "reviews": reviews,  # Liste avec uniquement le texte et la note
        "website": website,
        "maps_url": maps_url
    }

def save_to_mongo(place):
    """Sauvegarde les lieux dans MongoDB"""
    db.BeautyPlaces.update_one({"place_id": place["place_id"]}, {"$set": place}, upsert=True)

def process_zone(lat, lng):
    """Scrape les lieux pour une zone donnée et stocke en base de données."""
    for category, sub_categories in CATEGORIES_MAPS.items():
        places = get_places_by_category(category, sub_categories, lat, lng)
        for place in places:
            details = extract_details(place["place_id"])
            place["reviews"] = details["reviews"]
            place["website"] = details["website"]
            place["maps_url"] = details["maps_url"]  # Ajout du lien Google Maps
            save_to_mongo(place)
            print(f"✅ Lieu ajouté : {place['name']} | Site web : {place['website']} | Google Maps : {place['maps_url']}")
 
def scrape_all_zones():
    """Divise Paris en zones et lance le scraping."""
    lat_min, lat_max = 48.8156, 48.9022
    lng_min, lng_max = 2.2242, 2.4699
    step = 0.01  # Espacement de la grille (env. 1 km)
    
    lat_points = [lat_min + i * step for i in range(int((lat_max - lat_min) / step) + 1)]
    lng_points = [lng_min + i * step for i in range(int((lng_max - lng_min) / step) + 1)]
    
    for lat in lat_points:
        for lng in lng_points:
            process_zone(lat, lng)
 
if __name__ == "__main__":
    scrape_all_zones()


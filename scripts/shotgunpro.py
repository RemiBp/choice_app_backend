import requests
from bs4 import BeautifulSoup
import re
import unicodedata
from datetime import datetime
from pymongo import MongoClient

# Configuration MongoDB
MONGO_URI = "mongodb+srv://remibarbier:Calvi8Pierc2@lieuxrestauration.szq31.mongodb.net/?retryWrites=true&w=majority&appName=lieuxrestauration"
DB_NAME = "Loisir&Culture"
COLLECTION_PRODUCERS = "Loisir_Paris_Producers"

client = MongoClient(MONGO_URI)
db = client[DB_NAME]
collection_producers = db[COLLECTION_PRODUCERS]

# Configuration de l'API Google Geocoding
GEOCODING_API_URL = "https://maps.googleapis.com/maps/api/geocode/json"
API_KEY = "AIzaSyDRvEPM8JZ1Wpn_J6ku4c3r5LQIocFmzOE"

def remove_accents(text):
    """Supprime les accents d'une chaîne de caractères."""
    return ''.join(c for c in unicodedata.normalize('NFD', text) if unicodedata.category(c) != 'Mn')

def get_coordinates_from_address(address):
    """Utilise l'API de géocodage pour obtenir les coordonnées en format GeoJSON."""
    try:
        params = {"address": address, "key": API_KEY}
        response = requests.get(GEOCODING_API_URL, params=params)
        response.raise_for_status()
        data = response.json()
        if data["status"] == "OK" and len(data["results"]) > 0:
            location = data["results"][0]["geometry"]["location"]
            return {"type": "Point", "coordinates": [location["lng"], location["lat"]]}
        else:
            print(f"⚠️ Échec du géocodage pour {address}")
            return None
    except Exception as e:
        print(f"❌ Erreur API Géocodage pour {address} : {e}")
        return None

def extract_venue_urls(base_url, page_url):
    """Récupère les URLs des lieux à partir des balises <a> ayant la classe ciblée."""
    response = requests.get(page_url)
    if response.status_code != 200:
        return []

    soup = BeautifulSoup(response.text, 'html.parser')
    elements = soup.find_all(class_="bg-card flex items-center gap-4 rounded p-6")
    hrefs = [re.search(r'href="([^"]+)"', str(elem)).group(1) for elem in elements if re.search(r'href="([^"]+)"', str(elem))]

    return [base_url.rstrip("/") + "/" + href.lstrip("/") for href in hrefs]


def scrape_venue_details(page_url):
    """Récupère les informations détaillées d'un lieu et ses événements avec leurs URLs exacts."""
    response = requests.get(page_url)
    if response.status_code != 200:
        return {}

    soup = BeautifulSoup(response.text, 'html.parser')

    # Extraire uniquement le nom du lieu
    lieu_elements = soup.find_all(class_="text-muted-foreground")
    lieu = lieu_elements[1].text.strip() if len(lieu_elements) > 1 else "Lieu non disponible"

    # Extraire la description
    description_elem = soup.find(class_="line-clamp-3 text-balance max-md:text-center")
    description = description_elem.text.strip() if description_elem else "Description non disponible"

    # Extraire l'adresse et convertir en coordonnées
    adresse_elem = soup.find(class_="flex items-center gap-2")
    adresse = adresse_elem.text.strip() if adresse_elem else "Adresse non disponible"
    coordinates = get_coordinates_from_address(adresse) if adresse != "Adresse non disponible" else None

    # Extraire l'image principale
    image_elem = soup.find(class_="aspect-square h-full w-full bg-black object-contain")
    main_image = image_elem['src'] if image_elem and 'src' in image_elem.attrs else "Aucune image disponible"

    # Extraire les événements et leurs liens
    events_div = soup.find("div", class_="gap grid gap-x-4 gap-y-8 sm:grid-cols-2 lg:grid-cols-3 lg:gap-x-8")

    events_list = []
    if events_div:
        event_links = [a["href"] for a in events_div.find_all("a", href=True)]
        event_names = [e.text.strip() for e in events_div.find_all(class_="mt-2 line-clamp-2 text-lg font-bold leading-tight")]
        event_prices = [p.text.strip() for p in events_div.find_all(class_="text-foreground")]

        # Associer chaque nom d'événement à son URL et prix
        for index, event_name in enumerate(event_names):
            event_url = "https://shotgun.live" + event_links[index] if index < len(event_links) else "URL non disponible"
            event_image = main_image if index == 0 else "Aucune image disponible"
            event_price = event_prices[index] if index < len(event_prices) else "Prix non disponible"

            events_list.append({
                "intitulé": event_name,
                "image": event_image,
                "lien_url": event_url,
                "catégorie": "",
                "prix": event_price
            })

    venue_data = {
        "lieu": lieu,
        "adresse": adresse,
        "description": description,
        "evenements": events_list,
        "lien_lieu": page_url,
        "location": coordinates,
        "nombre_evenements": len(events_list),
        "image": main_image
    }

    return venue_data

def save_venue_to_mongo(venue_data):
    """Insère ou met à jour un lieu dans MongoDB."""
    existing_venue = collection_producers.find_one({"lieu": venue_data["lieu"]})
    if existing_venue:
        collection_producers.update_one({"_id": existing_venue["_id"]}, {"$set": venue_data})
        print(f"🔄 Mise à jour de '{venue_data['lieu']}' dans MongoDB.")
    else:
        collection_producers.insert_one(venue_data)
        print(f"✅ Ajout de '{venue_data['lieu']}' dans MongoDB.")

# Base URL
base_url = "https://shotgun.live"
page_num = 1

while True:
    page_url = f"https://shotgun.live/fr/venues/-/france/{page_num}"
    print(f"\n🔄 Scraping page {page_num} : {page_url}")
    venue_urls = extract_venue_urls(base_url, page_url)
    if not venue_urls:
        print(f"🚫 Fin du scraping : aucune donnée trouvée sur la page {page_num}.")
        break

    for url in venue_urls:
        print(f"\n🔍 Scraping : {url}")
        venue_details = scrape_venue_details(url)
        if venue_details:
            save_venue_to_mongo(venue_details)

    page_num += 1

print("\n🎉 Scraping terminé et sauvegarde en MongoDB effectuée !")

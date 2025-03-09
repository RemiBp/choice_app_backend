import requests
from pymongo import MongoClient
from bson.objectid import ObjectId
from bs4 import BeautifulSoup
# Connexion à MongoDB
MONGO_URI = "mongodb+srv://remibarbier:Calvi8Pierc2@lieuxrestauration.szq31.mongodb.net/?retryWrites=true&w=majority&appName=lieuxrestauration"
client = MongoClient(MONGO_URI)
# Bases de données et collections
db_loisir = client["Loisir&Culture"]
collection_evenements = db_loisir["Loisir_Paris_Evenements"]
collection_producers = db_loisir["Loisir_Paris_Producers"]
# Configuration de l'API de géocodage (Google Maps ou OpenCage)
GEOCODING_API_URL = "https://maps.googleapis.com/maps/api/geocode/json"
API_KEY = "AIzaSyDRvEPM8JZ1Wpn_J6ku4c3r5LQIocFmzOE"
def get_coordinates_from_address(address):
    """
    Utilise l'API de géocodage pour obtenir les coordonnées (latitude, longitude) à partir d'une adresse.
    """
    try:
        params = {
            "address": address,
            "key": API_KEY
        }
        response = requests.get(GEOCODING_API_URL, params=params)
        response.raise_for_status()
        data = response.json()
        if data["status"] == "OK" and len(data["results"]) > 0:
            location = data["results"][0]["geometry"]["location"]
            return {
                "type": "Point",  # Format GeoJSON pour MongoDB
                "coordinates": [location["lng"], location["lat"]]  # Longitude, Latitude
            }
        else:
            print(f"Échec du géocodage pour l'adresse : {address} ({data.get('status')})")
            return None
    except Exception as e:
        print(f"Erreur lors de l'appel API pour l'adresse {address} : {e}")
        return None
def scrape_lieu_details(lien_lieu):
    """
    Scrape les détails du lieu (adresse, description, etc.) depuis la page du lieu.
    """
    try:
        response = requests.get(lien_lieu)
        response.raise_for_status()
        soup = BeautifulSoup(response.text, "html.parser")
        # Récupérer tous les éléments <h5>
        h5_elements = soup.find_all('h5')
        adresse = h5_elements[1].text.strip() if len(h5_elements) > 1 else "Adresse non disponible"
        # Exemple de récupération d'une description (ajustez selon la structure réelle de la page)
        description_elem = soup.find('h6')
        description = description_elem.text.strip() if description_elem else "Description non disponible"
        return {
            "adresse": adresse,
            "description": description,
            "lien_lieu": lien_lieu
        }
    except Exception as e:
        print(f"Erreur lors du scraping de {lien_lieu} : {e}")
        return {
            "adresse": "Erreur lors du scraping",
            "description": "Erreur lors du scraping",
            "lien_lieu": lien_lieu
        }
def generate_producers_with_coordinates():
    """
    Génère un document par lieu dans `Loisir_Paris_Producers`,
    et ajoute les coordonnées aux événements dans `Loisir_Paris_Evenements` si elles ne sont pas déjà présentes.
    """
    try:
        # Récupération des lieux uniques depuis la base des événements
        lieux = collection_evenements.distinct("lieu")
        for lieu in lieux:
            # Récupérer tous les événements liés à ce lieu
            evenements = list(collection_evenements.find({"lieu": lieu}))
            # Récupérer le lien du lieu depuis le premier événement
            lien_lieu = evenements[0].get("lien_lieu", "Lien non disponible") if evenements else "Lien non disponible"
            # Scraper les détails du lieu
            lieu_details = scrape_lieu_details(lien_lieu)
            # Récupérer les coordonnées géographiques
            coordinates = get_coordinates_from_address(lieu_details["adresse"])
            # **Nouvelle étape : Ajouter les coordonnées au lieu dans les événements**
            if coordinates:
                for evenement in evenements:
                    # Vérifier si l'événement n'a pas encore la clé "location" ou si elle est manquante
                    if "location" not in evenement or evenement["location"] is None:
                        collection_evenements.update_one(
                            {"_id": evenement["_id"]},
                            {"$set": {"location": coordinates}}
                        )
                        print(f"Coordonnées ajoutées pour l'événement : {evenement['intitulé']}")
            # Construire le document pour la collection `Loisir_Paris_Producers`
            events_list = []
            for evenement in evenements:
                events_list.append({
                    "intitulé": evenement["intitulé"],
                    "catégorie": evenement.get("catégorie", "Catégorie non disponible"),
                    "lien_evenement": f"/Loisir_Paris_Evenements/{str(evenement['_id'])}"
                })
            producer_doc = {
                "lieu": lieu,
                "adresse": lieu_details["adresse"],
                "description": lieu_details["description"],
                "nombre_evenements": len(events_list),
                "evenements": events_list,
                "lien_lieu": lieu_details["lien_lieu"],
                "location": coordinates
            }
            # Vérifier si le lieu existe déjà dans la base des producteurs
            query = {"lieu": lieu}
            update_result = collection_producers.update_one(
                query,
                {"$set": producer_doc},
                upsert=True
            )
            if update_result.matched_count > 0:
                print(f"Mise à jour effectuée pour le lieu : {lieu}")
            elif update_result.upserted_id:
                print(f"Nouveau lieu inséré : {lieu}")
            else:
                print(f"Aucune modification pour le lieu : {lieu}")
    except Exception as e:
        print(f"Erreur lors de la génération des producteurs : {e}")
# Appel de la fonction principale
generate_producers_with_coordinates()

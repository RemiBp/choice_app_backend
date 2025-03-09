import requests
from bs4 import BeautifulSoup
from bson.objectid import ObjectId
import urllib.parse
import time
from utils import get_db_connection, make_api_request, is_restaurant_already_processed, process_in_parallel

# Clé API ScraperAPI
API_KEY = "e69d208030f8e53d8e48c7f0de8da518"

# Obtenir la connexion à MongoDB
db, collection = get_db_connection()

def scrape_tripadvisor_url_and_reviews(restaurant_data):
    """
    Version optimisée: récupère l'URL Tripadvisor et les avis pour un restaurant.
    - Utilise le cache
    - Évite render=true si possible
    - Traite le restaurant en une seule fonction
    """
    restaurant_name = restaurant_data["name"]
    city = restaurant_data.get("city", "Paris")
    restaurant_id = restaurant_data["_id"]
    
    # Vérifier si déjà traité (a tripadvisor_url et reviews)
    if "tripadvisor_url" in restaurant_data and "reviews" in restaurant_data and restaurant_data["reviews"]:
        print(f"Restaurant {restaurant_name} déjà traité. Ignoré.")
        return None
    
    print(f"\nTraitement du restaurant : {restaurant_name} ({city})")
    
    # 1. Recherche de l'URL Tripadvisor
    search_query = f"Tripadvisor {restaurant_name} {city}"
    google_search_url = f"https://www.google.com/search?q={urllib.parse.quote(search_query)}"
    
    # Essayer d'abord sans render=true
    google_results = make_api_request(
        f"http://api.scraperapi.com?api_key={API_KEY}&url={google_search_url}",
        cache_key=f"google_{restaurant_name}_{city}",
        cache_prefix="search",
        max_age_hours=168  # Une semaine
    )
    
    # Si on n'a pas obtenu de résultats, essayer avec render=true
    if not google_results or "tripadvisor.com" not in google_results:
        google_results = make_api_request(
            f"http://api.scraperapi.com?api_key={API_KEY}&url={google_search_url}&render=true",
            cache_key=f"google_render_{restaurant_name}_{city}",
            cache_prefix="search",
            max_age_hours=168
        )
    
    if not google_results:
        print(f"Échec de la recherche Google pour {restaurant_name}")
        return None
    
    # Extraire l'URL Tripadvisor
    soup = BeautifulSoup(google_results, "html.parser")
    tripadvisor_url = None
    for link in soup.find_all("a", href=True):
        href = link["href"]
        if "tripadvisor.com" in href and "Restaurant_Review" in href:
            tripadvisor_url = href.split("/url?q=")[-1].split("&")[0]
            break
    
    # Vérifiez si l'URL contient "carrefour"
    if tripadvisor_url and "carrefour" in tripadvisor_url.lower():
        print(f"URL Tripadvisor ignorée car elle contient 'carrefour': {tripadvisor_url}")
        return None
    
    if not tripadvisor_url:
        print(f"URL Tripadvisor non trouvée pour {restaurant_name}")
        return None
    
    # 2. Extraire le site officiel sans render=true d'abord
    tripadvisor_data = make_api_request(
        f"http://api.scraperapi.com?api_key={API_KEY}&url={tripadvisor_url}",
        cache_key=tripadvisor_url,
        cache_prefix="tripadvisor",
        max_age_hours=168
    )
    
    # Si on ne trouve pas le bouton du site, essayer avec render=true
    official_website = None
    soup = BeautifulSoup(tripadvisor_data, "html.parser")
    link = soup.find("a", {"data-automation": "restaurantsWebsiteButton"})
    
    if not link:
        tripadvisor_data = make_api_request(
            f"http://api.scraperapi.com?api_key={API_KEY}&url={tripadvisor_url}&render=true",
            cache_key=f"{tripadvisor_url}_render",
            cache_prefix="tripadvisor",
            max_age_hours=168
        )
        soup = BeautifulSoup(tripadvisor_data, "html.parser")
        link = soup.find("a", {"data-automation": "restaurantsWebsiteButton"})
    
    if link and link.get("href"):
        official_website = link["href"]
    
    # 3. Extraire les avis (optimisé pour batching)
    reviews = []
    
    # Limiter à 3 pages max pour réduire les coûts
    max_pages = 3
    url_suffix = tripadvisor_url.split("Reviews")[1] if "Reviews" in tripadvisor_url else ""
    
    for page_number in range(max_pages):
        page_url = f"{tripadvisor_url.split('Reviews')[0]}Reviews-or{page_number * 10}{url_suffix}" if page_number > 0 else tripadvisor_url
        
        # Utiliser le cache pour éviter de refaire la même requête
        page_data = make_api_request(
            f"http://api.scraperapi.com?api_key={API_KEY}&url={page_url}",
            cache_key=page_url,
            cache_prefix="reviews",
            max_age_hours=720  # 30 jours
        )
        
        if not page_data:
            break
        
        soup = BeautifulSoup(page_data, "html.parser")
        comments = soup.find_all('span', class_='JguWG')
        
        if not comments:
            # Essayer avec render=true si on ne trouve pas de commentaires
            page_data = make_api_request(
                f"http://api.scraperapi.com?api_key={API_KEY}&url={page_url}&render=true",
                cache_key=f"{page_url}_render",
                cache_prefix="reviews",
                max_age_hours=720
            )
            
            if page_data:
                soup = BeautifulSoup(page_data, "html.parser")
                comments = soup.find_all('span', class_='JguWG')
        
        if comments:
            reviews.extend([comment.text.strip() for comment in comments])
        else:
            # Si toujours pas de commentaires, passer à la page suivante
            print(f"Aucun avis trouvé pour {restaurant_name} sur la page {page_number+1}")
    
    # 4. Mise à jour dans MongoDB
    update_fields = {}
    
    existing_website = restaurant_data.get("website", "")
    if not existing_website and official_website:
        update_fields["website"] = official_website
        print(f"URL officielle ajoutée : {official_website}")
    
    if tripadvisor_url:
        update_fields["tripadvisor_url"] = tripadvisor_url
    
    if reviews:
        update_fields["reviews"] = reviews
        print(f"{len(reviews)} avis ajoutés.")
    
    if update_fields:
        collection.update_one({"_id": ObjectId(restaurant_id)}, {"$set": update_fields})
        print(f"Mise à jour effectuée pour {restaurant_name}.")
    else:
        print(f"Aucune mise à jour nécessaire pour {restaurant_name}.")
    
    return {
        "name": restaurant_name,
        "website": official_website,
        "reviews": reviews,
        "tripadvisor_url": tripadvisor_url
    }

def fetch_and_update_restaurants(limit=20, batch_size=5):
    """
    Récupère les restaurants et traite plusieurs restaurants en parallèle
    """
    # Récupérer uniquement les restaurants qui n'ont pas encore de reviews ou de tripadvisor_url
    restaurants = list(collection.find(
        {"$or": [
            {"reviews": {"$exists": False}},
            {"tripadvisor_url": {"$exists": False}}
        ]},
        {"_id": 1, "name": 1, "city": 1, "website": 1}
    ).limit(limit))
    
    if not restaurants:
        print("Tous les restaurants ont déjà été traités.")
        return
    
    print(f"Traitement de {len(restaurants)} restaurants...")
    
    # Traitement parallèle avec un nombre limité de workers pour éviter de surcharger l'API
    process_in_parallel(restaurants, scrape_tripadvisor_url_and_reviews, max_workers=batch_size)

# Lancer le processus pour les restaurants
if __name__ == "__main__":
    fetch_and_update_restaurants(limit=20, batch_size=5)
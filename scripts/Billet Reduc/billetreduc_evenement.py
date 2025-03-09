
import requests
from bs4 import BeautifulSoup
import re
from datetime import datetime
from pymongo import MongoClient
import nest_asyncio
import asyncio
from playwright.async_api import async_playwright

# --- Configuration MongoDB ---
MONGO_URI = "mongodb+srv://remibarbier:Calvi8Pierc2@lieuxrestauration.szq31.mongodb.net/?retryWrites=true&w=majority&appName=lieuxrestauration"
DB_NAME = "Loisir&Culture"
COLLECTION_NAME = "Loisir_Paris_Evenements"
client = MongoClient(MONGO_URI)
db = client[DB_NAME]
collection = db[COLLECTION_NAME]
# Traduction des jours et mois français en anglais
JOURS_FR_EN = {
    "lundi": "Monday", "mardi": "Tuesday", "mercredi": "Wednesday",
    "jeudi": "Thursday", "vendredi": "Friday", "samedi": "Saturday", "dimanche": "Sunday"
}
MOIS_FR_EN = {
    "janvier": "January", "février": "February", "mars": "March", "avril": "April",
    "mai": "May", "juin": "June", "juillet": "July", "août": "August",
    "septembre": "September", "octobre": "October", "novembre": "November", "décembre": "December"
}
# --- Fonction pour traduire jours et mois en anglais ---
def translate_date_to_english(date_text):
    for jour_fr, jour_en in JOURS_FR_EN.items():
        date_text = date_text.replace(jour_fr, jour_en)
    for mois_fr, mois_en in MOIS_FR_EN.items():
        date_text = date_text.replace(mois_fr, mois_en)
    return date_text
# --- Fonction pour transformer les dates ---
def format_dates(date_text):
    if "au" not in date_text:
        return date_text.strip()
    match = re.search(r"Du (\w+ \d+ \w+ \d+) au (\w+ \d+ \w+ \d+)", date_text)
    if match:
        start_date_str = translate_date_to_english(match.group(1))
        end_date_str = translate_date_to_english(match.group(2))
        start_date = datetime.strptime(start_date_str, "%A %d %B %Y").strftime("%d/%m/%Y")
        end_date = datetime.strptime(end_date_str, "%A %d %B %Y").strftime("%d/%m/%Y")
        return f"{start_date} au {end_date}"
    return date_text.strip()
# --- Fonction pour scraper les spectacles ---
def scrape_spectacles(page_url):
    response = requests.get(page_url)
    if response.status_code != 200:
        print(f"Erreur lors de la récupération de la page {page_url} : {response.status_code}")
        return []
    soup = BeautifulSoup(response.text, 'html.parser')
    spectacle_sections = soup.find_all('td', class_='bgbeige')
    spectacles = []
    for section in spectacle_sections:
        title_elem = section.find('a', class_='head')
        title = title_elem.text.strip() if title_elem else None
        if not title:
            continue
        link_href = title_elem['href'] if title_elem else None
        numero_spectacle = link_href.split('/')[1] if link_href else "Numéro non disponible"
        category_elem = section.find('span', class_='small')
        category = category_elem.text.strip() if category_elem else "Catégorie non disponible"
        detail_elem = section.find('div', class_='libellepreliste')
        detail = detail_elem.text.strip() if detail_elem else "Détail non disponible"
        lieu_elem = section.find('span', class_='lieu')
        if lieu_elem:
            lieu_link_elem = lieu_elem.find('a')
            lieu = lieu_link_elem.text.strip() if lieu_link_elem else "Lieu non disponible"
            lieu_url = f"https://www.billetreduc.com{lieu_link_elem['href']}" if lieu_link_elem else "Lien non disponible"
        else:
            lieu = "Lieu non disponible"
            lieu_url = "Lien non disponible"
        dates_text = lieu_elem.text if lieu_elem else ""
        if "Prochaines dates:" in dates_text:
            raw_dates = dates_text.split("Prochaines dates:")[-1].strip()
            dates = format_dates(raw_dates)
        else:
            dates = "Dates non disponibles"
        prix_reduit_elem = section.find_next('span', class_='prixli')
        prix_reduit = prix_reduit_elem.text.strip() if prix_reduit_elem else "Prix réduit non disponible"
        ancien_prix_elem = section.find_next('strike')
        ancien_prix = ancien_prix_elem.text.strip() if ancien_prix_elem else "Ancien prix non disponible"
        note_elem = section.find('b', class_=re.compile(r'note\d+ tooltip'))
        note = note_elem.get('class', [None])[0].replace('note', '').replace('tooltip', '') if note_elem else "Note non disponible"
        image_url = f"https://www.billetreduc.com/zg/n100/{numero_spectacle}.jpeg"
        site_url = f"https://www.billetreduc.com{title_elem['href']}" if title_elem else "Lien non disponible"
        purchase_url = f"https://www.billetreduc.com/v2/PurchaseTunnel#/ShowSelection?eventId={numero_spectacle}"
        spectacles.append({
            "intitulé": title,
            "catégorie": category,
            "détail": detail,
            "lieu": lieu,
            "lien_lieu": lieu_url,
            "prochaines_dates": dates,
            "prix_reduit": prix_reduit,
            "ancien_prix": ancien_prix,
            "note": note,
            "image": image_url,
            "site_url": site_url,
            "purchase_url": purchase_url
        })
    return spectacles
# --- Fonctions pour scraper les commentaires ---
def scrape_billetreduc_page(page_url):
    """
    Scrape une page de commentaires pour un événement.
    """
    response = requests.get(page_url)
    if response.status_code != 200:
        print(f"Erreur lors de la récupération de la page {page_url} : {response.status_code}")
        return []
    soup = BeautifulSoup(response.text, 'html.parser')
    critique_divs = soup.find_all('div', class_='crit')
    commentaires = []
    for crit in critique_divs:
        # Extraire la note
        note_elem = crit.find('b', class_='tooltip')
        note = note_elem['title'] if note_elem and 'title' in note_elem.attrs else "Note non disponible"
        # Extraire le titre du commentaire
        titre_elem = crit.find('b')
        titre = titre_elem.text.strip() if titre_elem else "Titre non disponible"
        # Extraire le contenu principal du commentaire
        commentaire_brut = ""
        contenu_elements = crit.find_all(string=True, recursive=False)
        for elem in contenu_elements:
            commentaire_brut += elem.strip() + " "
        commentaires.append({
            "titre": titre,
            "note": note,
            "contenu": commentaire_brut.strip()
        })
    return commentaires
def scrape_comments_for_event(event_id, base_url):
    """
    Scrape les commentaires pour un événement spécifique.
    """
    all_comments = []
    for page_num in range(1, 6):  # Scraper les 5 premières pages
        page_url = f"{base_url}/evtcrit.htm?CRITIQUESpg={page_num}"
        print(f"Scraping page {page_num} for event {event_id}: {page_url}")
        comments = scrape_billetreduc_page(page_url)
        all_comments.extend(comments)
        # Si aucune nouvelle critique n'est trouvée, arrêter
        if not comments:
            break
    return all_comments
def update_event_with_comments(event_id, comments):
    """
    Met à jour un événement dans MongoDB avec les commentaires associés.
    """
    try:
        result = collection.update_one(
            {"_id": ObjectId(event_id)},
            {"$set": {"commentaires": comments}}
        )
        if result.matched_count > 0:
            print(f"Commentaires ajoutés pour l'événement : {event_id}")
        else:
            print(f"Événement non trouvé : {event_id}")
    except Exception as e:
        print(f"Erreur lors de la mise à jour de l'événement {event_id} : {e}")
# --- Scraping des catégories et prix via Playwright ---
async def scrape_categories_and_prices(url):
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()
        await page.goto(url)
        # Accepter les cookies si nécessaire
        try:
            cookie_button = await page.query_selector('button#onetrust-accept-btn-handler')
            if cookie_button:
                await cookie_button.click()
                await page.wait_for_timeout(1000)
        except Exception as e:
            print("Pas de bandeau de cookies détecté.")
        # Trouver toutes les sections des catégories
        category_sections = await page.query_selector_all('.category-content')
        all_data = []
        for section in category_sections:
            title_elem = await section.query_selector('.filter-title .label-name')
            title = await title_elem.inner_text() if title_elem else "Catégorie non disponible"
            price_elements = await section.query_selector_all('.price.final-price')
            prices = [await price.inner_text() for price in price_elements] if price_elements else []
            all_data.append({
                "Catégorie": title.strip(),
                "Prix": [price.strip() for price in prices]
            })
        await browser.close()
        return all_data
# --- Sauvegarde dans MongoDB ---
def save_to_mongo(spectacles):
    for spectacle in spectacles:
        try:
            # Extraire le numéro de spectacle depuis l'URL
            numero_spectacle = spectacle["purchase_url"].split("eventId=")[-1]
            
            # Scraper les informations complémentaires (catégories et prix)
            purchase_info = asyncio.run(scrape_categories_and_prices(spectacle["purchase_url"]))
            spectacle["catégories_prix"] = purchase_info
            # Scraper les commentaires
            base_url = spectacle["site_url"].split("/evt.htm")[0]
            comments = scrape_comments_for_event(numero_spectacle, base_url)
            spectacle["commentaires"] = comments
            # Vérifier si l'événement existe déjà dans la base
            existing_event = collection.find_one({"purchase_url": {"$regex": f"eventId={numero_spectacle}"}})
            
            if existing_event:
                # Mise à jour des informations existantes
                collection.update_one(
                    {"_id": existing_event["_id"]},
                    {"$set": spectacle}
                )
                print(f"Mise à jour effectuée pour : {spectacle['intitulé']}")
            else:
                # Insertion d'un nouveau document
                collection.insert_one(spectacle)
                print(f"Ajouté : {spectacle['intitulé']}")
        except Exception as e:
            print(f"Erreur pour {spectacle['intitulé']} : {e}")
# --- Fonction principale ---
def main():
    # Liste des URLs de base et leurs pages par défaut associées
    base_urls = [
        "https://www.billetreduc.com/search.htm?idrub=4&prix=0&region=J&tri=r&type=3&LISTEPEpg=",
        "https://www.billetreduc.com/search.htm?idrub=36&prix=0&region=J&tri=r&type=3&LISTEPEpg=",
        "https://www.billetreduc.com/search.htm?idrub=187&prix=0&region=J&tri=r&type=3&LISTEPEpg=",
        "https://www.billetreduc.com/search.htm?idrub=241&prix=0&region=J&tri=r&type=3&LISTEPEpg="
    ]
    default_pages = [
        "https://www.billetreduc.com/search.htm?idrub=4&prix=0&region=J&tri=r&type=3",
        "https://www.billetreduc.com/search.htm?idrub=36&prix=0&region=J&tri=r&type=3",
        "https://www.billetreduc.com/search.htm?idrub=187&prix=0&region=J&tri=r&type=3",
        "https://www.billetreduc.com/search.htm?idrub=241&prix=0&region=J&tri=r&type=3"
    ]


    for base_url, default_page in zip(base_urls, default_pages):
        page = 1  # Initialisation de la pagination
        while True:
            page_url = f"{base_url}{page}"
            print(f"Scraping de la page : {page_url}")


            # Scraper les spectacles pour la page courante
            try:
                response = requests.get(page_url, allow_redirects=True)
                # Vérification si on est redirigé vers la page par défaut
                if response.url == default_page:
                    print(f"Redirection détectée vers {default_page}. Passage à l'URL suivante.")
                    break  # Sortir de la boucle pour cette URL si redirection détectée


                # Scraper les spectacles uniquement si la page est valide
                spectacles = scrape_spectacles(page_url)
                if not spectacles:
                    print(f"Aucun spectacle trouvé sur la page {page}. Arrêt pour cette URL.")
                    break  # Sortir de la boucle pour cette URL si aucun spectacle n'est trouvé


                # Sauvegarder les spectacles dans MongoDB
                save_to_mongo(spectacles)
                page += 1  # Passer à la page suivante


            except Exception as e:
                print(f"Erreur lors du scraping de l'URL {page_url} : {e}")
                break  # Arrêter si l'URL ne fonctionne plus ou si une autre erreur survient


if __name__ == "__main__":
    main()


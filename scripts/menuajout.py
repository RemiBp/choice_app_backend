import os
import aiohttp
import time
import re
from datetime import datetime
import requests
from bs4 import BeautifulSoup
from pymongo import MongoClient
import fitz  # PyMuPDF
import openai
import json
from bson.objectid import ObjectId
from urllib.parse import urljoin
import asyncio
from playwright.async_api import async_playwright
from google.cloud import vision
from google.oauth2 import service_account
import asyncio

# --- Configuration MongoDB ---
MONGO_URI = "mongodb+srv://remibarbier:Calvi8Pierc2@lieuxrestauration.szq31.mongodb.net/?retryWrites=true&w=majority&appName=lieuxrestauration"
DB_NAME = "Restauration_Officielle"
COLLECTION_NAME = "producers"
client = MongoClient(MONGO_URI)
db = client[DB_NAME]
collection = db[COLLECTION_NAME]

# --- Configuration OpenAI ---
openai.api_key = "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"

# --- Configuration Google Cloud Vision ---
API_KEY = 'AIzaSyDRvEPM8JZ1Wpn_J6ku4c3r5LQIocFmzOE'

# --- Fonctions Utilitaires ---

def fetch_restaurant_websites(limit=10):
    """
    Récupère les restaurants depuis MongoDB.
    """
    try:
        restaurants = collection.find().limit(limit)
        return list(restaurants)
    except Exception as e:
        print(f"[ERREUR] Échec de la récupération des restaurants depuis MongoDB : {e}")
        return []

async def extract_dynamic_content(url):
    """
    Utilise Playwright pour extraire le contenu dynamique d'une page HTML.
    """
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context()
        page = await context.new_page()

        try:
            print(f"[INFO] Extraction dynamique pour : {url}")
            await page.goto(url, timeout=30000)  # Timeout augmenté pour les pages lentes
            content = await page.content()
            return content
        except Exception as e:
            print(f"[ERREUR] Extraction dynamique échouée pour {url} : {e}")
            return ""
        finally:
            await browser.close()

async def process_gpt_chunks(raw_text):
    """
    Traite un texte brut en morceaux pour GPT.
    """
    chunks = split_text_into_chunks(raw_text, chunk_size=9000)  # Divise en morceaux de 9000 caractères max
    structured_data = {"Menus Globaux": [], "Items Indépendants": []}

    for chunk in chunks:
        print(f"[INFO] Envoi d'un morceau de {len(chunk)} caractères à GPT.")
        response = await structure_menus_with_gpt(chunk)
        validated_data = robust_validate_and_fix_json(response)

        if validated_data:
            structured_data["Menus Globaux"].extend(validated_data.get("Menus Globaux", []))
            structured_data["Items Indépendants"].extend(validated_data.get("Items Indépendants", []))

    return structured_data

def extract_links_from_website(url, retries=3, backoff_factor=2):
    """
    Extrait tous les liens d'un site web, y compris les liens des images dans divers attributs.
    """
    attempt = 0
    seen_links = set()
    while attempt < retries:
        try:
            response = requests.get(url, timeout=10)
            response.raise_for_status()
            soup = BeautifulSoup(response.content, "html.parser")
            links = []

            # Extrait les liens des menus
            for link in soup.find_all("a", href=True):
                href = urljoin(url, link["href"].strip())  # Gère les liens relatifs
                if href not in seen_links:
                    seen_links.add(href)
                    links.append({"href": href, "text": link.get_text(strip=True)})

            # Extrait les liens des images
            for img in soup.find_all("img"):
                # Priorité au `src` si présent
                src = img.get("src")
                if src:
                    absolute_href = urljoin(url, src.strip())
                    if absolute_href not in seen_links:
                        seen_links.add(absolute_href)
                        links.append({"href": absolute_href, "text": img.get("alt", "")})

                # Recherche dans d'autres attributs comme `srcset` ou `data-src`
                srcset = img.get("srcset")
                if srcset:
                    # Dans `srcset`, les URLs sont séparées par des virgules et des espaces
                    for src_item in srcset.split(","):
                        src_url = src_item.split()[0]  # Prend uniquement l'URL
                        absolute_href = urljoin(url, src_url.strip())
                        if absolute_href not in seen_links:
                            seen_links.add(absolute_href)
                            links.append({"href": absolute_href, "text": img.get("alt", "")})

                data_src = img.get("data-src")
                if data_src:
                    absolute_href = urljoin(url, data_src.strip())
                    if absolute_href not in seen_links:
                        seen_links.add(absolute_href)
                        links.append({"href": absolute_href, "text": img.get("alt", "")})

            return links
        except requests.exceptions.RequestException as e:
            attempt += 1
            print(f"Erreur lors de la tentative {attempt} : {e}")
            time.sleep(backoff_factor * attempt)
    print(f"Échec après {retries} tentatives pour {url}")
    return []

def filter_menu_links(all_links, base_url):
    """
    Filtre les liens des menus avec des mots-clés pertinents.
    """
    menu_keywords = ["menu", "carte", "boissons", "plats", "pdf"]
    menu_links = []
    seen_links = set()

    for link in all_links:
        href = link["href"].lower()
        text = link["text"].lower()
        if any(keyword in href or keyword in text for keyword in menu_keywords):
            absolute_href = urljoin(base_url, href)
            if absolute_href not in seen_links:
                seen_links.add(absolute_href)
                menu_links.append({"href": absolute_href, "text": link["text"]})

    return menu_links

def filter_image_links(all_links, base_url):
    """
    Filtre les liens des images intéressantes.
    """
    image_keywords = ["menu", "carte", "plats", "boissons", "pdf", "png", "jpg", "jpeg"]
    image_links = []
    seen_links = set()

    for link in all_links:
        href = link["href"].lower()
        text = link["text"].lower()
        if any(keyword in href or keyword in text for keyword in image_keywords):
            absolute_href = urljoin(base_url, href)
            if absolute_href not in seen_links:
                seen_links.add(absolute_href)
                image_links.append({"href": absolute_href, "text": link["text"]})

    return image_links

def extract_text_from_pdf(pdf_url):
    """
    Télécharge et extrait le texte brut d'un PDF.
    """
    try:
        response = requests.get(pdf_url, timeout=10)
        response.raise_for_status()
        pdf_data = response.content
        pdf = fitz.open(stream=pdf_data, filetype="pdf")
        text = "".join(page.get_text() for page in pdf)
        pdf.close()
        return text.strip()
    except Exception as e:
        print(f"[ERREUR] Problème avec le fichier PDF ({pdf_url}) : {e}")
        return ""

def extract_text_from_image(image_url):
    """
    Télécharge une image et extrait le texte brut en utilisant Google Cloud Vision.
    """
    try:
        client = vision.ImageAnnotatorClient(credentials=service_account.Credentials.from_service_account_info({"type": "service_account", "project_id": "your-project-id", "private_key_id": "your-private-key-id", "private_key": "your-private-key", "client_email": "your-client-email", "client_id": "your-client-id", "auth_uri": "https://accounts.google.com/o/oauth2/auth", "token_uri": "https://oauth2.googleapis.com/token", "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs", "client_x509_cert_url": "https://www.googleapis.com/robot/v1/metadata/x509/your-client-email"}))
        image = vision.Image()
        image.source.image_uri = image_url

        response = client.text_detection(image=image)
        texts = response.text_annotations

        if texts:
            return texts[0].description
        else:
            return ""
    except Exception as e:
        print(f"[ERREUR] Problème avec l'image ({image_url}) : {e}")
        return ""

def robust_validate_and_fix_json(raw_text):
    """
    Valide et corrige un JSON brut.
    """
    try:
        return json.loads(raw_text)
    except json.JSONDecodeError as e:
        print(f"[ERREUR] JSON mal formé : {e}")
        print("[INFO] Tentative de correction...")

        # Correction basique des erreurs courantes
        corrected_text = re.sub(r",\s*([\]}])", r"\1", raw_text)  # Supprime les virgules finales
        corrected_text = re.sub(r"\\+", r"\\", corrected_text)  # Corrige les échappements multiples
        corrected_text = re.sub(r"(?<!\\)\"", r"\\\"", corrected_text)  # Échappe les guillemets mal formés

        try:
            return json.loads(corrected_text)
        except Exception as e2:
            print(f"[ERREUR] Impossible de corriger le JSON : {e2}")
            return None

def validate_json_structure(data):
    """
    Valide que les données respectent les exigences pour MongoDB.
    Retourne une version nettoyée des données.
    """
    if not isinstance(data, dict):
        raise ValueError("Les données fournies ne sont pas un dictionnaire valide.")

    # Vérifie la structure globale
    required_keys = {"Menus Globaux", "Items Indépendants"}
    if not required_keys.issubset(data.keys()):
        raise ValueError(f"Les clés obligatoires {required_keys} manquent dans les données.")

    return data

def is_valid_url(url):
    """
    Vérifie si une URL est valide.
    """
    regex = re.compile(
        r'^(?:http|ftp)s?://'  # http:// or https://
        r'(?:(?:[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?\.)+(?:[A-Z]{2,6}\.?|[A-Z0-9-]{2,}\.?)|'  # domain...
        r'localhost|'  # localhost...
        r'\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}|'  # ...or ipv4
        r'\[?[A-F0-9]*:[A-F0-9:]+\]?)'  # ...or ipv6
        r'(?::\d+)?'  # optional port
        r'(?:/?|[/?]\S+)$', re.IGNORECASE)
    return re.match(regex, url) is not None

def convert_prices(data):
    """
    Convertit les prix dans les données en float si possible.
    """
    def extract_float(price_str):
        try:
            # Extraction des nombres dans une chaîne (ex : "5,90€")
            return float(price_str.replace("€", "").replace(",", ".").strip())
        except (ValueError, AttributeError):
            return price_str  # Garde le format original si conversion impossible

    # Parcourt les menus globaux
    for menu in data.get("Menus Globaux", []):
        for category in menu.get("inclus", []):
            for item in category.get("items", []):
                item["prix"] = extract_float(item.get("prix", ""))

    # Parcourt les items indépendants
    for category in data.get("Items Indépendants", []):
        for item in category.get("items", []):
            item["prix"] = extract_float(item.get("prix", ""))

    return data

def split_text_into_chunks(text, chunk_size=4000):
    """
    Divise un texte en morceaux pour éviter de dépasser la limite de tokens de GPT.
    """
    words = text.split()
    chunks = []
    current_chunk = []

    for word in words:
        current_chunk.append(word)
        if len(" ".join(current_chunk)) > chunk_size:
            chunks.append(" ".join(current_chunk))
            current_chunk = []

    if current_chunk:  # Ajoute le dernier morceau
        chunks.append(" ".join(current_chunk))

    return chunks

def remove_empty_sections(data):
    """
    Supprime les sections où `items` est vide.
    :param data: Dictionnaire contenant "Menus Globaux" et "Items Indépendants".
    :return: Dictionnaire nettoyé sans sections vides.
    """
    # Filtrer les menus globaux (s'il y en a)
    data["Menus Globaux"] = [
        menu for menu in data["Menus Globaux"]
        if menu.get("inclus") and any(category.get("items") for category in menu["inclus"])
    ]

    # Filtrer les items indépendants
    data["Items Indépendants"] = [
        category for category in data["Items Indépendants"]
        if category.get("items")
    ]

    return data

# Fonction pour structurer les menus avec GPT
async def structure_menus_with_gpt(raw_text):
    prompt = f"""
    Voici un texte brut extrait d'une carte de restaurant :

    {raw_text}

    Identifie si la carte contient :
    1. Des menus globaux (avec des prix pour l'ensemble du menu) et/ou,
    2. Des items indépendants (sans structure explicite de menu).

    Si des menus globaux sont présents, structure-les ainsi :
    - nom : Nom du menu
    - prix : Prix global du menu
    - inclus : Liste des items inclus dans le menu, regroupés par catégorie (Entrées, Plats, Desserts, etc.), avec pour chaque item :
        - nom : Nom de l'item
        - description : Description ou détails indiqués pour l'item
        - note : Par défaut, 7.8/10

    Si des items indépendants sont présents, structure-les ainsi :
    - catégorie : La catégorie regroupant les items (Entrées, Plats, Desserts, Accompagnements, Boissons, etc.)
    - items : Liste des items indépendants dans cette catégorie avec :
        - nom : Nom de l'item
        - description : Description ou détails indiqués pour l'item
        - prix : Prix associé à l'item
        - note : Par défaut, 7.8/10

    Assure-toi que les catégories sont fidèles à celles présentes dans le texte, même si elles ne suivent pas un ordre standard.

    Retourne uniquement les données sous format JSON structuré comme suit :
    {{
        "Menus Globaux": [
            {{
                "nom": "Nom du menu",
                "prix": "Prix du menu",
                "inclus": [
                    {{
                        "catégorie": "Nom de la catégorie (ex: Entrées)",
                        "items": [
                            {{
                                "nom": "Nom de l'item",
                                "description": "Description si disponible",
                                "note": "7.8/10"
                            }}
                        ]
                    }}
                ]
            }}
        ],
        "Items Indépendants": [
            {{
                "catégorie": "Nom de la catégorie (ex: Plats)",
                "items": [
                    {{
                        "nom": "Nom de l'item",
                        "description": "Description si disponible",
                        "prix": "Prix de l'item",
                        "note": "7.8/10"
                    }}
                ]
            }}
        ]
    }}
    """
    try:
        response = openai.ChatCompletion.create(
            model="gpt-3.5-turbo",
            messages=[{"role": "user", "content": prompt}],
            max_tokens=3000,
            temperature=0.5
        )
        raw_response = response['choices'][0]['message']['content']
        print("[INFO] Réponse brute de GPT capturée.")
        return raw_response
    except Exception as e:
        print(f"[ERREUR] GPT n'a pas pu structurer les menus : {e}")
        return ""

def handle_empty_data(name, website):
    """
    Gère les cas où aucun lien de menu n'est trouvé pour un restaurant.
    """
    print(f"[INFO] Aucun lien de menu trouvé pour {name}. Retourne des données vides.")
    return {
        "Menus Globaux": [],
        "Items Indépendants": []
    }

# Fonction pour découper un texte en sections logiques
def split_into_sections(text):
    """
    Découpe le texte en sections logiques (basées sur les titres).
    """
    sections = re.split(r"(Entrées|Plats|Desserts|Boissons|Fromages)", text, flags=re.IGNORECASE)
    grouped_sections = ["".join(sections[i:i + 2]) for i in range(0, len(sections), 2)]
    return [section.strip() for section in grouped_sections if section.strip()]

async def process_url_data(url, structured_data):
    """
    Traite une URL pour extraire des menus et des images, et met à jour les données structurées.
    """
    # Récupération des liens de menu et des images
    links = extract_links_from_website(url)
    menu_links = [link for link in filter_menu_links(links, url) if is_valid_url(link["href"])]
    image_links = [link for link in filter_image_links(links, url) if is_valid_url(link["href"])]

    if not menu_links and not image_links:
        print(f"[INFO] Aucun lien de menu ou d'image trouvé pour {url}.")
        return structured_data

    for link in menu_links:
        href = link["href"]

        # Extraction du contenu (PDF ou HTML dynamique)
        if "pdf" in href.lower():
            print(f"[INFO] PDF détecté : {href}")
            raw_text = extract_text_from_pdf(href)
        else:
            print(f"[INFO] Page HTML détectée : {href}")
            raw_text = await extract_dynamic_content(href)

        if not raw_text.strip():
            print(f"[ERREUR] Aucun contenu trouvé pour {href}.")
            continue

        # Traitement du contenu avec GPT en morceaux
        chunked_data = await process_gpt_chunks(raw_text)
        if chunked_data:
            structured_data["Menus Globaux"].extend(chunked_data.get("Menus Globaux", []))
            structured_data["Items Indépendants"].extend(chunked_data.get("Items Indépendants", []))

    for link in image_links:
        href = link["href"]
        print(f"[INFO] Image détectée : {href}")
        raw_text = extract_text_from_image(href)
        if raw_text:
            image_data = await structure_menus_with_gpt(raw_text)
            if image_data:
                structured_data["Images"].append(image_data)

    return structured_data

def fetch_restaurant_websites(start=1100, limit=1100):
    """
    Récupère les restaurants depuis MongoDB en fonction de `start` et `limit`.
    """
    try:
        restaurants = collection.find().skip(start).limit(limit)
        return list(restaurants)
    except Exception as e:
        print(f"[ERREUR] Échec de la récupération des restaurants depuis MongoDB : {e}")
        return []


# Fonction principale
# Fonction principale
async def process_restaurant_menu(start=1000, end=1100):
    """
    Traite les restaurants récupérés dans MongoDB pour structurer leurs menus et leurs items indépendants.
    """
    # Étape 1 : Calcul du nombre de restaurants à récupérer
    limit = end - start

    # Récupération des restaurants en fonction de `start` et `limit`
    restaurants = fetch_restaurant_websites(start=start, limit=limit)

    if not restaurants:
        print("[ERREUR] Aucun restaurant trouvé dans la base de données.")
        return

    # Liste des URLs déjà traitées dans cette exécution
    processed_urls = set()

    # Étape 2 : Itération sur chaque restaurant
    for restaurant in restaurants:
        name = restaurant.get("name", "Nom Inconnu")
        website = restaurant.get("website", "")
        tripadvisor_url = restaurant.get("tripadvisor_url", "")

        # Étape 3 : Vérifier si les deux URLs sont identiques
        if website and tripadvisor_url and website.strip() == tripadvisor_url.strip():
            print(f"[INFO] URLs identiques pour {name}. Une seule sera traitée.")
            tripadvisor_url = ""  # On ignore Tripadvisor dans ce cas

        # Vérification et traitement des URLs
        for url in [website, tripadvisor_url]:
            if not url or not is_valid_url(url):
                print(f"[AVERTISSEMENT] URL invalide ou manquante pour {name}.")
                continue

            # Vérifier si l'URL a déjà été traitée dans cette exécution
            if url in processed_urls:
                print(f"[INFO] URL déjà traitée dans cette session : {url}")
                continue

            # Vérifier si l'URL a déjà été traitée dans MongoDB
            # Désactive la vérification pour forcer le retraitement
            # Ne saute pas les restaurants déjà enregistrés
            if url in processed_urls:
                print(f"[INFO] URL déjà traitée dans cette session : {url}. Retraitement en cours...")
            else:
                print(f"\n=== Retraitement de l'URL : {url} pour {name} ===")
            processed_urls.add(url)  # Marquer l'URL comme traitée mais ne pas l'empêcher d'être retraitée

            print(f"\n=== Traitement de l'URL : {url} pour {name} ===")
            processed_urls.add(url)  # Marquer l'URL comme traitée

            # Initialisation des données structurées
            structured_data = {"Menus Globaux": [], "Items Indépendants": [], "Images": []}

            # Traitement des données de l'URL
            structured_data = await process_url_data(url, structured_data)

            # Nettoyage des données et vérification finale
            structured_data = convert_prices(remove_empty_sections(structured_data))

            if not structured_data["Menus Globaux"] and not structured_data["Items Indépendants"] and not structured_data["Images"]:
                structured_data = handle_empty_data(name, url)

            # Affichage des résultats et mise à jour dans MongoDB
            print("\n=== Résultat final structuré ===")
            print(json.dumps(structured_data, indent=2, ensure_ascii=False))

            try:
                result = collection.update_one(
                    {"_id": restaurant["_id"]},
                    {
                        "$set": {
                            "structured_data": structured_data,
                            "last_processed_url": url,  # Optionnel : pour savoir quelle URL a été utilisée
                        }
                    },
                    upsert=True
                )
                print(f"[INFO] Données sauvegardées ou mises à jour pour {name}.")
            except Exception as e:
                print(f"[ERREUR] Échec de la mise à jour pour {name} : {e}")

# Appel de la fonction avec les indices souhaités
asyncio.run(process_restaurant_menu(start=1000, end=1100))

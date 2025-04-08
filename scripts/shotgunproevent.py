import requests
from bs4 import BeautifulSoup
from pymongo import MongoClient

# Configuration MongoDB
MONGO_URI = "mongodb+srv://remibarbier:Calvi8Pierc2@lieuxrestauration.szq31.mongodb.net/?retryWrites=true&w=majority&appName=lieuxrestauration"

DB_NAME = "Loisir&Culture"
COLLECTION_PRODUCERS = "Loisir_Paris_Producers"
COLLECTION_EVENTS = "Loisir_Paris_Evenements"

client = MongoClient(MONGO_URI)
db = client[DB_NAME]
collection_producers = db[COLLECTION_PRODUCERS]
collection_events = db[COLLECTION_EVENTS]

# Fonction pour scraper les détails d'un événement et mettre à jour MongoDB
def scrape_event_details(lien_url, lieu, lien_lieu, prix_reduit):
    response = requests.get(lien_url)
    if response.status_code != 200:
        print(f"❌ Erreur lors de la récupération de {lien_url}")
        return None

    soup = BeautifulSoup(response.text, 'html.parser')

    title_elem = soup.find(class_="font-title font-black uppercase text-xl md:text-[1.75rem] leading-tight")
    title = title_elem.text.strip() if title_elem else "Titre non disponible"

    schedule_elem = soup.find(class_="text-accent-foreground")
    prochaines_dates = schedule_elem.text.strip() if schedule_elem else "Dates non disponibles"

    horaires_elem = soup.find_all(class_="text-white")
    horaires = [horaire.text.strip() for horaire in horaires_elem]

    address_elem = soup.find(class_="flex-1 py-4 text-foreground")
    address = address_elem.text.strip() if address_elem else "Adresse non disponible"

    location_name_elem = soup.find(class_="text-foreground font-bold")
    location_name = location_name_elem.text.strip() if location_name_elem else "Lieu non disponible"

    details_elem = soup.find(class_="whitespace-pre-wrap break-words")
    details = details_elem.text.strip() if details_elem else "Détails non disponibles"

    category_elem = soup.find(class_="flex flex-wrap gap-2")
    category = category_elem.find(class_="text-sm tracking-wider h-11 rounded-full px-5 inline-flex items-center justify-center whitespace-nowrap font-bold uppercase transition-colors focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 text-primary border-border hover:border-primary/20 focus:border-primary/20 border bg-transparent") if category_elem else None
    category = category.text.strip().split()[0] if category else "Catégorie non disponible"


    images = [img['src'] for img in soup.find_all('img', src=True)]
    main_image = images[0] if images else "Image non disponible"

    lineup = []
    lineup_elems = soup.find_all(class_="flex flex-col gap-1.5")
    lineup_images = soup.find_all("img", class_="object-cover aspect-square rounded transition duration-200 hover:contrast-150")

    for i, elem in enumerate(lineup_elems):
        lineup_entry = {
            "nom": elem.text.strip(),
            "image": lineup_images[i]["src"] if i < len(lineup_images) else "Image non disponible"
        }
        lineup.append(lineup_entry)

    event_data = {
        "intitulé": title,
        "catégorie": category,
        "détail": details,
        "lieu": location_name,
        "lien_lieu": lien_lieu,
        "prochaines_dates": prochaines_dates,
        "prix_reduit": prix_reduit,  # 🔥 Utilise le prix récupéré depuis MongoDB
        "ancien_prix": "",
        "note": "Note non disponible",
        "image": main_image,
        "site_url": lien_url,
        "purchase_url": lien_url,
        "commentaires": [],
        "catégories_prix": [],
        "location": {"adresse": address},
        "horaires": [
            {"jour": prochaines_dates.split()[0], "heure": " - ".join(horaires) if horaires else "Non disponible"}
        ],
        "lineup": lineup
    }

    print("\n📢 Résultats du scraping :")
    for key, value in event_data.items():
        print(f"{key}: {value}")

    # Ajout ou mise à jour dans la base de données des événements
    event_id = collection_events.find_one_and_update(
        {"site_url": lien_url},
        {"$set": event_data},
        upsert=True,
        return_document=True
    )["_id"]  # 🔥 Récupère l’_id de l’événement inséré


    # Mise à jour dans la base des producteurs
    producer_doc = collection_producers.find_one(
        {"lieu": lieu, "evenements.lien_url": lien_url},  # ✅ Vérification basée sur `lien_url`
        {"evenements.$": 1}
    )

    if producer_doc:  # ✅ L'événement existe déjà
        collection_producers.update_one(
            {"lieu": lieu, "evenements.lien_url": lien_url},  # 🎯 Cherche avec `lien_url`
            {"$set": {
                "evenements.$.catégorie": category,
                "evenements.$.image": main_image,
                "evenements.$.lien_evenement": f"/Loisir_Paris_Evenements/{event_id}"  # 🔥 Création de `lien_evenement`
            }}
        )

# Récupération de tous les producteurs en commençant par "La Clairière"
producers_cursor = collection_producers.find({}, {"lieu": 1, "lien_lieu": 1, "evenements": 1})

found_clairiere = False

for producer in producers_cursor:
    lieu = producer["lieu"]
    lien_lieu = producer.get("lien_lieu", "Lien non disponible")

    if not found_clairiere:
        if lieu == "REX CLUB":
            found_clairiere = True
        else:
            continue  # Ignore les lieux avant "La Clairière"

    event_doc = collection_producers.find_one({"lieu": lieu}, {"evenements": 1})

    if not event_doc or "evenements" not in event_doc or not event_doc["evenements"]:
        print(f"❌ Aucun événement trouvé pour '{lieu}', on passe au suivant...")
        continue

    print(f"\n✅ {len(event_doc['evenements'])} événements trouvés pour '{lieu}' :")

    for ev in event_doc["evenements"]:
        lien_url = ev.get("lien_url")  # 🔥 Récupération avec lien_url
        prix_reduit = ev.get("prix", "Prix non disponible")  # 🔥 Récupère aussi le prix
        if lien_url:
            print(f"🔗 Scraping de l'événement : {lien_url} (Prix : {prix_reduit})")
            scrape_event_details(lien_url, lieu, lien_lieu, prix_reduit)  # 🔥 Utilisation de lien_url


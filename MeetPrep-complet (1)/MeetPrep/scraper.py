import asyncio
import json
import logging
import os

from dotenv import load_dotenv
from crawl4ai import AsyncWebCrawler
from langchain_core.messages import HumanMessage
from langchain_google_genai import ChatGoogleGenerativeAI

load_dotenv()
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

URL = "https://www.Novalys Conseil/global/fr"   # à remplacer par le site du client
MODEL_NAME = os.getenv("MODEL_NAME", "gemini-2.5-flash")

# On ne donne plus de positions : seulement CE QU'ON CHERCHE
CHAMPS = [
    "Secteur (NAF/APE)",
    "Produits / services",
    "Clients ou partenaires majeurs",
    "Actualités/projets en cours",
    "CA estimé",
    "Effectif",
    "Localisation (pays / régions)",
    "Profil LinkedIn responsable client",
]

model = ChatGoogleGenerativeAI(
    model=MODEL_NAME,
    google_api_key=os.getenv("GOOGLE_API_KEY"),
    temperature=0,          # 0 = réponses stables, moins d'invention
)


def extraire_avec_ia(texte_page: str) -> dict:
    champs = "\n".join(f"- {c}" for c in CHAMPS)
    prompt = f"""Tu extrais des informations sur une entreprise à partir du texte d'une page web.

Champs à remplir :
{champs}

Règles :
- Utilise UNIQUEMENT le texte fourni ci-dessous.
- Si une information n'est pas dans le texte, écris exactement "Not found". N'invente rien.
- Réponds uniquement avec un objet JSON valide, avec exactement ces champs comme clés.

Texte de la page :
{texte_page[:15000]}
"""
    reponse = model.invoke([HumanMessage(content=prompt)])
    contenu = reponse.content
    if isinstance(contenu, list):   # certains modèles renvoient des blocs
        contenu = "".join(b.get("text", "") if isinstance(b, dict) else str(b) for b in contenu)
    contenu = contenu.replace("```json", "").replace("```", "").strip()
    data = json.loads(contenu[contenu.find("{"): contenu.rfind("}") + 1])
    return {c: data.get(c, "Not found") for c in CHAMPS}


async def main():
    data = {c: "Not found" for c in CHAMPS}
    try:
        # 1. Le navigateur invisible récupère le texte de la page
        async with AsyncWebCrawler() as crawler:
            result = await crawler.arun(url=URL)
        texte = result.markdown
        if not texte:
            raise ValueError("Page vide ou inaccessible")

        # 2. L'IA lit le texte et remplit la fiche
        data = extraire_avec_ia(str(texte))
        logger.info("Extraction terminée")
    except Exception as e:
        logger.error(f"Erreur : {e}")
        data["error"] = str(e)

    # 3. Sauvegarde
    with open("company_data.json", "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=4)
    print(json.dumps(data, ensure_ascii=False, indent=4))


if __name__ == "__main__":
    asyncio.run(main())
import os
from fastapi import HTTPException
from pymongo import MongoClient
from pymongo.errors import PyMongoError
from dotenv import load_dotenv

env_path = os.path.join(os.path.dirname(__file__), "backend", ".env")
if os.path.exists(env_path):
    load_dotenv(env_path)
else:
    load_dotenv()

MONGO_URI = os.getenv("MONGO_URI")
if not MONGO_URI:
    raise ValueError("MONGO_URI no está configurada. Por favor, asegúrate de tener un archivo .env válido.")
MONGO_DB = os.getenv("MONGO_DB", "finanzas_db")

_db = None


def get_db():
    global _db
    if _db is None:
        try:
            client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=3000)
            _db = client[MONGO_DB]
        except PyMongoError as e:
            raise HTTPException(status_code=503, detail=f"MongoDB no disponible: {e}")
    return _db

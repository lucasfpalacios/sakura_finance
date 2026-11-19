"""Autenticación: Google + email/contraseña, sesiones JWT e invitaciones.

Variables de entorno:
- JWT_SECRET (obligatoria): clave para firmar los tokens de sesión.
- OWNER_EMAIL: email del dueño. Puede crear cuenta sin invitación, genera invitaciones
  y al iniciar sesión recibe los datos cargados antes de que existieran usuarios.
- GOOGLE_CLIENT_ID: Client ID de OAuth de Google (sin él, solo funciona email/contraseña).
"""
import os
import re
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

import bcrypt
import jwt
from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field

from db import get_db

JWT_SECRET = os.getenv("JWT_SECRET")
if not JWT_SECRET:
    raise ValueError("JWT_SECRET no está configurada. Agrégala a las variables de entorno.")
OWNER_EMAIL = (os.getenv("OWNER_EMAIL") or "").strip().lower()
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID")

SESSION_DAYS = 30
INVITE_DAYS = 7

# Documentos de la etapa sin usuarios: pasan al dueño en su primer inicio de sesión
LEGACY_DOCS = {"wallet": "main_wallet", "investments": "main_portfolio", "planning": "main_plan"}

router = APIRouter(prefix="/api")
bearer = HTTPBearer(auto_error=False)


# ---------- Helpers ----------

def now() -> datetime:
    return datetime.now(timezone.utc)


def public_user(user: dict) -> dict:
    return {
        "id": user["id"],
        "email": user["email"],
        "name": user.get("name") or user["email"].split("@")[0],
        "picture": user.get("picture"),
        "role": user.get("role", "user"),
        "has_password": bool(user.get("password_hash")),
        "has_google": bool(user.get("google_sub")),
    }


def create_token(user_id: str) -> str:
    payload = {"sub": user_id, "iat": now(), "exp": now() + timedelta(days=SESSION_DAYS)}
    return jwt.encode(payload, JWT_SECRET, algorithm="HS256")


def claim_legacy_data(user_id: str) -> None:
    """Asigna al dueño los datos guardados antes de tener usuarios. Idempotente."""
    db = get_db()
    for coll, legacy_id in LEGACY_DOCS.items():
        legacy = db[coll].find_one({"_id": legacy_id})
        if not legacy:
            continue
        if db[coll].find_one({"_id": user_id}):
            # El dueño ya tiene datos propios: no pisarlos, dejar el legacy intacto
            continue
        legacy["_id"] = user_id
        db[coll].insert_one(legacy)
        db[coll].delete_one({"_id": legacy_id})
    db["debts"].update_many({"user_id": {"$exists": False}}, {"$set": {"user_id": user_id}})


def session_response(user: dict) -> dict:
    if user.get("role") == "owner":
        claim_legacy_data(user["id"])
    return {"token": create_token(user["id"]), "user": public_user(user)}


def find_valid_invite(token: Optional[str]) -> Optional[dict]:
    if not token:
        return None
    invite = get_db()["invites"].find_one({"token": token})
    if not invite or invite.get("used_by") or invite.get("revoked"):
        return None
    expires = invite["expires_at"]
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)
    if expires < now():
        return None
    return invite


def create_user(email: str, invite_token: Optional[str], email_verified: bool, **fields) -> dict:
    """Crea un usuario si es el dueño (con email verificado por Google) o trae una invitación válida."""
    email = email.strip().lower()
    is_owner_email = bool(OWNER_EMAIL) and email == OWNER_EMAIL
    if is_owner_email and not email_verified:
        # Sin esto, cualquiera podría registrarse con el email del dueño y quedarse con sus datos
        raise HTTPException(status_code=403, detail="Esta cuenta debe crearse con el botón de Google.")
    is_owner = is_owner_email
    invite = None
    if not is_owner:
        invite = find_valid_invite(invite_token)
        if not invite:
            raise HTTPException(
                status_code=403,
                detail="Para crear una cuenta necesitas un link de invitación válido.",
            )
    user = {
        "id": uuid.uuid4().hex,
        "email": email,
        "role": "owner" if is_owner else "user",
        "created_at": now(),
        **fields,
    }
    get_db()["users"].insert_one(user)
    if invite:
        get_db()["invites"].update_one(
            {"token": invite["token"]}, {"$set": {"used_by": email, "used_at": now()}}
        )
    return user


# ---------- Dependencias ----------

def get_current_user(creds: Optional[HTTPAuthorizationCredentials] = Depends(bearer)) -> dict:
    if not creds:
        raise HTTPException(status_code=401, detail="Inicia sesión para continuar.")
    try:
        payload = jwt.decode(creds.credentials, JWT_SECRET, algorithms=["HS256"])
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Sesión inválida o vencida.")
    user = get_db()["users"].find_one({"id": payload.get("sub")}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="Usuario no encontrado.")
    return user


def require_owner(user: dict = Depends(get_current_user)) -> dict:
    if user.get("role") != "owner":
        raise HTTPException(status_code=403, detail="Solo el dueño puede hacer esto.")
    return user


# ---------- Schemas ----------

class GoogleLoginSchema(BaseModel):
    credential: str
    invite: Optional[str] = None


class RegisterSchema(BaseModel):
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=8, max_length=128)
    name: str = Field(default="", max_length=100)
    invite: Optional[str] = None


class LoginSchema(BaseModel):
    email: str
    password: str


class PasswordSchema(BaseModel):
    new_password: str = Field(min_length=8, max_length=128)
    current_password: Optional[str] = None


class ProfileSchema(BaseModel):
    name: Optional[str] = Field(default=None, max_length=60)
    # data URL de la imagen ya recortada/achicada en el navegador; null = quitar foto
    picture: Optional[str] = None


MAX_PICTURE_CHARS = 300_000  # ~220 KB en base64; el frontend manda ~20-40 KB
PICTURE_RE = re.compile(r"^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$")


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


# ---------- Endpoints de sesión ----------

@router.post("/auth/google")
def login_google(data: GoogleLoginSchema):
    if not GOOGLE_CLIENT_ID:
        raise HTTPException(status_code=503, detail="El inicio de sesión con Google no está configurado.")
    # Import diferido: solo se necesita para este endpoint
    from google.oauth2 import id_token
    from google.auth.transport import requests as google_requests
    try:
        info = id_token.verify_oauth2_token(data.credential, google_requests.Request(), GOOGLE_CLIENT_ID)
    except ValueError:
        raise HTTPException(status_code=401, detail="No se pudo verificar la cuenta de Google.")
    if not info.get("email_verified"):
        raise HTTPException(status_code=401, detail="El email de Google no está verificado.")

    email = info["email"].strip().lower()
    users = get_db()["users"]
    user = users.find_one({"google_sub": info["sub"]}, {"_id": 0}) or users.find_one({"email": email}, {"_id": 0})
    if user:
        # Vincula Google a una cuenta creada con email/contraseña y refresca nombre/foto
        updates = {"google_sub": info["sub"]}
        if not user.get("picture_custom"):
            updates["picture"] = info.get("picture")
        if not user.get("name"):
            updates["name"] = info.get("name")
        users.update_one({"id": user["id"]}, {"$set": updates})
        user.update(updates)
    else:
        user = create_user(
            email, data.invite, email_verified=True,
            name=info.get("name"), picture=info.get("picture"), google_sub=info["sub"],
        )
    return session_response(user)


@router.post("/auth/register")
def register(data: RegisterSchema):
    email = data.email.strip().lower()
    if "@" not in email:
        raise HTTPException(status_code=400, detail="Email inválido.")
    existing = get_db()["users"].find_one({"email": email})
    if existing:
        hint = (" Entra con Google y agrega una contraseña desde tu perfil."
                if existing.get("google_sub") and not existing.get("password_hash") else "")
        raise HTTPException(status_code=409, detail=f"Ya existe una cuenta con ese email.{hint}")
    password_hash = hash_password(data.password)
    user = create_user(email, data.invite, email_verified=False, name=data.name.strip() or None, password_hash=password_hash)
    return session_response(user)


@router.post("/auth/login")
def login(data: LoginSchema):
    user = get_db()["users"].find_one({"email": data.email.strip().lower()}, {"_id": 0})
    if not user or not user.get("password_hash"):
        if user and user.get("google_sub"):
            raise HTTPException(status_code=401, detail="Esta cuenta usa Google. Entra con Google y agrega una contraseña desde tu perfil.")
        raise HTTPException(status_code=401, detail="Email o contraseña incorrectos.")
    if not bcrypt.checkpw(data.password.encode(), user["password_hash"].encode()):
        raise HTTPException(status_code=401, detail="Email o contraseña incorrectos.")
    return session_response(user)


@router.get("/auth/me")
def me(user: dict = Depends(get_current_user)):
    return public_user(user)


@router.put("/auth/profile")
def update_profile(data: ProfileSchema, user: dict = Depends(get_current_user)):
    updates: dict = {}
    if "name" in data.model_fields_set:
        name = (data.name or "").strip()
        if not name:
            raise HTTPException(status_code=400, detail="El nombre no puede estar vacío.")
        updates["name"] = name
    if "picture" in data.model_fields_set:
        if data.picture is None:
            # Quitar foto: vuelve a la inicial (y Google podrá volver a poner la suya)
            updates["picture"] = None
            updates["picture_custom"] = False
        else:
            if len(data.picture) > MAX_PICTURE_CHARS or not PICTURE_RE.match(data.picture):
                raise HTTPException(status_code=400, detail="Imagen inválida o demasiado grande.")
            updates["picture"] = data.picture
            updates["picture_custom"] = True
    if not updates:
        raise HTTPException(status_code=400, detail="Sin cambios para aplicar.")
    get_db()["users"].update_one({"id": user["id"]}, {"$set": updates})
    return public_user({**user, **updates})


@router.put("/auth/password")
def set_password(data: PasswordSchema, user: dict = Depends(get_current_user)):
    """Agregar contraseña (cuenta creada con Google) o cambiarla. Misma cuenta, mismo email."""
    if user.get("password_hash"):
        if not data.current_password or not bcrypt.checkpw(data.current_password.encode(), user["password_hash"].encode()):
            raise HTTPException(status_code=400, detail="La contraseña actual no es correcta.")
    get_db()["users"].update_one({"id": user["id"]}, {"$set": {"password_hash": hash_password(data.new_password)}})
    return {"message": "Contraseña guardada", "user": public_user({**user, "password_hash": "x"})}


# ---------- Invitaciones (solo el dueño las genera) ----------

def public_invite(inv: dict) -> dict:
    expires = inv["expires_at"]
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)
    if inv.get("revoked"):
        status = "revoked"
    elif inv.get("used_by"):
        status = "used"
    elif expires < now():
        status = "expired"
    else:
        status = "pending"
    return {
        "token": inv["token"],
        "status": status,
        "created_at": inv["created_at"].isoformat(),
        "expires_at": expires.isoformat(),
        "used_by": inv.get("used_by"),
    }


@router.post("/invites")
def create_invite(owner: dict = Depends(require_owner)):
    invite = {
        "token": secrets.token_urlsafe(24),
        "created_by": owner["id"],
        "created_at": now(),
        "expires_at": now() + timedelta(days=INVITE_DAYS),
    }
    get_db()["invites"].insert_one(invite)
    return public_invite(invite)


@router.get("/invites")
def list_invites(owner: dict = Depends(require_owner)):
    cursor = get_db()["invites"].find({"created_by": owner["id"]}).sort("created_at", -1).limit(50)
    return [public_invite(i) for i in cursor]


@router.delete("/invites/{token}")
def revoke_invite(token: str, owner: dict = Depends(require_owner)):
    result = get_db()["invites"].update_one(
        {"token": token, "created_by": owner["id"], "used_by": {"$exists": False}},
        {"$set": {"revoked": True}},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Invitación no encontrada o ya usada.")
    return {"message": "Invitación revocada"}


@router.get("/invites/{token}/check")
def check_invite(token: str):
    """Público: la página de registro valida el link antes de mostrar el formulario."""
    return {"valid": find_valid_invite(token) is not None}

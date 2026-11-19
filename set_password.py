"""Crea una cuenta o le pone contraseña, escribiendo directo en la base.

Sirve para entrar sin Google (por ejemplo, la primera vez del dueño).
Requiere acceso a la base (MONGO_URI en backend/.env), por eso es seguro.

Uso:  .venv/bin/python set_password.py tu@email.com
"""
import sys
import uuid
from datetime import datetime, timezone
from getpass import getpass

from db import get_db
from auth import OWNER_EMAIL, hash_password


def main() -> None:
    if len(sys.argv) != 2:
        print("Uso: .venv/bin/python set_password.py tu@email.com")
        sys.exit(1)
    email = sys.argv[1].strip().lower()

    password = getpass("Nueva contraseña (mínimo 8 caracteres): ")
    if len(password) < 8:
        print("La contraseña debe tener al menos 8 caracteres.")
        sys.exit(1)
    if getpass("Repetir contraseña: ") != password:
        print("Las contraseñas no coinciden.")
        sys.exit(1)

    users = get_db()["users"]
    user = users.find_one({"email": email})
    if user:
        users.update_one({"_id": user["_id"]}, {"$set": {"password_hash": hash_password(password)}})
        print(f"Contraseña actualizada para {email}.")
    else:
        role = "owner" if OWNER_EMAIL and email == OWNER_EMAIL else "user"
        users.insert_one({
            "id": uuid.uuid4().hex,
            "email": email,
            "role": role,
            "created_at": datetime.now(timezone.utc),
            "password_hash": hash_password(password),
        })
        print(f"Cuenta creada para {email} (rol: {role}).")
    print("Ya puedes iniciar sesión con email y contraseña. Si después entras con Google con el mismo email, es la misma cuenta.")


if __name__ == "__main__":
    main()

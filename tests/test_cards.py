"""Tests de tarjetas con Mongo en memoria (no toca la base real).
Correr desde la raíz:  .venv/bin/python tests/test_cards.py
Requiere: .venv/bin/pip install -r requirements-dev.txt
"""
import os, sys
os.environ["JWT_SECRET"]="test-secret-test-secret-test-secret-123"; os.environ["OWNER_EMAIL"]="owner@example.com"
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import mongomock, db
db._db = mongomock.MongoClient()["test"]
import auth, uuid, main
from cards import first_statement, due_date, split_installments
from fastapi.testclient import TestClient
c = TestClient(main.app)
def check(cond, msg): print(("OK   " if cond else "FAIL ")+msg); assert cond, msg

# Reglas de fechas
check(first_statement("2026-11-20", 25)==(2026,11), "compra antes del cierre -> resumen del mes")
check(first_statement("2026-11-25", 25)==(2026,11), "compra el día del cierre -> resumen del mes")
check(first_statement("2026-11-26", 25)==(2026,12), "compra después del cierre -> resumen siguiente")
check(first_statement("2026-12-28", 25)==(2027,1), "cruce de año")
check(first_statement("2027-02-28", 31)==(2027,2), "cierre 31 en febrero -> último día")
check(due_date(2026,11,25,5).isoformat()=="2026-12-05", "vence el mes siguiente si due < cierre")
check(due_date(2026,11,3,15).isoformat()=="2026-11-15", "vence el mismo mes si due > cierre")
check(split_installments(100,3)==[33.33,33.33,33.34] and abs(sum(split_installments(100,3))-100)<1e-9, "cuotas suman el total")

# Usuarios
def mk(email):
    uid = uuid.uuid4().hex
    db._db["users"].insert_one({"id":uid,"email":email,"role":"user"})
    return {"Authorization": f"Bearer {auth.create_token(uid)}"}
A, B = mk("a@x.com"), mk("b@x.com")

check(c.get("/api/cards").status_code==401, "sin sesión -> 401")
check(c.post("/api/cards", json={"name":"Visa","closing_day":32,"due_day":5}, headers=A).status_code==422, "día de cierre inválido -> 422")
visa = c.post("/api/cards", json={"name":"Visa","bank":"Galicia","closing_day":25,"due_day":5,"limit":1000000}, headers=A).json()
master = c.post("/api/cards", json={"name":"Master","closing_day":10,"due_day":20}, headers=A).json()
p1 = c.post(f"/api/cards/{visa['id']}/purchases", json={"description":"Heladera","amount":120000,"currency":"ARS","date":"2026-11-26","installments":3}, headers=A).json()
c.post(f"/api/cards/{visa['id']}/purchases", json={"description":"Netflix","amount":10,"currency":"USD","date":"2026-12-02"}, headers=A)
c.post(f"/api/cards/{master['id']}/purchases", json={"description":"Super","amount":50000,"date":"2026-12-05"}, headers=A)
check(c.post(f"/api/cards/{visa['id']}/purchases", json={"description":"x","amount":1,"date":"26/11/2026"}, headers=A).status_code==400, "fecha mal formada -> 400")
check(c.post(f"/api/cards/{visa['id']}/purchases", json={"description":"x","amount":0,"date":"2026-11-01"}, headers=A).status_code==422, "monto 0 -> 422")

data = c.get("/api/cards", headers=A).json()
st = {(s["card_id"], s["month"]): s for s in data["statements"]}
check(set(m for (cid,m) in st if cid==visa["id"])=={"2026-12","2027-01","2027-02"}, "heladera 3 cuotas desde dic (compró después del cierre)")
dec = st[(visa["id"],"2026-12")]
check(dec["total_ars"]==40000 and dec["total_usd"]==10, "resumen dic Visa: ARS 40.000 + USD 10")
check(dec["due_date"]=="2027-01-05" and dec["closing_date"]=="2026-12-25", "fechas de cierre/vencimiento del resumen")
check([i["installment"] for i in st[(visa["id"],"2027-02")]["items"]]==[3], "cuota 3/3 en febrero")
check(st[(master["id"],"2026-12")]["total_ars"]==50000, "Master: compra 5/12 antes del cierre 10 -> resumen dic")

# Pagado
c.put(f"/api/cards/{visa['id']}/statements/2026-12", json={"paid":True}, headers=A)
check({(s["card_id"],s["month"]):s for s in c.get("/api/cards", headers=A).json()["statements"]}[(visa["id"],"2026-12")]["paid"], "marcar resumen pagado")
c.put(f"/api/cards/{visa['id']}/statements/2026-12", json={"paid":False}, headers=A)
check(not {(s["card_id"],s["month"]):s for s in c.get("/api/cards", headers=A).json()["statements"]}[(visa["id"],"2026-12")]["paid"], "desmarcar pagado")

# Editar compra / tarjeta
c.put(f"/api/cards/purchases/{p1['id']}", json={"installments":6}, headers=A)
check(len([s for s in c.get("/api/cards", headers=A).json()["statements"] if s["card_id"]==visa["id"]])==6, "editar cuotas a 6 -> 6 resúmenes")
c.put(f"/api/cards/{visa['id']}", json={"limit":None}, headers=A)
check([x for x in c.get("/api/cards", headers=A).json()["cards"] if x["id"]==visa["id"]][0]["limit"] is None, "quitar límite con null")
c.put(f"/api/cards/{visa['id']}", json={"name":"Visa Gold"}, headers=A)
v = [x for x in c.get("/api/cards", headers=A).json()["cards"] if x["id"]==visa["id"]][0]
check(v["name"]=="Visa Gold" and v["closing_day"]==25, "editar nombre conserva el resto")

# Aislamiento
check(c.get("/api/cards", headers=B).json()["cards"]==[], "otro usuario no ve tarjetas ajenas")
check(c.delete(f"/api/cards/purchases/{p1['id']}", headers=B).status_code==404, "otro usuario no borra compras ajenas")
check(c.post(f"/api/cards/{visa['id']}/purchases", json={"description":"x","amount":1,"date":"2026-11-01"}, headers=B).status_code==404, "otro usuario no carga en tarjeta ajena")

# Borrar tarjeta borra sus compras
c.delete(f"/api/cards/{master['id']}", headers=A)
d2 = c.get("/api/cards", headers=A).json()
check(all(p["card_id"]!=master["id"] for p in d2["purchases"]) and len(d2["cards"])==1, "borrar tarjeta borra sus compras")
c.delete(f"/api/cards/purchases/{p1['id']}", headers=A)
check(len(c.get("/api/cards", headers=A).json()["purchases"])==1, "borrar compra")
print("\nTARJETAS OK")

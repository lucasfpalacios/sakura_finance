"""Tarjetas de crédito: tarjetas, compras en cuotas y resúmenes mensuales.

Cada usuario tiene un documento en la colección "cards" con _id = user id:
    {"cards": [...], "purchases": [...]}

Reglas de resumen:
- Una compra hecha hasta el día de cierre (inclusive) entra en el resumen de ese mes;
  si es posterior, en el del mes siguiente. El "mes" del resumen es el mes en que cierra.
- La cuota k (0-based) cae en el resumen inicial + k meses.
- El vencimiento es el primer día de vencimiento posterior al cierre.
"""
import calendar
import uuid
from datetime import date
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from auth import get_current_user
from db import get_db

router = APIRouter(prefix="/api/cards")
CardCurrency = Literal["ARS", "USD"]


# ---------- Cálculo de fechas ----------

def _clamp_day(y: int, m: int, day: int) -> date:
    return date(y, m, min(day, calendar.monthrange(y, m)[1]))


def _add_months(y: int, m: int, n: int) -> tuple[int, int]:
    total = y * 12 + (m - 1) + n
    return total // 12, total % 12 + 1


def first_statement(purchase_date: str, closing_day: int) -> tuple[int, int]:
    d = date.fromisoformat(purchase_date)
    if d <= _clamp_day(d.year, d.month, closing_day):
        return d.year, d.month
    return _add_months(d.year, d.month, 1)


def closing_date(y: int, m: int, closing_day: int) -> date:
    return _clamp_day(y, m, closing_day)


def due_date(y: int, m: int, closing_day: int, due_day: int) -> date:
    if due_day > closing_day:
        return _clamp_day(y, m, due_day)
    ny, nm = _add_months(y, m, 1)
    return _clamp_day(ny, nm, due_day)


def split_installments(amount: float, n: int) -> list[float]:
    """Divide en n cuotas redondeadas a centavos; la última absorbe la diferencia."""
    base = round(amount / n, 2)
    parts = [base] * n
    parts[-1] = round(amount - base * (n - 1), 2)
    return parts


def build_statements(cards: list[dict], purchases: list[dict]) -> list[dict]:
    by_id = {c["id"]: c for c in cards}
    statements: dict[tuple[str, str], dict] = {}
    for p in purchases:
        card = by_id.get(p["card_id"])
        if not card:
            continue
        y, m = first_statement(p["date"], card["closing_day"])
        n = max(1, int(p.get("installments") or 1))
        for k, part in enumerate(split_installments(p["amount"], n)):
            sy, sm = _add_months(y, m, k)
            month = f"{sy:04d}-{sm:02d}"
            key = (card["id"], month)
            if key not in statements:
                statements[key] = {
                    "card_id": card["id"],
                    "month": month,
                    "closing_date": closing_date(sy, sm, card["closing_day"]).isoformat(),
                    "due_date": due_date(sy, sm, card["closing_day"], card["due_day"]).isoformat(),
                    "total_ars": 0.0,
                    "total_usd": 0.0,
                    "paid": month in card.get("paid_statements", []),
                    "items": [],
                }
            st = statements[key]
            st["items"].append({
                "purchase_id": p["id"],
                "description": p["description"],
                "date": p["date"],
                "installment": k + 1,
                "installments": n,
                "amount": part,
                "currency": p["currency"],
            })
            st["total_ars" if p["currency"] == "ARS" else "total_usd"] += part
    result = sorted(statements.values(), key=lambda s: (s["card_id"], s["month"]))
    for st in result:
        st["total_ars"] = round(st["total_ars"], 2)
        st["total_usd"] = round(st["total_usd"], 2)
        st["items"].sort(key=lambda i: i["date"])
    return result


# ---------- Persistencia ----------

def load(uid: str) -> dict:
    doc = get_db()["cards"].find_one({"_id": uid}) or {}
    return {"cards": doc.get("cards", []), "purchases": doc.get("purchases", [])}


def save(uid: str, data: dict) -> None:
    get_db()["cards"].replace_one({"_id": uid}, {"_id": uid, **data}, upsert=True)


def find_card(data: dict, card_id: str) -> dict:
    for c in data["cards"]:
        if c["id"] == card_id:
            return c
    raise HTTPException(status_code=404, detail="Tarjeta no encontrada")


def find_purchase(data: dict, purchase_id: str) -> dict:
    for p in data["purchases"]:
        if p["id"] == purchase_id:
            return p
    raise HTTPException(status_code=404, detail="Compra no encontrada")


# ---------- Schemas ----------

class CardSchema(BaseModel):
    name: str = Field(min_length=1, max_length=40)
    bank: str = Field(default="", max_length=40)
    closing_day: int = Field(ge=1, le=31)
    due_day: int = Field(ge=1, le=31)
    limit: Optional[float] = Field(default=None, ge=0)
    color: str = Field(default="pink", max_length=20)


class CardUpdateSchema(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=40)
    bank: Optional[str] = Field(default=None, max_length=40)
    closing_day: Optional[int] = Field(default=None, ge=1, le=31)
    due_day: Optional[int] = Field(default=None, ge=1, le=31)
    limit: Optional[float] = Field(default=None, ge=0)
    color: Optional[str] = Field(default=None, max_length=20)


class PurchaseSchema(BaseModel):
    description: str = Field(min_length=1, max_length=80)
    amount: float = Field(gt=0)
    currency: CardCurrency = "ARS"
    date: str
    installments: int = Field(default=1, ge=1, le=60)


class PurchaseUpdateSchema(BaseModel):
    card_id: Optional[str] = None
    description: Optional[str] = Field(default=None, min_length=1, max_length=80)
    amount: Optional[float] = Field(default=None, gt=0)
    currency: Optional[CardCurrency] = None
    date: Optional[str] = None
    installments: Optional[int] = Field(default=None, ge=1, le=60)


class PaidSchema(BaseModel):
    paid: bool


def _check_date(value: str) -> None:
    try:
        date.fromisoformat(value)
    except ValueError:
        raise HTTPException(status_code=400, detail="Fecha inválida (formato AAAA-MM-DD).")


# ---------- Endpoints ----------
# Las rutas /purchases/... se declaran antes que /{card_id} para que no las capture esa.

@router.get("")
def get_cards(user: dict = Depends(get_current_user)):
    data = load(user["id"])
    return {**data, "statements": build_statements(data["cards"], data["purchases"])}


@router.post("")
def add_card(body: CardSchema, user: dict = Depends(get_current_user)):
    data = load(user["id"])
    card = {"id": uuid.uuid4().hex, **body.model_dump(), "paid_statements": []}
    data["cards"].append(card)
    save(user["id"], data)
    return card


@router.put("/purchases/{purchase_id}")
def update_purchase(purchase_id: str, body: PurchaseUpdateSchema, user: dict = Depends(get_current_user)):
    data = load(user["id"])
    purchase = find_purchase(data, purchase_id)
    updates = body.model_dump(exclude_unset=True, exclude_none=True)
    if "card_id" in updates:
        find_card(data, updates["card_id"])
    if "date" in updates:
        _check_date(updates["date"])
    purchase.update(updates)
    save(user["id"], data)
    return purchase


@router.delete("/purchases/{purchase_id}")
def delete_purchase(purchase_id: str, user: dict = Depends(get_current_user)):
    data = load(user["id"])
    find_purchase(data, purchase_id)
    data["purchases"] = [p for p in data["purchases"] if p["id"] != purchase_id]
    save(user["id"], data)
    return {"message": "Compra eliminada"}


@router.put("/{card_id}")
def update_card(card_id: str, body: CardUpdateSchema, user: dict = Depends(get_current_user)):
    data = load(user["id"])
    card = find_card(data, card_id)
    updates = body.model_dump(exclude_unset=True)
    # limit=null explícito = sin límite; el resto de los null se ignoran
    for k, v in updates.items():
        if v is not None or k == "limit":
            card[k] = v
    save(user["id"], data)
    return card


@router.delete("/{card_id}")
def delete_card(card_id: str, user: dict = Depends(get_current_user)):
    data = load(user["id"])
    find_card(data, card_id)
    data["cards"] = [c for c in data["cards"] if c["id"] != card_id]
    data["purchases"] = [p for p in data["purchases"] if p["card_id"] != card_id]
    save(user["id"], data)
    return {"message": "Tarjeta eliminada"}


@router.post("/{card_id}/purchases")
def add_purchase(card_id: str, body: PurchaseSchema, user: dict = Depends(get_current_user)):
    data = load(user["id"])
    find_card(data, card_id)
    _check_date(body.date)
    purchase = {"id": uuid.uuid4().hex, "card_id": card_id, **body.model_dump()}
    data["purchases"].append(purchase)
    save(user["id"], data)
    return purchase


@router.put("/{card_id}/statements/{month}")
def set_statement_paid(card_id: str, month: str, body: PaidSchema, user: dict = Depends(get_current_user)):
    data = load(user["id"])
    card = find_card(data, card_id)
    paid = set(card.get("paid_statements", []))
    if body.paid:
        paid.add(month)
    else:
        paid.discard(month)
    card["paid_statements"] = sorted(paid)
    save(user["id"], data)
    return {"message": "Resumen actualizado", "paid": body.paid}

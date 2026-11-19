from typing import Optional, Literal, List
from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from datetime import datetime
from models import Category, Transaction, Investment, Portfolio, Debt, PlanItem, BudgetPlan
from db import get_db
from auth import router as auth_router, get_current_user

# Cada usuario tiene su documento de wallet / investments / planning con _id = user id,
# y sus deudas llevan el campo user_id.
CurrentUser = Depends(get_current_user)

app = FastAPI()
app.include_router(auth_router)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class CategorySchema(BaseModel):
    name: str
    type: Literal["expense", "income"] = "expense"


class TransactionSchema(BaseModel):
    amount: float
    description: str
    category_name: str
    date: Optional[str] = None


class TransactionUpdateSchema(BaseModel):
    amount: Optional[float] = None
    description: Optional[str] = None
    date: Optional[str] = None


class InvestmentSchema(BaseModel):
    ticker: str
    name: str
    type: str
    quantity: float
    purchase_price: float
    date: Optional[str] = None


class DebtSchema(BaseModel):
    creditor: str
    amount: float
    currency: str = "ARS"
    description: str = ""
    due_date: Optional[str] = None
    status: Literal["pending", "paid"] = "pending"
    deadline: Optional[str] = None


class DebtUpdateSchema(BaseModel):
    creditor: Optional[str] = None
    amount: Optional[float] = None
    currency: Optional[str] = None
    description: Optional[str] = None
    due_date: Optional[str] = None
    status: Optional[Literal["pending", "paid"]] = None
    deadline: Optional[str] = None


PlanKind = Literal["fixed", "planned", "goals"]


class IncomeSchema(BaseModel):
    amount: float
    currency: str = "ARS"


class PlanItemSchema(BaseModel):
    name: str
    amount: float
    currency: str = "ARS"
    date: Optional[str] = None
    saved: float = 0.0
    installments: Optional[int] = Field(default=None, ge=1, le=120)


class DebtMonthsSchema(BaseModel):
    months: Optional[int] = Field(default=None, ge=1, le=120)  # None = quitar del plan


class PlanItemUpdateSchema(BaseModel):
    name: Optional[str] = None
    amount: Optional[float] = None
    currency: Optional[str] = None
    date: Optional[str] = None
    saved: Optional[float] = None
    installments: Optional[int] = Field(default=None, ge=1, le=120)


def load_wallet(uid: str) -> Category:
    data = get_db()["wallet"].find_one({"_id": uid})
    if data:
        return Category.from_dict(data)
    return Category("Mis Finanzas")


def save_wallet(uid: str, wallet: Category) -> None:
    data = wallet.to_dict()
    data["_id"] = uid
    get_db()["wallet"].replace_one({"_id": uid}, data, upsert=True)


def load_portfolio(uid: str) -> Portfolio:
    data = get_db()["investments"].find_one({"_id": uid})
    if data:
        return Portfolio.from_dict(data)
    return Portfolio()


def save_portfolio(uid: str, portfolio: Portfolio) -> None:
    data = portfolio.to_dict()
    data["_id"] = uid
    get_db()["investments"].replace_one({"_id": uid}, data, upsert=True)


@app.get("/api/report")
def get_report(month: Optional[str] = None, user: dict = CurrentUser):
    wallet = load_wallet(user["id"])
    if month:
        wallet = wallet.filter_by_month(month)
    return wallet.to_dict()


@app.post("/api/category")
def add_category(data: CategorySchema, user: dict = CurrentUser):
    wallet = load_wallet(user["id"])

    for cat in wallet.subcategories:
        if cat.name.lower() == data.name.lower():
            raise HTTPException(status_code=400, detail="La categoría ya existe")

    wallet.add_subcategory(Category(data.name, data.type))
    save_wallet(user["id"], wallet)
    return {"message": f"Categoría '{data.name}' creada con éxito"}


@app.post("/api/transaction")
def add_transaction(data: TransactionSchema, user: dict = CurrentUser):
    wallet = load_wallet(user["id"])

    target = None
    for cat in wallet.subcategories:
        if cat.name.lower() == data.category_name.lower():
            target = cat
            break

    if not target:
        raise HTTPException(
            status_code=404,
            detail=f"No existe la categoría '{data.category_name}'. Créala primero."
        )

    tx_date = data.date or datetime.now().strftime("%Y-%m-%d")
    target.add_transaction(Transaction(data.amount, data.description, tx_date))
    save_wallet(user["id"], wallet)
    return {"message": "Transacción guardada", "total_actual": wallet.get_total()}


@app.put("/api/transaction/{tx_id}")
def update_transaction(tx_id: str, data: TransactionUpdateSchema, user: dict = CurrentUser):
    wallet = load_wallet(user["id"])
    new_data = {k: v for k, v in data.dict().items() if v is not None}
    if not wallet.edit_transaction(tx_id, new_data):
        raise HTTPException(status_code=404, detail="Transacción no encontrada")
    save_wallet(user["id"], wallet)
    return {"message": "Transacción actualizada"}


@app.delete("/api/transaction/{tx_id}")
def delete_transaction(tx_id: str, user: dict = CurrentUser):
    wallet = load_wallet(user["id"])
    if not wallet.delete_transaction(tx_id):
        raise HTTPException(status_code=404, detail="Transacción no encontrada")
    save_wallet(user["id"], wallet)
    return {"message": "Transacción eliminada"}


@app.get("/api/investments")
def get_investments(user: dict = CurrentUser):
    return load_portfolio(user["id"]).to_dict()


@app.post("/api/investments")
def add_investment(data: InvestmentSchema, user: dict = CurrentUser):
    portfolio = load_portfolio(user["id"])
    inv_date = data.date or datetime.now().strftime("%Y-%m-%d")
    portfolio.add_investment(Investment(
        data.ticker, data.name, data.type,
        data.quantity, data.purchase_price, inv_date
    ))
    save_portfolio(user["id"], portfolio)
    return {"message": "Inversión guardada"}


@app.delete("/api/investments/{inv_id}")
def delete_investment(inv_id: str, user: dict = CurrentUser):
    portfolio = load_portfolio(user["id"])
    if not portfolio.delete_investment(inv_id):
        raise HTTPException(status_code=404, detail="Inversión no encontrada")
    save_portfolio(user["id"], portfolio)
    return {"message": "Inversión eliminada"}


@app.get("/api/debts")
def get_debts(user: dict = CurrentUser):
    cursor = get_db()["debts"].find({"user_id": user["id"]}, {"_id": 0})
    return [Debt.from_dict(d).to_dict() for d in cursor]


@app.post("/api/debts")
def add_debt(data: DebtSchema, user: dict = CurrentUser):
    debt = Debt(
        data.creditor, data.amount, data.currency,
        data.description, data.due_date, data.status,
        deadline=data.deadline,
    )
    get_db()["debts"].insert_one({**debt.to_dict(), "user_id": user["id"]})
    return debt.to_dict()


@app.put("/api/debts/{debt_id}")
def update_debt(debt_id: str, data: DebtUpdateSchema, user: dict = CurrentUser):
    updates = {k: v for k, v in data.dict().items() if v is not None}
    # deadline=null enviado explícitamente significa "sin vencimiento"
    if "deadline" in data.model_fields_set:
        updates["deadline"] = data.deadline
    if not updates:
        raise HTTPException(status_code=400, detail="Sin cambios para aplicar")
    result = get_db()["debts"].update_one({"id": debt_id, "user_id": user["id"]}, {"$set": updates})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Deuda no encontrada")
    return {"message": "Deuda actualizada"}


@app.delete("/api/debts/{debt_id}")
def delete_debt(debt_id: str, user: dict = CurrentUser):
    result = get_db()["debts"].delete_one({"id": debt_id, "user_id": user["id"]})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Deuda no encontrada")
    return {"message": "Deuda eliminada"}


def load_plan(uid: str) -> BudgetPlan:
    data = get_db()["planning"].find_one({"_id": uid})
    if data:
        return BudgetPlan.from_dict(data)
    return BudgetPlan()


def save_plan(uid: str, plan: BudgetPlan) -> None:
    data = plan.to_dict()
    data["_id"] = uid
    get_db()["planning"].replace_one({"_id": uid}, data, upsert=True)


@app.get("/api/planning")
def get_planning(user: dict = CurrentUser):
    return load_plan(user["id"]).to_dict()


@app.put("/api/planning/income")
def update_income(data: IncomeSchema, user: dict = CurrentUser):
    plan = load_plan(user["id"])
    plan.monthly_income = data.amount
    plan.income_currency = data.currency
    save_plan(user["id"], plan)
    return {"message": "Ingreso actualizado"}


# Debe declararse antes de /api/planning/{kind}/{item_id} para que "debts" no caiga en esa ruta
@app.put("/api/planning/debts/{debt_id}")
def update_debt_months(debt_id: str, data: DebtMonthsSchema, user: dict = CurrentUser):
    plan = load_plan(user["id"])
    plan.set_debt_months(debt_id, data.months)
    save_plan(user["id"], plan)
    return {"message": "Plazo actualizado"}


@app.post("/api/planning/{kind}")
def add_plan_item(kind: PlanKind, data: PlanItemSchema, user: dict = CurrentUser):
    plan = load_plan(user["id"])
    item = PlanItem(data.name, data.amount, data.currency, data.date, data.saved, installments=data.installments)
    plan.add_item(kind, item)
    save_plan(user["id"], plan)
    return item.to_dict()


@app.put("/api/planning/{kind}/{item_id}")
def update_plan_item(kind: PlanKind, item_id: str, data: PlanItemUpdateSchema, user: dict = CurrentUser):
    plan = load_plan(user["id"])
    # exclude_unset: permite enviar date=null para borrar una fecha
    if not plan.edit_item(kind, item_id, data.dict(exclude_unset=True)):
        raise HTTPException(status_code=404, detail="Ítem no encontrado")
    save_plan(user["id"], plan)
    return {"message": "Ítem actualizado"}


@app.delete("/api/planning/{kind}/{item_id}")
def delete_plan_item(kind: PlanKind, item_id: str, user: dict = CurrentUser):
    plan = load_plan(user["id"])
    if not plan.delete_item(kind, item_id):
        raise HTTPException(status_code=404, detail="Ítem no encontrado")
    save_plan(user["id"], plan)
    return {"message": "Ítem eliminado"}

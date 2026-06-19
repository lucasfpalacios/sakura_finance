Markdown
# 🌸 Sakura Finance

[![English](https://img.shields.io/badge/Language-English-blue)](#english) [![Español](https://img.shields.io/badge/Idioma-Español-green)](#español)

---

<a id="english"></a>
## 🇬🇧 English

**Sakura Finance** is a full-stack personal finance management application designed to help users cleanly and efficiently track their debts, transactions, and investments.

The architecture strictly separates a high-performance Python API from a modern React/Next.js web frontend, providing a scalable and fully cloud-deployed system.

### ✨ Features
* **Transaction Tracking:** Easily log daily income and expenses.
* **Debt Management:** Keep a clear and structured record of active debts, creditors, and payment statuses.
* **Investment Dashboard:** Monitor your assets, portfolio breakdown, and historical performance.
* **Cloud Architecture:** Fully optimized for zero-downtime integration between decentralized cloud infrastructure providers.

### 🛠️ Tech Stack
* **Frontend:** Next.js / React (TypeScript)
* **Backend:** Python / FastAPI (Uvicorn)
* **Database:** MongoDB
* **Deployment:** Vercel (Frontend) & Render (Backend API)

### 🚀 Local Setup

To run this project locally, ensure you have Node.js and Python 3.10+ installed on your system.

**1. Clone the repository:**
```bash
git clone [https://github.com/lucasfpalacios/sakura_finance.git](https://github.com/lucasfpalacios/sakura_finance.git)
cd sakura_finance
2. Backend Setup:

Bash
cd backend
# Create a virtual environment and activate it
python -m venv venv
source venv/bin/activate  # On Windows use: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Run the FastAPI server (running on [http://127.0.0.1:8000](http://127.0.0.1:8000) by default)
python main.py
3. Frontend Setup:
Open a new terminal window at the root of the repository.

Bash
cd frontend

# Install npm dependencies
npm install

# Configure environment variables for local development
echo "NEXT_PUBLIC_API_URL=[http://127.0.0.1:8000](http://127.0.0.1:8000)" > .env.local

# Start the Next.js local development server
npm run dev
Open http://localhost:3000 in your web browser to interact with the application.

🇪🇸 Español
Sakura Finance es una aplicación full-stack de gestión de finanzas personales diseñada para ayudar a los usuarios a realizar un seguimiento ordenado y eficiente de sus deudas, transacciones e inversiones.

La arquitectura separa de forma estricta una API de alto rendimiento en Python de un frontend web moderno basado en React/Next.js, logrando un sistema escalable y completamente desplegado en la nube.

✨ Características Principales
Registro de Transacciones: Control centralizado de ingresos y gastos diarios de manera fluida.

Gestión de Deudas: Historial estructurado de acreedores, vencimientos y estados de pago.

Panel de Inversiones: Monitoreo activo de activos financieros, evolución de carteras y rendimiento.

Preparado para Producción: Configuración completa para integración continua y despliegue en entornos distribuidos.

🛠️ Tecnologías Utilizadas
Frontend: Next.js / React (TypeScript)

Backend: Python / FastAPI (Uvicorn)

Base de Datos: MongoDB

Despliegue: Vercel (Frontend) y Render (API Backend)

🚀 Instalación Local
Para ejecutar este proyecto de forma local, es necesario contar con Node.js y Python 3.10+ instalados en el sistema.

1. Clonar el repositorio:

Bash
git clone [https://github.com/lucasfpalacios/sakura_finance.git](https://github.com/lucasfpalacios/sakura_finance.git)
cd sakura_finance
2. Configuración del Backend:

Bash
cd backend
# Crear un entorno virtual y activarlo
python -m venv venv
source venv/bin/activate  # En Windows usar: venv\Scripts\activate

# Instalar dependencias requeridas
pip install -r requirements.txt

# Iniciar el servidor FastAPI (ejecutándose en [http://127.0.0.1:8000](http://127.0.0.1:8000))
python main.py
3. Configuración del Frontend:
Abrir una nueva terminal en la raíz del repositorio.

Bash
cd frontend

# Instalar los módulos de npm
npm install

# Configurar las variables de entorno locales
echo "NEXT_PUBLIC_API_URL=[http://127.0.0.1:8000](http://127.0.0.1:8000)" > .env.local

# Iniciar el servidor de desarrollo de Next.js
npm run dev
Abrir http://localhost:3000 en el navegador para visualizar la plataforma en tiempo real.

Desarrollado con fines profesionales y académicos por Lucas Facundo Palacios.

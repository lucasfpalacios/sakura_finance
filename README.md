readme_content = """# 🌸 Sakura Finance

[![English](https://img.shields.io/badge/Language-English-blue)](#english) [![Español](https://img.shields.io/badge/Idioma-Español-green)](#español)

---

<a id="english"></a>
## 🇬🇧 English

**Sakura Finance** is a production-ready, full-stack personal finance architecture built to help users manage everyday liquidity, track ongoing debts, and monitor investment portfolios. 

The system implements a modern decoupled architecture: a high-performance asynchronous API backend powered by Python and FastAPI, coupled with a server-side rendered frontend dashboard built using React and Next.js. Production data is managed persistently through a cloud-hosted MongoDB cluster.

### ✨ Core Architecture & Features
* **Asynchronous Backend API:** Optimized REST endpoints leveraging FastAPI, Pydantic data validation, and native MongoDB integration.
* **Modern Client Dashboard:** Component-driven UI developed in Next.js utilizing TypeScript, React hooks, and strict environment configuration.
* **Dynamic Transaction Ledgers:** Full tracking of income and expenses with precise categorical breakdown.
* **Debt Management Ledger:** Comprehensive visibility into active creditors, structured payment statuses, and maturity limits.
* **Asset & Investment Dashboard:** Dynamic monitoring of financial assets, multi-tenant adaptability, and historic valuation analysis.
* **Cross-Origin Resource Sharing (CORS):** Clean middleware configurations ready to secure production traffic from verified client domains.

### 🛠️ Technology Stack
* **Frontend Architecture:** [Next.js](https://nextjs.org/) / React / TypeScript / Node.js
* **Backend Runtime:** Python 3.10+ / [FastAPI](https://fastapi.tiangolo.com/) / Uvicorn
* **Database Infrastructure:** MongoDB Cluster (NoSQL)
* **Cloud Infrastructure:** Vercel (Client Deployment) & Render (API Web Service Deployment)

---

### 🚀 Local Development Setup

Ensure you have Node.js (v18+) and Python 3.10+ installed on your system before proceeding.

#### 1. Clone the Source Repository

#### 2. Backend Server Installation
Navigate into the backend ecosystem directory to establish your isolated runtime:

Bash
cd backend

# Initialize an isolated virtual environment
python -m venv venv
source venv/bin/activate  # On Windows use: venv\\Scripts\\activate

# Install strictly pinned dependencies
pip install -r requirements.txt

# Launch the asynchronous development server
python main.py
The local API server will spin up on http://127.0.0.1:8000 with automated interactive documentation available at /docs.

#### 3. Frontend Client Installation
Open a separate shell container at the repository root folder:

Bash
cd frontend

# Install package dependencies
npm install

# Inject client-side runtime environment variables
echo "NEXT_PUBLIC_API_URL=[http://127.0.0.1:8000](http://127.0.0.1:8000)" > .env.local

# Launch the Next.js compilation engine
npm run dev
Open your web browser and point it to http://localhost:3000 to interact with the full-stack system locally.

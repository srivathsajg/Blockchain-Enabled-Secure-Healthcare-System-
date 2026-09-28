# MediCare — Enterprise Decentralized Smart Healthcare & Clinical AI Platform

[![Node.js](https://img.shields.io/badge/Node.js-18.x+-339933?style=flat&logo=node.js)](https://nodejs.org)
[![React](https://img.shields.io/badge/React-18.x-61DAFB?style=flat&logo=react)](https://reactjs.org)
[![Vite](https://img.shields.io/badge/Vite-5.x-646CFF?style=flat&logo=vite)](https://vitejs.dev)
[![MongoDB](https://img.shields.io/badge/MongoDB-Mongoose-47A248?style=flat&logo=mongodb)](https://www.mongodb.com)
[![Ethereum](https://img.shields.io/badge/Ethereum-Hardhat-3C3C3D?style=flat&logo=ethereum)](https://hardhat.org)
[![Python](https://img.shields.io/badge/Python-3.9+-3776AB?style=flat&logo=python)](https://python.org)

An enterprise-grade, full-stack healthcare ecosystem integrating **decentralized electronic medical records (EMR)**, **smart emergency response**, **blockchain auditability**, **OCR lab analysis**, and **AI-powered clinical nutrition recommendation**.

---

## 🏛️ System Architecture

```
                                  ┌────────────────────────────────────────────────────────┐
                                  │                  CLIENT LAYER (React / Vite)            │
                                  │  [Patient] [Doctor] [Admin] [Ambulance] [Pharmacist]   │
                                  └───────────────────────────┬────────────────────────────┘
                                                              │ HTTP REST / WebSocket
                                                              ▼
                                  ┌────────────────────────────────────────────────────────┐
                                  │               BACKEND SERVER (Node.js/Express)          │
                                  │  • Role Auth & RBAC      • Real-time Socket Engine     │
                                  │  • Emergency Dispatcher  • OCR Lab Report Extraction   │
                                  │  • Appointment & Order   • Audit & Security Middleware │
                                  └───────────────┬───────────────────────────┬────────────┘
                                                  │                           │
                   ┌──────────────────────────────┼───────────────────────────┼─────────────────────────────┐
                   ▼                              ▼                           ▼                             ▼
    ┌───────────────────────────┐  ┌───────────────────────────┐ ┌───────────────────────────┐ ┌───────────────────────────┐
    │     DATABASE (MongoDB)    │  │    AI / ML ENGINE (Py)    │ │   BLOCKCHAIN / SMART CT   │ │     DECENTRALIZED IPFS    │
    │  • Users & Profiles       │  │  • Biomarker Analysis     │ │  • Hardhat / Solidity     │ │  • Pinata IPFS            │
    │  • Encrypted Health EMR   │  │  • Macro/Micro Optimizer  │ │  • Immutable Audit Trail  │ │  • Encrypted Lab & EHR    │
    │  • Emergency & Dispatch   │  │  • Random Forest ML       │ │  • Verifiable Access Log  │ │    File Storage           │
    └───────────────────────────┘  └───────────────────────────┘ └───────────────────────────┘ └───────────────────────────┘
```

---

## 📂 Project Structure

```
Medicare/
├── .gitignore                      # Master enterprise gitignore rules
├── package.json                    # Workspace orchestration & npm task scripts
├── package-lock.json
├── README.md                       # Master project & architecture documentation
│
├── ai_diet_model/                  # Python AI/ML Personalized Clinical Diet Engine
│   ├── __init__.py
│   ├── diet_model.py               # Core Clinical Diet & Rule Optimization Engine
│   ├── diet_target_engine.py       # Precision Nutrition & Metabolic Target Calculation
│   ├── diet_optimizer.py           # Multi-Meal Solver & Clinical Constraint Solver
│   ├── medical_rules.py            # Clinical Biomarker Diagnostic Directives
│   ├── food_database.py            # Comprehensive Food Nutrient Database
│   ├── food_scorer.py              # Food Suitability Scoring Logic
│   ├── food_image_helper.py        # Spoonacular / Media Image Resolver
│   ├── food_image_cache.json       # Cached meal visual assets
│   ├── predict.py                  # CLI & IPC interface for Node.js backend
│   ├── train.py                    # Dataset validation & config generator
│   ├── evaluate_ml_model.py        # Random Forest training & performance evaluation
│   ├── evaluate_engine.py          # Clinical engine benchmark suite
│   ├── verify_model.py             # Diagnostic test script
│   ├── model_config.json           # Model metadata configuration
│   ├── diet_ml_model.pkl           # Trained Random Forest model binary
│   └── personalized_diet_model.pkl # Trained Personalized Diet model binary
│
├── backend/                        # Node.js Express REST API & Real-time Server
│   ├── .env.example                # Sample environment configuration
│   ├── package.json                # Backend dependencies and scripts
│   ├── core/                       # Core application infrastructure
│   │   ├── config/                 # Database & environment configurations
│   │   ├── middleware/             # Authentication, Rate Limiting, Error Handling
│   │   ├── services/               # OCR (Tesseract), Socket.io, Encryption
│   │   └── server.js               # Express application entrypoint
│   ├── modules/                    # Domain-driven feature modules
│   │   ├── appointments/           # Appointment scheduling & consultations
│   │   ├── audit/                  # Audit trail & compliance logs
│   │   ├── emergency/              # Smart emergency SOS & response lifecycle
│   │   ├── inventory/              # Pharmacy stock & batch management
│   │   ├── lab/                    # Lab test catalog & diagnostics
│   │   ├── medical-records/        # Electronic medical records (EMR)
│   │   ├── notifications/          # Push & audio alerts dispatcher
│   │   ├── pharmacy-orders/        # Prescription & OTC medication orders
│   │   ├── prescriptions/          # Digital prescriptions & dispensing
│   │   ├── qr-access/              # Secure emergency QR code access
│   │   ├── search/                 # Global medical entity search
│   │   ├── tablet-reminders/       # Patient medication schedules & reminders
│   │   └── users/                  # User accounts, profiles & ambulance fleet
│   ├── roles/                      # Role-specific controllers & route gateways
│   │   ├── admin/                  # Administrative management & system controls
│   │   ├── delivery/               # Pharmacy delivery logistics
│   │   ├── doctor/                 # Clinical doctor portal & consultations
│   │   ├── patient/                # Patient dashboard & self-service
│   │   └── pharmacist/             # Pharmacy fulfillment & inventory
│   ├── ai/                         # Backend bridge to Python AI services
│   ├── blockchain/                 # Ethers.js web3 integration & smart contract client
│   ├── scripts/                    # Database migrations, seeders & maintenance
│   ├── utils/                      # Encryption helpers & cryptographic tools
│   └── uploads/                    # Local storage for uploaded prescriptions/reports
│
├── frontend/                       # React 18 / Vite / Tailwind UI Application
│   ├── index.html                  # HTML entrypoint
│   ├── vite.config.js              # Vite bundler configuration
│   ├── tailwind.config.js          # Tailwind CSS design system configuration
│   ├── package.json                # Frontend dependencies and scripts
│   ├── public/                     # Static public assets
│   └── src/                        # React source code
│       ├── assets/                 # Icons, sound effects, images
│       ├── components/             # Reusable UI components & modals
│       ├── context/                # React Context providers (Auth, Socket, UI)
│       ├── pages/                  # Role dashboard views & feature pages
│       ├── routes/                 # Protected routing & role guards
│       ├── services/               # Axios API client services
│       └── utils/                  # Formatting, helpers & constants
│
├── blockchain/                     # Solidity Smart Contracts & Hardhat Environment
│   ├── contracts/                  # Solidity contract definitions
│   │   └── MedicalRecords.sol      # On-chain access control & EMR hash registry
│   ├── scripts/                    # Smart contract deployment scripts
│   ├── hardhat.config.js           # Hardhat network & compiler configuration
│   └── package.json                # Blockchain dependencies
│
├── Dataset/                        # Clinical & Research Datasets
│   ├── Drug Labels Dataset.csv     # Comprehensive pharmaceutical dataset
│   ├── lab_test.csv                # Standard laboratory diagnostic tests
│   └── merged_dataset_plus10k_v2.csv # Clinical biometric & biomarker dataset
│
├── docs/                           # Engineering Documentation & Reports
│   ├── guides/                     # Testing & operational guides
│   │   ├── QUICK-TEST-GUIDE.md
│   │   └── AMBULANCE-QUICK-TEST.md
│   └── reports/                    # Verification & technical audit reports
│       ├── AMBULANCE-LOGIN-RUNTIME-FIX-REPORT.md
│       ├── AMBULANCE-REGISTRATION-REPORT.md
│       └── PHASE-2B-VERIFICATION-REPORT.md
│
├── tests/                          # Automated Integration & State Transition Tests
│   └── verify-doctor-emergency-transitions.test.js
│
└── archive/                        # Historical Backups & Patch Artifacts
    ├── backups/                    # Module backup snapshots
    ├── patches/                    # Git diff & patch records
    └── scripts/                    # Historical inspection scripts
```

---

## ⚡ Quick Start

### 1. Prerequisites
- **Node.js**: v18.0.0 or higher
- **MongoDB**: v6.0 or higher (Local instance or MongoDB Atlas)
- **Python**: v3.9 or higher (with `pip`)

### 2. Installation

Install dependencies across workspace:
```bash
# Root dependencies
npm install

# Backend dependencies
cd backend && npm install && cd ..

# Frontend dependencies
cd frontend && npm install && cd ..

# Blockchain dependencies
cd blockchain && npm install && cd ..

# Python AI dependencies (if utilizing AI Diet module)
pip install scikit-learn pandas numpy imbalanced-learn joblib matplotlib seaborn
```

### 3. Environment Configuration

Create `.env` file in `backend/`:
```env
PORT=5000
MONGO_URI=mongodb://127.0.0.1:27017/medicare
JWT_SECRET=your_super_secret_jwt_key
PINATA_API_KEY=your_pinata_api_key
PINATA_API_SECRET=your_pinata_api_secret
SPOONACULAR_API_KEY=your_spoonacular_api_key
```

Create `.env` file in `frontend/`:
```env
VITE_API_URL=http://localhost:5000/api
VITE_SOCKET_URL=http://localhost:5000
```

### 4. Seed Database
Initialize medical data, default test accounts, hospital inventories, and lab tests:
```bash
npm run seed
```

### 5. Running the Application

| Action | Command |
|---|---|
| **Run Backend (Dev)** | `npm run dev:backend` |
| **Run Frontend (Dev)** | `npm run dev:frontend` |
| **Run Automated Tests** | `npm test` |
| **Build Frontend** | `npm run build:frontend` |

---

## 👥 Role-Based Access Matrix

| Role | Core Capabilities |
|---|---|
| **Patient** | Health profile, EMR access, appointment booking, pharmacy ordering, pill reminders, AI diet generation, SOS emergency triggering |
| **Doctor** | Patient queues, electronic consultations, digital prescription authoring, emergency case triage, clinical history review |
| **Hospital Admin** | Staff management, ambulance fleet management, system audit logs, hospital department analytics |
| **Ambulance / EMS** | Emergency beacon tracking, dispatch acceptance, navigation status updates, rapid patient QR profile scanning |
| **Pharmacist** | Prescription verification, medicine dispensing, inventory & stock replenishment, order fulfillment |
| **Delivery** | Prescription delivery assignment, real-time dispatch status, patient doorstep verification |

---

## 🧪 Testing & Quality Assurance

Run the automated verification suite:
```bash
npm test
```
Additional feature test guides can be found in `docs/guides/`:
- [Quick Test Guide](docs/guides/QUICK-TEST-GUIDE.md)
- [Ambulance Quick Test](docs/guides/AMBULANCE-QUICK-TEST.md)

---

## 🔒 Security & Compliance
- **JWT Authentication** with HTTP-only tokens and role authorization guards.
- **Strict Transition State Machines** guarding critical emergency workflows.
- **HIPAA / EMR Alignment**: File encryption at rest and IPFS hash anchoring on Ethereum.
- **OCR Sanitization**: Robust biometric indicator parsing with range sanity validation.
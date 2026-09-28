# 🏥 Blockchain-Enabled Secure Healthcare System with Smart Diagnostics & Diet AI

[![Node.js](https://img.shields.io/badge/Node.js-18.x+-339933?style=flat&logo=node.js)](https://nodejs.org)
[![React](https://img.shields.io/badge/React-18.x-61DAFB?style=flat&logo=react)](https://reactjs.org)
[![Vite](https://img.shields.io/badge/Vite-5.x-646CFF?style=flat&logo=vite)](https://vitejs.dev)
[![MongoDB](https://img.shields.io/badge/MongoDB-Mongoose-47A248?style=flat&logo=mongodb)](https://www.mongodb.com)
[![Ethereum](https://img.shields.io/badge/Ethereum-Hardhat-3C3C3D?style=flat&logo=ethereum)](https://hardhat.org)
[![Python](https://img.shields.io/badge/Python-3.9+-3776AB?style=flat&logo=python)](https://python.org)

> **A secure, intelligent healthcare management platform integrating Ethereum Blockchain, Clinical AI/ML, Tesseract OCR, and IPFS for tamper-resistant electronic medical records, smart diagnostics, real-time emergency dispatch, and personalized Indian Medical Nutrition Therapy (Diet AI).**

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
                                  │  • Medical Report Track  • Audit & Security Middleware │
                                  └───────────────┬───────────────────────────┬────────────┘
                                                  │                           │
                   ┌──────────────────────────────┼───────────────────────────┼─────────────────────────────┐
                   ▼                              ▼                           ▼                             ▼
    ┌───────────────────────────┐  ┌───────────────────────────┐ ┌───────────────────────────┐ ┌───────────────────────────┐
    │     DATABASE (MongoDB)    │  │   AI / DIET SERVICE (Py)  │ │   BLOCKCHAIN / SMART CT   │ │     DECENTRALIZED IPFS    │
    │  • Users & Patient Data   │  │  • XGBoost Suitability    │ │  • Hardhat / Solidity     │ │  • Pinata IPFS            │
    │  • Encrypted Health EMR   │  │  • PuLP Whole-Day LP      │ │  • Immutable Audit Trail  │ │  • Encrypted Lab & EHR    │
    │  • Emergency & Dispatch   │  │  • Medical Nutrition MNT  │ │  • Verifiable Access Log  │ │    Document Storage       │
    └───────────────────────────┘  └───────────────────────────┘ └───────────────────────────┘ └───────────────────────────┘
```

---

## 🚀 Key Features

### 👤 Patient Management & Medical Report Tracking
- Secure biometric health profile and EMR history access
- Tesseract OCR lab report parameter extraction (Glucose, HbA1c, BP, Hemoglobin, Cholesterol, Creatinine)
- Digital appointment booking & doctor consultation queues
- Real-time prescription delivery tracking & medicine reminders

### 🥗 Clinical Diet AI & Medical Nutrition Therapy
- **XGBoost Food Suitability Model**: Trained on 27 patient-food interaction features
- **Whole-Day Joint PuLP Optimizer**: Caloric envelopes, zero-repetition variety, and exact portion gram calculation
- **Indian Culinary Alignment**: Grounded in authentic Indian cuisine (Idli, Sambar, Poha, Roti, Dal, Khichdi, etc.)
- **Medical Report Integration**: Personalized adjustments for Diabetes, Hypertension, Anemia, Obesity, and Dyslipidemia

### 👨‍⚕️ Doctor & Clinical Consultation Portal
- Live consultation queues and digital prescription authoring
- Medical record history inspection with on-chain verification
- Clinical diagnosis assistance & emergency case triage

### 🚑 Smart Emergency Response (ResQOne)
- Instant SOS emergency booking with live location routing
- Ambulance dispatcher coordination & real-time telemetry
- Rapid emergency QR patient profile scanning

### 🔗 Blockchain Security & Decentralized Storage
- SHA-256 EMR integrity hashing anchored on Ethereum smart contracts
- IPFS / Pinata decentralized off-chain document storage
- Cryptographic tamper detection and immutable access audit logs

---

## 👥 Role-Based Access Matrix

| Role | Responsibilities |
|---|---|
| 👤 **Patient** | Health profile, EMR access, appointment booking, pharmacy ordering, pill reminders, AI diet generation, SOS emergency |
| 👨‍⚕️ **Doctor** | Patient queues, electronic consultations, digital prescription authoring, emergency triage, clinical history review |
| 👨‍💼 **Hospital Admin** | Staff management, ambulance fleet management, system audit logs, hospital department analytics |
| 🚑 **Ambulance / EMS** | Emergency beacon tracking, dispatch acceptance, navigation updates, rapid patient QR profile scanning |
| 💊 **Pharmacist** | Prescription verification, medicine dispensing, inventory & stock replenishment, order fulfillment |
| 🚚 **Delivery** | Prescription delivery assignment, real-time dispatch status, patient doorstep verification |

---

## 🛠️ Technology Stack

* **Frontend**: React 18, Vite, Tailwind CSS, Lucide React, Framer Motion
* **Backend**: Node.js, Express.js, Socket.io, Tesseract OCR, Mongoose
* **Database**: MongoDB Atlas
* **AI / ML**: Python 3.12, FastAPI, XGBoost, Scikit-learn, PuLP, Pandas, NumPy
* **Blockchain**: Ethereum, Solidity, Hardhat, Ethers.js
* **Storage**: IPFS, Pinata Cloud

---

## 📂 Project Structure

```text
Medicare/
├── backend/                        # Node.js Express REST API & Real-time Server
│   ├── ai/                         # Backend bridge to AI services & food image caching
│   ├── core/                       # Express entrypoint, database config, middleware
│   ├── modules/                    # Domain modules (appointments, emergency, track, users, etc.)
│   ├── roles/                      # Role controllers (patient, doctor, admin, delivery)
│   └── .env.example                # Backend environment configuration template
│
├── diet_ai/                        # Python FastAPI Clinical Diet AI Service
│   ├── app/
│   │   ├── api/                    # FastAPI endpoints (/api/diet, /api/food, /api/health)
│   │   ├── ml/                     # XGBoost food suitability ranker & feature engineering
│   │   ├── nutrition/              # BMI, BMR (Mifflin-St Jeor), TDEE & macro calculation
│   │   ├── optimization/           # PuLP whole-day LP solver & clinical validator
│   │   └── rules/                  # Condition rules (Diabetes, Hypertension, Anemia, etc.)
│   ├── models/                     # Trained XGBoost artifact (diet_food_ranker.joblib)
│   ├── reports/                    # Training metrics, history & dataset quality reports
│   └── requirements.txt            # Python dependencies
│
├── frontend/                       # React 18 / Vite / Tailwind UI Application
│   ├── src/
│   │   ├── components/             # Reusable UI widgets & emergency maps
│   │   ├── pages/                  # Role dashboards & PatientDietPlan view
│   │   └── services/               # Axios API client services
│   └── package.json
│
├── blockchain/                     # Solidity Smart Contracts & Hardhat Environment
│   ├── contracts/                  # MedicalRecords.sol access control contract
│   └── hardhat.config.js
│
├── Dataset/                        # Clinical Datasets & Raw Food Dataset (9,997 recipes)
│   └── food_dataset/               # recipes_master, recipe_nutrition, recipe_ingredients
│
└── tests/                          # Automated integration test suite
```

---

## ⚙️ Installation & Setup

### 1. Prerequisites
- **Node.js**: v18+ 
- **Python**: v3.10+
- **MongoDB**: Local or Atlas instance

### 2. Backend Setup
```bash
cd backend
npm install
cp .env.example .env
# Configure MONGO_URI, JWT_SECRET, PINATA_API_KEY, and API in .env
npm start
```

### 3. Frontend Setup
```bash
cd frontend
npm install
npm run dev
# Running at http://localhost:5173
```

### 4. Diet AI Service Setup (Optional Standalone)
```bash
cd diet_ai
pip install -r requirements.txt
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

---

## 👨‍💻 Developer

**Srivathsa JG**
GitHub: [@srivathsajg](https://github.com/srivathsajg)

---

## 📄 License

This project was developed for educational and academic purposes.

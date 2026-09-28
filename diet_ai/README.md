# Medicare Diet AI Service (v4.0.0)

Precision nutrition decision-support engine built with **FastAPI**, **XGBoost**, and **PuLP** Linear Programming Optimization.

---

## ⚠️ Clinical Disclaimer
> **This software is a nutritional decision-support tool. It does NOT diagnose medical conditions, prescribe pharmaceutical treatments, or replace certified clinical healthcare.** All biomarker thresholds and recommendations represent nutritional guidelines.

---

## Architecture

```
Patient Profile (Demographics + Labs + Goals + Allergies)
                     │
                     ▼
       Biometric & Nutrition Targets Engine
       (Mifflin-St Jeor BMR, TDEE, WHO BMI, NIH RDA/AI)
                     │
                     ▼
           Medical Rule Engine
       (Hypertension, Diabetes, Anemia, Cholesterol, Obesity)
                     │
                     ▼
         Food Hard-Filtering Engine
       (Diet Type, Allergens, Exclusions, Meal Slots, Sodium Hard-Cap)
                     │
                     ▼
     Patient-Food Feature Engineering (27 Interaction Features)
                     │
                     ▼
           XGBoost Food Suitability Ranker
       (Group-Aware Split Trained Model, Top-K Filtering)
                     │
                     ▼
          PuLP Linear Programming Solver
       (Energy Windows, Macro Bounds, Serving Quantities [0.5–2.5])
                     │
                     ▼
       Daily Plan Nutrition Validator & SHAP Explainability
                     │
                     ▼
         FastAPI REST API / JSON Output
```

---

## Dataset Provenance & Assumptions

- **Location**: `Dataset/food_dataset/`
  - `recipes_master.csv`: 9,997 recipes across Indian, Pakistani, Bangladeshi, Afghan, and Fusion cuisines.
  - `recipe_nutrition.csv`: Per-serving nutritional values (`calories`, `protein_g`, `carbs_g`, `fat_g`, `fiber_g`, `sugar_g`, `sodium_mg`).
  - `recipe_ingredients.csv`: 103,908 ingredients for substring allergen detection.
- **Nutritional Conversions**:
  - `iron_percent`, `calcium_percent`, `vitamin_c_percent` are converted to absolute mg using FDA Reference Daily Intakes for Adults (Iron: 18mg, Calcium: 1300mg, Vitamin C: 90mg).
- **Assumed Serving Weight**: 200g per serving (documented assumption).

---

## Quickstart

### 1. Install Dependencies
```bash
pip install -r requirements.txt
```

### 2. Prepare Data & Train Model
```bash
# Prepare and validate dataset
python training/prepare_dataset.py

# Generate pseudo-labels
python training/create_labels.py

# Train XGBoost model
python training/train_xgboost.py

# Run 5-patient test evaluation
python training/evaluate.py
```

### 3. Run FastAPI Service
```bash
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

### 4. Run Pytest Suite
```bash
pytest tests/ -v
```

---

## API Endpoints

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/diet/recommend` | Generate complete personalized 4-5 meal diet plan |
| `POST` | `/api/diet/analyze-patient` | Compute BMI, BMR, TDEE, and macro/micronutrient targets |
| `POST` | `/api/diet/validate` | Validate nutrition totals against clinical targets |
| `GET` | `/api/food/search` | Search recipe database by keyword, cuisine, meal slot |
| `GET` | `/api/food/{recipe_id}` | Retrieve full nutritional details for a food item |
| `POST` | `/api/food/score` | Compute ML suitability score of a single food for a patient |
| `GET` | `/api/model/info` | Return model metadata, version, and performance metrics |
| `GET` | `/api/health` | Service health status and dataset integrity verification |

---

## Node.js Backend Integration

The Express.js backend proxies requests through `backend/ai/diet-recommendation/diet.service.js` which connects to `http://127.0.0.1:8000/api/diet/recommend`. Generated plans are saved in MongoDB under `DietPlan` with `planVersion: 4`.

"""
app/config.py
Global configuration for the Diet AI service.
All path references are resolved relative to this file so the service works
from any working directory.
"""
from pathlib import Path
import os

# ── Root paths ─────────────────────────────────────────────────────────────────
# diet_ai/  (this file lives at diet_ai/app/config.py  →  two levels up)
DIET_AI_ROOT = Path(__file__).parent.parent.resolve()
PROJECT_ROOT = DIET_AI_ROOT.parent.resolve()

# ── Dataset ────────────────────────────────────────────────────────────────────
DATASET_DIR = PROJECT_ROOT / "Dataset" / "food_dataset"
RECIPES_MASTER_FILE   = DATASET_DIR / "recipes_master.csv"
RECIPE_NUTRITION_FILE = DATASET_DIR / "recipe_nutrition.csv"
RECIPE_INGREDIENTS_FILE = DATASET_DIR / "recipe_ingredients.csv"
CUISINE_METADATA_FILE = DATASET_DIR / "cuisine_metadata.csv"

# ── Model artefacts ────────────────────────────────────────────────────────────
MODELS_DIR = DIET_AI_ROOT / "models"
RANKER_MODEL_PATH    = MODELS_DIR / "diet_food_ranker.joblib"
FEATURE_COLUMNS_PATH = MODELS_DIR / "feature_columns.json"
MODEL_METADATA_PATH  = MODELS_DIR / "model_metadata.json"

# ── Reports ────────────────────────────────────────────────────────────────────
REPORTS_DIR = DIET_AI_ROOT / "reports"
QUALITY_REPORT_PATH  = REPORTS_DIR / "dataset_quality_report.json"
MODEL_METRICS_PATH   = REPORTS_DIR / "model_metrics.json"
FEATURE_IMP_PATH     = REPORTS_DIR / "feature_importance.csv"

# ── Service settings ───────────────────────────────────────────────────────────
FASTAPI_HOST = os.getenv("DIET_AI_HOST", "0.0.0.0")
FASTAPI_PORT = int(os.getenv("DIET_AI_PORT", "8000"))

# ── Nutrition / DV constants ───────────────────────────────────────────────────
# Reference Daily Values used to convert %DV columns to absolute amounts.
# Source: FDA Reference Daily Intakes for Adults (2016)
# https://www.fda.gov/food/nutrition-facts-label/daily-value-nutrition-and-supplement-facts-labels
DV_IRON_MG        = 18.0
DV_CALCIUM_MG     = 1300.0
DV_VITAMIN_C_MG   = 90.0
DV_VITAMIN_A_MCG  = 900.0   # for reference, not yet used in optimiser

# Assumed grams per one serving (the dataset has no explicit serving-weight column).
# Documented assumption — not a laboratory measurement.
ASSUMED_SERVING_GRAMS = 200.0

# ── Optimiser settings ─────────────────────────────────────────────────────────
MAX_CANDIDATE_FOODS   = 100   # Foods sent into PuLP after ML ranking
ML_TOP_K_PER_SLOT     = 30    # Top-K foods per meal slot from ML ranker
OPTIMISER_MAX_RETRIES = 3     # How many times to retry if infeasible

# ── Calorie distribution across meal slots (must sum to 1.0) ─────────────────
MEAL_CALORIE_SPLIT_4 = {
    "breakfast":     0.25,
    "lunch":         0.35,
    "evening_snack": 0.15,
    "dinner":        0.25,
}

MEAL_CALORIE_SPLIT_5 = {
    "breakfast":     0.20,
    "morning_snack": 0.10,
    "lunch":         0.30,
    "evening_snack": 0.10,
    "dinner":        0.30,
}

MEAL_CALORIE_SPLIT = MEAL_CALORIE_SPLIT_4

# ── Logging ────────────────────────────────────────────────────────────────────
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO")

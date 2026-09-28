"""
app/api/health.py
FastAPI health and model info endpoints.
"""
from __future__ import annotations
from pathlib import Path

from fastapi import APIRouter

from app.config import RANKER_MODEL_PATH, MODEL_METADATA_PATH, DATASET_DIR
from app.data.loader import get_dataset_hash
from app.utils.helpers import load_json
from app.utils.logging import get_logger

log = get_logger(__name__)
router = APIRouter(tags=["System"])


@router.get("/api/health")
async def health() -> dict:
    """Health check — verifies dataset availability and model status."""
    dataset_files = {
        "recipes_master":     (DATASET_DIR / "recipes_master.csv").exists(),
        "recipe_nutrition":   (DATASET_DIR / "recipe_nutrition.csv").exists(),
        "recipe_ingredients": (DATASET_DIR / "recipe_ingredients.csv").exists(),
    }
    return {
        "status":          "ok",
        "dataset_files":   dataset_files,
        "dataset_healthy": all(dataset_files.values()),
        "model_ready":     RANKER_MODEL_PATH.exists(),
        "dataset_hash":    get_dataset_hash(),
    }


@router.get("/api/model/info")
async def model_info() -> dict:
    """Return model metadata: version, training date, dataset version, metrics."""
    if MODEL_METADATA_PATH.exists():
        try:
            meta = load_json(MODEL_METADATA_PATH)
            return {"status": "success", "model": meta}
        except Exception as e:
            return {"status": "error", "detail": str(e)}
    return {
        "status": "not_trained",
        "message": (
            "XGBoost model has not been trained yet. "
            "Run: python training/train_xgboost.py"
        ),
        "fallback": "Heuristic scoring active",
    }

"""
app/ml/ranker.py
XGBoost-based food suitability ranker.

The model is loaded from models/diet_food_ranker.joblib at startup.
If the model file does not exist, a simple heuristic scorer is used as fallback
until training/train_xgboost.py is run.

NOTE:  The XGBoost model predicts a suitability score for each food item
given patient-food interaction features.  It does NOT diagnose conditions.
"""
from __future__ import annotations
from pathlib import Path
from typing import List, Optional

import numpy as np
import pandas as pd

from app.config import RANKER_MODEL_PATH, FEATURE_COLUMNS_PATH
from app.utils.logging import get_logger
from app.utils.helpers import load_json

log = get_logger(__name__)


def _heuristic_score(row: pd.Series) -> float:
    """
    Fallback scoring when the trained XGBoost model is unavailable.
    Weights key gap/compatibility features manually.
    This is a simple rule-based approximation, NOT ML.
    """
    score = (
        0.25 * row.get("calorie_gap_score",  0.5) +
        0.20 * row.get("protein_gap_score",  0.5) +
        0.10 * row.get("fiber_gap_score",    0.5) +
        0.10 * row.get("iron_gap_score",     0.5) +
        0.05 * row.get("vitc_gap_score",     0.5) +
        0.10 * row.get("diet_compat",        1.0) +
        0.10 * row.get("slot_compat",        0.5) +
        0.05 * row.get("cuisine_compat",     0.5) +
        0.05 * row.get("cost_score",         1.0) -
        0.10 * row.get("sodium_penalty",     0.0) -
        0.05 * row.get("sugar_penalty",      0.0) -
        0.05 * row.get("fat_penalty",        0.0)
    )
    return float(np.clip(score, 0.0, 1.0))


class FoodRanker:
    """
    Wraps the XGBoost model for inference.
    Falls back to heuristic scoring if model is not available.
    """
    def __init__(self):
        self._model = None
        self._feature_columns: List[str] = []
        self._model_loaded = False
        self._load()

    def _load(self):
        if RANKER_MODEL_PATH.exists() and FEATURE_COLUMNS_PATH.exists():
            try:
                import joblib
                self._model = joblib.load(RANKER_MODEL_PATH)
                self._feature_columns = load_json(FEATURE_COLUMNS_PATH)
                self._model_loaded = True
                log.info(f"XGBoost ranker loaded from {RANKER_MODEL_PATH}")
            except Exception as e:
                log.warning(f"Failed to load ranker model: {e}. Using heuristic fallback.")
                self._model_loaded = False
        else:
            log.warning(
                "XGBoost model not found at models/diet_food_ranker.joblib. "
                "Using heuristic scorer. Run training/train_xgboost.py to train."
            )

    def score_batch(self, feat_df: pd.DataFrame) -> np.ndarray:
        """
        Score a batch of foods. Returns an array of suitability scores [0, 1].
        """
        if self._model_loaded and self._feature_columns:
            try:
                X = feat_df[self._feature_columns].fillna(0.0).values.astype(np.float32)
                raw = self._model.predict(X)
                # Normalise to [0, 1]
                mn, mx = raw.min(), raw.max()
                if mx > mn:
                    return (raw - mn) / (mx - mn)
                return np.full(len(raw), 0.5)
            except Exception as e:
                log.error(f"XGBoost prediction failed: {e}. Falling back to heuristic.")

        # Heuristic fallback
        return np.array([_heuristic_score(row) for _, row in feat_df.iterrows()])


# Module-level singleton — loaded once at startup
_ranker: Optional[FoodRanker] = None


def get_ranker() -> FoodRanker:
    global _ranker
    if _ranker is None:
        _ranker = FoodRanker()
    return _ranker


def rank_foods(feat_df: pd.DataFrame, top_k: int = 50) -> pd.DataFrame:
    """
    Score and return the top-k foods from a feature-engineered DataFrame.
    Adds a 'suitability_score' column.
    """
    ranker = get_ranker()
    scores = ranker.score_batch(feat_df)
    feat_df = feat_df.copy()
    feat_df["suitability_score"] = scores
    return feat_df.nlargest(top_k, "suitability_score").reset_index(drop=True)

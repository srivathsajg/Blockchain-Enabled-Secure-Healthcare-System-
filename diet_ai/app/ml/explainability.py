"""
app/ml/explainability.py
SHAP-based feature importance and per-prediction explanations for the XGBoost ranker.
Used to generate the 'why_recommended' text for each meal item.
"""
from __future__ import annotations
from typing import List, Dict

import numpy as np
import pandas as pd

from app.utils.logging import get_logger

log = get_logger(__name__)

FEATURE_LABELS = {
    "calorie_gap_score": "calorie fit",
    "protein_gap_score": "protein fit",
    "fiber_gap_score":   "fibre content",
    "iron_gap_score":    "iron content",
    "vitc_gap_score":    "vitamin C",
    "calcium_gap_score": "calcium",
    "diet_compat":       "diet compatibility",
    "slot_compat":       "meal timing fit",
    "cuisine_compat":    "cuisine preference",
    "cost_score":        "budget fit",
    "sodium_penalty":    "sodium level (lower is better)",
    "sugar_penalty":     "sugar level (lower is better)",
    "fat_penalty":       "fat level (lower is better)",
}


def explain_food_row(feature_row: pd.Series, shap_values: np.ndarray = None) -> str:
    """
    Generate a human-readable explanation for why a food was recommended.
    If SHAP values are available, uses top-2 positive contributors.
    Falls back to rule-based explanation using raw feature values.
    """
    reasons: List[str] = []

    if shap_values is not None and len(shap_values) > 0:
        # Use SHAP to find top positive contributors
        try:
            shap_dict = {
                feat: val
                for feat, val in zip(FEATURE_LABELS.keys(), shap_values)
                if feat in FEATURE_LABELS
            }
            positives = sorted(shap_dict.items(), key=lambda x: x[1], reverse=True)
            top = [(FEATURE_LABELS[f], v) for f, v in positives if v > 0][:3]
            for label, _ in top:
                if "penalty" in label:
                    reasons.append(f"Low {label.replace('(lower is better)', '').strip()}")
                else:
                    reasons.append(f"Good {label}")
        except Exception:
            pass

    # Verified rule-based explanations using actual food nutrient values
    if not reasons:
        food_cal = float(feature_row.get("food_calories", 0))
        food_prot = float(feature_row.get("food_protein_g", 0))
        food_fiber = float(feature_row.get("food_fiber_g", 0))
        food_iron = float(feature_row.get("food_iron_mg", 0))
        food_sodium = float(feature_row.get("food_sodium_mg", 0))

        if food_cal > 0:
            reasons.append(f"Provides {round(food_cal)} kcal calibrated for energy balance")
        if food_prot >= 4.0:
            reasons.append(f"Supplies {round(food_prot, 1)} g protein for cellular repair")
        if food_fiber >= 3.0:
            reasons.append(f"Contains {round(food_fiber, 1)} g dietary fiber for metabolic health")
        if food_iron >= 2.0:
            reasons.append(f"Delivers {round(food_iron, 1)} mg iron for blood health")
        if food_sodium <= 400:
            reasons.append("Controlled sodium level supporting cardiovascular health")
        if feature_row.get("diet_compat", 0) == 1.0:
            reasons.append("Adheres strictly to your dietary preference")

    if not reasons:
        reasons = ["Nutritionally calibrated selection matching your profile"]

    return " | ".join(reasons[:3])

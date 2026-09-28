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

    # Rule-based fallback explanations
    if not reasons:
        cs = feature_row.get("calorie_gap_score", 0.5)
        ps = feature_row.get("protein_gap_score", 0.5)
        fs = feature_row.get("fiber_gap_score", 0.5)
        is_ = feature_row.get("iron_gap_score", 0.5)
        sp = feature_row.get("sodium_penalty", 0.0)

        if cs >= 0.6:
            reasons.append("Good calorie fit for your daily targets")
        if ps >= 0.6:
            reasons.append("Strong protein content aligned with your goal")
        if fs >= 0.6:
            reasons.append("High dietary fibre to support digestion")
        if is_ >= 0.6:
            reasons.append("Rich iron content for nutritional balance")
        if sp == 0.0:
            reasons.append("Low sodium level, heart-friendly choice")
        if feature_row.get("diet_compat", 0) == 1.0:
            reasons.append("Matches your dietary preference")
        if feature_row.get("cuisine_compat", 0) == 1.0:
            reasons.append("Aligns with your preferred cuisine")

    if not reasons:
        reasons = ["Well-balanced nutritional profile for your plan"]

    return " | ".join(reasons[:3])

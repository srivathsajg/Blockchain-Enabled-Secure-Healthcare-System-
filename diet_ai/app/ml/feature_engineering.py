"""
app/ml/feature_engineering.py
Patient-food interaction feature engineering.

For each (patient, food) pair, compute features that describe how well the food
fits the patient's nutritional needs.  These features feed the XGBoost ranker.

Feature groups:
  A) Gap features: how close the food is to closing the patient's daily gap
  B) Penalty features: high-sodium, high-sugar, high-fat penalties
  C) Compatibility features: diet type, meal slot, cuisine match
  D) Food intrinsic features: calorie density, fiber density, protein density
"""
from __future__ import annotations
from typing import Dict, Any

import numpy as np
import pandas as pd


def _safe_gap_score(food_val: float, target_fraction: float) -> float:
    """
    Returns a score [0, 1] indicating how well `food_val` covers `target_fraction` of need.
    Perfect score = food_val equals target_fraction exactly.
    Penalises both over and under contribution.
    """
    if target_fraction <= 0:
        return 0.5
    ratio = food_val / max(target_fraction, 0.001)
    # score peaks at ratio=1.0, falls off on both sides
    return float(np.exp(-0.5 * (ratio - 1.0) ** 2))


def engineer_features(
    food_row: pd.Series,
    targets: dict,
    meal_slot: str,
    diet_type: str,
    conditions: list,
    rule_adjustments: dict,
    preferred_cuisine: str = None,
    n_meals: int = 5,
) -> Dict[str, float]:
    """
    Compute patient-food interaction features for a single food item.

    Parameters
    ----------
    food_row   : a row from the merged food DataFrame
    targets    : adjusted nutrition targets dict
    meal_slot  : current meal slot (breakfast / lunch / etc.)
    diet_type  : patient diet preference
    conditions : list of medical condition strings
    rule_adjustments : dict of food_score_adjustments from medical rules
    preferred_cuisine : optional preferred cuisine name
    n_meals    : number of meals per day (for per-meal target calculation)

    Returns
    -------
    dict of float features
    """
    # Per-meal targets (approximate equal split; real distribution handled by optimizer)
    cal_per_meal     = targets.get("calories", 2000)    / n_meals
    protein_per_meal = targets.get("protein_g", 80)     / n_meals
    carbs_per_meal   = targets.get("carbs_g", 250)      / n_meals
    fat_per_meal     = targets.get("fat_g", 65)         / n_meals
    fiber_per_meal   = targets.get("fiber_g", 30)       / n_meals
    iron_per_meal    = targets.get("iron_mg", 8)        / n_meals
    calcium_per_meal = targets.get("calcium_mg", 1000)  / n_meals
    vitc_per_meal    = targets.get("vitamin_c_mg", 90)  / n_meals

    # ── A. Gap / coverage scores ───────────────────────────────────────────────
    calorie_gap_score  = _safe_gap_score(food_row.get("calories", 0),  cal_per_meal)
    protein_gap_score  = _safe_gap_score(food_row.get("protein_g", 0), protein_per_meal)
    carbs_gap_score    = _safe_gap_score(food_row.get("carbs_g", 0),   carbs_per_meal)
    fat_gap_score      = _safe_gap_score(food_row.get("fat_g", 0),     fat_per_meal)
    fiber_gap_score    = _safe_gap_score(food_row.get("fiber_g", 0),   fiber_per_meal)
    iron_gap_score     = _safe_gap_score(food_row.get("iron_mg", 0),   iron_per_meal)
    calcium_gap_score  = _safe_gap_score(food_row.get("calcium_mg", 0),calcium_per_meal)
    vitc_gap_score     = _safe_gap_score(food_row.get("vitamin_c_mg", 0), vitc_per_meal)

    # ── B. Penalty features ────────────────────────────────────────────────────
    sodium_per_meal_max = targets.get("sodium_mg_max", 2300) / n_meals
    sodium_actual = food_row.get("sodium_mg", 0)
    sodium_penalty = float(np.clip(
        (sodium_actual - sodium_per_meal_max) / max(sodium_per_meal_max, 1), -1, 1
    )) if sodium_actual > sodium_per_meal_max else 0.0

    sugar_threshold = rule_adjustments.get("sugar_penalty_threshold_g", 30)
    sugar_penalty = float(np.clip(
        (food_row.get("sugar_g", 0) - sugar_threshold) / max(sugar_threshold, 1), 0, 1
    ))

    fat_threshold = rule_adjustments.get("fat_penalty_threshold_g", 35)
    fat_penalty = float(np.clip(
        (food_row.get("fat_g", 0) - fat_threshold) / max(fat_threshold, 1), 0, 1
    ))

    # ── C. Compatibility features ─────────────────────────────────────────────
    # Diet type match
    dt = (diet_type or "any").lower()
    if dt in ("veg", "vegetarian"):
        diet_compat = 1.0 if food_row.get("is_vegetarian") else 0.0
    elif dt == "vegan":
        diet_compat = 1.0 if food_row.get("is_vegan") else 0.0
    else:
        diet_compat = 1.0

    # Meal slot match
    food_slot = str(food_row.get("meal_slot", "lunch"))
    slot_compat = 1.0 if (meal_slot and meal_slot.startswith(food_slot)) or food_slot in meal_slot else 0.5

    # Cuisine preference match
    food_cuisine = str(food_row.get("cuisine", "")).lower()
    pref_cuisine = (preferred_cuisine or "").lower()
    cuisine_compat = 1.0 if (pref_cuisine and pref_cuisine in food_cuisine) else 0.5

    # ── D. Food intrinsic features ────────────────────────────────────────────
    food_calories = max(food_row.get("calories", 1), 1)
    calorie_density  = food_calories / 200.0   # per assumed serving weight
    protein_density  = food_row.get("protein_g", 0) / food_calories
    fiber_density    = food_row.get("fiber_g", 0) / food_calories

    # ── E. Medical condition boosts ───────────────────────────────────────────
    iron_boost = 0.0
    if rule_adjustments.get("prefer_high_iron") and food_row.get("iron_mg", 0) >= 5:
        iron_boost = 1.0
    vitc_boost = float(food_row.get("vitamin_c_mg", 0)) / max(vitc_per_meal, 1)

    # ── F. Cost compatibility ─────────────────────────────────────────────────
    cost = food_row.get("estimated_cost_usd", None)
    cost_score = 1.0 if cost is None or cost <= 15 else float(np.exp(-0.1 * (cost - 15)))

    return {
        "calorie_gap_score":  calorie_gap_score,
        "protein_gap_score":  protein_gap_score,
        "carbs_gap_score":    carbs_gap_score,
        "fat_gap_score":      fat_gap_score,
        "fiber_gap_score":    fiber_gap_score,
        "iron_gap_score":     iron_gap_score,
        "calcium_gap_score":  calcium_gap_score,
        "vitc_gap_score":     vitc_gap_score,
        "sodium_penalty":     sodium_penalty,
        "sugar_penalty":      sugar_penalty,
        "fat_penalty":        fat_penalty,
        "diet_compat":        diet_compat,
        "slot_compat":        slot_compat,
        "cuisine_compat":     cuisine_compat,
        "calorie_density":    calorie_density,
        "protein_density":    protein_density,
        "fiber_density":      fiber_density,
        "iron_boost":         iron_boost,
        "vitc_boost":         vitc_boost,
        "cost_score":         cost_score,
        # Raw food values (additional context for model)
        "food_calories":      float(food_calories),
        "food_protein_g":     float(food_row.get("protein_g", 0)),
        "food_fiber_g":       float(food_row.get("fiber_g", 0)),
        "food_sodium_mg":     float(food_row.get("sodium_mg", 0)),
        "food_iron_mg":       float(food_row.get("iron_mg", 0)),
        "food_fat_g":         float(food_row.get("fat_g", 0)),
        "food_carbs_g":       float(food_row.get("carbs_g", 0)),
    }


def batch_engineer_features(
    food_df: pd.DataFrame,
    targets: dict,
    meal_slot: str,
    diet_type: str,
    conditions: list,
    rule_adjustments: dict,
    preferred_cuisine: str = None,
    n_meals: int = 5,
) -> pd.DataFrame:
    """
    Vectorised feature engineering for a DataFrame of food candidates.
    Returns the original DataFrame with feature columns appended.
    """
    rows = []
    for _, row in food_df.iterrows():
        feats = engineer_features(
            row, targets, meal_slot, diet_type, conditions,
            rule_adjustments, preferred_cuisine, n_meals
        )
        rows.append(feats)
    feat_df = pd.DataFrame(rows, index=food_df.index)
    return pd.concat([food_df, feat_df], axis=1)

"""
app/nutrition/portion.py
Centralized, authoritative portion nutrition calculation.

MATHEMATICAL FOUNDATION:
  All nutrition in recipes is normalized to a 100g basis:
    nutrient_per_100g = (nutrient_total_per_serving / assumed_serving_grams) * 100

  Given any portion weight in grams (quantity_g):
    portion_nutrient = nutrient_per_100g * (quantity_g / 100.0)

  Exact same formula applied uniformly across all nutrients:
    - calories (kcal)
    - protein_g
    - carbs_g
    - fat_g
    - fiber_g
    - sugar_g
    - sodium_mg
    - iron_mg
    - calcium_mg
    - vitamin_c_mg
    - estimated_cost_usd

NO LLM estimation. NO random numbers. NO duplication across files.
"""
from __future__ import annotations
from typing import Dict, Any
import pandas as pd


def calculate_portion_nutrition(food_row: Dict[str, Any] | pd.Series, quantity_g: float) -> Dict[str, float]:
    """
    Calculate exact nutritional contribution for a given food portion in grams.

    Parameters
    ----------
    food_row : dict or pd.Series containing either 'per100g_<nutrient>' or baseline nutrients
    quantity_g : portion weight in grams (e.g. 150.0, 200.0, 350.0)

    Returns
    -------
    Dict[str, float] with exact calculated nutrient amounts for that portion weight.
    """
    qty_g = max(float(quantity_g), 1.0)
    factor = qty_g / 100.0

    # Helper to extract per 100g value
    def get_100g(key: str, fallback_col: str, default_serving_g: float = 200.0) -> float:
        p100_key = f"per100g_{key}"
        if p100_key in food_row and pd.notna(food_row[p100_key]):
            return float(food_row[p100_key])
        if fallback_col in food_row and pd.notna(food_row[fallback_col]):
            return (float(food_row[fallback_col]) / default_serving_g) * 100.0
        return 0.0

    cals    = get_100g("calories", "calories") * factor
    protein = get_100g("protein_g", "protein_g") * factor
    carbs   = get_100g("carbs_g", "carbs_g") * factor
    fat     = get_100g("fat_g", "fat_g") * factor
    fiber   = get_100g("fiber_g", "fiber_g") * factor
    sugar   = get_100g("sugar_g", "sugar_g") * factor
    sodium  = get_100g("sodium_mg", "sodium_mg") * factor
    iron    = get_100g("iron_mg", "iron_mg") * factor
    calcium = get_100g("calcium_mg", "calcium_mg") * factor
    vit_c   = get_100g("vitamin_c_mg", "vitamin_c_mg") * factor

    cost_per_100g = get_100g("estimated_cost_usd", "estimated_cost_usd")
    cost = cost_per_100g * factor if cost_per_100g > 0 else None

    return {
        "quantity_g":   round(qty_g, 1),
        "calories":     round(cals, 2),
        "protein_g":    round(protein, 2),
        "carbs_g":      round(carbs, 2),
        "fat_g":        round(fat, 2),
        "fiber_g":      round(fiber, 2),
        "sugar_g":      round(sugar, 2),
        "sodium_mg":    round(sodium, 2),
        "iron_mg":      round(iron, 2),
        "calcium_mg":   round(calcium, 2),
        "vitamin_c_mg": round(vit_c, 2),
        "cost_usd":     round(cost, 2) if cost is not None else None,
    }

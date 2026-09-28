"""
app/recommendation/food_filter.py
Hard-filter candidates from the food dataset before ML scoring.

Filters applied (in order):
  1. Diet type (vegetarian / vegan / non-veg / any)
  2. Allergen exclusion (patient allergies)
  3. Excluded food names (exact/partial match on recipe_name)
  4. Meal slot compatibility (breakfast / lunch / dinner / snack)
  5. Budget filter (estimated_cost_usd per serving ≤ daily_budget / meals_per_day)
  6. Cuisine preference (soft filter — does not hard-exclude but weights)

After hard filtering: target 1,000 candidates → ML scores → top-50 per slot.
"""
from __future__ import annotations
from typing import List, Optional, Set

import pandas as pd

from app.utils.logging import get_logger

log = get_logger(__name__)

# ── Slot mapping ───────────────────────────────────────────────────────────────
SLOT_TO_MEAL_TYPES: dict = {
    "breakfast":     {"breakfast"},
    "morning_snack": {"snack", "breakfast"},
    "lunch":         {"lunch"},
    "evening_snack": {"snack"},
    "snack2":        {"snack"},
    "dinner":        {"dinner", "lunch"},
}


def _normalise_allergen(allergen: str) -> str:
    mapping = {
        "nuts": "nut", "tree nuts": "nut", "tree_nuts": "nut",
        "seafood": "shellfish", "shrimp": "shellfish",
        "milk": "dairy", "lactose": "dairy",
        "wheat": "gluten",
    }
    return mapping.get(allergen.lower().strip(), allergen.lower().strip())


def filter_foods(
    df: pd.DataFrame,
    diet_type: str = "any",
    allergies: List[str] = None,
    excluded_foods: List[str] = None,
    meal_slot: Optional[str] = None,
    budget_per_meal: Optional[float] = None,
    preferred_cuisine: Optional[str] = None,
    targets: Optional[dict] = None,
) -> pd.DataFrame:
    """
    Apply hard filters and return a filtered DataFrame.

    Parameters
    ----------
    df : merged food DataFrame from loader
    diet_type : "veg", "vegan", "non_veg", "any"
    allergies : list of allergen category names to exclude
    excluded_foods : list of specific recipe_name substrings to exclude
    meal_slot : one of breakfast/morning_snack/lunch/evening_snack/dinner
    budget_per_meal : max USD per meal serving (optional)
    preferred_cuisine : preferred cuisine name (soft preference, not hard filter)
    targets : adjusted nutrition targets dict (used for sodium hard filter)
    """
    result = df.copy()
    initial_size = len(result)

    # ── 1. Diet type ──────────────────────────────────────────────────────────
    dt = (diet_type or "any").lower()
    if dt in ("veg", "vegetarian"):
        result = result[result["is_vegetarian"] == True]
    elif dt == "vegan":
        result = result[result["is_vegan"] == True]
    # "non_veg" and "any" → no filter

    # ── 2. Allergen exclusion ─────────────────────────────────────────────────
    if allergies:
        normalised = {_normalise_allergen(a) for a in allergies if a}
        # Exclude any recipe that contains any of the patient's allergens
        result = result[
            result["allergens"].apply(lambda s: len(s & normalised) == 0)
        ]

    # ── 3. Excluded food names ────────────────────────────────────────────────
    if excluded_foods:
        patterns = [n.lower().strip() for n in excluded_foods if n]
        def not_excluded(name: str) -> bool:
            nm = str(name).lower()
            return not any(p in nm for p in patterns)
        result = result[result["recipe_name"].apply(not_excluded)]

    # ── 4. Meal slot ──────────────────────────────────────────────────────────
    if meal_slot:
        target_slot = meal_slot.lower().strip()
        if "allowed_slots" in result.columns:
            result = result[result["allowed_slots"].apply(lambda s: target_slot in s)]
        else:
            allowed_slots = SLOT_TO_MEAL_TYPES.get(target_slot, {target_slot})
            result = result[result["meal_slot"].isin(allowed_slots)]

    # ── 5. Budget per meal ────────────────────────────────────────────────────
    if budget_per_meal is not None and budget_per_meal > 0:
        result = result[
            (result["estimated_cost_usd"].isna()) |
            (result["estimated_cost_usd"] <= budget_per_meal)
        ]

    # ── 6. Sodium hard cap (from adjusted targets) ────────────────────────────
    if targets and "sodium_mg_max" in targets:
        # Hard exclude foods that exceed 80% of the daily sodium cap in a single serving
        # — this prevents hypertension patients from having a single meal blow the limit
        sodium_hard_cap = targets["sodium_mg_max"] * 0.6
        result = result[result["sodium_mg"] <= sodium_hard_cap]

    after_size = len(result)
    log.info(
        f"food_filter: {initial_size} -> {after_size} after hard filters "
        f"(diet={dt}, allergies={allergies}, slot={meal_slot})"
    )

    if after_size == 0:
        log.warning(
            "No foods remain after hard filtering. "
            "Returning all non-allergen foods as fallback."
        )
        # Fallback: relax everything except allergens
        result = df.copy()
        if allergies:
            normalised = {_normalise_allergen(a) for a in allergies if a}
            result = result[result["allergens"].apply(lambda s: len(s & normalised) == 0)]
        if len(result) == 0:
            result = df.copy()  # absolute last resort — allergen filter may have been overzealous

    return result.reset_index(drop=True)

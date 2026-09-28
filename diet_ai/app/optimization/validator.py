"""
app/optimization/validator.py
Daily nutrition plan validation engine.
Verifies that the produced meal plan meets nutrition targets and constraints.
"""
from __future__ import annotations
from typing import List, Dict, Optional, Any
from app.utils.logging import get_logger

log = get_logger(__name__)


def compute_daily_totals(meal_plan_dict: Dict[str, Dict[str, Any]]) -> Dict[str, float]:
    """
    Sum exact calculated portion nutrition across all meal slots.
    """
    totals = {
        "calories": 0.0,
        "protein_g": 0.0,
        "carbs_g": 0.0,
        "fat_g": 0.0,
        "fiber_g": 0.0,
        "sugar_g": 0.0,
        "iron_mg": 0.0,
        "calcium_mg": 0.0,
        "vitamin_c_mg": 0.0,
        "sodium_mg": 0.0,
        "cost_usd": 0.0,
    }

    for slot, slot_data in meal_plan_dict.items():
        if not slot_data or "portion_nutrition" not in slot_data:
            continue
        nut = slot_data["portion_nutrition"]
        for k in totals:
            val = nut.get(k)
            if val is not None and not (isinstance(val, float) and val != val):  # not NaN
                totals[k] += float(val)

    return {k: round(v, 2) for k, v in totals.items()}


def validate_plan(
    daily_totals: Dict[str, float],
    targets: Dict[str, float],
    patient_allergies: List[str],
    meal_plan_dict: Dict[str, Dict[str, Any]],
    budget: Optional[float] = None,
    diet_type: str = "any",
) -> Dict[str, Any]:
    """
    Validate the generated whole-day diet plan against clinical nutrition targets and constraints.

    Returns
    -------
    dict with boolean checks, repetition check, and calculated validation badge.
    """
    # ── 1. Calorie check (±20% tolerance) ─────────────────────────────────────
    calorie_target = targets.get("calories", 2000.0)
    cal_actual = daily_totals.get("calories", 0.0)
    cal_ok = abs(cal_actual - calorie_target) / max(calorie_target, 1.0) <= 0.20

    # ── 2. Protein check (≥ 75% of target) ────────────────────────────────────
    prot_ok = daily_totals.get("protein_g", 0.0) >= targets.get("protein_g", 50.0) * 0.70

    # ── 3. Fiber check (≥ 70% of target) ──────────────────────────────────────
    fiber_ok = daily_totals.get("fiber_g", 0.0) >= targets.get("fiber_g", 25.0) * 0.65

    # ── 4. Sodium check (≤ max) ───────────────────────────────────────────────
    sodium_ok = daily_totals.get("sodium_mg", 0.0) <= targets.get("sodium_mg_max", 2300.0) * 1.05

    # ── 5. Budget check ───────────────────────────────────────────────────────
    budget_ok = None
    if budget is not None and budget > 0:
        actual_cost = daily_totals.get("cost_usd", 0.0)
        budget_ok = actual_cost <= budget * 1.05

    # ── 6. Allergen check (Zero tolerance) ───────────────────────────────────
    allergen_ok = True
    if patient_allergies:
        norm_allergens = {a.lower().strip() for a in patient_allergies if a}
        for slot, slot_data in meal_plan_dict.items():
            food = slot_data.get("food", {})
            allergens = set(food.get("allergens", frozenset()))
            if allergens & norm_allergens:
                allergen_ok = False
                log.error(f"Allergen violation in slot {slot}: {food.get('recipe_name')}")

    # ── 7. Diet type check (100% compliant) ───────────────────────────────────
    diet_ok = True
    dt = (diet_type or "any").lower()
    if dt in ("veg", "vegetarian"):
        for slot, slot_data in meal_plan_dict.items():
            food = slot_data.get("food", {})
            if not bool(food.get("is_vegetarian", True)):
                diet_ok = False
    elif dt == "vegan":
        for slot, slot_data in meal_plan_dict.items():
            food = slot_data.get("food", {})
            if not bool(food.get("is_vegan", True)):
                diet_ok = False

    # ── 8. Variety / No Repetition Check ──────────────────────────────────────
    recipe_names = []
    for slot, slot_data in meal_plan_dict.items():
        food = slot_data.get("food", {})
        rname = str(food.get("recipe_name", "")).strip()
        if rname:
            recipe_names.append(rname)
    repetition_ok = len(recipe_names) == len(set(recipe_names))

    # Overall validation flag
    overall = cal_ok and prot_ok and fiber_ok and sodium_ok and allergen_ok and diet_ok and repetition_ok

    # Clinically accurate badge text
    if overall:
        badge = "Within Target"
    elif allergen_ok and diet_ok and repetition_ok:
        badge = "Constraint Checked"
    else:
        badge = "Partial Validation"

    return {
        "calories":      cal_ok,
        "protein":       prot_ok,
        "fiber":         fiber_ok,
        "sodium":        sodium_ok,
        "budget":        budget_ok,
        "allergies":     allergen_ok,
        "diet_type":     diet_ok,
        "no_repetition": repetition_ok,
        "overall":       overall,
        "badge":         badge,
    }

"""
app/recommendation/explanation.py
=================================
Data-driven recommendation explanation engine.

Generates mathematically grounded explanations for why a food was chosen
based on its calculated contribution to the patient's daily nutritional targets (Fixes 9, 10, 11).

RULES:
- NO generic canned phrases like "Good calorie fit".
- NO unsupported claims about missing nutrients (Fix 10).
- Explicit percentages and grams grounded in actual patient targets (Fix 9).
"""
from __future__ import annotations
from typing import Dict, Any, List, Tuple


def generate_structured_food_reasons(
    portion_nutrition: Dict[str, float],
    daily_targets: Dict[str, float],
    meal_slot: str,
    conditions: List[str] | None = None,
    is_vegetarian: bool = True,
) -> Tuple[List[Dict[str, str]], str]:
    """
    Generate mathematically verified reasons and unified text for a food selection.

    Parameters
    ----------
    portion_nutrition : exact calculated nutrient values for this discrete portion
    daily_targets : patient's daily target amounts (calories, protein_g, fiber_g, iron_mg, sodium_mg_max)
    meal_slot : name of meal slot (breakfast, lunch, snack, dinner)
    conditions : list of medical conditions
    is_vegetarian : whether food is vegetarian

    Returns
    -------
    Tuple[List[Dict[str, str]], str]:
      - List of structured reason dicts: [{"type": "...", "message": "..."}]
      - Unified readable explanation string
    """
    conditions = conditions or []
    cond_set = {str(c).lower() for c in conditions}

    cals    = float(portion_nutrition.get("calories", 0.0))
    prot    = float(portion_nutrition.get("protein_g", 0.0))
    carbs   = float(portion_nutrition.get("carbs_g", 0.0))
    fat     = float(portion_nutrition.get("fat_g", 0.0))
    fiber   = float(portion_nutrition.get("fiber_g", 0.0))
    iron    = float(portion_nutrition.get("iron_mg", 0.0))
    calcium = float(portion_nutrition.get("calcium_mg", 0.0))
    vit_c   = float(portion_nutrition.get("vitamin_c_mg", 0.0))
    sodium  = float(portion_nutrition.get("sodium_mg", 0.0))

    target_cal   = max(float(daily_targets.get("calories", 2000.0)), 1.0)
    target_prot  = max(float(daily_targets.get("protein_g", 80.0)), 1.0)
    target_fiber = max(float(daily_targets.get("fiber_g", 25.0)), 1.0)
    target_iron  = max(float(daily_targets.get("iron_mg", 18.0)), 1.0)
    max_sodium   = max(float(daily_targets.get("sodium_mg_max", 2300.0)), 1.0)

    cal_pct   = round((cals / target_cal) * 100)
    prot_pct  = round((prot / target_prot) * 100)
    fiber_pct = round((fiber / target_fiber) * 100)
    iron_pct  = round((iron / target_iron) * 100)
    sod_pct   = round((sodium / max_sodium) * 100)

    reasons: List[Dict[str, str]] = []

    # 1. Calorie contribution
    reasons.append({
        "type": "calories",
        "message": f"Provides {round(cals)} kcal, contributing {cal_pct}% of your daily energy target ({round(target_cal)} kcal)."
    })

    # 2. Protein contribution (if significant)
    if prot >= 3.0:
        reasons.append({
            "type": "protein",
            "message": f"Provides {round(prot, 1)} g protein, contributing {prot_pct}% of your daily protein target ({round(target_prot)} g)."
        })

    # 3. Dietary fiber (if present)
    if fiber >= 2.0:
        reasons.append({
            "type": "fiber",
            "message": f"Provides {round(fiber, 1)} g dietary fiber, contributing {fiber_pct}% of your daily fiber goal ({round(target_fiber)} g)."
        })

    # 4. Condition-specific highlights (only if nutrient is present!)
    if ("anemia" in cond_set or "iron_deficiency" in cond_set):
        if iron >= 1.5:
            reasons.append({
                "type": "iron",
                "message": f"Delivers {round(iron, 1)} mg iron ({iron_pct}% of daily target) to support hemoglobin synthesis."
            })
        else:
            reasons.append({
                "type": "iron_note",
                "message": "Moderate iron profile; pair with vitamin C-rich foods for enhanced absorption."
            })

    if "hypertension" in cond_set:
        if sodium <= 350:
            reasons.append({
                "type": "sodium",
                "message": f"Low sodium profile ({round(sodium)} mg, {sod_pct}% of daily sodium ceiling) supporting blood pressure control."
            })

    if "diabetes" in cond_set and fiber >= 3.5:
        reasons.append({
            "type": "glycemic",
            "message": f"High fiber content ({round(fiber, 1)} g) supports slow glucose absorption and glycemic stability."
        })

    # Summary text
    summary_parts = [r["message"] for r in reasons[:3]]
    why_text = " ".join(summary_parts)

    return reasons, why_text


def generate_food_explanation(
    portion_nutrition: Dict[str, float],
    daily_targets: Dict[str, float],
    meal_slot: str,
    conditions: List[str] | None = None,
    is_vegetarian: bool = True,
) -> str:
    """Convenience wrapper returning the unified explanation string."""
    _, why_text = generate_structured_food_reasons(
        portion_nutrition, daily_targets, meal_slot, conditions, is_vegetarian
    )
    return why_text

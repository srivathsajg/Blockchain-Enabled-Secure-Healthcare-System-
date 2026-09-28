"""
app/recommendation/explanation.py
Data-driven recommendation explanation engine.

Generates mathematically grounded explanations for why a food was chosen
based on its calculated contribution to the patient's daily nutritional targets.

NO generic canned phrases.
NO unsupported claims about missing nutrients.
"""
from __future__ import annotations
from typing import Dict, Any, List


def generate_food_explanation(
    portion_nutrition: Dict[str, float],
    daily_targets: Dict[str, float],
    meal_slot: str,
    conditions: List[str] | None = None,
    is_vegetarian: bool = True,
) -> str:
    """
    Generate evidence-based explanation for a food selection.

    Parameters
    ----------
    portion_nutrition : exact calculated nutrient values for this portion
    daily_targets : patient's daily target amounts (calories, protein_g, fiber_g, iron_mg, sodium_mg_max)
    meal_slot : name of meal slot (breakfast, lunch, snack, dinner)
    conditions : list of medical conditions
    is_vegetarian : whether food is vegetarian

    Returns
    -------
    A concise, verified explanation string containing real numbers and percentages.
    """
    conditions = conditions or []
    cond_set = {c.lower() for c in conditions}

    cals    = portion_nutrition.get("calories", 0.0)
    prot    = portion_nutrition.get("protein_g", 0.0)
    fiber   = portion_nutrition.get("fiber_g", 0.0)
    iron    = portion_nutrition.get("iron_mg", 0.0)
    sodium  = portion_nutrition.get("sodium_mg", 0.0)

    target_cal   = max(daily_targets.get("calories", 2000.0), 1.0)
    target_prot  = max(daily_targets.get("protein_g", 80.0), 1.0)
    target_fiber = max(daily_targets.get("fiber_g", 25.0), 1.0)
    target_iron  = max(daily_targets.get("iron_mg", 18.0), 1.0)
    max_sodium   = max(daily_targets.get("sodium_mg_max", 2300.0), 1.0)

    cal_pct   = round((cals / target_cal) * 100)
    prot_pct  = round((prot / target_prot) * 100)
    fiber_pct = round((fiber / target_fiber) * 100)
    iron_pct  = round((iron / target_iron) * 100)
    sod_pct   = round((sodium / max_sodium) * 100)

    points = []

    # 1. Calorie statement
    points.append(f"Provides {round(cals)} kcal ({cal_pct}% of daily energy allocation)")

    # 2. Condition-specific highlight or major macro contributor
    if "anemia" in cond_set and iron >= 3.0:
        points.append(f"delivers {round(iron, 1)}mg iron ({iron_pct}% of daily target)")
    elif "diabetes" in cond_set and fiber >= 4.0:
        points.append(f"provides {round(fiber, 1)}g fiber ({fiber_pct}% of daily target) for glycemic control")
    elif "hypertension" in cond_set and sodium <= 450:
        points.append(f"low sodium ({round(sodium)}mg, {sod_pct}% of DASH limit)")
    elif prot_pct >= 20:
        points.append(f"delivers {round(prot, 1)}g protein ({prot_pct}% of daily protein target)")
    elif fiber_pct >= 18:
        points.append(f"supplies {round(fiber, 1)}g dietary fiber ({fiber_pct}% of daily target)")

    # 3. Balanced macro note
    if len(points) < 2:
        points.append(f"supplies {round(prot, 1)}g protein and {round(fiber, 1)}g fiber")

    return ". ".join(points) + "."

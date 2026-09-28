"""
app/nutrition/macros.py
Macronutrient target calculation.

Reference ratios based on USDA Dietary Guidelines 2020-2025:
  Protein:  10–35% of calories  (we use goal-adjusted %)
  Carbs:    45–65% of calories
  Fat:      20–35% of calories

Protein: 1g protein = 4 kcal
Carbs:   1g carb    = 4 kcal
Fat:     1g fat     = 9 kcal
Fiber:   AI for adults = 25–38g/day (IOM 2002)
"""
from __future__ import annotations
from app.schemas.patient import Goal


PROTEIN_KCAL_PER_G = 4.0
CARB_KCAL_PER_G   = 4.0
FAT_KCAL_PER_G    = 9.0

# Goal-adjusted protein ratio (% of total calories) - aligned with AMDR & clinical nutrition guidelines
PROTEIN_PCT_BY_GOAL = {
    "weight_loss":        0.24,
    "weight_management":  0.22,
    "weight_maintenance": 0.20,
    "general_wellness":   0.20,
    "muscle_gain":        0.28,
    "weight_gain":        0.22,
}

# Fat as % of total calories
FAT_PCT_BY_GOAL = {
    "weight_loss":        0.25,
    "weight_management":  0.25,
    "weight_maintenance": 0.28,
    "general_wellness":   0.28,
    "muscle_gain":        0.25,
    "weight_gain":        0.28,
}


def calculate_macro_targets(
    calorie_target: float,
    goal: str,
    weight_kg: Optional[float] = None,
) -> dict:
    """
    Return macronutrient targets in grams given a calorie target and goal.
    Carbs fill the remainder after protein and fat are allocated.
    """
    goal_key = goal if goal in PROTEIN_PCT_BY_GOAL else "general_wellness"

    protein_pct = PROTEIN_PCT_BY_GOAL[goal_key]
    fat_pct     = FAT_PCT_BY_GOAL[goal_key]

    raw_protein_g = calorie_target * protein_pct / PROTEIN_KCAL_PER_G

    # If weight is provided, cap protein at clinical upper bound of 1.8g/kg bodyweight
    if weight_kg and weight_kg > 0:
        max_protein_g = weight_kg * 1.8
        protein_g = min(raw_protein_g, max_protein_g)
    else:
        protein_g = raw_protein_g

    protein_g = round(protein_g, 1)
    protein_cals = protein_g * PROTEIN_KCAL_PER_G
    fat_g     = round(calorie_target * fat_pct / FAT_KCAL_PER_G, 1)
    fat_cals  = fat_g * FAT_KCAL_PER_G
    carb_cals = max(calorie_target - protein_cals - fat_cals, 0.0)
    carbs_g   = round(carb_cals / CARB_KCAL_PER_G, 1)

    return {
        "protein_g": protein_g,
        "fat_g":     fat_g,
        "carbs_g":   carbs_g,
    }


def calculate_fiber_target(age: int, gender: str) -> float:
    """
    Adequate Intake (AI) for dietary fibre.
    Source: IOM Dietary Reference Intakes, 2002.
    """
    g = (gender or "").lower()
    if age <= 50:
        return 38.0 if g == "male" else 25.0
    else:
        return 30.0 if g == "male" else 21.0

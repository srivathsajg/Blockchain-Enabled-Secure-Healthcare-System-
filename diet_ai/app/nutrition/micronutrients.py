"""
app/nutrition/micronutrients.py
Micronutrient RDA/AI targets.

Sources:
  - Iron:      NIH ODS — 8 mg/day adult male, 18 mg/day adult female (pre-menopausal)
  - Calcium:   NIH ODS — 1000 mg/day adults 19-50
  - Vitamin C: NIH ODS — 90 mg/day male, 75 mg/day female
  - Sodium:    AHA/WHO — < 2300 mg/day max

All values are guidance targets for this nutrition decision-support system.
They do not constitute clinical prescriptions.
"""
from __future__ import annotations


def calculate_micronutrient_targets(age: int, gender: str) -> dict:
    """
    Return daily micronutrient targets relevant to our dataset columns.
    """
    g = (gender or "").lower()

    # Iron (mg/day)
    if g == "female" and age < 51:
        iron_mg = 18.0
    elif g == "female" and age >= 51:
        iron_mg = 8.0
    else:
        iron_mg = 8.0   # adult male

    # Calcium (mg/day)
    if age < 19 or age > 70:
        calcium_mg = 1300.0
    elif age > 50:
        calcium_mg = 1200.0
    else:
        calcium_mg = 1000.0

    # Vitamin C (mg/day)
    vitamin_c_mg = 90.0 if g == "male" else 75.0

    # Sodium max (mg/day)
    sodium_mg_max = 2300.0

    return {
        "iron_mg":       iron_mg,
        "calcium_mg":    calcium_mg,
        "vitamin_c_mg":  vitamin_c_mg,
        "sodium_mg_max": sodium_mg_max,
    }

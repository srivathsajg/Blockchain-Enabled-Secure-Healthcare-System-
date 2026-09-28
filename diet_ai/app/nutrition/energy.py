"""
app/nutrition/energy.py
BMR and TDEE calculations.

BMR formula: Mifflin-St Jeor (1990)
  - Mifflin MD, St Jeor ST, et al. (1990). A new predictive equation for
    resting energy expenditure in healthy individuals. AJCN 51(2):241-247.

TDEE: BMR × Activity Factor (standard multipliers from Harris-Benedict updates)
"""
from __future__ import annotations
from app.schemas.patient import ActivityLevel, Gender


ACTIVITY_MULTIPLIERS = {
    ActivityLevel.sedentary:   1.2,
    ActivityLevel.light:       1.375,
    ActivityLevel.moderate:    1.55,
    ActivityLevel.active:      1.725,
    ActivityLevel.very_active: 1.9,
}


def calculate_bmr(
    weight_kg: float,
    height_cm: float,
    age: int,
    gender: Gender,
) -> float:
    """
    Mifflin-St Jeor Equation for Basal Metabolic Rate (kcal/day).
    Male:   10W + 6.25H - 5A + 5
    Female: 10W + 6.25H - 5A - 161
    """
    base = 10 * weight_kg + 6.25 * height_cm - 5 * age
    if gender in (Gender.male, "male"):
        return round(base + 5, 2)
    else:
        return round(base - 161, 2)


def calculate_tdee(bmr: float, activity_level: ActivityLevel) -> float:
    """Total Daily Energy Expenditure = BMR × activity multiplier."""
    multiplier = ACTIVITY_MULTIPLIERS.get(activity_level, 1.55)
    return round(bmr * multiplier, 2)

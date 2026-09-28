"""
app/nutrition/requirements.py
Unified nutrition requirement engine.
Combines BMI, BMR, TDEE, macros, and micronutrients into a single NutritionTargets object.
"""
from __future__ import annotations
from dataclasses import dataclass, asdict
from typing import Optional

from app.schemas.patient import PatientInput, ActivityLevel, Goal, Gender
from app.nutrition.bmi import calculate_bmi, bmi_status
from app.nutrition.energy import calculate_bmr, calculate_tdee
from app.nutrition.macros import (
    calculate_macro_targets,
    calculate_fiber_target,
)
from app.nutrition.micronutrients import calculate_micronutrient_targets
from app.data.preprocessing import goal_to_calorie_multiplier


@dataclass
class NutritionTargets:
    # Energy
    calories: float
    # Macros
    protein_g: float
    carbs_g: float
    fat_g: float
    fiber_g: float
    # Micros
    iron_mg: float
    calcium_mg: float
    vitamin_c_mg: float
    sodium_mg_max: float
    # Profile metadata (not returned to user in full but used internally)
    bmi: float
    bmi_status: str
    bmr: float
    tdee: float
    goal: str
    activity_level: str

    def to_dict(self) -> dict:
        return asdict(self)


def calculate_nutrition_targets(patient: PatientInput) -> NutritionTargets:
    """
    Compute all daily nutrition targets for the given patient profile.
    Returns a NutritionTargets dataclass.
    """
    # ── BMI ────────────────────────────────────────────────────────────────────
    bmi = calculate_bmi(patient.weight_kg, patient.height_cm)
    bmi_cat = bmi_status(bmi)

    # ── BMR ────────────────────────────────────────────────────────────────────
    age_for_calc = max(patient.age, 18)   # Mifflin-St Jeor validated for adults
    bmr = calculate_bmr(
        patient.weight_kg,
        patient.height_cm,
        age_for_calc,
        patient.gender,
    )

    # ── TDEE ───────────────────────────────────────────────────────────────────
    tdee = calculate_tdee(bmr, patient.activity_level)

    # ── Calorie target adjusted for goal ───────────────────────────────────────
    goal_str = patient.goal.value if hasattr(patient.goal, "value") else str(patient.goal)
    calorie_multiplier = goal_to_calorie_multiplier(goal_str)
    calorie_target = round(tdee * calorie_multiplier, 0)

    # ── Macros ─────────────────────────────────────────────────────────────────
    macros = calculate_macro_targets(calorie_target, goal_str, weight_kg=patient.weight_kg)
    fiber  = calculate_fiber_target(patient.age, str(patient.gender))

    # ── Micronutrients ─────────────────────────────────────────────────────────
    gender_str = patient.gender.value if hasattr(patient.gender, "value") else str(patient.gender)
    micros = calculate_micronutrient_targets(patient.age, gender_str)

    return NutritionTargets(
        calories      = calorie_target,
        protein_g     = macros["protein_g"],
        carbs_g       = macros["carbs_g"],
        fat_g         = macros["fat_g"],
        fiber_g       = fiber,
        iron_mg       = micros["iron_mg"],
        calcium_mg    = micros["calcium_mg"],
        vitamin_c_mg  = micros["vitamin_c_mg"],
        sodium_mg_max = micros["sodium_mg_max"],
        bmi           = bmi,
        bmi_status    = bmi_cat,
        bmr           = bmr,
        tdee          = tdee,
        goal          = goal_str,
        activity_level= str(patient.activity_level),
    )

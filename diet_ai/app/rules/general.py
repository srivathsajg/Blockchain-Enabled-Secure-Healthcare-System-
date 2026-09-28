"""
app/rules/general.py
General nutrition rules applied to all patients.
"""
from __future__ import annotations
from typing import Dict, Any


def apply_general_rules(targets: dict, patient_profile: dict) -> dict:
    """
    General rules that apply regardless of medical conditions.
    Returns a dict of constraint adjustments and rule metadata.
    """
    rules_applied = []

    bmi = patient_profile.get("bmi", 22.0)
    goal = patient_profile.get("goal", "general_wellness")

    # Underweight: increase calorie target slightly
    if bmi < 18.5 and goal not in ("weight_loss",):
        targets["calories"] = round(targets["calories"] * 1.05, 0)
        rules_applied.append({
            "condition": "Underweight BMI",
            "priority": "MEDIUM",
            "macro_directive": "Calorie target increased by 5% to support healthy weight gain.",
        })

    # Obese: apply additional sodium caution regardless of explicit conditions
    if bmi >= 30.0:
        targets["sodium_mg_max"] = min(targets.get("sodium_mg_max", 2300), 2000.0)
        rules_applied.append({
            "condition": "Elevated BMI",
            "priority": "LOW",
            "macro_directive": "Sodium ceiling lowered to 2000mg/day as a general wellness measure.",
        })

    return {"targets": targets, "rules_applied": rules_applied}

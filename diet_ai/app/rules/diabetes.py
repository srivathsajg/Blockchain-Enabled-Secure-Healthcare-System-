"""app/rules/diabetes.py — Nutrition support rules for diabetes-related conditions."""
from __future__ import annotations


def apply_diabetes_rules(targets: dict) -> dict:
    rules_applied = []
    # Lower carbohydrate ceiling, increase fiber
    targets["carbs_g"] = round(targets.get("carbs_g", 250) * 0.75, 1)
    targets["fiber_g"] = max(targets.get("fiber_g", 25), 35.0)
    rules_applied.append({
        "condition": "Diabetes / Elevated Blood Glucose",
        "priority": "HIGH",
        "macro_directive": (
            "Carbohydrate target reduced by 25% to support glycaemic control. "
            "Fibre target raised to ≥35g/day. "
            "Low-glycaemic-index foods are preferred. "
            "This is nutritional decision support — not a substitute for medical care."
        ),
        "food_score_adjustments": {
            "prefer_high_fiber": True,
            "penalise_high_sugar": True,
            "sugar_penalty_threshold_g": 15,
        },
    })
    return {"targets": targets, "rules_applied": rules_applied}

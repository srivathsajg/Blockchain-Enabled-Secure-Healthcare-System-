"""app/rules/obesity.py — Nutrition support rules for obesity / weight management."""
from __future__ import annotations


def apply_obesity_rules(targets: dict) -> dict:
    rules_applied = []
    # Tighten calorie ceiling, boost fiber for satiety, sodium caution
    targets["calories"] = round(targets.get("calories", 2000) * 0.85, 0)
    targets["fiber_g"] = max(targets.get("fiber_g", 25), 35.0)
    targets["sodium_mg_max"] = min(targets.get("sodium_mg_max", 2300), 2000.0)
    rules_applied.append({
        "condition": "Weight Management (High BMI / Obesity)",
        "priority": "HIGH",
        "macro_directive": (
            "Calorie target reduced by 15% for energy deficit. "
            "Fibre target raised to ≥35g/day for satiety. "
            "Sodium capped at 2000mg/day. "
            "High-volume, low-energy-density foods preferred. "
            "This is nutrition decision support — not a weight-loss prescription."
        ),
        "food_score_adjustments": {
            "prefer_high_fiber": True,
            "prefer_low_calorie_density": True,
        },
    })
    return {"targets": targets, "rules_applied": rules_applied}

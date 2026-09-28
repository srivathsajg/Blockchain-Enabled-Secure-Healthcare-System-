"""app/rules/anemia.py — Nutrition support rules for iron-related concerns."""
from __future__ import annotations


def apply_anemia_rules(targets: dict, gender: str = "male") -> dict:
    rules_applied = []
    # Increase iron target
    targets["iron_mg"] = max(targets.get("iron_mg", 8), 27.0)
    targets["vitamin_c_mg"] = max(targets.get("vitamin_c_mg", 75), 120.0)
    rules_applied.append({
        "condition": "Iron Nutritional Concern (Anaemia proxy)",
        "priority": "HIGH",
        "macro_directive": (
            "Iron target raised to ≥27mg/day (therapeutic guidance range). "
            "Vitamin C target raised to ≥120mg/day to enhance non-haem iron absorption. "
            "Iron-rich foods prioritised. "
            "Clinician review recommended for confirmed iron deficiency anaemia."
        ),
        "food_score_adjustments": {
            "prefer_high_iron": True,
            "iron_boost_weight": 2.0,
        },
    })
    return {"targets": targets, "rules_applied": rules_applied}

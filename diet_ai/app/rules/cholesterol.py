"""app/rules/cholesterol.py — Nutrition support rules for high cholesterol."""
from __future__ import annotations


def apply_cholesterol_rules(targets: dict) -> dict:
    rules_applied = []
    # Reduce fat slightly, increase fiber (soluble fiber lowers LDL)
    targets["fat_g"] = round(targets.get("fat_g", 70) * 0.85, 1)
    targets["fiber_g"] = max(targets.get("fiber_g", 25), 30.0)
    rules_applied.append({
        "condition": "Elevated Cholesterol / Dyslipidaemia",
        "priority": "HIGH",
        "macro_directive": (
            "Fat target reduced by 15%. "
            "Fibre target raised to ≥30g/day (soluble fibre for LDL support). "
            "This tool does not distinguish saturated from unsaturated fat — "
            "prefer whole-food plant sources of fat where possible. "
            "Clinician review recommended."
        ),
        "food_score_adjustments": {
            "prefer_high_fiber": True,
            "penalise_high_fat": True,
            "fat_penalty_threshold_g": 20,  # per serving
        },
    })
    return {"targets": targets, "rules_applied": rules_applied}

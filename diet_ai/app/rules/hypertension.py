"""
app/rules/hypertension.py
Nutrition rules for patients with hypertension.
DISCLAIMER: This is a nutrition decision-support tool, not clinical treatment.
"""
from __future__ import annotations


def apply_hypertension_rules(targets: dict) -> dict:
    """
    Apply DASH-diet-inspired sodium and nutrient constraints.
    Source: NHLBI DASH Eating Plan guidelines.
    This is a nutrition guideline, not a clinical prescription.
    """
    rules_applied = []

    # Stricter sodium ceiling
    targets["sodium_mg_max"] = min(targets.get("sodium_mg_max", 2300), 1500.0)
    rules_applied.append({
        "condition": "Elevated Blood Pressure (Hypertension)",
        "priority": "HIGH",
        "macro_directive": (
            "Sodium restricted to ≤1500mg/day (DASH-aligned guideline). "
            "Higher-potassium and magnesium-rich foods preferred. "
            "Clinician review recommended for personalised management."
        ),
        "food_score_adjustments": {
            "penalise_high_sodium": True,
            "sodium_penalty_threshold_mg": 600,  # per serving
        },
    })

    return {"targets": targets, "rules_applied": rules_applied}

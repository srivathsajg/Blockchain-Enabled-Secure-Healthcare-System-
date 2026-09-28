"""
app/rules/__init__.py
Rule engine orchestrator.
Applies all relevant condition-specific rules based on patient profile.
"""
from __future__ import annotations
from typing import List, Dict, Any

from app.schemas.patient import PatientInput, MedicalCondition
from app.nutrition.requirements import NutritionTargets
from app.rules.general import apply_general_rules
from app.rules.hypertension import apply_hypertension_rules
from app.rules.diabetes import apply_diabetes_rules
from app.rules.anemia import apply_anemia_rules
from app.rules.cholesterol import apply_cholesterol_rules
from app.rules.obesity import apply_obesity_rules
from app.nutrition.bmi import bmi_status


def apply_medical_rules(
    patient: PatientInput,
    targets: NutritionTargets,
) -> tuple[dict, List[Dict[str, Any]]]:
    """
    Apply all relevant medical-condition-based nutrition rules.

    Returns
    -------
    targets_dict : adjusted nutrition targets as dict
    rules_applied : list of rule metadata dicts for explainability
    """
    targets_dict = targets.to_dict()
    all_rules: List[Dict[str, Any]] = []

    gender_str = patient.gender.value if hasattr(patient.gender, "value") else str(patient.gender)
    bmi = targets_dict.get("bmi", 22.0)
    bmi_cat = bmi_status(bmi)

    # ── General rules always applied ──────────────────────────────────────────
    result = apply_general_rules(targets_dict, {"bmi": bmi, "goal": str(patient.goal)})
    targets_dict = result["targets"]
    all_rules.extend(result["rules_applied"])

    # ── Auto-add obesity rule if BMI >= 30 ────────────────────────────────────
    conditions = [c.value if hasattr(c, "value") else str(c) for c in patient.medical_conditions]
    if bmi_cat == "Obese" and "obesity" not in conditions:
        conditions.append("obesity")

    # ── Apply condition-specific rules ────────────────────────────────────────
    condition_handlers = {
        "hypertension":    lambda: apply_hypertension_rules(targets_dict),
        "diabetes":        lambda: apply_diabetes_rules(targets_dict),
        "anemia":          lambda: apply_anemia_rules(targets_dict, gender_str),
        "high_cholesterol":lambda: apply_cholesterol_rules(targets_dict),
        "obesity":         lambda: apply_obesity_rules(targets_dict),
    }

    for condition in conditions:
        key = condition.lower()
        if key in condition_handlers:
            result = condition_handlers[key]()
            targets_dict = result["targets"]
            all_rules.extend(result["rules_applied"])

    # Ensure sodium cannot go below a safe floor
    targets_dict["sodium_mg_max"] = max(targets_dict.get("sodium_mg_max", 1500), 1200.0)

    return targets_dict, all_rules

"""
app/api/diet.py
FastAPI router for diet recommendation endpoints.
"""
from __future__ import annotations
from typing import Any

from fastapi import APIRouter, HTTPException, Depends
from pydantic import ValidationError

from app.schemas.patient import PatientInput
from app.schemas.diet import DietResponse
from app.recommendation.engine import generate_diet_plan
from app.nutrition.requirements import calculate_nutrition_targets
from app.utils.logging import get_logger

log = get_logger(__name__)
router = APIRouter(prefix="/api/diet", tags=["Diet Recommendation"])


@router.post("/recommend", response_model=DietResponse)
async def recommend_diet(patient: PatientInput) -> DietResponse:
    """
    Generate a personalised diet plan.

    Full pipeline:
    Patient profile → BMI/BMR/TDEE → Medical rules → Food filtering →
    Feature engineering → XGBoost ranking → PuLP optimisation → Validation → Response

    DISCLAIMER: This is a nutrition decision-support tool.
    It does NOT diagnose medical conditions and is NOT a substitute for clinical care.
    """
    log.info(f"Diet recommendation request received (patient_id={patient.patient_id})")
    result = generate_diet_plan(patient)
    return result


@router.post("/analyze-patient")
async def analyze_patient(patient: PatientInput) -> dict:
    """
    Calculate and return BMI, BMR, TDEE, and nutrition targets for a patient
    without generating a full meal plan.
    """
    try:
        targets = calculate_nutrition_targets(patient)
        return {
            "status": "success",
            "patient_summary": {
                "bmi":            targets.bmi,
                "bmi_status":     targets.bmi_status,
                "bmr":            targets.bmr,
                "tdee":           targets.tdee,
                "goal":           targets.goal,
                "activity_level": targets.activity_level,
            },
            "nutrition_targets": {
                "calories":      targets.calories,
                "protein_g":     targets.protein_g,
                "carbs_g":       targets.carbs_g,
                "fat_g":         targets.fat_g,
                "fiber_g":       targets.fiber_g,
                "iron_mg":       targets.iron_mg,
                "calcium_mg":    targets.calcium_mg,
                "vitamin_c_mg":  targets.vitamin_c_mg,
                "sodium_mg_max": targets.sodium_mg_max,
            },
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/calculate-targets")
async def calculate_targets(patient: PatientInput) -> dict:
    """
    Calculate only the nutrition targets (alias for analyze-patient for compatibility).
    """
    return await analyze_patient(patient)


@router.post("/validate")
async def validate_diet(payload: dict) -> dict:
    """
    Validate a provided diet plan's nutrition totals against patient targets.
    Expects: {patient: ..., daily_totals: {...}}
    """
    from app.optimization.validator import validate_plan
    try:
        patient_data = payload.get("patient", {})
        patient = PatientInput(**patient_data)
        targets = calculate_nutrition_targets(patient)
        targets_dict = targets.to_dict()

        from app.rules import apply_medical_rules
        targets_dict, _ = apply_medical_rules(patient, targets)

        daily_totals = payload.get("daily_totals", {})
        result = validate_plan(
            daily_totals      = daily_totals,
            targets           = targets_dict,
            patient_allergies = patient.allergies or [],
            meal_plans        = {},
            budget            = patient.budget,
            diet_type         = str(patient.diet_type),
        )
        return {"status": "success", "validation": result}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

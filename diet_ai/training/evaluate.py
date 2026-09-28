"""
training/evaluate.py
Evaluates the trained XGBoost ranker and runs 5 test patients through the full pipeline.
Generates a final report.

Run from diet_ai/ directory:
    python training/evaluate.py
"""
from __future__ import annotations
import sys
import json
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from app.schemas.patient import (
    PatientInput, ActivityLevel, Goal, DietType, Gender, MedicalCondition, LabValues
)
from app.recommendation.engine import generate_diet_plan
from app.config import REPORTS_DIR, MODELS_DIR
from app.utils.logging import get_logger

log = get_logger("evaluate")

# ── 5 diverse test patients ──────────────────────────────────────────────────
TEST_PATIENTS = [
    {
        "name": "Patient 1 — Healthy adult male (weight loss goal)",
        "profile": PatientInput(
            age=32, gender=Gender.male, height_cm=175, weight_kg=90,
            activity_level=ActivityLevel.moderate, goal=Goal.weight_loss,
            diet_type=DietType.any, meals_per_day=5,
        ),
    },
    {
        "name": "Patient 2 — Diabetic vegetarian female",
        "profile": PatientInput(
            age=48, gender=Gender.female, height_cm=162, weight_kg=72,
            activity_level=ActivityLevel.light, goal=Goal.weight_management,
            diet_type=DietType.veg, meals_per_day=5,
            medical_conditions=[MedicalCondition.diabetes],
            lab_values=LabValues(glucose=138, hba1c=7.1),
        ),
    },
    {
        "name": "Patient 3 — Hypertensive elderly male",
        "profile": PatientInput(
            age=65, gender=Gender.male, height_cm=168, weight_kg=78,
            activity_level=ActivityLevel.sedentary, goal=Goal.general_wellness,
            diet_type=DietType.any, meals_per_day=5,
            medical_conditions=[MedicalCondition.hypertension],
            lab_values=LabValues(blood_pressure_systolic=148, cholesterol=210),
        ),
    },
    {
        "name": "Patient 4 — Anaemic young female (vegan, muscle gain)",
        "profile": PatientInput(
            age=24, gender=Gender.female, height_cm=158, weight_kg=50,
            activity_level=ActivityLevel.active, goal=Goal.muscle_gain,
            diet_type=DietType.vegan, meals_per_day=5,
            medical_conditions=[MedicalCondition.anemia],
            lab_values=LabValues(hemoglobin=10.2),
        ),
    },
    {
        "name": "Patient 5 — Obese + high cholesterol, vegetarian",
        "profile": PatientInput(
            age=41, gender=Gender.male, height_cm=170, weight_kg=105,
            activity_level=ActivityLevel.sedentary, goal=Goal.weight_loss,
            diet_type=DietType.veg, meals_per_day=5,
            medical_conditions=[MedicalCondition.obesity, MedicalCondition.high_cholesterol],
            lab_values=LabValues(cholesterol=260, triglycerides=225),
        ),
    },
]


def main():
    log.info("=== Evaluating pipeline with 5 test patients ===")
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)

    results_summary = []

    for i, test in enumerate(TEST_PATIENTS, 1):
        log.info(f"\n--- {test['name']} ---")
        patient = test["profile"]
        result = generate_diet_plan(patient)

        meal_count = len(result.meals)
        total_cal  = result.daily_totals.calories if result.daily_totals else 0
        valid_overall = result.validation.overall if result.validation else False

        log.info(f"  Status:       {result.status}")
        log.info(f"  BMI:          {result.patient_summary.bmi if result.patient_summary else 'N/A'} ({result.patient_summary.bmi_status if result.patient_summary else ''})")
        log.info(f"  Cal target:   {result.nutrition_targets.calories if result.nutrition_targets else 'N/A'}")
        log.info(f"  Cal actual:   {total_cal}")
        log.info(f"  Meals:        {meal_count}")
        log.info(f"  Valid:        {valid_overall}")
        log.info(f"  Rules:        {len(result.clinical_rules_applied)}")
        log.info(f"  Warnings:     {result.warnings}")

        summary = {
            "patient":     test["name"],
            "status":      result.status,
            "bmi":         result.patient_summary.bmi if result.patient_summary else None,
            "bmi_status":  result.patient_summary.bmi_status if result.patient_summary else None,
            "target_cal":  result.nutrition_targets.calories if result.nutrition_targets else None,
            "actual_cal":  total_cal,
            "meal_count":  meal_count,
            "valid":       valid_overall,
            "rules_count": len(result.clinical_rules_applied),
            "warnings":    result.warnings,
        }
        results_summary.append(summary)

        # Show first meal slot
        if result.meals:
            m = result.meals[0]
            log.info(f"  First meal ({m.meal}): {[f.name for f in m.foods]}")

    # Save summary report
    summary_path = REPORTS_DIR / "evaluation_summary.json"
    with open(summary_path, "w") as f:
        json.dump(results_summary, f, indent=2, default=str)

    print("\n=== Evaluation Complete ===")
    passed = sum(1 for r in results_summary if r["status"] in ("success", "partial") and r["valid"])
    print(f"  Patients tested: {len(TEST_PATIENTS)}")
    print(f"  Passed (valid):  {passed}")
    print(f"  Report saved:    {summary_path}")

    for r in results_summary:
        status = "PASS" if r["valid"] else "WARN"
        print(f"  [{status}] {r['patient'][:60]}")
        print(f"         calories: target={r['target_cal']}, actual={r['actual_cal']}, status={r['status']}")


if __name__ == "__main__":
    main()

"""
tests/test_diet_ai.py
pytest test suite for the Diet AI service.

Run from diet_ai/ directory:
    pytest tests/ -v
"""
from __future__ import annotations
import sys
from pathlib import Path

# Allow imports from diet_ai root
sys.path.insert(0, str(Path(__file__).parent.parent))

import pytest
import numpy as np

from app.schemas.patient import (
    PatientInput, ActivityLevel, Goal, DietType, Gender,
    MedicalCondition, LabValues,
)
from app.nutrition.bmi import calculate_bmi, bmi_status
from app.nutrition.energy import calculate_bmr, calculate_tdee
from app.nutrition.macros import calculate_macro_targets, calculate_fiber_target
from app.nutrition.micronutrients import calculate_micronutrient_targets
from app.nutrition.requirements import calculate_nutrition_targets
from app.data.loader import load_food_dataframe
from app.rules import apply_medical_rules
from app.recommendation.food_filter import filter_foods
from app.ml.feature_engineering import engineer_features
from app.recommendation.engine import generate_diet_plan


# ─────────────────────────────────────────────────────────────────────────────
# Fixtures
# ─────────────────────────────────────────────────────────────────────────────

@pytest.fixture(scope="module")
def food_df():
    return load_food_dataframe()


@pytest.fixture
def healthy_male():
    return PatientInput(
        age=30, gender=Gender.male, height_cm=175, weight_kg=75,
        activity_level=ActivityLevel.moderate, goal=Goal.general_wellness,
        diet_type=DietType.any, meals_per_day=5,
    )


@pytest.fixture
def diabetic_female():
    return PatientInput(
        age=50, gender=Gender.female, height_cm=160, weight_kg=70,
        activity_level=ActivityLevel.light, goal=Goal.weight_management,
        diet_type=DietType.veg, meals_per_day=5,
        medical_conditions=[MedicalCondition.diabetes],
        lab_values=LabValues(glucose=140, hba1c=7.2),
    )


@pytest.fixture
def hypertensive_patient():
    return PatientInput(
        age=60, gender=Gender.male, height_cm=170, weight_kg=80,
        activity_level=ActivityLevel.sedentary, goal=Goal.general_wellness,
        diet_type=DietType.any, meals_per_day=5,
        medical_conditions=[MedicalCondition.hypertension],
    )


# ─────────────────────────────────────────────────────────────────────────────
# BMI Tests
# ─────────────────────────────────────────────────────────────────────────────

def test_bmi_normal():
    bmi = calculate_bmi(70, 175)
    assert 22 < bmi < 23.5


def test_bmi_obese():
    bmi = calculate_bmi(100, 170)
    assert bmi > 30


def test_bmi_underweight():
    bmi = calculate_bmi(40, 175)
    assert bmi < 18.5


def test_bmi_status_normal():
    assert bmi_status(22.0) == "Normal"


def test_bmi_status_obese():
    assert bmi_status(32.0) == "Obese"


# ─────────────────────────────────────────────────────────────────────────────
# BMR / TDEE Tests
# ─────────────────────────────────────────────────────────────────────────────

def test_bmr_male_positive():
    bmr = calculate_bmr(75, 175, 30, Gender.male)
    assert bmr > 0
    # Mifflin-St Jeor: 10*75 + 6.25*175 - 5*30 + 5 = 1698.75
    assert 1650 < bmr < 1750


def test_bmr_female_less_than_male():
    bmr_m = calculate_bmr(70, 165, 35, Gender.male)
    bmr_f = calculate_bmr(70, 165, 35, Gender.female)
    assert bmr_f < bmr_m


def test_tdee_active_greater_than_sedentary():
    bmr = 1700
    tdee_a = calculate_tdee(bmr, ActivityLevel.active)
    tdee_s = calculate_tdee(bmr, ActivityLevel.sedentary)
    assert tdee_a > tdee_s


# ─────────────────────────────────────────────────────────────────────────────
# Macro Tests
# ─────────────────────────────────────────────────────────────────────────────

def test_macros_sum_to_calories():
    cal = 2000
    macros = calculate_macro_targets(cal, "general_wellness")
    kcal_from_macros = (
        macros["protein_g"] * 4 +
        macros["carbs_g"]   * 4 +
        macros["fat_g"]     * 9
    )
    # Should be within 5% of target calories
    assert abs(kcal_from_macros - cal) / cal < 0.05


def test_fiber_male_over_50():
    fiber = calculate_fiber_target(55, "male")
    assert fiber == 30.0


def test_fiber_female_under_50():
    fiber = calculate_fiber_target(30, "female")
    assert fiber == 25.0


# ─────────────────────────────────────────────────────────────────────────────
# Micronutrient Tests
# ─────────────────────────────────────────────────────────────────────────────

def test_iron_female_premenopausal():
    micros = calculate_micronutrient_targets(30, "female")
    assert micros["iron_mg"] == 18.0


def test_iron_male():
    micros = calculate_micronutrient_targets(30, "male")
    assert micros["iron_mg"] == 8.0


def test_sodium_max_within_guidelines():
    micros = calculate_micronutrient_targets(40, "male")
    assert micros["sodium_mg_max"] <= 2300


# ─────────────────────────────────────────────────────────────────────────────
# Nutrition Targets Integration
# ─────────────────────────────────────────────────────────────────────────────

def test_calculate_nutrition_targets_healthy(healthy_male):
    targets = calculate_nutrition_targets(healthy_male)
    assert targets.calories > 0
    assert targets.protein_g > 0
    assert targets.bmi > 0
    assert targets.bmr > 0
    assert targets.tdee > targets.bmr


def test_weight_loss_target_below_tdee(healthy_male):
    healthy_male.goal = Goal.weight_loss
    targets = calculate_nutrition_targets(healthy_male)
    assert targets.calories < targets.tdee


# ─────────────────────────────────────────────────────────────────────────────
# Dataset Tests
# ─────────────────────────────────────────────────────────────────────────────

def test_dataset_loads(food_df):
    assert len(food_df) > 9000
    assert "recipe_id" in food_df.columns
    assert "calories" in food_df.columns
    assert "iron_mg" in food_df.columns   # converted from %DV


def test_no_missing_nutrition_values(food_df):
    for col in ["calories", "protein_g", "carbs_g", "fat_g", "fiber_g", "sodium_mg"]:
        assert food_df[col].isnull().sum() == 0


def test_no_negative_nutrition_values(food_df):
    for col in ["calories", "protein_g", "carbs_g", "fat_g", "fiber_g"]:
        assert (food_df[col] < 0).sum() == 0


def test_iron_mg_converted(food_df):
    # iron_mg should be derived from iron_percent (0–18mg range roughly)
    assert food_df["iron_mg"].max() <= 18 * 1.2  # some tolerance
    assert food_df["iron_mg"].min() >= 0


def test_allergens_are_frozensets(food_df):
    assert all(isinstance(a, frozenset) for a in food_df["allergens"])


# ─────────────────────────────────────────────────────────────────────────────
# Medical Rules Tests
# ─────────────────────────────────────────────────────────────────────────────

def test_hypertension_rule_lowers_sodium(hypertensive_patient):
    targets_obj = calculate_nutrition_targets(hypertensive_patient)
    targets_dict, rules = apply_medical_rules(hypertensive_patient, targets_obj)
    assert targets_dict["sodium_mg_max"] <= 1500
    assert any("Hypertension" in r["condition"] or "Blood Pressure" in r["condition"]
               for r in rules)


def test_diabetes_rule_lowers_carbs(diabetic_female):
    targets_obj = calculate_nutrition_targets(diabetic_female)
    base_carbs = targets_obj.carbs_g
    targets_dict, rules = apply_medical_rules(diabetic_female, targets_obj)
    assert targets_dict["carbs_g"] < base_carbs
    assert targets_dict["fiber_g"] >= 35.0


def test_anemia_rule_raises_iron():
    patient = PatientInput(
        age=25, gender=Gender.female, height_cm=160, weight_kg=55,
        medical_conditions=[MedicalCondition.anemia], meals_per_day=5,
    )
    targets_obj = calculate_nutrition_targets(patient)
    targets_dict, rules = apply_medical_rules(patient, targets_obj)
    assert targets_dict["iron_mg"] >= 27.0


# ─────────────────────────────────────────────────────────────────────────────
# Food Filter Tests
# ─────────────────────────────────────────────────────────────────────────────

def test_vegetarian_filter(food_df):
    filtered = filter_foods(food_df, diet_type="veg")
    assert all(filtered["is_vegetarian"])


def test_allergen_filter_removes_dairy(food_df):
    filtered = filter_foods(food_df, allergies=["dairy"])
    for _, row in filtered.iterrows():
        assert "dairy" not in row["allergens"]


def test_meal_slot_filter(food_df):
    filtered = filter_foods(food_df, meal_slot="breakfast")
    assert len(filtered) > 0
    # All returned foods should be breakfast-compatible
    assert all(s in ("breakfast",) for s in filtered["meal_slot"])


def test_filter_falls_back_not_empty(food_df):
    # Even with extreme filters, should return something
    filtered = filter_foods(
        food_df,
        diet_type="veg",
        allergies=[],
        excluded_foods=[],
        meal_slot="breakfast",
    )
    assert len(filtered) > 0


# ─────────────────────────────────────────────────────────────────────────────
# Feature Engineering Tests
# ─────────────────────────────────────────────────────────────────────────────

def test_feature_engineering_keys(food_df, healthy_male):
    targets_obj = calculate_nutrition_targets(healthy_male)
    targets_dict, rules = apply_medical_rules(healthy_male, targets_obj)
    food_row = food_df.iloc[0]
    feats = engineer_features(
        food_row, targets_dict, "lunch", "any", [], {}, None, 5
    )
    required = [
        "calorie_gap_score", "protein_gap_score", "fiber_gap_score",
        "sodium_penalty", "diet_compat", "slot_compat",
    ]
    for key in required:
        assert key in feats


def test_feature_values_bounded(food_df, healthy_male):
    targets_obj = calculate_nutrition_targets(healthy_male)
    targets_dict, _ = apply_medical_rules(healthy_male, targets_obj)
    food_row = food_df.iloc[0]
    feats = engineer_features(food_row, targets_dict, "lunch", "any", [], {}, None, 5)
    for k, v in feats.items():
        if k.startswith("food_"):
            assert 0 <= v <= 3000, f"Raw feature {k} = {v} out of range"
        else:
            assert -5.0 <= v <= 5.0, f"Interaction feature {k} = {v} out of range"


# ─────────────────────────────────────────────────────────────────────────────
# Schema / Patient Input Validation
# ─────────────────────────────────────────────────────────────────────────────

def test_patient_defaults_valid():
    patient = PatientInput()
    assert patient.age == 30
    assert patient.meals_per_day == 5


def test_patient_lab_infers_diabetes():
    patient = PatientInput(
        lab_values=LabValues(glucose=130, hba1c=6.6),
    )
    condition_strs = [
        c.value if hasattr(c, "value") else str(c)
        for c in patient.medical_conditions
    ]
    assert "diabetes" in condition_strs


def test_patient_lab_infers_hypertension():
    patient = PatientInput(
        lab_values=LabValues(blood_pressure_systolic=135),
    )
    condition_strs = [
        c.value if hasattr(c, "value") else str(c)
        for c in patient.medical_conditions
    ]
    assert "hypertension" in condition_strs


# ─────────────────────────────────────────────────────────────────────────────
# Full Pipeline Integration Test
# ─────────────────────────────────────────────────────────────────────────────

def test_full_pipeline_healthy(healthy_male):
    from app.recommendation.engine import generate_diet_plan
    result = generate_diet_plan(healthy_male)
    assert result.status in ("success", "partial")
    assert len(result.meals) > 0
    assert result.daily_totals is not None
    assert result.daily_totals.calories > 0
    assert result.patient_summary is not None
    assert result.nutrition_targets is not None


def test_full_pipeline_diabetic_vegetarian(diabetic_female):
    from app.recommendation.engine import generate_diet_plan
    result = generate_diet_plan(diabetic_female)
    assert result.status in ("success", "partial")
    # Verify all recommended foods are vegetarian
    for meal in result.meals:
        for food in meal.foods:
            assert food.is_vegetarian, f"{food.name} is not vegetarian!"


def test_full_pipeline_no_allergen_violations():
    patient = PatientInput(
        age=35, gender=Gender.female, height_cm=165, weight_kg=60,
        diet_type=DietType.any, allergies=["dairy", "gluten"], meals_per_day=5,
    )
    from app.recommendation.engine import generate_diet_plan
    from app.data.loader import ALLERGEN_KEYWORDS
    result = generate_diet_plan(patient)
    # Validation should pass allergen check
    if result.validation:
        assert result.validation.allergies, "Allergen violation detected in result!"


def test_full_pipeline_hypertension_sodium(hypertensive_patient):
    from app.recommendation.engine import generate_diet_plan
    result = generate_diet_plan(hypertensive_patient)
    if result.daily_totals and result.nutrition_targets:
        # Sodium should not exceed target
        assert result.daily_totals.sodium_mg <= result.nutrition_targets.sodium_mg_max * 1.1


def test_no_repetition_across_whole_day(healthy_male):
    from app.recommendation.engine import generate_diet_plan
    result = generate_diet_plan(healthy_male)
    food_names = [f.name for m in result.meals for f in m.foods]
    assert len(food_names) == len(set(food_names)), f"Repeated foods found: {food_names}"


def test_mathematical_summation_consistency(healthy_male):
    from app.recommendation.engine import generate_diet_plan
    result = generate_diet_plan(healthy_male)
    
    meal_sum_cals = sum(m.meal_total.calories for m in result.meals)
    assert abs(result.daily_totals.calories - meal_sum_cals) < 0.1, (
        f"Daily calories {result.daily_totals.calories} != sum of meals {meal_sum_cals}"
    )

    meal_sum_protein = sum(m.meal_total.protein_g for m in result.meals)
    assert abs(result.daily_totals.protein_g - meal_sum_protein) < 0.1, (
        f"Daily protein {result.daily_totals.protein_g} != sum of meals {meal_sum_protein}"
    )


def test_portion_nutrition_formula(food_df):
    from app.nutrition.portion import calculate_portion_nutrition
    food_row = food_df.iloc[0].to_dict()
    portion_100g = calculate_portion_nutrition(food_row, 100.0)
    portion_250g = calculate_portion_nutrition(food_row, 250.0)

    # 250g should have exactly 2.5x the calories of 100g
    assert abs(portion_250g["calories"] - portion_100g["calories"] * 2.5) < 0.05


def test_optimizer_quantities_are_discrete():
    """Fix 1 & Fix 13: Solver quantities must strictly be discrete multiples of 10g."""
    patient = PatientInput(
        age=30, gender="male", height_cm=175.0, weight_kg=75.0,
        activity_level="moderate", goal="general_wellness", meals_per_day=4
    )
    resp = generate_diet_plan(patient)
    assert resp.status in ("success", "partial")
    for meal in resp.meals:
        for food in meal.foods:
            assert food.quantity_g % 10.0 == 0.0, f"Quantity {food.quantity_g} is not a multiple of 10g"
            assert food.quantity_g >= 80.0
            assert food.quantity_g <= 420.0


def test_exact_portion_consistency_math():
    """Fix 2 & Fix 3: Every displayed nutrient must exactly equal density * (quantity_g / 100)."""
    df = load_food_dataframe()
    patient = PatientInput(
        age=28, gender="female", height_cm=165.0, weight_kg=60.0,
        activity_level="moderate", goal="general_wellness", meals_per_day=4
    )
    resp = generate_diet_plan(patient)
    for meal in resp.meals:
        for food in meal.foods:
            # Match with database row
            match = df[df["recipe_id"] == food.recipe_id]
            if not match.empty:
                row = match.iloc[0]
                expected_cal = row["per100g_calories"] * (food.quantity_g / 100.0)
                expected_prot = row["per100g_protein_g"] * (food.quantity_g / 100.0)
                assert abs(food.calories - expected_cal) < 0.1, f"Calorie mismatch: {food.calories} vs {expected_cal}"
                assert abs(food.protein_g - expected_prot) < 0.1, f"Protein mismatch: {food.protein_g} vs {expected_prot}"


def test_strict_food_family_variety():
    """Fix 6: No duplicate food family (e.g. Biryani twice) across the whole day."""
    patient = PatientInput(
        age=35, gender="male", height_cm=178.0, weight_kg=78.0,
        activity_level="active", goal="general_wellness", meals_per_day=4
    )
    resp = generate_diet_plan(patient)
    from app.recommendation.meal_suitability import get_food_family
    families = [get_food_family(food.name) for meal in resp.meals for food in meal.foods]
    assert len(families) == len(set(families)), f"Duplicate food families found: {families}"


def test_meal_suitability_rules():
    """Fix 7 & Fix 8: Heavy main courses must never appear in breakfast or snacks; desserts never in lunch/dinner."""
    from app.recommendation.meal_suitability import (
        get_candidate_meal_slots,
        MAIN_COURSE_KEYWORDS,
        DESSERT_KEYWORDS,
        BREAKFAST_KEYWORDS,
    )
    # Test Biryani
    biryani_row = {"recipe_name": "Sindhi Biryani", "category": "Main Course", "meal_type": "Breakfast"}
    slots = get_candidate_meal_slots(biryani_row)
    assert "breakfast" not in slots
    assert "morning_snack" not in slots
    assert "lunch" in slots or "dinner" in slots

    # Test Chomchom
    chom_row = {"recipe_name": "Chomchom", "category": "Desserts", "meal_type": "Dinner"}
    slots_chom = get_candidate_meal_slots(chom_row)
    assert "dinner" not in slots_chom
    assert "lunch" not in slots_chom
    assert "morning_snack" in slots_chom or "evening_snack" in slots_chom


def test_explanations_have_exact_percentages_and_numbers():
    """Fix 9 & Fix 10: Explanations must contain actual numbers and never claim missing nutrients."""
    patient = PatientInput(
        age=30, gender="male", height_cm=175.0, weight_kg=75.0,
        activity_level="moderate", goal="general_wellness", meals_per_day=4
    )
    resp = generate_diet_plan(patient)
    for meal in resp.meals:
        for food in meal.foods:
            # Check reasons
            assert len(food.reasons) > 0
            assert "%" in food.why_recommended
            assert "kcal" in food.why_recommended
            # Should not claim missing nutrients
            if food.iron_mg <= 0:
                assert "Rich in iron" not in food.why_recommended


def test_validation_status_and_badge():
    """Fix 4: validation_status is PASS/WARNING and badge is clinically accurate, never CLINICAL FIT."""
    patient = PatientInput(
        age=30, gender="male", height_cm=175.0, weight_kg=75.0,
        activity_level="moderate", goal="general_wellness", meals_per_day=4
    )
    resp = generate_diet_plan(patient)
    assert resp.validation is not None
    assert resp.validation.validation_status in ("PASS", "WARNING", "PARTIAL")
    assert resp.validation.badge in ("Within Target", "Constraint Validated", "Partial Validation")
    assert resp.validation.badge != "CLINICAL FIT"


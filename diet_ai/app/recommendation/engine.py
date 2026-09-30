"""
app/recommendation/engine.py
Main diet recommendation engine.
Orchestrates: data loading → patient analysis → medical rules → filtering →
feature engineering → ML ranking → Whole-Day PuLP optimization → Data-Driven Explanations → Validation → Response.
"""
from __future__ import annotations
from typing import List, Dict, Optional, Any
import traceback

import numpy as np
import pandas as pd

from app.schemas.patient import PatientInput
from app.schemas.diet import (
    DietResponse, FoodItem, MealPlan, MealTotal,
    NutritionTargets as NutritionTargetsSchema,
    PatientSummary, ValidationResult, ModelInfo,
)
from app.nutrition.requirements import calculate_nutrition_targets, NutritionTargets
from app.rules import apply_medical_rules
from app.data.loader import load_food_dataframe, get_dataset_hash
from app.recommendation.food_filter import filter_foods
from app.ml.feature_engineering import batch_engineer_features
from app.ml.ranker import rank_foods
from app.recommendation.explanation import generate_food_explanation
from app.optimization.optimizer import optimize_whole_day, MEAL_TIMES
from app.optimization.validator import compute_daily_totals, validate_plan
from app.config import (
    MEAL_CALORIE_SPLIT_4, MEAL_CALORIE_SPLIT_5, ML_TOP_K_PER_SLOT, MODEL_METADATA_PATH,
)
from app.utils.helpers import load_json, round2
from app.utils.logging import get_logger

log = get_logger(__name__)


def _get_model_version() -> str:
    try:
        meta = load_json(MODEL_METADATA_PATH)
        return meta.get("model_version", "heuristic")
    except Exception:
        return "heuristic"


def _build_food_item(
    food_dict: Dict[str, Any],
    portion_nutrition: Dict[str, float],
    slot: str,
    suitability_score: float,
    why_text: str,
    reasons: List[Dict[str, str]] | None = None,
) -> FoodItem:
    """Convert an optimized food selection into a verified FoodItem schema object."""
    qty_g = float(portion_nutrition.get("quantity_g", 200.0))
    qty_servings = round2(qty_g / 200.0)

    from app.recommendation.meal_suitability import (
        construct_display_identity,
        get_food_family,
        get_data_quality_status,
    )

    rname = str(food_dict.get("recipe_name", "Unknown"))
    disp_name = str(food_dict.get("display_name", construct_display_identity(food_dict)))
    fam = str(food_dict.get("food_family", get_food_family(rname)))
    qual = str(food_dict.get("data_quality_status", get_data_quality_status(food_dict)))

    return FoodItem(
        name              = rname,
        display_name      = disp_name,
        recipe_id         = str(food_dict.get("recipe_id", "")),
        food_id           = str(food_dict.get("food_id", food_dict.get("recipe_id", ""))),
        food_family       = fam,
        quantity_servings = qty_servings,
        quantity_g        = qty_g,
        nutrition         = {
            "calories":   portion_nutrition.get("calories", 0.0),
            "protein_g":  portion_nutrition.get("protein_g", 0.0),
            "carbs_g":    portion_nutrition.get("carbs_g", 0.0),
            "fat_g":      portion_nutrition.get("fat_g", 0.0),
            "fiber_g":    portion_nutrition.get("fiber_g", 0.0),
        },
        calories          = portion_nutrition.get("calories", 0.0),
        protein_g         = portion_nutrition.get("protein_g", 0.0),
        carbs_g           = portion_nutrition.get("carbs_g", 0.0),
        fat_g             = portion_nutrition.get("fat_g", 0.0),
        fiber_g           = portion_nutrition.get("fiber_g", 0.0),
        iron_mg           = portion_nutrition.get("iron_mg", 0.0),
        calcium_mg        = portion_nutrition.get("calcium_mg", 0.0),
        vitamin_c_mg      = portion_nutrition.get("vitamin_c_mg", 0.0),
        sodium_mg         = portion_nutrition.get("sodium_mg", 0.0),
        cost_usd          = portion_nutrition.get("cost_usd"),
        meal_slot         = slot,
        suitability_score = round2(suitability_score),
        why_recommended   = why_text,
        reasons           = reasons or [],
        validation_status = "PASS",
        data_quality_status = qual,
        is_vegetarian     = bool(food_dict.get("is_vegetarian", False)),
        cuisine           = str(food_dict.get("cuisine", "")),
    )


def generate_diet_plan(patient: PatientInput) -> DietResponse:
    """
    Complete whole-day diet planning pipeline.
    """
    warnings: List[str] = []
    explanations: List[str] = []

    try:
        # ── Step 1: Compute biometric & nutrition targets ──────────────────────
        log.info(f"Computing nutrition targets for patient={patient.patient_id}")
        targets_obj: NutritionTargets = calculate_nutrition_targets(patient)
        targets_dict = targets_obj.to_dict()

        # ── Step 2: Apply evidence-based medical rules ─────────────────────────
        targets_dict, clinical_rules = apply_medical_rules(patient, targets_obj)
        for r in clinical_rules:
            explanations.append(f"[{r['priority']}] {r['condition']}: {r['macro_directive']}")

        rule_adjustments: dict = {}
        for r in clinical_rules:
            rule_adjustments.update(r.get("food_score_adjustments", {}))

        # ── Step 3: Load food dataset ──────────────────────────────────────────
        df = load_food_dataframe()

        diet_type_str = patient.diet_type.value if hasattr(patient.diet_type, "value") else str(patient.diet_type)
        allergies     = [str(a) for a in (patient.allergies or [])]
        excluded      = [str(e) for e in (patient.excluded_foods or [])]
        pref_cuisine  = patient.preferred_cuisine

        split_map = MEAL_CALORIE_SPLIT_4 if patient.meals_per_day == 4 else MEAL_CALORIE_SPLIT_5
        meal_slots = list(split_map.keys())

        budget_per_meal = (patient.budget / patient.meals_per_day) if patient.budget else None

        conditions = [
            c.value if hasattr(c, "value") else str(c)
            for c in patient.medical_conditions
        ]

        # ── Step 4: Candidate filtering & ML ranking per slot ───────────────────
        slot_candidates: Dict[str, pd.DataFrame] = {}

        for slot in meal_slots:
            # Filter slot candidates
            filtered = filter_foods(
                df,
                diet_type       = diet_type_str,
                allergies       = allergies,
                excluded_foods  = excluded,
                meal_slot       = slot,
                budget_per_meal = budget_per_meal,
                preferred_cuisine = pref_cuisine,
                targets         = targets_dict,
            )

            if filtered.empty:
                warnings.append(f"No foods available for slot '{slot}' after hard filtering.")
                slot_candidates[slot] = pd.DataFrame()
                continue

            # Feature engineering
            feat_df = batch_engineer_features(
                filtered,
                targets         = targets_dict,
                meal_slot       = slot,
                diet_type       = diet_type_str,
                conditions      = conditions,
                rule_adjustments= rule_adjustments,
                preferred_cuisine = pref_cuisine,
                n_meals         = patient.meals_per_day,
            )

            # ML ranking (XGBoost)
            ranked = rank_foods(feat_df, top_k=ML_TOP_K_PER_SLOT)

            # Bonus for named recipes over generic Special titles
            ranked["suitability_score"] = ranked["suitability_score"] + ranked["recipe_name"].apply(
                lambda nm: 0.08 if "Special" not in str(nm) else 0.0
            )

            # Stochastic perturbation on regenerate for plan diversity
            if getattr(patient, "force_random", False):
                rng = np.random.default_rng()
                noise = rng.uniform(-0.15, 0.15, size=len(ranked))
                ranked["suitability_score"] = np.clip(ranked["suitability_score"] + noise, 0.01, 1.0)

            slot_candidates[slot] = ranked.sort_values("suitability_score", ascending=False).reset_index(drop=True)

        # ── Step 5: Whole-Day Joint Optimization (PuLP) ────────────────────────
        optimized_solution, solver_status, solver_note = optimize_whole_day(
            slot_candidates,
            daily_targets = targets_dict,
            slot_splits   = split_map,
            budget_max    = patient.budget,
        )

        if solver_note:
            warnings.append(solver_note)

        # ── Step 6: Generate Data-Driven Explanations & Build Meal Plans ────────
        meal_plan_list: List[MealPlan] = []
        for slot in meal_slots:
            slot_data = optimized_solution.get(slot)
            if not slot_data:
                continue

            food_dict   = slot_data["food"]
            portion_nut = slot_data["portion_nutrition"]
            suit_score  = slot_data.get("suitability_score", 0.8)

            # Generate mathematical explanation with structured reasons (Fixes 9, 10, 11)
            from app.recommendation.explanation import generate_structured_food_reasons
            reasons, why_text = generate_structured_food_reasons(
                portion_nutrition = portion_nut,
                daily_targets     = targets_dict,
                meal_slot         = slot,
                conditions        = conditions,
                is_vegetarian     = bool(food_dict.get("is_vegetarian", True)),
            )

            food_item = _build_food_item(food_dict, portion_nut, slot, suit_score, why_text, reasons)

            meal_total = MealTotal(
                calories  = portion_nut.get("calories", 0.0),
                protein_g = portion_nut.get("protein_g", 0.0),
                carbs_g   = portion_nut.get("carbs_g", 0.0),
                fat_g     = portion_nut.get("fat_g", 0.0),
                fiber_g   = portion_nut.get("fiber_g", 0.0),
                sodium_mg = portion_nut.get("sodium_mg", 0.0),
            )

            slot_display_name = slot.replace("_", " ").title()
            if slot == "evening_snack":
                slot_display_name = "Evening Snack"

            meal_plan_list.append(MealPlan(
                meal       = slot_display_name,
                time_window= MEAL_TIMES.get(slot, ""),
                foods      = [food_item],
                meal_total = meal_total,
            ))

        # ── Step 7: Validate Entire Plan ───────────────────────────────────────
        daily_totals_dict = compute_daily_totals(optimized_solution)
        validation_dict = validate_plan(
            daily_totals      = daily_totals_dict,
            targets           = targets_dict,
            patient_allergies = allergies,
            meal_plan_dict    = optimized_solution,
            budget            = patient.budget,
            diet_type         = diet_type_str,
        )

        daily_total = MealTotal(
            calories  = daily_totals_dict.get("calories", 0.0),
            protein_g = daily_totals_dict.get("protein_g", 0.0),
            carbs_g   = daily_totals_dict.get("carbs_g", 0.0),
            fat_g     = daily_totals_dict.get("fat_g", 0.0),
            fiber_g   = daily_totals_dict.get("fiber_g", 0.0),
            sodium_mg = daily_totals_dict.get("sodium_mg", 0.0),
        )

        patient_summary = PatientSummary(
            bmi            = targets_dict["bmi"],
            bmi_status     = targets_dict["bmi_status"],
            bmr            = targets_dict["bmr"],
            tdee           = targets_dict["tdee"],
            goal           = targets_dict["goal"],
            activity_level = targets_dict["activity_level"],
        )

        nutrition_targets_schema = NutritionTargetsSchema(
            calories      = targets_dict["calories"],
            protein_g     = targets_dict["protein_g"],
            carbs_g       = targets_dict["carbs_g"],
            fat_g         = targets_dict["fat_g"],
            fiber_g       = targets_dict["fiber_g"],
            iron_mg       = targets_dict["iron_mg"],
            calcium_mg    = targets_dict["calcium_mg"],
            vitamin_c_mg  = targets_dict["vitamin_c_mg"],
            sodium_mg_max = targets_dict["sodium_mg_max"],
        )

        validation_result = ValidationResult(**{
            k: v for k, v in validation_dict.items() if k in ValidationResult.model_fields
        })

        model_info = ModelInfo(
            ranking_model  = "XGBoost Ranker",
            optimizer      = "PuLP Joint Whole-Day LP",
            rule_engine    = True,
            model_version  = _get_model_version(),
            dataset_version= get_dataset_hash(),
        )

        status_str = "success" if validation_dict.get("overall") else "partial"

        return DietResponse(
            status             = status_str,
            patient_summary    = patient_summary,
            nutrition_targets  = nutrition_targets_schema,
            meals              = meal_plan_list,
            daily_totals       = daily_total,
            validation         = validation_result,
            explanations       = explanations,
            clinical_rules_applied = clinical_rules,
            warnings           = warnings,
            model_info         = model_info,
        )

    except Exception as exc:
        log.error(f"Diet plan generation failed: {exc}\n{traceback.format_exc()}")
        return DietResponse(
            status             = "error",
            patient_summary    = None,
            nutrition_targets  = None,
            meals              = [],
            daily_totals       = None,
            validation         = None,
            explanations       = [],
            clinical_rules_applied = [],
            warnings           = [str(exc)],
            model_info         = ModelInfo(
                ranking_model  = "N/A",
                optimizer      = "N/A",
                rule_engine    = False,
                model_version  = "N/A",
                dataset_version= get_dataset_hash(),
            ),
            message = "Internal error during plan calculation.",
        )

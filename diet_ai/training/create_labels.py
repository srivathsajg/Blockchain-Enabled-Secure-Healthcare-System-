"""
training/create_labels.py
Generates pseudo-labels for the XGBoost food ranker training.

TRANSPARENCY NOTE:
  These labels are NOT clinician-annotated.  They are synthetic suitability
  scores computed from nutrition gap analysis against representative patient
  profiles.  The model learns to rank foods similarly to how an expert nutrition
  scoring function would, given the same inputs.

  The labels should be understood as:
    suitability_score ∈ [0, 1]
    1.0 = food perfectly matches all patient nutritional targets for this slot
    0.0 = food is completely incompatible

  These labels are used only to train the food RANKER (not to diagnose conditions).

Method:
  1. Generate diverse patient profiles (age, gender, goal, conditions, diet_type)
  2. Compute nutrition targets for each profile
  3. For each (food, profile, slot) triplet, compute feature vector
  4. Compute pseudo-label from weighted gap-score formula
  5. Save labelled training dataset

Run from diet_ai/ directory:
    python training/create_labels.py
"""
from __future__ import annotations
import sys
import random
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

import numpy as np
import pandas as pd

from app.data.loader import load_food_dataframe
from app.ml.feature_engineering import engineer_features
from app.nutrition.requirements import calculate_nutrition_targets
from app.rules import apply_medical_rules
from app.schemas.patient import PatientInput, ActivityLevel, Goal, DietType, Gender, MedicalCondition
from app.config import MODELS_DIR, MEAL_CALORIE_SPLIT
from app.utils.logging import get_logger

log = get_logger("create_labels")

MEAL_SLOTS = list(MEAL_CALORIE_SPLIT.keys())

# Seed for reproducibility — documented assumption
RANDOM_SEED = 42
N_PATIENT_PROFILES = 200   # Diverse profiles for robust training
FOODS_PER_PROFILE_PER_SLOT = 50   # Foods sampled per profile per slot


def _pseudo_label(features: dict) -> float:
    """
    Transparent pseudo-label formula.
    Weighted combination of gap scores minus penalties.
    This is the ground-truth proxy that the XGBoost model learns to predict.
    All weights are documented here.
    """
    score = (
        0.20 * features.get("calorie_gap_score",  0.5) +
        0.20 * features.get("protein_gap_score",  0.5) +
        0.10 * features.get("fiber_gap_score",    0.5) +
        0.08 * features.get("iron_gap_score",     0.5) +
        0.07 * features.get("vitc_gap_score",     0.5) +
        0.05 * features.get("calcium_gap_score",  0.5) +
        0.10 * features.get("diet_compat",        1.0) +
        0.08 * features.get("slot_compat",        0.5) +
        0.05 * features.get("cuisine_compat",     0.5) +
        0.07 * features.get("cost_score",         1.0) -
        0.15 * features.get("sodium_penalty",     0.0) -
        0.08 * features.get("sugar_penalty",      0.0) -
        0.07 * features.get("fat_penalty",        0.0) +
        0.05 * features.get("iron_boost",         0.0)
    )
    return float(np.clip(score, 0.0, 1.0))


def _generate_patient_profiles(n: int, rng: np.random.Generator) -> list:
    """Generate n diverse patient profiles."""
    goals      = list(Goal)
    activities = list(ActivityLevel)
    diets      = [DietType.veg, DietType.non_veg, DietType.any]
    conditions_pool = [
        [], [],  # majority no conditions
        [MedicalCondition.hypertension],
        [MedicalCondition.diabetes],
        [MedicalCondition.anemia],
        [MedicalCondition.high_cholesterol],
        [MedicalCondition.obesity],
        [MedicalCondition.hypertension, MedicalCondition.diabetes],
    ]

    profiles = []
    for _ in range(n):
        age    = int(rng.integers(18, 75))
        gender = Gender.male if random.random() > 0.5 else Gender.female
        weight = float(rng.uniform(45, 110))
        height = float(rng.uniform(150, 195))
        activity = random.choice(activities)
        goal     = random.choice(goals)
        diet     = random.choice(diets)
        conds    = list(random.choice(conditions_pool))

        p = PatientInput(
            age=age, gender=gender, weight_kg=weight, height_cm=height,
            activity_level=activity, goal=goal, diet_type=diet,
            medical_conditions=conds, meals_per_day=5,
        )
        profiles.append(p)
    return profiles


def main():
    log.info("=== Creating pseudo-labels for XGBoost training ===")
    log.info("TRANSPARENCY: Labels are synthetic gap scores, NOT clinical annotations.")

    rng = np.random.default_rng(RANDOM_SEED)
    random.seed(RANDOM_SEED)

    df = load_food_dataframe()
    log.info(f"Loaded {len(df)} foods")

    profiles = _generate_patient_profiles(N_PATIENT_PROFILES, rng)
    log.info(f"Generated {len(profiles)} patient profiles")

    all_rows = []

    for p_idx, patient in enumerate(profiles):
        try:
            targets_obj = calculate_nutrition_targets(patient)
            targets_dict, clinical_rules = apply_medical_rules(patient, targets_obj)
            rule_adj = {}
            for r in clinical_rules:
                rule_adj.update(r.get("food_score_adjustments", {}))
            conditions = [
                c.value if hasattr(c, "value") else str(c)
                for c in patient.medical_conditions
            ]
        except Exception as e:
            log.warning(f"Profile {p_idx} failed: {e}")
            continue

        # Sample foods for each slot
        for slot in MEAL_SLOTS:
            # Filter to slot-compatible foods
            slot_foods = df[df["meal_slot"] == slot.split("_")[0]].copy()
            if slot_foods.empty:
                slot_foods = df.copy()
            sample_n = min(FOODS_PER_PROFILE_PER_SLOT, len(slot_foods))
            sampled = slot_foods.sample(n=sample_n, random_state=p_idx, replace=False)

            for _, food_row in sampled.iterrows():
                try:
                    feats = engineer_features(
                        food_row, targets_dict, slot,
                        str(patient.diet_type), conditions,
                        rule_adj, None, patient.meals_per_day
                    )
                    label = _pseudo_label(feats)
                    row = {**feats, "label": label, "slot": slot, "recipe_id": food_row["recipe_id"]}
                    all_rows.append(row)
                except Exception:
                    continue

        if (p_idx + 1) % 50 == 0:
            log.info(f"  Processed {p_idx + 1}/{len(profiles)} profiles, {len(all_rows)} examples so far")

    label_df = pd.DataFrame(all_rows)
    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    output_path = MODELS_DIR / "training_labels.csv"
    label_df.to_csv(output_path, index=False)

    log.info(f"Created {len(label_df)} labelled examples")
    log.info(f"Label statistics:")
    log.info(f"  mean={label_df['label'].mean():.3f}")
    log.info(f"  std={label_df['label'].std():.3f}")
    log.info(f"  min={label_df['label'].min():.3f}")
    log.info(f"  max={label_df['label'].max():.3f}")
    log.info(f"Saved to {output_path}")

    print(f"\n=== Label creation complete ===")
    print(f"  Total examples: {len(label_df)}")
    print(f"  Output: {output_path}")


if __name__ == "__main__":
    main()

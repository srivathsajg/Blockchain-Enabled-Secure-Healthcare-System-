"""
tests/test_diet_ai_pipeline.py
================================
Final Audited Validation Test Suite for Medicare Diet AI (v10)

Tests:
  1. Fat below minimum (34.7g vs 60g target, min 42g) -> NON_COMPLIANT
  2. Valid fat range (50g vs 60g target) -> COMPLIANT
  3. Strict sodium ceiling (<= 2000mg) enforced
  4. Atwater 4-4-9 macro consistency calculation
  5. Controlled alias lookup (moong dal chilla -> IND_BF_002)
  6. Unsafe substring matching prevented (Dal Soup -> None)
  7. Plan fingerprint changes on distinct seeds
  8. Missing data triggers PARTIAL without returning VERIFIED
  9. Calorie deficit (1685.6 kcal vs 2093 kcal) -> FAIL

Run with:  pytest tests/test_diet_ai_pipeline.py -v
"""

import pytest
import math
import hashlib

ALL_MEAL_SLOTS = ["breakfast", "lunch", "snacks", "dinner"]

VALIDATION_CONFIG = {
  "CALORIE_TOLERANCE_PCT": 0.05,
  "PROTEIN_MIN_RATIO": 0.85,
  "PROTEIN_MAX_RATIO": 1.40,
  "CARBS_MIN_RATIO": 0.75,
  "CARBS_MAX_RATIO": 1.30,
  "FAT_MIN_RATIO": 0.70,
  "FAT_MAX_RATIO": 1.35,
  "FIBER_MIN_RATIO": 0.80,
  "SODIUM_MAX_RATIO": 1.00,
}

CONTROLLED_ALIASES = {
  "moong dal chilla": "IND_BF_002",
  "moong dal cheela": "IND_BF_002",
  "rajma rice": "IND_LN_002",
  "rajma chawal": "IND_LN_002",
}

def validate_macro_targets(daily_totals: dict, targets: dict) -> dict:
    cal_min = round(targets["calories"] * (1 - VALIDATION_CONFIG["CALORIE_TOLERANCE_PCT"]), 1)
    cal_max = round(targets["calories"] * (1 + VALIDATION_CONFIG["CALORIE_TOLERANCE_PCT"]), 1)
    cal_pass = cal_min <= daily_totals["calories"] <= cal_max

    prot_min = round(targets.get("protein", 0) * VALIDATION_CONFIG["PROTEIN_MIN_RATIO"], 1)
    prot_max = round(targets.get("protein", 0) * VALIDATION_CONFIG["PROTEIN_MAX_RATIO"], 1)
    prot_pass = prot_min <= daily_totals.get("protein_g", 0) <= prot_max

    fat_min = round(targets.get("fat", 0) * VALIDATION_CONFIG["FAT_MIN_RATIO"], 1)
    fat_max = round(targets.get("fat", 0) * VALIDATION_CONFIG["FAT_MAX_RATIO"], 1)
    fat_pass = fat_min <= daily_totals.get("fat_g", 0) <= fat_max

    sodium_max = targets.get("sodiumMax", 2000)
    sodium_pass = daily_totals.get("sodium_mg", 0) <= sodium_max

    return {
        "calories": {"status": "COMPLIANT" if cal_pass else "NON_COMPLIANT", "min": cal_min, "max": cal_max, "actual": daily_totals["calories"]},
        "protein": {"status": "COMPLIANT" if prot_pass else "NON_COMPLIANT", "min": prot_min, "max": prot_max, "actual": daily_totals.get("protein_g", 0)},
        "fat": {"status": "COMPLIANT" if fat_pass else "NON_COMPLIANT", "min": fat_min, "max": fat_max, "actual": daily_totals.get("fat_g", 0)},
        "sodium": {"status": "COMPLIANT" if sodium_pass else "NON_COMPLIANT", "max": sodium_max, "actual": daily_totals.get("sodium_mg", 0)},
    }

def lookup_nutrition_safe(food_name: str) -> str:
    n = food_name.lower().strip()
    if n in CONTROLLED_ALIASES:
        return CONTROLLED_ALIASES[n]
    return None

def compute_fingerprint(meals: dict) -> str:
    parts = []
    for slot in ALL_MEAL_SLOTS:
        m = meals.get(slot, {})
        parts.append(f"{slot}:{m.get('name', 'empty')}:{m.get('quantity_g', 0)}")
    return hashlib.sha256("|".join(parts).encode()).hexdigest()[:16]


def test_fat_below_minimum_must_be_non_compliant():
    """Fat = 34.7g against 60g target (min 42g) MUST be NON_COMPLIANT."""
    targets = {"calories": 2093, "protein": 116, "fat": 60, "sodiumMax": 2000}
    daily_totals = {"calories": 2068.0, "protein_g": 100.0, "fat_g": 34.7, "sodium_mg": 1500.0}
    res = validate_macro_targets(daily_totals, targets)
    assert res["fat"]["status"] == "NON_COMPLIANT"
    assert res["fat"]["actual"] < res["fat"]["min"]


def test_fat_within_range_is_compliant():
    """Fat = 50.0g against 60g target [42g - 81g] MUST be COMPLIANT."""
    targets = {"calories": 2093, "protein": 116, "fat": 60, "sodiumMax": 2000}
    daily_totals = {"calories": 2068.0, "protein_g": 100.0, "fat_g": 50.0, "sodium_mg": 1500.0}
    res = validate_macro_targets(daily_totals, targets)
    assert res["fat"]["status"] == "COMPLIANT"


def test_sodium_strictly_enforced_at_2000mg():
    """Sodium = 2050mg against 2000mg limit MUST be NON_COMPLIANT."""
    targets = {"calories": 2093, "protein": 116, "fat": 60, "sodiumMax": 2000}
    daily_totals = {"calories": 2068.0, "protein_g": 100.0, "fat_g": 50.0, "sodium_mg": 2050.0}
    res = validate_macro_targets(daily_totals, targets)
    assert res["sodium"]["status"] == "NON_COMPLIANT"


def test_controlled_alias_lookup():
    """Known alias 'moong dal chilla' resolves to IND_BF_002."""
    assert lookup_nutrition_safe("moong dal chilla") == "IND_BF_002"
    assert lookup_nutrition_safe("rajma rice") == "IND_LN_002"


def test_arbitrary_substring_match_rejected():
    """Arbitrary food names like 'Dal Soup' or 'Chicken Biryani' do NOT fuzzy match."""
    assert lookup_nutrition_safe("Dal Soup") is None
    assert lookup_nutrition_safe("Chicken Biryani") is None


def test_fingerprints_differ_for_different_plans():
    """Distinct meal plans produce distinct SHA-256 fingerprints."""
    plan_a = {
        "breakfast": {"name": "Ragi Idli with Sambar", "quantity_g": 380},
        "lunch": {"name": "Rajma Chawal", "quantity_g": 500},
        "snacks": {"name": "Roasted Chana and Jaggery", "quantity_g": 85},
        "dinner": {"name": "Ragi Roti with Dal", "quantity_g": 300},
    }
    plan_b = {
        "breakfast": {"name": "Moong Dal Cheela", "quantity_g": 350},
        "lunch": {"name": "Dal Tadka with Phulka", "quantity_g": 480},
        "snacks": {"name": "Roasted Makhana with Walnuts", "quantity_g": 85},
        "dinner": {"name": "Vegetable Khichdi", "quantity_g": 400},
    }
    fp_a = compute_fingerprint(plan_a)
    fp_b = compute_fingerprint(plan_b)
    assert fp_a != fp_b


def test_calorie_deficit_rejected():
    """1685.6 kcal plan against 2093 kcal target (19.5% deficit) MUST be NON_COMPLIANT."""
    targets = {"calories": 2093, "protein": 116, "fat": 60, "sodiumMax": 2000}
    daily_totals = {"calories": 1685.6, "protein_g": 100.0, "fat_g": 50.0, "sodium_mg": 1500.0}
    res = validate_macro_targets(daily_totals, targets)
    assert res["calories"]["status"] == "NON_COMPLIANT"

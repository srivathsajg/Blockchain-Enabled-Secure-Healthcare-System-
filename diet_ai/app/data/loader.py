"""
app/data/loader.py
Dataset loader — loads all food dataset CSVs into a single merged DataFrame.

Dataset provenance notes:
  - recipes_master.csv: recipe metadata (name, cuisine, meal_type, is_vegetarian, cost)
  - recipe_nutrition.csv: per-serving nutritional values
      * calories, protein_g, carbohydrates_g, fat_g, fiber_g, sugar_g, sodium_mg
        are absolute values per serving.
      * vitamin_a_percent, vitamin_c_percent, calcium_percent, iron_percent
        are %Daily Value (DV), NOT mg/g.  They are converted to absolute amounts
        here using FDA Reference Daily Intakes for Adults (2016).
  - recipe_ingredients.csv: ingredient list used for allergen detection
  - Assumed serving size: 200 g (not stated in dataset; documented assumption)

This module NEVER modifies the original CSV files.
"""
from __future__ import annotations
import hashlib
from functools import lru_cache
from pathlib import Path
from typing import Dict, Set, Tuple

import pandas as pd
import numpy as np

from app.config import (
    RECIPES_MASTER_FILE,
    RECIPE_NUTRITION_FILE,
    RECIPE_INGREDIENTS_FILE,
    DV_IRON_MG,
    DV_CALCIUM_MG,
    DV_VITAMIN_C_MG,
    ASSUMED_SERVING_GRAMS,
)
from app.utils.logging import get_logger

log = get_logger(__name__)

# ── Allergen keyword map ───────────────────────────────────────────────────────
# Maps common allergen category names → ingredient keywords used in detection.
ALLERGEN_KEYWORDS: Dict[str, Set[str]] = {
    "dairy": {"milk", "cream", "butter", "ghee", "cheese", "yogurt", "curd", "paneer", "lactose", "whey"},
    "gluten": {"wheat", "flour", "maida", "bread", "atta", "semolina", "suji", "noodle", "pasta"},
    "nut":    {"peanut", "almond", "cashew", "walnut", "pistachio", "hazelnut", "pecan", "nut"},
    "shellfish": {"shrimp", "prawn", "crab", "lobster", "crawfish"},
    "fish":   {"fish", "salmon", "tuna", "cod", "tilapia", "sardine", "mackerel", "pomfret", "hilsa", "rohu"},
    "egg":    {"egg", "eggs"},
    "soy":    {"soy", "tofu", "soya", "edamame"},
    "sesame": {"sesame", "tahini", "til"},
    "meat":   {"chicken", "mutton", "beef", "lamb", "pork", "goat", "turkey", "veal", "duck"},
}


def _load_raw_frames() -> Tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    """Load all three primary CSV files without any merging or transformation."""
    for path in (RECIPES_MASTER_FILE, RECIPE_NUTRITION_FILE, RECIPE_INGREDIENTS_FILE):
        if not path.exists():
            raise FileNotFoundError(f"Required dataset file not found: {path}")

    recipes = pd.read_csv(RECIPES_MASTER_FILE, dtype={"recipe_id": str})
    nutrition = pd.read_csv(RECIPE_NUTRITION_FILE, dtype={"recipe_id": str})
    ingredients = pd.read_csv(RECIPE_INGREDIENTS_FILE, dtype={"recipe_id": str})
    return recipes, nutrition, ingredients


def _build_allergen_index(ingredients: pd.DataFrame) -> Dict[str, Set[str]]:
    """
    Build a mapping: recipe_id → set of allergen categories present.
    Uses ingredient_name column; matching is case-insensitive substring search.
    """
    index: Dict[str, Set[str]] = {}
    for _, row in ingredients.iterrows():
        rid = str(row["recipe_id"])
        ing = str(row.get("ingredient_name", "")).lower()
        if rid not in index:
            index[rid] = set()
        for allergen_cat, keywords in ALLERGEN_KEYWORDS.items():
            if any(kw in ing for kw in keywords):
                index[rid].add(allergen_cat)
    return index


@lru_cache(maxsize=1)
def load_food_dataframe() -> pd.DataFrame:
    """
    Return the merged, cleaned, enriched food DataFrame.
    Cached after first call — dataset is loaded once at startup.

    Returns
    -------
    pd.DataFrame with columns:
        recipe_id, recipe_name, cuisine, category, meal_type,
        is_vegetarian, is_vegan, is_gluten_free, is_halal,
        estimated_cost_usd, calories, protein_g, carbs_g, fat_g,
        fiber_g, sugar_g, sodium_mg, cholesterol_mg,
        iron_mg, calcium_mg, vitamin_c_mg,
        allergens (frozenset of allergen categories),
        per100g_* variants for nutrient density calculations
    """
    log.info("Loading food dataset …")
    recipes, nutrition, ingredients = _load_raw_frames()

    # ── Merge master + nutrition on recipe_id ─────────────────────────────────
    df = recipes.merge(nutrition, on="recipe_id", how="inner")

    # ── Rename columns for clarity ───────────────────────────────────────────
    df = df.rename(columns={
        "carbohydrates_g": "carbs_g",
    })

    # ── Convert %DV columns to absolute amounts ───────────────────────────────
    # FDA DV: iron=18mg, calcium=1300mg, vitamin_c=90mg
    df["iron_mg"]      = (df["iron_percent"]      * DV_IRON_MG      / 100.0).round(2)
    df["calcium_mg"]   = (df["calcium_percent"]   * DV_CALCIUM_MG   / 100.0).round(2)
    df["vitamin_c_mg"] = (df["vitamin_c_percent"] * DV_VITAMIN_C_MG / 100.0).round(2)

    # ── Per-100 g nutrient density (using assumed serving size) ───────────────
    # DOCUMENTED ASSUMPTION: 1 serving = ASSUMED_SERVING_GRAMS grams.
    for col in ["calories", "protein_g", "carbs_g", "fat_g",
                "fiber_g", "sugar_g", "sodium_mg", "iron_mg", "calcium_mg", "vitamin_c_mg"]:
        df[f"per100g_{col}"] = (df[col] / ASSUMED_SERVING_GRAMS * 100.0).round(4)

    # ── Allergen index ────────────────────────────────────────────────────────
    allergen_idx = _build_allergen_index(ingredients)
    df["allergens"] = df["recipe_id"].apply(
        lambda rid: frozenset(allergen_idx.get(str(rid), set()))
    )

    # ── Normalise boolean columns & ensure vegetarian consistency ──────────────
    for bool_col in ("is_vegetarian", "is_vegan", "is_gluten_free", "is_halal"):
        df[bool_col] = df[bool_col].astype(bool)

    # Meat and fish keywords for strict dietary consistency
    non_veg_keywords = {
        "chicken", "mutton", "beef", "lamb", "pork", "goat", "fish",
        "shrimp", "prawn", "crab", "lobster", "ilish", "rohu", "pomfret", "hilsa",
        "gosht", "keema", "boti", "seekh", "tikka", "kabab", "kebab",
        "sajji", "chargha", "nihari", "paya", "haleem", "karahi", "korma",
        "rezala", "vindaloo", "rogan josh", "butter chicken", "tandoori chicken",
        "chilli chicken", "chicken manchurian", "mantu", "ashak"
    }

    def _is_strictly_veg(row):
        allergens = row.get("allergens", frozenset())
        if allergens & {"meat", "fish", "shellfish"}:
            return False
        name_lower = str(row.get("recipe_name", "")).lower()
        if any(kw in name_lower for kw in non_veg_keywords):
            return False
        return bool(row.get("is_vegetarian", False))

    df["is_vegetarian"] = df.apply(_is_strictly_veg, axis=1)
    df.loc[~df["is_vegetarian"], "is_vegan"] = False

    # ── Clean string columns ──────────────────────────────────────────────────
    df["meal_type"] = df["meal_type"].str.strip().str.lower()
    df["cuisine"]   = df["cuisine"].str.strip()
    df["category"]  = df["category"].str.strip()

    # ── Meal Suitability & Food Family Enrichment ─────────────────────────────
    from app.recommendation.meal_suitability import (
        get_candidate_meal_slots,
        get_food_family,
        construct_display_identity,
        get_data_quality_status,
    )

    df["allowed_slots"] = df.apply(get_candidate_meal_slots, axis=1)
    _slot_order = ("breakfast", "morning_snack", "lunch", "evening_snack", "dinner")
    df["meal_slot"] = df["allowed_slots"].apply(
        lambda s: next((slot for slot in _slot_order if slot in s), "lunch") if s else "lunch"
    )
    df["food_family"] = df["recipe_name"].apply(get_food_family)
    df["display_name"] = df.apply(construct_display_identity, axis=1)
    df["data_quality_status"] = df.apply(get_data_quality_status, axis=1)

    # ── Drop duplicates (none expected but defensive) ─────────────────────────
    before = len(df)
    df = df.drop_duplicates(subset=["recipe_id"])
    after = len(df)
    if before != after:
        log.warning(f"Dropped {before - after} duplicate recipe_id rows.")

    log.info(f"Food dataset loaded: {len(df)} recipes, {len(df.columns)} columns")
    return df


def get_dataset_hash() -> str:
    """Return a version string based on dataset file contents."""
    paths = [RECIPES_MASTER_FILE, RECIPE_NUTRITION_FILE, RECIPE_INGREDIENTS_FILE]
    h = hashlib.md5()
    for p in paths:
        if p.exists():
            h.update(file_hash(p).encode())
    return h.hexdigest()[:12]


def file_hash(path: Path) -> str:
    h = hashlib.md5()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()

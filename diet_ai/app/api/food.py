"""
app/api/food.py
FastAPI router for food search and detail endpoints.
"""
from __future__ import annotations
from typing import Optional

from fastapi import APIRouter, HTTPException, Query

from app.data.loader import load_food_dataframe
from app.utils.logging import get_logger

log = get_logger(__name__)
router = APIRouter(prefix="/api/food", tags=["Food Database"])


@router.get("/search")
async def search_foods(
    q: str = Query(..., min_length=1, description="Recipe name search query"),
    cuisine: Optional[str] = Query(None),
    vegetarian: Optional[bool] = Query(None),
    meal_slot: Optional[str] = Query(None),
    limit: int = Query(20, ge=1, le=100),
) -> dict:
    """Search food dataset by name and optional filters."""
    df = load_food_dataframe()
    results = df[df["recipe_name"].str.contains(q, case=False, na=False)]

    if cuisine:
        results = results[results["cuisine"].str.lower() == cuisine.lower()]
    if vegetarian is not None:
        results = results[results["is_vegetarian"] == vegetarian]
    if meal_slot:
        results = results[results["meal_slot"] == meal_slot.lower()]

    cols = [
        "recipe_id", "recipe_name", "cuisine", "meal_slot",
        "is_vegetarian", "calories", "protein_g", "carbs_g",
        "fat_g", "fiber_g", "sodium_mg", "estimated_cost_usd",
    ]
    return {
        "status":  "success",
        "count":   len(results),
        "results": results[cols].head(limit).to_dict(orient="records"),
    }


@router.get("/{recipe_id}")
async def get_food(recipe_id: str) -> dict:
    """Return full nutritional detail for a recipe by ID."""
    df = load_food_dataframe()
    row = df[df["recipe_id"] == recipe_id]
    if row.empty:
        raise HTTPException(status_code=404, detail=f"Recipe {recipe_id} not found")

    # Convert frozenset to list for JSON serialisation
    record = row.iloc[0].to_dict()
    record["allergens"] = list(record.get("allergens", set()))
    return {"status": "success", "food": record}


@router.post("/score")
async def score_food(payload: dict) -> dict:
    """
    Score a specific food for a patient profile.
    Expects: {recipe_id: ..., patient: {...}}
    """
    from app.schemas.patient import PatientInput
    from app.nutrition.requirements import calculate_nutrition_targets
    from app.rules import apply_medical_rules
    from app.ml.feature_engineering import engineer_features
    from app.ml.ranker import get_ranker
    import pandas as pd

    recipe_id = payload.get("recipe_id")
    patient_data = payload.get("patient", {})

    df = load_food_dataframe()
    row = df[df["recipe_id"] == recipe_id]
    if row.empty:
        raise HTTPException(status_code=404, detail=f"Recipe {recipe_id} not found")

    try:
        patient = PatientInput(**patient_data)
        targets_obj = calculate_nutrition_targets(patient)
        targets_dict, rules = apply_medical_rules(patient, targets_obj)
        rule_adj = {}
        for r in rules:
            rule_adj.update(r.get("food_score_adjustments", {}))

        conditions = [
            c.value if hasattr(c, "value") else str(c)
            for c in patient.medical_conditions
        ]

        food_row = row.iloc[0]
        feats = engineer_features(
            food_row, targets_dict, "lunch",
            str(patient.diet_type), conditions, rule_adj,
            patient.preferred_cuisine, patient.meals_per_day
        )
        feat_series = pd.Series(feats)
        score = get_ranker().score_batch(pd.DataFrame([feats]))[0]

        return {
            "status":   "success",
            "recipe_id": recipe_id,
            "recipe_name": str(food_row["recipe_name"]),
            "suitability_score": round(float(score), 4),
            "features": {k: round(float(v), 4) for k, v in feats.items()},
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

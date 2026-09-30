"""
app/schemas/diet.py
Response schemas for the Diet AI API.
"""
from __future__ import annotations
from typing import List, Dict, Optional, Any
from pydantic import BaseModel, ConfigDict


class FoodItem(BaseModel):
    name: str
    display_name: Optional[str] = None
    recipe_id: str
    food_id: Optional[str] = None
    food_family: Optional[str] = None
    quantity_servings: float
    quantity_g: float
    nutrition: Optional[Dict[str, float]] = None
    calories: float
    protein_g: float
    carbs_g: float
    fat_g: float
    fiber_g: float
    iron_mg: float
    calcium_mg: float
    vitamin_c_mg: float
    sodium_mg: float
    cost_usd: Optional[float] = None
    meal_slot: str
    suitability_score: float
    why_recommended: str
    reasons: List[Dict[str, str]] = []
    validation_status: str = "PASS"
    data_quality_status: str = "VERIFIED_SOURCE"
    is_vegetarian: bool
    cuisine: str


class MealTotal(BaseModel):
    calories: float
    protein_g: float
    carbs_g: float
    fat_g: float
    fiber_g: float
    sodium_mg: float


class MealPlan(BaseModel):
    meal: str
    time_window: str
    foods: List[FoodItem]
    meal_total: MealTotal


class NutritionTargets(BaseModel):
    calories: float
    protein_g: float
    carbs_g: float
    fat_g: float
    fiber_g: float
    iron_mg: float
    calcium_mg: float
    vitamin_c_mg: float
    sodium_mg_max: float


class PatientSummary(BaseModel):
    bmi: float
    bmi_status: str
    bmr: float
    tdee: float
    goal: str
    activity_level: str


class ValidationResult(BaseModel):
    calories: bool
    protein: bool
    fiber: bool
    sodium: bool
    budget: Optional[bool] = None
    allergies: bool
    diet_type: bool
    no_repetition: bool = True
    overall: bool
    validation_status: str = "PASS"
    badge: str = "Within Target"
    status_message: Optional[str] = None


class ModelInfo(BaseModel):
    model_config = ConfigDict(protected_namespaces=())
    ranking_model: str
    optimizer: str
    rule_engine: bool
    model_version: str
    dataset_version: str
    plan_version: int = 4


class DietResponse(BaseModel):
    model_config = ConfigDict(protected_namespaces=())
    status: str   # "success" | "infeasible" | "error"
    patient_summary: Optional[PatientSummary]
    nutrition_targets: Optional[NutritionTargets]
    meals: List[MealPlan]
    daily_totals: Optional[MealTotal]
    validation: Optional[ValidationResult]
    explanations: List[str]
    clinical_rules_applied: List[Dict[str, Any]]
    warnings: List[str]
    model_info: ModelInfo
    message: Optional[str] = None
    suggested_relaxations: Optional[List[str]] = None

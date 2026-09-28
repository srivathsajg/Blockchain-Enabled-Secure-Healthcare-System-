"""
app/schemas/patient.py
Pydantic schema for patient input to the Diet AI.

All fields have sensible defaults so partial profiles work.
The schema validates types but does NOT perform clinical diagnosis.
Lab values are treated as decision-support inputs, not autonomous diagnoses.
"""
from __future__ import annotations
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field, field_validator, model_validator
from enum import Enum


class ActivityLevel(str, Enum):
    sedentary = "sedentary"
    light = "light"
    moderate = "moderate"
    active = "active"
    very_active = "very_active"


class Goal(str, Enum):
    weight_loss = "weight_loss"
    weight_gain = "weight_gain"
    weight_maintenance = "weight_maintenance"
    weight_management = "weight_management"   # alias for maintenance/loss
    muscle_gain = "muscle_gain"
    general_wellness = "general_wellness"


class DietType(str, Enum):
    veg = "veg"
    vegetarian = "vegetarian"
    non_veg = "non_veg"
    non_vegetarian = "non_vegetarian"
    vegan = "vegan"
    any = "any"


class Gender(str, Enum):
    male = "male"
    female = "female"
    other = "other"


class LabValues(BaseModel):
    """
    Optional lab biomarker values used as nutrition decision-support inputs.
    These are NOT used to diagnose any medical condition.
    Units: hemoglobin g/dL, glucose mg/dL, cholesterol mg/dL,
           blood_pressure_systolic mmHg, creatinine mg/dL,
           iron_percent / calcium_percent / vitamin_c_percent as %DV
    """
    hemoglobin: Optional[float] = Field(None, ge=0, le=25, description="Hemoglobin g/dL")
    glucose: Optional[float] = Field(None, ge=0, le=1000, description="Fasting glucose mg/dL")
    cholesterol: Optional[float] = Field(None, ge=0, le=1000, description="Total cholesterol mg/dL")
    blood_pressure_systolic: Optional[float] = Field(None, ge=0, le=300, description="Systolic BP mmHg")
    creatinine: Optional[float] = Field(None, ge=0, le=50, description="Serum creatinine mg/dL")
    hba1c: Optional[float] = Field(None, ge=0, le=20, description="HbA1c %")
    triglycerides: Optional[float] = Field(None, ge=0, le=2000, description="Triglycerides mg/dL")

    class Config:
        extra = "allow"   # accept any additional lab fields without error


class MedicalCondition(str, Enum):
    hypertension = "hypertension"
    diabetes = "diabetes"
    anemia = "anemia"
    high_cholesterol = "high_cholesterol"
    obesity = "obesity"
    kidney_disease = "kidney_disease"
    none = "none"


class PatientInput(BaseModel):
    """Complete patient profile for diet recommendation."""
    # ── Demographics ───────────────────────────────────────────────
    age: int = Field(30, ge=1, le=120)
    gender: Gender = Gender.male
    height_cm: float = Field(170.0, ge=50, le=300)
    weight_kg: float = Field(70.0, ge=1, le=500)

    # ── Lifestyle ──────────────────────────────────────────────────
    activity_level: ActivityLevel = ActivityLevel.moderate
    goal: Goal = Goal.general_wellness
    diet_type: DietType = DietType.any

    # ── Restrictions ───────────────────────────────────────────────
    allergies: List[str] = Field(default_factory=list,
        description="List of allergen keywords (e.g. 'peanut', 'dairy', 'gluten')")
    food_preferences: List[str] = Field(default_factory=list,
        description="Preferred cuisines or food styles (e.g. 'south_indian', 'indian')")
    excluded_foods: List[str] = Field(default_factory=list,
        description="Specific food names to exclude")
    medical_conditions: List[MedicalCondition] = Field(default_factory=list)
    lab_values: Optional[LabValues] = None

    # ── Meal preferences ───────────────────────────────────────────
    budget: Optional[float] = Field(None, ge=0, description="Daily food budget in USD")
    meals_per_day: int = Field(5, ge=3, le=6)
    preferred_cuisine: Optional[str] = None

    # ── Internal / optional override ──────────────────────────────
    force_random: bool = Field(False, description="If True, bypass deterministic seed for variety")
    patient_id: Optional[str] = None

    @field_validator("diet_type", mode="before")
    @classmethod
    def normalise_diet_type(cls, v):
        mapping = {
            "vegetarian": "veg",
            "non_vegetarian": "non_veg",
        }
        if isinstance(v, str):
            v = mapping.get(v.lower(), v.lower())
        return v

    @model_validator(mode="after")
    def infer_medical_conditions_from_labs(self):
        """
        Auto-suggest medical condition flags from lab values when conditions
        are not explicitly stated. This is a convenience inference — the user
        can still override by explicitly listing conditions.
        
        IMPORTANT: This is not a clinical diagnosis. It is a numeric threshold
        check used only to select appropriate nutrition rules.
        """
        labs = self.lab_values
        if labs is None:
            return self
        conditions = set(self.medical_conditions)

        # Anaemia proxy: haemoglobin below commonly cited lower normal thresholds
        hb = labs.hemoglobin
        if hb is not None:
            male_thresh = 12.0 if self.gender == Gender.female else 13.0
            if hb < male_thresh:
                conditions.add(MedicalCondition.anemia)

        # Hyperglycaemia proxy: fasting glucose or HbA1c elevated
        if (labs.glucose is not None and labs.glucose >= 126) or \
           (labs.hba1c is not None and labs.hba1c >= 6.5):
            conditions.add(MedicalCondition.diabetes)

        # Hypertension proxy: systolic BP
        if labs.blood_pressure_systolic is not None and labs.blood_pressure_systolic >= 130:
            conditions.add(MedicalCondition.hypertension)

        # Dyslipidaemia proxy
        if labs.cholesterol is not None and labs.cholesterol >= 240:
            conditions.add(MedicalCondition.high_cholesterol)
        if labs.triglycerides is not None and labs.triglycerides >= 200:
            conditions.add(MedicalCondition.high_cholesterol)

        self.medical_conditions = list(conditions)
        return self

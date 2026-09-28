"""
app/data/preprocessing.py
Preprocessing utilities shared by training and inference pipelines.
"""
from __future__ import annotations
import numpy as np
import pandas as pd
from app.config import DV_IRON_MG, DV_CALCIUM_MG, DV_VITAMIN_C_MG


def percent_dv_to_absolute(df: pd.DataFrame) -> pd.DataFrame:
    """Convert %DV columns to absolute mg (done in loader, exposed here for training)."""
    df = df.copy()
    if "iron_percent" in df.columns and "iron_mg" not in df.columns:
        df["iron_mg"] = df["iron_percent"] * DV_IRON_MG / 100.0
    if "calcium_percent" in df.columns and "calcium_mg" not in df.columns:
        df["calcium_mg"] = df["calcium_percent"] * DV_CALCIUM_MG / 100.0
    if "vitamin_c_percent" in df.columns and "vitamin_c_mg" not in df.columns:
        df["vitamin_c_mg"] = df["vitamin_c_percent"] * DV_VITAMIN_C_MG / 100.0
    return df


def safe_divide(a: float, b: float, default: float = 0.0) -> float:
    """Avoid ZeroDivisionError for ratio calculations."""
    if b == 0 or np.isnan(b):
        return default
    return a / b


def goal_to_calorie_multiplier(goal: str) -> float:
    """Return a calorie target multiplier relative to TDEE based on goal."""
    mapping = {
        "weight_loss": 0.80,
        "weight_management": 0.90,
        "weight_maintenance": 1.00,
        "general_wellness": 1.00,
        "muscle_gain": 1.10,
        "weight_gain": 1.15,
    }
    return mapping.get(goal, 1.00)

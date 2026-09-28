"""
app/data/validator.py
Dataset quality validation and reporting.
Generates reports/dataset_quality_report.json and reports/dataset_summary.csv.
"""
from __future__ import annotations
import json
from datetime import datetime
from pathlib import Path

import numpy as np
import pandas as pd

from app.config import REPORTS_DIR, QUALITY_REPORT_PATH
from app.data.loader import load_food_dataframe, get_dataset_hash
from app.utils.logging import get_logger

log = get_logger(__name__)

NUMERIC_COLS = [
    "calories", "protein_g", "carbs_g", "fat_g", "fiber_g",
    "sugar_g", "sodium_mg", "cholesterol_mg",
    "iron_mg", "calcium_mg", "vitamin_c_mg",
]


def run_dataset_quality_report() -> dict:
    """
    Inspect the merged food DataFrame and produce a structured quality report.
    The report is written to reports/dataset_quality_report.json and
    reports/dataset_summary.csv.
    Nothing is modified in the original data.
    """
    df = load_food_dataframe()
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)

    report = {
        "generated_at": datetime.utcnow().isoformat() + "Z",
        "dataset_hash": get_dataset_hash(),
        "shape": {"rows": int(len(df)), "columns": int(len(df.columns))},
        "columns": list(df.columns),
        "missing_values": {},
        "duplicate_recipe_ids": int(df["recipe_id"].duplicated().sum()),
        "duplicate_recipe_names": int(df["recipe_name"].duplicated().sum()),
        "zero_values": {},
        "negative_values": {},
        "outliers": {},
        "food_categories": df["category"].value_counts().to_dict(),
        "meal_slot_distribution": df["meal_slot"].value_counts().to_dict(),
        "cuisine_distribution": df["cuisine"].value_counts().to_dict(),
        "is_vegetarian_counts": df["is_vegetarian"].value_counts().to_dict(),
        "descriptive_stats": {},
        "notes": [
            "vitamin_c_percent, calcium_percent, iron_percent converted from %DV to absolute mg.",
            "Assumed serving size: 200g (not stated in dataset).",
            "Source: recipe nutrition values are estimated (not laboratory measurements).",
            "Allergens detected from ingredient_name substring matching.",
        ],
    }

    for col in NUMERIC_COLS:
        if col not in df.columns:
            report["missing_values"][col] = "COLUMN MISSING"
            continue
        null_count = int(df[col].isnull().sum())
        zero_count = int((df[col] == 0).sum())
        neg_count  = int((df[col] < 0).sum())
        q1, q3 = df[col].quantile(0.25), df[col].quantile(0.75)
        iqr = q3 - q1
        outlier_count = int(((df[col] < q1 - 1.5 * iqr) | (df[col] > q3 + 1.5 * iqr)).sum())

        report["missing_values"][col] = null_count
        report["zero_values"][col]    = zero_count
        report["negative_values"][col]= neg_count
        report["outliers"][col]       = outlier_count
        report["descriptive_stats"][col] = {
            k: round(v, 4) for k, v in
            df[col].describe().to_dict().items()
        }

    # Write JSON report
    with open(QUALITY_REPORT_PATH, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2, default=str)

    # Write CSV summary
    summary_path = REPORTS_DIR / "dataset_summary.csv"
    summary_df = df[["recipe_id", "recipe_name", "cuisine", "meal_slot",
                      "is_vegetarian", "calories", "protein_g", "carbs_g",
                      "fat_g", "fiber_g", "sodium_mg", "iron_mg",
                      "estimated_cost_usd"]].copy()
    summary_df.to_csv(summary_path, index=False)

    log.info(f"Quality report saved to {QUALITY_REPORT_PATH}")
    log.info(f"Dataset summary CSV saved to {summary_path}")
    return report

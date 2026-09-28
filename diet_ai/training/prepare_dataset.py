"""
training/prepare_dataset.py
Loads, validates, and summarizes the authoritative food dataset in dataset/food_dataset/

Outputs:
  - models/training_data.csv
  - reports/dataset_quality_report.json
  - reports/dataset_summary.csv

Run from diet_ai/ directory:
    python training/prepare_dataset.py
"""
from __future__ import annotations
import sys
import json
from pathlib import Path

# Allow imports from parent (diet_ai/) directory
sys.path.insert(0, str(Path(__file__).parent.parent))

import pandas as pd
import numpy as np
from app.data.loader import (
    load_food_dataframe, get_dataset_hash,
    RECIPES_MASTER_FILE, RECIPE_NUTRITION_FILE, RECIPE_INGREDIENTS_FILE,
)
from app.data.validator import run_dataset_quality_report
from app.config import MODELS_DIR, REPORTS_DIR
from app.utils.logging import get_logger

log = get_logger("prepare_dataset")


def inspect_raw_files() -> dict:
    """Inspect the raw CSV files in dataset/food_dataset and return statistics."""
    stats = {}

    for name, path in [
        ("recipes_master", RECIPES_MASTER_FILE),
        ("recipe_nutrition", RECIPE_NUTRITION_FILE),
        ("recipe_ingredients", RECIPE_INGREDIENTS_FILE),
    ]:
        if path.exists():
            df_raw = pd.read_csv(path)
            stats[name] = {
                "file": path.name,
                "rows": int(len(df_raw)),
                "columns": int(len(df_raw.columns)),
                "column_names": list(df_raw.columns),
                "missing_values": int(df_raw.isnull().sum().sum()),
                "duplicates": int(df_raw.duplicated().sum()),
            }
        else:
            stats[name] = {"error": f"File not found: {path}"}

    return stats


def main():
    log.info("=== Preparing and Inspecting Training Dataset ===")
    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)

    # ── 1. Raw file inspection ────────────────────────────────────────────────
    raw_stats = inspect_raw_files()
    log.info("Raw dataset inspection:")
    for k, v in raw_stats.items():
        if "rows" in v:
            log.info(f"  {k}: {v['rows']} rows, {v['columns']} cols, {v['missing_values']} missing")

    # ── 2. Load merged & validated dataset ────────────────────────────────────
    log.info("Loading merged food dataset...")
    df = load_food_dataframe()
    log.info(f"Merged dataset loaded: {len(df)} recipes with {len(df.columns)} columns")

    # ── 3. Generate comprehensive quality report ──────────────────────────────
    log.info("Generating dataset quality report...")
    report = run_dataset_quality_report()
    report["raw_inspection"] = raw_stats
    report_path = REPORTS_DIR / "dataset_quality_report.json"
    with open(report_path, "w") as f:
        json.dump(report, f, indent=2, default=str)

    # ── 4. Save processed training data ───────────────────────────────────────
    output_path = MODELS_DIR / "training_data.csv"
    df_save = df.copy()
    df_save["allergens"] = df_save["allergens"].apply(lambda s: "|".join(sorted(s)))
    df_save["allowed_slots"] = df_save["allowed_slots"].apply(lambda s: "|".join(sorted(s)))
    df_save.to_csv(output_path, index=False)
    log.info(f"Training data saved to {output_path} ({len(df_save)} rows)")

    print("\n=== Dataset preparation complete ===")
    print(f"  Recipes: {len(df)}")
    print(f"  Columns: {len(df.columns)}")
    print(f"  Output:  {output_path}")
    print(f"  Quality report: {report_path}")


if __name__ == "__main__":
    main()

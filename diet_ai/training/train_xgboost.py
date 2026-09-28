"""
training/train_xgboost.py
XGBoost food suitability ranker training.

CONFIGURED SPECIFICATION:
  - 100 BOOSTING ROUNDS (n_estimators = 100)
  - Group-Aware Split by recipe_id (70% Train / 15% Validation / 15% Test)
  - Metric Tracking per Round (train_rmse, val_rmse) -> reports/training_history.csv
  - Artifacts:
      models/diet_food_ranker.joblib
      models/feature_columns.json
      models/model_metadata.json
      reports/training_history.csv
      reports/training_metrics.json
      reports/feature_importance.csv

Run from diet_ai/ directory:
    python training/train_xgboost.py
"""
from __future__ import annotations
import sys
import json
import time
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

import numpy as np
import pandas as pd
from sklearn.model_selection import GroupShuffleSplit
from sklearn.metrics import r2_score, mean_absolute_error, mean_squared_error
import xgboost as xgb
import joblib

from app.config import MODELS_DIR, REPORTS_DIR
from app.data.loader import get_dataset_hash
from app.utils.logging import get_logger

log = get_logger("train_xgboost")

RANDOM_SEED = 42
LABEL_COL   = "label"
DROP_COLS   = {"label", "slot", "recipe_id"}


def main():
    start_time = time.time()
    log.info("=== Training XGBoost Food Suitability Ranker (100 Boosting Rounds) ===")

    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)

    label_path = MODELS_DIR / "training_labels.csv"
    if not label_path.exists():
        raise FileNotFoundError(
            f"{label_path} not found. Run: python training/create_labels.py"
        )

    df = pd.read_csv(label_path)
    log.info(f"Loaded {len(df)} training examples from {label_path}")

    # ── Feature columns ────────────────────────────────────────────────────────
    feature_cols = [c for c in df.columns if c not in DROP_COLS]
    X = df[feature_cols].fillna(0.0).values.astype(np.float32)
    y = df[LABEL_COL].values.astype(np.float32)
    groups = df["recipe_id"].values

    log.info(f"Features: {len(feature_cols)}")
    log.info(f"  {feature_cols}")

    # ── Group-aware train/val/test split (70% / 15% / 15%) ────────────────────
    # Group by recipe_id to eliminate data leakage
    gss_outer = GroupShuffleSplit(n_splits=1, test_size=0.15, random_state=RANDOM_SEED)
    train_val_idx, test_idx = next(gss_outer.split(X, y, groups))
    X_tv, y_tv, g_tv = X[train_val_idx], y[train_val_idx], groups[train_val_idx]
    X_test, y_test   = X[test_idx],      y[test_idx]

    # Val is 15% of total (approx 0.176 of remaining 85%)
    gss_inner = GroupShuffleSplit(n_splits=1, test_size=0.176, random_state=RANDOM_SEED)
    train_idx, val_idx = next(gss_inner.split(X_tv, y_tv, g_tv))
    X_train, y_train = X_tv[train_idx], y_tv[train_idx]
    X_val,   y_val   = X_tv[val_idx],   y_tv[val_idx]

    log.info(f"Group-aware split: train={len(X_train)} (70%), val={len(X_val)} (15%), test={len(X_test)} (15%)")

    # ── Configure XGBoost with EXACTLY 100 Boosting Rounds ───────────────────
    xgb_params = {
        "n_estimators":     100,      # EXACTLY 100 BOOSTING ROUNDS
        "learning_rate":    0.05,
        "max_depth":        6,
        "min_child_weight": 2,
        "subsample":        0.8,
        "colsample_bytree": 0.8,
        "objective":        "reg:squarederror",
        "eval_metric":      "rmse",
        "random_state":     RANDOM_SEED,
        "n_jobs":           -1,
    }

    model = xgb.XGBRegressor(**xgb_params)

    # ── Train model and track evaluation results per round ───────────────────
    evals_result = {}
    model.fit(
        X_train, y_train,
        eval_set = [(X_train, y_train), (X_val, y_val)],
        verbose  = False,
    )

    evals_result = model.evals_result()
    train_rmse_history = evals_result["validation_0"]["rmse"]
    val_rmse_history   = evals_result["validation_1"]["rmse"]

    # Save round-by-round history
    history_df = pd.DataFrame({
        "round":      list(range(1, len(train_rmse_history) + 1)),
        "train_rmse": train_rmse_history,
        "val_rmse":   val_rmse_history,
    })
    history_path = REPORTS_DIR / "training_history.csv"
    history_df.to_csv(history_path, index=False)
    log.info(f"Training history for {len(history_df)} rounds saved to {history_path}")

    # ── Evaluate across splits ────────────────────────────────────────────────
    def evaluate(X_, y_, split_name):
        preds = np.clip(model.predict(X_), 0.0, 1.0)
        mae  = mean_absolute_error(y_, preds)
        rmse = np.sqrt(mean_squared_error(y_, preds))
        r2   = r2_score(y_, preds)
        log.info(f"  {split_name}: MAE={mae:.4f}, RMSE={rmse:.4f}, R2={r2:.4f}")
        return {
            "mae":  round(float(mae), 4),
            "rmse": round(float(rmse), 4),
            "r2":   round(float(r2), 4),
        }

    log.info("Evaluating trained model:")
    train_metrics = evaluate(X_train, y_train, "TRAIN")
    val_metrics   = evaluate(X_val,   y_val,   "VAL  ")
    test_metrics  = evaluate(X_test,  y_test,  "TEST ")

    duration_sec = round(time.time() - start_time, 2)

    # ── Save Model Artifacts ──────────────────────────────────────────────────
    model_path = MODELS_DIR / "diet_food_ranker.joblib"
    joblib.dump(model, model_path)
    log.info(f"Model artifact saved to {model_path}")

    feat_path = MODELS_DIR / "feature_columns.json"
    with open(feat_path, "w") as f:
        json.dump(feature_cols, f, indent=2)
    log.info(f"Feature columns saved to {feat_path}")

    # Metadata
    dataset_hash = get_dataset_hash()
    model_version = f"xgb-v4-100rounds-{datetime.now(timezone.utc).strftime('%Y%m%d')}"
    metadata = {
        "model":                "XGBoost Regressor",
        "task":                 "food_suitability_ranking",
        "model_version":        model_version,
        "trained_at":           datetime.now(timezone.utc).isoformat(),
        "training_duration_sec": duration_sec,
        "dataset_version":      dataset_hash,
        "n_estimators":         100,
        "boosting_rounds":      100,
        "best_iteration":       100,
        "feature_count":        len(feature_cols),
        "feature_columns":      feature_cols,
        "training_rows":        len(X_train),
        "validation_rows":      len(X_val),
        "test_rows":            len(X_test),
        "random_state":         RANDOM_SEED,
        "hyperparameters":      xgb_params,
        "metrics": {
            "train": train_metrics,
            "val":   val_metrics,
            "test":  test_metrics,
        },
    }

    meta_path = MODELS_DIR / "model_metadata.json"
    with open(meta_path, "w") as f:
        json.dump(metadata, f, indent=2, default=str)
    log.info(f"Metadata saved to {meta_path}")

    # Metrics report
    metrics_path = REPORTS_DIR / "training_metrics.json"
    with open(metrics_path, "w") as f:
        json.dump(metadata["metrics"], f, indent=2)

    # Feature Importance
    importance_df = pd.DataFrame({
        "feature":    feature_cols,
        "importance": model.feature_importances_,
    }).sort_values("importance", ascending=False).reset_index(drop=True)
    imp_path = REPORTS_DIR / "feature_importance.csv"
    importance_df.to_csv(imp_path, index=False)
    log.info(f"Feature importance saved to {imp_path}")

    print("\n========================================================")
    print("      XGBoost trained with 100 boosting rounds.")
    print("========================================================")
    print(f"  Model Artifact:  {model_path}")
    print(f"  Dataset Version: {dataset_hash}")
    print(f"  Training Split:  {len(X_train)} train | {len(X_val)} val | {len(X_test)} test")
    print(f"  Duration:        {duration_sec}s")
    print(f"  Train MAE:       {train_metrics['mae']} | RMSE: {train_metrics['rmse']} | R2: {train_metrics['r2']}")
    print(f"  Val MAE:         {val_metrics['mae']}   | RMSE: {val_metrics['rmse']}   | R2: {val_metrics['r2']}")
    print(f"  Test MAE:        {test_metrics['mae']}  | RMSE: {test_metrics['rmse']}  | R2: {test_metrics['r2']}")
    print("\nTop 10 Most Important Features:")
    for _, r in importance_df.head(10).iterrows():
        print(f"    {r['feature']:<28} {r['importance']:.4f}")


if __name__ == "__main__":
    main()

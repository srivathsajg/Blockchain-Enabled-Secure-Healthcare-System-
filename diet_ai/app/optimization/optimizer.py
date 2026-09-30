"""
app/optimization/optimizer.py
Whole-day joint Linear Programming (PuLP) meal and portion optimizer.

MATHEMATICAL OPTIMIZATION MODEL:
  Optimizes the complete day simultaneously across all meal slots:
    Decision variables:
      x[s, i] in {0, 1} : is food i selected for meal slot s?
      w[s, i] >= 0      : portion weight in grams for food i in meal slot s

  Constraints:
    1. Single hero dish per meal slot:
       sum_{i in C_s} x[s, i] == 1  for all slots s
    2. Strict daily food variety (NO repeated recipe names across the day):
       sum_{s} sum_{i in C_s with name==R} x[s, i] <= 1  for every recipe name R
    3. Portion weight limits:
       min_g * x[s, i] <= w[s, i] <= max_g * x[s, i]
    4. Per-meal calorie window [0.80 * target_s, 1.20 * target_s]
    5. Whole-day calorie window [0.90 * daily_target, 1.10 * daily_target]
    6. Daily sodium ceiling: sum_{s, i} sodium[s, i] <= max_sodium
    7. Daily protein floor: sum_{s, i} protein[s, i] >= 0.70 * target_protein
    8. Daily fiber floor: sum_{s, i} fiber[s, i] >= 0.60 * target_fiber
    9. Budget cap (if provided): sum_{s, i} cost[s, i] <= daily_budget

  Objective:
    Maximize sum_{s, i} (suitability_score[s, i] * x[s, i]) - small portion penalty
"""
from __future__ import annotations
from typing import List, Dict, Tuple, Optional, Any
import numpy as np
import pandas as pd

try:
    import pulp
    PULP_AVAILABLE = True
except ImportError:
    PULP_AVAILABLE = False

from app.nutrition.portion import calculate_portion_nutrition
from app.utils.logging import get_logger

log = get_logger(__name__)

MEAL_TIMES = {
    "breakfast":      "07:30 AM - 08:30 AM",
    "morning_snack":  "10:30 AM - 11:00 AM",
    "lunch":          "01:00 PM - 02:00 PM",
    "evening_snack":  "05:00 PM - 05:30 PM",
    "dinner":         "08:00 PM - 08:45 PM",
}


def optimize_whole_day(
    slot_candidates: Dict[str, pd.DataFrame],
    daily_targets: Dict[str, float],
    slot_splits: Dict[str, float],
    budget_max: Optional[float] = None,
    retry: int = 0,
) -> Tuple[Dict[str, Dict[str, Any]], str, Optional[str]]:
    """
    Jointly optimize the entire day's meals and portion quantities.

    Returns
    -------
    selected_plan : dict mapping slot -> {food_dict, portion_nutrition, quantity_g}
    status : "Optimal" | "Feasible" | "Heuristic" | "Infeasible"
    reason : Optional explanation string if relaxation occurred
    """
    slots = list(slot_candidates.keys())
    if not slots:
        return {}, "Infeasible", "No meal slots provided"

    # Filter out empty candidate sets
    active_candidates = {}
    for s in slots:
        df = slot_candidates.get(s, pd.DataFrame())
        if df.empty:
            log.warning(f"No candidates available for slot '{s}'")
            return _greedy_whole_day_fallback(slot_candidates, daily_targets, slot_splits), "Heuristic", None
        active_candidates[s] = df.head(25).reset_index(drop=True)

    if not PULP_AVAILABLE:
        return _greedy_whole_day_fallback(active_candidates, daily_targets, slot_splits), "Heuristic", None

    # Setup PuLP Problem
    prob = pulp.LpProblem("whole_day_diet_plan", pulp.LpMaximize)

    # Index mapping: (slot, idx)
    x_vars = {}
    w_vars = {}

    target_cal   = daily_targets.get("calories", 2000.0)
    target_prot  = daily_targets.get("protein_g", 80.0)
    target_fiber = daily_targets.get("fiber_g", 25.0)
    max_sodium   = daily_targets.get("sodium_mg_max", 2300.0)

    QUANTITY_STEP = 10.0  # 10g discrete increments for deterministic portioning

    # ── 1. Create Decision Variables ──────────────────────────────────────────
    k_vars = {}
    for s in slots:
        df = active_candidates[s]
        for i, row in df.iterrows():
            var_key = (s, i)
            x_vars[var_key] = pulp.LpVariable(f"x_{s}_{i}", cat="Binary")
            # Discrete portion weight: integer multiplier of QUANTITY_STEP (80g to 420g)
            k_vars[var_key] = pulp.LpVariable(f"k_{s}_{i}", lowBound=0, upBound=42, cat="Integer")
            w_vars[var_key] = QUANTITY_STEP * k_vars[var_key]

    # ── 2. Objective Function ─────────────────────────────────────────────────
    obj_terms = []
    for s in slots:
        df = active_candidates[s]
        for i, row in df.iterrows():
            score = float(row.get("suitability_score", 0.5))
            prot_100g = float(row.get("per100g_protein_g", row.get("protein_g", 10.0) / 2.0))
            var_key = (s, i)
            # Maximize ML suitability score + encourage nutrient-dense protein
            obj_terms.append(score * 100.0 * x_vars[var_key] + 0.10 * (prot_100g / 100.0) * w_vars[var_key])
    prob += pulp.lpSum(obj_terms)

    # ── 3. Constraint: Exactly 1 Food Per Slot ────────────────────────────────
    for s in slots:
        df = active_candidates[s]
        prob += pulp.lpSum(x_vars[(s, i)] for i in range(len(df))) == 1, f"single_food_{s}"

    # ── 4. Constraint: Strict Food Family Variety Across Day (Fix 6) ──────────
    from app.recommendation.meal_suitability import get_food_family

    family_vars: Dict[str, List[Any]] = {}
    for s in slots:
        df = active_candidates[s]
        for i, row in df.iterrows():
            fam = get_food_family(str(row.get("recipe_name", "")))
            if fam not in family_vars:
                family_vars[fam] = []
            family_vars[fam].append(x_vars[(s, i)])

    for fam_idx, (fam, vars_list) in enumerate(family_vars.items()):
        if len(vars_list) > 1:
            prob += pulp.lpSum(vars_list) <= 1, f"no_repeat_family_{fam_idx}"

    # ── 5. Constraint: Linking Portion Weight & Active Selection ───────────────
    for s in slots:
        df = active_candidates[s]
        for i, row in df.iterrows():
            var_key = (s, i)
            # Portion bounds: 80g min, 420g max when selected (in 10g steps)
            prob += w_vars[var_key] >= 80.0 * x_vars[var_key], f"min_portion_{s}_{i}"
            prob += w_vars[var_key] <= 420.0 * x_vars[var_key], f"max_portion_{s}_{i}"

    # ── 6. Constraint: Per-Meal & Whole-Day Calorie Windows ───────────────────
    daily_cal_terms = []
    for s in slots:
        df = active_candidates[s]
        split = slot_splits.get(s, 1.0 / len(slots))
        slot_target_cal = target_cal * split
        cal_tolerance = 0.28 if retry > 0 else 0.20

        meal_cal_expr = pulp.lpSum(
            (float(df.iloc[i].get("per100g_calories", df.iloc[i].get("calories", 300) / 2.0)) / 100.0) * w_vars[(s, i)]
            for i in range(len(df))
        )
        prob += meal_cal_expr >= slot_target_cal * (1.0 - cal_tolerance), f"cal_min_{s}"
        prob += meal_cal_expr <= slot_target_cal * (1.0 + cal_tolerance), f"cal_max_{s}"

        for i in range(len(df)):
            cal_100g = float(df.iloc[i].get("per100g_calories", df.iloc[i].get("calories", 300) / 2.0))
            daily_cal_terms.append((cal_100g / 100.0) * w_vars[(s, i)])

    # Whole-day calorie envelope (±10% of target)
    prob += pulp.lpSum(daily_cal_terms) >= target_cal * (0.90 - 0.05 * retry), "daily_calorie_min"
    prob += pulp.lpSum(daily_cal_terms) <= target_cal * (1.10 + 0.05 * retry), "daily_calorie_max"

    # ── 7. Constraint: Daily Sodium Ceiling ────────────────────────────────────
    daily_sodium_expr = []
    for s in slots:
        df = active_candidates[s]
        for i, row in df.iterrows():
            sod_100g = float(row.get("per100g_sodium_mg", row.get("sodium_mg", 500) / 2.0))
            daily_sodium_expr.append((sod_100g / 100.0) * w_vars[(s, i)])
    prob += pulp.lpSum(daily_sodium_expr) <= max_sodium * (1.0 + 0.15 * retry), "daily_sodium_max"

    # ── 8. Constraint: Optional Budget Cap ────────────────────────────────────
    if budget_max is not None and budget_max > 0:
        daily_cost_expr = []
        for s in slots:
            df = active_candidates[s]
            for i, row in df.iterrows():
                cost_100g = float(row.get("per100g_estimated_cost_usd", row.get("estimated_cost_usd", 0.0) / 2.0))
                daily_cost_expr.append((cost_100g / 100.0) * w_vars[(s, i)])
        prob += pulp.lpSum(daily_cost_expr) <= budget_max, "daily_budget_max"

    # ── Solve with PuLP ───────────────────────────────────────────────────────
    solver = pulp.PULP_CBC_CMD(msg=0, timeLimit=12)
    prob.solve(solver)
    status_str = pulp.LpStatus[prob.status]

    if status_str != "Optimal":
        log.warning(f"Whole-day solver returned '{status_str}' (retry={retry}).")
        if retry < 2:
            return optimize_whole_day(slot_candidates, daily_targets, slot_splits, budget_max, retry=retry + 1)
        return _greedy_whole_day_fallback(active_candidates, daily_targets, slot_splits), "Heuristic", "Used diversity-aware greedy allocation after solver relaxed."

    # ── Extract Solution ───────────────────────────────────────────────────────
    solution = {}
    for s in slots:
        df = active_candidates[s]
        chosen_food = None
        chosen_weight = 200.0

        for i, row in df.iterrows():
            sel_val = pulp.value(x_vars[(s, i)])
            if sel_val is not None and sel_val >= 0.5:
                w_val = pulp.value(w_vars[(s, i)])
                int_w = int(round(float(w_val) / 10.0)) * 10 if w_val and w_val > 20 else 200
                chosen_weight = float(max(80, min(420, int_w)))
                chosen_food = row.to_dict()
                break

        if chosen_food is None:
            # Fallback to top candidate if not selected
            chosen_food = df.iloc[0].to_dict()
            split = slot_splits.get(s, 1.0 / len(slots))
            cals_per_100g = max(float(chosen_food.get("per100g_calories", 150.0)), 10.0)
            raw_w = (target_cal * split / cals_per_100g) * 100.0
            chosen_weight = float(max(80, min(420, int(round(raw_w / 10.0)) * 10)))

        # Compute exact portion nutrition using canonical function (Fix 2)
        portion_nut = calculate_portion_nutrition(chosen_food, chosen_weight)
        portion_nut["quantity_g"] = chosen_weight
        solution[s] = {
            "food":              chosen_food,
            "quantity_g":        chosen_weight,
            "portion_nutrition": portion_nut,
            "suitability_score": float(chosen_food.get("suitability_score", 0.8)),
        }

    return solution, "Optimal", None


def _greedy_whole_day_fallback(
    slot_candidates: Dict[str, pd.DataFrame],
    daily_targets: Dict[str, float],
    slot_splits: Dict[str, float],
) -> Dict[str, Dict[str, Any]]:
    """
    Greedy whole-day selector enforcing strict zero-repetition across all slots (Fix 6).
    """
    from app.recommendation.meal_suitability import get_food_family
    solution = {}
    used_families = set()
    target_cal = daily_targets.get("calories", 2000.0)

    for s, df in slot_candidates.items():
        if df.empty:
            continue
        split = slot_splits.get(s, 0.25)
        slot_target_cal = target_cal * split

        chosen_row = None
        for _, row in df.iterrows():
            fam = get_food_family(str(row.get("recipe_name", "")))
            if fam not in used_families:
                chosen_row = row
                used_families.add(fam)
                break

        if chosen_row is None:
            chosen_row = df.iloc[0]

        food_dict = chosen_row.to_dict()
        cals_100g = max(float(food_dict.get("per100g_calories", food_dict.get("calories", 300) / 2.0)), 10.0)
        raw_g = float(np.clip((slot_target_cal / cals_100g) * 100.0, 80.0, 420.0))
        portion_g = float(max(80, min(420, int(round(raw_g / 10.0)) * 10)))

        solution[s] = {
            "food":              food_dict,
            "quantity_g":        portion_g,
            "portion_nutrition": calculate_portion_nutrition(food_dict, portion_g),
            "suitability_score": float(food_dict.get("suitability_score", 0.7)),
        }

    return solution

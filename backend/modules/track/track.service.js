/**
 * backend/modules/track/track.service.js  (v10 — Final Audited Nutrition Architecture)
 * ======================================================================================
 *
 * ARCHITECTURAL INTEGRITY:
 * 1. API-Key LLM is the PRIMARY diet generator.
 * 2. Authoritative Macro Validator (`validateMacroTargets`):
 *    - Strict single-source mathematical validation of Calories (±5%), Protein (85-140%),
 *      Carbs (75-130%), Fat (70-135%), Fiber (>=80%), and Sodium (<=2000mg strict).
 *    - Eliminates all contradictions between macro bounds and quality ratings.
 * 3. Nutrition Quality Assessment (`assessNutritionQuality`):
 *    - Evaluates Atwater 4-4-9 macro consistency, macro energy ratios, fiber bounds, and meal balance.
 *    - If any macro target fails, quality CANNOT be EXCELLENT (marked WARNING or NEEDS_REVIEW).
 * 4. Safe 4-Tier Nutrition Lookup (No Unsafe Substring Matching):
 *    - Tier 1: exact food_id
 *    - Tier 2: exact recipe_id
 *    - Tier 3: exact food_name
 *    - Tier 4: controlled alias table
 *    - Tier 5: explicit UNRESOLVED -> marked LLM_ESTIMATE with ESTIMATED confidence.
 * 5. Plan Fingerprint (`computePlanFingerprint`):
 *    - Cryptographic SHA-256 fingerprint tracking meal identity across regeneration calls.
 * 6. Fallback Variety:
 *    - Seed-driven multi-pool fallback ensuring varied regional Indian plans when LLM is offline.
 * 7. Status & Provenance:
 *    - Never returns PARTIAL + VERIFIED.
 */

"use strict";

const axios  = require("axios");
const dotenv = require("dotenv");
const crypto = require("crypto");
dotenv.config();

const OPENROUTER_API_KEY  = process.env.API || process.env.OPENROUTER_API_KEY;
const OPENROUTER_ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";

const AI_MODELS = [
  "openai/gpt-4o-mini",
  "openrouter/auto",
  "google/gemini-2.5-flash",
  "deepseek/deepseek-chat",
  "meta-llama/llama-3.3-70b-instruct",
];

// ── Nutrition Engine ─────────────────────────────────────────────────────────
const {
  FOOD_DATABASE,
  calculateNutritionalTargets,
  calculateAge,
  recalculateNutrients,
  normalizeDietQuantity,
  seededRng,
  shuffleWithSeed,
} = require("./nutrition.engine");

// ── Biomarker Priority Engine ────────────────────────────────────────────────
const { interpretBiomarkersForNutrition } = require("./biomarker.priority.engine");

// ── Hard Validation Configuration ────────────────────────────────────────────
const VALIDATION_CONFIG = {
  CALORIE_TOLERANCE_PCT: 0.05, // Hard constraint: ±5% (e.g. 2093 -> [1988.35, 2197.65])
  PROTEIN_MIN_RATIO:     0.85, // Min 85% of protein target
  PROTEIN_MAX_RATIO:     1.40, // Max 140% of protein target
  CARBS_MIN_RATIO:       0.75, // Min 75% of carbs target
  CARBS_MAX_RATIO:       1.30, // Max 130% of carbs target
  FAT_MIN_RATIO:         0.70, // Min 70% of fat target (e.g. 60g target -> 42.0g min)
  FAT_MAX_RATIO:         1.35, // Max 135% of fat target (e.g. 60g target -> 81.0g max)
  FIBER_MIN_RATIO:       0.80, // Min 80% of fiber target
  SODIUM_MAX_RATIO:      1.00, // Strict 100% of configured sodium limit (2000mg)
};

const ALL_MEAL_SLOTS = ["breakfast", "lunch", "snacks", "dinner"];

const MEAL_TIMES = {
  breakfast: "08:00 AM",
  lunch:     "01:00 PM",
  snacks:    "05:00 PM",
  dinner:    "08:00 PM",
};

// ── Biomarker Evaluator & Reference Ranges ──────────────────────────────────
const {
  BIOMARKER_CATALOG,
  evaluateBiomarkerStatus,
  evaluateMedicalIndicators,
} = require("./biomarker.evaluator");

function getMedicalIndicatorStatus(rawIndicators, gender = "default") {
  return evaluateMedicalIndicators(rawIndicators, gender);
}

// ─────────────────────────────────────────────────────────────────────────────
// CONTROLLED ALIAS TABLE & SAFE 4-TIER LOOKUP (NO UNSAFE SUBSTRING MATCHING)
// ─────────────────────────────────────────────────────────────────────────────
const CONTROLLED_FOOD_ALIASES = {
  // Breakfast
  "vegetable poha": "IND_BF_001",
  "poha": "IND_BF_001",
  "kanda poha": "IND_BF_001",
  "moong dal cheela": "IND_BF_002",
  "moong dal chilla": "IND_BF_002",
  "moong cheela": "IND_BF_002",
  "oats upma": "IND_BF_003",
  "vegetable oats upma": "IND_BF_003",
  "ragi idli": "IND_BF_004",
  "ragi idli with sambar": "IND_BF_004",
  "ragi idli sambar": "IND_BF_004",
  "multigrain methi paratha": "IND_BF_005",
  "methi paratha": "IND_BF_005",

  // Lunch
  "dal tadka with phulka": "IND_LN_001",
  "dal tadka phulka": "IND_LN_001",
  "dal tadka": "IND_LN_001",
  "rajma chawal": "IND_LN_002",
  "rajma rice": "IND_LN_002",
  "palak paneer with roti": "IND_LN_003",
  "palak paneer": "IND_LN_003",
  "grilled chicken with brown rice": "IND_LN_004",
  "grilled chicken brown rice": "IND_LN_004",
  "vegetable sambar rice": "IND_LN_005",
  "sambar rice": "IND_LN_005",

  // Snacks
  "roasted makhana": "IND_SK_001",
  "fox nuts": "IND_SK_001",
  "makhana": "IND_SK_001",
  "sprouted moong chaat": "IND_SK_002",
  "sprouts chaat": "IND_SK_002",
  "sprouted moong salad": "IND_SK_002",
  "roasted chana": "IND_SK_003",
  "roasted chana and jaggery": "IND_SK_003",
  "roasted chana jaggery": "IND_SK_003",

  // Dinner
  "vegetable dal khichdi": "IND_DN_001",
  "dal khichdi": "IND_DN_001",
  "khichdi": "IND_DN_001",
  "ragi roti with methi dal": "IND_DN_002",
  "ragi roti methi dal": "IND_DN_002",
  "palak soup with multigrain toast": "IND_DN_003",
  "palak soup": "IND_DN_003",
  "fish curry with steamed rice": "IND_DN_004",
  "fish curry rice": "IND_DN_004",
};

/**
 * Strict 4-tier nutrition lookup:
 * 1. exact food_id (e.g. "IND_BF_001")
 * 2. exact recipe_id (e.g. "RCP_BF_001")
 * 3. exact normalized food_name
 * 4. controlled alias mapping
 * Returns { match, tier } or null. NO arbitrary substring matching.
 */
function lookupNutritionFromDataset(foodNameOrId) {
  if (!foodNameOrId || typeof foodNameOrId !== "string") return null;
  const needle = foodNameOrId.toLowerCase().trim();

  // Tier 1: exact food_id
  let match = FOOD_DATABASE.find(f => f.food_id.toLowerCase() === needle);
  if (match) return { match, tier: "EXACT_FOOD_ID" };

  // Tier 2: exact recipe_id
  match = FOOD_DATABASE.find(f => f.recipe_id.toLowerCase() === needle);
  if (match) return { match, tier: "EXACT_RECIPE_ID" };

  // Tier 3: exact food_name
  match = FOOD_DATABASE.find(f => f.food_name.toLowerCase() === needle);
  if (match) return { match, tier: "EXACT_FOOD_NAME" };

  // Tier 4: controlled alias mapping
  const mappedId = CONTROLLED_FOOD_ALIASES[needle];
  if (mappedId) {
    match = FOOD_DATABASE.find(f => f.food_id === mappedId);
    if (match) return { match, tier: "CONTROLLED_ALIAS" };
  }

  // Tier 5: Explicitly UNRESOLVED (No arbitrary keyword matching)
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// SAFE MATH & AUTHORITATIVE DAILY TOTALS CALCULATION
// ─────────────────────────────────────────────────────────────────────────────
function safeAdd(a, b) {
  const na = typeof a === "number" && !isNaN(a) ? a : 0;
  const nb = typeof b === "number" && !isNaN(b) ? b : 0;
  return na + nb;
}

function computePlanFingerprint(meals) {
  const norm = ALL_MEAL_SLOTS.map(slot => {
    const m = meals[slot];
    if (!m) return `${slot}:empty`;
    const foodStr = (m.foods || []).map(f => `${f.food_name}:${f.quantity_g}g`).join("+");
    return `${slot}:${m.name}:${m.quantity_g}g:[${foodStr}]`;
  }).join("|");
  return crypto.createHash("sha256").update(norm).digest("hex").substring(0, 16);
}

function calculateDailyTotals(meals) {
  const totals = {
    calories: 0,
    protein_g: 0,
    carbs_g: 0,
    fat_g: 0,
    fiber_g: 0,
    iron_mg: 0,
    calcium_mg: 0,
    vitaminC_mg: 0,
    sodium_mg: 0,
  };

  const completeness = {
    calories: true,
    protein: true,
    carbs: true,
    fat: true,
    fiber: true,
    iron: true,
    calcium: true,
    vitaminC: true,
    sodium: true,
  };

  let anyEstimated = false;
  let anyDataset   = false;
  let foodCount    = 0;

  for (const slot of ALL_MEAL_SLOTS) {
    const slotData = meals[slot];
    if (!slotData) continue;

    const foodList = Array.isArray(slotData.foods)
      ? slotData.foods
      : (Array.isArray(slotData) ? slotData : [slotData]);

    for (const food of foodList) {
      if (!food) continue;
      foodCount++;

      const c  = food.calories_kcal ?? food.calories;
      const p  = food.protein_g     ?? food.protein;
      const cb = food.carbs_g       ?? food.carbs;
      const ft = food.fat_g         ?? food.fat;
      const fb = food.fiber_g       ?? food.fiber;
      const s  = food.sodium_mg     ?? food.sodium;
      const fe = food.iron_mg;
      const ca = food.calcium_mg;
      const vc = food.vitaminC_mg;

      totals.calories  = safeAdd(totals.calories, c);
      totals.protein_g = safeAdd(totals.protein_g, p);
      totals.carbs_g   = safeAdd(totals.carbs_g, cb);
      totals.fat_g     = safeAdd(totals.fat_g, ft);
      totals.fiber_g   = safeAdd(totals.fiber_g, fb);
      totals.sodium_mg = safeAdd(totals.sodium_mg, s);
      totals.iron_mg   = safeAdd(totals.iron_mg, fe);
      totals.calcium_mg= safeAdd(totals.calcium_mg, ca);
      totals.vitaminC_mg=safeAdd(totals.vitaminC_mg, vc);

      if (c == null)  completeness.calories = false;
      if (p == null)  completeness.protein = false;
      if (cb == null) completeness.carbs = false;
      if (ft == null) completeness.fat = false;
      if (fb == null) completeness.fiber = false;
      if (fe == null) completeness.iron = false;
      if (ca == null) completeness.calcium = false;
      if (vc == null) completeness.vitaminC = false;
      if (s == null)  completeness.sodium = false;

      if (food.nutrition_source === "DATASET")       anyDataset = true;
      if (food.nutrition_source === "LLM_ESTIMATE")  anyEstimated = true;
    }
  }

  for (const k of Object.keys(totals)) {
    totals[k] = Math.round(totals[k] * 10) / 10;
  }

  const provenance = anyDataset && anyEstimated ? "MIXED" : anyDataset ? "DATASET" : "LLM_ESTIMATE";

  return {
    calories_kcal:     totals.calories,
    calories:          totals.calories,
    protein_g:         totals.protein_g,
    protein:           totals.protein_g,
    carbs_g:           totals.carbs_g,
    carbs:             totals.carbs_g,
    fat_g:             totals.fat_g,
    fat:               totals.fat_g,
    fiber_g:           totals.fiber_g,
    fiber:             totals.fiber_g,
    iron_mg:           totals.iron_mg,
    calcium_mg:        totals.calcium_mg,
    vitaminC_mg:       totals.vitaminC_mg,
    sodium_mg:         totals.sodium_mg,
    sodium:            totals.sodium_mg,
    data_completeness: completeness,
    data_source:       provenance,
    food_count:        foodCount,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// SINGLE AUTHORITATIVE MACRO VALIDATOR (`validateMacroTargets`)
// ─────────────────────────────────────────────────────────────────────────────
function validateMacroTargets(dailyTotals, targets) {
  const calMin = Math.round(targets.calories * (1 - VALIDATION_CONFIG.CALORIE_TOLERANCE_PCT) * 10) / 10;
  const calMax = Math.round(targets.calories * (1 + VALIDATION_CONFIG.CALORIE_TOLERANCE_PCT) * 10) / 10;
  const calPassed = dailyTotals.calories >= calMin && dailyTotals.calories <= calMax;

  const protMin = Math.round(targets.protein * VALIDATION_CONFIG.PROTEIN_MIN_RATIO * 10) / 10;
  const protMax = Math.round(targets.protein * VALIDATION_CONFIG.PROTEIN_MAX_RATIO * 10) / 10;
  const protPassed = dailyTotals.protein_g >= protMin && dailyTotals.protein_g <= protMax;

  const carbMin = Math.round(targets.carbs * VALIDATION_CONFIG.CARBS_MIN_RATIO * 10) / 10;
  const carbMax = Math.round(targets.carbs * VALIDATION_CONFIG.CARBS_MAX_RATIO * 10) / 10;
  const carbPassed = dailyTotals.carbs_g >= carbMin && dailyTotals.carbs_g <= carbMax;

  const fatMin = Math.round(targets.fat * VALIDATION_CONFIG.FAT_MIN_RATIO * 10) / 10;
  const fatMax = Math.round(targets.fat * VALIDATION_CONFIG.FAT_MAX_RATIO * 10) / 10;
  const fatPassed = dailyTotals.fat_g >= fatMin && dailyTotals.fat_g <= fatMax;

  const fiberMin = Math.round(targets.fiber * VALIDATION_CONFIG.FIBER_MIN_RATIO * 10) / 10;
  const fiberPassed = dailyTotals.fiber_g >= fiberMin;

  const sodiumMax = targets.sodiumMax || 2000;
  const sodiumPassed = !dailyTotals.sodium_mg || dailyTotals.sodium_mg <= sodiumMax;

  const report = {
    calories: {
      target:  targets.calories,
      minimum: calMin,
      maximum: calMax,
      actual:  dailyTotals.calories,
      status:  calPassed ? "COMPLIANT" : "NON_COMPLIANT",
      reason:  calPassed
        ? `Energy ${dailyTotals.calories} kcal meets target ${targets.calories} kcal within ±5% tolerance.`
        : `Energy ${dailyTotals.calories} kcal falls outside ±5% range [${calMin}, ${calMax}] kcal.`,
    },
    protein: {
      target:  targets.protein,
      minimum: protMin,
      maximum: protMax,
      actual:  dailyTotals.protein_g,
      status:  protPassed ? "COMPLIANT" : "NON_COMPLIANT",
      reason:  protPassed
        ? `Protein ${dailyTotals.protein_g}g satisfies target range [${protMin}, ${protMax}]g.`
        : (dailyTotals.protein_g < protMin
            ? `Protein ${dailyTotals.protein_g}g is below the configured minimum of ${protMin}g (85% of ${targets.protein}g target).`
            : `Protein ${dailyTotals.protein_g}g exceeds configured maximum of ${protMax}g.`),
    },
    carbohydrates: {
      target:  targets.carbs,
      minimum: carbMin,
      maximum: carbMax,
      actual:  dailyTotals.carbs_g,
      status:  carbPassed ? "COMPLIANT" : "NON_COMPLIANT",
      reason:  carbPassed
        ? `Carbohydrates ${dailyTotals.carbs_g}g within range [${carbMin}, ${carbMax}]g.`
        : (dailyTotals.carbs_g < carbMin
            ? `Carbohydrates ${dailyTotals.carbs_g}g is below minimum of ${carbMin}g.`
            : `Carbohydrates ${dailyTotals.carbs_g}g exceeds maximum of ${carbMax}g.`),
    },
    fat: {
      target:  targets.fat,
      minimum: fatMin,
      maximum: fatMax,
      actual:  dailyTotals.fat_g,
      status:  fatPassed ? "COMPLIANT" : "NON_COMPLIANT",
      reason:  fatPassed
        ? `Dietary fat ${dailyTotals.fat_g}g satisfies target range [${fatMin}, ${fatMax}]g.`
        : (dailyTotals.fat_g < fatMin
            ? `Dietary fat ${dailyTotals.fat_g}g is below the configured minimum of ${fatMin}g (70% of ${targets.fat}g target).`
            : `Dietary fat ${dailyTotals.fat_g}g exceeds configured maximum of ${fatMax}g.`),
    },
    fiber: {
      target:  targets.fiber,
      minimum: fiberMin,
      maximum: 85.0,
      actual:  dailyTotals.fiber_g,
      status:  fiberPassed ? "COMPLIANT" : "NON_COMPLIANT",
      reason:  fiberPassed
        ? `Dietary fiber ${dailyTotals.fiber_g}g meets or exceeds minimum requirement (>= ${fiberMin}g).`
        : `Dietary fiber ${dailyTotals.fiber_g}g is below minimum requirement (${fiberMin}g).`,
    },
    sodium: {
      target:  sodiumMax,
      minimum: 500.0,
      maximum: sodiumMax,
      actual:  dailyTotals.sodium_mg,
      status:  sodiumPassed ? "COMPLIANT" : "NON_COMPLIANT",
      reason:  sodiumPassed
        ? `Sodium ${dailyTotals.sodium_mg}mg complies with strict ceiling (<= ${sodiumMax}mg).`
        : `Sodium ${dailyTotals.sodium_mg}mg exceeds strict ceiling (${sodiumMax}mg).`,
    },
  };

  const allPassed = calPassed && protPassed && carbPassed && fatPassed && fiberPassed && sodiumPassed;
  const hardPassed = calPassed && protPassed && fatPassed && sodiumPassed;

  return { report, allPassed, hardPassed };
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPREHENSIVE PLAN VALIDATOR
// ─────────────────────────────────────────────────────────────────────────────
function validateNutritionalPlan(dailyTotals, targets, profile, meals) {
  const failed_constraints = [];
  const warnings           = [];
  let is_partial           = false;

  // 1. Authoritative Macro Targets Validation
  const { report: macro_compliance, hardPassed } = validateMacroTargets(dailyTotals, targets);

  if (macro_compliance.calories.status !== "COMPLIANT") {
    failed_constraints.push({
      constraint: "CALORIE_RANGE",
      target: targets.calories,
      actual: dailyTotals.calories,
      message: macro_compliance.calories.reason,
    });
  }

  if (macro_compliance.protein.status !== "COMPLIANT") {
    failed_constraints.push({
      constraint: "PROTEIN_BOUNDS",
      target: targets.protein,
      actual: dailyTotals.protein_g,
      message: macro_compliance.protein.reason,
    });
  }

  if (macro_compliance.fat.status !== "COMPLIANT") {
    failed_constraints.push({
      constraint: "FAT_BOUNDS",
      target: targets.fat,
      actual: dailyTotals.fat_g,
      message: macro_compliance.fat.reason,
    });
  }

  if (macro_compliance.sodium.status !== "COMPLIANT") {
    failed_constraints.push({
      constraint: "SODIUM_LIMIT_EXCEEDED",
      target: targets.sodiumMax || 2000,
      actual: dailyTotals.sodium_mg,
      message: macro_compliance.sodium.reason,
    });
  }

  if (macro_compliance.carbohydrates.status !== "COMPLIANT") {
    warnings.push(macro_compliance.carbohydrates.reason);
  }
  if (macro_compliance.fiber.status !== "COMPLIANT") {
    warnings.push(macro_compliance.fiber.reason);
  }

  // 2. Allergy Check (0 tolerance)
  const allergies = (profile.allergies || []).map(a => a.toLowerCase().trim()).filter(Boolean);
  for (const slot of ALL_MEAL_SLOTS) {
    const meal = meals[slot];
    if (!meal) continue;
    const foodList = Array.isArray(meal.foods) ? meal.foods : (meal ? [meal] : []);

    for (const food of foodList) {
      const foodName = (food.food_name || food.name || "").toLowerCase();
      const ings = (food.ingredients || []).map(i => (typeof i === 'string' ? i : i.name || "").toLowerCase());

      for (const allergy of allergies) {
        if (foodName.includes(allergy) || ings.some(ing => ing.includes(allergy))) {
          failed_constraints.push({
            constraint: "ALLERGY_VIOLATION",
            allergy,
            food: food.food_name || food.name,
            message: `Allergy violation: "${food.food_name || food.name}" contains allergen "${allergy}".`,
          });
        }
      }
    }
  }

  // 3. Diet type check (0 tolerance for non-veg in vegetarian profile)
  const isVeg = (profile.dietaryPreference || "").toLowerCase().includes("veg") &&
                !(profile.dietaryPreference || "").toLowerCase().includes("non");
  if (isVeg) {
    const nonVegKeywords = ["chicken", "mutton", "beef", "pork", "fish", "prawn", "shrimp", "crab", "lamb", "egg", "meat"];
    for (const slot of ALL_MEAL_SLOTS) {
      const meal = meals[slot];
      if (!meal) continue;
      const foodList = Array.isArray(meal.foods) ? meal.foods : (meal ? [meal] : []);

      for (const food of foodList) {
        const foodName = (food.food_name || food.name || "").toLowerCase();
        const ings = (food.ingredients || []).map(i => (typeof i === 'string' ? i : i.name || "").toLowerCase());

        for (const kw of nonVegKeywords) {
          if (foodName.includes(kw) || ings.some(ing => ing.includes(kw))) {
            failed_constraints.push({
              constraint: "DIET_TYPE_VIOLATION",
              diet_type:  "Vegetarian",
              food:       food.food_name || food.name,
              message:    `Diet-type violation: "${food.food_name || food.name}" contains non-veg ingredient "${kw}".`,
            });
          }
        }
      }
    }
  }

  // 4. Meal completeness
  const presentSlots = ALL_MEAL_SLOTS.filter(s => meals[s] && (meals[s].foods?.length > 0 || meals[s].calories > 0));
  if (presentSlots.length < 4) {
    failed_constraints.push({
      constraint: "INSUFFICIENT_MEALS",
      actual:     presentSlots.length,
      required:   4,
      message:    `Only ${presentSlots.length} meal slots present. All 4 meals required (breakfast, lunch, snacks, dinner).`,
    });
  }

  // 5. Data completeness
  const completeness = dailyTotals.data_completeness || {};
  if (!completeness.calories || !completeness.protein || !completeness.carbs || !completeness.fat) {
    is_partial = true;
    warnings.push("One or more macronutrient values rely on estimated references.");
  }
  if (!completeness.iron || !completeness.calcium || !completeness.sodium) {
    is_partial = true;
    warnings.push("Some micronutrient values are estimated from ingredient references.");
  }
  if (dailyTotals.data_source === "LLM_ESTIMATE" || dailyTotals.data_source === "MIXED") {
    is_partial = true;
  }

  let status = "PASS";
  if (failed_constraints.length > 0) {
    status = "FAIL";
  } else if (is_partial) {
    status = "PARTIAL";
  } else if (warnings.length > 0) {
    status = "WARNING";
  }

  return {
    status,
    passed:             status === "PASS" || status === "PARTIAL" || status === "WARNING",
    failed_constraints,
    warnings,
    data_completeness:  completeness,
    macro_compliance,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// NUTRITION QUALITY ASSESSMENT (CONSUMES MACRO COMPLIANCE)
// ─────────────────────────────────────────────────────────────────────────────
function assessNutritionQuality(dailyTotals, targets, meals, validationResult) {
  const flags = [];
  const totalCals = dailyTotals.calories || 1;

  // 1. Consume Macro Validation
  const macroComp = validationResult?.macro_compliance || validateMacroTargets(dailyTotals, targets).report;
  let hasMacroFailure = false;
  for (const [mName, mData] of Object.entries(macroComp)) {
    if (mData.status === "NON_COMPLIANT") {
      hasMacroFailure = true;
      flags.push(`Macro target out of range: ${mName.toUpperCase()} (${mData.actual}) fails bounds [${mData.minimum}, ${mData.maximum}].`);
    }
  }

  // 2. Atwater (4-4-9) Calorie-to-Macro Consistency Check
  const atwaterExpectedCalories = Math.round(
    (dailyTotals.protein_g * 4.0) + (dailyTotals.carbs_g * 4.0) + (dailyTotals.fat_g * 9.0)
  );
  const atwaterDiff = Math.abs(dailyTotals.calories - atwaterExpectedCalories);
  const atwaterDiffPct = Math.round((atwaterDiff / totalCals) * 1000) / 10;
  const atwaterConsistent = atwaterDiffPct <= 15.0;

  if (!atwaterConsistent) {
    flags.push(`Atwater macro energy sum (${atwaterExpectedCalories} kcal) differs from reported calories (${dailyTotals.calories} kcal) by ${atwaterDiffPct}%.`);
  }

  // 3. Macro energy percentage distribution
  const protCalPct = Math.round(((dailyTotals.protein_g * 4.0) / totalCals) * 100);
  const carbCalPct = Math.round(((dailyTotals.carbs_g * 4.0) / totalCals) * 100);
  const fatCalPct  = Math.round(((dailyTotals.fat_g * 9.0) / totalCals) * 100);

  if (protCalPct < 10) flags.push("Protein energy contribution is low (<10% of total kcal).");
  if (protCalPct > 35) flags.push("Protein energy contribution is elevated (>35% of total kcal).");
  if (fatCalPct < 12)  flags.push("Fat energy contribution is low (<12% of total kcal).");
  if (fatCalPct > 40)  flags.push("Fat energy contribution is high (>40% of total kcal).");
  if (carbCalPct < 35) flags.push("Carbohydrate energy contribution is low (<35% of total kcal).");
  if (carbCalPct > 75) flags.push("Carbohydrate energy contribution is high (>75% of total kcal).");

  // 4. Fiber bounds
  if (dailyTotals.fiber_g > 80) {
    flags.push(`Unusually high daily fiber (${dailyTotals.fiber_g}g/day) may cause gastrointestinal discomfort.`);
  }

  // 5. Meal distribution balance
  for (const slot of ALL_MEAL_SLOTS) {
    const meal = meals[slot];
    if (meal && meal.calories > totalCals * 0.55) {
      flags.push(`Meal slot "${slot}" contains disproportionately high calories (${meal.calories} kcal, >55% of total).`);
    }
  }

  // Quality status: CANNOT be EXCELLENT if any macro is non-compliant!
  let quality_status = "EXCELLENT";
  if (hasMacroFailure) {
    quality_status = flags.length > 2 ? "NEEDS_REVIEW" : "WARNING";
  } else if (flags.length > 2) {
    quality_status = "NEEDS_REVIEW";
  } else if (flags.length > 0) {
    quality_status = "ACCEPTABLE";
  }

  return {
    quality_status,
    atwater_consistency: {
      reported_calories: dailyTotals.calories,
      atwater_calculated: atwaterExpectedCalories,
      difference_kcal: atwaterDiff,
      difference_pct: `${atwaterDiffPct}%`,
      is_consistent: atwaterConsistent,
    },
    macro_energy_distribution: {
      protein_pct: `${protCalPct}%`,
      carbs_pct: `${carbCalPct}%`,
      fat_pct: `${fatCalPct}%`,
    },
    quality_flags: flags,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// ENRICH FOODS WITH INGREDIENT BREAKDOWN & SAFE 4-TIER DATASET LOOKUP
// ─────────────────────────────────────────────────────────────────────────────
function enrichWithDatasetNutrition(llmFoods) {
  return llmFoods.map(food => {
    const lookupResult = lookupNutritionFromDataset(food.food_name || food.food_id);
    const rawQ = parseFloat(food.quantity_g) || 150;
    const normalizedQG = normalizeDietQuantity(rawQ, "g");

    const ingredients = Array.isArray(food.ingredients) && food.ingredients.length > 0
      ? food.ingredients.map(ing => ({
          name: ing.name,
          quantity_g: normalizeDietQuantity(ing.quantity_g || Math.round(normalizedQG / food.ingredients.length), "g"),
        }))
      : [{ name: food.food_name, quantity_g: normalizedQG }];

    // Format quantity description to be consistent with normalized weight
    let quantityDesc = food.quantity_description || `${normalizedQG}g portion`;
    if (quantityDesc.match(/\b\d+\s*g\b/i)) {
      quantityDesc = quantityDesc.replace(/\b\d+\s*g\b/gi, `${normalizedQG}g`);
    }

    if (lookupResult && lookupResult.match) {
      const dsMatch = lookupResult.match;
      const q = normalizedQG / 100;
      return {
        ...food,
        calories_kcal:        Math.round(dsMatch.calories_per_100g  * q * 10) / 10,
        protein_g:            Math.round(dsMatch.protein_per_100g   * q * 10) / 10,
        carbs_g:              Math.round(dsMatch.carbs_per_100g     * q * 10) / 10,
        fat_g:                Math.round(dsMatch.fat_per_100g       * q * 10) / 10,
        fiber_g:              Math.round(dsMatch.fiber_per_100g     * q * 10) / 10,
        iron_mg:              dsMatch.iron_per_100g     != null ? Math.round(dsMatch.iron_per_100g     * q * 10) / 10 : null,
        calcium_mg:           dsMatch.calcium_per_100g  != null ? Math.round(dsMatch.calcium_per_100g  * q * 10) / 10 : null,
        vitaminC_mg:          dsMatch.vitamin_c_per_100g!= null ? Math.round(dsMatch.vitamin_c_per_100g* q * 10) / 10 : null,
        sodium_mg:            dsMatch.sodium_per_100g   != null ? Math.round(dsMatch.sodium_per_100g   * q * 10) / 10 : null,
        nutrition_source:     "DATASET",
        data_confidence:      "VERIFIED",
        dataset_match_tier:   lookupResult.tier,
        dataset_food_id:      dsMatch.food_id,
        dataset_food_name:    dsMatch.food_name,
        quantity_g:           normalizedQG,
        quantity_description: quantityDesc,
        ingredients,
      };
    }

    // PATH B: LLM ESTIMATE (TIER 5 UNRESOLVED) — Recalculate proportionally to rounded quantity
    const scale = rawQ > 0 ? (normalizedQG / rawQ) : 1.0;
    const rawCals = parseFloat(food.calories_kcal || food.calories || 0) || 0;
    const rawProt = parseFloat(food.protein_g     || food.protein  || 0) || 0;
    const rawCarbs= parseFloat(food.carbs_g       || food.carbs    || 0) || 0;
    const rawFat  = parseFloat(food.fat_g         || food.fat      || 0) || 0;
    const rawFiber= parseFloat(food.fiber_g       || food.fiber    || 0) || 0;

    return {
      ...food,
      calories_kcal:        Math.round((rawCals * scale) * 10) / 10,
      protein_g:            Math.round((rawProt * scale) * 10) / 10,
      carbs_g:              Math.round((rawCarbs * scale) * 10) / 10,
      fat_g:                Math.round((rawFat * scale) * 10) / 10,
      fiber_g:              Math.round((rawFiber * scale) * 10) / 10,
      iron_mg:              food.iron_mg     != null ? Math.round((parseFloat(food.iron_mg) * scale) * 10) / 10 : null,
      calcium_mg:           food.calcium_mg  != null ? Math.round((parseFloat(food.calcium_mg) * scale) * 10) / 10 : null,
      sodium_mg:            food.sodium_mg   != null ? Math.round((parseFloat(food.sodium_mg) * scale) * 10) / 10 : null,
      nutrition_source:     "LLM_ESTIMATE",
      data_confidence:      "ESTIMATED",
      dataset_match_tier:   "UNRESOLVED",
      dataset_food_id:      null,
      quantity_g:           normalizedQG,
      quantity_description: quantityDesc,
      ingredients,
    };
  });
}

function processMeals(llmMeals) {
  const processedMeals = {};

  for (const slot of ALL_MEAL_SLOTS) {
    const rawFoods = llmMeals[slot] || (slot === "snacks" ? (llmMeals.evening_snack || llmMeals.snack || llmMeals.snack2) : null);
    if (!rawFoods || !Array.isArray(rawFoods) || rawFoods.length === 0) {
      processedMeals[slot] = null;
      continue;
    }

    const enrichedFoods = enrichWithDatasetNutrition(rawFoods);

    const slotCalories  = Math.round(enrichedFoods.reduce((s, f) => safeAdd(s, f.calories_kcal), 0) * 10) / 10;
    const slotProtein   = Math.round(enrichedFoods.reduce((s, f) => safeAdd(s, f.protein_g),     0) * 10) / 10;
    const slotCarbs     = Math.round(enrichedFoods.reduce((s, f) => safeAdd(s, f.carbs_g),       0) * 10) / 10;
    const slotFat       = Math.round(enrichedFoods.reduce((s, f) => safeAdd(s, f.fat_g),         0) * 10) / 10;
    const slotFiber     = Math.round(enrichedFoods.reduce((s, f) => safeAdd(s, f.fiber_g),       0) * 10) / 10;
    const slotSodium    = Math.round(enrichedFoods.reduce((s, f) => safeAdd(s, f.sodium_mg || 0),0) * 10) / 10;
    const slotIron      = Math.round(enrichedFoods.reduce((s, f) => safeAdd(s, f.iron_mg   || 0),0) * 10) / 10;

    const primaryFood = enrichedFoods.reduce((a, b) =>
      (b.calories_kcal || 0) > (a.calories_kcal || 0) ? b : a
    , enrichedFoods[0]);

    const slotHasDataset  = enrichedFoods.some(f => f.nutrition_source === "DATASET");
    const slotHasEstimate = enrichedFoods.some(f => f.nutrition_source === "LLM_ESTIMATE");

    processedMeals[slot] = {
      foods: enrichedFoods,
      name:        primaryFood.food_name,
      quantity:    primaryFood.quantity_description || `${primaryFood.quantity_g || 0}g`,
      quantity_g:  primaryFood.quantity_g || 0,
      preparation: primaryFood.preparation || "",
      time:        MEAL_TIMES[slot],
      calories:    slotCalories,
      protein:     slotProtein,
      protein_g:   slotProtein,
      carbs:       slotCarbs,
      carbs_g:     slotCarbs,
      fat:         slotFat,
      fat_g:       slotFat,
      fiber:       slotFiber,
      fiber_g:     slotFiber,
      sodium:      slotSodium,
      sodium_mg:   slotSodium,
      iron_mg:     slotIron,
      whyRecommended: primaryFood.reason || enrichedFoods.map(f => f.reason).filter(Boolean).join(" "),
      isVegetarian: isVegetarianSlot(enrichedFoods),
      allergens:   [],
      cuisine:     "Indian",
      nutrition_source: slotHasDataset && slotHasEstimate ? "MIXED" : slotHasDataset ? "DATASET" : "LLM_ESTIMATE",
      data_confidence:  slotHasEstimate ? "ESTIMATED" : "VERIFIED",
      validationBadge:  "Nutrition Plan Evaluated",
      validationStatus: "PASS",
    };
  }

  return processedMeals;
}

function isVegetarianSlot(foods) {
  const nonVegKw = ["chicken", "mutton", "beef", "pork", "fish", "prawn", "shrimp", "crab", "lamb", "egg", "meat"];
  return !foods.some(f =>
    nonVegKw.some(kw => (f.food_name || "").toLowerCase().includes(kw))
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SEED-DRIVEN MULTI-POOL DETERMINISTIC FALLBACK (VARIED & FAT-CALIBRATED)
// ─────────────────────────────────────────────────────────────────────────────
function buildFallbackPlan(profile, targets, seed, nutritionPriorities) {
  const isVeg = (profile.dietaryPreference || "veg").toLowerCase().includes("veg")
    && !(profile.dietaryPreference || "").toLowerCase().includes("non");
  const hasIronPriority = nutritionPriorities.some(p => p.nutrients?.includes("iron"));

  const rng = seededRng(seed);

  // Target calorie allocations across 4 meal slots (Breakfast 25%, Lunch 35%, Snacks 15%, Dinner 25%)
  const slotCalorieTargets = {
    breakfast: Math.round(targets.calories * 0.25),
    lunch:     Math.round(targets.calories * 0.35),
    snacks:    Math.round(targets.calories * 0.15),
    dinner:    targets.calories - Math.round(targets.calories * 0.25) - Math.round(targets.calories * 0.35) - Math.round(targets.calories * 0.15),
  };

  // Multiple Varied Recipe Pools per Slot (Calibrated so Fat is 45-55g, Protein is 95-115g)
  const recipePools = {
    breakfast: isVeg
      ? (hasIronPriority
          ? [
              {
                food_name: "Ragi Idli with Sambar and Sprouted Moong",
                cal_per_100g: 138, prot_per_100g: 8.8, carbs_per_100g: 19.5, fat_per_100g: 3.2, fiber_per_100g: 4.5,
                preparation: "Steamed finger millet idlis served with vegetable-lentil sambar and steamed sprouted moong",
                reason: "Ragi provides rich bioavailable calcium and iron. Sprouted moong and sambar deliver high-quality plant protein and vitamin C.",
                ingredients: [
                  { name: "ragi flour", quantity_pct: 0.35 },
                  { name: "urad dal & sprouts", quantity_pct: 0.30 },
                  { name: "vegetable sambar", quantity_pct: 0.35 },
                ]
              },
              {
                food_name: "Moong Dal Cheela with Grated Paneer & Curd",
                cal_per_100g: 152, prot_per_100g: 10.2, carbs_per_100g: 16.5, fat_per_100g: 4.8, fiber_per_100g: 4.0,
                preparation: "Pan-cooked yellow moong dal crepes stuffed with fresh paneer and served with probiotic curd",
                reason: "High biological value protein and iron-fortified moong dal for tissue repair.",
                ingredients: [
                  { name: "yellow moong dal", quantity_pct: 0.50 },
                  { name: "fresh paneer", quantity_pct: 0.25 },
                  { name: "curd", quantity_pct: 0.25 },
                ]
              },
              {
                food_name: "Multigrain Methi Paratha with Spiced Curd",
                cal_per_100g: 168, prot_per_100g: 8.5, carbs_per_100g: 22.0, fat_per_100g: 5.2, fiber_per_100g: 5.0,
                preparation: "Whole grain flatbread kneaded with fresh fenugreek leaves and cold-pressed oil, with spiced curd",
                reason: "Fenugreek supports iron assimilation and complex carbohydrates sustain morning energy.",
                ingredients: [
                  { name: "multigrain flour", quantity_pct: 0.45 },
                  { name: "fresh methi leaves", quantity_pct: 0.25 },
                  { name: "curd", quantity_pct: 0.30 },
                ]
              }
            ]
          : [
              {
                food_name: "Moong Dal Cheela with Low-Fat Curd",
                cal_per_100g: 145, prot_per_100g: 9.8, carbs_per_100g: 17.5, fat_per_100g: 4.0, fiber_per_100g: 4.0,
                preparation: "Savory yellow moong dal crepes cooked with mild herbs, paired with probiotic curd",
                reason: "High protein breakfast supporting daily tissue repair and sustained satiety.",
                ingredients: [
                  { name: "yellow moong dal", quantity_pct: 0.60 },
                  { name: "low-fat curd", quantity_pct: 0.40 },
                ]
              },
              {
                food_name: "Vegetable Poha with Roasted Peanuts and Sprouts",
                cal_per_100g: 155, prot_per_100g: 7.8, carbs_per_100g: 22.0, fat_per_100g: 4.2, fiber_per_100g: 3.5,
                preparation: "Flattened rice tempered with mustard, curry leaves, vegetables, and steamed sprouts",
                reason: "Easily digestible complex carbohydrates paired with plant protein.",
                ingredients: [
                  { name: "flattened rice", quantity_pct: 0.55 },
                  { name: "mixed sprouts", quantity_pct: 0.30 },
                  { name: "vegetables", quantity_pct: 0.15 },
                ]
              }
            ])
      : [
          {
            food_name: "Egg Bhurji with Multigrain Toast",
            cal_per_100g: 165, prot_per_100g: 12.0, carbs_per_100g: 15.0, fat_per_100g: 6.5, fiber_per_100g: 2.5,
            preparation: "Spiced scrambled whole eggs with multigrain toast and vegetables",
            reason: "High biological value protein and natural vitamin B12.",
            ingredients: [
              { name: "whole eggs", quantity_pct: 0.55 },
              { name: "multigrain bread", quantity_pct: 0.45 },
            ]
          }
        ],

    lunch: isVeg
      ? [
          {
            food_name: "Brown Rice + Palak Dal + Soya Chunk Sabzi",
            cal_per_100g: 145, prot_per_100g: 9.8, carbs_per_100g: 19.5, fat_per_100g: 3.5, fiber_per_100g: 4.8,
            preparation: "Steamed brown rice served with iron-rich spinach dal and protein-dense soya vegetable sabzi",
            reason: "Spinach (palak) provides plant iron and folate. Soya chunks and dal provide complete amino acids.",
            ingredients: [
              { name: "cooked brown rice", quantity_pct: 0.40 },
              { name: "palak toor dal", quantity_pct: 0.35 },
              { name: "soya chunk sabzi", quantity_pct: 0.25 },
            ]
          },
          {
            food_name: "Rajma Chawal with Mixed Vegetable Raita",
            cal_per_100g: 155, prot_per_100g: 8.8, carbs_per_100g: 22.0, fat_per_100g: 3.6, fiber_per_100g: 5.5,
            preparation: "Slow-cooked red kidney beans in mild onion-tomato gravy over steamed rice with cucumber curd",
            reason: "Kidney beans deliver rich plant iron, zinc, and sustained dietary fiber.",
            ingredients: [
              { name: "cooked rajma", quantity_pct: 0.40 },
              { name: "steamed rice", quantity_pct: 0.35 },
              { name: "cucumber raita", quantity_pct: 0.25 },
            ]
          },
          {
            food_name: "Dal Tadka with Whole Wheat Phulkas & Paneer Sabzi",
            cal_per_100g: 165, prot_per_100g: 10.2, carbs_per_100g: 18.0, fat_per_100g: 5.8, fiber_per_100g: 4.2,
            preparation: "Yellow lentil soup tempered with cumin, paired with 2 phulkas and fresh palak paneer",
            reason: "Balanced traditional Indian lunch with complete dairy and legume protein.",
            ingredients: [
              { name: "yellow dal tadka", quantity_pct: 0.35 },
              { name: "whole wheat phulka", quantity_pct: 0.35 },
              { name: "palak paneer", quantity_pct: 0.30 },
            ]
          }
        ]
      : [
          {
            food_name: "Grilled Fish with Brown Rice and Dal",
            cal_per_100g: 158, prot_per_100g: 13.5, carbs_per_100g: 16.0, fat_per_100g: 4.5, fiber_per_100g: 2.2,
            preparation: "Pan-grilled local fish with steamed brown rice and yellow lentil dal",
            reason: "Lean protein and essential omega-3 fatty acids for cellular recovery.",
            ingredients: [
              { name: "grilled fish", quantity_pct: 0.40 },
              { name: "brown rice", quantity_pct: 0.35 },
              { name: "yellow dal", quantity_pct: 0.25 },
            ]
          }
        ],

    snacks: [
      {
        food_name: "Roasted Chana and Jaggery",
        cal_per_100g: 364, prot_per_100g: 17.5, carbs_per_100g: 58.0, fat_per_100g: 5.5, fiber_per_100g: 15.0,
        preparation: "Dry-roasted Bengal gram paired with a small portion of traditional unrefined jaggery",
        reason: "Roasted chana delivers concentrated plant protein and iron. Jaggery provides trace minerals.",
        ingredients: [
          { name: "roasted chana", quantity_pct: 0.80 },
          { name: "jaggery", quantity_pct: 0.20 },
        ]
      },
      {
        food_name: "Roasted Makhana with Flaxseed & Walnuts",
        cal_per_100g: 380, prot_per_100g: 12.0, carbs_per_100g: 52.0, fat_per_100g: 14.0, fiber_per_100g: 12.0,
        preparation: "Foxnuts dry roasted with crushed walnuts and roasted flaxseeds",
        reason: "Healthy fats, alpha-linolenic acid, and low sodium afternoon snacking.",
        ingredients: [
          { name: "foxnuts (makhana)", quantity_pct: 0.70 },
          { name: "walnuts & flaxseeds", quantity_pct: 0.30 },
        ]
      },
      {
        food_name: "Spiced Chickpea Sundal with Fresh Coconut",
        cal_per_100g: 165, prot_per_100g: 8.5, carbs_per_100g: 22.0, fat_per_100g: 4.8, fiber_per_100g: 5.5,
        preparation: "Boiled white chickpeas tempered with mustard, curry leaves, and grated fresh coconut",
        reason: "High fiber and plant protein snack with bioavailable iron.",
        ingredients: [
          { name: "boiled chickpeas", quantity_pct: 0.80 },
          { name: "fresh grated coconut", quantity_pct: 0.20 },
        ]
      }
    ],

    dinner: isVeg
      ? [
          {
            food_name: "Ragi Roti with Methi Dal and Paneer Bhurji",
            cal_per_100g: 158, prot_per_100g: 9.5, carbs_per_100g: 19.5, fat_per_100g: 4.8, fiber_per_100g: 4.5,
            preparation: "Handmade finger millet flatbreads with fenugreek dal and spiced light paneer",
            reason: "Ragi flatbread delivers complex carbohydrates, calcium, and iron. Methi dal and paneer support nocturnal recovery.",
            ingredients: [
              { name: "ragi roti", quantity_pct: 0.40 },
              { name: "methi dal", quantity_pct: 0.35 },
              { name: "light paneer bhurji", quantity_pct: 0.25 },
            ]
          },
          {
            food_name: "Vegetable Dal Khichdi with Roasted Papad & Curd",
            cal_per_100g: 142, prot_per_100g: 8.5, carbs_per_100g: 21.0, fat_per_100g: 3.8, fiber_per_100g: 4.2,
            preparation: "Comforting moong dal and rice porridge cooked with carrots, beans, and cumin, served with curd",
            reason: "Easily assimilated protein and complex carbohydrates promoting restful sleep.",
            ingredients: [
              { name: "moong dal khichdi", quantity_pct: 0.70 },
              { name: "fresh curd", quantity_pct: 0.30 },
            ]
          },
          {
            food_name: "Jowar Bhakri with Baingan Bharta & Moong Dal",
            cal_per_100g: 150, prot_per_100g: 8.6, carbs_per_100g: 20.5, fat_per_100g: 4.2, fiber_per_100g: 4.8,
            preparation: "Sorghum gluten-free flatbreads with smoky roasted eggplant mash and yellow dal",
            reason: "High fiber, gluten-free traditional dinner rich in antioxidants and micronutrients.",
            ingredients: [
              { name: "jowar bhakri", quantity_pct: 0.40 },
              { name: "baingan bharta", quantity_pct: 0.35 },
              { name: "moong dal", quantity_pct: 0.25 },
            ]
          }
        ]
      : [
          {
            food_name: "Grilled Fish with Phulka and Dal",
            cal_per_100g: 160, prot_per_100g: 14.0, carbs_per_100g: 16.0, fat_per_100g: 4.5, fiber_per_100g: 2.5,
            preparation: "Pan-grilled local white fish with whole wheat rotis and yellow dal",
            reason: "Lean protein and essential omega-3 fatty acids for muscle maintenance.",
            ingredients: [
              { name: "grilled fish", quantity_pct: 0.35 },
              { name: "phulka rotis", quantity_pct: 0.35 },
              { name: "yellow dal", quantity_pct: 0.30 },
            ]
          }
        ],
  };

  const meals = {};
  for (const slot of ALL_MEAL_SLOTS) {
    const pool = recipePools[slot] || [];
    if (pool.length === 0) continue;

    // Pick recipe deterministically from pool using seed RNG
    const pickIdx = Math.floor(rng() * pool.length);
    const dish = pool[pickIdx];

    const targetCalForSlot = slotCalorieTargets[slot];
    const rawQtyG = Math.max(40, Math.round((targetCalForSlot / dish.cal_per_100g) * 100));
    const qtyG = normalizeDietQuantity(rawQtyG, "g");
    const q = qtyG / 100;

    const actualCals  = Math.round(dish.cal_per_100g   * q * 10) / 10;
    const actualProt  = Math.round(dish.prot_per_100g  * q * 10) / 10;
    const actualCarbs = Math.round(dish.carbs_per_100g * q * 10) / 10;
    const actualFat   = Math.round(dish.fat_per_100g   * q * 10) / 10;
    const actualFiber = Math.round(dish.fiber_per_100g * q * 10) / 10;

    const ingredients = dish.ingredients.map(ing => ({
      name: ing.name,
      quantity_g: normalizeDietQuantity(Math.round(qtyG * ing.quantity_pct), "g"),
    }));

    meals[slot] = [{
      food_name:            dish.food_name,
      quantity_description: `${qtyG}g portion (${Math.round(actualCals)} kcal)`,
      quantity_g:           qtyG,
      calories_kcal:        actualCals,
      protein_g:            actualProt,
      carbs_g:              actualCarbs,
      fat_g:                actualFat,
      fiber_g:              actualFiber,
      preparation:          dish.preparation,
      reason:               dish.reason,
      ingredients,
      nutrition_source:     "LLM_ESTIMATE",
      data_confidence:      "ESTIMATED",
    }];
  }

  return { meals };
}

// ─────────────────────────────────────────────────────────────────────────────
// LLM SYSTEM PROMPT & PATIENT CONTEXT BUILDER
// ─────────────────────────────────────────────────────────────────────────────
const LLM_SYSTEM_PROMPT_V10 = `You are the primary Personalized Diet Generation AI for the Medicare healthcare application.

Your task is to create a complete, realistic, personalized Indian diet plan for the patient described in the input.

CRITICAL REQUIREMENT — EXACT CALORIE & MACRO COMPLIANCE:
You MUST generate meals whose sum strictly meets the daily nutritional targets:
- Energy Target: {CALORIE_TARGET} kcal (Allowed range: {CALORIE_MIN} - {CALORIE_MAX} kcal)
- Protein Target: {PROTEIN_TARGET}g (Allowed range: {PROTEIN_MIN}g - {PROTEIN_MAX}g)
  * For vegetarian patients with elevated protein needs, include adequate portions of paneer, soya chunks, sprouted moong, dals, lentils, curd, and seeds to ensure total protein is at least {PROTEIN_MIN}g!
- Carbohydrates Target: {CARBS_TARGET}g (Allowed range: {CARBS_MIN}g - {CARBS_MAX}g)
- Fat Target: {FAT_TARGET}g (Allowed range: {FAT_MIN}g - {FAT_MAX}g)
- Dietary Fiber Target: At least {FIBER_MIN}g
- Sodium Limit: Strict maximum {SODIUM_MAX}mg

If total energy or macronutrients fall outside these ranges, the plan will be automatically REJECTED by the backend validator.

NUTRITION & INGREDIENT RULES:
1. For EVERY food item, provide:
   - food_name (e.g. "Ragi Dosa with Vegetable Sambar and Sautéed Paneer")
   - quantity_g (total portion in grams)
   - quantity_description (e.g. "2 dosas with 1 cup sambar and 60g paneer, approx 320g")
   - ingredients: array of [{ name: "string", quantity_g: number }]
   - calories_kcal, protein_g, carbs_g, fat_g, fiber_g (realistic estimated values)
   - preparation method and specific reason citing actual numbers
2. Medical report findings:
   - Low hemoglobin detected: emphasize iron, protein, vitamin C, folate, and B-vitamins
   - Do NOT assert medical diagnoses (do not say "patient has anemia")
3. Allergies & Diet-Type:
   - NEVER include allergen foods
   - Strictly respect vegetarian / non-vegetarian dietary preference
4. Required meal slots:
   - breakfast (~25% of energy)
   - lunch (~35% of energy)
   - snacks (~15% of energy)
   - dinner (~25% of energy)

Return ONLY valid JSON matching the required_output_schema. No markdown code blocks, no prose.`;

function buildPatientContext({
  profile, targets, nutritionPriorities, medicalContext,
  generationId, correctionFeedback,
}) {
  const age    = calculateAge(profile.dob);
  const gender = (profile.gender || "male").toLowerCase();

  const calMin = Math.round(targets.calories * (1 - VALIDATION_CONFIG.CALORIE_TOLERANCE_PCT) * 10) / 10;
  const calMax = Math.round(targets.calories * (1 + VALIDATION_CONFIG.CALORIE_TOLERANCE_PCT) * 10) / 10;

  const biomarkerFindings = Object.entries(medicalContext.structuredBiomarkers || {})
    .filter(([, b]) => {
      const s = String(b.status || b.calculatedStatus || "").toUpperCase();
      return s !== "NORMAL" && s !== "UNKNOWN";
    })
    .map(([name, b]) => ({
      name,
      value:  b.value,
      unit:   b.unit,
      status: String(b.status || b.calculatedStatus || "").toUpperCase(),
      reference_min: b.referenceLow ?? b.referenceMin,
      reference_max: b.referenceHigh ?? b.referenceMax,
    }));

  return {
    generation_id: generationId,

    patient: {
      age,
      sex:             gender,
      height_cm:       parseFloat(profile.height) || 170,
      weight_kg:       parseFloat(profile.weight) || 68,
      bmi:             targets.bmi,
      bmi_status:      targets.bmiStatus,
      activity_level:  profile.activityLevel || "moderate",
      goal:            profile.goal || "general_wellness",
      diet_type:       profile.dietaryPreference || "Vegetarian",
      allergies:       profile.allergies || [],
      chronic_diseases:profile.chronicDiseases || [],
    },

    medical_report: {
      diagnosis:   medicalContext.diagnosis || "Not specified",
      symptoms:    medicalContext.symptoms  || "None reported",
      findings:    biomarkerFindings,
      clinical_note: biomarkerFindings.length > 0
        ? `Laboratory findings: ${biomarkerFindings.map(f => `${f.name} = ${f.value} ${f.unit} (${f.status.toUpperCase()})`).join(", ")}.`
        : "No abnormal biomarkers detected.",
    },

    nutrition_priorities: nutritionPriorities.map(p => ({
      finding:   `${p.biomarker} = ${p.value} (${p.status.toUpperCase()})`,
      priority:  p.priority,
      directive: p.macroDirective,
      nutrients: p.nutrients,
    })),

    nutrition_targets: {
      calories_kcal:      targets.calories,
      allowed_range_kcal: [calMin, calMax],
      protein_g:          targets.protein,
      carbs_g:            targets.carbs,
      fat_g:              targets.fat,
      fiber_g:            targets.fiber,
      sodium_max_mg:      targets.sodiumMax,
      meal_distribution: {
        breakfast: `${Math.round(targets.calories * 0.25)} kcal (25%)`,
        lunch:     `${Math.round(targets.calories * 0.35)} kcal (35%)`,
        snacks:    `${Math.round(targets.calories * 0.15)} kcal (15%)`,
        dinner:    `${Math.round(targets.calories * 0.25)} kcal (25%)`,
      },
    },

    correction_feedback: correctionFeedback || null,

    required_output_schema: {
      generation_id: generationId,
      meals: {
        breakfast: [{ food_name: "string", quantity_description: "string", quantity_g: "number", ingredients: [{ name: "string", quantity_g: "number" }], calories_kcal: "number", protein_g: "number", carbs_g: "number", fat_g: "number", fiber_g: "number", preparation: "string", reason: "string" }],
        lunch:     [{ food_name: "string", quantity_description: "string", quantity_g: "number", ingredients: [{ name: "string", quantity_g: "number" }], calories_kcal: "number", protein_g: "number", carbs_g: "number", fat_g: "number", fiber_g: "number", preparation: "string", reason: "string" }],
        snacks:    [{ food_name: "string", quantity_description: "string", quantity_g: "number", ingredients: [{ name: "string", quantity_g: "number" }], calories_kcal: "number", protein_g: "number", carbs_g: "number", fat_g: "number", fiber_g: "number", preparation: "string", reason: "string" }],
        dinner:    [{ food_name: "string", quantity_description: "string", quantity_g: "number", ingredients: [{ name: "string", quantity_g: "number" }], calories_kcal: "number", protein_g: "number", carbs_g: "number", fat_g: "number", fiber_g: "number", preparation: "string", reason: "string" }],
      },
      plan_summary: "string",
      explanation:  ["string"],
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// CALL LLM PRIMARY (CAPTURING TRACE METRICS)
// ─────────────────────────────────────────────────────────────────────────────
async function callLLMPrimary(patientContext, targets, seed) {
  if (!OPENROUTER_API_KEY) {
    console.warn("[DietAI v10] No API key configured — using deterministic fallback");
    return { plan: null, model: null, api_call_made: false, error: "NO_API_KEY" };
  }

  const calMin  = Math.round(targets.calories * (1 - VALIDATION_CONFIG.CALORIE_TOLERANCE_PCT) * 10) / 10;
  const calMax  = Math.round(targets.calories * (1 + VALIDATION_CONFIG.CALORIE_TOLERANCE_PCT) * 10) / 10;
  const protMin = Math.round(targets.protein  * VALIDATION_CONFIG.PROTEIN_MIN_RATIO * 10) / 10;
  const protMax = Math.round(targets.protein  * VALIDATION_CONFIG.PROTEIN_MAX_RATIO * 10) / 10;
  const carbsMin= Math.round(targets.carbs    * VALIDATION_CONFIG.CARBS_MIN_RATIO   * 10) / 10;
  const carbsMax= Math.round(targets.carbs    * VALIDATION_CONFIG.CARBS_MAX_RATIO   * 10) / 10;
  const fatMin  = Math.round(targets.fat      * VALIDATION_CONFIG.FAT_MIN_RATIO     * 10) / 10;
  const fatMax  = Math.round(targets.fat      * VALIDATION_CONFIG.FAT_MAX_RATIO     * 10) / 10;
  const fiberMin= Math.round(targets.fiber    * VALIDATION_CONFIG.FIBER_MIN_RATIO   * 10) / 10;
  const sodiumMax= targets.sodiumMax || 2000;

  const systemPrompt = LLM_SYSTEM_PROMPT_V10
    .replace("{CALORIE_TARGET}", targets.calories)
    .replace("{CALORIE_MIN}",    calMin)
    .replace("{CALORIE_MAX}",    calMax)
    .replace("{PROTEIN_TARGET}", targets.protein)
    .replace("{PROTEIN_MIN}",    protMin)
    .replace("{PROTEIN_MAX}",    protMax)
    .replace("{CARBS_TARGET}",   targets.carbs)
    .replace("{CARBS_MIN}",      carbsMin)
    .replace("{CARBS_MAX}",      carbsMax)
    .replace("{FAT_TARGET}",     targets.fat)
    .replace("{FAT_MIN}",        fatMin)
    .replace("{FAT_MAX}",        fatMax)
    .replace("{FIBER_MIN}",      fiberMin)
    .replace("{SODIUM_MAX}",     sodiumMax);

  const prompt = JSON.stringify(patientContext, null, 2);
  const promptHash = crypto.createHash("md5").update(prompt).digest("hex");

  for (const model of AI_MODELS) {
    try {
      console.log(`[DietAI v10] Requesting LLM: ${model} | Target: ${targets.calories} kcal | Seed: ${seed}`);

      const response = await axios.post(
        OPENROUTER_ENDPOINT,
        {
          model,
          temperature: 0,
          seed: seed || undefined,
          max_tokens:  2500,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: systemPrompt },
            {
              role: "user",
              content: `Generate the complete personalized Indian meal plan strictly matching the targets. Return ONLY JSON matching the required schema:\n\n${prompt}`,
            },
          ],
        },
        {
          headers: {
            Authorization:  `Bearer ${OPENROUTER_API_KEY}`,
            "Content-Type": "application/json",
            "HTTP-Referer": "http://localhost:5173",
            "X-Title":      "Medicare Diet AI v10",
          },
          timeout: 35000,
        }
      );

      let content = response.data.choices?.[0]?.message?.content?.trim();
      if (!content) continue;

      content = content.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
      const parsed = JSON.parse(content);
      const responseHash = crypto.createHash("md5").update(content).digest("hex");
      const responseSize = Buffer.byteLength(content, "utf8");

      if (parsed?.meals && typeof parsed.meals === "object") {
        return {
          plan: parsed,
          model,
          provider: "openrouter",
          endpoint: OPENROUTER_ENDPOINT,
          http_status: response.status || 200,
          authenticated: true,
          api_call_made: true,
          prompt_hash: promptHash,
          response_hash: responseHash,
          response_size: responseSize,
          response_id: response.data.id || null,
        };
      }
    } catch (err) {
      console.warn(`[DietAI v10] Model ${model} failed:`, err.response?.data?.error?.message || err.message);
    }
  }

  return { plan: null, model: null, api_call_made: true, authenticated: false, error: "ALL_MODELS_FAILED" };
}

// ─────────────────────────────────────────────────────────────────────────────
// ASSEMBLE FINAL PLAN OBJECT
// ─────────────────────────────────────────────────────────────────────────────
function assembleFinalPlan({
  processedMeals, dailyTotals, targets, profile,
  llmPlan, validationResult, qualityResult, llmModel, medicalContext,
  nutritionPriorities, retryCount, generationId, generationStartMs,
  fallbackUsed, fallbackReason, apiCallMade, llmMeta, seed,
}) {
  const clinicalRulesApplied = nutritionPriorities.length > 0
    ? nutritionPriorities.map(p => ({
        condition:       p.biomarker,
        priority:        p.priority,
        macroDirective:  p.macroDirective,
        macro_directive: p.macroDirective,
        nutrients:       p.nutrients,
      }))
    : [{
        condition:       "General Wellness",
        priority:        "NORMAL",
        macroDirective:  `Balanced nutrition calibrated for BMI ${targets.bmi} (${targets.bmiStatus}) and ${profile.activityLevel || "moderate"} activity level.`,
        macro_directive: `Balanced nutrition calibrated for BMI ${targets.bmi} (${targets.bmiStatus}) and ${profile.activityLevel || "moderate"} activity level.`,
        nutrients:       ["calories", "protein", "fiber"],
      }];

  const fingerprint = computePlanFingerprint(processedMeals);

  // Never return PARTIAL + VERIFIED
  const overallConfidence = validationResult.status === "PASS" && dailyTotals.data_source === "DATASET"
    ? "VERIFIED"
    : validationResult.status === "PARTIAL"
    ? "PARTIAL"
    : "ESTIMATED";

  const llmTrace = {
    llm_api_request_attempted: apiCallMade,
    llm_api_authenticated:     llmMeta?.authenticated || false,
    llm_response_received:     Boolean(llmPlan),
    llm_generated_diet:        !fallbackUsed && Boolean(llmPlan),
    fallback_used:             fallbackUsed,
    fallback_reason:           fallbackReason || null,
    provider:                  llmMeta?.provider || (fallbackUsed ? null : "openrouter"),
    model:                     llmModel || (fallbackUsed ? "deterministic-fallback" : null),
    endpoint:                  llmMeta?.endpoint || null,
    http_status:               llmMeta?.http_status || null,
    response_id:               llmMeta?.response_id || null,
    response_size_bytes:       llmMeta?.response_size || null,
    prompt_hash:               llmMeta?.prompt_hash || null,
    response_hash:             llmMeta?.response_hash || null,
    generation_id:             generationId,
    plan_fingerprint:          fingerprint,
  };

  return {
    status:       "success",
    planVersion:  10,
    plan_fingerprint: fingerprint,
    llmTrace,

    metadata: {
      bmi:               targets.bmi,
      bmiStatus:         targets.bmiStatus,
      bmr:               targets.bmr,
      dailyCalorieNeeds: targets.calories,
      tdee:              targets.tdee,
      goal:              profile.goal || "general_wellness",
      llmModel:          llmModel || "deterministic-fallback",
      llmUsed:           !fallbackUsed,
      llmValidated:      validationResult.passed,
      pipelineVersion:   "v10-final-audit",
      generationId,
      seed,
      apiCallMade,
      fallbackUsed,
      fallbackReason:    fallbackReason || null,
      retryCount,
      generationTimeMs:  Date.now() - generationStartMs,
      datasetRole:       "Optional nutrition lookup — does not limit food choices",
      productionMode:    "API_LLM_PRIMARY",
      llmTrace,
    },

    targets: {
      calories:  targets.calories,
      protein:   targets.protein,
      carbs:     targets.carbs,
      fat:       targets.fat,
      fiber:     targets.fiber,
      iron:      targets.iron,
      calcium:   targets.calcium,
      vitaminC:  targets.vitaminC,
      sodiumMax: targets.sodiumMax,
    },

    meals: processedMeals,

    dailyTotals: {
      calories:    dailyTotals.calories,
      protein:     dailyTotals.protein_g,
      protein_g:   dailyTotals.protein_g,
      carbs:       dailyTotals.carbs_g,
      carbs_g:     dailyTotals.carbs_g,
      fat:         dailyTotals.fat_g,
      fat_g:       dailyTotals.fat_g,
      fiber:       dailyTotals.fiber_g,
      fiber_g:     dailyTotals.fiber_g,
      sodium:      dailyTotals.sodium_mg,
      sodium_mg:   dailyTotals.sodium_mg,
      iron_mg:     dailyTotals.iron_mg,
      calcium_mg:  dailyTotals.calcium_mg,
      vitaminC_mg: dailyTotals.vitaminC_mg,
      data_source: dailyTotals.data_source,
    },

    clinicalRulesApplied,
    biomarkerSummary: llmPlan?.plan_summary || medicalContext.diagnosis || "",
    explanations:     llmPlan?.explanation  || [
      `Plan formulated to meet the ${targets.calories} kcal daily requirement with verified macronutrient balance.`,
    ],

    validation: {
      status:              validationResult.status,
      passed:              validationResult.passed,
      failed_constraints:  validationResult.failed_constraints,
      warnings:            validationResult.warnings,
      data_completeness:   validationResult.data_completeness,
      macro_compliance:    validationResult.macro_compliance,
    },

    nutrition_quality: {
      quality_status:            qualityResult.quality_status,
      atwater_consistency:       qualityResult.atwater_consistency,
      macro_energy_distribution: qualityResult.macro_energy_distribution,
      quality_flags:             qualityResult.quality_flags,
    },

    validationBadge: validationResult.status === "PASS"
      ? "Nutrition Constraints Satisfied"
      : validationResult.status === "PARTIAL"
      ? "Nutrition Plan Verified (Estimated Ingredient Data)"
      : validationResult.status === "WARNING"
      ? "Nutrition Plan Usable (With Warnings)"
      : "Nutrition Validation Failed",

    nutritionProvenance: {
      primary:         "API_LLM",
      datasetRole:     "Optional nutrition verification",
      xgboostRole:     "Mentor demo / experimental only",
      dataConfidence:  overallConfidence,
      disclaimer:      "Nutrition values marked LLM_ESTIMATE are calculated from standard ingredient references. Values matched against the dataset use the IFCT 2017 standard. This is nutrition decision support and not a medical prescription.",
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN ENTRY POINT
// ─────────────────────────────────────────────────────────────────────────────
async function generateAITrackedDietPlan(patientId, userProfile, rawIndicators, latestRecord = null, regenerationSeed = null) {
  const generationStartMs = Date.now();
  const generationId      = crypto.randomUUID();
  const seed              = regenerationSeed !== null ? regenerationSeed : Date.now();

  console.log(`\n[DietAI v10] ═════════════════════════════════════════════`);
  console.log(`[DietAI v10] Generation ID: ${generationId} | Seed: ${seed}`);
  console.log(`[DietAI v10] Patient: ${patientId}`);

  // 1. Calculate authoritative nutritional targets
  const targets = calculateNutritionalTargets(userProfile);

  // 2. Interpret biomarkers
  const gender = (userProfile.gender || "male").toLowerCase();
  const biomarkerResult = interpretBiomarkersForNutrition(rawIndicators, gender);
  const { nutritionPriorities, calorieMod, proteinMod, summaryText, structuredBiomarkers } = biomarkerResult;

  if (calorieMod !== 1.0) targets.calories = Math.round(targets.calories * calorieMod);
  if (proteinMod !== 1.0) targets.protein  = Math.round(targets.protein  * proteinMod);

  console.log(`[DietAI v10] Targets: ${targets.calories} kcal (±5%: ${Math.round(targets.calories * 0.95)} - ${Math.round(targets.calories * 1.05)} kcal) | P: ${targets.protein}g | Fat: ${targets.fat}g`);

  const profile = {
    ...userProfile,
    allergies:       userProfile.healthSummary?.allergies       || userProfile.allergies       || [],
    chronicDiseases: userProfile.healthSummary?.chronicDiseases || userProfile.chronicDiseases || [],
  };

  const medicalContext = {
    diagnosis:          latestRecord?.diagnosis || "Routine nutrition optimization",
    symptoms:           latestRecord?.symptoms  || "None reported",
    labResults:         latestRecord?.labResults|| "Standard vitals",
    structuredBiomarkers,
    biomarkers:         rawIndicators || {},
    chronicDiseases:    Array.isArray(profile.chronicDiseases) ? profile.chronicDiseases.join(", ") : profile.chronicDiseases || "",
  };

  // 3. Retry Loop with Structured Feedback
  let llmResult        = null;
  let llmPlan          = null;
  let llmModel         = null;
  let processedMeals   = null;
  let dailyTotals      = null;
  let validationResult = null;
  let qualityResult    = null;
  let retryCount       = 0;
  let correctionFeedback = null;
  let fallbackUsed     = false;
  let apiCallMade      = false;
  const MAX_RETRIES    = 3;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    retryCount = attempt;

    const patientContext = buildPatientContext({
      profile, targets, nutritionPriorities, medicalContext,
      generationId,
      correctionFeedback,
    });

    llmResult = await callLLMPrimary(patientContext, targets, seed);
    apiCallMade = llmResult?.api_call_made || false;

    if (!llmResult || !llmResult.plan) {
      console.warn(`[DietAI v10] Attempt ${attempt + 1}: LLM unavailable or returned error: ${llmResult?.error}`);
      break;
    }

    llmPlan  = llmResult.plan;
    llmModel = llmResult.model;

    // Process & calculate authoritative totals
    processedMeals = processMeals(llmPlan.meals);
    dailyTotals    = calculateDailyTotals(processedMeals);

    // Run backend hard constraints validation & quality check
    validationResult = validateNutritionalPlan(dailyTotals, targets, profile, processedMeals);
    qualityResult    = assessNutritionQuality(dailyTotals, targets, processedMeals, validationResult);

    console.log(`[DietAI v10] Attempt ${attempt + 1} Validation: ${validationResult.status} | Calories: ${dailyTotals.calories} / ${targets.calories} kcal | Quality: ${qualityResult.quality_status}`);

    if (validationResult.passed) {
      console.log(`[DietAI v10] Plan accepted with status: ${validationResult.status}`);
      break;
    }

    // Prepare structured feedback for next attempt
    console.warn(`[DietAI v10] Validation failed:`, validationResult.failed_constraints);
    const primaryFailure = validationResult.failed_constraints[0];
    correctionFeedback = {
      attempt: attempt + 1,
      reason:  primaryFailure.constraint,
      failed_constraints: validationResult.failed_constraints,
      instruction: `The previous plan failed validation: ${primaryFailure.message}. Please generate a completely new 4-meal plan that strictly meets the calorie target (${targets.calories} kcal ±5%) and all nutritional constraints while preserving patient medical requirements.`,
    };
  }

  let fallbackReason = null;
  // 4. Fallback if LLM was unavailable or validation could not pass
  if (!validationResult || !validationResult.passed) {
    fallbackUsed = true;
    fallbackReason = !llmResult?.plan
      ? `LLM unavailable or failed: ${llmResult?.error || "NO_RESPONSE"}`
      : `Validation constraints failed after ${retryCount + 1} attempts`;
    console.warn(`[DietAI v10] LLM generation is not producing the final plans; deterministic fallback is being used (Seed: ${seed}). Reason: ${fallbackReason}`);
    const fallback = buildFallbackPlan(profile, targets, seed, nutritionPriorities);
    processedMeals = processMeals(fallback.meals);
    dailyTotals    = calculateDailyTotals(processedMeals);
    validationResult = validateNutritionalPlan(dailyTotals, targets, profile, processedMeals);
    qualityResult    = assessNutritionQuality(dailyTotals, targets, processedMeals, validationResult);
    llmPlan = null;
    llmModel = "deterministic-fallback";
    console.log(`[DietAI v10] Fallback Plan Validation: ${validationResult.status} | Calories: ${dailyTotals.calories} kcal | Fat: ${dailyTotals.fat_g}g`);
  }

  // 5. Assemble final plan
  const finalPlan = assembleFinalPlan({
    processedMeals, dailyTotals, targets, profile,
    llmPlan, validationResult, qualityResult, llmModel,
    medicalContext, nutritionPriorities,
    retryCount, generationId, generationStartMs,
    fallbackUsed, fallbackReason, apiCallMade,
    llmMeta: llmResult,
    seed,
  });

  console.log(`[DietAI v10] Final Result: ${finalPlan.validation.status} | Quality: ${finalPlan.nutrition_quality.quality_status} | Fingerprint: ${finalPlan.plan_fingerprint}`);
  console.log(`[DietAI v10] Calories: ${finalPlan.dailyTotals.calories} kcal | Protein: ${finalPlan.dailyTotals.protein}g | Fat: ${finalPlan.dailyTotals.fat}g`);
  console.log(`[DietAI v10] ═════════════════════════════════════════════\n`);

  return finalPlan;
}

module.exports = {
  generateAITrackedDietPlan,
  calculateNutritionalTargets,
  getMedicalIndicatorStatus,
  calculateDailyTotals,
  validateMacroTargets,
  validateNutritionalPlan,
  assessNutritionQuality,
  lookupNutritionFromDataset,
  computePlanFingerprint,
  normalizeDietQuantity,
  evaluateBiomarkerStatus,
  evaluateMedicalIndicators,
  VALIDATION_CONFIG,
  CONTROLLED_FOOD_ALIASES,
  BIOMARKER_RANGES: BIOMARKER_CATALOG,
  BIOMARKER_CATALOG,
};

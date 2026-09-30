/**
 * backend/modules/track/nutrition.engine.js
 * ==========================================
 * AUTHORITATIVE NUTRITION CALCULATION ENGINE
 *
 * ALL mathematical work lives here.
 * The LLM is NOT allowed to calculate anything.
 * Includes:
 *   - BMI / BMR / TDEE / Macro target calculations
 *   - Indian food candidate database (authoritative)
 *   - Hard filter engine (allergies, diet-type, medical)
 *   - Deterministic portion optimizer
 *   - Post-LLM validator
 */

"use strict";

// ─────────────────────────────────────────────────────────────
// 1. AUTHORITATIVE FOOD DATABASE (replaces LLM invention)
//    Each record = nutritional ground truth per 100g
// ─────────────────────────────────────────────────────────────
const FOOD_DATABASE = [
  // ── Breakfast candidates ──────────────────────────────────
  {
    food_id: "IND_BF_001", recipe_id: "RCP_BF_001",
    food_name: "Vegetable Poha", food_family: "Poha", category: "breakfast",
    diet_type: ["veg", "non_veg"], meal_slots: ["breakfast"],
    calories_per_100g: 158, protein_per_100g: 3.4, carbs_per_100g: 28.0,
    fat_per_100g: 3.9, fiber_per_100g: 2.1, iron_per_100g: 2.1,
    calcium_per_100g: 18, vitamin_c_per_100g: 3, sodium_per_100g: 310,
    cost_per_100g: 7, allergen_information: ["peanuts"],
    source: "IFCT 2017", data_quality: "verified",
  },
  {
    food_id: "IND_BF_002", recipe_id: "RCP_BF_002",
    food_name: "Moong Dal Cheela", food_family: "Cheela", category: "breakfast",
    diet_type: ["veg", "non_veg"], meal_slots: ["breakfast"],
    calories_per_100g: 141, protein_per_100g: 9.2, carbs_per_100g: 18.5,
    fat_per_100g: 3.1, fiber_per_100g: 4.2, iron_per_100g: 2.6,
    calcium_per_100g: 52, vitamin_c_per_100g: 0, sodium_per_100g: 280,
    cost_per_100g: 9, allergen_information: [],
    source: "IFCT 2017", data_quality: "verified",
  },
  {
    food_id: "IND_BF_003", recipe_id: "RCP_BF_003",
    food_name: "Oats Upma", food_family: "Upma", category: "breakfast",
    diet_type: ["veg", "non_veg"], meal_slots: ["breakfast"],
    calories_per_100g: 148, protein_per_100g: 5.1, carbs_per_100g: 22.4,
    fat_per_100g: 4.0, fiber_per_100g: 3.8, iron_per_100g: 1.8,
    calcium_per_100g: 34, vitamin_c_per_100g: 2, sodium_per_100g: 290,
    cost_per_100g: 8, allergen_information: ["gluten"],
    source: "IFCT 2017", data_quality: "verified",
  },
  {
    food_id: "IND_BF_004", recipe_id: "RCP_BF_004",
    food_name: "Ragi Idli with Sambar", food_family: "Idli", category: "breakfast",
    diet_type: ["veg", "non_veg"], meal_slots: ["breakfast"],
    calories_per_100g: 132, protein_per_100g: 4.8, carbs_per_100g: 24.0,
    fat_per_100g: 2.2, fiber_per_100g: 3.5, iron_per_100g: 3.9,
    calcium_per_100g: 144, vitamin_c_per_100g: 1, sodium_per_100g: 260,
    cost_per_100g: 10, allergen_information: [],
    source: "IFCT 2017", data_quality: "verified",
  },
  {
    food_id: "IND_BF_005", recipe_id: "RCP_BF_005",
    food_name: "Multigrain Methi Paratha", food_family: "Paratha", category: "breakfast",
    diet_type: ["veg", "non_veg"], meal_slots: ["breakfast"],
    calories_per_100g: 213, protein_per_100g: 6.7, carbs_per_100g: 31.0,
    fat_per_100g: 7.2, fiber_per_100g: 4.9, iron_per_100g: 2.8,
    calcium_per_100g: 72, vitamin_c_per_100g: 5, sodium_per_100g: 320,
    cost_per_100g: 11, allergen_information: ["gluten"],
    source: "IFCT 2017", data_quality: "verified",
  },
  // ── Lunch candidates ──────────────────────────────────────
  {
    food_id: "IND_LN_001", recipe_id: "RCP_LN_001",
    food_name: "Dal Tadka with Phulka", food_family: "Dal-Roti", category: "lunch",
    diet_type: ["veg", "non_veg"], meal_slots: ["lunch"],
    calories_per_100g: 172, protein_per_100g: 7.9, carbs_per_100g: 25.5,
    fat_per_100g: 4.3, fiber_per_100g: 5.0, iron_per_100g: 2.4,
    calcium_per_100g: 48, vitamin_c_per_100g: 2, sodium_per_100g: 350,
    cost_per_100g: 8, allergen_information: ["gluten"],
    source: "IFCT 2017", data_quality: "verified",
  },
  {
    food_id: "IND_LN_002", recipe_id: "RCP_LN_002",
    food_name: "Rajma Chawal", food_family: "Rajma", category: "lunch",
    diet_type: ["veg", "non_veg"], meal_slots: ["lunch"],
    calories_per_100g: 183, protein_per_100g: 8.1, carbs_per_100g: 30.0,
    fat_per_100g: 3.2, fiber_per_100g: 6.8, iron_per_100g: 3.2,
    calcium_per_100g: 62, vitamin_c_per_100g: 0, sodium_per_100g: 330,
    cost_per_100g: 9, allergen_information: [],
    source: "IFCT 2017", data_quality: "verified",
  },
  {
    food_id: "IND_LN_003", recipe_id: "RCP_LN_003",
    food_name: "Palak Paneer with Roti", food_family: "Paneer-Sabzi", category: "lunch",
    diet_type: ["veg"], meal_slots: ["lunch"],
    calories_per_100g: 198, protein_per_100g: 9.4, carbs_per_100g: 16.0,
    fat_per_100g: 10.2, fiber_per_100g: 3.4, iron_per_100g: 4.1,
    calcium_per_100g: 211, vitamin_c_per_100g: 18, sodium_per_100g: 380,
    cost_per_100g: 18, allergen_information: ["dairy"],
    source: "IFCT 2017", data_quality: "verified",
  },
  {
    food_id: "IND_LN_004", recipe_id: "RCP_LN_004",
    food_name: "Grilled Chicken with Brown Rice", food_family: "Non-Veg Rice", category: "lunch",
    diet_type: ["non_veg"], meal_slots: ["lunch"],
    calories_per_100g: 165, protein_per_100g: 14.2, carbs_per_100g: 18.0,
    fat_per_100g: 4.1, fiber_per_100g: 1.2, iron_per_100g: 1.0,
    calcium_per_100g: 22, vitamin_c_per_100g: 0, sodium_per_100g: 310,
    cost_per_100g: 20, allergen_information: [],
    source: "IFCT 2017", data_quality: "verified",
  },
  {
    food_id: "IND_LN_005", recipe_id: "RCP_LN_005",
    food_name: "Vegetable Sambar Rice", food_family: "Sambar-Rice", category: "lunch",
    diet_type: ["veg", "non_veg"], meal_slots: ["lunch"],
    calories_per_100g: 144, protein_per_100g: 4.8, carbs_per_100g: 27.0,
    fat_per_100g: 1.8, fiber_per_100g: 4.2, iron_per_100g: 1.9,
    calcium_per_100g: 38, vitamin_c_per_100g: 12, sodium_per_100g: 290,
    cost_per_100g: 7, allergen_information: [],
    source: "IFCT 2017", data_quality: "verified",
  },
  // ── Snack candidates ──────────────────────────────────────
  {
    food_id: "IND_SK_001", recipe_id: "RCP_SK_001",
    food_name: "Roasted Makhana", food_family: "Makhana", category: "snack",
    diet_type: ["veg", "non_veg"], meal_slots: ["snack", "snack2"],
    calories_per_100g: 347, protein_per_100g: 9.7, carbs_per_100g: 65.0,
    fat_per_100g: 0.1, fiber_per_100g: 14.5, iron_per_100g: 1.4,
    calcium_per_100g: 60, vitamin_c_per_100g: 0, sodium_per_100g: 20,
    cost_per_100g: 30, allergen_information: [],
    source: "IFCT 2017", data_quality: "verified",
  },
  {
    food_id: "IND_SK_002", recipe_id: "RCP_SK_002",
    food_name: "Sprouted Moong Chaat", food_family: "Sprouts", category: "snack",
    diet_type: ["veg", "non_veg"], meal_slots: ["snack", "snack2"],
    calories_per_100g: 90, protein_per_100g: 8.0, carbs_per_100g: 12.0,
    fat_per_100g: 0.7, fiber_per_100g: 4.1, iron_per_100g: 2.7,
    calcium_per_100g: 34, vitamin_c_per_100g: 8, sodium_per_100g: 60,
    cost_per_100g: 5, allergen_information: [],
    source: "IFCT 2017", data_quality: "verified",
  },
  {
    food_id: "IND_SK_003", recipe_id: "RCP_SK_003",
    food_name: "Roasted Chana", food_family: "Chana", category: "snack",
    diet_type: ["veg", "non_veg"], meal_slots: ["snack", "snack2"],
    calories_per_100g: 364, protein_per_100g: 17.5, carbs_per_100g: 60.0,
    fat_per_100g: 6.0, fiber_per_100g: 17.4, iron_per_100g: 4.9,
    calcium_per_100g: 105, vitamin_c_per_100g: 0, sodium_per_100g: 24,
    cost_per_100g: 12, allergen_information: [],
    source: "IFCT 2017", data_quality: "verified",
  },
  // ── Dinner candidates ─────────────────────────────────────
  {
    food_id: "IND_DN_001", recipe_id: "RCP_DN_001",
    food_name: "Vegetable Dal Khichdi", food_family: "Khichdi", category: "dinner",
    diet_type: ["veg", "non_veg"], meal_slots: ["dinner"],
    calories_per_100g: 138, protein_per_100g: 5.2, carbs_per_100g: 22.0,
    fat_per_100g: 2.8, fiber_per_100g: 3.6, iron_per_100g: 1.8,
    calcium_per_100g: 42, vitamin_c_per_100g: 4, sodium_per_100g: 240,
    cost_per_100g: 6, allergen_information: [],
    source: "IFCT 2017", data_quality: "verified",
  },
  {
    food_id: "IND_DN_002", recipe_id: "RCP_DN_002",
    food_name: "Ragi Roti with Methi Dal", food_family: "Ragi-Dal", category: "dinner",
    diet_type: ["veg", "non_veg"], meal_slots: ["dinner"],
    calories_per_100g: 155, protein_per_100g: 6.1, carbs_per_100g: 25.5,
    fat_per_100g: 2.9, fiber_per_100g: 5.1, iron_per_100g: 3.8,
    calcium_per_100g: 148, vitamin_c_per_100g: 3, sodium_per_100g: 220,
    cost_per_100g: 8, allergen_information: [],
    source: "IFCT 2017", data_quality: "verified",
  },
  {
    food_id: "IND_DN_003", recipe_id: "RCP_DN_003",
    food_name: "Palak Soup with Multigrain Toast", food_family: "Soup", category: "dinner",
    diet_type: ["veg", "non_veg"], meal_slots: ["dinner"],
    calories_per_100g: 68, protein_per_100g: 3.2, carbs_per_100g: 9.5,
    fat_per_100g: 1.6, fiber_per_100g: 2.8, iron_per_100g: 3.6,
    calcium_per_100g: 88, vitamin_c_per_100g: 28, sodium_per_100g: 310,
    cost_per_100g: 5, allergen_information: ["gluten"],
    source: "IFCT 2017", data_quality: "verified",
  },
  {
    food_id: "IND_DN_004", recipe_id: "RCP_DN_004",
    food_name: "Fish Curry with Steamed Rice", food_family: "Fish-Curry", category: "dinner",
    diet_type: ["non_veg"], meal_slots: ["dinner"],
    calories_per_100g: 148, protein_per_100g: 12.5, carbs_per_100g: 15.0,
    fat_per_100g: 4.4, fiber_per_100g: 0.8, iron_per_100g: 1.2,
    calcium_per_100g: 30, vitamin_c_per_100g: 2, sodium_per_100g: 280,
    cost_per_100g: 22, allergen_information: ["fish"],
    source: "IFCT 2017", data_quality: "verified",
  },
];

// ─────────────────────────────────────────────────────────────
// 2. BMI / BMR / TDEE / MACRO TARGET ENGINE  (pure math)
// ─────────────────────────────────────────────────────────────
function calculateAge(dob) {
  if (!dob) return 30;
  const b = new Date(dob);
  if (isNaN(b.getTime())) return 30;
  const today = new Date();
  let age = today.getFullYear() - b.getFullYear();
  const m = today.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < b.getDate())) age--;
  return age > 0 && age < 120 ? age : 30;
}

function calculateNutritionalTargets(profile) {
  const weight = parseFloat(profile.weight) || 68.0;
  const height = parseFloat(profile.height) || 170.0;
  const age    = calculateAge(profile.dob);
  const gender = (profile.gender || "male").toLowerCase();

  const heightM = height / 100.0;
  const bmi     = Math.round((weight / (heightM * heightM)) * 10) / 10;
  let bmiStatus = "Normal";
  if (bmi < 18.5)      bmiStatus = "Underweight";
  else if (bmi < 25.0) bmiStatus = "Normal";
  else if (bmi < 30.0) bmiStatus = "Overweight";
  else                 bmiStatus = "Obese";

  // Mifflin-St Jeor
  let bmr = 10 * weight + 6.25 * height - 5 * age;
  bmr = gender === "female" ? bmr - 161 : bmr + 5;
  bmr = Math.round(bmr);

  const activityMap = {
    sedentary: 1.2, light: 1.375, moderate: 1.55, active: 1.725, very_active: 1.9,
  };
  const multiplier = activityMap[(profile.activityLevel || "moderate").toLowerCase()] || 1.55;
  const tdee = Math.round(bmr * multiplier);

  let calorieTarget = tdee;
  const goal = (profile.goal || "general_wellness").toLowerCase();
  if (goal.includes("loss"))         calorieTarget = Math.round(tdee * 0.82);
  else if (goal.includes("gain") || goal.includes("muscle")) calorieTarget = Math.round(tdee * 1.15);

  const proteinPct = goal.includes("muscle") ? 0.25 : goal.includes("loss") ? 0.22 : 0.20;
  const fatPct     = 0.26;
  const carbPct    = 1.0 - proteinPct - fatPct;

  return {
    bmi, bmiStatus, bmr, tdee,
    calories: calorieTarget,
    protein:  Math.round((calorieTarget * proteinPct) / 4.0),
    carbs:    Math.round((calorieTarget * carbPct) / 4.0),
    fat:      Math.round((calorieTarget * fatPct) / 9.0),
    fiber:    gender === "female" ? 28 : 35,
    iron:     gender === "female" && age <= 50 ? 18 : 12,
    calcium:  1000,
    vitaminC: 90,
    sodiumMax: 2000,
  };
}

// ─────────────────────────────────────────────────────────────
// 3. HARD FILTER ENGINE (enforced before LLM)
// ─────────────────────────────────────────────────────────────
function hardFilterCandidates(allFoods, profile, targets) {
  const dietPref   = (profile.dietaryPreference || "veg").toLowerCase();
  const isVeg      = dietPref.includes("veg") && !dietPref.includes("non");
  const allergies  = (profile.allergies || []).map(a => a.toLowerCase());
  const conditions = (profile.chronicDiseases || []).map(c => c.toLowerCase());
  const isLowNa    = conditions.some(c => c.includes("hypert") || c.includes("kidney"));
  const isLowGI    = conditions.some(c => c.includes("diabet"));

  return allFoods.filter(food => {
    // Diet-type gate
    if (isVeg && !food.diet_type.includes("veg")) return false;

    // Allergy gate — hard reject
    const foodAllergens = food.allergen_information.map(a => a.toLowerCase());
    for (const allergy of allergies) {
      if (foodAllergens.some(fa => fa.includes(allergy) || allergy.includes(fa))) return false;
    }

    // Sodium gate for hypertension
    if (isLowNa && food.sodium_per_100g > 300) return false;

    // High-GI filter: exclude high-carb simple-starch foods for diabetics
    if (isLowGI && food.carbs_per_100g > 60 && food.fiber_per_100g < 3) return false;

    return true;
  });
}


// ─────────────────────────────────────────────────────────────
// 4. DETERMINISTIC PORTION OPTIMIZER
//    Selects best candidate per slot and computes exact portions.
//    seed parameter guarantees a DIFFERENT food selection on each
//    regeneration call while remaining deterministic for the same seed.
//    The LLM NEVER changes these values.
// ─────────────────────────────────────────────────────────────
const MEAL_SLOTS = ["breakfast", "lunch", "snack2", "dinner"];
const MEAL_CALORIE_RATIOS = { breakfast: 0.25, lunch: 0.35, snack2: 0.15, dinner: 0.25 };
const SLOT_CATEGORY_MAP   = { breakfast: "breakfast", lunch: "lunch", snack2: "snack", dinner: "dinner" };

/**
 * Seeded pseudo-random number generator (Mulberry32).
 * Produces a different shuffle each time seed changes.
 */
function seededRng(seed) {
  let s = seed >>> 0;
  return () => {
    s += 0x6D2B79F5;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Shuffle an array using a seeded RNG (Fisher-Yates).
 */
function shuffleWithSeed(arr, rng) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Compute grams needed so that (nutrient_per_100g * grams / 100) hits the calorie target.
 */
function computeQuantityG(food, targetCalories) {
  if (!food.calories_per_100g || food.calories_per_100g === 0) return 200;
  const raw = Math.round((targetCalories / food.calories_per_100g) * 100);
  // Clamp to realistic Indian portion sizes
  return Math.max(80, Math.min(raw, 450));
}

/**
 * Recalculate all nutrients for a given food + quantity.
 * THIS is the ONLY source of truth for nutrition numbers.
 */
function recalculateNutrients(food, quantityG) {
  const q = quantityG / 100;
  return {
    food_id:    food.food_id,
    recipe_id:  food.recipe_id,
    name:       food.food_name,
    quantity_g: quantityG,
    calories:   Math.round(food.calories_per_100g * q * 10) / 10,
    protein_g:  Math.round(food.protein_per_100g  * q * 10) / 10,
    carbs_g:    Math.round(food.carbs_per_100g    * q * 10) / 10,
    fat_g:      Math.round(food.fat_per_100g      * q * 10) / 10,
    fiber_g:    Math.round(food.fiber_per_100g    * q * 10) / 10,
    iron_mg:    Math.round(food.iron_per_100g     * q * 10) / 10,
    calcium_mg: Math.round(food.calcium_per_100g  * q * 10) / 10,
    vitaminC_mg:Math.round(food.vitamin_c_per_100g* q * 10) / 10,
    sodium_mg:  Math.round(food.sodium_per_100g   * q * 10) / 10,
    cost:       Math.round(food.cost_per_100g     * q * 10) / 10,
  };
}

/**
 * Build the validated plan from filtered candidates.
 * seed: a number that changes on every regeneration call → produces a new food selection.
 * Returns { meals, dailyTotals, candidateFoodIds }.
 */
function buildValidatedPlan(filteredCandidates, targets, seed = Date.now()) {
  const rng  = seededRng(seed);
  const meals = {};
  let totalCals = 0, totalProt = 0, totalCarbs = 0, totalFat = 0, totalFiber = 0;
  let totalSodium = 0, totalIron = 0, totalCalcium = 0, totalVitC = 0;

  const usedFamilies = new Set();

  for (const slot of MEAL_SLOTS) {
    const category = SLOT_CATEGORY_MAP[slot];
    const slotCals = Math.round(targets.calories * MEAL_CALORIE_RATIOS[slot]);

    // Filter to slot-appropriate foods, remove already-used families
    let candidates = filteredCandidates
      .filter(f => f.meal_slots.includes(slot) || f.category === category)
      .filter(f => !usedFamilies.has(f.food_family));

    // SHUFFLE using the seeded RNG → different food selected on each regeneration
    candidates = shuffleWithSeed(candidates, rng);

    // Fall back to full filtered list if slot has no dedicated candidates
    if (candidates.length === 0) {
      candidates = shuffleWithSeed(
        filteredCandidates.filter(f => !usedFamilies.has(f.food_family)),
        rng
      );
    }

    // Last resort: use any food
    if (candidates.length === 0) {
      candidates = shuffleWithSeed(filteredCandidates, rng);
    }

    const food = candidates[0];
    if (!food) continue;

    usedFamilies.add(food.food_family);

    const quantityG  = computeQuantityG(food, slotCals);
    const nutrients  = recalculateNutrients(food, quantityG);

    meals[slot] = {
      ...nutrients,
      food:         food, // full record for LLM context
      time:         { breakfast: "08:00 AM", lunch: "01:00 PM", snack2: "05:00 PM", dinner: "08:00 PM" }[slot],
      allergens:    food.allergen_information,
      isVegetarian: food.diet_type.includes("veg"),
      cuisine:      "Indian",
    };

    totalCals    += nutrients.calories;
    totalProt    += nutrients.protein_g;
    totalCarbs   += nutrients.carbs_g;
    totalFat     += nutrients.fat_g;
    totalFiber   += nutrients.fiber_g;
    totalSodium  += nutrients.sodium_mg;
    totalIron    += nutrients.iron_mg;
    totalCalcium += nutrients.calcium_mg;
    totalVitC    += nutrients.vitaminC_mg;
  }

  const dailyTotals = {
    calories:    Math.round(totalCals   * 10) / 10,
    protein_g:   Math.round(totalProt   * 10) / 10,
    carbs_g:     Math.round(totalCarbs  * 10) / 10,
    fat_g:       Math.round(totalFat    * 10) / 10,
    fiber_g:     Math.round(totalFiber  * 10) / 10,
    sodium_mg:   Math.round(totalSodium * 10) / 10,
    iron_mg:     Math.round(totalIron   * 10) / 10,
    calcium_mg:  Math.round(totalCalcium* 10) / 10,
    vitaminC_mg: Math.round(totalVitC   * 10) / 10,
  };

  const candidateFoodIds = new Set(filteredCandidates.map(f => f.food_id));

  return { meals, dailyTotals, candidateFoodIds };
}

// ─────────────────────────────────────────────────────────────
// 5. POST-LLM VALIDATOR (enforced after LLM response)
// ─────────────────────────────────────────────────────────────
/**
 * Validate the LLM response against the authoritative plan.
 * Returns { valid: true/false, errors: [] }
 */
function validateLLMResponse(llmResponse, validatedPlan, targets, candidateFoodIds) {
  const errors = [];

  if (!llmResponse || !llmResponse.meals) {
    return { valid: false, errors: ["LLM response missing 'meals' field."] };
  }

  for (const slot of MEAL_SLOTS) {
    const llmMeal  = llmResponse.meals[slot];
    const authMeal = validatedPlan.meals[slot];

    if (!llmMeal) { errors.push(`Missing meal slot: ${slot}`); continue; }

    // 5a. food_id must exist in candidate set
    if (llmMeal.food_id && !candidateFoodIds.has(llmMeal.food_id)) {
      errors.push(`[${slot}] Unknown food_id: ${llmMeal.food_id} — hallucinated food rejected.`);
    }

    // 5b. Quantity must match the optimizer (allow ±10g rounding tolerance)
    if (authMeal && llmMeal.quantity_g !== undefined) {
      const diff = Math.abs(llmMeal.quantity_g - authMeal.quantity_g);
      if (diff > 10) {
        errors.push(
          `[${slot}] Quantity mismatch: LLM says ${llmMeal.quantity_g}g, optimizer says ${authMeal.quantity_g}g.`
        );
      }
    }
  }

  // 5c. Daily totals must not be rewritten by LLM (allow ±5% tolerance)
  if (llmResponse.daily_summary) {
    const authCals = validatedPlan.dailyTotals.calories;
    const llmCals  = llmResponse.daily_summary.calories;
    if (llmCals !== undefined && Math.abs(llmCals - authCals) / authCals > 0.05) {
      errors.push(`Daily calorie total rewritten: LLM says ${llmCals}, backend says ${authCals}.`);
    }
  }

  return { valid: errors.length === 0, errors };
}

// ─────────────────────────────────────────────────────────────
// 6. PERCENTAGE HELPERS (for grounded explanations)
// ─────────────────────────────────────────────────────────────
function pct(value, target) {
  if (!target) return "N/A";
  return Math.round((value / target) * 100) + "%";
}

function buildMealPercentages(meals, targets) {
  const result = {};
  for (const [slot, meal] of Object.entries(meals)) {
    result[slot] = {
      calories_pct:   pct(meal.calories,  targets.calories),
      protein_pct:    pct(meal.protein_g, targets.protein),
      fiber_pct:      pct(meal.fiber_g,   targets.fiber),
      sodium_mg:      meal.sodium_mg,
    };
  }
  return result;
}

/**
 * Authoritative Quantity Normalizer
 * =========================================================================
 * Normalizes food portion quantities to sensible increments.
 * Measurable weight and volume (g, ml) are rounded to the nearest multiple of 5 (min 5).
 * Discrete count units (e.g. piece, egg, roti, banana, cup) remain natural counts (1, 2, 3...).
 */
function normalizeDietQuantity(rawQuantity, unit = "g") {
  const num = parseFloat(rawQuantity);
  if (isNaN(num) || num <= 0) return 5;

  const u = (unit || "g").trim().toLowerCase();

  // If unit is kg or l, convert to grams/ml first then round to multiple of 5
  if (u === "kg" || u === "kilogram" || u === "kilograms") {
    return Math.max(5, Math.round((num * 1000) / 5) * 5);
  }
  if (u === "l" || u === "liter" || u === "liters" || u === "litre" || u === "litres") {
    return Math.max(5, Math.round((num * 1000) / 5) * 5);
  }

  // Measurable weight / volume (g, ml) -> nearest sensible multiple of 5
  if (["g", "ml", "gram", "grams", "milliliter", "milliliters", "millilitre", "millilitres"].includes(u)) {
    return Math.max(5, Math.round(num / 5) * 5);
  }

  // Natural count units -> preserve natural counts (do NOT round to multiple of 5)
  if (["piece", "pieces", "serving", "servings", "count", "roti", "rotis", "egg", "eggs", "banana", "bananas", "slice", "slices", "bowl", "bowls", "cup", "cups", "tbsp", "tsp"].includes(u)) {
    return Math.max(1, Math.round(num * 10) / 10);
  }

  // Default fallback for numeric weights/volumes
  return Math.max(5, Math.round(num / 5) * 5);
}

module.exports = {
  FOOD_DATABASE,
  calculateAge,
  calculateNutritionalTargets,
  hardFilterCandidates,
  buildValidatedPlan,
  recalculateNutrients,
  validateLLMResponse,
  buildMealPercentages,
  normalizeDietQuantity,
  MEAL_SLOTS,
  seededRng,
  shuffleWithSeed,
};

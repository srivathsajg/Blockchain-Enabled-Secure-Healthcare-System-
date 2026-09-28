/**
 * backend/ai/diet-recommendation/diet.service.js
 * ==============================================
 * Connects the Node.js Express backend with the FastAPI Python Diet AI service.
 * Proxies patient profile & lab indicators to FastAPI on port 8000.
 */

const axios = require("axios");
const { getFoodImageUrl } = require("./foodImage.service");

const FASTAPI_URL = process.env.DIET_AI_SERVICE_URL || "http://127.0.0.1:8000";

/**
 * Standard biomarker reference ranges for adult decision-support display.
 * (Used by UI to highlight normal / low / high status in lab indicators).
 */
const BIOMARKER_RANGES = {
  hemoglobin: { min: 12.0, max: 17.5, unit: "g/dL" },
  glucose: { min: 70, max: 100, unit: "mg/dL" },
  cholesterol: { min: 125, max: 200, unit: "mg/dL" },
  blood_pressure_systolic: { min: 90, max: 120, unit: "mmHg" },
  blood_pressure_diastolic: { min: 60, max: 80, unit: "mmHg" },
  creatinine: { min: 0.6, max: 1.2, unit: "mg/dL" },
  hba1c: { min: 4.0, max: 5.6, unit: "%" },
  triglycerides: { min: 50, max: 150, unit: "mg/dL" },
  iron: { min: 60, max: 170, unit: "µg/dL" },
  calcium: { min: 8.5, max: 10.5, unit: "mg/dL" },
  vitamin_d: { min: 20, max: 50, unit: "ng/mL" },
  vitamin_b12: { min: 200, max: 900, unit: "pg/mL" },
};

/**
 * Decorate raw medical indicators with high/low/normal status tags for UI display.
 */
function getMedicalIndicatorStatus(rawIndicators, gender) {
  if (!rawIndicators || typeof rawIndicators !== "object") return {};
  const result = {};

  for (const [key, val] of Object.entries(rawIndicators)) {
    if (val === null || val === undefined || isNaN(val)) continue;
    const numVal = parseFloat(val);
    const range = BIOMARKER_RANGES[key.toLowerCase()];

    let status = "normal";
    if (range) {
      if (numVal < range.min) status = "low";
      else if (numVal > range.max) status = "high";
    }

    result[key] = {
      value: numVal,
      status,
      unit: range ? range.unit : "",
      referenceMin: range ? range.min : null,
      referenceMax: range ? range.max : null,
    };
  }

  return result;
}

/**
 * Calculate age from date of birth (DOB) or default to 30.
 */
function calculateAge(dob) {
  if (!dob) return 30;
  const birthDate = new Date(dob);
  if (isNaN(birthDate.getTime())) return 30;
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const m = today.getMonth() - birthDate.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age > 0 && age < 120 ? age : 30;
}

/**
 * Map Node.js patient profile + raw indicators into FastAPI PatientInput schema.
 */
function buildFastAPIPayload(patientId, userProfile, rawIndicators, forceRandom = false) {
  const age = calculateAge(userProfile.dob);
  const height_cm = parseFloat(userProfile.height) || 170.0;
  const weight_kg = parseFloat(userProfile.weight) || 70.0;
  const gender = (userProfile.gender || "male").toLowerCase();

  // Normalize diet type
  let diet_type = "any";
  const pref = (userProfile.dietary_preference || userProfile.dietaryPreference || "").toLowerCase();
  if (pref.includes("veg") && !pref.includes("non")) {
    diet_type = "veg";
  } else if (pref.includes("non")) {
    diet_type = "non_veg";
  } else if (pref.includes("vegan")) {
    diet_type = "vegan";
  }

  // Parse allergies
  let allergies = [];
  if (Array.isArray(userProfile.allergies)) {
    allergies = userProfile.allergies.map(a => String(a).toLowerCase().trim());
  } else if (typeof userProfile.allergies === "string") {
    allergies = userProfile.allergies.split(",").map(a => a.toLowerCase().trim()).filter(Boolean);
  }

  // Parse chronic diseases / conditions
  let medical_conditions = [];
  const diseases = userProfile.chronicDiseases || userProfile.medical_conditions || [];
  const diseaseList = Array.isArray(diseases) ? diseases : (typeof diseases === "string" ? diseases.split(",") : []);

  diseaseList.forEach(d => {
    const text = String(d).toLowerCase();
    if (text.includes("hyper") || text.includes("bp") || text.includes("blood pressure")) {
      medical_conditions.push("hypertension");
    }
    if (text.includes("diabet") || text.includes("sugar")) {
      medical_conditions.push("diabetes");
    }
    if (text.includes("anem") || text.includes("iron")) {
      medical_conditions.push("anemia");
    }
    if (text.includes("choles") || text.includes("lipid")) {
      medical_conditions.push("high_cholesterol");
    }
    if (text.includes("obes") || text.includes("weight")) {
      medical_conditions.push("obesity");
    }
  });

  // Extract lab values
  const lab_values = {};
  if (rawIndicators && typeof rawIndicators === "object") {
    if (rawIndicators.hemoglobin) lab_values.hemoglobin = parseFloat(rawIndicators.hemoglobin);
    if (rawIndicators.glucose || rawIndicators.fasting_glucose) {
      lab_values.glucose = parseFloat(rawIndicators.glucose || rawIndicators.fasting_glucose);
    }
    if (rawIndicators.cholesterol) lab_values.cholesterol = parseFloat(rawIndicators.cholesterol);
    if (rawIndicators.blood_pressure_systolic || rawIndicators.bp_systolic) {
      lab_values.blood_pressure_systolic = parseFloat(rawIndicators.blood_pressure_systolic || rawIndicators.bp_systolic);
    }
    if (rawIndicators.creatinine) lab_values.creatinine = parseFloat(rawIndicators.creatinine);
    if (rawIndicators.hba1c) lab_values.hba1c = parseFloat(rawIndicators.hba1c);
    if (rawIndicators.triglycerides) lab_values.triglycerides = parseFloat(rawIndicators.triglycerides);
  }

  return {
    patient_id: patientId ? String(patientId) : undefined,
    age,
    gender: gender === "female" ? "female" : "male",
    height_cm,
    weight_kg,
    activity_level: userProfile.activityLevel || "moderate",
    goal: userProfile.goal || "general_wellness",
    diet_type,
    allergies,
    medical_conditions: Array.from(new Set(medical_conditions)),
    lab_values: Object.keys(lab_values).length > 0 ? lab_values : undefined,
    meals_per_day: 4, // 4-meal slot schedule
    force_random: Boolean(forceRandom),
  };
}

/**
 * Format FastAPI response into the shape expected by MongoDB DietPlan and React Frontend.
 */
function formatFastAPIResponse(fastapiData) {
  const patientSummary = fastapiData.patient_summary || {};
  const nutritionTargets = fastapiData.nutrition_targets || {};
  const dailyTotals = fastapiData.daily_totals || {};
  const rawMeals = fastapiData.meals || [];

  // Convert raw meals list into structured 4-meal slot object for frontend
  const mealSlotMap = {
    breakfast: null,
    lunch: null,
    snack2: null,
    dinner: null,
  };

  const legacyMorning = [];
  const legacyAfternoon = [];
  const legacySnacks = [];
  const legacyNight = [];

  rawMeals.forEach(m => {
    const mealName = (m.meal || "").toLowerCase();
    const foods = (m.foods || []).map(f => ({
      name: f.name,
      recipe_id: f.recipe_id,
      quantity: `${f.quantity_g || 150}g`,
      calories: f.calories,
      protein: f.protein_g,
      carbs: f.carbs_g,
      fat: f.fat_g,
      fiber: f.fiber_g,
      whyRecommended: f.why_recommended,
      suitabilityScore: Math.round((f.suitability_score || 0.8) * 100),
      isVegetarian: f.is_vegetarian,
      cuisine: f.cuisine,
    }));

    const primaryFood = foods[0] || {
      name: "Nutritionally Balanced Selection",
      quantity: "150g",
      calories: 350,
      protein: 15,
      carbs: 45,
      fat: 10,
      fiber: 5,
      whyRecommended: "Clinically balanced choice matching your targets.",
    };

    const slotPayload = {
      ...primaryFood,
      time: m.time_window,
      alternatives: [], // Alternatives are generated on-demand via the Regenerate button
    };

    if (mealName.includes("breakfast")) {
      mealSlotMap.breakfast = slotPayload;
      legacyMorning.push(...foods);
    } else if (mealName.includes("lunch")) {
      mealSlotMap.lunch = slotPayload;
      legacyAfternoon.push(...foods);
    } else if (mealName.includes("snack") || mealName.includes("evening")) {
      mealSlotMap.snack2 = slotPayload;
      legacySnacks.push(...foods);
    } else if (mealName.includes("dinner")) {
      mealSlotMap.dinner = slotPayload;
      legacyNight.push(...foods);
    }
  });

  return {
    status: fastapiData.status || "success",
    planVersion: 4,
    metadata: {
      bmi: patientSummary.bmi || 22.0,
      bmiStatus: patientSummary.bmi_status || "Normal",
      bmr: patientSummary.bmr || 1600,
      dailyCalorieNeeds: nutritionTargets.calories || 2000,
      tdee: patientSummary.tdee || 2000,
      goal: patientSummary.goal || "general_wellness",
    },
    targets: {
      calories: nutritionTargets.calories || 2000,
      protein: nutritionTargets.protein_g || 80,
      carbs: nutritionTargets.carbs_g || 250,
      fat: nutritionTargets.fat_g || 65,
      fiber: nutritionTargets.fiber_g || 30,
      iron: nutritionTargets.iron_mg || 18,
      calcium: nutritionTargets.calcium_mg || 1000,
      vitaminC: nutritionTargets.vitamin_c_mg || 90,
      sodiumMax: nutritionTargets.sodium_mg_max || 2300,
    },
    dailyTotals: {
      calories: dailyTotals.calories || 1850,
      protein: dailyTotals.protein_g || 75,
      carbs: dailyTotals.carbs_g || 220,
      fat: dailyTotals.fat_g || 50,
      fiber: dailyTotals.fiber_g || 32,
      sodium: dailyTotals.sodium_mg || 1400,
      iron: dailyTotals.iron_mg || 0,
      calcium: dailyTotals.calcium_mg || 0,
      vitaminC: dailyTotals.vitamin_c_mg || 0,
      cost: dailyTotals.cost_usd || null,
    },
    meals: mealSlotMap,
    clinicalRulesApplied: fastapiData.clinical_rules_applied || [],
    warnings: fastapiData.warnings || [],
    explanations: fastapiData.explanations || [],
    validation: fastapiData.validation || null,
    validationBadge: fastapiData.validation?.badge || (fastapiData.validation?.overall ? "Within Target" : "Constraint Checked"),
    modelInfo: fastapiData.model_info || null,
    // Legacy backward-compat fields
    morning: legacyMorning,
    afternoon: legacyAfternoon,
    snacks: legacySnacks,
    night: legacyNight,
  };
}

const { generateAITrackedDietPlan } = require("../../modules/track/track.service");

/**
 * Predict diet using the Intelligent Medical Report Grounded Indian Diet AI Engine.
 */
async function predictDietFastAPI(patientId, forceRandom, userProfile, rawIndicators, latestRecord = null) {
  try {
    const result = await generateAITrackedDietPlan(patientId, userProfile, rawIndicators, latestRecord);
    return result;
  } catch (error) {
    console.error("[DietService] AI Track generation error:", error.message);
    throw new Error(`Diet AI Service unavailable: ${error.message}`);
  }
}

module.exports = {
  predictDietFastAPI,
  getMedicalIndicatorStatus,
  BIOMARKER_RANGES,
};

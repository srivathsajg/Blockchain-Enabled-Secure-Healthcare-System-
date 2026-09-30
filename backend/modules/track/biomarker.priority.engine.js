/**
 * backend/modules/track/biomarker.priority.engine.js
 * =====================================================
 * BIOMARKER NUTRITION PRIORITY ENGINE
 *
 * Classifies lab findings into structured nutrition decision-support priorities.
 * This is NOT a diagnostic engine.
 * It is a nutrition planning decision-support layer.
 *
 * It converts structured biomarker values → nutrient priorities → food scoring weights.
 *
 * IMPORTANT:
 *  - Evaluates values against biological reference intervals using biomarker.evaluator
 *  - Never defaults to "normal" when reference range is missing/ambiguous (returns "unknown")
 *  - Never diagnoses medical conditions (decision support only)
 *  - Always recommends clinician review for critical flags
 */

"use strict";

const {
  BIOMARKER_CATALOG,
  evaluateBiomarkerStatus,
  evaluateMedicalIndicators,
} = require("./biomarker.evaluator");

// ── NUTRITION DECISION-SUPPORT RULES ─────────────────────────────────────────
// Maps biomarker finding → nutrient priorities
//
// ── PROTEIN ADJUSTMENT HEURISTIC DOCUMENTATION ────────────────
// Rule: proteinMod = 1.10 for "Hemoglobin:low"
// - Origin: Project nutrition decision-support heuristic (+10% dietary protein emphasis).
// - Purpose: Recommends additional protein intake to provide amino acid substrate
//   for globin synthesis and supportive cellular recovery in patients with flagged low hemoglobin.
// - Configurability: Configured directly in NUTRITION_PRIORITY_RULES["Hemoglobin:low"].proteinMod.
// - Clinical Note: This is an evidence-informed nutritional decision-support parameter,
//   NOT a medical diagnosis of anemia and NOT a clinical prescription.
// ─────────────────────────────────────────────────────────────
const NUTRITION_PRIORITY_RULES = {
  // ── Hematology & Iron Deficiencies ─────────────────────────────────────────
  "Hemoglobin:low": {
    priority: "HIGH",
    nutrients: ["iron", "protein", "vitamin_c", "folate", "vitamin_b12"],
    foodPreferences: ["spinach", "moringa", "lentils", "beans", "dates", "jaggery", "beets", "pomegranate", "meat", "eggs", "liver"],
    foodAvoidance:   ["tea", "coffee", "calcium_supplements_with_iron"],
    dietNote: "Laboratory report contains a low hemoglobin value. The meal plan emphasizes foods contributing iron, protein, vitamin C, and B-vitamins. This is nutrition decision support and not a diagnosis. Clinician review is advisable.",
    calorieMod: 0,
    proteinMod: 1.10, // Project Heuristic: +10% protein target for supportive nutrition
  },
  "Hemoglobin:high": {
    priority: "MODERATE",
    nutrients: ["hydration"],
    foodPreferences: ["water_rich_vegetables", "fruits"],
    dietNote: "Elevated hemoglobin noted. Adequate hydration is emphasized.",
    calorieMod: 0, proteinMod: 1.0,
  },
  "RBC Count:low": {
    priority: "HIGH",
    nutrients: ["iron", "folate", "vitamin_b12", "protein"],
    foodPreferences: ["spinach", "lentils", "moringa", "pomegranate", "beans", "dates", "curd"],
    dietNote: "Lower RBC count observed in laboratory report. Nutrient-dense foods supporting erythropoiesis (iron, folate, B12, and quality protein) are emphasized.",
    calorieMod: 0, proteinMod: 1.0,
  },
  "PCV:low": {
    priority: "HIGH",
    nutrients: ["iron", "hydration", "protein"],
    foodPreferences: ["leafy_greens", "sprouts", "lentils", "pomegranate", "water_rich_vegetables"],
    dietNote: "Low PCV (hematocrit) noted in laboratory panel. Iron-rich foods, adequate hydration, and balanced proteins are prioritized.",
    calorieMod: 0, proteinMod: 1.0,
  },
  "MCV:low": {
    priority: "MODERATE",
    nutrients: ["iron", "vitamin_c"],
    foodPreferences: ["spinach", "lentils", "dates", "pomegranate", "amla", "citrus_fruits"],
    dietNote: "Microcytic red cell indices noted (low MCV). Dietary iron paired with vitamin C sources is prioritized for bioavailability.",
    calorieMod: 0, proteinMod: 1.0,
  },
  "MCH:low": {
    priority: "MODERATE",
    nutrients: ["iron", "vitamin_b12"],
    foodPreferences: ["moringa", "lentils", "sesame_seeds", "sprouts", "dairy"],
    dietNote: "Low mean corpuscular hemoglobin noted. Iron and B-vitamin cofactors prioritized.",
    calorieMod: 0, proteinMod: 1.0,
  },
  "RDW:high": {
    priority: "MODERATE",
    nutrients: ["iron", "folate", "vitamin_b12"],
    foodPreferences: ["dark_leafy_greens", "legumes", "sprouts", "nuts", "curd"],
    dietNote: "Elevated red cell distribution width (anisocytosis). Nutrient-dense whole foods supporting balanced hematopoiesis are included.",
    calorieMod: 0, proteinMod: 1.0,
  },
  "Ferritin:low": {
    priority: "HIGH",
    nutrients: ["iron", "vitamin_c"],
    foodPreferences: ["meat", "spinach", "lentils", "pomegranate", "dates", "sesame", "moringa"],
    dietNote: "Low ferritin value in report. Foods rich in iron and vitamin C for absorption are prioritized.",
    calorieMod: 0, proteinMod: 1.0,
  },
  "Vitamin B12:low": {
    priority: "HIGH",
    nutrients: ["vitamin_b12", "protein"],
    foodPreferences: ["eggs", "dairy", "meat", "fish", "paneer", "curd", "fortified_foods"],
    dietNote: "Low vitamin B12 in report. B12-rich foods are prioritized in the meal plan.",
    calorieMod: 0, proteinMod: 1.0,
  },
  "Folate:low": {
    priority: "HIGH",
    nutrients: ["folate", "vitamin_b12"],
    foodPreferences: ["leafy_greens", "broccoli", "legumes", "sprouts", "papaya", "nuts"],
    dietNote: "Folate level is below the biological reference interval. Natural dietary folate sources such as green vegetables and pulses are highlighted.",
    calorieMod: 0, proteinMod: 1.0,
  },

  // ── Diabetes & Glycemic Control ─────────────────────────────────────────────
  "Blood Sugar (F):high": {
    priority: "CRITICAL",
    nutrients: ["fiber", "low_glycemic_carbs"],
    foodPreferences: ["whole_grains", "vegetables", "legumes", "low_gi_foods", "bitter_gourd", "fenugreek"],
    foodAvoidance:   ["refined_sugar", "white_rice", "maida", "sugary_drinks", "sweets"],
    dietNote: "Elevated fasting blood sugar in report. Low glycemic index foods, high fiber, and zero added sugars are prioritized. Clinician review is advisable.",
    calorieMod: -0.05, proteinMod: 1.0,
  },
  "HbA1c:high": {
    priority: "CRITICAL",
    nutrients: ["fiber", "low_glycemic_carbs", "chromium"],
    foodPreferences: ["oats", "barley", "dal", "vegetables", "cinnamon"],
    foodAvoidance:   ["sugars", "maida", "white_bread", "processed_foods"],
    dietNote: "Elevated HbA1c in report. Long-term glycemic control prioritized through diet. Clinician review is advisable.",
    calorieMod: -0.05, proteinMod: 1.0,
  },

  // ── Lipid Profile ───────────────────────────────────────────────────────────
  "Total Cholesterol:high": {
    priority: "HIGH",
    nutrients: ["soluble_fiber", "omega3"],
    foodPreferences: ["oats", "flaxseed", "walnuts", "vegetables", "fruits", "legumes"],
    foodAvoidance:   ["fried_foods", "ghee_excess", "processed_meats"],
    dietNote: "Elevated total cholesterol in report. Soluble fiber and unsaturated fat foods are prioritized.",
    calorieMod: 0, proteinMod: 1.0,
  },
  "LDL Cholesterol:high": {
    priority: "HIGH",
    nutrients: ["fiber", "low_saturated_fat"],
    foodPreferences: ["beans", "oats", "vegetables", "soy", "olive_oil"],
    foodAvoidance:   ["trans_fat", "saturated_fat", "red_meat_excess"],
    dietNote: "Elevated LDL cholesterol in report. Low saturated fat diet with high fiber emphasized.",
    calorieMod: 0, proteinMod: 1.0,
  },
  "HDL Cholesterol:low": {
    priority: "MODERATE",
    nutrients: ["healthy_fats", "omega3"],
    foodPreferences: ["avocado", "nuts", "seeds", "fish", "olive_oil"],
    dietNote: "Low HDL cholesterol noted. Healthy unsaturated fats are prioritized.",
    calorieMod: 0, proteinMod: 1.0,
  },
  "Triglycerides:high": {
    priority: "HIGH",
    nutrients: ["omega3", "low_refined_carbs"],
    foodPreferences: ["fish", "flaxseed", "walnuts"],
    foodAvoidance:   ["refined_carbs", "alcohol", "sugary_foods"],
    dietNote: "Elevated triglycerides in report. Omega-3 rich foods and reduced refined carbohydrates emphasized.",
    calorieMod: -0.05, proteinMod: 1.0,
  },

  // ── Kidney & Liver Functions ────────────────────────────────────────────────
  "Serum Creatinine:high": {
    priority: "HIGH",
    nutrients: ["controlled_protein", "low_potassium", "low_phosphorus"],
    foodPreferences: ["white_rice", "apple", "cabbage", "turnip"],
    foodAvoidance:   ["high_protein_excess", "high_potassium_foods", "nuts_excess", "dairy_excess"],
    dietNote: "Elevated creatinine in report. Protein intake is moderated to support renal function. Clinician review is strongly advisable.",
    calorieMod: 0, proteinMod: 0.80,
  },
  "SGOT (AST):high": {
    priority: "HIGH",
    nutrients: ["antioxidants", "controlled_fat"],
    foodPreferences: ["turmeric", "garlic", "green_vegetables", "fruits"],
    foodAvoidance:   ["alcohol", "fried_foods", "processed_foods"],
    dietNote: "Elevated AST in report. Antioxidant-rich, low-fat diet is prioritized. Clinician review is advisable.",
    calorieMod: 0, proteinMod: 1.0,
  },
  "SGPT (ALT):high": {
    priority: "HIGH",
    nutrients: ["antioxidants", "controlled_fat"],
    foodPreferences: ["turmeric", "garlic", "green_vegetables", "fruits"],
    foodAvoidance:   ["alcohol", "fried_foods", "processed_foods"],
    dietNote: "Elevated ALT in report. Antioxidant-rich, low-fat diet is prioritized. Clinician review is advisable.",
    calorieMod: 0, proteinMod: 1.0,
  },
  "Albumin:low": {
    priority: "HIGH",
    nutrients: ["protein"],
    foodPreferences: ["eggs", "dal", "paneer", "soy", "meat", "fish", "legumes"],
    dietNote: "Low albumin in report. Protein-dense foods are prioritized in all meals.",
    calorieMod: 0.05, proteinMod: 1.20,
  },
  "Sodium:low": {
    priority: "MODERATE",
    nutrients: ["sodium"],
    dietNote: "Low sodium noted. Moderate salt intake is supported in the plan.",
    calorieMod: 0, proteinMod: 1.0,
  },
  "Potassium:low": {
    priority: "MODERATE",
    nutrients: ["potassium"],
    foodPreferences: ["banana", "potato", "spinach", "beans", "coconut_water"],
    dietNote: "Low potassium noted. Potassium-rich foods are included.",
    calorieMod: 0, proteinMod: 1.0,
  },
};

/**
 * Classify a biomarker status. Never defaults to "normal".
 * Missing reference range -> "unknown".
 */
function classifyBiomarkerStatus(name, value, gender = "default") {
  const evaluated = evaluateBiomarkerStatus({
    name,
    value,
    gender,
  });
  return evaluated.status;
}

/**
 * Parses raw or structured indicators into evaluated nutrition priorities
 */
function interpretBiomarkersForNutrition(rawIndicators, gender = "default") {
  const structuredBiomarkers = {};
  const nutritionPriorities = [];

  let calorieMod = 1.0;
  let proteinMod = 1.0;
  let hasCritical = false;
  let hasHigh = false;

  for (const [name, rawItem] of Object.entries(rawIndicators || {})) {
    if (rawItem === null || rawItem === undefined) continue;

    let evaluated;
    if (typeof rawItem === "object" && rawItem !== null && ("calculatedStatus" in rawItem || "value" in rawItem)) {
      evaluated = evaluateBiomarkerStatus({
        name,
        value: rawItem.value,
        unit: rawItem.unit,
        referenceLow: rawItem.referenceLow ?? rawItem.referenceMin,
        referenceHigh: rawItem.referenceHigh ?? rawItem.referenceMax,
        referenceOperator: rawItem.referenceOperator,
        referenceText: rawItem.referenceText,
        sourcePrintedStatus: rawItem.sourcePrintedStatus,
        gender,
        source: rawItem.source || "uploaded_lab_report",
      });
    } else {
      const numVal = parseFloat(rawItem);
      if (isNaN(numVal)) continue;
      evaluated = evaluateBiomarkerStatus({
        name,
        value: numVal,
        gender,
        source: "uploaded_lab_report",
      });
    }

    structuredBiomarkers[name] = evaluated;

    const statusNorm = (evaluated.status || evaluated.calculatedStatus || "").toLowerCase();
    const ruleKey = `${name}:${statusNorm}`;
    const rule = NUTRITION_PRIORITY_RULES[ruleKey];

    if (rule && statusNorm !== "normal" && statusNorm !== "unknown") {
      nutritionPriorities.push({
        biomarker: name,
        value: evaluated.value,
        status: evaluated.status,
        calculatedStatus: evaluated.calculatedStatus,
        priority: rule.priority,
        condition: name,
        macroDirective: rule.dietNote,
        nutrients: rule.nutrients,
        foodPreferences: rule.foodPreferences || [],
        foodAvoidance: rule.foodAvoidance || [],
      });

      calorieMod *= (1.0 + (rule.calorieMod || 0));
      proteinMod *= (rule.proteinMod || 1.0);

      if (rule.priority === "CRITICAL") hasCritical = true;
      if (rule.priority === "HIGH") hasHigh = true;
    }
  }

  const PRIORITY_ORDER = { CRITICAL: 0, HIGH: 1, MODERATE: 2, NORMAL: 3 };
  nutritionPriorities.sort((a, b) =>
    (PRIORITY_ORDER[a.priority] ?? 9) - (PRIORITY_ORDER[b.priority] ?? 9)
  );

  const findings = nutritionPriorities.map(p =>
    `  • ${p.biomarker} = ${p.value} (${p.calculatedStatus || p.status.toUpperCase()}) [${p.priority} PRIORITY]: ${p.macroDirective}`
  );

  const summaryText = findings.length > 0
    ? `BIOMARKER FINDINGS FROM LABORATORY REPORT:\n${findings.join("\n")}`
    : "No clinically flagged biomarker values detected. General wellness nutrition targets applied.";

  return {
    structuredBiomarkers,
    nutritionPriorities,
    calorieMod: Math.round(calorieMod * 100) / 100,
    proteinMod: Math.round(proteinMod * 100) / 100,
    hasCritical,
    hasHigh,
    summaryText,
  };
}

module.exports = {
  interpretBiomarkersForNutrition,
  classifyBiomarkerStatus,
  evaluateBiomarkerStatus,
  evaluateMedicalIndicators,
  BIOMARKER_REFERENCE_RANGES: BIOMARKER_CATALOG,
  NUTRITION_PRIORITY_RULES,
};

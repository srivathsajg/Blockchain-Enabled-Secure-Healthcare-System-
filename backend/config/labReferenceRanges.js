/**
 * backend/config/labReferenceRanges.js
 * =========================================================================
 * 50-COMPONENT FALLBACK LABORATORY REFERENCE REGISTRY
 *
 * IMPORTANT:
 * These are FALLBACK values only.
 * They must NEVER override a valid reference interval extracted from
 * the uploaded laboratory report using OCR.
 *
 * Priority Order:
 * 1. OCR extracted reference range from the uploaded report.
 * 2. Fallback reference range from this 50-component registry.
 * 3. If neither exists -> UNKNOWN (NEVER assume NORMAL).
 */

"use strict";

const LAB_FALLBACK_REGISTRY = [
  // ── CBC / HEMATOLOGY (1 - 15) ─────────────────────────────────────────────
  {
    id: 1,
    testName: "Hemoglobin",
    unit: "g/dL",
    low: 12.0,
    high: 17.5,
    aliases: ["Hb", "HGB", "Haemoglobin", "Hemoglobin"],
  },
  {
    id: 2,
    testName: "RBC Count",
    unit: "million/µL",
    low: 4.0,
    high: 5.5,
    aliases: ["RBC", "RBC Count", "Red Blood Cell Count", "Erythrocyte Count", "Total RBC"],
  },
  {
    id: 3,
    testName: "Hematocrit / PCV",
    unit: "%",
    low: 36,
    high: 46,
    aliases: ["PCV", "HCT", "Hematocrit", "Packed Cell Volume", "Hematocrit / PCV"],
  },
  {
    id: 4,
    testName: "WBC Count",
    unit: "thousand/µL",
    low: 4.0,
    high: 11.0,
    aliases: ["WBC", "TLC", "Total Leukocyte Count", "White Blood Cell Count", "WBC Count", "Total WBC"],
  },
  {
    id: 5,
    testName: "Platelet Count",
    unit: "thousand/µL",
    low: 150,
    high: 450,
    aliases: ["Platelets", "PLT", "Platelet Count", "Total Platelets"],
  },
  {
    id: 6,
    testName: "MCV",
    unit: "fL",
    low: 80,
    high: 100,
    aliases: ["MCV", "Mean Corpuscular Volume"],
  },
  {
    id: 7,
    testName: "MCH",
    unit: "pg",
    low: 27,
    high: 33,
    aliases: ["MCH", "Mean Corpuscular Hemoglobin"],
  },
  {
    id: 8,
    testName: "MCHC",
    unit: "g/dL",
    low: 32,
    high: 36,
    aliases: ["MCHC", "Mean Corpuscular Hemoglobin Concentration"],
  },
  {
    id: 9,
    testName: "RDW",
    unit: "%",
    low: 11.5,
    high: 14.5,
    aliases: ["RDW", "RDW-CV", "RDW-SD", "Red Cell Distribution Width"],
  },
  {
    id: 10,
    testName: "Neutrophils",
    unit: "%",
    low: 40,
    high: 70,
    aliases: ["Neutrophils", "Neut%", "Neutrophil Percentage"],
  },
  {
    id: 11,
    testName: "Lymphocytes",
    unit: "%",
    low: 20,
    high: 40,
    aliases: ["Lymphocytes", "Lymph%", "Lymphocyte Percentage"],
  },
  {
    id: 12,
    testName: "Monocytes",
    unit: "%",
    low: 2,
    high: 8,
    aliases: ["Monocytes", "Mono%", "Monocyte Percentage"],
  },
  {
    id: 13,
    testName: "Eosinophils",
    unit: "%",
    low: 1,
    high: 6,
    aliases: ["Eosinophils", "Eos%", "Eosinophil Percentage"],
  },
  {
    id: 14,
    testName: "Basophils",
    unit: "%",
    low: 0,
    high: 2,
    aliases: ["Basophils", "Baso%", "Basophil Percentage"],
  },
  {
    id: 15,
    testName: "ESR",
    unit: "mm/hr",
    low: 0,
    high: 20,
    aliases: ["ESR", "ESR Blood", "Erythrocyte Sedimentation Rate"],
  },

  // ── IRON / VITAMINS (16 - 22) ─────────────────────────────────────────────
  {
    id: 16,
    testName: "Ferritin",
    unit: "ng/mL",
    low: 13,
    high: 150,
    aliases: ["Ferritin", "Serum Ferritin", "Feritin"],
  },
  {
    id: 17,
    testName: "Serum Iron",
    unit: "µg/dL",
    low: 50,
    high: 170,
    aliases: ["Iron", "Serum Iron", "Iron Serum"],
  },
  {
    id: 18,
    testName: "TIBC",
    unit: "µg/dL",
    low: 240,
    high: 450,
    aliases: ["TIBC", "Total Iron Binding Capacity"],
  },
  {
    id: 19,
    testName: "Transferrin Saturation",
    unit: "%",
    low: 20,
    high: 50,
    aliases: ["Transferrin Saturation", "TSAT", "Iron Saturation"],
  },
  {
    id: 20,
    testName: "Vitamin B12",
    unit: "pg/mL",
    low: 200,
    high: 900,
    aliases: ["B12", "Vitamin B12", "Cobalamin", "Vit B12", "Vitamin B-12"],
  },
  {
    id: 21,
    testName: "Folate",
    unit: "ng/mL",
    low: 2.7,
    high: 17.0,
    aliases: ["Folate", "Serum Folate", "Vitamin B9", "Folic Acid"],
  },
  {
    id: 22,
    testName: "Vitamin D",
    unit: "ng/mL",
    low: 30,
    high: 100,
    aliases: ["Vitamin D", "25-OH Vitamin D", "25 Hydroxy Vitamin D", "25(OH)D", "Vit D"],
  },

  // ── ELECTROLYTES / MINERALS (23 - 29) ─────────────────────────────────────
  {
    id: 23,
    testName: "Sodium",
    unit: "mmol/L",
    low: 136,
    high: 144,
    aliases: ["Sodium", "Na", "Serum Sodium", "Na+"],
  },
  {
    id: 24,
    testName: "Potassium",
    unit: "mmol/L",
    low: 3.7,
    high: 5.2,
    aliases: ["Potassium", "K", "Serum Potassium", "K+"],
  },
  {
    id: 25,
    testName: "Chloride",
    unit: "mmol/L",
    low: 96,
    high: 106,
    aliases: ["Chloride", "Cl", "Serum Chloride", "Cl-"],
  },
  {
    id: 26,
    testName: "CO2 / Bicarbonate",
    unit: "mmol/L",
    low: 23,
    high: 29,
    aliases: ["CO2", "Carbon Dioxide", "Bicarbonate", "HCO3", "CO2 / Bicarbonate"],
  },
  {
    id: 27,
    testName: "Calcium",
    unit: "mg/dL",
    low: 8.5,
    high: 10.2,
    aliases: ["Calcium", "Ca", "Serum Calcium", "Ca++"],
  },
  {
    id: 28,
    testName: "Magnesium",
    unit: "mg/dL",
    low: 1.7,
    high: 2.2,
    aliases: ["Magnesium", "Mg", "Serum Magnesium"],
  },
  {
    id: 29,
    testName: "Phosphorus",
    unit: "mg/dL",
    low: 2.5,
    high: 4.5,
    aliases: ["Phosphorus", "Phosphate", "Serum Phosphorus", "Serum Phosphate"],
  },

  // ── GLUCOSE / DIABETES (30 - 31) ──────────────────────────────────────────
  {
    id: 30,
    testName: "Fasting Glucose",
    unit: "mg/dL",
    low: 70,
    high: 99,
    aliases: ["Fasting Glucose", "FBS", "Fasting Blood Sugar", "FPG", "Fasting Plasma Glucose", "Blood Sugar (F)"],
  },
  {
    id: 31,
    testName: "HbA1c",
    unit: "%",
    low: 4.0,
    high: 5.6,
    aliases: ["HbA1c", "A1C", "Glycated Hemoglobin", "Glycosylated Hemoglobin"],
  },

  // ── RENAL FUNCTION (32 - 35) ──────────────────────────────────────────────
  {
    id: 32,
    testName: "BUN",
    unit: "mg/dL",
    low: 7,
    high: 20,
    aliases: ["BUN", "Blood Urea Nitrogen", "Blood Urea", "Urea"],
  },
  {
    id: 33,
    testName: "Creatinine",
    unit: "mg/dL",
    low: 0.6,
    high: 1.2,
    aliases: ["Creatinine", "Serum Creatinine", "Creat"],
  },
  {
    id: 34,
    testName: "Uric Acid",
    unit: "mg/dL",
    low: 3.5,
    high: 7.2,
    aliases: ["Uric Acid", "Serum Uric Acid", "Urate"],
  },
  {
    id: 35,
    testName: "eGFR",
    unit: "mL/min/1.73m²",
    rule: "GREATER_THAN_OR_EQUAL",
    threshold: 60,
    aliases: ["eGFR", "GFR", "Estimated GFR", "Estimated Glomerular Filtration Rate"],
    referenceText: ">= 60 mL/min/1.73m²",
  },

  // ── LIVER FUNCTION (36 - 43) ──────────────────────────────────────────────
  {
    id: 36,
    testName: "AST",
    unit: "U/L",
    low: 10,
    high: 40,
    aliases: ["AST", "SGOT", "Aspartate Aminotransferase", "SGOT (AST)"],
  },
  {
    id: 37,
    testName: "ALT",
    unit: "U/L",
    low: 7,
    high: 56,
    aliases: ["ALT", "SGPT", "Alanine Aminotransferase", "SGPT (ALT)"],
  },
  {
    id: 38,
    testName: "ALP",
    unit: "U/L",
    low: 44,
    high: 147,
    aliases: ["ALP", "ALKP", "Alkaline Phosphatase"],
  },
  {
    id: 39,
    testName: "GGT",
    unit: "U/L",
    low: 9,
    high: 48,
    aliases: ["GGT", "Gamma GT", "Gamma Glutamyl Transferase"],
  },
  {
    id: 40,
    testName: "Total Bilirubin",
    unit: "mg/dL",
    low: 0.1,
    high: 1.2,
    aliases: ["Total Bilirubin", "Bilirubin Total", "TBili"],
  },
  {
    id: 41,
    testName: "Direct Bilirubin",
    unit: "mg/dL",
    low: 0.0,
    high: 0.3,
    aliases: ["Direct Bilirubin", "Conjugated Bilirubin", "DBili"],
  },
  {
    id: 42,
    testName: "Albumin",
    unit: "g/dL",
    low: 3.5,
    high: 5.0,
    aliases: ["Albumin", "Serum Albumin"],
  },
  {
    id: 43,
    testName: "Total Protein",
    unit: "g/dL",
    low: 6.5,
    high: 8.1,
    aliases: ["Total Protein", "Protein Total", "Serum Total Protein"],
  },

  // ── LIPID PROFILE (44 - 47) ───────────────────────────────────────────────
  {
    id: 44,
    testName: "Total Cholesterol",
    unit: "mg/dL",
    rule: "LESS_THAN",
    threshold: 200,
    aliases: ["Total Cholesterol", "Cholesterol", "TC", "Cholesterol - Total"],
    referenceText: "< 200 mg/dL",
  },
  {
    id: 45,
    testName: "LDL Cholesterol",
    unit: "mg/dL",
    rule: "LESS_THAN",
    threshold: 100,
    aliases: ["LDL", "LDL-C", "Low Density Lipoprotein", "LDL Cholesterol"],
    referenceText: "< 100 mg/dL",
  },
  {
    id: 46,
    testName: "HDL Cholesterol",
    unit: "mg/dL",
    low: 40,
    high: 60,
    aliases: ["HDL", "HDL-C", "High Density Lipoprotein", "HDL Cholesterol"],
  },
  {
    id: 47,
    testName: "Triglycerides",
    unit: "mg/dL",
    rule: "LESS_THAN",
    threshold: 150,
    aliases: ["Triglycerides", "TG", "Triglyceride"],
    referenceText: "< 150 mg/dL",
  },

  // ── THYROID (48 - 49) ─────────────────────────────────────────────────────
  {
    id: 48,
    testName: "TSH",
    unit: "mIU/L",
    low: 0.4,
    high: 4.0,
    aliases: ["TSH", "Thyroid Stimulating Hormone", "Thyrotropin"],
  },
  {
    id: 49,
    testName: "Free T4",
    unit: "ng/dL",
    low: 0.8,
    high: 1.8,
    aliases: ["Free T4", "FT4", "Free Thyroxine", "fT4"],
  },

  // ── INFLAMMATION (50) ─────────────────────────────────────────────────────
  {
    id: 50,
    testName: "CRP",
    unit: "mg/L",
    rule: "LESS_THAN",
    threshold: 10,
    aliases: ["CRP", "C Reactive Protein", "C-Reactive Protein", "C Reactive Protein Quantitative"],
    referenceText: "< 10 mg/L",
  },
];

/**
 * Normalizes component name for alias lookup
 */
function normalizeName(str) {
  if (!str || typeof str !== "string") return "";
  return str.trim().toLowerCase().replace(/[\s\-_/()]+/g, "");
}

// Precompute alias map for fast O(1) canonical matching
const ALIAS_LOOKUP_MAP = new Map();

for (const entry of LAB_FALLBACK_REGISTRY) {
  const normCanonical = normalizeName(entry.testName);
  ALIAS_LOOKUP_MAP.set(normCanonical, entry);

  if (Array.isArray(entry.aliases)) {
    for (const alias of entry.aliases) {
      const normAlias = normalizeName(alias);
      if (normAlias) {
        ALIAS_LOOKUP_MAP.set(normAlias, entry);
      }
    }
  }
}

/**
 * Finds fallback entry for a given test name
 * @param {string} testName
 * @returns {Object|null}
 */
function findFallbackRange(testName) {
  if (!testName || typeof testName !== "string") return null;
  const norm = normalizeName(testName);
  return ALIAS_LOOKUP_MAP.get(norm) || null;
}

module.exports = {
  LAB_FALLBACK_REGISTRY,
  findFallbackRange,
};

/**
 * backend/tests/test_biomarker_status_evaluator.js
 * =========================================================================
 * Comprehensive test suite for Biomarker Status Classification & Reference Intervals.
 *
 * Verifies:
 * 1. Low boundary test (8.1 against 13–20 -> LOW)
 * 2. Normal range test (15 against 13–20 -> NORMAL)
 * 3. High boundary test (22 against 13–20 -> HIGH)
 * 4. RBC count test (3.01 against 4.5–5.5 -> LOW)
 * 5. MCV test (81.7 against 83.0–101.0 -> LOW)
 * 6. Ferritin test (5 against 15–304 -> LOW)
 * 7. Vitamin B12 test (79 against 211–911 -> LOW)
 * 8. Missing reference range -> UNKNOWN (NEVER defaults to NORMAL)
 * 9. Invalid reference range -> UNKNOWN
 * 10. Discrepancy override: source printed HIGH but numeric comparison says LOW -> calculatedStatus = LOW
 * 11. One-sided inequality (> 3.1, < 100)
 * 12. Full demo report OCR extraction & evaluation
 */

const assert = require("assert");
const {
  evaluateBiomarkerStatus,
  evaluateMedicalIndicators,
  BIOMARKER_CATALOG,
} = require("../modules/track/biomarker.evaluator");
const {
  interpretBiomarkersForNutrition,
  classifyBiomarkerStatus,
} = require("../modules/track/biomarker.priority.engine");

console.log("===============================================================================");
console.log("BIOMARKER STATUS EVALUATION & REFERENCE RANGE TEST SUITE");
console.log("===============================================================================\n");

// ── TEST 1: 8.1 against 13–20 -> LOW ───────────────────────────────────────
console.log("--- TEST 1: Hemoglobin 8.1 against 13–20 g/dL ---");
const t1 = evaluateBiomarkerStatus({
  name: "Hemoglobin",
  value: 8.1,
  unit: "g/dL",
  referenceLow: 13.0,
  referenceHigh: 20.0,
});
assert.strictEqual(t1.calculatedStatus, "LOW");
assert.strictEqual(t1.status, "low");
console.log(`  ✔ Result: ${t1.value} ${t1.unit} [13.0 - 20.0] -> ${t1.calculatedStatus}`);

// ── TEST 2: 15 against 13–20 -> NORMAL ────────────────────────────────────
console.log("\n--- TEST 2: Hemoglobin 15 against 13–20 g/dL ---");
const t2 = evaluateBiomarkerStatus({
  name: "Hemoglobin",
  value: 15.0,
  unit: "g/dL",
  referenceLow: 13.0,
  referenceHigh: 20.0,
});
assert.strictEqual(t2.calculatedStatus, "NORMAL");
assert.strictEqual(t2.status, "normal");
console.log(`  ✔ Result: ${t2.value} ${t2.unit} [13.0 - 20.0] -> ${t2.calculatedStatus}`);

// ── TEST 3: 22 against 13–20 -> HIGH ──────────────────────────────────────
console.log("\n--- TEST 3: Hemoglobin 22 against 13–20 g/dL ---");
const t3 = evaluateBiomarkerStatus({
  name: "Hemoglobin",
  value: 22.0,
  unit: "g/dL",
  referenceLow: 13.0,
  referenceHigh: 20.0,
});
assert.strictEqual(t3.calculatedStatus, "HIGH");
assert.strictEqual(t3.status, "high");
console.log(`  ✔ Result: ${t3.value} ${t3.unit} [13.0 - 20.0] -> ${t3.calculatedStatus}`);

// ── TEST 4: RBC Count 3.01 against 4.5–5.5 -> LOW ─────────────────────────
console.log("\n--- TEST 4: RBC Count 3.01 against 4.5–5.5 million/µL ---");
const t4 = evaluateBiomarkerStatus({
  name: "RBC Count",
  value: 3.01,
  unit: "million/µL",
  referenceLow: 4.5,
  referenceHigh: 5.5,
});
assert.strictEqual(t4.calculatedStatus, "LOW");
console.log(`  ✔ Result: ${t4.value} ${t4.unit} [4.5 - 5.5] -> ${t4.calculatedStatus}`);

// ── TEST 5: MCV 81.7 against 83.0–101.0 -> LOW ────────────────────────────
console.log("\n--- TEST 5: MCV 81.7 against 83.0–101.0 fL ---");
const t5 = evaluateBiomarkerStatus({
  name: "MCV",
  value: 81.7,
  unit: "fL",
  referenceLow: 83.0,
  referenceHigh: 101.0,
});
assert.strictEqual(t5.calculatedStatus, "LOW");
console.log(`  ✔ Result: ${t5.value} ${t5.unit} [83.0 - 101.0] -> ${t5.calculatedStatus}`);

// ── TEST 6: Ferritin 5 against 15–304 -> LOW ──────────────────────────────
console.log("\n--- TEST 6: Ferritin 5 against 15–304 ng/mL ---");
const t6 = evaluateBiomarkerStatus({
  name: "Ferritin",
  value: 5,
  unit: "ng/mL",
  referenceLow: 15,
  referenceHigh: 304,
});
assert.strictEqual(t6.calculatedStatus, "LOW");
console.log(`  ✔ Result: ${t6.value} ${t6.unit} [15 - 304] -> ${t6.calculatedStatus}`);

// ── TEST 7: Vitamin B12 79 against 211–911 -> LOW ─────────────────────────
console.log("\n--- TEST 7: Vitamin B12 79 against 211–911 pg/mL ---");
const t7 = evaluateBiomarkerStatus({
  name: "Vitamin B12",
  value: 79,
  unit: "pg/mL",
  referenceLow: 211,
  referenceHigh: 911,
});
assert.strictEqual(t7.calculatedStatus, "LOW");
console.log(`  ✔ Result: ${t7.value} ${t7.unit} [211 - 911] -> ${t7.calculatedStatus}`);

// ── TEST 8: Missing Reference Range -> UNKNOWN (Never NORMAL) ──────────────
console.log("\n--- TEST 8: Missing Reference Range -> UNKNOWN ---");
const t8 = evaluateBiomarkerStatus({
  name: "CustomUnlistedEnzyme",
  value: 42.5,
  unit: "U/L",
  referenceLow: null,
  referenceHigh: null,
});
assert.strictEqual(t8.calculatedStatus, "UNKNOWN", "Missing reference range must be UNKNOWN, not NORMAL!");
assert.strictEqual(t8.status, "unknown");
console.log(`  ✔ Result: Unlisted biomarker without reference range -> ${t8.calculatedStatus}`);

// ── TEST 9: Invalid Reference Range -> UNKNOWN ────────────────────────────
console.log("\n--- TEST 9: Invalid Reference Range -> UNKNOWN ---");
const t9 = evaluateBiomarkerStatus({
  name: "UnknownProtein",
  value: 12.0,
  unit: "g/L",
  referenceLow: "invalid_string",
  referenceHigh: undefined,
});
assert.strictEqual(t9.calculatedStatus, "UNKNOWN", "Invalid range must be UNKNOWN, not NORMAL!");
console.log(`  ✔ Result: Invalid reference range -> ${t9.calculatedStatus}`);

// ── TEST 10: Printed Status HIGH vs Calculated LOW ────────────────────────
console.log("\n--- TEST 10: Discrepancy Override (Printed HIGH, Calculated LOW) ---");
const t10 = evaluateBiomarkerStatus({
  name: "Hemoglobin",
  value: 8.1,
  unit: "g/dL",
  referenceLow: 13.0,
  referenceHigh: 17.5,
  sourcePrintedStatus: "HIGH", // OCR misread
});
assert.strictEqual(t10.calculatedStatus, "LOW", "Calculated status must be LOW despite printed HIGH!");
assert.strictEqual(t10.sourcePrintedStatus, "HIGH");
console.log(`  ✔ Result: Printed="${t10.sourcePrintedStatus}", Calculated="${t10.calculatedStatus}" -> Overridden to LOW`);

// ── TEST 11: One-Sided Reference Range (> 3.1) ─────────────────────────────
console.log("\n--- TEST 11: One-sided Reference Range (> 3.1 ng/mL) ---");
const t11a = evaluateBiomarkerStatus({
  name: "Folate",
  value: 2.7,
  unit: "ng/mL",
  referenceLow: 3.1,
  referenceOperator: ">=",
});
assert.strictEqual(t11a.calculatedStatus, "LOW");
console.log(`  ✔ Folate 2.7 (> 3.1) -> ${t11a.calculatedStatus}`);

const t11b = evaluateBiomarkerStatus({
  name: "Folate",
  value: 4.5,
  unit: "ng/mL",
  referenceLow: 3.1,
  referenceOperator: ">=",
});
assert.strictEqual(t11b.calculatedStatus, "NORMAL");
console.log(`  ✔ Folate 4.5 (> 3.1) -> ${t11b.calculatedStatus}`);

// ── TEST 12: Full Demo Report Evaluation ───────────────────────────────────
console.log("\n--- TEST 12: Full Demo Patient Lab Panel ---");
const demoRaw = {
  "Hemoglobin": 8.1,
  "RBC Count": 3.01,
  "PCV": 24.6,
  "MCV": 81.7,
  "MCH": 26.9,
  "MCHC": 32.0,
  "RDW": 18.3,
  "Ferritin": 5,
  "Vitamin B12": 79,
  "Folate": { value: 2.7, referenceText: "> 3.1 ng/mL", referenceRule: "GREATER_THAN_OR_EQUAL", referenceThreshold: 3.1 },
};

const evaluatedPanel = evaluateMedicalIndicators(demoRaw, "female");
const priorities = interpretBiomarkersForNutrition(evaluatedPanel, "female");

console.log("\nEvaluated Panel Summary:");
for (const [key, item] of Object.entries(evaluatedPanel)) {
  console.log(`  • ${key.padEnd(18)}: ${String(item.value).padEnd(6)} ${item.unit.padEnd(10)} [Ref: ${item.referenceText.padEnd(20)}] -> ${item.calculatedStatus}`);
}

assert.strictEqual(evaluatedPanel["Hemoglobin"].calculatedStatus, "LOW");
assert.strictEqual(evaluatedPanel["RBC Count"].calculatedStatus, "LOW");
assert.strictEqual(evaluatedPanel["PCV"].calculatedStatus, "LOW");
assert.strictEqual(evaluatedPanel["MCV"].calculatedStatus, "NORMAL"); // 81.7 against 80-100 fallback is NORMAL
assert.strictEqual(evaluatedPanel["MCH"].calculatedStatus, "LOW");
assert.strictEqual(evaluatedPanel["MCHC"].calculatedStatus, "NORMAL");
assert.strictEqual(evaluatedPanel["RDW"].calculatedStatus, "HIGH");
assert.strictEqual(evaluatedPanel["Ferritin"].calculatedStatus, "LOW");
assert.strictEqual(evaluatedPanel["Vitamin B12"].calculatedStatus, "LOW");
assert.strictEqual(evaluatedPanel["Folate"].calculatedStatus, "LOW");

console.log("\nNutrition Priorities Generated:");
for (const p of priorities.nutritionPriorities) {
  console.log(`  [${p.priority}] ${p.biomarker} (${p.status.toUpperCase()}): ${p.macroDirective}`);
}
assert.ok(priorities.nutritionPriorities.length >= 4, "Should have active nutrition directives for flagged markers");
assert.strictEqual(priorities.proteinMod, 1.10, "Protein modifier for low hemoglobin should be 1.10");

console.log("\n===============================================================================");
console.log("ALL 12 BIOMARKER STATUS TESTS PASSED (100% SUCCESS)");
console.log("===============================================================================");

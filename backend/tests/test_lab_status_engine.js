/**
 * backend/tests/test_lab_status_engine.js
 * =========================================================================
 * Verification Test Suite for Simple Lab Value Status Engine
 *
 * Verifies:
 * Test 1:  value = 8.1, range = 12–17.5 -> LOW
 * Test 2:  value = 15, range = 12–17.5 -> NORMAL
 * Test 3:  value = 19, range = 12–17.5 -> HIGH
 * Test 4:  value = 81.7, range = 80–100 -> NORMAL
 * Test 5:  value = 18.3, range = 11.5–14.5 -> HIGH
 * Test 6:  value = 5, range = 13–150 -> LOW
 * Test 7:  missing OCR range, fallback exists -> use fallback
 * Test 8:  missing OCR range, no fallback exists -> UNKNOWN
 * Test 9:  range = <200, value = 150 -> NORMAL
 * Test 10: range = <200, value = 250 -> HIGH
 */

const assert = require("assert");
const {
  calculateLabStatus,
  calculateThresholdStatus,
  parseOcrReferenceRange,
  evaluateComponent,
  evaluateLabComponents,
} = require("../modules/track/labStatusEngine");
const { LAB_FALLBACK_REGISTRY, findFallbackRange } = require("../config/labReferenceRanges");

console.log("===============================================================================");
console.log("SIMPLE LAB VALUE STATUS ENGINE TEST SUITE (10 REQUIRED TESTS)");
console.log("===============================================================================\n");

// ── TEST 1: value = 8.1, range = 12–17.5 -> LOW ────────────────────────────
console.log("--- TEST 1: Hemoglobin 8.1 against 12–17.5 ---");
const t1Status = calculateLabStatus(8.1, 12, 17.5);
assert.strictEqual(t1Status, "LOW");
console.log(`  ✔ calculateLabStatus(8.1, 12, 17.5) = ${t1Status}`);

// ── TEST 2: value = 15, range = 12–17.5 -> NORMAL ──────────────────────────
console.log("\n--- TEST 2: Hemoglobin 15 against 12–17.5 ---");
const t2Status = calculateLabStatus(15, 12, 17.5);
assert.strictEqual(t2Status, "NORMAL");
console.log(`  ✔ calculateLabStatus(15, 12, 17.5) = ${t2Status}`);

// ── TEST 3: value = 19, range = 12–17.5 -> HIGH ────────────────────────────
console.log("\n--- TEST 3: Hemoglobin 19 against 12–17.5 ---");
const t3Status = calculateLabStatus(19, 12, 17.5);
assert.strictEqual(t3Status, "HIGH");
console.log(`  ✔ calculateLabStatus(19, 12, 17.5) = ${t3Status}`);

// ── TEST 4: value = 81.7, range = 80–100 -> NORMAL ─────────────────────────
console.log("\n--- TEST 4: MCV 81.7 against 80–100 ---");
const t4Status = calculateLabStatus(81.7, 80, 100);
assert.strictEqual(t4Status, "NORMAL");
console.log(`  ✔ calculateLabStatus(81.7, 80, 100) = ${t4Status}`);

// ── TEST 5: value = 18.3, range = 11.5–14.5 -> HIGH ────────────────────────
console.log("\n--- TEST 5: RDW 18.3 against 11.5–14.5 ---");
const t5Status = calculateLabStatus(18.3, 11.5, 14.5);
assert.strictEqual(t5Status, "HIGH");
console.log(`  ✔ calculateLabStatus(18.3, 11.5, 14.5) = ${t5Status}`);

// ── TEST 6: value = 5, range = 13–150 -> LOW ───────────────────────────────
console.log("\n--- TEST 6: Ferritin 5 against 13–150 ---");
const t6Status = calculateLabStatus(5, 13, 150);
assert.strictEqual(t6Status, "LOW");
console.log(`  ✔ calculateLabStatus(5, 13, 150) = ${t6Status}`);

// ── TEST 7: Missing OCR range, fallback exists -> use fallback ──────────────
console.log("\n--- TEST 7: Missing OCR range, fallback exists ---");
const t7 = evaluateComponent({
  testName: "Serum Iron",
  value: 40,
  unit: "µg/dL",
  referenceText: null, // No OCR reference
});
assert.strictEqual(t7.referenceSource, "FALLBACK_REGISTRY");
assert.strictEqual(t7.referenceLow, 50);
assert.strictEqual(t7.referenceHigh, 170);
assert.strictEqual(t7.status, "LOW");
console.log(`  ✔ ${t7.testName} (${t7.value} ${t7.unit}) -> Ref: [${t7.referenceLow}–${t7.referenceHigh}] (Source: ${t7.referenceSource}) -> ${t7.status}`);

// ── TEST 8: Missing OCR range, no fallback exists -> UNKNOWN ────────────────
console.log("\n--- TEST 8: Missing OCR range, no fallback exists ---");
const t8 = evaluateComponent({
  testName: "NovelExperimentalEnzyme",
  value: 42.5,
  unit: "U/L",
  referenceText: null,
});
assert.strictEqual(t8.referenceSource, "UNAVAILABLE");
assert.strictEqual(t8.referenceLow, null);
assert.strictEqual(t8.referenceHigh, null);
assert.strictEqual(t8.status, "UNKNOWN", "Missing range without fallback MUST be UNKNOWN!");
console.log(`  ✔ ${t8.testName} -> Ref: Not specified (Source: ${t8.referenceSource}) -> ${t8.status}`);

// ── TEST 9: range = <200, value = 150 -> NORMAL ────────────────────────────
console.log("\n--- TEST 9: One-sided range < 200, value = 150 ---");
const t9Status = calculateThresholdStatus(150, "LESS_THAN", 200);
assert.strictEqual(t9Status, "NORMAL");
const t9Comp = evaluateComponent({
  testName: "Total Cholesterol",
  value: 150,
  unit: "mg/dL",
  referenceText: "< 200",
});
assert.strictEqual(t9Comp.status, "NORMAL");
console.log(`  ✔ calculateThresholdStatus(150, "LESS_THAN", 200) = ${t9Status}`);

// ── TEST 10: range = <200, value = 250 -> HIGH ─────────────────────────────
console.log("\n--- TEST 10: One-sided range < 200, value = 250 ---");
const t10Status = calculateThresholdStatus(250, "LESS_THAN", 200);
assert.strictEqual(t10Status, "HIGH");
const t10Comp = evaluateComponent({
  testName: "Total Cholesterol",
  value: 250,
  unit: "mg/dL",
  referenceText: "< 200",
});
assert.strictEqual(t10Comp.status, "HIGH");
console.log(`  ✔ calculateThresholdStatus(250, "LESS_THAN", 200) = ${t10Status}`);

// ── ADDITIONAL VERIFICATION: OCR Range Priority over Fallback ───────────────
console.log("\n--- BONUS CHECK: OCR Range Priority over Fallback ---");
const tReportPriority = evaluateComponent({
  testName: "Hemoglobin",
  value: 8.1,
  unit: "g/dL",
  referenceText: "12–17.5", // Uploaded report's own range
});
assert.strictEqual(tReportPriority.referenceSource, "OCR_REPORT");
assert.strictEqual(tReportPriority.referenceLow, 12);
assert.strictEqual(tReportPriority.referenceHigh, 17.5);
assert.strictEqual(tReportPriority.status, "LOW");
console.log(`  ✔ Hemoglobin used OCR_REPORT range [12 - 17.5] -> ${tReportPriority.status}`);

// ── REGISTRY COMPLETENESS: 50 components check ──────────────────────────────
console.log("\n--- 50-COMPONENT REGISTRY AUDIT ---");
assert.strictEqual(LAB_FALLBACK_REGISTRY.length, 50, "Registry must contain exactly 50 components");
console.log(`  ✔ Registry count verified: ${LAB_FALLBACK_REGISTRY.length} components.`);

console.log("\n===============================================================================");
console.log("ALL 10 LAB STATUS ENGINE TESTS PASSED (100% SUCCESS)");
console.log("===============================================================================");

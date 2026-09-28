process.on("unhandledRejection", (e) => { console.error("Unhandled:", e.message); process.exit(1); });
const emergencyServicePath = (() => {
  try { return require.resolve("../backend/modules/emergency/service"); }
  catch (e) { return require.resolve("./backend/modules/emergency/service"); }
})();
const { isValidStatusTransition, assertValidStatusTransition, VALID_TRANSITIONS, VALID_TRANSITIONS_DOCTOR } = require(emergencyServicePath);

let passed = 0;
let failed = 0;
function test(name, fn) {
  try {
    fn();
    console.log("  ✓", name);
    passed++;
  } catch (e) {
    console.log("  ✗", name, "—", e.message);
    failed++;
  }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || "assertion failed"); }
function assertThrows(fn, match, msg) {
  let threw = false;
  let err;
  try { fn(); } catch (e) { threw = true; err = e; }
  if (!threw) throw new Error(msg || "Expected to throw");
  if (match && !(new RegExp(match, "i").test(err.message))) {
    throw new Error(`Expected error matching /${match}/, got: ${err.message}`);
  }
}

console.log("\n= VALID_TRANSITIONS_DOCTOR strict shape =");
const DOCTOR_KEYS = Object.keys(VALID_TRANSITIONS_DOCTOR).sort();
test("DOCTOR transitions keys contain exactly REPORTED, UNDER_TREATMENT, CLOSED, CANCELLED", () => {
  assert(
    DOCTOR_KEYS.length === 4 &&
    DOCTOR_KEYS.includes("REPORTED") &&
    DOCTOR_KEYS.includes("UNDER_TREATMENT") &&
    DOCTOR_KEYS.includes("CLOSED") &&
    DOCTOR_KEYS.includes("CANCELLED"),
    "keys were: " + DOCTOR_KEYS.join(", ")
  );
});
test("REPORTED DOCTOR → UNDER_TREATMENT allowed", () => assert(isValidStatusTransition("REPORTED","UNDER_TREATMENT","DOCTOR_EMERGENCY")));
test("REPORTED DOCTOR → CANCELLED allowed", () => assert(isValidStatusTransition("REPORTED","CANCELLED","DOCTOR_EMERGENCY")));
test("REPORTED DOCTOR → HOSPITAL_PREPARED REJECTED (was allowed before fix)", () => assert(!isValidStatusTransition("REPORTED","HOSPITAL_PREPARED","DOCTOR_EMERGENCY")));
test("REPORTED DOCTOR → AMBULANCE_REQUESTED REJECTED", () => assert(!isValidStatusTransition("REPORTED","AMBULANCE_REQUESTED","DOCTOR_EMERGENCY")));
test("REPORTED DOCTOR → ARRIVED_AT_HOSPITAL REJECTED", () => assert(!isValidStatusTransition("REPORTED","ARRIVED_AT_HOSPITAL","DOCTOR_EMERGENCY")));
test("REPORTED DOCTOR → CLOSED REJECTED (must go through UNDER_TREATMENT)", () => assert(!isValidStatusTransition("REPORTED","CLOSED","DOCTOR_EMERGENCY")));
test("UNDER_TREATMENT DOCTOR → CLOSED allowed", () => assert(isValidStatusTransition("UNDER_TREATMENT","CLOSED","DOCTOR_EMERGENCY")));
test("UNDER_TREATMENT DOCTOR → ARRIVED_AT_HOSPITAL REJECTED (ambulance stage, not for doctor)", () => assert(!isValidStatusTransition("UNDER_TREATMENT","ARRIVED_AT_HOSPITAL","DOCTOR_EMERGENCY")));
test("UNDER_TREATMENT DOCTOR → REPORTED REJECTED (no rollback)", () => assert(!isValidStatusTransition("UNDER_TREATMENT","REPORTED","DOCTOR_EMERGENCY")));
test("CLOSED DOCTOR → REPORTED REJECTED (terminal non-identity blocked)", () => assert(!isValidStatusTransition("CLOSED","REPORTED","DOCTOR_EMERGENCY")));
test("CLOSED DOCTOR → CLOSED allowed (identity no-op; no-op identity transition is acceptable per isValidStatusTransition design)", () => assert(isValidStatusTransition("CLOSED","CLOSED","DOCTOR_EMERGENCY")));
test("AMBULANCE-only status as fromStatus on DOCTOR_EMERGENCY returns false (no such key)", () => assert(!isValidStatusTransition("HOSPITAL_PREPARED","UNDER_TREATMENT","DOCTOR_EMERGENCY")));

console.log("\n= DOCTOR assertValidStatusTransition gates =");
test("assert REPORTED→UNDER_TREATMENT DOCTOR passes", () => assertValidStatusTransition("REPORTED","UNDER_TREATMENT","DOCTOR_EMERGENCY"));
test("assert REPORTED→CLOSED DOCTOR throws Illegal status transition", () => assertThrows(() => assertValidStatusTransition("REPORTED","CLOSED","DOCTOR_EMERGENCY"), "Illegal status transition"));
test("assert CLOSED terminal DOCTOR throws", () => assertThrows(() => assertValidStatusTransition("CLOSED","REPORTED","DOCTOR_EMERGENCY"), "terminal"));

console.log("\n= Ambulance regression (VALID_TRANSITIONS intact) =");
test("REPORTED AMB → AMBULANCE_REQUESTED allowed", () => assert(isValidStatusTransition("REPORTED","AMBULANCE_REQUESTED","AMBULANCE_EMERGENCY")));
test("AMBULANCE_ASSIGNED AMB → AMBULANCE_ARRIVED allowed", () => assert(isValidStatusTransition("AMBULANCE_ASSIGNED","AMBULANCE_ARRIVED","AMBULANCE_EMERGENCY")));
test("ARRIVED_AT_HOSPITAL AMB → UNDER_TREATMENT allowed", () => assert(isValidStatusTransition("ARRIVED_AT_HOSPITAL","UNDER_TREATMENT","AMBULANCE_EMERGENCY")));
test("AMB VALID_TRANSITIONS still has full ambulance keys", () => {
  const amb = Object.keys(VALID_TRANSITIONS).sort();
  const required = ["REPORTED","AMBULANCE_REQUESTED","AMBULANCE_ASSIGNED","AMBULANCE_ARRIVED","PATIENT_IDENTIFIED","IN_TRANSIT","HOSPITAL_PREPARED","ARRIVED_AT_HOSPITAL","UNDER_TREATMENT","CLOSED","CANCELLED"];
  assert(required.every(k => amb.includes(k)), "missing ambulance keys. Have: " + amb.join(", "));
});

console.log("\n= Same-status identity allowed =");
test("REPORTED DOCTOR → REPORTED allowed", () => assert(isValidStatusTransition("REPORTED","REPORTED","DOCTOR_EMERGENCY")));
test("UNDER_TREATMENT AMB → UNDER_TREATMENT allowed", () => assert(isValidStatusTransition("UNDER_TREATMENT","UNDER_TREATMENT","AMBULANCE_EMERGENCY")));

console.log("\n---------------------------------------");
console.log(`Results: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);

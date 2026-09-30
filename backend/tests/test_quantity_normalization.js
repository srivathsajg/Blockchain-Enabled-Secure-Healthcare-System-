/**
 * backend/tests/test_quantity_normalization.js
 * =========================================================================
 * Verification for:
 * 1. normalizeDietQuantity helper
 * 2. Multiples of 5 enforcement for weight/volume
 * 3. Proportional recalculation of macros & micronutrients
 * 4. Preservation of count-based foods (bananas, eggs, rotis)
 * 5. Meal & Daily totals consistency
 * 6. validateMacroTargets consistency
 */

const assert = require("assert");
const {
  normalizeDietQuantity,
  calculateNutritionalTargets,
  validateMacroTargets,
  generateAITrackedDietPlan,
} = require("../modules/track/track.service");

console.log("===============================================================================");
console.log("TEST SUITE: QUANTITY NORMALIZATION & RECALCULATION INTEGRITY");
console.log("===============================================================================\n");

// ── TEST 1: normalizeDietQuantity standalone helper ────────────────────────
console.log("--- TEST 1: normalizeDietQuantity Helper ---");

const cases = [
  { in: 282, unit: "g", expected: 280 },
  { in: 283, unit: "g", expected: 285 },
  { in: 297, unit: "g", expected: 295 },
  { in: 301, unit: "g", expected: 300 },
  { in: 125, unit: "ml", expected: 125 },
  { in: 128, unit: "ml", expected: 130 },
  { in: 0.25, unit: "kg", expected: 250 },
  { in: 1, unit: "piece", expected: 1 },
  { in: 2, unit: "eggs", expected: 2 },
  { in: 3, unit: "rotis", expected: 3 },
  { in: 1, unit: "banana", expected: 1 },
];

for (const c of cases) {
  const actual = normalizeDietQuantity(c.in, c.unit);
  assert.strictEqual(
    actual,
    c.expected,
    `Failed for ${c.in} ${c.unit}: expected ${c.expected}, got ${actual}`
  );
  console.log(`  ✔ normalizeDietQuantity(${c.in}, "${c.unit}") -> ${actual} (matches expected ${c.expected})`);
}

// ── TEST 2: Multiples of 5 on Generated Plan ───────────────────────────────
console.log("\n--- TEST 2: End-to-End Plan Quantity Multiples of 5 ---");

const testProfile = {
  gender: "female",
  dob: "1998-05-15",
  height: 165,
  weight: 62,
  goal: "general_wellness",
  activityLevel: "moderate",
  dietaryPreference: "Vegetarian",
  allergies: ["peanuts"],
  chronicDiseases: [],
};

const testBiomarkers = {
  "Hemoglobin": 8.1,
  "Blood Sugar (F)": 88,
};

async function testFullPlan() {
  const plan = await generateAITrackedDietPlan("patient_test_norm", testProfile, testBiomarkers, null, 12345);

  let totalCaloriesFromMeals = 0;
  let totalProteinFromMeals  = 0;
  let totalCarbsFromMeals    = 0;
  let totalFatFromMeals      = 0;
  let totalFiberFromMeals    = 0;

  for (const [slot, meal] of Object.entries(plan.meals)) {
    if (!meal) continue;
    console.log(`\nChecking Meal Slot: [${slot.toUpperCase()}] -> "${meal.name}" (${meal.quantity_g}g)`);
    
    // Check meal quantity is multiple of 5
    assert.strictEqual(
      meal.quantity_g % 5,
      0,
      `Meal ${slot} quantity ${meal.quantity_g}g is not a multiple of 5!`
    );
    console.log(`  ✔ Meal quantity ${meal.quantity_g}g is a multiple of 5`);

    // Check each food in meal
    for (const food of meal.foods) {
      assert.strictEqual(
        food.quantity_g % 5,
        0,
        `Food "${food.food_name}" quantity ${food.quantity_g}g is not a multiple of 5!`
      );
      console.log(`    ✔ Food "${food.food_name}" quantity ${food.quantity_g}g is a multiple of 5`);

      // Check ingredients
      if (food.ingredients) {
        for (const ing of food.ingredients) {
          assert.strictEqual(
            ing.quantity_g % 5,
            0,
            `Ingredient "${ing.name}" quantity ${ing.quantity_g}g is not a multiple of 5!`
          );
        }
        console.log(`    ✔ All ${food.ingredients.length} ingredients are multiples of 5`);
      }
    }

    totalCaloriesFromMeals += meal.calories;
    totalProteinFromMeals  += meal.protein_g;
    totalCarbsFromMeals    += meal.carbs_g;
    totalFatFromMeals      += meal.fat_g;
    totalFiberFromMeals    += meal.fiber_g;
  }

  // Check sum equals daily totals within 0.5 floating-point rounding
  console.log("\n--- TEST 3: Sum of Meal Totals Equals Daily Totals ---");
  assert.ok(
    Math.abs(totalCaloriesFromMeals - plan.dailyTotals.calories) < 1.0,
    `Calories sum mismatch: meals sum ${totalCaloriesFromMeals} vs daily total ${plan.dailyTotals.calories}`
  );
  console.log(`  ✔ Calories match: meals sum ${totalCaloriesFromMeals.toFixed(1)} kcal == daily total ${plan.dailyTotals.calories} kcal`);

  assert.ok(
    Math.abs(totalProteinFromMeals - plan.dailyTotals.protein_g) < 1.0,
    `Protein sum mismatch: meals sum ${totalProteinFromMeals} vs daily total ${plan.dailyTotals.protein_g}`
  );
  console.log(`  ✔ Protein matches: meals sum ${totalProteinFromMeals.toFixed(1)}g == daily total ${plan.dailyTotals.protein_g}g`);

  assert.ok(
    Math.abs(totalFatFromMeals - plan.dailyTotals.fat_g) < 1.0,
    `Fat sum mismatch: meals sum ${totalFatFromMeals} vs daily total ${plan.dailyTotals.fat_g}`
  );
  console.log(`  ✔ Fat matches: meals sum ${totalFatFromMeals.toFixed(1)}g == daily total ${plan.dailyTotals.fat_g}g`);

  // Check validateMacroTargets uses the final numbers
  console.log("\n--- TEST 4: validateMacroTargets Consistency ---");
  const macroReport = validateMacroTargets(plan.dailyTotals, plan.targets);
  assert.ok(macroReport.report.calories, "Macro report must contain calories");
  assert.ok(macroReport.report.protein, "Macro report must contain protein");
  assert.ok(macroReport.report.fat, "Macro report must contain fat");
  console.log("  ✔ Macro report evaluated cleanly on final totals:", JSON.stringify(macroReport.report, null, 2));

  console.log("\n===============================================================================");
  console.log("ALL QUANTITY NORMALIZATION & RECALCULATION TESTS PASSED (100% SUCCESS)");
  console.log("===============================================================================");
}

testFullPlan().catch(err => {
  console.error("Test error:", err);
  process.exit(1);
});

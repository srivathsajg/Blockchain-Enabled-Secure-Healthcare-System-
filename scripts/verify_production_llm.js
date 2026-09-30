/**
 * scripts/verify_production_llm.js
 * =========================================================================
 * Production LLM Verification Suite for Medicare Diet AI v10.
 * Executes:
 * 1. 3 Genuine Live LLM generation runs with live OpenRouter key.
 * 2. 1 Simulated Fallback run.
 * Captures all cryptographic hashes, fingerprints, HTTP statuses, and macro metrics.
 */

const dotenv = require("dotenv");
dotenv.config({ path: "./backend/.env" });
if (!process.env.API && !process.env.OPENROUTER_API_KEY) {
  dotenv.config(); // fallback to current directory
}

const { generateAITrackedDietPlan } = require("../backend/modules/track/track.service");

// Patient Profile from Screenshot / Test Case
const testProfile = {
  gender: "female",
  dob: "1998-05-15", // Age 28 in 2026
  height: 165,
  weight: 62,
  goal: "general_wellness",
  activityLevel: "moderate",
  dietaryPreference: "Vegetarian",
  allergies: ["peanuts"],
  chronicDiseases: [],
};

const testBiomarkers = {
  "Hemoglobin": 8.1, // LOW -> triggers proteinMod 1.10 & iron priority
  "Blood Sugar (F)": 88,
  "Total Cholesterol": 175,
  "Serum Creatinine": 0.9,
};

const testRecord = {
  diagnosis: "Microcytic hypochromic picture / Low Hemoglobin (8.1 g/dL)",
  symptoms: "Mild fatigue",
  labResults: "Hb: 8.1 g/dL, RBC: 3.8 M/uL",
};

async function runVerification() {
  console.log("===============================================================================");
  console.log("MEDICARE DIET AI v10 — PRODUCTION LLM VERIFICATION SUITE");
  console.log("===============================================================================\n");

  const runs = [];
  const seeds = [1001, 2002, 3003];

  // 1. LIVE LLM RUNS (3 runs)
  for (let i = 0; i < seeds.length; i++) {
    const seed = seeds[i];
    console.log(`\n>>> EXECUTING LIVE PRODUCTION RUN #${i + 1} (Seed: ${seed}) <<<`);
    const plan = await generateAITrackedDietPlan("patient_test_001", testProfile, testBiomarkers, testRecord, seed);
    
    const trace = plan.llmTrace || plan.metadata.llmTrace;
    const runResult = {
      run_number: i + 1,
      mode: "LIVE_PRODUCTION_LLM",
      seed,
      generation_id: plan.metadata.generationId,
      provider: trace.provider,
      model: trace.model,
      endpoint: trace.endpoint,
      http_status: trace.http_status,
      llm_api_request_attempted: trace.llm_api_request_attempted,
      llm_api_authenticated: trace.llm_api_authenticated,
      llm_response_received: trace.llm_response_received,
      llm_generated_diet: trace.llm_generated_diet,
      fallback_used: trace.fallback_used,
      fallback_reason: trace.fallback_reason,
      response_size_bytes: trace.response_size_bytes,
      response_hash: trace.response_hash,
      plan_fingerprint: plan.plan_fingerprint,
      target_calories: plan.targets.calories,
      actual_calories: plan.dailyTotals.calories,
      protein_g: plan.dailyTotals.protein_g,
      carbs_g: plan.dailyTotals.carbs_g,
      fat_g: plan.dailyTotals.fat_g,
      fiber_g: plan.dailyTotals.fiber_g,
      sodium_mg: plan.dailyTotals.sodium_mg,
      validation_status: plan.validation.status,
      quality_status: plan.nutrition_quality.quality_status,
      data_confidence: plan.nutritionProvenance.dataConfidence,
      sample_meals: {
        breakfast: plan.meals.breakfast?.name,
        lunch: plan.meals.lunch?.name,
        dinner: plan.meals.dinner?.name,
      }
    };
    runs.push(runResult);
    console.log(`Run #${i + 1} Result Summary:`, JSON.stringify(runResult, null, 2));
  }

  // 2. SIMULATED FALLBACK RUN
  console.log(`\n>>> EXECUTING SIMULATED FALLBACK RUN (Forced Invalid Key / Offline) <<<`);
  const originalKey = process.env.API;
  const originalORKey = process.env.OPENROUTER_API_KEY;
  try {
    process.env.API = "sk-invalid-key-for-fallback-verification-test";
    process.env.OPENROUTER_API_KEY = "sk-invalid-key-for-fallback-verification-test";

    const fallbackPlan = await generateAITrackedDietPlan("patient_test_001", testProfile, testBiomarkers, testRecord, 9999);
    const trace = fallbackPlan.llmTrace || fallbackPlan.metadata.llmTrace;
    const fallbackRunResult = {
      run_number: 4,
      mode: "SIMULATED_FALLBACK",
      seed: 9999,
      generation_id: fallbackPlan.metadata.generationId,
      provider: trace.provider,
      model: trace.model,
      endpoint: trace.endpoint,
      http_status: trace.http_status,
      llm_api_request_attempted: trace.llm_api_request_attempted,
      llm_api_authenticated: trace.llm_api_authenticated,
      llm_response_received: trace.llm_response_received,
      llm_generated_diet: trace.llm_generated_diet,
      fallback_used: trace.fallback_used,
      fallback_reason: trace.fallback_reason,
      response_size_bytes: trace.response_size_bytes,
      response_hash: trace.response_hash,
      plan_fingerprint: fallbackPlan.plan_fingerprint,
      target_calories: fallbackPlan.targets.calories,
      actual_calories: fallbackPlan.dailyTotals.calories,
      protein_g: fallbackPlan.dailyTotals.protein_g,
      carbs_g: fallbackPlan.dailyTotals.carbs_g,
      fat_g: fallbackPlan.dailyTotals.fat_g,
      fiber_g: fallbackPlan.dailyTotals.fiber_g,
      sodium_mg: fallbackPlan.dailyTotals.sodium_mg,
      validation_status: fallbackPlan.validation.status,
      quality_status: fallbackPlan.nutrition_quality.quality_status,
      data_confidence: fallbackPlan.nutritionProvenance.dataConfidence,
      sample_meals: {
        breakfast: fallbackPlan.meals.breakfast?.name,
        lunch: fallbackPlan.meals.lunch?.name,
        dinner: fallbackPlan.meals.dinner?.name,
      }
    };
    runs.push(fallbackRunResult);
    console.log(`Fallback Run Result Summary:`, JSON.stringify(fallbackRunResult, null, 2));
  } finally {
    process.env.API = originalKey;
    process.env.OPENROUTER_API_KEY = originalORKey;
  }

  console.log("\n===============================================================================");
  console.log("VERIFICATION EXECUTION COMPLETE — ALL RUNS CAPTURED");
  console.log("===============================================================================");
  console.log(JSON.stringify(runs, null, 2));
}

runVerification().catch(err => {
  console.error("Verification error:", err);
  process.exit(1);
});

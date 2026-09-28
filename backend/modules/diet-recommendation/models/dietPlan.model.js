const mongoose = require("mongoose");
const { Schema } = mongoose;

const foodItemSchema = new Schema({
  name: { type: String, default: "" },
  image: { type: String, default: "" },
  calories: { type: Number, default: 0 },
  protein: { type: Number, default: 0 },
  carbs: { type: Number, default: 0 },
  fat: { type: Number, default: 0 },
  fiber: { type: Number, default: 0 },
  quantity: { type: String, default: "150g" },
  whyRecommended: { type: String, default: "" },
  suitabilityScore: { type: Number, default: 85 },
  clinicalTags: { type: [String], default: [] }
}, { _id: false });

const dietPlanSchema = new Schema({
  patientId: {
    type: Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  date: {
    type: String, // YYYY-MM-DD daily key
    required: true,
  },

  // ── v3 AI Plan fields ──────────────────────────────────────────
  // planVersion = 3 means this is a fresh AI-generated v3 plan.
  // This is the SINGLE source of truth for cache detection —
  // avoids fragile checks on mixed-type nested fields.
  planVersion: {
    type: Number,
    default: 1,
  },
  // Timestamp of when this plan was last generated (set on every save)
  generatedAt: {
    type: Date,
    default: null,
  },
  // 5-meal structure: { breakfast, snack1, lunch, snack2, dinner }
  meals: {
    type: Schema.Types.Mixed,
    default: null,
  },
  targets: {
    type: Schema.Types.Mixed,
    default: null,
  },
  dailyTotals: {
    type: Schema.Types.Mixed,
    default: null,
  },
  adherence: {
    type: Schema.Types.Mixed,
    default: null,
  },
  clinicalRulesApplied: {
    type: Schema.Types.Mixed,
    default: [],
  },
  warnings: {
    type: [String],
    default: [],
  },
  metadata: {
    bmi: Number,
    bmiStatus: String,
    bmr: Number,
    bmrStatus: String,
    dailyCalorieNeeds: Number,
    tdee: Number,
    analysis: Schema.Types.Mixed,
  },

  // ── Legacy backward-compat fields ──────────────────────────────
  morning: { type: [foodItemSchema], default: [] },
  afternoon: { type: [foodItemSchema], default: [] },
  snacks: { type: [foodItemSchema], default: [] },
  night: { type: [foodItemSchema], default: [] },
  importantComponents: { type: [String], default: [] },

  medicalRecordId: {
    type: Schema.Types.ObjectId,
    ref: "Record",
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// Ensure only one plan per patient per day
dietPlanSchema.index({ patientId: 1, date: 1 }, { unique: true });

const DietPlan = mongoose.model("DietPlan", dietPlanSchema);

module.exports = DietPlan;

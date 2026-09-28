/**
 * backend/ai/diet-recommendation/diet.controller.js
 * ==================================================
 * Diet Recommendation Controller connecting Express to FastAPI Diet AI.
 */

const { getMedicalIndicatorStatus, predictDietFastAPI } = require("./diet.service");
const { getFoodImageUrl } = require("./foodImage.service");
const DietPlan = require("../../modules/diet-recommendation/models/dietPlan.model");
const Record = require("../../modules/medical-records/models/record.model");
const User = require("../../modules/users/models/user.model");
const { extractTextFromImage, parseMedicalIndicators } = require("../../core/services/ocr.service");

// ─────────────────────────────────────────────────────────────────────────────
// Helper: load the patient's latest lab record + run OCR + parse indicators
// ─────────────────────────────────────────────────────────────────────────────
const loadIndicators = async (patientId, userGender) => {
  const labTechs = await User.find({ role: "lab_technician" }).select("_id");
  const labTechIds = labTechs.map(lt => lt._id);

  const latestRecord = await Record.findOne({
    patientId,
    doctorId: { $in: labTechIds }
  }).sort({ createdAt: -1 });

  let ocrText = "";
  let rawIndicators = {};

  if (latestRecord) {
    if (latestRecord.fileUrl) {
      const isImage = /\.(jpg|jpeg|png|webp)$/i.test(latestRecord.fileUrl);
      if (isImage) {
        ocrText = await extractTextFromImage(latestRecord.fileUrl);
      }
    }
    const textToParse = `${latestRecord.labResults || ""} ${latestRecord.description || ""} ${ocrText}`.trim();
    rawIndicators = parseMedicalIndicators(textToParse);
  }

  const indicatorsWithStatus = getMedicalIndicatorStatus(rawIndicators, userGender);

  return { latestRecord, rawIndicators, indicatorsWithStatus, ocrExtracted: !!ocrText };
};

// ─────────────────────────────────────────────────────────────────────────────
// Helper: save a fresh prediction to MongoDB using replaceOne with upsert
// ─────────────────────────────────────────────────────────────────────────────
const saveDietPlan = async (patientId, date, prediction, medicalRecordId) => {
  const doc = {
    patientId,
    date,
    planVersion: 4,
    generatedAt: new Date(),
    meals: prediction.meals || null,
    targets: prediction.targets || null,
    dailyTotals: prediction.dailyTotals || null,
    adherence: prediction.adherence || null,
    clinicalRulesApplied: prediction.clinicalRulesApplied || [],
    warnings: prediction.warnings || [],
    metadata: prediction.metadata || {},
    morning: prediction.morning || [],
    afternoon: prediction.afternoon || [],
    snacks: prediction.snacks || [],
    night: prediction.night || [],
    importantComponents: prediction.targeting || [],
    medicalRecordId: medicalRecordId || null,
  };

  await DietPlan.replaceOne(
    { patientId, date },
    doc,
    { upsert: true }
  );

  return DietPlan.findOne({ patientId, date });
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/diet/latest-plan  — return today's cached plan OR generate once
// ─────────────────────────────────────────────────────────────────────────────
const getLatestDietPlan = async (req, res, next) => {
  try {
    const patientId = req.user.id;
    const today = new Date().toISOString().split("T")[0];

    const user = await User.findById(patientId);
    if (!user) throw new Error("User not found");

    // ── 1. Check for an existing v4 plan for today ────────────────
    const existingPlan = await DietPlan.findOne({ patientId, date: today });
    const isV4Plan = existingPlan && (existingPlan.planVersion === 4 || existingPlan.planVersion === 3);

    if (isV4Plan) {
      // ── CACHE HIT ──
      const { latestRecord, indicatorsWithStatus, ocrExtracted } = await loadIndicators(patientId, user.gender);
      return res.json({
        success: true,
        cached: true,
        data: {
          ...existingPlan.toObject(),
          userProfile: {
            height: user.height,
            weight: user.weight,
            gender: user.gender,
            dob: user.dob,
          },
          medicalRecord: latestRecord ? {
            diagnosis: latestRecord.diagnosis,
            symptoms: latestRecord.symptoms,
            description: latestRecord.description,
            labResults: latestRecord.labResults,
            title: latestRecord.title,
            fileUrl: latestRecord.fileUrl,
            indicators: indicatorsWithStatus,
            ocrExtracted,
          } : null,
        },
      });
    }

    // ── 2. No fresh plan for today — delete stale plan and generate fresh ──
    if (existingPlan) {
      await DietPlan.deleteOne({ patientId, date: today });
    }

    const { latestRecord, rawIndicators, indicatorsWithStatus, ocrExtracted } = await loadIndicators(patientId, user.gender);

    const userProfile = {
      height: user.height,
      weight: user.weight,
      gender: user.gender,
      dob: user.dob,
      allergies: user.healthSummary?.allergies || [],
      dietary_preference: user.dietaryPreference || "veg",
      chronicDiseases: user.healthSummary?.chronicDiseases || [],
    };

    const prediction = await predictDietFastAPI(patientId, false, userProfile, rawIndicators, latestRecord);
    const dietPlan = await saveDietPlan(patientId, today, prediction, latestRecord?._id);

    res.json({
      success: true,
      cached: false,
      data: {
        ...dietPlan.toObject(),
        userProfile,
        medicalRecord: latestRecord ? {
          diagnosis: latestRecord.diagnosis,
          symptoms: latestRecord.symptoms,
          description: latestRecord.description,
          labResults: latestRecord.labResults,
          title: latestRecord.title,
          fileUrl: latestRecord.fileUrl,
          indicators: indicatorsWithStatus,
          ocrExtracted,
        } : null,
      },
    });
  } catch (error) {
    next(error);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/diet/recommend  — one-off recommendation without saving
// ─────────────────────────────────────────────────────────────────────────────
const getDietRecommendation = async (req, res, next) => {
  try {
    const { indicators, force_random } = req.body;
    const user = await User.findById(req.user.id);
    const userProfile = {
      height: user.height,
      weight: user.weight,
      gender: user.gender,
      dob: user.dob,
      allergies: user.healthSummary?.allergies || [],
      dietary_preference: user.dietaryPreference || "veg",
      chronicDiseases: user.healthSummary?.chronicDiseases || [],
    };

    const result = await predictDietFastAPI(req.user.id, Boolean(force_random), userProfile, indicators || {});
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/diet/refresh  — force-generate a completely new plan for today
// ─────────────────────────────────────────────────────────────────────────────
const refreshDietPlan = async (req, res, next) => {
  try {
    const patientId = req.user.id;
    const today = new Date().toISOString().split("T")[0];

    const user = await User.findById(patientId);
    if (!user) throw new Error("User not found");

    const { latestRecord, rawIndicators, indicatorsWithStatus, ocrExtracted } = await loadIndicators(patientId, user.gender);

    const userProfile = {
      height: user.height,
      weight: user.weight,
      gender: user.gender,
      dob: user.dob,
      allergies: user.healthSummary?.allergies || [],
      dietary_preference: user.dietaryPreference || "veg",
      chronicDiseases: user.healthSummary?.chronicDiseases || [],
    };

    // Always delete and regenerate
    await DietPlan.deleteOne({ patientId, date: today });

    const prediction = await predictDietFastAPI(patientId, true, userProfile, rawIndicators, latestRecord);
    const dietPlan = await saveDietPlan(patientId, today, prediction, latestRecord?._id);

    res.json({
      success: true,
      data: {
        ...dietPlan.toObject(),
        userProfile,
        medicalRecord: latestRecord ? {
          diagnosis: latestRecord.diagnosis,
          symptoms: latestRecord.symptoms,
          description: latestRecord.description,
          labResults: latestRecord.labResults,
          title: latestRecord.title,
          fileUrl: latestRecord.fileUrl,
          indicators: indicatorsWithStatus,
          ocrExtracted,
        } : null,
      },
    });
  } catch (error) {
    next(error);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/diet/food-image
// ─────────────────────────────────────────────────────────────────────────────
const getFoodImage = async (req, res) => {
  const { q } = req.query;
  const imageUrl = await getFoodImageUrl(q);
  return res.json({ imageUrl });
};

module.exports = {
  getLatestDietPlan,
  getDietRecommendation,
  refreshDietPlan,
  getFoodImage,
};

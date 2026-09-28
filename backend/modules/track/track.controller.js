/**
 * backend/modules/track/track.controller.js
 * =========================================
 * Controller for Medical Report Tracking & AI Indian Diet Plan Generation.
 */

const { generateAITrackedDietPlan, getMedicalIndicatorStatus } = require("./track.service");
const DietPlan = require("../diet-recommendation/models/dietPlan.model");
const Record = require("../medical-records/models/record.model");
const User = require("../users/models/user.model");
const { extractTextFromImage, parseMedicalIndicators } = require("../../core/services/ocr.service");

/**
 * Load the patient's latest medical record and OCR indicators
 */
const loadPatientMedicalContext = async (patientId, userGender) => {
  const labTechs = await User.find({ role: "lab_technician" }).select("_id");
  const labTechIds = labTechs.map(lt => lt._id);

  // Try finding lab reports first, then any latest medical record
  let latestRecord = await Record.findOne({
    patientId,
    doctorId: { $in: labTechIds }
  }).sort({ createdAt: -1 });

  if (!latestRecord) {
    latestRecord = await Record.findOne({ patientId }).sort({ createdAt: -1 });
  }

  let ocrText = "";
  let rawIndicators = {};

  if (latestRecord) {
    if (latestRecord.fileUrl) {
      const isImage = /\.(jpg|jpeg|png|webp)$/i.test(latestRecord.fileUrl);
      if (isImage) {
        try {
          ocrText = await extractTextFromImage(latestRecord.fileUrl);
        } catch (e) {
          console.warn("[TrackController] OCR extraction error:", e.message);
        }
      }
    }
    const textToParse = `${latestRecord.labResults || ""} ${latestRecord.description || ""} ${ocrText}`.trim();
    rawIndicators = parseMedicalIndicators(textToParse);
  }

  const indicatorsWithStatus = getMedicalIndicatorStatus(rawIndicators, userGender);
  return { latestRecord, rawIndicators, indicatorsWithStatus, ocrExtracted: !!ocrText };
};

/**
 * GET /api/track/diet-plan  OR  GET /api/diet/latest-plan
 * Returns today's diet plan or generates a fresh plan based on recent medical reports.
 */
const getTrackedDietPlan = async (req, res, next) => {
  try {
    const patientId = req.user.id;
    const today = new Date().toISOString().split("T")[0];

    const user = await User.findById(patientId);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const { latestRecord, rawIndicators, indicatorsWithStatus, ocrExtracted } = await loadPatientMedicalContext(patientId, user.gender);

    const userProfile = {
      height: user.height,
      weight: user.weight,
      gender: user.gender,
      dob: user.dob,
      goal: user.goal || "general_wellness",
      activityLevel: user.activityLevel || "moderate",
      dietaryPreference: user.dietaryPreference || "Vegetarian",
      healthSummary: user.healthSummary || {},
    };

    // Generate accurate AI plan grounded in recent medical report
    const prediction = await generateAITrackedDietPlan(patientId, userProfile, rawIndicators, latestRecord);

    // Save/upsert plan to MongoDB
    const doc = {
      patientId,
      date: today,
      planVersion: 4,
      generatedAt: new Date(),
      meals: prediction.meals,
      targets: prediction.targets,
      dailyTotals: prediction.dailyTotals,
      metadata: prediction.metadata,
      clinicalRulesApplied: prediction.clinicalRulesApplied || [],
      warnings: prediction.warnings || [],
      explanations: prediction.explanations || [],
      medicalRecordId: latestRecord?._id || null,
    };

    await DietPlan.replaceOne({ patientId, date: today }, doc, { upsert: true });
    const savedPlan = await DietPlan.findOne({ patientId, date: today });

    return res.json({
      success: true,
      cached: false,
      data: {
        ...savedPlan.toObject(),
        userProfile,
        validation: prediction.validation,
        validationBadge: prediction.validationBadge || "Within Target",
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
    console.error("[TrackController] Error generating tracked diet plan:", error);
    next(error);
  }
};

/**
 * POST /api/track/refresh  OR  POST /api/diet/refresh
 * Forces a complete regeneration of today's plan with new AI reasoning
 */
const refreshTrackedDietPlan = async (req, res, next) => {
  try {
    const patientId = req.user.id;
    const today = new Date().toISOString().split("T")[0];

    const user = await User.findById(patientId);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const { latestRecord, rawIndicators, indicatorsWithStatus, ocrExtracted } = await loadPatientMedicalContext(patientId, user.gender);

    const userProfile = {
      height: user.height,
      weight: user.weight,
      gender: user.gender,
      dob: user.dob,
      goal: user.goal || "general_wellness",
      activityLevel: user.activityLevel || "moderate",
      dietaryPreference: user.dietaryPreference || "Vegetarian",
      healthSummary: user.healthSummary || {},
    };

    // Remove existing plan for today
    await DietPlan.deleteOne({ patientId, date: today });

    // Generate fresh plan
    const prediction = await generateAITrackedDietPlan(patientId, userProfile, rawIndicators, latestRecord);

    const doc = {
      patientId,
      date: today,
      planVersion: 4,
      generatedAt: new Date(),
      meals: prediction.meals,
      targets: prediction.targets,
      dailyTotals: prediction.dailyTotals,
      metadata: prediction.metadata,
      clinicalRulesApplied: prediction.clinicalRulesApplied || [],
      warnings: prediction.warnings || [],
      explanations: prediction.explanations || [],
      medicalRecordId: latestRecord?._id || null,
    };

    await DietPlan.replaceOne({ patientId, date: today }, doc, { upsert: true });
    const savedPlan = await DietPlan.findOne({ patientId, date: today });

    return res.json({
      success: true,
      data: {
        ...savedPlan.toObject(),
        userProfile,
        validation: prediction.validation,
        validationBadge: prediction.validationBadge || "Within Target",
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
    console.error("[TrackController] Refresh error:", error);
    next(error);
  }
};

module.exports = {
  getTrackedDietPlan,
  refreshTrackedDietPlan,
  loadPatientMedicalContext,
};

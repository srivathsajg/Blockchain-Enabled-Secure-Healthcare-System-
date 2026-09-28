/**
 * backend/modules/track/track.routes.js
 * =====================================
 * Routes for Medical Tracking & AI Diet Planning.
 */

const express = require("express");
const router = express.Router();
const { getTrackedDietPlan, refreshTrackedDietPlan } = require("./track.controller");
const authMiddleware = require("../../middleware/authMiddleware");

// Require authenticated patient user
router.get("/diet-plan", authMiddleware, getTrackedDietPlan);
router.post("/refresh", authMiddleware, refreshTrackedDietPlan);

module.exports = router;

const express = require("express");
const upload = require("../../../middleware/upload");
const authMiddleware = require("../../../middleware/authMiddleware");
const { register, login, updateProfile, getHospitals, getProfile } = require("../controllers/auth.controller");
const { registerAmbulance, getMyAmbulanceProfile, updateMyAvailability } = require("../controllers/ambulance.controller");

const router = express.Router();

router.get("/hospitals", getHospitals);

router.post(
  "/register",
  upload.fields([
    { name: "pastLabReports", maxCount: 5 },
    { name: "insuranceProofImage", maxCount: 1 },
    { name: "achievementCertificates", maxCount: 5 },
    { name: "medicalLicenseProof", maxCount: 1 },
    { name: "profileImage", maxCount: 1 },
  ]),
  register
);
router.post("/login", login);

router.get("/profile", authMiddleware, getProfile);

router.put(
  "/profile",
  authMiddleware,
  upload.fields([
    { name: "profileImage", maxCount: 1 },
    { name: "signature", maxCount: 1 },
    { name: "achievementCertificates", maxCount: 5 }
  ]),
  updateProfile
);

// ── Ambulance-specific routes ────────────────────────────────────────
router.post(
  "/register/ambulance",
  upload.fields([{ name: "profileImage", maxCount: 1 }]),
  registerAmbulance
);
router.get("/ambulance/profile", authMiddleware, getMyAmbulanceProfile);
router.patch("/ambulance/availability", authMiddleware, updateMyAvailability);

module.exports = router;

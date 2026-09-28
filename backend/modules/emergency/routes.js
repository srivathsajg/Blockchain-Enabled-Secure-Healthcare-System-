const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const authMiddleware = require("../../middleware/authMiddleware");
const roleMiddleware = require("../../middleware/roleMiddleware");

const {
  createEmergencyCase,
  getEmergencyCaseById,
  getMyEmergencyCases,
  updateEmergencyStatus,
  updateEmergencyDetails,
  updateAmbulanceLocation,
  cancelEmergencyCase,
  getAvailableAmbulanceEmergencies,
  getAssignedAmbulanceEmergencies,
  acceptEmergencyCase,
  identifyPatientByQR,
  searchEmergencyCasePatients,
  confirmManualPatientIdentification,
  getEmergencyMedicalProfile,
  uploadVictimPhoto,
} = require("./controller");

const router = express.Router();

const victimPhotoStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = "uploads/";
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, "victim-" + uniqueSuffix + path.extname(file.originalname));
  },
});

const victimPhotoFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|gif|webp/;
  const extname = allowedTypes.test(
    path.extname(file.originalname).toLowerCase()
  );
  const mimetype = allowedTypes.test(file.mimetype);
  if (extname && mimetype) {
    return cb(null, true);
  }
  cb(new Error("Only JPEG, PNG, GIF, and WebP images are allowed!"));
};

const uploadVictimPhotoMulter = multer({
  storage: victimPhotoStorage,
  fileFilter: victimPhotoFilter,
  limits: { fileSize: 10 * 1024 * 1024 },
});

const CREATOR_ROLES = ["patient", "doctor", "admin", "ambulance", "police"];
const STATUS_UPDATER_ROLES = ["doctor", "admin", "ambulance"];
const VIEWER_ROLES = ["patient", "doctor", "admin", "ambulance", "police"];
const ADMIN_ROLES = ["admin"];

router.post(
  "/cases",
  authMiddleware,
  roleMiddleware(CREATOR_ROLES),
  createEmergencyCase
);

router.get(
  "/cases",
  authMiddleware,
  roleMiddleware(VIEWER_ROLES),
  getMyEmergencyCases
);

router.get(
  "/cases/all",
  authMiddleware,
  roleMiddleware(ADMIN_ROLES),
  getMyEmergencyCases
);

router.get(
  "/cases/:id",
  authMiddleware,
  roleMiddleware(VIEWER_ROLES),
  getEmergencyCaseById
);

router.patch(
  "/cases/:id/status",
  authMiddleware,
  roleMiddleware(STATUS_UPDATER_ROLES.concat(["patient"])),
  updateEmergencyStatus
);

router.patch(
  "/cases/:id",
  authMiddleware,
  roleMiddleware(CREATOR_ROLES.concat(["admin"])),
  updateEmergencyDetails
);

router.post(
  "/cases/:id/cancel",
  authMiddleware,
  roleMiddleware(["patient", "admin"]),
  cancelEmergencyCase
);

// ── Ambulance-specific endpoints ────────────────────────────────────
router.get(
  "/ambulance/available",
  authMiddleware,
  roleMiddleware(["ambulance"]),
  getAvailableAmbulanceEmergencies
);

router.get(
  "/ambulance/assigned",
  authMiddleware,
  roleMiddleware(["ambulance"]),
  getAssignedAmbulanceEmergencies
);

router.post(
  "/cases/:id/accept",
  authMiddleware,
  roleMiddleware(["ambulance"]),
  acceptEmergencyCase
);

router.post(
  "/cases/:id/location",
  authMiddleware,
  roleMiddleware(["ambulance", "admin"]),
  updateAmbulanceLocation
);

router.post(
  "/cases/:id/ambulance-location",
  authMiddleware,
  roleMiddleware(["ambulance", "admin"]),
  updateAmbulanceLocation
);

router.post(
  "/cases/:id/identify",
  authMiddleware,
  roleMiddleware(["ambulance"]),
  identifyPatientByQR
);

router.get(
  "/cases/:id/patients/search",
  authMiddleware,
  roleMiddleware(["ambulance"]),
  searchEmergencyCasePatients
);

router.post(
  "/cases/:id/identify/manual",
  authMiddleware,
  roleMiddleware(["ambulance"]),
  confirmManualPatientIdentification
);

router.get(
  "/cases/:id/medical-profile",
  authMiddleware,
  roleMiddleware(["ambulance", "doctor", "admin"]),
  getEmergencyMedicalProfile
);

router.post(
  "/cases/photo/upload",
  authMiddleware,
  roleMiddleware(CREATOR_ROLES),
  uploadVictimPhotoMulter.single("victimPhoto"),
  uploadVictimPhoto
);

module.exports = router;

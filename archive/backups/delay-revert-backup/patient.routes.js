const express = require("express");
const multer = require("multer");
const fs = require("fs");

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = "uploads/";
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
});
const upload = multer({ storage });
const router = express.Router();
const authMiddleware = require("../../middleware/authMiddleware");

const {
    getOverview,
    getRecords,
    getPrescriptions,
    getReminders,
    getDoctors,
    getDoctorSlots,
    bookAppointment,
    getAppointments,
    cancelAppointment,
    updateInsurance,
    getInsuranceClaims,
    respondToReallocation,
    respondToDelayRequest,
    getLabOrders,
    rateAppointment,
    getDoctorReviews,
    getAdmissionStatus
} = require("./patient.controller");

// Apply basic auth middleware first to verify JWT and extract user
router.use(authMiddleware);

// Verify that the user has patient role
const patientRoleCheck = (req, res, next) => {
    if (req.user && req.user.role === 'patient') {
        return next();
    }
    return res.status(403).json({ success: false, message: "Forbidden: Patient role required" });
};
router.use(patientRoleCheck);

router.get("/overview", getOverview);
router.get("/records", getRecords);
router.get("/prescriptions", getPrescriptions);
router.get("/reminders", getReminders);
router.get("/doctors", getDoctors);
router.get("/doctor-slots/:doctorId", getDoctorSlots);
router.post("/book-appointment", bookAppointment);
router.get("/appointments", getAppointments);
router.post("/appointments/:id/rate", rateAppointment);
router.get("/doctors/:doctorId/reviews", getDoctorReviews);
router.patch("/cancel-appointment/:id", cancelAppointment);
router.patch("/reallocation-response/:id", respondToReallocation);
router.patch("/delay-response/:id", respondToDelayRequest);
router.put("/update-insurance", upload.single("insuranceProofImage"), updateInsurance);
router.get("/insurance-claims", getInsuranceClaims);
router.get("/lab-orders", getLabOrders);
router.get("/admission-status", getAdmissionStatus);

module.exports = router;

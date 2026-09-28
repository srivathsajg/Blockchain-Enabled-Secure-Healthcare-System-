const express = require("express");
const router = express.Router();
const authMiddleware = require("../../middleware/authMiddleware");

const {
    getOverview,
    createRecord,
    createPrescription,
    getPatients,
    getAppointments,
    updateAppointment,
    createAvailability,
    getAvailability,
    deleteAvailability,
    getPendingRecords,
    verifyRecordOnBlockchain,
    updateDelayStatus,
    getAdmittedPatients,
    getPatientHistory,
    issueAdmissionCertificate,
    startDoctorEmergency,
    completeDoctorEmergency,
    getEmergencyCaseMedicalHistory
} = require("./doctor.controller");

// Apply basic auth middleware first to verify JWT and extract user
router.use(authMiddleware);

// Verify that the user has doctor role
const doctorRoleCheck = (req, res, next) => {
    if (req.user && req.user.role === 'doctor') {
        return next();
    }
    return res.status(403).json({ success: false, message: "Forbidden: Doctor role required" });
};
router.use(doctorRoleCheck);

// Protected routes for doctors
router.get("/overview", getOverview);
router.get("/patients", getPatients);
router.get("/patient-history/:patientId", getPatientHistory);
router.post("/create-record", createRecord);
router.post("/create-prescription", createPrescription);
router.get("/appointments", getAppointments);
router.patch("/update-appointment/:id", updateAppointment);

router.post("/availability", createAvailability);
router.get("/availability", getAvailability);
router.delete("/availability/:id", deleteAvailability);

router.get("/pending-records", getPendingRecords);
router.patch("/verify-record/:id", verifyRecordOnBlockchain);
router.patch("/update-delay", updateDelayStatus);
router.get("/admitted-patients", getAdmittedPatients);
router.patch("/issue-certificate/:patientId", issueAdmissionCertificate);

router.post("/start-emergency/:caseId", startDoctorEmergency);
router.post("/complete-emergency/:caseId", completeDoctorEmergency);
router.get("/emergency-cases/:caseId/medical-history", getEmergencyCaseMedicalHistory);

module.exports = router;

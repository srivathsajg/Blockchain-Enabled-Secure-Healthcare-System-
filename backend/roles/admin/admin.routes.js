const express = require("express");
const authMiddleware = require("../../middleware/authMiddleware");
const roleMiddleware = require("../../middleware/roleMiddleware");
const {
    createHospitalAdmin,
    getAnalytics,
    getUsers,
    updateUserRole,
    getPendingApprovals,
    approvePendingUser,
    rejectUser,
    getBlockchainStatus,
    syncBlockchainRecord,
    syncAllBlockchainRecords,
    getAdmittedPatientInsurance,
    searchPatients,
    admitPatient,
    changeWard,
    getAdmittedPatients,
    getPatientBillPreview,
    dischargePatient,
    getBillingHistory,
    markBillAsPaid,
    verifyInsurance,
} = require("./admin.controller");
const notificationSoundAdminRoutes = require("../../modules/notifications/sound.routes");

const router = express.Router();

router.use(authMiddleware, roleMiddleware(["admin"]));

router.use("/notification-sounds", notificationSoundAdminRoutes);

router.get("/analytics", getAnalytics);
router.get("/users", getUsers);
router.patch("/users/:id/role", updateUserRole);
router.get("/approvals/pending", getPendingApprovals);
router.patch("/approvals/:id/approve", approvePendingUser);
router.delete("/approvals/:id/reject", rejectUser);
router.post("/hospital-admins", createHospitalAdmin);
router.get("/blockchain/status", getBlockchainStatus);
router.post("/blockchain/sync/:type/:id", syncBlockchainRecord);
router.post("/blockchain/sync-all", syncAllBlockchainRecords);
router.get("/insurance/admitted-patients", getAdmittedPatientInsurance);
router.get("/patients/search", searchPatients);
router.post("/patients/:id/admit", admitPatient);
router.patch("/patients/:id/change-ward", changeWard);
router.get("/patients/admitted", getAdmittedPatients);
router.get("/patients/:id/bill-preview", getPatientBillPreview);
router.post("/patients/:id/discharge", dischargePatient);
router.get("/billing/history", getBillingHistory);
router.patch("/billing/:id/pay", markBillAsPaid);
router.patch("/insurance/:id/verify", verifyInsurance);

module.exports = router;

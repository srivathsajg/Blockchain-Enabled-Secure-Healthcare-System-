const express = require("express");
const cors = require("cors");
const path = require("path");

const authRoutes = require("../modules/auth/routes/auth.routes");
const appointmentRoutes = require("../modules/appointments");
const recordRoutes = require("../modules/medical-records");
const medicalRecordRoutes = require("../modules/medical-records");
const prescriptionRoutes = require("../modules/prescriptions");
const pharmacyRoutes = require("../modules/pharmacy-orders");
const deliveryRoutes = require("../modules/delivery-tracking");
const insuranceRoutes = require("../modules/insurance");
const billingRoutes = require("../modules/billing");
const blockchainRoutes = require("../modules/blockchain-records");
const diagnosisRoutes = require("../ai/smart-diagnosis/diagnosis.routes");
const dietRoutes = require("../ai/diet-recommendation/diet.routes");
const reminderRoutes = require("../ai/medicine-reminder/reminder.routes");
const auditRoutes = require("../modules/audit/routes");
const emergencyRoutes = require("../modules/emergency");
const errorHandler = require("../middleware/errorHandler");
const { limiter, securityHeaders } = require("../middleware/security");
const requestLogger = require("../middleware/requestLogger");
const authMiddleware = require("../middleware/authMiddleware");

const app = express();

// Security Middleware
app.use(securityHeaders);
app.use(limiter);

// Logging Middleware
app.use(requestLogger);

app.use((req, res, next) => {
  console.log(`Incoming Request: ${req.method} ${req.url}`);
  next();
});

// Explicit CORS configuration
app.use(cors({
  origin: true, // Allow any origin to support both local and public tunnels
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));
app.options("*", cors()); // Enable pre-flight across-the-board

app.use(express.json());

// Serve static files from uploads directory
// Using __dirname ensures we find the uploads folder relative to this file
const fs = require("fs");
const uploadsDir = path.join(__dirname, "../uploads");
const notificationUploadsDir = path.join(uploadsDir, "notifications");
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
if (!fs.existsSync(notificationUploadsDir)) fs.mkdirSync(notificationUploadsDir, { recursive: true });

app.use("/uploads", express.static(uploadsDir));
app.use("/backend/uploads", express.static(uploadsDir)); // Fallback

// Global Mongoose settings — disable command buffering so queries fail fast
// instead of hanging for 10s when MongoDB is temporarily disconnected
const mongoose = require("mongoose");
mongoose.set("bufferCommands", false);

app.get("/api/health", (req, res) => {
  const dbState = mongoose.connection.readyState;
  const dbStatus = { 0: "disconnected", 1: "connected", 2: "connecting", 3: "disconnecting" }[dbState] || "unknown";
  res.json({
    status: "ok",
    db: dbStatus,
    dbState,
    timestamp: new Date().toISOString(),
  });
});

console.log("Loading auth routes at /api/auth");
app.use("/api/auth", authRoutes);
console.log("Loading appointment routes at /api/appointments");
app.use("/api/appointments", appointmentRoutes);
console.log("Loading medical record routes at /api/records");
app.use("/api/records", recordRoutes);
console.log("Loading medical record routes at /api/medical-record");
app.use("/api/medical-record", medicalRecordRoutes);
console.log("Loading prescription routes at /api/prescriptions");
app.use("/api/prescriptions", prescriptionRoutes);
console.log("Loading pharmacy routes at /api/pharmacy");
app.use("/api/pharmacy", pharmacyRoutes);
console.log("Loading delivery routes at /api/delivery");
app.use("/api/delivery", deliveryRoutes);
console.log("Loading insurance routes at /api/insurance");
app.use("/api/insurance", insuranceRoutes);
console.log("Loading billing routes at /api/billing");
app.use("/api/billing", billingRoutes);
console.log("Loading blockchain routes at /api/blockchain");
app.use("/api/blockchain", blockchainRoutes);
console.log("Loading AI diagnosis routes at /api/ai/diagnosis");
app.use("/api/ai/diagnosis", diagnosisRoutes);
console.log("Loading AI diet routes at /api/ai/diet");
app.use("/api/ai/diet", dietRoutes);
console.log("Loading Medical Report Track AI diet routes at /api/track");
const trackRoutes = require("../modules/track/track.routes");
app.use("/api/track", trackRoutes);
console.log("Loading AI reminder routes at /api/ai/reminder");
app.use("/api/ai/reminder", reminderRoutes);
console.log("Loading Audit routes at /api/audit");
app.use("/api/audit", auditRoutes);
console.log("Loading Emergency routes at /api/emergency");
app.use("/api/emergency", emergencyRoutes);
console.log("Loading QR access routes at /api/qr");
const qrRoutes = require("../modules/qr-access/routes/qr.routes");
app.use("/api/qr", qrRoutes);
console.log("Loading patient routes at /api/patient");
const patientRoutes = require("../roles/patient/patient.routes");
app.use("/api/patient", patientRoutes);
console.log("Loading doctor routes at /api/doctor");
const doctorRoutes = require("../roles/doctor/doctor.routes");
app.use("/api/doctor", doctorRoutes);
console.log("Loading admin routes at /api/admin");
const adminRoutes = require("../roles/admin/admin.routes");
app.use("/api/admin", adminRoutes);

console.log("Loading drug routes at /api/drugs");
const drugRoutes = require("../modules/drugs/routes");
app.use("/api/drugs", drugRoutes);

console.log("Loading inventory routes at /api/inventory");
const inventoryRoutes = require("../modules/inventory/routes");
app.use("/api/inventory", inventoryRoutes);

console.log("Loading lab routes at /api/lab");
const labRoutes = require("../modules/lab/routes");
app.use("/api/lab", labRoutes);

console.log("Loading universal search routes at /api/search");
const searchRoutes = require("../modules/search/routes");
app.use("/api/search", searchRoutes);

console.log("Loading notification sound routes at /api/notification-sounds");
const { Router } = require("express");
const {
  getSoundEventMap,
  resolveSoundForEvent,
} = require("../modules/notifications/sound.controller");
const notificationSoundPublicRouter = Router();
notificationSoundPublicRouter.get("/event-map", authMiddleware, getSoundEventMap);
notificationSoundPublicRouter.get(
  "/by-event/:eventType",
  authMiddleware,
  resolveSoundForEvent
);
app.use("/api/notification-sounds", notificationSoundPublicRouter);

console.log("App initialized - all routes loaded");

app.use(errorHandler);

module.exports = app;

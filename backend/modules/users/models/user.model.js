const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
  },
  password: {
    type: String,
    required: true,
  },
  role: {
    type: String,
    required: true,
    enum: ["admin", "doctor", "patient", "pharmacist", "delivery", "lab_technician", "ambulance", "police"],
  },
  phone: {
    type: String,
    trim: true,
  },
  dob: {
    type: Date,
  },
  bloodGroup: {
    type: String,
    trim: true,
  },
  // Doctor specific fields
  hospitalName: {
    type: String,
    trim: true,
  },
  hospitalAddress: {
    type: String,
    trim: true,
  },
  hospitalPricing: {
    // Wards
    general: { type: Number, default: 1000 },
    icu: { type: Number, default: 5000 },
    emergency: { type: Number, default: 3000 },
    pediatric: { type: Number, default: 1500 },
    surgical: { type: Number, default: 2500 },
    deluxe: { type: Number, default: 4000 },
    semiPrivate: { type: Number, default: 2000 },
    private: { type: Number, default: 3000 },
    isolation: { type: Number, default: 3500 },
    nicu: { type: Number, default: 5500 },
    
    // Professional Fees
    doctorFee: { type: Number, default: 500 },
    nursing: { type: Number, default: 300 },
    rmoFee: { type: Number, default: 200 },
    physiotherapy: { type: Number, default: 800 },
    
    // Services
    otCharges: { type: Number, default: 10000 },
    laborRoom: { type: Number, default: 8000 },
    ambulance: { type: Number, default: 1500 },
    ambulanceAdvanced: { type: Number, default: 3000 },
    dialysis: { type: Number, default: 2500 },
    
    // Diagnostics Base
    xray: { type: Number, default: 500 },
    ecg: { type: Number, default: 300 },
    ultrasound: { type: Number, default: 1200 },
    ctScan: { type: Number, default: 4500 },
    mri: { type: Number, default: 7000 },
    
    // Administrative
    registration: { type: Number, default: 200 },
    pharmacyHandling: { type: Number, default: 50 },
  },
  specialization: {
    type: String,
    trim: true,
  },
  bio: {
    type: String,
    trim: true,
  },
  licenseNumber: {
    type: String,
    trim: true,
  },
  pharmacyName: {
    type: String,
    trim: true,
  },
  adminCode: {
    type: String,
    trim: true,
  },
  // New Enterprise Fields
  guardianNumber: { type: String, trim: true },
  gender: { type: String, enum: ["male", "female", "other"] },
  residentialAddress: { type: String, trim: true },
  height: { type: String, trim: true },
  weight: { type: String, trim: true },
  
  insuranceProviderName: { type: String, trim: true },
  policyNumber: { type: String, trim: true },
  validTillDate: { type: Date },
  isInsuranceApplied: { type: Boolean, default: false },
  insuranceVerifiedAt: { type: Date },
  
  qualification: { type: String, trim: true },
  signature: { type: String, trim: true }, // Doctor's digital signature image path
  experience: { type: String, trim: true },
  
  employeeId: { type: String, trim: true },
  assignedWard: { type: String, trim: true },

  // Doctor Analytics
  averageRating: { type: Number, default: 0 },
  ratingCount: { type: Number, default: 0 },
  patientsTreatedCount: { type: Number, default: 0 },

  // Patient Health Summary for QR Profile
  healthSummary: {
    allergies: [{ type: String }],
    chronicDiseases: [{ type: String }],
    currentMedications: [{ type: String }],
    pastDiagnoses: [{ type: String }],
  },

  // Patient Admission Details
  admission: {
    isAdmitted: { type: Boolean, default: false },
    hospitalName: { type: String },
    doctorId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    ward: { type: String },
    admittedAt: { type: Date },
    wardHistory: [{
      ward: { type: String },
      startedAt: { type: Date },
      endedAt: { type: Date }
    }],
    certificate: {
      status: { type: String }, // e.g. "90% Cured", "Safe"
      notes: { type: String },
      doctorName: { type: String },
      signature: { type: String },
      recommendDischarge: { type: Boolean, default: false },
      followUpDate: { type: Date },
      issuedAt: { type: Date }
    }
  },

  // File Paths
  profileImage: { type: String },
  pastLabReports: [{ type: String }],
  insuranceProofImage: { type: String },
  achievementCertificates: [{ type: String }],
  medicalLicenseProof: { type: String },

  location: {
    type: {
      type: String,
      enum: ["Point"],
      default: "Point",
    },
    coordinates: {
      type: [Number], // [longitude, latitude]
      index: "2dsphere",
      default: [0, 0],
    },
  },
  isApproved: {
    type: Boolean,
    default: true, // Default to true for patients. Staff roles will be overridden during registration.
  },
  delayStatus: {
    isDelayed: { type: Boolean, default: false },
    reason: { type: String },
    expectedArrivalTime: { type: String },
    updatedAt: { type: Date }
  },
  doctorStatus: {
    type: String,
    enum: ["AVAILABLE", "BUSY_WITH_EMERGENCY"],
    default: "AVAILABLE",
  },
  notificationPreferences: {
    soundEnabled: { type: Boolean, default: true },
    soundVolume: { type: Number, default: 0.8, min: 0, max: 1 },
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

const User = mongoose.model("User", userSchema);

module.exports = User;

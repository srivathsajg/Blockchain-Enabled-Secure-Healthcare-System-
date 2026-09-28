const mongoose = require("mongoose");

const { Schema } = mongoose;

const INCIDENT_TYPES = [
  "ROAD_ACCIDENT",
  "MEDICAL_EMERGENCY",
  "FALL",
  "FIRE",
  "CARDIAC",
  "UNCONSCIOUS",
  "OTHER",
];

const SEVERITY_LEVELS = ["LOW", "MODERATE", "HIGH", "CRITICAL"];

const RESPONSE_TYPES = [
  "AMBULANCE_EMERGENCY",
  "DOCTOR_EMERGENCY",
];

const EMERGENCY_STATUSES = [
  "REPORTED",
  "AMBULANCE_REQUESTED",
  "AMBULANCE_ASSIGNED",
  "AMBULANCE_ARRIVED",
  "PATIENT_IDENTIFIED",
  "IN_TRANSIT",
  "HOSPITAL_PREPARED",
  "ARRIVED_AT_HOSPITAL",
  "UNDER_TREATMENT",
  "CLOSED",
  "CANCELLED",
];

const emergencyLocationSchema = new Schema({
  latitude: {
    type: Number,
  },
  longitude: {
    type: Number,
  },
  accuracy: {
    type: Number,
  },
  timestamp: {
    type: Date,
  },
  address: {
    type: String,
    trim: true,
  },
});

const ambulanceLocationSchema = new Schema({
  latitude: {
    type: Number,
  },
  longitude: {
    type: Number,
  },
  accuracy: {
    type: Number,
  },
  heading: {
    type: Number,
  },
  speed: {
    type: Number,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

const emergencyCaseSchema = new Schema({
  patient: {
    type: Schema.Types.ObjectId,
    ref: "User",
  },
  reportedBy: {
    type: Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  incidentType: {
    type: String,
    enum: INCIDENT_TYPES,
    required: true,
  },
  description: {
    type: String,
    trim: true,
  },
  severity: {
    type: String,
    enum: SEVERITY_LEVELS,
    required: true,
  },
  location: {
    type: emergencyLocationSchema,
    default: () => ({}),
  },
  ambulanceLocation: {
    type: ambulanceLocationSchema,
  },
  assignedAmbulance: {
    type: Schema.Types.ObjectId,
    ref: "User",
  },
  assignedHospital: {
    type: String,
    trim: true,
  },
  assignedDoctor: {
    type: Schema.Types.ObjectId,
    ref: "User",
  },
  assignedPoliceOfficer: {
    type: Schema.Types.ObjectId,
    ref: "User",
  },
  status: {
    type: String,
    enum: EMERGENCY_STATUSES,
    default: "REPORTED",
  },
  statusTimestamps: {
    type: Map,
    of: Date,
    default: () => new Map(),
  },
  responseType: {
    type: String,
    enum: RESPONSE_TYPES,
    default: "AMBULANCE_EMERGENCY",
  },
  linkedAppointmentId: {
    type: Schema.Types.ObjectId,
    ref: "Appointment",
  },
  notes: {
    type: String,
    trim: true,
  },
  cancelledReason: {
    type: String,
    trim: true,
  },
  victimPhoto: {
    type: String,
    trim: true,
  },
  reporterMode: {
    type: String,
    enum: ["SELF", "OTHER"],
    trim: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

emergencyCaseSchema.pre("save", function (next) {
  this.updatedAt = new Date();

  if (!this.statusTimestamps) {
    this.statusTimestamps = new Map();
  }

  if (this.status && !this.statusTimestamps.has(this.status)) {
    this.statusTimestamps.set(this.status, new Date());
  }

  next();
});

emergencyCaseSchema.statics.INCIDENT_TYPES = INCIDENT_TYPES;
emergencyCaseSchema.statics.SEVERITY_LEVELS = SEVERITY_LEVELS;
emergencyCaseSchema.statics.STATUSES = EMERGENCY_STATUSES;
emergencyCaseSchema.statics.RESPONSE_TYPES = RESPONSE_TYPES;

const EmergencyCase = mongoose.models.EmergencyCase || mongoose.model("EmergencyCase", emergencyCaseSchema);

module.exports = EmergencyCase;

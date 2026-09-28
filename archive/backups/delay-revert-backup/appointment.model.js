const mongoose = require("mongoose");

const { Schema } = mongoose;

const appointmentSchema = new Schema({
  patientId: {
    type: Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  doctorId: {
    type: Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  date: {
    type: Date,
    required: true,
  },
  time: {
    type: String,
    required: true,
  },
  reason: {
    type: String,
  },
  status: {
    type: String,
    enum: ["pending", "approved", "rejected", "completed", "cancelled", "expired"],
    default: "pending",
  },
  isEmergency: {
    type: Boolean,
    default: false,
  },
  emergencyReason: {
    type: String,
  },
  priority: {
    type: Number,
    default: 0, // 0 for normal, higher for emergency
  },
  originalDoctorId: {
    type: Schema.Types.ObjectId,
    ref: "User",
  },
  allocatedBySystem: {
    type: Boolean,
    default: false,
  },
  reallocationAccepted: {
    type: String,
    enum: ["pending", "accepted", "rejected"],
    default: "pending",
  },
  delayRequestStatus: {
    type: String,
    enum: ["none", "pending", "accepted", "rejected"],
    default: "none",
  },
  delayReason: {
    type: String,
  },
  delayMessage: {
    type: String,
  },
  proposedTime: {
    type: String,
  },
  delayRequestedAt: {
    type: Date,
  },
  lastDoctorActionAt: {
    type: Date,
  },
  rating: {
    type: Number,
    min: 1,
    max: 5,
  },
  review: {
    type: String,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

const Appointment = mongoose.model("Appointment", appointmentSchema);

module.exports = Appointment;

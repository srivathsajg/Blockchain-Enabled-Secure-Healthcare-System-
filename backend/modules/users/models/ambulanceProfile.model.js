const mongoose = require("mongoose");

const ambulanceProfileSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    unique: true,
  },
  employeeId: {
    type: String,
    required: true,
    unique: true,
    trim: true,
  },
  drivingLicenseNumber: {
    type: String,
    required: true,
    unique: true,
    trim: true,
  },
  licenseExpiryDate: {
    type: Date,
    required: true,
  },
  hospitalOrOrganization: {
    type: String,
    required: true,
    trim: true,
  },
  ambulanceVehicleNumber: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    uppercase: true,
  },
  ambulanceType: {
    type: String,
    required: true,
    enum: ["BLS", "ALS", "PATIENT_TRANSPORT", "OTHER"],
    default: "BLS",
  },
  yearsOfExperience: {
    type: Number,
    min: 0,
    default: 0,
  },
  emergencyContactNumber: {
    type: String,
    trim: true,
  },
  availabilityStatus: {
    type: String,
    enum: ["AVAILABLE", "OFF_DUTY", "ON_CALL"],
    default: "AVAILABLE",
  },
  lastLocationUpdate: {
    type: Date,
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

// Update timestamp on save
ambulanceProfileSchema.pre("save", function (next) {
  this.updatedAt = new Date();
  next();
});

const AmbulanceProfile = mongoose.model("AmbulanceProfile", ambulanceProfileSchema);

module.exports = AmbulanceProfile;

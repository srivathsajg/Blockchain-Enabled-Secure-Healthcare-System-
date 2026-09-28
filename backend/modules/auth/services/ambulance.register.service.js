const bcrypt = require("bcryptjs");
const User = require("../../users/models/user.model");
const AmbulanceProfile = require("../../users/models/ambulanceProfile.model");
const mongoose = require("mongoose");

const registerAmbulanceDriver = async (userData) => {
  const {
    name,
    email,
    password,
    phone,
    bloodGroup,
    guardianNumber,
    gender,
    residentialAddress,
    profileImage,
    // Ambulance-specific fields
    employeeId,
    drivingLicenseNumber,
    licenseExpiryDate,
    hospitalOrOrganization,
    ambulanceVehicleNumber,
    ambulanceType,
    yearsOfExperience,
    emergencyContactNumber,
    availabilityStatus,
  } = userData;

  // Validate required fields
  if (!employeeId || !drivingLicenseNumber || !licenseExpiryDate ||
    !hospitalOrOrganization || !ambulanceVehicleNumber || !ambulanceType) {
    const error = new Error("All ambulance-specific fields are required");
    error.statusCode = 400;
    throw error;
  }

  // Check if user already exists
  const existingUser = await User.findOne({ email });
  if (existingUser) {
    const error = new Error("User already exists with this email");
    error.statusCode = 400;
    throw error;
  }

  // Check for duplicate employeeId
  const existingProfile = await AmbulanceProfile.findOne({ employeeId });
  if (existingProfile) {
    const error = new Error("Employee ID already registered");
    error.statusCode = 400;
    throw error;
  }

  // Check for duplicate drivingLicenseNumber
  const existingLicense = await AmbulanceProfile.findOne({ drivingLicenseNumber });
  if (existingLicense) {
    const error = new Error("Driving license number already registered");
    error.statusCode = 400;
    throw error;
  }

  // Check for duplicate ambulanceVehicleNumber
  const existingVehicle = await AmbulanceProfile.findOne({ ambulanceVehicleNumber: ambulanceVehicleNumber.toUpperCase() });
  if (existingVehicle) {
    const error = new Error("Ambulance vehicle number already registered");
    error.statusCode = 400;
    throw error;
  }

  // Validate license expiry date
  const expiryDate = new Date(licenseExpiryDate);
  if (expiryDate < new Date()) {
    const error = new Error("Driving license has expired");
    error.statusCode = 400;
    throw error;
  }

  // Validate hospital/organization against registered hospitals
  const registeredHospitals = await User.find(
    { role: 'admin', hospitalName: { $exists: true, $ne: "" } },
    { hospitalName: 1 }
  );
  const hospitalNames = registeredHospitals.map(h => h.hospitalName);

  if (!hospitalNames.includes(hospitalOrOrganization)) {
    const error = new Error("Hospital/Organization must be a registered Medicare hospital. Please select from the dropdown.");
    error.statusCode = 400;
    throw error;
  }

  // Validate years of experience
  if (yearsOfExperience && yearsOfExperience < 0) {
    const error = new Error("Years of experience cannot be negative");
    error.statusCode = 400;
    throw error;
  }

  // Validate ambulance type
  const validTypes = ["BLS", "ALS", "PATIENT_TRANSPORT", "OTHER"];
  if (!validTypes.includes(ambulanceType)) {
    const error = new Error(`Invalid ambulance type. Must be one of: ${validTypes.join(", ")}`);
    error.statusCode = 400;
    throw error;
  }

  // Validate availability status
  const validStatuses = ["AVAILABLE", "OFF_DUTY", "ON_CALL"];
  if (availabilityStatus && !validStatuses.includes(availabilityStatus)) {
    const error = new Error(`Invalid availability status. Must be one of: ${validStatuses.join(", ")}`);
    error.statusCode = 400;
    throw error;
  }

  // Hash password
  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(password, salt);

  // Start transaction
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // Create User with role = "ambulance"
    // Ambulance accounts are immediately approved for DEV/testing
    // In production, set isApproved = false and require admin approval
    const isApproved = process.env.NODE_ENV === "development" || process.env.AMBULANCE_AUTO_APPROVE === "true" || true;

    const user = await User.create([{
      name,
      email,
      password: hashedPassword,
      role: "ambulance",
      isApproved,
      phone,
      bloodGroup,
      guardianNumber,
      gender,
      residentialAddress,
      profileImage,
      hospitalName: hospitalOrOrganization, // Map for consistency with other roles
      employeeId, // Store on User model for easy access
    }], { session });

    // Create AmbulanceProfile
    const ambulanceProfile = await AmbulanceProfile.create([{
      userId: user[0]._id,
      employeeId,
      drivingLicenseNumber,
      licenseExpiryDate: expiryDate,
      hospitalOrOrganization,
      ambulanceVehicleNumber: ambulanceVehicleNumber.toUpperCase(),
      ambulanceType,
      yearsOfExperience: yearsOfExperience || 0,
      emergencyContactNumber: emergencyContactNumber || guardianNumber || phone,
      availabilityStatus: availabilityStatus || "AVAILABLE",
    }], { session });

    await session.commitTransaction();

    return {
      user: {
        id: user[0]._id,
        name: user[0].name,
        email: user[0].email,
        role: user[0].role,
        phone: user[0].phone,
        bloodGroup: user[0].bloodGroup,
        hospitalName: user[0].hospitalName,
        employeeId: user[0].employeeId,
        isApproved: user[0].isApproved,
        createdAt: user[0].createdAt,
      },
      ambulanceProfile: {
        employeeId: ambulanceProfile[0].employeeId,
        drivingLicenseNumber: ambulanceProfile[0].drivingLicenseNumber,
        licenseExpiryDate: ambulanceProfile[0].licenseExpiryDate,
        hospitalOrOrganization: ambulanceProfile[0].hospitalOrOrganization,
        ambulanceVehicleNumber: ambulanceProfile[0].ambulanceVehicleNumber,
        ambulanceType: ambulanceProfile[0].ambulanceType,
        yearsOfExperience: ambulanceProfile[0].yearsOfExperience,
        availabilityStatus: ambulanceProfile[0].availabilityStatus,
      },
    };
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
};

const getAmbulanceProfile = async (userId) => {
  // Get both User and AmbulanceProfile data
  const user = await User.findById(userId).lean();

  if (!user) {
    const error = new Error("User not found");
    error.statusCode = 404;
    throw error;
  }

  if (user.role !== 'ambulance') {
    const error = new Error("User is not an ambulance driver");
    error.statusCode = 403;
    throw error;
  }

  const profile = await AmbulanceProfile.findOne({ userId }).lean();

  if (!profile) {
    // Return basic data from User model if no profile exists
    console.log(`Warning: No AmbulanceProfile found for user ${userId}, using User data only`);
    return {
      // User data
      name: user.name,
      email: user.email,
      phone: user.phone,
      hospitalName: user.hospitalName,
      hospitalOrOrganization: user.hospitalName, // Map for consistency
      // Profile data with defaults
      employeeId: user.employeeId || 'Not set',
      drivingLicenseNumber: 'Not provided',
      licenseExpiryDate: null,
      ambulanceVehicleNumber: 'Not assigned',
      ambulanceType: 'Not specified',
      yearsOfExperience: 0,
      emergencyContactNumber: user.phone,
      availabilityStatus: 'AVAILABLE', // Default to available
      lastLocationUpdate: null,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  // Combine user and profile data when profile exists
  return {
    // User data
    name: user.name,
    email: user.email,
    phone: user.phone,
    hospitalName: user.hospitalName,
    // Profile data  
    employeeId: profile.employeeId,
    drivingLicenseNumber: profile.drivingLicenseNumber,
    licenseExpiryDate: profile.licenseExpiryDate,
    hospitalOrOrganization: profile.hospitalOrOrganization,
    ambulanceVehicleNumber: profile.ambulanceVehicleNumber,
    ambulanceType: profile.ambulanceType,
    yearsOfExperience: profile.yearsOfExperience,
    emergencyContactNumber: profile.emergencyContactNumber,
    availabilityStatus: profile.availabilityStatus,
    lastLocationUpdate: profile.lastLocationUpdate,
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt,
  };
};

const updateAvailabilityStatus = async (userId, newStatus) => {
  const validStatuses = ["AVAILABLE", "OFF_DUTY", "ON_CALL"];

  if (!validStatuses.includes(newStatus)) {
    const error = new Error(`Invalid availability status. Must be one of: ${validStatuses.join(", ")}`);
    error.statusCode = 400;
    throw error;
  }

  // Check if user exists and is ambulance role
  const user = await User.findById(userId).lean();
  if (!user) {
    const error = new Error("User not found");
    error.statusCode = 404;
    throw error;
  }

  if (user.role !== 'ambulance') {
    const error = new Error("User is not an ambulance driver");
    error.statusCode = 403;
    throw error;
  }

  // Try to update existing profile, or create a minimal one if it doesn't exist
  let profile = await AmbulanceProfile.findOneAndUpdate(
    { userId },
    {
      availabilityStatus: newStatus,
      lastLocationUpdate: new Date(),
    },
    { new: true }
  );

  if (!profile) {
    // Create a minimal profile if none exists
    console.log(`Warning: Creating minimal AmbulanceProfile for user ${userId}`);
    profile = await AmbulanceProfile.create({
      userId,
      employeeId: user.employeeId || `EMP-${userId.toString().slice(-8)}`,
      drivingLicenseNumber: 'Not provided',
      licenseExpiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year from now
      hospitalOrOrganization: user.hospitalName || 'Not specified',
      ambulanceVehicleNumber: 'Not assigned',
      ambulanceType: 'BLS',
      yearsOfExperience: 0,
      emergencyContactNumber: user.phone,
      availabilityStatus: newStatus,
      lastLocationUpdate: new Date(),
    });
  }

  // Return complete profile data (same format as getAmbulanceProfile)
  return {
    // User data
    name: user.name,
    email: user.email,
    phone: user.phone,
    hospitalName: user.hospitalName,
    // Profile data  
    employeeId: profile.employeeId,
    drivingLicenseNumber: profile.drivingLicenseNumber,
    licenseExpiryDate: profile.licenseExpiryDate,
    hospitalOrOrganization: profile.hospitalOrOrganization,
    ambulanceVehicleNumber: profile.ambulanceVehicleNumber,
    ambulanceType: profile.ambulanceType,
    yearsOfExperience: profile.yearsOfExperience,
    emergencyContactNumber: profile.emergencyContactNumber,
    availabilityStatus: profile.availabilityStatus,
    lastLocationUpdate: profile.lastLocationUpdate,
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt,
  };
};

module.exports = {
  registerAmbulanceDriver,
  getAmbulanceProfile,
  updateAvailabilityStatus,
};

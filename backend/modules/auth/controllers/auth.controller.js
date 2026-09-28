const { registerUser, loginUser, updateUserProfile } = require("../services/auth.service");
const { logAction } = require("../../../modules/audit/service");
const socket = require("../../../core/socket");
const User = require("../../../modules/users/models/user.model");

const getHospitals = async (req, res, next) => {
  try {
    const hospitals = await User.find(
      { role: 'admin', hospitalName: { $exists: true, $ne: "" } },
      { hospitalName: 1, hospitalAddress: 1, hospitalPricing: 1, _id: 1 }
    );
    res.json({ success: true, data: hospitals });
  } catch (error) {
    next(error);
  }
};

const register = async (req, res, next) => {
  try {
    console.log("Register API Hit");
    console.log("Incoming Body:", req.body);
    console.log("Incoming Files:", req.files);

    const { 
      name, 
      email, 
      password, 
      role,
      phone,
      dob,
      bloodGroup,
      hospitalName,
      hospitalAddress,
      specialization,
      licenseNumber,
      pharmacyName,
      adminCode,
      // New fields
      guardianNumber,
      gender,
      residentialAddress,
      height,
      weight,
      insuranceProviderName,
      policyNumber,
      validTillDate,
      qualification,
      experience,
      bio,
      employeeId,
      assignedWard
    } = req.body;

    // Process file uploads
    const files = req.files || {};
    const pastLabReports = files.pastLabReports ? files.pastLabReports.map(f => f.path) : [];
    const insuranceProofImage = files.insuranceProofImage ? files.insuranceProofImage[0].path : undefined;
    const achievementCertificates = files.achievementCertificates ? files.achievementCertificates.map(f => f.path) : [];
    const medicalLicenseProof = files.medicalLicenseProof ? files.medicalLicenseProof[0].path : undefined;
    const profileImage = files.profileImage ? files.profileImage[0].path : undefined;

    console.log("Processing registration for:", email, role);

    const result = await registerUser({ 
      name, 
      email, 
      password, 
      role,
      phone,
      dob,
      bloodGroup,
      hospitalName,
      hospitalAddress,
      specialization,
      licenseNumber,
      pharmacyName,
      adminCode,
      // New fields
      guardianNumber,
      gender,
      residentialAddress,
      height,
      weight,
      insuranceProviderName,
      policyNumber,
      validTillDate,
      qualification,
      experience,
      bio,
      employeeId,
      assignedWard,
      // Files
      pastLabReports,
      insuranceProofImage,
      achievementCertificates,
      medicalLicenseProof,
      profileImage
    });

    console.log("Registration successful for:", email);

    await logAction({
      userId: result.user.id,
      role: result.user.role,
      action: "REGISTER",
      module: "AUTH",
      targetId: result.user.id,
      ipAddress: req.ip,
    });


    try {
      const io = socket.getIO();
      io.emit("user-registered", {
        userId: result.user.id,
        role: result.user.role,
        email: result.user.email
      });
    } catch (socketErr) {
      console.warn("Socket notification failed for user register:", socketErr.message);
    }

    res.status(201).json({
      success: true,
      token: result.token,
      user: result.user,
    });
  } catch (error) {
    next(error);
  }
};

const login = async (req, res, next) => {
  try {
    const { identifier, password } = req.body;
    console.log("Login Request Body:", req.body);

    const result = await loginUser({ identifier, password });
    console.log("Login User Found:", result.user.email);

    await logAction({
      userId: result.user.id,
      role: result.user.role,
      action: "LOGIN",
      module: "AUTH",
      targetId: result.user.id,
      ipAddress: req.ip,
    });

    res.status(200).json({
      success: true,
      token: result.token,
      user: result.user,
    });
  } catch (error) {
    next(error);
  }
};

const updateProfile = async (req, res, next) => {
  try {
    const { 
      name, 
      phone, 
      gender, 
      address, 
      hospitalAddress,
      generalWardPrice,
      icuPrice,
      emergencyPrice,
      pediatricPrice,
      surgicalPrice,
      doctorFee,
      deluxePrice,
      semiPrivatePrice,
      privatePrice,
      isolationPrice,
      nicuPrice,
      nursingPrice,
      rmoFeePrice,
      physiotherapyPrice,
      otChargesPrice,
      laborRoomPrice,
      ambulancePrice,
      ambulanceAdvancedPrice,
      dialysisPrice,
      xrayPrice,
      ecgPrice,
      ultrasoundPrice,
      ctScanPrice,
      mriPrice,
      registrationPrice,
      pharmacyHandlingPrice,
      // Health metrics
      weight,
      height,
      bloodGroup,
      guardianNumber,
      dob,
      bio
    } = req.body;

    const rawSoundEnabled =
      req.body["notificationPreferences.soundEnabled"] ??
      req.body.notificationPreferences?.soundEnabled;
    const rawSoundVolume =
      req.body["notificationPreferences.soundVolume"] ??
      req.body.notificationPreferences?.soundVolume;

    const notificationPreferences =
      rawSoundEnabled !== undefined || rawSoundVolume !== undefined
        ? {
            soundEnabled:
              rawSoundEnabled !== undefined ? rawSoundEnabled : undefined,
            soundVolume:
              rawSoundVolume !== undefined ? rawSoundVolume : undefined,
          }
        : undefined;

    const userId = req.user.id;
    let profileImage;
    let signature;
    let achievementCertificates;

    if (req.files) {
      if (req.files.profileImage) {
        profileImage = req.files.profileImage[0].path;
      }
      if (req.files.signature) {
        signature = req.files.signature[0].path;
      }
      if (req.files.achievementCertificates) {
        achievementCertificates = req.files.achievementCertificates.map(f => f.path);
      }
    }

    const updatedUser = await updateUserProfile(userId, { 
      name, 
      phone, 
      profileImage, 
      signature,
      achievementCertificates,
      gender, 
      residentialAddress: address, 
      hospitalAddress,
      hospitalPricing: {
        general: generalWardPrice,
        icu: icuPrice,
        emergency: emergencyPrice,
        pediatric: pediatricPrice,
        surgical: surgicalPrice,
        doctorFee: doctorFee,
        deluxe: deluxePrice,
        semiPrivate: semiPrivatePrice,
        private: privatePrice,
        isolation: isolationPrice,
        nicu: nicuPrice,
        nursing: nursingPrice,
        rmoFee: rmoFeePrice,
        physiotherapy: physiotherapyPrice,
        otCharges: otChargesPrice,
        laborRoom: laborRoomPrice,
        ambulance: ambulancePrice,
        ambulanceAdvanced: ambulanceAdvancedPrice,
        dialysis: dialysisPrice,
        xray: xrayPrice,
        ecg: ecgPrice,
        ultrasound: ultrasoundPrice,
        ctScan: ctScanPrice,
        mri: mriPrice,
        registration: registrationPrice,
        pharmacyHandling: pharmacyHandlingPrice,
      },
      weight,
      height,
      bloodGroup,
      guardianNumber,
      dob,
      bio,
      notificationPreferences,
    });

    await logAction({
      userId,
      role: req.user.role,
      action: "UPDATE_PROFILE",
      module: "AUTH",
      targetId: userId,
      ipAddress: req.ip,
    });

    res.status(200).json({
      success: true,
      user: updatedUser,
    });
  } catch (error) {
    next(error);
  }
};

const getProfile = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id).select("-password");
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }
    res.status(200).json({ success: true, data: user });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getHospitals,
  register,
  login,
  updateProfile,
  getProfile,
};

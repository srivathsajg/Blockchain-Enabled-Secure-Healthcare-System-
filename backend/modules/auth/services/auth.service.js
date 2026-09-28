const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const User = require("../../users/models/user.model");

const generateToken = (user) => {
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    throw new Error("JWT_SECRET is not defined");
  }

  return jwt.sign(
    {
      id: user._id,
      role: user.role,
      email: user.email,
    },
    secret,
    {
      expiresIn: "7d",
    }
  );
};

const registerUser = async (userData) => {
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
    pastLabReports,
    insuranceProofImage,
    achievementCertificates,
    medicalLicenseProof,
    profileImage
  } = userData;

  const existing = await User.findOne({ email });

  if (existing) {
    const error = new Error("User already exists");
    error.statusCode = 400;
    throw error;
  }

  const adminUsers = await User.find({ role: 'admin', hospitalName: { $exists: true, $ne: "" } });
  const allowedHospitals = adminUsers.map(u => u.hospitalName);

  if (role === "doctor" || role === "pharmacist" || role === "lab_technician" || role === "delivery") {
    if (!hospitalName || !allowedHospitals.includes(hospitalName)) {
      const error = new Error("Registration restricted to authorized hospitals. Please contact your hospital administrator.");
      error.statusCode = 403;
      throw error;
    }
  }

  // Doctors, Pharmacists, Lab Technicians, and Delivery staff require admin approval
  const isApproved = role !== "doctor" && role !== "pharmacist" && role !== "lab_technician" && role !== "delivery";

  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(password, salt);

  const user = await User.create({
    name,
    email,
    password: hashedPassword,
    role,
    isApproved,
    phone,
    dob,
    bloodGroup,
    hospitalName,
    hospitalAddress,
    specialization,
    licenseNumber,
    pharmacyName,
    adminCode,
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
    pastLabReports,
    insuranceProofImage,
    achievementCertificates,
    medicalLicenseProof,
    profileImage
  });

  const token = generateToken(user);

  return {
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      phone: user.phone,
      dob: user.dob,
      bloodGroup: user.bloodGroup,
      hospitalName: user.hospitalName,
      specialization: user.specialization,
      licenseNumber: user.licenseNumber,
      pharmacyName: user.pharmacyName,
      adminCode: user.adminCode,
      createdAt: user.createdAt,
    },
    token,
  };
};

const loginUser = async ({ identifier, password }) => {
  console.log("Searching user with identifier:", identifier);
  const user = await User.findOne({
    $or: [{ email: identifier }, { phone: identifier }],
  });

  if (!user) {
    console.log("No user found with identifier:", identifier);
    const error = new Error("Invalid credentials");
    error.statusCode = 401;
    throw error;
  }

  const isMatch = await bcrypt.compare(password, user.password);
  console.log("Password comparison result:", isMatch);

  if (!isMatch) {
    const error = new Error("Invalid credentials");
    error.statusCode = 401;
    throw error;
  }

  if ((user.role === 'doctor' || user.role === 'pharmacist' || user.role === 'lab_technician' || user.role === 'delivery') && !user.isApproved) {
    const error = new Error("Your account is pending approval by hospital admin.");
    error.statusCode = 403;
    throw error;
  }

  const token = generateToken(user);

  return {
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      phone: user.phone,
      gender: user.gender,
      dob: user.dob,
      bloodGroup: user.bloodGroup,
      weight: user.weight,
      height: user.height,
      guardianNumber: user.guardianNumber,
      residentialAddress: user.residentialAddress,
      hospitalName: user.hospitalName,
      hospitalAddress: user.hospitalAddress,
      hospitalPricing: user.hospitalPricing,
      profileImage: user.profileImage,
      signature: user.signature,
      bio: user.bio,
      achievementCertificates: user.achievementCertificates || [],
      notificationPreferences: {
        soundEnabled: user.notificationPreferences?.soundEnabled !== false,
        soundVolume: typeof user.notificationPreferences?.soundVolume === 'number'
          ? user.notificationPreferences.soundVolume
          : 0.8,
      },
      createdAt: user.createdAt,
    },
    token,
  };
};

const updateUserProfile = async (userId, updateData) => {
  const user = await User.findById(userId);
  if (!user) {
    const error = new Error("User not found");
    error.statusCode = 404;
    throw error;
  }

  // Update allowed fields
  const allowedUpdates = [
    "name", 
    "phone", 
    "profileImage", 
    "gender", 
    "residentialAddress", 
    "hospitalAddress",
    "weight",
    "height",
    "bloodGroup",
    "guardianNumber",
    "dob",
    "bio",
    "signature",
    "achievementCertificates",
    "hospitalPricing",
    "notificationPreferences"
  ];
  Object.keys(updateData).forEach((key) => {
    if (allowedUpdates.includes(key) && updateData[key] !== undefined) {
      if (key === "hospitalPricing") {
        if (user.role !== "admin") {
          return;
        }

        user.hospitalPricing = {
          general: Number(updateData[key].general) || user.hospitalPricing?.general || 1000,
          icu: Number(updateData[key].icu) || user.hospitalPricing?.icu || 5000,
          emergency: Number(updateData[key].emergency) || user.hospitalPricing?.emergency || 3000,
          pediatric: Number(updateData[key].pediatric) || user.hospitalPricing?.pediatric || 1500,
          surgical: Number(updateData[key].surgical) || user.hospitalPricing?.surgical || 2500,
          doctorFee: Number(updateData[key].doctorFee) || user.hospitalPricing?.doctorFee || 500,
          deluxe: Number(updateData[key].deluxe) || user.hospitalPricing?.deluxe || 4000,
          semiPrivate: Number(updateData[key].semiPrivate) || user.hospitalPricing?.semiPrivate || 2000,
          private: Number(updateData[key].private) || user.hospitalPricing?.private || 3000,
          isolation: Number(updateData[key].isolation) || user.hospitalPricing?.isolation || 3500,
          nicu: Number(updateData[key].nicu) || user.hospitalPricing?.nicu || 5500,
          nursing: Number(updateData[key].nursing) || user.hospitalPricing?.nursing || 300,
          rmoFee: Number(updateData[key].rmoFee) || user.hospitalPricing?.rmoFee || 200,
          physiotherapy: Number(updateData[key].physiotherapy) || user.hospitalPricing?.physiotherapy || 800,
          otCharges: Number(updateData[key].otCharges) || user.hospitalPricing?.otCharges || 10000,
          laborRoom: Number(updateData[key].laborRoom) || user.hospitalPricing?.laborRoom || 8000,
          ambulance: Number(updateData[key].ambulance) || user.hospitalPricing?.ambulance || 1500,
          ambulanceAdvanced: Number(updateData[key].ambulanceAdvanced) || user.hospitalPricing?.ambulanceAdvanced || 3000,
          dialysis: Number(updateData[key].dialysis) || user.hospitalPricing?.dialysis || 2500,
          xray: Number(updateData[key].xray) || user.hospitalPricing?.xray || 500,
          ecg: Number(updateData[key].ecg) || user.hospitalPricing?.ecg || 300,
          ultrasound: Number(updateData[key].ultrasound) || user.hospitalPricing?.ultrasound || 1200,
          ctScan: Number(updateData[key].ctScan) || user.hospitalPricing?.ctScan || 4500,
          mri: Number(updateData[key].mri) || user.hospitalPricing?.mri || 7000,
          registration: Number(updateData[key].registration) || user.hospitalPricing?.registration || 200,
          pharmacyHandling: Number(updateData[key].pharmacyHandling) || user.hospitalPricing?.pharmacyHandling || 50,
        };
        return;
      }

      if (key === "notificationPreferences") {
        const currentPrefs = user.notificationPreferences || { soundEnabled: true, soundVolume: 0.8 };
        const incoming = updateData[key] || {};
        const merged = {
          soundEnabled:
            incoming.soundEnabled !== undefined
              ? incoming.soundEnabled === true || incoming.soundEnabled === "true"
              : currentPrefs.soundEnabled !== false,
          soundVolume:
            incoming.soundVolume !== undefined
              ? Math.min(1, Math.max(0, Number(incoming.soundVolume) || 0.8))
              : Math.min(1, Math.max(0, Number(currentPrefs.soundVolume) || 0.8)),
        };
        user.notificationPreferences = merged;
        return;
      }

      user[key] = updateData[key];
    }
  });

  await user.save();

  const prefs = user.notificationPreferences || {};

  return {
    id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
    phone: user.phone,
    gender: user.gender,
    dob: user.dob,
    bloodGroup: user.bloodGroup,
    weight: user.weight,
    height: user.height,
    guardianNumber: user.guardianNumber,
    residentialAddress: user.residentialAddress,
    hospitalName: user.hospitalName,
    hospitalAddress: user.hospitalAddress,
    hospitalPricing: user.hospitalPricing,
    profileImage: user.profileImage,
    signature: user.signature,
    bio: user.bio,
    achievementCertificates: user.achievementCertificates || [],
    notificationPreferences: {
      soundEnabled: prefs.soundEnabled !== false,
      soundVolume: typeof prefs.soundVolume === "number" ? prefs.soundVolume : 0.8,
    },
  };
};

module.exports = {
  registerUser,
  loginUser,
  updateUserProfile,
};

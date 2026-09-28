const { 
  registerAmbulanceDriver, 
  getAmbulanceProfile, 
  updateAvailabilityStatus 
} = require("../services/ambulance.register.service");
const { generateToken } = require("../services/auth.service");
const jwt = require("jsonwebtoken");

// Generate JWT token (copied from auth.service.js to avoid circular dependency)
const generateJWT = (user) => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET is not defined");
  }
  return jwt.sign(
    {
      id: user._id || user.id,
      role: user.role,
      email: user.email,
    },
    secret,
    { expiresIn: "7d" }
  );
};

const registerAmbulance = async (req, res, next) => {
  try {
    const result = await registerAmbulanceDriver(req.body);
    
    const token = generateJWT(result.user);

    res.status(201).json({
      success: true,
      message: result.user.isApproved 
        ? "Ambulance driver registered successfully" 
        : "Registration successful. Your account is pending admin approval.",
      data: {
        user: result.user,
        ambulanceProfile: result.ambulanceProfile,
        token,
      },
    });
  } catch (error) {
    next(error);
  }
};

const getMyAmbulanceProfile = async (req, res, next) => {
  try {
    const profile = await getAmbulanceProfile(req.user.id);
    
    res.json({
      success: true,
      data: profile,
    });
  } catch (error) {
    next(error);
  }
};

const updateMyAvailability = async (req, res, next) => {
  try {
    const { status } = req.body;
    
    if (!status) {
      return res.status(400).json({
        success: false,
        message: "Status is required",
      });
    }

    const profile = await updateAvailabilityStatus(req.user.id, status);
    
    res.json({
      success: true,
      message: "Availability status updated successfully",
      data: profile,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  registerAmbulance,
  getMyAmbulanceProfile,
  updateMyAvailability,
};

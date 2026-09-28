const {
  createEmergencyCase: createEmergencyCaseService,
  getEmergencyCaseById: getEmergencyCaseByIdService,
  getAccessibleEmergencyCases: getAccessibleEmergencyCasesService,
  updateEmergencyStatus: updateEmergencyStatusService,
  updateEmergencyDetails: updateEmergencyDetailsService,
  updateAmbulanceLocation: updateAmbulanceLocationService,
  cancelEmergencyCase: cancelEmergencyCaseService,
} = require("./service");

const mongoose = require("mongoose");

const getIp = (req) => {
  return (
    req.ip ||
    (req.headers && req.headers["x-forwarded-for"]) ||
    (req.connection && req.connection.remoteAddress) ||
    "127.0.0.1"
  );
};

const createEmergencyCase = async (req, res, next) => {
  try {
    const data = req.body || {};

    if (!data.incidentType) {
      return res.status(400).json({
        success: false,
        message: "incidentType is required",
      });
    }
    if (!data.severity) {
      return res.status(400).json({
        success: false,
        message: "severity is required",
      });
    }

    const result = await createEmergencyCaseService({
      user: req.user,
      data,
      ipAddress: getIp(req),
    });

    res.status(201).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

const getEmergencyCaseById = async (req, res, next) => {
  try {
    const { id } = req.params;

    const result = await getEmergencyCaseByIdService({
      user: req.user,
      id,
      ipAddress: getIp(req),
    });

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

const getMyEmergencyCases = async (req, res, next) => {
  try {
    const filters = {
      status: req.query.status,
      severity: req.query.severity,
      incidentType: req.query.incidentType,
      assignedHospital: req.query.assignedHospital,
    };

    const result = await getAccessibleEmergencyCasesService({
      user: req.user,
      filters,
    });

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

const updateEmergencyStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status, cancelledReason } = req.body;

    if (!status) {
      return res.status(400).json({
        success: false,
        message: "status is required",
      });
    }

    const result = await updateEmergencyStatusService({
      user: req.user,
      id,
      newStatus: status,
      cancelledReason,
      ipAddress: getIp(req),
    });

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

const updateEmergencyDetails = async (req, res, next) => {
  try {
    const { id } = req.params;
    const data = req.body || {};

    const result = await updateEmergencyDetailsService({
      user: req.user,
      id,
      data,
      ipAddress: getIp(req),
    });

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

const cancelEmergencyCase = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { cancelledReason } = req.body || {};

    const result = await cancelEmergencyCaseService({
      user: req.user,
      id,
      cancelledReason,
      ipAddress: getIp(req),
    });

    res.json({
      success: true,
      message: "Emergency case cancelled",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

// ── Ambulance-specific controllers ──────────────────────────────────

const getAvailableAmbulanceEmergencies = async (req, res, next) => {
  try {
    const EmergencyCase = require("./models/emergencyCase.model");

    // Get cases with status AMBULANCE_REQUESTED (available for acceptance)
    const cases = await EmergencyCase.find({
      status: "AMBULANCE_REQUESTED",
      responseType: { $in: ["AMBULANCE_EMERGENCY", undefined] },
    })
      .populate("patient", "name phone bloodGroup")
      .populate("reportedBy", "name role")
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      data: cases,
    });
  } catch (error) {
    next(error);
  }
};

const getAssignedAmbulanceEmergencies = async (req, res, next) => {
  try {
    const EmergencyCase = require("./models/emergencyCase.model");
    const ambulanceId = req.user.id;

    // Get cases assigned to this ambulance
    const cases = await EmergencyCase.find({
      assignedAmbulance: ambulanceId,
      status: {
        $in: [
          "AMBULANCE_ASSIGNED",
          "AMBULANCE_ARRIVED",
          "PATIENT_IDENTIFIED",
          "IN_TRANSIT",
        ],
      },
    })
      .populate("patient", "name phone bloodGroup")
      .populate("reportedBy", "name role")
      .populate("assignedHospital", "name address")
      .sort({ updatedAt: -1 });

    res.status(200).json({
      success: true,
      data: cases,
    });
  } catch (error) {
    next(error);
  }
};

const acceptEmergencyCase = async (req, res, next) => {
  try {
    const EmergencyCase = require("./models/emergencyCase.model");
    const { logAction } = require("../../modules/audit/service");
    const caseId = req.params.id;
    const ambulanceId = req.user.id;

    // Atomic update: only accept if status is still AMBULANCE_REQUESTED
    const emergencyCase = await EmergencyCase.findOneAndUpdate(
      {
        _id: caseId,
        status: "AMBULANCE_REQUESTED",
        $or: [
          { assignedAmbulance: { $exists: false } },
          { assignedAmbulance: null },
        ],
      },
      {
        $set: {
          assignedAmbulance: ambulanceId,
          status: "AMBULANCE_ASSIGNED",
          [`statusTimestamps.AMBULANCE_ASSIGNED`]: new Date(),
        },
      },
      { new: true }
    )
      .populate("patient", "name phone bloodGroup")
      .populate("assignedHospital", "name address");

    if (!emergencyCase) {
      return res.status(409).json({
        success: false,
        message: "Emergency case already assigned or not available",
      });
    }

    await logAction({
      userId: req.user.id,
      role: req.user.role,
      action: "EMERGENCY_ACCEPTED",
      module: "EMERGENCY",
      targetId: caseId,
      ipAddress: getIp(req),
    });

    // Emit socket events
    try {
      const socket = require("../../core/socket");
      const io = socket.getIO();
      const payload = {
        caseId,
        emergencyCaseId: caseId,
        ambulanceId,
        status: "AMBULANCE_ASSIGNED",
      };
      io.emit("ambulance-assigned", payload);
      io.emit("emergency-status-updated", payload);
      io.emit("emergency-updated", payload);
    } catch (socketErr) {
      console.warn("Socket notification failed:", socketErr.message);
    }

    res.status(200).json({
      success: true,
      data: emergencyCase,
    });
  } catch (error) {
    next(error);
  }
};

const identifyPatientByQR = async (req, res, next) => {
  try {
    const EmergencyCase = require("./models/emergencyCase.model");
    const { logAction } = require("../../modules/audit/service");
    const jwt = require("jsonwebtoken");

    const caseId = req.params.id;
    const { qrToken } = req.body;

    if (!qrToken) {
      return res.status(400).json({
        success: false,
        message: "QR token is required",
      });
    }

    let decoded;
    try {
      decoded = jwt.verify(qrToken, process.env.JWT_SECRET);
    } catch (err) {
      return res.status(401).json({
        success: false,
        message: "Invalid or expired QR code",
      });
    }

    const patientId = decoded.userId;

    const existingCase = await EmergencyCase.findOne({
      _id: caseId,
      assignedAmbulance: req.user.id,
      status: { $in: ["AMBULANCE_ASSIGNED", "AMBULANCE_ARRIVED"] },
    });

    if (!existingCase) {
      return res.status(404).json({
        success: false,
        message: "Emergency case not found or not assigned to you",
      });
    }

    if (existingCase.patient && existingCase.patient.toString() !== patientId) {
      return res.status(409).json({
        success: false,
        message: "This emergency case is already assigned to a different patient",
      });
    }

    const emergencyCase = await EmergencyCase.findOneAndUpdate(
      {
        _id: caseId,
        assignedAmbulance: req.user.id,
        status: { $in: ["AMBULANCE_ASSIGNED", "AMBULANCE_ARRIVED"] },
      },
      {
        $set: {
          patient: patientId,
          status: "PATIENT_IDENTIFIED",
          [`statusTimestamps.PATIENT_IDENTIFIED`]: new Date(),
        },
      },
      { new: true }
    );

    if (!emergencyCase) {
      return res.status(404).json({
        success: false,
        message: "Emergency case not found or not assigned to you",
      });
    }

    await logAction({
      userId: req.user.id,
      role: req.user.role,
      action: "PATIENT_IDENTIFIED_QR",
      module: "EMERGENCY",
      targetId: caseId,
      ipAddress: getIp(req),
    });

    try {
      const socket = require("../../core/socket");
      const io = socket.getIO();
      const payload = {
        emergencyCaseId: String(caseId),
        status: "PATIENT_IDENTIFIED",
        patientId: String(patientId),
      };
      io.emit("emergency-status-updated", payload);
      io.to(String(req.user.id)).emit("emergency-status-updated", payload);
    } catch (socketErr) {
      console.warn("Patient QR status socket failed:", socketErr.message);
    }

    res.status(200).json({
      success: true,
      data: emergencyCase,
      message: "Patient identified successfully",
    });
  } catch (error) {
    next(error);
  }
};

const searchEmergencyCasePatients = async (req, res, next) => {
  try {
    const EmergencyCase = require("./models/emergencyCase.model");
    const User = require("../users/models/user.model");

    const caseId = req.params.id;
    const query = (req.query.query || "").trim();

    if (!query) {
      return res.status(400).json({
        success: false,
        message: "Search query is required",
      });
    }

    const emergencyCase = await EmergencyCase.findOne({
      _id: caseId,
      assignedAmbulance: req.user.id,
      status: { $in: ["AMBULANCE_ASSIGNED", "AMBULANCE_ARRIVED"] },
    });

    if (!emergencyCase) {
      return res.status(404).json({
        success: false,
        message: "Emergency case not found or not assigned to you",
      });
    }

    const searchValue = query.toString();
    const searchConditions = [
      { name: { $regex: searchValue, $options: "i" } },
      { phone: { $regex: searchValue, $options: "i" } },
      { email: { $regex: searchValue, $options: "i" } },
    ];

    if (mongoose.Types.ObjectId.isValid(searchValue)) {
      searchConditions.push({ _id: new mongoose.Types.ObjectId(searchValue) });
    }

    const patients = await User.find({
      role: "patient",
      $or: searchConditions,
    })
      .select("_id name phone email bloodGroup gender dob")
      .limit(10)
      .lean();

    res.status(200).json({
      success: true,
      data: patients,
    });
  } catch (error) {
    next(error);
  }
};

const confirmManualPatientIdentification = async (req, res, next) => {
  try {
    const EmergencyCase = require("./models/emergencyCase.model");
    const User = require("../users/models/user.model");
    const { logAction } = require("../../modules/audit/service");

    const caseId = req.params.id;
    const { patientId } = req.body || {};

    if (!patientId) {
      return res.status(400).json({
        success: false,
        message: "Patient selection is required",
      });
    }

    const emergencyCase = await EmergencyCase.findOne({
      _id: caseId,
      assignedAmbulance: req.user.id,
      status: { $in: ["AMBULANCE_ASSIGNED", "AMBULANCE_ARRIVED"] },
    });

    if (!emergencyCase) {
      return res.status(404).json({
        success: false,
        message: "Emergency case not found or not assigned to you",
      });
    }

    if (emergencyCase.patient && emergencyCase.patient.toString() !== patientId) {
      return res.status(409).json({
        success: false,
        message: "This emergency case is already assigned to a different patient",
      });
    }

    const patient = await User.findOne({
      _id: patientId,
      role: "patient",
    }).select("_id name phone email bloodGroup gender dob");

    if (!patient) {
      return res.status(404).json({
        success: false,
        message: "Selected patient not found",
      });
    }

    if (emergencyCase.patient && emergencyCase.patient.toString() !== patientId) {
      return res.status(409).json({
        success: false,
        message: "Selected patient does not match the active emergency case",
      });
    }

    const updatedCase = await EmergencyCase.findOneAndUpdate(
      {
        _id: caseId,
        assignedAmbulance: req.user.id,
        status: { $in: ["AMBULANCE_ASSIGNED", "AMBULANCE_ARRIVED"] },
      },
      {
        $set: {
          patient: patientId,
          status: "PATIENT_IDENTIFIED",
          [`statusTimestamps.PATIENT_IDENTIFIED`]: new Date(),
        },
      },
      { new: true }
    );

    await logAction({
      userId: req.user.id,
      role: req.user.role,
      action: "PATIENT_IDENTIFIED_MANUAL",
      module: "EMERGENCY",
      targetId: caseId,
      ipAddress: getIp(req),
      details: {
        patientId: String(patientId),
      },
    });

    try {
      const socket = require("../../core/socket");
      const io = socket.getIO();
      const payload = {
        emergencyCaseId: String(caseId),
        status: "PATIENT_IDENTIFIED",
        patientId: String(patientId),
      };
      io.emit("emergency-status-updated", payload);
      io.to(String(req.user.id)).emit("emergency-status-updated", payload);
    } catch (socketErr) {
      console.warn("Manual patient status socket failed:", socketErr.message);
    }

    res.status(200).json({
      success: true,
      data: updatedCase,
      message: "Patient identity confirmed successfully",
    });
  } catch (error) {
    next(error);
  }
};

const getEmergencyMedicalProfile = async (req, res, next) => {
  try {
    const EmergencyCase = require("./models/emergencyCase.model");
    const PatientProfile = require("../../modules/patient/models/patient.model");
    const User = require("../../modules/auth/models/User.model");

    const caseId = req.params.id;

    // Verify the ambulance is assigned to this case
    const emergencyCase = await EmergencyCase.findOne({
      _id: caseId,
      $or: [
        { assignedAmbulance: req.user.id },
        { assignedDoctor: req.user.id },
      ],
    }).populate("patient");

    if (!emergencyCase) {
      return res.status(403).json({
        success: false,
        message: "You are not authorized to view this patient's profile",
      });
    }

    if (!emergencyCase.patient) {
      return res.status(404).json({
        success: false,
        message: "Patient not yet identified for this emergency case",
      });
    }

    // Get patient profile
    const patientProfile = await PatientProfile.findOne({
      user: emergencyCase.patient._id,
    });

    const medicalProfile = {
      name: emergencyCase.patient.name,
      phone: emergencyCase.patient.phone,
      bloodGroup: patientProfile?.bloodGroup || "Unknown",
      allergies: patientProfile?.allergies || [],
      chronicConditions: patientProfile?.chronicConditions || [],
      currentMedications: patientProfile?.currentMedications || [],
      emergencyContact: patientProfile?.emergencyContact || null,
    };

    res.status(200).json({
      success: true,
      data: medicalProfile,
    });
  } catch (error) {
    next(error);
  }
};

const uploadVictimPhoto = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "Victim photo is required",
      });
    }

    res.status(200).json({
      success: true,
      data: {
        filePath: req.file.path,
        filename: req.file.filename,
        originalname: req.file.originalname,
        size: req.file.size,
      },
    });
  } catch (error) {
    next(error);
  }
};

const updateAmbulanceLocation = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { latitude, longitude, accuracy, heading, speed } = req.body || {};

    const numLat = Number(latitude);
    const numLng = Number(longitude);

    if (isNaN(numLat) || isNaN(numLng) || numLat < -90 || numLat > 90 || numLng < -180 || numLng > 180) {
      return res.status(400).json({
        success: false,
        message: "Valid latitude (-90 to 90) and longitude (-180 to 180) coordinates are required",
      });
    }

    const result = await updateAmbulanceLocationService({
      user: req.user,
      id,
      coords: {
        latitude: numLat,
        longitude: numLng,
        accuracy: typeof accuracy === 'number' ? accuracy : undefined,
        heading: typeof heading === 'number' ? heading : undefined,
        speed: typeof speed === 'number' ? speed : undefined,
      },
      ipAddress: getIp(req),
    });

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createEmergencyCase,
  getEmergencyCaseById,
  getMyEmergencyCases,
  updateEmergencyStatus,
  updateEmergencyDetails,
  updateAmbulanceLocation,
  cancelEmergencyCase,
  getAvailableAmbulanceEmergencies,
  getAssignedAmbulanceEmergencies,
  acceptEmergencyCase,
  identifyPatientByQR,
  searchEmergencyCasePatients,
  confirmManualPatientIdentification,
  getEmergencyMedicalProfile,
  uploadVictimPhoto,
};

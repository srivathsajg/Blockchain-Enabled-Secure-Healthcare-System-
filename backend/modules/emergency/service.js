const mongoose = require("mongoose");

const EmergencyCase = require("./models/emergencyCase.model");
const User = require("../users/models/user.model");
const { logAction } = require("../audit/service");
const socket = require("../../core/socket");

const LIFECYCLE_ORDER = [
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
];

const VALID_TRANSITIONS = {
  REPORTED: ["AMBULANCE_REQUESTED", "CANCELLED"],
  AMBULANCE_REQUESTED: ["AMBULANCE_ASSIGNED", "REPORTED", "CANCELLED"],
  AMBULANCE_ASSIGNED: ["AMBULANCE_ARRIVED", "AMBULANCE_REQUESTED", "CANCELLED"],
  AMBULANCE_ARRIVED: ["PATIENT_IDENTIFIED", "AMBULANCE_ASSIGNED"],
  PATIENT_IDENTIFIED: ["IN_TRANSIT", "AMBULANCE_ARRIVED"],
  IN_TRANSIT: ["HOSPITAL_PREPARED", "ARRIVED_AT_HOSPITAL", "PATIENT_IDENTIFIED"],
  HOSPITAL_PREPARED: ["ARRIVED_AT_HOSPITAL", "IN_TRANSIT"],
  ARRIVED_AT_HOSPITAL: ["UNDER_TREATMENT", "HOSPITAL_PREPARED"],
  UNDER_TREATMENT: ["CLOSED", "ARRIVED_AT_HOSPITAL"],
  CLOSED: [],
  CANCELLED: [],
};

const VALID_TRANSITIONS_DOCTOR = {
  REPORTED: ["UNDER_TREATMENT", "CANCELLED"],
  UNDER_TREATMENT: ["CLOSED"],
  CLOSED: [],
  CANCELLED: [],
};

const RESPONSE_TYPES = EmergencyCase.RESPONSE_TYPES || [
  "AMBULANCE_EMERGENCY",
  "DOCTOR_EMERGENCY",
];

const isTerminalStatus = (status) => status === "CLOSED" || status === "CANCELLED";

const isValidStatusTransition = (fromStatus, toStatus, responseType = "AMBULANCE_EMERGENCY") => {
  if (fromStatus === toStatus) return true;
  const transitions = responseType === "DOCTOR_EMERGENCY" ? VALID_TRANSITIONS_DOCTOR : VALID_TRANSITIONS;
  const allowed = transitions[fromStatus];
  return !!allowed && allowed.includes(toStatus);
};

const assertValidStatusTransition = (fromStatus, toStatus, responseType = "AMBULANCE_EMERGENCY") => {
  if (isTerminalStatus(fromStatus) && fromStatus !== toStatus) {
    const err = new Error(`Illegal transition: ${fromStatus} is terminal and cannot be changed`);
    err.statusCode = 400;
    throw err;
  }
  if (!isValidStatusTransition(fromStatus, toStatus, responseType)) {
    const transitions = responseType === "DOCTOR_EMERGENCY" ? VALID_TRANSITIONS_DOCTOR : VALID_TRANSITIONS;
    const allowed = transitions[fromStatus] || [];
    const allowedStr = allowed.length > 0 ? allowed.join(", ") : "(none)";
    const err = new Error(
      `Illegal status transition ${fromStatus} → ${toStatus} (${responseType}). Allowed from ${fromStatus}: ${allowedStr}`
    );
    err.statusCode = 400;
    throw err;
  }
};

const buildAccessQuery = (user) => {
  const role = user.role;

  switch (role) {
    case "admin":
      return {};
    case "doctor": {
      return {
        $or: [
          { assignedDoctor: new mongoose.Types.ObjectId(user.id) },
          { reportedBy: new mongoose.Types.ObjectId(user.id) },
        ],
      };
    }
    case "patient": {
      const uid = new mongoose.Types.ObjectId(user.id);
      return {
        $or: [
          { patient: uid },
          { reportedBy: uid },
        ],
      };
    }
    case "ambulance": {
      return {
        $or: [
          { assignedAmbulance: new mongoose.Types.ObjectId(user.id) },
          { reportedBy: new mongoose.Types.ObjectId(user.id) },
        ],
      };
    }
    case "police": {
      return {
        $or: [
          { assignedPoliceOfficer: new mongoose.Types.ObjectId(user.id) },
          { reportedBy: new mongoose.Types.ObjectId(user.id) },
        ],
      };
    }
    default:
      return { reportedBy: new mongoose.Types.ObjectId(user.id) };
  }
};

const getEntityId = (entity) => {
  if (!entity) return null;
  if (entity._id) return String(entity._id);
  return String(entity);
};

const canViewCase = (user, emergencyCase) => {
  if (user.role === "admin") return true;

  const userId = String(user.id || user._id);
  const reportedById = getEntityId(emergencyCase.reportedBy);
  const patientId = getEntityId(emergencyCase.patient);
  const assignedDoctorId = getEntityId(emergencyCase.assignedDoctor);
  const assignedAmbulanceId = getEntityId(emergencyCase.assignedAmbulance);
  const assignedPoliceOfficerId = getEntityId(emergencyCase.assignedPoliceOfficer);

  if (reportedById === userId) return true;
  if (patientId === userId) return true;
  if (assignedDoctorId === userId) return true;
  if (assignedAmbulanceId === userId) return true;
  if (assignedPoliceOfficerId === userId) return true;

  if (
    user.role === "doctor" &&
    emergencyCase.responseType !== "DOCTOR_EMERGENCY" &&
    emergencyCase.assignedHospital &&
    user.hospitalName
  ) {
    if (emergencyCase.assignedHospital.toLowerCase() === user.hospitalName.toLowerCase()) {
      return true;
    }
  }

  return false;
};

const canUpdateDetails = (user, emergencyCase) => {
  if (user.role === "admin") return true;

  const userId = String(user.id || user._id);
  const reportedById = getEntityId(emergencyCase.reportedBy);
  const assignedDoctorId = getEntityId(emergencyCase.assignedDoctor);
  const assignedAmbulanceId = getEntityId(emergencyCase.assignedAmbulance);
  const assignedPoliceOfficerId = getEntityId(emergencyCase.assignedPoliceOfficer);

  if (emergencyCase.status === "REPORTED" && reportedById === userId) {
    return true;
  }
  if (assignedDoctorId && assignedDoctorId === userId) return true;
  if (assignedAmbulanceId && assignedAmbulanceId === userId) return true;
  if (assignedPoliceOfficerId && assignedPoliceOfficerId === userId) return true;

  if (
    user.role === "doctor" &&
    emergencyCase.responseType !== "DOCTOR_EMERGENCY" &&
    emergencyCase.assignedHospital &&
    user.hospitalName
  ) {
    if (emergencyCase.assignedHospital.toLowerCase() === user.hospitalName.toLowerCase()) {
      return true;
    }
  }

  return false;
};

const canUpdateStatus = (user, emergencyCase, newStatus) => {
  if (user.role === "admin") return true;

  const userId = String(user.id || user._id);
  const reportedById = getEntityId(emergencyCase.reportedBy);
  const assignedDoctorId = getEntityId(emergencyCase.assignedDoctor);
  const assignedAmbulanceId = getEntityId(emergencyCase.assignedAmbulance);

  if (newStatus === "CANCELLED") {
    if (reportedById === userId && emergencyCase.status === "REPORTED") {
      return true;
    }
    return false;
  }

  if (assignedDoctorId && assignedDoctorId === userId) return true;
  if (assignedAmbulanceId && assignedAmbulanceId === userId) return true;

  if (
    user.role === "doctor" &&
    emergencyCase.responseType !== "DOCTOR_EMERGENCY" &&
    emergencyCase.assignedHospital &&
    user.hospitalName
  ) {
    if (emergencyCase.assignedHospital.toLowerCase() === user.hospitalName.toLowerCase()) {
      return true;
    }
  }

  return false;
};

const canCancelCase = (user, emergencyCase) => {
  if (user.role === "admin") return true;
  const userId = String(user.id || user._id);
  const reportedById = getEntityId(emergencyCase.reportedBy);
  return (
    emergencyCase.status === "REPORTED" &&
    reportedById === userId
  );
};

const validateIncidentType = (value) => {
  if (!EmergencyCase.INCIDENT_TYPES.includes(value)) {
    const err = new Error(`Invalid incidentType. Allowed: ${EmergencyCase.INCIDENT_TYPES.join(", ")}`);
    err.statusCode = 400;
    throw err;
  }
};

const validateSeverity = (value) => {
  if (!EmergencyCase.SEVERITY_LEVELS.includes(value)) {
    const err = new Error(`Invalid severity. Allowed: ${EmergencyCase.SEVERITY_LEVELS.join(", ")}`);
    err.statusCode = 400;
    throw err;
  }
};

const validateStatus = (value) => {
  if (!EmergencyCase.STATUSES.includes(value)) {
    const err = new Error(`Invalid status. Allowed: ${EmergencyCase.STATUSES.join(", ")}`);
    err.statusCode = 400;
    throw err;
  }
};

const emitSocket = (event, payload) => {
  try {
    const io = socket.getIO();
    io.emit(event, payload);
  } catch (err) {
    console.warn("Emergency socket emit skipped:", err.message);
  }
};

const emitCaseSocket = (event, emergencyCase, extra = {}) => {
  try {
    const io = socket.getIO();
    const payload = {
      emergencyCaseId: emergencyCase._id,
      status: emergencyCase.status,
      severity: emergencyCase.severity,
      incidentType: emergencyCase.incidentType,
      patientId: emergencyCase.patient ? emergencyCase.patient.toString() : null,
      assignedHospital: emergencyCase.assignedHospital || null,
      ...extra,
    };

    io.emit(event, payload);

    if (emergencyCase.patient) {
      io.to(String(emergencyCase.patient)).emit(event, payload);
    }
    if (emergencyCase.assignedDoctor) {
      io.to(String(emergencyCase.assignedDoctor)).emit(event, payload);
    }
    if (emergencyCase.assignedAmbulance) {
      io.to(String(emergencyCase.assignedAmbulance)).emit(event, payload);
    }
    if (emergencyCase.assignedPoliceOfficer) {
      io.to(String(emergencyCase.assignedPoliceOfficer)).emit(event, payload);
    }
  } catch (err) {
    console.warn("Emergency case socket emit skipped:", err.message);
  }
};

const createEmergencyCase = async ({ user, data, ipAddress }) => {
  const {
    patient,
    incidentType,
    description,
    severity,
    location,
    assignedHospital,
    assignedDoctor,
    linkedAppointmentId,
    notes,
    responseType,
    victimPhoto,
    reporterMode,
  } = data;

  validateIncidentType(incidentType);
  validateSeverity(severity);

  const normalizedResponseType = RESPONSE_TYPES.includes(responseType)
    ? responseType
    : "AMBULANCE_EMERGENCY";

  // Duplicate submission protection: if same user submitted an identical active case within 15 seconds
  if (normalizedResponseType === "AMBULANCE_EMERGENCY" && user?.id) {
    const recentDuplicate = await EmergencyCase.findOne({
      reportedBy: new mongoose.Types.ObjectId(user.id),
      responseType: "AMBULANCE_EMERGENCY",
      status: { $in: ["REPORTED", "AMBULANCE_REQUESTED"] },
      createdAt: { $gte: new Date(Date.now() - 15000) },
      incidentType,
    })
      .populate("patient", "name email phone bloodGroup healthSummary")
      .populate("reportedBy", "name role email")
      .populate("assignedDoctor", "name specialization hospitalName")
      .populate("assignedAmbulance", "name phone")
      .populate("assignedPoliceOfficer", "name phone")
      .lean();

    if (recentDuplicate) {
      return recentDuplicate;
    }
  }

  // Determine patient linkage based on reporterMode:
  // For 'SELF', if patient is not provided but user is a patient, link authenticated user.
  // For 'OTHER', patient must remain null/unidentified until verified.
  let resolvedPatientId = undefined;
  if (reporterMode === "OTHER") {
    resolvedPatientId = undefined;
  } else if (patient) {
    const patientExists = await User.exists({ _id: patient, role: "patient" });
    if (!patientExists) {
      const err = new Error("Patient not found");
      err.statusCode = 404;
      throw err;
    }
    resolvedPatientId = new mongoose.Types.ObjectId(patient);
  } else if (reporterMode === "SELF" || (!reporterMode && user.role === "patient")) {
    resolvedPatientId = new mongoose.Types.ObjectId(user.id);
  }

  if (assignedDoctor) {
    const doctorExists = await User.exists({ _id: assignedDoctor, role: "doctor" });
    if (!doctorExists) {
      const err = new Error("Assigned doctor not found");
      err.statusCode = 404;
      throw err;
    }
  }

  const initialStatus = "REPORTED";

  const emergencyCase = new EmergencyCase({
    patient: resolvedPatientId,
    reportedBy: new mongoose.Types.ObjectId(user.id),
    incidentType,
    description: description || "",
    severity,
    location: location || {},
    assignedHospital: assignedHospital || undefined,
    assignedDoctor: assignedDoctor ? new mongoose.Types.ObjectId(assignedDoctor) : undefined,
    linkedAppointmentId: linkedAppointmentId
      ? new mongoose.Types.ObjectId(linkedAppointmentId)
      : undefined,
    notes: notes || undefined,
    victimPhoto: victimPhoto || undefined,
    reporterMode: reporterMode || undefined,
    responseType: normalizedResponseType,
    status: initialStatus,
  });

  emergencyCase.statusTimestamps = new Map([[initialStatus, new Date()]]);

  if (normalizedResponseType === "AMBULANCE_EMERGENCY") {
    emergencyCase.status = "AMBULANCE_REQUESTED";
    emergencyCase.statusTimestamps.set("AMBULANCE_REQUESTED", new Date());
  }

  await emergencyCase.save();

  await logAction({
    userId: new mongoose.Types.ObjectId(user.id),
    role: user.role,
    action: "EMERGENCY_CASE_CREATED",
    module: "EMERGENCY",
    targetId: emergencyCase._id.toString(),
    ipAddress,
    details: {
      incidentType,
      severity,
      assignedHospital: assignedHospital || null,
      patientId: resolvedPatientId ? resolvedPatientId.toString() : null,
      responseType: normalizedResponseType,
      reporterMode: reporterMode || null,
    },
  });

  emitCaseSocket("emergency-created", emergencyCase, {
    createdBy: user.id,
  });

  if (normalizedResponseType === "AMBULANCE_EMERGENCY") {
    emitSocket("ambulance-emergency-requested", {
      emergencyCaseId: emergencyCase._id.toString(),
      severity,
      incidentType,
      location: emergencyCase.location,
    });
    emitSocket("emergency-status-updated", {
      emergencyCaseId: emergencyCase._id.toString(),
      status: "AMBULANCE_REQUESTED",
      severity,
      incidentType,
    });
    emitSocket("hospital-emergency-alert", {
      emergencyCaseId: emergencyCase._id.toString(),
      severity,
      incidentType,
      hospitalName: emergencyCase.assignedHospital,
    });
  }

  const populated = await EmergencyCase.findById(emergencyCase._id)
    .populate("patient", "name email phone bloodGroup healthSummary")
    .populate("reportedBy", "name role email")
    .populate("assignedDoctor", "name specialization hospitalName")
    .populate("assignedAmbulance", "name phone")
    .populate("assignedPoliceOfficer", "name phone")
    .lean();

  return populated;
};

const getEmergencyCaseById = async ({ user, id, ipAddress }) => {
  const emergencyCase = await EmergencyCase.findById(id)
    .populate("patient", "name email phone bloodGroup gender dob healthSummary guardianNumber residentialAddress profileImage")
    .populate("reportedBy", "name role email")
    .populate("assignedDoctor", "name specialization hospitalName")
    .populate("assignedAmbulance", "name phone")
    .populate("assignedPoliceOfficer", "name phone")
    .populate("linkedAppointmentId", "status date time");

  if (!emergencyCase) {
    const err = new Error("Emergency case not found");
    err.statusCode = 404;
    throw err;
  }

  if (!canViewCase(user, emergencyCase)) {
    const err = new Error("Forbidden: Not authorized to access this emergency case");
    err.statusCode = 403;
    throw err;
  }

  await logAction({
    userId: new mongoose.Types.ObjectId(user.id),
    role: user.role,
    action: "EMERGENCY_CASE_ACCESSED",
    module: "EMERGENCY",
    targetId: emergencyCase._id.toString(),
    ipAddress,
    details: {
      patientId: emergencyCase.patient ? emergencyCase.patient._id.toString() : null,
      status: emergencyCase.status,
    },
  });

  return emergencyCase;
};

const getAccessibleEmergencyCases = async ({ user, filters = {} }) => {
  const query = buildAccessQuery(user);

  if (filters.status) {
    validateStatus(filters.status);
    query.status = filters.status;
  }
  if (filters.severity) {
    validateSeverity(filters.severity);
    query.severity = filters.severity;
  }
  if (filters.incidentType) {
    validateIncidentType(filters.incidentType);
    query.incidentType = filters.incidentType;
  }
  if (filters.assignedHospital) {
    query.assignedHospital = { $regex: filters.assignedHospital, $options: "i" };
  }

  const cases = await EmergencyCase.find(query)
    .populate("patient", "name email phone bloodGroup")
    .populate("reportedBy", "name role")
    .populate("assignedDoctor", "name specialization hospitalName")
    .populate("assignedAmbulance", "name phone")
    .sort({ createdAt: -1 })
    .limit(100)
    .lean();

  return cases;
};

const updateEmergencyStatus = async ({ user, id, newStatus, ipAddress, cancelledReason }) => {
  validateStatus(newStatus);

  const emergencyCase = await EmergencyCase.findById(id);
  if (!emergencyCase) {
    const err = new Error("Emergency case not found");
    err.statusCode = 404;
    throw err;
  }

  if (newStatus === "PATIENT_IDENTIFIED" && !emergencyCase.patient) {
    const err = new Error("Patient must be confirmed before marking the case as identified");
    err.statusCode = 400;
    throw err;
  }

  if (newStatus === "CANCELLED") {
    if (!canCancelCase(user, emergencyCase)) {
      const err = new Error("Forbidden: Not authorized to cancel this emergency case");
      err.statusCode = 403;
      throw err;
    }
  } else {
    if (!canUpdateStatus(user, emergencyCase, newStatus)) {
      const err = new Error("Forbidden: Not authorized to update status");
      err.statusCode = 403;
      throw err;
    }
  }

  assertValidStatusTransition(emergencyCase.status, newStatus, emergencyCase.responseType);

  const oldStatus = emergencyCase.status;
  emergencyCase.status = newStatus;

  if (!emergencyCase.statusTimestamps) {
    emergencyCase.statusTimestamps = new Map();
  }
  emergencyCase.statusTimestamps.set(newStatus, new Date());

  if (newStatus === "CANCELLED" && cancelledReason) {
    emergencyCase.cancelledReason = cancelledReason;
  }

  await emergencyCase.save();

  await logAction({
    userId: new mongoose.Types.ObjectId(user.id),
    role: user.role,
    action: "EMERGENCY_STATUS_UPDATED",
    module: "EMERGENCY",
    targetId: emergencyCase._id.toString(),
    ipAddress,
    details: {
      oldStatus,
      newStatus,
      cancelledReason: cancelledReason || null,
    },
  });

  emitCaseSocket("emergency-status-updated", emergencyCase, {
    oldStatus,
    updatedBy: user.id,
  });

  if (newStatus === "AMBULANCE_ASSIGNED" && emergencyCase.assignedAmbulance) {
    emitSocket("ambulance-assigned", {
      emergencyCaseId: emergencyCase._id,
      assignedAmbulance: emergencyCase.assignedAmbulance.toString(),
    });
  }

  if (
    newStatus === "HOSPITAL_PREPARED" ||
    newStatus === "ARRIVED_AT_HOSPITAL" ||
    (newStatus === "IN_TRANSIT" && emergencyCase.assignedHospital)
  ) {
    emitSocket("hospital-emergency-alert", {
      emergencyCaseId: emergencyCase._id,
      status: newStatus,
      assignedHospital: emergencyCase.assignedHospital,
      patientId: emergencyCase.patient ? emergencyCase.patient.toString() : null,
      severity: emergencyCase.severity,
    });
  }

  const populated = await EmergencyCase.findById(emergencyCase._id)
    .populate("patient", "name email phone bloodGroup")
    .populate("reportedBy", "name role")
    .populate("assignedDoctor", "name specialization hospitalName")
    .populate("assignedAmbulance", "name phone")
    .populate("assignedPoliceOfficer", "name phone")
    .lean();

  return populated;
};

const updateEmergencyDetails = async ({ user, id, data, ipAddress }) => {
  const emergencyCase = await EmergencyCase.findById(id);
  if (!emergencyCase) {
    const err = new Error("Emergency case not found");
    err.statusCode = 404;
    throw err;
  }

  if (!canUpdateDetails(user, emergencyCase)) {
    const err = new Error("Forbidden: Not authorized to update this emergency case");
    err.statusCode = 403;
    throw err;
  }

  if (emergencyCase.status === "CLOSED" || emergencyCase.status === "CANCELLED") {
    const err = new Error(`Cannot modify a ${emergencyCase.status.toLowerCase()} case`);
    err.statusCode = 400;
    throw err;
  }

  const changedFields = {};

  if (data.incidentType !== undefined) {
    validateIncidentType(data.incidentType);
    emergencyCase.incidentType = data.incidentType;
    changedFields.incidentType = data.incidentType;
  }
  if (data.severity !== undefined) {
    validateSeverity(data.severity);
    emergencyCase.severity = data.severity;
    changedFields.severity = data.severity;
  }
  if (data.description !== undefined) {
    emergencyCase.description = data.description;
    changedFields.description = true;
  }
  if (data.location !== undefined) {
    emergencyCase.location = {
      ...(emergencyCase.location || {}),
      ...data.location,
    };
    changedFields.location = true;
  }
  if (data.notes !== undefined) {
    emergencyCase.notes = data.notes;
    changedFields.notes = true;
  }
  if (data.assignedHospital !== undefined) {
    emergencyCase.assignedHospital = data.assignedHospital;
    changedFields.assignedHospital = data.assignedHospital;
  }

  if (data.assignedDoctor !== undefined) {
    if (data.assignedDoctor === null) {
      emergencyCase.assignedDoctor = undefined;
      changedFields.assignedDoctor = null;
    } else {
      const doctorExists = await User.exists({ _id: data.assignedDoctor, role: "doctor" });
      if (!doctorExists) {
        const err = new Error("Assigned doctor not found");
        err.statusCode = 404;
        throw err;
      }
      emergencyCase.assignedDoctor = new mongoose.Types.ObjectId(data.assignedDoctor);
      changedFields.assignedDoctor = data.assignedDoctor;
    }
  }

  if (data.assignedAmbulance !== undefined) {
    if (data.assignedAmbulance === null) {
      emergencyCase.assignedAmbulance = undefined;
      changedFields.assignedAmbulance = null;
    } else {
      const crewExists = await User.exists({ _id: data.assignedAmbulance });
      if (!crewExists) {
        const err = new Error("Assigned ambulance personnel not found");
        err.statusCode = 404;
        throw err;
      }
      emergencyCase.assignedAmbulance = new mongoose.Types.ObjectId(data.assignedAmbulance);
      changedFields.assignedAmbulance = data.assignedAmbulance;
    }
  }

  if (data.assignedPoliceOfficer !== undefined) {
    if (data.assignedPoliceOfficer === null) {
      emergencyCase.assignedPoliceOfficer = undefined;
      changedFields.assignedPoliceOfficer = null;
    } else {
      const officerExists = await User.exists({ _id: data.assignedPoliceOfficer });
      if (!officerExists) {
        const err = new Error("Assigned police officer not found");
        err.statusCode = 404;
        throw err;
      }
      emergencyCase.assignedPoliceOfficer = new mongoose.Types.ObjectId(data.assignedPoliceOfficer);
      changedFields.assignedPoliceOfficer = data.assignedPoliceOfficer;
    }
  }

  if (data.patient !== undefined) {
    if (data.patient === null) {
      emergencyCase.patient = undefined;
      changedFields.patient = null;
    } else {
      const patientExists = await User.exists({ _id: data.patient, role: "patient" });
      if (!patientExists) {
        const err = new Error("Patient not found");
        err.statusCode = 404;
        throw err;
      }
      emergencyCase.patient = new mongoose.Types.ObjectId(data.patient);
      changedFields.patient = data.patient;
    }
  }

  if (data.victimPhoto !== undefined) {
    if (data.victimPhoto === null) {
      emergencyCase.victimPhoto = undefined;
      changedFields.victimPhoto = null;
    } else {
      emergencyCase.victimPhoto = data.victimPhoto;
      changedFields.victimPhoto = true;
    }
  }

  if (data.reporterMode !== undefined) {
    if (["SELF", "OTHER"].includes(data.reporterMode)) {
      emergencyCase.reporterMode = data.reporterMode;
      changedFields.reporterMode = data.reporterMode;
    }
  }

  await emergencyCase.save();

  await logAction({
    userId: new mongoose.Types.ObjectId(user.id),
    role: user.role,
    action: "EMERGENCY_CASE_DETAILS_UPDATED",
    module: "EMERGENCY",
    targetId: emergencyCase._id.toString(),
    ipAddress,
    details: changedFields,
  });

  emitCaseSocket("emergency-updated", emergencyCase, {
    changedFields: Object.keys(changedFields),
    updatedBy: user.id,
  });

  const populated = await EmergencyCase.findById(emergencyCase._id)
    .populate("patient", "name email phone bloodGroup")
    .populate("reportedBy", "name role")
    .populate("assignedDoctor", "name specialization hospitalName")
    .populate("assignedAmbulance", "name phone")
    .populate("assignedPoliceOfficer", "name phone")
    .lean();

  return populated;
};

const ARRIVAL_RADIUS_METERS = 75;

const calculateDistanceMeters = (lat1, lon1, lat2, lon2) => {
  const nLat1 = Number(lat1);
  const nLon1 = Number(lon1);
  const nLat2 = Number(lat2);
  const nLon2 = Number(lon2);

  if (isNaN(nLat1) || isNaN(nLon1) || isNaN(nLat2) || isNaN(nLon2)) {
    return null;
  }
  const R = 6371e3; // Earth radius in meters
  const rad = Math.PI / 180;
  const phi1 = nLat1 * rad;
  const phi2 = nLat2 * rad;
  const deltaPhi = (nLat2 - nLat1) * rad;
  const deltaLambda = (nLon2 - nLon1) * rad;

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return Math.round(R * c);
};

const updateAmbulanceLocation = async ({ user, id, coords, ipAddress }) => {
  if (!coords || typeof coords.latitude !== "number" || typeof coords.longitude !== "number") {
    const err = new Error("Valid latitude and longitude numbers are required");
    err.statusCode = 400;
    throw err;
  }

  const emergencyCase = await EmergencyCase.findById(id);
  if (!emergencyCase) {
    const err = new Error("Emergency case not found");
    err.statusCode = 404;
    throw err;
  }

  // Location Security: Only the assigned ambulance (or admin) can update location
  const userId = String(user.id || user._id);
  const assignedAmbulanceId = getEntityId(emergencyCase.assignedAmbulance);

  if (user.role !== "admin" && (!assignedAmbulanceId || assignedAmbulanceId !== userId)) {
    const err = new Error("Forbidden: You are not the assigned ambulance for this emergency case");
    err.statusCode = 403;
    throw err;
  }

  if (isTerminalStatus(emergencyCase.status)) {
    const err = new Error(`Cannot update location for a ${emergencyCase.status.toLowerCase()} case`);
    err.statusCode = 400;
    throw err;
  }

  emergencyCase.ambulanceLocation = {
    latitude: coords.latitude,
    longitude: coords.longitude,
    accuracy: coords.accuracy || undefined,
    heading: coords.heading || undefined,
    speed: coords.speed || undefined,
    updatedAt: new Date(),
  };

  let distanceMeters = null;
  let etaMinutes = null;

  if (
    emergencyCase.location &&
    typeof emergencyCase.location.latitude === "number" &&
    typeof emergencyCase.location.longitude === "number"
  ) {
    distanceMeters = calculateDistanceMeters(
      coords.latitude,
      coords.longitude,
      emergencyCase.location.latitude,
      emergencyCase.location.longitude
    );

    if (distanceMeters !== null) {
      // Estimate at 40 km/h average city transit
      etaMinutes = Math.max(1, Math.round((distanceMeters / 1000 / 40) * 60));
    }
  }

  let autoArrived = false;
  // Geofencing Check: If assigned and within arrival radius, transition automatically
  if (
    emergencyCase.status === "AMBULANCE_ASSIGNED" &&
    distanceMeters !== null &&
    distanceMeters <= ARRIVAL_RADIUS_METERS
  ) {
    emergencyCase.status = "AMBULANCE_ARRIVED";
    if (!emergencyCase.statusTimestamps) {
      emergencyCase.statusTimestamps = new Map();
    }
    emergencyCase.statusTimestamps.set("AMBULANCE_ARRIVED", new Date());
    autoArrived = true;

    await logAction({
      userId: new mongoose.Types.ObjectId(user.id),
      role: user.role,
      action: "AMBULANCE_ARRIVED_AUTO",
      module: "EMERGENCY",
      targetId: emergencyCase._id.toString(),
      ipAddress,
      details: {
        distanceMeters,
        arrivalRadius: ARRIVAL_RADIUS_METERS,
        coords,
      },
    });

    emitCaseSocket("emergency-status-updated", emergencyCase, {
      oldStatus: "AMBULANCE_ASSIGNED",
      newStatus: "AMBULANCE_ARRIVED",
      updatedBy: user.id,
      autoTriggered: true,
    });

    emitSocket("ambulance-arrived", {
      emergencyCaseId: emergencyCase._id.toString(),
      status: "AMBULANCE_ARRIVED",
      distanceMeters,
      coords,
    });
  }

  await emergencyCase.save();

  // Real-time location stream event
  const locationPayload = {
    emergencyCaseId: emergencyCase._id.toString(),
    ambulanceLocation: emergencyCase.ambulanceLocation,
    distanceMeters,
    etaMinutes,
    status: emergencyCase.status,
    autoArrived,
  };

  emitSocket("ambulance-location-updated", locationPayload);
  emitCaseSocket("ambulance-location-updated", emergencyCase, locationPayload);

  return {
    success: true,
    emergencyCaseId: emergencyCase._id,
    ambulanceLocation: emergencyCase.ambulanceLocation,
    distanceMeters,
    etaMinutes,
    status: emergencyCase.status,
    autoArrived,
  };
};

const cancelEmergencyCase = async ({ user, id, cancelledReason, ipAddress }) => {
  return updateEmergencyStatus({
    user,
    id,
    newStatus: "CANCELLED",
    cancelledReason,
    ipAddress,
  });
};

module.exports = {
  createEmergencyCase,
  getEmergencyCaseById,
  getAccessibleEmergencyCases,
  updateEmergencyStatus,
  updateEmergencyDetails,
  updateAmbulanceLocation,
  cancelEmergencyCase,
  canViewCase,
  calculateDistanceMeters,
  ARRIVAL_RADIUS_METERS,
  INCIDENT_TYPES: EmergencyCase.INCIDENT_TYPES,
  SEVERITY_LEVELS: EmergencyCase.SEVERITY_LEVELS,
  STATUSES: EmergencyCase.STATUSES,
  RESPONSE_TYPES: EmergencyCase.RESPONSE_TYPES,
  LIFECYCLE_ORDER,
  VALID_TRANSITIONS,
  VALID_TRANSITIONS_DOCTOR,
  isTerminalStatus,
  isValidStatusTransition,
  assertValidStatusTransition,
};

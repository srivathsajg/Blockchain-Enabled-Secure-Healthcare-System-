const Record = require("../../modules/medical-records/models/record.model");
const Prescription = require("../../modules/prescriptions/models/prescription.model");
const Insurance = require("../../modules/insurance/models/insurance.model");
const User = require("../../modules/users/models/user.model");
const Appointment = require("../../modules/appointments/models/appointment.model");
const DoctorAvailability = require("../../modules/appointments/models/availability.model");
const Bill = require("../../modules/billing/models/bill.model");
const LabOrder = require("../../modules/lab/models/labOrder.model");
const EmergencyCase = require("../../modules/emergency/models/emergencyCase.model");
const {
  INCIDENT_TYPES,
  SEVERITY_LEVELS,
} = require("../../modules/emergency/service");
const { logAction } = require("../../modules/audit/service");
const mongoose = require("mongoose");
const socket = require("../../core/socket");

const buildAppointmentDateTime = (dateValue, timeValue = "23:59") => {
  if (!dateValue) {
    return null;
  }

  let year;
  let month;
  let day;

  if (typeof dateValue === "string") {
    const match = dateValue.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) {
      year = Number(match[1]);
      month = Number(match[2]) - 1;
      day = Number(match[3]);
    }
  }

  if ([year, month, day].some((part) => part === undefined)) {
    const parsedDate = new Date(dateValue);
    if (Number.isNaN(parsedDate.getTime())) {
      return null;
    }

    year = parsedDate.getUTCFullYear();
    month = parsedDate.getUTCMonth();
    day = parsedDate.getUTCDate();
  }

  // Parse timeValue, handling optional 12-hour format like "09:00 AM"
  const timeStr = String(timeValue || "23:59");
  const [timePart, modifier] = timeStr.split(" ");
  let [hoursStr = "23", minutesStr = "59"] = timePart.split(":");
  
  let hours = Number(hoursStr);
  let minutes = Number(minutesStr);

  if (modifier === "PM" && hours < 12) hours += 12;
  if (modifier === "AM" && hours === 12) hours = 0;

  const appointmentDateTime = new Date(
    year,
    month,
    day,
    hours,
    minutes,
    0,
    0,
  );

  return Number.isNaN(appointmentDateTime.getTime()) ? null : appointmentDateTime;
};

const getWardRate = (pricing = {}, ward = "General") => {
  const wardRates = {
    General: pricing.general || 1000,
    ICU: pricing.icu || 5000,
    Emergency: pricing.emergency || 3000,
    Pediatric: pricing.pediatric || 1500,
    Surgical: pricing.surgical || 2500,
    Deluxe: pricing.deluxe || 4000,
    "Semi-Private": pricing.semiPrivate || 2000,
    Private: pricing.private || 3000,
    Isolation: pricing.isolation || 3500,
    NICU: pricing.nicu || 5500,
  };

  return {
    wardRate: wardRates[ward] || wardRates.General,
    doctorFee: pricing.doctorFee || 500
  };
};

const calculateLiveAdmissionCosts = async (patient, pricing) => {
  const admittedAt = new Date(patient.admission.admittedAt);
  const now = new Date();
  
  // Calculate historical ward costs
  let wardTotal = 0;
  const wardBreakdown = [];
  
  if (patient.admission.wardHistory && patient.admission.wardHistory.length > 0) {
    patient.admission.wardHistory.forEach(h => {
      const start = new Date(h.startedAt);
      const end = new Date(h.endedAt);
      const diffTime = Math.abs(end - start);
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) || 1;
      const { wardRate } = getWardRate(pricing, h.ward);
      const cost = wardRate * diffDays;
      wardTotal += cost;
      wardBreakdown.push({ name: `${h.ward} Ward (${diffDays} days)`, cost, type: "ward" });
    });
  }

  // Calculate current ward cost
  const diffTimeCurrent = Math.abs(now - admittedAt);
  const diffDaysCurrent = Math.ceil(diffTimeCurrent / (1000 * 60 * 60 * 24)) || 1;
  const { wardRate: currentRate, doctorFee } = getWardRate(pricing, patient.admission.ward);
  const currentWardCost = currentRate * diffDaysCurrent;
  wardTotal += currentWardCost;
  wardBreakdown.push({ name: `${patient.admission.ward} Ward (Current, ${diffDaysCurrent} days)`, cost: currentWardCost, type: "ward" });

  // Doctor Fee - assuming per day of total stay
  const totalStayStart = patient.admission.wardHistory?.length > 0 
    ? new Date(patient.admission.wardHistory[0].startedAt) 
    : admittedAt;
  const totalStayDays = Math.ceil(Math.abs(now - totalStayStart) / (1000 * 60 * 60 * 24)) || 1;
  const doctorFeeTotal = doctorFee * totalStayDays;

  // Fetch Lab Tests
  const labOrders = await LabOrder.find({
    patientId: patient._id,
    hospitalName: patient.admission.hospitalName,
    date: { $gte: totalStayStart }
  });
  const labTotal = labOrders.reduce((sum, order) => sum + (order.price || 0), 0);

  // Fetch Medicines
  const prescriptions = await Prescription.find({
    patientId: patient._id,
    deliveryType: "WARD",
    createdAt: { $gte: totalStayStart }
  });
  
  let medicineTotal = 0;
  const medicineItems = [];
  prescriptions.forEach(p => {
    p.medicines.forEach(m => {
      const price = parseFloat(m.price) || 0;
      medicineTotal += price;
      medicineItems.push({ name: m.name, cost: price, type: "medicine" });
    });
  });

  return {
    wardTotal,
    wardBreakdown,
    doctorFeeTotal,
    doctorFee,
    labTotal,
    medicineTotal,
    medicineItems,
    totalStayDays,
    totalStayStart,
    total: wardTotal + doctorFeeTotal + labTotal + medicineTotal
  };
};

const getOverview = async (req, res) => {
  try {
    const patientId = req.user.id;

    // 1. Total records
    const totalMedicalRecords = await Record.countDocuments({ patientId });

    // 2. Active prescriptions
    const activePrescriptions = await Prescription.countDocuments({
      patientId,
      status: "active",
    });

    // 3. Insurance Status
    const insurance = await Insurance.findOne({ patientId }).sort({
      createdAt: -1,
    });
    const insuranceStatus = insurance ? insurance.claimStatus : "None";

    // 4. Blockchain Status
    const records = await Record.find({ patientId });
    const unverifiedRecords = records.filter((r) => !r.blockchainTxHash);
    const blockchainStatus =
      records.length === 0
        ? "N/A"
        : unverifiedRecords.length > 0
          ? "Pending"
          : "Secure";

    // 5. Admission Details
    const patient = await User.findById(patientId).select("admission isInsuranceApplied");
    const admission = patient?.admission || null;

    res.json({
      success: true,
      data: {
        totalMedicalRecords,
        activePrescriptions,
        insuranceStatus,
        blockchainStatus,
        admission,
        isInsuranceApplied: patient?.isInsuranceApplied || false,
      },
    });
  } catch (error) {
    console.error("Error fetching patient overview:", error);
    res
      .status(500)
      .json({ success: false, message: "Server error fetching overview" });
  }
};

const getRecords = async (req, res) => {
  try {
    const patientId = req.user.id;
    const records = await Record.find({ patientId })
      .populate("doctorId", "name email hospitalName")
      .populate("orderedBy", "name email hospitalName")
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      data: records,
    });
  } catch (error) {
    console.error("Error fetching patient records:", error);
    res
      .status(500)
      .json({ success: false, message: "Server error fetching records" });
  }
};

const getPrescriptions = async (req, res) => {
  try {
    const patientId = req.user.id;
    const prescriptions = await Prescription.find({ patientId })
      .populate("doctorId", "name email hospitalName")
      .sort({ createdAt: -1 })
      .lean();

    // Fetch associated bills and lab orders for each prescription
    const prescriptionsWithData = await Promise.all(
      prescriptions.map(async (rx) => {
        const bill = await Bill.findOne({ prescriptionId: rx._id }).lean();
        
        // Fetch lab orders created around the same time as the prescription for this doctor/patient
        const rxDate = new Date(rx.createdAt);
        const startTime = new Date(rxDate.getTime() - 24 * 60 * 60 * 1000); // 24 hours before
        const endTime = new Date(rxDate.getTime() + 2 * 60 * 60 * 1000); // 2 hours after
        
        const labOrders = await LabOrder.find({
          patientId: rx.patientId,
          doctorId: rx.doctorId._id,
          date: { $gte: startTime, $lte: endTime }
        }).lean();

        return { ...rx, bill, labOrders };
      })
    );

    res.json({
      success: true,
      data: prescriptionsWithData,
    });
  } catch (error) {
    console.error("Error fetching patient prescriptions:", error);
    res
      .status(500)
      .json({ success: false, message: "Server error fetching prescriptions" });
  }
};

const getReminders = async (req, res) => {
  try {
    const patientId = req.user.id;
    const now = new Date();
    const reminders = [];

    // 1. Fetch Source Data (Only Prescriptions for Medicine)
    const activePrescriptions = await Prescription.find({ patientId, status: "active" });

    // 2. Process Medication Reminders (Dynamic Generation)
    activePrescriptions.forEach((rx) => {
      const rxDate = new Date(rx.createdAt);
      
      rx.medicines.forEach((med, idx) => {
        // Duration Check: If (createdAt + duration days) < now, skip reminder
        if (med.duration) {
          const durationDays = parseInt(med.duration);
          const expiryDate = new Date(rxDate);
          expiryDate.setDate(expiryDate.getDate() + durationDays);
          
          if (expiryDate < now) return; // Medicine course ended
        }

        const freq = (med.frequency || '').toLowerCase();
        const slots = [];
        
        // Advanced frequency parsing logic
        if (freq.includes('thrice') || freq.includes('3 times') || freq.includes('1-1-1')) {
          slots.push("08:00 AM", "02:00 PM", "08:00 PM");
        } else if (freq.includes('twice') || freq.includes('2 times') || freq.includes('1-0-1')) {
          slots.push("08:00 AM", "09:00 PM");
        } else if (freq.includes('once') || freq.includes('1 time') || freq.includes('1-0-0')) {
          slots.push("08:00 AM");
        } else {
          // Natural keywords fallback
          if (freq.includes('morning') || freq.includes('breakfast')) slots.push("08:00 AM");
          if (freq.includes('afternoon') || freq.includes('lunch')) slots.push("02:00 PM");
          if (freq.includes('night') || freq.includes('dinner') || freq.includes('evening')) slots.push("09:00 PM");
          
          // Default to morning if still empty but medication is active
          if (slots.length === 0) slots.push("08:00 AM");
        }

        slots.forEach((time, sIdx) => {
          reminders.push({
            id: `med-${rx._id}-${idx}-${sIdx}`,
            type: 'Medication',
            title: med.name || med,
            time,
            status: "Upcoming",
            instructions: med.frequency || rx.notes || 'Take as prescribed',
            priority: 'High'
          });
        });
      });
    });

    // 3. Sort by Time
    reminders.sort((a, b) => {
      const timeToNum = (t) => {
        const [h, m, mod] = t.split(/[:\s]/);
        let hour = parseInt(h);
        if (mod === 'PM' && hour < 12) hour += 12;
        if (mod === 'AM' && hour === 12) hour = 0;
        return hour * 60 + parseInt(m);
      };
      return timeToNum(a.time) - timeToNum(b.time);
    });

    res.json({
      success: true,
      data: reminders,
    });
  } catch (error) {
    console.error("Error fetching patient reminders:", error);
    res.status(500).json({ success: false, message: "Server error fetching reminders" });
  }
};

const getDoctors = async (req, res) => {
    try {
        const { search, lat, lng, radius, page = 1, limit = 6, date, hospitalName, isEmergency } = req.query;
        let query = { role: "doctor" };

        // 1. Hospital filtering (Case-insensitive match)
        // If hospitalName is provided, we prioritize it
        if (hospitalName) {
            // Clean the name to increase match chances (handle plurals too)
            const searchName = hospitalName.replace(/(hospitals|hospital|clinics|clinic|centers|center|medical)/ig, '').trim();
            query.hospitalName = { $regex: searchName, $options: "i" };
        }

        // 2. Location-based search if lat/lng provided
        if (lat && lng && !hospitalName) { // Skip location if specific hospital is chosen
            query.location = {
                $near: {
                    $geometry: {
                        type: "Point",
                        coordinates: [parseFloat(lng), parseFloat(lat)]
                    },
                    $maxDistance: parseInt(radius) || 5000 // default 5km
                }
            };
        }

        // 3. Text search (Name or Specialization)
        if (search) {
            const searchRegex = { $regex: search, $options: "i" };
            if (query.hospitalName) {
                // If we already have a hospitalName filter, we add the search as an AND condition
                query.$or = [
                    { name: searchRegex },
                    { specialization: searchRegex }
                ];
            } else {
                query.$or = [
                    { name: searchRegex },
                    { specialization: searchRegex },
                    { hospitalName: searchRegex }
                ];
            }
        }

        // Fetch all matching doctors before pagination if filtering by date
        let doctors = [];
        let totalDoctors = 0;
        const skip = (parseInt(page) - 1) * parseInt(limit);
        
        console.log("[getDoctors API] Query:", query, "isEmergency:", isEmergency, "date:", date);

        // Bypass date/availability check for emergency bookings
        if (date && isEmergency !== 'true') {
            // Need to filter by availability, so fetch all matching first
            let allDoctors = await User.find(query).select("-password");
            
            const doctorIds = allDoctors.map(d => d._id);
            
            // Fetch availabilities
            const availabilities = await DoctorAvailability.find({ doctorId: { $in: doctorIds }, date });
            const availMap = {};
            availabilities.forEach(a => availMap[a.doctorId.toString()] = a.slots.map(s => s.time));

            // Fetch booked appointments
            const appointments = await Appointment.find({ doctorId: { $in: doctorIds }, date, status: { $ne: "cancelled" } });
            const bookedMap = {};
            appointments.forEach(a => {
                const dId = a.doctorId.toString();
                if (!bookedMap[dId]) bookedMap[dId] = [];
                bookedMap[dId].push(a.time);
            });

            const defaultSlots = [
                "09:00 AM", "09:30 AM", "10:00 AM", "10:30 AM", "11:00 AM", "11:30 AM",
                "12:00 PM", "12:30 PM", "01:00 PM", "01:30 PM", "02:00 PM", "02:30 PM",
                "03:00 PM", "03:30 PM", "04:00 PM", "04:30 PM", "05:00 PM"
            ];

            // Filter doctors who have at least one available slot
            allDoctors = allDoctors.filter(doc => {
                const dId = doc._id.toString();
                const potentialSlots = availMap[dId] || defaultSlots;
                const bookedTimes = bookedMap[dId] || [];
                const availableSlots = potentialSlots.filter(time => !bookedTimes.includes(time));
                
                // Also check if the slot is in the past (if date is today)
                const now = new Date();
                const year = now.getFullYear();
                const month = String(now.getMonth() + 1).padStart(2, '0');
                const day = String(now.getDate()).padStart(2, '0');
                const todayStr = `${year}-${month}-${day}`;

                if (date < todayStr) return false;

                if (date === todayStr) {
                    const futureSlots = availableSlots.filter(timeStr => {
                        const [time, modifier] = timeStr.split(" ");
                        let [hours, minutes] = time.split(":").map(Number);
                        if (modifier === "PM" && hours < 12) hours += 12;
                        if (modifier === "AM" && hours === 12) hours = 0;
                        
                        const slotTime = new Date();
                        slotTime.setHours(hours, minutes, 0, 0);
                        return slotTime > now;
                    });
                    return futureSlots.length > 0;
                }

                return availableSlots.length > 0;
            });

            totalDoctors = allDoctors.length;
            doctors = allDoctors.slice(skip, skip + parseInt(limit));
        } else {
            totalDoctors = await User.countDocuments(query);
            doctors = await User.find(query).select("-password").skip(skip).limit(parseInt(limit));
        }

        // Build a map of hospitalName -> hospitalAddress from admin accounts
        const hospitalNames = [...new Set(doctors.map(d => d.hospitalName).filter(Boolean))];
        const adminRecords = await User.find({
            role: 'admin',
            hospitalName: { $in: hospitalNames }
        }).select('hospitalName hospitalAddress').lean();

        const hospitalAddressMap = {};
        adminRecords.forEach(a => {
            // Use the first admin found with an address for that hospital
            if (a.hospitalName && a.hospitalAddress && !hospitalAddressMap[a.hospitalName]) {
                hospitalAddressMap[a.hospitalName] = a.hospitalAddress;
            }
        });

        const mappedDoctors = doctors.map(doc => {
            const docObj = doc.toObject();
            // Use the doctor's own hospitalAddress if set, otherwise fall back to admin's address
            const resolvedAddress = docObj.hospitalAddress || hospitalAddressMap[docObj.hospitalName] || null;
            return {
                ...docObj,
                specialization: docObj.specialization || "General Physician",
                hospitalName: docObj.hospitalName || "Main Hospital",
                hospitalAddress: resolvedAddress,
                experience: docObj.experience || `${Math.floor(Math.random() * 15) + 5} years`
            };
        });

        const totalPages = Math.max(Math.ceil(totalDoctors / limit), 1);

        res.json({ 
            success: true, 
            data: {
                doctors: mappedDoctors,
                totalPages,
                currentPage: parseInt(page)
            }
        });
    } catch (error) {
        console.error("Error fetching doctors:", error);
        res.status(500).json({ success: false, message: "Server error fetching doctors" });
    }
};

const getDoctorSlots = async (req, res) => {
    try {
        const { doctorId } = req.params;
        const { date } = req.query;

        // 1. Check for specific availability record (Doctor's manual override)
        const availability = await DoctorAvailability.findOne({ doctorId, date });
        
        let potentialSlots = [];

        if (availability) {
            // Doctor has set specific availability (or holiday if empty)
            potentialSlots = availability.slots.map(s => s.time);
        } else {
            // Default availability: 9 AM to 5 PM (30 min intervals)
            potentialSlots = [
                "09:00 AM", "09:30 AM", "10:00 AM", "10:30 AM", "11:00 AM", "11:30 AM",
                "12:00 PM", "12:30 PM", "01:00 PM", "01:30 PM", "02:00 PM", "02:30 PM",
                "03:00 PM", "03:30 PM", "04:00 PM", "04:30 PM", "05:00 PM"
            ];
        }

        // 2. Filter out booked appointments (and cancelled ones shouldn't block)
        const bookedAppointments = await Appointment.find({
            doctorId,
            date,
            status: { $ne: "cancelled" }
        }).select("time");

        const bookedTimes = bookedAppointments.map(a => a.time);
        
        // 3. Return available slots
        const availableSlots = potentialSlots.filter(time => !bookedTimes.includes(time));
        
        const responseSlots = availableSlots.map(time => ({
            time,
            isBooked: false
        }));

        res.json({ success: true, slots: responseSlots });
    } catch (error) {
        console.error("Error fetching doctor slots:", error);
        res.status(500).json({ success: false, message: "Server error fetching slots" });
    }
};

const bookAppointment = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const { doctorId, date, time, reason, isEmergency, emergencyReason } = req.body;
        const patientId = req.user.id;

        // Validation: Past Date and Time (Skip for emergency if it's "now")
        const appointmentDateTime = buildAppointmentDateTime(date, time);
        if (!isEmergency && (!appointmentDateTime || appointmentDateTime < new Date())) {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({
                success: false,
                message: "Cannot book appointments for past dates or times."
            });
        }

        const patient = await User.findById(patientId).select('name admission').session(session);
        if (patient?.admission?.isAdmitted) {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({
                success: false,
                message: "Cannot book an appointment while admitted to hospital. Please use your in-hospital care team instead."
            });
        }

        console.log("[bookAppointment] Booking for patientId:", patientId, "doctorId:", doctorId, "isEmergency:", isEmergency);

        // Check for ANY existing active appointments (pending or approved) with ANY doctor
        const existingAnyActiveAppointment = await Appointment.findOne({
            patientId: new mongoose.Types.ObjectId(patientId),
            status: { $in: ["pending", "approved"] }
        }).session(session);

        if (existingAnyActiveAppointment) {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({ 
                success: false, 
                message: "You already have an active appointment. Please complete or cancel your current appointment before booking a new one." 
            });
        }

        const doctorExists = await User.findOne({ _id: doctorId, role: "doctor" }).session(session);
        if (!doctorExists) {
            await session.abortTransaction();
            session.endSession();
            return res.status(404).json({ success: false, message: "Doctor not found" });
        }

        // Check availability slot (Skip for emergency)
        if (!isEmergency) {
            const availability = await DoctorAvailability.findOne({ doctorId, date }).session(session);
            
            if (availability) {
                const slotIndex = availability.slots.findIndex(s => s.time === time);
                
                if (slotIndex !== -1) {
                    if (availability.slots[slotIndex].isBooked) {
                        await session.abortTransaction();
                        session.endSession();
                        return res.status(400).json({ success: false, message: "Slot already booked" });
                    }
                    
                    // Mark slot as booked
                    availability.slots[slotIndex].isBooked = true;
                    await availability.save({ session });
                }
            }
        }

        const appointment = new Appointment({
            patientId: new mongoose.Types.ObjectId(patientId),
            doctorId: new mongoose.Types.ObjectId(doctorId),
            date,
            time,
            reason: isEmergency ? (emergencyReason || reason) : reason,
            isEmergency: !!isEmergency,
            emergencyReason: isEmergency ? emergencyReason : undefined,
            priority: isEmergency ? 2 : 0, // High priority for direct emergency bookings
            status: isEmergency ? "approved" : "pending", // Emergencies are auto-approved
            reallocationAccepted: isEmergency ? "accepted" : "pending" // Auto-accept for direct user-initiated emergencies
        });

        await appointment.save({ session });

        let emergencyCase = null;
        if (isEmergency) {
            const dupCheck = await EmergencyCase.findOne({
                linkedAppointmentId: appointment._id,
            }).session(session);

            if (!dupCheck) {
                const requestIncidentType = req.body.incidentType;
                const requestSeverity = req.body.severity;

                const normalizedIncidentType = INCIDENT_TYPES.includes(requestIncidentType)
                    ? requestIncidentType
                    : "MEDICAL_EMERGENCY";

                let normalizedSeverity = SEVERITY_LEVELS.includes(requestSeverity)
                    ? requestSeverity
                    : null;

                if (!normalizedSeverity) {
                    const erUp = (emergencyReason || reason || "").toLowerCase();
                    if (/cardiac|chest.?pain|heart|stroke|seizure|unconscious|breathing|bleeding|accident/.test(erUp)) {
                        normalizedSeverity = "CRITICAL";
                    } else if (/fall|fever|pain|severe|urgent|allergy/.test(erUp)) {
                        normalizedSeverity = "HIGH";
                    } else if (/mild|minor|headache|nausea/.test(erUp)) {
                        normalizedSeverity = "MODERATE";
                    } else {
                        normalizedSeverity = "HIGH";
                    }
                }

                emergencyCase = new EmergencyCase({
                    patient: new mongoose.Types.ObjectId(patientId),
                    reportedBy: new mongoose.Types.ObjectId(patientId),
                    incidentType: normalizedIncidentType,
                    description: isEmergency ? (emergencyReason || reason || "") : (reason || ""),
                    severity: normalizedSeverity,
                    location: {},
                    assignedHospital: doctorExists.hospitalName || undefined,
                    assignedDoctor: new mongoose.Types.ObjectId(doctorId),
                    linkedAppointmentId: appointment._id,
                    responseType: "DOCTOR_EMERGENCY",
                    status: "REPORTED",
                    statusTimestamps: new Map([["REPORTED", new Date()]]),
                });

                await emergencyCase.save({ session });
            } else {
                emergencyCase = dupCheck;
            }
        }
        
        // Emit socket event for real-time updates
        const io = socket.getIO();
        
        if (!isEmergency) {
            // 1. Update availability for all patients on this date/slot
            io.emit("slot-booked", { doctorId, date, time });
        }

        // 2. Notify the specific doctor in real-time
        io.to(String(doctorId)).emit("new-appointment-received", {
            appointmentId: appointment._id,
            patientId: patientId,
            patientName: patient?.name || "New Patient",
            date,
            time,
            reason: appointment.reason,
            isEmergency: appointment.isEmergency,
            message: appointment.isEmergency 
                ? `🚨 EMERGENCY: New urgent appointment from ${patient?.name || "New Patient"}!`
                : `You have a new appointment booking for ${date} at ${time}.`
        });

        await session.commitTransaction();
        session.endSession();

        console.log("[bookAppointment] Appointment saved:", appointment._id);

        let emergencyCasePayload = null;
        if (isEmergency && emergencyCase) {
            try {
                const ipAddress = (
                    req.ip ||
                    (req.headers && req.headers["x-forwarded-for"]) ||
                    (req.connection && req.connection.remoteAddress) ||
                    "127.0.0.1"
                );

                const populatedEmergency = await EmergencyCase.findById(emergencyCase._id)
                    .populate("patient", "name email phone bloodGroup healthSummary")
                    .populate("reportedBy", "name role email")
                    .populate("assignedDoctor", "name specialization hospitalName")
                    .lean();

                emergencyCasePayload = populatedEmergency;

                await logAction({
                    userId: new mongoose.Types.ObjectId(patientId),
                    role: req.user.role,
                    action: "EMERGENCY_CASE_CREATED",
                    module: "EMERGENCY",
                    targetId: String(emergencyCase._id),
                    ipAddress,
                    details: {
                        source: "emergencyBooking",
                        linkedAppointmentId: String(appointment._id),
                        incidentType: emergencyCase.incidentType,
                        severity: emergencyCase.severity,
                        assignedHospital: emergencyCase.assignedHospital || null,
                    },
                });

                const socketPayload = {
                    emergencyCaseId: String(emergencyCase._id),
                    status: emergencyCase.status,
                    severity: emergencyCase.severity,
                    incidentType: emergencyCase.incidentType,
                    patientId: String(patientId),
                    assignedHospital: emergencyCase.assignedHospital || null,
                    linkedAppointmentId: String(appointment._id),
                    createdBy: patientId,
                };

                try {
                    const io = socket.getIO();
                    io.emit("emergency-created", socketPayload);
                    io.to(String(patientId)).emit("emergency-created", socketPayload);
                    io.to(String(doctorId)).emit("emergency-created", socketPayload);
                    io.emit("hospital-emergency-alert", {
                        emergencyCaseId: String(emergencyCase._id),
                        status: "REPORTED",
                        assignedHospital: emergencyCase.assignedHospital || null,
                        patientId: String(patientId),
                        severity: emergencyCase.severity,
                    });
                } catch (sockErr) {
                    console.warn("[bookAppointment] Emergency socket emit skipped:", sockErr.message);
                }
            } catch (postCommitErr) {
                console.error("[bookAppointment] Post-commit emergency attach failed:", postCommitErr.message);
            }
        }

        const responseData = appointment.toObject ? appointment.toObject() : appointment;
        if (emergencyCasePayload) {
            responseData.emergencyCase = emergencyCasePayload;
        }

        res.status(201).json({ success: true, data: responseData });
    } catch (error) {
        await session.abortTransaction();
        session.endSession();
        console.error("[bookAppointment] Error:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

const getAppointments = async (req, res) => {
  try {
    const patientId = new mongoose.Types.ObjectId(req.user.id);
    const now = new Date();

    // Auto-reallocate or expire past pending/approved appointments
    const allPast = await Appointment.find({
      patientId,
      status: { $in: ['pending', 'approved'] }
    }).populate('doctorId');

    for (const apt of allPast) {
      const aptDateTime = buildAppointmentDateTime(apt.date, apt.time);
      if (aptDateTime) {
        const twentyMinsLater = new Date(aptDateTime.getTime() + 20 * 60000);
        
        // REALLOCATION LOGIC:
        // 1. Appointment is approved
        // 2. Current time is > 20 mins after the booked slot
        // 3. No doctor action has been taken (lastDoctorActionAt is null OR older than aptDateTime)
        if (apt.status === 'approved' && now > twentyMinsLater && !apt.isEmergency) {
          const noActionTaken = !apt.lastDoctorActionAt || apt.lastDoctorActionAt < aptDateTime;
          
          if (noActionTaken) {
            const originalDoctor = apt.doctorId;
            if (originalDoctor) {
              // Find another doctor in the same hospital with same specialization
              const replacementDoctor = await User.findOne({
                role: 'doctor',
                hospitalName: originalDoctor.hospitalName,
                specialization: originalDoctor.specialization,
                _id: { $ne: originalDoctor._id },
                isApproved: true
              });

              if (replacementDoctor) {
                // Check if replacement doctor is already booked for this slot
                const isBooked = await Appointment.findOne({
                  doctorId: replacementDoctor._id,
                  date: apt.date,
                  time: apt.time,
                  status: { $in: ['pending', 'approved'] }
                });

                if (!isBooked) {
                  // Reallocate!
                  apt.originalDoctorId = originalDoctor._id;
                  apt.doctorId = replacementDoctor._id;
                  apt.isEmergency = true;
                  apt.allocatedBySystem = true;
                  apt.reallocationAccepted = 'pending'; // Require patient confirmation
                  apt.status = 'approved'; 
                  await apt.save();
                  continue; 
                }
              }
            }
          }
        }
        
        // Expiry logic for older appointments (e.g. end of day or if no reallocation possible)
        const endOfDay = new Date(aptDateTime);
        endOfDay.setHours(23, 59, 59, 999);
        if (now > endOfDay) {
          apt.status = 'expired';
          await apt.save();
        }
      }
    }

    // Now return all appointments for the patient (calendar needs history too)
    const appointments = await Appointment.find({ patientId })
      .populate({
        path: 'doctorId',
        select: 'name specialization hospitalName profileImage delayStatus'
      })
      .sort({ date: -1, time: -1 });

    res.json({ success: true, data: appointments });
  } catch (error) {
    console.error('[getAppointments] Error fetching patient appointments:', error);
    res.status(500).json({ success: false, message: 'Server error fetching appointments' });
  }
};

const cancelAppointment = async (req, res) => {
  try {
    const patientId = new mongoose.Types.ObjectId(req.user.id);
    const { id } = req.params;

    const appointment = await Appointment.findOne({ _id: id, patientId });
    if (!appointment) {
      return res
        .status(404)
        .json({
          success: false,
          message: "Appointment not found or unauthorized",
        });
    }

    if (!["pending", "approved"].includes(appointment.status)) {
      return res
        .status(400)
        .json({
          success: false,
          message: "Only pending or approved appointments can be cancelled",
        });
    }

    // 6-hour rule for approved appointments
    if (appointment.status === "approved") {
        const appointmentDateTime = new Date(appointment.date);
        const [hours, minutes] = appointment.time.split(':');
        appointmentDateTime.setHours(parseInt(hours), parseInt(minutes), 0, 0);

        const now = new Date();
        const diffInMs = appointmentDateTime - now;
        const diffInHours = diffInMs / (1000 * 60 * 60);

        if (diffInHours < 6) {
            return res.status(400).json({ 
                success: false, 
                message: "Cannot cancel an approved appointment within 6 hours of the scheduled time" 
            });
        }
    }

    appointment.status = "cancelled";
    await appointment.save();

    res.json({
      success: true,
      message: "Appointment cancelled",
      data: appointment,
    });
  } catch (error) {
    console.error("[cancelAppointment] Error:", error);
    res
      .status(500)
      .json({ success: false, message: "Server error cancelling appointment" });
  }
};

const updateInsurance = async (req, res) => {
  try {
    const patientId = req.user.id;
    const { insuranceProviderName, policyNumber, validTillDate } = req.body;
    const insuranceProofImage = req.file ? req.file.path : undefined;

    const updateData = {};
    if (insuranceProviderName) updateData.insuranceProviderName = insuranceProviderName;
    if (policyNumber) updateData.policyNumber = policyNumber;
    if (validTillDate) updateData.validTillDate = new Date(validTillDate);
    if (insuranceProofImage) updateData.insuranceProofImage = insuranceProofImage;

    const updatedUser = await User.findByIdAndUpdate(
      patientId,
      { $set: updateData },
      { new: true, runValidators: true }
    ).select("-password");

    res.json({ success: true, data: updatedUser });
  } catch (error) {
    console.error("Error updating insurance:", error);
    res.status(500).json({ success: false, message: "Server error updating insurance" });
  }
};

const getInsuranceClaims = async (req, res) => {
  try {
    const patientId = req.user.id;
    const claims = await Insurance.find({ patientId })
      .populate("billingId")
      .sort({ createdAt: -1 });

    res.json({ success: true, data: claims });
  } catch (error) {
    console.error("Error fetching insurance claims:", error);
    res.status(500).json({ success: false, message: "Server error fetching claims" });
  }
};

const respondToReallocation = async (req, res) => {
  try {
    const { id } = req.params;
    const { accept } = req.body; // boolean
    const patientId = req.user.id;

    const appointment = await Appointment.findOne({ _id: id, patientId });
    if (!appointment) {
      return res.status(404).json({ success: false, message: "Appointment not found" });
    }

    if (!appointment.isEmergency || appointment.reallocationAccepted !== "pending") {
      return res.status(400).json({ success: false, message: "No pending reallocation for this appointment" });
    }

    if (accept) {
      appointment.reallocationAccepted = "accepted";
    } else {
      appointment.reallocationAccepted = "rejected";
      appointment.status = "cancelled";
    }

    await appointment.save();

    // Notify doctor
    try {
      const io = socket.getIO();
      if (accept) {
        io.to(String(appointment.doctorId)).emit("appointment-updated", {
          appointmentId: appointment._id,
          status: "approved",
          patientId: appointment.patientId
        });
      }
    } catch (err) {}

    res.json({
      success: true,
      message: accept ? "Reallocation accepted" : "Appointment cancelled",
      data: appointment
    });
  } catch (error) {
    console.error("Error responding to reallocation:", error);
    res.status(500).json({ success: false, message: "Server error responding to reallocation" });
  }
};

const respondToDelayRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const { accept } = req.body;
    const patientId = req.user.id;
    if (typeof accept !== "boolean") {
      return res.status(400).json({ success: false, message: "accept must be a boolean" });
    }

    const appointment = await Appointment.findOne({ _id: id, patientId });
    if (!appointment) return res.status(404).json({ success: false, message: "Appointment not found" });
    if (appointment.delayRequestStatus !== "pending") {
      return res.status(400).json({ success: false, message: "No pending delay request for this appointment" });
    }

    const oldTime = appointment.time;
    appointment.delayRequestStatus = accept ? "accepted" : "rejected";
    if (accept) {
      appointment.time = appointment.proposedTime;
      appointment.status = "approved";
    }
    await appointment.save();

    const payload = {
      appointmentId: appointment._id,
      patientId: appointment.patientId,
      doctorId: appointment.doctorId,
      oldTime,
      proposedTime: appointment.proposedTime,
      reason: appointment.delayReason,
      message: appointment.delayMessage,
      delayRequestStatus: appointment.delayRequestStatus,
      status: appointment.status,
    };
    const io = socket.getIO();
    io.to(String(appointment.doctorId)).emit(accept ? "patient-delay-accepted" : "patient-delay-rejected", payload);
    io.to(String(appointment.doctorId)).emit("appointment-updated", payload);
    io.to(String(patientId)).emit("appointment-updated", payload);

    res.json({ success: true, message: accept ? "New appointment time accepted" : "Delay request declined; the original time remains", data: appointment });
  } catch (error) {
    console.error("Error responding to delay request:", error);
    res.status(500).json({ success: false, message: "Server error responding to delay request" });
  }
};

const getLabOrders = async (req, res) => {
    try {
        const patientId = req.user.id;
        const labOrders = await LabOrder.find({ patientId })
            .populate("doctorId", "name specialization hospitalName")
            .sort({ date: -1 })
            .lean();

        // For completed orders, find the corresponding medical record
        const ordersWithReports = await Promise.all(labOrders.map(async (order) => {
            if (order.status === 'completed') {
                const report = await Record.findOne({
                    patientId,
                    diagnosis: `Lab Test: ${order.testName}`,
                    // We can also match by date range if needed, but diagnosis + patient should be unique enough
                }).lean();
                return { ...order, report };
            }
            return order;
        }));

        res.json({ success: true, data: ordersWithReports });
    } catch (error) {
        console.error("Error fetching lab orders:", error);
        res.status(500).json({ success: false, message: "Server error fetching lab orders" });
    }
};

const rateAppointment = async (req, res) => {
    try {
        const { id } = req.params;
        const { rating, review } = req.body;
        const patientId = req.user.id;

        if (!rating || rating < 1 || rating > 5) {
            return res.status(400).json({ success: false, message: "Rating must be between 1 and 5" });
        }

        const appointment = await Appointment.findOne({ _id: id, patientId });
        if (!appointment) {
            return res.status(404).json({ success: false, message: "Appointment not found" });
        }

        if (appointment.status !== "completed") {
            return res.status(400).json({ success: false, message: "Can only rate completed appointments" });
        }

        if (appointment.rating) {
            return res.status(400).json({ success: false, message: "You have already rated this appointment" });
        }

        appointment.rating = Number(rating);
        appointment.review = review || "";
        await appointment.save();

        // Update Doctor's overall rating
        const doctor = await User.findById(appointment.doctorId);
        if (doctor) {
            const currentTotal = (doctor.averageRating || 0) * (doctor.ratingCount || 0);
            const newCount = (doctor.ratingCount || 0) + 1;
            const newAverage = (currentTotal + Number(rating)) / newCount;

            doctor.ratingCount = newCount;
            doctor.averageRating = Number(newAverage.toFixed(1));
            await doctor.save();
        }

        res.json({ success: true, message: "Rating submitted successfully" });
    } catch (error) {
        console.error("Error rating appointment:", error);
        res.status(500).json({ success: false, message: "Server error rating appointment" });
    }
};

const getDoctorReviews = async (req, res) => {
    try {
        const { doctorId } = req.params;
        const reviews = await Appointment.find({ 
            doctorId, 
            status: "completed", 
            rating: { $exists: true } 
        })
        .populate("patientId", "name profileImage")
        .select("rating review createdAt patientId")
        .sort({ createdAt: -1 })
        .limit(10);

        res.json({ success: true, data: reviews });
    } catch (error) {
        console.error("Error fetching doctor reviews:", error);
        res.status(500).json({ success: false, message: "Server error fetching reviews" });
    }
};

const getAdmissionStatus = async (req, res) => {
  try {
    const patientId = req.user.id;
    const patient = await User.findById(patientId);

    if (!patient || !patient.admission?.isAdmitted) {
      return res.json({ success: true, isAdmitted: false });
    }

    // Find the hospital admin to get pricing
    const hospitalAdmin = await User.findOne({ 
      role: 'admin', 
      hospitalName: patient.admission.hospitalName 
    });

    if (!hospitalAdmin) {
      return res.status(404).json({ success: false, message: "Hospital details not found" });
    }

    const costs = await calculateLiveAdmissionCosts(patient, hospitalAdmin.hospitalPricing);

    res.json({
      success: true,
      isAdmitted: true,
      data: {
        hospitalName: patient.admission.hospitalName,
        hospitalAddress: hospitalAdmin.hospitalAddress,
        admittedAt: costs.totalStayStart,
        days: costs.totalStayDays,
        currentWard: patient.admission.ward,
        wardHistory: patient.admission.wardHistory,
        doctorName: (await User.findById(patient.admission.doctorId))?.name || "Attending Physician",
        doctorSignature: (await User.findById(patient.admission.doctorId))?.signature || null,
        summary: [
          ...costs.wardBreakdown,
          { name: "Doctor Consultation Fees", cost: costs.doctorFeeTotal, type: "consultancy", details: `₹${costs.doctorFee} x ${costs.totalStayDays} days` },
          { name: "Laboratory Investigations", cost: costs.labTotal, type: "lab_test" },
          { name: "Pharmacy (Ward Delivery)", cost: costs.medicineTotal, type: "medicine" }
        ],
        total: costs.total,
        certificate: patient.admission.certificate
      }
    });
  } catch (error) {
    console.error("Error fetching admission status:", error);
    res.status(500).json({ success: false, message: "Server error fetching admission status" });
  }
};

module.exports = {
  getOverview,
  getRecords,
  getPrescriptions,
  getReminders,
  getDoctors,
  getDoctorSlots,
  bookAppointment,
  getAppointments,
  cancelAppointment,
  updateInsurance,
  getInsuranceClaims,
    respondToReallocation,
    respondToDelayRequest,
  getLabOrders,
  rateAppointment,
  getDoctorReviews,
  getAdmissionStatus
};

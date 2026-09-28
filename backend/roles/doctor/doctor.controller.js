const Record = require("../../modules/medical-records/models/record.model");
const Prescription = require("../../modules/prescriptions/models/prescription.model");
const User = require("../../modules/users/models/user.model");
const Appointment = require("../../modules/appointments/models/appointment.model");
const DoctorAvailability = require("../../modules/appointments/models/availability.model");
const EmergencyCase = require("../../modules/emergency/models/emergencyCase.model");
const { createOrder } = require("../../modules/pharmacy-orders/service");
const { logAction } = require("../../modules/audit/service");
const crypto = require("crypto");
const mongoose = require("mongoose");
const { assertValidStatusTransition } = require("../../modules/emergency/service");
const { getPatientRecords } = require("../../modules/medical-records/service");
const socket = require("../../core/socket");

// NOTE: Blockchain service is loaded lazily inside createRecord to prevent
// startup crash when the blockchain artifact/env vars are not configured.


// GET /api/doctor/patients
exports.getPatients = async (req, res) => {
    try {
        const doctorId = req.user.id;

        // Find patients who have active prescriptions OR have active appointments with this doctor
        // We filter by active appointments so patients are removed from "My Patients" after completion.
        const patientIdsFromPrescriptions = await Prescription.find({
            doctorId
        }).distinct("patientId");

        const activeAppointmentPatientIds = await Appointment.find({
            doctorId,
            status: { $in: ["approved", "pending"] }
        }).distinct("patientId");

        const allPatientIds = [...new Set([...patientIdsFromPrescriptions, ...activeAppointmentPatientIds])];

        const patients = await User.find({
            _id: { $in: allPatientIds },
            role: "patient"
        }).select("_id name email");

        res.json({ success: true, data: patients });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// GET /api/doctor/patient-history/:patientId
exports.getPatientHistory = async (req, res) => {
    try {
        const { patientId } = req.params;
        const doctorId = req.user.id;

        // Update action timestamp on appointment
        try {
            await Appointment.findOneAndUpdate(
                { doctorId, patientId, status: "approved" },
                { lastDoctorActionAt: new Date() }
            );
        } catch (err) {
            console.warn("Could not update appointment action timestamp:", err.message);
        }

        const records = await Record.find({ patientId }).sort({ createdAt: -1 });
        const prescriptions = await Prescription.find({ patientId }).sort({ createdAt: -1 });

        // Fetch patient to get their name for the audit log
        const patient = await User.findById(patientId).select("name");

        // Log this action
        await logAction({
            userId: doctorId,
            role: req.user.role,
            action: "VIEW_PATIENT_HISTORY",
            module: "Doctor",
            targetId: patientId,
            ipAddress: req.ip,
            details: { patientName: patient?.name || "Unknown Patient", patientId }
        });

        res.json({
            success: true,
            data: { records, prescriptions }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// GET /api/doctor/emergency-cases/:caseId/medical-history
exports.getEmergencyCaseMedicalHistory = async (req, res) => {
    try {
        const { caseId } = req.params;
        const doctorId = req.user.id;

        const emergencyCase = await EmergencyCase.findById(caseId)
            .populate("patient", "_id name email")
            .populate("assignedDoctor", "_id name hospitalName");

        if (!emergencyCase) {
            return res.status(404).json({ success: false, message: "Emergency case not found" });
        }

        const patientId = emergencyCase.patient?._id || emergencyCase.patient;
        if (!patientId) {
            return res.status(404).json({ success: false, message: "Patient not found for this emergency case" });
        }

        const doctor = await User.findById(doctorId).select("hospitalName");
        const assignedDoctorId = emergencyCase.assignedDoctor?._id || emergencyCase.assignedDoctor;
        const sameHospital = !!doctor?.hospitalName &&
            !!emergencyCase.assignedHospital &&
            doctor.hospitalName.toLowerCase() === emergencyCase.assignedHospital.toLowerCase();

        const isAuthorized = String(assignedDoctorId) === String(doctorId) || sameHospital;
        if (!isAuthorized) {
            return res.status(403).json({
                success: false,
                message: "Forbidden: You are not authorized to view this patient medical history"
            });
        }

        await logAction({
            userId: doctorId,
            role: req.user.role,
            action: "VIEW_EMERGENCY_CASE_MEDICAL_HISTORY",
            module: "Doctor",
            targetId: caseId,
            ipAddress: req.ip,
            details: {
                patientId: String(patientId),
                patientName: emergencyCase.patient?.name || "Unknown Patient",
                emergencyCaseId: caseId
            }
        });

        const records = await getPatientRecords(patientId);

        res.json({
            success: true,
            data: records
        });
    } catch (error) {
        console.error("Error fetching emergency case medical history:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// POST /api/doctor/create-record
exports.createRecord = async (req, res) => {
    try {
        const { patientId, diagnosis, symptoms, labResults, treatmentPlan, notes } = req.body;
        const doctorId = req.user.id;

        // Validate patient exists
        const patientExists = await User.findOne({ _id: patientId, role: "patient" });
        if (!patientExists) {
            return res.status(404).json({ success: false, message: "Patient not found" });
        }

        // Update action timestamp on appointment
        try {
            await Appointment.findOneAndUpdate(
                { doctorId, patientId, status: "approved" },
                { lastDoctorActionAt: new Date() }
            );
        } catch (err) {
            console.warn("Could not update appointment action timestamp:", err.message);
        }

        // Create medical record object
        let recordData = {
            doctorId,
            patientId,
            diagnosis,
            symptoms,
            labResults,
            treatmentPlan,
            notes,
            blockchainVerified: false
        };

        const record = new Record(recordData);
        await record.save();

        // Notify socket of new record (even if not verified yet)
        try {
            const io = require("../../core/socket").getIO();
            io.to(String(patientId)).emit("new-record-created", {
                recordId: record._id,
                diagnosis: record.diagnosis,
                patientId: patientId
            });
        } catch (err) {
            console.warn("Socket notification failed for record creation:", err.message);
        }

        // Generate SHA-256 Hash
        const rawData = JSON.stringify({
            id: record._id.toString(),
            diagnosis,
            symptoms,
            treatmentPlan,
            timestamp: record.createdAt.getTime()
        });
        const sha256Hash = crypto.createHash('sha256').update(rawData).digest('hex');

        // Store hash on blockchain using smart contract (lazy load to avoid startup crash)
        let blockchainTxHash = "";
        try {
            const { addRecord: addRecordOnChain } = require("../../core/services/blockchain/contract.service");
            const result = await addRecordOnChain(sha256Hash, patientId);
            blockchainTxHash = result.txHash;
        } catch (blockchainError) {
            console.warn("Blockchain node not reachable or failed. Setting as pending.");
            // Simulated blockchain tx hash for development resilience 
            blockchainTxHash = "SIMULATED_" + crypto.randomBytes(16).toString('hex');
        }

        record.blockchainTxHash = blockchainTxHash;
        record.blockchainVerified = blockchainTxHash && !blockchainTxHash.startsWith("SIMULATED_");
        await record.save();

        // Fetch patient for audit log
        const patient = await User.findById(patientId).select("name");

        // Audit Log
        await logAction({
            userId: doctorId,
            role: req.user.role,
            action: "CREATE_MEDICAL_RECORD",
            module: "Doctor",
            targetId: record._id,
            ipAddress: req.ip,
            details: { 
                patientName: patient?.name || "Unknown Patient", 
                patientId,
                diagnosis 
            }
        });

        res.status(201).json({
            success: true,
            record,
            blockchainTxHash: record.blockchainTxHash
        });

        // Notify socket of new verified record
        if (record.blockchainVerified) {
            try {
                const io = require("../../core/socket").getIO();
                io.emit("blockchain-record-verified", {
                    recordId: record._id,
                    txHash: record.blockchainTxHash,
                    patientId: record.patientId
                });
            } catch (err) {}
        }

    } catch (error) {
        console.error("Error creating record:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// GET /api/doctor/pending-records
exports.getPendingRecords = async (req, res) => {
    try {
        const doctorId = req.user.id;
        const pendingRecords = await Record.find({ 
            doctorId, 
            blockchainVerified: false 
        }).populate('patientId', 'name email');

        res.json({ success: true, data: pendingRecords });
    } catch (error) {
        console.error("Error fetching pending records:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// PATCH /api/doctor/verify-record/:id
exports.verifyRecordOnBlockchain = async (req, res) => {
    try {
        const { id } = req.params;
        const doctorId = req.user.id;

        const record = await Record.findOne({ _id: id, doctorId });
        if (!record) {
            return res.status(404).json({ success: false, message: "Record not found" });
        }

        if (record.blockchainVerified) {
            return res.status(400).json({ success: true, message: "Already verified" });
        }

        // Generate SHA-256 Hash
        const rawData = JSON.stringify({
            id: record._id.toString(),
            diagnosis: record.diagnosis,
            symptoms: record.symptoms,
            treatmentPlan: record.treatmentPlan,
            timestamp: record.createdAt.getTime()
        });
        const sha256Hash = crypto.createHash('sha256').update(rawData).digest('hex');

        // Store hash on blockchain
        let result;
        try {
            const { addRecord: addRecordOnChain } = require("../../core/services/blockchain/contract.service");
            result = await addRecordOnChain(sha256Hash, record.patientId.toString());
            
            record.blockchainTxHash = result.txHash;
            record.blockchainVerified = true;
            await record.save();

            // Fetch patient name for log
            const patient = await User.findById(record.patientId).select("name");

            // Log action
            await logAction({
                userId: doctorId,
                role: req.user.role,
                action: "VERIFY_BLOCKCHAIN_RECORD",
                module: "Doctor",
                targetId: record._id,
                ipAddress: req.ip,
                details: { 
                    patientName: patient?.name || "Unknown Patient", 
                    patientId: record.patientId,
                    txHash: result.txHash 
                }
            });

            const io = require("../../core/socket").getIO();
            io.emit("blockchain-record-verified", {
                recordId: record._id,
                txHash: result.txHash,
                patientId: record.patientId
            });

            res.json({ success: true, message: "Record verified on blockchain", txHash: result.txHash });
        } catch (blockchainError) {
            res.status(503).json({ success: false, message: "Blockchain node still unreachable" });
        }
    } catch (error) {
        console.error("Error verifying record:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// POST /api/doctor/create-prescription
exports.createPrescription = async (req, res) => {
    try {
        const { patientId, medicines, instructions, notes, deliveryType, wardNumber, roomNo, isEmergency } = req.body;
        const doctorId = req.user.id;

        // Validate patient exists
        const patientExists = await User.findOne({ _id: patientId, role: "patient" });
        if (!patientExists) {
            return res.status(404).json({ success: false, message: "Patient not found" });
        }

        // Update action timestamp on appointment
        try {
            await Appointment.findOneAndUpdate(
                { doctorId, patientId, status: "approved" },
                { lastDoctorActionAt: new Date() }
            );
        } catch (err) {
            console.warn("Could not update appointment action timestamp:", err.message);
        }

        const isWardDelivery = deliveryType === "WARD";

        const prescription = new Prescription({
            doctorId,
            patientId,
            medicines,
            instructions,
            notes: notes || instructions,
            status: "active",
            deliveryType: deliveryType || "PHARMACY",
            wardNumber: isWardDelivery ? wardNumber : undefined,
            isEmergency: isWardDelivery ? !!isEmergency : false
        });

        await prescription.save();

        // Fetch patient name for log
        const patient = await User.findById(patientId).select("name");

        // Log action
        await logAction({
            userId: doctorId,
            role: req.user.role,
            action: "CREATE_PRESCRIPTION",
            module: "Doctor",
            targetId: prescription._id,
            ipAddress: req.ip,
            details: { 
                patientName: patient?.name || "Unknown Patient", 
                patientId, 
                deliveryType: prescription.deliveryType 
            }
        });

        const doctor = await User.findById(doctorId);

        // Auto-forward to Pharmacy by creating an order
        await createOrder({
            patientId,
            prescriptionId: prescription._id,
            medicines: medicines.map(m => m.name),
            billAmount: 0,
            doctorId,
            hospitalName: doctor?.hospitalName,
            hospitalAddress: doctor?.hospitalAddress,
            isAdmitted: isWardDelivery,
            wardNumber: isWardDelivery ? wardNumber : undefined,
            roomNo: isWardDelivery ? roomNo : undefined,
            isEmergency: isWardDelivery ? !!isEmergency : false
        });

        try {
            const io = socket.getIO();
            io.emit("prescription-created", {
                prescriptionId: prescription._id,
                doctorId,
                patientId
            });
        } catch (socketErr) {
            console.warn("Socket notification failed for prescription creation:", socketErr.message);
        }

        res.status(201).json({
            success: true,
            prescription
        });

    } catch (error) {
        console.error("Error creating prescription:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// GET /api/doctor/overview
exports.getOverview = async (req, res) => {
    try {
        const doctorId = req.user.id;

        // Count distinct patients associated with this doctor (by prescriptions or appointments)
        const patientIdsFromPrescriptions = await Prescription.find({ doctorId }).distinct("patientId");
        const patientIdsFromAppointments = await Appointment.find({ doctorId }).distinct("patientId");
        const allPatientIds = [...new Set([...patientIdsFromPrescriptions, ...patientIdsFromAppointments])];
        
        const totalPatients = allPatientIds.length;

        // Count today's appointments specifically
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        const totalAppointmentsToday = await Appointment.countDocuments({ 
            doctorId,
            date: { $gte: today, $lt: tomorrow },
            $or: [
                { isEmergency: false },
                { isEmergency: true, reallocationAccepted: "accepted" }
            ]
        });

        const drRecords = await Record.find({ doctorId });
        const pendingRecords = drRecords.filter(r => !r.blockchainVerified).length;

        const verifiedRecords = drRecords.filter(r => r.blockchainVerified).length;
        const blockchainVerifiedPercentage = drRecords.length > 0 ? Math.round((verifiedRecords / drRecords.length) * 100) : 100;

        res.json({
            success: true,
            data: {
                totalPatients,
                totalAppointments: totalAppointmentsToday,
                pendingRecords,
                blockchainVerifiedPercentage
            }
        });

    } catch (error) {
        console.error("Error fetching doctor overview:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// GET /api/doctor/appointments
exports.getAppointments = async (req, res) => {
    try {
        const doctorId = req.user.id;
        const appointments = await Appointment.find({ 
            doctorId,
            $or: [
                { isEmergency: false },
                { isEmergency: true } // Include all emergencies (user-initiated or system-reallocated)
            ]
        })
        .populate('patientId', 'name')
        .sort({ priority: -1, date: 1, time: 1 }); // High priority first

        res.json({ success: true, data: appointments });
    } catch (error) {
        console.error("Error fetching doctor appointments:", error);
        res.status(500).json({ success: false, message: "Server error fetching appointments" });
    }
};

// PATCH /api/doctor/update-appointment/:id
exports.updateAppointment = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        const doctorId = req.user.id;

        const appointment = await Appointment.findOne({ _id: id, doctorId });

        if (!appointment) {
            return res.status(404).json({ success: false, message: "Appointment not found or unauthorized" });
        }

        if (status === "completed" && appointment.status !== "completed") {
            const User = require("../../modules/users/models/user.model");
            await User.findByIdAndUpdate(doctorId, { $inc: { patientsTreatedCount: 1 } });
        }

        appointment.status = status;
        await appointment.save();

        const io = socket.getIO();
        io.emit("appointment-updated", {
            appointmentId: appointment._id,
            status: appointment.status,
            patientId: appointment.patientId
        });
        if (appointment.status === "approved") {
            io.to(String(appointment.patientId)).emit("appointment-approved", {
                appointmentId: appointment._id,
                message: "Your appointment has been approved",
            });
        }

        res.json({ success: true, message: `Appointment ${status}` });
    } catch (error) {
        console.error("Error updating appointment:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// POST /api/doctor/availability
exports.createAvailability = async (req, res) => {
    try {
        const { date, slots } = req.body;
        const doctorId = req.user.id;

        // Ensure unique availability for date
        let availability = await DoctorAvailability.findOne({ doctorId, date });

        if (availability) {
            // Merge new slots if they don't exist
            const existingTimes = availability.slots.map(s => s.time);
            const newSlots = slots.filter(time => !existingTimes.includes(time))
                .map(time => ({ time, isBooked: false }));

            availability.slots.push(...newSlots);
        } else {
            availability = new DoctorAvailability({
                doctorId,
                date,
                slots: slots.map(time => ({ time, isBooked: false }))
            });
        }

        await availability.save();
        res.status(201).json({ success: true, availability });

    } catch (error) {
        console.error("Error creating availability:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// PATCH /api/doctor/update-delay
exports.updateDelayStatus = async (req, res) => {
    try {
        const doctorId = req.user.id;
        const { isDelayed, reason, expectedArrivalTime, appointmentId, message } = req.body;

        if (isDelayed) {
            if (!appointmentId || !reason || !expectedArrivalTime) {
                return res.status(400).json({ success: false, message: "Appointment, delay reason, and proposed time are required" });
            }

            const appointment = await Appointment.findOne({
                _id: appointmentId,
                doctorId,
                status: { $in: ["pending", "approved"] },
            });
            if (!appointment) {
                return res.status(404).json({ success: false, message: "Appointment not found or unavailable for a delay request" });
            }

            appointment.delayRequestStatus = "pending";
            appointment.delayReason = reason;
            appointment.delayMessage = message || "";
            appointment.proposedTime = expectedArrivalTime;
            appointment.delayRequestedAt = new Date();
            await appointment.save();

            const doctor = await User.findByIdAndUpdate(
                doctorId,
                {
                    $set: {
                        delayStatus: {
                            isDelayed: true,
                            reason,
                            expectedArrivalTime,
                            updatedAt: new Date()
                        }
                    }
                },
                { new: true }
            );

            const payload = {
                appointmentId: appointment._id,
                patientId: appointment.patientId,
                doctorId: appointment.doctorId,
                oldTime: appointment.time,
                proposedTime: appointment.proposedTime,
                reason: appointment.delayReason,
                message: appointment.delayMessage,
                delayRequestStatus: appointment.delayRequestStatus,
            };
            const io = socket.getIO();
            io.to(String(appointment.patientId)).emit("patient-delay-request", payload);
            io.to(String(appointment.patientId)).emit("appointment-updated", payload);
            io.to(String(doctorId)).emit("doctor-delay-reported", payload);

            return res.json({ success: true, message: "Delay request sent to the patient", data: doctor.delayStatus });
        } else {
            const doctor = await User.findByIdAndUpdate(
                doctorId,
                {
                    $set: {
                        delayStatus: {
                            isDelayed: false,
                            reason: "",
                            expectedArrivalTime: "",
                            updatedAt: new Date()
                        }
                    }
                },
                { new: true }
            );

            return res.json({ success: true, message: "Delay status updated", data: doctor.delayStatus });
        }
    } catch (error) {
        console.error("Error updating delay status:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// GET /api/doctor/availability
exports.getAvailability = async (req, res) => {
    try {
        const doctorId = req.user.id;
        const availability = await DoctorAvailability.find({ doctorId });
        res.json({ success: true, availability });
    } catch (error) {
        console.error("Error getting availability:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// DELETE /api/doctor/availability/:id
exports.deleteAvailability = async (req, res) => {
    try {
        const { id } = req.params;
        const doctorId = req.user.id;

        await DoctorAvailability.findOneAndDelete({ _id: id, doctorId });
        res.json({ success: true, message: "Availability deleted" });
    } catch (error) {
        console.error("Error deleting availability:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// GET /api/doctor/admitted-patients
exports.getAdmittedPatients = async (req, res) => {
    try {
        const doctorId = req.user.id;
        const doctor = await User.findById(doctorId).select("hospitalName specialization");

        if (!doctor?.hospitalName) {
            return res.json({ success: true, data: [] });
        }

        // The hospital admin admits the patient to a specific hospital.
        // All doctors belonging to that hospital should be able to see all admitted patients
        // in that particular hospital, regardless of the ward.
        let query = {
            role: "patient",
            "admission.isAdmitted": true,
            "admission.hospitalName": doctor.hospitalName
        };

        const patients = await User.find(query).select("name email phone admission gender bloodGroup");

        res.json({ success: true, data: patients });
    } catch (error) {
        console.error("Error fetching admitted patients:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// PATCH /api/doctor/issue-certificate/:patientId
exports.issueAdmissionCertificate = async (req, res) => {
    try {
        const { patientId } = req.params;
        const { status, notes, recommendDischarge, followUpDate } = req.body;
        const doctorId = req.user.id;

        const patient = await User.findOne({ _id: patientId, role: "patient", "admission.isAdmitted": true });
        if (!patient) {
            return res.status(404).json({ success: false, message: "Admitted patient not found" });
        }

        // Fetch doctor's name and signature
        const doctor = await User.findById(doctorId).select("name signature");

        patient.admission.certificate = {
            status,
            notes,
            doctorName: doctor?.name || "Attending Physician",
            signature: doctor?.signature || null,
            recommendDischarge: !!recommendDischarge,
            followUpDate: followUpDate || null,
            issuedAt: new Date()
        };

        await patient.save();

        // Log action
        await logAction({
            userId: doctorId,
            role: req.user.role,
            action: "ISSUE_ADMISSION_CERTIFICATE",
            module: "Doctor",
            targetId: patientId,
            ipAddress: req.ip,
            details: { 
                patientName: patient.name, 
                status,
                notes,
                recommendDischarge,
                followUpDate
            }
        });

        // Notify patient via socket
        try {
            const io = socket.getIO();
            io.to(String(patientId)).emit("admission-certificate-issued", {
                status,
                notes,
                doctorName: doctor?.name || "Attending Physician",
                signature: doctor?.signature || null,
                recommendDischarge: !!recommendDischarge,
                followUpDate: followUpDate || null,
                issuedAt: patient.admission.certificate.issuedAt
            });
        } catch (socketErr) {
            console.warn("Socket notification failed for certificate issuance:", socketErr.message);
        }

        res.json({ success: true, message: "Certificate issued successfully", data: patient.admission.certificate });
    } catch (error) {
        console.error("Error issuing certificate:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// POST /api/doctor/start-emergency/:caseId
exports.startDoctorEmergency = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        const doctorId = req.user.id;
        const { caseId } = req.params;

        const emergencyCase = await EmergencyCase.findById(caseId).session(session);
        if (!emergencyCase) {
            await session.abortTransaction();
            session.endSession();
            return res.status(404).json({ success: false, message: "Emergency case not found" });
        }

        if (String(emergencyCase.assignedDoctor) !== String(doctorId)) {
            await session.abortTransaction();
            session.endSession();
            return res.status(403).json({ success: false, message: "Not authorized to start this emergency case" });
        }

        if (emergencyCase.responseType !== "DOCTOR_EMERGENCY") {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({ success: false, message: "Start Emergency is only available for DOCTOR_EMERGENCY cases" });
        }

        if (emergencyCase.status !== "REPORTED") {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({ success: false, message: `Cannot start emergency with status ${emergencyCase.status}. Expected REPORTED.` });
        }

        assertValidStatusTransition(emergencyCase.status, "UNDER_TREATMENT", emergencyCase.responseType);

        const now = new Date();
        const oldStatus = emergencyCase.status;
        emergencyCase.status = "UNDER_TREATMENT";
        if (!emergencyCase.statusTimestamps) {
            emergencyCase.statusTimestamps = new Map();
        }
        emergencyCase.statusTimestamps.set("UNDER_TREATMENT", now);
        await emergencyCase.save({ session });

        await User.findByIdAndUpdate(
            doctorId,
            { $set: { doctorStatus: "BUSY_WITH_EMERGENCY" } },
            { session, new: true }
        );

        const affectedAppointments = await Appointment.find({
            doctorId: new mongoose.Types.ObjectId(doctorId),
            status: { $in: ["pending", "approved"] },
            _id: { $ne: emergencyCase.linkedAppointmentId },
        }).session(session);

        const affectedPatientIds = affectedAppointments.map(a => String(a.patientId)).filter(Boolean);
        const uniquePatientIds = [...new Set(affectedPatientIds)];

        await session.commitTransaction();
        session.endSession();

        const ipAddress = req.ip || (req.headers && req.headers["x-forwarded-for"]) || (req.connection && req.connection.remoteAddress) || "127.0.0.1";
        await logAction({
            userId: new mongoose.Types.ObjectId(doctorId),
            role: req.user.role,
            action: "DOCTOR_EMERGENCY_STARTED",
            module: "EMERGENCY",
            targetId: caseId,
            ipAddress,
            details: {
                emergencyCaseId: caseId,
                patientId: emergencyCase.patient ? String(emergencyCase.patient) : null,
                affectedAppointmentsCount: affectedAppointments.length,
            },
        });

        try {
            const io = socket.getIO();
            io.emit("emergency-status-updated", {
                emergencyCaseId: emergencyCase._id,
                status: "UNDER_TREATMENT",
                severity: emergencyCase.severity,
                incidentType: emergencyCase.incidentType,
                patientId: emergencyCase.patient ? String(emergencyCase.patient) : null,
                assignedHospital: emergencyCase.assignedHospital || null,
                responseType: emergencyCase.responseType,
                oldStatus,
                updatedBy: doctorId,
            });
            if (emergencyCase.patient) {
                io.to(String(emergencyCase.patient)).emit("emergency-status-updated", {
                    emergencyCaseId: emergencyCase._id,
                    status: "UNDER_TREATMENT",
                });
            }
            io.to(String(doctorId)).emit("emergency-status-updated", {
                emergencyCaseId: emergencyCase._id,
                status: "UNDER_TREATMENT",
            });

            io.to(String(doctorId)).emit("doctor-status-updated", {
                doctorId,
                doctorStatus: "BUSY_WITH_EMERGENCY",
            });

            uniquePatientIds.forEach(pid => {
                io.to(pid).emit("doctor-emergency-delay", {
                    doctorId,
                    doctorName: req.user.name || "Your doctor",
                    message: "Your doctor is currently handling an emergency and may experience delays. Thank you for your patience.",
                    emergencyCaseId: caseId,
                    affectedAt: now.toISOString(),
                });
            });
        } catch (sockErr) {
            console.warn("[startDoctorEmergency] Socket notifications skipped:", sockErr.message);
        }

        const populated = await EmergencyCase.findById(emergencyCase._id)
            .populate("patient", "name email phone bloodGroup")
            .populate("assignedDoctor", "name specialization hospitalName")
            .lean();

        res.json({
            success: true,
            message: "Emergency started successfully",
            data: {
                emergencyCase: populated,
                doctorStatus: "BUSY_WITH_EMERGENCY",
                affectedPatientsNotified: uniquePatientIds.length,
            },
        });
    } catch (error) {
        await session.abortTransaction();
        if (session.inTransaction) session.endSession();
        console.error("[startDoctorEmergency] Error:", error);
        const statusCode = Number(error.statusCode) || 500;
        res.status(statusCode).json({ success: false, message: error.message });
    }
};

// POST /api/doctor/complete-emergency/:caseId
exports.completeDoctorEmergency = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        const doctorId = req.user.id;
        const { caseId } = req.params;

        const emergencyCase = await EmergencyCase.findById(caseId).session(session);
        if (!emergencyCase) {
            await session.abortTransaction();
            session.endSession();
            return res.status(404).json({ success: false, message: "Emergency case not found" });
        }

        if (String(emergencyCase.assignedDoctor) !== String(doctorId)) {
            await session.abortTransaction();
            session.endSession();
            return res.status(403).json({ success: false, message: "Not authorized to complete this emergency case" });
        }

        if (emergencyCase.responseType !== "DOCTOR_EMERGENCY") {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({ success: false, message: "Complete Emergency is only available for DOCTOR_EMERGENCY cases" });
        }

        if (emergencyCase.status !== "UNDER_TREATMENT") {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({ success: false, message: `Cannot complete emergency with status ${emergencyCase.status}. Expected UNDER_TREATMENT.` });
        }

        assertValidStatusTransition(emergencyCase.status, "CLOSED", emergencyCase.responseType);

        const now = new Date();
        const oldStatus = emergencyCase.status;
        emergencyCase.status = "CLOSED";
        if (!emergencyCase.statusTimestamps) {
            emergencyCase.statusTimestamps = new Map();
        }
        emergencyCase.statusTimestamps.set("CLOSED", now);
        await emergencyCase.save({ session });

        const activeDoctorEmergencies = await EmergencyCase.countDocuments({
            assignedDoctor: new mongoose.Types.ObjectId(doctorId),
            responseType: "DOCTOR_EMERGENCY",
            status: { $in: ["REPORTED", "UNDER_TREATMENT"] },
        }).session(session);

        let finalDoctorStatus = "BUSY_WITH_EMERGENCY";
        if (activeDoctorEmergencies === 0) {
            await User.findByIdAndUpdate(
                doctorId,
                { $set: { doctorStatus: "AVAILABLE" } },
                { session, new: true }
            );
            finalDoctorStatus = "AVAILABLE";
        }

        const affectedAppointments = await Appointment.find({
            doctorId: new mongoose.Types.ObjectId(doctorId),
            status: { $in: ["pending", "approved"] },
            _id: { $ne: emergencyCase.linkedAppointmentId },
        }).session(session);

        const affectedPatientIds = affectedAppointments.map(a => String(a.patientId)).filter(Boolean);
        const uniquePatientIds = [...new Set(affectedPatientIds)];

        await session.commitTransaction();
        session.endSession();

        const ipAddress = req.ip || (req.headers && req.headers["x-forwarded-for"]) || (req.connection && req.connection.remoteAddress) || "127.0.0.1";
        await logAction({
            userId: new mongoose.Types.ObjectId(doctorId),
            role: req.user.role,
            action: "DOCTOR_EMERGENCY_COMPLETED",
            module: "EMERGENCY",
            targetId: caseId,
            ipAddress,
            details: {
                emergencyCaseId: caseId,
                patientId: emergencyCase.patient ? String(emergencyCase.patient) : null,
                finalDoctorStatus,
                remainingActiveEmergencies: activeDoctorEmergencies,
            },
        });

        try {
            const io = socket.getIO();
            io.emit("emergency-status-updated", {
                emergencyCaseId: emergencyCase._id,
                status: "CLOSED",
                severity: emergencyCase.severity,
                incidentType: emergencyCase.incidentType,
                patientId: emergencyCase.patient ? String(emergencyCase.patient) : null,
                assignedHospital: emergencyCase.assignedHospital || null,
                responseType: emergencyCase.responseType,
                oldStatus,
                updatedBy: doctorId,
            });
            if (emergencyCase.patient) {
                io.to(String(emergencyCase.patient)).emit("emergency-status-updated", {
                    emergencyCaseId: emergencyCase._id,
                    status: "CLOSED",
                });
            }
            io.to(String(doctorId)).emit("emergency-status-updated", {
                emergencyCaseId: emergencyCase._id,
                status: "CLOSED",
            });

            io.to(String(doctorId)).emit("doctor-status-updated", {
                doctorId,
                doctorStatus: finalDoctorStatus,
            });

            if (finalDoctorStatus === "AVAILABLE") {
                uniquePatientIds.forEach(pid => {
                    io.to(pid).emit("doctor-emergency-resolved", {
                        doctorId,
                        doctorName: req.user.name || "Your doctor",
                        message: "Your doctor has completed the emergency and is now available. Normal scheduling has resumed.",
                        emergencyCaseId: caseId,
                        resolvedAt: now.toISOString(),
                    });
                });
            }
        } catch (sockErr) {
            console.warn("[completeDoctorEmergency] Socket notifications skipped:", sockErr.message);
        }

        const populated = await EmergencyCase.findById(emergencyCase._id)
            .populate("patient", "name email phone bloodGroup")
            .populate("assignedDoctor", "name specialization hospitalName")
            .lean();

        res.json({
            success: true,
            message: "Emergency completed successfully",
            data: {
                emergencyCase: populated,
                doctorStatus: finalDoctorStatus,
                patientsNotified: finalDoctorStatus === "AVAILABLE" ? uniquePatientIds.length : 0,
                remainingActiveEmergencies: activeDoctorEmergencies,
            },
        });
    } catch (error) {
        await session.abortTransaction();
        if (session.inTransaction) session.endSession();
        console.error("[completeDoctorEmergency] Error:", error);
        const statusCode = Number(error.statusCode) || 500;
        res.status(statusCode).json({ success: false, message: error.message });
    }
};

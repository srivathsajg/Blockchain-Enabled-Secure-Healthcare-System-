const Record = require("../../modules/medical-records/models/record.model");
const Prescription = require("../../modules/prescriptions/models/prescription.model");
const User = require("../../modules/users/models/user.model");
const Appointment = require("../../modules/appointments/models/appointment.model");
const DoctorAvailability = require("../../modules/appointments/models/availability.model");
const { createOrder } = require("../../modules/pharmacy-orders/service");
const { logAction } = require("../../modules/audit/service");
const crypto = require("crypto");
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

        const doctor = await User.findByIdAndUpdate(
            doctorId,
            {
                $set: {
                    delayStatus: {
                        isDelayed,
                        reason: isDelayed ? reason : "",
                        expectedArrivalTime: isDelayed ? expectedArrivalTime : "",
                        updatedAt: new Date()
                    }
                }
            },
            { new: true }
        );

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
        }

        res.json({ success: true, message: isDelayed ? "Delay request sent to the patient" : "Delay status updated", data: doctor.delayStatus });
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

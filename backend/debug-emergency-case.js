// Debug script to inspect the emergency case and appointment
const mongoose = require("mongoose");
require("./core/config/db");

const EmergencyCase = require("./modules/emergency/models/emergencyCase.model");
const Appointment = require("./modules/appointments/models/appointment.model");
const User = require("./modules/users/models/user.model");

const debugEmergencyCase = async () => {
    try {
        console.log("=== DEBUGGING EMERGENCY CASE ===\n");

        // Find recent emergency appointments
        console.log("1. RECENT EMERGENCY APPOINTMENTS:");
        const emergencyAppointments = await Appointment.find({ 
            isEmergency: true 
        })
        .populate('patientId', 'name email')
        .populate('doctorId', 'name email hospitalName')
        .sort({ createdAt: -1 })
        .limit(5);

        emergencyAppointments.forEach((apt, idx) => {
            console.log(`\nAppointment ${idx + 1}:`);
            console.log(`- _id: ${apt._id}`);
            console.log(`- Patient: ${apt.patientId?.name} (${apt.patientId?._id})`);
            console.log(`- Doctor: ${apt.doctorId?.name} (${apt.doctorId?._id})`);
            console.log(`- Hospital: ${apt.doctorId?.hospitalName}`);
            console.log(`- isEmergency: ${apt.isEmergency}`);
            console.log(`- emergencyReason: ${apt.emergencyReason}`);
            console.log(`- status: ${apt.status}`);
            console.log(`- priority: ${apt.priority}`);
            console.log(`- date: ${apt.date}`);
            console.log(`- time: ${apt.time}`);
            console.log(`- createdAt: ${apt.createdAt}`);
        });

        // Find linked emergency cases
        console.log("\n\n2. LINKED EMERGENCY CASES:");
        const appointmentIds = emergencyAppointments.map(apt => apt._id);
        const linkedCases = await EmergencyCase.find({
            linkedAppointmentId: { $in: appointmentIds }
        })
        .populate('patient', 'name email')
        .populate('assignedDoctor', 'name email hospitalName')
        .sort({ createdAt: -1 });

        linkedCases.forEach((ec, idx) => {
            console.log(`\nEmergencyCase ${idx + 1}:`);
            console.log(`- _id: ${ec._id}`);
            console.log(`- patient: ${ec.patient?.name} (${ec.patient?._id})`);
            console.log(`- reportedBy: ${ec.reportedBy}`);
            console.log(`- assignedDoctor: ${ec.assignedDoctor?.name} (${ec.assignedDoctor?._id})`);
            console.log(`- assignedHospital: ${ec.assignedHospital}`);
            console.log(`- linkedAppointmentId: ${ec.linkedAppointmentId}`);
            console.log(`- responseType: ${ec.responseType}`);
            console.log(`- incidentType: ${ec.incidentType}`);
            console.log(`- description: ${ec.description}`);
            console.log(`- severity: ${ec.severity}`);
            console.log(`- status: ${ec.status}`);
            console.log(`- createdAt: ${ec.createdAt}`);
            console.log(`- statusTimestamps: ${JSON.stringify(Object.fromEntries(ec.statusTimestamps || new Map()))}`);
        });

        // Find all emergency cases (in case some aren't linked)
        console.log("\n\n3. ALL RECENT EMERGENCY CASES:");
        const allRecentCases = await EmergencyCase.find()
        .populate('patient', 'name email')
        .populate('assignedDoctor', 'name email hospitalName')
        .sort({ createdAt: -1 })
        .limit(10);

        allRecentCases.forEach((ec, idx) => {
            console.log(`\nEmergencyCase ${idx + 1}:`);
            console.log(`- _id: ${ec._id}`);
            console.log(`- responseType: ${ec.responseType || 'UNDEFINED'}`);
            console.log(`- assignedDoctor: ${ec.assignedDoctor?.name} (${ec.assignedDoctor?._id})`);
            console.log(`- status: ${ec.status}`);
            console.log(`- linkedAppointmentId: ${ec.linkedAppointmentId || 'NONE'}`);
            console.log(`- createdAt: ${ec.createdAt}`);
        });

        // Check for doctor users
        console.log("\n\n4. DOCTOR USERS:");
        const doctors = await User.find({ role: 'doctor' }).select('name email hospitalName').limit(5);
        doctors.forEach((doc, idx) => {
            console.log(`Doctor ${idx + 1}: ${doc.name} (${doc._id}) at ${doc.hospitalName}`);
        });

        console.log("\n=== DEBUG COMPLETE ===");

    } catch (error) {
        console.error("Debug error:", error);
    } finally {
        mongoose.disconnect();
    }
};

debugEmergencyCase();
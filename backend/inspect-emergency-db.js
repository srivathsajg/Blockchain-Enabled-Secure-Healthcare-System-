// Inspect emergency records via direct database query
const EmergencyCase = require("./modules/emergency/models/emergencyCase.model");
const Appointment = require("./modules/appointments/models/appointment.model");

console.log("Emergency Case Model Available:", !!EmergencyCase);
console.log("Appointment Model Available:", !!Appointment);

console.log("\nEmergencyCase RESPONSE_TYPES:", EmergencyCase.RESPONSE_TYPES);
console.log("EmergencyCase STATUSES:", EmergencyCase.STATUSES);

console.log("\nReady for database inspection via API...");
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const mongoose = require("mongoose");
const EmergencyCase = require("../modules/emergency/models/emergencyCase.model");
const User = require("../modules/users/models/user.model");

async function createTestEmergency() {
  try {
    console.log("Connecting to MongoDB...");
    await mongoose.connect(process.env.MONGO_URI);
    console.log("Connected to MongoDB");

    // Find a test patient
    const testPatient = await User.findOne({ role: "patient" }).limit(1);

    if (!testPatient) {
      console.log("❌ No patient found in database. Please create a patient first.");
      process.exit(1);
    }

    console.log(`\nFound patient: ${testPatient.name} (${testPatient.email})`);

    // Check for existing test emergency
    const existing = await EmergencyCase.findOne({
      patient: testPatient._id,
      status: { $in: ["REPORTED", "AMBULANCE_REQUESTED"] },
    });

    if (existing) {
      console.log("\n✅ Test emergency already exists:");
      console.log(`   ID: ${existing._id}`);
      console.log(`   Status: ${existing.status}`);
      console.log(`   Severity: ${existing.severity}`);
      console.log(`   Incident: ${existing.incidentType}`);
    } else {
      // Create test emergency
      const testEmergency = await EmergencyCase.create({
        patient: testPatient._id,
        reportedBy: testPatient._id,
        incidentType: "ROAD_ACCIDENT",
        description: "Test emergency for Phase 2B ambulance workflow verification",
        severity: "HIGH",
        location: {
          address: "123 Test Street, City General Hospital Area",
          coordinates: {
            latitude: 40.7128,
            longitude: -74.0060,
          },
        },
        assignedHospital: "City General Hospital",
        status: "AMBULANCE_REQUESTED",
        statusTimestamps: {
          REPORTED: new Date(Date.now() - 5 * 60 * 1000), // 5 minutes ago
          AMBULANCE_REQUESTED: new Date(),
        },
      });

      console.log("\n✅ Test emergency created successfully!");
      console.log(`   ID: ${testEmergency._id}`);
      console.log(`   Status: ${testEmergency.status}`);
      console.log(`   Severity: ${testEmergency.severity}`);
      console.log(`   Incident: ${testEmergency.incidentType}`);
      console.log(`   Patient: ${testPatient.name}`);
      console.log(`   Location: ${testEmergency.location.address}`);
    }

    console.log("\n🚑 This emergency is now available in the ambulance queue");
    console.log("   Login as ambulance to accept and process it\n");

    await mongoose.connection.close();
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

createTestEmergency();

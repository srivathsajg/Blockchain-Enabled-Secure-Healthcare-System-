require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const mongoose = require("mongoose");
const EmergencyCase = require("../modules/emergency/models/emergencyCase.model");
const Audit = require("../modules/audit/models/audit.model");

const MONGO_URI = process.env.MONGO_URI;

async function cleanupEmergencyData() {
  console.log("================================================");
  console.log("  SAFE EMERGENCY DATA CLEANUP SCRIPT (DEV ONLY)");
  console.log("================================================");
  console.log("");

  const uriParts = MONGO_URI.split("/");
  const dbNameWithQuery = uriParts[uriParts.length - 1];
  const dbName = dbNameWithQuery.split("?")[0];
  const host = uriParts[2] || "unknown";

  console.log("TARGET DATABASE:");
  console.log(`  Host:        ${host}`);
  console.log(`  Database:    ${dbName}`);
  console.log(`  Collection:  emergencycases`);
  console.log(`  Collection:  audits (emergency module only)`);
  console.log("");

  console.log("Connecting to MongoDB...");
  await mongoose.connect(MONGO_URI, {
    serverSelectionTimeoutMS: 15000,
    socketTimeoutMS: 45000,
    family: 4,
  });
  console.log("Connected successfully.\n");

  try {
    const ecCountBefore = await EmergencyCase.countDocuments({});
    console.log(`EmergencyCase records FOUND: ${ecCountBefore}`);

    if (ecCountBefore > 0) {
      const sampleCases = await EmergencyCase.find({})
        .select("_id status incidentType severity patient reportedBy createdAt")
        .limit(10)
        .lean();
      console.log("\nSample EmergencyCase records (first 10):");
      sampleCases.forEach((c, i) => {
        console.log(`  [${i + 1}] _id=${c._id}`);
        console.log(`       status=${c.status}, type=${c.incidentType}, severity=${c.severity}`);
        console.log(`       patient=${c.patient}, reportedBy=${c.reportedBy}`);
        console.log(`       createdAt=${c.createdAt}`);
      });
    }

    const auditCountBefore = await Audit.countDocuments({ module: "EMERGENCY" });
    console.log(`\nEmergency-related Audit records FOUND: ${auditCountBefore}`);

    if (auditCountBefore > 0) {
      const sampleAudits = await Audit.find({ module: "EMERGENCY" })
        .select("_id action targetId role timestamp")
        .limit(5)
        .lean();
      console.log("\nSample Emergency Audit records (first 5):");
      sampleAudits.forEach((a, i) => {
        console.log(`  [${i + 1}] _id=${a._id}`);
        console.log(`       action=${a.action}, targetId=${a.targetId}, role=${a.role}`);
        console.log(`       timestamp=${a.timestamp}`);
      });
    }

    console.log("\n================================================");
    console.log("  PROCEEDING WITH DELETION...");
    console.log("================================================");

    const ecDeleteResult = await EmergencyCase.deleteMany({});
    console.log(`\nEmergencyCase records DELETED: ${ecDeleteResult.deletedCount}`);

    const auditDeleteResult = await Audit.deleteMany({ module: "EMERGENCY" });
    console.log(`Emergency Audit records DELETED: ${auditDeleteResult.deletedCount}`);

    const ecCountAfter = await EmergencyCase.countDocuments({});
    const auditCountAfter = await Audit.countDocuments({ module: "EMERGENCY" });
    console.log("\n================================================");
    console.log("  VERIFICATION AFTER CLEANUP");
    console.log("================================================");
    console.log(`EmergencyCase remaining: ${ecCountAfter}`);
    console.log(`Emergency Audit remaining: ${auditCountAfter}`);
    console.log("");

    const collectionsToPreserve = [
      ["users", "Users"],
      ["appointments", "Appointments"],
      ["records", "MedicalRecords"],
      ["prescriptions", "Prescriptions"],
      ["laborders", "LabOrders"],
      ["labtests", "LabTests"],
      ["orders", "PharmacyOrders"],
      ["inventories", "Inventory"],
      ["ambulanceprofiles", "AmbulanceProfiles"],
      ["insurances", "InsurancePlans"],
      ["bills", "Bills"],
      ["deliveries", "Deliveries"],
    ];

    async function safeCountColl(collName, label) {
      try {
        const coll = mongoose.connection.collection(collName);
        const n = await coll.estimatedDocumentCount();
        console.log(`  ${label} (${collName}): ${n} (PRESERVED)`);
      } catch (e) {
        console.log(`  ${label} (${collName}): n/a (${e.message})`);
      }
    }

    console.log("Verifying other collections are UNTOUCHED:");
    for (const [collName, label] of collectionsToPreserve) {
      await safeCountColl(collName, label);
    }

    console.log("");
    console.log("Cleanup complete.");

    return {
      emergencyCasesFound: ecCountBefore,
      emergencyCasesDeleted: ecDeleteResult.deletedCount,
      auditRecordsFound: auditCountBefore,
      auditRecordsDeleted: auditDeleteResult.deletedCount,
    };
  } finally {
    await mongoose.connection.close();
    console.log("MongoDB connection closed.");
  }
}

cleanupEmergencyData().catch((err) => {
  console.error("FATAL ERROR:", err);
  process.exit(1);
});

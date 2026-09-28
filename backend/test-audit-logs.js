require("dotenv").config({ path: require("path").join(__dirname, ".env") });
const mongoose = require("mongoose");
const AuditLog = require("./modules/audit/models/audit.model");

async function checkAuditLogs() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("\n━━━ Recent Ambulance-Related Audit Logs ━━━\n");

    const logs = await AuditLog.find({
      $or: [
        { role: "ambulance" },
        { action: /AMBULANCE/ },
        { action: /EMERGENCY/ },
        { action: /QR.*PATIENT/ },
      ],
    })
      .sort({ timestamp: -1 })
      .limit(15)
      .lean();

    if (logs.length === 0) {
      console.log("No ambulance-related audit logs found.");
    } else {
      console.log(`Found ${logs.length} recent audit entries:\n`);
      logs.forEach((log, idx) => {
        const time = new Date(log.timestamp).toLocaleString();
        console.log(`${idx + 1}. [${time}] ${log.action}`);
        console.log(`   Role: ${log.role}`);
        console.log(`   Module: ${log.module}`);
        console.log(`   Target: ${log.targetId}`);
        if (log.details) {
          console.log(`   Details: ${JSON.stringify(log.details, null, 2).substring(0, 200)}`);
        }
        console.log("");
      });
    }

    await mongoose.connection.close();
  } catch (error) {
    console.error("Error:", error.message);
    process.exit(1);
  }
}

checkAuditLogs();

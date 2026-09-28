require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const User = require("../modules/users/models/user.model");

const DEV_AMBULANCE = {
  name: "TEST Ambulance Alpha",
  email: "ambulance.test@medicare.dev",
  password: "Ambulance123!",
  role: "ambulance",
  phone: "+1-555-AMBULANCE",
  employeeId: "AMB-TEST-001",
  hospitalName: "City General Hospital",
  isApproved: true,
};

async function createDevAmbulance() {
  try {
    console.log("Connecting to MongoDB...");
    await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log("Connected to MongoDB");

    const existing = await User.findOne({ email: DEV_AMBULANCE.email });
    
    if (existing) {
      console.log("\n⚠️  DEVELOPMENT ambulance account already exists:");
      console.log(`   Email: ${existing.email}`);
      console.log(`   Name: ${existing.name}`);
      console.log(`   Role: ${existing.role}`);
      console.log(`   Employee ID: ${existing.employeeId}`);
      console.log("\n   Use these credentials to login:");
      console.log(`   Email: ${DEV_AMBULANCE.email}`);
      console.log(`   Password: ${DEV_AMBULANCE.password}`);
      console.log("\n   (Password not changed - use the original password if different)\n");
    } else {
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(DEV_AMBULANCE.password, salt);

      const ambulanceUser = await User.create({
        name: DEV_AMBULANCE.name,
        email: DEV_AMBULANCE.email,
        password: hashedPassword,
        role: DEV_AMBULANCE.role,
        phone: DEV_AMBULANCE.phone,
        employeeId: DEV_AMBULANCE.employeeId,
        hospitalName: DEV_AMBULANCE.hospitalName,
        isApproved: DEV_AMBULANCE.isApproved,
      });

      console.log("\n✅ DEVELOPMENT ambulance account created successfully!");
      console.log("\n   ── TEST AMBULANCE LOGIN CREDENTIALS ──");
      console.log(`   Email:    ${DEV_AMBULANCE.email}`);
      console.log(`   Password: ${DEV_AMBULANCE.password}`);
      console.log(`   Name:     ${DEV_AMBULANCE.name}`);
      console.log(`   Employee: ${DEV_AMBULANCE.employeeId}`);
      console.log(`   Hospital: ${DEV_AMBULANCE.hospitalName}`);
      console.log("\n   ⚠️  DO NOT USE IN PRODUCTION\n");
    }

    await mongoose.connection.close();
    console.log("Connection closed");
  } catch (error) {
    console.error("Error creating development ambulance account:", error);
    process.exit(1);
  }
}

createDevAmbulance();

const mongoose = require("mongoose");

const connectDB = async () => {
  try {
    console.log("Attempting to connect to MongoDB...");
    await mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 20000,
      socketTimeoutMS: 60000,
      connectTimeoutMS: 20000,
      family: 4,
      maxPoolSize: 10,
      minPoolSize: 2,
      heartbeatFrequencyMS: 10000,
      // Don't buffer commands when disconnected — fail fast instead of 10s hang
      bufferCommands: false,
    });
    console.log("MongoDB Connected");
  } catch (err) {
    console.error("MongoDB connection failed:", err.message);
    // Retry after 5 seconds instead of crashing
    console.log("Retrying MongoDB connection in 5 seconds...");
    setTimeout(connectDB, 5000);
    return;
  }

  // Handle disconnect events
  mongoose.connection.on("disconnected", () => {
    console.warn("MongoDB disconnected. Attempting reconnect...");
    setTimeout(connectDB, 5000);
  });

  mongoose.connection.on("error", (err) => {
    console.error("MongoDB connection error:", err.message);
  });

  mongoose.connection.on("reconnected", () => {
    console.log("MongoDB reconnected successfully.");
  });
};

module.exports = connectDB;

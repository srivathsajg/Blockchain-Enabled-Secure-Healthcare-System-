const dotenv = require("dotenv");

// Load env variables immediately
dotenv.config();

const http = require("http");
const { Server } = require("socket.io");
const app = require("./app");
const connectDB = require("./config/db");
const socketModule = require("./socket");
const Delivery = require("../modules/delivery-tracking/models/delivery.model");

const PORT = process.env.PORT || 5000;

const start = async () => {
  console.log("Starting server initialization...");
  try {
    await connectDB();
  } catch (err) {
    console.error("DB connection error:", err);
  }

  // Create HTTP server from Express app (required for Socket.IO to work properly)
  const server = http.createServer(app);

  // Initialize Socket.IO and attach to HTTP server
  const io = socketModule.init(server);

  io.on("connection", (socket) => {
    console.log("Connected:", socket.id);

    socket.on("join-room", (userId) => {
      socket.join(userId);
      console.log(`Socket ${socket.id} joined room ${userId}`);
    });

    // Real-time Delivery Tracking
    socket.on("update-delivery-location", async (data) => {
      const {
        hospitalName,
        coords,
        deliveryStaffId,
        patientId,
        orderId,
        deliveryId,
        trackingId,
        status,
      } = data;

      const resolvedHospital = hospitalName || 'General';
      let resolvedDeliveryId = deliveryId;
      let resolvedPatientId = patientId;
      let existingDelivery = null;

      if (!resolvedDeliveryId && orderId) {
        try {
          existingDelivery = await Delivery.findOne({ orderId }).lean();
          if (existingDelivery) {
            resolvedDeliveryId = existingDelivery._id?.toString();
            resolvedPatientId = resolvedPatientId || existingDelivery.patientId?.toString();
          }
        } catch (lookupError) {
          console.warn(`Failed to lookup delivery by orderId ${orderId}:`, lookupError.message);
        }
      }

      if (!resolvedDeliveryId && trackingId) {
        try {
          existingDelivery = existingDelivery || await Delivery.findOne({ trackingId }).lean();
          if (existingDelivery) {
            resolvedDeliveryId = existingDelivery._id?.toString();
            resolvedPatientId = resolvedPatientId || existingDelivery.patientId?.toString();
          }
        } catch (lookupError) {
          console.warn(`Failed to lookup delivery by trackingId ${trackingId}:`, lookupError.message);
        }
      }

      const normalizedStatus = status || 'in_transit';
      const payload = {
        hospitalName: resolvedHospital,
        coords,
        deliveryStaffId,
        patientId: resolvedPatientId,
        orderId,
        deliveryId: resolvedDeliveryId,
        trackingId,
        status: normalizedStatus,
        timestamp: new Date(),
      };

      if (resolvedDeliveryId && coords) {
        try {
          await Delivery.findByIdAndUpdate(resolvedDeliveryId, {
            location: { coords, status: normalizedStatus },
            updatedAt: new Date(),
          });
        } catch (dbError) {
          console.warn(`Failed to persist delivery location for ${resolvedDeliveryId}:`, dbError.message);
        }
      }

      io.to(resolvedHospital).emit("delivery-location-changed", payload);
      if (resolvedPatientId) {
        io.to(`patient-${resolvedPatientId}`).emit("delivery-location-changed", payload);
      }
    });

    socket.on("join-hospital-room", (hospitalName) => {
      socket.join(hospitalName);
      console.log(`Socket ${socket.id} joined hospital tracking: ${hospitalName}`);
    });

    // Real-time Ambulance Location Tracking & Automatic Arrival
    socket.on("update-ambulance-location", async (data) => {
      try {
        const { emergencyCaseId, caseId, coords, ambulanceId, userId } = data || {};
        const targetId = emergencyCaseId || caseId;
        const targetUserId = ambulanceId || userId;

        if (!targetId || !coords || typeof coords.latitude !== 'number' || typeof coords.longitude !== 'number') {
          return;
        }

        const { updateAmbulanceLocation } = require("../modules/emergency/service");
        await updateAmbulanceLocation({
          user: { id: targetUserId, role: "ambulance" },
          id: targetId,
          coords,
          ipAddress: "socket-connection",
        });
      } catch (locationErr) {
        console.warn("Real-time ambulance location socket update error:", locationErr.message);
      }
    });

    socket.on("disconnect", () => {
      console.log("Disconnected:", socket.id);
    });
  });

  server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Socket.IO available at http://localhost:${PORT}/socket.io/`);
    
    // Automatic Appointment Reassignment Check (every 1 minute)
    setInterval(async () => {
      try {
        const Appointment = require("../modules/appointments/models/appointment.model");
        const { reassignAppointment } = require("../modules/appointments/service");
        
        const now = new Date();
        const fifteenMinutesAgo = new Date(now.getTime() - 15 * 60 * 1000);

        // Find approved appointments that might need reassignment
        const pendingAppointments = await Appointment.find({
          status: "approved",
          date: { $lte: now } // Today or past dates
        });

        for (const apt of pendingAppointments) {
          // Skip if already reassigned/emergency handled
          // (optional, depends on if we want to allow multiple reassignments)

          // Combine date and time to get the scheduled start time
          let [time, modifier] = apt.time.split(" ");
          let [hours, minutes] = time.split(":").map(Number);
          
          if (modifier) {
            if (modifier === "PM" && hours < 12) hours += 12;
            if (modifier === "AM" && hours === 12) hours = 0;
          } else {
            // Assume 24-hour format if no AM/PM (old format)
          }

          const scheduledStartTime = new Date(apt.date);
          scheduledStartTime.setHours(hours, minutes, 0, 0);

          // If the appointment is from a previous day and not completed, mark as expired
          const startOfToday = new Date();
          startOfToday.setHours(0, 0, 0, 0);
          if (scheduledStartTime < startOfToday) {
            console.log(`Marking old appointment ${apt._id} as expired.`);
            apt.status = "expired";
            await apt.save();
            continue;
          }

          const fifteenMinsAfterStart = new Date(scheduledStartTime.getTime() + 15 * 60 * 1000);

          // Logic:
          // 1. If it's 15 mins past the scheduled start time AND no action has ever been taken
          
          let shouldReassign = false;

          if (now > fifteenMinsAfterStart) {
            if (!apt.lastDoctorActionAt) {
              shouldReassign = true;
            }
          }

          if (shouldReassign) {
            console.log(`Auto-reassigning appointment ${apt._id} due to inactivity.`);
            await reassignAppointment(apt._id);
          }
        }
      } catch (err) {
        console.error("Error in automatic reassignment task:", err.message);
      }
    }, 60000); // Run every minute
  });
};

start();

// Simple database connectivity test
const mongoose = require('mongoose');
require('dotenv').config();

// Connect to database using the same connection as the main server
const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/medicare';
console.log('Connecting to MongoDB Atlas...');

mongoose.connect(mongoUri)
  .then(async () => {
    console.log('Connected to MongoDB');

    const EmergencyCase = require('./modules/emergency/models/emergencyCase.model');
    const Appointment = require('./modules/appointments/models/appointment.model');

    try {
      // Count emergency appointments
      const emergencyAppts = await Appointment.countDocuments({ isEmergency: true });
      console.log(`Emergency appointments: ${emergencyAppts}`);

      // Count all emergency cases
      const allCases = await EmergencyCase.countDocuments();
      console.log(`Total emergency cases: ${allCases}`);

      // Count doctor emergency cases
      const doctorCases = await EmergencyCase.countDocuments({ responseType: 'DOCTOR_EMERGENCY' });
      console.log(`Doctor emergency cases: ${doctorCases}`);

      // Get recent cases with more details
      const recent = await EmergencyCase.find().sort({ createdAt: -1 }).limit(10);
      console.log('\nRecent emergency cases (detailed):');
      recent.forEach((case_, idx) => {
        console.log(`${idx + 1}. ID: ${case_._id}`);
        console.log(`   responseType: ${case_.responseType || 'undefined'}`);
        console.log(`   status: ${case_.status}`);
        console.log(`   assignedDoctor: ${case_.assignedDoctor || 'none'}`);
        console.log(`   linkedAppointmentId: ${case_.linkedAppointmentId || 'none'}`);
        console.log(`   createdAt: ${case_.createdAt}`);
        console.log(`   description: ${case_.description}`);
        console.log('');
      });

    } catch (error) {
      console.error('Query error:', error);
    }

    mongoose.disconnect();
  })
  .catch(err => {
    console.error('MongoDB connection error:', err);
  });
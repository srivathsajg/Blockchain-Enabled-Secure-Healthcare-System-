// Fix the existing emergency case to have proper responseType
const mongoose = require('mongoose');
require('dotenv').config();

const EmergencyCase = require('./modules/emergency/models/emergencyCase.model');

const fixExistingCase = async () => {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGO_URI);
        
        // Find the Heart attack case (which should be a doctor emergency based on the manual test)
        const heartAttackCase = await EmergencyCase.findOne({
            description: 'Heart attack',
            status: 'ARRIVED_AT_HOSPITAL'
        });
        
        if (heartAttackCase) {
            console.log('Found Heart attack case:', heartAttackCase._id);
            console.log('Current responseType:', heartAttackCase.responseType);
            
            // Update it to be a DOCTOR_EMERGENCY and reset to appropriate status
            await EmergencyCase.findByIdAndUpdate(heartAttackCase._id, {
                responseType: 'DOCTOR_EMERGENCY',
                status: 'REPORTED' // Reset to allow doctor to start emergency
            });
            
            console.log('✅ Updated case to DOCTOR_EMERGENCY with REPORTED status');
        } else {
            console.log('❌ Heart attack case not found');
        }
        
        // Verify the fix
        const updated = await EmergencyCase.findById(heartAttackCase?._id);
        if (updated) {
            console.log('Verification - responseType:', updated.responseType);
            console.log('Verification - status:', updated.status);
        }
        
        mongoose.disconnect();
        console.log('Fix completed!');
        
    } catch (error) {
        console.error('Error:', error);
        mongoose.disconnect();
    }
};

fixExistingCase();
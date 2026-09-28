// Test emergency case query directly
const express = require('express');
const app = express();
app.use(express.json());

// Import the emergency service
const { getAccessibleEmergencyCases } = require('./modules/emergency/service');

// Simulate doctor user
const testDoctorUser = {
    id: '507f1f77bcf86cd799439011', // Example ObjectId
    role: 'doctor',
    hospitalName: 'Test Hospital'
};

// Test the query
const testQuery = async () => {
    try {
        console.log('Testing emergency case query...\n');
        
        // Test without filters
        console.log('1. Query without filters:');
        const allCases = await getAccessibleEmergencyCases({ 
            user: testDoctorUser 
        });
        console.log(`Found ${allCases.length} cases`);
        
        // Test with doctor emergency filter
        console.log('\n2. Query with DOCTOR_EMERGENCY filter:');
        const doctorCases = await getAccessibleEmergencyCases({ 
            user: testDoctorUser,
            filters: {
                responseType: 'DOCTOR_EMERGENCY',
                status: 'REPORTED,UNDER_TREATMENT'
            }
        });
        console.log(`Found ${doctorCases.length} doctor emergency cases`);
        
        if (doctorCases.length > 0) {
            doctorCases.forEach((case_, idx) => {
                console.log(`\nCase ${idx + 1}:`);
                console.log(`- ID: ${case_._id}`);
                console.log(`- responseType: ${case_.responseType}`);
                console.log(`- status: ${case_.status}`);
                console.log(`- assignedDoctor: ${case_.assignedDoctor?._id || case_.assignedDoctor}`);
                console.log(`- patient: ${case_.patient?.name}`);
            });
        }
        
    } catch (error) {
        console.error('Query test error:', error.message);
    }
};

// Simple test server
app.get('/test-query', async (req, res) => {
    try {
        await testQuery();
        res.json({ status: 'Query test completed - check console' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

console.log('Test query server ready at http://localhost:3001/test-query');
app.listen(3001);
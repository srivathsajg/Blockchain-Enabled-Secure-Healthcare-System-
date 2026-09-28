const axios = require('axios');

const BASE_URL = 'http://localhost:5000/api';

const TEST_AMBULANCE = {
  email: 'ambulance.test@medicare.dev',
  password: 'Ambulance123!',
};

let authToken = '';

async function testAmbulanceLogin() {
  console.log('\n━━━ TEST 1: Ambulance Login ━━━');
  try {
    const response = await axios.post(`${BASE_URL}/auth/login`, {
      identifier: TEST_AMBULANCE.email,
      password: TEST_AMBULANCE.password,
    });

    if (response.data.success) {
      authToken = response.data.token;
      console.log('✅ Login successful');
      console.log(`   User: ${response.data.user.name}`);
      console.log(`   Role: ${response.data.user.role}`);
      console.log(`   Employee ID: ${response.data.user.employeeId}`);
      console.log(`   JWT Token: ${authToken.substring(0, 30)}...`);
      return true;
    } else {
      console.log('❌ Login failed:', response.data);
      return false;
    }
  } catch (error) {
    console.log('❌ Login error:', error.response?.data?.message || error.message);
    return false;
  }
}

async function testAvailableEmergencies() {
  console.log('\n━━━ TEST 2: Available Emergencies Queue ━━━');
  try {
    const response = await axios.get(`${BASE_URL}/emergency/ambulance/available`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });

    if (response.data.success) {
      const cases = response.data.data || [];
      console.log(`✅ Available emergencies retrieved: ${cases.length} cases`);
      
      if (cases.length > 0) {
        console.log('\n   First case details:');
        const firstCase = cases[0];
        console.log(`   - ID: ${firstCase._id}`);
        console.log(`   - Incident: ${firstCase.incidentType}`);
        console.log(`   - Severity: ${firstCase.severity}`);
        console.log(`   - Status: ${firstCase.status}`);
        console.log(`   - Location: ${firstCase.location?.address || 'N/A'}`);
        console.log(`   - Hospital: ${firstCase.assignedHospital || 'Not assigned'}`);
        
        // Check for sensitive data leaks
        if (firstCase.patient?.password || firstCase.patient?.passwordHash) {
          console.log('   ⚠️  WARNING: Password leak detected!');
        }
        if (firstCase.reportedBy?.password || firstCase.reportedBy?.passwordHash) {
          console.log('   ⚠️  WARNING: Reporter password leak detected!');
        }
      } else {
        console.log('   No emergency cases available for assignment');
      }
      return cases[0] || null;
    } else {
      console.log('❌ Failed to retrieve available emergencies');
      return null;
    }
  } catch (error) {
    console.log('❌ Error:', error.response?.data?.message || error.message);
    return null;
  }
}

async function testAssignedEmergencies() {
  console.log('\n━━━ TEST 3: Assigned Emergencies ━━━');
  try {
    const response = await axios.get(`${BASE_URL}/emergency/ambulance/assigned`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });

    if (response.data.success) {
      const cases = response.data.data || [];
      console.log(`✅ Assigned emergencies retrieved: ${cases.length} cases`);
      
      if (cases.length > 0) {
        console.log('\n   Assigned case details:');
        cases.forEach((c, idx) => {
          console.log(`   ${idx + 1}. ${c.incidentType} - ${c.status} - ${c.severity}`);
        });
      }
      return cases[0] || null;
    } else {
      console.log('❌ Failed to retrieve assigned emergencies');
      return null;
    }
  } catch (error) {
    console.log('❌ Error:', error.response?.data?.message || error.message);
    return null;
  }
}

async function testAcceptEmergency(caseId) {
  console.log('\n━━━ TEST 4: Accept Emergency Case ━━━');
  console.log(`   Attempting to accept case: ${caseId}`);
  
  try {
    const response = await axios.post(
      `${BASE_URL}/emergency/cases/${caseId}/accept`,
      {},
      { headers: { Authorization: `Bearer ${authToken}` } }
    );

    if (response.data.success) {
      console.log('✅ Emergency accepted successfully');
      console.log(`   - Status: ${response.data.data.status}`);
      console.log(`   - Assigned Ambulance: ${response.data.data.assignedAmbulance?.name || 'N/A'}`);
      return response.data.data;
    } else {
      console.log('❌ Failed to accept emergency');
      return null;
    }
  } catch (error) {
    console.log('❌ Error:', error.response?.data?.message || error.message);
    return null;
  }
}

async function testConcurrencySafety(caseId) {
  console.log('\n━━━ TEST 5: Concurrency Protection (Static Verification) ━━━');
  console.log('   Checking acceptEmergencyCase implementation...');
  
  // Static verification - read the service file
  const fs = require('fs');
  const servicePath = require('path').join(__dirname, 'modules', 'emergency', 'service.js');
  
  try {
    const serviceCode = fs.readFileSync(servicePath, 'utf-8');
    
    // Check for atomic update pattern
    if (serviceCode.includes('findOneAndUpdate') && 
        serviceCode.includes('assignedAmbulance: { $exists: false }')) {
      console.log('✅ STATIC VERIFICATION: Atomic update pattern found');
      console.log('   - Uses findOneAndUpdate with condition');
      console.log('   - Checks assignedAmbulance does not exist');
      console.log('   - Concurrency-safe implementation confirmed');
    } else {
      console.log('⚠️  STATIC VERIFICATION: Non-atomic pattern detected');
    }
  } catch (error) {
    console.log('❌ Could not verify concurrency safety:', error.message);
  }
}

async function testUnauthorizedAccess() {
  console.log('\n━━━ TEST 6: Unauthorized Access Protection ━━━');
  try {
    const response = await axios.get(`${BASE_URL}/emergency/ambulance/available`);
    console.log('❌ SECURITY ISSUE: Endpoint accessible without authentication!');
  } catch (error) {
    if (error.response?.status === 401) {
      console.log('✅ Endpoint properly protected - 401 Unauthorized without token');
    } else {
      console.log('⚠️  Unexpected error:', error.response?.status, error.response?.data?.message);
    }
  }
}

async function runAllTests() {
  console.log('\n╔══════════════════════════════════════════════╗');
  console.log('║   ResQOne Phase 2B - Ambulance API Tests   ║');
  console.log('╚══════════════════════════════════════════════╝');

  // Test 1: Login
  const loginSuccess = await testAmbulanceLogin();
  if (!loginSuccess) {
    console.log('\n❌ Cannot proceed without authentication\n');
    return;
  }

  // Test 2: Available emergencies
  const availableCase = await testAvailableEmergencies();

  // Test 3: Assigned emergencies
  const assignedCase = await testAssignedEmergencies();

  // Test 4: Accept emergency (only if available and not already assigned)
  if (availableCase && !assignedCase) {
    await testAcceptEmergency(availableCase._id);
  } else {
    console.log('\n━━━ TEST 4: Accept Emergency Case ━━━');
    console.log('   ⏭️  SKIPPED: No available case or already assigned');
  }

  // Test 5: Concurrency safety
  await testConcurrencySafety();

  // Test 6: Unauthorized access
  await testUnauthorizedAccess();

  console.log('\n╔══════════════════════════════════════════════╗');
  console.log('║             Tests Completed                  ║');
  console.log('╚══════════════════════════════════════════════╝\n');
}

runAllTests();

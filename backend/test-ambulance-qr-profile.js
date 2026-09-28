const axios = require('axios');

const BASE_URL = 'http://localhost:5000/api';

const TEST_AMBULANCE = {
  email: 'ambulance.test@medicare.dev',
  password: 'Ambulance123!',
};

let authToken = '';
let assignedEmergencyId = '';
let testQRToken = '';
let testPatientId = '';

async function login() {
  console.log('\n━━━ Ambulance Login ━━━');
  const response = await axios.post(`${BASE_URL}/auth/login`, {
    identifier: TEST_AMBULANCE.email,
    password: TEST_AMBULANCE.password,
  });
  authToken = response.data.token;
  console.log('✅ Logged in as ambulance');
  return response.data.token;
}

async function getAssignedCase() {
  console.log('\n━━━ TEST 1: Get Assigned Emergency ━━━');
  try {
    const response = await axios.get(`${BASE_URL}/emergency/ambulance/assigned`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });

    const cases = response.data.data || [];
    if (cases.length === 0) {
      console.log('❌ No assigned emergency. Run test-ambulance-api.js first to accept an emergency.');
      return null;
    }

    assignedEmergencyId = cases[0]._id;
    testPatientId = cases[0].patient?._id;
    
    console.log('✅ Found assigned emergency');
    console.log(`   - Emergency ID: ${assignedEmergencyId}`);
    console.log(`   - Patient ID: ${testPatientId || 'Not linked yet'}`);
    console.log(`   - Status: ${cases[0].status}`);
    
    return cases[0];
  } catch (error) {
    console.log('❌ Error:', error.response?.data?.message || error.message);
    return null;
  }
}

async function testStatusTransition(emergencyId, toStatus) {
  console.log(`\n━━━ TEST 2: Status Transition to ${toStatus} ━━━`);
  try {
    const response = await axios.patch(
      `${BASE_URL}/emergency/cases/${emergencyId}/status`,
      { status: toStatus },
      { headers: { Authorization: `Bearer ${authToken}` } }
    );

    console.log(`✅ Status updated to ${toStatus}`);
    return response.data.data;
  } catch (error) {
    console.log('❌ Error:', error.response?.data?.message || error.message);
    return null;
  }
}

async function generatePatientQR() {
  console.log('\n━━━ TEST 3: Generate Patient QR (as patient) ━━━');
  
  if (!testPatientId) {
    console.log('⏭️  SKIPPED: No patient ID available');
    return null;
  }

  try {
    // Login as patient first
    const patientUser = await axios.post(`${BASE_URL}/auth/login`, {
      identifier: 'prajwal@gmail.com',
      password: 'password', // Assuming default password
    });
    
    const patientToken = patientUser.data.token;
    
    // Generate QR
    const qrResponse = await axios.post(
      `${BASE_URL}/qr/generate`,
      {},
      { headers: { Authorization: `Bearer ${patientToken}` } }
    );

    testQRToken = qrResponse.data.data.token;
    console.log('✅ Patient QR generated');
    console.log(`   - Token: ${testQRToken.substring(0, 20)}...`);
    console.log(`   - Expires: ${qrResponse.data.data.expiresAt}`);
    
    return testQRToken;
  } catch (error) {
    console.log('⚠️  Could not generate QR (patient password may be different)');
    console.log('   You can manually generate QR from patient dashboard');
    return null;
  }
}

async function testQRIdentification(emergencyId, qrToken) {
  console.log('\n━━━ TEST 4: QR Patient Identification ━━━');
  
  if (!qrToken) {
    console.log('⏭️  SKIPPED: No QR token available');
    console.log('   MANUAL TEST REQUIRED: Generate QR from patient dashboard and test via browser');
    return;
  }

  try {
    const response = await axios.post(
      `${BASE_URL}/emergency/cases/${emergencyId}/identify-qr`,
      { qrToken },
      { headers: { Authorization: `Bearer ${authToken}` } }
    );

    console.log('✅ Patient identified via QR');
    console.log(`   - Patient ID: ${response.data.data.patientId}`);
    console.log(`   - Status changed: ${response.data.data.statusChanged}`);
    console.log(`   - New status: ${response.data.data.emergencyCase.status}`);
    
    return response.data.data;
  } catch (error) {
    console.log('❌ Error:', error.response?.data?.message || error.message);
    return null;
  }
}

async function testEmergencyMedicalProfile(emergencyId) {
  console.log('\n━━━ TEST 5: Emergency Medical Profile ━━━');
  
  try {
    const response = await axios.get(
      `${BASE_URL}/emergency/cases/${emergencyId}/medical-profile`,
      { headers: { Authorization: `Bearer ${authToken}` } }
    );

    const profile = response.data.data;
    console.log('✅ Emergency medical profile retrieved');
    console.log('\n   Patient Information:');
    console.log(`   - Name: ${profile.patient?.name || 'N/A'}`);
    console.log(`   - Age: ${profile.patient?.ageApprox || 'N/A'}`);
    console.log(`   - Blood Group: ${profile.patient?.bloodGroup || 'N/A'}`);
    console.log(`   - Gender: ${profile.patient?.gender || 'N/A'}`);
    console.log(`   - Emergency Contact: ${profile.patient?.emergencyContact || 'N/A'}`);
    console.log(`   - Allergies: ${(profile.patient?.allergies || []).join(', ') || 'None'}`);
    console.log(`   - Chronic Diseases: ${(profile.patient?.chronicDiseases || []).join(', ') || 'None'}`);
    console.log(`   - Current Medications: ${(profile.patient?.currentMedications || []).join(', ') || 'None'}`);
    
    // Security verification
    console.log('\n   Security Verification:');
    const fullResponse = response.data;
    if (fullResponse.password || fullResponse.passwordHash || 
        (profile.patient && (profile.patient.password || profile.patient.passwordHash))) {
      console.log('   ❌ SECURITY ISSUE: Password data exposed!');
    } else {
      console.log('   ✅ No password/hash leaked');
    }
    
    if (profile.patient?.insuranceProviderName || profile.patient?.policyNumber) {
      console.log('   ⚠️  Insurance data included (verify if appropriate)');
    } else {
      console.log('   ✅ Insurance data not exposed');
    }

    return profile;
  } catch (error) {
    console.log('❌ Error:', error.response?.data?.message || error.message);
    return null;
  }
}

async function testUnauthorizedProfileAccess(emergencyId) {
  console.log('\n━━━ TEST 6: Unauthorized Profile Access ━━━');
  
  try {
    // Create a different ambulance token (simulate)
    const response = await axios.get(
      `${BASE_URL}/emergency/cases/${emergencyId}/medical-profile`
      // No auth header
    );
    console.log('❌ SECURITY ISSUE: Profile accessible without authentication!');
  } catch (error) {
    if (error.response?.status === 401) {
      console.log('✅ Properly protected - 401 Unauthorized without token');
    } else if (error.response?.status === 403) {
      console.log('✅ Properly protected - 403 Forbidden');
    } else {
      console.log('⚠️  Unexpected response:', error.response?.status);
    }
  }
}

async function runTests() {
  console.log('\n╔══════════════════════════════════════════════════╗');
  console.log('║   Phase 2B - QR & Medical Profile Tests        ║');
  console.log('╚══════════════════════════════════════════════════╝');

  try {
    await login();
    
    const assignedCase = await getAssignedCase();
    if (!assignedCase) {
      console.log('\n❌ Cannot proceed without an assigned emergency case\n');
      return;
    }

    // Transition to AMBULANCE_ARRIVED if needed
    if (assignedCase.status === 'AMBULANCE_ASSIGNED') {
      await testStatusTransition(assignedEmergencyId, 'AMBULANCE_ARRIVED');
    }

    // Try to generate QR (may fail if patient password is different)
    const qrToken = await generatePatientQR();
    
    // Test QR identification
    await testQRIdentification(assignedEmergencyId, qrToken);
    
    // Test medical profile
    await testEmergencyMedicalProfile(assignedEmergencyId);
    
    // Test unauthorized access
    await testUnauthorizedProfileAccess(assignedEmergencyId);

    console.log('\n╔══════════════════════════════════════════════════╗');
    console.log('║             Tests Completed                     ║');
    console.log('╚══════════════════════════════════════════════════╝');
    console.log('\n📋 MANUAL BROWSER TESTING:');
    console.log('   1. Login as patient and generate QR code');
    console.log('   2. Login as ambulance');
    console.log('   3. Accept emergency (if not already)');
    console.log('   4. Mark "Arrived at Scene"');
    console.log('   5. Scan patient QR code');
    console.log('   6. View emergency medical profile');
    console.log('   7. Start transport and complete workflow\n');

  } catch (error) {
    console.error('\n❌ Test suite error:', error.message);
  }
}

runTests();

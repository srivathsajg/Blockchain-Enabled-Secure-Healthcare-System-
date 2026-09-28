import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
// AuthProvider is now wrapping App in main.jsx, so we can remove it here or keep it if we want scoped auth (but global is better)
// Since we added it to main.jsx, we should remove it here to avoid double wrapping.
import Home from './pages/Home';
import ProtectedRoute from './components/auth/ProtectedRoute';
import Unauthorized from './pages/Unauthorized';
import Login from './pages/Login'; // Assuming you have a login page

import DoctorDashboard from './pages/DoctorDashboard';
import PatientDashboard from './pages/PatientDashboard';
import PharmacistDashboard from './pages/PharmacistDashboard';
import DeliveryDashboard from './pages/DeliveryDashboard';
import AdminDashboard from './pages/AdminDashboard';
import LabTechnicianDashboard from './pages/LabTechnicianDashboard';
import AmbulanceDashboard from './pages/AmbulanceDashboard';

// Patient sub-pages
import PatientOverview from './pages/patient/PatientOverview';
import PatientAppointments from './pages/patient/PatientAppointments';
import PatientRecords from './pages/patient/PatientRecords';
import PatientInsurance from './pages/patient/PatientInsurance';
import PatientPrescriptions from './pages/patient/PatientPrescriptions';
import PatientLabTests from './pages/patient/PatientLabTests';
import PatientReminders from './pages/patient/PatientReminders';
import PatientDietPlan from './pages/patient/PatientDietPlan';
import PatientInPatientStatus from './pages/patient/InPatientStatus';
import PatientBilling from './pages/patient/PatientBilling';
import PatientSettings from './pages/patient/PatientSettings';
import EmergencyBooking from './pages/patient/EmergencyBooking';
import MyEmergencies from './pages/patient/MyEmergencies';
import EmergencyCaseDetails from './pages/patient/EmergencyCaseDetails';
import DoctorPatientQRView from './pages/doctor/DoctorPatientQRView';

import useAudioUnlock from './hooks/useAudioUnlock';

function App() {
  useAudioUnlock();
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/unauthorized" element={<Unauthorized />} />

        {/* ── Doctor QR Access ── */}
        <Route
          path="/patient-qr-access/:token"
          element={
            <ProtectedRoute allowedRoles={['doctor', 'admin']}>
              <DoctorPatientQRView />
            </ProtectedRoute>
          }
        />

        {/* ── Doctor ── */}
        <Route
          path="/doctor-dashboard"
          element={
            <ProtectedRoute allowedRoles={['doctor']}>
              <DoctorDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/doctor-dashboard/emergencies/:id"
          element={
            <ProtectedRoute allowedRoles={['doctor', 'patient']}>
              <EmergencyCaseDetails />
            </ProtectedRoute>
          }
        />

        {/* ── Patient (nested) ── */}
        <Route
          path="/patient-dashboard"
          element={
            <ProtectedRoute allowedRoles={['patient']}>
              <PatientDashboard />
            </ProtectedRoute>
          }
        >
          <Route index element={<PatientOverview />} />
          <Route path="appointments" element={<PatientAppointments />} />
          <Route path="records" element={<PatientRecords />} />
          <Route path="insurance" element={<PatientInsurance />} />
          <Route path="prescriptions" element={<PatientPrescriptions />} />
          <Route path="lab-tests" element={<PatientLabTests />} />
          <Route path="reminders" element={<PatientReminders />} />
          <Route path="diet-plan" element={<PatientDietPlan />} />
          <Route path="admission-status" element={<PatientInPatientStatus />} />
          <Route path="billing" element={<PatientBilling />} />
          <Route path="settings" element={<PatientSettings />} />
          <Route path="emergency" element={<EmergencyBooking />} />
          <Route path="emergencies" element={<MyEmergencies />} />
          <Route path="emergencies/:id" element={<EmergencyCaseDetails />} />
        </Route>

        {/* ── Pharmacist ── */}
        <Route
          path="/pharmacy-dashboard"
          element={
            <ProtectedRoute allowedRoles={['pharmacist']}>
              <PharmacistDashboard />
            </ProtectedRoute>
          }
        />

        {/* ── Delivery ── */}
        <Route
          path="/delivery-dashboard"
          element={
            <ProtectedRoute allowedRoles={['delivery']}>
              <DeliveryDashboard />
            </ProtectedRoute>
          }
        />

        {/* ── Lab Technician ── */}
        <Route
          path="/lab-dashboard"
          element={
            <ProtectedRoute allowedRoles={['lab_technician']}>
              <LabTechnicianDashboard />
            </ProtectedRoute>
          }
        />

        {/* ── Admin ── */}
        <Route
          path="/admin-dashboard"
          element={
            <ProtectedRoute allowedRoles={['admin']}>
              <AdminDashboard />
            </ProtectedRoute>
          }
        />

        {/* ── Ambulance ── */}
        <Route
          path="/ambulance-dashboard"
          element={
            <ProtectedRoute allowedRoles={['ambulance']}>
              <AmbulanceDashboard />
            </ProtectedRoute>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}

export default App;

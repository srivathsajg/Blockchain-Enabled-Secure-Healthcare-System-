import api from './axiosInstance';

const BASE = '/emergency';

export const getMyEmergencyCases = (params = {}) =>
    api.get(`${BASE}/cases`, { params }).then((r) => r.data);

export const getEmergencyCaseById = (id) =>
    api.get(`${BASE}/cases/${id}`).then((r) => r.data);

export const cancelEmergencyCase = (id, cancelledReason) =>
    api.post(`${BASE}/cases/${id}/cancel`, { cancelledReason }).then((r) => r.data);

export const createEmergencyCase = (data) =>
    api.post(`${BASE}/cases`, data).then((r) => r.data);

export const updateEmergencyStatus = (id, status, cancelledReason) =>
    api.patch(`${BASE}/cases/${id}/status`, { status, cancelledReason }).then((r) => r.data);

export const updateEmergencyDetails = (id, data) =>
    api.patch(`${BASE}/cases/${id}`, data).then((r) => r.data);

// ── Ambulance-specific emergency functions ────────────────────────────
export const getAvailableAmbulanceEmergencies = () =>
    api.get(`${BASE}/ambulance/available`).then((r) => r.data);

export const getAssignedAmbulanceEmergencies = () =>
    api.get(`${BASE}/ambulance/assigned`).then((r) => r.data);

export const acceptEmergencyCase = (caseId) =>
    api.post(`${BASE}/cases/${caseId}/accept`).then((r) => r.data);

export const identifyPatientByQR = (caseId, qrToken) =>
    api.post(`${BASE}/cases/${caseId}/identify`, { qrToken }).then((r) => r.data);

export const searchEmergencyCasePatients = (caseId, query) =>
    api.get(`${BASE}/cases/${caseId}/patients/search`, { params: { query } }).then((r) => r.data);

export const confirmManualPatientIdentification = (caseId, patientId) =>
    api.post(`${BASE}/cases/${caseId}/identify/manual`, { patientId }).then((r) => r.data);

export const getEmergencyMedicalProfile = (caseId) =>
    api.get(`${BASE}/cases/${caseId}/medical-profile`).then((r) => r.data);

export const updateAmbulanceLocationApi = (caseId, coords) =>
    api.post(`${BASE}/cases/${caseId}/ambulance-location`, coords).then((r) => r.data);

// ── Doctor-specific emergency functions ──────────────────────────────
export const startDoctorEmergency = (caseId) =>
    api.post(`/doctor/start-emergency/${caseId}`).then((r) => r.data);

export const completeDoctorEmergency = (caseId) =>
    api.post(`/doctor/complete-emergency/${caseId}`).then((r) => r.data);

export const getDoctorEmergencyMedicalHistory = (caseId) =>
    api.get(`/doctor/emergency-cases/${caseId}/medical-history`).then((r) => r.data);

export const uploadVictimPhoto = (file) => {
    const formData = new FormData();
    formData.append('victimPhoto', file);
    return api.post(`${BASE}/cases/photo/upload`, formData, {
        headers: {
            'Content-Type': 'multipart/form-data',
        },
    }).then((r) => r.data);
};

export default api;

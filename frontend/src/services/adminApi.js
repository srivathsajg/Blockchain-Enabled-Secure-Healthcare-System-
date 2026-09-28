import axios from 'axios';

const API = axios.create({
    baseURL: '/api',
});

API.interceptors.request.use((config) => {
    const token = localStorage.getItem('token');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

API.interceptors.response.use(
    (response) => response.data,
    (error) => Promise.reject(error)
);

export const fetchAnalytics = () => API.get('/admin/analytics');
export const fetchUsers = () => API.get('/admin/users');
export const updateUserRole = (userId, role) => API.patch(`/admin/users/${userId}/role`, { role });
export const fetchPendingApprovals = () => API.get('/admin/approvals/pending');
export const approvePendingUser = (userId) => API.patch(`/admin/approvals/${userId}/approve`);
export const rejectPendingUser = (userId) => API.delete(`/admin/approvals/${userId}/reject`);
export const fetchAuditLogs = () => API.get('/audit/admin');
export const fetchBlockchainStatus = () => API.get('/admin/blockchain/status');
export const syncBlockchainRecord = (type, id) => API.post(`/admin/blockchain/sync/${type}/${id}`);
export const syncAllBlockchainRecords = () => API.post('/admin/blockchain/sync-all');
export const createHospitalAdmin = (payload) => API.post('/admin/hospital-admins', payload);
export const fetchAdmittedPatientInsurance = () => API.get('/admin/insurance/admitted-patients');
export const searchPatientsForAdmission = (query) => API.get(`/admin/patients/search?query=${query}`);
export const admitPatient = (userId, data) => API.post(`/admin/patients/${userId}/admit`, data);
export const changePatientWard = (userId, data) => API.patch(`/admin/patients/${userId}/change-ward`, data);
export const fetchAdmittedPatients = () => API.get('/admin/patients/admitted');
export const fetchBillPreview = (patientId) => API.get(`/admin/patients/${patientId}/bill-preview`);
export const dischargePatient = (patientId, data) => API.post(`/admin/patients/${patientId}/discharge`, data);
export const fetchBillingHistory = () => API.get('/admin/billing/history');
export const markBillAsPaid = (billId) => API.patch(`/admin/billing/${billId}/pay`);
export const verifyPatientInsurance = (patientId) => API.patch(`/admin/insurance/${patientId}/verify`);

export const uploadNotificationSound = (formData) =>
  API.post('/admin/notification-sounds/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
export const fetchNotificationSounds = () => API.get('/admin/notification-sounds');
export const updateNotificationSound = (id, patch) =>
  API.patch(`/admin/notification-sounds/${id}`, patch);
export const deleteNotificationSound = (id) => API.delete(`/admin/notification-sounds/${id}`);

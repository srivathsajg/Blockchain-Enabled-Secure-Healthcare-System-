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

// Response interceptor to return data directly
API.interceptors.response.use(
    (response) => response.data,
    (error) => Promise.reject(error)
);

export const fetchOverview = () => API.get('/patient/overview');

export const fetchRecords = () => API.get('/patient/records');

export const fetchPrescriptions = () => API.get('/patient/prescriptions');

export const fetchReminders = () => API.get('/patient/reminders');

export const fetchDoctors = (params = {}) => API.get('/patient/doctors', { params });

export const fetchDoctorSlots = (doctorId, date) => API.get(`/patient/doctor-slots/${doctorId}`, { params: { date } });

export const bookAppointment = (appointmentData) => API.post('/patient/book-appointment', appointmentData);

export const fetchPatientAppointments = () => API.get('/patient/appointments');

export const cancelAppointment = (id) => API.patch(`/patient/cancel-appointment/${id}`);

export const rateAppointment = (id, data) => API.post(`/patient/appointments/${id}/rate`, data);
export const fetchDoctorReviews = (doctorId) => API.get(`/patient/doctors/${doctorId}/reviews`);
export const respondToReallocation = (appointmentId, data) => API.patch(`/patient/reallocation-response/${appointmentId}`, data);
export const respondToDelayRequest = (appointmentId, data) => API.patch(`/patient/delay-response/${appointmentId}`, data);

export const fetchAccessLogs = () => API.get('/audit/my-access');

export const fetchBills = () => API.get('/billing/my');

export const updateInsurance = (formData) => API.put('/patient/update-insurance', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
});

export const fetchInsuranceClaims = () => API.get('/patient/insurance-claims');

export const fetchLabOrders = () => API.get('/patient/lab-orders');

export const fetchHospitals = () => API.get('/auth/hospitals');

export const fetchPatientProfile = () => API.get('/auth/profile');

export const fetchDietPlan = () => API.get('/ai/diet/latest-plan');

export const refreshDietPlan = () => API.post('/ai/diet/refresh');

export const fetchAdmissionStatus = () => API.get('/patient/admission-status');

export const fetchFoodImage = (foodTitle) => API.get('/ai/diet/food-image', { params: { q: foodTitle } });

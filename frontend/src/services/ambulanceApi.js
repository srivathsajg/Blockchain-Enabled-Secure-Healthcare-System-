import axios from 'axios';

const API_URL = '/api';

// Get ambulance profile
export const getAmbulanceProfile = async () => {
  try {
    const token = localStorage.getItem('token');
    const response = await axios.get(`${API_URL}/auth/ambulance/profile`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    return response.data;
  } catch (error) {
    throw error;
  }
};

// Update ambulance availability status
export const updateAvailabilityStatus = async (status) => {
  try {
    const token = localStorage.getItem('token');
    const response = await axios.patch(`${API_URL}/auth/ambulance/availability`, 
      { status },
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );
    return response.data;
  } catch (error) {
    throw error;
  }
};
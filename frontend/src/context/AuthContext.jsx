import React, { createContext, useContext, useState, useEffect } from 'react';
import api from '../services/axiosInstance';

const AuthContext = createContext();

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const initAuth = async () => {
      const storedToken = localStorage.getItem('token');

      if (storedToken) {
        setToken(storedToken);
        try {
          // Always fetch fresh profile from server — localStorage may be stale
          const res = await api.get('/auth/profile', {
            headers: { Authorization: `Bearer ${storedToken}` }
          });
          if (res.data?.success && res.data?.data) {
            const freshUser = res.data.data;
            setUser(freshUser);
            localStorage.setItem('user', JSON.stringify(freshUser));
          } else {
            // Fallback to localStorage if server request fails
            const storedUser = localStorage.getItem('user');
            if (storedUser) {
              setUser(JSON.parse(storedUser));
            }
          }
        } catch (e) {
          // Token may be expired or server down — fall back to localStorage
          const storedUser = localStorage.getItem('user');
          if (storedUser) {
            try {
              setUser(JSON.parse(storedUser));
            } catch {
              logout();
            }
          } else {
            logout();
          }
        }
      }
      setLoading(false);
    };

    initAuth();
  }, []);

  const login = (userData, authToken) => {
    localStorage.setItem('token', authToken);
    localStorage.setItem('user', JSON.stringify(userData));
    setToken(authToken);
    setUser(userData);
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setToken(null);
    setUser(null);
    // Optional: Redirect to login
    window.location.href = '/login';
  };

  const value = {
    user,
    token,
    loading,
    login,
    logout,
    setUser,
    isAuthenticated: !!token,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

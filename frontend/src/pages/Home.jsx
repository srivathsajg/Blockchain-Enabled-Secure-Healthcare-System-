import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Navbar from '../components/Navbar';
import Hero from '../components/Hero';
import Features from '../components/Features';
import HowItWorks from '../components/HowItWorks';
import Footer from '../components/Footer';
import RegistrationModal from '../components/RegistrationModal';

const Home = () => {
  const { user, token } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [isRegisterOpen, setIsRegisterOpen] = useState(false);

  useEffect(() => {
    if (token && user?.role) {
      switch (user.role) {
        case 'doctor': navigate('/doctor-dashboard'); break;
        case 'patient': navigate('/patient-dashboard'); break;
        case 'pharmacist': navigate('/pharmacy-dashboard'); break;
        case 'delivery': navigate('/delivery-dashboard'); break;
        case 'admin': navigate('/admin-dashboard'); break;
        case 'ambulance': navigate('/ambulance-dashboard'); break;
        case 'lab_technician': navigate('/lab-dashboard'); break;
        default: break;
      }
    }
  }, [token, user, navigate]);

  useEffect(() => {
    if (location.state?.targetSection) {
      const el = document.getElementById(location.state.targetSection);
      if (el) {
        setTimeout(() => {
          el.scrollIntoView({ behavior: 'smooth' });
        }, 100);
      }
    }
  }, [location.state]);

  const handleEmergencyClick = () => {
    if (token && user?.role === 'patient') {
      navigate('/patient-dashboard', { state: { openEmergency: true } });
    } else if (token && user?.role === 'doctor') {
      navigate('/doctor-dashboard');
    } else if (token && user?.role === 'ambulance') {
      navigate('/ambulance-dashboard');
    } else if (token && user?.role === 'admin') {
      navigate('/admin-dashboard');
    } else if (token && user?.role === 'pharmacist') {
      navigate('/pharmacy-dashboard');
    } else if (token && user?.role === 'delivery') {
      navigate('/delivery-dashboard');
    } else {
      navigate('/login');
    }
  };

  return (
    <div className="min-h-screen bg-white font-sans text-gray-900 flex flex-col selection:bg-emerald-500 selection:text-white">
      <Navbar />
      
      <main className="flex-grow">
        <Hero />
        <Features />
        <HowItWorks />
      </main>

      <Footer 
        onRegisterClick={() => setIsRegisterOpen(true)}
        onEmergencyClick={handleEmergencyClick}
      />

      <RegistrationModal 
        isOpen={isRegisterOpen} 
        onClose={() => setIsRegisterOpen(false)} 
        onSwitchToLogin={() => {
          setIsRegisterOpen(false);
          navigate('/login');
        }}
      />
    </div>
  );
};

export default Home;

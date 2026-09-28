import React, { useState, useEffect } from 'react';
import { Menu, X, Siren } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useNavigate, useLocation } from 'react-router-dom';
import RegistrationModal from './RegistrationModal';

const Navbar = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [isRegisterOpen, setIsRegisterOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const { token, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleScrollTo = (id) => {
    setIsOpen(false);
    if (location.pathname !== '/') {
      navigate('/', { state: { targetSection: id } });
      return;
    }
    if (id === 'home') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      const element = document.getElementById(id);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth' });
      }
    }
  };

  const handleEmergencyClick = () => {
    setIsOpen(false);
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

  const handleLoginClick = () => {
    setIsOpen(false);
    navigate('/login');
  };

  return (
    <>
      <header 
        className={`sticky top-0 z-50 transition-all duration-300 ${
          scrolled 
            ? 'bg-white/95 backdrop-blur-md shadow-sm border-b border-gray-100/80 py-3' 
            : 'bg-white/90 backdrop-blur-sm border-b border-gray-100 py-4'
        }`}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-12 sm:h-14">
            
            {/* Logo */}
            <div 
              onClick={() => handleScrollTo('home')} 
              className="flex items-center gap-2.5 cursor-pointer select-none group"
            >
              <div className="bg-gradient-to-tr from-emerald-600 to-teal-400 p-2 rounded-xl shadow-md group-hover:shadow-emerald-200 group-hover:scale-105 transition-all">
                <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                </svg>
              </div>
              <div className="flex flex-col">
                <span className="font-extrabold text-2xl text-gray-900 tracking-tight leading-none group-hover:text-emerald-600 transition-colors">
                  MediCare
                </span>
                <span className="text-[10px] font-semibold text-emerald-600 tracking-wider uppercase leading-none mt-1">
                  Secured Health
                </span>
              </div>
            </div>
            
            {/* Desktop Navigation */}
            <nav className="hidden md:flex items-center space-x-1 lg:space-x-2 bg-gray-50/80 p-1.5 rounded-full border border-gray-200/60">
              <button 
                onClick={() => handleScrollTo('home')}
                className="px-4 py-1.5 text-sm font-semibold text-gray-700 hover:text-emerald-600 rounded-full hover:bg-white transition-all cursor-pointer"
              >
                Home
              </button>
              <button 
                onClick={() => handleScrollTo('features')}
                className="px-4 py-1.5 text-sm font-semibold text-gray-700 hover:text-emerald-600 rounded-full hover:bg-white transition-all cursor-pointer"
              >
                Features
              </button>
              <button 
                onClick={() => handleScrollTo('how-it-works')}
                className="px-4 py-1.5 text-sm font-semibold text-gray-700 hover:text-emerald-600 rounded-full hover:bg-white transition-all cursor-pointer"
              >
                How It Works
              </button>
            </nav>

            {/* Desktop Action Buttons */}
            <div className="hidden md:flex items-center space-x-3">
              <button 
                onClick={handleEmergencyClick}
                className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-red-600 to-rose-600 text-white text-xs lg:text-sm font-bold rounded-full hover:from-red-500 hover:to-rose-500 transition-all shadow-[0_0_15px_rgba(220,38,38,0.25)] hover:shadow-[0_0_20px_rgba(220,38,38,0.45)] transform hover:-translate-y-0.5 active:translate-y-0 cursor-pointer"
              >
                <Siren size={16} className="animate-pulse" />
                <span>EMERGENCY</span>
              </button>
              <button 
                onClick={handleLoginClick}
                className="px-5 py-2 text-sm text-gray-700 font-semibold border border-gray-200 rounded-full hover:border-emerald-500 hover:text-emerald-600 hover:bg-emerald-50/30 transition-all focus:outline-none cursor-pointer"
              >
                Login
              </button>
              <button 
                onClick={() => setIsRegisterOpen(true)}
                className="px-5 py-2 text-sm bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-full shadow-md hover:shadow-emerald-200 hover:shadow-lg transition-all transform hover:-translate-y-0.5 active:translate-y-0 focus:outline-none cursor-pointer"
              >
                Register
              </button>
            </div>

            {/* Mobile Hamburger Button */}
            <div className="md:hidden flex items-center gap-2">
              <button 
                onClick={handleEmergencyClick}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 text-white text-xs font-bold rounded-full shadow-sm"
              >
                <Siren size={13} className="animate-pulse" />
                <span>SOS</span>
              </button>
              <button 
                onClick={() => setIsOpen(!isOpen)} 
                aria-label="Toggle navigation menu"
                className="p-2 text-gray-700 hover:text-emerald-600 rounded-xl hover:bg-gray-100 transition-colors focus:outline-none"
              >
                {isOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Dropdown Menu */}
        {isOpen && (
          <div className="md:hidden bg-white/98 backdrop-blur-lg border-b border-gray-200 px-4 pt-3 pb-6 space-y-3 shadow-xl animate-in slide-in-from-top-2 duration-200">
            <div className="flex flex-col space-y-1">
              <button 
                onClick={() => handleScrollTo('home')}
                className="w-full text-left px-4 py-2.5 text-sm font-semibold text-gray-800 hover:text-emerald-600 hover:bg-emerald-50/50 rounded-xl transition-colors"
              >
                Home
              </button>
              <button 
                onClick={() => handleScrollTo('features')}
                className="w-full text-left px-4 py-2.5 text-sm font-semibold text-gray-800 hover:text-emerald-600 hover:bg-emerald-50/50 rounded-xl transition-colors"
              >
                Features
              </button>
              <button 
                onClick={() => handleScrollTo('how-it-works')}
                className="w-full text-left px-4 py-2.5 text-sm font-semibold text-gray-800 hover:text-emerald-600 hover:bg-emerald-50/50 rounded-xl transition-colors"
              >
                How It Works
              </button>
            </div>

            <div className="pt-3 border-t border-gray-100 flex flex-col space-y-2.5">
              <button 
                onClick={handleEmergencyClick}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-red-600 text-white font-bold rounded-xl hover:bg-red-500 shadow-md transition-all text-sm"
              >
                <Siren size={18} className="animate-pulse" />
                EMERGENCY GATEWAY
              </button>
              <button 
                onClick={handleLoginClick}
                className="w-full px-4 py-2.5 text-gray-800 font-semibold border border-gray-200 rounded-xl hover:border-emerald-500 hover:text-emerald-600 text-sm transition-all"
              >
                Login
              </button>
              <button 
                onClick={() => {
                  setIsOpen(false);
                  setIsRegisterOpen(true);
                }}
                className="w-full px-4 py-2.5 bg-emerald-600 text-white font-semibold rounded-xl hover:bg-emerald-500 shadow-md text-sm transition-all"
              >
                Register
              </button>
            </div>
          </div>
        )}
      </header>

      {/* Registration Modal */}
      <RegistrationModal 
        isOpen={isRegisterOpen} 
        onClose={() => setIsRegisterOpen(false)} 
        onSwitchToLogin={() => {
          setIsRegisterOpen(false);
          navigate('/login');
        }}
      />
    </>
  );
};

export default Navbar;

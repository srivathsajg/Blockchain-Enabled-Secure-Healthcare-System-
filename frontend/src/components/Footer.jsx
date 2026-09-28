import React from 'react';
import { HeartPulse, Shield, PhoneCall, ArrowUp } from 'lucide-react';

const Footer = ({ onRegisterClick, onEmergencyClick }) => {
  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const scrollToSection = (id) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <footer className="bg-[#0b0d11] text-gray-400 border-t border-gray-800/80">
      {/* Top emergency hotline bar */}
      <div className="bg-gradient-to-r from-red-950/40 via-red-900/20 to-red-950/40 border-b border-red-900/30 py-3">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-2 text-center sm:text-left">
          <div className="flex items-center gap-2 text-red-400 text-xs sm:text-sm font-semibold">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-ping"></span>
            <span>Emergency Medical Assistance Available 24/7 via ResQOne</span>
          </div>
          <button
            onClick={onEmergencyClick}
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-600/20 hover:bg-red-600/30 text-red-400 border border-red-500/30 text-xs font-bold transition-colors"
          >
            <PhoneCall className="w-3 h-3" />
            Launch Emergency Gateway
          </button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 md:py-16">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 lg:gap-12">
          {/* Brand Info */}
          <div className="md:col-span-2 space-y-4">
            <div className="flex items-center gap-2.5">
              <div className="bg-emerald-500 p-2 rounded-xl shadow-sm">
                <HeartPulse className="w-5 h-5 text-black" />
              </div>
              <span className="font-extrabold text-2xl text-white tracking-tight">MediCare</span>
            </div>
            <p className="text-sm text-gray-400 max-w-sm leading-relaxed">
              Decentralized, intelligent healthcare network unifying electronic health records, AI diagnostics, pharmacy fulfillment, and emergency dispatch into one secure ecosystem.
            </p>
            <div className="flex items-center gap-3 pt-2">
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-medium">
                <Shield className="w-3 h-3" /> Encrypted & HIPAA Compliant
              </span>
            </div>
          </div>

          {/* Quick Navigation */}
          <div>
            <h4 className="text-sm font-bold text-white uppercase tracking-wider mb-4">Navigation</h4>
            <ul className="space-y-2.5 text-sm">
              <li>
                <button onClick={scrollToTop} className="hover:text-emerald-400 transition-colors text-left">
                  Home
                </button>
              </li>
              <li>
                <button onClick={() => scrollToSection('features')} className="hover:text-emerald-400 transition-colors text-left">
                  Features
                </button>
              </li>
              <li>
                <button onClick={() => scrollToSection('how-it-works')} className="hover:text-emerald-400 transition-colors text-left">
                  How It Works
                </button>
              </li>
              <li>
                <button onClick={onRegisterClick} className="hover:text-emerald-400 transition-colors text-left">
                  Join Network
                </button>
              </li>
            </ul>
          </div>

          {/* Healthcare Ecosystem */}
          <div>
            <h4 className="text-sm font-bold text-white uppercase tracking-wider mb-4">Ecosystem</h4>
            <ul className="space-y-2.5 text-sm">
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                <span>Patient Portal</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-500"></span>
                <span>Doctor & Hospital Suite</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                <span>Pharmacy & Lab Network</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500"></span>
                <span>ResQOne Emergency Dispatch</span>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-12 pt-8 border-t border-gray-800 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-gray-500">
          <p>© {new Date().getFullYear()} MediCare Healthcare Network. All rights reserved.</p>
          <button 
            onClick={scrollToTop}
            className="flex items-center gap-1.5 hover:text-emerald-400 transition-colors"
          >
            <span>Back to top</span>
            <ArrowUp className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </footer>
  );
};

export default Footer;

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  ShieldCheck, 
  ArrowRight, 
  Sparkles, 
  Activity, 
  HeartPulse, 
  CheckCircle2,
  Lock,
  Stethoscope
} from 'lucide-react';

const Hero = () => {
  const navigate = useNavigate();

  const images = [
    "https://images.unsplash.com/photo-1551076805-e1869033e561?ixlib=rb-1.2.1&auto=format&fit=crop&w=1000&h=800&q=80",
    "https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?ixlib=rb-1.2.1&auto=format&fit=crop&w=1000&h=800&q=80",
    "https://images.unsplash.com/photo-1551601651-2a8555f1a136?ixlib=rb-1.2.1&auto=format&fit=crop&w=1000&h=800&q=80",
    "https://images.unsplash.com/photo-1532187863486-abf9dbad1b69?ixlib=rb-1.2.1&auto=format&fit=crop&w=1000&h=800&q=80",
    "https://images.unsplash.com/photo-1576091160550-217358c7db81?ixlib=rb-1.2.1&auto=format&fit=crop&w=1000&h=800&q=80",
    "https://images.unsplash.com/photo-1581056771107-24ca5f033842?ixlib=rb-1.2.1&auto=format&fit=crop&w=1000&h=800&q=80",
  ];

  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentImageIndex((prevIndex) => (prevIndex + 1) % images.length);
    }, 3500);
    return () => clearInterval(interval);
  }, [images.length]);

  const handleLearnMore = () => {
    const element = document.getElementById('features');
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <section id="home" className="relative bg-gradient-to-b from-white via-gray-50/50 to-white overflow-hidden pt-6 pb-16 md:py-20 lg:py-24 flex items-center min-h-[calc(100vh-80px)]">
      {/* Subtle Ambient Background Lighting */}
      <div className="absolute top-10 left-1/2 -translate-x-1/2 w-full max-w-7xl h-96 pointer-events-none overflow-hidden opacity-60">
        <div className="absolute top-0 left-10 w-80 sm:w-96 h-80 sm:h-96 bg-emerald-300/30 rounded-full mix-blend-multiply filter blur-3xl animate-pulse"></div>
        <div className="absolute top-10 right-10 w-80 sm:w-96 h-80 sm:h-96 bg-cyan-300/30 rounded-full mix-blend-multiply filter blur-3xl"></div>
        <div className="absolute -bottom-10 left-1/3 w-72 h-72 bg-teal-200/20 rounded-full mix-blend-multiply filter blur-3xl"></div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 w-full">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-12 items-center">
          
          {/* Left Column: Hero Content */}
          <div className="lg:col-span-7 space-y-6 md:space-y-8 text-center lg:text-left">
            
            {/* Top pill badge */}
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-800 text-xs sm:text-sm font-semibold shadow-sm">
              <Sparkles className="w-4 h-4 text-emerald-600" />
              <span>Decentralized • AI-Powered • 24/7 Connected Care</span>
            </div>

            {/* Main Headline */}
            <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-extrabold tracking-tight text-gray-900 leading-[1.12]">
              Healthcare, <br className="hidden sm:inline" />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600">
                Secured with
              </span>{' '}
              <span className="text-gray-900">MediCare</span>
            </h1>

            {/* Description */}
            <p className="text-base sm:text-lg md:text-xl text-gray-600 leading-relaxed font-normal max-w-2xl mx-auto lg:mx-0">
              Experience the future of medical care. Secure electronic records, intelligent AI diagnostics, connected pharmacy networks, and instant ResQOne emergency dispatch — all in one unified ecosystem.
            </p>

            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-4 pt-2 w-full max-w-md mx-auto lg:mx-0">
              <button
                onClick={() => navigate('/login')}
                className="w-full sm:w-auto px-8 py-3.5 sm:py-4 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-full shadow-lg shadow-emerald-600/20 hover:shadow-emerald-600/30 transition-all transform hover:-translate-y-0.5 active:translate-y-0 text-base flex items-center justify-center gap-2 cursor-pointer"
              >
                <span>Get Started</span>
                <ArrowRight className="w-5 h-5" />
              </button>

              <button
                onClick={handleLearnMore}
                className="w-full sm:w-auto px-8 py-3.5 sm:py-4 bg-white hover:bg-gray-50 text-gray-800 font-bold border border-gray-200 hover:border-emerald-500 hover:text-emerald-600 rounded-full shadow-sm transition-all text-base cursor-pointer"
              >
                Learn More
              </button>
            </div>

            {/* Trust Badges */}
            <div className="pt-6 sm:pt-8 border-t border-gray-100/90 grid grid-cols-2 sm:grid-cols-3 gap-4 max-w-xl mx-auto lg:mx-0">
              <div className="flex items-center gap-2.5 text-left">
                <div className="p-2 bg-emerald-50 rounded-lg text-emerald-600 border border-emerald-100 flex-shrink-0">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <p className="font-bold text-gray-900 text-xs sm:text-sm">100% Encrypted</p>
                  <p className="text-[11px] text-gray-500 font-medium">Decentralized EMR</p>
                </div>
              </div>

              <div className="flex items-center gap-2.5 text-left">
                <div className="p-2 bg-teal-50 rounded-lg text-teal-600 border border-teal-100 flex-shrink-0">
                  <Stethoscope className="w-5 h-5" />
                </div>
                <div>
                  <p className="font-bold text-gray-900 text-xs sm:text-sm">Verified Doctors</p>
                  <p className="text-[11px] text-gray-500 font-medium">Licensed Network</p>
                </div>
              </div>

              <div className="flex items-center gap-2.5 text-left col-span-2 sm:col-span-1">
                <div className="p-2 bg-red-50 rounded-lg text-red-600 border border-red-100 flex-shrink-0">
                  <Activity className="w-5 h-5" />
                </div>
                <div>
                  <p className="font-bold text-gray-900 text-xs sm:text-sm">ResQOne SOS</p>
                  <p className="text-[11px] text-gray-500 font-medium">24/7 Live Dispatch</p>
                </div>
              </div>
            </div>

          </div>

          {/* Right Column: Visual & Interactive Healthcare Cards */}
          <div className="lg:col-span-5 relative flex items-center justify-center">
            <div className="relative w-full max-w-md sm:max-w-lg lg:max-w-none">
              
              {/* Image Frame with Floating Motion */}
              <div className="relative rounded-3xl overflow-hidden shadow-2xl border-4 border-white aspect-[4/3] sm:aspect-[14/11] bg-gray-900">
                {images.map((src, index) => (
                  <img
                    key={index}
                    src={src}
                    alt={`Modern MediCare Technology ${index + 1}`}
                    loading={index === 0 ? "eager" : "lazy"}
                    className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-1000 ease-in-out ${
                      index === currentImageIndex ? 'opacity-100 scale-100' : 'opacity-0 scale-105'
                    }`}
                  />
                ))}

                {/* Subtle dark gradient overlay */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent"></div>

                {/* Status bar inside image bottom */}
                <div className="absolute bottom-4 left-4 right-4 bg-black/60 backdrop-blur-md border border-white/20 rounded-2xl p-3 text-white flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping"></span>
                    <span className="text-xs font-semibold">MediCare Live Node Active</span>
                  </div>
                  <span className="text-[11px] text-emerald-300 font-mono bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-500/30">
                    SECURE
                  </span>
                </div>
              </div>

              {/* Floating Card Top-Right */}
              <div className="hidden sm:flex absolute -top-5 -right-5 bg-white/95 backdrop-blur-md p-3.5 rounded-2xl shadow-xl border border-gray-100 items-center gap-3 animate-float duration-300">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center text-white shadow-sm">
                  <Lock className="w-5 h-5" />
                </div>
                <div className="text-left pr-2">
                  <p className="text-xs font-bold text-gray-900">Decentralized EMR</p>
                  <p className="text-[10px] text-emerald-600 font-semibold flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" /> Blockchain Verified
                  </p>
                </div>
              </div>

              {/* Floating Card Bottom-Left */}
              <div className="hidden sm:flex absolute -bottom-5 -left-5 bg-white/95 backdrop-blur-md p-3.5 rounded-2xl shadow-xl border border-gray-100 items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-red-500 to-rose-600 flex items-center justify-center text-white shadow-sm">
                  <HeartPulse className="w-5 h-5" />
                </div>
                <div className="text-left pr-2">
                  <p className="text-xs font-bold text-gray-900">ResQOne Emergency</p>
                  <p className="text-[10px] text-gray-500 font-medium">Live Telemetry & GPS</p>
                </div>
              </div>

            </div>
          </div>

        </div>
      </div>
    </section>
  );
};

export default Hero;

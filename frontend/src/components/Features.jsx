import React from 'react';
import { 
  FileText, 
  ScanLine, 
  Salad, 
  ShieldCheck, 
  Pill, 
  FlaskConical, 
  BellRing, 
  Siren,
  ArrowUpRight
} from 'lucide-react';

const features = [
  {
    icon: FileText,
    title: "Secure Medical Records",
    description: "Decentralized, encrypted electronic health records with role-based access control and patient data sovereignty.",
    accent: "from-emerald-500/20 to-teal-500/10",
    iconColor: "text-emerald-500",
    badge: "EMR / EHR"
  },
  {
    icon: ScanLine,
    title: "Smart Diagnostics & OCR",
    description: "AI-powered optical character recognition to instantly digitize physical prescriptions and analyze diagnostic reports.",
    accent: "from-teal-500/20 to-cyan-500/10",
    iconColor: "text-teal-500",
    badge: "AI Vision"
  },
  {
    icon: Salad,
    title: "Personalized Diet & Nutrition",
    description: "Intelligent, clinically-tailored dietary guidance and calorie tracking synchronized directly with your medical profile.",
    accent: "from-green-500/20 to-emerald-500/10",
    iconColor: "text-green-500",
    badge: "Wellness"
  },
  {
    icon: ShieldCheck,
    title: "Blockchain Verification",
    description: "Cryptographic validation and immutable audit trails ensuring tamper-proof medical history and trusted authenticity.",
    accent: "from-cyan-500/20 to-blue-500/10",
    iconColor: "text-cyan-500",
    badge: "Web3 Security"
  },
  {
    icon: Pill,
    title: "Pharmacy Management",
    description: "Seamless prescription fulfillment, real-time inventory tracking, dosage alerts, and express doorstep delivery.",
    accent: "from-blue-500/20 to-indigo-500/10",
    iconColor: "text-blue-500",
    badge: "Pharmacy"
  },
  {
    icon: FlaskConical,
    title: "Laboratory Management",
    description: "Instant lab test bookings, automated sample telemetry, barcode tracking, and verified digital report generation.",
    accent: "from-emerald-500/20 to-cyan-500/10",
    iconColor: "text-emerald-500",
    badge: "Diagnostics"
  },
  {
    icon: BellRing,
    title: "Real-Time Notifications",
    description: "Live audio and visual telemetry alerts for doctor appointments, critical vitals, prescription refills, and test results.",
    accent: "from-amber-500/20 to-orange-500/10",
    iconColor: "text-amber-500",
    badge: "Real-Time"
  },
  {
    icon: Siren,
    title: "Emergency Response & ResQOne",
    description: "One-touch SOS dispatch, real-time paramedic GPS tracking, and QR code emergency profile scanning for rapid triage.",
    accent: "from-red-500/20 to-rose-500/10",
    iconColor: "text-red-500",
    badge: "ResQOne"
  }
];

const Features = () => {
  return (
    <section id="features" className="py-20 md:py-28 bg-[#fafafa] relative overflow-hidden">
      {/* Decorative ambient background */}
      <div className="absolute top-1/2 left-0 w-96 h-96 bg-emerald-100/40 rounded-full filter blur-3xl -translate-y-1/2 pointer-events-none"></div>
      <div className="absolute top-1/3 right-0 w-96 h-96 bg-cyan-100/40 rounded-full filter blur-3xl pointer-events-none"></div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto mb-16 md:mb-20">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-50 border border-emerald-200/80 text-emerald-700 text-xs sm:text-sm font-semibold mb-4 shadow-sm">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            Comprehensive Healthcare Platform
          </div>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-gray-900 tracking-tight leading-tight">
            Intelligent Capabilities Built for <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600">Modern Medicine</span>
          </h2>
          <p className="mt-4 text-base sm:text-lg text-gray-600 font-normal leading-relaxed">
            From decentralized records and AI-driven diagnostics to emergency dispatch, MediCare unites every corner of healthcare into one seamless experience.
          </p>
        </div>

        {/* Feature Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 md:gap-8">
          {features.map((feature, idx) => {
            const Icon = feature.icon;
            return (
              <div
                key={idx}
                className="group relative bg-white rounded-2xl p-6 sm:p-7 border border-gray-100 shadow-[0_4px_20px_rgba(0,0,0,0.03)] hover:shadow-[0_12px_30px_rgba(16,185,129,0.1)] hover:border-emerald-200 transition-all duration-300 hover:-translate-y-1 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-5">
                    <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${feature.accent} flex items-center justify-center border border-gray-100 group-hover:scale-105 transition-transform duration-300`}>
                      <Icon className={`w-6 h-6 ${feature.iconColor}`} />
                    </div>
                    <span className="text-[11px] uppercase tracking-wider font-bold px-2.5 py-1 rounded-full bg-gray-50 text-gray-600 border border-gray-100 group-hover:bg-emerald-50 group-hover:text-emerald-700 group-hover:border-emerald-100 transition-colors">
                      {feature.badge}
                    </span>
                  </div>

                  <h3 className="text-lg sm:text-xl font-bold text-gray-900 group-hover:text-emerald-600 transition-colors">
                    {feature.title}
                  </h3>
                  <p className="mt-2.5 text-sm text-gray-600 leading-relaxed">
                    {feature.description}
                  </p>
                </div>

                <div className="mt-6 pt-4 border-t border-gray-50 flex items-center justify-between text-xs font-semibold text-emerald-600 opacity-0 group-hover:opacity-100 transition-opacity">
                  <span>Learn capability</span>
                  <ArrowUpRight className="w-4 h-4 transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default Features;

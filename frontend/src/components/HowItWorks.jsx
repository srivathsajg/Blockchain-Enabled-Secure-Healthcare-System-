import React from 'react';
import { 
  UserPlus, 
  CalendarCheck, 
  Stethoscope, 
  LockKeyhole, 
  Sparkles, 
  Ambulance,
  ArrowRight
} from 'lucide-react';

const steps = [
  {
    step: "01",
    title: "Register & Onboard",
    subtitle: "Quick Role-Based Access",
    description: "Create your profile as a patient, doctor, hospital admin, lab tech, pharmacist, or ambulance responder.",
    icon: UserPlus,
    accent: "bg-emerald-500 text-white",
    badgeColor: "text-emerald-600 bg-emerald-50 border-emerald-200"
  },
  {
    step: "02",
    title: "Book & Request Care",
    subtitle: "Effortless Scheduling",
    description: "Schedule in-person or virtual doctor appointments, order diagnostic lab tests, or request medication delivery.",
    icon: CalendarCheck,
    accent: "bg-teal-500 text-white",
    badgeColor: "text-teal-600 bg-teal-50 border-teal-200"
  },
  {
    step: "03",
    title: "Doctor, Lab & Pharmacy",
    subtitle: "Connected Healthcare",
    description: "Consult with verified physicians, receive digital prescriptions, run lab tests, and track your pharmacy orders.",
    icon: Stethoscope,
    accent: "bg-cyan-500 text-white",
    badgeColor: "text-cyan-600 bg-cyan-50 border-cyan-200"
  },
  {
    step: "04",
    title: "Secure Medical Records",
    subtitle: "Decentralized & Encrypted",
    description: "Your health records, lab reports, and vitals are encrypted, tamper-proof, and accessible only with your consent.",
    icon: LockKeyhole,
    accent: "bg-blue-500 text-white",
    badgeColor: "text-blue-600 bg-blue-50 border-blue-200"
  },
  {
    step: "05",
    title: "AI Assistance & Insights",
    subtitle: "Intelligent Guidance",
    description: "Get smart prescription OCR parsing, automated report summaries, customized nutrition diets, and 24/7 AI health tips.",
    icon: Sparkles,
    accent: "bg-indigo-500 text-white",
    badgeColor: "text-indigo-600 bg-indigo-50 border-indigo-200"
  },
  {
    step: "06",
    title: "ResQOne Emergency Support",
    subtitle: "Rapid SOS Response",
    description: "In urgent situations, trigger instant emergency alerts with live GPS ambulance dispatch and QR medical ID triage.",
    icon: Ambulance,
    accent: "bg-red-500 text-white",
    badgeColor: "text-red-600 bg-red-50 border-red-200"
  }
];

const HowItWorks = () => {
  return (
    <section id="how-it-works" className="py-20 md:py-28 bg-white relative overflow-hidden">
      {/* Background accents */}
      <div className="absolute inset-0 pointer-events-none opacity-40">
        <div className="absolute top-0 right-1/4 w-80 h-80 bg-emerald-50 rounded-full blur-3xl"></div>
        <div className="absolute bottom-0 left-1/4 w-80 h-80 bg-cyan-50 rounded-full blur-3xl"></div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto mb-16 md:mb-20">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-cyan-50 border border-cyan-200/80 text-cyan-700 text-xs sm:text-sm font-semibold mb-4 shadow-sm">
            <span className="w-2 h-2 rounded-full bg-cyan-500 animate-pulse"></span>
            Seamless Care Journey
          </div>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-gray-900 tracking-tight leading-tight">
            How <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600">MediCare Works</span>
          </h2>
          <p className="mt-4 text-base sm:text-lg text-gray-600 font-normal leading-relaxed">
            A cohesive 6-step workflow connecting patients, healthcare specialists, diagnostics, and emergency units seamlessly.
          </p>
        </div>

        {/* Steps Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
          {steps.map((item, index) => {
            const Icon = item.icon;
            return (
              <div 
                key={index} 
                className="relative bg-white rounded-2xl p-6 sm:p-8 border border-gray-100 shadow-[0_4px_20px_rgba(0,0,0,0.03)] hover:shadow-[0_12px_32px_rgba(16,185,129,0.08)] hover:border-emerald-200 transition-all duration-300 flex flex-col justify-between group"
              >
                <div>
                  <div className="flex items-center justify-between mb-6">
                    <div className={`w-12 h-12 rounded-xl ${item.accent} flex items-center justify-center shadow-md group-hover:scale-105 transition-transform duration-300`}>
                      <Icon className="w-6 h-6" />
                    </div>
                    <span className="text-2xl font-black text-gray-200 group-hover:text-emerald-500/30 transition-colors font-mono">
                      {item.step}
                    </span>
                  </div>

                  <span className={`inline-block text-[11px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full border mb-2.5 ${item.badgeColor}`}>
                    {item.subtitle}
                  </span>

                  <h3 className="text-xl font-bold text-gray-900 group-hover:text-emerald-600 transition-colors">
                    {item.title}
                  </h3>

                  <p className="mt-3 text-sm text-gray-600 leading-relaxed">
                    {item.description}
                  </p>
                </div>

                {index < steps.length - 1 && (
                  <div className="hidden lg:flex items-center gap-1.5 text-xs font-semibold text-gray-400 group-hover:text-emerald-600 transition-colors mt-6 pt-4 border-t border-gray-50">
                    <span>Next step</span>
                    <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                  </div>
                )}
                {index === steps.length - 1 && (
                  <div className="hidden lg:flex items-center gap-1.5 text-xs font-bold text-red-500 mt-6 pt-4 border-t border-gray-50">
                    <span>24/7 ResQOne Protected</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default HowItWorks;

import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { CalendarClock, Clock, CheckCircle, XCircle, CalendarPlus, X, Loader2, MapPin, Search, Activity, User, MessageCircle, Phone, Users, Briefcase, Star, FileText, Award } from 'lucide-react';
import { fetchPatientAppointments, fetchDoctors, bookAppointment, fetchDoctorSlots, cancelAppointment, respondToReallocation, rateAppointment, fetchOverview, respondToDelayRequest } from '../../services/patientApi';
import { getBaseUrl } from '../../services/userApi';
import { useAuth } from '../../context/AuthContext';
import Skeleton from 'react-loading-skeleton';
import 'react-loading-skeleton/dist/skeleton.css';
import PatientCalendar from './PatientCalendar';
import socket from '../../services/socket';

/* ─── Status Badge ─────────────────────────────────────────────────── */
const StatusBadge = ({ status, isEmergency }) => {
    const map = {
        pending: { cls: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30', icon: <Clock size={11} />, label: 'Pending' },
        approved: { cls: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30', icon: <CheckCircle size={11} />, label: 'Approved' },
        rejected: { cls: 'bg-red-500/15 text-red-400 border-red-500/30', icon: <XCircle size={11} />, label: 'Rejected' },
        completed: { cls: 'bg-blue-500/15 text-blue-400 border-blue-500/30', icon: <CheckCircle size={11} />, label: 'Completed' },
        cancelled: { cls: 'bg-gray-500/15 text-gray-400 border-gray-500/30', icon: <XCircle size={11} />, label: 'Cancelled' },
        expired: { cls: 'bg-orange-500/15 text-orange-400 border-orange-500/30', icon: <Clock size={11} />, label: 'Expired' },
    };
    const b = map[status] || map.pending;
    return (
        <div className="flex flex-col items-end gap-1">
            <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full border ${b.cls}`}>
                {b.icon} {b.label}
            </span>
            {isEmergency && (
                <span className="text-[9px] font-bold text-red-500 uppercase tracking-tighter bg-red-500/10 px-1.5 rounded animate-pulse">
                    emergency
                </span>
            )}
        </div>
    );
};

/* ─── Booking Modal ─────────────────────────────────────────────────── */
const BookingFullScreenView = ({ doctor, onClose, onSuccess, initialDate, isAdmitted }) => {
    const [form, setForm] = useState({ date: initialDate || '', time: '', reason: '' });
    const [availableSlots, setAvailableSlots] = useState([]);
    const [slotsLoading, setSlotsLoading] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [datesList, setDatesList] = useState([]);
    const [reviews, setReviews] = useState([]);
    const [reviewsLoading, setReviewsLoading] = useState(false);
    const [showCertificates, setShowCertificates] = useState(false);

    const isSlotPast = useCallback((dateStr, timeStr) => {
        if (!dateStr || !timeStr) return false;
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const todayStr = `${year}-${month}-${day}`;
        
        if (dateStr < todayStr) return true;
        if (dateStr > todayStr) return false;

        // It's today, check the time
        const [time, modifier] = timeStr.split(" ");
        let [hours, minutes] = time.split(":").map(Number);
        if (modifier === "PM" && hours < 12) hours += 12;
        if (modifier === "AM" && hours === 12) hours = 0;
        
        const slotTime = new Date();
        slotTime.setHours(hours, minutes, 0, 0);
        return slotTime < now;
    }, []);

    // Generate next 14 days
    useEffect(() => {
        const d = [];
        const now = new Date();
        for (let i = 0; i < 14; i++) {
            const date = new Date(now);
            date.setDate(now.getDate() + i);
            
            // Format to YYYY-MM-DD in local time
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            const fullStr = `${year}-${month}-${day}`;

            d.push({
                dateObj: date,
                dayStr: date.toLocaleDateString('en-US', { weekday: 'short' }),
                dateNum: date.getDate(),
                fullStr: fullStr
            });
        }
        setDatesList(d);
        setForm(prev => ({
            ...prev,
            date: prev.date || (d.length > 0 ? d[0].fullStr : '')
        }));
    }, [initialDate]);

    const loadSlots = useCallback(async () => {
        if (!form.date) return;
        setSlotsLoading(true);
        try {
            const res = await fetchDoctorSlots(doctor._id, form.date);
            if (res.success) {
                setAvailableSlots(res.slots || []);
            }
        } catch (err) {
            console.error("Error loading slots", err);
        } finally {
            setSlotsLoading(false);
        }
    }, [doctor._id, form.date]);

    useEffect(() => {
        loadSlots();
    }, [loadSlots]);

    useEffect(() => {
        const loadReviews = async () => {
            setReviewsLoading(true);
            try {
                const res = await fetchDoctorReviews(doctor._id);
                if (res.success) {
                    setReviews(res.data || []);
                }
            } catch (err) {
                console.error("Error loading reviews", err);
            } finally {
                setReviewsLoading(false);
            }
        };
        if (doctor?._id) {
            loadReviews();
        }
    }, [doctor?._id]);

    const handle = async (e) => {
        e.preventDefault();
        if (isAdmitted) {
            setError('Cannot book appointments while admitted to hospital.');
            return;
        }
        if (isSlotPast(form.date, form.time)) {
            setError('Cannot book appointments for past dates or times.');
            return;
        }
        setLoading(true);
        setError('');
        try {
            const res = await bookAppointment({ doctorId: doctor._id, ...form });
            if (res.success) {
                onSuccess(`✅ Appointment booked with Dr. ${doctor.name}!`);
            } else {
                setError(res.message || 'Booking failed');
            }
        } catch (err) {
            setError(err?.response?.data?.message || 'Booking failed. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="w-full h-[calc(100vh-100px)] sm:h-[800px] bg-[#0a0f1c] text-white flex flex-col rounded-[32px] overflow-hidden border border-white/5 animate-fadein relative shadow-2xl">
            {/* Close / Back Button */}
            <button onClick={onClose} className="absolute top-6 left-6 sm:top-8 sm:left-8 z-30 w-10 h-10 flex items-center justify-center bg-black/40 backdrop-blur-md rounded-full text-white/70 hover:text-white transition-colors border border-white/10 hover:bg-black/60">
                <X size={20} />
            </button>

            <div className="overflow-y-auto flex-1 custom-scrollbar pb-10 relative">
                 {/* Hero & Intro Section Split Layout */}
                 <div className="px-6 sm:px-12 mt-8 sm:mt-12 relative z-10 max-w-5xl mx-auto flex flex-col sm:flex-row gap-8 lg:gap-12 w-full mb-10">
                      
                      {/* Left: Premium Profile Image Portrait */}
                      <div className="w-[180px] h-[240px] sm:w-[280px] sm:h-[380px] shrink-0 rounded-[32px] bg-[#0b101e] border border-white/10 p-2 shadow-[0_20px_60px_rgba(0,0,0,0.6)] relative group">
                          {doctor.profileImage ? (
                              <img src={`${getBaseUrl()}/${doctor.profileImage}`} className="w-full h-full object-cover object-center rounded-[24px] group-hover:scale-105 transition-transform duration-700" alt={doctor.name} />
                          ) : (
                              <div className="w-full h-full bg-gradient-to-br from-blue-900/40 to-indigo-900/40 border border-blue-500/20 rounded-[24px] flex items-center justify-center">
                                  <User size={80} className="text-blue-400 opacity-50" />
                              </div>
                          )}
                          <div className="absolute inset-0 rounded-[32px] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.05)] pointer-events-none" />
                      </div>

                      {/* Right: Doctor Info & Quick Stats */}
                      <div className="flex-1 flex flex-col justify-center">
                          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-6 mb-8">
                              <div>
                                  <h1 className="text-4xl sm:text-5xl font-black tracking-tight text-white mb-2 leading-none">Dr. {doctor.name}</h1>
                                  <div className="flex flex-col gap-3">
                                      <p className="text-blue-400 text-lg sm:text-xl font-bold uppercase tracking-widest">{doctor.specialization || 'Neurologist'}</p>
                                      
                                      <div className="flex flex-wrap items-center gap-2 mt-2">
                                              <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/[0.03] border border-white/5 backdrop-blur-sm shrink-0">
                                                  <span className="text-base">🏥</span>
                                                  <span className="font-bold text-gray-300 tracking-wide text-sm">{doctor.hospitalName || 'Medicare Center'}</span>
                                              </div>
                                              {doctor.hospitalAddress && (
                                                  <div className="flex items-center gap-1.5 text-gray-400 px-3 py-1.5 border border-white/[0.02] bg-white/[0.01] rounded-xl flex-1 min-w-0">
                                                  <MapPin size={16} className="text-blue-500/70 shrink-0" />
                                                  <span className="font-medium text-sm">{doctor.hospitalAddress || 'Address not available'}</span>
                                              </div>
                                              )}
                                          </div>
                                  </div>
                              </div>
                              <div className="flex gap-3">
                                  <button className="w-12 h-12 flex items-center justify-center rounded-[16px] bg-blue-600/10 text-blue-400 hover:bg-blue-600 hover:text-white transition-all border border-blue-500/20 shadow-lg hover:shadow-blue-500/20 active:scale-95 group/btn shrink-0">
                                      <MessageCircle size={20} className="group-hover/btn:scale-110 transition-transform" />
                                  </button>
                                  <button className="w-12 h-12 flex items-center justify-center rounded-[16px] bg-blue-600/10 text-blue-400 hover:bg-blue-600 hover:text-white transition-all border border-blue-500/20 shadow-lg hover:shadow-blue-500/20 active:scale-95 group/btn shrink-0">
                                      <Phone size={20} className="group-hover/btn:scale-110 transition-transform" />
                                  </button>
                              </div>
                          </div>

                          {/* Stats Row immediately below header info */}
                         <div className="grid grid-cols-3 gap-4 border border-white/[0.05] bg-white/[0.02] rounded-[24px] p-6 max-w-2xl">
                            <div className="flex flex-col items-center justify-center">
                                <div className="flex items-center gap-2 mb-1 text-blue-400">
                                    <Users size={18} />
                                    <span className="text-xl font-bold text-white">{doctor.patientsTreatedCount ? `${doctor.patientsTreatedCount}+` : '0'}</span>
                                </div>
                                <span className="text-gray-500 text-[11px] font-bold uppercase tracking-[0.15em] text-center">Patients</span>
                            </div>
                            <div className="flex flex-col items-center justify-center border-x border-white/[0.05]">
                                <div className="flex items-center gap-2 mb-1 text-blue-400">
                                    <Briefcase size={18} />
                                    <span className="text-xl font-bold text-white">{doctor.experience || '4'}</span>
                                </div>
                                <span className="text-gray-500 text-[11px] font-bold uppercase tracking-[0.15em] text-center">Experience</span>
                            </div>
                            <div className="flex flex-col items-center justify-center">
                                <div className="flex items-center gap-2 mb-1 text-amber-400">
                                    <Star size={18} />
                                    <span className="text-xl font-bold text-white">{doctor.averageRating ? doctor.averageRating.toFixed(1) : 'New'}</span>
                                </div>
                                <span className="text-gray-500 text-[11px] font-bold uppercase tracking-[0.15em] text-center">Rating</span>
                            </div>
                         </div>
                      </div>
                 </div>

                 {/* Remaining layout elements */}
                 <div className="px-6 sm:px-12 relative z-10 max-w-5xl mx-auto mt-4">
                      {/* About */}
                      <div className="mb-10 w-full">
                          <div className="flex items-center justify-between mb-3">
                              <h3 className="text-white font-bold text-xl">About Doctor</h3>
                              {doctor.achievementCertificates?.length > 0 && (
                                  <button 
                                      onClick={() => setShowCertificates(true)}
                                      className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20 hover:bg-blue-500 hover:text-white transition-all text-sm font-bold shadow-lg shadow-blue-500/10 active:scale-95"
                                  >
                                      <Award size={16} />
                                      View Certificates
                                  </button>
                              )}
                          </div>
                          <p className="text-gray-400 text-sm sm:text-[15px] leading-relaxed max-w-4xl">
                              {doctor.bio || `A dedicated ${doctor.specialization?.toLowerCase() || 'specialist'} committed to patient assessments, advanced therapies, and delivering highly personalized medical care. Focused on continuous improvement and achieving the best health outcomes for every patient.`}
                          </p>
                      </div>

                      {/* Reviews Section */}
                      <div className="mb-10 w-full">
                          <h3 className="text-white font-bold text-xl mb-4 flex items-center gap-3">
                              Patient Reviews
                              {reviewsLoading && <Loader2 size={16} className="animate-spin text-blue-500" />}
                          </h3>
                          {reviews.length > 0 ? (
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                  {reviews.map((rev, idx) => (
                                      <div key={idx} className="bg-white/[0.02] border border-white/5 rounded-2xl p-4 hover:bg-white/[0.04] transition-all">
                                          <div className="flex items-center justify-between mb-2">
                                              <div className="flex items-center gap-2">
                                                  <div className="w-8 h-8 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-400 font-bold text-xs border border-blue-500/20">
                                                      {rev.patientId?.profileImage ? (
                                                          <img src={`${getBaseUrl()}/${rev.patientId.profileImage}`} alt="" className="w-full h-full rounded-full object-cover" />
                                                      ) : (
                                                          (rev.patientId?.name || 'P')[0]
                                                      )}
                                                  </div>
                                                  <span className="text-sm font-semibold text-gray-200">{rev.patientId?.name || 'Patient'}</span>
                                              </div>
                                              <div className="flex items-center gap-1">
                                                  <Star size={12} className="text-amber-400 fill-amber-400" />
                                                  <span className="text-sm font-bold text-amber-400">{rev.rating}</span>
                                              </div>
                                          </div>
                                          <p className="text-gray-400 text-xs leading-relaxed italic">
                                              "{rev.review || 'No written review provided.'}"
                                          </p>
                                          <p className="text-[10px] text-gray-600 mt-2">
                                              {new Date(rev.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                          </p>
                                      </div>
                                  ))}
                              </div>
                          ) : (
                              <div className="bg-white/[0.01] border border-white/5 rounded-2xl p-6 text-center">
                                  <p className="text-gray-500 text-sm">No reviews yet for Dr. {doctor.name}.</p>
                              </div>
                          )}
                      </div>

                      <form id="bookingForm" onSubmit={handle} className="space-y-8 w-full">
                          {/* Selected Date */}
                          <div>
                              <h3 className="text-white font-bold text-xl mb-4">Select Date</h3>
                              <div className="flex gap-4 overflow-x-auto custom-scrollbar pb-4 mask-linear-fade pr-4">
                                  {datesList.map((d, i) => (
                                      <button
                                          key={i}
                                          type="button"
                                          onClick={() => {
                                              setForm({ ...form, date: d.fullStr, time: '' });
                                              setError(''); // Clear error when changing date
                                          }}
                                          className={`flex flex-shrink-0 flex-col items-center justify-center w-[76px] h-[96px] rounded-[24px] border transition-all ${
                                              form.date === d.fullStr
                                              ? 'bg-blue-600 border-blue-500 text-white shadow-[0_10px_20px_rgba(37,99,235,0.3)] scale-105 z-10'
                                              : 'bg-white/[0.02] border-white/5 text-gray-400 hover:bg-white/[0.05] hover:text-gray-300'
                                          }`}
                                      >
                                          <span className="text-xs font-bold mb-2 uppercase tracking-wide">{d.dayStr}</span>
                                          <span className={`text-2xl font-black ${form.date === d.fullStr ? 'text-white' : 'text-gray-300'}`}>{d.dateNum}</span>
                                      </button>
                                  ))}
                              </div>
                          </div>

                          {/* Selected Time */}
                          <div>
                              <h3 className="text-white font-bold text-xl mb-4 flex items-center gap-3">
                                  Select Time 
                                  {slotsLoading && <Loader2 size={16} className="animate-spin text-blue-500" />}
                              </h3>
                              {form.date ? (
                                  availableSlots.length > 0 ? (
                                      <div className="flex flex-wrap gap-3">
                                          {availableSlots.map(slot => {
                                              const past = isSlotPast(form.date, slot.time);

                                              return (
                                                  <button
                                                      key={slot.time}
                                                      type="button"
                                                      disabled={past}
                                                      onClick={() => {
                                                          setForm({ ...form, time: slot.time });
                                                          setError(''); // Clear error on any time selection
                                                      }}
                                                      className={`px-6 py-3.5 rounded-full text-[15px] font-black tracking-wide border transition-all ${
                                                          form.time === slot.time
                                                          ? 'bg-blue-600 border-blue-500 text-white shadow-[0_5px_15px_rgba(37,99,235,0.3)] scale-105'
                                                          : past
                                                          ? 'bg-white/[0.01] border-white/5 text-gray-700 cursor-not-allowed opacity-40'
                                                          : 'bg-white/[0.02] border-white/5 text-gray-400 hover:bg-white/[0.08] hover:text-white'
                                                      }`}
                                                  >
                                                      {slot.time}
                                                      {past && <span className="ml-2 text-[10px] uppercase opacity-60">(Past)</span>}
                                                  </button>
                                              );
                                          })}
                                      </div>
                                  ) : (
                                      <p className="text-red-400 text-sm p-4 bg-red-500/10 rounded-2xl border border-red-500/20 inline-block">No slots available for the selected date.</p>
                                  )
                              ) : (
                                  <p className="text-gray-500 text-sm bg-white/[0.02] p-4 rounded-2xl border border-white/5 inline-block">Please select a date first.</p>
                              )}
                          </div>

                          {/* Reason */}
                          <div>
                              <h3 className="text-white font-bold text-xl mb-4">Reason for Visit</h3>
                              <textarea
                                   required
                                   value={form.reason}
                                   onChange={e => setForm({ ...form, reason: e.target.value })}
                                   rows={3}
                                   placeholder="Please describe your symptoms or concern..."
                                   className="w-full bg-white/[0.02] border border-white/5 rounded-[24px] px-6 py-5 text-white placeholder:text-gray-600 focus:outline-none focus:border-blue-500/50 focus:bg-white/[0.04] transition-all resize-none text-[15px]"
                              />
                          </div>

                          {isAdmitted && (
                              <p className="text-yellow-300 bg-yellow-500/10 px-4 py-3 rounded-xl text-center text-sm font-medium border border-yellow-500/20">
                                  Booking is disabled while you are admitted to hospital. Please use your assigned ward care team.
                              </p>
                          )}
                          {error && <p className="text-red-400 bg-red-500/10 px-4 py-3 rounded-xl text-center text-sm font-medium">{error}</p>}
                          
                          <button 
                              form="bookingForm"
                              type="submit"
                              disabled={loading || !form.time || isAdmitted || isSlotPast(form.date, form.time)} 
                              className="w-full mt-6 py-5 rounded-[24px] bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white font-black text-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_15px_30px_rgba(37,99,235,0.25)] active:scale-[0.98] flex items-center justify-center gap-3 uppercase tracking-widest"
                          >
                              {loading ? <Loader2 size={24} className="animate-spin" /> : 'Booking Now'}
                          </button>
                      </form>
                 </div>
            </div>

            {/* Certificates Modal */}
            {showCertificates && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 bg-black/80 backdrop-blur-md animate-in fade-in duration-300">
                    <div className="bg-[#111] border border-white/10 w-full max-w-2xl rounded-[32px] overflow-hidden shadow-2xl animate-in zoom-in-95 duration-300">
                        <div className="p-6 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-2xl bg-blue-500/10 flex items-center justify-center text-blue-400">
                                    <Award size={20} />
                                </div>
                                <div>
                                    <h2 className="text-xl font-bold text-white">Doctor Certificates</h2>
                                    <p className="text-xs text-gray-500">Verified achievements of Dr. {doctor.name}</p>
                                </div>
                            </div>
                            <button 
                                onClick={() => setShowCertificates(false)}
                                className="w-10 h-10 flex items-center justify-center rounded-2xl bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white transition-all"
                            >
                                <X size={20} />
                            </button>
                        </div>
                        <div className="p-6 max-h-[70vh] overflow-y-auto custom-scrollbar">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                {doctor.achievementCertificates?.map((cert, idx) => (
                                    <div key={idx} className="group relative bg-white/[0.02] border border-white/5 rounded-2xl overflow-hidden hover:bg-white/[0.04] transition-all">
                                        <div className="aspect-[4/3] bg-gray-900 flex items-center justify-center">
                                            {cert.toLowerCase().endsWith('.pdf') ? (
                                                <FileText size={48} className="text-blue-500/20" />
                                            ) : (
                                                <img 
                                                    src={`${getBaseUrl()}/${cert}`} 
                                                    alt={`Certificate ${idx + 1}`}
                                                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                                                />
                                            )}
                                        </div>
                                        <div className="p-4 flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <FileText size={14} className="text-blue-400" />
                                                <span className="text-xs font-bold text-gray-300 uppercase tracking-wider">Certificate {idx + 1}</span>
                                            </div>
                                            <a 
                                                href={`${getBaseUrl()}/${cert}`} 
                                                target="_blank" 
                                                rel="noopener noreferrer"
                                                className="px-3 py-1.5 rounded-lg bg-blue-500/10 text-blue-400 text-[10px] font-bold hover:bg-blue-500 hover:text-white transition-all"
                                            >
                                                OPEN FULL
                                            </a>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div className="p-6 bg-white/[0.01] border-t border-white/5 flex justify-end">
                            <button 
                                onClick={() => setShowCertificates(false)}
                                className="px-6 py-2.5 rounded-xl bg-white/5 text-gray-300 font-bold text-sm hover:bg-white/10 transition-all"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

/* ─── Main Component ─────────────────────────────────────────────────── */
const PatientAppointments = () => {
    const locationState = useLocation();
    const { user } = useAuth();
    const [appointments, setAppointments] = useState([]);
    const [doctors, setDoctors] = useState([]);
    const [patientOverview, setPatientOverview] = useState(null);
    const [loading, setLoading] = useState(true);
    const [bookingDoctor, setBookingDoctor] = useState(null);
    const [toast, setToast] = useState('');
    const [search, setSearch] = useState('');
    const [specFilter, setSpecFilter] = useState('All');
    const [tab, setTab] = useState('appointments'); // 'appointments' | 'book'
    const [ratingModal, setRatingModal] = useState({ open: false, appointmentId: null, rating: 5, review: '' });
    const [mobileStatusFilter, setMobileStatusFilter] = useState('All');

    useEffect(() => {
        if (locationState.state?.specialty) {
            setTab('book');
            setSpecFilter(locationState.state.specialty);
        }
    }, [locationState.state]);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [location, setLocation] = useState(null);
    const [isLocating, setIsLocating] = useState(false);
    const [selectedDate, setSelectedDate] = useState(null);

    const specializations = ['All', 'General Physician', 'Cardiologist', 'Dermatologist', 'Neurologist', 'Orthopedist', 'Pediatrician', 'Dentist'];

    const load = useCallback(async (params = {}) => {
        setLoading(true);
        try {
            const query = { page, limit: 100, ...params };
            if (location && !query.lat) {
                query.lat = location.lat;
                query.lng = location.lng;
                query.radius = 10000;
            }
            if (selectedDate) {
                const year = selectedDate.getFullYear();
                const month = String(selectedDate.getMonth() + 1).padStart(2, '0');
                const day = String(selectedDate.getDate()).padStart(2, '0');
                query.date = `${year}-${month}-${day}`;
            }

            const [overviewRes, apptRes, drRes] = await Promise.all([
                fetchOverview(),
                fetchPatientAppointments(),
                fetchDoctors(query)
            ]);
            if (overviewRes?.success) setPatientOverview(overviewRes.data);
            if (apptRes?.success) setAppointments(apptRes.data);
            if (drRes?.success) {
                const payload = drRes.data?.doctors ? drRes.data : { doctors: drRes.data, totalPages: 1, currentPage: 1 };
                setDoctors(payload.doctors || []);
                setTotalPages(payload.totalPages || 1);
            }
        } catch (err) {
            console.error('[PatientAppointments] load error:', err);
        } finally {
            setLoading(false);
        }
    }, [page, location, selectedDate]);

    useEffect(() => { load(); }, [load]);

    useEffect(() => {
        if (!user?.id) return;

        if (!socket.connected) socket.connect();
        socket.emit('join-room', user.id);

        const handleRefresh = () => {
            console.log('Refreshing appointments due to real-time update');
            load();
        };

        socket.on('appointment-updated', handleRefresh);
        socket.on('appointment-approved', handleRefresh);
        socket.on('appointment-reassigned', (data) => {
            showToast(data.message || 'Appointment reassigned');
            handleRefresh();
        });

        return () => {
            socket.off('appointment-updated', handleRefresh);
            socket.off('appointment-approved', handleRefresh);
            socket.off('appointment-reassigned', handleRefresh);
        };
    }, [user?.id, load]);

    const isAdmitted = patientOverview?.admission?.isAdmitted;

    const handleSelectDateFromCalendar = (date) => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        if (date < today) {
            showToast("Cannot book appointments for past dates.");
            return;
        }
        setSelectedDate(date);
        setTab('book');
        setSpecFilter('All');
    };

    const handleNearbySearch = () => {
        if (!navigator.geolocation) {
            showToast("Geolocation is not supported by your browser");
            return;
        }
        setIsLocating(true);
        navigator.geolocation.getCurrentPosition(
            (position) => {
                const { latitude, longitude } = position.coords;
                setLocation({ lat: latitude, lng: longitude });
                setIsLocating(false);
                showToast("Found doctors near you!");
            },
            (error) => {
                console.error(error);
                showToast("Unable to retrieve your location");
                setIsLocating(false);
            }
        );
    };

    const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 4000); };

    const statusCounts = useMemo(() => {
        const c = { All: appointments.length, pending: 0, approved: 0, completed: 0, cancelled: 0 };
        appointments.forEach(a => { if (c[a.status] !== undefined) c[a.status] += 1; });
        return c;
    }, [appointments]);

    const mobileFilteredAppointments = useMemo(() => {
        if (mobileStatusFilter === 'All') return appointments;
        return appointments.filter(a => a.status === mobileStatusFilter);
    }, [appointments, mobileStatusFilter]);

    const filteredDoctors = useMemo(() => {
        const term = search.toLowerCase();
        return doctors.filter(doc => {
            const matchSearch = doc.name.toLowerCase().includes(term) ||
                (doc.specialization || '').toLowerCase().includes(term);
            const matchSpec = specFilter === 'All' || doc.specialization === specFilter;
            return matchSearch && matchSpec;
        });
    }, [doctors, search, specFilter]);

    const onCancelAppointment = async (id) => {
        if (!window.confirm('Are you sure you want to cancel this appointment?')) return;
        try {
            const res = await cancelAppointment(id);
            if (res?.success) {
                showToast('❌ Appointment cancelled');
                load();
            } else {
                showToast(res?.message || 'Failed to cancel appointment');
            }
        } catch (e) {
            console.error('[PatientAppointments] cancel error:', e);
            showToast(e.response?.data?.message || 'Error cancelling appointment');
        }
    };

    const onRespondToReallocation = async (id, accept) => {
        try {
            const res = await respondToReallocation(id, { accept });
            if (res?.success) {
                showToast(accept ? '✅ Reallocation accepted' : '❌ Appointment cancelled');
                load();
            } else {
                showToast(res?.message || 'Action failed');
            }
        } catch (e) {
            console.error('[PatientAppointments] respond error:', e);
            showToast(e.response?.data?.message || 'Action failed');
        }
    };

    const onRespondToDelay = async (id, accept) => {
        try {
            const res = await respondToDelayRequest(id, { accept });
            if (res?.success) {
                showToast(accept ? '✅ New appointment time accepted' : '❌ Delay request declined; original time remains');
                load();
            } else {
                showToast(res?.message || 'Action failed');
            }
        } catch (e) {
            console.error('[PatientAppointments] respond delay error:', e);
            showToast(e.response?.data?.message || 'Action failed');
        }
    };

    const handleRateSubmit = async (e) => {
        e.preventDefault();
        try {
            const res = await rateAppointment(ratingModal.appointmentId, { rating: ratingModal.rating, review: ratingModal.review });
            if (res?.success) {
                showToast('✅ Thank you for your rating!');
                setRatingModal({ open: false, appointmentId: null, rating: 5, review: '' });
                load();
            } else {
                showToast(res?.message || 'Failed to submit rating');
            }
        } catch (error) {
            console.error(error);
            showToast(error.response?.data?.message || 'Failed to submit rating');
        }
    };

    if (loading) {
        return (
            <div className="space-y-6">
                <Skeleton height={28} width={180} />
                <div className="flex gap-3">
                    <Skeleton height={40} className="flex-1" />
                    <Skeleton height={40} width={160} />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {Array.from({ length: 6 }).map((_, i) => (
                        <div key={i} className="bg-[#111318] border border-white/[0.06] rounded-2xl p-5">
                            <Skeleton height={20} width={120} />
                            <Skeleton height={16} width={180} className="mt-2" />
                            <Skeleton height={36} className="mt-4" />
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-fadein">
            {/* Toast */}
            {toast && (
                <div className="fixed top-6 left-1/2 -translate-x-1/2 z-50 bg-emerald-500 text-black px-5 py-2.5 rounded-full font-bold shadow-xl text-sm flex items-center gap-2 animate-slide-down">
                    {toast}
                </div>
            )}

            {bookingDoctor ? (
                <BookingFullScreenView
                    doctor={bookingDoctor}
                    onClose={() => setBookingDoctor(null)}
                    onSuccess={(msg) => { 
                        showToast(msg); 
                        load(); 
                        setTab('appointments'); 
                        setSelectedDate(null);
                        setBookingDoctor(null);
                    }}
                    initialDate={selectedDate ? selectedDate.toISOString().split('T')[0] : null}
                    isAdmitted={isAdmitted}
                />
            ) : (
                <>
            <div className="hidden lg:block">
            {/* Header + Tab Toggle */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h2 className="text-2xl font-bold text-white">Appointments</h2>
                    <p className="text-gray-500 text-sm mt-1">Manage and book your medical appointments.</p>
                </div>
                <div className="flex bg-white/[0.04] border border-white/[0.06] rounded-xl p-1 gap-1">
                    {[{ id: 'appointments', label: 'My Appointments' }, { id: 'book', label: 'Book New' }].map(t => (
                        <button
                            key={t.id}
                            onClick={() => setTab(t.id)}
                            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${tab === t.id ? 'bg-blue-600 text-white shadow' : 'text-gray-400 hover:text-white'}`}
                        >
                            {t.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* ── TAB: MY APPOINTMENTS ── */}
            {tab === 'appointments' && (
                <>
{isAdmitted && (
                            <div className="rounded-3xl border border-red-500/20 bg-red-500/10 p-5 mb-6 text-sm text-red-100">
                                You are currently admitted to {patientOverview?.admission?.hospitalName || 'the hospital'}. Appointment booking is disabled while admitted. Please work with your ward care team for any specialist consults.
                            </div>
                        )}
                        <PatientCalendar 
                    onBookClick={() => setTab('book')} 
                    onSelectDate={handleSelectDateFromCalendar}
                    isAdmitted={isAdmitted}
                />
                
                <div className="bg-[#111318] border border-white/[0.06] rounded-2xl overflow-hidden mt-6">
                    {appointments.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-20 text-gray-600">
                            <CalendarClock size={48} className="mb-3 opacity-30" />
                            <p className="text-base font-medium">No appointments booked yet.</p>
                            <button onClick={() => setTab('book')} className="mt-4 px-4 py-2 bg-blue-600/20 text-blue-400 hover:bg-blue-600 hover:text-white rounded-xl text-sm font-semibold transition-colors">
                                Book Appointment
                            </button>
                        </div>
                    ) : (
                        <div className="divide-y divide-white/[0.04]">
                            {appointments.map((app) => (
                                <div key={app._id} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 sm:p-5 gap-4 hover:bg-white/[0.02] transition-colors">
                                    <div className="flex items-start gap-4">
                                        <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 font-bold text-sm shrink-0">
                                            {(app.doctorId?.name || 'D')[0]}
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <p className="font-semibold text-white text-sm">Dr. {app.doctorId?.name || 'Unknown'}</p>
                                            <p className="text-xs text-gray-500 mt-0.5">
                                                {app.date ? new Date(app.date).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) : '—'} · {app.time}
                                            </p>
                                            {app.isEmergency && app.emergencyReason ? (
                                                <div className="mt-2 p-2 bg-red-500/5 border border-red-500/10 rounded-xl flex flex-col gap-1">
                                                    <p className="text-[10px] font-black text-red-500/80 uppercase tracking-widest leading-none">Emergency Reason</p>
                                                    <p className="text-xs text-gray-400 italic leading-tight">
                                                        "{app.emergencyReason}"
                                                    </p>
                                                </div>
                                            ) : app.reason && (
                                                <p className="text-xs text-gray-600 mt-0.5 max-w-xs truncate">{app.reason}</p>
                                            )}

                                            {['pending', 'accepted'].includes(app.delayRequestStatus) && ['pending', 'approved'].includes(app.status) && !app.isEmergency && (
                                                <div className="mt-2 p-2 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-start gap-2 animate-in slide-in-from-top-1 duration-300">
                                                    <div className="w-7 h-7 rounded-lg bg-amber-500/10 flex items-center justify-center border border-amber-500/20 shrink-0">
                                                        <Clock size={14} className="text-amber-500 animate-pulse" />
                                                    </div>
                                                    <div>
                                                        <p className="text-xs font-black text-amber-500 uppercase tracking-widest leading-none">
                                                            {app.delayRequestStatus === 'pending' ? 'Doctor Delay Requested' : 'Doctor Delay Accepted'}
                                                        </p>
                                                        <p className="text-xs text-amber-200/70 mt-0.5 leading-tight italic">
                                                            "{app.delayReason || app.delayMessage || 'Doctor is running late'}"
                                                        </p>
                                                        {app.proposedTime && (
                                                            <p className="text-[11px] text-amber-300 mt-0.5 font-medium">
                                                                Proposed Time: <span className="text-white font-bold">{app.proposedTime}</span>
                                                            </p>
                                                        )}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3 shrink-0">
                                        <StatusBadge status={app.status} isEmergency={app.isEmergency && app.reallocationAccepted === 'accepted'} />
                                        
                                        {app.isEmergency && app.reallocationAccepted === 'pending' && app.allocatedBySystem ? (
                                            <div className="flex flex-col gap-2 bg-red-500/10 border border-red-500/20 p-2 rounded-xl w-full sm:w-auto">
                                                <p className="text-xs font-bold text-red-400 uppercase tracking-tight leading-tight">
                                                    Dr in emergency - allocated to Dr. {app.doctorId?.name}?
                                                </p>
                                                <div className="flex gap-1">
                                                    <button 
                                                        onClick={() => onRespondToReallocation(app._id, true)}
                                                        className="bg-emerald-600 hover:bg-emerald-500 text-white p-1.5 rounded-lg transition-colors flex-1 flex items-center justify-center"
                                                        title="Accept"
                                                    >
                                                        <CheckCircle size={14} />
                                                    </button>
                                                    <button 
                                                        onClick={() => onRespondToReallocation(app._id, false)}
                                                        className="bg-red-600 hover:bg-red-500 text-white p-1.5 rounded-lg transition-colors flex-1 flex items-center justify-center"
                                                        title="Reject & Cancel"
                                                    >
                                                        <XCircle size={14} />
                                                    </button>
                                                </div>
                                            </div>
                                        ) : app.delayRequestStatus === 'pending' && ['pending', 'approved'].includes(app.status) && !app.isEmergency ? (
                                            <div className="flex flex-col gap-2 bg-amber-500/10 border border-amber-500/20 p-2 rounded-xl w-full sm:w-auto">
                                                <p className="text-xs font-bold text-amber-400 uppercase tracking-tight leading-tight">
                                                    Delay to {app.proposedTime || 'new time'}: Accept?
                                                </p>
                                                <div className="flex gap-1">
                                                    <button 
                                                        onClick={() => onRespondToDelay(app._id, true)}
                                                        className="bg-emerald-600 hover:bg-emerald-500 text-white p-1.5 rounded-lg transition-colors flex-1 flex items-center justify-center"
                                                        title="Accept New Time"
                                                    >
                                                        <CheckCircle size={14} />
                                                    </button>
                                                    <button 
                                                        onClick={() => onRespondToDelay(app._id, false)}
                                                        className="bg-red-600 hover:bg-red-500 text-white p-1.5 rounded-lg transition-colors flex-1 flex items-center justify-center"
                                                        title="Decline Delay"
                                                    >
                                                        <XCircle size={14} />
                                                    </button>
                                                </div>
                                            </div>
                                        ) : (
                                            <>
                                                {['pending', 'approved'].includes(app.status) && (
                                                    <button
                                                        onClick={() => onCancelAppointment(app._id)}
                                                        className="px-3 py-1.5 rounded-lg border border-white/10 text-gray-400 hover:text-white hover:bg-white/[0.06] text-[12px] font-semibold whitespace-nowrap"
                                                    >
                                                        Cancel
                                                    </button>
                                                )}
                                                {app.status === 'completed' && !app.rating && (
                                                    <button
                                                        onClick={() => setRatingModal({ open: true, appointmentId: app._id, rating: 5, review: '' })}
                                                        className="px-3 py-1.5 rounded-lg bg-amber-500/20 text-amber-400 border border-amber-500/30 hover:bg-amber-500 hover:text-white text-[12px] font-bold flex items-center gap-1.5 transition-colors whitespace-nowrap"
                                                    >
                                                        <Star size={12} fill="currentColor" /> Rate
                                                    </button>
                                                )}
                                                {app.status === 'completed' && app.rating && (
                                                    <div className="flex items-center gap-1 bg-white/[0.04] px-2 py-1 rounded-lg border border-white/[0.05]">
                                                        <span className="text-amber-400 font-bold text-xs">{app.rating}</span>
                                                        <Star size={10} className="text-amber-400" fill="currentColor" />
                                                    </div>
                                                )}
                                            </>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
                </>
            )}

            {/* ── TAB: BOOK NEW ── */}
            {tab === 'book' && (
                <div className="space-y-5">
                    {/* Search / Filter Bar */}
                    <div className="flex flex-col sm:flex-row gap-3">
                        <div className="relative flex-1">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
                            <input
                                type="text"
                                placeholder="Search by name or specialization..."
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                className="w-full bg-[#111318] border border-white/[0.06] rounded-xl pl-12 pr-4 py-2.5 text-white text-sm placeholder:text-gray-600 focus:outline-none focus:border-blue-500/50 transition-colors"
                            />
                        </div>
                        {selectedDate && (
                            <div className="flex items-center bg-blue-500/10 border border-blue-500/30 text-blue-400 px-4 py-2.5 rounded-xl text-sm font-semibold gap-2">
                                <CalendarClock size={16} />
                                <span>{selectedDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                                <button 
                                    onClick={() => setSelectedDate(null)} 
                                    className="ml-2 hover:bg-blue-500/20 p-1 rounded-full transition-colors"
                                    title="Clear Date Filter"
                                >
                                    <X size={14} />
                                </button>
                            </div>
                        )}
                        <select
                            value={specFilter}
                            onChange={e => setSpecFilter(e.target.value)}
                            className="bg-[#111318] border border-white/[0.06] rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500/50 transition-colors appearance-none cursor-pointer"
                        >
                            {specializations.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                        <button
                            onClick={handleNearbySearch}
                            disabled={isLocating}
                            className={`px-4 py-2.5 rounded-xl border flex items-center gap-2 text-sm font-semibold transition-colors ${location ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-[#111318] border-white/[0.06] text-gray-400 hover:text-white'}`}
                        >
                            {isLocating ? <Loader2 size={16} className="animate-spin" /> : <MapPin size={16} />}
                            {location ? 'Nearby Active' : 'Find Nearby'}
                        </button>
                    </div>

                    {/* Doctor Cards Grid */}
                    {filteredDoctors.length === 0 ? (
                        <div className="text-center py-20 text-gray-600">
                            <p className="text-base font-medium">No doctors found matching your search.</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-5">
                            {filteredDoctors.map(dr => (
                                <div key={dr._id} className="group/card bg-[#111318]/40 backdrop-blur-xl border border-white/[0.05] rounded-[24px] p-4 flex flex-col justify-between hover:border-blue-500/30 hover:bg-[#111318]/60 hover:shadow-[0_20px_50px_rgba(0,0,0,0.4)] transition-all duration-500 relative overflow-hidden">
                                    {/* Subtle Gradient Glow */}
                                    <div className="absolute -top-20 -right-20 w-40 h-40 bg-blue-600/5 rounded-full blur-[50px] group-hover/card:bg-blue-600/10 transition-all duration-700" />
                                    
                                    <div className="relative z-10 flex flex-col gap-4">
                                        {/* Profile Image - More compact for 4-column layout */}
                                        <div className="relative w-20 h-20 sm:w-24 sm:h-24 shrink-0 mx-auto rounded-full overflow-hidden bg-[#0b101e] border-2 border-white/5 flex items-center justify-center shadow-xl group-hover/card:border-blue-500/40 transition-all duration-500">
                                            {dr.profileImage ? (
                                                <img 
                                                    src={`${getBaseUrl()}/${dr.profileImage}`} 
                                                    alt={dr.name} 
                                                    className="w-full h-full object-cover group-hover/card:scale-110 transition-transform duration-700"
                                                    onError={(e) => { e.target.src = 'https://via.placeholder.com/150?text=Doc'; }}
                                                />
                                            ) : (
                                                <div className="w-full h-full bg-gradient-to-br from-blue-900/20 to-indigo-900/20 flex items-center justify-center">
                                                    <User size={32} className="text-blue-400/40 sm:size-40" />
                                                </div>
                                            )}
                                        </div>

                                        {/* Info Section - Tighter spacing */}
                                        <div className="flex-1 flex flex-col min-w-0 text-center">
                                            <div className="min-w-0">
                                                <h4 className="font-bold text-white text-base sm:text-lg tracking-tight leading-tight truncate">Dr. {dr.name}</h4>
                                                <div className="flex flex-wrap items-center justify-center gap-1.5 mt-2">
                                                    <span className="px-2 py-0.5 rounded-md bg-blue-500/10 text-blue-400 text-xs font-bold uppercase tracking-wider border border-blue-500/10">
                                                        {dr.specialization || 'General Physician'}
                                                    </span>
                                                    <span className="px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 text-xs font-bold uppercase tracking-wider border border-emerald-500/10">
                                                        {dr.experience || '5+'}Y Exp
                                                    </span>
                                                </div>
                                            </div>

                                            <div className="flex items-center justify-center gap-1.5 mt-3 text-gray-500 group/loc">
                                                <MapPin size={10} className="flex-shrink-0 text-blue-500/50" />
                                                <span className="text-xs sm:text-[11px] font-medium leading-tight truncate">
                                                    {dr.hospitalName || 'Medicare Center'}
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="mt-5">
                                        <button
                                            onClick={() => {
                                                if (!isAdmitted) {
                                                    const year = selectedDate ? selectedDate.getFullYear() : null;
                                                    const month = selectedDate ? String(selectedDate.getMonth() + 1).padStart(2, '0') : null;
                                                    const day = selectedDate ? String(selectedDate.getDate()).padStart(2, '0') : null;
                                                    const dateStr = selectedDate ? `${year}-${month}-${day}` : null;
                                                    setBookingDoctor(dr);
                                                    if (dateStr) setSelectedDate(new Date(dateStr));
                                                }
                                            }}
                                            disabled={isAdmitted}
                                            className={`w-full py-2.5 rounded-xl text-xs sm:text-[11px] font-bold uppercase tracking-wider shadow-lg active:scale-[0.98] transition-all relative overflow-hidden group/btn ${isAdmitted ? 'bg-gray-600/50 text-gray-400 cursor-not-allowed border border-white/5' : 'bg-blue-600 hover:bg-blue-500 text-white shadow-blue-900/10'}`}
                                        >
                                            <div className="absolute inset-0 bg-white/10 translate-x-[-100%] group-hover/btn:translate-x-[100%] transition-transform duration-1000" />
                                            <span className="relative z-10 flex items-center justify-center gap-2">
                                                Book Now
                                                <CalendarPlus size={14} className="group-hover/btn:rotate-12 transition-transform" />
                                            </span>
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                    {/* Pagination */}
                    <div className="flex items-center justify-center gap-2 mt-4">
                        <button
                            disabled={page <= 1}
                            onClick={() => setPage(p => Math.max(p - 1, 1))}
                            className="px-3 py-1.5 rounded-lg border border-white/10 text-gray-400 hover:text-white hover:bg-white/[0.06] disabled:opacity-50"
                        >
                            Previous
                        </button>
                        {Array.from({ length: totalPages }).map((_, idx) => {
                            const p = idx + 1;
                            const active = p === page;
                            return (
                                <button
                                    key={p}
                                    onClick={() => setPage(p)}
                                    className={`px-3 py-1.5 rounded-lg text-sm ${active ? 'bg-blue-600 text-white' : 'border border-white/10 text-gray-400 hover:text-white hover:bg-white/[0.06]'}`}
                                >
                                    {p}
                                </button>
                            );
                        })}
                        <button
                            disabled={page >= totalPages}
                            onClick={() => setPage(p => Math.min(p + 1, totalPages))}
                            className="px-3 py-1.5 rounded-lg border border-white/10 text-gray-400 hover:text-white hover:bg-white/[0.06] disabled:opacity-50"
                        >
                            Next
                        </button>
                    </div>
                </div>
            )}
            </div>

            {/* ═══════════════════════════════════════
                MOBILE-ONLY APPOINTMENTS UI (< lg)
                ═══════════════════════════════════════ */}
            <div className="lg:hidden animate-mobile-fadein">
                {/* Sticky Mobile Hero Header */}
                <div className="sticky top-0 z-30 -mx-3 sm:-mx-5 px-3 sm:px-5 pb-3 pt-1 bg-gradient-to-b from-[#0a0a0a] via-[#0a0a0a]/95 to-transparent backdrop-blur">
                    <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0 flex-1">
                            <h1 className="text-[22px] font-extrabold tracking-tight text-white leading-tight">Appointments</h1>
                            <p className="text-[11px] text-gray-500 mt-0.5 font-medium">
                                {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
                            </p>
                        </div>
                        <button
                            onClick={() => { if (!isAdmitted) setTab(tab === 'appointments' ? 'book' : 'appointments'); }}
                            disabled={isAdmitted}
                            className={`relative shrink-0 w-11 h-11 rounded-2xl flex items-center justify-center transition-all duration-300 active:scale-[0.93] ${tab === 'appointments' && !isAdmitted
                                ? 'bg-blue-600 text-white shadow-[0_8px_24px_-6px_rgba(37,99,235,0.7)]'
                                : 'bg-[#111318] text-gray-400 border border-white/[0.06] hover:text-white'
                            } ${isAdmitted ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                            {tab === 'appointments' ? <CalendarPlus size={20} strokeWidth={2.3} /> : <X size={20} strokeWidth={2.3} />}
                        </button>
                    </div>

                    {/* Hero Stat Card - only on appointments tab */}
                    {tab === 'appointments' && (
                        <div className="relative overflow-hidden mt-3 rounded-[22px] bg-gradient-to-br from-blue-600 via-indigo-600 to-violet-700 p-[1px] shadow-[0_20px_60px_-20px_rgba(79,70,229,0.6)]">
                            <div className="relative rounded-[21px] bg-[#0d0f1a] px-4 py-3.5">
                                <div className="absolute -top-10 -right-10 w-32 h-32 rounded-full bg-blue-500/20 blur-2xl" />
                                <div className="absolute -bottom-12 -left-6 w-24 h-24 rounded-full bg-violet-500/20 blur-2xl" />
                                <div className="relative flex items-center justify-between gap-3">
                                    <div className="flex items-center gap-3 min-w-0">
                                        <div className="w-11 h-11 rounded-xl bg-white/[0.07] border border-white/[0.08] flex items-center justify-center shrink-0">
                                            <CalendarClock size={22} className="text-indigo-300" />
                                        </div>
                                        <div className="min-w-0">
                                            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-indigo-300/80 leading-none">Total Visits</p>
                                            <div className="flex items-baseline gap-1.5 mt-1">
                                                <span className="text-2xl font-extrabold text-white leading-none tracking-tight">{statusCounts.All}</span>
                                                {statusCounts.approved > 0 && (
                                                    <span className="text-[10px] font-bold text-emerald-300 bg-emerald-400/15 px-1.5 py-0.5 rounded-full border border-emerald-400/20">
                                                        {statusCounts.approved} upcoming
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex flex-col items-end gap-1">
                                        {statusCounts.pending > 0 && (
                                            <div className="flex items-center gap-1 text-[10px] font-bold text-amber-300 bg-amber-400/10 px-2 py-0.5 rounded-full border border-amber-400/20">
                                                <div className="w-1.5 h-1.5 rounded-full bg-amber-300 animate-pulse" />
                                                {statusCounts.pending} Pending
                                            </div>
                                        )}
                                        {statusCounts.completed > 0 && (
                                            <span className="text-[10px] font-bold text-blue-300 bg-blue-400/10 px-2 py-0.5 rounded-full border border-blue-400/20">
                                                {statusCounts.completed} Completed
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Tab Content */}
                <div className="mt-3 space-y-4">
                    {tab === 'appointments' ? (
                        <div className="animate-mobile-fadein">
                            {/* Admission notice */}
                            {isAdmitted && (
                                <div className="rounded-2xl border border-red-500/20 bg-red-500/[0.08] p-4 text-[12px] text-red-200/90 leading-relaxed shadow-[0_10px_30px_-15px_rgba(239,68,68,0.4)]">
                                    <div className="flex items-start gap-2">
                                        <Activity size={16} className="text-red-400 mt-0.5 shrink-0" />
                                        <div>
                                            <p className="font-bold text-red-300 text-[11px] uppercase tracking-wider mb-0.5">Currently Admitted</p>
                                            Booking disabled. Consult your ward care team for specialist appointments at {patientOverview?.admission?.hospitalName || 'the hospital'}.
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Status Filter Chips */}
                            <div className="flex gap-2 overflow-x-auto -mx-3 sm:-mx-5 px-3 sm:px-5 py-1 [&::-webkit-scrollbar]:hidden scrollbar-none snap-x snap-mandatory">
                                {[
                                    { id: 'All', label: 'All', accent: 'from-blue-500 to-indigo-600' },
                                    { id: 'pending', label: 'Pending', accent: 'from-amber-500 to-orange-500' },
                                    { id: 'approved', label: 'Upcoming', accent: 'from-emerald-500 to-teal-500' },
                                    { id: 'completed', label: 'Done', accent: 'from-sky-500 to-blue-500' },
                                    { id: 'cancelled', label: 'Cancelled', accent: 'from-rose-500 to-red-500' },
                                ].map((s) => {
                                    const active = mobileStatusFilter === s.id;
                                    const count = statusCounts[s.id] ?? 0;
                                    return (
                                        <button
                                            key={s.id}
                                            onClick={() => setMobileStatusFilter(s.id)}
                                            className={`snap-start shrink-0 relative overflow-hidden px-3.5 py-2 rounded-full text-[11px] font-extrabold tracking-wide transition-all duration-300 flex items-center gap-1.5 ${active
                                                ? 'text-white shadow-[0_6px_20px_-6px_rgba(37,99,235,0.5)]'
                                                : 'bg-[#111318] text-gray-400 border border-white/[0.06] hover:text-white hover:border-white/[0.1]'
                                            }`}
                                        >
                                            {active && <div className={`absolute inset-0 bg-gradient-to-r ${s.accent}`} />}
                                            <span className="relative">{s.label}</span>
                                            <span className={`relative text-[10px] font-black rounded-full px-1.5 py-0.5 min-w-[18px] text-center ${active ? 'bg-white/20 text-white' : 'bg-white/[0.05] text-gray-500'}`}>
                                                {count}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>

                            {/* Appointment Cards */}
                            <div className="space-y-3">
                                {mobileFilteredAppointments.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center py-16 text-center px-4">
                                        <div className="relative w-24 h-24 mb-4">
                                            <div className="absolute inset-0 rounded-full bg-blue-500/5 blur-2xl" />
                                            <div className="relative w-24 h-24 rounded-full bg-[#111318] border border-white/[0.06] flex items-center justify-center">
                                                <CalendarClock size={38} className="text-gray-600" strokeWidth={1.5} />
                                            </div>
                                        </div>
                                        <p className="text-sm font-bold text-gray-300">No {mobileStatusFilter === 'All' ? '' : mobileStatusFilter} appointments</p>
                                        <p className="text-[12px] text-gray-600 mt-1 max-w-[240px]">
                                            {mobileStatusFilter === 'All' ? 'Schedule your first consultation with a doctor.' : 'Switch filters to see other appointments.'}
                                        </p>
                                        {mobileStatusFilter === 'All' && !isAdmitted && (
                                            <button
                                                onClick={() => setTab('book')}
                                                className="mt-5 px-5 py-2.5 bg-blue-600 text-white rounded-2xl text-[12px] font-bold shadow-[0_10px_28px_-10px_rgba(37,99,235,0.8)] active:scale-[0.97] transition-transform"
                                            >
                                                Book Appointment
                                            </button>
                                        )}
                                    </div>
                                ) : (
                                    mobileFilteredAppointments.map((app, idx) => {
                                        const isEmergent = app.isEmergency && app.reallocationAccepted === 'accepted';
                                        const d = app.date ? new Date(app.date) : null;
                                        const dayName = d?.toLocaleDateString('en-US', { weekday: 'short' }) || '—';
                                        const dayNum = d ? String(d.getDate()).padStart(2, '0') : '—';
                                        const monthShort = d?.toLocaleDateString('en-US', { month: 'short' }) || '';
                                        return (
                                            <div
                                                key={app._id}
                                                className={`group relative rounded-[20px] p-[1px] overflow-hidden transition-all duration-300 hover:-translate-y-0.5 animate-mobile-card-in ${isEmergent
                                                    ? 'bg-gradient-to-br from-red-500/50 via-red-500/20 to-transparent shadow-[0_10px_40px_-18px_rgba(239,68,68,0.55)]'
                                                    : app.status === 'approved'
                                                        ? 'bg-gradient-to-br from-emerald-500/25 via-emerald-500/10 to-transparent shadow-[0_10px_34px_-20px_rgba(16,185,129,0.35)]'
                                                        : app.status === 'completed'
                                                            ? 'bg-gradient-to-br from-sky-500/25 via-sky-500/10 to-transparent shadow-[0_10px_34px_-20px_rgba(14,165,233,0.3)]'
                                                            : 'bg-white/[0.05] shadow-[0_10px_34px_-22px_rgba(0,0,0,0.6)]'
                                                }`}
                                                style={{ animationDelay: `${Math.min(idx, 8) * 45}ms` }}
                                            >
                                                <div className={`relative rounded-[19px] p-4 ${isEmergent ? 'bg-[#140a0a]' : 'bg-[#111318]'}`}>
                                                    {/* Top row: Date Pill + Status + Emergency */}
                                                    <div className="flex items-start justify-between gap-3 mb-3.5">
                                                        {/* Compact Date Block */}
                                                        <div className={`w-[54px] shrink-0 rounded-2xl p-1.5 flex flex-col items-center border ${app.status === 'completed'
                                                            ? 'bg-sky-500/10 border-sky-500/15'
                                                            : isEmergent
                                                                ? 'bg-red-500/10 border-red-500/20'
                                                                : app.status === 'approved'
                                                                    ? 'bg-emerald-500/10 border-emerald-500/20'
                                                                    : 'bg-white/[0.03] border-white/[0.06]'
                                                        }`}>
                                                            <span className={`text-[9px] font-black uppercase tracking-wider leading-none ${app.status === 'completed'
                                                                ? 'text-sky-400'
                                                                : isEmergent ? 'text-red-400' : app.status === 'approved' ? 'text-emerald-400' : 'text-gray-500'
                                                            }`}>
                                                                {dayName}
                                                            </span>
                                                            <span className="text-[18px] font-extrabold text-white leading-none mt-1 tracking-tight">
                                                                {dayNum}
                                                            </span>
                                                            <span className="text-[9px] font-bold text-gray-500 uppercase leading-none mt-1">{monthShort}</span>
                                                        </div>

                                                        {/* Status + Time column */}
                                                        <div className="flex-1 flex flex-col items-end gap-2 min-w-0">
                                                            <StatusBadge status={app.status} isEmergency={isEmergent} />
                                                            <div className={`flex items-center gap-1.5 px-2 py-1 rounded-xl text-[10px] font-bold border ${app.status === 'completed'
                                                                ? 'bg-gray-500/10 text-gray-400 border-gray-500/10'
                                                                : isEmergent
                                                                    ? 'bg-red-500/10 text-red-300 border-red-500/20'
                                                                    : 'bg-white/[0.03] text-gray-300 border-white/[0.05]'
                                                            }`}>
                                                                <Clock size={11} className="shrink-0" strokeWidth={2.2} />
                                                                <span className="font-mono tracking-tight">{app.time || '—'}</span>
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* Doctor Info Row */}
                                                    <div className="flex items-center gap-3 pt-3 border-t border-white/[0.04]">
                                                        <div className={`w-11 h-11 rounded-2xl flex items-center justify-center text-white font-extrabold text-[13px] shrink-0 border ${app.doctorId?.specialization?.includes('Cardio')
                                                            ? 'bg-gradient-to-br from-rose-500/30 to-red-500/30 border-rose-500/20 text-rose-200'
                                                            : app.doctorId?.specialization?.includes('Neuro')
                                                                ? 'bg-gradient-to-br from-violet-500/30 to-indigo-500/30 border-violet-500/20 text-violet-200'
                                                                : app.doctorId?.specialization?.includes('Pediatric')
                                                                    ? 'bg-gradient-to-br from-amber-500/30 to-orange-500/30 border-amber-500/20 text-amber-200'
                                                                    : 'bg-gradient-to-br from-blue-500/30 to-sky-500/30 border-blue-500/20 text-blue-200'
                                                        }`}>
                                                            {(app.doctorId?.name || 'D')[0]}
                                                        </div>
                                                        <div className="min-w-0 flex-1">
                                                            <p className="text-[13px] font-bold text-white truncate leading-tight">
                                                                Dr. {app.doctorId?.name || 'Unknown'}
                                                            </p>
                                                            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                                                                <span className="text-[10px] font-bold text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded-md border border-blue-500/10 uppercase tracking-wider">
                                                                    {app.doctorId?.specialization || 'Physician'}
                                                                </span>
                                                            </div>
                                                            {app.doctorId?.hospitalName && (
                                                                <p className="text-[10px] text-gray-500 mt-1 truncate flex items-center gap-1">
                                                                    <MapPin size={10} className="shrink-0" />
                                                                    {app.doctorId.hospitalName}
                                                                </p>
                                                            )}
                                                        </div>
                                                    </div>

                                                    {/* Reason / Emergency reason / Delay */}
                                                    {app.isEmergency && app.emergencyReason ? (
                                                        <div className="mt-3 p-2.5 bg-red-500/[0.07] border border-red-500/15 rounded-xl flex flex-col gap-1">
                                                            <p className="text-[9px] font-black text-red-400/80 uppercase tracking-[0.15em] leading-none flex items-center gap-1">
                                                                <Activity size={10} /> Emergency Reason
                                                            </p>
                                                            <p className="text-[11px] text-gray-300/90 italic leading-snug">"{app.emergencyReason}"</p>
                                                        </div>
                                                    ) : app.reason ? (
                                                        <p className="mt-2.5 text-[11px] text-gray-500 truncate pl-1">{app.reason}</p>
                                                    ) : null}

                                                    {['pending', 'accepted'].includes(app.delayRequestStatus) && ['pending', 'approved'].includes(app.status) && !app.isEmergency && (
                                                        <div className="mt-3 p-2.5 bg-amber-500/[0.08] border border-amber-500/20 rounded-xl flex items-start gap-2">
                                                            <div className="w-6 h-6 rounded-lg bg-amber-500/15 flex items-center justify-center shrink-0 border border-amber-500/20">
                                                                <Clock size={11} className="text-amber-400 animate-pulse" />
                                                            </div>
                                                            <div className="min-w-0">
                                                                <p className="text-[9px] font-black text-amber-400 uppercase tracking-[0.14em] leading-none">
                                                                    {app.delayRequestStatus === 'pending' ? 'Delay Requested' : 'Delay Accepted'}
                                                                </p>
                                                                <p className="text-[11px] text-amber-200/70 mt-0.5 leading-snug italic truncate">
                                                                    "{app.delayReason || app.delayMessage || 'Doctor is running late'}"
                                                                </p>
                                                                {app.proposedTime && (
                                                                    <p className="text-[10px] text-amber-300 mt-0.5 font-medium">
                                                                        Proposed Time: <span className="text-white font-bold">{app.proposedTime}</span>
                                                                    </p>
                                                                )}
                                                            </div>
                                                        </div>
                                                    )}

                                                    {/* Emergency Reallocation */}
                                                    {app.isEmergency && app.reallocationAccepted === 'pending' && app.allocatedBySystem ? (
                                                        <div className="mt-3 p-3 bg-red-500/[0.08] border border-red-500/20 rounded-xl flex flex-col gap-2">
                                                            <p className="text-[11px] font-bold text-red-300 leading-snug">
                                                                Reallocation: Dr in emergency → switch to <span className="underline decoration-red-400/50 underline-offset-2">Dr. {app.doctorId?.name}</span>?
                                                            </p>
                                                            <div className="flex gap-2">
                                                                <button
                                                                    onClick={() => onRespondToReallocation(app._id, true)}
                                                                    className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white py-2 rounded-xl text-[11px] font-bold active:scale-[0.97] transition-transform flex items-center justify-center gap-1"
                                                                >
                                                                    <CheckCircle size={13} /> Accept
                                                                </button>
                                                                <button
                                                                    onClick={() => onRespondToReallocation(app._id, false)}
                                                                    className="flex-1 bg-red-600 hover:bg-red-500 text-white py-2 rounded-xl text-[11px] font-bold active:scale-[0.97] transition-transform flex items-center justify-center gap-1"
                                                                >
                                                                    <XCircle size={13} /> Decline
                                                                </button>
                                                            </div>
                                                        </div>
                                                    ) : app.delayRequestStatus === 'pending' && ['pending', 'approved'].includes(app.status) && !app.isEmergency ? (
                                                        <div className="mt-3 p-3 bg-amber-500/[0.08] border border-amber-500/20 rounded-xl flex flex-col gap-2">
                                                            <p className="text-[11px] font-bold text-amber-300 leading-snug">
                                                                Delay Request: Proposed new time is <span className="font-bold text-white">{app.proposedTime}</span>. Accept new time?
                                                            </p>
                                                            <div className="flex gap-2">
                                                                <button
                                                                    onClick={() => onRespondToDelay(app._id, true)}
                                                                    className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white py-2 rounded-xl text-[11px] font-bold active:scale-[0.97] transition-transform flex items-center justify-center gap-1"
                                                                >
                                                                    <CheckCircle size={13} /> Accept
                                                                </button>
                                                                <button
                                                                    onClick={() => onRespondToDelay(app._id, false)}
                                                                    className="flex-1 bg-red-600 hover:bg-red-500 text-white py-2 rounded-xl text-[11px] font-bold active:scale-[0.97] transition-transform flex items-center justify-center gap-1"
                                                                >
                                                                    <XCircle size={13} /> Decline
                                                                </button>
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <div className="mt-3 flex flex-wrap gap-2">
                                                            {['pending', 'approved'].includes(app.status) && (
                                                                <button
                                                                    onClick={() => onCancelAppointment(app._id)}
                                                                    className="px-3.5 py-2 rounded-xl bg-white/[0.03] border border-white/[0.07] text-gray-400 hover:text-white hover:bg-white/[0.07] text-[11px] font-bold transition-all active:scale-[0.97] flex items-center gap-1.5"
                                                                >
                                                                    <XCircle size={12} /> Cancel
                                                                </button>
                                                            )}
                                                            {app.status === 'completed' && !app.rating && (
                                                                <button
                                                                    onClick={() => setRatingModal({ open: true, appointmentId: app._id, rating: 5, review: '' })}
                                                                    className="px-3.5 py-2 rounded-xl bg-amber-500/15 border border-amber-500/25 text-amber-300 hover:bg-amber-500 hover:text-white hover:border-amber-400 text-[11px] font-bold transition-all active:scale-[0.97] flex items-center gap-1.5 shadow-[0_6px_18px_-10px_rgba(245,158,11,0.5)]"
                                                                >
                                                                    <Star size={12} fill="currentColor" /> Rate Visit
                                                                </button>
                                                            )}
                                                            {app.status === 'completed' && app.rating && (
                                                                <div className="flex items-center gap-1.5 bg-white/[0.04] px-3 py-1.5 rounded-xl border border-white/[0.05]">
                                                                    <Star size={11} className="text-amber-400" fill="currentColor" />
                                                                    <span className="text-[11px] font-bold text-amber-300">{app.rating}/5</span>
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        </div>
                    ) : (
                        /* ─── Mobile: Book New Tab ─── */
                        <div className="animate-mobile-fadein">
                            {/* Search */}
                            <div className="relative">
                                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
                                <input
                                    type="text"
                                    placeholder="Search doctors, specializations..."
                                    value={search}
                                    onChange={e => setSearch(e.target.value)}
                                    className="w-full bg-[#111318] border border-white/[0.06] rounded-2xl pl-11 pr-4 py-3 text-white text-[13px] placeholder:text-gray-600 focus:outline-none focus:border-blue-500/40 transition-all shadow-[0_8px_24px_-18px_rgba(0,0,0,0.6)]"
                                />
                            </div>

                            {/* Location + Spec pills */}
                            <div className="flex gap-2 overflow-x-auto -mx-3 sm:-mx-5 px-3 sm:px-5 py-0.5 [&::-webkit-scrollbar]:hidden snap-x snap-mandatory">
                                {specializations.slice(0, 14).map(s => (
                                    <button
                                        key={s}
                                        onClick={() => setSpecFilter(specFilter === s ? 'All' : s)}
                                        className={`snap-start shrink-0 px-3.5 py-1.5 rounded-full text-[11px] font-bold transition-all duration-200 whitespace-nowrap ${specFilter === s
                                            ? 'bg-blue-600 text-white shadow-[0_6px_18px_-6px_rgba(37,99,235,0.6)]'
                                            : 'bg-[#111318] text-gray-400 border border-white/[0.06] hover:text-white'
                                        }`}
                                    >
                                        {s}
                                    </button>
                                ))}
                            </div>

                            {/* Selected date + Nearby toggle */}
                            <div className="flex gap-2 items-center flex-wrap">
                                {selectedDate && (
                                    <div className="flex items-center bg-blue-500/10 border border-blue-500/25 text-blue-300 pl-3 pr-2 py-1.5 rounded-full text-[11px] font-bold gap-1.5">
                                        <CalendarClock size={12} />
                                        <span>{selectedDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                                        <button
                                            onClick={() => setSelectedDate(null)}
                                            className="ml-0.5 hover:bg-blue-500/20 w-5 h-5 rounded-full flex items-center justify-center transition-colors"
                                        >
                                            <X size={11} />
                                        </button>
                                    </div>
                                )}
                                <button
                                    onClick={handleNearbySearch}
                                    disabled={isLocating}
                                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold transition-all active:scale-[0.96] ${location
                                        ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-300'
                                        : 'bg-[#111318] border border-white/[0.06] text-gray-400 hover:text-white'
                                    }`}
                                >
                                    {isLocating ? <Loader2 size={12} className="animate-spin" /> : <MapPin size={12} />}
                                    {location ? 'Nearby On' : 'Find Nearby'}
                                </button>
                                {selectedDate && (
                                    <button
                                        onClick={() => { setSelectedDate(null); setSpecFilter('All'); setSearch(''); }}
                                        className="ml-auto text-[11px] text-gray-500 hover:text-white font-bold px-2 py-1 transition-colors"
                                    >
                                        Reset
                                    </button>
                                )}
                            </div>

                            {/* Doctor Cards List (mobile) */}
                            <div className="space-y-3">
                                {filteredDoctors.length === 0 ? (
                                    <div className="py-16 text-center">
                                        <Search size={40} className="mx-auto text-gray-600 opacity-60 mb-3" strokeWidth={1.5} />
                                        <p className="text-[13px] font-bold text-gray-300">No doctors found</p>
                                        <p className="text-[11px] text-gray-600 mt-1">Try adjusting filters or search terms.</p>
                                    </div>
                                ) : (
                                    filteredDoctors.slice(0, page * 6).map((dr, idx) => (
                                        <div
                                            key={dr._id}
                                            className="group relative rounded-[20px] p-[1px] bg-gradient-to-br from-white/[0.08] via-white/[0.02] to-transparent shadow-[0_14px_40px_-24px_rgba(0,0,0,0.7)] transition-all duration-300 hover:-translate-y-0.5 animate-mobile-card-in overflow-hidden"
                                            style={{ animationDelay: `${Math.min(idx, 10) * 40}ms` }}
                                        >
                                            <div className="absolute -top-16 -right-10 w-32 h-32 rounded-full bg-blue-500/5 blur-2xl group-hover:bg-blue-500/10 transition-all duration-500" />
                                            <div className="relative rounded-[19px] bg-[#111318] p-4">
                                                <div className="flex items-start gap-3">
                                                    {/* Avatar */}
                                                    <div className="relative w-16 h-16 shrink-0">
                                                        <div className={`absolute inset-0 rounded-2xl ${dr.specialization?.includes('Cardio')
                                                            ? 'bg-gradient-to-br from-rose-500/25 to-red-500/20'
                                                            : dr.specialization?.includes('Neuro')
                                                                ? 'bg-gradient-to-br from-violet-500/25 to-indigo-500/20'
                                                                : 'bg-gradient-to-br from-blue-500/25 to-sky-500/20'
                                                        } blur-sm`} />
                                                        <div className="relative w-16 h-16 rounded-2xl overflow-hidden border border-white/[0.08] bg-[#0b101e] flex items-center justify-center group-hover:border-blue-500/30 transition-all duration-300">
                                                            {dr.profileImage ? (
                                                                <img
                                                                    src={`${getBaseUrl()}/${dr.profileImage}`}
                                                                    alt={dr.name}
                                                                    className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                                                                    onError={(e) => { e.target.style.display = 'none'; }}
                                                                />
                                                            ) : (
                                                                <User size={26} className="text-blue-400/60" />
                                                            )}
                                                        </div>
                                                    </div>

                                                    {/* Info */}
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-[14px] font-extrabold text-white leading-tight tracking-tight">Dr. {dr.name}</p>
                                                        <div className="flex flex-wrap gap-1 mt-1.5">
                                                            <span className="px-2 py-0.5 rounded-lg bg-blue-500/10 text-blue-300 text-[10px] font-black uppercase tracking-wider border border-blue-500/10">
                                                                {dr.specialization || 'Physician'}
                                                            </span>
                                                            <span className="px-2 py-0.5 rounded-lg bg-emerald-500/10 text-emerald-300 text-[10px] font-black uppercase tracking-wider border border-emerald-500/10">
                                                                {dr.experience || '5+'}Y
                                                            </span>
                                                            <div className="flex items-center gap-0.5 px-2 py-0.5 rounded-lg bg-amber-500/10 border border-amber-500/10">
                                                                <Star size={10} className="text-amber-400 shrink-0" fill="currentColor" />
                                                                <span className="text-[10px] font-black text-amber-300">{(dr.rating || 4.8).toFixed(1)}</span>
                                                            </div>
                                                        </div>
                                                        <div className="flex items-start gap-1 mt-1.5 text-gray-500">
                                                            <MapPin size={11} className="mt-0.5 shrink-0 text-blue-500/60" />
                                                            <span className="text-[11px] leading-tight font-medium line-clamp-1">{dr.hospitalName || 'Medicare Center'}</span>
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Quick Stats */}
                                                <div className="grid grid-cols-3 gap-2 mt-3.5 pt-3 border-t border-white/[0.05]">
                                                    <div className="flex flex-col items-center px-2 py-1.5 rounded-xl bg-white/[0.02]">
                                                        <Users size={13} className="text-blue-400/80 mb-1" />
                                                        <span className="text-[10px] font-black text-white leading-none">{dr.patientCount || (500 + idx * 37)}+</span>
                                                        <span className="text-[9px] text-gray-500 mt-0.5 font-semibold">Patients</span>
                                                    </div>
                                                    <div className="flex flex-col items-center px-2 py-1.5 rounded-xl bg-white/[0.02]">
                                                        <Award size={13} className="text-emerald-400/80 mb-1" />
                                                        <span className="text-[10px] font-black text-white leading-none">{dr.awardCount || (5 + (idx % 8))}</span>
                                                        <span className="text-[9px] text-gray-500 mt-0.5 font-semibold">Awards</span>
                                                    </div>
                                                    <div className="flex flex-col items-center px-2 py-1.5 rounded-xl bg-white/[0.02]">
                                                        <Briefcase size={13} className="text-violet-400/80 mb-1" />
                                                        <span className="text-[10px] font-black text-white leading-none">{dr.experience || '5+'}Y</span>
                                                        <span className="text-[9px] text-gray-500 mt-0.5 font-semibold">Exp</span>
                                                    </div>
                                                </div>

                                                {/* Book Now */}
                                                <button
                                                    onClick={() => {
                                                        if (!isAdmitted) {
                                                            const year = selectedDate ? selectedDate.getFullYear() : null;
                                                            const month = selectedDate ? String(selectedDate.getMonth() + 1).padStart(2, '0') : null;
                                                            const day = selectedDate ? String(selectedDate.getDate()).padStart(2, '0') : null;
                                                            const dateStr = selectedDate ? `${year}-${month}-${day}` : null;
                                                            setBookingDoctor(dr);
                                                            if (dateStr) setSelectedDate(new Date(dateStr));
                                                        }
                                                    }}
                                                    disabled={isAdmitted}
                                                    className={`relative mt-3.5 w-full py-2.5 rounded-2xl text-[11px] font-black uppercase tracking-[0.1em] overflow-hidden transition-all duration-300 active:scale-[0.97] ${isAdmitted
                                                        ? 'bg-gray-700/40 text-gray-500 cursor-not-allowed border border-white/5'
                                                        : 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-[0_10px_30px_-10px_rgba(79,70,229,0.8)] hover:shadow-[0_14px_36px_-10px_rgba(79,70,229,1)] hover:-translate-y-0.5'
                                                    }`}
                                                >
                                                    {!isAdmitted && (
                                                        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/15 to-transparent translate-x-[-120%] group-hover:translate-x-[120%] transition-transform duration-900 ease-out" />
                                                    )}
                                                    <span className="relative flex items-center justify-center gap-2">
                                                        {isAdmitted ? 'Booking Disabled' : 'Book Appointment'}
                                                        <CalendarPlus size={14} className="group-hover:rotate-12 transition-transform duration-300" strokeWidth={2.2} />
                                                    </span>
                                                </button>
                                            </div>
                                        </div>
                                    ))
                                )}

                                {filteredDoctors.length > 0 && filteredDoctors.length > page * 6 && (
                                    <button
                                        onClick={() => setPage(p => p + 1)}
                                        className="w-full py-3 rounded-2xl bg-[#111318] border border-white/[0.06] text-gray-400 hover:text-white text-[12px] font-bold transition-all active:scale-[0.98]"
                                    >
                                        Load more doctors
                                    </button>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>
            
            {/* Rating Modal */}
            {ratingModal.open && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadein">
                    <div className="bg-[#111318] border border-white/10 rounded-2xl w-full max-w-sm p-6 shadow-2xl relative">
                        <button onClick={() => setRatingModal({ ...ratingModal, open: false })} className="absolute top-4 right-4 text-gray-500 hover:text-white">
                            <X size={18} />
                        </button>
                        <h3 className="text-xl font-bold text-white mb-4">Rate your Checkup</h3>
                        <form onSubmit={handleRateSubmit} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-400 mb-2">Rating</label>
                                <div className="flex gap-2">
                                    {[1, 2, 3, 4, 5].map((star) => (
                                        <button
                                            key={star}
                                            type="button"
                                            onClick={() => setRatingModal({ ...ratingModal, rating: star })}
                                            className="focus:outline-none"
                                        >
                                            <Star size={32} className={`transition-colors ${star <= ratingModal.rating ? 'text-amber-400 fill-amber-400' : 'text-gray-600'}`} />
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-400 mb-2">Review (Optional)</label>
                                <textarea
                                    value={ratingModal.review}
                                    onChange={(e) => setRatingModal({ ...ratingModal, review: e.target.value })}
                                    className="w-full bg-white/[0.03] border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-blue-500"
                                    rows={3}
                                    placeholder="Write a brief review about your experience..."
                                />
                            </div>
                            <button
                                type="submit"
                                className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold flex justify-center items-center gap-2 transition-colors"
                            >
                                <CheckCircle size={18} /> Submit Rating
                            </button>
                        </form>
                    </div>
                </div>
            )}
            </>
            )}

            {/* Mobile animations */}
            <style>{`
                @keyframes mobile-fadein {
                    from { opacity: 0; transform: translateY(6px); }
                    to   { opacity: 1; transform: translateY(0); }
                }
                @keyframes mobile-card-in {
                    from { opacity: 0; transform: translateY(10px) scale(0.98); }
                    to   { opacity: 1; transform: translateY(0) scale(1); }
                }
                .animate-mobile-fadein { animation: mobile-fadein 0.35s ease-out both; }
                .animate-mobile-card-in { animation: mobile-card-in 0.42s cubic-bezier(0.22, 1, 0.36, 1) both; }
                .scrollbar-none { scrollbar-width: none; }
                @media (max-width: 1023px) {
                    .line-clamp-1 {
                        overflow: hidden;
                        display: -webkit-box;
                        -webkit-box-orient: vertical;
                        -webkit-line-clamp: 1;
                    }
                }
            `}</style>
        </div>
    );
};

const PageSpinner = () => (
    <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
    </div>
);

export default PatientAppointments;

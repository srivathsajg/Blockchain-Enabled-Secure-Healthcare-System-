import React, { useState, useEffect, useMemo } from 'react';
import { Calendar, dateFnsLocalizer, Views } from 'react-big-calendar';
import { format, parse, startOfWeek, getDay, addMonths, subMonths } from 'date-fns';
import { motion as Motion, AnimatePresence } from 'framer-motion';
import { 
    Calendar as CalendarIcon, 
    ChevronLeft, 
    ChevronRight, 
    Plus, 
    Clock, 
    User, 
    CheckCircle, 
    XCircle, 
    AlertCircle, 
    MoreHorizontal 
} from 'lucide-react';
import Skeleton from 'react-loading-skeleton';
import 'react-loading-skeleton/dist/skeleton.css';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import './CalendarOverride.css'; // Import custom styles
import { fetchPatientAppointments } from '../../services/patientApi';
import socket from '../../services/socket';
import { useAuth } from '../../context/AuthContext';

// Setup Localizer
const locales = {
    'en-US': undefined,
};
const localizer = dateFnsLocalizer({
    format,
    parse,
    startOfWeek,
    getDay,
    locales,
});

const ACTIVE_APPOINTMENT_STATUSES = new Set(['pending', 'approved']);

const buildAppointmentDateTime = (rawDate, rawTime = '00:00') => {
    if (!rawDate) {
        return null;
    }

    const dateMatch = typeof rawDate === 'string'
        ? rawDate.match(/^(\d{4})-(\d{2})-(\d{2})/)
        : null;

    let year;
    let month;
    let day;

    if (dateMatch) {
        year = Number(dateMatch[1]);
        month = Number(dateMatch[2]) - 1;
        day = Number(dateMatch[3]);
    } else {
        const parsedDate = new Date(rawDate);
        if (Number.isNaN(parsedDate.getTime())) {
            return null;
        }

        year = parsedDate.getFullYear();
        month = parsedDate.getMonth();
        day = parsedDate.getDate();
    }

    let [hourPart = '0', minutePart = '0'] = String(rawTime).split(':');
    let hours = parseInt(hourPart, 10);
    let minutes = parseInt(minutePart, 10);

    // Handle AM/PM
    const ampm = String(rawTime).toLowerCase().match(/[ap]m/);
    if (ampm) {
        if (ampm[0] === 'pm' && hours < 12) hours += 12;
        if (ampm[0] === 'am' && hours === 12) hours = 0;
    }

    const appointmentDateTime = new Date(
        year,
        month,
        day,
        hours,
        minutes,
        0,
        0,
    );

    return Number.isNaN(appointmentDateTime.getTime()) ? null : appointmentDateTime;
};

/* ─── Helper: Status Styles ────────────────────────────────────────── */
const getStatusStyles = (status) => {
    switch (status?.toLowerCase()) {
        case 'approved':
            return {
                bg: 'bg-emerald-500/10',
                border: 'border-emerald-500/20',
                text: 'text-emerald-400',
                icon: CheckCircle
            };
        case 'pending':
            return {
                bg: 'bg-yellow-500/10',
                border: 'border-yellow-500/20',
                text: 'text-yellow-400',
                icon: Clock
            };
        case 'cancelled':
        case 'rejected':
            return {
                bg: 'bg-red-500/10',
                border: 'border-red-500/20',
                text: 'text-red-400',
                icon: XCircle
            };
        case 'expired':
            return {
                bg: 'bg-gray-500/10',
                border: 'border-gray-500/20',
                text: 'text-gray-500',
                icon: AlertCircle
            };
        default:
            return {
                bg: 'bg-blue-500/10',
                border: 'border-blue-500/20',
                text: 'text-blue-400',
                icon: AlertCircle
            };
    }
};

/* ─── Component: Custom Event (Inside Calendar Cell) ──────────────── */
const CustomEvent = ({ event }) => {
    const styles = getStatusStyles(event.status);
    const StatusIcon = styles.icon;

    return (
        <Motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            whileHover={{ scale: 1.02, y: -2 }}
            className={`flex flex-col sm:gap-1 p-1 sm:p-2 rounded-lg sm:rounded-xl border backdrop-blur-sm shadow-sm transition-all cursor-pointer ${styles.bg} ${styles.border}`}
        >
            <div className="flex items-center justify-between gap-1">
                <span className={`text-[8px] sm:text-[10px] font-black uppercase tracking-widest ${styles.text} truncate`}>
                    {event.status}
                </span>
                <StatusIcon size={8} sm:size={12} className={`${styles.text} shrink-0`} />
            </div>
            
            <div className="hidden sm:flex items-center gap-2 mt-1">
                <div className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center border border-white/5">
                    <User size={12} className="text-gray-300" />
                </div>
                <div className="flex flex-col min-w-0">
                    <span className="text-xs font-semibold text-white truncate">
                        Dr. {event.doctorName}
                    </span>
                    <span className="text-[10px] text-gray-400 flex items-center gap-1">
                        <Clock size={8} /> {format(event.start, 'h:mm a')}
                    </span>
                </div>
            </div>

            {/* Mobile Only Time Display */}
            <div className="sm:hidden mt-0.5">
                <p className="text-[7px] font-bold text-white/40 truncate">
                    {format(event.start, 'h:mm a')}
                </p>
            </div>
        </Motion.div>
    );
};

/* ─── Component: Custom Toolbar ───────────────────────────────────── */
const CustomToolbar = ({ date, onNavigate, onView, view, onBookClick, isAdmitted }) => {
    return (
        <div className="flex flex-col sm:flex-row items-center justify-between mb-6 gap-4 sm:gap-6">
            {/* Left: Navigation */}
            <div className="flex items-center justify-between w-full sm:w-auto gap-2 sm:gap-4 bg-[#111318] border border-white/[0.06] p-1 sm:p-1.5 rounded-full shadow-lg">
                <button 
                    onClick={() => onNavigate('PREV')} 
                    className="p-1.5 sm:p-2 rounded-full hover:bg-white/5 text-gray-400 hover:text-white transition-colors"
                >
                    <ChevronLeft size={16} sm:size={18} />
                </button>
                
                <span className="text-[10px] sm:text-xs font-black text-white min-w-[100px] sm:min-w-[120px] text-center uppercase tracking-[0.1em] sm:tracking-widest">
                    {format(date, 'MMMM yyyy')}
                </span>
                
                <button 
                    onClick={() => onNavigate('NEXT')} 
                    className="p-1.5 sm:p-2 rounded-full hover:bg-white/5 text-gray-400 hover:text-white transition-colors"
                >
                    <ChevronRight size={16} sm:size={18} />
                </button>
            </div>

            {/* Right: Actions */}
            <div className="flex items-center justify-between w-full sm:w-auto gap-2 sm:gap-3">
                <div className="flex bg-[#111318] border border-white/[0.06] rounded-full p-1 overflow-x-auto no-scrollbar">
                    {['month', 'week', 'day'].map((v) => (
                        <button
                            key={v}
                            onClick={() => onView(v)}
                            className={`px-3 sm:px-4 py-1.5 rounded-full text-[10px] sm:text-xs font-bold uppercase tracking-wider transition-all whitespace-nowrap ${
                                view === v 
                                    ? 'bg-white/10 text-white shadow-sm' 
                                    : 'text-gray-500 hover:text-gray-300'
                            }`}
                        >
                            {v}
                        </button>
                    ))}
                </div>

                <Motion.button
                    whileHover={{ scale: isAdmitted ? 1 : 1.05 }}
                    whileTap={{ scale: isAdmitted ? 1 : 0.95 }}
                    onClick={() => { if (!isAdmitted) onBookClick(); }}
                    disabled={isAdmitted}
                    className={`bg-emerald-600 text-white text-[10px] sm:text-xs font-black uppercase tracking-widest px-4 sm:px-5 py-2.5 rounded-full shadow-lg flex items-center gap-2 transition-all whitespace-nowrap ${isAdmitted ? 'opacity-40 cursor-not-allowed' : 'hover:bg-emerald-500 shadow-emerald-500/20'}`}
                >
                    <Plus size={14} sm:size={16} />
                    <span>Book Appointment</span>
                </Motion.button>
            </div>
        </div>
    );
};

/* ─── Component: Summary Panel (Right Side) ───────────────────────── */
const SummaryPanel = ({ appointments }) => {
    const [now, setNow] = useState(() => new Date());

    useEffect(() => {
        const timer = window.setInterval(() => {
            setNow(new Date());
        }, 60000);

        return () => window.clearInterval(timer);
    }, []);

    const upcoming = useMemo(() => (
        appointments
            .filter((appointment) => {
                const isActive = ACTIVE_APPOINTMENT_STATUSES.has(appointment.status?.toLowerCase());
                const hasValidStart = appointment.start instanceof Date && !Number.isNaN(appointment.start.getTime());
                return isActive && hasValidStart && appointment.start >= now;
            })
            .sort((a, b) => a.start - b.start)
    ), [appointments, now]);

    const nextAppointment = upcoming[0] || null;

    return (
        <div className="w-full lg:w-80 shrink-0 space-y-4 sm:space-y-6">
            <div className="bg-[#111318] border border-white/[0.06] rounded-2xl p-4 sm:p-5 shadow-xl">
                <div className="flex items-center justify-between mb-4 sm:mb-6">
                    <h3 className="text-xs sm:text-sm font-black text-white uppercase tracking-widest flex items-center gap-2">
                        <CalendarIcon size={16} className="text-emerald-500" /> Upcoming
                    </h3>
                    <div className="flex items-center gap-1.5 bg-white/5 px-2 py-1 rounded-lg">
                        <span className="text-[10px] text-gray-400 font-black tracking-widest uppercase">
                            {upcoming.length}
                        </span>
                        <span className="text-[10px] text-gray-600 font-bold uppercase tracking-widest">
                            Next
                        </span>
                    </div>
                </div>

                <div className="space-y-3 sm:space-y-4">
                    <AnimatePresence>
                        {!nextAppointment ? (
                            <Motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                className="text-center py-6 sm:py-10 space-y-2"
                            >
                                <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-white/[0.02] border border-white/[0.04] flex items-center justify-center mx-auto">
                                    <CalendarIcon size={18} sm:size={20} className="text-gray-700" />
                                </div>
                                <p className="text-gray-600 text-[10px] sm:text-xs font-medium tracking-tight">No upcoming clinical appointments</p>
                                <p className="text-gray-800 text-[9px] sm:text-[10px] font-bold uppercase tracking-widest">Book one to initiate</p>
                            </Motion.div>
                        ) : (
                            (() => {
                                const styles = getStatusStyles(nextAppointment.status);
                                const StatusIcon = styles.icon;
                                return (
                                    <Motion.div
                                        key={nextAppointment.id}
                                        initial={{ opacity: 0, x: 20 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        exit={{ opacity: 0, x: -20, height: 0 }}
                                        className="group relative p-3 sm:p-4 rounded-xl sm:rounded-2xl bg-white/[0.02] border border-white/[0.04] hover:bg-white/[0.04] hover:border-white/[0.08] transition-all"
                                    >
                                        <div className="flex items-start gap-3 sm:gap-4">
                                            <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center shrink-0 ${styles.bg} ${styles.text} border ${styles.border}`}>
                                                <span className="text-xs sm:text-sm font-black">
                                                    {format(nextAppointment.start, 'dd')}
                                                </span>
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-[8px] sm:text-[9px] font-black uppercase tracking-[0.2em] text-gray-600 mb-1">
                                                    Next intervention
                                                </p>
                                                <h4 className="text-xs sm:text-sm font-black text-white truncate leading-tight">
                                                    Dr. {nextAppointment.doctorName}
                                                </h4>
                                                <div className="flex items-center gap-3 mt-1.5">
                                                    <p className="text-[10px] text-gray-500 font-bold flex items-center gap-1.5">
                                                        <Clock size={10} />
                                                        {format(nextAppointment.start, 'MMM d, h:mm a')}
                                                    </p>
                                                </div>
                                                <div className="flex items-center gap-2 mt-3">
                                                    <span className={`inline-flex items-center gap-1.5 text-[8px] sm:text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-lg ${styles.bg} ${styles.text} border ${styles.border}`}>
                                                        <StatusIcon size={10} />
                                                        {nextAppointment.status}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    </Motion.div>
                                );
                            })()
                        )}
                    </AnimatePresence>
                </div>
            </div>

            {/* Support/Promo */}
            <div className="bg-gradient-to-br from-emerald-500/[0.05] to-blue-500/[0.05] border border-white/[0.06] rounded-2xl p-4 sm:p-5 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 blur-[60px] rounded-full -mr-16 -mt-16 pointer-events-none" />
                <h4 className="text-xs sm:text-sm font-black text-white mb-1.5 relative z-10 tracking-tight">Support Required?</h4>
                <p className="text-[10px] sm:text-xs text-gray-500 mb-4 relative z-10 leading-relaxed font-medium">
                    Our dedicated medical assistance team is available 24/7 for scheduling inquiries.
                </p>
                <button className="w-full bg-white/[0.03] hover:bg-white/[0.06] border border-white/10 text-white text-[9px] sm:text-[10px] font-black uppercase tracking-widest py-2.5 rounded-xl transition-all relative z-10">
                    Initiate Support
                </button>
            </div>
        </div>
    );
};


/* ─── Main Component: PatientCalendar ─────────────────────────────── */
const PatientCalendar = ({ onBookClick, onSelectDate, isAdmitted }) => {
    const { user } = useAuth();
    const [appointments, setAppointments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [date, setDate] = useState(new Date());
    const [view, setView] = useState(Views.MONTH);

    // Fetch Data
    const loadAppointments = async () => {
        try {
            const res = await fetchPatientAppointments();
            if (res?.success) {
                // Transform for Big Calendar
                const events = (res.data || [])
                    .map((a) => {
                        const start = buildAppointmentDateTime(a.date, a.time);

                        if (!start) {
                            return null;
                        }

                        return {
                            id: a._id,
                            title: `Dr. ${a.doctorId?.name}`,
                            start,
                            end: new Date(start.getTime() + 30 * 60000),
                            status: a.status,
                            doctorName: a.doctorId?.name || 'Unknown',
                            resource: a,
                        };
                    })
                    .filter(Boolean);
                setAppointments(events);
            }
        } catch (err) {
            console.error("Failed to load appointments", err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadAppointments();

        // Socket Listeners
        if (user?.id) {
            if (!socket.connected) socket.connect();
            
            // Join user room
            socket.emit('join-room', user.id);

            const handleUpdate = () => {
                loadAppointments(); // Reload on update
            };

            socket.on('appointment-updated', handleUpdate);
            socket.on('appointment-approved', handleUpdate);

            return () => {
                socket.off('appointment-updated', handleUpdate);
                socket.off('appointment-approved', handleUpdate);
            };
        }
    }, [user?.id]);

    // Handle selecting a slot (clicking a day)
    const handleSelectSlot = ({ start }) => {
        if (onSelectDate) {
            onSelectDate(start);
        }
    };

    // Custom Components for Big Calendar
    const components = useMemo(() => ({
        toolbar: (props) => (
            <CustomToolbar 
                {...props} 
                date={date}
                onNavigate={(action) => {
                    if (action === 'PREV') setDate(subMonths(date, 1));
                    if (action === 'NEXT') setDate(addMonths(date, 1));
                    if (action === 'TODAY') setDate(new Date());
                }}
                onView={setView}
                view={view}
                onBookClick={onBookClick}
                isAdmitted={isAdmitted}
            />
        ),
        event: CustomEvent,
    }), [date, view, onBookClick, isAdmitted]);

    if (loading) {
        return (
            <div className="w-full h-[600px] bg-[#111318] rounded-3xl border border-white/[0.06] p-6 flex gap-6">
                <div className="flex-1 space-y-4">
                    <Skeleton height={50} className="opacity-10" />
                    <Skeleton height={500} className="opacity-10" />
                </div>
                <div className="w-80 hidden lg:block space-y-4">
                    <Skeleton height={200} className="opacity-10" />
                    <Skeleton height={150} className="opacity-10" />
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col lg:flex-row gap-6 sm:gap-8 h-full pb-10">
            <style>
                {`
                    .custom-calendar .rbc-header {
                        padding: 12px 4px;
                        font-size: 10px;
                        font-weight: 900;
                        text-transform: uppercase;
                        letter-spacing: 0.1em;
                        color: #4b5563;
                        border-bottom: 1px solid rgba(255,255,255,0.05);
                    }
                    @media (max-width: 640px) {
                        .custom-calendar .rbc-header {
                            padding: 8px 2px;
                            font-size: 8px;
                        }
                        .custom-calendar .rbc-month-view {
                            border-radius: 16px;
                            overflow: hidden;
                        }
                        .custom-calendar .rbc-day-bg + .rbc-day-bg {
                            border-left: 1px solid rgba(255,255,255,0.02);
                        }
                        .custom-calendar .rbc-month-row + .rbc-month-row {
                            border-top: 1px solid rgba(255,255,255,0.02);
                        }
                    }
                    .custom-calendar .rbc-today {
                        background-color: rgba(16, 185, 129, 0.03) !important;
                    }
                    .custom-calendar .rbc-off-range-bg {
                        background-color: rgba(255, 255, 255, 0.01);
                    }
                `}
            </style>
            
            {/* Calendar Area */}
            <div className="flex-1 bg-[#111318] border border-white/[0.06] rounded-2xl sm:rounded-3xl p-3 sm:p-6 shadow-2xl relative overflow-hidden">
                {/* Background Glow */}
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-500 via-blue-500 to-purple-500 opacity-50" />
                
                <Calendar
                    localizer={localizer}
                    events={appointments}
                    startAccessor="start"
                    endAccessor="end"
                    style={{ height: 500 }}
                    date={date}
                    onNavigate={setDate}
                    view={view}
                    onView={setView}
                    selectable
                    onSelectSlot={handleSelectSlot}
                    components={components}
                    className="custom-calendar"
                    dayPropGetter={(date) => {
                        const isToday = new Date().toDateString() === date.toDateString();
                        return {
                            className: isToday ? 'rbc-day-bg custom-today-cell' : 'rbc-day-bg',
                        };
                    }}
                />
            </div>

            {/* Sidebar Summary */}
            <SummaryPanel appointments={appointments} />
        </div>
    );
};

export default PatientCalendar;

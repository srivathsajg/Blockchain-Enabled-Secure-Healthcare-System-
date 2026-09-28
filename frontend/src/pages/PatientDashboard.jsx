import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import socket from '../services/socket';
import { getBaseUrl } from '../services/userApi';
import { fetchPatientActiveDeliveries } from '../services/deliveryApi';
import { fetchDoctors, bookAppointment, fetchHospitals } from '../services/patientApi';
import {
    Activity, Shield, Bell, BellRing, LayoutGrid,
    CalendarClock, FileText, ClipboardList, Settings,
    User, LogOut, X, CreditCard, Microscope, Utensils,
    Navigation, MapPin, Truck, Package, Clock, Loader2,
    AlertCircle, Building2, ChevronRight, AlertTriangle, ListChecks
} from 'lucide-react';
import UniversalSearchBar from '../components/ui/UniversalSearchBar';
import AIAssistant from '../components/ui/AIAssistant';
import Loader from '../components/ui/Loader';
import CustomSelect from '../components/ui/CustomSelect';
import NotificationBell from '../components/ui/NotificationBell';
import { useSocketNotifications } from '../hooks/useSocketNotifications';

import PatientProfileQRCode from '../components/qr/PatientProfileQRCode';

const clampPct = (value) => Math.max(10, Math.min(90, value));

const getMapPositionFromCoords = (coords) => {
    if (!coords) return { top: '40%', left: '45%' };
    const latFrac = Math.abs(coords.lat % 1);
    const lngFrac = Math.abs(coords.lng % 1);
    return {
        top: `${clampPct(50 + (latFrac - 0.5) * 70)}%`,
        left: `${clampPct(50 + (lngFrac - 0.5) * 70)}%`,
    };
};

const getGoogleMapEmbedUrl = (coords) => {
    if (!coords) return '';
    const query = `${coords.lat},${coords.lng}`;
    return `https://maps.google.com/maps?q=${encodeURIComponent(query)}&z=18&output=embed`;
};

/* ─── Sidebar Nav Item ─────────────────────────────────────────────── */
const SidebarLink = ({ to, icon: Icon, label, badge, end = false }) => (
    <NavLink
        to={to}
        end={end}
        className={({ isActive }) =>
            `w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-medium transition-all group
            ${isActive
                ? 'bg-gradient-to-r from-emerald-500/10 to-transparent text-emerald-400 border-l-[3px] border-emerald-500 shadow-[10px_0_30px_rgba(16,185,129,0.05)] translate-x-1'
                : 'text-gray-500 hover:text-gray-200 hover:bg-white/[0.05] border-l-[3px] border-transparent'}`
        }
    >
        {({ isActive }) => (
            <>
                <div className="flex items-center gap-4">
                    <Icon size={18} className={isActive ? 'text-emerald-400 drop-shadow-[0_0_5px_rgba(52,211,153,0.5)]' : 'text-gray-600 group-hover:text-gray-400 transition-colors'} />
                    <span className="font-bold tracking-tight">{label}</span>
                </div>
                {badge && badge !== '0' && (
                    <span className="text-[10px] font-bold bg-red-500 text-white px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
                        {badge}
                    </span>
                )}
            </>
        )}
    </NavLink>
);

/* ─── Main Layout Shell ────────────────────────────────────────────── */
const PatientDashboard = () => {
    const { user, token, loading, logout } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();

    // Handle emergency trigger from navbar / navigation state
    useEffect(() => {
        if (location.state?.openEmergency) {
            handleOpenEmergencyModal();
            // Clear state after opening
            window.history.replaceState({}, document.title);
        }
        if (location.state?.toast) {
            showToast(location.state.toast);
            // Clear toast state without losing scroll position etc.
            window.history.replaceState(
                { ...window.history.state, usr: {} },
                document.title
            );
        }
    }, [location.state]);

    // Protect route: Redirect if not authenticated
    useEffect(() => {
        if (!loading && !token) {
            navigate('/login');
        }
    }, [loading, token, navigate]);

    const [toast, setToast] = useState('');
    const [mobileOpen, setMobileOpen] = useState(false);
    const [notificationCount, markAllNotificationsRead, , notifications, markNotificationRead] = useSocketNotifications({ userId: user?.id, hospitalName: user?.hospitalName, notificationPrefs: user?.notificationPreferences });
    const [isTrackingOpen, setIsTrackingOpen] = useState(false);
    const [deliveryLocation, setDeliveryLocation] = useState(null);
    const [trackedDeliveryId, setTrackedDeliveryId] = useState(null);
    const [activeDeliveries, setActiveDeliveries] = useState([]);
    const [isLoadingDeliveries, setIsLoadingDeliveries] = useState(false);
    const [trackingMapPosition, setTrackingMapPosition] = useState({ top: '40%', left: '45%' });

    const currentOrder = activeDeliveries[0] || null;

    const handleOpenEmergencyModal = () => {
        navigate('/patient-dashboard/emergency');
    };

    const handleOpenTracker = async () => {
        setIsTrackingOpen(true);
        setIsLoadingDeliveries(true);
        try {
            const res = await fetchPatientActiveDeliveries();
            if (res.success) {
                setActiveDeliveries(res.data);
                const firstActive = res.data?.find(d => d.status === 'picked' || d.status === 'in_transit');
                if (firstActive) {
                    setTrackedDeliveryId(firstActive._id?.toString() || null);

                    let coords = null;
                    if (firstActive.location) {
                        if (typeof firstActive.location === 'string') {
                            try {
                                const parsed = JSON.parse(firstActive.location);
                                coords = parsed.coords || parsed;
                            } catch (error) {
                                // non-JSON string location will be ignored
                            }
                        } else if (typeof firstActive.location === 'object') {
                            coords = firstActive.location.coords || firstActive.location;
                        }
                    }

                    if (coords && (coords.lat || coords.latitude) && (coords.lng || coords.longitude)) {
                        const normalizedCoords = {
                            lat: coords.lat ?? coords.latitude,
                            lng: coords.lng ?? coords.longitude,
                        };
                        setDeliveryLocation({
                            ...firstActive,
                            deliveryId: firstActive._id,
                            coords: normalizedCoords,
                            status: firstActive.status,
                        });
                        setTrackingMapPosition(getMapPositionFromCoords(normalizedCoords));
                    }
                }
            }
        } catch (error) {
            console.error("Error fetching active deliveries:", error);
        } finally {
            setIsLoadingDeliveries(false);
        }
    };

    const showToast = (msg) => {
        setToast(msg);
        setTimeout(() => setToast(''), 5000);
    };

    // Socket.IO real-time updates
    useEffect(() => {
        if (!user?.id) return;

        if (!socket.connected) {
            socket.connect();
        }

        const patientRoom = `patient-${user.id}`;
        const hospitalRoom = user.hospitalName || 'General';
        socket.emit('join-room', user.id?.toString());
        socket.emit('join-hospital-room', hospitalRoom);
        socket.emit('join-room', patientRoom);

        socket.on('connect', () => {
            socket.emit('join-room', user.id?.toString());
            socket.emit('join-hospital-room', hospitalRoom);
            socket.emit('join-room', patientRoom);
        });

        socket.on('delivery-location-changed', (data) => {
            console.log('GPS Update received:', data);
            const incomingDeliveryId = data.deliveryId || data.orderId || data.trackingId;

            if (trackedDeliveryId && incomingDeliveryId && incomingDeliveryId.toString() !== trackedDeliveryId.toString()) {
                console.debug('Ignoring location update for non-tracked delivery', incomingDeliveryId);
                return;
            }

            if (data.coords && (data.coords.lat || data.coords.latitude) && (data.coords.lng || data.coords.longitude)) {
                const normalizedCoords = {
                    lat: data.coords.lat ?? data.coords.latitude,
                    lng: data.coords.lng ?? data.coords.longitude,
                };
                setDeliveryLocation({
                    ...data,
                    deliveryId: incomingDeliveryId,
                    coords: normalizedCoords,
                });
                setTrackingMapPosition(getMapPositionFromCoords(normalizedCoords));
            } else {
                console.warn('Received delivery location update with missing coordinates', data);
            }
        });

        socket.on('appointment-approved', (data) => {
            showToast(data?.message || 'Appointment approved');
        });

        socket.on('appointment-updated', (data) => {
            if (data.patientId === user?.id) {
                if (data.status === 'completed') {
                    showToast(`thanks for coming to MediCare 😊`);
                } else {
                    showToast(`🔔 Your appointment has been ${data.status}!`);
                }
            }
        });

        return () => {
            socket.off('connect');
            socket.off('delivery-location-changed');
            socket.off('appointment-approved');
            socket.off('appointment-updated');
            // Do not disconnect socket here as it's a singleton
        };
    }, [user?.id, user?.hospitalName, trackedDeliveryId]); // Updated dependency array to react to user and active delivery changes

    if (loading) {
        return <Loader message="Initializing Medical Portal" fullScreen />;
    }

    if (!user) return null; // Or redirect

    return (
        <div className="flex h-screen bg-[#0b0d11] mesh-bg text-white font-sans overflow-hidden">

            {/* ── Global Toast ── */}
            {toast && (
                <div className="fixed top-5 left-1/2 -translate-x-1/2 z-[100] flex items-center gap-3 bg-[#1a1f2e] border border-emerald-500/30 text-emerald-400 px-5 py-3 rounded-full shadow-2xl text-sm font-semibold animate-slide-down">
                    <BellRing size={16} /> {toast}
                    <button onClick={() => setToast('')} className="ml-2 text-gray-500 hover:text-white">
                        <X size={14} />
                    </button>
                </div>
            )}

            {/* ── Mobile overlay ── */}
            {mobileOpen && (
                <div
                    className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
                    onClick={() => setMobileOpen(false)}
                />
            )}

            {/* ── SIDEBAR ── */}
            <aside className={`
                fixed lg:relative z-50 lg:z-auto
                h-full w-64 flex-shrink-0
                bg-[#0e1015] border-r border-white/[0.06]
                flex flex-col transition-transform duration-300
                ${mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
            `}>
                {/* Logo */}
                <div className="p-7 flex items-center gap-4 border-b border-white/[0.05] relative group cursor-default">
                    <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/[0.02] to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                    <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-400 p-[1px]">
                        <div className="w-full h-full rounded-[14px] bg-[#0e1015] flex items-center justify-center shadow-2xl">
                            <Activity size={20} className="text-emerald-400 drop-shadow-[0_0_8px_rgba(52,211,153,0.4)]" />
                        </div>
                    </div>
                    <div>
                        <p className="font-black text-white text-base tracking-tighter leading-tight">MediCare <span className="text-emerald-500">.</span></p>
                        <p className="text-[11px] text-emerald-500/80 font-black uppercase tracking-[0.2em] mt-0.5">Patient Portal</p>
                    </div>
                </div>

                {/* Nav */}
                <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
                    <p className="text-xs font-bold text-gray-700 uppercase tracking-widest px-3 mb-2">Menu</p>
                    <SidebarLink to="/patient-dashboard" end icon={LayoutGrid} label="Dashboard" />
                    <SidebarLink to="/patient-dashboard/appointments" icon={CalendarClock} label="Appointments" />
                    <div className="my-3 px-3 border-t border-white/[0.04]" />
                    <SidebarLink to="/patient-dashboard/emergency" icon={AlertTriangle} label="Emergency Booking" />
                    <SidebarLink to="/patient-dashboard/emergencies" icon={ListChecks} label="My Emergencies" />
                    <div className="my-3 px-3 border-t border-white/[0.04]" />
                    <SidebarLink to="/patient-dashboard/records" icon={FileText} label="My Records" />
                    <SidebarLink to="/patient-dashboard/insurance" icon={Shield} label="Insurance" />
                    <SidebarLink to="/patient-dashboard/prescriptions" icon={ClipboardList} label="Prescriptions" />
                    <SidebarLink to="/patient-dashboard/lab-tests" icon={Microscope} label="Lab Tests" />
                    <SidebarLink to="/patient-dashboard/reminders" icon={BellRing} label="Reminders" />
                    <SidebarLink to="/patient-dashboard/diet-plan" icon={Utensils} label="Diet Plan" />
                    <SidebarLink to="/patient-dashboard/admission-status" icon={Navigation} label="Admission Status" />
                    <SidebarLink to="/patient-dashboard/billing" icon={CreditCard} label="Billing" />

                    <div className="pt-4">
                        <p className="text-xs font-bold text-gray-700 uppercase tracking-widest px-3 mb-2">Account</p>
                        <SidebarLink to="/patient-dashboard/settings" icon={Settings} label="Settings" />
                    </div>
                </nav>

                {/* User footer */}
                <div className="p-3 border-t border-white/[0.05]">
                    <div className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/[0.05] mb-2">
                        <div className="w-8 h-8 rounded-lg bg-gray-800 border border-white/10 flex items-center justify-center overflow-hidden flex-shrink-0">
                            {user?.profileImage ? (
                                <img src={`${getBaseUrl()}/${user.profileImage}`} alt="Profile" className="w-full h-full object-cover" />
                            ) : (
                                <span className="text-white font-bold text-sm">{(user?.name || 'P')[0].toUpperCase()}</span>
                            )}
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-white text-xs font-semibold truncate">{user?.name || 'Patient'}</p>
                            <p className="text-gray-600 text-xs truncate">{user?.email || ''}</p>
                        </div>
                    </div>
                    <PatientProfileQRCode />
                    <button
                        onClick={logout}
                        className="w-full flex items-center gap-2.5 px-3 py-2.5 text-gray-500 hover:text-red-400 hover:bg-red-500/[0.06] rounded-xl text-sm font-medium transition-all"
                    >
                        <LogOut size={16} /> Sign Out
                    </button>
                </div>
            </aside>

            {/* ── MAIN AREA ── */}
            <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

                {/* Top Header */}
                <header className="h-16 border-b border-white/[0.05] bg-[#0b0d11]/40 backdrop-blur-xl flex items-center justify-between px-4 sm:px-6 flex-shrink-0 relative z-30">
                    <div className="flex items-center gap-3 sm:gap-6 flex-1">
                        {/* Mobile hamburger */}
                        <button
                            className="lg:hidden p-2 rounded-xl text-gray-400 hover:text-white hover:bg-white/[0.06] transition-all"
                            onClick={() => setMobileOpen(!mobileOpen)}
                        >
                            {mobileOpen ? <X size={20} /> : (
                                <div className="space-y-1.5 flex flex-col items-end">
                                    <span className="block w-5 h-0.5 bg-current" />
                                    <span className="block w-4 h-0.5 bg-current" />
                                    <span className="block w-3 h-0.5 bg-white/40" />
                                </div>
                            )}
                        </button>
                        
                        <div className="flex items-center gap-4 sm:gap-8 flex-1 max-w-3xl">
                            <div className="hidden xl:flex items-center gap-3 px-4 py-2 bg-emerald-500/[0.03] border border-emerald-500/10 rounded-full">
                                <Shield size={14} className="text-emerald-500 animate-pulse" />
                                <span className="text-xs font-black text-emerald-500/80 uppercase tracking-widest whitespace-nowrap">Clinical Network Secured</span>
                                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]" />
                            </div>
                            <UniversalSearchBar />
                        </div>
                    </div>

                    <div className="flex items-center gap-2 sm:gap-3 ml-2">
                        <button 
                            onClick={handleOpenEmergencyModal}
                            className="flex items-center gap-2 px-3 sm:px-4 py-2 rounded-full bg-red-600 hover:bg-red-500 text-white transition-all group shadow-[0_0_20px_rgba(220,38,38,0.2)] hover:shadow-[0_0_25px_rgba(220,38,38,0.4)]"
                            title="Emergency Booking"
                        >
                            <AlertCircle size={16} className="group-hover:scale-110 transition-transform animate-pulse" />
                            <span className="hidden sm:block text-xs font-black uppercase tracking-[0.1em]">Emergency</span>
                        </button>
                        <button 
                            onClick={handleOpenTracker}
                            className="flex items-center gap-2 px-2.5 sm:px-3 py-1.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 hover:bg-blue-500/20 transition-all group"
                            title="Track Order"
                        >
                            <Truck size={14} className="group-hover:translate-x-0.5 transition-transform" />
                            <span className="hidden sm:block text-xs font-black uppercase tracking-widest">Track Order</span>
                        </button>
                        <NotificationBell count={notificationCount} notifications={notifications} onClick={markAllNotificationsRead} onMarkRead={markNotificationRead} />
                        <div className="flex items-center gap-2 sm:gap-2.5">
                            <div className="text-right hidden sm:block">
                                <p className="text-xs font-bold text-white truncate max-w-[80px]">{user?.name || 'Patient'}</p>
                                <p className="text-xs text-gray-600 truncate">ID: {user?.id?.slice(0, 8)}…</p>
                            </div>
                            <div className="w-8 h-8 rounded-xl bg-gray-800 border border-white/10 flex items-center justify-center overflow-hidden flex-shrink-0">
                                {user?.profileImage ? (
                                    <img src={`${getBaseUrl()}/${user.profileImage}`} alt="Profile" className="w-full h-full object-cover" />
                                ) : (
                                    <span className="text-white font-bold text-sm">{(user?.name || 'P')[0].toUpperCase()}</span>
                                )}
                            </div>
                        </div>
                    </div>
                </header>

                {/* Page Content */}
                <main className="flex-1 overflow-y-auto">
                    <div className="max-w-7xl mx-auto px-5 lg:px-8 py-7">
                        <Outlet />
                    </div>
                </main>

                {/* AI Assistant FAB */}
                <AIAssistant />
            </div>

            {/* ── Delivery Tracking Modal ── */}
            {isTrackingOpen && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
                    <div className="w-full max-w-lg bg-[#0e1015] border border-white/10 rounded-[32px] overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
                        {/* Modal Header */}
                        <div className="p-6 border-b border-white/10 flex items-center justify-between bg-gradient-to-r from-blue-500/10 to-transparent">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center border border-blue-500/30">
                                    <Truck size={20} className="text-blue-400" />
                                </div>
                                <div>
                                    <h3 className="text-lg font-bold text-white">Live Medicine Tracking</h3>
                                    <p className="text-xs text-blue-400/80 uppercase font-black tracking-widest">In-Hospital GPS Active</p>
                                </div>
                            </div>
                            <button onClick={() => setIsTrackingOpen(false)} className="p-2 hover:bg-white/5 rounded-full transition-colors">
                                <X size={20} className="text-gray-500 hover:text-white" />
                            </button>
                        </div>

                        {/* Modal Body */}
                        <div className="p-8">
                            {isLoadingDeliveries ? (
                                <div className="flex flex-col items-center justify-center py-12">
                                    <Loader2 className="animate-spin text-blue-500 w-10 h-10 mb-4" />
                                    <p className="text-sm text-gray-500">Checking for active orders...</p>
                                </div>
                            ) : activeDeliveries.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-12 text-center">
                                    <div className="w-16 h-16 rounded-full bg-gray-500/10 flex items-center justify-center mb-6">
                                        <Package size={24} className="text-gray-500" />
                                    </div>
                                    <h4 className="text-white font-bold mb-2">No active orders</h4>
                                    <p className="text-sm text-gray-500">You don't have any medicine orders being delivered right now.</p>
                                </div>
                            ) : !deliveryLocation && !activeDeliveries.some(d => d.status === 'picked' || d.status === 'in_transit') ? (
                                <div className="flex flex-col items-center justify-center py-12 text-center">
                                    <div className="w-16 h-16 rounded-full bg-amber-500/10 flex items-center justify-center mb-6">
                                        <Clock size={24} className="text-amber-500" />
                                    </div>
                                    <h4 className="text-white font-bold mb-2">Order Not Picked Up</h4>
                                    <p className="text-sm text-gray-500">Your order #{activeDeliveries[0].trackingId} has been assigned, but the delivery staff has not picked it up yet.</p>
                                </div>
                            ) : !deliveryLocation ? (
                                <div className="flex flex-col items-center justify-center py-12 text-center">
                                    <div className="relative mb-6">
                                        <div className="absolute inset-0 bg-blue-500/20 rounded-full animate-ping" />
                                        <div className="relative w-16 h-16 rounded-full bg-blue-500/10 border border-blue-500/30 flex items-center justify-center">
                                            <Navigation size={24} className="text-blue-400 animate-pulse" />
                                        </div>
                                    </div>
                                    <h4 className="text-white font-bold mb-2">Connecting to GPS...</h4>
                                    <p className="text-sm text-gray-500">Establishing connection with delivery staff's GPS signal.</p>
                                </div>
                            ) : (
                                <div className="space-y-8">
                                    {/* Google Maps Live Embed */}
                                    <div className="h-72 rounded-3xl overflow-hidden border border-white/10 shadow-inner bg-black/70">
                                        {deliveryLocation?.coords ? (
                                            <iframe
                                                title="Live Delivery Map"
                                                src={getGoogleMapEmbedUrl(deliveryLocation.coords)}
                                                className="w-full h-full border-0"
                                                allowFullScreen
                                                loading="lazy"
                                            />
                                        ) : (
                                            <div className="h-full flex items-center justify-center text-sm text-gray-400">
                                                Unable to load map coordinates.
                                            </div>
                                        )}
                                    </div>

                                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                        <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/5">
                                            <p className="text-xs font-black text-gray-500 uppercase tracking-widest mb-1">Status</p>
                                            <p className="text-sm font-bold text-blue-400 flex items-center gap-2">
                                                <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                                                {deliveryLocation?.status ? deliveryLocation.status.replace('_', ' ') : 'In Transit'}
                                            </p>
                                        </div>
                                        <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/5">
                                            <p className="text-xs font-black text-gray-500 uppercase tracking-widest mb-1">Live Coordinates</p>
                                            <p className="text-sm font-bold text-white">
                                                {deliveryLocation?.coords ? `${deliveryLocation.coords.lat.toFixed(5)}, ${deliveryLocation.coords.lng.toFixed(5)}` : 'Waiting for GPS...'}
                                            </p>
                                        </div>
                                    </div>

                                    <div className="p-4 rounded-2xl bg-emerald-500/5 border border-emerald-500/10 flex flex-col gap-2">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                                                <Activity size={20} className="text-emerald-500" />
                                            </div>
                                            <div>
                                                <p className="text-xs font-black text-emerald-500 uppercase tracking-widest">Hospital Zone</p>
                                                <p className="text-xs text-emerald-500/60">{user?.hospitalName || 'Assigned Hospital'}</p>
                                            </div>
                                        </div>
                                        <div className="text-xs text-gray-400">The map shows the delivery staff’s current location live inside your hospital campus. Refresh the tracker if the pin does not update immediately.</div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/5">
                                            <p className="text-xs font-black text-gray-500 uppercase tracking-widest mb-1">Status</p>
                                            <p className="text-sm font-bold text-blue-400 flex items-center gap-2">
                                                <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                                                In Transit
                                            </p>
                                        </div>
                                        <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/5">
                                            <p className="text-xs font-black text-gray-500 uppercase tracking-widest mb-1">Est. Arrival</p>
                                            <p className="text-sm font-bold text-white">4 - 6 Mins</p>
                                        </div>
                                    </div>

                                    <div className="p-4 rounded-2xl bg-emerald-500/5 border border-emerald-500/10 flex items-center gap-4">
                                        <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                                            <Activity size={20} className="text-emerald-500" />
                                        </div>
                                        <div className="flex-1">
                                            <p className="text-xs font-black text-emerald-500 uppercase tracking-widest">Medical Network Proof</p>
                                            <p className="text-xs text-emerald-500/60 font-mono truncate">TX: 0x8a2f...{user.id.slice(-6)}</p>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Modal Footer */}
                        <div className="p-4 border-t border-white/10 bg-white/[0.02] flex justify-center">
                            <button onClick={() => setIsTrackingOpen(false)} className="px-6 py-2 rounded-full text-xs font-bold text-gray-500 hover:text-white transition-colors">
                                Close Tracker
                            </button>
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
};

export default PatientDashboard;

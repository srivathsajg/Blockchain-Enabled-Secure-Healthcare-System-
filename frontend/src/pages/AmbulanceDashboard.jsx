import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity, AlertTriangle, Clock, Hospital, MapPin, Shield, User, LogOut,
  LayoutGrid, History, Settings, UserCheck, Navigation, QrCode, Truck,
  CheckCircle, AlertCircle, Clock3, Phone, Loader2, X, FileText, Camera,
  Upload, Search, Trash2, ExternalLink
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { getBaseUrl } from '../services/userApi';
import { getAmbulanceProfile, updateAvailabilityStatus } from '../services/ambulanceApi';
import socket from '../services/socket';
import UniversalSearchBar from '../components/ui/UniversalSearchBar';
import NotificationBell from '../components/ui/NotificationBell';
import { useSocketNotifications } from '../hooks/useSocketNotifications';
import EmergencyMap from '../components/emergency/EmergencyMap';
import {
  acceptEmergencyCase,
  confirmManualPatientIdentification,
  getAssignedAmbulanceEmergencies,
  getAvailableAmbulanceEmergencies,
  getEmergencyMedicalProfile,
  identifyPatientByQR,
  searchEmergencyCasePatients,
  updateEmergencyDetails,
  updateEmergencyStatus,
  updateAmbulanceLocationApi,
  uploadVictimPhoto,
} from '../services/emergencyApi';

const STATUS_LABELS = {
  REPORTED: 'Reported',
  AMBULANCE_REQUESTED: 'Ambulance Requested',
  AMBULANCE_ASSIGNED: 'Ambulance Assigned',
  AMBULANCE_ARRIVED: 'Ambulance On Scene',
  PATIENT_IDENTIFIED: 'Patient Identified',
  IN_TRANSIT: 'In Transit',
  HOSPITAL_PREPARED: 'Hospital Prepared',
  ARRIVED_AT_HOSPITAL: 'Arrived at Hospital',
  UNDER_TREATMENT: 'Under Treatment',
  CLOSED: 'Closed',
  CANCELLED: 'Cancelled',
};

const SEVERITY_CLASSES = {
  LOW: 'bg-blue-500/10 text-blue-400',
  MODERATE: 'bg-yellow-500/10 text-yellow-400',
  HIGH: 'bg-orange-500/10 text-orange-400',
  CRITICAL: 'bg-red-500/10 text-red-400',
};

const nextContextualAction = (status) => {
  switch (status) {
    case 'AMBULANCE_ASSIGNED':
      return 'Mark Arrived at Scene';
    case 'AMBULANCE_ARRIVED':
      return 'Identify Patient / Scan QR';
    case 'PATIENT_IDENTIFIED':
      return 'Start Transport';
    case 'IN_TRANSIT':
      return 'Prepare Hospital';
    case 'HOSPITAL_PREPARED':
      return 'Arrive at Hospital';
    case 'ARRIVED_AT_HOSPITAL':
      return 'Workflow completed';
    default:
      return 'Awaiting update';
  }
};

const statusAfterAction = (status) => {
  switch (status) {
    case 'AMBULANCE_ASSIGNED':
      return 'AMBULANCE_ARRIVED';
    case 'AMBULANCE_ARRIVED':
      return null;
    case 'PATIENT_IDENTIFIED':
      return 'IN_TRANSIT';
    case 'IN_TRANSIT':
      return 'HOSPITAL_PREPARED';
    case 'HOSPITAL_PREPARED':
      return 'ARRIVED_AT_HOSPITAL';
    default:
      return null;
  }
};

const formatRelativeTime = (value) => {
  if (!value) return 'N/A';
  try {
    return new Date(value).toLocaleString();
  } catch {
    return 'N/A';
  }
};

/* ─── Sidebar Nav Item ─────────────────────────────────────────────── */
const SidebarLink = ({ icon: Icon, label, badge, active, onClick }) => (
  <button
    onClick={onClick}
    className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-medium transition-all group
    ${active
        ? 'bg-gradient-to-r from-emerald-500/10 to-transparent text-emerald-400 border-l-[3px] border-emerald-500 shadow-[10px_0_30px_rgba(16,185,129,0.05)] translate-x-1'
        : 'text-gray-500 hover:text-gray-200 hover:bg-white/[0.05] border-l-[3px] border-transparent'}`
    }
  >
    <>
      <div className="flex items-center gap-4">
        <Icon size={18} className={active ? 'text-emerald-400 drop-shadow-[0_0_5px_rgba(52,211,153,0.5)]' : 'text-gray-600 group-hover:text-gray-400 transition-colors'} />
        <span className="font-bold tracking-tight">{label}</span>
      </div>
      {badge && badge !== '0' && (
        <span className="text-[10px] font-bold bg-red-500 text-white px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
          {badge}
        </span>
      )}
    </>
  </button>
);

const StatCard = ({ icon: Icon, title, value, color, bg, onClick }) => (
  <div
    className={`bg-[#111] border border-gray-800 rounded-2xl p-6 ${onClick ? 'cursor-pointer hover:border-gray-700 transition-all active:scale-95' : ''}`}
    onClick={onClick}
  >
    <div className="flex justify-between items-start mb-4">
      <div className={`p-3 rounded-xl ${bg}`}><Icon className={`w-6 h-6 ${color}`} /></div>
    </div>
    <p className="text-gray-400 text-sm font-medium mb-1">{title}</p>
    <h3 className="text-3xl font-bold">{value}</h3>
  </div>
);

const AmbulanceDashboard = () => {
  const { user, logout } = useAuth();
  const [notificationCount, markAllNotificationsRead, , notifications, markNotificationRead] = useSocketNotifications({ userId: user?.id, hospitalName: user?.hospitalName, notificationPrefs: user?.notificationPreferences });
  const [activeTab, setActiveTab] = useState('overview');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [available, setAvailable] = useState([]);
  const [assigned, setAssigned] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [qrToken, setQrToken] = useState('');
  const [profile, setProfile] = useState(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [ambulanceProfile, setAmbulanceProfile] = useState(null);
  const [toastMessage, setToastMessage] = useState('');
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const [patientSearchQuery, setPatientSearchQuery] = useState('');
  const [patientSearchResults, setPatientSearchResults] = useState([]);
  const [patientSearchLoading, setPatientSearchLoading] = useState(false);
  const [selectedPatientCandidate, setSelectedPatientCandidate] = useState(null);
  const [isConfirmPatientModalOpen, setIsConfirmPatientModalOpen] = useState(false);
  const [facePhotoFile, setFacePhotoFile] = useState(null);
  const [facePhotoPreview, setFacePhotoPreview] = useState('');
  const [facePhotoUploading, setFacePhotoUploading] = useState(false);
  const [faceMessage, setFaceMessage] = useState('');
  const [identityMode, setIdentityMode] = useState('');
  const [ambulanceGps, setAmbulanceGps] = useState(null);
  const [driverDistance, setDriverDistance] = useState(null);
  const [driverEta, setDriverEta] = useState(null);

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 4000);
  };

  const loadAmbulanceProfile = async () => {
    try {
      const response = await getAmbulanceProfile();
      if (response.success) {
        setAmbulanceProfile(response.data);
      } else {
        console.error('Failed to load ambulance profile:', response.message);
        // Fallback to mock data if API fails
        const profileData = {
          name: user?.name || 'Ambulance Driver',
          employeeId: user?.employeeId || 'EMP001',
          hospitalOrOrganization: user?.hospitalName || 'Medicare Hospital',
          ambulanceVehicleNumber: user?.vehicleNumber || 'AMB001',
          ambulanceType: user?.ambulanceType || 'BLS',
          availabilityStatus: user?.availability || 'AVAILABLE'
        };
        setAmbulanceProfile(profileData);
      }
    } catch (error) {
      console.error('Error loading ambulance profile:', error);
      // Fallback to mock data if API fails
      const profileData = {
        name: user?.name || 'Ambulance Driver',
        employeeId: user?.employeeId || 'EMP001',
        hospitalOrOrganization: user?.hospitalName || 'Medicare Hospital',
        ambulanceVehicleNumber: user?.vehicleNumber || 'AMB001',
        ambulanceType: user?.ambulanceType || 'BLS',
        availabilityStatus: user?.availability || 'AVAILABLE'
      };
      setAmbulanceProfile(profileData);
    }
  };

  const handleAvailabilityChange = async (status) => {
    if (availabilityLoading) return; // Prevent double clicks

    setAvailabilityLoading(true);
    try {
      const response = await updateAvailabilityStatus(status);
      if (response.success) {
        // Update the ambulance profile with the new availability from API response
        setAmbulanceProfile(response.data);
        showToast(`Availability updated to ${status === 'AVAILABLE' ? 'Available' : status === 'OFF_DUTY' ? 'Off Duty' : 'On Call'}`);
      } else {
        console.error('Failed to update availability:', response.message);
        showToast('Failed to update availability');
      }
    } catch (error) {
      console.error('Error updating availability:', error);
      showToast('Failed to update availability');
    } finally {
      setAvailabilityLoading(false);
    }
  };

  const refreshDashboard = async () => {
    try {
      const [availableResponse, assignedResponse] = await Promise.all([
        getAvailableAmbulanceEmergencies(),
        getAssignedAmbulanceEmergencies(),
      ]);

      setAvailable(availableResponse?.data || []);
      setAssigned(assignedResponse?.data || []);
      setError('');
    } catch (refreshError) {
      setError(refreshError?.response?.data?.message || 'Unable to load ambulance dashboard data.');
    }
  };

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      try {
        await refreshDashboard();
        await loadAmbulanceProfile();
      } finally {
        setLoading(false);
      }
    };

    init();
  }, []);

  const activeCase = useMemo(() => {
    const cases = [...assigned].filter((item) => !['CLOSED', 'CANCELLED'].includes(item.status));
    return cases[0] || null;
  }, [assigned]);

  // Live ambulance driver GPS tracking and real-time broadcasting
  useEffect(() => {
    if (!activeCase?._id) return undefined;
    const isEnRoute = ['AMBULANCE_ASSIGNED', 'AMBULANCE_ARRIVED', 'PATIENT_IDENTIFIED', 'IN_TRANSIT'].includes(activeCase.status);
    if (!isEnRoute) return undefined;

    let watchId = null;
    let lastEmitTime = 0;
    let lastEmitLat = null;
    let lastEmitLng = null;
    const MIN_DISTANCE_M = 15;   // emit if moved > 15m
    const MIN_INTERVAL_MS = 5000; // emit at most every 5 s

    const haversineM = (la1, lo1, la2, lo2) => {
      const R = 6371e3, rad = Math.PI / 180;
      const f1 = la1 * rad, f2 = la2 * rad, df = (la2 - la1) * rad, dl = (lo2 - lo1) * rad;
      const a = Math.sin(df / 2) ** 2 + Math.cos(f1) * Math.cos(f2) * Math.sin(dl / 2) ** 2;
      return Math.round(2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
    };

    if (navigator.geolocation) {
      watchId = navigator.geolocation.watchPosition(
        (pos) => {
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          const coords = {
            latitude: lat,
            longitude: lng,
            accuracy: Math.round(pos.coords.accuracy || 10),
            heading: pos.coords.heading || undefined,
            speed: pos.coords.speed || undefined,
          };
          setAmbulanceGps(coords);

          // Throttle: only emit if moved enough OR enough time passed
          const now = Date.now();
          const timeSince = now - lastEmitTime;
          const distMoved = (lastEmitLat !== null)
            ? haversineM(lastEmitLat, lastEmitLng, lat, lng)
            : MIN_DISTANCE_M + 1; // always send first position

          if (distMoved >= MIN_DISTANCE_M || timeSince >= MIN_INTERVAL_MS) {
            lastEmitTime = now;
            lastEmitLat = lat;
            lastEmitLng = lng;

            // Broadcast via Socket.IO
            socket.emit('update-ambulance-location', {
              emergencyCaseId: activeCase._id,
              coords,
              ambulanceId: user?.id,
            });

            // Also persist via REST API
            updateAmbulanceLocationApi(activeCase._id, coords).catch(() => {});
          }
        },
        (err) => {
          console.warn('Ambulance driver GPS tracking notice:', err.message);
        },
        { enableHighAccuracy: true, maximumAge: 3000, timeout: 12000 }
      );
    }

    return () => {
      if (watchId !== null && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchId);
      }
    };
  }, [activeCase?._id, activeCase?.status, user?.id]);

  useEffect(() => {
    if (!user?.id) return undefined;

    socket.connect();
    socket.emit('join-room', String(user.id));
    socket.emit('join-hospital-room', user?.hospitalName || 'General');

    const handleRefresh = () => {
      refreshDashboard();
    };

    const handleLocationUpdated = (payload) => {
      if (activeCase?._id && String(payload?.emergencyCaseId) === String(activeCase._id)) {
        if (payload.distanceMeters !== undefined) setDriverDistance(payload.distanceMeters);
        if (payload.etaMinutes !== undefined) setDriverEta(payload.etaMinutes);
        if (payload.autoArrived || payload.status === 'AMBULANCE_ARRIVED') {
          refreshDashboard();
          showToast('✓ Ambulance Arrival Verified by GPS Geofence!');
        }
      }
    };

    socket.on('emergency-created', handleRefresh);
    socket.on('emergency-status-updated', handleRefresh);
    socket.on('emergency-updated', handleRefresh);
    socket.on('ambulance-assigned', handleRefresh);
    socket.on('hospital-emergency-alert', handleRefresh);
    socket.on('ambulance-location-updated', handleLocationUpdated);
    socket.on('ambulance-arrived', handleRefresh);

    return () => {
      socket.off('emergency-created', handleRefresh);
      socket.off('emergency-status-updated', handleRefresh);
      socket.off('emergency-updated', handleRefresh);
      socket.off('ambulance-assigned', handleRefresh);
      socket.off('hospital-emergency-alert', handleRefresh);
      socket.off('ambulance-location-updated', handleLocationUpdated);
      socket.off('ambulance-arrived', handleRefresh);
      socket.disconnect();
    };
  }, [user?.id, user?.hospitalName, activeCase?._id]);

  const handleAcceptCase = async (id) => {
    setSubmitting(true);
    try {
      await acceptEmergencyCase(id);
      await refreshDashboard();
      showToast('Emergency case accepted successfully!');
    } catch (acceptError) {
      setError(acceptError?.response?.data?.message || 'Unable to accept emergency.');
      showToast('Failed to accept emergency case.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleContextAction = async () => {
    if (!activeCase) return;
    const nextStatus = statusAfterAction(activeCase.status);
    if (!nextStatus) return;

    setSubmitting(true);
    try {
      await updateEmergencyStatus(activeCase._id, nextStatus);
      await refreshDashboard();
      showToast('Status updated successfully!');
    } catch (updateError) {
      setError(updateError?.response?.data?.message || 'Status update failed.');
      showToast('Failed to update status.');
    } finally {
      setSubmitting(false);
    }
  };
  const handleQrIdentification = async () => {
    if (!activeCase || !qrToken.trim()) {
      setError('Enter a patient QR token to continue the identification flow.');
      return;
    }

    setSubmitting(true);
    try {
      await identifyPatientByQR(activeCase._id, qrToken.trim());
      setQrToken('');
      await refreshDashboard();
      await loadEmergencyProfile(activeCase._id);
      showToast('Patient identified successfully!');
    } catch (qrError) {
      setError(qrError?.response?.data?.message || 'QR patient identification failed.');
      showToast('Failed to identify patient.');
    } finally {
      setSubmitting(false);
    }
  };

  const loadEmergencyProfile = async (id) => {
    setProfileLoading(true);
    try {
      const response = await getEmergencyMedicalProfile(id);
      setProfile(response?.data || null);
      setIsProfileModalOpen(true);
    } catch (profileError) {
      setProfile(null);
      setError(profileError?.response?.data?.message || 'Unable to load emergency profile.');
    } finally {
      setProfileLoading(false);
    }
  };

  const handlePatientSearch = async () => {
    if (!activeCase || !patientSearchQuery.trim()) {
      setError('Enter patient details to search for a match.');
      return;
    }

    setPatientSearchLoading(true);
    setError('');

    try {
      const response = await searchEmergencyCasePatients(activeCase._id, patientSearchQuery.trim());
      setPatientSearchResults(response?.data || []);

      if (!response?.data?.length) {
        showToast('No matching patient was found for this emergency.');
      }
    } catch (searchError) {
      setError(searchError?.response?.data?.message || 'Unable to search patients for this case.');
    } finally {
      setPatientSearchLoading(false);
    }
  };

  const handleConfirmManualIdentity = async () => {
    if (!activeCase || !selectedPatientCandidate) {
      setError('Select a patient before confirming identity.');
      return;
    }

    setSubmitting(true);
    try {
      await confirmManualPatientIdentification(activeCase._id, selectedPatientCandidate._id);
      setIsConfirmPatientModalOpen(false);
      setSelectedPatientCandidate(null);
      setPatientSearchResults([]);
      setPatientSearchQuery('');
      await refreshDashboard();
      showToast('Patient identity confirmed successfully.');
    } catch (confirmError) {
      setError(confirmError?.response?.data?.message || 'Unable to confirm patient identity.');
      showToast('Failed to confirm patient identity.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleFacePhotoChange = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setFacePhotoFile(file);
    const reader = new FileReader();
    reader.onload = () => setFacePhotoPreview(reader.result);
    reader.readAsDataURL(file);
  };

  const clearFacePhoto = () => {
    setFacePhotoFile(null);
    setFacePhotoPreview('');
    setFaceMessage('');
    if (document.getElementById('ambulance-face-photo-input')) {
      document.getElementById('ambulance-face-photo-input').value = '';
    }
  };

  const handleFacePhotoSubmit = async () => {
    if (!activeCase || !facePhotoFile) {
      setError('Take or upload a patient photo before submitting.');
      return;
    }

    setFacePhotoUploading(true);
    setError('');

    try {
      const uploadResponse = await uploadVictimPhoto(facePhotoFile);
      const uploadedPath = uploadResponse?.data?.filePath || uploadResponse?.data?.filename || 'uploads/victim-photo';
      await updateEmergencyDetails(activeCase._id, { victimPhoto: uploadedPath });
      setFaceMessage('Face matching will be available in the next identification phase.');
      showToast('Identification photo attached securely.');
      clearFacePhoto();
    } catch (photoError) {
      setError(photoError?.response?.data?.message || 'Unable to attach the patient photo.');
      showToast('Failed to upload identification photo.');
    } finally {
      setFacePhotoUploading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#0b0d11] text-white">
        <div className="text-center">
          <Loader2 className="animate-spin text-emerald-500 w-10 h-10 mx-auto mb-4" />
          <p className="text-gray-400">Loading Ambulance Dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-[#0b0d11] mesh-bg text-white font-sans overflow-hidden">

      {/* ── Global Toast ── */}
      {toastMessage && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-[100] flex items-center gap-3 bg-[#1a1f2e] border border-emerald-500/30 text-emerald-400 px-5 py-3 rounded-full shadow-2xl text-sm font-semibold animate-slide-down">
          <CheckCircle size={16} /> {toastMessage}
          <button onClick={() => setToastMessage('')} className="ml-2 text-gray-500 hover:text-white">
            <X size={14} />
          </button>
        </div>
      )}

      {/* ── Mobile overlay ── */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden" onClick={() => setMobileOpen(false)} />
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
              <Truck size={20} className="text-emerald-400 drop-shadow-[0_0_8px_rgba(52,211,153,0.4)]" />
            </div>
          </div>
          <div>
            <p className="font-black text-white text-base tracking-tighter leading-tight">MediCare <span className="text-emerald-500">.</span></p>
            <p className="text-[11px] text-emerald-500/80 font-black uppercase tracking-[0.2em] mt-0.5">Ambulance Portal</p>
          </div>
        </div>
        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          <p className="text-xs font-bold text-gray-700 uppercase tracking-widest px-3 mb-2">Menu</p>
          <SidebarLink icon={LayoutGrid} label="Dashboard" active={activeTab === 'overview'} onClick={() => { setActiveTab('overview'); setMobileOpen(false); }} />
          <SidebarLink icon={AlertTriangle} label="Available Emergencies" active={activeTab === 'available'} badge={available.length > 0 ? available.length.toString() : null} onClick={() => { setActiveTab('available'); setMobileOpen(false); }} />
          <SidebarLink icon={Activity} label="Active Emergency" active={activeTab === 'active'} onClick={() => { setActiveTab('active'); setMobileOpen(false); }} />
          <SidebarLink icon={QrCode} label="QR Patient ID" active={activeTab === 'qr'} onClick={() => { setActiveTab('qr'); setMobileOpen(false); }} />
          <div className="my-3 px-3 border-t border-white/[0.04]" />
          <SidebarLink icon={History} label="Emergency History" active={activeTab === 'history'} onClick={() => { setActiveTab('history'); setMobileOpen(false); }} />
          <SidebarLink icon={UserCheck} label="Profile" active={activeTab === 'profile'} onClick={() => { setActiveTab('profile'); setMobileOpen(false); }} />
          <div className="pt-4">
            <p className="text-xs font-bold text-gray-700 uppercase tracking-widest px-3 mb-2">Account</p>
            <SidebarLink icon={Settings} label="Settings" active={activeTab === 'settings'} onClick={() => { setActiveTab('settings'); setMobileOpen(false); }} />
          </div>
        </nav>

        {/* User footer */}
        <div className="p-3 border-t border-white/[0.05]">
          <div className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/[0.05] mb-2">
            <div className="w-8 h-8 rounded-lg bg-gray-800 border border-white/10 flex items-center justify-center overflow-hidden flex-shrink-0">
              {user?.profileImage ? (
                <img src={`${getBaseUrl()}/${user.profileImage}`} alt="Profile" className="w-full h-full object-cover" />
              ) : (
                <span className="text-white font-bold text-sm">{(user?.name || 'A')[0].toUpperCase()}</span>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white text-xs font-semibold truncate">{user?.name || 'Ambulance Driver'}</p>
              <p className="text-gray-600 text-xs truncate">{user?.employeeId || 'EMP001'}</p>
            </div>
          </div>
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
              aria-label="Toggle menu"
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
                <span className="text-xs font-black text-emerald-500/80 uppercase tracking-widest whitespace-nowrap">Emergency Network Active</span>
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]" />
              </div>
              <UniversalSearchBar />
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-3 ml-2">
            {ambulanceProfile?.availabilityStatus === 'AVAILABLE' && (
              <div className="hidden sm:flex items-center gap-2 px-3 py-2 rounded-full bg-green-500/10 border border-green-500/20">
                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                <span className="text-xs font-black text-green-500 uppercase tracking-widest">Available</span>
              </div>
            )}
            <NotificationBell count={notificationCount} notifications={notifications} onClick={markAllNotificationsRead} onMarkRead={markNotificationRead} />
            <div className="flex items-center gap-2 sm:gap-2.5">
              <div className="text-right hidden sm:block">
                <p className="text-xs font-bold text-white truncate max-w-[80px]">{user?.name || 'Driver'}</p>
                <p className="text-xs text-gray-600 truncate">#{user?.employeeId || 'EMP001'}</p>
              </div>
              <div className="w-8 h-8 rounded-xl bg-gray-800 border border-white/10 flex items-center justify-center overflow-hidden flex-shrink-0">
                {user?.profileImage ? (
                  <img src={`${getBaseUrl()}/${user.profileImage}`} alt="Profile" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-white font-bold text-sm">{(user?.name || 'A')[0].toUpperCase()}</span>
                )}
              </div>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-7xl mx-auto px-5 lg:px-8 py-7">

            {error && (
              <div className="mb-6 rounded-2xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                <div className="flex items-center gap-2">
                  <AlertCircle size={16} />
                  {error}
                </div>
              </div>
            )}

            {/* Overview Tab */}
            {activeTab === 'overview' && (
              <>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
                  <div>
                    <h1 className="text-2xl sm:text-3xl font-bold">Emergency Dashboard</h1>
                    <p className="text-gray-400 mt-1 text-sm sm:text-base">Real-time ambulance operations and emergency response</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                  <StatCard
                    icon={AlertTriangle}
                    title="Available Emergencies"
                    value={available.length}
                    color="text-yellow-500"
                    bg="bg-yellow-500/10"
                    onClick={() => setActiveTab('available')}
                  />
                  <StatCard
                    icon={Activity}
                    title="Active Emergency"
                    value={activeCase ? '1' : '0'}
                    color="text-emerald-500"
                    bg="bg-emerald-500/10"
                    onClick={() => setActiveTab('active')}
                  />
                  <StatCard
                    icon={History}
                    title="Completed Today"
                    value={assigned.filter(c => c.status === 'CLOSED' || c.status === 'ARRIVED_AT_HOSPITAL').length}
                    color="text-blue-500"
                    bg="bg-blue-500/10"
                  />
                  <StatCard
                    icon={CheckCircle}
                    title="Response Status"
                    value={ambulanceProfile?.availabilityStatus || 'AVAILABLE'}
                    color="text-green-500"
                    bg="bg-green-500/10"
                  />
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                  <div className="lg:col-span-2 space-y-6">
                    {/* Available Emergencies */}
                    <div className="bg-[#111] border border-gray-800 rounded-2xl p-6">
                      <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
                        <AlertTriangle className="text-yellow-500" /> Available Emergencies
                      </h3>
                      <div className="space-y-4">
                        {available.length === 0 ? (
                          <div className="text-center py-12 bg-white/[0.02] border border-white/5 rounded-2xl">
                            <AlertTriangle className="w-12 h-12 text-gray-700 mx-auto mb-4" />
                            <p className="text-gray-500">No emergency cases waiting for ambulance assignment.</p>
                          </div>
                        ) : (
                          available.slice(0, 3).map((item) => (
                            <div key={item._id} className="bg-[#1a1a1a] border border-gray-800 rounded-xl p-4 hover:border-yellow-500/30 transition-colors">
                              <div className="flex items-start justify-between mb-3">
                                <div>
                                  <div className="flex items-center gap-2 mb-1">
                                    <span className="font-bold text-lg">{item.incidentType || 'Emergency'}</span>
                                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${SEVERITY_CLASSES[item.severity] || 'bg-gray-500/10 text-gray-300'}`}>
                                      {item.severity}
                                    </span>
                                  </div>
                                  <p className="text-sm text-gray-400">{STATUS_LABELS[item.status] || item.status}</p>
                                </div>
                              </div>

                              <div className="space-y-2 text-sm text-gray-300 mb-4">
                                <div className="flex items-center gap-2">
                                  <User size={16} className="text-gray-400 flex-shrink-0" />
                                  <span>
                                    Patient: <strong className={item.patient?.name ? 'text-white' : 'text-amber-400 font-semibold'}>{item.patient?.name || 'Not Identified'}</strong>
                                  </span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <MapPin size={16} className="text-emerald-400 flex-shrink-0" />
                                  <span className="truncate">{item.location?.address || 'Address unavailable'}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Clock3 size={16} className="text-blue-400 flex-shrink-0" />
                                  <span>{formatRelativeTime(item.createdAt)}</span>
                                </div>
                                {item.assignedHospital && (
                                  <div className="flex items-center gap-2">
                                    <Hospital size={16} className="text-purple-400 flex-shrink-0" />
                                    <span className="truncate">{item.assignedHospital}</span>
                                  </div>
                                )}
                                {item.victimPhoto && (
                                  <div className="flex items-center gap-2 text-xs text-purple-300 bg-purple-500/10 px-2 py-1 rounded-lg border border-purple-500/20">
                                    <Camera size={14} />
                                    <span>Victim Photo Attached</span>
                                  </div>
                                )}
                              </div>

                              <button
                                onClick={() => handleAcceptCase(item._id)}
                                disabled={submitting}
                                className="w-full bg-emerald-500 hover:bg-emerald-400 text-black font-bold py-2 px-4 rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                              >
                                {submitting ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle size={16} />}
                                Accept Emergency
                              </button>
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    {/* Active Emergency */}
                    <div className="bg-[#111] border border-gray-800 rounded-2xl p-6">
                      <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
                        <Activity className="text-emerald-500" /> Active Emergency
                      </h3>
                      {activeCase ? (
                        <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-4">
                          <div className="flex flex-wrap items-center gap-3 mb-4">
                            <span className="bg-emerald-500/20 text-emerald-400 px-3 py-1 text-xs font-semibold rounded-full">{STATUS_LABELS[activeCase.status] || activeCase.status}</span>
                            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${SEVERITY_CLASSES[activeCase.severity] || 'bg-gray-500/10 text-gray-300'}`}>
                              {activeCase.severity}
                            </span>
                          </div>

                          <div className="grid gap-3 text-sm text-gray-300 md:grid-cols-2 mb-4">
                            <div><span className="text-gray-500">Incident:</span> {activeCase.incidentType}</div>
                            <div><span className="text-gray-500">Hospital:</span> {activeCase.assignedHospital || 'Pending allocation'}</div>
                            <div className="md:col-span-2"><span className="text-gray-500">Address:</span> {activeCase.location?.address || 'Address unavailable'}</div>
                          </div>

                          <button
                            onClick={handleContextAction}
                            disabled={submitting || !statusAfterAction(activeCase.status)}
                            className="bg-emerald-500 hover:bg-emerald-400 text-black font-bold py-2 px-6 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                          >
                            {submitting ? <Loader2 size={16} className="animate-spin" /> : <Navigation size={16} />}
                            {submitting ? 'Updating...' : nextContextualAction(activeCase.status)}
                          </button>
                        </div>
                      ) : (
                        <div className="text-center py-12 bg-white/[0.02] border border-white/5 rounded-2xl">
                          <Activity className="w-12 h-12 text-gray-700 mx-auto mb-4" />
                          <p className="text-gray-500">No active emergency assignment.</p>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="lg:col-span-1 space-y-6">
                    {/* Ambulance Profile */}
                    <div className="bg-[#111] border border-gray-800 rounded-2xl p-6">
                      <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
                        <UserCheck className="text-blue-500" /> Ambulance Profile
                      </h3>
                      {ambulanceProfile ? (
                        <div className="space-y-3 text-sm">
                          <div className="flex justify-between">
                            <span className="text-gray-500">Driver Name:</span>
                            <span className="text-white font-medium">{ambulanceProfile.name}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-500">Employee ID:</span>
                            <span className="text-white font-mono">{ambulanceProfile.employeeId}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-500">Hospital:</span>
                            <span className="text-white">{ambulanceProfile.hospitalOrOrganization || ambulanceProfile.hospitalName}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-500">Vehicle #:</span>
                            <span className="text-white font-mono">{ambulanceProfile.ambulanceVehicleNumber}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-500">Type:</span>
                            <span className="text-white">{ambulanceProfile.ambulanceType}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-500">Status:</span>
                            <span className={`font-bold ${ambulanceProfile.availabilityStatus === 'AVAILABLE' ? 'text-green-400' : 'text-yellow-400'}`}>
                              {ambulanceProfile.availabilityStatus}
                            </span>
                          </div>
                        </div>
                      ) : (
                        <div className="text-center py-8">
                          <User className="w-8 h-8 text-gray-700 mx-auto mb-2" />
                          <p className="text-gray-500 text-sm">Loading profile...</p>
                        </div>
                      )}
                    </div>

                    {/* QR Identification */}
                    <div className="bg-[#111] border border-gray-800 rounded-2xl p-6">
                      <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
                        <QrCode className="text-purple-500" /> Patient Identification
                      </h3>
                      <div className="space-y-4">
                        <input
                          type="text"
                          value={qrToken}
                          onChange={(e) => setQrToken(e.target.value)}
                          placeholder="Enter patient QR token"
                          className="w-full bg-[#1a1a1a] border border-gray-800 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 transition-colors"
                        />
                        <button
                          onClick={handleQrIdentification}
                          disabled={submitting || !qrToken.trim() || !activeCase}
                          className="w-full bg-purple-500 hover:bg-purple-400 text-white font-bold py-2 px-4 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        >
                          {submitting ? <Loader2 size={16} className="animate-spin" /> : <QrCode size={16} />}
                          Identify Patient
                        </button>
                        {!activeCase && (
                          <p className="text-xs text-gray-500 text-center">Accept an emergency case first</p>
                        )}
                      </div>
                    </div>

                    {/* Emergency History Summary */}
                    <div className="bg-[#111] border border-gray-800 rounded-2xl p-6">
                      <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
                        <History className="text-gray-400" /> Recent Activity
                      </h3>
                      <div className="space-y-3">
                        {assigned.slice(0, 3).map((item) => (
                          <div key={item._id} className="flex items-center justify-between p-3 bg-[#1a1a1a] rounded-lg border border-gray-800">
                            <div>
                              <p className="font-medium text-sm text-white">{item.incidentType}</p>
                              <p className="text-xs text-gray-500">{STATUS_LABELS[item.status]}</p>
                            </div>
                            <span className={`text-xs px-2 py-1 rounded-full ${SEVERITY_CLASSES[item.severity] || 'bg-gray-500/10 text-gray-300'}`}>
                              {item.severity}
                            </span>
                          </div>
                        ))}
                        {assigned.length === 0 && (
                          <p className="text-gray-500 text-sm text-center py-4">No recent activity.</p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}
            {/* Available Emergencies Tab */}
            {activeTab === 'available' && (
              <div className="space-y-6">
                <h2 className="text-3xl font-bold">Available Emergencies</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {available.length === 0 ? (
                    <div className="col-span-full text-center py-20 bg-[#111] border border-gray-800 rounded-3xl">
                      <AlertTriangle className="w-16 h-16 text-gray-700 mx-auto mb-4" />
                      <h3 className="text-xl font-bold mb-2 text-gray-300">No Emergency Cases</h3>
                      <p className="text-gray-500">There are currently no emergency cases waiting for ambulance assignment.</p>
                    </div>
                  ) : (
                    available.map((item) => (
                      <div key={item._id} className="bg-[#111] border border-gray-800 rounded-2xl p-6 hover:border-yellow-500/30 transition-colors">
                        <div className="flex items-start justify-between mb-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-2">
                              <span className="font-bold text-xl text-white">{item.incidentType || 'Emergency'}</span>
                              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${SEVERITY_CLASSES[item.severity] || 'bg-gray-500/10 text-gray-300'}`}>
                                {item.severity}
                              </span>
                            </div>
                            <p className="text-sm text-gray-400 mb-4">{STATUS_LABELS[item.status] || item.status}</p>
                          </div>
                        </div>

                        <div className="space-y-3 text-sm text-gray-300 mb-6">
                          <div className="flex items-start gap-3">
                            <User size={18} className="text-gray-400 flex-shrink-0 mt-0.5" />
                            <div>
                              <p className="font-medium text-white">Patient Identity</p>
                              <p className={item.patient?.name ? 'text-white font-semibold' : 'text-amber-400 font-semibold'}>
                                {item.patient?.name || 'Not Identified'}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-start gap-3">
                            <MapPin size={18} className="text-emerald-400 flex-shrink-0 mt-0.5" />
                            <div>
                              <p className="font-medium text-white">Location</p>
                              <p>{item.location?.address || 'Address unavailable'}</p>
                            </div>
                          </div>
                          <div className="flex items-start gap-3">
                            <Clock3 size={18} className="text-blue-400 flex-shrink-0 mt-0.5" />
                            <div>
                              <p className="font-medium text-white">Reported</p>
                              <p>{formatRelativeTime(item.createdAt)}</p>
                            </div>
                          </div>
                          {item.assignedHospital && (
                            <div className="flex items-start gap-3">
                              <Hospital size={18} className="text-purple-400 flex-shrink-0 mt-0.5" />
                              <div>
                                <p className="font-medium text-white">Assigned Hospital</p>
                                <p>{item.assignedHospital}</p>
                              </div>
                            </div>
                          )}
                          {item.victimPhoto && (
                            <div className="flex items-center gap-2 text-xs text-purple-300 bg-purple-500/10 px-3 py-2 rounded-xl border border-purple-500/20">
                              <Camera size={16} />
                              <span>Victim Photo Attached</span>
                            </div>
                          )}
                          {item.reporterPhone && (
                            <div className="flex items-start gap-3">
                              <Phone size={18} className="text-orange-400 flex-shrink-0 mt-0.5" />
                              <div>
                                <p className="font-medium text-white">Reporter Contact</p>
                                <p>{item.reporterPhone}</p>
                              </div>
                            </div>
                          )}
                        </div>

                        <button
                          onClick={() => handleAcceptCase(item._id)}
                          disabled={submitting}
                          className="w-full bg-emerald-500 hover:bg-emerald-400 text-black font-bold py-3 px-4 rounded-xl transition-colors disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-emerald-900/20"
                        >
                          {submitting ? <Loader2 size={18} className="animate-spin" /> : <CheckCircle size={18} />}
                          Accept Emergency Case
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* Active Emergency Tab */}
            {activeTab === 'active' && (
              <div className="space-y-6">
                <h2 className="text-3xl font-bold">Active Emergency</h2>
                {activeCase ? (
                  <div className="bg-[#111] border border-gray-800 rounded-2xl p-6">
                    <div className="flex flex-wrap items-center gap-3 mb-6">
                      <span className="bg-emerald-500/20 text-emerald-400 px-4 py-2 text-sm font-semibold rounded-full">{STATUS_LABELS[activeCase.status] || activeCase.status}</span>
                      <span className={`rounded-full px-4 py-2 text-sm font-semibold ${SEVERITY_CLASSES[activeCase.severity] || 'bg-gray-500/10 text-gray-300'}`}>
                        {activeCase.severity} PRIORITY
                      </span>
                    </div>

                    <div className="grid gap-6 md:grid-cols-2 mb-6">
                      <div className="space-y-4">
                        <h4 className="text-lg font-bold text-white">Emergency Details</h4>
                        <div className="space-y-3 text-sm">
                          <div><span className="text-gray-500">Incident Type:</span> <span className="text-white font-medium">{activeCase.incidentType}</span></div>
                          <div><span className="text-gray-500">Hospital:</span> <span className="text-white font-medium">{activeCase.assignedHospital || 'Pending allocation'}</span></div>
                          <div><span className="text-gray-500">Address:</span> <span className="text-white font-medium">{activeCase.location?.address || 'Address unavailable'}</span></div>
                          <div><span className="text-gray-500">Patient:</span> <span className={activeCase.patient?.name ? "text-emerald-400 font-bold" : "text-amber-400 font-bold"}>{activeCase.patient?.name || 'Not Identified'}</span></div>
                        </div>
                      </div>

                      <div className="space-y-4">
                        <h4 className="text-lg font-bold text-white">Timeline</h4>
                        <div className="bg-[#1a1a1a] border border-gray-800 rounded-xl p-4 space-y-2 text-sm max-h-48 overflow-y-auto">
                          {activeCase.statusTimestamps && Object.entries(activeCase.statusTimestamps).map(([key, value]) => (
                            <div key={key} className="flex justify-between gap-4 border-b border-gray-800 pb-2 last:border-b-0 last:pb-0">
                              <span className="text-gray-300">{STATUS_LABELS[key] || key}</span>
                              <span className="text-gray-500 text-xs">{formatRelativeTime(value)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Patient Confirmed Status (for IT'S ME) */}
                    {activeCase.patient && (
                      <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 mb-6">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 flex items-center justify-center shrink-0">
                            <UserCheck size={20} />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-black uppercase tracking-wider text-emerald-400">PATIENT CONFIRMED</span>
                              <span className="text-[10px] font-bold bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-full border border-emerald-500/30">Verified Account</span>
                            </div>
                            <p className="text-base font-bold text-white mt-0.5">{activeCase.patient.name}</p>
                            <p className="text-xs text-gray-400">Authenticated patient identity confirmed automatically.</p>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Live Emergency Map */}
                    <div className="mb-6">
                      <EmergencyMap
                        patientLocation={activeCase.location}
                        ambulanceLocation={ambulanceGps || activeCase.ambulanceLocation}
                        patientName={activeCase.patient?.name || 'Emergency Pickup'}
                        status={activeCase.status}
                        distanceMeters={driverDistance}
                        etaMinutes={driverEta}
                        isAmbulanceView={true}
                      />
                    </div>

                    {!activeCase.patient && ['AMBULANCE_ASSIGNED', 'AMBULANCE_ARRIVED'].includes(activeCase.status) && (
                      <div className="mt-6 bg-[#0d1117] border border-amber-500/20 rounded-2xl p-5">
                        <div className="flex items-center justify-between mb-4">
                          <h4 className="text-xl font-bold text-white">PATIENT IDENTIFICATION</h4>
                          <span className="text-sm font-medium text-emerald-400">Patient: {activeCase.patient ? activeCase.patient.name : 'Not Identified'}</span>
                        </div>

                        <div className="grid gap-3 sm:grid-cols-3">
                          <button
                            onClick={() => setActiveTab('qr')}
                            className="flex items-center justify-center gap-2 rounded-xl border border-purple-500/30 bg-purple-500/10 px-4 py-3 text-sm font-semibold text-purple-200 hover:bg-purple-500/20 transition-colors"
                          >
                            <QrCode size={18} /> Scan QR
                          </button>
                          <button
                            onClick={() => setIdentityMode('face')}
                            className="flex items-center justify-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm font-semibold text-amber-100 hover:bg-amber-500/20 transition-colors"
                          >
                            <Camera size={18} /> Identify by Face
                          </button>
                          <button
                            onClick={() => setIdentityMode('manual')}
                            className="flex items-center justify-center gap-2 rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-4 py-3 text-sm font-semibold text-cyan-100 hover:bg-cyan-500/20 transition-colors"
                          >
                            <Search size={18} /> Manual Search
                          </button>
                        </div>

                        {identityMode === 'face' && (
                          <div className="mt-5 rounded-2xl border border-white/10 bg-[#111] p-4">
                            <p className="text-sm text-gray-300 mb-4">Take a clear photo of the patient if it is safe to do so.</p>
                            <div className="grid gap-3 sm:grid-cols-2">
                              <button
                                type="button"
                                onClick={() => document.getElementById('ambulance-face-photo-input')?.click()}
                                className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-white/15 bg-[#0b0d11] px-4 py-3 text-sm font-semibold text-gray-200 hover:border-amber-400/40"
                              >
                                <Camera size={18} /> Take Photo
                              </button>
                              <button
                                type="button"
                                onClick={() => document.getElementById('ambulance-face-photo-input')?.click()}
                                className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-white/15 bg-[#0b0d11] px-4 py-3 text-sm font-semibold text-gray-200 hover:border-emerald-400/40"
                              >
                                <Upload size={18} /> Upload Photo
                              </button>
                            </div>
                            <input
                              id="ambulance-face-photo-input"
                              type="file"
                              accept="image/*"
                              capture="environment"
                              onChange={handleFacePhotoChange}
                              className="hidden"
                            />

                            {facePhotoPreview && (
                              <div className="mt-4 rounded-2xl border border-white/10 bg-[#0b0d11] p-3">
                                <img src={facePhotoPreview} alt="Patient identification preview" className="w-full max-h-64 object-cover rounded-xl" />
                                <div className="mt-3 flex gap-2">
                                  <button type="button" onClick={() => document.getElementById('ambulance-face-photo-input')?.click()} className="rounded-lg border border-white/10 px-3 py-2 text-xs font-medium text-gray-200">Retake</button>
                                  <button type="button" onClick={clearFacePhoto} className="rounded-lg border border-red-500/30 px-3 py-2 text-xs font-medium text-red-300 flex items-center gap-2"><Trash2 size={14} /> Remove</button>
                                  <button type="button" onClick={handleFacePhotoSubmit} disabled={facePhotoUploading || !facePhotoFile} className="ml-auto rounded-lg bg-emerald-500 px-3 py-2 text-xs font-bold text-black disabled:opacity-60">{facePhotoUploading ? 'Uploading...' : 'Submit'}</button>
                                </div>
                              </div>
                            )}

                            <p className="mt-4 text-sm text-amber-200">Face matching will be available in the next identification phase.</p>
                            {faceMessage && <p className="mt-2 text-xs text-emerald-300">{faceMessage}</p>}
                          </div>
                        )}

                        {identityMode === 'manual' && (
                          <div className="mt-5 rounded-2xl border border-white/10 bg-[#111] p-4">
                            <h5 className="text-lg font-semibold text-white mb-3">SEARCH PATIENT</h5>
                            <div className="flex gap-2">
                              <input
                                type="text"
                                value={patientSearchQuery}
                                onChange={(e) => setPatientSearchQuery(e.target.value)}
                                placeholder="Patient ID, phone, or name"
                                className="w-full rounded-xl border border-gray-700 bg-[#0b0d11] px-3 py-2 text-sm text-white placeholder-gray-500"
                              />
                              <button onClick={handlePatientSearch} disabled={patientSearchLoading || !patientSearchQuery.trim()} className="rounded-xl bg-cyan-500 px-4 py-2 text-sm font-bold text-black disabled:opacity-60">
                                {patientSearchLoading ? 'Searching...' : 'Search'}
                              </button>
                            </div>
                            <div className="mt-4 space-y-2">
                              {patientSearchResults.length > 0 ? patientSearchResults.map((patient) => (
                                <div key={patient._id} className="flex items-center justify-between rounded-xl border border-white/10 bg-[#0b0d11] px-3 py-3">
                                  <div>
                                    <p className="font-semibold text-white">{patient.name}</p>
                                    <p className="text-xs text-gray-400">ID: {patient._id?.slice(-6)} • {patient.phone || 'No phone'}</p>
                                  </div>
                                  <button onClick={() => { setSelectedPatientCandidate(patient); setIsConfirmPatientModalOpen(true); }} className="rounded-lg bg-emerald-500 px-3 py-2 text-xs font-bold text-black">Select</button>
                                </div>
                              )) : (
                                <p className="text-sm text-gray-400">Search using an existing patient identifier to confirm identity.</p>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    <div className="flex flex-wrap gap-4 mt-6">
                      {statusAfterAction(activeCase.status) && (
                        <button
                          onClick={handleContextAction}
                          disabled={submitting || !statusAfterAction(activeCase.status)}
                          className="bg-emerald-500 hover:bg-emerald-400 text-black font-bold py-3 px-6 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-lg shadow-emerald-900/20"
                        >
                          {submitting ? <Loader2 size={18} className="animate-spin" /> : <Navigation size={18} />}
                          {submitting ? 'Updating Status...' : nextContextualAction(activeCase.status)}
                        </button>
                      )}

                      {activeCase.patient && (
                        <button
                          onClick={() => loadEmergencyProfile(activeCase._id)}
                          disabled={profileLoading}
                          className="bg-blue-500 hover:bg-blue-400 text-white font-bold py-3 px-6 rounded-xl transition-colors disabled:opacity-50 flex items-center gap-2"
                        >
                          {profileLoading ? <Loader2 size={18} className="animate-spin" /> : <FileText size={18} />}
                          {profileLoading ? 'Loading...' : 'View Medical Profile'}
                        </button>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-20 bg-[#111] border border-gray-800 rounded-3xl">
                    <Activity className="w-16 h-16 text-gray-700 mx-auto mb-4" />
                    <h3 className="text-xl font-bold mb-2 text-gray-300">No Active Emergency</h3>
                    <p className="text-gray-500 mb-6">You don't have any active emergency assignments at the moment.</p>
                    <button
                      onClick={() => setActiveTab('available')}
                      className="bg-emerald-500 hover:bg-emerald-400 text-black font-bold py-2 px-6 rounded-xl transition-colors"
                    >
                      View Available Emergencies
                    </button>
                  </div>
                )}
              </div>
            )}
            {/* QR Patient Identification Tab */}
            {activeTab === 'qr' && (
              <div className="space-y-6">
                <h2 className="text-3xl font-bold">QR Patient Identification</h2>
                <div className="bg-[#111] border border-gray-800 rounded-2xl p-6">
                  <div className="max-w-md mx-auto space-y-6">
                    <div className="text-center">
                      <div className="w-20 h-20 bg-purple-500/10 rounded-3xl flex items-center justify-center mx-auto mb-4">
                        <QrCode size={40} className="text-purple-500" />
                      </div>
                      <h3 className="text-xl font-bold mb-2">Scan Patient QR Code</h3>
                      <p className="text-gray-400 text-sm">Enter the QR token from the patient's medical ID to identify them during emergency response.</p>
                    </div>

                    {activeCase && (
                      <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-4 mb-4">
                        <p className="text-emerald-400 text-sm font-medium">Active Emergency: {activeCase.incidentType}</p>
                        <p className="text-gray-300 text-xs">{activeCase.location?.address}</p>
                      </div>
                    )}

                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">Patient QR Token</label>
                        <input
                          type="text"
                          value={qrToken}
                          onChange={(e) => setQrToken(e.target.value)}
                          placeholder="Enter QR token (e.g., MED123456)"
                          className="w-full bg-[#1a1a1a] border border-gray-800 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 transition-colors text-center font-mono"
                        />
                      </div>

                      <button
                        onClick={handleQrIdentification}
                        disabled={submitting || !qrToken.trim() || !activeCase}
                        className="w-full bg-purple-500 hover:bg-purple-400 text-white font-bold py-3 px-4 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                      >
                        {submitting ? <Loader2 size={18} className="animate-spin" /> : <QrCode size={18} />}
                        {submitting ? 'Identifying Patient...' : 'Identify Patient'}
                      </button>

                      {!activeCase && (
                        <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-4">
                          <p className="text-yellow-400 text-sm">⚠️ You need an active emergency case to identify a patient.</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Emergency History Tab */}
            {activeTab === 'history' && (
              <div className="space-y-6">
                <h2 className="text-3xl font-bold">Emergency History</h2>
                <div className="space-y-4">
                  {assigned.length === 0 ? (
                    <div className="text-center py-20 bg-[#111] border border-gray-800 rounded-3xl">
                      <History className="w-16 h-16 text-gray-700 mx-auto mb-4" />
                      <h3 className="text-xl font-bold mb-2 text-gray-300">No Emergency History</h3>
                      <p className="text-gray-500">You haven't been assigned any emergency cases yet.</p>
                    </div>
                  ) : (
                    assigned.map((item) => (
                      <div key={item._id} className="bg-[#111] border border-gray-800 rounded-2xl p-6 hover:border-gray-700 transition-colors">
                        <div className="flex items-start justify-between mb-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-2">
                              <span className="font-bold text-lg text-white">{item.incidentType}</span>
                              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${SEVERITY_CLASSES[item.severity] || 'bg-gray-500/10 text-gray-300'}`}>
                                {item.severity}
                              </span>
                            </div>
                            <p className="text-sm text-gray-400">{STATUS_LABELS[item.status] || item.status}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-xs text-gray-500">Completed</p>
                            <p className="text-sm font-medium text-white">{formatRelativeTime(item.updatedAt || item.createdAt)}</p>
                          </div>
                        </div>

                        <div className="grid gap-4 md:grid-cols-2 text-sm text-gray-300">
                          <div><span className="text-gray-500">Hospital:</span> {item.assignedHospital || 'Unassigned'}</div>
                          <div><span className="text-gray-500">Duration:</span> {item.statusTimestamps ? 'Completed workflow' : 'Unknown'}</div>
                          <div className="md:col-span-2"><span className="text-gray-500">Location:</span> {item.location?.address || 'Address unavailable'}</div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* Profile Tab */}
            {activeTab === 'profile' && (
              <div className="space-y-6">
                <h2 className="text-3xl font-bold">Ambulance Profile</h2>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  <div className="bg-[#111] border border-gray-800 rounded-2xl p-6">
                    <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
                      <User className="text-blue-500" /> Driver Information
                    </h3>
                    {ambulanceProfile ? (
                      <div className="space-y-4">
                        <div className="flex items-center gap-4 mb-4">
                          <div className="w-16 h-16 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
                            {user?.profileImage ? (
                              <img src={`${getBaseUrl()}/${user.profileImage}`} alt="Profile" className="w-full h-full object-cover rounded-2xl" />
                            ) : (
                              <User size={28} className="text-blue-500" />
                            )}
                          </div>
                          <div>
                            <h4 className="text-lg font-bold text-white">{ambulanceProfile.name}</h4>
                            <p className="text-sm text-gray-400">Emergency Response Driver</p>
                          </div>
                        </div>

                        <div className="grid gap-4 text-sm">
                          <div className="flex justify-between items-center p-3 bg-[#1a1a1a] rounded-xl">
                            <span className="text-gray-400">Employee ID</span>
                            <span className="text-white font-mono">{ambulanceProfile.employeeId}</span>
                          </div>
                          <div className="flex justify-between items-center p-3 bg-[#1a1a1a] rounded-xl">
                            <span className="text-gray-400">Hospital</span>
                            <span className="text-white">{ambulanceProfile.hospitalOrOrganization || ambulanceProfile.hospitalName}</span>
                          </div>
                          <div className="flex justify-between items-center p-3 bg-[#1a1a1a] rounded-xl">
                            <span className="text-gray-400">Vehicle Number</span>
                            <span className="text-white font-mono">{ambulanceProfile.ambulanceVehicleNumber}</span>
                          </div>
                          <div className="flex justify-between items-center p-3 bg-[#1a1a1a] rounded-xl">
                            <span className="text-gray-400">Ambulance Type</span>
                            <span className="text-white">{ambulanceProfile.ambulanceType}</span>
                          </div>
                          <div className="flex justify-between items-center p-3 bg-[#1a1a1a] rounded-xl">
                            <span className="text-gray-400">Current Status</span>
                            <span className={`font-bold ${ambulanceProfile.availabilityStatus === 'AVAILABLE' ? 'text-green-400' : ambulanceProfile.availabilityStatus === 'OFF_DUTY' ? 'text-yellow-400' : 'text-red-400'}`}>
                              {ambulanceProfile.availabilityStatus}
                            </span>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="text-center py-8">
                        <Loader2 className="w-8 h-8 text-gray-700 mx-auto mb-2 animate-spin" />
                        <p className="text-gray-500 text-sm">Loading profile...</p>
                      </div>
                    )}
                  </div>

                  <div className="space-y-6">
                    <div className="bg-[#111] border border-gray-800 rounded-2xl p-6">
                      <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
                        <Activity className="text-emerald-500" /> Performance Summary
                      </h3>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="text-center p-4 bg-[#1a1a1a] rounded-xl">
                          <p className="text-2xl font-bold text-white">{assigned.length}</p>
                          <p className="text-xs text-gray-400 uppercase tracking-wider">Total Cases</p>
                        </div>
                        <div className="text-center p-4 bg-[#1a1a1a] rounded-xl">
                          <p className="text-2xl font-bold text-green-400">{assigned.filter(c => c.status === 'CLOSED' || c.status === 'ARRIVED_AT_HOSPITAL').length}</p>
                          <p className="text-xs text-gray-400 uppercase tracking-wider">Completed</p>
                        </div>
                        <div className="text-center p-4 bg-[#1a1a1a] rounded-xl">
                          <p className="text-2xl font-bold text-blue-400">{activeCase ? '1' : '0'}</p>
                          <p className="text-xs text-gray-400 uppercase tracking-wider">Active</p>
                        </div>
                        <div className="text-center p-4 bg-[#1a1a1a] rounded-xl">
                          <p className="text-2xl font-bold text-emerald-400">{ambulanceProfile?.availabilityStatus === 'AVAILABLE' ? '●' : '○'}</p>
                          <p className="text-xs text-gray-400 uppercase tracking-wider">Status</p>
                        </div>
                      </div>
                    </div>

                    <div className="bg-[#111] border border-gray-800 rounded-2xl p-6">
                      <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
                        <Settings className="text-gray-500" /> Quick Actions
                      </h3>
                      <div className="space-y-3">
                        <button
                          onClick={() => handleAvailabilityChange('AVAILABLE')}
                          disabled={availabilityLoading}
                          className="w-full text-left p-3 bg-[#1a1a1a] hover:bg-[#222] rounded-xl transition-colors flex items-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {availabilityLoading ? (
                            <Loader2 size={18} className="text-green-500 animate-spin" />
                          ) : (
                            <CheckCircle size={18} className="text-green-500" />
                          )}
                          <span className="text-white">
                            {availabilityLoading ? 'Updating...' : 'Mark Available'}
                          </span>
                        </button>
                        <button
                          onClick={() => handleAvailabilityChange('OFF_DUTY')}
                          disabled={availabilityLoading}
                          className="w-full text-left p-3 bg-[#1a1a1a] hover:bg-[#222] rounded-xl transition-colors flex items-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {availabilityLoading ? (
                            <Loader2 size={18} className="text-yellow-500 animate-spin" />
                          ) : (
                            <Clock size={18} className="text-yellow-500" />
                          )}
                          <span className="text-white">
                            {availabilityLoading ? 'Updating...' : 'Mark Off Duty'}
                          </span>
                        </button>
                        <button className="w-full text-left p-3 bg-[#1a1a1a] hover:bg-[#222] rounded-xl transition-colors flex items-center gap-3">
                          <Settings size={18} className="text-gray-500" />
                          <span className="text-white">Update Profile</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </main>
      </div >
      {/* Medical Profile Modal */}
      {isConfirmPatientModalOpen && selectedPatientCandidate && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-3xl border border-white/10 bg-[#111] p-5 shadow-2xl">
            <h3 className="text-xl font-bold text-white">Confirm Patient Identity</h3>
            <p className="mt-2 text-sm text-gray-400">Please verify the selected patient before proceeding.</p>
            <div className="mt-5 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-emerald-300">Patient</p>
              <div className="mt-3 space-y-2 text-sm text-gray-200">
                <div className="flex justify-between gap-3"><span className="text-gray-400">Name:</span><span className="font-semibold text-white">{selectedPatientCandidate.name}</span></div>
                <div className="flex justify-between gap-3"><span className="text-gray-400">Patient ID:</span><span className="font-mono text-white">{selectedPatientCandidate._id}</span></div>
                <div className="flex justify-between gap-3"><span className="text-gray-400">Phone:</span><span className="text-white">{selectedPatientCandidate.phone || 'Not provided'}</span></div>
              </div>
            </div>
            <div className="mt-5 flex gap-3">
              <button onClick={() => { setIsConfirmPatientModalOpen(false); setSelectedPatientCandidate(null); }} className="flex-1 rounded-xl border border-white/10 bg-[#0b0d11] px-4 py-3 text-sm font-semibold text-gray-200">Cancel</button>
              <button onClick={handleConfirmManualIdentity} disabled={submitting} className="flex-1 rounded-xl bg-emerald-500 px-4 py-3 text-sm font-bold text-black disabled:opacity-60">{submitting ? 'Confirming...' : 'Confirm Identity'}</button>
            </div>
          </div>
        </div>
      )}

      {
        isProfileModalOpen && profile && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-[#111] border border-gray-800 rounded-3xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl">
              <div className="p-6 border-b border-gray-800 flex justify-between items-center sticky top-0 bg-[#111] z-10 rounded-t-3xl">
                <h2 className="text-xl font-bold flex items-center gap-2">
                  <FileText size={20} className="text-blue-500" />
                  Emergency Medical Profile
                </h2>
                <button
                  onClick={() => setIsProfileModalOpen(false)}
                  className="text-gray-500 hover:text-white bg-gray-900 rounded-full p-2 transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="p-6 space-y-6">
                <div className="bg-blue-500/5 border border-blue-500/20 rounded-2xl p-4">
                  <h3 className="font-bold text-lg text-white mb-3">Patient Information</h3>
                  <div className="grid gap-3 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-400">Name:</span>
                      <span className="text-white font-medium">{profile.patient?.name || 'Not available'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Age / DOB:</span>
                      <span className="text-white">{profile.patient?.ageApprox || profile.patient?.dob || 'Not provided'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Blood Group:</span>
                      <span className="text-red-400 font-bold">{profile.patient?.bloodGroup || 'Unknown'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Emergency Contact:</span>
                      <span className="text-white font-mono">{profile.patient?.emergencyContact || profile.patient?.guardianNumber || 'Not provided'}</span>
                    </div>
                  </div>
                </div>

                <div className="bg-red-500/5 border border-red-500/20 rounded-2xl p-4">
                  <h3 className="font-bold text-lg text-white mb-3">⚠️ Critical Medical Information</h3>
                  <div className="space-y-3 text-sm">
                    <div>
                      <span className="text-gray-400 block mb-1">Allergies:</span>
                      <span className="text-red-300">{(profile.patient?.allergies || []).join(', ') || 'None recorded'}</span>
                    </div>
                    <div>
                      <span className="text-gray-400 block mb-1">Chronic Diseases:</span>
                      <span className="text-orange-300">{(profile.patient?.chronicDiseases || []).join(', ') || 'None recorded'}</span>
                    </div>
                    <div>
                      <span className="text-gray-400 block mb-1">Current Medications:</span>
                      <span className="text-yellow-300">{(profile.patient?.currentMedications || []).join(', ') || 'None recorded'}</span>
                    </div>
                  </div>
                </div>

                {profile.patient?.insuranceProviderName && (
                  <div className="bg-green-500/5 border border-green-500/20 rounded-2xl p-4">
                    <h3 className="font-bold text-lg text-white mb-3">Insurance Information</h3>
                    <div className="grid gap-3 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-400">Provider:</span>
                        <span className="text-white">{profile.patient.insuranceProviderName}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-400">Policy Number:</span>
                        <span className="text-white font-mono">{profile.patient.policyNumber || 'N/A'}</span>
                      </div>
                    </div>
                  </div>
                )}

                <div className="pt-4 border-t border-gray-800">
                  <button
                    onClick={() => setIsProfileModalOpen(false)}
                    className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-2xl transition-colors"
                  >
                    Close Medical Profile
                  </button>
                </div>
              </div>
            </div>
          </div>
        )
      }
    </div >
  );
};

export default AmbulanceDashboard;

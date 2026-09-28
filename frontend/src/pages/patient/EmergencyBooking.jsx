import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, Search, MapPin, ShieldCheck, ArrowRight, AlertCircle, ChevronLeft, Loader2, User, CheckCircle2, XCircle, Stethoscope, Ambulance, Camera, Upload, Trash2, UserPlus, AlertTriangle, AlertOctagon, Image as ImageIcon, Locate } from 'lucide-react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
// eslint-disable-next-line no-unused-vars -- `motion` is the JSX animation namespace.
import { motion, AnimatePresence } from 'framer-motion';
import { fetchHospitals, fetchDoctors, bookAppointment, fetchPatientAppointments, fetchAdmissionStatus } from '../../services/patientApi';
import { getBaseUrl } from '../../services/userApi';
import { useAuth } from '../../context/AuthContext';
import Loader from '../../components/ui/Loader';
import { createEmergencyCase, getMyEmergencyCases, uploadVictimPhoto } from '../../services/emergencyApi';
import { IncidentBadge, SeverityBadge, StatusBadge, formatDateTime, getIncidentLabel } from '../../components/emergency/EmergencyBadges';
import EmergencyTimeline from '../../components/emergency/EmergencyTimeline';
import socket from '../../services/socket';

// Default to Chikkamagaluru, Karnataka
const CHIKKAMAGALURU_COORDS = { lat: 13.318014, lng: 75.773874 };

/**
 * Interactive Pinpoint Map to drag/click and set exact doorstep coordinates
 */
const PinpointMap = ({ latitude, longitude, onLocationChange }) => {
    const containerRef = useRef(null);
    const mapRef = useRef(null);
    const markerRef = useRef(null);

    const lat = latitude || CHIKKAMAGALURU_COORDS.lat;
    const lng = longitude || CHIKKAMAGALURU_COORDS.lng;

    useEffect(() => {
        if (!containerRef.current || mapRef.current) return;

        const map = L.map(containerRef.current, {
            center: [lat, lng],
            zoom: 15,
            zoomControl: true,
            attributionControl: false,
        });

        L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
            maxZoom: 19,
            subdomains: 'abcd',
        }).addTo(map);

        const customIcon = L.divIcon({
            className: 'custom-pin-marker',
            html: `
                <div style="position: relative; width: 44px; height: 44px; display: flex; align-items: center; justify-content: center;">
                    <div style="position: absolute; inset: 0; border-radius: 9999px; background: rgba(239, 68, 68, 0.4); animation: ping 1.8s infinite;"></div>
                    <div style="position: relative; width: 36px; height: 36px; border-radius: 12px; background: #ef4444; border: 2px solid white; box-shadow: 0 0 16px rgba(239,68,68,0.8); display: flex; align-items: center; justify-content: center; font-size: 20px;">
                        📍
                    </div>
                </div>
            `,
            iconSize: [44, 44],
            iconAnchor: [22, 22],
        });

        const marker = L.marker([lat, lng], {
            icon: customIcon,
            draggable: true,
        }).addTo(map);

        marker.on('dragend', (e) => {
            const pos = e.target.getLatLng();
            onLocationChange(pos.lat, pos.lng);
        });

        map.on('click', (e) => {
            const { lat: clickedLat, lng: clickedLng } = e.latlng;
            marker.setLatLng([clickedLat, clickedLng]);
            onLocationChange(clickedLat, clickedLng);
        });

        mapRef.current = map;
        markerRef.current = marker;

        return () => {
            map.remove();
            mapRef.current = null;
            markerRef.current = null;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (mapRef.current && markerRef.current && latitude && longitude) {
            markerRef.current.setLatLng([latitude, longitude]);
            mapRef.current.setView([latitude, longitude], 16);
        }
    }, [latitude, longitude]);

    return (
        <div className="relative w-full h-52 sm:h-60 rounded-2xl overflow-hidden border border-purple-500/25 shadow-inner mt-2">
            <div ref={containerRef} className="w-full h-full z-0" />
            <div className="absolute bottom-2 left-2 right-2 bg-black/80 backdrop-blur-md rounded-xl px-3 py-1.5 text-[11px] text-gray-200 flex items-center justify-between pointer-events-none z-[500] border border-white/10">
                <span className="flex items-center gap-1.5 font-medium">
                    <MapPin size={12} className="text-red-400" />
                    Drag pin or click map to pinpoint doorstep
                </span>
                <span className="text-emerald-400 font-mono font-bold">{lat.toFixed(5)}, {lng.toFixed(5)}</span>
            </div>
        </div>
    );
};

const EmergencyBookingPage = () => {
    const navigate = useNavigate();
    const { user } = useAuth();
    const [step, setStep] = useState(1); // 1: Situation & Hospital, 2: Doctor Selection
    const [loading, setLoading] = useState(true);
    const [hospitals, setHospitals] = useState([]);
    const [doctors, setDoctors] = useState([]);
    const [selectedHospital, setSelectedHospital] = useState(null);
    const [selectedDoctor, setSelectedDoctor] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [emergencyReason, setEmergencyReason] = useState('');
    const [booking, setBooking] = useState(false);
    const [selectedSpecialization, setSelectedSpecialization] = useState('All');
    const [activeAppointment, setActiveAppointment] = useState(null);
    const [gatewayMode, setGatewayMode] = useState('overview');
    const [admission, setAdmission] = useState(null);
    const [emergencyCases, setEmergencyCases] = useState([]);
    const [emergencyLoading, setEmergencyLoading] = useState(true);
    const [accidentOpen, setAccidentOpen] = useState(false);
    const [accidentStep, setAccidentStep] = useState(1);
    const [accidentMode, setAccidentMode] = useState(null);
    const [accidentDetails, setAccidentDetails] = useState('');
    const [accidentAddress, setAccidentAddress] = useState('');
    const [accidentSeverity, setAccidentSeverity] = useState('HIGH');
    const [accidentIncidentType, setAccidentIncidentType] = useState('ROAD_ACCIDENT');
    const [accidentSubmitting, setAccidentSubmitting] = useState(false);
    const [gpsLocation, setGpsLocation] = useState(null);
    const [locationLoading, setLocationLoading] = useState(false);
    const [locationError, setLocationError] = useState('');
    const [victimPhotoFile, setVictimPhotoFile] = useState(null);
    const [victimPhotoPreview, setVictimPhotoPreview] = useState('');
    const [victimPhotoPath, setVictimPhotoPath] = useState('');
    const [photoUploading, setPhotoUploading] = useState(false);
    const victimPhotoInputRef = useRef(null);
    const [addressLoading, setAddressLoading] = useState(false);
    const [detectedAddress, setDetectedAddress] = useState('');
    const [locationSearchQuery, setLocationSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [searchLoading, setSearchLoading] = useState(false);
    const searchTimeoutRef = useRef(null);

    const fetchSearchResults = useCallback((query) => {
        if (!query || query.trim().length < 2) {
            setSearchResults([]);
            return;
        }
        if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
        searchTimeoutRef.current = setTimeout(async () => {
            try {
                setSearchLoading(true);
                const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query.trim())}&limit=6&addressdetails=1`;
                const res = await fetch(url, {
                    headers: { 'Accept-Language': 'en' }
                });
                if (!res.ok) throw new Error('Search failed');
                const data = await res.json();
                setSearchResults(Array.isArray(data) ? data : []);
            } catch (e) {
                console.warn('Address search notice:', e.message);
                setSearchResults([]);
            } finally {
                setSearchLoading(false);
            }
        }, 300);
    }, []);

    const reverseGeocode = useCallback(async (lat, lng) => {
        if (lat == null || lng == null) return '';
        try {
            setAddressLoading(true);
            const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`;
            const res = await fetch(url, {
                headers: { 'Accept-Language': 'en' }
            });
            if (!res.ok) throw new Error('Geocode lookup failed');
            const data = await res.json();
            if (data && data.display_name) {
                const fullAddr = data.display_name;
                setDetectedAddress(fullAddr);
                setAccidentAddress(fullAddr);
                setGpsLocation(prev => prev ? { ...prev, address: fullAddr } : prev);
                return fullAddr;
            }
        } catch (e) {
            console.warn('Reverse geocode notice:', e.message);
        } finally {
            setAddressLoading(false);
        }
        return '';
    }, []);

    const setChikkamagaluruPreset = useCallback(() => {
        const loc = {
            latitude: CHIKKAMAGALURU_COORDS.lat,
            longitude: CHIKKAMAGALURU_COORDS.lng,
            accuracy: 10,
            timestamp: new Date(),
            isApproximate: false,
            address: 'Chikkamagaluru, Karnataka, India',
        };
        setGpsLocation(loc);
        setLocationError('');
        reverseGeocode(CHIKKAMAGALURU_COORDS.lat, CHIKKAMAGALURU_COORDS.lng);
    }, [reverseGeocode]);

    const fetchIpLocationFallback = useCallback(async () => {
        // Fallback directly to Chikkamagaluru instead of ISP Bangalore Gateway
        setChikkamagaluruPreset();
        return true;
    }, [setChikkamagaluruPreset]);

    const requestCurrentLocation = useCallback(async (allowFallback = true) => {
        setLocationLoading(true);
        setLocationError('');

        if (!navigator.geolocation) {
            if (allowFallback) {
                setChikkamagaluruPreset();
                setLocationLoading(false);
                return;
            }
            setLocationError('Geolocation is not supported by your browser/device.');
            setLocationLoading(false);
            return;
        }

        // 1. Try High Accuracy Geolocation (hardware GPS, fresh fix, 15s timeout)
        navigator.geolocation.getCurrentPosition(
            (position) => {
                const lat = position.coords.latitude;
                const lng = position.coords.longitude;
                const loc = {
                    latitude: lat,
                    longitude: lng,
                    accuracy: Math.round(position.coords.accuracy || 8),
                    timestamp: new Date(position.timestamp || Date.now()),
                    isApproximate: false,
                    address: '',
                };
                setGpsLocation(loc);
                setLocationLoading(false);
                setLocationError('');
                reverseGeocode(lat, lng);
            },
            async (error) => {
                // 2. If timed out or unavailable, retry with low-power mode
                if (error.code === error.TIMEOUT || error.code === error.POSITION_UNAVAILABLE) {
                    navigator.geolocation.getCurrentPosition(
                        (position) => {
                            const lat = position.coords.latitude;
                            const lng = position.coords.longitude;
                            const loc = {
                                latitude: lat,
                                longitude: lng,
                                accuracy: Math.round(position.coords.accuracy || 25),
                                timestamp: new Date(position.timestamp || Date.now()),
                                isApproximate: false,
                                address: '',
                            };
                            setGpsLocation(loc);
                            setLocationLoading(false);
                            setLocationError('');
                            reverseGeocode(lat, lng);
                        },
                        async () => {
                            if (allowFallback) {
                                setChikkamagaluruPreset();
                                setLocationLoading(false);
                                return;
                            }
                            setLocationLoading(false);
                            setLocationError('Unable to acquire GPS signal. Use the map or search bar below to pinpoint your location.');
                        },
                        { enableHighAccuracy: false, timeout: 10000, maximumAge: 0 }
                    );
                    return;
                }

                // 3. If PERMISSION_DENIED (e.g. Insecure HTTP origin or blocked)
                if (allowFallback) {
                    setChikkamagaluruPreset();
                    setLocationLoading(false);
                    return;
                }

                setLocationLoading(false);
                const isNonSecure = typeof window !== 'undefined' && !window.isSecureContext && window.location.hostname !== 'localhost';
                if (isNonSecure) {
                    setLocationError('Location blocked: Browser requires HTTPS or http://localhost:5173. Use the map or search bar below to pinpoint.');
                } else {
                    setLocationError('Location permission is required to request an ambulance. Please enable location in site settings.');
                }
            },
            { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
        );
    }, [setChikkamagaluruPreset, reverseGeocode]);

    const loadEmergencyState = useCallback(async () => {
        setEmergencyLoading(true);
        try {
            const [admissionRes, casesRes] = await Promise.all([
                fetchAdmissionStatus(),
                getMyEmergencyCases(),
            ]);
            if (admissionRes?.success) setAdmission(admissionRes);
            if (casesRes?.success) setEmergencyCases(Array.isArray(casesRes.data) ? casesRes.data : []);
        } catch (error) {
            // The original booking flow remains available if a supplementary status request fails.
            console.error('Unable to load emergency gateway status:', error);
        } finally {
            setEmergencyLoading(false);
        }
    }, []);

    useEffect(() => {
        const loadInitialData = async () => {
            try {
                setLoading(true);
                // Check for active appointments first
                const appointmentsRes = await fetchPatientAppointments();
                if (appointmentsRes?.success) {
                    const active = appointmentsRes.data.find(a => ['pending', 'approved'].includes(a.status));
                    if (active) {
                        setActiveAppointment(active);
                        setLoading(false);
                        return;
                    }
                }

                const res = await fetchHospitals();
                if (res?.success) {
                    setHospitals(res.data);
                }
            } catch (error) {
                console.error("Error loading initial data:", error);
            } finally {
                setLoading(false);
            }
        };
        loadInitialData();
    }, []);

    useEffect(() => {
        loadEmergencyState();
        socket.on('emergency-created', loadEmergencyState);
        socket.on('emergency-status-updated', loadEmergencyState);
        socket.on('emergency-updated', loadEmergencyState);
        return () => {
            socket.off('emergency-created', loadEmergencyState);
            socket.off('emergency-status-updated', loadEmergencyState);
            socket.off('emergency-updated', loadEmergencyState);
        };
    }, [loadEmergencyState]);

    useEffect(() => {
        const loadDoctors = async () => {
            if (step === 2 && selectedHospital && !activeAppointment) {
                setLoading(true);
                try {
                    const res = await fetchDoctors({ 
                        hospitalName: selectedHospital.hospitalName, 
                        specialization: 'All',
                        isEmergency: true 
                    });
                    if (res?.success) {
                        setDoctors(res.data.doctors || res.data);
                    }
                } catch (error) {
                    console.error("Error loading doctors:", error);
                } finally {
                    setLoading(false);
                }
            }
        };
        loadDoctors();
    }, [step, selectedHospital, activeAppointment]);

    const handleEmergencyBooking = async (doctorToBook) => {
        const doc = doctorToBook || selectedDoctor;
        if (!doc || !selectedHospital || !emergencyReason) return;

        setBooking(true);
        try {
            const now = new Date();
            const res = await bookAppointment({
                doctorId: doc._id,
                hospitalName: selectedHospital.hospitalName,
                date: now.toISOString().split('T')[0],
                time: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true }),
                reason: `[EMERGENCY] ${emergencyReason}`,
                emergencyReason: emergencyReason,
                isEmergency: true
            });

            if (res.success) {
                const aptData = res.data || {};
                const emergencyCase = aptData.emergencyCase;
                const ecId = emergencyCase?._id;

                if (ecId) {
                    navigate(`/patient-dashboard/emergencies/${encodeURIComponent(ecId)}`, {
                        state: {
                            toast: `🚨 Emergency case opened and response team at ${selectedHospital.hospitalName} notified!`
                        }
                    });
                } else {
                    navigate('/patient-dashboard/emergencies', {
                        state: {
                            toast: "🚨 Emergency booking confirmed — tracking case created."
                        }
                    });
                }
            }
        } catch (error) {
            console.error("Emergency booking failed:", error);
            const msg =
                (error && error.response && error.response.data && error.response.data.message) ||
                (error && error.message) ||
                "Emergency booking failed. Please try again.";
            window.alert(msg);
        } finally {
            setBooking(false);
        }
    };

    const activeEmergency = useMemo(
        () => emergencyCases.find((emergencyCase) => !['CLOSED', 'CANCELLED'].includes(emergencyCase.status)),
        [emergencyCases]
    );

    const resetAccidentFlow = () => {
        setAccidentStep(1);
        setAccidentMode(null);
        setAccidentDetails('');
        setAccidentAddress('');
        setGpsLocation(null);
        setLocationLoading(false);
        setLocationError('');
        setAccidentSeverity('HIGH');
        setAccidentIncidentType('ROAD_ACCIDENT');
        setVictimPhotoFile(null);
        setVictimPhotoPreview('');
        setVictimPhotoPath('');
        setPhotoUploading(false);
    };

    const handleAccidentClose = () => {
        setAccidentOpen(false);
        setTimeout(resetAccidentFlow, 300);
    };

    const handleVictimPhotoChange = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (file.size > 10 * 1024 * 1024) {
            window.alert('Photo is too large. Maximum size is 10MB.');
            return;
        }
        setVictimPhotoFile(file);
        const reader = new FileReader();
        reader.onloadend = () => {
            setVictimPhotoPreview(reader.result);
        };
        reader.readAsDataURL(file);
    };

    const clearVictimPhoto = () => {
        setVictimPhotoFile(null);
        setVictimPhotoPreview('');
        setVictimPhotoPath('');
        if (victimPhotoInputRef.current) {
            victimPhotoInputRef.current.value = '';
        }
    };

    const submitAccidentCase = async () => {
        if (!accidentMode) return;
        if (!accidentDetails.trim()) {
            window.alert('Please describe the accident details.');
            return;
        }

        if (accidentMode === 'SELF') {
            if (locationLoading) {
                window.alert('Currently acquiring your emergency GPS coordinates. Please wait a moment.');
                return;
            }
            if (!gpsLocation || typeof gpsLocation.latitude !== 'number' || typeof gpsLocation.longitude !== 'number') {
                requestCurrentLocation();
                window.alert('Location permission is required to request an ambulance. Please allow location access and try again.');
                return;
            }
        } else {
            if (!accidentAddress.trim()) {
                window.alert('Please provide the emergency location/address for ambulance dispatch.');
                return;
            }
        }

        if (accidentSubmitting) return;
        setAccidentSubmitting(true);
        try {
            let photoPath = '';
            if (victimPhotoFile) {
                setPhotoUploading(true);
                const uploadRes = await uploadVictimPhoto(victimPhotoFile);
                if (uploadRes?.success && uploadRes?.data?.filePath) {
                    photoPath = uploadRes.data.filePath;
                }
                setPhotoUploading(false);
            }

            let locationPayload = {};
            if (accidentMode === 'SELF') {
                locationPayload = {
                    latitude: gpsLocation.latitude,
                    longitude: gpsLocation.longitude,
                    accuracy: gpsLocation.accuracy,
                    address: gpsLocation.address || detectedAddress || accidentAddress.trim() || `GPS Coordinates (${gpsLocation.latitude.toFixed(5)}, ${gpsLocation.longitude.toFixed(5)})`,
                };
            } else {
                locationPayload = {
                    address: accidentAddress.trim(),
                };
            }

            const payload = {
                incidentType: accidentIncidentType,
                severity: accidentSeverity,
                description: accidentDetails.trim(),
                responseType: 'AMBULANCE_EMERGENCY',
                reporterMode: accidentMode,
                victimPhoto: photoPath || undefined,
                location: locationPayload,
            };

            if (accidentMode === 'SELF') {
                payload.patient = user?.id || user?._id;
            } else {
                payload.patient = null;
            }

            const res = await createEmergencyCase(payload);
            if (res?.success && res?.data?._id) {
                handleAccidentClose();
                navigate(`/patient-dashboard/emergencies/${encodeURIComponent(res.data._id)}`);
            } else {
                window.alert(res?.message || 'Unable to create the emergency case. Please try again.');
            }
        } catch (error) {
            window.alert(error?.response?.data?.message || error?.message || 'Unable to create the emergency case. Please try again.');
        } finally {
            setPhotoUploading(false);
            setAccidentSubmitting(false);
        }
    };

    if (loading && step === 1 && gatewayMode === 'medical') return <Loader fullScreen message="Accessing Emergency Gateway" />;

    const handleGatewayOverviewClick = (mode) => {
        if (mode === 'accident') {
            setAccidentOpen(true);
        } else if (mode === 'medical') {
            setGatewayMode('medical');
        }
    };

    if (admission?.isAdmitted) {
        return (
            <div className="max-w-5xl mx-auto pb-12 sm:pb-20 space-y-4 sm:space-y-6 animate-in fade-in duration-500">
                <header className="flex items-center gap-3 px-1 pt-1 sm:pt-4">
                    <button onClick={() => navigate('/patient-dashboard')} aria-label="Back to patient dashboard" className="w-10 h-10 rounded-xl border border-white/10 bg-white/[0.03] text-gray-300 hover:text-white hover:bg-white/[0.08] flex items-center justify-center"><ChevronLeft size={20} /></button>
                    <div><h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white">Emergency Gateway</h1><p className="text-sm text-gray-400">Get help quickly</p></div>
                </header>

                <div className="rounded-3xl border border-amber-500/30 bg-gradient-to-br from-amber-500/10 to-[#111318] p-5 sm:p-8 shadow-2xl">
                    <div className="w-12 h-12 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-300 flex items-center justify-center"><Building2 size={24} /></div>
                    <p className="mt-5 text-[11px] font-black uppercase tracking-[0.18em] text-amber-400">Self-service restricted</p>
                    <h1 className="mt-2 text-xl sm:text-2xl font-black text-white">You are currently admitted to {admission.data?.hospitalName || 'a hospital'}.</h1>
                    <p className="mt-3 text-sm leading-6 text-gray-300 max-w-2xl">You cannot create a self-service emergency request while admitted. Please contact your in-hospital care team for immediate help. You may still report an accident on behalf of <span className="text-white font-bold">someone else</span> below.</p>
                    <div className="mt-6 flex flex-wrap gap-3">
                        <button onClick={() => navigate('/patient-dashboard/admission-status')} className="min-h-12 px-5 rounded-2xl bg-white/10 hover:bg-white/15 text-white text-sm font-bold transition-colors">View admission status</button>
                        <button onClick={() => { setAccidentMode('OTHER'); setAccidentStep(2); setAccidentOpen(true); }} className="min-h-12 px-5 rounded-2xl bg-purple-600 hover:bg-purple-500 text-white text-sm font-black uppercase tracking-[0.12em] flex items-center gap-2"><UserPlus size={16} /> Report Accident for Someone Else</button>
                    </div>
                </div>

                <AnimatePresence>{accidentOpen && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/70 backdrop-blur-sm">
                        <motion.div initial={{ y: 30 }} animate={{ y: 0 }} exit={{ y: 30 }} className="w-full max-w-2xl max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl border border-purple-500/25 bg-[#101218] p-5 sm:p-6 shadow-2xl custom-scrollbar">
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <p className="text-[11px] font-black uppercase tracking-[0.16em] text-purple-300">Accident / Trauma</p>
                                    <h2 className="mt-1 text-xl font-black text-white">
                                        {accidentStep === 1 && "Who needs emergency help?"}
                                        {accidentStep === 2 && accidentMode === 'SELF' && "It's Me — Accident Details"}
                                        {accidentStep === 2 && accidentMode === 'OTHER' && "Someone Else — Victim Details"}
                                    </h2>
                                </div>
                                <button onClick={handleAccidentClose} className="p-2 text-gray-400 hover:text-white shrink-0"><XCircle size={20} /></button>
                            </div>
                            {accidentStep === 2 ? (
                                <div className="mt-5 space-y-4">
                                    {accidentMode === 'OTHER' && (
                                        <div>
                                            <label className="block text-xs font-bold text-gray-300 uppercase tracking-wide">Victim Photo <span className="font-normal text-gray-500">(optional, if safe)</span></label>
                                            <div className="mt-2 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                                                <div className="flex items-start gap-3 mb-3">
                                                    <AlertTriangle size={16} className="text-amber-400 shrink-0 mt-0.5" />
                                                    <p className="text-xs text-gray-400 leading-relaxed"><span className="font-bold text-amber-300">Safety first.</span> Take a clear photo only if safe to do so. Do not put anyone at risk.</p>
                                                </div>
                                                {victimPhotoPreview ? (
                                                    <div className="relative w-full rounded-xl overflow-hidden border border-white/10 bg-black/30">
                                                        <img src={victimPhotoPreview} alt="Victim preview" className="w-full max-h-64 object-contain" />
                                                        <button type="button" onClick={clearVictimPhoto} className="absolute top-2 right-2 p-2 rounded-full bg-black/60 backdrop-blur-sm border border-white/10 text-red-300 hover:text-red-200 transition-colors"><Trash2 size={16} /></button>
                                                    </div>
                                                ) : (
                                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                        <button type="button" onClick={() => { if (victimPhotoInputRef.current) { victimPhotoInputRef.current.setAttribute('capture', 'environment'); victimPhotoInputRef.current.click(); } }} className="flex items-center justify-center gap-2 min-h-24 rounded-xl border border-dashed border-white/15 bg-black/20 hover:border-purple-400/40 hover:bg-purple-500/5 text-gray-400 hover:text-purple-300 transition-all"><Camera size={20} /><span className="text-sm font-bold">Take Photo</span></button>
                                                        <button type="button" onClick={() => { if (victimPhotoInputRef.current) { victimPhotoInputRef.current.removeAttribute('capture'); victimPhotoInputRef.current.click(); } }} className="flex items-center justify-center gap-2 min-h-24 rounded-xl border border-dashed border-white/15 bg-black/20 hover:border-emerald-400/40 hover:bg-emerald-500/5 text-gray-400 hover:text-emerald-300 transition-all"><Upload size={20} /><span className="text-sm font-bold">Upload Image</span></button>
                                                    </div>
                                                )}
                                                <input ref={victimPhotoInputRef} type="file" accept="image/*" onChange={handleVictimPhotoChange} className="hidden" />
                                            </div>
                                        </div>
                                    )}
                                    <label className="block text-xs font-bold text-gray-300 uppercase tracking-wide">Incident Type</label>
                                    <div className="mt-1.5 grid grid-cols-2 sm:grid-cols-4 gap-2">
                                        {[{ value: 'ROAD_ACCIDENT', label: 'Road Accident', icon: Ambulance }, { value: 'FALL', label: 'Fall', icon: AlertCircle }, { value: 'FIRE', label: 'Fire', icon: AlertTriangle }, { value: 'OTHER', label: 'Other', icon: AlertOctagon }].map(({ value, label, icon: Icon }) => (
                                            <button key={value} type="button" onClick={() => setAccidentIncidentType(value)} className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border transition-all text-center ${accidentIncidentType === value ? 'border-purple-400/50 bg-purple-500/15 text-purple-200 shadow-[0_0_20px_rgba(168,85,247,0.1)]' : 'border-white/10 bg-white/[0.02] text-gray-400 hover:border-white/20 hover:text-gray-200'}`}>
                                                <Icon size={18} /><span className="text-[11px] font-bold uppercase tracking-wider leading-tight">{label}</span>
                                            </button>
                                        ))}
                                    </div>
                                    <label className="block text-xs font-bold text-gray-300 uppercase tracking-wide">Severity</label>
                                    <div className="mt-1.5 grid grid-cols-4 gap-2">
                                        {['LOW', 'MODERATE', 'HIGH', 'CRITICAL'].map((level) => {
                                            const colors = { LOW: 'border-emerald-400/40 bg-emerald-500/15 text-emerald-300 shadow-[0_0_20px_rgba(16,185,129,0.1)]', MODERATE: 'border-yellow-400/40 bg-yellow-500/15 text-yellow-300 shadow-[0_0_20px_rgba(234,179,8,0.1)]', HIGH: 'border-orange-400/40 bg-orange-500/15 text-orange-300 shadow-[0_0_20px_rgba(249,115,22,0.1)]', CRITICAL: 'border-red-400/50 bg-red-500/20 text-red-200 shadow-[0_0_24px_rgba(239,68,68,0.15)]' };
                                            const defaults = 'border-white/10 bg-white/[0.02] text-gray-400 hover:border-white/20 hover:text-gray-200';
                                            return <button key={level} type="button" onClick={() => setAccidentSeverity(level)} className={`py-2.5 px-2 rounded-xl border transition-all text-[11px] font-black uppercase tracking-wider ${accidentSeverity === level ? colors[level] : defaults}`}>{level}</button>;
                                        })}
                                    </div>
                                    <label className="block text-xs font-bold text-gray-300">Accident Details
                                        <textarea autoFocus value={accidentDetails} onChange={(e) => setAccidentDetails(e.target.value)} placeholder="What happened? Describe visible injuries, condition, or immediate risks..." className="mt-2 w-full min-h-28 rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-purple-400/50" />
                                    </label>
                                    <label className="block text-xs font-bold text-gray-300">Emergency Location <span className="font-normal text-gray-500">(critical for ambulance response)</span>
                                        <div className="relative mt-2"><MapPin size={16} className="absolute left-3 top-3 text-purple-300" /><input value={accidentAddress} onChange={(e) => setAccidentAddress(e.target.value)} placeholder="Address, landmark, cross street, or GPS details..." className="w-full rounded-2xl border border-white/10 bg-white/[0.03] py-3 pl-10 pr-3 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-purple-400/50" /></div>
                                    </label>
                                    <div className="flex items-start gap-3 p-3 rounded-2xl bg-amber-500/8 border border-amber-500/20">
                                        <ImageIcon size={16} className="text-amber-400 shrink-0 mt-0.5" />
                                        <p className="text-xs text-amber-200/80 leading-relaxed">Patient identity is <span className="font-bold">Not Identified</span>. Ambulance personnel will confirm the victim's identity upon arrival.</p>
                                    </div>
                                    <div className="flex gap-3 pt-2">
                                        <button type="button" onClick={handleAccidentClose} className="flex-1 min-h-12 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 hover:text-white text-sm font-bold uppercase tracking-[0.1em] transition-colors">Cancel</button>
                                        <button type="button" onClick={submitAccidentCase} disabled={!accidentDetails.trim() || accidentSubmitting || photoUploading} className="flex-[2] min-h-12 rounded-2xl bg-purple-600 hover:bg-purple-500 disabled:opacity-45 text-white text-sm font-black uppercase tracking-[0.12em] flex items-center justify-center gap-2">
                                            {accidentSubmitting || photoUploading ? <><Loader2 size={17} className="animate-spin" />{photoUploading && !accidentSubmitting ? 'Uploading Photo…' : 'Requesting Ambulance…'}</> : <><Ambulance size={17} />Request Ambulance</>}
                                        </button>
                                    </div>
                                </div>
                            ) : null}
                        </motion.div>
                    </motion.div>
                )}</AnimatePresence>
            </div>
        );
    }

    if (gatewayMode === 'overview') {
        return (
            <div className="max-w-5xl mx-auto pb-12 sm:pb-20 space-y-4 sm:space-y-6 animate-in fade-in duration-500">
                <header className="flex items-center gap-3 px-1 pt-1 sm:pt-4">
                    <button onClick={() => navigate('/patient-dashboard')} aria-label="Back to patient dashboard" className="w-10 h-10 rounded-xl border border-white/10 bg-white/[0.03] text-gray-300 hover:text-white hover:bg-white/[0.08] flex items-center justify-center"><ChevronLeft size={20} /></button>
                    <div><h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white">Emergency Gateway</h1><p className="text-sm text-gray-400">Get help quickly</p></div>
                </header>

                <section className="rounded-2xl border border-amber-400/20 bg-gradient-to-r from-amber-500/10 via-[#111318] to-[#111318] p-4 flex gap-3">
                    <AlertCircle className="text-amber-400 shrink-0 mt-0.5" size={20} />
                    <div><p className="text-sm font-bold text-white">Emergency Assistance</p><p className="mt-0.5 text-xs sm:text-sm text-gray-400">Choose the type of emergency below. Your request is shared with the appropriate response workflow.</p></div>
                </section>

                {emergencyLoading ? (
                    <section className="rounded-3xl border border-white/[0.07] bg-[#111318] p-8 flex items-center gap-3 text-gray-400"><Loader2 className="animate-spin text-blue-400" size={20} /> Checking emergency status…</section>
                ) : activeEmergency ? (
                    <section className="rounded-3xl border border-red-500/25 bg-gradient-to-br from-red-500/10 via-[#111318] to-[#111318] p-5 sm:p-7 shadow-[0_0_32px_rgba(239,68,68,0.08)]">
                        <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-[11px] font-black uppercase tracking-[0.16em] text-red-400">Active emergency</p><h2 className="mt-1 text-xl font-black text-white">Emergency in progress</h2></div><StatusBadge status={activeEmergency.status} /></div>
                        <div className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm"><div className="rounded-2xl bg-black/20 p-3"><p className="text-[10px] uppercase font-bold tracking-wider text-gray-500">Case type</p><p className="mt-1 font-semibold text-gray-100">{getIncidentLabel(activeEmergency.incidentType)}</p></div><div className="rounded-2xl bg-black/20 p-3"><p className="text-[10px] uppercase font-bold tracking-wider text-gray-500">Priority</p><div className="mt-1"><SeverityBadge severity={activeEmergency.severity} /></div></div><div className="rounded-2xl bg-black/20 p-3"><p className="text-[10px] uppercase font-bold tracking-wider text-gray-500">Updated</p><p className="mt-1 font-semibold text-gray-100">{formatDateTime(activeEmergency.updatedAt || activeEmergency.createdAt)}</p></div></div>
                        <div className="mt-5 max-h-56 overflow-y-auto rounded-2xl bg-black/10 p-3"><EmergencyTimeline statusTimestamps={activeEmergency.statusTimestamps} currentStatus={activeEmergency.status} responseType={activeEmergency.responseType || 'AMBULANCE_EMERGENCY'} /></div>
                        <button onClick={() => navigate(`/patient-dashboard/emergencies/${activeEmergency._id}`)} className="mt-5 w-full min-h-12 rounded-2xl bg-red-600 hover:bg-red-500 text-white font-black text-sm uppercase tracking-[0.12em]">View Emergency</button>
                    </section>
                ) : (
                    <>
                        <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <article className="rounded-3xl border border-blue-500/25 bg-gradient-to-br from-blue-500/15 to-[#111318] p-5 sm:p-6 flex flex-col min-h-[280px]"><div className="w-12 h-12 rounded-2xl bg-blue-500/15 border border-blue-400/20 text-blue-300 flex items-center justify-center"><Stethoscope size={24} /></div><h2 className="mt-5 text-xl font-black text-white">Medical Emergency</h2><p className="mt-1 font-semibold text-blue-200">Need urgent medical attention?</p><p className="mt-3 text-sm leading-6 text-gray-400">Connect with a hospital and prioritize an available doctor.</p><button onClick={() => handleGatewayOverviewClick('medical')} className="mt-auto w-full min-h-12 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white font-black text-sm uppercase tracking-[0.12em]">Request Doctor</button></article>
                            <article className="rounded-3xl border border-purple-500/25 bg-gradient-to-br from-purple-500/15 to-[#111318] p-5 sm:p-6 flex flex-col min-h-[280px]"><div className="w-12 h-12 rounded-2xl bg-purple-500/15 border border-purple-400/20 text-purple-200 flex items-center justify-center"><Ambulance size={24} /></div><h2 className="mt-5 text-xl font-black text-white">Accident / Trauma</h2><p className="mt-1 font-semibold text-purple-200">Accident or serious injury?</p><p className="mt-3 text-sm leading-6 text-gray-400">Create an emergency case with location details for ambulance response.</p><button onClick={() => handleGatewayOverviewClick('accident')} className="mt-auto w-full min-h-12 rounded-2xl bg-purple-600 hover:bg-purple-500 text-white font-black text-sm uppercase tracking-[0.12em]">Request Ambulance</button></article>
                        </section>
                        {emergencyCases.filter((c) => ['CLOSED', 'CANCELLED'].includes(c.status)).length > 0 && <section><div className="flex items-center justify-between mb-3"><h2 className="text-base font-black text-white">Previous Emergencies</h2><button onClick={() => navigate('/patient-dashboard/emergencies')} className="text-xs font-bold text-blue-400 hover:text-blue-300">View all</button></div><div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{emergencyCases.filter((c) => ['CLOSED', 'CANCELLED'].includes(c.status)).slice(0, 2).map((c) => <button key={c._id} onClick={() => navigate(`/patient-dashboard/emergencies/${c._id}`)} className="text-left rounded-2xl border border-white/[0.07] bg-[#111318] p-4 hover:bg-white/[0.04]"><div className="flex justify-between gap-2"><IncidentBadge type={c.incidentType} /><StatusBadge status={c.status} /></div><p className="mt-3 text-sm font-bold text-white">{getIncidentLabel(c.incidentType)}</p><p className="mt-1 text-xs text-gray-500">{formatDateTime(c.updatedAt || c.createdAt)}</p></button>)}</div></section>}
                    </>
                )}

                <AnimatePresence>{accidentOpen && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/70 backdrop-blur-sm">
                        <motion.div initial={{ y: 30 }} animate={{ y: 0 }} exit={{ y: 30 }} className="w-full max-w-2xl max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl border border-purple-500/25 bg-[#101218] p-5 sm:p-6 shadow-2xl custom-scrollbar">
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <p className="text-[11px] font-black uppercase tracking-[0.16em] text-purple-300">Accident / Trauma</p>
                                    <h2 className="mt-1 text-xl font-black text-white">
                                        {accidentStep === 1 && "Who needs emergency help?"}
                                        {accidentStep === 2 && accidentMode === 'SELF' && "It's Me — Accident Details"}
                                        {accidentStep === 2 && accidentMode === 'OTHER' && "Someone Else — Victim Details"}
                                    </h2>
                                </div>
                                <button onClick={handleAccidentClose} className="p-2 text-gray-400 hover:text-white shrink-0"><XCircle size={20} /></button>
                            </div>

                            {accidentStep === 1 ? (
                                <div className="mt-5 space-y-3">
                                    <p className="text-sm text-gray-400">Please choose who needs help. This helps us correctly identify the patient and follow the right response protocol.</p>

                                    <button
                                        type="button"
                                        onClick={() => {
                                            setAccidentMode('SELF');
                                            setAccidentStep(2);
                                            requestCurrentLocation();
                                        }}
                                        className="w-full text-left rounded-2xl border border-white/10 bg-white/[0.03] hover:border-purple-400/40 hover:bg-white/[0.06] p-5 transition-all group"
                                    >
                                        <div className="flex items-start gap-4">
                                            <div className="w-12 h-12 rounded-2xl bg-purple-500/15 border border-purple-400/25 text-purple-300 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                                                <User size={24} />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <h3 className="text-lg font-black text-white">IT'S ME</h3>
                                                    <span className="text-[10px] font-bold uppercase tracking-wider text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded-full border border-purple-500/20">Auto Identified</span>
                                                </div>
                                                <p className="mt-1 text-sm text-gray-400">I am the injured person. My patient account will be used for this case.</p>
                                                <div className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-purple-600/20 border border-purple-500/30 text-purple-200 text-xs font-bold uppercase tracking-wider">
                                                    <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" /> Continue
                                                </div>
                                            </div>
                                        </div>
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => { setAccidentMode('OTHER'); setAccidentStep(2); }}
                                        className="w-full text-left rounded-2xl border border-white/10 bg-white/[0.03] hover:border-emerald-400/40 hover:bg-white/[0.06] p-5 transition-all group"
                                    >
                                        <div className="flex items-start gap-4">
                                            <div className="w-12 h-12 rounded-2xl bg-emerald-500/15 border border-emerald-400/25 text-emerald-300 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                                                <UserPlus size={24} />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <h3 className="text-lg font-black text-white">SOMEONE ELSE</h3>
                                                    <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">Witness Report</span>
                                                </div>
                                                <p className="mt-1 text-sm text-gray-400">I am reporting for another person. The victim may be unknown — identity will be confirmed by the ambulance team later.</p>
                                                <div className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-600/20 border border-emerald-500/30 text-emerald-200 text-xs font-bold uppercase tracking-wider">
                                                    <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" /> Continue
                                                </div>
                                            </div>
                                        </div>
                                    </button>
                                </div>
                            ) : (
                                <div className="mt-5 space-y-4">
                                    {accidentMode === 'OTHER' && (
                                        <div>
                                            <label className="block text-xs font-bold text-gray-300 uppercase tracking-wide">Victim Photo <span className="font-normal text-gray-500">(optional, if safe)</span></label>
                                            <div className="mt-2 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                                                <div className="flex items-start gap-3 mb-3">
                                                    <AlertTriangle size={16} className="text-amber-400 shrink-0 mt-0.5" />
                                                    <p className="text-xs text-gray-400 leading-relaxed">
                                                        <span className="font-bold text-amber-300">Safety first.</span> Take a clear photo of the injured person only if it is safe to do so. Do not put yourself or others at risk.
                                                    </p>
                                                </div>
                                                {victimPhotoPreview ? (
                                                    <div className="relative w-full rounded-xl overflow-hidden border border-white/10 bg-black/30">
                                                        <img src={victimPhotoPreview} alt="Victim preview" className="w-full max-h-64 object-contain" />
                                                        <button
                                                            type="button"
                                                            onClick={clearVictimPhoto}
                                                            className="absolute top-2 right-2 p-2 rounded-full bg-black/60 backdrop-blur-sm border border-white/10 text-red-300 hover:text-red-200 hover:bg-black/80 transition-colors"
                                                            aria-label="Remove photo"
                                                        >
                                                            <Trash2 size={16} />
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                        <button
                                                            type="button"
                                                            onClick={() => { if (victimPhotoInputRef.current) { victimPhotoInputRef.current.setAttribute('capture', 'environment'); victimPhotoInputRef.current.click(); } }}
                                                            className="flex items-center justify-center gap-2 min-h-24 rounded-xl border border-dashed border-white/15 bg-black/20 hover:border-purple-400/40 hover:bg-purple-500/5 text-gray-400 hover:text-purple-300 transition-all"
                                                        >
                                                            <Camera size={20} />
                                                            <span className="text-sm font-bold">Take Photo</span>
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => { if (victimPhotoInputRef.current) { victimPhotoInputRef.current.removeAttribute('capture'); victimPhotoInputRef.current.click(); } }}
                                                            className="flex items-center justify-center gap-2 min-h-24 rounded-xl border border-dashed border-white/15 bg-black/20 hover:border-emerald-400/40 hover:bg-emerald-500/5 text-gray-400 hover:text-emerald-300 transition-all"
                                                        >
                                                            <Upload size={20} />
                                                            <span className="text-sm font-bold">Upload Image</span>
                                                        </button>
                                                    </div>
                                                )}
                                                <input
                                                    ref={victimPhotoInputRef}
                                                    type="file"
                                                    accept="image/*"
                                                    onChange={handleVictimPhotoChange}
                                                    className="hidden"
                                                />
                                            </div>
                                        </div>
                                    )}

                                    <label className="block text-xs font-bold text-gray-300 uppercase tracking-wide">Incident Type</label>
                                    <div className="mt-1.5 grid grid-cols-2 sm:grid-cols-4 gap-2">
                                        {[
                                            { value: 'ROAD_ACCIDENT', label: 'Road Accident', icon: Ambulance },
                                            { value: 'FALL', label: 'Fall', icon: AlertCircle },
                                            { value: 'FIRE', label: 'Fire', icon: AlertTriangle },
                                            { value: 'OTHER', label: 'Other', icon: AlertOctagon },
                                        ].map(({ value, label, icon: Icon }) => (
                                            <button
                                                key={value}
                                                type="button"
                                                onClick={() => setAccidentIncidentType(value)}
                                                className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border transition-all text-center ${
                                                    accidentIncidentType === value
                                                        ? 'border-purple-400/50 bg-purple-500/15 text-purple-200 shadow-[0_0_20px_rgba(168,85,247,0.1)]'
                                                        : 'border-white/10 bg-white/[0.02] text-gray-400 hover:border-white/20 hover:text-gray-200'
                                                }`}
                                            >
                                                <Icon size={18} />
                                                <span className="text-[11px] font-bold uppercase tracking-wider leading-tight">{label}</span>
                                            </button>
                                        ))}
                                    </div>

                                    <label className="block text-xs font-bold text-gray-300 uppercase tracking-wide">Severity</label>
                                    <div className="mt-1.5 grid grid-cols-4 gap-2">
                                        {['LOW', 'MODERATE', 'HIGH', 'CRITICAL'].map((level) => {
                                            const colors = {
                                                LOW: 'border-emerald-400/40 bg-emerald-500/15 text-emerald-300 shadow-[0_0_20px_rgba(16,185,129,0.1)]',
                                                MODERATE: 'border-yellow-400/40 bg-yellow-500/15 text-yellow-300 shadow-[0_0_20px_rgba(234,179,8,0.1)]',
                                                HIGH: 'border-orange-400/40 bg-orange-500/15 text-orange-300 shadow-[0_0_20px_rgba(249,115,22,0.1)]',
                                                CRITICAL: 'border-red-400/50 bg-red-500/20 text-red-200 shadow-[0_0_24px_rgba(239,68,68,0.15)]',
                                            };
                                            const defaults = 'border-white/10 bg-white/[0.02] text-gray-400 hover:border-white/20 hover:text-gray-200';
                                            return (
                                                <button
                                                    key={level}
                                                    type="button"
                                                    onClick={() => setAccidentSeverity(level)}
                                                    className={`py-2.5 px-2 rounded-xl border transition-all text-[11px] font-black uppercase tracking-wider ${
                                                        accidentSeverity === level ? colors[level] : defaults
                                                    }`}
                                                >
                                                    {level}
                                                </button>
                                            );
                                        })}
                                    </div>

                                    <label className="block text-xs font-bold text-gray-300">
                                        Accident Details
                                        <textarea
                                            autoFocus
                                            value={accidentDetails}
                                            onChange={(e) => setAccidentDetails(e.target.value)}
                                            placeholder={accidentMode === 'SELF'
                                                ? "What happened? Describe your injuries, pain level, or immediate risks..."
                                                : "What happened? Describe the victim's visible injuries, condition, or immediate risks..."}
                                            className="mt-2 w-full min-h-28 rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-purple-400/50"
                                        />
                                    </label>

                                    {/* Location Section */}
                                    {accidentMode === 'SELF' ? (
                                        <div className="space-y-3">
                                            <div className="flex items-center justify-between">
                                                <label className="block text-xs font-bold text-gray-300 uppercase tracking-wide">
                                                    Emergency Location <span className="font-normal text-purple-300">(Accurate GPS & Pinpoint)</span>
                                                </label>
                                                <div className="flex items-center gap-1.5">
                                                    <button
                                                        type="button"
                                                        onClick={setChikkamagaluruPreset}
                                                        className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30 hover:bg-purple-500/30 transition-colors"
                                                    >
                                                        📍 Chikkamagaluru
                                                    </button>
                                                    {gpsLocation && (
                                                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                                                            {gpsLocation.isApproximate ? 'Network' : 'GPS'}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Location Search Bar to search any building/street/landmark */}
                                            <div className="relative">
                                                <div className="relative">
                                                    <Search size={15} className="absolute left-3.5 top-3 text-gray-400" />
                                                    <input
                                                        type="text"
                                                        placeholder="Search Chikkamagaluru street, hospital, or landmark..."
                                                        className="w-full rounded-2xl border border-white/10 bg-black/40 py-2.5 pl-10 pr-10 text-xs text-white placeholder:text-gray-500 focus:outline-none focus:border-purple-400/50"
                                                        value={locationSearchQuery}
                                                        onChange={(e) => {
                                                            const val = e.target.value;
                                                            setLocationSearchQuery(val);
                                                            if (val.trim().length >= 2) {
                                                                fetchSearchResults(val);
                                                            } else {
                                                                setSearchResults([]);
                                                            }
                                                        }}
                                                    />
                                                    {searchLoading && (
                                                        <Loader2 size={14} className="absolute right-3.5 top-3 animate-spin text-purple-400" />
                                                    )}
                                                </div>

                                                {/* Search Dropdown Results */}
                                                {searchResults.length > 0 && (
                                                    <div className="absolute left-0 right-0 top-full mt-1.5 z-50 max-h-48 overflow-y-auto rounded-2xl border border-purple-500/30 bg-[#12141c] p-2 shadow-2xl space-y-1">
                                                        {searchResults.map((item, idx) => (
                                                            <button
                                                                key={idx}
                                                                type="button"
                                                                onClick={() => {
                                                                    const lat = parseFloat(item.lat);
                                                                    const lng = parseFloat(item.lon);
                                                                    const addr = item.display_name;
                                                                    setGpsLocation({
                                                                        latitude: lat,
                                                                        longitude: lng,
                                                                        accuracy: 5,
                                                                        timestamp: new Date(),
                                                                        isApproximate: false,
                                                                        address: addr,
                                                                    });
                                                                    setDetectedAddress(addr);
                                                                    setAccidentAddress(addr);
                                                                    setLocationSearchQuery('');
                                                                    setSearchResults([]);
                                                                    setLocationError('');
                                                                }}
                                                                className="w-full text-left p-2.5 rounded-xl hover:bg-white/10 transition-colors flex items-start gap-2.5 group"
                                                            >
                                                                <MapPin size={14} className="text-purple-400 shrink-0 mt-0.5 group-hover:scale-110 transition-transform" />
                                                                <div className="min-w-0 flex-1">
                                                                    <p className="text-xs font-semibold text-white truncate">{item.display_name.split(',')[0]}</p>
                                                                    <p className="text-[10px] text-gray-400 truncate">{item.display_name}</p>
                                                                </div>
                                                            </button>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>

                                            {/* Interactive Pinpoint Map (Drag or click anywhere to adjust location) */}
                                            {gpsLocation && (
                                                <PinpointMap
                                                    latitude={gpsLocation.latitude}
                                                    longitude={gpsLocation.longitude}
                                                    onLocationChange={(newLat, newLng) => {
                                                        setGpsLocation(prev => ({
                                                            ...prev,
                                                            latitude: newLat,
                                                            longitude: newLng,
                                                            accuracy: 5,
                                                            isApproximate: false,
                                                        }));
                                                        reverseGeocode(newLat, newLng);
                                                    }}
                                                />
                                            )}

                                            {locationLoading ? (
                                                <div className="flex items-center gap-3 p-4 rounded-2xl bg-purple-500/10 border border-purple-500/30 text-purple-300">
                                                    <Loader2 size={20} className="animate-spin text-purple-400 shrink-0" />
                                                    <div className="text-xs">
                                                        <p className="font-bold text-white">Acquiring Precise GPS Coordinates…</p>
                                                        <p className="text-gray-400 mt-0.5">Triangulating positioning…</p>
                                                    </div>
                                                </div>
                                            ) : locationError ? (
                                                <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/30 space-y-3">
                                                    <div className="flex items-start gap-2.5">
                                                        <AlertTriangle size={18} className="text-red-400 shrink-0 mt-0.5" />
                                                        <div>
                                                            <p className="text-xs font-bold text-red-200">Location permission notice</p>
                                                            <p className="text-[11px] text-gray-300 mt-1 leading-relaxed">{locationError}</p>
                                                        </div>
                                                    </div>
                                                    <div className="flex flex-wrap gap-2 pt-1">
                                                        <button
                                                            type="button"
                                                            onClick={() => requestCurrentLocation(false)}
                                                            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-black uppercase tracking-wider transition-colors shadow-sm"
                                                        >
                                                            <MapPin size={13} /> Retry GPS
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={setChikkamagaluruPreset}
                                                            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold uppercase tracking-wider transition-colors shadow-sm"
                                                        >
                                                            📍 Pin Chikkamagaluru
                                                        </button>
                                                    </div>
                                                </div>
                                            ) : gpsLocation ? (
                                                <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 space-y-3">
                                                    <div className="flex items-center justify-between gap-2">
                                                        <div className="flex items-center gap-2 text-emerald-400 text-xs font-black uppercase tracking-wider">
                                                            <CheckCircle2 size={16} />
                                                            <span>Emergency location locked</span>
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            <button
                                                                type="button"
                                                                onClick={() => requestCurrentLocation(true)}
                                                                className="text-[11px] text-emerald-300 hover:text-white underline font-bold"
                                                            >
                                                                Recalibrate GPS
                                                            </button>
                                                        </div>
                                                    </div>

                                                    {/* Coordinates & Accuracy */}
                                                    <div className="text-xs text-gray-300 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono bg-black/30 p-2.5 rounded-xl border border-white/5">
                                                        <span>Lat: <strong className="text-white">{gpsLocation.latitude.toFixed(5)}</strong></span>
                                                        <span>Lng: <strong className="text-white">{gpsLocation.longitude.toFixed(5)}</strong></span>
                                                        <span className="text-[11px] text-emerald-400 font-sans font-bold ml-auto flex items-center gap-1">
                                                            <ShieldCheck size={13} />
                                                            {gpsLocation.isApproximate ? 'Network' : `Accuracy: ±${gpsLocation.accuracy}m`}
                                                        </span>
                                                    </div>

                                                    {/* Full Street Address Box */}
                                                    <div className="bg-[#0b0d11] p-3 rounded-xl border border-white/10">
                                                        <div className="flex items-start gap-2.5">
                                                            <MapPin size={16} className="text-red-400 shrink-0 mt-0.5" />
                                                            <div className="min-w-0 flex-1">
                                                                <p className="text-[10px] uppercase font-black tracking-wider text-gray-400">
                                                                    Detected Full Address
                                                                </p>
                                                                {addressLoading ? (
                                                                    <div className="flex items-center gap-2 text-xs text-purple-300 mt-1">
                                                                        <Loader2 size={12} className="animate-spin" />
                                                                        <span>Resolving street & area details…</span>
                                                                    </div>
                                                                ) : (detectedAddress || gpsLocation.address) ? (
                                                                    <p className="text-xs font-semibold text-white mt-0.5 leading-relaxed break-words">
                                                                        {detectedAddress || gpsLocation.address}
                                                                    </p>
                                                                ) : (
                                                                    <p className="text-xs text-gray-400 italic mt-0.5">
                                                                        Coordinates pinned on map. Add landmark below if needed.
                                                                    </p>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* Optional Landmark / Specific Location note */}
                                                    <div>
                                                        <label className="block text-[11px] font-bold text-gray-400 mb-1">
                                                            Additional Landmark / Room / Gate <span className="font-normal text-gray-500">(optional)</span>
                                                        </label>
                                                        <input
                                                            type="text"
                                                            value={accidentAddress === (detectedAddress || gpsLocation.address) ? '' : accidentAddress}
                                                            onChange={(e) => setAccidentAddress(e.target.value)}
                                                            placeholder="e.g. Near main gate, 3rd floor, Flat 402..."
                                                            className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-xs text-white placeholder:text-gray-600 focus:outline-none focus:border-purple-400/50"
                                                        />
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="flex gap-2">
                                                    <button
                                                        type="button"
                                                        onClick={() => requestCurrentLocation(true)}
                                                        className="flex-1 flex items-center justify-center gap-2 p-3.5 rounded-2xl bg-purple-500/15 border border-purple-500/30 hover:bg-purple-500/25 text-purple-200 text-xs font-bold transition-colors"
                                                    >
                                                        <MapPin size={16} /> Acquire GPS Location
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={setChikkamagaluruPreset}
                                                        className="flex items-center justify-center gap-2 px-4 py-3.5 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 text-gray-300 text-xs font-semibold transition-colors"
                                                    >
                                                        📍 Chikkamagaluru
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    ) : (

                                        <label className="block text-xs font-bold text-gray-300">
                                            Emergency Location <span className="font-normal text-gray-500">(critical for ambulance response)</span>
                                            <div className="relative mt-2">
                                                <MapPin size={16} className="absolute left-3 top-3 text-purple-300" />
                                                <input
                                                    value={accidentAddress}
                                                    onChange={(e) => setAccidentAddress(e.target.value)}
                                                    placeholder="Address, landmark, cross street, or GPS details..."
                                                    className="w-full rounded-2xl border border-white/10 bg-white/[0.03] py-3 pl-10 pr-3 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-purple-400/50"
                                                />
                                            </div>
                                        </label>
                                    )}

                                    {accidentMode === 'SELF' && (
                                        <div className="flex items-start gap-3 p-3 rounded-2xl bg-blue-500/8 border border-blue-500/20">
                                            <User size={16} className="text-blue-400 shrink-0 mt-0.5" />
                                            <p className="text-xs text-blue-200/80 leading-relaxed">
                                                Your patient identity will be automatically attached to this emergency case using your authenticated account.
                                            </p>
                                        </div>
                                    )}
                                    {accidentMode === 'OTHER' && (
                                        <div className="flex items-start gap-3 p-3 rounded-2xl bg-amber-500/8 border border-amber-500/20">
                                            <ImageIcon size={16} className="text-amber-400 shrink-0 mt-0.5" />
                                            <p className="text-xs text-amber-200/80 leading-relaxed">
                                                Patient identity is <span className="font-bold">Not Identified</span>. Ambulance personnel will confirm the victim's identity upon arrival using QR or in-person assessment.
                                            </p>
                                        </div>
                                    )}

                                    <div className="flex gap-3 pt-2">
                                        <button
                                            type="button"
                                            onClick={() => { if (accidentMode === 'OTHER' && admission?.isAdmitted) { handleAccidentClose(); return; } setAccidentStep(1); }}
                                            className="flex-1 min-h-12 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 hover:text-white text-sm font-bold uppercase tracking-[0.1em] transition-colors disabled:opacity-40"
                                            disabled={accidentMode === 'OTHER' && admission?.isAdmitted}
                                        >
                                            Back
                                        </button>
                                        <button
                                            type="button"
                                            onClick={submitAccidentCase}
                                            disabled={!accidentDetails.trim() || accidentSubmitting || photoUploading || locationLoading || (accidentMode === 'SELF' && !gpsLocation)}
                                            className="flex-[2] min-h-12 rounded-2xl bg-purple-600 hover:bg-purple-500 disabled:opacity-45 text-white text-sm font-black uppercase tracking-[0.12em] flex items-center justify-center gap-2"
                                        >
                                            {accidentSubmitting || photoUploading ? (
                                                <>
                                                    <Loader2 size={17} className="animate-spin" />
                                                    {photoUploading && !accidentSubmitting ? 'Uploading Photo…' : 'Requesting Ambulance…'}
                                                </>
                                            ) : locationLoading ? (
                                                <>
                                                    <Loader2 size={17} className="animate-spin" />
                                                    Acquiring GPS…
                                                </>
                                            ) : (
                                                <>
                                                    <Ambulance size={17} />
                                                    Request Ambulance
                                                </>
                                            )}
                                        </button>
                                    </div>
                                </div>
                            )}
                        </motion.div>
                    </motion.div>
                )}</AnimatePresence>
            </div>
        );
    }

    if (activeAppointment) {
        return (
            <div className="max-w-4xl mx-auto py-20 px-6">
                <div className="bg-[#0e1117] border border-red-500/20 rounded-[48px] p-12 text-center shadow-2xl relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-red-600 to-transparent opacity-50" />
                    <div className="w-24 h-24 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-8 border border-red-500/20">
                        <XCircle size={48} className="text-red-500" />
                    </div>
                    <h2 className="text-4xl font-black text-white mb-4 uppercase tracking-tighter">Active Appointment Detected</h2>
                    <p className="text-gray-400 text-lg mb-10 max-w-2xl mx-auto leading-relaxed">
                        You currently have an active appointment with <span className="text-white font-bold">Dr. {activeAppointment.doctorId?.name}</span>. 
                        To ensure clinical safety and protocol adherence, you cannot book a new emergency session until your current one is completed or cancelled.
                    </p>
                    <div className="flex flex-col sm:flex-row gap-4 justify-center">
                        <button 
                            onClick={() => navigate('/patient-dashboard/appointments')}
                            className="px-10 py-5 rounded-[24px] bg-red-600 text-white font-black uppercase tracking-widest text-sm hover:bg-red-500 transition-all shadow-xl shadow-red-900/20"
                        >
                            View Active Session
                        </button>
                        <button 
                            onClick={() => navigate('/patient-dashboard')}
                            className="px-10 py-5 rounded-[24px] bg-white/5 border border-white/10 text-gray-400 hover:text-white hover:bg-white/10 transition-all text-sm font-black uppercase tracking-widest"
                        >
                            Return to Dashboard
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    const filteredHospitals = hospitals
        .filter(h => 
            h.hospitalName.toLowerCase().includes(searchTerm.toLowerCase()) ||
            h.hospitalAddress?.toLowerCase().includes(searchTerm.toLowerCase())
        )
        .sort((a, b) => a.hospitalName.localeCompare(b.hospitalName));

    const uniqueSpecializations = ['All', ...new Set(doctors.map(d => d.specialization || "General Physician"))];
    const filteredDoctors = selectedSpecialization === 'All' 
        ? doctors 
        : doctors.filter(d => (d.specialization || "General Physician") === selectedSpecialization);

    return (
        <div className="max-w-7xl mx-auto space-y-5 sm:space-y-8 pb-12 sm:pb-20 animate-in fade-in duration-700">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 sm:gap-6 bg-gradient-to-br from-red-500/10 via-red-500/5 to-transparent border border-red-500/20 rounded-3xl sm:rounded-[48px] p-5 sm:p-10 relative overflow-hidden shadow-2xl">
                <div className="absolute top-0 right-0 p-12 opacity-[0.03] scale-150 text-red-500 pointer-events-none">
                    <AlertCircle size={240} />
                </div>
                <div className="flex items-center gap-4 sm:gap-8 relative z-10">
                    <div className="w-14 h-14 sm:w-24 sm:h-24 rounded-2xl sm:rounded-[32px] bg-red-500/20 flex items-center justify-center border border-red-500/30 shadow-[0_0_50px_rgba(239,68,68,0.3)] group transition-transform hover:scale-105">
                        <AlertCircle size={28} className="sm:hidden text-red-500 animate-pulse" /><AlertCircle size={48} className="hidden sm:block text-red-500 animate-pulse" />
                    </div>
                    <div>
                        <div className="flex items-center gap-3 mb-2">
                            <span className="px-4 py-1.5 rounded-full bg-red-500/20 border border-red-500/30 text-sm font-black text-red-500 uppercase tracking-[0.2em]">Protocol v2.4</span>
                            <div className="w-2.5 h-2.5 rounded-full bg-red-500 animate-ping" />
                        </div>
                        <h1 className="text-6xl font-black text-white tracking-tighter uppercase leading-none">Emergency <span className="text-red-500">Gateway</span></h1>
                        <p className="text-base text-gray-400 font-bold uppercase tracking-[0.3em] mt-4">Priority Clinical Access Protocol • 24/7 Network Live</p>
                    </div>
                </div>
                <button 
                    onClick={() => setGatewayMode('overview')}
                    className="group self-start md:self-auto flex items-center gap-2 sm:gap-3 min-h-11 px-4 sm:px-10 py-2.5 sm:py-5 rounded-2xl sm:rounded-[28px] bg-white/5 border border-white/10 text-gray-300 hover:text-white hover:bg-white/10 transition-all text-xs sm:text-sm font-black uppercase tracking-widest relative z-10 shadow-xl"
                >
                    <ChevronLeft size={20} className="group-hover:-translate-x-1 transition-transform" /> Exit Gateway
                </button>
            </div>

            {/* Stepper Progress */}
            <div className="flex items-center gap-3 sm:gap-8 px-1 sm:px-12">
                <div className="flex flex-col gap-4 flex-1">
                    <div className={`h-2.5 rounded-full transition-all duration-700 ${step >= 1 ? 'bg-gradient-to-r from-red-600 to-red-400 shadow-[0_0_20px_rgba(239,68,68,0.4)]' : 'bg-white/5'}`} />
                    <p className={`text-sm font-black uppercase tracking-[0.2em] ${step >= 1 ? 'text-red-500' : 'text-gray-600'}`}>01. Situation Audit</p>
                </div>
                <div className="flex flex-col gap-4 flex-1">
                    <div className={`h-2.5 rounded-full transition-all duration-700 ${step >= 2 ? 'bg-gradient-to-r from-red-600 to-red-400 shadow-[0_0_20px_rgba(239,68,68,0.4)]' : 'bg-white/5'}`} />
                    <p className={`text-sm font-black uppercase tracking-[0.2em] ${step >= 2 ? 'text-red-500' : 'text-gray-600'}`}>02. Response Team</p>
                </div>
            </div>

            <AnimatePresence mode="wait">
                {step === 1 ? (
                    <motion.div 
                        key="step1"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        transition={{ duration: 0.5, ease: "circOut" }}
                        className="grid grid-cols-1 lg:grid-cols-12 gap-8"
                    >
                        {/* Situation Input */}
                        <div className="lg:col-span-5 space-y-6">
                            <div className="bg-[#0e1117] border border-white/[0.05] rounded-3xl sm:rounded-[48px] p-5 sm:p-10 space-y-5 sm:space-y-10 shadow-2xl relative overflow-hidden group">
                                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-red-600 to-transparent opacity-50" />
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between">
                                        <label className="text-sm font-black text-gray-400 uppercase tracking-[0.3em] px-1">Describe Situation</label>
                                        <span className="text-sm font-bold text-red-500/80 uppercase tracking-widest">Mandatory Field</span>
                                    </div>
                                    <textarea 
                                        value={emergencyReason}
                                        onChange={(e) => setEmergencyReason(e.target.value)}
                                        placeholder="Briefly explain the emergency condition for clinical prioritization..."
                                        className="w-full bg-white/[0.02] border border-white/10 rounded-2xl sm:rounded-[32px] p-4 sm:p-8 text-white focus:outline-none focus:border-red-500/50 focus:ring-4 focus:ring-red-500/5 transition-all min-h-36 sm:min-h-[300px] leading-relaxed text-base sm:text-lg placeholder:text-gray-700"
                                    />
                                </div>
                                
                                <div className="bg-red-500/5 border border-red-500/10 rounded-3xl p-6 flex items-start gap-5">
                                    <div className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center shrink-0 border border-red-500/20">
                                        <ShieldCheck size={20} className="text-red-500" />
                                    </div>
                                    <div>
                                        <p className="text-sm text-white font-bold mb-1">Direct Transmission Active</p>
                                        <p className="text-sm text-gray-500 leading-relaxed font-medium uppercase tracking-wider">
                                            Your situation will be transmitted directly to the selected provider's emergency response team.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Hospital Grid */}
                        <div className="lg:col-span-7 space-y-6">
                            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 px-4">
                                <div>
                                    <h3 className="text-2xl font-black text-white uppercase tracking-tighter">Select Provider</h3>
                                    <p className="text-sm text-gray-500 font-bold uppercase tracking-widest mt-1">Available Hospital Network</p>
                                </div>
                                <div className="flex items-center gap-3 w-full sm:w-auto">
                                    <div className="relative flex-1 sm:w-64 group">
                                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 group-focus-within:text-red-500 transition-colors" size={16} />
                                        <input 
                                            type="text"
                                            placeholder="Search network..."
                                            className="w-full bg-white/[0.03] border border-white/10 rounded-2xl pl-12 pr-4 py-4 text-sm text-white focus:outline-none focus:border-red-500/40 focus:bg-white/[0.05] transition-all"
                                            value={searchTerm}
                                            onChange={(e) => setSearchTerm(e.target.value)}
                                        />
                                    </div>
                                    <button
                                        disabled={!selectedHospital || !emergencyReason}
                                        onClick={() => setStep(2)}
                                        className="bg-white text-black font-black px-8 py-4 rounded-2xl text-sm uppercase tracking-[0.2em] transition-all hover:bg-gray-100 disabled:opacity-10 flex items-center justify-center gap-2 shadow-xl active:scale-[0.98] group shrink-0"
                                    >
                                        Next <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
                                    </button>
                                </div>
                            </div>

                            <div className="space-y-3 max-h-[440px] sm:max-h-[520px] overflow-y-auto pr-1 sm:pr-4 custom-scrollbar">
                                {filteredHospitals.map(h => (
                                    <button
                                        key={h._id}
                                        onClick={() => setSelectedHospital(h)}
                                        className={`w-full flex items-center gap-3 sm:gap-6 p-4 sm:p-5 rounded-2xl sm:rounded-[28px] border transition-all duration-500 text-left group relative overflow-hidden ${
                                            selectedHospital?._id === h._id 
                                            ? 'bg-red-500 border-red-500 shadow-[0_15px_30px_rgba(239,68,68,0.2)]' 
                                            : 'bg-[#0e1117] border-white/5 hover:border-red-500/30 hover:bg-white/[0.03]'
                                        }`}
                                    >
                                        <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 transition-all duration-500 ${
                                            selectedHospital?._id === h._id ? 'bg-white text-red-500 shadow-xl' : 'bg-white/5 text-red-500/60 group-hover:bg-red-500/10 group-hover:text-red-500'
                                        }`}>
                                            <Building2 size={26} />
                                        </div>
                                        
                                        <div className="flex-1 min-w-0">
                                            <h4 className={`text-lg font-black tracking-tight leading-tight mb-1 truncate ${
                                                selectedHospital?._id === h._id ? 'text-white' : 'text-gray-200'
                                            }`}>{h.hospitalName}</h4>
                                            <div className="flex items-center gap-2">
                                                <MapPin size={12} className={selectedHospital?._id === h._id ? 'text-white/60' : 'text-red-500/40'} />
                                                <p className={`text-xs font-bold truncate tracking-wide ${
                                                    selectedHospital?._id === h._id ? 'text-white/70' : 'text-gray-500'
                                                }`}>{h.hospitalAddress || 'Clinical Network'}</p>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-4 shrink-0">
                                            {selectedHospital?._id === h._id && (
                                                <div className="bg-white/20 p-2 rounded-full text-white animate-in zoom-in duration-300">
                                                    <CheckCircle2 size={18} />
                                                </div>
                                            )}
                                            <div className={`p-2 rounded-xl transition-colors ${selectedHospital?._id === h._id ? 'text-white' : 'text-gray-700 group-hover:text-red-500'}`}>
                                                <ArrowRight size={18} />
                                            </div>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </div>
                    </motion.div>
                ) : (
                    <motion.div 
                        key="step2"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        transition={{ duration: 0.5, ease: "circOut" }}
                        className="space-y-8"
                    >
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 px-4">
                            <div className="flex items-center gap-6">
                                <button 
                                    onClick={() => setStep(1)}
                                    className="p-6 rounded-[24px] bg-white/5 border border-white/10 text-gray-400 hover:text-white hover:bg-white/10 transition-all shadow-xl group"
                                >
                                    <ChevronLeft size={28} className="group-hover:-translate-x-1 transition-transform" />
                                </button>
                                <div>
                                    <h3 className="text-4xl font-black text-white uppercase tracking-tighter">Select Response Team</h3>
                                    <p className="text-sm text-red-500 font-bold mt-2 uppercase tracking-[0.2em]">Available specialists at {selectedHospital.hospitalName}</p>
                                </div>
                            </div>
                            
                            {!loading && doctors.length > 0 && (
                                <div className="flex flex-wrap gap-3">
                                    {uniqueSpecializations.map(spec => (
                                        <button
                                            key={spec}
                                            onClick={() => setSelectedSpecialization(spec)}
                                            className={`px-6 py-3 rounded-xl text-sm font-black uppercase tracking-widest transition-all border ${
                                                selectedSpecialization === spec
                                                ? 'bg-red-500 text-white border-red-500 shadow-lg shadow-red-500/20'
                                                : 'bg-white/5 text-gray-500 border-white/5 hover:bg-white/10 hover:text-gray-300'
                                            }`}
                                        >
                                            {spec}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        {loading ? (
                            <div className="py-40 flex flex-col items-center justify-center bg-[#0e1117] rounded-[48px] border border-white/[0.05] border-dashed">
                                <div className="relative mb-8">
                                    <div className="absolute inset-0 bg-red-500/20 rounded-full animate-ping" />
                                    <Loader2 size={64} className="text-red-500 animate-spin relative z-10" />
                                </div>
                                <p className="text-sm font-black text-gray-500 uppercase tracking-[0.4em]">Accessing Provider Database...</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                                {filteredDoctors.map(doctor => (
                                    <button
                                        key={doctor._id}
                                        onClick={() => setSelectedDoctor(doctor)}
                                        className={`p-10 rounded-[48px] border transition-all duration-500 text-left relative overflow-hidden group ${
                                            selectedDoctor?._id === doctor._id 
                                            ? 'bg-red-500 border-red-500 shadow-[0_30px_60px_rgba(239,68,68,0.25)] translate-y-[-4px]' 
                                            : 'bg-[#0e1117] border-white/5 hover:border-red-500/30 hover:bg-white/[0.03]'
                                        }`}
                                    >
                                        <div className="flex items-center gap-6 mb-10">
                                            <div className={`w-20 h-20 rounded-[28px] overflow-hidden border-2 transition-all duration-500 ${
                                                selectedDoctor?._id === doctor._id ? 'border-white/40 shadow-2xl scale-110' : 'border-white/10 group-hover:border-red-500/30'
                                            }`}>
                                                {doctor.profileImage ? (
                                                    <img src={`${getBaseUrl()}/${doctor.profileImage}`} alt={doctor.name} className="w-full h-full object-cover" />
                                                ) : (
                                                    <div className="w-full h-full bg-white/5 flex items-center justify-center text-gray-500">
                                                        <User size={32} />
                                                    </div>
                                                )}
                                            </div>
                                            <div>
                                                <h4 className={`text-2xl font-black tracking-tight mb-1 ${
                                                    selectedDoctor?._id === doctor._id ? 'text-white' : 'text-gray-100'
                                                }`}>{doctor.name}</h4>
                                                <p className={`text-sm font-black uppercase tracking-[0.2em] ${
                                                    selectedDoctor?._id === doctor._id ? 'text-white/70' : 'text-red-500'
                                                }`}>{doctor.specialization}</p>
                                            </div>
                                        </div>

                                        <div className="space-y-4">
                                            <div className={`px-6 py-4 rounded-2xl text-sm font-black uppercase tracking-[0.2em] text-center transition-all ${
                                                selectedDoctor?._id === doctor._id ? 'bg-black/20 text-white' : 'bg-white/5 text-gray-500'
                                            }`}>
                                                Est. Response: ~4-6 mins
                                            </div>
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleEmergencyBooking(doctor);
                                                }}
                                                disabled={booking}
                                                className={`w-full py-6 rounded-[28px] text-sm font-black uppercase tracking-[0.3em] transition-all flex items-center justify-center gap-3 ${
                                                    selectedDoctor?._id === doctor._id 
                                                    ? 'bg-white text-black hover:bg-gray-100' 
                                                    : 'bg-red-600 text-white hover:bg-red-500 shadow-xl shadow-red-500/10'
                                                }`}
                                            >
                                                {booking && selectedDoctor?._id === doctor._id ? (
                                                    <Loader2 size={16} className="animate-spin" />
                                                ) : (
                                                    <>
                                                        <ShieldCheck size={16} />
                                                        Secure Access
                                                    </>
                                                )}
                                            </button>
                                        </div>

                                        {selectedDoctor?._id === doctor._id && (
                                            <div className="absolute top-10 right-10 text-white animate-in zoom-in duration-300">
                                                <CheckCircle2 size={24} />
                                            </div>
                                        )}
                                    </button>
                                ))}
                            </div>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default EmergencyBookingPage;

import React, { useCallback, useEffect, useState } from 'react';
import {
    ArrowLeft, Hospital, User, MapPin, CalendarClock,
    Clock, Loader2, AlertTriangle, FileText, XCircle,
    AlertCircle, AlertOctagon, Phone, CheckCircle2,
    Image as ImageIcon, Truck, Navigation, Compass,
} from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import Loader from '../../components/ui/Loader';
import EmergencyTimeline from '../../components/emergency/EmergencyTimeline';
import EmergencyMap from '../../components/emergency/EmergencyMap';
import {
    IncidentBadge, SeverityBadge, StatusBadge,
    formatDateTime, getIncidentLabel,
} from '../../components/emergency/EmergencyBadges';
import {
    getEmergencyCaseById,
    cancelEmergencyCase,
} from '../../services/emergencyApi';
import socket from '../../services/socket';
import { useAuth } from '../../context/AuthContext';

const canBeCancelled = (c, user) => {
    if (!c || c.status !== 'REPORTED') return false;
    if (user?.role === 'admin') return true;
    const reportedById = c.reportedBy?._id ? String(c.reportedBy._id) : String(c.reportedBy || '');
    return Boolean(user?.id && reportedById === String(user.id));
};

const formatHealthSummary = (summary) => {
    if (!summary) return '';
    if (typeof summary === 'string') return summary.trim();
    if (typeof summary !== 'object') return '';
    const parts = [];
    if (summary.allergies?.length) parts.push(`Allergies: ${summary.allergies.join(', ')}`);
    if (summary.chronicDiseases?.length) parts.push(`Chronic: ${summary.chronicDiseases.join(', ')}`);
    if (summary.currentMedications?.length) parts.push(`Meds: ${summary.currentMedications.join(', ')}`);
    if (summary.pastDiagnoses?.length) parts.push(`Past: ${summary.pastDiagnoses.join(', ')}`);
    return parts.join(' · ');
};

const PageShell = ({ standalone, children }) => {
    if (!standalone) return children;
    return (
        <div className="min-h-screen mesh-bg">
            <div className="max-w-7xl mx-auto px-5 lg:px-8 py-7">
                {children}
            </div>
        </div>
    );
};

const InfoRow = ({ icon: Icon, iconClass, title, children }) => (
    <div className="flex items-start gap-3 px-4 py-3 rounded-2xl bg-white/[0.02] border border-white/[0.05]">
        <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${iconClass || 'bg-white/[0.04] text-gray-400'}`}>
            <Icon size={14} />
        </div>
        <div className="min-w-0 flex-1">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-gray-500">{title}</p>
            <div className="mt-1 text-sm text-gray-200 font-medium break-words">{children}</div>
        </div>
    </div>
);

const EmergencyCaseDetails = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const { user } = useAuth();
    const isDoctor = user?.role === 'doctor';
    const standalone = isDoctor;

    const [emergencyCase, setEmergencyCase] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [cancelling, setCancelling] = useState(false);
    const [confirmCancelOpen, setConfirmCancelOpen] = useState(false);
    const [cancelReason, setCancelReason] = useState('');
    const [liveAmbulanceLocation, setLiveAmbulanceLocation] = useState(null);
    const [liveDistanceMeters, setLiveDistanceMeters] = useState(null);
    const [liveEtaMinutes, setLiveEtaMinutes] = useState(null);

    const loadCase = useCallback(async () => {
        if (!id) return;
        setLoading(true);
        setError('');
        try {
            const res = await getEmergencyCaseById(id);
            if (!res.success) {
                setError(res.message || 'Failed to load emergency case.');
                setEmergencyCase(null);
                return;
            }
            setEmergencyCase(res.data || null);
            if (res.data?.ambulanceLocation) {
                setLiveAmbulanceLocation(res.data.ambulanceLocation);
            }
        } catch (err) {
            const status = err && err.response && err.response.status;
            if (status === 403 || status === 401) {
                setError('You are not authorized to view this emergency case.');
            } else if (status === 404) {
                setError('Emergency case not found.');
            } else {
                setError(
                    (err && err.response && err.response.data && err.response.data.message) ||
                    err.message ||
                    'Failed to load emergency case.'
                );
            }
            setEmergencyCase(null);
        } finally {
            setLoading(false);
        }
    }, [id]);

    useEffect(() => {
        loadCase();
    }, [loadCase]);

    useEffect(() => {
        if (!user?.id || !id) return undefined;

        const matches = (payload) => {
            if (!payload) return true;
            const targetId = payload.emergencyCaseId || payload.caseId || payload.id || payload._id;
            if (targetId && String(targetId) === String(id)) return true;
            if (!targetId) return true;
            return false;
        };

        const onStatusUpdated = (payload) => {
            if (matches(payload)) loadCase();
        };
        const onUpdated = (payload) => {
            if (matches(payload)) loadCase();
        };
        const onCreated = (payload) => {
            if (matches(payload)) loadCase();
        };
        const onAmbulanceAssigned = (payload) => {
            if (matches(payload)) loadCase();
        };
        const onAmbulanceLocationUpdated = (payload) => {
            if (matches(payload)) {
                if (payload.ambulanceLocation) {
                    setLiveAmbulanceLocation(payload.ambulanceLocation);
                }
                if (payload.distanceMeters !== undefined) {
                    setLiveDistanceMeters(payload.distanceMeters);
                }
                if (payload.etaMinutes !== undefined) {
                    setLiveEtaMinutes(payload.etaMinutes);
                }
                if (payload.autoArrived || payload.status === 'AMBULANCE_ARRIVED') {
                    loadCase();
                }
            }
        };
        const onAmbulanceArrived = (payload) => {
            if (matches(payload)) loadCase();
        };

        socket.on('emergency-status-updated', onStatusUpdated);
        socket.on('emergency-updated', onUpdated);
        socket.on('emergency-created', onCreated);
        socket.on('ambulance-assigned', onAmbulanceAssigned);
        socket.on('ambulance-location-updated', onAmbulanceLocationUpdated);
        socket.on('ambulance-arrived', onAmbulanceArrived);

        return () => {
            socket.off('emergency-status-updated', onStatusUpdated);
            socket.off('emergency-updated', onUpdated);
            socket.off('emergency-created', onCreated);
            socket.off('ambulance-assigned', onAmbulanceAssigned);
            socket.off('ambulance-location-updated', onAmbulanceLocationUpdated);
            socket.off('ambulance-arrived', onAmbulanceArrived);
        };
    }, [user?.id, id, loadCase]);

    const performCancel = async () => {
        if (!emergencyCase) return;
        setCancelling(true);
        try {
            const res = await cancelEmergencyCase(emergencyCase._id, cancelReason || undefined);
            if (res.success) {
                setConfirmCancelOpen(false);
                setCancelReason('');
                await loadCase();
                window.alert('Emergency case cancelled successfully.');
            } else {
                window.alert(res.message || 'Failed to cancel case.');
            }
        } catch (err) {
            const msg =
                (err && err.response && err.response.data && err.response.data.message) ||
                err.message ||
                'Failed to cancel case.';
            window.alert(msg);
        } finally {
            setCancelling(false);
        }
    };

    if (loading) {
        return (
            <PageShell standalone={standalone}>
                <div className="min-h-[60vh]">
                    <Loader message="Loading emergency case details" />
                </div>
            </PageShell>
        );
    }

    if (error) {
        const isAuth = /not authorized|session|unauthorized|401|403/i.test(error);
        return (
            <PageShell standalone={standalone}>
            <div className="space-y-5">
                <button
                    onClick={() => navigate(-1)}
                    className="inline-flex items-center gap-2 text-sm font-bold text-gray-400 hover:text-gray-200 transition-colors"
                >
                    <ArrowLeft size={16} /> Back
                </button>
                <div className="bg-[#111318] border border-red-500/20 rounded-3xl p-8 text-center">
                    <div className="mx-auto w-14 h-14 rounded-full bg-red-500/10 border border-red-500/30 text-red-400 flex items-center justify-center">
                        <AlertCircle size={26} />
                    </div>
                    <h3 className="mt-4 text-lg font-bold text-white">Could not load this case</h3>
                    <p className="mt-2 text-sm text-gray-400">{error}</p>
                    <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                        <button
                            onClick={loadCase}
                            className="px-5 py-2.5 rounded-full bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold transition-colors"
                        >
                            Try again
                        </button>
                        {isAuth ? (
                            <button
                                onClick={() => navigate('/login')}
                                className="px-5 py-2.5 rounded-full border border-white/10 hover:bg-white/5 text-white text-sm font-bold transition-colors"
                            >
                                Go to Login
                            </button>
                        ) : (
                            <button
                                onClick={() => navigate(user?.role === 'doctor' ? '/doctor-dashboard' : '/patient-dashboard/emergencies')}
                                className="px-5 py-2.5 rounded-full border border-white/10 hover:bg-white/5 text-white text-sm font-bold transition-colors"
                            >
                                {user?.role === 'doctor' ? 'Back to Doctor Dashboard' : 'Back to My Emergencies'}
                            </button>
                        )}
                    </div>
                </div>
            </div>
            </PageShell>
        );
    }

    if (!emergencyCase) {
        return (
            <PageShell standalone={standalone}>
                <div className="space-y-5">
                    <button
                        onClick={() => navigate(isDoctor ? '/doctor-dashboard' : '/patient-dashboard/emergencies')}
                        className="inline-flex items-center gap-2 text-sm font-bold text-gray-400 hover:text-gray-200 transition-colors"
                    >
                        <ArrowLeft size={16} /> Back
                    </button>
                    <div className="bg-[#111318] border border-white/10 rounded-3xl p-8 text-center">
                        <h3 className="text-lg font-bold text-white">Emergency case not found</h3>
                        <p className="mt-2 text-sm text-gray-400">This case could not be loaded. It may have been removed.</p>
                    </div>
                </div>
            </PageShell>
        );
    }

    const c = emergencyCase;
    const dashboardUrl = isDoctor ? '/doctor-dashboard' : '/patient-dashboard/emergencies';
    const doctorName = typeof c.assignedDoctor === 'object' ? c.assignedDoctor?.name : null;
    const doctorSpec = typeof c.assignedDoctor === 'object' ? c.assignedDoctor?.specialization : null;
    const doctorHospital = typeof c.assignedDoctor === 'object' ? c.assignedDoctor?.hospitalName : null;
    const patientName = typeof c.patient === 'object' ? c.patient?.name : null;
    const patientPhone = typeof c.patient === 'object' ? c.patient?.phone : null;
    const patientBlood = typeof c.patient === 'object' ? c.patient?.bloodGroup : null;
    const patientGuardian = typeof c.patient === 'object' ? c.patient?.guardianNumber : null;
    const patientSummary = typeof c.patient === 'object' ? formatHealthSummary(c.patient?.healthSummary) : '';
    const linkedApt = c.linkedAppointmentId;
    const aptStatus = linkedApt && typeof linkedApt === 'object' ? linkedApt.status : null;
    const aptDate = linkedApt && typeof linkedApt === 'object' ? linkedApt.date : null;
    const aptTime = linkedApt && typeof linkedApt === 'object' ? linkedApt.time : null;
    const address = c.location?.address;
    const hasCoords =
        typeof c.location?.latitude === 'number' && typeof c.location?.longitude === 'number';
    const cancellable = canBeCancelled(c, user);
    const isCancelled = c.status === 'CANCELLED';
    const isClosed = c.status === 'CLOSED';

    const statusLabel = String(c.status || 'UNKNOWN').replace(/_/g, ' ');

    const patientId = typeof c.patient === 'object' ? c.patient?._id : c.patient;
    const isPatientSelf = Boolean(user?.id && patientId && String(user.id) === String(patientId));
    const canSeeMedicalData =
        isPatientSelf ||
        user?.role === 'doctor' ||
        user?.role === 'ambulance' ||
        user?.role === 'admin' ||
        user?.role === 'hospital';

    const showNotIdentified =
        !patientName && c.responseType === 'AMBULANCE_EMERGENCY';

    const victimPhotoUrl = (() => {
        if (!c.victimPhoto) return null;
        if (typeof c.victimPhoto !== 'string') return null;
        if (c.victimPhoto.startsWith('http')) return c.victimPhoto;
        if (c.victimPhoto.startsWith('/')) return c.victimPhoto;
        if (c.victimPhoto.startsWith('uploads/')) return `/${c.victimPhoto}`;
        return `/${c.victimPhoto}`;
    })();

    return (
        <PageShell standalone={standalone}>
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => navigate(dashboardUrl)}
                        className="w-10 h-10 rounded-2xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] text-gray-300 flex items-center justify-center transition-colors"
                        title={isDoctor ? 'Back to Doctor Dashboard' : 'Back to My Emergencies'}
                    >
                        <ArrowLeft size={16} />
                    </button>
                    <div>
                        <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                            Emergency Case
                        </h2>
                        <p className="text-sm text-gray-400 mt-1">
                            Reported {formatDateTime(c.createdAt) || ''}
                        </p>
                    </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    {cancellable && (
                        <button
                            onClick={() => setConfirmCancelOpen(true)}
                            disabled={cancelling}
                            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/25 text-red-400 text-sm font-bold transition-colors disabled:opacity-50"
                        >
                            {cancelling ? <Loader2 size={14} className="animate-spin" /> : <XCircle size={14} />}
                            Cancel Emergency
                        </button>
                    )}
                    <Link
                        to={dashboardUrl}
                        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl border border-white/10 hover:bg-white/5 text-white text-sm font-bold transition-colors"
                    >
                        {isDoctor ? 'Dashboard' : 'All Cases'}
                    </Link>
                </div>
            </div>

            <div className={`rounded-3xl border p-6 sm:p-8 ${isCancelled ? 'bg-gray-500/[0.03] border-gray-500/20' : isClosed ? 'bg-blue-500/[0.03] border-blue-500/15' : 'bg-[#111318] border-white/[0.06]'}`}>
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="flex flex-wrap items-center gap-2">
                        <IncidentBadge type={c.incidentType} />
                        <SeverityBadge severity={c.severity} />
                        <StatusBadge status={c.status} />
                    </div>
                    <div className="text-right text-[11px] text-gray-500 flex flex-col items-end gap-1">
                        <span className="inline-flex items-center gap-1.5">
                            <CalendarClock size={12} />
                            Reported: {formatDateTime(c.createdAt)}
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                            <Clock size={12} />
                            Last updated: {formatDateTime(c.updatedAt)}
                        </span>
                    </div>
                </div>

                <div className="mt-6">
                    <h3 className="text-xl font-black text-white tracking-tight">
                        {getIncidentLabel(c.incidentType)}
                    </h3>
                    {c.description ? (
                        <p className="mt-2 text-sm text-gray-300 whitespace-pre-wrap break-words leading-relaxed">
                            {c.description}
                        </p>
                    ) : (
                        <p className="mt-2 text-sm text-gray-500 italic">No description provided.</p>
                    )}
                    {c.notes && (
                        <div className="mt-4 p-4 rounded-2xl bg-white/[0.03] border border-white/[0.05]">
                            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-gray-500 mb-1.5">
                                Clinical Notes
                            </p>
                            <p className="text-sm text-gray-300 whitespace-pre-wrap break-words">
                                {c.notes}
                            </p>
                        </div>
                    )}
                </div>

                <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-3">
                    {patientName && (
                        <InfoRow icon={User} iconClass="bg-rose-500/10 text-rose-400" title="Patient Details">
                            <div className="space-y-0.5">
                                <span className="font-bold text-white text-sm">{patientName}</span>
                                {canSeeMedicalData && (patientBlood || patientPhone || patientGuardian) && (
                                    <span className="block text-[11px] text-gray-400">
                                        {patientBlood && <span className="text-rose-400 font-bold mr-2">Blood: {patientBlood}</span>}
                                        {patientPhone && <span>Phone: {patientPhone}</span>}
                                        {patientGuardian && <span className="ml-2">Guardian: {patientGuardian}</span>}
                                    </span>
                                )}
                                {canSeeMedicalData && patientSummary && (
                                    <p className="text-[11px] text-gray-400 mt-1 italic line-clamp-2">
                                        History: {patientSummary}
                                    </p>
                                )}
                                {!canSeeMedicalData && (
                                    <p className="text-[11px] text-gray-500 mt-1 italic">
                                        Medical data restricted
                                    </p>
                                )}
                            </div>
                        </InfoRow>
                    )}
                    {showNotIdentified && (
                        <InfoRow icon={AlertTriangle} iconClass="bg-amber-500/10 text-amber-400" title="Patient Identity">
                            <div className="space-y-0.5">
                                <span className="font-bold text-amber-300 text-sm">Not Identified</span>
                                <span className="block text-[11px] text-gray-400">
                                    Identity will be confirmed by emergency responders on scene.
                                </span>
                            </div>
                        </InfoRow>
                    )}
                    {victimPhotoUrl && (
                        <InfoRow icon={ImageIcon} iconClass="bg-purple-500/10 text-purple-400" title="Victim Photo">
                            <div className="mt-1">
                                <img
                                    src={victimPhotoUrl}
                                    alt="Victim photo (incident scene)"
                                    className="w-full max-w-[200px] rounded-2xl border border-white/10 object-cover max-h-[140px]"
                                    onError={(e) => { e.currentTarget.style.display = 'none'; }}
                                />
                            </div>
                        </InfoRow>
                    )}
                    {c.assignedHospital && (
                        <InfoRow icon={Hospital} iconClass="bg-emerald-500/10 text-emerald-400" title="Hospital">
                            {c.assignedHospital}
                            {doctorHospital && doctorHospital !== c.assignedHospital && (
                                <span className="block text-xs text-gray-500 mt-0.5">
                                    (Doctor's primary: {doctorHospital})
                                </span>
                            )}
                        </InfoRow>
                    )}
                    {doctorName && (
                        <InfoRow icon={User} iconClass="bg-blue-500/10 text-blue-400" title="Assigned Doctor">
                            Dr. {doctorName}
                            {doctorSpec && <span className="text-gray-500"> · {doctorSpec}</span>}
                        </InfoRow>
                    )}
                    {address && (
                        <InfoRow
                            icon={MapPin}
                            iconClass="bg-orange-500/10 text-orange-400"
                            title="Incident Location"
                        >
                            <div className="space-y-1">
                                <span>{address}</span>
                                {hasCoords && (
                                    <span className="block text-[11px] text-gray-500">
                                        Lat {Number(c.location.latitude).toFixed(6)}, Lng {Number(c.location.longitude).toFixed(6)}
                                    </span>
                                )}
                            </div>
                        </InfoRow>
                    )}
                    {linkedApt && (
                        <InfoRow icon={FileText} iconClass="bg-indigo-500/10 text-indigo-400" title="Linked Appointment">
                            <div className="space-y-1">
                                <span>
                                    {aptDate ? `${aptDate}` : ''}
                                    {aptTime ? ` at ${aptTime}` : ''}
                                </span>
                                <span className="block text-[11px] text-gray-500">
                                    Status: <span className="capitalize text-gray-300">{aptStatus || '—'}</span>
                                </span>
                            </div>
                        </InfoRow>
                    )}
                    {!c.assignedHospital && !doctorName && !address && !linkedApt && (
                        <div className="md:col-span-2 p-4 rounded-2xl border border-white/[0.04] bg-white/[0.02] text-xs text-gray-500 italic">
                            Additional details such as hospital, assigned doctor, and incident location will appear here as they become available.
                        </div>
                    )}
                </div>
            </div>

            {c.responseType === 'AMBULANCE_EMERGENCY' && (['AMBULANCE_REQUESTED', 'AMBULANCE_ASSIGNED', 'AMBULANCE_ARRIVED', 'IN_TRANSIT', 'PATIENT_IDENTIFIED'].includes(c.status)) && (
                <div className="rounded-3xl border border-emerald-500/25 bg-gradient-to-br from-emerald-500/10 via-[#111318] to-[#111318] p-5 sm:p-7 shadow-[0_0_32px_rgba(16,185,129,0.08)]">
                    {/* Header */}
                    <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 flex items-center justify-center">
                                <Truck size={20} />
                            </div>
                            <div>
                                <p className="text-[11px] font-black uppercase tracking-[0.18em] text-emerald-400">
                                    Active Emergency
                                </p>
                                <h3 className="text-xl font-black text-white">
                                    {c.status === 'AMBULANCE_ASSIGNED' ? '🚑 Ambulance En Route' :
                                     c.status === 'AMBULANCE_ARRIVED' ? '✅ Ambulance Arrived' :
                                     c.status === 'IN_TRANSIT' ? '🚑 Patient in Transit' :
                                     c.status === 'AMBULANCE_REQUESTED' ? '📡 Dispatching Ambulance…' :
                                     c.status === 'PATIENT_IDENTIFIED' ? '✓ Patient Identified' :
                                     statusLabel}
                                </h3>
                            </div>
                        </div>
                        <StatusBadge status={c.status} />
                    </div>

                    {/* Status stepper */}
                    <div className="mb-5 flex items-center gap-0 overflow-x-auto pb-1">
                        {[
                            { key: 'AMBULANCE_REQUESTED', label: 'Requested' },
                            { key: 'AMBULANCE_ASSIGNED', label: 'Assigned' },
                            { key: 'AMBULANCE_ARRIVED', label: 'Arrived' },
                            { key: 'PATIENT_IDENTIFIED', label: 'Confirmed' },
                            { key: 'IN_TRANSIT', label: 'In Transit' },
                        ].map(({ key, label }, idx, arr) => {
                            const statuses = ['AMBULANCE_REQUESTED', 'AMBULANCE_ASSIGNED', 'AMBULANCE_ARRIVED', 'PATIENT_IDENTIFIED', 'IN_TRANSIT'];
                            const currentIdx = statuses.indexOf(c.status);
                            const stepIdx = statuses.indexOf(key);
                            const done = stepIdx < currentIdx;
                            const active = key === c.status;
                            return (
                                <React.Fragment key={key}>
                                    <div className="flex flex-col items-center shrink-0">
                                        <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center text-[10px] font-black transition-all ${done ? 'bg-emerald-500 border-emerald-500 text-black' : active ? 'bg-emerald-500/20 border-emerald-400 text-emerald-300' : 'bg-transparent border-white/20 text-gray-600'}`}>
                                            {done ? <CheckCircle2 size={12} /> : idx + 1}
                                        </div>
                                        <span className={`mt-1 text-[9px] font-bold uppercase tracking-wide whitespace-nowrap ${done ? 'text-emerald-400' : active ? 'text-emerald-300' : 'text-gray-600'}`}>{label}</span>
                                    </div>
                                    {idx < arr.length - 1 && (
                                        <div className={`flex-1 h-0.5 min-w-[16px] mx-1 ${stepIdx < currentIdx ? 'bg-emerald-500' : 'bg-white/10'}`} />
                                    )}
                                </React.Fragment>
                            );
                        })}
                    </div>

                    {/* Live OpenStreetMap */}
                    <EmergencyMap
                        patientLocation={c.location}
                        ambulanceLocation={liveAmbulanceLocation || c.ambulanceLocation}
                        patientName={patientName || 'Pickup Location'}
                        status={c.status}
                        distanceMeters={liveDistanceMeters}
                        etaMinutes={liveEtaMinutes}
                        isAmbulanceView={false}
                    />

                    {/* Pickup location chip */}
                    {(c.location?.address || (typeof c.location?.latitude === 'number')) && (
                        <div className="mt-3 flex items-center gap-2 text-xs text-gray-400">
                            <MapPin size={12} className="text-red-400 shrink-0" />
                            <span>
                                {c.location.address || `${Number(c.location.latitude).toFixed(5)}, ${Number(c.location.longitude).toFixed(5)}`}
                            </span>
                        </div>
                    )}
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
                <div className="lg:col-span-3 bg-[#111318] border border-white/[0.06] rounded-3xl p-6 sm:p-8">
                    <div className="flex items-center justify-between mb-5">
                        <h3 className="text-lg font-black text-white tracking-tight">
                            Emergency Timeline
                        </h3>
                        <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                            Status: {statusLabel}
                        </span>
                    </div>
                    <EmergencyTimeline
                        statusTimestamps={c.statusTimestamps}
                        currentStatus={c.status}
                        cancelledReason={c.cancelledReason}
                        responseType={c.responseType || 'AMBULANCE_EMERGENCY'}
                    />
                </div>

                <div className="lg:col-span-2 space-y-6">
                    <div className="bg-[#111318] border border-white/[0.06] rounded-3xl p-6">
                        <h3 className="text-sm font-black text-white uppercase tracking-[0.14em] mb-4">
                            Summary
                        </h3>
                        <ul className="space-y-3 text-sm">
                            <li className="flex items-center justify-between gap-3">
                                <span className="text-gray-400">Incident</span>
                                <span className="text-gray-100 font-semibold">{getIncidentLabel(c.incidentType)}</span>
                            </li>
                            <li className="flex items-center justify-between gap-3">
                                <span className="text-gray-400">Severity</span>
                                <span className="text-gray-100 font-semibold capitalize">{c.severity}</span>
                            </li>
                            <li className="flex items-center justify-between gap-3">
                                <span className="text-gray-400">Status</span>
                                <span className="text-gray-100 font-semibold capitalize">
                                    {statusLabel.toLowerCase()}
                                </span>
                            </li>
                            {patientName ? (
                                <li className="flex items-center justify-between gap-3">
                                    <span className="text-gray-400">Patient</span>
                                    <span className="text-gray-100 font-semibold text-right">{patientName}</span>
                                </li>
                            ) : showNotIdentified ? (
                                <li className="flex items-center justify-between gap-3">
                                    <span className="text-gray-400">Patient</span>
                                    <span className="text-amber-300 font-semibold text-right inline-flex items-center gap-1.5">
                                        <AlertTriangle size={12} />
                                        Not Identified
                                    </span>
                                </li>
                            ) : null}
                            <li className="flex items-center justify-between gap-3">
                                <span className="text-gray-400">Hospital</span>
                                <span className="text-gray-100 font-semibold text-right">
                                    {c.assignedHospital || '—'}
                                </span>
                            </li>
                            <li className="flex items-center justify-between gap-3">
                                <span className="text-gray-400">Doctor</span>
                                <span className="text-gray-100 font-semibold text-right">
                                    {doctorName ? `Dr. ${doctorName}` : '—'}
                                </span>
                            </li>
                            {linkedApt && (
                                <li className="flex items-center justify-between gap-3">
                                    <span className="text-gray-400">Appointment</span>
                                    <span className="text-gray-100 font-semibold text-right capitalize">
                                        {aptStatus || 'Booked'}
                                    </span>
                                </li>
                            )}
                            {isCancelled && c.cancelledReason && (
                                <li className="pt-3 border-t border-white/[0.05]">
                                    <div className="flex items-start gap-3">
                                        <XCircle size={14} className="text-gray-400 mt-0.5 shrink-0" />
                                        <div>
                                            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Cancellation reason</p>
                                            <p className="text-sm text-gray-200 mt-1 whitespace-pre-wrap break-words">
                                                {c.cancelledReason}
                                            </p>
                                        </div>
                                    </div>
                                </li>
                            )}
                        </ul>
                    </div>

                    <div className="bg-gradient-to-br from-emerald-500/10 to-transparent border border-emerald-500/15 rounded-3xl p-6">
                        <div className="flex items-center gap-3 mb-3">
                            <div className="w-9 h-9 rounded-xl bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 flex items-center justify-center">
                                <CheckCircle2 size={16} />
                            </div>
                            <h3 className="text-sm font-black text-white uppercase tracking-[0.14em]">
                                Live Updates
                            </h3>
                        </div>
                        <p className="text-xs text-gray-300 leading-relaxed">
                            This page updates automatically whenever the emergency status changes,
                            new details are added, or responders are assigned — no need to refresh.
                        </p>
                    </div>
                </div>
            </div>

            {confirmCancelOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fadein">
                    <div className="w-full max-w-md bg-[#0a0f1c] border border-red-500/20 rounded-3xl p-6 shadow-2xl">
                        <div className="flex items-start gap-3">
                            <div className="w-10 h-10 rounded-full bg-red-500/10 border border-red-500/30 text-red-400 flex items-center justify-center shrink-0">
                                <AlertTriangle size={18} />
                            </div>
                            <div className="flex-1 min-w-0">
                                <h3 className="text-lg font-black text-white">Cancel this emergency case?</h3>
                                <p className="text-sm text-gray-400 mt-1.5">
                                    Cancellation is only allowed while the case is <span className="font-bold text-white">Reported</span>.
                                    After cancelling, no further updates can be made.
                                </p>
                            </div>
                        </div>

                        <label className="block mt-5">
                            <span className="text-[11px] font-black uppercase tracking-widest text-gray-500">
                                Cancellation reason <span className="text-gray-600">(optional)</span>
                            </span>
                            <textarea
                                value={cancelReason}
                                onChange={(e) => setCancelReason(e.target.value)}
                                rows={3}
                                placeholder="Briefly explain why the emergency is being cancelled..."
                                className="mt-1.5 w-full px-4 py-3 rounded-2xl bg-white/[0.03] border border-white/[0.08] text-sm text-white placeholder-gray-600 focus:outline-none focus:border-red-500/40 focus:bg-white/[0.05]"
                            />
                        </label>

                        <div className="mt-6 flex flex-col sm:flex-row gap-2 sm:justify-end">
                            <button
                                onClick={() => {
                                    setConfirmCancelOpen(false);
                                    setCancelReason('');
                                }}
                                disabled={cancelling}
                                className="px-5 py-2.5 rounded-2xl border border-white/10 hover:bg-white/5 text-white text-sm font-bold transition-colors disabled:opacity-50"
                            >
                                Keep Case
                            </button>
                            <button
                                onClick={performCancel}
                                disabled={cancelling}
                                className="px-5 py-2.5 rounded-2xl bg-red-600 hover:bg-red-500 text-white text-sm font-bold transition-colors disabled:opacity-50 inline-flex items-center justify-center gap-2"
                            >
                                {cancelling ? (
                                    <Loader2 size={14} className="animate-spin" />
                                ) : (
                                    <XCircle size={14} />
                                )}
                                Yes, Cancel Emergency
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
        </PageShell>
    );
};

export default EmergencyCaseDetails;

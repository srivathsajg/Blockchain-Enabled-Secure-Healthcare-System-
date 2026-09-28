import React from 'react';
import { AlertTriangle, AlertOctagon, AlertCircle, Info, XCircle, CheckCircle } from 'lucide-react';

export const INCIDENT_LABELS = {
    ROAD_ACCIDENT: { label: 'Road Accident', short: 'Road Accident' },
    MEDICAL_EMERGENCY: { label: 'Medical Emergency', short: 'Medical' },
    FALL: { label: 'Fall Injury', short: 'Fall' },
    FIRE: { label: 'Fire Emergency', short: 'Fire' },
    CARDIAC: { label: 'Cardiac Event', short: 'Cardiac' },
    UNCONSCIOUS: { label: 'Unconscious Patient', short: 'Unconscious' },
    OTHER: { label: 'Other Emergency', short: 'Other' },
};

export const SEVERITY_MAP = {
    LOW: {
        cls: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
        dot: 'bg-emerald-400',
        label: 'Low',
        Icon: Info,
    },
    MODERATE: {
        cls: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
        dot: 'bg-yellow-400',
        label: 'Moderate',
        Icon: AlertCircle,
    },
    HIGH: {
        cls: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
        dot: 'bg-orange-400',
        label: 'High',
        Icon: AlertTriangle,
    },
    CRITICAL: {
        cls: 'bg-red-500/15 text-red-400 border-red-500/30',
        dot: 'bg-red-400 animate-pulse',
        label: 'Critical',
        Icon: AlertOctagon,
    },
};

export const STATUS_MAP = {
    REPORTED: { label: 'Reported', cls: 'bg-blue-500/15 text-blue-400 border-blue-500/30', dot: 'bg-blue-400' },
    AMBULANCE_REQUESTED: { label: 'Ambulance Requested', cls: 'bg-indigo-500/15 text-indigo-400 border-indigo-500/30', dot: 'bg-indigo-400' },
    AMBULANCE_ASSIGNED: { label: 'Ambulance Assigned', cls: 'bg-purple-500/15 text-purple-400 border-purple-500/30', dot: 'bg-purple-400' },
    AMBULANCE_ARRIVED: { label: 'Ambulance On Scene', cls: 'bg-fuchsia-500/15 text-fuchsia-400 border-fuchsia-500/30', dot: 'bg-fuchsia-400' },
    PATIENT_IDENTIFIED: { label: 'Patient Identified', cls: 'bg-pink-500/15 text-pink-400 border-pink-500/30', dot: 'bg-pink-400' },
    IN_TRANSIT: { label: 'In Transit', cls: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30', dot: 'bg-cyan-400' },
    HOSPITAL_PREPARED: { label: 'Hospital Prepared', cls: 'bg-teal-500/15 text-teal-400 border-teal-500/30', dot: 'bg-teal-400' },
    ARRIVED_AT_HOSPITAL: { label: 'Arrived at Hospital', cls: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30', dot: 'bg-emerald-400' },
    UNDER_TREATMENT: { label: 'Under Treatment', cls: 'bg-green-500/15 text-green-400 border-green-500/30', dot: 'bg-green-400' },
    CLOSED: { label: 'Closed', cls: 'bg-gray-500/15 text-gray-300 border-gray-500/30', dot: 'bg-gray-400' },
    CANCELLED: { label: 'Cancelled', cls: 'bg-gray-500/15 text-gray-400 border-gray-500/30', dot: 'bg-gray-500' },
    DOCTOR_NOTIFIED: { label: 'Doctor Notified', cls: 'bg-blue-500/15 text-blue-400 border-blue-500/30', dot: 'bg-blue-400' },
    DOCTOR_HANDLING: { label: 'Doctor Handling', cls: 'bg-red-500/15 text-red-400 border-red-500/30', dot: 'bg-red-400' },
};

export const IncidentBadge = ({ type }) => {
    const info = INCIDENT_LABELS[type] || INCIDENT_LABELS.OTHER;
    return (
        <span className="inline-flex items-center gap-1.5 text-[11px] font-black uppercase tracking-[0.15em] px-2.5 py-1 rounded-full border border-white/10 bg-white/[0.04] text-gray-200">
            <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
            {info.short}
        </span>
    );
};

export const SeverityBadge = ({ severity }) => {
    const m = SEVERITY_MAP[severity] || SEVERITY_MAP.LOW;
    const Icon = m.Icon;
    return (
        <span className={`inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full border ${m.cls}`}>
            <Icon size={11} /> Severity: {m.label}
        </span>
    );
};

export const StatusBadge = ({ status }) => {
    const m = STATUS_MAP[status] || STATUS_MAP.REPORTED;
    const Icon = status === 'CANCELLED' ? XCircle : CheckCircle;
    return (
        <span className={`inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full border ${m.cls}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${m.dot}`} />
            {m.label}
        </span>
    );
};

export const formatDateTime = (val) => {
    if (!val) return '';
    try {
        const d = typeof val === 'string' || typeof val === 'number' ? new Date(val) : val;
        if (!d || Number.isNaN(d.getTime())) return '';
        return d.toLocaleString();
    } catch (e) {
        return '';
    }
};

export const getIncidentLabel = (type) =>
    (INCIDENT_LABELS[type] || INCIDENT_LABELS.OTHER).label;

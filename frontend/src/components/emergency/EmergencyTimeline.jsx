import React from 'react';
import { Check, Circle, X } from 'lucide-react';

export const LIFECYCLE_ORDER = [
    'REPORTED',
    'AMBULANCE_REQUESTED',
    'AMBULANCE_ASSIGNED',
    'AMBULANCE_ARRIVED',
    'PATIENT_IDENTIFIED',
    'IN_TRANSIT',
    'HOSPITAL_PREPARED',
    'ARRIVED_AT_HOSPITAL',
    'UNDER_TREATMENT',
    'CLOSED',
];

export const DOCTOR_LIFECYCLE_ORDER = [
    'REPORTED',
    'DOCTOR_NOTIFIED',
    'DOCTOR_HANDLING',
    'UNDER_TREATMENT',
    'CLOSED',
];

export const STATUS_LABELS = {
    REPORTED: 'Emergency Reported',
    AMBULANCE_REQUESTED: 'Ambulance Requested',
    AMBULANCE_ASSIGNED: 'Ambulance Assigned',
    AMBULANCE_ARRIVED: 'Ambulance Arrived',
    PATIENT_IDENTIFIED: 'Patient Identified',
    IN_TRANSIT: 'In Transit to Hospital',
    HOSPITAL_PREPARED: 'Hospital Prepared',
    ARRIVED_AT_HOSPITAL: 'Arrived at Hospital',
    UNDER_TREATMENT: 'Under Treatment',
    CLOSED: 'Case Closed',
    CANCELLED: 'Cancelled',
    DOCTOR_NOTIFIED: 'Doctor Notified',
    DOCTOR_HANDLING: 'Doctor Handling Emergency',
};

export const DOCTOR_STATUS_LABELS = {
    REPORTED: 'Emergency Reported',
    DOCTOR_NOTIFIED: 'Doctor Notified',
    DOCTOR_HANDLING: 'Doctor Handling Emergency',
    UNDER_TREATMENT: 'Under Treatment',
    CLOSED: 'Emergency Completed',
    CANCELLED: 'Cancelled',
};

const formatTimestamp = (ts) => {
    if (!ts) return '';
    try {
        const d = typeof ts === 'string' ? new Date(ts) : ts;
        if (Number.isNaN(d.getTime())) return '';
        return d.toLocaleString();
    } catch (e) {
        return '';
    }
};

const getStatusColor = (status, isCompleted, responseType) => {
    if (status === 'CANCELLED') return 'text-gray-400 border-gray-500/40 bg-gray-500/10';
    if (status === 'CLOSED') return responseType === 'DOCTOR_EMERGENCY' ? 'text-green-400 border-green-500/40 bg-green-500/10' : 'text-blue-400 border-blue-500/40 bg-blue-500/10';
    if (isCompleted) return 'text-emerald-400 border-emerald-500/40 bg-emerald-500/10';
    return 'text-gray-500 border-white/10 bg-white/[0.02]';
};

const EmergencyTimeline = ({ statusTimestamps, currentStatus = 'REPORTED', cancelledReason = '', responseType = 'AMBULANCE_EMERGENCY' }) => {
    const isDoctorEmergency = responseType === 'DOCTOR_EMERGENCY';
    const lifecycle = isDoctorEmergency ? DOCTOR_LIFECYCLE_ORDER : LIFECYCLE_ORDER;
    const labels = isDoctorEmergency ? DOCTOR_STATUS_LABELS : STATUS_LABELS;
    const safeTimestamps = statusTimestamps || {};

    const getEffectiveTimestamp = (stage) => {
        if (!safeTimestamps) return null;
        const get = (s) => {
            if (safeTimestamps instanceof Map) return safeTimestamps.get(s) || null;
            if (typeof safeTimestamps === 'object') return safeTimestamps[s] || null;
            return null;
        };
        if (stage === 'DOCTOR_NOTIFIED') return get('REPORTED');
        if (stage === 'DOCTOR_HANDLING') return get('UNDER_TREATMENT');
        return get(stage);
    };

    const timestampAt = (stage) => getEffectiveTimestamp(stage);

    let currentIdx = lifecycle.indexOf(currentStatus);
    if (currentIdx === -1 && isDoctorEmergency) {
        if (currentStatus === 'UNDER_TREATMENT') currentIdx = 3;
        else if (currentStatus === 'REPORTED') currentIdx = 0;
        else if (currentStatus === 'CLOSED') currentIdx = 4;
    }

    const isCancelled = currentStatus === 'CANCELLED';
    const isClosed = currentStatus === 'CLOSED';

    const isStageCurrent = (stage, idx) => {
        if (currentStatus === stage) return true;
        if (!isDoctorEmergency) return false;
        if (currentStatus === 'UNDER_TREATMENT' && stage === 'UNDER_TREATMENT') return true;
        if (currentStatus === 'CLOSED') return false;
        if (currentStatus === 'REPORTED' && stage === 'REPORTED') return true;
        return false;
    };

    return (
        <div className="w-full">
            <div className="relative space-y-1">
                {lifecycle.map((stage, idx) => {
                    const completedAt = timestampAt(stage);
                    let isCompleted = !!completedAt;
                    if (currentIdx >= 0 && idx < currentIdx) isCompleted = true;
                    if (isClosed) isCompleted = true;
                    const isCurrent = isStageCurrent(stage, idx);
                    const color = getStatusColor(stage, isCompleted, responseType);

                    return (
                        <div key={stage} className="relative flex gap-4 min-h-[62px]">
                            <div className="relative flex flex-col items-center">
                                <div
                                    className={`relative z-10 w-8 h-8 rounded-full border-2 flex items-center justify-center shrink-0 ${color} ${isCurrent ? 'ring-2 ring-offset-2 ring-offset-[#0a0f1c] ring-emerald-500/60 scale-110' : ''}`}
                                >
                                    {isCompleted ? (
                                        <Check size={14} />
                                    ) : (
                                        <Circle size={14} className="opacity-40" />
                                    )}
                                </div>
                                {idx < lifecycle.length - 1 && (
                                    <div
                                        className={`absolute top-8 w-[2px] h-[calc(100%-28px)] ${isCompleted ? 'bg-emerald-500/40' : 'bg-white/[0.06]'}`}
                                    />
                                )}
                            </div>
                            <div className="flex-1 pb-5">
                                <div className="flex flex-wrap items-center gap-2">
                                    <span className={`text-sm font-bold tracking-wide ${isCompleted ? 'text-gray-100' : 'text-gray-500'}`}>
                                        {labels[stage] || stage}
                                    </span>
                                    {isCurrent && !isCancelled && (
                                        <span className="text-[10px] font-black uppercase tracking-[0.15em] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/30">
                                            Current
                                        </span>
                                    )}
                                </div>
                                {completedAt ? (
                                    <p className="text-[11px] text-gray-500 mt-0.5">
                                        {formatTimestamp(completedAt)}
                                    </p>
                                ) : (
                                    <p className="text-[11px] text-gray-600 mt-0.5 italic">
                                        Pending
                                    </p>
                                )}
                            </div>
                        </div>
                    );
                })}

                {isCancelled && (
                    <div className="mt-4 p-4 rounded-2xl border border-gray-500/20 bg-gray-500/5">
                        <div className="flex items-start gap-3">
                            <div className="w-8 h-8 rounded-full bg-gray-500/10 border border-gray-500/30 text-gray-400 flex items-center justify-center shrink-0">
                                <X size={14} />
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-bold text-gray-300 tracking-wide">
                                    {(isDoctorEmergency ? DOCTOR_STATUS_LABELS : STATUS_LABELS).CANCELLED}
                                </p>
                                <p className="text-[11px] text-gray-500 mt-0.5">
                                    {formatTimestamp(timestampAt('CANCELLED')) || ''}
                                </p>
                                {cancelledReason && (
                                    <p className="text-xs text-gray-400 mt-2 whitespace-pre-wrap break-words">
                                        {cancelledReason}
                                    </p>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default EmergencyTimeline;

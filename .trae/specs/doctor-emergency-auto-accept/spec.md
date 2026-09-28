# Doctor Medical Emergency Auto-Accept Flow Specification

## Problem
The Medicare MERN application supports two emergency workflows: (1) Ambulance Emergency with multi-stage transport lifecycle and (2) Doctor Emergency where a patient books directly with a specific doctor+hospital. The DOCTOR_EMERGENCY flow currently has overly permissive status transitions that leak ambulance stages (AMBULANCE_REQUESTED, HOSPITAL_PREPARED, ARRIVED_AT_HOSPITAL, etc.) into the doctor path, the Start/Complete endpoints accept wider status ranges than specified, and the Doctor Dashboard Emergency Queue shows Start button for ambulance-only statuses that should never be part of a doctor emergency.

## Users
- **Patient**: Books a Medical Emergency by selecting hospital + doctor → expects auto-approval, no doctor "accept" step.
- **Doctor**: Receives auto-assigned DOCTOR_EMERGENCY cases, sees them in Emergency Queue with only Start / Complete actions, tracks AVAILABLE vs BUSY_WITH_EMERGENCY status.
- **Ambulance Personnel**: Existing AMBULANCE_EMERGENCY workflow must continue unchanged (zero regression).

## Goals
1. Enforce a strict 3-stage lifecycle for DOCTOR_EMERGENCY: REPORTED → UNDER_TREATMENT → CLOSED (plus CANCELLED from REPORTED).
2. Ensure startDoctorEmergency only accepts REPORTED → UNDER_TREATMENT; completeDoctorEmergency only accepts UNDER_TREATMENT → CLOSED.
3. Align Doctor Dashboard UI so Start Emergency appears only for REPORTED cases and never renders an "Accept Emergency" action.
4. Preserve full compatibility of the AMBULANCE_EMERGENCY workflow, existing appointment booking, and authentication/RBAC.
5. Keep socket event names, notification semantics, and data access patterns identical to current implementation for ambulance cases.

## Non-Goals
- Do not add new database statuses or fake intermediate stages for the timeline (timeline derives virtual stages via existing timestamps).
- Do not cancel, reschedule, reject, or modify status of existing regular appointments when a doctor starts an emergency (only delay-notify affected patients).
- Do not rework the ambulance dashboard, ambulance QR flow, or the generic emergency status endpoint.
- Do not change the EmergencyCase or User MongoDB schema fields — they already contain responseType and doctorStatus with correct defaults.
- Do not create new API routes — the POST /api/doctor/{start,complete}-emergency/:caseId routes already exist.

---

## Functional Requirements

### FR-1 EmergencyCase Model Field (responseType)
- responseType field exists with enum ["DOCTOR_EMERGENCY","AMBULANCE_EMERGENCY"], default "AMBULANCE_EMERGENCY".
- Existing AMBULANCE_EMERGENCY records continue to validate and transition with the ambulance rule set.

### FR-2 User.doctorStatus Field
- doctorStatus enum ["AVAILABLE","BUSY_WITH_EMERGENCY"], default "AVAILABLE".
- Set to BUSY_WITH_EMERGENCY atomically when Start Emergency succeeds.
- Set back to AVAILABLE when Complete Emergency succeeds AND no other active DOCTOR_EMERGENCY cases remain for that doctor.

### FR-3 Patient Booking (isEmergency + selected doctor)
- bookAppointment sets appointment status="approved" (auto-approved) when isEmergency=true.
- Creates EmergencyCase with responseType="DOCTOR_EMERGENCY", status="REPORTED", assignedDoctor, assignedHospital, linkedAppointmentId.
- Emits socket events to patient, doctor, and hospital channels (same events as today).
- Does NOT route through ambulance stages.

### FR-4 Strict DOCTOR_EMERGENCY Transition Rules
Apply to any EmergencyCase where responseType=DOCTOR_EMERGENCY:
- REPORTED → UNDER_TREATMENT
- REPORTED → CANCELLED
- UNDER_TREATMENT → CLOSED
- CLOSED → (none, terminal)
- CANCELLED → (none, terminal)

Ambulance transition rules remain exactly as today.

### FR-5 Start Emergency API (POST /api/doctor/start-emergency/:caseId)
Validations:
1. Logged-in user.role === "doctor".
2. Logged-in user._id === case.assignedDoctor.
3. case.responseType === "DOCTOR_EMERGENCY".
4. case.status === "REPORTED" (strict — ambulance intermediate statuses are rejected).
5. Run assertValidStatusTransition("REPORTED" → "UNDER_TREATMENT", "DOCTOR_EMERGENCY") for consistency.

Effects:
- case.status = UNDER_TREATMENT; record statusTimestamps.UNDER_TREATMENT.
- User.doctorStatus = BUSY_WITH_EMERGENCY.
- Find affected appointments (same doctor, pending/approved, excluding linked appointment) — do NOT modify them; only emit real-time delay notifications to their patients.
- Emit: emergency-status-updated, doctor-status-updated, doctor-emergency-delay (per affected patient).
- Audit log DOCTOR_EMERGENCY_STARTED.

### FR-6 Complete Emergency API (POST /api/doctor/complete-emergency/:caseId)
Validations:
1. Logged-in user.role === "doctor".
2. Logged-in user._id === case.assignedDoctor.
3. case.responseType === "DOCTOR_EMERGENCY".
4. case.status === "UNDER_TREATMENT" (strict — no skipping from REPORTED to CLOSED).
5. Run assertValidStatusTransition("UNDER_TREATMENT" → "CLOSED", "DOCTOR_EMERGENCY") for consistency.

Effects:
- case.status = CLOSED; record statusTimestamps.CLOSED.
- If zero other active DOCTOR_EMERGENCY cases for the same doctor → doctorStatus = AVAILABLE; otherwise keep BUSY_WITH_EMERGENCY.
- If transitioning to AVAILABLE → emit doctor-emergency-resolved to patients with other active appointments.
- Emit: emergency-status-updated, doctor-status-updated.
- Audit log DOCTOR_EMERGENCY_COMPLETED.

### FR-7 Doctor Dashboard Emergency Queue
- Prominent section visible on Overview tab.
- Badge displays current doctorStatus (AVAILABLE / BUSY_WITH_EMERGENCY).
- Lists only cases where responseType === "DOCTOR_EMERGENCY" AND status not in [CLOSED, CANCELLED].
- For status === REPORTED show "Start Emergency" button (loading/disabled states, toast feedback).
- For status === UNDER_TREATMENT show "Complete Emergency" button.
- NEVER render an "Accept Emergency" action.
- View Details link navigates to /doctor-dashboard/emergencies/:id, which is allowed for role doctor.
- Socket listeners refresh the queue on emergency-created, emergency-status-updated, doctor-status-updated.

### FR-8 Patient Emergency Timeline
- DOCTOR_EMERGENCY timeline shows 5 stages: Emergency Reported → Doctor Notified → Doctor Handling Emergency → Under Treatment → Emergency Completed.
- Cancelled branch handled as today.
- Ambulance stages never shown for DOCTOR_EMERGENCY.
- Timestamp fallback: Doctor Notified uses REPORTED timestamp; Doctor Handling uses UNDER_TREATMENT timestamp.

### FR-9 EmergencyCase Details Route
- /doctor-dashboard/emergencies/:id is protected for roles [doctor, patient].
- Component (EmergencyCaseDetails) passes responseType prop into EmergencyTimeline.

### FR-10 Notifications / Socket Consistency
- Event names reused from current code: emergency-created, emergency-status-updated, doctor-status-updated, doctor-emergency-delay, doctor-emergency-resolved, hospital-emergency-alert, new-appointment-received.
- Ambulance-specific events unaffected.

---

## Non-Functional Requirements

- **NFR-1 Data Integrity**: Transactional consistency for Start/Complete endpoints using mongoose session/transaction as already done. No duplicate EmergencyCase for one appointment.
- **NFR-2 Schema Compatibility**: Existing records without responseType (or implicitly AMBULANCE_EMERGENCY) must continue to work with VALID_TRANSITIONS (ambulance rules).
- **NFR-3 Zero Horizontal Regression**: Normal (non-emergency) appointment booking, approve/reject/complete actions, and all ambulance status transitions must behave identically to before these changes.
- **NFR-4 RBAC**: All doctor APIs continue to enforce authMiddleware + doctor role check via existing doctor.routes.js pipeline.
- **NFR-5 UI Responsiveness**: Doctor Dashboard Emergency Queue section must remain responsive down to 360px width; no horizontal overflow; mobile keeps existing pb-32 bottom padding rule.

---

## Constraints & Dependencies

- Constrained to existing models: EmergencyCase, User, Appointment. No new collections.
- Reuses existing socket module (backend/core/socket.js) and frontend socket service.
- Reuses existing audit service (logAction) pattern.
- Relies on existing frontend imports: getMyEmergencyCases, startDoctorEmergency, completeDoctorEmergency in emergencyApi.js.
- Depends on existing App.jsx route /doctor-dashboard/emergencies/:id with doctor+patient ProtectedRoute.

## Assumptions
- Patients use EmergencyBooking flow (medical emergency path, doctor+hospital selection) to trigger DOCTOR_EMERGENCY — ambulance path creates cases without assignedDoctor and uses responseType=AMBULANCE_EMERGENCY (implicit default).
- Affected appointments delay-notification is an in-app socket message only; appointment records remain untouched per user requirement.

---

## Open Questions

None. All ambiguous cases (e.g., "Can doctor complete from REPORTED?") are explicitly resolved by the strict lifecycle in FR-4.

---

## Acceptance Criteria

### Rule AC-1
Strict DOCTOR_EMERGENCY transition rules enforced in emergency/service.js VALID_TRANSITIONS_DOCTOR.
**Evidence**: Source code of VALID_TRANSITIONS_DOCTOR in emergency/service.js shows only REPORTED → [UNDER_TREATMENT, CANCELLED], UNDER_TREATMENT → [CLOSED], CLOSED→[], CANCELLED→[]; ambulance VALID_TRANSITIONS object left intact.

### Rule AC-2
startDoctorEmergency rejects any case.status !== "REPORTED" with a 400 error.
**Evidence**: POST start-emergency against a case with status=HOSPITAL_PREPARED returns success:false and HTTP 400 (manual API test or integration script). POST with REPORTED returns success:true.

### Rule AC-3
completeDoctorEmergency rejects any case.status !== "UNDER_TREATMENT" with a 400 error.
**Evidence**: POST complete-emergency with REPORTED returns 400. POST with UNDER_TREATMENT returns success:true and case.status=CLOSED.

### Rule AC-4
assertValidStatusTransition invoked in start/complete controllers (or equivalent transition gate) so DOCTOR_EMERGENCY path never bypasses rule engine.
**Evidence**: Source code of startDoctorEmergency/completeDoctorEmergency calls assertValidStatusTransition before setting status, and error propagation path returns 400 for invalid transitions.

### Rule AC-5
Doctor Dashboard Emergency Queue: "Start Emergency" button only rendered when case.status === "REPORTED".
**Evidence**: Source code of DoctorDashboard.jsx — isReported/button rendering logic only matches REPORTED. No string "Accept Emergency" exists in the component.

### Rule AC-6
Doctor Dashboard displays doctorStatus badge (AVAILABLE or BUSY_WITH_EMERGENCY) and updates reactively via socket.
**Evidence**: DoctorDashboard.jsx contains status badge UI element, socket on('doctor-status-updated') updates local doctorStatus state.

### Rubric AC-7 Ambulance Regression Safety (0-2, threshold ≥1)
- 2: Manually exercised AMBULANCE_REQUESTED → AMBULANCE_ASSIGNED → … → ARRIVED_AT_HOSPITAL → UNDER_TREATMENT → CLOSED transitions all succeed; no 400 "illegal transition" errors; timeline renders all ambulance stages.
- 1: Ambulance status update endpoint still validates against VALID_TRANSITIONS (ambulance) object; unit tests or source inspection confirm ambulance object unchanged.
- 0: Any ambulance intermediate status now rejected by transition validator.

### Rubric AC-8 Timeline Correctness (0-2, threshold ≥1)
- 2: DOCTOR_EMERGENCY timeline renders exactly the 5 doctor stages in order. REPORTED case shows ✓✓○○○, UNDER_TREATMENT shows ✓✓✓●○, CLOSED shows ✓✓✓✓✓. No AMBULANCE_* labels present.
- 1: Correct 5 stages visible but timestamp for one virtual stage falls back to REPORTED/UNDER_TREATMENT in a way not aligned with FR-8 fallback rules.
- 0: Ambulance stages (Ambulance Requested, In Transit, Hospital Prepared, Arrived at Hospital) appear for a DOCTOR_EMERGENCY case.

### Rule AC-9
Socket event names for start/complete flows match frontend expectations (emergency-status-updated, doctor-status-updated, doctor-emergency-delay, doctor-emergency-resolved).
**Evidence**: grep backend + frontend for event names; each event emitted in controllers has a matching frontend socket listener that triggers state refresh / toast.

### Rule AC-10
Backend syntax + frontend build both succeed with zero errors.
**Evidence**: node -c (or backend lint/build script) passes; frontend `npm run build` completes without errors; GetDiagnostics shows no new warnings/errors beyond baseline.

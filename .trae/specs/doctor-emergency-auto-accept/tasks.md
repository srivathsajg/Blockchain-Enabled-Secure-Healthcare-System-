# Implementation Tasks: Doctor Emergency Auto-Accept Flow

Derived from `spec.md`. Each task references its parent AC(s) and carries local test requirements (TR) typed `rule` or `rubric`.

---

## Task 1: Enforce Strict DOCTOR_EMERGENCY Transition Rules in Emergency Service

**File to modify**: [backend/modules/emergency/service.js](file:///d:/PROJECTS/PID26/PID%2026/Medicare/backend/modules/emergency/service.js)

**Scope**: Replace the overly permissive VALID_TRANSITIONS_DOCTOR object (currently lines 35–47) with a strict 3-stage rule set. Leave VALID_TRANSITIONS (ambulance) completely untouched.

**New VALID_TRANSITIONS_DOCTOR**:
```
REPORTED:        ["UNDER_TREATMENT", "CANCELLED"]
UNDER_TREATMENT: ["CLOSED"]
CLOSED:          []
CANCELLED:       []
```

Also ensure ambulance-only statuses (AMBULANCE_REQUESTED, …, ARRIVED_AT_HOSPITAL) do NOT appear as keys in VALID_TRANSITIONS_DOCTOR — so a DOCTOR_EMERGENCY case that somehow carries an ambulance status is immediately rejected.

**Depends on**: — (no prerequisites, first task)
**Priority**: high

### Test Requirements

#### TR-1.1 (rule — AC-1)
VALID_TRANSITIONS_DOCTOR object matches the strict shape above.
**Evidence**: `grep -n "VALID_TRANSITIONS_DOCTOR" backend/modules/emergency/service.js -A 20` shows exactly the 4 keys with the required transition arrays; VALID_TRANSITIONS object (ambulance) byte-identical to pre-change content.

#### TR-1.2 (rule — AC-1)
Calling isValidStatusTransition("REPORTED", "UNDER_TREATMENT", "DOCTOR_EMERGENCY") returns true; isValidStatusTransition("REPORTED", "HOSPITAL_PREPARED", "DOCTOR_EMERGENCY") returns false; isValidStatusTransition("UNDER_TREATMENT", "CLOSED", "DOCTOR_EMERGENCY") returns true; isValidStatusTransition("REPORTED", "CLOSED", "DOCTOR_EMERGENCY") returns false.
**Evidence**: Run a small Node snippet that requires the service and invokes the exported validator; capture stdout showing pass/fail.

#### TR-1.3 (rule — AC-7)
Ambulance transition graph unchanged. isValidStatusTransition("REPORTED", "AMBULANCE_REQUESTED", "AMBULANCE_EMERGENCY"), isValidStatusTransition("AMBULANCE_ASSIGNED", "AMBULANCE_ARRIVED", "AMBULANCE_EMERGENCY"), isValidStatusTransition("ARRIVED_AT_HOSPITAL", "UNDER_TREATMENT", "AMBULANCE_EMERGENCY") all true.
**Evidence**: Same validator snippet run with ambulance transitions.

---

## Task 2: Start Doctor Emergency — Strict Status + Transition Gate

**File to modify**: [backend/roles/doctor/doctor.controller.js](file:///d:/PROJECTS/PID26/PID%2026/Medicare/backend/roles/doctor/doctor.controller.js)

**Scope**: Update `startDoctorEmergency` (≈ lines 716–852):
1. Replace the permissive status check `["UNDER_TREATMENT", "CLOSED", "CANCELLED"].includes(emergencyCase.status)` with strict equality: `emergencyCase.status !== "REPORTED"`. This ensures ambulance intermediate statuses (HOSPITAL_PREPARED, ARRIVED_AT_HOSPITAL, etc.) are explicitly rejected with a clearer 400 message.
2. Before actually mutating the status, call `assertValidStatusTransition(emergencyCase.status, "UNDER_TREATMENT", emergencyCase.responseType)` so rule engine is the single source of truth.
3. Keep the rest of the logic (session/tx, delay notifications to affected patients via socket, audit log, doctorStatus BUSY_WITH_EMERGENCY, doctor-status-updated event, etc.) exactly as it is.

**Depends on**: Task 1 (assertValidStatusTransition behavior must be strict)
**Priority**: high

### Test Requirements

#### TR-2.1 (rule — AC-2)
Source code shows `emergencyCase.status !== "REPORTED"` guard (or equivalent strict equality) and an `assertValidStatusTransition(..., "UNDER_TREATMENT", emergencyCase.responseType)` call.
**Evidence**: File diff / lines of startDoctorEmergency.

#### TR-2.2 (rule — AC-2)
When case.status is "HOSPITAL_PREPARED" or "ARRIVED_AT_HOSPITAL", startDoctorEmergency returns HTTP 400 with success:false.
**Evidence**: Manual or scripted HTTP call via existing test-doctor-emergency.js; captured response.

#### TR-2.3 (rule — AC-2 / FR-5)
When case.status === "REPORTED" and responseType="DOCTOR_EMERGENCY", startDoctorEmergency returns success:true, data.doctorStatus === "BUSY_WITH_EMERGENCY", data.emergencyCase.status === "UNDER_TREATMENT", statusTimestamps contains UNDER_TREATMENT key.
**Evidence**: HTTP response body + separate getEmergencyCaseById read-back showing stored status and timestamp.

#### TR-2.4 (rule — AC-9 / FR-5)
Socket events emitted: emergency-status-updated (global + to patientId + to doctorId rooms), doctor-status-updated to doctorId room, doctor-emergency-delay to each affected patientId.
**Evidence**: Source-code inspection of emit block; socket listener side during test confirms events fire.

---

## Task 3: Complete Doctor Emergency — Strict Status + Transition Gate

**File to modify**: [backend/roles/doctor/doctor.controller.js](file:///d:/PROJECTS/PID26/PID%2026/Medicare/backend/roles/doctor/doctor.controller.js)

**Scope**: Update `completeDoctorEmergency` (≈ lines 854–1005):
1. Replace the permissive terminal-check `["CLOSED", "CANCELLED"].includes(emergencyCase.status)` with a strict check: reject if status !== "UNDER_TREATMENT". This prevents jumping from REPORTED directly to CLOSED.
2. Call `assertValidStatusTransition(emergencyCase.status, "CLOSED", emergencyCase.responseType)` before mutating.
3. Preserve remaining logic (active-count check for doctorStatus, socket doctor-emergency-resolved only when transitioning AVAILABLE, audit log, etc.)

**Depends on**: Task 1
**Priority**: high

### Test Requirements

#### TR-3.1 (rule — AC-3)
Source code shows status must equal "UNDER_TREATMENT" and assertValidStatusTransition("CLOSED", …) is called.
**Evidence**: Lines of completeDoctorEmergency.

#### TR-3.2 (rule — AC-3)
completeDoctorEmergency on case with status="REPORTED" or "ARRIVED_AT_HOSPITAL" returns HTTP 400 success:false.
**Evidence**: HTTP call response captured.

#### TR-3.3 (rule — AC-3 / FR-6)
completeDoctorEmergency on UNDER_TREATMENT DOCTOR_EMERGENCY returns success:true, data.emergencyCase.status === "CLOSED".
**Evidence**: HTTP response.

#### TR-3.4 (rule — AC-3 / FR-6)
When active DOCTOR_EMERGENCY count === 0 after completion, doctorStatus === "AVAILABLE" in response and doctor-status-updated event fires with "AVAILABLE". When other active cases exist → doctorStatus stays "BUSY_WITH_EMERGENCY" and NO doctor-emergency-resolved events are emitted for this completion.
**Evidence**: Separate seeded runs (two REPORTED cases → start first, complete first → still BUSY; then complete second → AVAILABLE) captured via responses and socket listener log.

---

## Task 4: Align DoctorDashboard Emergency Queue Status Button Logic

**File to modify**: [frontend/src/pages/DoctorDashboard.jsx](file:///d:/PROJECTS/PID26/PID%2026/Medicare/frontend/src/pages/DoctorDashboard.jsx)

**Scope**: In the Emergency Queue card inside the Overview tab (≈ line 1282), change the `isReported` calculation from:
```js
const isReported = c.status === 'REPORTED' || c.status === 'HOSPITAL_PREPARED' || c.status === 'ARRIVED_AT_HOSPITAL';
```
to strict:
```js
const isReported = c.status === 'REPORTED';
```
and keep `isTreatment = c.status === 'UNDER_TREATMENT'` as already correct. This ensures the "Start Emergency" button only shows for REPORTED cases — never for ambulance-only intermediate stages that should not be part of a DOCTOR_EMERGENCY lifecycle.

Also:
- Confirm the component never renders any button, link, or tooltip containing the string "Accept Emergency" (search file; if found it must be removed — current codebase scan shows it should NOT already be there, but verify).
- Confirm "View Details" link targets `/doctor-dashboard/emergencies/${c._id}` (already present) and that route is registered in App.jsx for doctor role (cross-check: already registered).

**Depends on**: — (frontend side, independent of backend order)
**Priority**: high

### Test Requirements

#### TR-4.1 (rule — AC-5)
Source code of DoctorDashboard.jsx contains `isReported = c.status === 'REPORTED'` with no additional OR clauses for ambulance intermediate statuses.
**Evidence**: Grep output + file diff.

#### TR-4.2 (rule — AC-5)
Grepping "Accept Emergency" case-insensitively across frontend/src/pages/DoctorDashboard.jsx and frontend/src/components/emergency/ returns ZERO matches.
**Evidence**: ripgrep (Grep tool) output showing zero matches.

#### TR-4.3 (rule — AC-6)
Doctor status badge render path present in Overview Emergency Queue header showing AVAILABLE / BUSY_WITH_EMERGENCY with the correct colors. Socket listener socket.on('doctor-status-updated', ...) updates local doctorStatus state (already registered — confirm no regression during edit).
**Evidence**: Source lines showing badge + listener.

#### TR-4.4 (rule — AC-5)
UI rendering: for seeded DOCTOR_EMERGENCY case with REPORTED → Start Emergency button rendered and Complete NOT rendered; for UNDER_TREATMENT → Complete button rendered and Start NOT rendered; for CLOSED case → filtered out of queue by the !['CLOSED','CANCELLED'] guard.
**Evidence**: Browser screenshot or snapshot during live run (or simulated via test component render with mocked cases).

---

## Task 5: EmergencyBooking Timeline responseType Pass-through Confirmation

**Files to read/verify (no code change expected, but fix if missing)**:
- [frontend/src/pages/patient/EmergencyBooking.jsx](file:///d:/PROJECTS/PID26/PID%2026/Medicare/frontend/src/pages/patient/EmergencyBooking.jsx) (≈ line 227 activeEmergency timeline)
- [frontend/src/pages/patient/EmergencyCaseDetails.jsx](file:///d:/PROJECTS/PID26/PID%2026/Medicare/frontend/src/pages/patient/EmergencyCaseDetails.jsx) (≈ lines 352–357)
- [frontend/src/components/emergency/EmergencyTimeline.jsx](file:///d:/PROJECTS/PID26/PID%2026/Medicare/frontend/src/components/emergency/EmergencyTimeline.jsx) (already supports DOCTOR_LIFECYCLE_ORDER)

**Scope**: Read the three files listed and confirm EmergencyTimeline is always invoked with the prop `responseType={...}` where the value comes from the case (default 'AMBULANCE_EMERGENCY' if absent). If any invocation is MISSING the responseType prop, add it using the case's responseType with a fallback.

**Depends on**: — (verification-only task, independent)
**Priority**: medium

### Test Requirements

#### TR-5.1 (rule — AC-8)
Every JSX usage of <EmergencyTimeline … /> in frontend/src passes a `responseType` prop (sourced from the current case).
**Evidence**: Grep + surrounding lines showing the prop at every call site.

#### TR-5.2 (rubric — AC-8, scale 0-2, threshold ≥1)
Manual DOM inspection of EmergencyTimeline for seeded DOCTOR_EMERGENCY case:
- 2: Shows exactly 5 stages with correct labels (Emergency Reported, Doctor Notified, Doctor Handling Emergency, Under Treatment, Emergency Completed); for REPORTED shows first 2 ✓, rest ○/● as specified; for UNDER_TREATMENT shows first 3 ✓, Under Treatment ●; for CLOSED all 5 ✓. No AMBULANCE_* stage visible.
- 1: 5-stage list correct but one timestamp fallback incorrect (e.g., Doctor Handling uses REPORTED instead of UNDER_TREATMENT per FR-8).
- 0: 8+ ambulance stages shown for DOCTOR_EMERGENCY.

---

## Task 6: Route Access Confirmation / App.jsx Doctor Emergency Details

**File to confirm**: [frontend/src/App.jsx](file:///d:/PROJECTS/PID26/PID%2026/Medicare/frontend/src/App.jsx) route `/doctor-dashboard/emergencies/:id`.

**Scope**: Verify the route exists and ProtectedRoute allows role 'doctor' (already does per lines 62–69). If the ProtectedRoute was later changed to exclude doctors, fix it. Otherwise mark as "verified no code change needed".

**Depends on**: —
**Priority**: low

### Test Requirements

#### TR-6.1 (rule — FR-9)
App.jsx source snippet shows the route wrapped in <ProtectedRoute allowedRoles={['doctor', 'patient']}> and renders EmergencyCaseDetails.
**Evidence**: File lines 62–69 read-back.

---

## Task 7: Verification Suite

**Scope**: After Tasks 1–6 are complete, run the following verification pass and collect evidence.

### Test Requirements

#### TR-7.1 (rule — AC-10)
Backend syntax check: `node -c backend/modules/emergency/service.js` and `node -c backend/roles/doctor/doctor.controller.js` both exit 0. OR run `npm run lint` / `npm test` in backend if available (check package.json scripts).
**Evidence**: Shell stdout captured.

#### TR-7.2 (rule — AC-10)
Frontend build: inside frontend directory run `npm run build`. Build exits 0, no errors. Check imports of emergencyApi for startDoctorEmergency / completeDoctorEmergency exist and resolve.
**Evidence**: Vite build output.

#### TR-7.3 (rule — AC-10)
GetDiagnostics (VS Code language diagnostics) reports zero new import/type errors in changed files compared to baseline.
**Evidence**: Screenshot or tool JSON of diagnostics for backend/modules/emergency/service.js, backend/roles/doctor/doctor.controller.js, frontend/src/pages/DoctorDashboard.jsx.

#### TR-7.4 (rule — AC-9 Socket parity)
Event names emitted in backend match frontend listeners. Checklist of pairs verified to match on both sides:
- emergency-created ✔
- emergency-status-updated ✔
- doctor-status-updated ✔
- doctor-emergency-delay ✔
- doctor-emergency-resolved ✔
- hospital-emergency-alert ✔
- new-appointment-received ✔
**Evidence**: Two-column grep listing (emit site vs on-site).

#### TR-7.5 (rule — FR-3 / NFR-3 Regression)
Normal appointment flow: non-emergency bookAppointment still sets appointment.status to "pending" and does NOT create an EmergencyCase. Emergency booking with doctor still sets status="approved" and creates linked EmergencyCase with responseType="DOCTOR_EMERGENCY".
**Evidence**: Two scripted API calls captured — one normal, one emergency — with response bodies.

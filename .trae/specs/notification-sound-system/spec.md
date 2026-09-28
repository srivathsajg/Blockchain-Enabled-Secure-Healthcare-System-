# Real-Time Notification Sound System Specification

## Problem
The Medicare MERN application has a comprehensive real-time notification system via Socket.IO that delivers visual alerts (NotificationBell + useSocketNotifications hook) for over 20 event types across all user roles. However, there is no audible alert mechanism — users relying on the application passively in the background (e.g., doctors on-call, ambulance dispatchers, pharmacists monitoring orders) miss critical time-sensitive notifications because visual badges alone are insufficient. Additionally, there is no administrator capability to customize notification sounds per notification type, and no per-user preference to disable/enable sounds.

## Users
- **Administrator (Super Admin + Hospital Admin)**: Uploads, manages, and assigns custom notification sound files to notification types; views the sound library and its usage.
- **Doctor**: Receives audible alerts for new appointments, emergency cases, lab orders, emergency status changes, and schedule disruptions; toggles sound on/off in personal settings.
- **Patient**: Receives audible alerts for appointment approval/reassignment, lab report uploads, delivery status, prescription/diet updates, and emergency case progress.
- **Pharmacist**: Receives audible alerts for new pharmacy orders and order status changes.
- **Delivery Staff**: Receives audible alerts for delivery assignments and status updates.
- **Lab Technician**: Receives audible alerts for new lab orders and report upload confirmations.
- **Ambulance Personnel**: Receives audible alerts for ambulance assignments and emergency status changes.
- **Police**: Receives audible alerts for assigned emergency cases.

## Goals
1. Provide a secure admin interface to upload audio notification sounds (MP3, WAV, OGG, max 10MB) with integrity validation and associate each sound with one or more notification event types.
2. Embed browser-compatible audio playback into the existing `useSocketNotifications` hook so that every notification event across every role triggers an audible alert unless the user has opted out.
3. Add a user-level notification sound toggle (default = enabled) in the account settings, persisted server-side in the User model and on the client (localStorage/context).
4. Ensure cross-browser sound playback works on Chrome, Firefox, Safari, and Edge, including handling autoplay policies (require user gesture unlock).
5. Provide an end-to-end verified path: upload → store → associate → play on event → respect user toggle → per-browser compatibility.

## Non-Goals
- Do not add voice synthesis (TTS) or speech-to-notification — only pre-recorded audio file playback.
- Do not implement per-notification-type user-level toggles; only a single master user-level sound on/off toggle is in scope (admin controls per-type sound assignment).
- Do not modify the existing socket event names, transport, or room semantics — sound is purely an additive concern layered on top of current emit patterns.
- Do not create a mobile-native push notification service (FCM/APNS) or offline queuing.
- Do not implement sound editing/trimming in the admin UI; only upload + assign + replace + delete.
- Do not modify the existing appointment delay notifications or ambulance status transitions beyond adding sound playback.

---

## Functional Requirements

### FR-1 NotificationSound Model & Storage
- A new `NotificationSound` MongoDB model with fields: `name` (string, unique), `description` (string), `filePath` (string, stored on disk under `backend/uploads/notifications/`), `mimeType` (audio/mpeg | audio/wav | audio/ogg), `fileSize` (bytes, ≤10MB), `fileHash` (SHA-256 for integrity), `eventTypes` (array of notification event strings from the standard event list), `createdBy` (User ref), `createdAt`, `updatedAt`, `isDefault` (boolean, fallback if no event-specific sound).
- Physical files stored in `backend/uploads/notifications/` (auto-create directory) with sanitized, randomly-generated filenames; original name stored in `name`.
- A **default system sound** is bundled/supported as a fallback (WebAudio beep or embedded data URI) when no custom sound is assigned to an event and no default exists.

### FR-2 Admin Upload & Management API
- `POST /api/admin/notification-sounds/upload` — authMiddleware + roleMiddleware(["admin"]). Accepts `multipart/form-data` with fields `name`, `description`, `eventTypes[]`, and a file field `soundFile`. Returns stored sound document with file URL.
- `GET /api/admin/notification-sounds` — List all sounds (scoped to admin hospital or global for super admin).
- `PATCH /api/admin/notification-sounds/:id` — Update name, description, or eventTypes associations (no file re-upload; separate replace endpoint if needed).
- `DELETE /api/admin/notification-sounds/:id` — Remove record + unlink file from disk; reassign any events that exclusively used this sound to the default.
- `GET /api/notification-sounds/by-event/:eventType` — Public/authenticated endpoint that resolves the correct sound URL for a given event type (or the default sound URL).

### FR-3 Upload Validation & Integrity
- **Format filter**: MP3 (`audio/mpeg`, ext `.mp3`), WAV (`audio/wav|audio/x-wav`, ext `.wav`), OGG (`audio/ogg`, ext `.ogg`) allowed via dedicated multer middleware `uploadNotificationSound` (10MB limit).
- **MIME + extension consistency check**: Reject files where file extension doesn't match declared MIME type.
- **Size enforcement**: Multer `limits.fileSize = 10 * 1024 * 1024`.
- **Integrity hash**: On upload, compute SHA-256 of the stored file buffer and store in `fileHash`; on GET sound resolution route, optionally recompute and mismatch=log&fallback.
- **Sanitized filenames**: Original name never used on disk; use `crypto.randomBytes(16).hex + ext` pattern.

### FR-4 User Model: Notification Preferences
- Add field `notificationPreferences: { soundEnabled: { type: Boolean, default: true }, soundVolume: { type: Number, default: 0.8, min: 0, max: 1 } }` to User schema.
- Expose `notificationPreferences.soundEnabled` and `soundVolume` in the GET `/api/auth/profile` response (password excluded).
- Accept `notificationPreferences.soundEnabled` and `soundVolume` updates via PUT `/api/auth/profile` (existing updateProfile flow in auth.controller.js).
- New users default to `soundEnabled = true` and `soundVolume = 0.8`.

### FR-5 Sound Playback in useSocketNotifications Hook
- The `handleNotification` callback inside `useSocketNotifications` triggers audio playback on every event **before** incrementing the badge count, subject to:
  (a) User preference `notificationPreferences.soundEnabled === true` (defaults true if missing).
  (b) Audio engine is "unlocked" (see FR-7 Autoplay).
- Sound resolution flow: fetch (once, cache in-memory) the sound URL map `{ eventType: soundUrl }` from `/api/notification-sounds/event-map` (bulk endpoint). If the event has a custom URL, use it; else fall back to the default sound bundled on the client (WebAudio oscillator beep).
- Use HTMLAudioElement (`new Audio(url)`) with `volume` = user's `soundVolume`. Guard against rapid-fire duplicate events with a 250ms playback debounce per eventType (prevent audio stack-up on burst emits).
- Playback failure (network 404, invalid format, missing codec) must be silently caught and fall back to the default WebAudio beep; never throw errors to the user.

### FR-6 User Settings UI — Sound Toggle
- In `SettingsView.jsx` (used by every role via their dashboard's Settings tab), add a new section **"Notification Preferences"** with:
  (1) A toggle switch (Lucide `Volume2` / `VolumeX` icons) for "Enable Notification Sounds" bound to the user's preference.
  (2) A range input (0% → 100%, mapped to 0.0 – 1.0) for volume, disabled and greyed-out when toggle is OFF.
  (3) A "Test Sound" button that immediately plays the default/custom notification sound using the same playback engine as real events (confirms user's speaker/volume works).
- Save follows the existing `updateProfile` FormData pattern: append `notificationPreferences.soundEnabled` and `notificationPreferences.soundVolume` as fields. After successful save, update both AuthContext user object AND the `useSocketNotifications` playback engine state.

### FR-7 Browser Autoplay Policy & Compatibility
- Create a dedicated `useAudioUnlock` hook (or integrate into useSocketNotifications) that unlocks the audio context on the first user gesture anywhere in the app (click, keydown, touchstart). Track a global `audioUnlocked` state (React context or module-level flag).
- **Before audio is unlocked**: When a notification arrives, silently queue the intent and flash the notification bell with an extra visual pulse (CSS `@keyframes sound-pending-pulse`). Once unlocked (next user click), play any queued sound (one, not all queued).
- **Supported browsers**: Feature-detect `window.AudioContext || window.webkitAudioContext` for default WebAudio beep fallback. MP3/WAV/OGG codec detection via `HTMLAudioElement.canPlayType(type)`.
- Safari-specific: Respect user gesture requirement; avoid calling `audio.play()` in an untrusted async stack. Ensure `.play()` returns a Promise and `.catch` handles NotAllowedError without surfacing to UI.

### FR-8 Admin Dashboard UI — Sound Management
- In **HospitalAdminDashboard** and **SystemAdminDashboard** Settings tab, add a new sidebar sub-tab "Notification Sounds" (`adminNotificationSounds`) showing:
  - Sound library list: name, description, associated event badges, file size, uploader/date, default flag.
  - Upload form: file picker (accepts `.mp3,.wav,.ogg`), size preview, name, description, multi-select of event checkboxes.
  - Per-row actions: Preview (play sound inline), Edit (modal to change name/description/event types), Delete (with confirmation — "This sound is used by X events").
  - "Set as Default" / "Remove Default" action for a non-default sound.
- Scoping: Hospital admins see (1) sounds they created and (2) global super-admin sounds. Super-admins see everything.

### FR-9 Notification Event Coverage
- The following 25 events from `DEFAULT_NOTIFICATION_EVENTS` in useSocketNotifications trigger sound: `appointment-updated`, `appointment-approved`, `new-pharmacy-order`, `pharmacy-order-updated`, `delivery-assigned`, `delivery-status-updated`, `inventory-updated`, `blockchain-record-verified`, `slot-booked`, `new-appointment-received`, `appointment-reassigned`, `new-lab-order-received`, `lab-report-uploaded`, `emergency-created`, `emergency-status-updated`, `emergency-updated`, `ambulance-assigned`, `doctor-status-updated`, `doctor-emergency-delay`, `doctor-emergency-resolved`, `new-appointment-assigned`, `new-delivery-assigned-*`, `ward-delivery-update`, `user-registered`, `hospital-emergency-alert`.
- Socket event payload optionally carries a `soundOverride` field that, if present and non-empty, overrides the event → sound mapping (used for high-priority emergency alerts). Normal events don't set this.

### FR-10 Static Serving & Sound URL Resolution
- Backend serves notification audio files via `app.use("/uploads/notifications", express.static(...))` in core/app.js, alongside the existing `/uploads` middleware.
- The bulk endpoint `GET /api/notification-sounds/event-map` returns `{ eventType: { url, mimeType, isDefault } }` so the frontend loads the mapping once per session and caches it until page reload.

---

## Non-Functional Requirements

- **NFR-1 Security & Integrity**: Uploaded files never execute; stored with random names, directory listing disabled, extension + MIME double-checked, SHA-256 hash stored for tamper detection. No user-provided filename component on disk.
- **NFR-2 Cross-Browser**: Audio playback validated on Chrome 120+, Firefox 120+, Safari 17+, Edge 120+. Autoplay unlock mechanism verified on each. HTMLAudio + WebAudio fallback stack renders silent failures invisible to the user.
- **NFR-3 Role Coverage**: Every dashboard that mounts the `useSocketNotifications` hook (DoctorDashboard, PatientDashboard, HospitalAdminDashboard, SystemAdminDashboard, PharmacistDashboard, DeliveryDashboard, LabTechnicianDashboard, AmbulanceDashboard) benefits from sound without per-dashboard code change.
- **NFR-4 Performance**: Upload middleware runs in constant time relative to file size limit (10MB); bulk event-map response cached server-side for 60s; frontend debounces sound play to <4 events/sec per eventType; no audio engine warm-up blocking main thread >16ms.
- **NFR-5 UI Responsiveness**: Admin sound management table and Settings notification preferences section are responsive at 360px width; no horizontal overflow; toggle + slider are touch-friendly (≥44px tap targets).
- **NFR-6 Schema Backward-Compatible**: User schema `notificationPreferences` addition is additive (mongoose default). Existing users without the field get the default `{ soundEnabled: true, soundVolume: 0.8 }` runtime fallback both server-side and client-side.
- **NFR-7 Accessibility (A11y)**: Toggle buttons carry `aria-pressed`, slider uses `aria-valuenow/valuemin/valuemax`; audio alerts are accompanied by existing visual NotificationBell badge changes so hearing-impaired users still get notified.

---

## Constraints & Dependencies

- Constrained to existing dependencies on both sides: backend ships with `multer` + `express` + `mongoose` + `crypto` (Node built-in). No new npm package installs required. Frontend ships with native `Audio`, `AudioContext`, `lucide-react` — no new npm package installs required.
- Reuses existing authMiddleware + roleMiddleware("admin") pipeline for admin routes; mounts at `/api/admin/notification-sounds/*` alongside existing admin routes in core/app.js.
- Reuses existing `useSocketNotifications` hook as the single integration point for sound play; this avoids duplicating event listener registration across all 8 dashboards.
- Reuses existing SettingsView (single component, every role sees it) so the user sound toggle does not need to be reimplemented per role.
- Reuses existing multer pattern in `backend/middleware/upload.js` but creates a **new dedicated** middleware file (`backend/middleware/soundUpload.js`) to avoid mixing image/PDF limits with audio limits.
- Relies on existing `/api/auth/profile` PUT update flow (FormData) — no new user-preferences endpoint needed.

## Assumptions

- Default system sound: a generated WebAudio triple-beep (520Hz, 80ms each, 60ms gap) that plays synchronously via `AudioContext` — no file on disk required. This guarantees sound availability even before any admin upload.
- Hospital-scope for sound assignment is: hospital-admin-uploaded sounds are only applied when the target user's `hospitalName` matches the admin's `hospitalName`; super-admin (no hospitalName) sounds apply globally across all hospitals. Event-map endpoint handles this scope resolution transparently, returning the scoped sound first, then global, then default.
- Admin bulk-sound management view will only show for users with role `admin`; no other role sees the Upload/Delete buttons. The Settings sound toggle + test sound button show for every role.
- Existing dashboard pattern (activeTab = 'settings', renders `<SettingsView />`) already covers all 8 role dashboards — confirmed by inspection of DoctorDashboard, HospitalAdminDashboard; remainder assumed same pattern because they import `SettingsView` from the same path.
- Browser autoplay policies accept that the very first notification that arrives before any user gesture will be audio-silent but visually indicated (bell pulse), and the next notification after a user click will play normally.

---

## Open Questions

None at specification time; all edge cases (no uploaded sound → default; no gesture → bell pulse only; unknown codec → fallback beep) are explicitly resolved in the FRs.

---

## Acceptance Criteria

### Rule AC-1
NotificationSound model exists with fields: name, filePath, mimeType, fileSize, fileHash, eventTypes[], createdBy, isDefault, timestamps.
**Evidence**: `grep -rn "NotificationSound" backend/modules/` shows a mongoose schema file with all required fields; `mongoose.model("NotificationSound")` is exported.

### Rule AC-2
Dedicated sound upload middleware enforces MP3/WAV/OGG MIME+extension + 10MB limit and rejects non-audio uploads.
**Evidence**: Upload of a .jpg renamed to .mp3 returns 400 "Invalid file type"; upload of 11MB file returns 413/400; valid 5MB .wav returns 201 with stored document.

### Rule AC-3
SHA-256 file hash of uploaded audio is stored in `fileHash`; on-disk filename is random hex, not the user-supplied name.
**Evidence**: POST response `fileHash` matches a manual `sha256sum` of the file; `ls backend/uploads/notifications/` shows 32-char hex filename, no original name.

### Rule AC-4
User schema contains `notificationPreferences` with `soundEnabled: true` default and `soundVolume: 0.8` default.
**Evidence**: `grep -n "notificationPreferences" backend/modules/users/models/user.model.js` shows field; `new User({}).notificationPreferences.soundEnabled` evaluates to `true` in a quick node snippet; missing field in existing document returns defaults server-side.

### Rule AC-5
PUT `/api/auth/profile` accepts and persists `notificationPreferences.soundEnabled` + `soundVolume`; GET `/api/auth/profile` returns the stored values.
**Evidence**: HTTP PUT with soundEnabled=false → next GET returns soundEnabled=false; value persisted in MongoDB user document.

### Rule AC-6
`useSocketNotifications` hook triggers HTMLAudio playback on every socket event when soundEnabled=true; uses event → sound URL map from the bulk endpoint; falls back to WebAudio default beep if no URL or playback fails.
**Evidence**: Source code inspection of handleNotification shows playback flow; browser DevTools network tab shows audio fetch on first event; console log for failed playback triggers beep fallback via AudioContext (observable with breakpoint).

### Rule AC-7
Audio engine unlock mechanism: before first user gesture, notification audio is suppressed but bell visually pulses (CSS animation). After one click anywhere in the app, the subsequent notification plays audio.
**Evidence**: Manual browser test — notification received before click: no audio, bell pulses; after click on any element: next notification has audio.

### Rule AC-8
SettingsView renders Notification Preferences section for user of any role (doctor, patient, admin, pharmacist, delivery, lab_technician, ambulance) with: toggle (sound enabled/disabled), volume slider (0–100%), Test Sound button.
**Evidence**: Source code of SettingsView shows the section; Test Sound button click plays default sound via same playSound helper used by useSocketNotifications.

### Rule AC-9
Admin dashboards expose a Notification Sounds management tab: upload form with file picker + event multi-select, sounds list with preview/edit/delete/set-default actions. Hospital-admin scoped sounds only apply within their hospital; super-admin sounds are global.
**Evidence**: Source code of HospitalAdminDashboard + SystemAdminDashboard shows the tab; POST upload via hospital-admin returns event map scoped to that hospital; GET event-map for a user in a different hospital returns global sounds only.

### Rule AC-10
Cross-browser playback verified: Chrome, Firefox, Safari, Edge each (a) plays MP3 assigned to `emergency-created`, (b) falls back to default beep when no custom sound is assigned, (c) honors soundEnabled=false by not playing anything while badge still increments.
**Evidence**: Per-browser screenshots or logs demonstrating each of the three conditions (play custom, fallback, mute on toggle) on all 4 browsers.

### Rubric AC-11 Role Coverage (0-2, threshold ≥1)
- 2: All 8 dashboards (Doctor, Patient, Admin/Hospital, Admin/System, Pharmacist, Delivery, Lab, Ambulance) include useSocketNotifications with sound playback integration verified either (a) via source import scan and test run, or (b) code inspection confirms they import the hook identically to DoctorDashboard.
- 1: 6–7 of the 8 dashboards verified; remaining confirmed to use same SettingsView and mount useSocketNotifications via the shared dashboard pattern; no explicit evidence but identical pattern.
- 0: 5 or fewer dashboards verified; or at least one dashboard uses a custom notification listener bypassing the hook.

### Rubric AC-12 Upload & Validation Robustness (0-2, threshold ≥1)
- 2: Full validation matrix executed in test script: valid MP3, valid WAV, valid OGG each pass; wrong extension (file renamed), wrong MIME, size >10MB, size=0, corrupt audio header each fail with distinct error messages. SHA-256 verified on 3 random uploads.
- 1: MP3 + WAV + 10MB-reject cases tested and pass; OGG, zero-byte, corrupt-header cases either tested or confirmed protected by identical multer-fileFilter path.
- 0: At least one of: MP3 uploaded but wrong extension also passes, size limit not enforced, SHA-256 hash not stored.

### Rule AC-13
Backend syntax check (node -c on changed files) passes, frontend `npm run build` succeeds, GetDiagnostics shows zero new errors in modified files.
**Evidence**: Node syntax check stdout, Vite build stdout, GetDiagnostics JSON captured.

### Rule AC-14
No regression: existing notification flow (badge count, dropdown list, socket event listeners, read/mark-all-read) continues to work identically before and after changes; the only additive behavior is sound playback.
**Evidence**: Seeded doctor user receives `emergency-created` → notification badge increments AND sound plays (if enabled) on test run; `resetNotifications` + `markNotificationRead` still work (manual click).

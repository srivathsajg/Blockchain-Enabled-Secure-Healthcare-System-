# Implementation Tasks: Real-Time Notification Sound System

Derived from `spec.md`. Each task references its parent AC(s) and carries local test requirements (TR) typed `rule` or `rubric`.

---

## Task 1: NotificationSound Mongoose Model + Sound Upload Middleware

**Files to create/modify**:
- Create `backend/modules/notifications/models/notificationSound.model.js` (new)
- Create `backend/middleware/soundUpload.js` (new)
- Modify `backend/core/app.js` — add static serve path for `/uploads/notifications`

**Scope**:
1. **Model**: Define NotificationSound schema with all FR-1 fields. Index `eventTypes` for efficient event→sound lookups. Index `name` unique. Set `default: false` on `isDefault`.
2. **Middleware**: Create `soundUpload` multer instance with:
   - Storage: `destination = backend/uploads/notifications/` (mkdir -p), `filename = crypto.randomBytes(16).hex + originalExtension`.
   - `fileFilter`: Validate MIME types (`audio/mpeg`, `audio/wav`, `audio/x-wav`, `audio/ogg`) AND extension match (`.mp3`, `.wav`, `.ogg`) — both must agree.
   - `limits.fileSize = 10 * 1024 * 1024`.
3. **Static serving**: In `app.js`, add `app.use("/uploads/notifications", express.static(path.join(__dirname, "../uploads/notifications")))`. Create the empty folder at backend start if missing (fs.mkdirSync `{ recursive: true }`).

**Depends on**: — (no prerequisites, foundation task)
**Priority**: high

### Test Requirements

#### TR-1.1 (rule — AC-1)
NotificationSound model exports `mongoose.model("NotificationSound", notificationSoundSchema)` with fields: `name` (String, unique, required), `description`, `filePath` (String, required), `mimeType` (String, enum), `fileSize` (Number), `fileHash` (String), `eventTypes` ([String]), `createdBy` (ObjectId ref User), `isDefault` (Boolean, default false), `createdAt`, `updatedAt`.
**Evidence**: `node -c` passes; require + `console.dir(model.schema.paths)` shows all paths.

#### TR-1.2 (rule — AC-2)
Sound upload middleware rejects:
- A `.jpg` file renamed to `.mp3`: `cb(error)` triggered with specific "MIME type does not match file extension" or "Invalid MIME type" message.
- A 12MB audio file: multer emits `LIMIT_FILE_SIZE` error.
- A `.mp3` with correct audio/mpeg MIME: passes through.
**Evidence**: Node unit snippet requiring `soundUpload` and testing `fileFilter` callback with mock files.

#### TR-1.3 (rule — AC-3)
On successful multer write to disk, the `req.file.filename` is a 32-char hex string plus extension (no original name component).
**Evidence**: A small Express testbed POST through soundUpload prints `req.file.filename`; pattern matches `/^[a-f0-9]{32}\.(mp3|wav|ogg)$/`.

---

## Task 2: Admin Notification-Sound CRUD Routes + Controller

**Files to create/modify**:
- Create `backend/modules/notifications/sound.controller.js` (new)
- Create `backend/modules/notifications/sound.routes.js` (new)
- Modify `backend/roles/admin/admin.routes.js` — mount the sound routes under `/notification-sounds`
- Modify `backend/core/app.js` — mount a public/authenticated endpoint at `/api/notification-sounds/*` for the event-map + by-event resolution

**Scope**:
Implement these controller functions and wire them to routes:

1. **uploadNotificationSound** (POST /api/admin/notification-sounds/upload):
   - Uses `soundUpload.single("soundFile")` middleware.
   - Reads `req.body.name`, `description`, `eventTypes[]`.
   - Computes SHA-256 of stored file: `fs.readFile(req.file.path)` → `crypto.createHash("sha256").update(buffer).digest("hex")`.
   - Creates NotificationSound doc with: name, description, filePath = req.file.path, mimeType = req.file.mimetype, fileSize = req.file.size, fileHash, eventTypes, createdBy = req.user.id, isDefault = false.
   - Audit log: `ADMIN_NOTIFICATION_SOUND_UPLOADED`.
   - Returns 201: `{ success: true, data: soundDoc, url: "/uploads/notifications/"+filename }`.

2. **listNotificationSounds** (GET /api/admin/notification-sounds):
   - Super admin (no hospitalName): find all, populate `createdBy` name.
   - Hospital admin: `$or: [{ createdBy: req.user.id }, { createdBy hospitalName admin global? no — separate: isDefaultGlobal meaning createdBy super-admin... implement by finding createdBy users with no hospitalName + $or for sounds created by this admin }]`. Simpler: create a helper `getAdminSoundScopeQuery(admin)` that returns `{ $or: [{ createdBy: admin._id }, { createdBy: { $in: superAdminIds } }] }` where superAdminIds = users with role=admin and hospitalName == null/empty.

3. **updateNotificationSound** (PATCH /api/admin/notification-sounds/:id):
   - Only allow owner + super-admin to edit. Update `name`, `description`, `eventTypes`. DO NOT allow file replacement here (separate flow if needed — out of scope). If changing `isDefault` to true, first set all existing `isDefault: true` records to false (scoped to admin's scope — per-hospital default vs global default).

4. **deleteNotificationSound** (DELETE /api/admin/notification-sounds/:id):
   - Validate ownership. Delete doc. If file exists, `fs.unlink` (do NOT throw if unlink fails, just log). For any eventType that this sound was the **only** assigned sound for the caller's scope, those events will now resolve via scope fallback chain (super-admin global default → built-in WebAudio beep).

5. **getSoundEventMap** (GET /api/notification-sounds/event-map) — public/authenticated, scoped to caller:
   - For each event in the full 25-event list (from DEFAULT_NOTIFICATION_EVENTS union + extras), resolve via: (a) if caller has hospitalName, find a sound where event ∈ eventTypes AND createdBy is an admin of that hospital; (b) else find a sound where event ∈ eventTypes AND createdBy is a super-admin (global); (c) if a scoped `isDefault=true` exists for the caller scope use its URL; (d) else `isDefault=true` global; (e) else `{ url: null, mimeType: null, isDefault: true, useBuiltIn: true }`.
   - Server-side cache the resulting map for 60s per scope key.

6. **resolveSoundForEvent** (GET /api/notification-sounds/by-event/:eventType) — single-event variant of the map for ad-hoc use; same resolution chain.

Wire routes:
- In `admin.routes.js` (after the existing `router.use(authMiddleware, roleMiddleware(["admin"]))`): mount the 4 admin CRUD routes directly (or import sound.routes admin sub-router).
- In `core/app.js`: after existing route mounts, add `app.use("/api/notification-sounds", authMiddleware, nonAdminSoundRoutes)` where nonAdminSoundRoutes = `express.Router().get("/event-map", getSoundEventMap).get("/by-event/:eventType", resolveSoundForEvent)`.

**Depends on**: Task 1 (model + middleware must exist)
**Priority**: high

### Test Requirements

#### TR-2.1 (rule — AC-1, AC-2)
POST `/api/admin/notification-sounds/upload` with FormData: `soundFile=@test.mp3`, `name=Test Beep`, `eventTypes[0]=emergency-created` and a valid admin JWT returns 201 with `data.fileHash` matching sha256 of the MP3 bytes, `data.isDefault=false`.
**Evidence**: HTTP response + captured sha256 CLI hash match.

#### TR-2.2 (rule — AC-2)
POST same upload with a 12MB sound file returns 400-level error (multer LIMIT_FILE_SIZE → errorHandler returns 400/413), zero NotificationSound documents created.
**Evidence**: curl output / captured response + db count before=after.

#### TR-2.3 (rule — AC-9 Admin Scope)
As hospital-admin (hospitalName="A") upload sound S1 bound to event emergency-created. As hospital-admin (hospitalName="B") call `/api/notification-sounds/event-map`: emergency-created maps to S1 only in hospital A's map, NOT in hospital B's. Super-admin (no hospital) can see S1 in list but its default assignment is hospital-scoped.
**Evidence**: Two separate token-authenticated curl calls return different event-map payloads per user.

#### TR-2.4 (rule — AC-9)
DELETE `/api/admin/notification-sounds/:id` by owner removes DB doc and unlinks the file from disk. Attempt by non-owner non-super-admin returns 403.
**Evidence**: Post-delete `ls backend/uploads/notifications/` shows file gone; GET list returns 404 for that id.

---

## Task 3: User Schema — Notification Preferences + Profile Update Integration

**Files to modify**:
- `backend/modules/users/models/user.model.js` — add `notificationPreferences` subdocument.
- `backend/modules/auth/controllers/auth.controller.js` — update `updateProfile` + `getProfile` to include preferences.
- `backend/modules/auth/services/auth.service.js` (if it exists — confirm, else use controller) — ensure `registerUser` sets defaults for new users.

**Scope**:
1. Add to userSchema:
   ```
   notificationPreferences: {
     soundEnabled: { type: Boolean, default: true },
     soundVolume:   { type: Number,  default: 0.8, min: 0, max: 1 },
   }
   ```
2. In `getProfile` (GET /api/auth/profile): already returns the user object without password — mongoose defaults will populate `notificationPreferences` automatically for old users too. Confirm; if not, add a runtime fallback `({ soundEnabled: true, soundVolume: 0.8 })` when serializing.
3. In `updateProfile` (PUT /api/auth/profile): Accept from req.body `notificationPreferences.soundEnabled` (coerce to boolean, accept "true"/"false" strings from FormData) and `notificationPreferences.soundVolume` (coerce to Number, clamp to [0,1]). If the keys are present in req.body, merge into the existing user.notificationPreferences subdocument (don't overwrite if only one of the two is supplied).
4. In `registerUser` service: already creates a user via mongoose — mongoose defaults handle it. No code change needed unless service explicitly sets notificationPreferences; confirm it doesn't.

**Depends on**: — (independent)
**Priority**: high

### Test Requirements

#### TR-3.1 (rule — AC-4)
`new User({ name: "X", email: "x@y.com", password: "x", role: "patient" }).notificationPreferences` evaluates to `{ soundEnabled: true, soundVolume: 0.8 }`.
**Evidence**: Node snippet output.

#### TR-3.2 (rule — AC-5)
HTTP GET `/api/auth/profile` for an existing user that was created before this schema change → response includes `notificationPreferences.soundEnabled === true` and `soundVolume === 0.8` (fallback via mongoose defaults OR explicit runtime fallback, either is fine).
**Evidence**: JSON response captured.

#### TR-3.3 (rule — AC-5)
PUT `/api/auth/profile` with body `notificationPreferences.soundEnabled=false`, `notificationPreferences.soundVolume=0.2` → next GET returns exactly those values. Database document for the user contains the updated subdocument.
**Evidence**: Two HTTP exchanges, plus `db.users.findOne({email})` output showing subdoc persisted.

---

## Task 4: Frontend — Notification Sound Engine + Audio Unlock Hook

**Files to create/modify**:
- Create `frontend/src/hooks/useAudioUnlock.js` (new)
- Create `frontend/src/utils/soundPlayer.js` (new) — the shared `playNotificationSound` module + `playBuiltInBeep`
- Modify `frontend/src/hooks/useSocketNotifications.js` — integrate soundPlayer into handleNotification, add event-map fetch + cache

**Scope**:
1. **soundPlayer.js** module (non-React):
   - Export `eventSoundMap = null`, `loadEventSoundMap(authToken)`: fetches `/api/notification-sounds/event-map` with Authorization header; stores map; returns promise. Refresh at most once every 5 minutes (module-level timestamp).
   - Export `resolveSoundFor(eventType)`: if eventSoundMap loaded, return map[eventType] else fallback `{ useBuiltIn: true }`.
   - Export `setUserPreferences({ soundEnabled, soundVolume })`: stores in module state. Defaults `{ enabled: true, volume: 0.8 }`.
   - Export `globalAudioUnlocked = false` (boolean flag).
   - Export `queuePendingPlayback = false` (boolean).
   - Export `playBuiltInBeep(volume=0.8)`: Uses `window.AudioContext || window.webkitAudioContext`. Creates osc → gain chain: 3 short beeps (freq=520Hz, dur=80ms each, gap=60ms). Gain = volume. If audioCtx.state==="suspended", call resume first.
   - Export `playNotificationSound(eventType, { overrideUrl=null }={})`:
     (a) If preferences.enabled === false → return silently.
     (b) If audioUnlocked === false → set queuePendingPlayback=true, BELL_PULSE_CALLBACK() (see below), return.
     (c) Determine url = overrideUrl || resolveSoundFor(eventType).url || null.
     (d) If url: create `audio = new Audio(url); audio.volume = preferences.volume` → `audio.play().catch(err => { log; playBuiltInBeep(preferences.volume); })`. Debounce per eventType: track lastPlayed[eventType] timestamp, if Date.now()-last < 250ms skip (protect against burst).
     (e) Else `playBuiltInBeep(preferences.volume)`.
   - Export `testPlayCurrentSound()`: Same as playNotificationSound but for event="emergency-created" (or first event with assigned custom sound), bypassing debounce so the test button always plays even if a real event just fired.

2. **useAudioUnlock.js** hook:
   - Registers a single top-level capture-phase listener on `document` for `click`, `keydown`, `touchstart` events. On first such event **after** mount:
     (a) Call `audioCtx.resume()` (create audioCtx lazily).
     (b) Set soundPlayer.globalAudioUnlocked = true.
     (c) If queuePendingPlayback is true → call playBuiltInBeep(preferences.volume) once (only one queued beep, not the full backlog) → set queuePendingPlayback = false.
     (d) Remove the capture listeners to avoid leaks.
   - Expose a React component-level helper for visual bell pulse: expose `useAudioUnlock().audioUnlocked` flag and `pendingSoundQueued` flag so NotificationBell component can apply CSS pulse.
   - Mounted once at the App.jsx level (not per dashboard) so it's always active.

3. **useSocketNotifications integration**:
   - Inside the hook, on first mount and whenever `userId` becomes truthy:
     (a) If soundPlayer.eventSoundMap == null → call `loadEventSoundMap(authToken)` (get token from localStorage or AuthContext — pass via hook arg).
     (b) Call soundPlayer.setUserPreferences({ soundEnabled: user?.notificationPreferences?.soundEnabled ?? true, soundVolume: user?.notificationPreferences?.soundVolume ?? 0.8 }).
     (c) Call `useAudioUnlock()` inside the hook OR ensure it's called at App level (App level preferred, hook just reads the flags).
   - Inside `handleNotification(eventName, payload)`:
     (a) Add at top of function (before setNotificationCount): `soundPlayer.playNotificationSound(eventName, { overrideUrl: payload?.soundOverride })`.
     (b) Ensure errors from soundPlayer never bubble — `try { ... } catch {}` the call just to be safe (soundPlayer already catches internally but belt-and-suspenders).

**Depends on**: Task 2 (event-map endpoint must exist), Task 3 (user.notificationPreferences shape).
**Priority**: high

### Test Requirements

#### TR-4.1 (rule — AC-6)
`playBuiltInBeep(0.7)` on a page with AudioContext available generates audio (can't record sound in CI, but) — AudioContext `state` transitions to `running`, oscillator nodes are created, no exceptions thrown.
**Evidence**: Browser DevTools console: after playBuiltInBeep, `audioCtx.state === 'running'` (inspect via dev tools). No stack trace in console.

#### TR-4.2 (rule — AC-7)
Before any click/keyboard on the page: call playNotificationSound → no audio, queuePendingPlayback=true. Then simulate one document.click → queuePendingPlayback=false, builtInBeep plays exactly once.
**Evidence**: Test in browser (manual) + add console.log guard rails for queued state captured.

#### TR-4.3 (rule — AC-6)
When eventSoundMap has a custom URL for event `emergency-created`, playNotificationSound("emergency-created") → network fetch of that URL is visible in DevTools (once cached, subsequent plays use browser cache). If URL 404s, falls back to playBuiltInBeep (no JS error thrown).
**Evidence**: DevTools network tab + console (manual).

#### TR-4.4 (rule — AC-6 Debounce)
Five rapid fire socket events in <250ms of the same type (e.g. `inventory-updated`): only 1–2 audio plays fire, not 5.
**Evidence**: Manual burst test via console-emitted socket events and observed playback count.

---

## Task 5: Frontend — SettingsView (User Sound Toggle + Volume + Test Button)

**Files to modify**:
- `frontend/src/components/ui/SettingsView.jsx` — add "Notification Preferences" section.
- `frontend/src/hooks/useSocketNotifications.js` — add an exported refreshPreferences function (or expose soundPlayer.setUserPreferences via a setUser call site).
- `frontend/src/context/AuthContext.jsx` — update user.notificationPreferences on successful profile update.

**Scope**:
1. **New Settings section** (below existing Health Metrics if patient, below signature if doctor, always present for all roles):
   - Heading: "🔔 Notification Preferences" (use `Bell` icon, consistent with existing section headers).
   - Row 1: Toggle switch with label "Enable Notification Sounds" — value = formData.soundEnabled (default user?.notificationPreferences?.soundEnabled ?? true). On toggle → setFormData.
   - Row 2: Range slider `<input type="range" min="0" max="100" step="1" value={Math.round(formData.soundVolume*100)} disabled={!formData.soundEnabled}/>` — label "Notification Volume: X%" next to a small 🔊 icon. If toggle OFF → slider greyed out (opacity-50, disabled).
   - Row 3: `<button type="button" onClick={() => soundPlayer.testPlayCurrentSound()}>▶ Test Sound</button>` — styled consistently with existing buttons. IMPORTANT: Since Test Sound is user-initiated, it bypasses the audio-unlock gate and forces one playback (also unlocks the engine for subsequent real notifications). Test button plays even when toggle OFF = false? No — Spec says toggle disables sound: so Test Sound should also be disabled (or show "Sound is disabled" tooltip). Per AC-8 "toggle" = disable. So: when soundEnabled=false, Test button disabled + visual cue.
2. **FormData integration**: Extend formData to include `soundEnabled` and `soundVolume`. Initialize from user. Include in FormData POST via `data.append('notificationPreferences.soundEnabled', String(formData.soundEnabled))` and `data.append('notificationPreferences.soundVolume', String(formData.soundVolume))`.
3. **Success handler**: In the `res.success` branch of the submit handler, before `setTimeout(success→false)`:
   - Update local auth context user with the new preferences.
   - Also call `soundPlayer.setUserPreferences({ soundEnabled: formData.soundEnabled, soundVolume: formData.soundVolume })` so the running hook picks up the preference change immediately (no page reload needed).
4. Ensure form submission still works correctly for existing fields (profile image upload, certificates, etc.) — the two new text fields append to existing FormData; no name collisions.

**Depends on**: Task 4 (soundPlayer must exist)
**Priority**: high

### Test Requirements

#### TR-5.1 (rule — AC-8)
SettingsView mounts correctly for any role (test with role=patient, role=doctor via mocked AuthContext) and renders: label "Enable Notification Sounds", a toggle (on by default), a volume range (80% by default), and a "Test Sound" button.
**Evidence**: React render test / DOM inspection via browser DevTools on two different role dashboards.

#### TR-5.2 (rule — AC-8)
Toggle OFF → volume slider disabled + Test Sound button disabled. Toggle back ON → both re-enabled.
**Evidence**: DOM attribute checks (disabled attribute present / not).

#### TR-5.3 (rule — AC-5)
With toggle OFF + Volume=0.3, click "Save Changes" → FormData contains `notificationPreferences.soundEnabled=false` and `notificationPreferences.soundVolume=0.3`. Response success triggers immediate silence for subsequent real notifications (soundPlayer.enabled === false) — verified by firing a test socket event.
**Evidence**: FormData console.log during submit + real socket test event after submit produces no sound.

---

## Task 6: Frontend — Admin Dashboards (Notification Sounds Management Tab)

**Files to modify**:
- `frontend/src/pages/HospitalAdminDashboard.jsx` — add new tab `adminNotificationSounds`.
- `frontend/src/pages/SystemAdminDashboard.jsx` — add the same new tab content.
- Create `frontend/src/components/admin/NotificationSoundsManager.jsx` (new) — the shared admin component.
- Modify `frontend/src/services/adminApi.js` — add API methods: uploadNotificationSound, fetchNotificationSounds, updateNotificationSound, deleteNotificationSound, setNotificationSoundDefault.
- Optional: If a pattern exists, use same FormData upload approach as userApi.updateProfile (uses axiosInstance, Content-Type multipart/form-data, Authorization header).

**Scope**:
1. **adminApi methods**:
   - `uploadNotificationSound(formData)` → POST `/api/admin/notification-sounds/upload`, data=formData (multipart).
   - `fetchNotificationSounds()` → GET `/api/admin/notification-sounds`.
   - `updateNotificationSound(id, patch)` → PATCH `/api/admin/notification-sounds/${id}`, JSON.
   - `deleteNotificationSound(id)` → DELETE `.../${id}`.
2. **NotificationSoundsManager** component (shared):
   - Top: upload card.
     - File input accept=".mp3,.wav,.ogg" + "No file selected" | filename + size.
     - Text fields: `name` (required), `description`.
     - Event multi-select: a scrollable box of checkboxes listing all 25 event labels (use EVENT_LABELS mapping from useSocketNotifications so labels stay in sync — import and re-export a shared `NOTIFICATION_EVENT_TYPES` list from a new file `frontend/src/utils/notificationEvents.js` if duplication is unwieldy; but just duplicating short list inline is OK too).
     - Upload button: disabled until file + name + at least 1 event selected. Loading spinner state.
   - Below upload: sounds list table/cards.
     - Columns: Icon 🎵 + Name (description below), Event Badges (chips of eventTypes truncated with +N), Size (KB/MB), Uploaded (date by X), Default? (IsDefault badge if true), Actions: [▶ Play], [✎ Edit], [★ Default/Defaulted], [🗑 Delete].
     - Play action: use soundPlayer module with resolved URL (or audio = new Audio(row.url), play) — a simple implementation is fine.
     - Edit action: open modal, edit name/description/eventTypes only (no file replace).
     - Set as Default: calls PATCH with `isDefault=true` for that sound. Current default badge swaps.
     - Delete: confirm dialog "This sound is used by N events in your scope — events will fall back to the global default. Continue?"; calls DELETE.
   - Hospital admin view: same component but event-map resolution in list view shows "Scope: Your Hospital" badge vs "Global" badge (based on createdBy hospital presence).
3. **Mount in both dashboards**:
   - HospitalAdminDashboard: add to titleMap + tabContent switch alongside dashboard/users/approvals/blockchain/insurance/admissions/billing/settings — insert case `adminNotificationSounds` → `<NotificationSoundsManager />`. Add a sidebar nav item (icon 🔔 or Volume2) with label "Notification Sounds".
   - SystemAdminDashboard: same tab + nav item (confirm SystemAdminDashboard has same sidebar/nav structure as HospitalAdmin; if different just add inline matching the SystemAdmin patterns).
4. **Ensure Settings tab still works** (no regression on either dashboard).

**Depends on**: Task 2 (admin routes), Task 4 (soundPlayer for preview playback).
**Priority**: medium

### Test Requirements

#### TR-6.1 (rule — AC-9)
Logged in as hospital admin → sidebar entry "Notification Sounds" visible. Click → renders upload form on top and list below (initially empty or contains global defaults if any). Fill valid form → submit → list shows the new sound with "Your Hospital" scope badge.
**Evidence**: Manual browser walk-through screenshots or captured DOM state.

#### TR-6.2 (rule — AC-9)
"Set as Default" for one sound → PATCH payload contains `{ isDefault: true }`; after success, event-map GET for a user in that same hospital returns that sound's URL as the default fallthrough when an event has no specific assignment.
**Evidence**: HTTP request + post-PATCH event-map call payload.

#### TR-6.3 (rule — AC-9)
Delete action: after confirm, list removes the row; disk file is gone (verify via ls backend/uploads/notifications/ — or at minimum subsequent play attempt triggers 404 fallback = Built-in beep, confirmed via console.log).
**Evidence**: Play button on deleted sound triggers fallback and no network request (or 404) — error-free.

---

## Task 7: Notifications Cross-Role Hook Integration Confirmation + App-Level Audio Unlock

**Files to verify/modify as needed**:
- `frontend/src/App.jsx` — mount `useAudioUnlock()` once globally + check NotificationBell pulse visual indicator.
- `frontend/src/components/ui/NotificationBell.jsx` — apply CSS pulse when `pendingSoundQueued === true` and `audioUnlocked === false`.
- Cross-check all 8 dashboards that they mount useSocketNotifications (source scan).

**Scope**:
1. **App.jsx global unlock**: Import and call `useAudioUnlock()` hook inside the root component (after providers mount). This ensures unlock is active no matter which page users land on.
2. **NotificationBell pulse**: Import `{ globalAudioUnlocked, queuePendingPlayback }` from soundPlayer.js (subscribe via a small hook wrapper or use a tiny pubsub pattern for React state sync; simplest: add a React signal/state via `soundPlayer.getPendingFlagStore() { let listeners=[], value=false; return { set(v){value=v; listeners.forEach(l=>l(v));}, subscribe(fn){ listeners.push(fn); return ()=>listeners.splice(listeners.indexOf(fn),1); }, get(){return value}}}`. Then in NotificationBell: `const [pending, setPending] = useState(queuePendingPlayback); useEffect(() => soundPlayer.pendingStore.subscribe(setPending), []);`). When `pending && !unlocked` → add a CSS class `animate-sound-pending-pulse` to the Bell root button; add the keyframes in index.css:
   ```
   @keyframes sound-pending-pulse {
     0%, 100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.6); }
     50%      { box-shadow: 0 0 0 12px rgba(239, 68, 68, 0); }
   }
   .animate-sound-pending-pulse { animation: sound-pending-pulse 1.6s infinite; border-radius: 9999px; }
   ```
3. **Dashboard cross-check**: Read the following files and confirm they call `useSocketNotifications` (with a userId arg):
   - DoctorDashboard.jsx (already confirmed)
   - HospitalAdminDashboard.jsx (already confirmed)
   - SystemAdminDashboard.jsx
   - PatientDashboard.jsx
   - PharmacistDashboard.jsx
   - DeliveryDashboard.jsx
   - LabTechnicianDashboard.jsx
   - AmbulanceDashboard.jsx
   If any dashboard is MISSING the hook, add the minimal integration: import hook, destructure `[count, reset, connected, notifications, markRead]`, pass to NotificationBell, add socket connect effect `if (!socket.connected && userId) socket.connect();` (or the pattern used by DoctorDashboard). Do NOT skip dashboards — spec requires all roles.

**Depends on**: Task 4 (soundPlayer + unlock hook exist), Task 5 (SettingsView added separately).
**Priority**: high

### Test Requirements

#### TR-7.1 (rule — AC-7)
App.jsx imports and renders useAudioUnlock effect (mounted globally). NotificationBell has animate-sound-pending-pulse class when user lands on page → immediately first notification arrives before click → bell pulses; after first click anywhere → animation stops, next notification plays audio.
**Evidence**: Class list on bell captured via DOM before/after click. Console shows no audio-play NotAllowedError.

#### TR-7.2 (rubric — AC-11 Role Coverage, scale 0-2, threshold ≥1)
- 2: All 8 dashboards explicitly import useSocketNotifications and pass the count to NotificationBell (or equivalent). Confirmed via grep output of the hook name in each file path.
- 1: 6–7 of 8 confirmed; remaining dashboards re-use a shared layout/HOC that mounts the hook centrally (grep of App.jsx or layout shows hook mounted once and NotificationBell receives count via props — acceptable shared pattern).
- 0: 5+ dashboards lack the hook and no shared layout mounts it.
**Evidence**: `Grep pattern "useSocketNotifications" frontend/src/pages/` output with 8 paths.

#### TR-7.3 (rule — AC-14 Regression)
NotificationBell count increments normally after integration (no visual regression). `resetNotifications` (Mark all read) and `markNotificationRead(id)` still work.
**Evidence**: Manual click of "Mark all read" resets count to 0; single notification click marks it read; both state updates reflected in UI.

---

## Task 8: End-to-End Verification Suite + Build Validation

**Scope**:
Run this final integrated pass after Tasks 1–7 complete. Collect evidence for each TR.

### Test Requirements

#### TR-8.1 (rule — AC-13 Backend syntax)
All changed backend files pass `node -c` (syntax check) on:
- backend/modules/notifications/**/*.js
- backend/middleware/soundUpload.js
- backend/core/app.js
- backend/modules/users/models/user.model.js
- backend/modules/auth/controllers/auth.controller.js
- backend/roles/admin/admin.routes.js
- backend/roles/admin/admin.controller.js (if modified for the scope helper)
**Evidence**: Shell stdout captured for each file.

#### TR-8.2 (rule — AC-13 Frontend build)
In `frontend/` directory: run `npm run build`. Build exits 0 with no errors. No ESLint warnings about new files in unused vars / imports.
**Evidence**: Vite terminal output captured. GetDiagnostics for all modified frontend files returns 0 new errors.

#### TR-8.3 (rule — AC-10 Cross-browser spot-check matrix)
For at least 2 of the 4 target browsers (Chrome + Firefox minimum, Safari/Edge bonus):
(1) Manual sign-in as doctor → fire an `emergency-created` socket event via backend test script → sound plays (or queues + unlocks if before click).
(2) In Settings, disable sound → save → same event → badge increments, no audio.
(3) Re-enable sound, set volume=10% → audible but quieter than the 80% default baseline.
**Evidence**: Per-browser notes + screenshots of the Settings toggle state during each condition.

#### TR-8.4 (rule — AC-12 Upload Validation matrix)
Backend scripted tests (or curl):
- (PASS) Valid MP3 1 MB, name, events → 201, hash correct.
- (PASS) Valid WAV 3 MB → 201.
- (PASS) Valid OGG 500 KB → 201.
- (FAIL) File has `.jpg` extension but content is a JPG renamed to `.mp3` → rejected by fileFilter.
- (FAIL) Size = 12 MB → rejected.
- (FAIL) Zero-byte `.wav` → rejected (multer fileFilter may accept if mimetype matches; if so, explicitly add a zero-byte guard in upload controller — `if req.file.size === 0 → unlink + 400`).
- (VERIFY) SHA-256 of the 1MB test file (computed via CLI sha256sum or powershell Get-FileHash) equals the value stored in `fileHash` of the returned doc.
**Evidence**: Annotated HTTP response log (or test script output if a small node script written).

#### TR-8.5 (rule — AC-14 No regression)
Existing notification workflow for a seeded doctor:
- `createTestEmergency.js` (or existing script) creates a case → socket event fires.
- DoctorDashboard shows NotificationBell badge incremented, notification row present in dropdown.
- "Mark all read" → count back to 0, rows visually dimmed (read:true styling).
All 3 behaviors work exactly as before, with the ADDITION of audible sound.
**Evidence**: Screenshots of bell at count 1 vs 0 + notification row content.

# ResQOne Phase 2B — Quick Test Guide

## 🚑 Test Ambulance Login

```
URL:      http://localhost:5173/login
Email:    ambulance.test@medicare.dev
Password: Ambulance123!
```

## 📋 Browser Test Sequence

### Option A: Using Existing Emergency

1. **Login as Ambulance** → http://localhost:5173/login
2. **View Available Emergencies** → Should see test emergency
3. **Accept Emergency** → Click "Accept Emergency"
4. **Mark Arrived** → Click "Mark Arrived at Scene"
5. **Generate Patient QR** → Login as patient, generate QR
6. **Scan QR** → Paste QR token, click "Identify Patient"
7. **View Profile** → Click "View Emergency Profile"
8. **Start Transport** → Click "Start Transport"
9. **Complete Workflow** → Click through remaining statuses

### Option B: Create New Emergency

1. **Login as Patient** → prajwal@gmail.com
2. **Book Emergency** → Patient Dashboard → Emergency → Book Emergency
3. **Follow Option A steps**

## 🔍 What to Test

✅ **Login redirect** → Ambulance goes to /ambulance-dashboard  
✅ **Available queue** → Sees unassigned emergencies  
✅ **Accept emergency** → Moves to active section  
✅ **Status progression** → AMBULANCE_ASSIGNED → ARRIVED → IDENTIFIED → IN_TRANSIT  
✅ **QR identification** → Patient QR links and identifies patient  
✅ **Medical profile** → Shows blood group, allergies, medications, emergency contact  
✅ **Real-time updates** → Patient tab sees ambulance status changes without refresh  
✅ **Authorization** → Patient cannot access /ambulance-dashboard  

## 🚨 If Something Doesn't Work

### Backend not running?
```powershell
node backend/core/server.js
```

### Frontend not running?
```powershell
npm --prefix frontend run dev
```

### Need another test emergency?
```powershell
node backend/scripts/create-test-emergency.js
```

### Check audit logs?
```powershell
node backend/test-audit-logs.js
```

## 📊 Expected Flow

```
Patient Books Emergency
        ↓
Status: AMBULANCE_REQUESTED
        ↓
Ambulance Sees in "Available Emergencies"
        ↓
Ambulance Clicks "Accept"
        ↓
Status: AMBULANCE_ASSIGNED (appears in "Active Emergency")
        ↓
Ambulance Clicks "Mark Arrived at Scene"
        ↓
Status: AMBULANCE_ARRIVED
        ↓
Patient Generates QR Code
        ↓
Ambulance Pastes QR Token → Click "Identify Patient"
        ↓
Status: PATIENT_IDENTIFIED
Emergency Medical Profile Auto-loads
        ↓
Ambulance Clicks "Start Transport"
        ↓
Status: IN_TRANSIT
        ↓
Ambulance Clicks "Prepare Hospital"
        ↓
Status: HOSPITAL_PREPARED
        ↓
Ambulance Clicks "Arrive at Hospital"
        ↓
Status: ARRIVED_AT_HOSPITAL
        ↓
(Workflow complete from ambulance perspective)
```

## ✅ Verification Checklist

- [ ] Ambulance can login
- [ ] Ambulance sees available emergencies
- [ ] Ambulance can accept emergency
- [ ] Status updates to AMBULANCE_ASSIGNED
- [ ] Patient sees status update in real-time
- [ ] Ambulance can mark arrived
- [ ] Ambulance can scan patient QR
- [ ] Patient identification works
- [ ] Emergency medical profile displays
- [ ] Profile shows: blood group, allergies, medications
- [ ] Profile does NOT show: password, insurance
- [ ] Ambulance can progress through all statuses
- [ ] Timeline shows all status transitions
- [ ] Patient unauthorized to access ambulance dashboard
- [ ] Doctor unauthorized to access ambulance dashboard

## 🎯 Success Criteria

**Phase 2B is successful if:**
1. Ambulance can see and accept emergencies
2. Status lifecycle works correctly
3. QR identification links patient
4. Emergency medical profile is accessible and secure
5. Real-time updates work via Socket.IO
6. No sensitive data is leaked
7. Authorization is properly enforced

---

**URLs:**
- Frontend: http://localhost:5173
- Backend: http://localhost:5000
- Ambulance Dashboard: http://localhost:5173/ambulance-dashboard

**Credentials:**
- Ambulance: ambulance.test@medicare.dev / Ambulance123!
- Patient: prajwal@gmail.com / [your password]

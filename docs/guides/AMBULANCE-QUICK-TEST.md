# Ambulance Registration — Quick Test Guide

## 🚀 Quick Start (1 Minute)

### Option A: Use Pre-Created Account
```
URL:      http://localhost:5173/login
Email:    john.driver@test.com
Password: Test1234!

Click "Sign In" → Should redirect to /ambulance-dashboard
```

### Option B: Register New Account (3 Minutes)
```
1. Go to: http://localhost:5173
2. Click: "Register"
3. Select: "Ambulance" (with ambulance icon)
4. Click: "Next"

── STEP 2: Basic Info ──
Full Name: [Your Name]
Email: [your.email@test.com]
Phone: [+1-555-1234567]
Guardian: [+1-555-GUARDIAN]
DOB: [Select date]
Gender: [Select]
Address: [Your address]
Profile Image: [Upload]
Password: [YourPassword123!]
Confirm: [YourPassword123!]
Click: "Next"

── STEP 3: Ambulance Info ──
Employee ID: AMB-YOUR-001
License Number: DL-123456789
License Expiry: 2027-12-31
Organization: City General Hospital
Vehicle Number: KA01MED5678
Type: ALS (or BLS/PATIENT_TRANSPORT/OTHER)
Experience: 5 (optional)
Blood Group: O+ (optional)
Click: "Submit"

5. Success! Click "Login"
6. Enter your email + password
7. You'll be redirected to /ambulance-dashboard
```

---

## ✅ What to Verify

### Registration
- [ ] Ambulance button appears with ambulance icon
- [ ] Form has 3 steps (Role → Basic → Ambulance Info)
- [ ] All fields validate (try empty form)
- [ ] Password mismatch detected
- [ ] Profile image uploads
- [ ] Success message shows
- [ ] Duplicate email rejected (try registering again)

### Login
- [ ] Login with ambulance credentials succeeds
- [ ] Redirects to /ambulance-dashboard
- [ ] Dashboard shows your name
- [ ] Can see available emergencies (if any exist)

### Phase 2B Integration
- [ ] Can accept emergencies
- [ ] Can mark arrived
- [ ] Can identify patient via QR
- [ ] Can view emergency medical profile
- [ ] Can progress through statuses

### Authorization
- [ ] Patient cannot access /ambulance-dashboard
- [ ] Ambulance cannot access /patient-dashboard
- [ ] Logout and re-login works

---

## 🧪 API Tests (Optional)

```bash
# Run comprehensive test suite
node backend/test-ambulance-registration.js

Expected: 11/11 tests pass
```

---

## 🎯 Success Criteria

✅ Can register ambulance through browser  
✅ Can login with ambulance credentials  
✅ Redirects to /ambulance-dashboard  
✅ Can accept and process emergencies  
✅ Phase 2B workflow still works  
✅ Patient/Doctor registration not broken  

---

## 🔑 Test Credentials

### Pre-Created Account
```
Email:    john.driver@test.com
Password: Test1234!
```

### Phase 2B Dev Account
```
Email:    ambulance.test@medicare.dev
Password: Ambulance123!
```

---

## 📝 Sample Ambulance Data (Copy-Paste)

```
Name: Alex Emergency
Email: alex.emergency@test.com
Phone: +1-555-RESCUE
Guardian: +1-555-FAMILY
DOB: 1990-05-15
Gender: male
Address: 456 Rescue Road, Emergency City
Employee ID: AMB-ALEX-001
License: DL-AE-987654
Expiry: 2028-06-30
Organization: Metro Emergency Services
Vehicle: KA02MED7777
Type: BLS
Experience: 8
Blood: B+
Password: Rescue2026!
```

---

## 🐛 Troubleshooting

**"Email already exists"**
→ Use a different email or login with existing account

**"Employee ID already registered"**
→ Use a unique employee ID (e.g., AMB-YOUR-XXX)

**"License has expired"**
→ Use a future date for license expiry

**Page not loading**
→ Check backend is running on port 5000
→ Check frontend is running on port 5173

**Cannot accept emergency**
→ Create test emergency first (see Phase 2B guide)
→ Or run: `node backend/scripts/create-test-emergency.js`

---

## 📊 URLs

Frontend: http://localhost:5173  
Backend:  http://localhost:5000  
Ambulance Dashboard: http://localhost:5173/ambulance-dashboard  

---

**Quick test takes ~3 minutes**  
**Full verification takes ~10 minutes**

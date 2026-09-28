import React, { useState, useEffect } from 'react';
import { X, User, Heart, Pill, Truck, Check, ArrowRight, ShieldCheck, FileText, QrCode, Upload, ArrowLeft, Stethoscope, Ambulance } from 'lucide-react';
import axios from 'axios';

const specializations = [
  'General Physician',
  'Cardiologist',
  'Dermatologist',
  'Neurologist',
  'Orthopedist',
  'Pediatrician',
  'Dentist',
  'Surgeon',
  'ENT Specialist',
  'Gynecologist'
];

const RegistrationModal = ({ isOpen, onClose, onSwitchToLogin }) => {
  if (!isOpen) return null;

  const [step, setStep] = useState(1);
  const [role, setRole] = useState('');
  const [allowedHospitals, setAllowedHospitals] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      const fetchHospitals = async () => {
        try {
          const API_URL = '/api';
          const res = await axios.get(`${API_URL}/auth/hospitals`);
          if (res.data && res.data.success) {
            setAllowedHospitals(res.data.data);
          }
        } catch (err) {
          console.error("Failed to fetch hospitals:", err);
          // Fallback just in case
          setAllowedHospitals(['Holy Cross Hospital', 'Apollo Hospital']);
        }
      };
      fetchHospitals();
    }
  }, [isOpen]);

  const [formData, setFormData] = useState({
    name: '', // Changed from fullName to name
    email: '',
    phone: '',
    dob: '',
    gender: '',
    emergencyContact: '',
    address: '',
    // Patient
    bloodGroup: '',
    height: '',
    weight: '',
    hasInsurance: 'no',
    insuranceProviderName: '',
    policyNumber: '',
    validTillDate: '',
    // Doctor
    medicalLicense: '',
    specialization: '',
    qualification: '',
    experience: '',
    hospitalName: '',
    bio: '',
    // Pharmacist
    pharmacyLicense: '',
    pharmacyName: '',
    // Delivery
    employeeId: '',
    assignedWard: '',
    // Admin
    adminCode: '',
    // Ambulance-specific
    drivingLicenseNumber: '',
    licenseExpiryDate: '',
    hospitalOrOrganization: '',
    ambulanceVehicleNumber: '',
    ambulanceType: '',
    yearsOfExperience: '',
    // Common
    password: '',
    confirmPassword: ''
  });

  const [files, setFiles] = useState({
    profileImage: null,
    pastLabReports: [],
    insuranceProofImage: null,
    achievementCertificates: [],
    medicalLicenseProof: null
  });

  const [agreedToBlockchain, setAgreedToBlockchain] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);

  const [errors, setErrors] = useState({});

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
    if (name === 'hasInsurance' && value === 'no') {
      setFiles({ ...files, insuranceProofImage: null });
    }

    if (errors[name]) {
      setErrors({ ...errors, [name]: '' });
    }
    if (error) setError('');
  };

  const handleFileChange = (e) => {
    const { name, files: selectedFiles } = e.target;
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'application/pdf'];
    const invalidFiles = Array.from(selectedFiles).filter(file => !allowedTypes.includes(file.type));

    if (invalidFiles.length > 0) {
      setErrors({ ...errors, [name]: 'Only valid images (JPG, PNG, GIF, WEBP) and PDFs are allowed!' });
      // Clear the invalid file from state
      if (name === 'pastLabReports' || name === 'achievementCertificates') {
        setFiles({ ...files, [name]: [] });
      } else {
        setFiles({ ...files, [name]: null });
      }
      return;
    }

    if (name === 'pastLabReports' || name === 'achievementCertificates') {
      setFiles({ ...files, [name]: Array.from(selectedFiles) });
    } else {
      setFiles({ ...files, [name]: selectedFiles[0] });
    }
    if (errors[name]) {
      setErrors({ ...errors, [name]: '' });
    }
  };

  const [subRole, setSubRole] = useState(''); // To handle doctor vs lab technician selection

  const handleRoleSelect = (selectedRole) => {
    if (selectedRole === 'doctor_professional') {
      // Just set a temporary state to show sub-selection or handle it in UI
      setRole('doctor_professional');
      setSubRole('');
    } else {
      setRole(selectedRole);
      setSubRole('');
    }
  };

  const handleSubRoleSelect = (selectedSubRole) => {
    setRole(selectedSubRole); // 'doctor' or 'lab_technician'
    setSubRole(selectedSubRole);
  };

  const validateStep = (currentStep) => {
    const newErrors = {};

    if (currentStep === 1) {
      // Role Selection
      if (!role || role === 'doctor_professional') { // Ensure a concrete role is selected
        if (role === 'doctor_professional' && !subRole) {
          setError('Please select either Doctor or Lab Technician');
          return false;
        }
        if (!role) {
          setError('Please select a role to proceed');
          return false;
        }
      }
      setError('');
      return true;
    }

    if (currentStep === 2) {
      // Basic Details
      if (!formData.name) newErrors.name = 'Full Name is required';
      if (!formData.email) newErrors.email = 'Email is required';
      if (!formData.phone) newErrors.phone = 'Phone Number is required';
      if (!formData.emergencyContact) newErrors.emergencyContact = 'Guardian/Emergency # is required';
      if (!formData.password) newErrors.password = 'Password is required';
      if (formData.password !== formData.confirmPassword) newErrors.confirmPassword = 'Passwords do not match';
      if (!formData.dob) newErrors.dob = 'Date of Birth is required';
      if (!formData.gender) newErrors.gender = 'Gender is required';
      if (!formData.address) newErrors.address = 'Address is required';
      if (!files.profileImage) newErrors.profileImage = 'Profile Image is required';
    }

    if (currentStep === 3) {
      if (role === 'patient') {
        // Health Details (Optional but good to check format if entered)
      } else if (role === 'doctor' || role === 'lab_technician') {
        if (!formData.hospitalName) newErrors.hospitalName = 'Hospital Name is required';
        if (!formData.qualification) newErrors.qualification = 'Qualification is required';

        if (role === 'doctor') {
          if (!formData.medicalLicense) newErrors.medicalLicense = 'License Number is required';
          if (!formData.specialization) newErrors.specialization = 'Specialization is required';
          if (!formData.experience) newErrors.experience = 'Experience is required';
        } else if (role === 'lab_technician') {
          if (!formData.medicalLicense) newErrors.medicalLicense = 'License Number is required';
          // Maybe less requirements for lab tech or different ones? Assuming similar for now.
        }
      } else if (role === 'pharmacist') {
        if (!formData.pharmacyLicense) newErrors.pharmacyLicense = 'License Number is required';
        if (!formData.qualification) newErrors.qualification = 'Qualification is required';
        if (!formData.hospitalName) newErrors.hospitalName = 'Hospital Name is required';
      } else if (role === 'delivery') {
        if (!formData.employeeId) newErrors.employeeId = 'Employee ID is required';
        if (!formData.assignedWard) newErrors.assignedWard = 'Assigned Ward is required';
        if (!formData.hospitalName) newErrors.hospitalName = 'Hospital Name is required';
      } else if (role === 'ambulance') {
        if (!formData.employeeId) newErrors.employeeId = 'Employee / Driver ID is required';
        if (!formData.drivingLicenseNumber) newErrors.drivingLicenseNumber = 'Driving License Number is required';
        if (!formData.licenseExpiryDate) newErrors.licenseExpiryDate = 'License Expiry Date is required';
        if (!formData.hospitalOrOrganization) newErrors.hospitalOrOrganization = 'Hospital / Organization is required';
        if (!formData.ambulanceVehicleNumber) newErrors.ambulanceVehicleNumber = 'Ambulance Vehicle Number is required';
        if (!formData.ambulanceType) newErrors.ambulanceType = 'Ambulance Type is required';
      }
    }

    if (currentStep === 4 && role === 'patient') {
      if (formData.hasInsurance === 'yes') {
        if (!formData.insuranceProviderName) newErrors.insuranceProviderName = 'Provider Name is required';
        if (!formData.policyNumber) newErrors.policyNumber = 'Policy Number is required';
        if (!formData.validTillDate) newErrors.validTillDate = 'Validity Date is required';
        if (!files.insuranceProofImage) newErrors.insuranceProofImage = 'Insurance Proof is required';
      }
    }

    if (currentStep === 4 && (role === 'doctor' || role === 'lab_technician')) {
      if (!files.medicalLicenseProof) newErrors.medicalLicenseProof = 'License Proof is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const contentScrollRef = React.useRef(null);

  const handleNext = () => {
    if (validateStep(step)) {
      setStep(step + 1);
      // Reset scroll position when transitioning to next step
      if (contentScrollRef.current) {
        contentScrollRef.current.scrollTop = 0;
      }
    }
  };

  const handleBack = () => {
    if (step > 1) {
      setStep(step - 1);
      // Reset scroll position when going back
      if (contentScrollRef.current) {
        contentScrollRef.current.scrollTop = 0;
      }
    }
  };

  const handleCompleteRegistration = async (e) => {
    e.preventDefault();
    if (validateStep(step)) { // Validate final step
      setLoading(true);
      setError('');

      const apiUrl = '/api';

      try {
        const formDataToSend = new FormData();
        // Append all text fields
        Object.keys(formData).forEach(key => {
          if (formData[key] !== undefined && formData[key] !== null) {
            formDataToSend.append(key, formData[key]);
          }
        });
        formDataToSend.append('role', role);
        // Ensure name is appended correctly if not already in formData
        if (!formDataToSend.has('name')) formDataToSend.append('name', formData.name);

        // Map frontend fields to backend schema
        formDataToSend.append('guardianNumber', formData.emergencyContact);
        formDataToSend.append('residentialAddress', formData.address);
        formDataToSend.append('licenseNumber', (role === 'doctor' || role === 'lab_technician') ? formData.medicalLicense : formData.pharmacyLicense);

        // Append common compulsory file
        if (files.profileImage) {
          formDataToSend.append('profileImage', files.profileImage);
        }

        // Append files based on role and context
        if (role === 'patient') {
          if (formData.hasInsurance === 'yes' && files.insuranceProofImage) {
            formDataToSend.append('insuranceProofImage', files.insuranceProofImage);
          }
          if (files.pastLabReports && files.pastLabReports.length > 0) {
            Array.from(files.pastLabReports).forEach(file => {
              formDataToSend.append('pastLabReports', file);
            });
          }
        } else if (role === 'doctor' || role === 'lab_technician') {
          if (files.medicalLicenseProof) {
            formDataToSend.append('medicalLicenseProof', files.medicalLicenseProof);
          }
          if (files.achievementCertificates && files.achievementCertificates.length > 0) {
            Array.from(files.achievementCertificates).forEach(file => {
              formDataToSend.append('achievementCertificates', file);
            });
          }
        } else if (role === 'pharmacist') {
          if (files.medicalLicenseProof) {
            formDataToSend.append('medicalLicenseProof', files.medicalLicenseProof);
          }
        }

        console.log("Submitting FormData for role:", role);
        // Log form data keys for debugging
        for (let pair of formDataToSend.entries()) {
          console.log(pair[0] + ', ' + pair[1]);
        }

        let response;

        if (role === 'ambulance') {
          // Ambulance registration uses its own endpoint with profile image support
          const ambulanceData = new FormData();
          ambulanceData.append('name', formData.name);
          ambulanceData.append('email', formData.email);
          ambulanceData.append('password', formData.password);
          ambulanceData.append('phone', formData.phone);
          ambulanceData.append('bloodGroup', formData.bloodGroup);
          ambulanceData.append('guardianNumber', formData.emergencyContact);
          ambulanceData.append('gender', formData.gender);
          ambulanceData.append('residentialAddress', formData.address);
          // Ambulance-specific fields
          ambulanceData.append('employeeId', formData.employeeId);
          ambulanceData.append('drivingLicenseNumber', formData.drivingLicenseNumber);
          ambulanceData.append('licenseExpiryDate', formData.licenseExpiryDate);
          ambulanceData.append('hospitalOrOrganization', formData.hospitalOrOrganization);
          ambulanceData.append('ambulanceVehicleNumber', formData.ambulanceVehicleNumber);
          ambulanceData.append('ambulanceType', formData.ambulanceType);
          if (formData.yearsOfExperience) ambulanceData.append('yearsOfExperience', formData.yearsOfExperience);
          if (files.profileImage) ambulanceData.append('profileImage', files.profileImage);

          response = await axios.post(`${apiUrl}/auth/register/ambulance`, ambulanceData, {
            headers: { 'Content-Type': 'multipart/form-data' },
          });
        } else {
          response = await axios.post(`${apiUrl}/auth/register`, formDataToSend, {
            headers: { "Content-Type": "multipart/form-data" }
          });
        }

        if (response.data.success) {
          console.log("Registration success:", response.data);

          if (['doctor', 'pharmacist', 'lab_technician', 'delivery'].includes(role)) {
            alert(`Registration successful! Your ${role} account is pending approval by the hospital admin. You will be able to login once approved.`);
          } else if (role === 'ambulance') {
            alert("Ambulance driver registration successful! You can now login to access the Ambulance Dashboard.");
          } else {
            alert("Registration successful! Please login.");
          }

          onClose();
          if (onSwitchToLogin) onSwitchToLogin();
        }
      } catch (err) {
        console.error("Registration failed error object:", err);
        console.error("Registration failed response data:", err.response?.data);

        setError(
          err.response?.data?.message ||
          err.response?.data?.error ||
          "Registration failed. Please try again."
        );
      } finally {
        setLoading(false);
      }
    }
  };

  const renderRoleSelection = () => (
    <div className="animate-in slide-in-from-right duration-300">
      <h2 className="text-xl sm:text-2xl font-bold text-white mb-4 sm:mb-6">Select Your Role</h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-4 mb-6 sm:mb-8">
        {[
          { id: 'patient', label: 'Patient', icon: User },
          { id: 'doctor_professional', label: 'Professional', icon: Stethoscope },
          { id: 'pharmacist', label: 'Pharmacy', icon: Pill },
          { id: 'delivery', label: 'Delivery', icon: Truck },
          { id: 'ambulance', label: 'Ambulance', icon: Ambulance },
        ].map((r) => (
          <button
            key={r.id}
            onClick={() => handleRoleSelect(r.id)}
            className={`p-3 sm:p-4 rounded-lg sm:rounded-xl border flex flex-col items-center justify-center gap-2 sm:gap-3 transition-all duration-200 text-xs sm:text-sm
              ${role === r.id || (r.id === 'doctor_professional' && (role === 'doctor' || role === 'lab_technician' || role === 'doctor_professional'))
                ? 'bg-green-500 border-green-500 text-black shadow-[0_0_15px_rgba(34,197,94,0.4)]'
                : 'bg-[#111] border-gray-800 text-gray-400 hover:border-gray-600 hover:text-white'}`}
          >
            <r.icon size={20} className="sm:w-6 sm:h-6" />
            <span className="font-medium">{r.label}</span>
          </button>
        ))}
      </div>

      {(role === 'doctor' || role === 'lab_technician' || role === 'doctor_professional') && (
        <div className="animate-in fade-in slide-in-from-top duration-300 mb-6 sm:mb-8 p-3 sm:p-4 bg-[#111] border border-gray-800 rounded-lg sm:rounded-xl">
          <h3 className="text-base sm:text-lg font-bold text-white mb-3 sm:mb-4">Select Professional Role</h3>
          <div className="grid grid-cols-2 gap-2 sm:gap-4">
            <button
              onClick={() => handleSubRoleSelect('doctor')}
              className={`p-3 sm:p-4 rounded-lg border flex items-center justify-center gap-2 transition-all text-xs sm:text-sm
                    ${subRole === 'doctor'
                  ? 'bg-blue-500/20 border-blue-500 text-blue-400'
                  : 'bg-[#1a1a1a] border-gray-700 text-gray-400 hover:border-gray-500'}`}
            >
              <Stethoscope size={18} className="sm:w-5 sm:h-5" />
              <span>Doctor</span>
            </button>
            <button
              onClick={() => handleSubRoleSelect('lab_technician')}
              className={`p-3 sm:p-4 rounded-lg border flex items-center justify-center gap-2 transition-all text-xs sm:text-sm
                    ${subRole === 'lab_technician'
                  ? 'bg-purple-500/20 border-purple-500 text-purple-400'
                  : 'bg-[#1a1a1a] border-gray-700 text-gray-400 hover:border-gray-500'}`}
            >
              <FileText size={18} className="sm:w-5 sm:h-5" />
              <span>Lab Technician</span>
            </button>
          </div>
        </div>
      )}

      {role && role !== 'doctor_professional' && (
        <div className="flex justify-end mt-6 sm:mt-8">
          <button onClick={handleNext} className="bg-green-500 hover:bg-green-400 text-black font-bold py-2.5 sm:py-3 px-6 sm:px-8 rounded-full flex items-center gap-2 transition-colors text-sm sm:text-base">
            Next <ArrowRight size={18} />
          </button>
        </div>
      )}
    </div>
  );

  const renderBasicDetails = () => (
    <div className="animate-in slide-in-from-right duration-300">
      <h2 className="text-xl sm:text-2xl font-bold text-white mb-4 sm:mb-6">Basic Information</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
        <InputField label="Full Name" name="name" value={formData.name} onChange={handleInputChange} error={errors.name} />
        <InputField label="Email Address" name="email" type="email" value={formData.email} onChange={handleInputChange} error={errors.email} />
        <InputField label="Phone Number" name="phone" value={formData.phone} onChange={handleInputChange} error={errors.phone} />
        <InputField label="Guardian / Emergency Contact" name="emergencyContact" value={formData.emergencyContact} onChange={handleInputChange} error={errors.emergencyContact} />

        <InputField label="Date of Birth" name="dob" type="date" value={formData.dob} onChange={handleInputChange} error={errors.dob} />
        <SelectField label="Gender" name="gender" value={formData.gender} onChange={handleInputChange} options={['male', 'female', 'other']} error={errors.gender} />

        <div className="md:col-span-2">
          <label className="text-xs sm:text-sm font-medium text-gray-300">Residential Address</label>
          <textarea name="address" value={formData.address} onChange={handleInputChange} rows="2" className={`w-full bg-[#111] border ${errors.address ? 'border-red-500' : 'border-gray-800'} rounded-lg sm:rounded-xl px-3 sm:px-4 py-2.5 sm:py-3 text-white focus:outline-none focus:border-green-500 mt-1 text-sm`} />
          {errors.address && <p className="text-red-400 text-xs mt-1">{errors.address}</p>}
        </div>

        <div className="md:col-span-2">
          <label className="text-xs sm:text-sm font-medium text-gray-300">Profile Image <span className="text-red-500">*</span></label>
          <input type="file" name="profileImage" onChange={handleFileChange} accept="image/jpeg, image/jpg, image/png" className="w-full mt-1 text-xs sm:text-sm text-gray-400 file:mr-2 sm:file:mr-4 file:py-2 file:px-3 sm:file:px-4 file:rounded-full file:border-0 file:text-xs sm:file:text-sm file:font-semibold file:bg-gray-800 file:text-green-500 hover:file:bg-gray-700" />
          {errors.profileImage && <p className="text-red-400 text-xs mt-1">{errors.profileImage}</p>}
        </div>

        <InputField label="Password" name="password" type="password" value={formData.password} onChange={handleInputChange} error={errors.password} />
        <InputField label="Confirm Password" name="confirmPassword" type="password" value={formData.confirmPassword} onChange={handleInputChange} error={errors.confirmPassword} />
      </div>
      <div className="flex justify-between gap-2 mt-6 sm:mt-8">
        <button onClick={handleBack} className="text-gray-400 hover:text-white px-4 sm:px-6 py-2 sm:py-3 text-sm sm:text-base">Back</button>
        <button onClick={handleNext} className="bg-green-500 hover:bg-green-400 text-black font-bold py-2 sm:py-3 px-4 sm:px-8 rounded-full flex items-center gap-2 text-sm sm:text-base">Next <ArrowRight size={18} /></button>
      </div>
    </div>
  );

  const renderRoleSpecificDetails = () => (
    <div className="animate-in slide-in-from-right duration-300">
      <h2 className="text-xl sm:text-2xl font-bold text-white mb-4 sm:mb-6">
        {role === 'patient' ? 'Health Details' : role === 'ambulance' ? 'Ambulance Details' : 'Professional Details'}
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
        {role === 'patient' && (
          <>
            <InputField label="Height (cm)" name="height" value={formData.height} onChange={handleInputChange} />
            <InputField label="Weight (kg)" name="weight" value={formData.weight} onChange={handleInputChange} />
            <div className="md:col-span-2">
              <label className="text-sm font-medium text-gray-300">Past Lab Reports (Optional)</label>
              <input type="file" name="pastLabReports" multiple onChange={handleFileChange} className="w-full mt-1 text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-gray-800 file:text-green-500 hover:file:bg-gray-700" />
            </div>
          </>
        )}
        {(role === 'doctor' || role === 'lab_technician') && (
          <>
            <SelectField label="Hospital Name" name="hospitalName" value={formData.hospitalName} onChange={handleInputChange} options={allowedHospitals} error={errors.hospitalName} />
            <InputField label="Qualification" name="qualification" value={formData.qualification} onChange={handleInputChange} error={errors.qualification} />

            {role === 'doctor' && (
              <>
                <InputField label="Medical License Number" name="medicalLicense" value={formData.medicalLicense} onChange={handleInputChange} error={errors.medicalLicense} />
                <SelectField label="Specialization" name="specialization" value={formData.specialization} onChange={handleInputChange} options={specializations} error={errors.specialization} />
                <InputField label="Years of Experience" name="experience" value={formData.experience} onChange={handleInputChange} error={errors.experience} />
              </>
            )}
            {role === 'lab_technician' && (
              <>
                <InputField label="License Number" name="medicalLicense" value={formData.medicalLicense} onChange={handleInputChange} error={errors.medicalLicense} />
                {/* Lab Tech specific fields if any */}
              </>
            )}
          </>
        )}
        {role === 'pharmacist' && (
          <>
            <SelectField label="Hospital Name" name="hospitalName" value={formData.hospitalName} onChange={handleInputChange} options={allowedHospitals} error={errors.hospitalName} />
            <InputField label="Pharmacy License Number" name="pharmacyLicense" value={formData.pharmacyLicense} onChange={handleInputChange} error={errors.pharmacyLicense} />
            <InputField label="Qualification" name="qualification" value={formData.qualification} onChange={handleInputChange} error={errors.qualification} />
          </>
        )}
        {role === 'delivery' && (
          <>
            <SelectField label="Select Hospital" name="hospitalName" value={formData.hospitalName} onChange={handleInputChange} options={allowedHospitals} error={errors.hospitalName} />
            <InputField label="Employee ID" name="employeeId" value={formData.employeeId} onChange={handleInputChange} error={errors.employeeId} />
            <InputField label="Assigned Area / Ward" name="assignedWard" value={formData.assignedWard} onChange={handleInputChange} error={errors.assignedWard} />
          </>
        )}
        {role === 'ambulance' && (
          <>
            <InputField label="Employee / Driver ID" name="employeeId" value={formData.employeeId} onChange={handleInputChange} error={errors.employeeId} />
            <InputField label="Driving License Number" name="drivingLicenseNumber" value={formData.drivingLicenseNumber} onChange={handleInputChange} error={errors.drivingLicenseNumber} />
            <InputField label="License Expiry Date" name="licenseExpiryDate" type="date" value={formData.licenseExpiryDate} onChange={handleInputChange} error={errors.licenseExpiryDate} />
            <SelectField label="Hospital / Organization" name="hospitalOrOrganization" value={formData.hospitalOrOrganization} onChange={handleInputChange} options={allowedHospitals} error={errors.hospitalOrOrganization} />
            <InputField label="Ambulance Vehicle Number" name="ambulanceVehicleNumber" value={formData.ambulanceVehicleNumber} onChange={handleInputChange} error={errors.ambulanceVehicleNumber} />
            <SelectField label="Ambulance Type" name="ambulanceType" value={formData.ambulanceType} onChange={handleInputChange} options={['BLS', 'ALS', 'PATIENT_TRANSPORT', 'OTHER']} error={errors.ambulanceType} />
            <InputField label="Years of Experience" name="yearsOfExperience" type="number" value={formData.yearsOfExperience} onChange={handleInputChange} error={errors.yearsOfExperience} />
            <SelectField label="Blood Group" name="bloodGroup" value={formData.bloodGroup} onChange={handleInputChange} options={['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']} error={errors.bloodGroup} />
          </>
        )}
      </div>
      <div className="flex justify-between gap-2 mt-6 sm:mt-8">
        <button onClick={handleBack} className="text-gray-400 hover:text-white px-4 sm:px-6 py-2 sm:py-3 text-sm sm:text-base">Back</button>
        <button onClick={role === 'pharmacist' || role === 'delivery' || role === 'ambulance' ? handleCompleteRegistration : handleNext} className="bg-green-500 hover:bg-green-400 text-black font-bold py-2 sm:py-3 px-4 sm:px-8 rounded-full flex items-center gap-2 text-sm sm:text-base">
          {role === 'pharmacist' || role === 'delivery' || role === 'ambulance' ? (loading ? 'Registering...' : 'Submit') : 'Next'} <ArrowRight size={18} />
        </button>
      </div>
    </div>
  );

  const renderFinalStep = () => (
    <div className="animate-in slide-in-from-right duration-300">
      <h2 className="text-xl sm:text-2xl font-bold text-white mb-4 sm:mb-6">
        {role === 'patient' ? 'Insurance Details' : 'Upload Documents'}
      </h2>

      {role === 'patient' && (
        <div className="space-y-4 sm:space-y-6">
          <div>
            <label className="text-xs sm:text-sm font-medium text-gray-300 block mb-2">Do you have insurance?</label>
            <div className="flex gap-3 sm:gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="hasInsurance" value="yes" checked={formData.hasInsurance === 'yes'} onChange={handleInputChange} className="accent-green-500" />
                <span className="text-white text-sm">Yes</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="hasInsurance" value="no" checked={formData.hasInsurance === 'no'} onChange={handleInputChange} className="accent-green-500" />
                <span className="text-white text-sm">No</span>
              </label>
            </div>
          </div>

          {formData.hasInsurance === 'yes' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 p-3 sm:p-4 border border-gray-800 rounded-lg sm:rounded-xl bg-[#111]">
              <InputField label="Provider Name" name="insuranceProviderName" value={formData.insuranceProviderName} onChange={handleInputChange} error={errors.insuranceProviderName} />
              <InputField label="Policy Number" name="policyNumber" value={formData.policyNumber} onChange={handleInputChange} error={errors.policyNumber} />
              <InputField label="Valid Till" name="validTillDate" type="date" value={formData.validTillDate} onChange={handleInputChange} error={errors.validTillDate} />
              <div className="md:col-span-2">
                <label className="text-xs sm:text-sm font-medium text-gray-300">Insurance Proof Image <span className="text-red-500">*</span></label>
                <input type="file" name="insuranceProofImage" onChange={handleFileChange} className="w-full mt-1 text-xs sm:text-sm text-gray-400 file:mr-2 sm:file:mr-4 file:py-2 file:px-3 sm:file:px-4 file:rounded-full file:border-0 file:text-xs sm:file:text-sm file:font-semibold file:bg-gray-800 file:text-green-500 hover:file:bg-gray-700" />
                {errors.insuranceProofImage && <p className="text-red-400 text-xs mt-1">{errors.insuranceProofImage}</p>}
              </div>
            </div>
          )}
        </div>
      )}

      {(role === 'doctor' || role === 'lab_technician') && (
        <div className="grid grid-cols-1 gap-4 sm:gap-6">
          <div>
            <label className="text-xs sm:text-sm font-medium text-gray-300">Medical License Proof <span className="text-red-500">*</span></label>
            <input type="file" name="medicalLicenseProof" onChange={handleFileChange} className="w-full mt-1 text-xs sm:text-sm text-gray-400 file:mr-2 sm:file:mr-4 file:py-2 file:px-3 sm:file:px-4 file:rounded-full file:border-0 file:text-xs sm:file:text-sm file:font-semibold file:bg-gray-800 file:text-green-500 hover:file:bg-gray-700" />
            {errors.medicalLicenseProof && <p className="text-red-400 text-xs mt-1">{errors.medicalLicenseProof}</p>}
          </div>
          {role === 'doctor' && (
            <>
              <div>
                <label className="text-xs sm:text-sm font-medium text-gray-300">Professional Bio</label>
                <textarea
                  name="bio"
                  value={formData.bio}
                  onChange={handleInputChange}
                  placeholder="Tell patients about your background, expertise, and approach to care..."
                  rows="3"
                  className="w-full bg-[#111] border border-gray-800 rounded-lg sm:rounded-xl px-3 sm:px-4 py-2.5 sm:py-3 text-white focus:outline-none focus:border-green-500 mt-1 text-sm"
                />
              </div>
              <div>
                <label className="text-xs sm:text-sm font-medium text-gray-300">Achievement Certificates (Optional)</label>
                <input type="file" name="achievementCertificates" multiple onChange={handleFileChange} className="w-full mt-1 text-xs sm:text-sm text-gray-400 file:mr-2 sm:file:mr-4 file:py-2 file:px-3 sm:file:px-4 file:rounded-full file:border-0 file:text-xs sm:file:text-sm file:font-semibold file:bg-gray-800 file:text-green-500 hover:file:bg-gray-700" />
              </div>
            </>
          )}
        </div>
      )}

      <div className="flex justify-between gap-2 mt-6 sm:mt-8">
        <button onClick={handleBack} className="text-gray-400 hover:text-white px-4 sm:px-6 py-2 sm:py-3 text-sm sm:text-base">Back</button>
        <button onClick={handleCompleteRegistration} disabled={loading} className="bg-green-500 hover:bg-green-400 text-black font-bold py-2 sm:py-3 px-4 sm:px-8 rounded-full flex items-center gap-2 shadow-[0_0_20px_rgba(34,197,94,0.3)] text-sm sm:text-base">
          {loading ? 'Registering...' : 'Complete Registration'} <Check size={18} />
        </button>
      </div>
      {error && <p className="text-red-400 text-center text-sm mt-4">{error}</p>}
    </div>
  );

  const renderSummary = () => (
    <div className="flex flex-col md:flex-row gap-8">
      {/* Summary Card */}
      <div className="flex-1 bg-[#111] border border-gray-800 rounded-xl p-6">
        <h3 className="text-lg font-bold text-white mb-4 border-b border-gray-800 pb-2">Summary</h3>

        <div className="space-y-6">
          <div>
            <h4 className="text-sm font-semibold text-green-500 mb-3 uppercase tracking-wider">Personal Details</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-y-3 gap-x-4 text-sm">
              <div className="flex flex-col">
                <span className="text-gray-500">Role</span>
                <span className="text-white font-medium capitalize">{role}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-gray-500">Name</span>
                <span className="text-white font-medium">{formData.name}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-gray-500">Email</span>
                <span className="text-white font-medium truncate">{formData.email}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-gray-500">Phone</span>
                <span className="text-white font-medium">{formData.phone}</span>
              </div>
            </div>
          </div>

          <div>
            <h4 className="text-sm font-semibold text-green-500 mb-3 uppercase tracking-wider">Role Details</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-y-3 gap-x-4 text-sm">
              {role === 'patient' && (
                <div className="flex flex-col">
                  <span className="text-gray-500">Blood Group</span>
                  <span className="text-white font-medium">{formData.bloodGroup}</span>
                </div>
              )}
              {role === 'doctor' && (
                <>
                  <div className="flex flex-col">
                    <span className="text-gray-500">License</span>
                    <span className="text-white font-medium">{formData.medicalLicense}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-gray-500">Specialization</span>
                    <span className="text-white font-medium">{formData.specialization}</span>
                  </div>
                </>
              )}
              {/* Add other role details here */}
            </div>
          </div>
        </div>
      </div>

      {/* Agreement & Submit */}
      <div className="w-full md:w-80 space-y-6">
        <div className="bg-[#111] border border-gray-800 rounded-xl p-6">
          <h3 className="text-lg font-bold text-white mb-4">Terms & Privacy</h3>

          <div className="space-y-4">
            <label className="flex items-start gap-3 cursor-pointer group">
              <div className={`mt-0.5 w-5 h-5 rounded border flex items-center justify-center flex-shrink-0 transition-colors ${agreedToTerms ? 'bg-green-500 border-green-500 text-black' : 'border-gray-600 group-hover:border-gray-400'}`}>
                {agreedToTerms && <Check size={14} />}
              </div>
              <input type="checkbox" className="hidden" checked={agreedToTerms} onChange={() => setAgreedToTerms(!agreedToTerms)} />
              <span className="text-xs text-gray-400 group-hover:text-gray-300">I agree to the Terms of Service and Privacy Policy.</span>
            </label>

            <label className="flex items-start gap-3 cursor-pointer group">
              <div className={`mt-0.5 w-5 h-5 rounded border flex items-center justify-center flex-shrink-0 transition-colors ${agreedToBlockchain ? 'bg-green-500 border-green-500 text-black' : 'border-gray-600 group-hover:border-gray-400'}`}>
                {agreedToBlockchain && <Check size={14} />}
              </div>
              <input type="checkbox" className="hidden" checked={agreedToBlockchain} onChange={() => setAgreedToBlockchain(!agreedToBlockchain)} />
              <span className="text-xs text-gray-400 group-hover:text-gray-300">I consent to storing my medical ID on the blockchain.</span>
            </label>
          </div>
        </div>

        <button
          onClick={handleCompleteRegistration}
          disabled={!agreedToTerms || !agreedToBlockchain || loading}
          className={`w-full py-4 rounded-xl font-bold flex items-center justify-center gap-2 transition-all
                ${agreedToTerms && agreedToBlockchain && !loading
              ? 'bg-green-500 hover:bg-green-400 text-black shadow-[0_0_20px_rgba(34,197,94,0.4)]'
              : 'bg-gray-800 text-gray-500 cursor-not-allowed'}`}
        >
          {loading ? (
            <>Processing...</>
          ) : (
            <>Complete Registration <Check size={18} /></>
          )}
        </button>

        {error && <p className="text-red-500 text-xs text-center">{error}</p>}
      </div>
    </div>
  );

  const renderStepIndicator = (num, title, subtitle) => {
    const isActive = step === num;
    const isCompleted = step > num;

    return (
      <div className="flex items-center gap-3 relative group">
        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold z-10 transition-all duration-300
          ${isActive ? 'bg-green-500 text-black shadow-[0_0_15px_rgba(34,197,94,0.4)] scale-110' :
            isCompleted ? 'bg-green-500/20 text-green-500 border border-green-500/50' : 'bg-gray-800/50 text-gray-500 border border-gray-700'}`}>
          {isCompleted ? <Check size={14} /> : num}
        </div>
        <div className={`hidden md:block transition-opacity duration-300 ${isActive ? 'opacity-100' : 'opacity-50 group-hover:opacity-80'}`}>
          <h3 className={`font-semibold text-sm ${isActive ? 'text-white' : 'text-gray-400'}`}>{title}</h3>
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center px-3 sm:px-4 md:px-6 py-4 overflow-y-auto">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-md transition-opacity" onClick={onClose}></div>

      {/* Modal Container - Responsive height with scrolling support */}
      <div className="relative w-full max-w-4xl bg-[#0a0a0a] rounded-2xl shadow-2xl overflow-hidden flex flex-col md:flex-row min-h-screen md:min-h-0 md:max-h-[90vh] border border-gray-800/50 animate-in fade-in zoom-in-95 duration-300">

        {/* Sidebar - Hidden on mobile, visible on desktop */}
        <div className="hidden md:flex w-56 lg:w-64 bg-[#0f1110] p-4 lg:p-6 flex-col border-r border-gray-800/50 relative flex-shrink-0">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-green-500 via-green-400 to-transparent"></div>

          <div className="mb-6 lg:mb-8">
            <h2 className="text-lg lg:text-xl font-bold text-white flex items-center gap-2">
              <ShieldCheck className="text-green-500 flex-shrink-0" size={20} />
              <span className="truncate">Registration</span>
            </h2>
            <p className="text-gray-500 text-xs mt-1">Create your secure medical ID</p>
          </div>

          <div className="space-y-4 lg:space-y-6 relative">
            {/* Connector Line */}
            <div className="absolute left-[15px] top-4 bottom-4 w-0.5 bg-gray-800 -z-10"></div>

            {renderStepIndicator(1, "Role Selection")}
            {renderStepIndicator(2, "Basic Details")}
            {(role === 'patient' || role === 'doctor' || role === 'lab_technician') && (
              <>
                {renderStepIndicator(3, role === 'patient' ? 'Health Details' : 'Professional Info')}
                {renderStepIndicator(4, role === 'patient' ? 'Insurance' : 'Uploads')}
              </>
            )}
            {(role === 'pharmacist' || role === 'delivery') && (
              renderStepIndicator(3, "Professional Info")
            )}
            {role === 'ambulance' && (
              renderStepIndicator(3, "Ambulance Details")
            )}
          </div>
        </div>

        {/* Content Area - Flex column with fixed header/footer and scrollable content */}
        <div className="flex-1 bg-black/95 flex flex-col relative min-w-0 md:min-h-0">
          {/* Fixed Header */}
          <div className="flex items-center justify-between px-4 py-3 sm:px-6 sm:py-4 border-b border-gray-800/50 flex-shrink-0">
            <div className="md:hidden">
              <h2 className="text-base sm:text-lg font-bold text-white">Step {step}</h2>
              <div className="flex gap-1 mt-1">
                {[1, 2, 3, 4].map(i => (
                  <div key={i} className={`h-1 w-5 sm:w-6 rounded-full transition-colors ${i <= step ? 'bg-green-500' : 'bg-gray-800'}`}></div>
                ))}
              </div>
            </div>
            <div className="hidden md:block">
              <p className="text-sm text-gray-400">Step {step} of {role === 'patient' || role === 'doctor' || role === 'lab_technician' ? 4 : 3}</p>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-white hover:bg-white/10 p-2 rounded-full transition-colors flex-shrink-0">
              <X size={20} />
            </button>
          </div>

          {/* Scrollable Content Area */}
          <div ref={contentScrollRef} className="flex-1 overflow-y-auto px-4 py-6 sm:px-6 sm:py-8 custom-scrollbar">
            {step === 1 && renderRoleSelection()}
            {step === 2 && renderBasicDetails()}
            {step === 3 && renderRoleSpecificDetails()}
            {step === 4 && renderFinalStep()}
          </div>
        </div>
      </div>
    </div>
  );
};

// Compact Components
const InputField = ({ label, name, type = "text", value, onChange, error }) => (
  <div className="space-y-1.5">
    <label className="text-xs font-medium text-gray-400 ml-1">{label}</label>
    <input
      type={type}
      name={name}
      value={value}
      onChange={onChange}
      className={`w-full bg-[#111] border ${error ? 'border-red-500/50 focus:border-red-500' : 'border-gray-800 focus:border-green-500/50'} 
            rounded-lg px-3 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-green-500/10 transition-all`}
    />
    {error && <p className="text-red-400 text-[10px] ml-1 flex items-center gap-1"><span className="w-1 h-1 rounded-full bg-red-400 inline-block"></span>{error}</p>}
  </div>
);

const SelectField = ({ label, name, value, onChange, options, error }) => (
  <div className="space-y-1.5">
    <label className="text-xs font-medium text-gray-400 ml-1">{label}</label>
    <div className="relative">
      <select
        name={name}
        value={value}
        onChange={onChange}
        className={`w-full bg-[#111] border ${error ? 'border-red-500/50 focus:border-red-500' : 'border-gray-800 focus:border-green-500/50'} 
              rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-green-500/10 transition-all appearance-none capitalize`}
      >
        <option value="">Select {label}</option>
        {options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
      </select>
      <div className="absolute inset-y-0 right-3 flex items-center pointer-events-none text-gray-500">
        <svg className="w-3 h-3 fill-current" viewBox="0 0 20 20"><path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" /></svg>
      </div>
    </div>
    {error && <p className="text-red-400 text-[10px] ml-1 flex items-center gap-1"><span className="w-1 h-1 rounded-full bg-red-400 inline-block"></span>{error}</p>}
  </div>
);

export default RegistrationModal;

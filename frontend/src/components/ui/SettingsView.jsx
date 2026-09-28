import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { User, Phone, Mail, Camera, Loader2, Save, CheckCircle, MapPin, Users, Ruler, Scale, Droplets, Heart, Calendar, FileText, Upload, X, FileSignature, Bell, Volume2, VolumeX, Play } from 'lucide-react';
import { updateProfile, getBaseUrl } from '../../services/userApi';
import { testPlayCurrentSound, setUserPreferences as setSoundUserPreferences } from '../../utils/soundPlayer';
import CustomSelect from './CustomSelect';

const SettingsView = () => {
    const { user, setUser } = useAuth();
    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState(false);
    const [error, setError] = useState('');
    
    const [formData, setFormData] = useState({
        name: user?.name || '',
        phone: user?.phone || '',
        address: user?.residentialAddress || '',
        gender: user?.gender || '',
        hospitalAddress: user?.hospitalAddress || '',
        weight: user?.weight || '',
        height: user?.height || '',
        bloodGroup: user?.bloodGroup || '',
        guardianNumber: user?.guardianNumber || '',
        dob: user?.dob ? new Date(user.dob).toISOString().split('T')[0] : '',
        bio: user?.bio || '',
        soundEnabled: user?.notificationPreferences?.soundEnabled !== false,
        soundVolume: typeof user?.notificationPreferences?.soundVolume === 'number' ? user.notificationPreferences.soundVolume : 0.8,
    });
    const [profileImage, setProfileImage] = useState(null);
    const [previewUrl, setPreviewUrl] = useState(user?.profileImage ? `${getBaseUrl()}/${user.profileImage}` : null);
    const [signatureFile, setSignatureFile] = useState(null);
    const [signaturePreview, setSignaturePreview] = useState(user?.signature ? `${getBaseUrl()}/${user.signature}` : null);
    const [certificates, setCertificates] = useState([]);
    const [existingCertificates, setExistingCertificates] = useState(user?.achievementCertificates || []);

    useEffect(() => {
        if (user) {
            setFormData({
                name: user.name || '',
                phone: user.phone || '',
                address: user.residentialAddress || '',
                gender: user.gender || '',
                hospitalAddress: user.hospitalAddress || '',
                weight: user.weight || '',
                height: user.height || '',
                bloodGroup: user.bloodGroup || '',
                guardianNumber: user.guardianNumber || '',
                dob: user.dob ? new Date(user.dob).toISOString().split('T')[0] : '',
                bio: user.bio || '',
                soundEnabled: user.notificationPreferences?.soundEnabled !== false,
                soundVolume: typeof user.notificationPreferences?.soundVolume === 'number' ? user.notificationPreferences.soundVolume : 0.8,
            });
            if (user.profileImage && !profileImage) {
                setPreviewUrl(`${getBaseUrl()}/${user.profileImage}`);
            }
            if (user.signature && !signatureFile) {
                setSignaturePreview(`${getBaseUrl()}/${user.signature}`);
            }
            setExistingCertificates(user.achievementCertificates || []);
        }
    }, [user]);

    const handleFileChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            setProfileImage(file);
            setPreviewUrl(URL.createObjectURL(file));
        }
    };

    const handleSignatureChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            setSignatureFile(file);
            setSignaturePreview(URL.createObjectURL(file));
        }
    };

    const handleCertificateChange = (e) => {
        const files = Array.from(e.target.files);
        setCertificates(prev => [...prev, ...files]);
    };

    const removeNewCertificate = (index) => {
        setCertificates(prev => prev.filter((_, i) => i !== index));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        setSuccess(false);

        const data = new FormData();
        data.append('name', formData.name);
        data.append('phone', formData.phone);
        data.append('address', formData.address);
        data.append('gender', formData.gender);
        data.append('weight', formData.weight);
        data.append('height', formData.height);
        data.append('bloodGroup', formData.bloodGroup);
        data.append('guardianNumber', formData.guardianNumber);
        data.append('dob', formData.dob);
        data.append('bio', formData.bio);

        data.append('notificationPreferences.soundEnabled', String(formData.soundEnabled));
        data.append('notificationPreferences.soundVolume', String(formData.soundVolume));
        
        if (formData.hospitalAddress) data.append('hospitalAddress', formData.hospitalAddress);
        if (profileImage) {
            data.append('profileImage', profileImage);
        }
        if (signatureFile) {
            data.append('signature', signatureFile);
        }

        certificates.forEach(file => {
            data.append('achievementCertificates', file);
        });

        try {
            const res = await updateProfile(data);
            if (res.success) {
                setSuccess(true);
                // Update local auth context
                const updatedUser = { ...user, ...res.user };
                setUser(updatedUser);
                localStorage.setItem('user', JSON.stringify(updatedUser));
                setSoundUserPreferences({ soundEnabled: formData.soundEnabled, soundVolume: formData.soundVolume });
                setCertificates([]); // Clear newly uploaded certificates
                setTimeout(() => setSuccess(false), 3000);
            }
        } catch (err) {
            console.error('Update failed:', err);
            setError(err.response?.data?.message || 'Failed to update profile');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="max-w-2xl mx-auto">
            <header className="mb-8">
                <h2 className="text-2xl font-bold">Account Settings</h2>
                <p className="text-gray-400">Update your personal information and profile picture</p>
            </header>

            <div className="bg-[#111] border border-gray-800 rounded-2xl overflow-hidden shadow-2xl">
                <form onSubmit={handleSubmit} className="p-8 space-y-6">
                    {/* Profile Picture */}
                    <div className="flex flex-col items-center gap-4 pb-6 border-b border-gray-800">
                        <div className="relative group">
                            <div className="w-24 h-24 rounded-full bg-gray-800 border-2 border-gray-700 flex items-center justify-center overflow-hidden">
                                {previewUrl ? (
                                    <img src={previewUrl} alt="Profile" className="w-full h-full object-cover" />
                                ) : (
                                    <User size={40} className="text-gray-500" />
                                )}
                            </div>
                            <label htmlFor="profile-upload" className="absolute bottom-0 right-0 p-1.5 bg-blue-600 rounded-full cursor-pointer hover:bg-blue-500 transition-colors shadow-lg border border-black group-hover:scale-110">
                                <Camera size={16} />
                                <input id="profile-upload" type="file" className="hidden" accept="image/*" onChange={handleFileChange} />
                            </label>
                        </div>
                        <p className="text-xs text-gray-500">JPG, PNG or GIF. Max size 5MB.</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Name */}
                        <div className="space-y-1.5">
                            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Full Name</label>
                            <div className="relative">
                                <User className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
                                <input
                                    type="text"
                                    required
                                    className="w-full bg-[#1a1a1a] border border-gray-800 rounded-xl pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:border-blue-500 transition-colors"
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                />
                            </div>
                        </div>

                        {/* Phone */}
                        <div className="space-y-1.5">
                            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Phone Number</label>
                            <div className="relative">
                                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
                                <input
                                    type="tel"
                                    required
                                    className="w-full bg-[#1a1a1a] border border-gray-800 rounded-xl pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:border-blue-500 transition-colors"
                                    value={formData.phone}
                                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                                />
                            </div>
                        </div>

                        {/* Gender */}
                        <div className="space-y-1.5">
                            <CustomSelect 
                                label="Gender"
                                placeholder="Select Gender"
                                value={formData.gender}
                                onChange={(val) => setFormData({ ...formData, gender: val })}
                                options={[
                                    { value: 'male', label: 'Male' },
                                    { value: 'female', label: 'Female' },
                                    { value: 'other', label: 'Other' }
                                ]}
                                icon={Users}
                            />
                        </div>

                        {/* Email (Read Only) */}
                        <div className="space-y-1.5">
                            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Email Address</label>
                            <div className="relative opacity-60">
                                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
                                <input
                                    type="email"
                                    disabled
                                    className="w-full bg-[#1a1a1a] border border-gray-800 rounded-xl pl-10 pr-4 py-2.5 text-sm cursor-not-allowed"
                                    value={user?.email || ''}
                                />
                            </div>
                        </div>

                        {/* Date of Birth */}
                        <div className="space-y-1.5">
                            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Date of Birth</label>
                            <div className="relative">
                                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
                                <input
                                    type="date"
                                    className="w-full bg-[#1a1a1a] border border-gray-800 rounded-xl pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:border-blue-500 transition-colors"
                                    value={formData.dob}
                                    onChange={(e) => setFormData({ ...formData, dob: e.target.value })}
                                />
                            </div>
                        </div>

                        {/* Address */}
                        <div className="space-y-1.5 md:col-span-2">
                            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Residential Address</label>
                            <div className="relative">
                                <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
                                <input
                                    type="text"
                                    placeholder="Enter your full address..."
                                    className="w-full bg-[#1a1a1a] border border-gray-800 rounded-xl pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:border-blue-500 transition-colors"
                                    value={formData.address}
                                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                                />
                            </div>
                        </div>

                        {/* Bio (Doctors only) */}
                        {user?.role === 'doctor' && (
                            <>
                                <div className="space-y-1.5 md:col-span-2">
                                    <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Professional Bio</label>
                                    <textarea
                                        rows="4"
                                        placeholder="Tell patients about your background, expertise, and approach to care..."
                                        className="w-full bg-[#1a1a1a] border border-gray-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-blue-500 transition-colors resize-none"
                                        value={formData.bio}
                                        onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
                                    />
                                </div>

                                {/* Digital Signature Upload */}
                                <div className="space-y-3 md:col-span-2 pt-4 border-t border-gray-800">
                                    <label className="text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center gap-2">
                                        <FileSignature size={14} className="text-amber-500" /> Digital Signature
                                    </label>
                                    
                                    <div className="flex flex-col sm:flex-row items-center gap-6 p-6 bg-amber-500/5 border border-amber-500/10 rounded-2xl">
                                        <div className="w-48 h-24 bg-white rounded-xl border border-gray-800 overflow-hidden flex items-center justify-center relative group">
                                            {signaturePreview ? (
                                                <img src={signaturePreview} alt="Signature" className="max-w-full max-h-full object-contain" />
                                            ) : (
                                                <div className="text-gray-300 text-[10px] font-medium uppercase tracking-widest text-center px-4">
                                                    No signature uploaded
                                                </div>
                                            )}
                                            <label htmlFor="signature-upload" className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer">
                                                <Upload size={20} className="text-white" />
                                                <input id="signature-upload" type="file" className="hidden" accept="image/*" onChange={handleSignatureChange} />
                                            </label>
                                        </div>
                                        <div className="flex-1 space-y-2 text-center sm:text-left">
                                            <p className="text-xs font-bold text-amber-200">Upload your clinical signature</p>
                                            <p className="text-[10px] text-gray-500 leading-relaxed">
                                                This signature will be automatically applied to all official medical certificates and prescriptions issued by you.
                                            </p>
                                            <button 
                                                type="button"
                                                onClick={() => document.getElementById('signature-upload').click()}
                                                className="text-[10px] font-black text-amber-500 hover:text-amber-400 uppercase tracking-widest transition-colors"
                                            >
                                                Change Signature
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </>
                        )}

                        {/* Certificates (Doctors only) */}
                        {user?.role === 'doctor' && (
                            <div className="space-y-3 md:col-span-2">
                                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center gap-2">
                                    <FileText size={14} /> Achievement Certificates
                                </label>
                                
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    {/* Existing Certificates */}
                                    {existingCertificates.map((cert, idx) => (
                                        <div key={`exist-${idx}`} className="flex items-center justify-between p-3 bg-blue-500/5 border border-blue-500/10 rounded-xl">
                                            <div className="flex items-center gap-2 overflow-hidden">
                                                <FileText size={16} className="text-blue-400 shrink-0" />
                                                <span className="text-xs text-blue-300 truncate">Certificate {idx + 1}</span>
                                            </div>
                                            <a 
                                                href={`${getBaseUrl()}/${cert}`} 
                                                target="_blank" 
                                                rel="noopener noreferrer"
                                                className="text-[10px] font-bold text-blue-400 hover:underline"
                                            >
                                                VIEW
                                            </a>
                                        </div>
                                    ))}

                                    {/* New Certificates */}
                                    {certificates.map((file, idx) => (
                                        <div key={`new-${idx}`} className="flex items-center justify-between p-3 bg-emerald-500/5 border border-emerald-500/10 rounded-xl">
                                            <div className="flex items-center gap-2 overflow-hidden">
                                                <FileText size={16} className="text-emerald-400 shrink-0" />
                                                <span className="text-xs text-emerald-300 truncate">{file.name}</span>
                                            </div>
                                            <button 
                                                type="button"
                                                onClick={() => removeNewCertificate(idx)}
                                                className="text-emerald-400 hover:text-emerald-300 transition-colors"
                                            >
                                                <X size={14} />
                                            </button>
                                        </div>
                                    ))}

                                    {/* Upload Button */}
                                    {existingCertificates.length + certificates.length < 5 && (
                                        <label className="flex flex-col items-center justify-center p-4 border-2 border-dashed border-gray-800 rounded-xl hover:border-blue-500/50 hover:bg-blue-500/5 cursor-pointer transition-all group">
                                            <Upload size={20} className="text-gray-500 group-hover:text-blue-400 mb-1" />
                                            <span className="text-[10px] font-bold text-gray-500 group-hover:text-blue-400 uppercase tracking-widest">Upload Certificate</span>
                                            <input 
                                                type="file" 
                                                className="hidden" 
                                                accept=".pdf,image/*" 
                                                multiple 
                                                onChange={handleCertificateChange} 
                                            />
                                        </label>
                                    )}
                                </div>
                                <p className="text-[10px] text-gray-500 italic">Upload up to 5 certificates (PDF or Images)</p>
                            </div>
                        )}

                        {/* Health Information (Patients only) */}
                        {user?.role === 'patient' && (
                            <>
                                <div className="md:col-span-2 pt-4 border-t border-gray-800">
                                    <h3 className="text-sm font-bold text-gray-400 flex items-center gap-2">
                                        <Heart size={16} className="text-red-500" /> Vital Health Metrics
                                    </h3>
                                </div>

                                {/* Weight */}
                                <div className="space-y-1.5">
                                    <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Weight (kg)</label>
                                    <div className="relative">
                                        <Scale className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
                                        <input
                                            type="number"
                                            placeholder="e.g. 70"
                                            className="w-full bg-[#1a1a1a] border border-gray-800 rounded-xl pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:border-blue-500 transition-colors"
                                            value={formData.weight}
                                            onChange={(e) => setFormData({ ...formData, weight: e.target.value })}
                                        />
                                    </div>
                                </div>

                                {/* Height */}
                                <div className="space-y-1.5">
                                    <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Height (cm)</label>
                                    <div className="relative">
                                        <Ruler className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
                                        <input
                                            type="number"
                                            placeholder="e.g. 175"
                                            className="w-full bg-[#1a1a1a] border border-gray-800 rounded-xl pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:border-blue-500 transition-colors"
                                            value={formData.height}
                                            onChange={(e) => setFormData({ ...formData, height: e.target.value })}
                                        />
                                    </div>
                                </div>

                                {/* Blood Group */}
                                <div className="space-y-1.5">
                                    <CustomSelect 
                                        label="Blood Group"
                                        placeholder="Select Blood Group"
                                        value={formData.bloodGroup}
                                        onChange={(val) => setFormData({ ...formData, bloodGroup: val })}
                                        options={[
                                            { value: 'A+', label: 'A+' },
                                            { value: 'A-', label: 'A-' },
                                            { value: 'B+', label: 'B+' },
                                            { value: 'B-', label: 'B-' },
                                            { value: 'O+', label: 'O+' },
                                            { value: 'O-', label: 'O-' },
                                            { value: 'AB+', label: 'AB+' },
                                            { value: 'AB-', label: 'AB-' }
                                        ]}
                                        icon={Droplets}
                                    />
                                </div>

                                {/* Emergency Contact */}
                                <div className="space-y-1.5">
                                    <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Emergency Contact</label>
                                    <div className="relative">
                                        <Phone className="absolute left-3 top-1/2 -translate-y-1/2 text-red-500/60" size={18} />
                                        <input
                                            type="tel"
                                            placeholder="Guardian phone number..."
                                            className="w-full bg-[#1a1a1a] border border-gray-800 rounded-xl pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:border-blue-500 transition-colors"
                                            value={formData.guardianNumber}
                                            onChange={(e) => setFormData({ ...formData, guardianNumber: e.target.value })}
                                        />
                                    </div>
                                </div>
                            </>
                        )}
                    </div>

                    <div className="pt-6 border-t border-gray-800">
                        <h3 className="text-sm font-bold text-gray-400 flex items-center gap-2 mb-5">
                            <Bell size={16} className="text-amber-500" /> Notification Preferences
                        </h3>
                        <div className="space-y-5">
                            <div className="flex items-center justify-between p-4 bg-[#1a1a1a] border border-gray-800 rounded-xl">
                                <div className="flex items-center gap-3">
                                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${formData.soundEnabled ? 'bg-emerald-500/10 text-emerald-400' : 'bg-gray-800 text-gray-500'}`}>
                                        {formData.soundEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
                                    </div>
                                    <div>
                                        <p className="text-sm font-semibold text-gray-100">Enable Notification Sounds</p>
                                        <p className="text-xs text-gray-500 mt-0.5">Play audible alerts for real-time updates</p>
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    role="switch"
                                    aria-pressed={formData.soundEnabled}
                                    onClick={() => setFormData({ ...formData, soundEnabled: !formData.soundEnabled })}
                                    className={`relative w-12 h-7 rounded-full transition-colors duration-200 ${formData.soundEnabled ? 'bg-emerald-500' : 'bg-gray-700'}`}
                                >
                                    <span className={`absolute top-1 left-1 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200 ${formData.soundEnabled ? 'translate-x-5' : ''}`} />
                                </button>
                            </div>

                            <div className={`p-4 bg-[#1a1a1a] border border-gray-800 rounded-xl transition-opacity ${formData.soundEnabled ? 'opacity-100' : 'opacity-50'}`}>
                                <div className="flex items-center justify-between mb-3">
                                    <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                                        Notification Volume
                                    </label>
                                    <span className="text-xs font-bold text-emerald-400 tabular-nums">
                                        {Math.round(formData.soundVolume * 100)}%
                                    </span>
                                </div>
                                <div className="flex items-center gap-3">
                                    <VolumeX size={16} className="text-gray-500 shrink-0" />
                                    <input
                                        type="range"
                                        min="0"
                                        max="100"
                                        step="1"
                                        disabled={!formData.soundEnabled}
                                        value={Math.round(formData.soundVolume * 100)}
                                        onChange={(e) => setFormData({ ...formData, soundVolume: Number(e.target.value) / 100 })}
                                        className="flex-1 h-2 bg-gray-800 rounded-full appearance-none cursor-pointer accent-emerald-500 disabled:cursor-not-allowed"
                                    />
                                    <Volume2 size={16} className="text-gray-400 shrink-0" />
                                </div>
                            </div>

                            <div className="flex gap-3">
                                <button
                                    type="button"
                                    disabled={!formData.soundEnabled}
                                    onClick={() => testPlayCurrentSound()}
                                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm border border-gray-700 text-gray-300 hover:bg-gray-800 hover:text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                                >
                                    <Play size={16} />
                                    Test Sound
                                </button>
                            </div>
                        </div>
                    </div>

                    {error && (
                        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-500 text-sm">
                            {error}
                        </div>
                    )}

                    <div className="pt-4 flex justify-end">
                        <button
                            type="submit"
                            disabled={loading}
                            className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-bold text-sm transition-all ${
                                success 
                                ? 'bg-green-600 text-white' 
                                : 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-900/20 active:scale-95'
                            }`}
                        >
                            {loading ? (
                                <Loader2 size={18} className="animate-spin" />
                            ) : success ? (
                                <CheckCircle size={18} />
                            ) : (
                                <Save size={18} />
                            )}
                            {loading ? 'Saving...' : success ? 'Updated!' : 'Save Changes'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default SettingsView;

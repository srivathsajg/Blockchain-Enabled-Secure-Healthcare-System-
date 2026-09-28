import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import {
    Activity, ClipboardList, Upload, Users, Search, Bell, Settings, LogOut, FileText, CheckCircle, Clock, User
} from 'lucide-react';
import { fetchLabPatients, uploadLabReport, fetchLabOrders, fetchCompletedLabOrders } from '../services/labApi';
import SettingsView from '../components/ui/SettingsView';
import { getBaseUrl } from '../services/userApi';
import UniversalSearchBar from '../components/ui/UniversalSearchBar';
import Loader from '../components/ui/Loader';
import { useLocation } from 'react-router-dom';
import socket from '../services/socket';
import { useSocketNotifications } from '../hooks/useSocketNotifications';
import NotificationBell from '../components/ui/NotificationBell';

const LabTechnicianDashboard = () => {
    const { user, logout } = useAuth();
    const [notificationCount, resetNotifications, , notifications, markNotificationRead] = useSocketNotifications({
        userId: user?._id || user?.id, 
        hospitalName: user?.hospitalName,
        notificationPrefs: user?.notificationPreferences,
    });
    
    const [activeTab, setActiveTab] = useState('patients');
    const location = useLocation();

    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedOrder, setSelectedOrder] = useState(null);
    const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
    const [completedOrders, setCompletedOrders] = useState([]);

    // Form state for upload
    const [reportForm, setReportForm] = useState({
        testName: '',
        result: '',
        notes: ''
    });
    const [reportFile, setReportFile] = useState(null);

    const loadOrders = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetchLabOrders();
            if (res.success) {
                setOrders(res.data);
            }
        } catch (error) {
            console.error("Error loading orders:", error);
        } finally {
            setLoading(false);
        }
    }, []);

    const loadCompletedOrders = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetchCompletedLabOrders();
            if (res.success) {
                setCompletedOrders(res.data);
            }
        } catch (error) {
            console.error("Error loading completed orders:", error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        const params = new URLSearchParams(location.search);
        const tab = params.get('tab');
        const validTabs = ['patients', 'completed', 'settings'];
        if (tab && validTabs.includes(tab)) {
            setActiveTab(tab);
        }
    }, [location]);

    useEffect(() => {
        if (activeTab === 'patients') {
            loadOrders();
        } else if (activeTab === 'completed') {
            loadCompletedOrders();
        }
    }, [activeTab, loadOrders, loadCompletedOrders]);

    // Real-time updates for Lab Technician
    useEffect(() => {
        const handleNewLabOrder = (data) => {
            // Check if it's for this hospital
            if (data.hospitalName === user?.hospitalName) {
                // If on patients queue tab, refresh
                if (activeTab === 'patients') {
                    loadOrders();
                }
            }
        };

        socket.on('new-lab-order-received', handleNewLabOrder);

        return () => {
            socket.off('new-lab-order-received', handleNewLabOrder);
        };
    }, [user, activeTab, loadOrders]);

    const handleUploadClick = (order) => {
        setSelectedOrder(order);
        setReportForm({
            testName: order.testName,
            result: '',
            notes: ''
        });
        setIsUploadModalOpen(true);
    };

    const handleFileChange = (e) => {
        setReportFile(e.target.files[0]);
    };

    const handleUploadSubmit = async (e) => {
        e.preventDefault();
        if (!reportFile || !selectedOrder) return;

        const formData = new FormData();
        formData.append('orderId', selectedOrder._id);
        formData.append('patientId', selectedOrder.patientId._id);
        formData.append('testName', reportForm.testName);
        formData.append('result', reportForm.result);
        formData.append('notes', reportForm.notes);
        formData.append('reportFile', reportFile);

        try {
            const res = await uploadLabReport(formData);
            if (res.success) {
                alert("Lab report uploaded successfully!");
                setIsUploadModalOpen(false);
                setReportForm({ testName: '', result: '', notes: '' });
                setReportFile(null);
                loadOrders(); // Refresh list
            }
        } catch (error) {
            console.error("Upload failed:", error);
            alert("Failed to upload report.");
        }
    };

    const filteredOrders = (orders || []).filter(o => 
        (o.patientId?.name?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
        (o.testName?.toLowerCase() || '').includes(searchTerm.toLowerCase())
    );

    const filteredCompletedOrders = (completedOrders || []).filter(o => 
        (o.patientId?.name?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
        (o.testName?.toLowerCase() || '').includes(searchTerm.toLowerCase())
    );

    return (
        <div className="flex h-screen bg-[#0a0a0a] text-white font-sans overflow-hidden">
            {/* Sidebar */}
            <aside className="w-64 border-r border-gray-800 flex flex-col bg-[#0f1110]">
                <div className="p-6 flex items-center gap-3">
                    <div className="bg-purple-500 p-1.5 rounded-lg shadow-sm">
                        <Activity className="w-5 h-5 text-black" />
                    </div>
                    <div>
                        <h1 className="font-bold text-lg tracking-tight">MediCare</h1>
                        <p className="text-[10px] text-gray-500 uppercase tracking-wider">Lab Portal</p>
                    </div>
                </div>

                <nav className="flex-1 px-4 space-y-2 mt-4">
                    <NavItem icon={Users} label="Patients Queue" active={activeTab === 'patients'} onClick={() => setActiveTab('patients')} />
                    <NavItem icon={ClipboardList} label="Completed Tests" active={activeTab === 'completed'} onClick={() => setActiveTab('completed')} />
                </nav>

                <div className="p-4 mt-auto space-y-2">
                    <NavItem icon={Settings} label="Settings" active={activeTab === 'settings'} onClick={() => setActiveTab('settings')} />
                    <NavItem icon={LogOut} label="Logout" onClick={logout} />
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 flex flex-col overflow-hidden">
                <header className="h-16 border-b border-gray-800 flex items-center justify-between px-8 bg-[#0a0a0a]">
                    <div className="flex items-center gap-6 flex-1 max-w-3xl">
                        <div className="flex items-center gap-2 text-sm text-purple-500 font-medium whitespace-nowrap">
                            <Activity size={16} /> <span className="hidden lg:inline">Lab Analytics Active</span>
                        </div>
                        <UniversalSearchBar />
                    </div>
                    <div className="flex items-center gap-4">
                        <NotificationBell count={notificationCount} notifications={notifications} onClick={resetNotifications} onMarkRead={markNotificationRead} />
                        <div className="text-right">
                            <p className="text-sm font-bold text-white">{user?.name || 'Lab Tech'}</p>
                            <p className="text-[10px] text-gray-500 uppercase tracking-tighter leading-tight font-medium">{user?.hospitalName || 'Medicare Lab'}</p>
                            <p className="text-[9px] text-purple-500/80 uppercase font-black tracking-widest mt-0.5">Technician</p>
                        </div>
                        <div className="w-10 h-10 rounded-full bg-gray-800 flex items-center justify-center border border-gray-700 overflow-hidden ring-2 ring-purple-500/10">
                            {user?.profileImage ? (
                                <img src={`${getBaseUrl()}/${user.profileImage}`} alt="Profile" className="w-full h-full object-cover" />
                            ) : (
                                <User size={20} className="text-gray-400" />
                            )}
                        </div>
                    </div>
                </header>

                <div className="flex-1 overflow-auto p-8">
                    {activeTab === 'settings' && (
                        <SettingsView />
                    )}
                    {activeTab === 'patients' && (
                        <>
                            <h2 className="text-2xl font-bold mb-6">Pending Lab Orders</h2>
                            
                            {loading ? (
                                <Loader message="Analyzing Lab Diagnostics" />
                            ) : filteredOrders.length === 0 ? (
                                <div className="text-center py-20 bg-[#111] rounded-2xl border border-gray-800">
                                    <ClipboardList size={48} className="mx-auto text-gray-600 mb-4" />
                                    <p className="text-gray-500">No pending lab orders.</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 gap-4">
                                    {filteredOrders.map(order => (
                                        <div key={order._id} className="bg-[#111] border border-gray-800 p-6 rounded-2xl flex items-center justify-between hover:border-purple-500/30 transition-colors">
                                            <div className="flex items-center gap-4">
                                                <div className="w-12 h-12 bg-gray-800 rounded-full flex items-center justify-center">
                                                    <User className="text-gray-400" />
                                                </div>
                                                <div>
                                                    <h3 className="font-bold text-lg">{order.patientId?.name || 'Unknown'}</h3>
                                                    <p className="text-sm text-gray-400 font-medium">Test: {order.testName}</p>
                                                    <p className="text-xs text-gray-600 mt-1">Ordered by: Dr. {order.doctorId?.name || 'Unknown'}</p>
                                                    <p className="text-[10px] text-gray-700 font-mono mt-0.5">Order ID: {order._id}</p>
                                                </div>
                                            </div>
                                            <div className="flex gap-3">
                                                <button 
                                                    onClick={() => handleUploadClick(order)}
                                                    className="bg-purple-600 hover:bg-purple-500 text-white px-6 py-2.5 rounded-xl font-medium flex items-center gap-2 transition-all shadow-lg shadow-purple-900/20"
                                                >
                                                    <Upload size={18} /> Upload Report
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </>
                    )}
                    {activeTab === 'completed' && (
                        <>
                            <h2 className="text-2xl font-bold mb-6">Completed Lab Tests</h2>
                            
                            {loading ? (
                                <Loader message="Accessing Clinical Archives" />
                            ) : filteredCompletedOrders.length === 0 ? (
                                <div className="text-center py-20 bg-[#111] rounded-2xl border border-gray-800">
                                    <CheckCircle size={48} className="mx-auto text-green-500 mb-4 opacity-50" />
                                    <p className="text-gray-500">No completed lab tests found.</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 gap-4">
                                    {filteredCompletedOrders.map(order => (
                                        <div key={order._id} className="bg-[#111] border border-gray-800 p-6 rounded-2xl flex items-center justify-between">
                                            <div className="flex items-center gap-4">
                                                <div className="w-12 h-12 bg-green-500/10 rounded-full flex items-center justify-center border border-green-500/20">
                                                    <CheckCircle className="text-green-500" size={24} />
                                                </div>
                                                <div>
                                                    <h3 className="font-bold text-lg">{order.patientId?.name || 'Unknown'}</h3>
                                                    <p className="text-sm text-gray-400 font-medium">Test: {order.testName}</p>
                                                    <p className="text-xs text-gray-600 mt-1">Ordered by: Dr. {order.doctorId?.name || 'Unknown'}</p>
                                                    <p className="text-[10px] text-gray-700 font-mono mt-0.5">Completed on: {new Date(order.date).toLocaleDateString()}</p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2 text-green-500 bg-green-500/10 px-4 py-2 rounded-xl border border-green-500/20">
                                                <CheckCircle size={18} />
                                                <span className="font-bold text-sm">Report Uploaded</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </>
                    )}
                </div>
            </main>

            {/* Upload Modal */}
            {isUploadModalOpen && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-[#111] border border-gray-800 rounded-2xl w-full max-w-lg shadow-2xl flex flex-col max-h-[90vh]">
                        <div className="p-6 border-b border-gray-800 shrink-0">
                            <h2 className="text-xl font-bold mb-1">Upload Lab Report</h2>
                            <p className="text-sm text-gray-500">For Patient: <span className="text-white font-medium">{selectedOrder?.patientId?.name}</span></p>
                            <p className="text-sm text-gray-500">Test: <span className="text-white font-medium">{selectedOrder?.testName}</span></p>
                        </div>
                        
                        <div className="p-6 overflow-y-auto">
                            <form id="upload-form" onSubmit={handleUploadSubmit} className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-400 mb-1">Test Name</label>
                                    <input 
                                        type="text" 
                                        readOnly
                                        value={reportForm.testName}
                                        className="w-full bg-[#1a1a1a] border border-gray-800 rounded-lg px-4 py-2.5 text-gray-400"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-400 mb-1">Test Result</label>
                                    <input 
                                        type="text" 
                                        required
                                        placeholder="e.g., High sugar level, Normal, etc."
                                        value={reportForm.result}
                                        onChange={e => setReportForm({...reportForm, result: e.target.value})}
                                        className="w-full bg-[#1a1a1a] border border-gray-800 rounded-lg px-4 py-2.5 focus:outline-none focus:border-purple-500 text-white"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-400 mb-1">Upload PDF/Image</label>
                                    <div className="border-2 border-dashed border-gray-800 rounded-xl p-8 text-center hover:border-purple-500/50 transition-colors bg-[#1a1a1a]">
                                        <input 
                                            type="file" 
                                            required
                                            id="report-file"
                                            className="hidden" 
                                            onChange={handleFileChange}
                                            accept=".pdf,image/*"
                                        />
                                        <label htmlFor="report-file" className="cursor-pointer flex flex-col items-center gap-2">
                                            <Upload className="text-purple-500" size={32} />
                                            <span className="text-sm text-gray-300 font-medium">
                                                {reportFile ? reportFile.name : "Click to select file"}
                                            </span>
                                            <span className="text-xs text-gray-600">PDF, PNG, JPG up to 10MB</span>
                                        </label>
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-400 mb-1">Technician Notes</label>
                                    <textarea 
                                        className="w-full bg-[#1a1a1a] border border-gray-800 rounded-lg px-4 py-2.5 focus:outline-none focus:border-purple-500 min-h-[80px]"
                                        placeholder="Additional observations..."
                                        value={reportForm.notes}
                                        onChange={e => setReportForm({...reportForm, notes: e.target.value})}
                                    />
                                </div>
                            </form>
                        </div>

                        <div className="p-6 border-t border-gray-800 shrink-0 flex justify-end gap-3 bg-[#111] rounded-b-2xl">
                            <button 
                                type="button"
                                onClick={() => setIsUploadModalOpen(false)}
                                className="px-4 py-2 rounded-lg text-sm font-medium text-gray-400 hover:text-white transition-colors"
                            >
                                Cancel
                            </button>
                            <button 
                                type="submit"
                                form="upload-form"
                                className="bg-purple-600 hover:bg-purple-500 text-white px-6 py-2 rounded-lg text-sm font-bold transition-colors"
                            >
                                Submit Report
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

const NavItem = ({ icon: Icon, label, active, onClick }) => (
    <button
        onClick={onClick}
        className={`w-full flex items-center gap-3 p-3 rounded-xl transition-colors ${active
            ? 'bg-purple-600 text-white font-bold shadow-lg shadow-purple-900/20'
            : 'text-gray-400 hover:text-white hover:bg-gray-800'
            }`}
    >
        <Icon size={20} />
        <span className="text-sm">{label}</span>
    </button>
);

export default LabTechnicianDashboard;

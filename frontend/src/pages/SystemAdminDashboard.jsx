import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import {
    ShieldCheck, Users, FileText, Activity, Database, LayoutGrid, Settings, LogOut, Loader2, Search, Edit2, Check, X, AlertTriangle, Zap, User, Plus, Building2, UserCog, UserCheck, Volume2
} from 'lucide-react';
import { fetchAnalytics, fetchUsers, updateUserRole, fetchAuditLogs, fetchBlockchainStatus, syncAllBlockchainRecords, createHospitalAdmin } from '../services/adminApi';
import socket from '../services/socket';
import SettingsView from '../components/ui/SettingsView';
import NotificationBell from '../components/ui/NotificationBell';
import NotificationSoundsManager from '../components/admin/NotificationSoundsManager';
import { useSocketNotifications } from '../hooks/useSocketNotifications';
import { getBaseUrl } from '../services/userApi';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell
} from 'recharts';
import UniversalSearchBar from '../components/ui/UniversalSearchBar';
import Loader from '../components/ui/Loader';

import { useLocation } from 'react-router-dom';

const SystemAdminDashboard = () => {
    const { user, logout } = useAuth();
    const [notificationCount, resetNotifications, , notifications, markNotificationRead] = useSocketNotifications({ userId: user?.id, hospitalName: user?.hospitalName, notificationPrefs: user?.notificationPreferences });
    const [activeView, setActiveView] = useState('dashboard');
    const location = useLocation();
    
    const isSuperAdmin = true;

    useEffect(() => {
        const params = new URLSearchParams(location.search);
        const tab = params.get('tab');
        if (tab) {
            setActiveView(tab);
        }
    }, [location]);

    const renderContent = () => {
        switch (activeView) {
            case 'dashboard':
                return <DashboardView user={user} />;
            
            case 'users':
                return <UsersView isSuperAdmin={isSuperAdmin} />;
            
            case 'audit':
                return <AuditLogsView isSuperAdmin={isSuperAdmin} />;
            case 'blockchain':
                return <BlockchainView isSuperAdmin={isSuperAdmin} />;
            case 'notificationSounds':
                return <NotificationSoundsManager />;
            case 'settings':
                return <SettingsView />;
            default:
                return <DashboardView user={user} />;
        }
    };

    return (
        <div className="flex h-screen bg-[#0a0a0a] text-white font-sans overflow-hidden">
            {/* Sidebar */}
            <aside className="w-64 border-r border-gray-800 flex flex-col bg-[#0f1110]">
                <div className="p-6 flex items-center gap-3">
                    <div className="bg-red-500 p-1.5 rounded-lg shadow-sm">
                        <ShieldCheck className="w-5 h-5 text-white" />
                    </div>
                    <div>
                        <h1 className="font-bold text-lg tracking-tight">MediCare</h1>
                        <p className="text-[10px] text-gray-500 uppercase tracking-wider">
                            {isSuperAdmin ? 'System Admin' : `${user?.hospitalName || 'Hospital'} Admin`}
                        </p>
                    </div>
                </div>

                <nav className="flex-1 px-4 space-y-2 mt-4">
                    
                            <NavItem icon={LayoutGrid} label="System Dashboard" active={activeView === 'dashboard'} onClick={() => setActiveView('dashboard')} />
                            <NavItem icon={Users} label="Hospitals & Admins" active={activeView === 'users'} onClick={() => setActiveView('users')} />
                            <NavItem icon={Activity} label="System Audit Logs" active={activeView === 'audit'} onClick={() => setActiveView('audit')} />
                            <NavItem icon={Database} label="Blockchain Monitor" active={activeView === 'blockchain'} onClick={() => setActiveView('blockchain')} />
                            <NavItem icon={Volume2} label="Notification Sounds" active={activeView === 'notificationSounds'} onClick={() => setActiveView('notificationSounds')} />
                        
                </nav>

                <div className="p-4 mt-auto space-y-2">
                    <NavItem icon={Settings} label="Settings" active={activeView === 'settings'} onClick={() => setActiveView('settings')} />
                    <NavItem icon={LogOut} label="Logout" onClick={logout} />
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 flex flex-col overflow-hidden">
                <header className="h-16 border-b border-gray-800 flex items-center justify-between px-8 bg-[#0a0a0a]">
                    <div className="flex items-center gap-6 flex-1 max-w-3xl">
                        <div className="flex items-center gap-2 text-sm text-red-500 font-medium whitespace-nowrap">
                            <ShieldCheck size={16} /> <span className="hidden lg:inline">System Health: Blockchain Active</span>
                        </div>
                        <UniversalSearchBar />
                    </div>
                    <div className="flex items-center gap-4">
                        <NotificationBell count={notificationCount} notifications={notifications} onClick={resetNotifications} onMarkRead={markNotificationRead} />
                        <div className="flex items-center gap-3">
                            <div className="text-right hidden sm:block">
                                <p className="text-sm font-bold text-white">{user?.name}</p>
                                <p className="text-[10px] text-gray-500 uppercase">{user?.role}</p>
                            </div>
                            <div className="w-10 h-10 rounded-full bg-gray-800 border border-gray-700 flex items-center justify-center overflow-hidden">
                                {user?.profileImage ? (
                                    <img src={`${getBaseUrl()}/${user.profileImage}`} alt="Profile" className="w-full h-full object-cover" />
                                ) : (
                                    <User size={20} className="text-gray-400" />
                                ) }
                            </div>
                        </div>
                    </div>
                </header>
                <div className="flex-1 overflow-y-auto p-8">
                    {renderContent()}
                </div>
            </main>
        </div>
    );
};

const DashboardView = ({ user }) => {
    const [analytics, setAnalytics] = useState(null);
    const [loading, setLoading] = useState(true);
    const [lastUpdated, setLastUpdated] = useState(null);

    useEffect(() => {
        const load = async () => {
            try {
                const res = await fetchAnalytics();
                if (res.success) setAnalytics(res.data);
            } catch (err) {
                console.error(err);
            } finally {
                setLoading(false);
                setLastUpdated(new Date());
            }
        };
        load();
        
        socket.connect();
        const events = [
            'appointment-updated',
            'appointment-approved',
            'prescription-created',
            'user-registered',
            'new-pharmacy-order',
            'pharmacy-order-updated',
            'delivery-assigned',
            'delivery-status-updated'
        ];
        const refresh = () => {
            load();
        };
        events.forEach(ev => socket.on(ev, refresh));
        return () => {
            events.forEach(ev => socket.off(ev, refresh));
        };
    }, []);

    if (loading) return <Loader message="Analyzing Global Health Infrastructure" />;

    const appointmentData = analytics?.appointmentsPerMonth?.map(m => ({
        month: `Month ${m._id}`,
        appointments: m.count
    })) || [];

    const doctorData = analytics?.doctorPerformance?.map(d => ({
        name: d.name,
        appointments: d.count
    })) || [];

    const statusData = [
        { name: 'Approved', value: analytics?.approvedAppointments || 0 },
        { name: 'Pending', value: analytics?.pendingAppointments || 0 },
    ];
    const COLORS = ['#10b981', '#f59e0b'];

    return (
        <>
            <header className="flex justify-between items-center mb-8">
                <div>
                    <h2 className="text-3xl font-bold">Admin Analytics</h2>
                    <p className="text-gray-400">System performance and user statistics</p>
                </div>
                <div className="flex items-center gap-4">
                    {lastUpdated && (
                        <span className="text-xs text-gray-500">
                            Live • Updated {lastUpdated.toLocaleTimeString()}
                        </span>
                    )}
                </div>
            </header>

            {/* Stat Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                <StatCard icon={Building2} title="Partner Hospitals" value={analytics?.totalHospitals} color="text-emerald-500" bg="bg-emerald-500/10" />
                <StatCard icon={UserCog} title="System Doctors" value={analytics?.totalDoctors} color="text-blue-500" bg="bg-blue-500/10" />
                <StatCard icon={Users} title="Global Patients" value={analytics?.totalPatients} color="text-purple-500" bg="bg-purple-500/10" />
                <StatCard icon={UserCheck} title="Global Pending Approvals" value={analytics?.pendingStaffApprovals} color="text-yellow-500" bg="bg-yellow-500/10" />
            </div>

            {/* Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
                <div className="bg-[#111] border border-gray-800 rounded-2xl p-6">
                    <h3 className="text-xl font-bold mb-6">Appointments Trend</h3>
                    <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={appointmentData}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                                <XAxis dataKey="month" stroke="#666" />
                                <YAxis stroke="#666" />
                                <Tooltip contentStyle={{ backgroundColor: '#111', border: '1px solid #333' }} />
                                <Line type="monotone" dataKey="appointments" stroke="#10b981" strokeWidth={2} />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                <div className="bg-[#111] border border-gray-800 rounded-2xl p-6">
                    <h3 className="text-xl font-bold mb-6">Top Doctors Performance</h3>
                    <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={doctorData} layout="vertical">
                                <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                                <XAxis type="number" stroke="#666" />
                                <YAxis dataKey="name" type="category" width={100} stroke="#666" />
                                <Tooltip contentStyle={{ backgroundColor: '#111', border: '1px solid #333' }} />
                                <Bar dataKey="appointments" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="bg-[#111] border border-gray-800 rounded-2xl p-6">
                    <h3 className="text-xl font-bold mb-6">Appointment Status</h3>
                    <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={statusData}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={60}
                                    outerRadius={80}
                                    fill="#8884d8"
                                    paddingAngle={5}
                                    dataKey="value"
                                >
                                    {statusData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                    ))}
                                </Pie>
                                <Tooltip contentStyle={{ backgroundColor: '#111', border: '1px solid #333' }} />
                                <Legend />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                </div>
                
                <div className="lg:col-span-2 bg-[#111] border border-gray-800 rounded-2xl p-6 flex flex-col justify-center items-center text-center">
                     <Activity size={48} className="text-gray-600 mb-4" />
                     <h3 className="text-xl font-bold text-gray-300">System Health Healthy</h3>
                     <p className="text-gray-500 mt-2">All services operational. Blockchain sync active.</p>
                </div>
            </div>
        </>
    );
};

const UsersView = ({ isSuperAdmin }) => {
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [roleFilter, setRoleFilter] = useState('all');
    const [editingUser, setEditingUser] = useState(null);
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

    useEffect(() => {
        loadUsers();
    }, []);

    const loadUsers = async () => {
        try {
            setLoading(true);
            const res = await fetchUsers();
            if (res.success) setUsers(res.data);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handleRoleUpdate = async (userId, newRole) => {
        try {
            const res = await updateUserRole(userId, newRole);
            if (res.success) {
                setUsers(users.map(u => u._id === userId ? res.data : u));
                setEditingUser(null);
            }
        } catch (err) {
            console.error(err);
            alert("Failed to update role");
        }
    };

    const filteredUsers = users.filter(user => {
        // For System Admin, only show Hospital Admins (role: 'admin')
        if (isSuperAdmin && user.role !== 'admin') return false;

        const matchesSearch = 
            user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (user.hospitalName && user.hospitalName.toLowerCase().includes(searchTerm.toLowerCase()));
        
        const matchesRole = roleFilter === 'all' || user.role === roleFilter;

        return matchesSearch && matchesRole;
    });

    if (loading) return <Loader message="Accessing Global User Directory" />;

    return (
        <div>
            <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
                <h2 className="text-2xl font-bold">{isSuperAdmin ? 'Hospitals & Admins' : 'Staff Management'}</h2>
                <div className="flex items-center gap-4 w-full md:w-auto">
                    {isSuperAdmin && (
                        <button 
                            onClick={() => setIsCreateModalOpen(true)}
                            className="bg-green-600 hover:bg-green-500 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-colors"
                        >
                            <Plus size={16} /> Create Hospital Admin
                        </button>
                    )}
                    <div className="relative flex-1 md:flex-none">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
                        <input 
                            type="text" 
                            placeholder="Search users..." 
                            className="w-full md:w-64 bg-[#111] border border-gray-800 rounded-lg pl-10 pr-4 py-2 text-sm focus:outline-none focus:border-green-500"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>
            </div>

            <div className="bg-[#111] border border-gray-800 rounded-xl overflow-hidden">
                <table className="w-full text-left">
                    <thead className="bg-[#1a1a1a] text-gray-400 text-sm">
                        <tr>
                            <th className="p-4 w-16">Sl No.</th>
                            <th className="p-4">Name</th>
                            <th className="p-4">Role</th>
                            <th className="p-4">Details</th>
                            <th className="p-4">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800">
                        {filteredUsers.map((user, idx) => (
                            <tr key={user._id} className="hover:bg-white/[0.02]">
                                <td className="p-4 text-gray-500 font-mono text-sm">
                                    {idx + 1}
                                </td>
                                <td className="p-4">
                                    <div className="font-medium">{user.name}</div>
                                    <div className="text-xs text-gray-500">{user.email}</div>
                                </td>
                                <td className="p-4">
                                    {editingUser === user._id ? (
                                        <select 
                                            className="bg-black border border-gray-700 rounded px-2 py-1 text-sm"
                                            defaultValue={user.role}
                                            onChange={(e) => handleRoleUpdate(user._id, e.target.value)}
                                        >
                                            {['admin', 'doctor', 'patient', 'pharmacist', 'delivery'].map(role => (
                                                <option key={role} value={role}>{role}</option>
                                            ))}
                                        </select>
                                    ) : (
                                        <span className={`px-2 py-1 rounded text-xs font-bold uppercase ${
                                            user.role === 'admin' ? 'bg-red-500/20 text-red-500' :
                                            user.role === 'doctor' ? 'bg-blue-500/20 text-blue-500' :
                                            user.role === 'patient' ? 'bg-green-500/20 text-green-500' :
                                            'bg-gray-500/20 text-gray-500'
                                        }`}>
                                            {user.role}
                                        </span>
                                    )}
                                </td>
                                <td className="p-4 text-sm text-gray-400">
                                    {(user.role === 'doctor' || user.role === 'admin') && user.hospitalName && (
                                        <div className="flex flex-col gap-1">
                                            <div className="flex items-center gap-2">
                                                <span className="text-blue-400">🏥</span> {user.hospitalName}
                                            </div>
                                            {user.hospitalAddress && (
                                                <div className="text-xs text-gray-500 flex items-center gap-2">
                                                    <span>📍</span> {user.hospitalAddress}
                                                </div>
                                            )}
                                            {user.phone && (
                                                <div className="text-xs text-gray-500 flex items-center gap-2">
                                                    <span>📞</span> {user.phone}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                    {user.role === 'doctor' && user.specialization && (
                                        <div className="text-xs text-gray-500 mt-1">
                                            {user.specialization}
                                        </div>
                                    )}
                                    {user.role === 'pharmacist' && user.pharmacyName && (
                                        <div className="flex items-center gap-2">
                                            <span className="text-purple-400">💊</span> {user.pharmacyName}
                                        </div>
                                    )}
                                    {user.role === 'patient' && user.bloodGroup && (
                                        <div className="flex items-center gap-2">
                                            <span className="text-red-400">🩸</span> {user.bloodGroup}
                                        </div>
                                    )}
                                </td>
                                <td className="p-4">
                                    {editingUser === user._id ? (
                                        <button onClick={() => setEditingUser(null)} className="text-gray-400 hover:text-white">
                                            <X size={18} />
                                        </button>
                                    ) : (
                                        user.role !== 'patient' && (
                                            <button onClick={() => setEditingUser(user._id)} className="text-gray-400 hover:text-white">
                                                <Edit2 size={18} />
                                            </button>
                                        )
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                {filteredUsers.length === 0 && (
                    <div className="p-8 text-center text-gray-500">No users found matching your search.</div>
                )}
            </div>

            {isCreateModalOpen && (
                <CreateHospitalAdminModal 
                    onClose={() => setIsCreateModalOpen(false)} 
                    onSuccess={() => {
                        setIsCreateModalOpen(false);
                        loadUsers();
                    }} 
                />
            )}
        </div>
    );
};

const CreateHospitalAdminModal = ({ onClose, onSuccess }) => {
    const [formData, setFormData] = useState({
        name: '',
        email: '',
        password: '',
        hospitalName: '',
        hospitalAddress: '',
        phone: ''
    });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        try {
            const res = await createHospitalAdmin(formData);
            if (res.success) {
                onSuccess();
            } else {
                setError(res.message || 'Failed to create hospital admin');
            }
        } catch (err) {
            console.error(err);
            setError(err.response?.data?.message || 'Server error occurred');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-[#111] border border-gray-800 rounded-2xl w-full max-w-md shadow-2xl">
                <div className="p-6 border-b border-gray-800 flex justify-between items-center">
                    <h2 className="text-xl font-bold flex items-center gap-2">
                        <Plus className="text-green-500" /> Create Hospital Admin
                    </h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
                        <X size={20} />
                    </button>
                </div>
                
                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    {error && (
                        <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-500 text-sm rounded-lg flex items-center gap-2">
                            <AlertTriangle size={16} /> {error}
                        </div>
                    )}
                    
                    <div>
                        <label className="block text-xs font-bold text-gray-500 mb-1 uppercase">Admin Name</label>
                        <input
                            type="text"
                            required
                            value={formData.name}
                            onChange={(e) => setFormData(prev => ({...prev, name: e.target.value}))}
                            className="w-full bg-black border border-gray-800 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-green-500"
                            placeholder="John Doe"
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-gray-500 mb-1 uppercase">Email Address</label>
                        <input
                            type="email"
                            required
                            value={formData.email}
                            onChange={(e) => setFormData(prev => ({...prev, email: e.target.value}))}
                            className="w-full bg-black border border-gray-800 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-green-500"
                            placeholder="admin@hospital.com"
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-gray-500 mb-1 uppercase">Password</label>
                        <input
                            type="password"
                            required
                            value={formData.password}
                            onChange={(e) => setFormData(prev => ({...prev, password: e.target.value}))}
                            className="w-full bg-black border border-gray-800 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-green-500"
                            placeholder="Secure password"
                            minLength={6}
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-gray-500 mb-1 uppercase">Hospital Name</label>
                        <input
                            type="text"
                            required
                            value={formData.hospitalName}
                            onChange={(e) => setFormData(prev => ({...prev, hospitalName: e.target.value}))}
                            className="w-full bg-black border border-gray-800 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-green-500"
                            placeholder="e.g. City General Hospital"
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-gray-500 mb-1 uppercase">Hospital Address</label>
                        <input
                            type="text"
                            required
                            value={formData.hospitalAddress}
                            onChange={(e) => setFormData(prev => ({...prev, hospitalAddress: e.target.value}))}
                            className="w-full bg-black border border-gray-800 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-green-500"
                            placeholder="123 Health Ave, City"
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-gray-500 mb-1 uppercase">Contact Number</label>
                        <input
                            type="tel"
                            required
                            value={formData.phone}
                            onChange={(e) => setFormData(prev => ({...prev, phone: e.target.value}))}
                            className="w-full bg-black border border-gray-800 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-green-500"
                            placeholder="+1 234 567 8900"
                        />
                    </div>

                    <div className="pt-4 flex gap-3">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 px-4 py-2 border border-gray-800 text-gray-300 rounded-lg hover:bg-gray-800 transition-colors font-medium"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={loading}
                            className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg transition-colors font-bold flex justify-center items-center"
                        >
                            {loading ? <Loader2 size={18} className="animate-spin" /> : 'Create Admin'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

const AuditLogsView = ({ isSuperAdmin }) => {
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [actionFilter, setActionFilter] = useState('all');

    useEffect(() => {
        const load = async () => {
            try {
                const res = await fetchAuditLogs();
                if (res.success) setLogs(res.data);
            } catch (err) {
                console.error(err);
            } finally {
                setLoading(false);
            }
        };
        load();
    }, []);

    const uniqueActions = ['all', ...new Set(logs.map(log => log.action))];
    const filteredLogs = actionFilter === 'all' 
        ? logs 
        : logs.filter(log => log.action === actionFilter);

    if (loading) return <Loader message="Decrypting System Audit Trails" />;

    return (
        <div>
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold">{isSuperAdmin ? 'System Audit Logs' : 'Hospital Audit Logs'}</h2>
                <div className="flex items-center gap-3">
                    <span className="text-xs font-bold text-gray-500 uppercase tracking-widest">Filter by Action:</span>
                    <select 
                        className="bg-[#111] border border-gray-800 rounded-xl px-4 py-2 text-sm text-gray-300 outline-none focus:border-green-500 transition-all cursor-pointer"
                        value={actionFilter}
                        onChange={(e) => setActionFilter(e.target.value)}
                    >
                        {uniqueActions.map(action => (
                            <option key={action} value={action}>
                                {action === 'all' ? 'All Actions' : action.replace(/_/g, ' ')}
                            </option>
                        ))}
                    </select>
                </div>
            </div>
            <div className="bg-[#111] border border-gray-800 rounded-xl overflow-hidden">
                <table className="w-full text-left">
                    <thead className="bg-[#1a1a1a] text-gray-400 text-sm">
                        <tr>
                            <th className="p-4 w-16">Sl No.</th>
                            <th className="p-4">Timestamp</th>
                            <th className="p-4">User</th>
                            <th className="p-4">Action</th>
                            <th className="p-4">Module</th>
                            <th className="p-4">IP Address</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800">
                        {filteredLogs.map((log, idx) => (
                            <tr key={log._id} className="hover:bg-white/[0.02]">
                                <td className="p-4 text-gray-500 font-mono text-sm">
                                    {idx + 1}
                                </td>
                                <td className="p-4 text-gray-400 text-sm">
                                    {new Date(log.timestamp).toLocaleString()}
                                </td>
                                <td className="p-4">
                                    <div className="font-medium">{log.userId?.name || 'Unknown'}</div>
                                    <div className="text-xs text-gray-500">{log.userId?.email}</div>
                                </td>
                                <td className="p-4">
                                    <span className="font-mono text-sm">{log.action}</span>
                                    {log.details?.method === 'QR_CODE_SCAN' && (
                                        <div className="mt-1 flex items-center gap-1">
                                            <span className="text-[10px] text-green-500 uppercase tracking-widest font-bold">QR Access</span>
                                            <span className="text-[10px] text-gray-500">Patient: {log.details.patientName}</span>
                                        </div>
                                    )}
                                    {log.details?.patientName && log.action !== 'QR_CODE_SCAN' && (
                                        <div className="mt-1 flex items-center gap-1">
                                            <span className="text-[10px] text-gray-400 bg-white/5 px-1.5 py-0.5 rounded border border-white/5">
                                                Patient: <span className="text-white">{log.details.patientName}</span>
                                            </span>
                                        </div>
                                    )}
                                    {!log.details?.patientName && ['UPLOAD_LAB_REPORT', 'CREATE_LAB_ORDER', 'UPDATE_PHARMACY_STATUS', 'CREATE_PRESCRIPTION', 'CREATE_MEDICAL_RECORD'].includes(log.action) && (
                                        <div className="mt-1 flex items-center gap-1 text-[10px] text-gray-600 italic">
                                            Patient info missing (old log)
                                        </div>
                                    )}
                                </td>
                                <td className="p-4">
                                    <span className="bg-gray-800 text-gray-300 px-2 py-1 rounded text-xs">{log.module}</span>
                                </td>
                                <td className="p-4 text-gray-500 text-sm font-mono">{log.ipAddress}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                {filteredLogs.length === 0 && (
                    <div className="p-8 text-center text-gray-500">No audit logs found.</div>
                )}
            </div>
        </div>
    );
};

const BlockchainView = ({ isSuperAdmin }) => {
    const [data, setData] = useState(null);
    const [hospitals, setHospitals] = useState([]);
    const [loading, setLoading] = useState(true);

    const loadData = async () => {
        try {
            const [statusRes, usersRes] = await Promise.all([
                fetchBlockchainStatus(),
                fetchUsers()
            ]);
            
            if (statusRes.success && usersRes.success) {
                setData(statusRes.data);
                
                const txs = statusRes.data.transactions;
                const usersList = usersRes.data;

                // Map doctor name to hospital name
                const doctorToHospital = {};
                usersList.forEach(u => {
                    if (u.role === 'doctor' && u.hospitalName) {
                        doctorToHospital[u.name] = u.hospitalName;
                    }
                });

                // Get all unique hospitals
                const hospitalStats = {};
                usersList.forEach(u => {
                    if (u.hospitalName) {
                        if (!hospitalStats[u.hospitalName]) {
                            hospitalStats[u.hospitalName] = { name: u.hospitalName, totalGas: 0, hasGas: false };
                        }
                    }
                });

                // Add gas from recent transactions
                txs.forEach(tx => {
                    const hName = doctorToHospital[tx.doctorName];
                    if (hName && hospitalStats[hName]) {
                        if (tx.gasUsed && tx.gasUsed !== 'N/A') {
                            hospitalStats[hName].totalGas += Number(tx.gasUsed);
                            hospitalStats[hName].hasGas = true;
                        }
                    }
                });

                setHospitals(Object.values(hospitalStats));
            }
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handleSyncAll = async () => {
        setLoading(true);
        try {
            const res = await syncAllBlockchainRecords();
            if (res.success) {
                loadData();
            }
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
        
        // Setup Socket for Real-time Updates
        socket.connect();
        socket.on('blockchain-record-verified', () => {
            loadData();
        });

        const interval = setInterval(loadData, 30000); // Pulse every 30s as fallback
        return () => {
            clearInterval(interval);
            socket.off('blockchain-record-verified');
        };
    }, []);

    if (loading) return <Loader message="Synchronizing Blockchain Ledger" />;

    return (
        <div className="space-y-8">
            <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h2 className="text-2xl font-bold flex items-center gap-2">
                        <Database className="text-blue-500" /> {isSuperAdmin ? 'Blockchain Network Monitor' : 'Hospital Blockchain Monitor'}
                    </h2>
                    <p className="text-gray-400 mt-1">Real-time ledger audit and gas consumption metrics</p>
                </div>
                <div className="flex flex-wrap gap-3">
                    <button 
                        onClick={handleSyncAll}
                        disabled={loading}
                        className="bg-yellow-500 hover:bg-yellow-400 text-black px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-lg shadow-yellow-900/40 flex items-center gap-2 disabled:opacity-50"
                    >
                        <ShieldCheck size={14} /> Sync All Records
                    </button>
                    <button onClick={loadData} className="px-4 py-2 bg-gray-800 border border-gray-700 rounded-xl text-xs font-bold hover:bg-gray-700 transition-colors">Refresh</button>
                </div>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-[#111] border border-gray-800 p-6 rounded-2xl">
                    <div className="text-sm text-gray-500 mb-1">Network Status</div>
                    <div className="text-green-500 font-bold flex items-center gap-2 text-xl">
                        Active
                    </div>
                </div>
                <div className="bg-[#111] border border-gray-800 p-6 rounded-2xl">
                    <div className="text-sm text-gray-500 mb-1">Latest Block</div>
                    <div className="text-white font-mono font-bold text-xl">#{data?.blockNumber?.toLocaleString() || '---'}</div>
                </div>
                <div className="bg-[#111] border border-gray-800 p-6 rounded-2xl">
                    <div className="text-sm text-gray-500 mb-1">Verification Load</div>
                    <div className="text-blue-400 font-bold text-xl">{data?.transactions?.length || 0} Recent Ops</div>
                </div>
            </div>

            <div className="bg-[#111] border border-gray-800 rounded-2xl overflow-hidden shadow-2xl">
                <div className="px-6 py-4 border-b border-gray-800 bg-gray-800/20 flex justify-between items-center">
                    <h3 className="font-bold">Hospital Network Gas Consumption</h3>
                    <span className="text-[10px] text-gray-500 font-mono uppercase tracking-widest">Secure Ledger</span>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead className="bg-[#1a1a1a] text-gray-400 text-[10px] uppercase tracking-wider">
                            <tr>
                                <th className="p-4 w-16">Sl No.</th>
                                <th className="p-4">Hospital Name</th>
                                <th className="p-4 text-right px-8">Gas Used</th>
                                <th className="p-4">Status</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-800">
                            {hospitals.map((hospital, idx) => (
                                <tr key={idx} className="hover:bg-white/[0.02] transition-colors group">
                                    <td className="p-4 text-gray-500 font-mono text-sm">
                                        {idx + 1}
                                    </td>
                                    <td className="p-4">
                                        <span className="text-white font-medium flex items-center gap-1.5">
                                            🏥 {hospital.name}
                                        </span>
                                    </td>
                                    <td className="p-4 text-right font-mono font-bold px-8">
                                        <div className="flex flex-col items-end">
                                            <span className={!hospital.hasGas ? 'text-gray-600' : 'text-green-500'}>
                                                {hospital.hasGas ? hospital.totalGas : 'NULL'}
                                            </span>
                                            {hospital.hasGas && (
                                                <span className="text-[8px] text-gray-600 uppercase tracking-tighter">Units</span>
                                            )}
                                        </div>
                                    </td>
                                    <td className="p-4">
                                        <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase ${
                                            hospital.hasGas ? 'bg-green-500/10 text-green-500' : 'bg-gray-500/10 text-gray-500'
                                        }`}>
                                            {hospital.hasGas ? 'Active' : 'No Activity'}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                            {hospitals.length === 0 && (
                                <tr>
                                    <td colSpan="4" className="p-12 text-center text-gray-500">
                                        No hospital data found.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
                <div className="p-4 bg-black/40 border-t border-gray-800 flex items-center justify-between gap-2 px-8">
                    <div className="flex items-center gap-2">
                        <ShieldCheck size={14} className="text-gray-500" />
                        <span className="text-xs text-gray-500">All medical records are SHA-256 hashed before on-chain deployment.</span>
                    </div>
                    <div className="flex gap-3">
                         <button className="text-[10px] text-blue-500 hover:underline">Download Audit CSV</button>
                         <button className="text-[10px] text-gray-500 hover:underline">Network Config</button>
                    </div>
                </div>
            </div>
        </div>
    );
};

const NavItem = ({ icon: Icon, label, active, badge, onClick }) => (
    <button
        onClick={onClick}
        className={`w-full flex items-center justify-between p-3 rounded-xl transition-colors ${active
            ? 'bg-red-500/10 text-red-500 font-bold border border-red-500/20'
            : 'text-gray-400 hover:text-white hover:bg-gray-800'
            }`}
    >
        <div className="flex items-center gap-3"><Icon size={20} /><span className="text-sm">{label}</span></div>
        {badge && (
            <span className="text-[10px] font-bold bg-green-500 text-black px-1.5 py-0.5 rounded-full">{badge}</span>
        )}
    </button>
);

const StatCard = ({ icon: Icon, title, value, color, bg }) => (
    <div className="bg-[#111] border border-gray-800 rounded-2xl p-6">
        <div className="flex justify-between items-start mb-4">
            <div className={`p-3 rounded-xl ${bg}`}><Icon className={`w-6 h-6 ${color}`} /></div>
        </div>
        <p className="text-gray-400 text-sm font-medium mb-1">{title}</p>
        <h3 className="text-3xl font-bold truncate">{value}</h3>
    </div>
);

export default SystemAdminDashboard;

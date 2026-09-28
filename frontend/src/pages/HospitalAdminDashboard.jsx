import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
    Activity,
    Building2,
    Database,
    FileCheck2,
    LayoutGrid,
    Loader2,
    LogOut,
    RefreshCw,
    Settings,
    Shield,
    UserCog,
    ArrowRightLeft,
    UserPlus,
    UserRound,
    Users,
    CreditCard,
    CheckCircle,
    X,
    FileText,
    Download,
    Eye,
    Award,
    FileSignature,
    TrendingUp,
    IndianRupee,
    PieChart as PieChartIcon,
    BarChart3,
    ActivitySquare,
    Volume2
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    AreaChart,
    Area,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    PieChart,
    Pie,
    Cell,
    BarChart,
    Bar,
    RadialBarChart,
    RadialBar,
    Legend
} from 'recharts';
import {
    approvePendingUser,
    fetchAnalytics,
    fetchAuditLogs,
    fetchBlockchainStatus,
    fetchPendingApprovals,
    fetchUsers,
    rejectPendingUser,
    syncAllBlockchainRecords,
    updateUserRole,
    searchPatientsForAdmission,
    admitPatient,
    changePatientWard,
    fetchAdmittedPatients,
    fetchBillPreview,
    dischargePatient,
    fetchBillingHistory,
    markBillAsPaid,
} from '../services/adminApi';
import { getBaseUrl, updateProfile } from '../services/userApi';
import Loader from '../components/ui/Loader';
import SettingsView from '../components/ui/SettingsView';
import HospitalInsuranceView from '../components/admin/HospitalInsuranceView';
import NotificationSoundsManager from '../components/admin/NotificationSoundsManager';
import socket from '../services/socket';
import NotificationBell from '../components/ui/NotificationBell';
import { useSocketNotifications } from '../hooks/useSocketNotifications';

const ROLE_OPTIONS = ['doctor', 'pharmacist', 'lab_technician', 'delivery'];

const formatDateTime = (value) => {
    if (!value) return 'Not available';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Not available';
    return date.toLocaleString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
    });
};

const titleMap = {
    dashboard: {
        title: 'Hospital Operations',
        subtitle: 'Monitor staff, admitted patients, and daily hospital activity from one place.',
    },
    users: {
        title: 'Hospital Users',
        subtitle: 'View staff and patients connected to this hospital.',
    },
    approvals: {
        title: 'Pending Approvals',
        subtitle: 'Approve or reject newly registered staff accounts for this hospital.',
    },
    admitted: {
        title: 'Admitted Patients',
        subtitle: 'Manage currently admitted patients and handle discharge with final billing.',
    },
    billing: {
        title: 'Hospital Billing',
        subtitle: 'Review generated bills for discharged patients.',
    },
    insurance: {
        title: 'Patient Insurance',
        subtitle: 'Review insurance details only for patients admitted to this hospital.',
    },
    admit: {
        title: 'Admit Patient',
        subtitle: 'Search registered patients and admit them to hospital wards.',
    },
    audit: {
        title: 'Audit Logs',
        subtitle: 'Track recent actions taken inside this hospital environment.',
    },
    blockchain: {
        title: 'Blockchain Status',
        subtitle: 'Review verification status for hospital records and lab transactions.',
    },
    notificationSounds: {
        title: 'Notification Sounds',
        subtitle: 'Upload, assign and manage custom audio alerts for real-time events in this hospital.',
    },
    settings: {
        title: 'Settings',
        subtitle: 'Update hospital admin preferences and profile details.',
    },
};

const HospitalAdminDashboard = () => {
    const { user, logout } = useAuth();
    const [notificationCount, resetNotifications, , notifications, markNotificationRead] = useSocketNotifications({ userId: user?.id, hospitalName: user?.hospitalName, notificationPrefs: user?.notificationPreferences });
    const location = useLocation();
    const [activeView, setActiveView] = useState('dashboard');

    useEffect(() => {
        const tab = new URLSearchParams(location.search).get('tab');
        if (tab && titleMap[tab]) {
            setActiveView(tab);
        }
    }, [location.search]);

    const header = titleMap[activeView] || titleMap.dashboard;
    const profileUrl = user?.profileImage ? `${getBaseUrl()}/${user.profileImage}` : null;

    return (
        <div className="flex min-h-screen bg-[#05070a] text-white selection:bg-emerald-500/30">
            {/* Sidebar with Glassmorphism */}
            <aside className="hidden w-72 shrink-0 border-r border-white/5 bg-[#0a0c12]/80 backdrop-blur-xl lg:flex lg:flex-col lg:fixed lg:inset-y-0 lg:left-0 z-50">
                <div className="border-b border-white/5 px-6 py-8">
                    <div className="flex items-center gap-4">
                        <div className="relative group">
                            <div className="absolute -inset-2 rounded-2xl bg-emerald-500/20 blur opacity-0 group-hover:opacity-100 transition duration-500" />
                            <div className="relative rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-emerald-400">
                                <Building2 size={24} strokeWidth={2.5} />
                            </div>
                        </div>
                        <div>
                            <p className="text-[10px] font-black uppercase tracking-[0.4em] text-emerald-500/60">MediCare</p>
                            <h1 className="mt-0.5 text-lg font-black tracking-tight">{user?.hospitalName?.split(' ')[0] || 'Hospital'} <span className="text-emerald-500">Admin</span></h1>
                        </div>
                    </div>
                </div>

                <nav className="flex-1 space-y-1.5 px-4 py-8 overflow-y-auto custom-scrollbar">
                    <SidebarItem icon={LayoutGrid} label="Dashboard" active={activeView === 'dashboard'} onClick={() => setActiveView('dashboard')} />
                    <div className="px-4 py-4">
                        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-600">Management</p>
                    </div>
                    <SidebarItem icon={Users} label="Users" active={activeView === 'users'} onClick={() => setActiveView('users')} />
                    <SidebarItem icon={UserPlus} label="Admit Patient" active={activeView === 'admit'} onClick={() => setActiveView('admit')} />
                    <SidebarItem icon={UserRound} label="Admitted Patients" active={activeView === 'admitted'} onClick={() => setActiveView('admitted')} />
                    <SidebarItem icon={FileCheck2} label="Approvals" active={activeView === 'approvals'} onClick={() => setActiveView('approvals')} />
                    
                    <div className="px-4 py-4">
                        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-600">Operations</p>
                    </div>
                    <SidebarItem icon={CreditCard} label="Billing" active={activeView === 'billing'} onClick={() => setActiveView('billing')} />
                    <SidebarItem icon={Shield} label="Patient Insurance" active={activeView === 'insurance'} onClick={() => setActiveView('insurance')} />
                    <SidebarItem icon={ActivitySquare} label="Audit Logs" active={activeView === 'audit'} onClick={() => setActiveView('audit')} />
                    <SidebarItem icon={Database} label="Blockchain" active={activeView === 'blockchain'} onClick={() => setActiveView('blockchain')} />
                    <SidebarItem icon={Volume2} label="Notification Sounds" active={activeView === 'notificationSounds'} onClick={() => setActiveView('notificationSounds')} />
                </nav>

                <div className="space-y-1.5 border-t border-white/5 px-4 py-6 bg-black/20">
                    <SidebarItem icon={Settings} label="Settings" active={activeView === 'settings'} onClick={() => setActiveView('settings')} />
                    <SidebarItem icon={LogOut} label="Logout" onClick={logout} />
                </div>
            </aside>

            <main className="flex min-h-screen flex-1 flex-col lg:ml-72">
                <header className="border-b border-white/5 bg-[#05070a]/80 px-6 py-5 backdrop-blur-xl md:px-10 sticky top-0 z-40 transition-all duration-300">
                    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                        <motion.div 
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ duration: 0.5 }}
                        >
                            <div className="flex items-center gap-2">
                                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-emerald-500">System Live</p>
                            </div>
                            <h2 className="mt-1 text-3xl font-black text-white tracking-tight">{header.title}</h2>
                            <p className="mt-1 max-w-2xl text-sm text-gray-500 font-medium">{header.subtitle}</p>
                        </motion.div>

                        <div className="flex items-center gap-4 self-start md:self-auto">
                            <NotificationBell count={notificationCount} notifications={notifications} onClick={resetNotifications} onMarkRead={markNotificationRead} />
                            
                            <div className="flex items-center gap-4 pl-4 border-l border-white/5">
                                <div className="text-right hidden sm:block">
                                    <p className="text-sm font-black text-white">{user?.name || 'Hospital Admin'}</p>
                                    <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-500/70">{user?.hospitalName || 'Assigned hospital'}</p>
                                </div>
                                <motion.div 
                                    whileHover={{ rotate: 5, scale: 1.05 }}
                                    className="relative h-12 w-12 overflow-hidden rounded-[18px] border-2 border-emerald-500/20 bg-emerald-500/5 shadow-2xl shadow-emerald-500/10"
                                >
                                    {profileUrl ? (
                                        <img src={profileUrl} alt="Profile" className="h-full w-full object-cover" />
                                    ) : (
                                        <div className="flex h-full w-full items-center justify-center bg-emerald-500/5 text-emerald-500">
                                            <UserRound size={20} />
                                        </div>
                                    )}
                                </motion.div>
                            </div>
                        </div>
                    </div>
                </header>

                <div className="flex-1 px-6 py-8 md:px-10 max-w-[1600px] w-full mx-auto">
                    <AnimatePresence mode="wait">
                        <motion.div
                            key={activeView}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            transition={{ duration: 0.3, ease: "easeOut" }}
                        >
                            {activeView === 'dashboard' ? <DashboardView hospitalName={user?.hospitalName} /> : null}
                            {activeView === 'users' ? <UsersView /> : null}
                            {activeView === 'admit' ? <AdmitPatientView /> : null}
                            {activeView === 'admitted' ? <AdmittedPatientsView /> : null}
                            {activeView === 'approvals' ? <ApprovalsView /> : null}
                            {activeView === 'billing' ? <HospitalBillingView /> : null}
                            {activeView === 'insurance' ? <HospitalInsuranceView /> : null}
                            {activeView === 'audit' ? <AuditLogsView /> : null}
                            {activeView === 'blockchain' ? <BlockchainView /> : null}
                            {activeView === 'notificationSounds' ? <NotificationSoundsManager /> : null}
                            {activeView === 'settings' ? <SettingsView /> : null}
                        </motion.div>
                    </AnimatePresence>
                </div>
            </main>
        </div>
    );
};

const DashboardView = ({ hospitalName }) => {
    const [analytics, setAnalytics] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const loadAnalytics = async () => {
        try {
            setLoading(true);
            setError('');
            const response = await fetchAnalytics();
            if (response?.success) {
                setAnalytics(response.data);
            } else {
                setError(response?.message || 'Unable to load hospital analytics.');
            }
        } catch (err) {
            console.error(err);
            setError(err.response?.data?.message || 'Unable to load hospital analytics.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadAnalytics();
    }, []);

    if (loading) return <Loader message="Analyzing hospital operations" />;
    if (error) return <ErrorPanel message={error} onRetry={loadAnalytics} />;

    const approvalRate = analytics?.totalAppointments
        ? Math.round(((analytics?.approvedAppointments || 0) / analytics.totalAppointments) * 100)
        : 0;

    // Chart 1: Appointment Trends (Area Chart)
    const appointmentTrendData = (analytics?.appointmentsPerMonth || []).map(item => ({
        name: `Month ${item._id}`,
        count: item.count
    }));

    // Chart 2: User Distribution (Pie Chart)
    const userDistributionData = [
        { name: 'Doctors', value: analytics?.totalDoctors || 0, color: '#10b981' },
        { name: 'Patients', value: analytics?.totalPatients || 0, color: '#f59e0b' },
        { name: 'Staff', value: (analytics?.totalUsers || 0) - (analytics?.totalDoctors || 0) - (analytics?.totalPatients || 0), color: '#3b82f6' }
    ].filter(item => item.value > 0);

    // Chart 3: Doctor Performance (Bar Chart)
    const doctorActivityData = (analytics?.doctorPerformance || []).slice(0, 5).map(doc => ({
        name: doc.name.split(' ')[0],
        activity: doc.count
    }));

    // Chart 4: Operational Pulse (Radial Bar)
    const radialData = [
        { name: 'Total', value: 100, fill: '#1e293b' },
        { name: 'Approved', value: approvalRate, fill: '#10b981' },
        { name: 'Pending', value: 100 - approvalRate, fill: '#f43f5e' }
    ];

    return (
        <div className="space-y-8 pb-12">
            {/* Stat Cards with Entrance Stagger */}
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">
                {[
                    { title: "Total Users", value: analytics?.totalUsers || 0, icon: Users, tone: "blue", label: "Active network" },
                    { title: "Doctors", value: analytics?.totalDoctors || 0, icon: UserCog, tone: "emerald", label: "Registered medical staff" },
                    { title: "Patients", value: analytics?.totalPatients || 0, icon: Shield, tone: "amber", label: "Connected beneficiaries" },
                    { title: "Appointments", value: analytics?.totalAppointments || 0, icon: Activity, tone: "rose", label: "Sessions booked" }
                ].map((stat, i) => (
                    <motion.div
                        key={stat.title}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.1 }}
                    >
                        <StatCard {...stat} />
                    </motion.div>
                ))}
            </div>

            {/* Main Visualizations Grid */}
            <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
                {/* Chart 1: Appointment Flow */}
                <motion.div 
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="group relative overflow-hidden rounded-[32px] border border-white/5 bg-[#0a0c12] p-8 transition-all hover:border-emerald-500/20"
                >
                    <div className="flex items-center justify-between mb-8">
                        <div>
                            <div className="flex items-center gap-2 mb-1">
                                <TrendingUp size={14} className="text-emerald-500" />
                                <h3 className="text-lg font-black text-white tracking-tight">Appointment Flow</h3>
                            </div>
                            <p className="text-xs text-gray-500 font-medium">Monthly session volume dynamics</p>
                        </div>
                        <div className="flex gap-1.5">
                            <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                            <div className="h-1.5 w-1.5 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]" />
                        </div>
                    </div>

                    <div className="h-[300px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={appointmentTrendData}>
                                <defs>
                                    <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                                        <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff05" vertical={false} />
                                <XAxis 
                                    dataKey="name" 
                                    stroke="#475569" 
                                    fontSize={10} 
                                    tickLine={false} 
                                    axisLine={false} 
                                    dy={10}
                                />
                                <YAxis 
                                    stroke="#475569" 
                                    fontSize={10} 
                                    tickLine={false} 
                                    axisLine={false} 
                                />
                                <Tooltip 
                                    contentStyle={{ 
                                        backgroundColor: '#0f172a', 
                                        borderRadius: '16px', 
                                        border: '1px solid rgba(255,255,255,0.1)',
                                        boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.5)'
                                    }} 
                                />
                                <Area 
                                    type="monotone" 
                                    dataKey="count" 
                                    stroke="#10b981" 
                                    strokeWidth={3}
                                    fillOpacity={1} 
                                    fill="url(#colorCount)" 
                                    animationDuration={2000}
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </motion.div>

                {/* Chart 2: Clinical Resource Mix */}
                <motion.div 
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.2 }}
                    className="group relative overflow-hidden rounded-[32px] border border-white/5 bg-[#0a0c12] p-8 transition-all hover:border-blue-500/20"
                >
                    <div className="flex items-center justify-between mb-8">
                        <div>
                            <div className="flex items-center gap-2 mb-1">
                                <PieChartIcon size={14} className="text-blue-500" />
                                <h3 className="text-lg font-black text-white tracking-tight">Resource Mix</h3>
                            </div>
                            <p className="text-xs text-gray-500 font-medium">Breakdown of hospital users</p>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 items-center">
                        <div className="h-[250px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={userDistributionData}
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={60}
                                        outerRadius={80}
                                        paddingAngle={8}
                                        dataKey="value"
                                        stroke="none"
                                        animationBegin={500}
                                        animationDuration={1500}
                                    >
                                        {userDistributionData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={entry.color} />
                                        ))}
                                    </Pie>
                                    <Tooltip 
                                        contentStyle={{ backgroundColor: '#0f172a', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.1)' }} 
                                    />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                        <div className="space-y-4">
                            {userDistributionData.map((item) => (
                                <div key={item.name} className="flex items-center justify-between p-3 rounded-2xl bg-white/5 border border-white/5">
                                    <div className="flex items-center gap-3">
                                        <div className="h-3 w-3 rounded-full" style={{ backgroundColor: item.color }} />
                                        <span className="text-xs font-bold text-gray-300 uppercase tracking-wider">{item.name}</span>
                                    </div>
                                    <span className="text-lg font-black text-white">{item.value}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </motion.div>

                {/* Chart 3: Clinical Performance Hub */}
                <motion.div 
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.3 }}
                    className="group relative overflow-hidden rounded-[32px] border border-white/5 bg-[#0a0c12] p-8 transition-all hover:border-amber-500/20 lg:col-span-1"
                >
                    <div className="flex items-center justify-between mb-8">
                        <div>
                            <div className="flex items-center gap-2 mb-1">
                                <BarChart3 size={14} className="text-amber-500" />
                                <h3 className="text-lg font-black text-white tracking-tight">Clinician Activity</h3>
                            </div>
                            <p className="text-xs text-gray-500 font-medium">Top performing doctors by volume</p>
                        </div>
                    </div>

                    <div className="h-[300px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={doctorActivityData} layout="vertical" margin={{ left: 10, right: 30 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff05" horizontal={true} vertical={false} />
                                <XAxis type="number" hide />
                                <YAxis 
                                    dataKey="name" 
                                    type="category" 
                                    stroke="#94a3b8" 
                                    fontSize={12} 
                                    tickLine={false} 
                                    axisLine={false}
                                    width={70}
                                />
                                <Tooltip 
                                    cursor={{fill: '#ffffff05'}}
                                    contentStyle={{ backgroundColor: '#0f172a', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.1)' }} 
                                />
                                <Bar 
                                    dataKey="activity" 
                                    fill="#f59e0b" 
                                    radius={[0, 10, 10, 0]} 
                                    barSize={24}
                                    animationDuration={2000}
                                />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </motion.div>

                {/* Chart 4: Operational Efficiency */}
                <motion.div 
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.4 }}
                    className="group relative overflow-hidden rounded-[32px] border border-white/5 bg-[#0a0c12] p-8 transition-all hover:border-rose-500/20 lg:col-span-1"
                >
                    <div className="flex items-center justify-between mb-4">
                        <div>
                            <div className="flex items-center gap-2 mb-1">
                                <ActivitySquare size={14} className="text-rose-500" />
                                <h3 className="text-lg font-black text-white tracking-tight">Operational Pulse</h3>
                            </div>
                            <p className="text-xs text-gray-500 font-medium">Approval vs Pending throughput</p>
                        </div>
                    </div>

                    <div className="relative h-[300px] flex items-center justify-center">
                        <ResponsiveContainer width="100%" height="100%">
                            <RadialBarChart 
                                cx="50%" 
                                cy="50%" 
                                innerRadius="30%" 
                                outerRadius="100%" 
                                barSize={20} 
                                data={radialData}
                                startAngle={180}
                                endAngle={-180}
                            >
                                <RadialBar
                                    label={{ position: 'insideStart', fill: '#fff', fontSize: 10 }}
                                    background
                                    clockWise
                                    dataKey="value"
                                    animationDuration={2000}
                                />
                                <Legend 
                                    iconSize={10} 
                                    layout="vertical" 
                                    verticalAlign="bottom" 
                                    align="right" 
                                    wrapperStyle={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 'bold' }}
                                />
                            </RadialBarChart>
                        </ResponsiveContainer>
                        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                            <span className="text-4xl font-black text-white">{approvalRate}%</span>
                            <span className="text-[10px] uppercase tracking-widest text-emerald-500 font-bold">Approved</span>
                        </div>
                    </div>
                </motion.div>
            </div>

            {/* Quick Actions / Metric Blocks */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <MetricBlock 
                    label="Approved Appointments" 
                    value={analytics?.approvedAppointments || 0} 
                    helper={`${approvalRate}% approval rate`} 
                    trend="+12%"
                />
                <MetricBlock 
                    label="Pending Appointments" 
                    value={analytics?.pendingAppointments || 0} 
                    helper="Awaiting hospital response" 
                    trend="-5%"
                    inverse
                />
                <MetricBlock 
                    label="Active Prescriptions" 
                    value={analytics?.totalPrescriptions || 0} 
                    helper="Generated by hospital doctors" 
                    trend="+24%"
                />
            </div>
        </div>
    );
};
const UsersView = () => {
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    const [roleFilter, setRoleFilter] = useState('all');
    const [workingUserId, setWorkingUserId] = useState('');

    const loadUsers = async () => {
        try {
            setLoading(true);
            setError('');
            const response = await fetchUsers();
            if (response?.success) {
                setUsers(response.data || []);
            } else {
                setError(response?.message || 'Unable to load hospital users.');
            }
        } catch (err) {
            console.error(err);
            setError(err.response?.data?.message || 'Unable to load hospital users.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadUsers();
    }, []);

    const handleRoleChange = async (userId, nextRole) => {
        try {
            setWorkingUserId(userId);
            const response = await updateUserRole(userId, nextRole);
            if (response?.success) {
                setUsers((current) => current.map((user) => (user._id === userId ? response.data : user)));
            }
        } catch (err) {
            console.error(err);
            window.alert(err.response?.data?.message || 'Unable to update user role.');
        } finally {
            setWorkingUserId('');
        }
    };

    if (loading) return <Loader message="Loading hospital users" />;
    if (error) return <ErrorPanel message={error} onRetry={loadUsers} />;

    const searchValue = searchTerm.trim().toLowerCase();
    const filteredUsers = users.filter((user) => {
        const matchesRole = roleFilter === 'all' || user.role === roleFilter;
        const searchPool = [
            user.name,
            user.email,
            user.hospitalName,
            user.phone,
            user.admission?.ward,
            user.insuranceProviderName,
        ]
            .filter(Boolean)
            .join(' ')
            .toLowerCase();

        return matchesRole && (!searchValue || searchPool.includes(searchValue));
    });

    return (
        <div className="space-y-6">
            <div className="rounded-3xl border border-white/10 bg-[#101317] p-5">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                    <div className="flex flex-1 flex-col gap-4 sm:flex-row">
                        <input
                            type="text"
                            value={searchTerm}
                            onChange={(event) => setSearchTerm(event.target.value)}
                            placeholder="Search name, email, hospital, ward, or provider"
                            className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none placeholder:text-gray-600 focus:border-emerald-500/40"
                        />
                        <select
                            value={roleFilter}
                            onChange={(event) => setRoleFilter(event.target.value)}
                            className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none focus:border-emerald-500/40"
                        >
                            <option value="all">All roles</option>
                            <option value="doctor">Doctor</option>
                            <option value="pharmacist">Pharmacist</option>
                            <option value="lab_technician">Lab Technician</option>
                            <option value="delivery">Delivery</option>
                            <option value="patient">Patient</option>
                            <option value="admin">Admin</option>
                        </select>
                    </div>
                    <button
                        type="button"
                        onClick={loadUsers}
                        className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-white hover:bg-white/10"
                    >
                        <RefreshCw size={15} /> Refresh
                    </button>
                </div>
            </div>

            <div className="overflow-hidden rounded-3xl border border-white/10 bg-[#101317]">
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-white/10 text-left">
                        <thead className="bg-black/20 text-xs uppercase tracking-[0.2em] text-gray-500">
                            <tr>
                                <th className="px-5 py-4">User</th>
                                <th className="px-5 py-4">Role</th>
                                <th className="px-5 py-4">Hospital Details</th>
                                <th className="px-5 py-4">Status</th>
                                <th className="px-5 py-4">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/10 text-sm">
                            {filteredUsers.map((user) => (
                                <tr key={user._id} className="align-top hover:bg-white/[0.02]">
                                    <td className="px-5 py-4">
                                        <p className="font-semibold text-white">{user.name}</p>
                                        <p className="mt-1 text-xs text-gray-500">{user.email}</p>
                                        {user.phone ? <p className="mt-1 text-xs text-gray-500">{user.phone}</p> : null}
                                    </td>
                                    <td className="px-5 py-4">
                                        <RoleBadge role={user.role} />
                                    </td>
                                    <td className="px-5 py-4 text-gray-300">
                                        {user.role === 'patient' ? (
                                            <div className="space-y-1 text-xs">
                                                <p>Ward: {user.admission?.ward || 'Not admitted'}</p>
                                                <p>Hospital: {user.admission?.hospitalName || 'Not linked'}</p>
                                                <p>Insurance: {user.insuranceProviderName || 'Not added'}</p>
                                            </div>
                                        ) : (
                                            <div className="space-y-1 text-xs">
                                                <p>Hospital: {user.hospitalName || 'Not linked'}</p>
                                                {user.specialization ? <p>Specialization: {user.specialization}</p> : null}
                                                {user.pharmacyName ? <p>Pharmacy: {user.pharmacyName}</p> : null}
                                            </div>
                                        )}
                                    </td>
                                    <td className="px-5 py-4">
                                        <StatusBadge active={user.isApproved !== false} label={user.isApproved === false ? 'Pending approval' : 'Active'} />
                                    </td>
                                    <td className="px-5 py-4">
                                        {ROLE_OPTIONS.includes(user.role) ? (
                                            <div className="flex items-center gap-3">
                                                <select
                                                    value={user.role}
                                                    disabled={workingUserId === user._id}
                                                    onChange={(event) => handleRoleChange(user._id, event.target.value)}
                                                    className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs text-white outline-none focus:border-emerald-500/40 disabled:opacity-60"
                                                >
                                                    {ROLE_OPTIONS.map((role) => (
                                                        <option key={role} value={role}>{role}</option>
                                                    ))}
                                                </select>
                                                {workingUserId === user._id ? <Loader2 size={16} className="animate-spin text-emerald-300" /> : null}
                                            </div>
                                        ) : (
                                            <span className="text-xs text-gray-500">Read only</span>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {filteredUsers.length === 0 ? (
                    <div className="px-5 py-10 text-center text-sm text-gray-500">No hospital users match the current filters.</div>
                ) : null}
            </div>
        </div>
    );
};
const ApprovalsView = () => {
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [workingId, setWorkingId] = useState('');

    const loadApprovals = async () => {
        try {
            setLoading(true);
            setError('');
            const response = await fetchPendingApprovals();
            if (response?.success) {
                setItems(response.data || []);
            } else {
                setError(response?.message || 'Unable to load pending approvals.');
            }
        } catch (err) {
            console.error(err);
            setError(err.response?.data?.message || 'Unable to load pending approvals.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadApprovals();
    }, []);

    const handleApprove = async (id) => {
        try {
            setWorkingId(id);
            const response = await approvePendingUser(id);
            if (response?.success) {
                setItems((current) => current.filter((item) => item._id !== id));
            }
        } catch (err) {
            console.error(err);
            window.alert(err.response?.data?.message || 'Unable to approve this user.');
        } finally {
            setWorkingId('');
        }
    };

    const handleReject = async (id) => {
        try {
            setWorkingId(id);
            const response = await rejectPendingUser(id);
            if (response?.success) {
                setItems((current) => current.filter((item) => item._id !== id));
            }
        } catch (err) {
            console.error(err);
            window.alert(err.response?.data?.message || 'Unable to reject this user.');
        } finally {
            setWorkingId('');
        }
    };

    if (loading) return <Loader message="Loading pending approvals" />;
    if (error) return <ErrorPanel message={error} onRetry={loadApprovals} />;
    if (items.length === 0) {
        return <EmptyPanel title="No pending approvals" description="All staff registrations for this hospital have already been reviewed." />;
    }

    return (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            {items.map((item) => (
                <div key={item._id} className="relative overflow-hidden rounded-[32px] border border-white/10 bg-[#101317] p-8 transition-all hover:border-emerald-500/30 hover:shadow-2xl hover:shadow-emerald-500/5 group">
                    <div className="flex items-start justify-between gap-6">
                        <div className="flex-1">
                            <div className="flex items-center gap-3">
                                <h3 className="text-2xl font-bold text-white tracking-tight">{item.name}</h3>
                                <RoleBadge role={item.role} />
                            </div>
                            <p className="mt-1.5 text-sm text-gray-400 font-medium">{item.email}</p>
                            
                            <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
                                <InfoTile label="Hospital" value={item.hospitalName || 'Not provided'} />
                                <InfoTile label="Registered" value={formatDateTime(item.createdAt)} />
                                <InfoTile label="Phone" value={item.phone || 'Not provided'} />
                                <InfoTile label="Specialization" value={item.specialization || item.assignedWard || 'Not provided'} />
                            </div>
                        </div>

                        <div className="flex flex-col items-center gap-4 shrink-0">
                            <div className="relative group/avatar">
                                <div className="absolute -inset-1 rounded-3xl bg-gradient-to-br from-emerald-500/20 to-blue-500/20 blur opacity-0 group-hover/avatar:opacity-100 transition-opacity" />
                                <div className="relative h-24 w-24 overflow-hidden rounded-3xl border border-white/10 bg-[#0c0e12] ring-4 ring-[#101317]">
                                    {item.profileImage ? (
                                        <img src={`${getBaseUrl()}/${item.profileImage}`} alt={item.name} className="h-full w-full object-cover" />
                                    ) : (
                                        <div className="flex h-full w-full items-center justify-center bg-emerald-500/5 text-emerald-500">
                                            <UserRound size={40} />
                                        </div>
                                    )}
                                </div>
                            </div>
                            
                            <div className="flex flex-col gap-2 w-full">
                                {item.medicalLicenseProof && (
                                    <button 
                                        onClick={() => window.open(`${getBaseUrl()}/${item.medicalLicenseProof}`, '_blank')}
                                        className="flex items-center justify-center gap-2 rounded-xl bg-white/5 px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-gray-400 border border-white/5 hover:bg-white/10 hover:text-white transition-all"
                                    >
                                        <FileSignature size={14} className="text-emerald-500" />
                                        License
                                    </button>
                                )}
                                {item.achievementCertificates && item.achievementCertificates.length > 0 && (
                                    <button 
                                        onClick={() => item.achievementCertificates.forEach(cert => window.open(`${getBaseUrl()}/${cert}`, '_blank'))}
                                        className="flex items-center justify-center gap-2 rounded-xl bg-white/5 px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-gray-400 border border-white/5 hover:bg-white/10 hover:text-white transition-all"
                                    >
                                        <Award size={14} className="text-blue-500" />
                                        Certificates
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="mt-8 flex gap-3">
                        <button
                            type="button"
                            disabled={workingId === item._id}
                            onClick={() => handleApprove(item._id)}
                            className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-emerald-500 py-3.5 text-sm font-black uppercase tracking-widest text-black transition hover:bg-emerald-400 disabled:opacity-60"
                        >
                            {workingId === item._id ? <Loader2 size={18} className="animate-spin" /> : <CheckCircle size={18} />}
                            Approve
                        </button>
                        <button
                            type="button"
                            disabled={workingId === item._id}
                            onClick={() => handleReject(item._id)}
                            className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-white/5 py-3.5 text-sm font-black uppercase tracking-widest text-red-400 border border-red-500/10 transition hover:bg-red-500/15 disabled:opacity-60"
                        >
                            <X size={18} />
                            Reject
                        </button>
                    </div>
                </div>
            ))}
        </div>
    );
};

const AuditLogsView = () => {
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [actionFilter, setActionFilter] = useState('all');

    const loadLogs = async () => {
        try {
            setLoading(true);
            setError('');
            const response = await fetchAuditLogs();
            if (response?.success) {
                setLogs(response.data || []);
            } else {
                setError(response?.message || 'Unable to load audit logs.');
            }
        } catch (err) {
            console.error(err);
            setError(err.response?.data?.message || 'Unable to load audit logs.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadLogs();
    }, []);

    if (loading) return <Loader message="Loading audit logs" />;
    if (error) return <ErrorPanel message={error} onRetry={loadLogs} />;

    const actions = ['all', ...new Set(logs.map((log) => log.action).filter(Boolean))];
    const filteredLogs = actionFilter === 'all' ? logs : logs.filter((log) => log.action === actionFilter);

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-4 rounded-3xl border border-white/10 bg-[#101317] p-5 md:flex-row md:items-center md:justify-between">
                <select
                    value={actionFilter}
                    onChange={(event) => setActionFilter(event.target.value)}
                    className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none focus:border-emerald-500/40"
                >
                    {actions.map((action) => (
                        <option key={action} value={action}>{action === 'all' ? 'All actions' : action}</option>
                    ))}
                </select>
                <button
                    type="button"
                    onClick={loadLogs}
                    className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-white hover:bg-white/10"
                >
                    <RefreshCw size={15} /> Refresh
                </button>
            </div>

            <div className="overflow-hidden rounded-3xl border border-white/10 bg-[#101317]">
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-white/10 text-left">
                        <thead className="bg-black/20 text-xs uppercase tracking-[0.2em] text-gray-500">
                            <tr>
                                <th className="px-5 py-4">Time</th>
                                <th className="px-5 py-4">User</th>
                                <th className="px-5 py-4">Action</th>
                                <th className="px-5 py-4">Module</th>
                                <th className="px-5 py-4">IP</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/10 text-sm">
                            {filteredLogs.map((log) => (
                                <tr key={log._id} className="hover:bg-white/[0.02]">
                                    <td className="px-5 py-4 text-gray-300">{formatDateTime(log.timestamp)}</td>
                                    <td className="px-5 py-4">
                                        <p className="font-semibold text-white">{log.userId?.name || 'Unknown'}</p>
                                        <p className="mt-1 text-xs text-gray-500">{log.userId?.email || 'No email'}</p>
                                    </td>
                                    <td className="px-5 py-4">
                                        <p className="font-semibold text-white">{log.action || 'Unknown action'}</p>
                                        {log.details?.method === 'QR_CODE_SCAN' && (
                                            <div className="mt-1.5 flex items-center gap-1.5">
                                                <div className="px-2 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-[10px] font-black uppercase tracking-widest text-emerald-400 flex items-center gap-1">
                                                    <Shield size={10} /> QR ACCESSED
                                                </div>
                                                <p className="text-[10px] text-gray-500 font-medium">Patient: {log.details.patientName}</p>
                                            </div>
                                        )}
                                        {log.details?.patientName && log.details?.method !== 'QR_CODE_SCAN' && (
                                            <div className="mt-1.5 flex items-center gap-1.5">
                                                <p className="text-[11px] text-gray-400 font-medium bg-white/5 px-2 py-1 rounded-md border border-white/5">
                                                    Patient: <span className="text-white">{log.details.patientName}</span>
                                                </p>
                                            </div>
                                        )}
                                        {/* Fallback for old records if we know they are patient-related */}
                                        {!log.details?.patientName && ['UPLOAD_LAB_REPORT', 'CREATE_LAB_ORDER', 'UPDATE_PHARMACY_STATUS', 'CREATE_PRESCRIPTION', 'CREATE_MEDICAL_RECORD'].includes(log.action) && (
                                            <div className="mt-1.5 flex items-center gap-1.5">
                                                <p className="text-[11px] text-gray-500 font-medium italic">
                                                    Patient details not captured for old logs
                                                </p>
                                            </div>
                                        )}
                                    </td>
                                    <td className="px-5 py-4 text-gray-300">{log.module || 'Unknown module'}</td>
                                    <td className="px-5 py-4 text-gray-500">{log.ipAddress || 'Not captured'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                {filteredLogs.length === 0 ? <div className="px-5 py-10 text-center text-sm text-gray-500">No audit log entries match this filter.</div> : null}
            </div>
        </div>
    );
};
const BlockchainView = () => {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [syncing, setSyncing] = useState(false);

    const loadStatus = async (showLoading = true) => {
        try {
            if (showLoading) setLoading(true);
            setError('');
            const response = await fetchBlockchainStatus();
            if (response?.success) {
                setData(response.data);
            } else {
                setError(response?.message || 'Unable to load blockchain status.');
            }
        } catch (err) {
            console.error(err);
            setError(err.response?.data?.message || 'Unable to load blockchain status.');
        } finally {
            if (showLoading) setLoading(false);
        }
    };

    useEffect(() => {
        loadStatus();

        // Setup Socket for Real-time Updates
        socket.connect();
        socket.on('blockchain-record-verified', () => {
            loadStatus(false); // Background update
        });

        // Polling as fallback (every 10 seconds for real-time feel)
        const interval = setInterval(() => loadStatus(false), 10000);

        return () => {
            clearInterval(interval);
            socket.off('blockchain-record-verified');
        };
    }, []);

    const handleSyncAll = async () => {
        try {
            setSyncing(true);
            await syncAllBlockchainRecords();
            await loadStatus();
        } catch (err) {
            console.error(err);
            window.alert(err.response?.data?.message || 'Unable to sync blockchain records.');
        } finally {
            setSyncing(false);
        }
    };

    if (loading) return <Loader message="Loading blockchain status" />;
    if (error) return <ErrorPanel message={error} onRetry={loadStatus} />;

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-4 rounded-3xl border border-white/10 bg-[#101317] p-5 md:flex-row md:items-center md:justify-between">
                <div>
                    <h3 className="text-xl font-bold text-white">Hospital Blockchain Monitor</h3>
                    <p className="mt-1 text-sm text-gray-400">Recent record and lab verification activity for this hospital.</p>
                </div>
                <div className="flex flex-wrap gap-3">
                    <button
                        type="button"
                        disabled={syncing}
                        onClick={handleSyncAll}
                        className="inline-flex items-center gap-2 rounded-2xl bg-amber-400 px-4 py-2.5 text-sm font-semibold text-black transition hover:bg-amber-300 disabled:opacity-60"
                    >
                        {syncing ? <Loader2 size={15} className="animate-spin" /> : null}
                        Sync all
                    </button>
                    <button
                        type="button"
                        onClick={loadStatus}
                        className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-semibold text-white hover:bg-white/10"
                    >
                        <RefreshCw size={15} /> Refresh
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                <StatCard title="Latest Block" value={data?.blockNumber ? `#${data.blockNumber}` : 'N/A'} icon={Database} tone="blue" />
                <StatCard title="Verified" value={data?.totals?.verified || 0} icon={Shield} tone="emerald" />
                <StatCard title="Pending Sync" value={data?.totals?.pendingSync || 0} icon={Activity} tone="amber" />
                <StatCard title="Transactions" value={data?.transactions?.length || 0} icon={FileCheck2} tone="rose" />
            </div>

            <div className="overflow-hidden rounded-3xl border border-white/10 bg-[#101317]">
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-white/10 text-left">
                        <thead className="bg-black/20 text-xs uppercase tracking-[0.2em] text-gray-500">
                            <tr>
                                <th className="px-5 py-4">Sl No.</th>
                                <th className="px-5 py-4">Label</th>
                                <th className="px-5 py-4">Patient</th>
                                <th className="px-5 py-4">Doctor</th>
                                <th className="px-5 py-4">Status</th>
                                <th className="px-5 py-4">Block</th>
                                <th className="px-5 py-4">Gas</th>
                                <th className="px-5 py-4">Fee (ETH)</th>
                                <th className="px-5 py-4">Timestamp</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/10 text-sm">
                            {(data?.transactions || []).map((item, index) => (
                                <tr key={`${item.type}-${item._id}`} className="hover:bg-white/[0.02]">
                                    <td className="px-5 py-4 text-gray-500 font-mono">{index + 1}</td>
                                    <td className="px-5 py-4">
                                        <p className="font-semibold text-white">{item.label}</p>
                                        <p className="mt-1 text-xs text-gray-500">{item.hospitalName}</p>
                                    </td>
                                    <td className="px-5 py-4 text-gray-300">{item.patientName}</td>
                                    <td className="px-5 py-4 text-gray-300">{item.doctorName}</td>
                                    <td className="px-5 py-4">
                                        <StatusBadge active={item.status === 'Confirmed'} label={item.status || 'Wait-Sync'} />
                                    </td>
                                    <td className="px-5 py-4 text-gray-400 font-mono text-xs">
                                        {item.blockNumber && item.blockNumber !== 'N/A' ? `#${item.blockNumber}` : '—'}
                                    </td>
                                    <td className="px-5 py-4 text-gray-300 font-mono">
                                        <div className="flex flex-col">
                                            <span>{item.gasUsed || 'N/A'}</span>
                                            {item.gasPrice && <span className="text-[10px] opacity-50">{item.gasPrice} gwei</span>}
                                        </div>
                                    </td>
                                    <td className="px-5 py-4 text-gray-300 font-mono text-xs">
                                        {item.totalFee && item.totalFee !== 'N/A' ? Number(item.totalFee).toFixed(6) : 'N/A'}
                                    </td>
                                    <td className="px-5 py-4 text-gray-400 text-xs">
                                        {item.timestamp ? (
                                            <div className="flex flex-col">
                                                <span>{new Date(item.timestamp).toLocaleDateString()}</span>
                                                <span className="opacity-60">{new Date(item.timestamp).toLocaleTimeString()}</span>
                                            </div>
                                        ) : 'Pending Sync'}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                {(data?.transactions || []).length === 0 ? <div className="px-5 py-10 text-center text-sm text-gray-500">No blockchain activity found for this hospital.</div> : null}
            </div>
        </div>
    );
};

const AdmitPatientView = () => {
    const [searchTerm, setSearchTerm] = useState('');
    const [patients, setPatients] = useState([]);
    const [loading, setLoading] = useState(false);
    const [admittingId, setAdmittingId] = useState(null);
    const [selectedWard, setSelectedWard] = useState('General');
    const [message, setMessage] = useState({ type: '', text: '' });

    const handleSearch = async () => {
        if (!searchTerm.trim()) return;
        try {
            setLoading(true);
            setMessage({ type: '', text: '' });
            const response = await searchPatientsForAdmission(searchTerm);
            if (response?.success) {
                setPatients(response.data || []);
                if (response.data.length === 0) {
                    setMessage({ type: 'info', text: 'No matching patients found who are not already admitted.' });
                }
            }
        } catch (err) {
            console.error(err);
            setMessage({ type: 'error', text: err.response?.data?.message || 'Search failed.' });
        } finally {
            setLoading(false);
        }
    };

    const handleAdmit = async (patientId) => {
        try {
            setAdmittingId(patientId);
            const response = await admitPatient(patientId, { ward: selectedWard });
            if (response?.success) {
                setPatients((prev) => prev.filter((p) => p._id !== patientId));
                setMessage({ type: 'success', text: 'Patient admitted successfully!' });
            }
        } catch (err) {
            console.error(err);
            setMessage({ type: 'error', text: err.response?.data?.message || 'Admission failed.' });
        } finally {
            setAdmittingId(null);
        }
    };

    return (
        <div className="space-y-6">
            <div className="rounded-3xl border border-white/10 bg-[#101317] p-6">
                <h3 className="text-xl font-bold text-white mb-4">Find Patient</h3>
                <div className="flex flex-col gap-4 sm:flex-row">
                    <input
                        type="text"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                        placeholder="Search by name or email..."
                        className="flex-1 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none placeholder:text-gray-600 focus:border-emerald-500/40"
                    />
                    <button
                        onClick={handleSearch}
                        disabled={loading}
                        className="inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-500 px-6 py-3 text-sm font-semibold text-black transition hover:bg-emerald-400 disabled:opacity-60"
                    >
                        {loading ? <Loader2 size={18} className="animate-spin" /> : <Users size={18} />}
                        Search
                    </button>
                </div>
                {message.text && (
                    <div className={`mt-4 p-4 rounded-2xl text-sm ${message.type === 'error' ? 'bg-red-500/10 text-red-300 border border-red-500/20' : message.type === 'success' ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20' : 'bg-blue-500/10 text-blue-300 border border-blue-500/20'}`}>
                        {message.text}
                    </div>
                )}
            </div>

            {patients.length > 0 && (
                <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                    {patients.map((patient) => (
                        <div key={patient._id} className="rounded-3xl border border-white/10 bg-[#101317] p-6">
                            <div className="flex items-start justify-between gap-4">
                                <div className="flex items-center gap-4">
                                    <div className="h-12 w-12 rounded-2xl border border-white/10 bg-black/20 flex items-center justify-center text-gray-400">
                                        <UserRound size={24} />
                                    </div>
                                    <div>
                                        <h4 className="text-lg font-bold text-white">{patient.name}</h4>
                                        <p className="text-sm text-gray-500">{patient.email}</p>
                                    </div>
                                </div>
                                <StatusBadge active={true} label="Registered" />
                            </div>

                            <div className="mt-6 grid grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className="text-[10px] uppercase tracking-widest text-gray-500 font-bold">Select Ward</label>
                                    <select
                                        value={selectedWard}
                                        onChange={(e) => setSelectedWard(e.target.value)}
                                        className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500/40"
                                    >
                                        <option value="General">General Ward</option>
                                        <option value="ICU">ICU</option>
                                        <option value="Emergency">Emergency</option>
                                        <option value="Pediatric">Pediatric</option>
                                        <option value="Surgical">Surgical</option>
                                        <option value="Deluxe">Deluxe Room</option>
                                        <option value="Semi-Private">Semi-Private</option>
                                        <option value="Private">Private Room</option>
                                        <option value="Isolation">Isolation</option>
                                        <option value="NICU">NICU</option>
                                    </select>
                                </div>
                                <div className="flex items-end">
                                    <button
                                        onClick={() => handleAdmit(patient._id)}
                                        disabled={admittingId === patient._id}
                                        className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-white text-black px-4 py-2 text-sm font-bold transition hover:bg-gray-200 disabled:opacity-60"
                                    >
                                        {admittingId === patient._id ? <Loader2 size={16} className="animate-spin" /> : <Building2 size={16} />}
                                        Admit Now
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

const AdmittedPatientsView = () => {
    const [patients, setPatients] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [selectedPatient, setSelectedPatient] = useState(null);
    const [billPreview, setBillPreview] = useState(null);
    const [billingLoading, setBillingLoading] = useState(false);
    const [discharging, setDischarging] = useState(false);
    const [showWardModal, setShowWardModal] = useState(false);
    const [changingWard, setChangingWard] = useState(false);
    const [newWard, setNewWard] = useState('General');

    const loadAdmitted = async () => {
        try {
            setLoading(true);
            const res = await fetchAdmittedPatients();
            if (res.success) setPatients(res.data);
        } catch (err) {
            setError('Failed to load admitted patients');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadAdmitted();
    }, []);

    const handleBillPreview = async (patient) => {
        try {
            setSelectedPatient(patient);
            setBillingLoading(true);
            const res = await fetchBillPreview(patient._id);
            if (res.success) setBillPreview(res.data);
        } catch (err) {
            window.alert('Failed to generate bill preview');
        } finally {
            setBillingLoading(false);
        }
    };

    const handleDischarge = async () => {
        if (!window.confirm('Are you sure you want to discharge this patient and finalize the bill?')) return;
        try {
            setDischarging(true);
            const res = await dischargePatient(selectedPatient._id, {
                totalAmount: billPreview.total,
                items: billPreview.summary
            });
            if (res.success) {
                window.alert('Patient discharged successfully!');
                setBillPreview(null);
                setSelectedPatient(null);
                loadAdmitted();
            }
        } catch (err) {
            window.alert('Discharge failed');
        } finally {
            setDischarging(false);
        }
    };

    const handleChangeWard = async () => {
        try {
            setChangingWard(true);
            const res = await changePatientWard(selectedPatient._id, { newWard });
            if (res.success) {
                window.alert(`Ward changed to ${newWard} successfully!`);
                setShowWardModal(false);
                setSelectedPatient(null);
                loadAdmitted();
            }
        } catch (err) {
            window.alert(err.response?.data?.message || 'Ward change failed');
        } finally {
            setChangingWard(false);
        }
    };

    if (loading) return <Loader message="Loading admitted patients" />;

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {patients.map(p => (
                    <div key={p._id} className="rounded-3xl border border-white/10 bg-[#101317] p-6">
                        <div className="flex items-center gap-4 mb-4">
                            <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-300">
                                <UserRound size={24} />
                            </div>
                            <div>
                                <h3 className="font-bold text-white">{p.name}</h3>
                                <p className="text-xs text-gray-500">{p.admission.ward} Ward</p>
                            </div>
                        </div>
                        <div className="space-y-2 mb-6 text-sm">
                            <div className="flex justify-between text-gray-400">
                                <span>Admitted:</span>
                                <span className="text-gray-200">{new Date(p.admission.admittedAt).toLocaleDateString()}</span>
                            </div>
                            <div className="flex justify-between text-gray-400">
                                <span>Email:</span>
                                <span className="text-gray-200 truncate ml-4">{p.email}</span>
                            </div>
                        </div>
                        <div className="flex gap-2">
                            <button
                                onClick={() => {
                                    setSelectedPatient(p);
                                    setNewWard(p.admission.ward);
                                    setShowWardModal(true);
                                }}
                                className="flex-1 bg-white/5 text-white font-bold py-3 rounded-2xl border border-white/10 hover:bg-white/10 transition flex items-center justify-center gap-2"
                            >
                                <ArrowRightLeft size={16} /> Ward
                            </button>
                            <button
                                onClick={() => handleBillPreview(p)}
                                className="flex-[2] bg-emerald-500 text-black font-bold py-3 rounded-2xl hover:bg-emerald-400 transition"
                            >
                                Bill & Discharge
                            </button>
                        </div>
                    </div>
                ))}
                {patients.length === 0 && (
                    <div className="col-span-full py-12 text-center text-gray-500 bg-white/5 rounded-3xl border border-dashed border-white/10">
                        No patients are currently admitted to this hospital.
                    </div>
                )}
            </div>

            {/* Billing Modal */}
            {billPreview && (
                <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-[#0e1117] border border-white/10 rounded-[32px] w-full max-w-2xl overflow-hidden shadow-2xl">
                        <div className="p-8 border-b border-white/10 flex justify-between items-center">
                            <div>
                                <h2 className="text-2xl font-bold text-white tracking-tight">Final Settlement</h2>
                                <p className="text-sm text-gray-400 mt-1">Discharge summary for {billPreview.patient.name}</p>
                            </div>
                            <button onClick={() => setBillPreview(null)} className="text-gray-500 hover:text-white transition">
                                <X size={24} />
                            </button>
                        </div>

                        <div className="p-8 space-y-6">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
                                    <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mb-1">Stay Duration</p>
                                    <p className="text-white font-bold">{billPreview.patient.days} Day(s)</p>
                                </div>
                                <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
                                    <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mb-1">Ward Type</p>
                                    <p className="text-white font-bold">{billPreview.patient.ward}</p>
                                </div>
                            </div>

                            <div className="space-y-3">
                                <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">Cost Breakdown</p>
                                {billPreview.summary.map((item, idx) => (
                                    <div key={idx} className="flex justify-between items-center py-3 border-b border-white/5 last:border-0">
                                        <div className="flex items-center gap-3">
                                            <div className={`p-2 rounded-lg ${
                                                item.type === 'ward' ? 'bg-blue-500/10 text-blue-400' : 
                                                item.type === 'lab_test' ? 'bg-amber-500/10 text-amber-400' : 
                                                item.type === 'consultancy' ? 'bg-emerald-500/10 text-emerald-400' :
                                                'bg-purple-500/10 text-purple-400'
                                            }`}>
                                                {item.type === 'ward' ? <Building2 size={16} /> : 
                                                 item.type === 'lab_test' ? <Activity size={16} /> : 
                                                 item.type === 'consultancy' ? <UserCog size={16} /> :
                                                 <FileText size={16} />}
                                            </div>
                                            <span className="text-sm text-gray-300">{item.name}</span>
                                        </div>
                                        <span className="font-bold text-white">₹{item.cost.toLocaleString()}</span>
                                    </div>
                                ))}
                            </div>

                            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-6 flex justify-between items-center">
                                <span className="text-emerald-400 font-bold uppercase tracking-widest">Total Payable</span>
                                <span className="text-3xl font-black text-white">₹{billPreview.total.toLocaleString()}</span>
                            </div>
                        </div>

                        <div className="p-8 bg-black/20 flex gap-4">
                            <button onClick={() => setBillPreview(null)} className="flex-1 py-4 rounded-2xl border border-white/10 font-bold text-gray-400 hover:bg-white/5 transition">
                                Cancel
                            </button>
                            <button 
                                onClick={handleDischarge}
                                disabled={discharging}
                                className="flex-1 bg-emerald-500 text-black py-4 rounded-2xl font-black uppercase tracking-widest hover:bg-emerald-400 transition flex items-center justify-center gap-2"
                            >
                                {discharging ? <Loader2 className="animate-spin" size={20} /> : <CheckCircle size={20} />}
                                Finalize & Discharge
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Change Ward Modal */}
            {showWardModal && (
                <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-[#0e1117] border border-white/10 rounded-[32px] w-full max-w-md overflow-hidden shadow-2xl">
                        <div className="p-8 border-b border-white/10 flex justify-between items-center">
                            <div>
                                <h2 className="text-xl font-bold text-white tracking-tight">Transfer Ward</h2>
                                <p className="text-sm text-gray-400 mt-1">Move {selectedPatient?.name} to a different ward</p>
                            </div>
                            <button onClick={() => setShowWardModal(false)} className="text-gray-500 hover:text-white transition">
                                <X size={24} />
                            </button>
                        </div>

                        <div className="p-8 space-y-6">
                            <div className="space-y-2">
                                <label className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">Select New Ward</label>
                                <select
                                    value={newWard}
                                    onChange={(e) => setNewWard(e.target.value)}
                                    className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3.5 text-sm text-white outline-none focus:border-emerald-500/40"
                                >
                                    <option value="General">General Ward</option>
                                    <option value="ICU">ICU</option>
                                    <option value="Emergency">Emergency</option>
                                    <option value="Pediatric">Pediatric</option>
                                    <option value="Surgical">Surgical</option>
                                    <option value="Deluxe">Deluxe Room</option>
                                    <option value="Semi-Private">Semi-Private</option>
                                    <option value="Private">Private Room</option>
                                    <option value="Isolation">Isolation</option>
                                    <option value="NICU">NICU</option>
                                </select>
                            </div>

                            <div className="bg-blue-500/5 border border-blue-500/10 p-4 rounded-2xl flex items-start gap-3">
                                <Activity size={18} className="text-blue-400 shrink-0 mt-0.5" />
                                <p className="text-xs text-blue-300/80 leading-relaxed">
                                    Changing the ward will accurately track the duration spent in the current ward for final billing purposes.
                                </p>
                            </div>
                        </div>

                        <div className="p-8 bg-black/20 flex gap-4">
                            <button onClick={() => setShowWardModal(false)} className="flex-1 py-4 rounded-2xl border border-white/10 font-bold text-gray-400 hover:bg-white/5 transition">
                                Cancel
                            </button>
                            <button 
                                onClick={handleChangeWard}
                                disabled={changingWard}
                                className="flex-1 bg-white text-black py-4 rounded-2xl font-black uppercase tracking-widest hover:bg-gray-200 transition flex items-center justify-center gap-2"
                            >
                                {changingWard ? <Loader2 className="animate-spin" size={20} /> : <CheckCircle size={20} />}
                                Confirm Move
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

const PricingField = ({ field, pricingData, setPricingData }) => (
    <div className="space-y-2">
        <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">{field.label}</label>
        <div className="relative group">
            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-emerald-500/40 group-focus-within:text-emerald-500 transition-colors">
                <span className="text-sm font-bold">₹</span>
            </div>
            <input
                type="number"
                min="0"
                required
                className="w-full bg-white/5 border border-white/5 rounded-2xl pl-10 pr-4 py-3.5 text-sm text-white focus:outline-none focus:border-emerald-500/50 focus:bg-emerald-500/[0.02] transition-all"
                value={pricingData[field.key]}
                onChange={(e) => setPricingData({ ...pricingData, [field.key]: e.target.value })}
                placeholder="0"
            />
        </div>
    </div>
);

const HospitalBillingView = () => {
    const { user, setUser } = useAuth();
    const [bills, setBills] = useState([]);
    const [loading, setLoading] = useState(true);
    const [payingId, setPayingId] = useState('');
    const [statusFilter, setStatusFilter] = useState('all'); // 'all', 'pending', 'paid'
    const [showPricingModal, setShowPricingModal] = useState(false);
    const [isSavingPricing, setIsSavingPricing] = useState(false);
    
    const [pricingData, setPricingData] = useState({
        general: user?.hospitalPricing?.general ?? 1000,
        icu: user?.hospitalPricing?.icu ?? 5000,
        emergency: user?.hospitalPricing?.emergency ?? 3000,
        pediatric: user?.hospitalPricing?.pediatric ?? 1500,
        surgical: user?.hospitalPricing?.surgical ?? 2500,
        deluxe: user?.hospitalPricing?.deluxe ?? 4000,
        semiPrivate: user?.hospitalPricing?.semiPrivate ?? 2000,
        private: user?.hospitalPricing?.private ?? 3000,
        isolation: user?.hospitalPricing?.isolation ?? 3500,
        nicu: user?.hospitalPricing?.nicu ?? 5500,
        doctorFee: user?.hospitalPricing?.doctorFee ?? 500,
        nursing: user?.hospitalPricing?.nursing ?? 300,
        rmoFee: user?.hospitalPricing?.rmoFee ?? 200,
        physiotherapy: user?.hospitalPricing?.physiotherapy ?? 800,
        otCharges: user?.hospitalPricing?.otCharges ?? 10000,
        laborRoom: user?.hospitalPricing?.laborRoom ?? 8000,
        ambulance: user?.hospitalPricing?.ambulance ?? 1500,
        ambulanceAdvanced: user?.hospitalPricing?.ambulanceAdvanced ?? 3000,
        dialysis: user?.hospitalPricing?.dialysis ?? 2500,
        xray: user?.hospitalPricing?.xray ?? 500,
        ecg: user?.hospitalPricing?.ecg ?? 300,
        ultrasound: user?.hospitalPricing?.ultrasound ?? 1200,
        ctScan: user?.hospitalPricing?.ctScan ?? 4500,
        mri: user?.hospitalPricing?.mri ?? 7000,
        registration: user?.hospitalPricing?.registration ?? 200,
        pharmacyHandling: user?.hospitalPricing?.pharmacyHandling ?? 50,
    });

    useEffect(() => {
        if (user?.hospitalPricing) {
            setPricingData({
                general: user.hospitalPricing.general ?? 1000,
                icu: user.hospitalPricing.icu ?? 5000,
                emergency: user.hospitalPricing.emergency ?? 3000,
                pediatric: user.hospitalPricing.pediatric ?? 1500,
                surgical: user.hospitalPricing.surgical ?? 2500,
                deluxe: user.hospitalPricing.deluxe ?? 4000,
                semiPrivate: user.hospitalPricing.semiPrivate ?? 2000,
                private: user.hospitalPricing.private ?? 3000,
                isolation: user.hospitalPricing.isolation ?? 3500,
                nicu: user.hospitalPricing.nicu ?? 5500,
                doctorFee: user.hospitalPricing.doctorFee ?? 500,
                nursing: user.hospitalPricing.nursing ?? 300,
                rmoFee: user.hospitalPricing.rmoFee ?? 200,
                physiotherapy: user.hospitalPricing.physiotherapy ?? 800,
                otCharges: user.hospitalPricing.otCharges ?? 10000,
                laborRoom: user.hospitalPricing.laborRoom ?? 8000,
                ambulance: user.hospitalPricing.ambulance ?? 1500,
                ambulanceAdvanced: user.hospitalPricing.ambulanceAdvanced ?? 3000,
                dialysis: user.hospitalPricing.dialysis ?? 2500,
                xray: user.hospitalPricing.xray ?? 500,
                ecg: user.hospitalPricing.ecg ?? 300,
                ultrasound: user.hospitalPricing.ultrasound ?? 1200,
                ctScan: user.hospitalPricing.ctScan ?? 4500,
                mri: user.hospitalPricing.mri ?? 7000,
                registration: user.hospitalPricing.registration ?? 200,
                pharmacyHandling: user.hospitalPricing.pharmacyHandling ?? 50,
            });
        }
    }, [user?.hospitalPricing]);

    const handleSavePricing = async (e) => {
        e.preventDefault();
        setIsSavingPricing(true);
        try {
            const formData = new FormData();
            formData.append('generalWardPrice', pricingData.general);
            formData.append('icuPrice', pricingData.icu);
            formData.append('emergencyPrice', pricingData.emergency);
            formData.append('pediatricPrice', pricingData.pediatric);
            formData.append('surgicalPrice', pricingData.surgical);
            formData.append('deluxePrice', pricingData.deluxe);
            formData.append('semiPrivatePrice', pricingData.semiPrivate);
            formData.append('privatePrice', pricingData.private);
            formData.append('isolationPrice', pricingData.isolation);
            formData.append('nicuPrice', pricingData.nicu);
            formData.append('doctorFee', pricingData.doctorFee);
            formData.append('nursingPrice', pricingData.nursing);
            formData.append('rmoFeePrice', pricingData.rmoFee);
            formData.append('physiotherapyPrice', pricingData.physiotherapy);
            formData.append('otChargesPrice', pricingData.otCharges);
            formData.append('laborRoomPrice', pricingData.laborRoom);
            formData.append('ambulancePrice', pricingData.ambulance);
            formData.append('ambulanceAdvancedPrice', pricingData.ambulanceAdvanced);
            formData.append('dialysisPrice', pricingData.dialysis);
            formData.append('xrayPrice', pricingData.xray);
            formData.append('ecgPrice', pricingData.ecg);
            formData.append('ultrasoundPrice', pricingData.ultrasound);
            formData.append('ctScanPrice', pricingData.ctScan);
            formData.append('mriPrice', pricingData.mri);
            formData.append('registrationPrice', pricingData.registration);
            formData.append('pharmacyHandlingPrice', pricingData.pharmacyHandling);

            const res = await updateProfile(formData);
            if (res.success) {
                const updatedUser = { ...user, ...res.user };
                setUser(updatedUser);
                localStorage.setItem('user', JSON.stringify(updatedUser));
                setShowPricingModal(false);
                window.alert('Hospital pricing updated successfully!');
            }
        } catch (err) {
            console.error('Failed to update pricing:', err);
            window.alert('Failed to update hospital pricing.');
        } finally {
            setIsSavingPricing(false);
        }
    };

    const loadBilling = async () => {
        try {
            setLoading(true);
            const res = await fetchBillingHistory();
            if (res.success) setBills(res.data);
        } catch (err) {
            console.error('Failed to load billing history:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadBilling();
    }, []);

    const handleMarkAsPaid = async (billId) => {
        try {
            setPayingId(billId);
            const res = await markBillAsPaid(billId);
            if (res.success) {
                setBills(current => current.map(b => b._id === billId ? { ...b, status: 'paid' } : b));
            }
        } catch (err) {
            window.alert('Failed to update payment status');
        } finally {
            setPayingId('');
        }
    };

    const downloadBillPDF = (bill) => {
        const hospitalName = bill.hospitalName?.toUpperCase() || 'HOLY CROSS MULTI-SPECIALITY HOSPITAL';
        const patientName = bill.patientId?.name || 'PATIENT';
        const date = new Date(bill.createdAt).toLocaleDateString('en-GB');
        
        const line = `────────────────────────────────────────────────────────────────────────`;
        const pad = (str, len) => str.toString().padEnd(len, ' ');
        const padR = (str, len) => str.toString().padStart(len, ' ');

        const lines = [
            ` `,
            `                    ${hospitalName}`,
            `           12/A Clinical Valley, Healthcare District - 560001`,
            `               Contact: +91 80 4422 1100 | www.hcms.com`,
            line,
            `                        OFFICIAL HOSPITAL BILL                    `,
            line,
            ` `,
            ` INVOICE NO:  #INV-${bill._id?.slice(-8).toUpperCase().padEnd(20, ' ')} DATE: ${date}`,
            ` PATIENT:     ${pad(patientName.toUpperCase(), 25)} STATUS: ${bill.status.toUpperCase()}`,
            ` EMAIL:       ${pad(bill.patientId?.email || 'N/A', 25)}`,
            ` `,
            ` ITEM / DESCRIPTION                                   AMOUNT(INR)`,
            line,
            ...(bill.items || []).map((item, i) => {
                const index = (i + 1).toString().padStart(2, '0');
                const name = pad(item.name?.substring(0, 45) || 'Hospital Service', 50);
                const amt = padR('₹ ' + (parseFloat(item.cost) || 0).toFixed(2), 11);
                return ` [${index}] ${name} ${amt}`;
            }),
            ` `,
            line,
            ` FINANCIAL SUMMARY                                    TOTAL(INR)`,
            line,
            ` SUB-TOTAL                                              ${padR('₹ ' + bill.amount.toFixed(2), 11)}`,
            ` TAX (0% GST)                                           ${padR('₹ 0.00', 11)}`,
            ` `,
            ` GRAND TOTAL PAYABLE                                    ${padR('₹ ' + bill.amount.toFixed(2), 11)}`,
            line,
            ` `,
            ` Generated via MediCare Hospital Management System.`,
            ` This is a computer-generated document. No signature required.`,
            ` `
        ];

        const text = lines.join('\n');
        const blob = new Blob([text], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Bill_${patientName.replace(/\s+/g, '_')}_${bill._id?.slice(-6).toUpperCase()}.txt`;
        a.click();
        URL.revokeObjectURL(url);
    };

    if (loading) return <Loader message="Loading billing history" />;

    const sortedBills = [...bills].sort((a, b) => {
        if (a.status === 'pending' && b.status === 'paid') return -1;
        if (a.status === 'paid' && b.status === 'pending') return 1;
        return new Date(b.createdAt) - new Date(a.createdAt);
    });

    const filteredBills = sortedBills.filter(bill => 
        statusFilter === 'all' ? true : bill.status === statusFilter
    );

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-end gap-4 mb-4">
                <div className="flex-1">
                    <button
                        onClick={() => setShowPricingModal(true)}
                        className="inline-flex items-center gap-2 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 px-5 py-3 text-sm font-black uppercase tracking-widest text-emerald-400 transition-all hover:bg-emerald-500/20"
                    >
                        <IndianRupee size={16} /> Pricing Configuration
                    </button>
                </div>
                <div className="flex gap-2">
                    {['all', 'pending', 'paid'].map(status => (
                        <button
                            key={status}
                            onClick={() => setStatusFilter(status)}
                            className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                                statusFilter === status 
                                ? 'bg-emerald-500 text-black shadow-lg shadow-emerald-500/20' 
                                : 'bg-white/5 text-gray-400 hover:bg-white/10'
                            }`}
                        >
                            {status}
                        </button>
                    ))}
                </div>
            </div>

            {/* Pricing Configuration Modal */}
            <AnimatePresence>
                {showPricingModal && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto"
                    >
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0, y: 20 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.95, opacity: 0, y: 20 }}
                            className="bg-[#0e1117] border border-white/10 rounded-[32px] w-full max-w-xl overflow-hidden shadow-2xl my-auto"
                        >
                            <div className="p-8 border-b border-white/10 flex justify-between items-center bg-gradient-to-r from-emerald-500/5 to-transparent">
                                <div>
                                    <h2 className="text-2xl font-black text-white tracking-tight flex items-center gap-3">
                                        <IndianRupee className="text-emerald-500" /> Hospital Pricing
                                    </h2>
                                    <p className="text-sm text-gray-500 mt-1 font-medium">Set your daily ward rates and consultation fees</p>
                                </div>
                                <button 
                                    onClick={() => setShowPricingModal(false)}
                                    className="h-10 w-10 flex items-center justify-center rounded-xl bg-white/5 text-gray-500 hover:text-white hover:bg-white/10 transition-all"
                                >
                                    <X size={20} />
                                </button>
                            </div>

                            <form onSubmit={handleSavePricing} className="p-8 space-y-8 max-h-[70vh] overflow-y-auto custom-scrollbar">
                                {/* Wards Section */}
                                <div className="space-y-4">
                                    <h3 className="text-xs font-black text-emerald-500 uppercase tracking-[0.2em] border-b border-white/5 pb-2">Wards & Rooms (Per Day)</h3>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        {[
                                            { key: 'general', label: 'General Ward' },
                                            { key: 'icu', label: 'ICU Ward' },
                                            { key: 'emergency', label: 'Emergency' },
                                            { key: 'pediatric', label: 'Pediatric' },
                                            { key: 'surgical', label: 'Surgical' },
                                            { key: 'deluxe', label: 'Deluxe Room' },
                                            { key: 'semiPrivate', label: 'Semi-Private' },
                                            { key: 'private', label: 'Private Room' },
                                            { key: 'isolation', label: 'Isolation' },
                                            { key: 'nicu', label: 'NICU' },
                                        ].map((field) => (
                                            <PricingField key={field.key} field={field} pricingData={pricingData} setPricingData={setPricingData} />
                                        ))}
                                    </div>
                                </div>

                                {/* Professional Fees */}
                                <div className="space-y-4">
                                    <h3 className="text-xs font-black text-blue-500 uppercase tracking-[0.2em] border-b border-white/5 pb-2">Professional Fees</h3>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        {[
                                            { key: 'doctorFee', label: 'Doctor Fee / Day' },
                                            { key: 'nursing', label: 'Nursing / Day' },
                                            { key: 'rmoFee', label: 'RMO Fee / Day' },
                                            { key: 'physiotherapy', label: 'Physiotherapy' },
                                        ].map((field) => (
                                            <PricingField key={field.key} field={field} pricingData={pricingData} setPricingData={setPricingData} />
                                        ))}
                                    </div>
                                </div>

                                {/* Services */}
                                <div className="space-y-4">
                                    <h3 className="text-xs font-black text-amber-500 uppercase tracking-[0.2em] border-b border-white/5 pb-2">Services & Procedures</h3>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        {[
                                            { key: 'otCharges', label: 'OT Charges' },
                                            { key: 'laborRoom', label: 'Labor Room' },
                                            { key: 'ambulance', label: 'Ambulance (Basic)' },
                                            { key: 'ambulanceAdvanced', label: 'Ambulance (Cardiac)' },
                                            { key: 'dialysis', label: 'Dialysis' },
                                        ].map((field) => (
                                            <PricingField key={field.key} field={field} pricingData={pricingData} setPricingData={setPricingData} />
                                        ))}
                                    </div>
                                </div>

                                {/* Diagnostics */}
                                <div className="space-y-4">
                                    <h3 className="text-xs font-black text-purple-500 uppercase tracking-[0.2em] border-b border-white/5 pb-2">Diagnostics (Base)</h3>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        {[
                                            { key: 'xray', label: 'X-Ray' },
                                            { key: 'ecg', label: 'ECG' },
                                            { key: 'ultrasound', label: 'Ultrasound' },
                                            { key: 'ctScan', label: 'CT Scan' },
                                            { key: 'mri', label: 'MRI' },
                                        ].map((field) => (
                                            <PricingField key={field.key} field={field} pricingData={pricingData} setPricingData={setPricingData} />
                                        ))}
                                    </div>
                                </div>

                                {/* Administrative */}
                                <div className="space-y-4">
                                    <h3 className="text-xs font-black text-rose-500 uppercase tracking-[0.2em] border-b border-white/5 pb-2">Administrative</h3>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        {[
                                            { key: 'registration', label: 'Admission Fee' },
                                            { key: 'pharmacyHandling', label: 'Pharmacy Handling' },
                                        ].map((field) => (
                                            <PricingField key={field.key} field={field} pricingData={pricingData} setPricingData={setPricingData} />
                                        ))}
                                    </div>
                                </div>

                                <div className="flex gap-4 pt-6 sticky bottom-0 bg-[#0e1117] pb-2 border-t border-white/5 mt-4">
                                    <button
                                        type="button"
                                        onClick={() => setShowPricingModal(false)}
                                        className="flex-1 py-4 rounded-2xl border border-white/5 font-black uppercase tracking-widest text-xs text-gray-500 hover:bg-white/5 transition-all"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={isSavingPricing}
                                        className="flex-[2] bg-emerald-500 text-black py-4 rounded-2xl font-black uppercase tracking-widest text-xs transition-all hover:bg-emerald-400 hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-2 disabled:opacity-50"
                                    >
                                        {isSavingPricing ? (
                                            <Loader2 size={18} className="animate-spin" />
                                        ) : (
                                            <CheckCircle size={18} />
                                        )}
                                        Save Configuration
                                    </button>
                                </div>
                            </form>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            <div className="overflow-hidden rounded-3xl border border-white/10 bg-[#101317]">
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-white/10 text-left">
                        <thead className="bg-black/20 text-xs uppercase tracking-[0.2em] text-gray-500">
                            <tr>
                                <th className="px-5 py-4">Patient</th>
                                <th className="px-5 py-4">Settlement Date</th>
                                <th className="px-5 py-4">Total Amount</th>
                                <th className="px-5 py-4">Status</th>
                                <th className="px-5 py-4 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/10 text-sm">
                            {filteredBills.map((bill) => (
                                <tr key={bill._id} className="hover:bg-white/[0.02]">
                                    <td className="px-5 py-4">
                                        <p className="font-semibold text-white">{bill.patientId?.name || 'Unknown Patient'}</p>
                                        <p className="mt-1 text-xs text-gray-500">{bill.patientId?.email}</p>
                                    </td>
                                    <td className="px-5 py-4 text-gray-300">
                                        {new Date(bill.createdAt).toLocaleDateString(undefined, {
                                            day: 'numeric',
                                            month: 'short',
                                            year: 'numeric',
                                            hour: '2-digit',
                                            minute: '2-digit'
                                        })}
                                    </td>
                                    <td className="px-5 py-4 font-bold text-emerald-400">
                                        ₹{bill.amount.toLocaleString()}
                                    </td>
                                    <td className="px-5 py-4">
                                        <span className={`inline-flex rounded-full border px-3 py-1 text-[11px] font-bold uppercase ${
                                            bill.status === 'paid' 
                                            ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300' 
                                            : 'border-amber-500/20 bg-amber-500/10 text-amber-300'
                                        }`}>
                                            {bill.status}
                                        </span>
                                    </td>
                                    <td className="px-5 py-4 text-right">
                                        <div className="flex items-center justify-end gap-3">
                                            <button
                                                onClick={() => downloadBillPDF(bill)}
                                                className="p-2 rounded-xl bg-white/5 text-gray-400 hover:text-white hover:bg-white/10 transition"
                                                title="Download Bill"
                                            >
                                                <Download size={16} />
                                            </button>
                                            
                                            {bill.status === 'pending' && (
                                                <button
                                                    onClick={() => handleMarkAsPaid(bill._id)}
                                                    disabled={payingId === bill._id}
                                                    className="bg-emerald-500 text-black px-4 py-1.5 rounded-xl text-xs font-bold hover:bg-emerald-400 transition flex items-center gap-2 disabled:opacity-50"
                                                >
                                                    {payingId === bill._id ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
                                                    Mark Paid
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                {filteredBills.length === 0 && (
                    <div className="px-5 py-20 text-center">
                        <CreditCard size={48} className="text-gray-700 mx-auto mb-4" />
                        <h3 className="text-xl font-bold text-white">No Bills Found</h3>
                        <p className="text-gray-500 mt-2 max-w-sm mx-auto">Try changing the filter or discharge a patient to see their settlement records here.</p>
                    </div>
                )}
            </div>
        </div>
    );
};

const SidebarItem = ({ icon: Icon, label, active = false, onClick }) => (
    <motion.button
        whileHover={{ x: 4 }}
        whileTap={{ scale: 0.98 }}
        type="button"
        onClick={onClick}
        className={`flex w-full items-center gap-3 rounded-2xl px-4 py-3.5 text-sm font-bold transition-all duration-300 ${
            active 
            ? 'bg-emerald-500/10 text-emerald-400 shadow-[inset_0_0_12px_rgba(16,185,129,0.05)] border border-emerald-500/20' 
            : 'text-gray-500 hover:bg-white/[0.03] hover:text-gray-200'
        }`}
    >
        <Icon size={18} strokeWidth={active ? 2.5 : 2} className={active ? 'text-emerald-400' : 'text-gray-500'} />
        <span className="tracking-tight">{label}</span>
        {active && (
            <motion.div 
                layoutId="sidebar-active"
                className="ml-auto h-1.5 w-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]" 
            />
        )}
    </motion.button>
);

const StatCard = ({ title, value, icon: Icon, tone, label, trend }) => {
    const tones = {
        blue: { bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/20', shadow: 'shadow-blue-500/5' },
        emerald: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/20', shadow: 'shadow-emerald-500/5' },
        amber: { bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/20', shadow: 'shadow-amber-500/5' },
        rose: { bg: 'bg-rose-500/10', text: 'text-rose-400', border: 'border-rose-500/20', shadow: 'shadow-rose-500/5' },
    };
    const t = tones[tone] || tones.blue;

    return (
        <motion.div 
            whileHover={{ y: -5 }}
            className={`relative overflow-hidden rounded-[32px] border ${t.border} bg-[#0a0c12] p-6 transition-all hover:shadow-2xl ${t.shadow} group`}
        >
            <div className="flex items-start justify-between">
                <div className={`rounded-2xl border ${t.border} ${t.bg} p-3.5 ${t.text} transition-transform group-hover:scale-110 duration-500`}>
                    <Icon size={22} strokeWidth={2.5} />
                </div>
                {/* Micro trend visual */}
                {trend && (
                    <div className="h-8 w-16 bg-white/5 rounded-lg border border-white/5 relative overflow-hidden">
                        <div className={`absolute bottom-0 left-0 right-0 h-1/2 ${t.bg} blur-xl`} />
                        <TrendingUp size={12} className={`absolute center m-auto inset-0 ${t.text} opacity-40`} />
                    </div>
                )}
            </div>
            <div className="mt-6">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-600">{title}</p>
                <div className="flex items-baseline gap-2 mt-1">
                    <p className="text-3xl font-black text-white tracking-tight">{value}</p>
                    {trend && <span className={`text-[10px] font-bold ${trend.startsWith('-') ? 'text-rose-500' : 'text-emerald-500'}`}>{trend}</span>}
                </div>
                {label && <p className="mt-2 text-xs text-gray-500 font-medium line-clamp-1">{label}</p>}
            </div>
            {/* Gloss effect */}
            <div className="absolute top-0 right-0 -mr-16 -mt-16 h-32 w-32 rounded-full bg-white/5 blur-3xl" />
        </motion.div>
    );
};

const MetricBlock = ({ label, value, helper, trend, inverse }) => (
    <motion.div 
        whileHover={{ scale: 1.02 }}
        className="relative overflow-hidden rounded-[24px] border border-white/5 bg-[#0a0c12] p-5 group"
    >
        <div className="flex justify-between items-start mb-4">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-600">{label}</p>
            {trend && (
                <span className={`text-[10px] font-black px-2 py-0.5 rounded-md ${inverse ? 'bg-rose-500/10 text-rose-500' : 'bg-emerald-500/10 text-emerald-500'}`}>
                    {trend}
                </span>
            )}
        </div>
        <p className="text-3xl font-black text-white tracking-tight">{value}</p>
        <p className="mt-1 text-[11px] text-gray-500 font-medium">{helper}</p>
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
    </motion.div>
);

const RoleBadge = ({ role }) => {
    const tone = {
        admin: 'bg-purple-500/10 text-purple-300 border-purple-500/20',
        doctor: 'bg-blue-500/10 text-blue-300 border-blue-500/20',
        pharmacist: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20',
        lab_technician: 'bg-amber-500/10 text-amber-300 border-amber-500/20',
        delivery: 'bg-rose-500/10 text-rose-300 border-rose-500/20',
        patient: 'bg-slate-500/10 text-slate-300 border-slate-500/20',
    }[role] || 'bg-white/10 text-white border-white/10';

    return (
        <span className={`inline-flex rounded-full border px-3 py-1 text-[11px] font-bold uppercase ${tone}`}>
            {role}
        </span>
    );
};

const StatusBadge = ({ label, active }) => {
    const status = (label || '').toLowerCase();

    let classes = 'border-amber-500/20 bg-amber-500/10 text-amber-300';
    if (status === 'confirmed' || status === 'active' || active === true) {
        classes = 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300';
    } else if (status === 'failed' || status === 'unknown' || active === false) {
        classes = 'border-red-500/20 bg-red-500/10 text-red-200';
    } else if (status === 'wait-sync' || status === 'pending') {
        classes = 'border-amber-500/20 bg-amber-500/10 text-amber-300';
    }

    return (
        <span className={`inline-flex rounded-full border px-3 py-1 text-[11px] font-bold uppercase ${classes}`}>
            {label}
        </span>
    );
};

const InfoTile = ({ label, value }) => (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
        <p className="text-[11px] uppercase tracking-[0.2em] text-gray-500">{label}</p>
        <p className="mt-2 text-sm font-semibold text-white">{value}</p>
    </div>
);

const ErrorPanel = ({ message, onRetry }) => (
    <div className="rounded-3xl border border-red-500/20 bg-red-500/10 p-6">
        <p className="text-base font-semibold text-red-200">{message}</p>
        <button
            type="button"
            onClick={onRetry}
            className="mt-4 inline-flex items-center gap-2 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-2 text-sm font-semibold text-red-100 hover:bg-red-500/20"
        >
            <RefreshCw size={15} /> Retry
        </button>
    </div>
);

const EmptyPanel = ({ title, description }) => (
    <div className="rounded-3xl border border-dashed border-white/10 bg-[#101317] p-10 text-center">
        <FileCheck2 className="mx-auto text-gray-700" size={34} />
        <h3 className="mt-4 text-lg font-semibold text-white">{title}</h3>
        <p className="mt-2 text-sm text-gray-500">{description}</p>
    </div>
);

export default HospitalAdminDashboard;

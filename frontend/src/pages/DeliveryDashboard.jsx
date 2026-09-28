import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
    Truck, CheckCircle, Clock, MapPin, Package, Shield, LayoutGrid, Settings, User, Navigation, LogOut, Loader2
} from 'lucide-react';
import { fetchMyDeliveries, fetchPendingDeliveries, updateDeliveryStatus, markAsDelivered, fetchDeliveryOverview } from '../services/deliveryApi';
import socket from '../services/socket';
import SettingsView from '../components/ui/SettingsView';
import UniversalSearchBar from '../components/ui/UniversalSearchBar';
import { getBaseUrl } from '../services/userApi';
import NotificationBell from '../components/ui/NotificationBell';
import { useSocketNotifications } from '../hooks/useSocketNotifications';

const DeliveryDashboard = () => {
    const { user, logout } = useAuth();
    const [notificationCount, resetNotifications, , notifications, markNotificationRead] = useSocketNotifications({ userId: user?.id, hospitalName: user?.hospitalName, notificationPrefs: user?.notificationPreferences });
    const [activeTab, setActiveTab] = useState('overview');
    const location = useLocation();

    useEffect(() => {
        const params = new URLSearchParams(location.search);
        const tab = params.get('tab');
        if (tab) {
            setActiveTab(tab);
        }
    }, [location]);

    const [loadingData, setLoadingData] = useState(true);
    const [myDeliveries, setMyDeliveries] = useState([]);
    const [pendingDeliveries, setPendingDeliveries] = useState([]);
    const [stats, setStats] = useState({
        activeCount: 0,
        inTransitCount: 0,
        deliveredTodayCount: 0,
        estTime: "0h"
    });
    const [statusLoadingId, setStatusLoadingId] = useState(null);

    const loadData = async () => {
        try {
            const [myRes, pendingRes, overviewRes] = await Promise.all([
                fetchMyDeliveries(),
                fetchPendingDeliveries(),
                fetchDeliveryOverview()
            ]);

            if (myRes.success) setMyDeliveries(myRes.data);
            if (pendingRes.success) setPendingDeliveries(pendingRes.data);
            if (overviewRes.success) setStats(overviewRes.data);
        } catch (error) {
            console.error("Error loading delivery data:", error);
        } finally {
            setLoadingData(false);
        }
    };

    useEffect(() => {
        loadData();

        if (!socket.connected) {
            socket.connect();
        }

        socket.emit('join-room', user?.id?.toString());
        socket.emit('join-hospital-room', user?.hospitalName || 'General');

        const assignmentEvent = `new-delivery-assigned-${user?.id}`;
        socket.on(assignmentEvent, (data) => {
            console.log('New personal delivery assigned:', data);
            loadData();
        });

        socket.on('delivery-assigned', (data) => {
            console.log('New general delivery assigned:', data);
            loadData();
        });

        socket.on('delivery-status-updated', (data) => {
            console.log('Delivery status updated via socket:', data);
            loadData();
        });

        return () => {
            socket.off(assignmentEvent);
            socket.off('delivery-assigned');
            socket.off('delivery-status-updated');
            socket.disconnect();
        };
    }, []);

    const handleUpdateStatus = async (id, status) => {
        setStatusLoadingId(id);
        try {
            const res = await updateDeliveryStatus(id, status);
            if (res.success) {
                loadData();
            }
        } catch (error) {
            console.error("Error updating delivery status:", error);
        } finally {
            setStatusLoadingId(null);
        }
    };

    const handleMarkDelivered = async (id) => {
        setStatusLoadingId(id);
        try {
            const res = await markAsDelivered(id);
            if (res.success) {
                loadData();
            }
        } catch (error) {
            console.error("Error marking as delivered:", error);
        } finally {
            setStatusLoadingId(null);
        }
    };

    // ── GPS Tracking Logic ──
    useEffect(() => {
        if (!user || user.role !== 'delivery') return;

        let watchId;
        const emitLocation = (coords) => {
            const currentDelivery = myDeliveries.find(d => d.status === 'in_transit') || myDeliveries.find(d => d.status === 'picked');
            if (!currentDelivery || !coords) return;

            socket.emit('update-delivery-location', {
                deliveryStaffId: user.id,
                hospitalName: user.hospitalName || 'General',
                coords: { lat: coords.latitude, lng: coords.longitude },
                timestamp: new Date(),
                deliveryId: currentDelivery._id?.toString(),
                trackingId: currentDelivery.trackingId,
                status: currentDelivery.status || 'in_transit',
                patientId: currentDelivery.patientId?.toString(),
            });
        };

        const startTracking = () => {
            if ("geolocation" in navigator) {
                navigator.geolocation.getCurrentPosition(
                    (position) => emitLocation(position.coords),
                    (error) => console.error("GPS Error:", error),
                    { enableHighAccuracy: true, maximumAge: 10000, timeout: 5000 }
                );

                watchId = navigator.geolocation.watchPosition(
                    (position) => emitLocation(position.coords),
                    (error) => console.error("GPS Error:", error),
                    { enableHighAccuracy: true, maximumAge: 2000, timeout: 7000 }
                );
            }
        };

        startTracking();
        return () => {
            if (watchId) navigator.geolocation.clearWatch(watchId);
        };
    }, [user, myDeliveries]);

    return (
        <div className="flex h-screen bg-[#0a0a0a] text-white font-sans overflow-hidden">
            {/* Sidebar */}
            <aside className="w-64 border-r border-gray-800 flex flex-col bg-[#0f1110]">
                <div className="p-6 flex items-center gap-3">
                    <div className="bg-green-500 p-1.5 rounded-lg shadow-sm">
                        <Truck className="w-5 h-5 text-black" />
                    </div>
                    <div>
                        <h1 className="font-bold text-lg tracking-tight">MediCare</h1>
                        <p className="text-[10px] text-green-500 font-bold uppercase tracking-widest truncate max-w-[120px]">
                            {user?.hospitalName || 'Logistics Portal'}
                        </p>
                    </div>
                </div>

                <nav className="flex-1 px-4 space-y-2 mt-4">
                    <NavItem icon={LayoutGrid} label="Dashboard" active={activeTab === 'overview'} onClick={() => setActiveTab('overview')} />
                    <NavItem icon={Package} label="Assigned Deliveries" active={activeTab === 'assigned'} badge={stats.activeCount > 0 ? stats.activeCount.toString() : null} onClick={() => setActiveTab('assigned')} />
                    <NavItem icon={CheckCircle} label="Delivery History" active={activeTab === 'history'} onClick={() => setActiveTab('history')} />
                </nav>

                <div className="p-4 mt-auto space-y-2">
                    <NavItem icon={Settings} label="Settings" active={activeTab === 'settings'} onClick={() => setActiveTab('settings')} />
                    <NavItem icon={LogOut} label="Logout" onClick={logout} />
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 flex flex-col overflow-hidden">
                {/* Header */}
                <header className="h-16 border-b border-gray-800 flex items-center justify-between px-8 bg-[#0a0a0a]">
                    <div className="flex items-center gap-6 flex-1 max-w-3xl">
                        <div className="flex items-center gap-2 text-sm text-green-500 font-medium whitespace-nowrap">
                            <Navigation size={16} /> <span className="hidden lg:inline">GPS Active</span>
                        </div>
                        <UniversalSearchBar />
                    </div>
                    <div className="flex items-center gap-4">
                        <NotificationBell count={notificationCount} notifications={notifications} onClick={resetNotifications} onMarkRead={markNotificationRead} />
                        <div className="flex items-center gap-3 text-right">
                            <div>
                                <p className="text-sm font-bold text-white">{user?.name || 'Driver'}</p>
                                <p className="text-[10px] text-gray-500 uppercase tracking-tighter leading-tight font-medium">{user?.hospitalName || 'Medicare Logistics'}</p>
                                <p className="text-[9px] text-green-500/80 uppercase font-black tracking-widest mt-0.5">{user?.role}</p>
                            </div>
                            <div className="w-10 h-10 rounded-full bg-gray-800 flex items-center justify-center border border-gray-700 overflow-hidden ring-2 ring-green-500/10">
                                {user?.profileImage ? (
                                    <img src={`${getBaseUrl()}/${user.profileImage}`} alt="Profile" className="w-full h-full object-cover" />
                                ) : (
                                    <User size={20} className="text-gray-400" />
                                )}
                            </div>
                        </div>
                    </div>
                </header>

                {/* Dashboard Content */}
                <div className="flex-1 overflow-auto p-8 bg-[#0a0a0a]">
                    {loadingData ? (
                        <div className="flex items-center justify-center h-full">
                            <Loader2 className="animate-spin text-green-500 w-10 h-10" />
                        </div>
                    ) : (
                        <>
                            {activeTab === 'settings' && (
                                <SettingsView />
                            )}
                            {activeTab === 'overview' && (
                                <>
                                    <h2 className="text-3xl font-bold mb-6">Delivery Operations</h2>

                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                                        <StatCard 
                                            icon={Package} 
                                            title="Active Deliveries" 
                                            value={myDeliveries.filter(d => d.status !== 'delivered').length} 
                                            color="text-yellow-500" 
                                            bg="bg-yellow-500/10" 
                                        />
                                        <StatCard 
                                            icon={MapPin} 
                                            title="In Transit" 
                                            value={myDeliveries.filter(d => d.status === 'picked' || d.status === 'in_transit').length} 
                                            color="text-blue-500" 
                                            bg="bg-blue-500/10" 
                                        />
                                        <StatCard 
                                            icon={CheckCircle} 
                                            title="Delivered Today" 
                                            value={myDeliveries.filter(d => d.status === 'delivered' && new Date(d.updatedAt || d.createdAt).toDateString() === new Date().toDateString()).length} 
                                            color="text-green-500" 
                                            bg="bg-green-500/10" 
                                        />
                                        <StatCard 
                                            icon={Clock} 
                                            title="Est. Time" 
                                            value={stats.estTime || "0h"} 
                                            color="text-purple-500" 
                                            bg="bg-purple-500/10" 
                                        />
                                    </div>

                                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                                        <div className="lg:col-span-2 space-y-6">
                                            <div className="bg-[#111] border border-gray-800 rounded-2xl p-6">
                                                <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
                                                    <Package className="text-yellow-500" /> Assigned Deliveries
                                                </h3>
                                                <div className="space-y-4">
                                                    {myDeliveries.filter(d => d.status !== 'delivered').slice(0, 3).map((delivery) => (
                                                        <div key={delivery._id} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-[#1a1a1a] rounded-xl border border-gray-800 gap-4">
                                                            <div className="flex gap-4">
                                                                <div className="w-12 h-12 bg-gray-800 rounded-full flex items-center justify-center border border-gray-700">
                                                                    <MapPin size={24} className="text-blue-500" />
                                                                </div>
                                                                <div>
                                                                    <p className="font-bold flex items-center gap-2">
                                                                        Order #{delivery.trackingId}
                                                                        {delivery.status === 'in_transit' && <span className="bg-blue-500/10 text-blue-500 text-[10px] uppercase font-bold px-2 py-0.5 rounded">In Transit</span>}
                                                                    </p>
                                                                    <p className="text-sm text-gray-400 mt-1">
                                                                        {delivery.deliveryType === 'WARD_DELIVERY' ? `Ward ${delivery.wardNumber}` : 'Hand Over'} • Patient ID: {delivery.patientId}
                                                                    </p>
                                                                    <p className="text-sm text-gray-500 mt-1 flex items-center gap-1">
                                                                        <Shield size={12} className="text-green-500" /> Verification req.
                                                                    </p>
                                                                </div>
                                                            </div>
                                                            <div className="flex flex-col gap-2">
                                                                <button
                                                                    onClick={() => handleMarkDelivered(delivery._id)}
                                                                    disabled={statusLoadingId === delivery._id}
                                                                    className="bg-green-600 hover:bg-green-500 text-white px-6 py-2 rounded-lg font-medium transition-colors whitespace-nowrap shadow-lg disabled:opacity-50"
                                                                >
                                                                    {statusLoadingId === delivery._id ? 'Updating...' : 'Mark Delivered'}
                                                                </button>
                                                                <button
                                                                    onClick={() => handleUpdateStatus(delivery._id, delivery.status === 'in_transit' ? 'picked' : 'in_transit')}
                                                                    disabled={statusLoadingId === delivery._id}
                                                                    className="bg-gray-800 hover:bg-gray-700 text-white px-6 py-2 rounded-lg text-sm font-medium transition-colors border border-gray-700 disabled:opacity-50"
                                                                >
                                                                    {delivery.status === 'in_transit' ? 'Set as Picked' : 'Set In Transit'}
                                                                </button>
                                                            </div>
                                                        </div>
                                                    ))}
                                                    {myDeliveries.filter(d => d.status !== 'delivered').length === 0 && <p className="text-gray-500 text-sm">No active deliveries.</p>}
                                                </div>
                                            </div>
                                        </div>

                                        <div className="lg:col-span-1 space-y-6">
                                            <div className="bg-[#111] border border-gray-800 rounded-2xl p-6">
                                                <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
                                                    <Clock className="text-white" /> Delivery History
                                                </h3>
                                                <div className="space-y-4">
                                                    {myDeliveries.filter(d => d.status === 'delivered').slice(0, 5).map((delivery) => (
                                                        <div key={delivery._id} className="flex items-center gap-3">
                                                            <div className="w-8 h-8 rounded-full bg-green-500/20 flex items-center justify-center border border-green-500/30">
                                                                <CheckCircle size={16} className="text-green-500" />
                                                            </div>
                                                            <div>
                                                                <p className="font-medium text-sm">Order #{delivery.trackingId}</p>
                                                                <p className="text-xs text-gray-500">Delivered • {new Date(delivery.updatedAt).toLocaleTimeString()}</p>
                                                            </div>
                                                        </div>
                                                    ))}
                                                    {myDeliveries.filter(d => d.status === 'delivered').length === 0 && <p className="text-gray-500 text-xs">No delivery history.</p>}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </>
                            )}

                            {activeTab === 'assigned' && (
                                <div className="space-y-6">
                                    <h2 className="text-3xl font-bold mb-6">Assigned Deliveries</h2>
                                    <div className="bg-[#111] border border-gray-800 rounded-2xl p-6">
                                        <div className="space-y-4">
                                            {myDeliveries.filter(d => d.status !== 'delivered').map((delivery) => (
                                                <div key={delivery._id} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-[#1a1a1a] rounded-xl border border-gray-800 gap-4">
                                                    <div className="flex gap-4">
                                                        <div className="w-12 h-12 bg-gray-800 rounded-full flex items-center justify-center border border-gray-700">
                                                            <MapPin size={24} className="text-blue-500" />
                                                        </div>
                                                        <div>
                                                            <p className="font-bold flex items-center gap-2">
                                                                Order #{delivery.trackingId}
                                                                <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded ${delivery.status === 'in_transit' ? 'bg-blue-500/10 text-blue-500' : 'bg-yellow-500/10 text-yellow-500'}`}>
                                                                    {delivery.status.replace('_', ' ')}
                                                                </span>
                                                            </p>
                                                            <p className="text-sm text-gray-400 mt-1">
                                                                Type: {delivery.deliveryType} • Ward: {delivery.wardNumber || 'N/A'}
                                                            </p>
                                                            <p className="text-sm text-gray-500 mt-1">Patient ID: {delivery.patientId}</p>
                                                        </div>
                                                    </div>
                                                    <div className="flex gap-2">
                                                        <button
                                                            onClick={() => handleUpdateStatus(delivery._id, 'in_transit')}
                                                            disabled={statusLoadingId === delivery._id || delivery.status === 'in_transit'}
                                                            className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                                                        >
                                                            Pick Up
                                                        </button>
                                                        <button
                                                            onClick={() => handleMarkDelivered(delivery._id)}
                                                            disabled={statusLoadingId === delivery._id}
                                                            className="bg-green-600 hover:bg-green-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                                                        >
                                                            Deliver
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                            {myDeliveries.filter(d => d.status !== 'delivered').length === 0 && <p className="text-gray-500 text-center py-8">No assigned deliveries.</p>}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {activeTab === 'pending' && (
                                <div className="space-y-6">
                                    <h2 className="text-3xl font-bold mb-6">Pending Requests</h2>
                                    <div className="bg-[#111] border border-gray-800 rounded-2xl p-6">
                                        <div className="space-y-4">
                                            {pendingDeliveries.map((delivery) => (
                                                <div key={delivery._id} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-[#1a1a1a] rounded-xl border border-gray-800 gap-4">
                                                    <div>
                                                        <p className="font-bold">Order #{delivery.trackingId}</p>
                                                        <p className="text-sm text-gray-400 mt-1">Patient ID: {delivery.patientId}</p>
                                                        <p className="text-sm text-gray-500">Location: {delivery.deliveryType} {delivery.wardNumber ? `- Ward ${delivery.wardNumber}` : ''}</p>
                                                    </div>
                                                    {delivery.deliveryStaffId && (delivery.deliveryStaffId.toString() === (user?.id || user?._id)?.toString()) ? (
                                                        <div className="flex gap-2">
                                                            <button
                                                                onClick={() => handleUpdateStatus(delivery._id, 'in_transit')}
                                                                disabled={statusLoadingId === delivery._id}
                                                                className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                                                            >
                                                                Pick Up
                                                            </button>
                                                            <button
                                                                onClick={() => handleMarkDelivered(delivery._id)}
                                                                disabled={statusLoadingId === delivery._id}
                                                                className="bg-green-600 hover:bg-green-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                                                            >
                                                                Complete
                                                            </button>
                                                        </div>
                                                    ) : (
                                                        <button
                                                            onClick={() => handleUpdateStatus(delivery._id, 'assigned')}
                                                            disabled={statusLoadingId === delivery._id}
                                                            className="bg-green-600 hover:bg-green-500 text-white px-6 py-2 rounded-lg font-medium transition-colors disabled:opacity-50"
                                                        >
                                                            Accept Delivery
                                                        </button>
                                                    )}
                                                </div>
                                            ))}
                                            {pendingDeliveries.length === 0 && <p className="text-gray-500 text-center py-8">No pending delivery requests available.</p>}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {activeTab === 'history' && (
                                <div className="space-y-6">
                                    <h2 className="text-3xl font-bold mb-6">Delivery History</h2>
                                    <div className="bg-[#111] border border-gray-800 rounded-2xl p-6">
                                        <div className="space-y-4">
                                            {myDeliveries.filter(d => d.status === 'delivered').map((delivery) => (
                                                <div key={delivery._id} className="flex items-center justify-between p-4 bg-[#1a1a1a] rounded-xl border border-gray-800">
                                                    <div className="flex items-center gap-4">
                                                        <div className="w-10 h-10 rounded-full bg-green-500/10 flex items-center justify-center border border-green-500/20">
                                                            <CheckCircle size={20} className="text-green-500" />
                                                        </div>
                                                        <div>
                                                            <p className="font-bold">Order #{delivery.trackingId}</p>
                                                            <p className="text-sm text-gray-500">Completed on {new Date(delivery.updatedAt).toLocaleDateString()} at {new Date(delivery.updatedAt).toLocaleTimeString()}</p>
                                                        </div>
                                                    </div>
                                                    <span className="bg-green-500/10 text-green-500 text-[10px] uppercase font-bold px-3 py-1 rounded-full">Delivered</span>
                                                </div>
                                            ))}
                                            {myDeliveries.filter(d => d.status === 'delivered').length === 0 && <p className="text-gray-500 text-center py-8">No delivery history available.</p>}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </main>
        </div>
    );
};

const NavItem = ({ icon: Icon, label, active, badge, onClick }) => (
    <button
        onClick={onClick}
        className={`w-full flex items-center justify-between p-3 rounded-xl transition-colors ${active
            ? 'bg-green-500 text-black font-bold shadow-lg shadow-green-900/20'
            : 'text-gray-400 hover:text-white hover:bg-gray-800'
            }`}
    >
        <div className="flex items-center gap-3"><Icon size={20} /><span className="text-sm">{label}</span></div>
        {badge && (
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${active ? 'bg-black/20 text-black' : 'bg-red-500 text-white'}`}>{badge}</span>
        )}
    </button>
);

const StatCard = ({ icon: Icon, title, value, color, bg }) => (
    <div className="bg-[#111] border border-gray-800 rounded-2xl p-6">
        <div className="flex justify-between items-start mb-4">
            <div className={`p-3 rounded-xl ${bg}`}><Icon className={`w-6 h-6 ${color}`} /></div>
        </div>
        <p className="text-gray-400 text-sm font-medium mb-1">{title}</p>
        <h3 className="text-3xl font-bold">{value}</h3>
    </div>
);

export default DeliveryDashboard;

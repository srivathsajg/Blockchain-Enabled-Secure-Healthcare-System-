import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import {
    Pill, ClipboardList, CheckCircle, Package, Archive, Shield, LayoutGrid, Settings, User, Clock, LogOut, Loader2, History, Activity
} from 'lucide-react';
import { fetchPendingOrders, fetchPharmacistOrders, updateOrderStatus, fetchPharmacyOverview } from '../services/pharmacyApi';
import socket from '../services/socket';
import { useLocation } from 'react-router-dom';
import NotificationBell from '../components/ui/NotificationBell';
import { useSocketNotifications } from '../hooks/useSocketNotifications';
import DrugSearchInput from '../components/ui/DrugSearchInput';
import SettingsView from '../components/ui/SettingsView';
import UniversalSearchBar from '../components/ui/UniversalSearchBar';
import { getBaseUrl } from '../services/userApi';
import Loader from '../components/ui/Loader';

const PharmacistDashboard = () => {
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
    const [pendingOrders, setPendingOrders] = useState([]);
    const [myOrders, setMyOrders] = useState([]);
    const [stats, setStats] = useState({
        incomingCount: 0,
        toBePrepared: 0,
        readyCount: 0,
        lowStockCount: 0,
        inventory: []
    });
    const [statusLoadingId, setStatusLoadingId] = useState(null);
    const [deliveryStaff, setDeliveryStaff] = useState([]);
    const [selectedStaff, setSelectedStaff] = useState({}); // orderId -> staffId

    const loadData = async () => {
        try {
            const [pendingRes, myOrdersRes, overviewRes] = await Promise.all([
                fetchPendingOrders(),
                fetchPharmacistOrders(),
                fetchPharmacyOverview()
            ]);

            if (pendingRes.success) setPendingOrders(pendingRes.data);
            if (myOrdersRes.success) setMyOrders(myOrdersRes.data);
            if (overviewRes.success) setStats(overviewRes.data);
            
            try {
                const { fetchAvailableDeliveryStaff } = await import('../services/pharmacyApi');
                const staffRes = await fetchAvailableDeliveryStaff();
                if (staffRes.success) setDeliveryStaff(staffRes.data);
            } catch (staffErr) {
                console.warn("Failed to load delivery staff:", staffErr);
            }
        } catch (error) {
            console.error("Error loading pharmacy data:", error);
        } finally {
            setLoadingData(false);
        }
    };

    useEffect(() => {
        loadData();

        // Connect socket
        socket.connect();
        
        // Listen for new orders
        socket.on('new-pharmacy-order', (data) => {
            console.log('New pharmacy order received via socket:', data);
            // Only refresh if the hospital name matches the logged-in pharmacist's hospital
            if (!data.hospitalName || data.hospitalName === user?.hospitalName) {
                loadData();
            }
        });

        // Listen for order updates
        socket.on('pharmacy-order-updated', (data) => {
            console.log('Pharmacy order updated via socket:', data);
            // Only refresh if the hospital name matches (if provided) or if it's for this patient
            if (!data.hospitalName || data.hospitalName === user?.hospitalName) {
                loadData();
            }
        });

        // Listen for inventory updates
        socket.on('inventory-updated', (data) => {
            console.log('Inventory updated via socket:', data);
            loadData(); // Refresh all data
        });

        return () => {
            socket.off('new-pharmacy-order');
            socket.off('pharmacy-order-updated');
            socket.off('inventory-updated');
            socket.disconnect();
        };
    }, []);

    const printPharmacyBill = (bill, order, printWindow = null) => {
        if (!Array.isArray(bill?.items)) {
            bill.items = [];
        }

        const patientName = order.patientId?.name || 'Patient';
        const doctorName = order.doctorId?.name || 'Doctor';
        const hospitalName = order.hospitalName || user?.hospitalName || 'Holy Cross Hospital';
        const hospitalAddress = order.hospitalAddress || user?.hospitalAddress || '12/A Clinical Valley, Healthcare District, Bangalore - 560001';
        const hospitalContact = 'Phone: +91 80 4422 1100 | www.medicare.health';
        const billDate = new Date(bill.createdAt || Date.now()).toLocaleDateString('en-IN');
        const prescription = order.prescriptionId || {};
        const medicines = Array.isArray(prescription.medicines) ? prescription.medicines : [];

        const medicineRows = medicines.length > 0
            ? medicines.map(m => `
                            <tr>
                                <td>${m.name || 'Medicine'}</td>
                                <td>${m.frequency || '-'}</td>
                                <td>${m.duration ? m.duration + ' days' : '-'}</td>
                                <td style="text-align:right;">₹ ${parseFloat(m.price || 0).toFixed(2)}</td>
                            </tr>
                        `).join('')
            : bill.items.filter(item => item.type === 'medicine').map(item => `
                            <tr>
                                <td>${item.name}</td>
                                <td>-</td>
                                <td>-</td>
                                <td style="text-align:right;">₹ ${item.cost.toFixed(2)}</td>
                            </tr>
                        `).join('');

        const billHtml = `
            <html>
            <head>
                <title>Print Bill</title>
                <style>
                    body { font-family: Arial, sans-serif; padding: 24px; color: #111; }
                    .header { text-align: center; margin-bottom: 24px; }
                    .header h1 { margin: 0; font-size: 26px; letter-spacing: 0.03em; }
                    .header p { margin: 4px 0; font-size: 12px; color: #555; }
                    .section { margin-bottom: 20px; }
                    .section-title { font-size: 11px; letter-spacing: 0.16em; text-transform: uppercase; color: #777; margin-bottom: 10px; }
                    table { width: 100%; border-collapse: collapse; margin-top: 10px; }
                    th, td { padding: 10px 12px; border-bottom: 1px solid #ddd; font-size: 12px; }
                    th { text-align: left; background: #f8f8f8; }
                    td { vertical-align: top; }
                    .summary-row td { font-weight: bold; }
                    .total { font-weight: bold; font-size: 13px; }
                    .footer { margin-top: 30px; font-size: 11px; color: #555; text-align: center; }
                </style>
            </head>
            <body>
                <div class="header">
                    <h1>${hospitalName}</h1>
                    <p>${hospitalAddress}</p>
                    <p>${hospitalContact}</p>
                    <p style="margin-top: 12px; font-size: 14px; letter-spacing: 0.08em; text-transform: uppercase;">Official Pharmacy Bill</p>
                </div>
                <div class="section">
                    <div class="section-title">Patient Summary</div>
                    <p><strong>Patient:</strong> ${patientName}</p>
                    <p><strong>Date:</strong> ${billDate}</p>
                    <p><strong>Doctor:</strong> Dr. ${doctorName}</p>
                    <p><strong>Order ID:</strong> ${order._id.toString().slice(-6).toUpperCase()}</p>
                    <p><strong>Status:</strong> ${order.status}</p>
                </div>
                <div class="section">
                    <div class="section-title">Prescribed Medicines</div>
                    <table>
                        <thead>
                            <tr>
                                <th>Medicine</th>
                                <th>Frequency</th>
                                <th>Duration</th>
                                <th style="text-align:right;">Amount</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${medicineRows}
                            ${medicines.length === 0 ? `<tr><td colspan="4" style="text-align:center; color:#777; padding: 20px 0;">No prescription details available</td></tr>` : ''}
                        </tbody>
                    </table>
                </div>
                <div class="section">
                    <div class="section-title">Bill Details</div>
                    <table>
                        <thead>
                            <tr><th>Description</th><th style="text-align:right;">Amount</th></tr>
                        </thead>
                        <tbody>
                            ${bill.items.map(item => `<tr><td>${item.name}</td><td style="text-align:right;">₹ ${item.cost.toFixed(2)}</td></tr>`).join('')}
                            <tr class="summary-row"><td class="total">Total</td><td class="total" style="text-align:right;">₹ ${bill.amount.toFixed(2)}</td></tr>
                        </tbody>
                    </table>
                </div>
                <div class="footer">This bill was generated automatically by MediCare Pharmacy.</div>
            </body>
            </html>
        `;

        const win = printWindow || window.open('', '_blank');
        if (!win) return;

        win.document.open();
        win.document.write(billHtml);
        win.document.close();
        win.focus();
        setTimeout(() => {
            try {
                win.print();
            } catch (err) {
                console.warn('Print failed:', err);
            }
        }, 250);
    };

    const handleUpdateStatus = async (id, status) => {
        setStatusLoadingId(id);
        let printWindow = null;

        if (status === 'ready') {
            printWindow = window.open('', '_blank');
            if (printWindow) {
                printWindow.document.write(`
                    <html>
                        <head><title>Preparing Bill...</title></head>
                        <body><p style="font-family: Arial, sans-serif; padding: 24px; color: #333;">Preparing bill. Please wait...</p></body>
                    </html>
                `);
                printWindow.document.close();
            }
        }

        try {
            const extraData = {};
            if (status === 'dispatched' && selectedStaff[id]) {
                extraData.deliveryStaffId = selectedStaff[id];
            }
            const res = await updateOrderStatus(id, status, extraData);
            if (res.success) {
                if (status === 'ready' && res.data?.generatedBill) {
                    printPharmacyBill(res.data.generatedBill, res.data.order, printWindow);
                } else if (printWindow) {
                    printWindow.close();
                }
                loadData(); // Refresh data
            }
        } catch (error) {
            console.error("Error updating order status:", error);
            if (printWindow) {
                printWindow.close();
            }
        } finally {
            setStatusLoadingId(null);
        }
    };

    return (
        <div className="flex h-screen bg-[#0a0a0a] text-white font-sans overflow-hidden">
            {/* Sidebar */}
            <aside className="w-64 border-r border-gray-800 flex flex-col bg-[#0f1110]">
                <div className="p-7 flex items-center gap-4 border-b border-white/[0.05] relative group cursor-default">
                    <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/[0.02] to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                    <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-400 p-[1px]">
                        <div className="w-full h-full rounded-[14px] bg-[#0e1015] flex items-center justify-center shadow-2xl">
                            <Pill size={20} className="text-emerald-400 drop-shadow-[0_0_8px_rgba(52,211,153,0.4)]" />
                        </div>
                    </div>
                    <div>
                        <p className="font-black text-white text-base tracking-tighter leading-tight">MediCare <span className="text-emerald-500">.</span></p>
                        <p className="text-[9px] text-emerald-500/80 font-black uppercase tracking-[0.2em] mt-0.5">Pharmacist Portal</p>
                    </div>
                </div>

                <nav className="flex-1 px-4 space-y-2 mt-4">
                    <NavItem icon={LayoutGrid} label="Dashboard" active={activeTab === 'overview'} onClick={() => setActiveTab('overview')} />
                    <NavItem icon={ClipboardList} label="Incoming" active={activeTab === 'incoming'} badge={stats.incomingCount > 0 ? stats.incomingCount.toString() : null} onClick={() => setActiveTab('incoming')} />
                    <NavItem icon={CheckCircle} label="Prepared Orders" active={activeTab === 'prepared'} onClick={() => setActiveTab('prepared')} />
                    <NavItem icon={History} label="Order History" active={activeTab === 'history'} onClick={() => setActiveTab('history')} />
                    <NavItem icon={Archive} label="Inventory" active={activeTab === 'inventory'} onClick={() => setActiveTab('inventory')} />
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
                            <Shield size={16} /> <span className="hidden lg:inline">Verified Rx Access</span>
                        </div>
                        <UniversalSearchBar />
                    </div>
                    <div className="flex items-center gap-4">
                        <NotificationBell count={notificationCount} notifications={notifications} onClick={resetNotifications} onMarkRead={markNotificationRead} />
                        <div className="flex items-center gap-3 text-right">
                            <div>
                                <p className="text-sm font-bold text-white">{user?.name || 'Pharmacist'}</p>
                                <p className="text-[10px] text-gray-500 uppercase tracking-tighter leading-tight font-medium">{user?.hospitalName || 'Medicare Pharmacy'}</p>
                                <p className="text-[9px] text-emerald-500/80 uppercase font-black tracking-widest mt-0.5">{user?.role}</p>
                            </div>
                            <div className="w-10 h-10 rounded-full bg-gray-800 flex items-center justify-center border border-gray-700 overflow-hidden ring-2 ring-emerald-500/10">
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
                        <Loader message="Syncing Pharmacy Operations" />
                    ) : (
                        <>
                            {activeTab === 'settings' && (
                                <SettingsView />
                            )}
                            {activeTab === 'overview' && (
                                <>
                                    <h2 className="text-3xl font-bold mb-6">Pharmacy Operations</h2>

                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6 mb-8">
                                        <StatCard 
                                            icon={ClipboardList} 
                                            title="Incoming Orders" 
                                            value={pendingOrders.length} 
                                            color="text-yellow-500" 
                                            bg="bg-yellow-500/10" 
                                        />
                                        <StatCard 
                                            icon={Package} 
                                            title="To Be Prepared" 
                                            value={myOrders.filter(o => o.status === 'preparing').length} 
                                            color="text-orange-500" 
                                            bg="bg-orange-500/10" 
                                        />
                                        <StatCard 
                                            icon={CheckCircle} 
                                            title="Ready for Pickup" 
                                            value={myOrders.filter(o => o.status === 'ready_for_pickup').length} 
                                            color="text-green-500" 
                                            bg="bg-green-500/10" 
                                        />
                                        <StatCard 
                                            icon={History} 
                                            title="Completed" 
                                            value={myOrders.filter(o => o.status === 'dispatched' || o.status === 'delivered').length} 
                                            color="text-blue-500" 
                                            bg="bg-blue-500/10" 
                                            onClick={() => setActiveTab('history')} 
                                        />
                                        <StatCard 
                                            icon={Archive} 
                                            title="Low Stock" 
                                            value={stats.lowStockCount || 0} 
                                            color="text-red-500" 
                                            bg="bg-red-500/10" 
                                            onClick={() => setActiveTab('inventory')} 
                                        />
                                    </div>

                                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                                        <div className="lg:col-span-2 space-y-6">
                                            <div className="bg-[#111] border border-gray-800 rounded-2xl p-6">
                                                <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
                                                    <Clock className="text-yellow-500" /> Incoming Prescriptions Queue
                                                </h3>
                                                <div className="space-y-4">
                                                    {pendingOrders.slice(0, 5).map((order) => (
                                                        <div key={order._id} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-[#1a1a1a] rounded-xl border border-gray-800 gap-4">
                                                            <div>
                                                                <div className="flex items-center gap-2 mb-1">
                                                                    <p className="font-bold">Order# {order._id.substring(order._id.length - 6)}</p>
                                                                    <span className="bg-yellow-500/10 text-yellow-500 text-[10px] uppercase font-bold px-2 py-1 rounded">{order.status}</span>
                                                                </div>
                                                                <p className="text-sm text-gray-400 font-medium">Patient: <span className="text-white">{order.patientId?.name || 'Unknown'}</span></p>
                                                                <p className="text-xs text-gray-500">Dr. {order.doctorId?.name || 'Unknown'}</p>
                                                                <div className="flex flex-wrap items-center gap-2 mt-2">
                                                                    {order.isEmergency && (
                                                                        <span className="bg-red-500/10 text-red-500 text-[10px] font-bold px-2 py-0.5 rounded border border-red-500/30 animate-pulse flex items-center gap-1">
                                                                            <Activity size={12} /> EMERGENCY
                                                                        </span>
                                                                    )}
                                                                    {order.deliveryType === 'WARD_DELIVERY' || order.isAdmitted ? (
                                                                        <span className="bg-blue-500/10 text-blue-400 text-[10px] font-bold px-2 py-0.5 rounded border border-blue-500/20 flex items-center gap-1">
                                                                            <LayoutGrid size={12} /> WARD: {order.wardNumber || 'N/A'} {order.roomNo ? `(Room: ${order.roomNo})` : ''}
                                                                        </span>
                                                                    ) : (
                                                                        <span className="bg-purple-500/10 text-purple-400 text-[10px] font-bold px-2 py-0.5 rounded border border-purple-500/20 flex items-center gap-1">
                                                                            <Activity size={12} /> PHARMACY PICKUP
                                                                        </span>
                                                                    )}
                                                                </div>
                                                                <p className="text-sm text-white mt-2 font-medium">
                                                                    {order.medicines && order.medicines.length > 0 ? order.medicines.join(', ') : 'No medicines listed'}
                                                                </p>
                                                            </div>
                                                            <button 
                                                                onClick={() => handleUpdateStatus(order._id, 'preparing')}
                                                                disabled={statusLoadingId === order._id}
                                                                className="bg-green-600 hover:bg-green-500 text-white px-6 py-2 rounded-lg font-medium transition-colors whitespace-nowrap disabled:opacity-50"
                                                            >
                                                                {statusLoadingId === order._id ? 'Updating...' : 'Prepare Medicine'}
                                                            </button>
                                                        </div>
                                                    ))}
                                                    {pendingOrders.length === 0 && <p className="text-gray-500 text-sm">No incoming prescriptions.</p>}
                                                </div>
                                            </div>
                                        </div>

                                        <div className="lg:col-span-1 space-y-6">
                                            <div className="bg-[#111] border border-gray-800 rounded-2xl p-6">
                                                <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
                                                    <Archive className="text-blue-500" /> Inventory Summary
                                                </h3>
                                                <div className="space-y-3">
                                                    {stats.inventory && stats.inventory.slice(0, 4).map((item) => (
                                                        <InventoryItem 
                                                            key={item._id}
                                                            name={item.name} 
                                                            stock={`${item.stock} ${item.unit}`} 
                                                            status={item.stock <= item.minStockLevel ? (item.stock <= 5 ? 'critical' : 'low') : 'ok'} 
                                                        />
                                                    ))}
                                                    {(!stats.inventory || stats.inventory.length === 0) && (
                                                        <p className="text-gray-500 text-sm">No inventory data available.</p>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </>
                            )}

                            {activeTab === 'incoming' && (
                                <div className="space-y-6">
                                    <h2 className="text-3xl font-bold mb-6">Incoming Orders</h2>
                                    <div className="bg-[#111] border border-gray-800 rounded-2xl p-6">
                                        <div className="space-y-4">
                                            {pendingOrders.map((order) => (
                                                <div key={order._id} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-[#1a1a1a] rounded-xl border border-gray-800 gap-4">
                                                    <div>
                                                        <div className="flex items-center gap-2 mb-1">
                                                            <p className="font-bold">Order# {order._id.substring(order._id.length - 6)}</p>
                                                            <span className="bg-yellow-500/10 text-yellow-500 text-[10px] uppercase font-bold px-2 py-1 rounded">{order.status}</span>
                                                        </div>
                                                        <p className="text-sm text-gray-400 font-medium">Patient: <span className="text-white">{order.patientId?.name || 'Unknown'}</span></p>
                                                        <p className="text-xs text-gray-500">Dr. {order.doctorId?.name || 'Unknown'}</p>
                                                        <p className="text-sm text-white mt-2 font-medium">
                                                            {order.medicines && order.medicines.length > 0 ? order.medicines.join(', ') : 'No medicines listed'}
                                                        </p>
                                                    </div>
                                                    <div className="flex gap-2">
                                                        <button 
                                                            onClick={() => handleUpdateStatus(order._id, 'preparing')}
                                                            disabled={statusLoadingId === order._id || order.status === 'preparing'}
                                                            className="bg-orange-600 hover:bg-orange-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                                                        >
                                                            Start Preparing
                                                        </button>
                                                        <button 
                                                            onClick={() => handleUpdateStatus(order._id, 'ready')}
                                                            disabled={statusLoadingId === order._id || order.status === 'ready'}
                                                            className="bg-green-600 hover:bg-green-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                                                            title="Mark as ready and generate bill for patient"
                                                        >
                                                            {order.status === 'ready' ? 'Bill Generated' : 'Mark Ready & Bill'}
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                            {pendingOrders.length === 0 && <p className="text-gray-500 text-center py-8">No pending orders.</p>}
                                        </div>
                                    </div>
                                </div>
                            )}

                             {activeTab === 'prepared' && (
                                <div className="space-y-6">
                                    <h2 className="text-3xl font-bold mb-6">Dispatch Center</h2>
                                    <div className="bg-[#111] border border-gray-800 rounded-2xl p-6">
                                        <div className="space-y-6">
                                            {myOrders.filter(o => o.status === 'ready').map((order) => (
                                                <div key={order._id} className="flex flex-col lg:flex-row lg:items-center justify-between p-6 bg-[#1a1a1a] rounded-2xl border border-gray-800 gap-6 transition-all hover:border-gray-700">
                                                    <div className="flex-1">
                                                        <div className="flex items-center gap-3 mb-2">
                                                            <p className="font-bold text-lg">Order# {order._id.substring(order._id.length - 6)}</p>
                                                            <span className="bg-green-500/10 text-green-500 text-[10px] uppercase font-bold px-2 py-1 rounded tracking-widest border border-green-500/20">{order.status}</span>
                                                            {order.isEmergency && (
                                                                <span className="bg-red-500/20 text-red-500 text-[10px] uppercase font-bold px-2 py-1 rounded animate-pulse shadow-sm shadow-red-500/20 flex items-center gap-1 border border-red-500/30">
                                                                   <Activity size={12} className="text-red-500" /> Emergency
                                                                </span>
                                                            )}
                                                        </div>
                                                        <p className="text-sm text-white font-semibold">Patient: <span className="text-gray-300 font-normal">{order.patientId?.name || 'Unknown'}</span></p>
                                                        
                                                        {order.deliveryType === 'WARD_DELIVERY' || order.isAdmitted ? (
                                                            <div className="flex items-center gap-2 mt-3 p-2 bg-blue-500/10 border border-blue-500/20 rounded-lg w-fit">
                                                                <LayoutGrid size={14} className="text-blue-400" />
                                                                <span className="text-xs font-bold text-blue-400 uppercase">Ward Delivery: {order.wardNumber || 'N/A'}</span>
                                                            </div>
                                                        ) : (
                                                            <div className="flex items-center gap-2 mt-3 p-2 bg-purple-500/10 border border-purple-500/20 rounded-lg w-fit">
                                                                <Activity size={14} className="text-purple-400" />
                                                                <span className="text-xs font-bold text-purple-400 uppercase">Pharmacy Pickup</span>
                                                            </div>
                                                        )}
                                                        
                                                        <div className="mt-4 flex flex-wrap gap-2">
                                                            {order.medicines && order.medicines.map((m, idx) => (
                                                                <span key={idx} className="text-[11px] bg-gray-800 text-gray-300 px-2.5 py-1 rounded-full border border-gray-700 shadow-sm">{m}</span>
                                                            ))}
                                                        </div>
                                                    </div>

                                                    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 lg:w-1/2">
                                                        {(order.deliveryType === 'WARD_DELIVERY' || order.isAdmitted) && (
                                                            <div className="w-full flex-1">
                                                                <label className="text-[10px] uppercase font-bold text-gray-500 mb-1.5 block tracking-widest">Assign Delivery Agent</label>
                                                                <select 
                                                                    className="w-full bg-[#111] border border-gray-800 rounded-xl px-4 py-2.5 text-sm text-white outline-none focus:border-blue-500 transition-all appearance-none cursor-pointer"
                                                                    value={selectedStaff[order._id] || ""}
                                                                    onChange={(e) => setSelectedStaff(prev => ({ ...prev, [order._id]: e.target.value }))}
                                                                >
                                                                    <option value="">-- Select Available Staff --</option>
                                                                    {deliveryStaff.map(s => (
                                                                        <option key={s._id} value={s._id}>
                                                                            {s.name} ({s.activeCount} active tasks) {s.assignedWard ? `- ${s.assignedWard}` : ""}
                                                                        </option>
                                                                    ))}
                                                                </select>
                                                            </div>
                                                        )}
                                                        
                                                        <div className="flex items-end self-end sm:self-center h-full pt-6">
                                                            <button 
                                                                onClick={() => handleUpdateStatus(order._id, 'dispatched')}
                                                                disabled={statusLoadingId === order._id || ((order.deliveryType === 'WARD_DELIVERY' || order.isAdmitted) && !selectedStaff[order._id])}
                                                                className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2.5 rounded-xl text-sm font-bold transition-all shadow-lg shadow-blue-900/40 flex items-center gap-2 disabled:bg-gray-800 disabled:text-gray-500 disabled:shadow-none border border-blue-500/30 whitespace-nowrap"
                                                            >
                                                                {statusLoadingId === order._id ? (
                                                                    <Loader2 size={16} className="animate-spin" />
                                                                ) : (
                                                                    <Package size={16} />
                                                                )}
                                                                {order.deliveryType === 'WARD_DELIVERY' || order.isAdmitted ? 'Dispatch to Ward' : 'Mark Handed Over'}
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                            {myOrders.filter(o => o.status === 'ready').length === 0 && (
                                                <div className="text-center py-16 bg-[#1a1a1a]/50 rounded-3xl border border-dashed border-gray-800">
                                                    <CheckCircle className="w-16 h-16 text-gray-800 mx-auto mb-4 opacity-50" />
                                                    <p className="text-gray-500 text-lg font-medium">No orders pending dispatch.</p>
                                                    <p className="text-sm text-gray-600">Great job! The medicine queue is currently empty.</p>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {activeTab === 'history' && (
                                <div className="space-y-6">
                                    <h2 className="text-3xl font-bold mb-6">Order History</h2>
                                    <div className="bg-[#111] border border-gray-800 rounded-2xl p-6">
                                        <div className="space-y-4">
                                            {myOrders.filter(o => o.status === 'dispatched' || o.status === 'delivered').map((order) => (
                                                <div key={order._id} className="flex items-center justify-between p-4 bg-[#1a1a1a] rounded-xl border border-gray-700">
                                                    <div>
                                                        <div className="flex items-center gap-2 mb-1">
                                                            <p className="font-bold">Order# {order._id.substring(order._id.length - 6)}</p>
                                                            <span className={`text-[10px] uppercase font-bold px-2 py-1 rounded ${
                                                                order.status === 'delivered' ? 'bg-green-500/10 text-green-500' : 'bg-blue-500/10 text-blue-500'
                                                            }`}>
                                                                {order.status}
                                                            </span>
                                                        </div>
                                                        <p className="text-sm text-white font-medium">Patient: {order.patientId?.name || 'Unknown'}</p>
                                                        <div className="flex items-center gap-2 mt-1 mb-1">
                                                            {order.deliveryType === 'WARD_DELIVERY' || order.isAdmitted ? (
                                                                <span className="bg-blue-500/10 text-blue-400 text-[9px] font-bold px-1.5 py-0.5 rounded border border-blue-500/20">
                                                                    WARD: {order.wardNumber || 'N/A'}
                                                                </span>
                                                            ) : (
                                                                <span className="bg-purple-500/10 text-purple-400 text-[9px] font-bold px-1.5 py-0.5 rounded border border-purple-500/20">
                                                                    PHARMACY PICKUP
                                                                </span>
                                                            )}
                                                        </div>
                                                        <p className="text-xs text-gray-500">
                                                            {order.medicines && order.medicines.length > 0 ? order.medicines.join(', ') : 'No medicines listed'}
                                                        </p>
                                                    </div>
                                                    <div className="text-right">
                                                        <p className="text-xs text-gray-500 mb-1">Dispatch Date & Time</p>
                                                        <p className="text-sm font-bold text-white">
                                                            {order.updatedAt ? new Date(order.updatedAt).toLocaleDateString('en-GB', {
                                                                day: '2-digit',
                                                                month: 'short',
                                                                year: 'numeric'
                                                            }) : new Date(order.createdAt).toLocaleDateString('en-GB', {
                                                                day: '2-digit',
                                                                month: 'short',
                                                                year: 'numeric'
                                                            })}
                                                        </p>
                                                        <p className="text-xs text-blue-400 font-medium uppercase mt-0.5">
                                                            {order.updatedAt ? new Date(order.updatedAt).toLocaleTimeString('en-US', {
                                                                hour: '2-digit',
                                                                minute: '2-digit',
                                                                hour12: true
                                                            }) : new Date(order.createdAt).toLocaleTimeString('en-US', {
                                                                hour: '2-digit',
                                                                minute: '2-digit',
                                                                hour12: true
                                                            })}
                                                        </p>
                                                    </div>
                                                </div>
                                            ))}
                                            {myOrders.filter(o => o.status === 'dispatched' || o.status === 'delivered').length === 0 && (
                                                <div className="text-center py-12">
                                                    <History className="w-12 h-12 text-gray-700 mx-auto mb-4" />
                                                    <p className="text-gray-500">No order history found.</p>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {activeTab === 'inventory' && (
                                <div className="space-y-6">
                                    <h2 className="text-3xl font-bold mb-6">Inventory Management</h2>
                                    <div className="bg-[#111] border border-gray-800 rounded-2xl p-6">
                                        <div className="mb-6">
                                            <p className="text-gray-400 mb-2 text-sm">Search Global Drug Database</p>
                                            <DrugSearchInput 
                                                placeholder="Search for medicines in database..."
                                                className="w-full bg-[#1a1a1a] border border-gray-800 rounded-xl px-4 py-3 text-white focus:border-green-500 outline-none transition-colors"
                                                onChange={() => {}}
                                            />
                                        </div>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            {stats.inventory && stats.inventory.map((item) => (
                                                <InventoryItem 
                                                    key={item._id}
                                                    name={item.name} 
                                                    stock={`${item.stock} ${item.unit || 'units'}`} 
                                                    status={item.stock <= item.minStockLevel ? (item.stock <= 5 ? 'critical' : 'low') : 'ok'} 
                                                    price={item.price}
                                                    category={item.category}
                                                />
                                            ))}
                                            {(!stats.inventory || stats.inventory.length === 0) && (
                                                <p className="text-gray-500 text-center py-8 col-span-2">No inventory data available.</p>
                                            )}
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

const InventoryItem = ({ name, stock, status, price, category }) => {
    const getStatusColor = () => {
        switch (status) {
            case 'low': return 'text-yellow-500 bg-yellow-500/10 border-yellow-500/20';
            case 'critical': return 'text-red-500 bg-red-500/10 border-red-500/20';
            default: return 'text-green-500 bg-green-500/10 border-green-500/20';
        }
    };
    return (
        <div className="flex justify-between items-center p-4 bg-[#1a1a1a] rounded-xl border border-gray-800 hover:border-gray-700 transition-colors">
            <div className="flex flex-col gap-0.5">
                <span className="text-sm font-bold text-gray-200">{name}</span>
                <div className="flex gap-2 items-center">
                    {category && <span className="text-[10px] text-gray-500 uppercase tracking-wider">{category}</span>}
                    {price && <span className="text-[11px] text-green-500 font-mono">₹{price}</span>}
                </div>
            </div>
            <div className={`px-3 py-1 rounded-full text-xs font-bold border ${getStatusColor()}`}>
                {stock}
            </div>
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

const StatCard = ({ icon: Icon, title, value, color, bg, onClick }) => (
    <div 
        className={`bg-[#111] border border-gray-800 rounded-2xl p-6 ${onClick ? 'cursor-pointer hover:border-gray-700 transition-all active:scale-95' : ''}`}
        onClick={onClick}
    >
        <div className="flex justify-between items-start mb-4">
            <div className={`p-3 rounded-xl ${bg}`}><Icon className={`w-6 h-6 ${color}`} /></div>
        </div>
        <p className="text-gray-400 text-sm font-medium mb-1">{title}</p>
        <h3 className="text-3xl font-bold">{value}</h3>
    </div>
);

export default PharmacistDashboard;

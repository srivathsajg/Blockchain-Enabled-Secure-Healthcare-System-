import React, { useState, useEffect } from 'react';
import { Bell, CheckCheck } from 'lucide-react';
import { pendingPlaybackStore, audioUnlockedStore } from '../../utils/soundPlayer';

const NotificationBell = ({ count = 0, notifications = [], onClick, onMarkRead, title = 'Notifications' }) => {
  const [open, setOpen] = useState(false);
  const [pendingPulse, setPendingPulse] = useState(pendingPlaybackStore.get() && !audioUnlockedStore.get());

  useEffect(() => {
    const update = () => setPendingPulse(pendingPlaybackStore.get() && !audioUnlockedStore.get());
    const unsub1 = pendingPlaybackStore.subscribe(update);
    const unsub2 = audioUnlockedStore.subscribe(update);
    update();
    return () => { unsub1(); unsub2(); };
  }, []);

  const handleOpen = () => setOpen((value) => !value);

  return (
    <div className="relative">
      <button type="button" onClick={handleOpen} title={title} aria-expanded={open} aria-label={title} className={`relative text-gray-400 hover:text-white transition-colors ${pendingPulse ? 'animate-sound-pending-pulse' : ''}`}>
        <Bell size={20} />
        {count > 0 && <span className="absolute -top-1 -right-1 min-w-[18px] h-4 rounded-full bg-red-500 text-[10px] font-bold text-white flex items-center justify-center px-1.5">{count > 99 ? '99+' : count}</span>}
      </button>
      {open && (
        <div className="absolute right-0 top-[calc(100%+12px)] z-[100] w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-white/10 bg-[#111318] shadow-2xl">
          <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3"><div><p className="text-sm font-bold text-white">Notifications</p><p className="text-[11px] text-gray-500">Live updates for your account</p></div>{count > 0 && <button onClick={onClick} className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-400 hover:text-emerald-300"><CheckCheck size={14} /> Mark all read</button>}</div>
          <div className="max-h-80 overflow-y-auto">{notifications.length === 0 ? <p className="px-4 py-8 text-center text-sm text-gray-500">No notifications yet.</p> : notifications.map((notification) => <button key={notification.id} onClick={() => onMarkRead?.(notification.id)} className={`w-full border-b border-white/[0.05] px-4 py-3 text-left transition-colors hover:bg-white/[0.04] ${notification.read ? 'opacity-65' : 'bg-emerald-500/[0.04]'}`}><p className="text-sm font-semibold text-gray-100">{notification.title}</p><p className="mt-0.5 text-xs text-gray-400">{notification.message}</p><p className="mt-1 text-[10px] text-gray-600">{new Date(notification.createdAt).toLocaleTimeString()}</p></button>)}</div>
        </div>
      )}
    </div>
  );
};

export default NotificationBell;

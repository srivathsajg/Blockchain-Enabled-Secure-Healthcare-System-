import React, { useState, useEffect, useRef } from 'react';
import {
  Upload, Music, Pencil, Trash2, Star, Play, Pause, X, Loader2,
  CheckCircle, AlertCircle, FileAudio, Calendar, User as UserIcon, HardDriveDownload, StarOff
} from 'lucide-react';
import {
  uploadNotificationSound,
  fetchNotificationSounds,
  updateNotificationSound,
  deleteNotificationSound,
} from '../../services/adminApi';
import { getBaseUrl } from '../../services/userApi';

const NOTIFICATION_EVENTS = [
  { value: 'appointment-updated', label: 'Appointment Updated' },
  { value: 'appointment-approved', label: 'Appointment Approved' },
  { value: 'new-pharmacy-order', label: 'New Pharmacy Order' },
  { value: 'pharmacy-order-updated', label: 'Pharmacy Order Updated' },
  { value: 'delivery-assigned', label: 'Delivery Assigned' },
  { value: 'delivery-status-updated', label: 'Delivery Status Updated' },
  { value: 'inventory-updated', label: 'Inventory Updated' },
  { value: 'blockchain-record-verified', label: 'Record Verified (Blockchain)' },
  { value: 'slot-booked', label: 'Slot Booked' },
  { value: 'new-appointment-received', label: 'New Appointment Received' },
  { value: 'appointment-reassigned', label: 'Appointment Reassigned' },
  { value: 'new-appointment-assigned', label: 'New Appointment Assigned' },
  { value: 'new-lab-order-received', label: 'New Lab Order' },
  { value: 'lab-report-uploaded', label: 'Lab Report Uploaded' },
  { value: 'emergency-created', label: 'Emergency Case Created' },
  { value: 'emergency-status-updated', label: 'Emergency Status Changed' },
  { value: 'emergency-updated', label: 'Emergency Updated' },
  { value: 'ambulance-assigned', label: 'Ambulance Assigned' },
  { value: 'doctor-status-updated', label: 'Doctor Status Updated' },
  { value: 'doctor-emergency-delay', label: 'Appointment Delay Alert' },
  { value: 'doctor-emergency-resolved', label: 'Schedule Resumed' },
  { value: 'ward-delivery-update', label: 'Ward Delivery Update' },
  { value: 'user-registered', label: 'New User Registered' },
  { value: 'hospital-emergency-alert', label: 'Hospital Emergency Alert' },
  { value: 'new-delivery-assigned', label: 'New Delivery Assigned' },
];

const formatBytes = (bytes) => {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
};

const NotificationSoundsManager = () => {
  const [sounds, setSounds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState({ type: '', msg: '' });
  const [editing, setEditing] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const audioRef = useRef(null);
  const [playingId, setPlayingId] = useState(null);

  const [form, setForm] = useState({
    name: '',
    description: '',
    selectedEvents: [],
    file: null,
  });

  const loadSounds = async () => {
    try {
      setLoading(true);
      const res = await fetchNotificationSounds();
      setSounds(res.success ? res.data || [] : []);
    } catch (e) {
      setToast({ type: 'error', msg: e?.response?.data?.message || 'Failed to load sounds' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSounds();
  }, []);

  useEffect(() => {
    if (toast.msg) {
      const t = setTimeout(() => setToast({ type: '', msg: '' }), 3500);
      return () => clearTimeout(t);
    }
  }, [toast]);

  const toggleEvent = (ev) => {
    setForm((f) => ({
      ...f,
      selectedEvents: f.selectedEvents.includes(ev)
        ? f.selectedEvents.filter((x) => x !== ev)
        : [...f.selectedEvents, ev],
    }));
  };

  const toggleEditEvent = (ev) => {
    setEditing((e) => ({
      ...e,
      eventTypes: e.eventTypes.includes(ev)
        ? e.eventTypes.filter((x) => x !== ev)
        : [...e.eventTypes, ev],
    }));
  };

  const stopAudio = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setPlayingId(null);
  };

  const playSound = (row) => {
    if (playingId === row._id) {
      stopAudio();
      return;
    }
    stopAudio();
    const url = row?.url ? (row.url.startsWith('http') ? row.url : `${getBaseUrl()}${row.url}`) : null;
    if (!url) return;
    const audio = new Audio(url);
    audio.onended = () => setPlayingId(null);
    audio.onerror = () => {
      setPlayingId(null);
      setToast({ type: 'error', msg: 'Unable to play this audio file' });
    };
    audioRef.current = audio;
    setPlayingId(row._id);
    audio.play().catch(() => setPlayingId(null));
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!form.file || !form.name.trim() || form.selectedEvents.length === 0) {
      setToast({ type: 'error', msg: 'File, name, and at least one event are required' });
      return;
    }
    try {
      setSubmitting(true);
      const fd = new FormData();
      fd.append('soundFile', form.file);
      fd.append('name', form.name.trim());
      fd.append('description', form.description.trim());
      form.selectedEvents.forEach((ev, i) => {
        fd.append(`eventTypes[${i}]`, ev);
      });
      const res = await uploadNotificationSound(fd);
      if (res.success) {
        setToast({ type: 'success', msg: 'Notification sound uploaded successfully' });
        setForm({ name: '', description: '', selectedEvents: [], file: null });
        if (document.getElementById('sound-file-upload')) document.getElementById('sound-file-upload').value = '';
        await loadSounds();
      } else {
        setToast({ type: 'error', msg: res.message || 'Upload failed' });
      }
    } catch (err) {
      setToast({ type: 'error', msg: err?.response?.data?.message || 'Upload failed' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveEdit = async () => {
    if (!editing) return;
    try {
      setSubmitting(true);
      const res = await updateNotificationSound(editing._id, {
        name: editing.name.trim(),
        description: editing.description?.trim() || '',
        eventTypes: editing.eventTypes,
        isDefault: editing.isDefault,
      });
      if (res.success) {
        setEditing(null);
        setToast({ type: 'success', msg: 'Sound updated' });
        await loadSounds();
      } else {
        setToast({ type: 'error', msg: res.message || 'Update failed' });
      }
    } catch (err) {
      setToast({ type: 'error', msg: err?.response?.data?.message || 'Update failed' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleSetDefault = async (row, makeDefault) => {
    try {
      setSubmitting(true);
      await updateNotificationSound(row._id, { isDefault: makeDefault });
      await loadSounds();
      setToast({ type: 'success', msg: makeDefault ? 'Set as default' : 'Default removed' });
    } catch (err) {
      setToast({ type: 'error', msg: err?.response?.data?.message || 'Action failed' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    try {
      setSubmitting(true);
      await deleteNotificationSound(confirmDelete._id);
      setConfirmDelete(null);
      setToast({ type: 'success', msg: 'Sound deleted' });
      await loadSounds();
    } catch (err) {
      setToast({ type: 'error', msg: err?.response?.data?.message || 'Delete failed' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <header className="mb-6">
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <Music size={22} className="text-amber-500" /> Notification Sounds Manager
        </h2>
        <p className="text-gray-400 mt-1 text-sm">
          Upload, assign, and manage custom audio alerts for real-time notification events.
          Supported: .mp3, .wav, .ogg · Max 10MB.
        </p>
      </header>

      {toast.msg && (
        <div className={`flex items-center gap-2 p-4 rounded-xl text-sm border ${toast.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-red-500/10 border-red-500/20 text-red-400'}`}>
          {toast.type === 'success' ? <CheckCircle size={18} /> : <AlertCircle size={18} />}
          <span>{toast.msg}</span>
        </div>
      )}

      <form onSubmit={handleUpload} className="bg-[#111] border border-gray-800 rounded-2xl p-6 space-y-5 shadow-2xl">
        <div>
          <h3 className="text-sm font-bold text-gray-300 uppercase tracking-wider mb-4 flex items-center gap-2">
            <Upload size={14} /> Upload New Sound
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="md:col-span-2">
              <label className="block">
                <div className={`border-2 border-dashed rounded-2xl p-6 transition-colors cursor-pointer ${form.file ? 'border-emerald-500/50 bg-emerald-500/5' : 'border-gray-800 hover:border-gray-700 bg-[#0e0e0e]'}`}>
                  <input
                    id="sound-file-upload"
                    type="file"
                    accept=".mp3,.wav,.ogg,audio/mpeg,audio/wav,audio/ogg"
                    className="hidden"
                    onChange={(e) => setForm({ ...form, file: e.target.files?.[0] || null })}
                  />
                  <label htmlFor="sound-file-upload" className="flex flex-col items-center gap-2 cursor-pointer">
                    <FileAudio size={30} className={form.file ? 'text-emerald-400' : 'text-gray-500'} />
                    {form.file ? (
                      <div className="text-center">
                        <p className="text-sm font-semibold text-gray-100">{form.file.name}</p>
                        <p className="text-xs text-gray-500 mt-0.5">{formatBytes(form.file.size)}</p>
                      </div>
                    ) : (
                      <div className="text-center">
                        <p className="text-sm font-semibold text-gray-300">Click to select audio file</p>
                        <p className="text-xs text-gray-500 mt-0.5">MP3, WAV, or OGG · up to 10MB</p>
                      </div>
                    )}
                  </label>
                </div>
              </label>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Sound Name *</label>
              <input
                type="text"
                required
                placeholder="e.g. Emergency Alert Beep"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full bg-[#1a1a1a] border border-gray-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-emerald-500"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Description</label>
              <input
                type="text"
                placeholder="Optional notes about this sound..."
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="w-full bg-[#1a1a1a] border border-gray-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          <div className="mt-5">
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Assign to Events *</label>
              <span className="text-xs text-gray-500 tabular-nums">{form.selectedEvents.length} selected</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 max-h-56 overflow-y-auto p-3 bg-[#0e0e0e] border border-gray-800 rounded-xl custom-scrollbar">
              {NOTIFICATION_EVENTS.map((ev) => {
                const checked = form.selectedEvents.includes(ev.value);
                return (
                  <label
                    key={ev.value}
                    className={`flex items-start gap-2 p-2 rounded-lg cursor-pointer border transition-colors ${checked ? 'border-emerald-500/40 bg-emerald-500/10' : 'border-transparent hover:bg-white/[0.03]'}`}
                  >
                    <input
                      type="checkbox"
                      className="mt-0.5 accent-emerald-500"
                      checked={checked}
                      onChange={() => toggleEvent(ev.value)}
                    />
                    <span className="text-[11px] text-gray-300 leading-snug">{ev.label}</span>
                  </label>
                );
              })}
            </div>
          </div>

          <div className="pt-3 flex justify-end">
            <button
              type="submit"
              disabled={submitting || !form.file || !form.name.trim() || form.selectedEvents.length === 0}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-900/20 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {submitting ? <Loader2 size={18} className="animate-spin" /> : <Upload size={18} />}
              {submitting ? 'Uploading...' : 'Upload Sound'}
            </button>
          </div>
        </div>
      </form>

      <div className="bg-[#111] border border-gray-800 rounded-2xl shadow-2xl overflow-hidden">
        <div className="p-5 border-b border-gray-800 flex items-center justify-between">
          <h3 className="text-sm font-bold text-gray-300 uppercase tracking-wider flex items-center gap-2">
            <HardDriveDownload size={14} /> Sound Library
            <span className="text-gray-600 font-normal">({sounds.length})</span>
          </h3>
        </div>

        {loading ? (
          <div className="p-12 flex items-center justify-center text-gray-500 text-sm">
            <Loader2 size={20} className="animate-spin mr-2" /> Loading sounds...
          </div>
        ) : sounds.length === 0 ? (
          <div className="p-12 text-center">
            <Music size={36} className="mx-auto text-gray-700 mb-3" />
            <p className="text-sm text-gray-400">No custom notification sounds yet.</p>
            <p className="text-xs text-gray-600 mt-1">Upload your first sound above to assign it to events.</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-800">
            {sounds.map((row) => (
              <div key={row._id} className="p-5 hover:bg-white/[0.015] transition-colors">
                <div className="flex flex-col md:flex-row md:items-center gap-4 md:gap-6">
                  <div className="flex items-start gap-4 flex-1 min-w-0">
                    <button
                      type="button"
                      onClick={() => playSound(row)}
                      aria-label={playingId === row._id ? 'Pause' : 'Play sound'}
                      className={`shrink-0 w-12 h-12 rounded-full border-2 flex items-center justify-center transition-all ${playingId === row._id ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400' : 'bg-gray-800/60 border-gray-700 text-gray-400 hover:border-gray-600'}`}
                    >
                      {playingId === row._id ? <Pause size={20} /> : <Play size={20} className="ml-0.5" />}
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="text-sm font-semibold text-gray-100 truncate">{row.name}</h4>
                        {row.isDefault && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 text-[10px] font-bold uppercase tracking-wider border border-amber-500/20">
                            <Star size={10} fill="currentColor" /> Default
                          </span>
                        )}
                        {row.createdBy?.hospitalName && (
                          <span className="inline-flex px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 text-[10px] font-bold uppercase tracking-wider border border-blue-500/20">
                            {row.createdBy.hospitalName}
                          </span>
                        )}
                        {!row.createdBy?.hospitalName && (
                          <span className="inline-flex px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-400 text-[10px] font-bold uppercase tracking-wider border border-purple-500/20">
                            Global
                          </span>
                        )}
                      </div>
                      {row.description && <p className="text-xs text-gray-500 mt-1">{row.description}</p>}
                      <div className="flex flex-wrap items-center gap-3 mt-2 text-[11px] text-gray-500">
                        <span className="inline-flex items-center gap-1"><HardDriveDownload size={11} /> {formatBytes(row.fileSize)}</span>
                        <span className="inline-flex items-center gap-1"><Calendar size={11} /> {new Date(row.createdAt).toLocaleDateString()}</span>
                        <span className="inline-flex items-center gap-1"><UserIcon size={11} /> {row.createdBy?.name || 'Unknown'}</span>
                      </div>
                      {row.eventTypes?.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {row.eventTypes.slice(0, 4).map((ev) => {
                            const meta = NOTIFICATION_EVENTS.find((e) => e.value === ev);
                            return (
                              <span key={ev} className="inline-flex px-2 py-0.5 rounded-lg bg-gray-800/60 text-gray-300 text-[10px] font-medium border border-gray-700/70">
                                {meta?.label || ev}
                              </span>
                            );
                          })}
                          {row.eventTypes.length > 4 && (
                            <span className="inline-flex px-2 py-0.5 rounded-lg bg-gray-800/60 text-gray-400 text-[10px] font-medium border border-gray-700/70">
                              +{row.eventTypes.length - 4} more
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex md:flex-col items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => setEditing({
                        _id: row._id,
                        name: row.name,
                        description: row.description || '',
                        eventTypes: [...(row.eventTypes || [])],
                        isDefault: !!row.isDefault,
                      })}
                      className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/[0.05] transition-colors"
                      title="Edit"
                    >
                      <Pencil size={16} />
                    </button>
                    {row.isDefault ? (
                      <button
                        type="button"
                        onClick={() => handleSetDefault(row, false)}
                        className="p-2 rounded-lg text-amber-400 hover:text-amber-300 hover:bg-amber-500/10 transition-colors"
                        title="Remove default status"
                      >
                        <StarOff size={16} />
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleSetDefault(row, true)}
                        className="p-2 rounded-lg text-gray-400 hover:text-amber-400 hover:bg-amber-500/10 transition-colors"
                        title="Set as default fallback"
                      >
                        <Star size={16} />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(row)}
                      className="p-2 rounded-lg text-gray-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                      title="Delete"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {editing && (
        <div className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => !submitting && setEditing(null)}>
          <div
            className="bg-[#111] border border-gray-800 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-5 border-b border-gray-800 flex items-center justify-between sticky top-0 bg-[#111]">
              <h3 className="font-bold text-gray-100">Edit Sound</h3>
              <button type="button" onClick={() => !submitting && setEditing(null)} className="text-gray-500 hover:text-white"><X size={20} /></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Name</label>
                <input
                  type="text"
                  value={editing.name}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  className="w-full bg-[#1a1a1a] border border-gray-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-blue-500"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Description</label>
                <textarea
                  rows="2"
                  value={editing.description}
                  onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                  className="w-full bg-[#1a1a1a] border border-gray-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-blue-500 resize-none"
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Assigned Events</label>
                  <label className="flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      className="accent-amber-500"
                      checked={editing.isDefault}
                      onChange={(e) => setEditing({ ...editing, isDefault: e.target.checked })}
                    />
                    <span className="text-gray-400">Set as default fallback</span>
                  </label>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-64 overflow-y-auto p-3 bg-[#0e0e0e] border border-gray-800 rounded-xl custom-scrollbar">
                  {NOTIFICATION_EVENTS.map((ev) => {
                    const checked = editing.eventTypes.includes(ev.value);
                    return (
                      <label
                        key={ev.value}
                        className={`flex items-start gap-2 p-2 rounded-lg cursor-pointer border transition-colors ${checked ? 'border-blue-500/40 bg-blue-500/10' : 'border-transparent hover:bg-white/[0.03]'}`}
                      >
                        <input
                          type="checkbox"
                          className="mt-0.5 accent-blue-500"
                          checked={checked}
                          onChange={() => toggleEditEvent(ev.value)}
                        />
                        <span className="text-[11px] text-gray-300 leading-snug">{ev.label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>
            <div className="p-5 border-t border-gray-800 flex justify-end gap-3 sticky bottom-0 bg-[#111]">
              <button
                type="button"
                onClick={() => setEditing(null)}
                disabled={submitting}
                className="px-4 py-2.5 rounded-xl text-sm font-bold border border-gray-700 text-gray-300 hover:bg-white/5 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveEdit}
                disabled={submitting || !editing.name.trim()}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold bg-blue-600 hover:bg-blue-500 text-white active:scale-95 disabled:opacity-50 transition-all"
              >
                {submitting && <Loader2 size={16} className="animate-spin" />}
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmDelete && (
        <div className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => !submitting && setConfirmDelete(null)}>
          <div
            className="bg-[#111] border border-gray-800 rounded-2xl w-full max-w-md shadow-2xl p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 shrink-0 rounded-full bg-red-500/10 border border-red-500/20 text-red-400 flex items-center justify-center">
                <AlertCircle size={22} />
              </div>
              <div className="flex-1">
                <h3 className="font-bold text-gray-100">Delete notification sound?</h3>
                <p className="text-sm text-gray-400 mt-1">
                  This will permanently delete <span className="text-gray-200 font-semibold">&ldquo;{confirmDelete.name}&rdquo;</span> and remove the file from the server.
                  Events assigned only to this sound will fall back to the global default or built-in beep.
                </p>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setConfirmDelete(null)}
                disabled={submitting}
                className="px-4 py-2.5 rounded-xl text-sm font-bold border border-gray-700 text-gray-300 hover:bg-white/5 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={submitting}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold bg-red-600 hover:bg-red-500 text-white active:scale-95 disabled:opacity-50 transition-all"
              >
                {submitting && <Loader2 size={16} className="animate-spin" />}
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationSoundsManager;

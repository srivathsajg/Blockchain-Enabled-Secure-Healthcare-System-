import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import socket from '../services/socket';
import {
  loadEventSoundMap,
  playNotificationSound,
  setUserPreferences as setSoundUserPreferences,
} from '../utils/soundPlayer';

const DEFAULT_NOTIFICATION_EVENTS = [
  'appointment-updated',
  'appointment-approved',
  'new-pharmacy-order',
  'pharmacy-order-updated',
  'delivery-assigned',
  'delivery-status-updated',
  'inventory-updated',
  'blockchain-record-verified',
  'slot-booked',
  'new-appointment-received',
  'appointment-reassigned',
  'new-appointment-assigned',
  'new-lab-order-received',
  'lab-report-uploaded',
  'emergency-created',
  'emergency-status-updated',
  'emergency-updated',
  'ambulance-assigned',
  'doctor-status-updated',
  'doctor-emergency-delay',
  'doctor-emergency-resolved',
  'ward-delivery-update',
  'user-registered',
  'hospital-emergency-alert',
  'new-delivery-assigned',
];
const DEFAULT_EXTRA_EVENTS = [];

const EVENT_LABELS = {
  'appointment-updated': 'Appointment updated',
  'appointment-approved': 'Appointment approved',
  'new-pharmacy-order': 'New pharmacy order',
  'pharmacy-order-updated': 'Pharmacy order updated',
  'delivery-assigned': 'Delivery assigned',
  'delivery-status-updated': 'Delivery status updated',
  'inventory-updated': 'Inventory updated',
  'blockchain-record-verified': 'Record verified',
  'slot-booked': 'Appointment slot booked',
  'new-appointment-received': 'New appointment received',
  'appointment-reassigned': 'Appointment reassigned',
  'new-appointment-assigned': 'New appointment assigned',
  'new-lab-order-received': 'New lab order',
  'lab-report-uploaded': 'Lab report uploaded',
  'emergency-created': 'Emergency created',
  'emergency-status-updated': 'Emergency status updated',
  'emergency-updated': 'Emergency updated',
  'ambulance-assigned': 'Ambulance assigned',
  'doctor-status-updated': 'Doctor status updated',
  'doctor-emergency-delay': 'Appointment delay',
  'doctor-emergency-resolved': 'Schedule resumed',
  'ward-delivery-update': 'Ward delivery update',
  'user-registered': 'User registered',
  'hospital-emergency-alert': 'Hospital emergency alert',
  'new-delivery-assigned': 'New delivery assigned',
};

const getNotificationMessage = (eventName, payload) =>
  payload?.message ||
  payload?.status ||
  payload?.title ||
  EVENT_LABELS[eventName] ||
  'You have a new update.';

const normalizeEventList = (events) => {
  const merged = [...DEFAULT_NOTIFICATION_EVENTS, ...(events || [])];
  return Array.from(new Set(merged));
};

export const useSocketNotifications = ({ userId, hospitalName, extraEvents = DEFAULT_EXTRA_EVENTS, notificationPrefs } = {}) => {
  const [notificationCount, setNotificationCount] = useState(0);
  const [notifications, setNotifications] = useState([]);
  const [connected, setConnected] = useState(false);
  const soundMapLoadedRef = useRef(false);

  const soundEnabled = notificationPrefs?.soundEnabled !== false;
  const soundVolume = typeof notificationPrefs?.soundVolume === 'number' ? notificationPrefs.soundVolume : 0.8;

  useEffect(() => {
    setSoundUserPreferences({ soundEnabled, soundVolume });
  }, [soundEnabled, soundVolume]);

  const handleNotification = useCallback((eventName, payload) => {
    try {
      playNotificationSound(eventName, { overrideUrl: payload?.soundOverride });
    } catch (err) {
      console.warn('Notification sound error suppressed:', err?.message || err);
    }
    setNotificationCount((count) => count + 1);
    setNotifications((current) => [
      {
        id: `${eventName}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        title: EVENT_LABELS[eventName] || 'New notification',
        message: getNotificationMessage(eventName, payload),
        createdAt: new Date().toISOString(),
        read: false,
      },
      ...current,
    ].slice(0, 50));
  }, []);

  const handleConnect = useCallback(() => {
    setConnected(true);
    if (userId) {
      socket.emit('join-room', String(userId));
    }
    socket.emit('join-hospital-room', hospitalName || 'General');
  }, [hospitalName, userId]);

  const events = useMemo(() => normalizeEventList(extraEvents), [extraEvents]);

  useEffect(() => {
    if (!userId) return undefined;

    if (!soundMapLoadedRef.current) {
      soundMapLoadedRef.current = true;
      loadEventSoundMap().catch((e) =>
        console.warn('Could not load notification sound map:', e?.message || e)
      );
    }

    if (!socket.connected) {
      socket.connect();
    }

    socket.emit('join-room', String(userId));
    socket.emit('join-hospital-room', hospitalName || 'General');
    socket.on('connect', handleConnect);

    const listeners = events.map((eventName) => {
      const listener = (payload) => handleNotification(eventName, payload);
      socket.on(eventName, listener);
      return [eventName, listener];
    });

    return () => {
      socket.off('connect', handleConnect);
      listeners.forEach(([eventName, listener]) => socket.off(eventName, listener));
    };
  }, [userId, hospitalName, events, handleConnect, handleNotification]);

  const resetNotifications = useCallback(() => {
    setNotificationCount(0);
    setNotifications((current) => current.map((notification) => ({ ...notification, read: true })));
  }, []);

  const markNotificationRead = useCallback((id) => {
    setNotifications((current) => current.map((notification) =>
      notification.id === id ? { ...notification, read: true } : notification
    ));
    setNotificationCount((count) => Math.max(0, count - 1));
  }, []);

  return [notificationCount, resetNotifications, connected, notifications, markNotificationRead];
};


import api from "../services/axiosInstance";

let eventSoundMap = null;
let eventSoundMapLoadedAt = 0;
const EVENT_MAP_CACHE_MS = 5 * 60 * 1000;

const userPreferences = {
  enabled: true,
  volume: 0.8,
};

export let globalAudioUnlocked = false;
export let queuePendingPlayback = false;

const lastPlayedAt = {};
const DEBOUNCE_MS = 250;

let sharedAudioContext = null;
const getAudioContext = () => {
  if (typeof window === "undefined") return null;
  if (!sharedAudioContext) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    sharedAudioContext = new AC();
  }
  return sharedAudioContext;
};

const createFlagStore = (initial) => {
  const listeners = new Set();
  let value = initial;
  return {
    get: () => value,
    set: (v) => {
      value = v;
      listeners.forEach((fn) => {
        try {
          fn(v);
        } catch (_) {
          /* ignore */
        }
      });
    },
    subscribe: (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
};

export const pendingPlaybackStore = createFlagStore(false);
export const audioUnlockedStore = createFlagStore(false);

export const setAudioUnlocked = (flag) => {
  globalAudioUnlocked = !!flag;
  audioUnlockedStore.set(!!flag);
};

export const setPendingPlayback = (flag) => {
  queuePendingPlayback = !!flag;
  pendingPlaybackStore.set(!!flag);
};

export const setUserPreferences = ({ soundEnabled, soundVolume }) => {
  if (soundEnabled !== undefined) {
    userPreferences.enabled = !!soundEnabled;
  }
  if (soundVolume !== undefined) {
    const v = Number(soundVolume);
    if (!Number.isNaN(v)) {
      userPreferences.volume = Math.min(1, Math.max(0, v));
    }
  }
};

export const loadEventSoundMap = async () => {
  const now = Date.now();
  if (eventSoundMap && now - eventSoundMapLoadedAt < EVENT_MAP_CACHE_MS) {
    return eventSoundMap;
  }
  try {
    const res = await api.get("/notification-sounds/event-map");
    if (res?.data?.success && res.data.data) {
      eventSoundMap = res.data.data;
      eventSoundMapLoadedAt = now;
    }
  } catch (err) {
    console.warn("Failed to load notification sound event map:", err?.message || err);
    if (!eventSoundMap) {
      eventSoundMap = {};
    }
  }
  return eventSoundMap;
};

export const clearSoundMapCache = () => {
  eventSoundMap = null;
  eventSoundMapLoadedAt = 0;
};

export const resolveSoundFor = (eventType) => {
  if (!eventSoundMap) return { url: null, useBuiltIn: true };
  const entry = eventSoundMap[eventType];
  if (!entry || entry.useBuiltIn || !entry.url) {
    return { url: null, useBuiltIn: true };
  }
  return entry;
};

const scheduleBeep = (ctx, osc, gainNode, startTime, freq, duration, volume) => {
  const t0 = startTime;
  osc.type = "sine";
  osc.frequency.setValueAtTime(freq, t0);
  gainNode.gain.setValueAtTime(0, t0);
  gainNode.gain.linearRampToValueAtTime(volume, t0 + 0.005);
  gainNode.gain.setValueAtTime(volume, t0 + duration - 0.01);
  gainNode.gain.linearRampToValueAtTime(0, t0 + duration);
};

export const playBuiltInBeep = (volume) => {
  const ctx = getAudioContext();
  if (!ctx) return;
  if (ctx.state === "suspended") {
    ctx.resume().catch(() => {});
  }
  const vol = typeof volume === "number" ? Math.min(1, Math.max(0, volume)) : userPreferences.volume;
  const now = ctx.currentTime;
  const beep = 0.08;
  const gap = 0.06;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);
  scheduleBeep(ctx, osc, gain, now, 520, beep, vol);
  scheduleBeep(ctx, osc, gain, now + beep + gap, 520, beep, vol);
  scheduleBeep(ctx, osc, gain, now + (beep + gap) * 2, 520, beep, vol);
  osc.start(now);
  osc.stop(now + (beep + gap) * 3);
};

const tryPlayUrlAudio = async (url, volume) => {
  if (!url || typeof window === "undefined") return false;
  try {
    const audio = new Audio(url);
    audio.volume = volume;
    const p = audio.play();
    if (!p || typeof p.then !== "function") {
      return true;
    }
    await p;
    return true;
  } catch (err) {
    console.warn("Notification audio playback failed, falling back to beep:", err?.message || err);
    return false;
  }
};

export const playNotificationSound = async (eventType, options = {}) => {
  if (!userPreferences.enabled) return;

  const nowTs = Date.now();
  const last = lastPlayedAt[eventType] || 0;
  if (!options.force && nowTs - last < DEBOUNCE_MS) {
    return;
  }
  lastPlayedAt[eventType] = nowTs;

  if (!globalAudioUnlocked) {
    setPendingPlayback(true);
    return;
  }

  const overrideUrl = options?.overrideUrl;
  const { url } = overrideUrl ? { url: overrideUrl } : resolveSoundFor(eventType);
  const volume = userPreferences.volume;

  let played = false;
  if (url) {
    played = await tryPlayUrlAudio(url, volume);
  }
  if (!played) {
    playBuiltInBeep(volume);
  }
};

export const testPlayCurrentSound = async () => {
  const saved = userPreferences.enabled;
  userPreferences.enabled = true;
  setAudioUnlocked(true);
  const entries = eventSoundMap ? Object.entries(eventSoundMap) : [];
  const firstCustom = entries.find(
    ([, v]) => v && !v.useBuiltIn && v.url
  );
  if (firstCustom) {
    const played = await tryPlayUrlAudio(
      firstCustom[1].url,
      userPreferences.volume
    );
    if (!played) {
      playBuiltInBeep(userPreferences.volume);
    }
  } else {
    playBuiltInBeep(userPreferences.volume);
  }
  userPreferences.enabled = saved;
};

export const flushPendingPlaybackIfNeeded = () => {
  if (!queuePendingPlayback || !globalAudioUnlocked) return;
  setPendingPlayback(false);
  playBuiltInBeep(userPreferences.volume);
};

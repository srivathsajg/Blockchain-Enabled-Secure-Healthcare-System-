import { useEffect, useState } from "react";
import {
  audioUnlockedStore,
  pendingPlaybackStore,
  setAudioUnlocked,
  flushPendingPlaybackIfNeeded,
} from "../utils/soundPlayer";

const GESTURE_EVENTS = ["click", "keydown", "touchstart"];

export const useAudioUnlock = () => {
  const [unlocked, setUnlocked] = useState(audioUnlockedStore.get());
  const [pending, setPending] = useState(pendingPlaybackStore.get());

  useEffect(() => {
    const unsubscribeUnlocked = audioUnlockedStore.subscribe((v) => setUnlocked(v));
    const unsubscribePending = pendingPlaybackStore.subscribe((v) => setPending(v));

    const unlock = () => {
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (AC) {
          const ctx = new AC();
          if (ctx.state === "suspended") {
            ctx.resume().catch(() => {});
          }
        }
      } catch (_) {
        /* ignore */
      }
      setAudioUnlocked(true);
      flushPendingPlaybackIfNeeded();
      GESTURE_EVENTS.forEach((evt) => {
        document.removeEventListener(evt, unlock, true);
      });
    };

    GESTURE_EVENTS.forEach((evt) => {
      document.addEventListener(evt, unlock, true);
    });

    return () => {
      unsubscribeUnlocked();
      unsubscribePending();
      GESTURE_EVENTS.forEach((evt) => {
        document.removeEventListener(evt, unlock, true);
      });
    };
  }, []);

  return {
    audioUnlocked: unlocked,
    pendingSoundQueued: pending,
  };
};

export default useAudioUnlock;

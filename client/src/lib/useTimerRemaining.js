import { useEffect, useState } from 'react';
import useLCUStore from '../stores/lcuStore';
import { remainingAt } from './timer';

/** Seconds left in the champion-select phase, re-rendered four times a second while `active`. */
export default function useTimerRemaining(active) {
  const remaining = useLCUStore(s => s.timerRemaining);
  const syncedAt = useLCUStore(s => s.timerSyncedAt);
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!active) return undefined;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [active]);
  // A fresh value can land between two ticks: never count down from before it arrived.
  return remainingAt({ remaining, syncedAt }, Math.max(now, syncedAt));
}

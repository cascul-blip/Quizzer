import { useCallback, useEffect, useRef } from "preact/hooks";

/**
 * setTimeout for a sound or voice cue that belongs to the current phase. Cues still waiting are
 * dropped when `phase` changes (the host ended the game, the round moved on) or the stage
 * unmounts, so they never play over the next screen.
 *
 * Call this before the effect that schedules cues: a phase change then clears the old cues
 * before the new phase's ones are scheduled.
 */
export function useDelayedCues(phase: string): (cue: () => void, ms: number) => void {
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(
    () => () => {
      for (const t of timers.current) clearTimeout(t);
      timers.current = [];
    },
    [phase],
  );
  return useCallback((cue: () => void, ms: number) => {
    const t = setTimeout(() => {
      timers.current = timers.current.filter((x) => x !== t);
      cue();
    }, ms);
    timers.current.push(t);
  }, []);
}

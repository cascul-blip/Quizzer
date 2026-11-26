import { useCallback, useEffect, useRef } from "preact/hooks";

// why: dropping cues on a phase change or unmount keeps them from playing over the next screen.
// why: call this before the effect that schedules cues, so the old cues clear first.
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

import { useCallback, useEffect, useRef } from "preact/hooks";

// why: dropping cues on a phase change or unmount keeps them from playing over the next screen.
// why: hook order matters here. See the projector cue instructions in docs/agents/game-modes.md.
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

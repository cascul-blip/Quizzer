import { useEffect, useRef, useState } from "preact/hooks";

/** Count down an activity's server-reported wait and check its deadline at the tap itself. */
export function useAfterAnswerWait(activity: number | string, remainingMs: number) {
  const wait = useRef<{ activity: number | string; deadline: number } | null>(null);
  const now = performance.now();
  const reportedDeadline = now + remainingMs;
  // A patch can carry forward an old duration. It must never extend the same wait.
  const deadline = wait.current?.activity === activity ? Math.min(wait.current.deadline, reportedDeadline) : reportedDeadline;
  wait.current = { activity, deadline };
  const [, refresh] = useState(0);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => {
      const left = deadline - performance.now();
      const untilChange = left > 0 ? left - (Math.ceil(left / 1000) - 1) * 1000 : 0;
      timer = setTimeout(() => {
        refresh((n) => n + 1);
        if (performance.now() < deadline) schedule();
      }, Math.ceil(untilChange));
    };
    schedule();
    return () => clearTimeout(timer);
  }, [activity, deadline]);

  return {
    seconds: Math.max(0, Math.ceil((deadline - now) / 1000)),
    isWaiting: () => performance.now() < deadline,
  };
}

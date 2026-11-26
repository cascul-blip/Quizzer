import { createContext } from "preact";
import { useContext, useEffect, useRef, useState } from "preact/hooks";
import type { AfterAnswerWaitView } from "../../shared/mode-views.ts";
import { nextSecondIn } from "../shared/ui.tsx";

export const PhoneResumeVersion = createContext(0);

export function useAfterAnswerWait(view: AfterAnswerWaitView | null) {
  const resumeVersion = useContext(PhoneResumeVersion);
  const wait = useRef<{ activityKey: number; resumeVersion: number; deadline: number } | null>(null);
  const now = performance.now();
  const activityKey = view?.activityKey;
  const reportedDeadline = now + (view?.remainingMs ?? 0);
  // why: ordinary updates can carry an old duration; only a fresh resume can extend the same wait.
  const previous = wait.current;
  const deadline =
    previous && previous.activityKey === activityKey && previous.resumeVersion === resumeVersion
      ? Math.min(previous.deadline, reportedDeadline)
      : reportedDeadline;
  wait.current = view && { activityKey: view.activityKey, resumeVersion, deadline };
  const [, refresh] = useState(0);

  useEffect(() => {
    if (activityKey === undefined) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => {
      const left = deadline - performance.now();
      const untilChange = left > 0 ? nextSecondIn(left, 0) : 0;
      timer = setTimeout(() => {
        refresh((n) => n + 1);
        if (performance.now() < deadline) schedule();
      }, Math.ceil(untilChange));
    };
    schedule();
    return () => clearTimeout(timer);
  }, [activityKey, deadline]);

  return {
    seconds: Math.max(0, Math.ceil((deadline - now) / 1000)),
    isWaiting: () => performance.now() < deadline,
  };
}

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Clock } from "../src/server/game/game.ts";
import type { Quiz } from "../src/shared/quiz-schema.ts";

/** Deterministic clock: timers only fire when advance() is called. */
export class FakeClock implements Clock {
  t = 1_000_000;
  private seq = 0;
  private timers = new Map<number, { at: number; fn: () => void }>();

  now() {
    return this.t;
  }
  setTimeout(fn: () => void, ms: number) {
    const id = ++this.seq;
    this.timers.set(id, { at: this.t + ms, fn });
    return id;
  }
  clearTimeout(h: unknown) {
    this.timers.delete(h as number);
  }
  advance(ms: number) {
    const end = this.t + ms;
    for (;;) {
      let next: [number, { at: number; fn: () => void }] | null = null;
      for (const e of this.timers) if (e[1].at <= end && (!next || e[1].at < next[1].at)) next = e;
      if (!next) break;
      this.timers.delete(next[0]);
      this.t = next[1].at;
      next[1].fn();
    }
    this.t = end;
  }
}

export function tempDir(): { dir: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "quizzer-test-"));
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

export function sampleQuiz(overrides: Partial<Quiz> = {}): Quiz {
  return {
    id: "sample-abcd",
    title: "Sample",
    description: "",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    settings: { shuffleQuestions: false, shuffleAnswers: false },
    questions: [
      { id: "q1", type: "multiple_choice", text: "2 + 2?", timeLimitSec: 20, options: ["3", "4", "5", "22"], correct: [1] },
      { id: "q2", type: "true_false", text: "The sky is blue", timeLimitSec: 10, options: ["True", "False"], correct: [0] },
      { id: "q3", type: "multiple_choice", text: "Pick a prime", timeLimitSec: 10, options: ["2", "4", "7"], correct: [0, 2] },
    ],
    ...overrides,
  };
}

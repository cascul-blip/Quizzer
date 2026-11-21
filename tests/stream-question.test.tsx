import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { Window } from "happy-dom";
import { render } from "preact";
import { act } from "preact/test-utils";
import { Feedback, StreamQuestion } from "../src/client/player/stream-question.tsx";
import type { StreamQuestionView } from "../src/shared/mode-views.ts";

const question: StreamQuestionView = { seq: 1, type: "multiple_choice", text: "First question", options: ["One", "Two"] };
const window = new Window();
let root: HTMLDivElement;
const globals = ["window", "document", "navigator"] as const;
const previous = globals.map((key) => Object.getOwnPropertyDescriptor(globalThis, key));

beforeAll(() => {
  for (const key of globals) Object.defineProperty(globalThis, key, { configurable: true, value: window[key] });
});
afterEach(() => {
  act(() => render(null, root));
  root.remove();
});
afterAll(() => {
  globals.forEach((key, i) => {
    const descriptor = previous[i];
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else Reflect.deleteProperty(globalThis, key);
  });
  window.close();
});

function mount() {
  root = document.createElement("div");
  document.body.appendChild(root);
}

describe("Streamed phone questions", () => {
  test("repeat taps send one answer, and the next question can be answered", () => {
    mount();
    const answers: number[][] = [];
    const onAnswer = (seq: number, option: number) => answers.push([seq, option]);
    act(() => render(<StreamQuestion question={question} onAnswer={onAnswer} />, root));
    const button = root.querySelector("button")!;
    act(() => {
      button.click();
      button.click();
    });
    expect(answers).toEqual([[1, 0]]);
    expect(button.disabled).toBe(true);
    act(() => render(<StreamQuestion question={{ ...question, seq: 2 }} onAnswer={onAnswer} />, root));
    act(() => root.querySelector("button")!.click());
    expect(answers).toEqual([
      [1, 0],
      [2, 0],
    ]);
  });

  test("feedback appears immediately with the next question", () => {
    mount();
    const feedback = { seq: 1, correct: false, remainingMs: 1000, answers: ["One"], penaltyMs: 0 };
    act(() =>
      render(
        <>
          <StreamQuestion question={{ ...question, seq: 2, text: "Next question" }} onAnswer={() => {}} />
          <Feedback feedback={feedback} rightText="Correct" />
        </>,
        root,
      ),
    );
    expect(root.textContent).toContain("Next question");
    expect(root.querySelector('[role="status"]')?.textContent).toContain("Not quite");
    expect(root.querySelector('[role="status"]')?.textContent).toContain("One");
  });

  test("Protect from abuse countdown decreases and feedback disappears", async () => {
    mount();
    const feedback = { seq: 1, correct: false, remainingMs: 1100, answers: [], penaltyMs: 100 };
    act(() => render(<Feedback feedback={feedback} rightText="Correct" />, root));
    expect(root.textContent).toContain("Next question in 2s");
    await act(() => new Promise<void>((resolve) => setTimeout(resolve, 180)));
    expect(root.textContent).toContain("Next question in 1s");
    await act(() => new Promise<void>((resolve) => setTimeout(resolve, 1000)));
    expect(root.querySelector('[role="status"]')).toBeNull();
  });
});

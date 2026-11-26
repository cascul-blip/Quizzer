import { describe, expect, mock, spyOn, test } from "bun:test";
import type { VNode } from "preact";
import { render } from "preact";
import { act } from "preact/test-utils";
import { stageOf } from "../src/client/host/modes.tsx";
import { PacedQuestionIntro, PacedQuestionScreen, PacedStageHeader, usePacedShortcuts } from "../src/client/host/paced-question.tsx";
import * as sounds from "../src/client/shared/sounds.ts";
import type { QuestionView } from "../src/shared/mode-views.ts";
import type { HostMsg, HostView, JoinInfo } from "../src/shared/protocol.ts";
import { usePhoneDom } from "./phone-dom.ts";

const dom = usePhoneDom();
const question: QuestionView = {
  index: 2,
  total: 3,
  type: "multiple_choice",
  text: "How many?",
  options: ["One", "Two"],
  timeLimitSec: 15,
  remainingMs: 15_000,
};
const join: JoinInfo = { url: "http://localhost:4321", qrSvg: "", address: "localhost", addresses: [], port: 4321 };
const avatar = { avatar: "santaclaus", accessory: "none" } as const;
const sharedView = { answeredCount: 1, answerCounts: null, correct: null, pacing: "manual", players: [{ connected: true }, { connected: false }] } as const;

function show(screen: VNode) {
  act(() => render(screen, dom.root));
}

function key(key: string, target: EventTarget = dom.root) {
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
  act(() => {
    target.dispatchEvent(event);
  });
  return event.defaultPrevented;
}

describe("Paced question on the projector", () => {
  test("shows the intro and opens the question when clicked", () => {
    const send = mock((_message: HostMsg) => {});
    show(<PacedQuestionIntro question={question} send={send} />);
    expect(dom.root.querySelector("h1")?.textContent).toBe("How many?");
    expect(dom.root.querySelector(".intro-num")?.textContent).toBe("Question 3");
    expect(dom.root.querySelector<HTMLElement>(".intro-fill")?.style.animationDuration).toBe("15000ms");
    act(() => dom.root.querySelector<HTMLElement>("main")!.click());
    expect(send.mock.calls).toEqual([[{ type: "host.skip" }]]);
  });

  test("shows the countdown and open options, then the distribution, verdict and advance control", () => {
    const send = mock((_message: HostMsg) => {});
    const view = { ...sharedView, players: [...sharedView.players] };
    show(<PacedQuestionScreen question={question} view={{ ...view, phase: "open" }} send={send} nextLabel="Leaderboard" />);
    expect(dom.root.querySelector(".countdown")?.textContent).toBe("15");
    dom.advance(10_005);
    expect(dom.root.querySelector(".countdown.urgent")?.textContent).toBe("5");
    expect(dom.root.querySelectorAll(".tile")).toHaveLength(2);
    expect(dom.root.querySelector(".tile.right")).toBeNull();
    act(() => dom.root.querySelector<HTMLButtonElement>("footer button")!.click());

    show(
      <PacedQuestionScreen
        question={question}
        view={{ ...view, phase: "reveal", pacing: "auto", correct: [1], answerCounts: [0, 1], answerAvatars: [[], [avatar]] }}
        send={send}
        nextLabel="Leaderboard"
      />,
    );
    expect(dom.root.querySelector(".side-label")?.textContent).toBe("Everyone answered!");
    expect(dom.root.querySelector(".answered-l")?.textContent).toBe("answer");
    expect(dom.root.querySelector(".tile.right")?.textContent).toContain("Two");
    expect([...dom.root.querySelectorAll(".bar-count")].map((node) => node.textContent)).toEqual(["0", "✓ 1"]);
    expect(dom.root.querySelectorAll(".pickers .picker")).toHaveLength(1);
    expect(dom.root.querySelector("footer button")?.textContent).toBe("Leaderboard (auto)");
    act(() => dom.root.querySelector<HTMLButtonElement>("footer button")!.click());
    expect(send.mock.calls).toEqual([[{ type: "host.skip" }], [{ type: "host.next" }]]);
  });

  test("ticks once per second through the final five seconds and raises the pitch for the final three", () => {
    const play = spyOn(sounds, "play").mockImplementation(() => {});
    const send = mock((_message: HostMsg) => {});
    const short = { ...question, remainingMs: 6_000, timeLimitSec: 6 };
    const showOpen = (answeredCount: number) =>
      show(<PacedQuestionScreen question={short} view={{ ...sharedView, players: [], phase: "open", answeredCount }} send={send} nextLabel="Next question" />);

    showOpen(0);
    expect(play).not.toHaveBeenCalled();
    dom.advance(1_005);
    expect(play.mock.calls).toEqual([["tick"]]);
    showOpen(1);
    expect(play).toHaveBeenCalledTimes(1);
    dom.advance(1_000);
    dom.advance(1_000);
    dom.advance(1_000);
    dom.advance(1_000);
    dom.advance(1_000);
    expect(play.mock.calls).toEqual([["tick"], ["tick"], ["tickHigh"], ["tickHigh"], ["tickHigh"]]);
    expect(dom.root.querySelector(".countdown")?.textContent).toBe("0");
  });

  test("shrinks crowded answer avatars and shows how many did not fit", () => {
    const send = mock((_message: HostMsg) => {});
    const counts = [4, 10, 26];
    show(
      <PacedQuestionScreen
        question={{ ...question, options: ["One", "Two", "Three"] }}
        view={{
          ...sharedView,
          players: [],
          phase: "reveal",
          correct: [0],
          answerCounts: counts,
          answerAvatars: counts.map((count) => Array.from({ length: count }, () => avatar)),
        }}
        send={send}
        nextLabel="Next question"
      />,
    );
    expect(dom.root.querySelectorAll(".pickers.lg .picker")).toHaveLength(4);
    expect(dom.root.querySelectorAll(".pickers.md .picker")).toHaveLength(10);
    expect(dom.root.querySelectorAll(".pickers.sm .picker")).toHaveLength(24);
    expect(dom.root.querySelector(".picker-more")?.textContent).toBe("+2");
    expect(dom.root.querySelectorAll(".pickers.dim")).toHaveLength(2);
  });

  test("shows the pin image and marks the correct spot, and keeps typed answers hidden until reveal", () => {
    const send = mock((_message: HostMsg) => {});
    const view = { ...sharedView, players: [{ connected: true }], answeredCount: 0 };
    const pin: QuestionView = {
      ...question,
      type: "pin",
      image: "locations.png",
      spots: [
        { x: 0.2, y: 0.4 },
        { x: 0.7, y: 0.2 },
      ],
    };
    show(<PacedQuestionScreen question={pin} view={{ ...view, phase: "open" }} send={send} nextLabel="Next question" />);
    expect(dom.root.querySelector(".pin-img")?.getAttribute("src")).toBe("/locations.png");
    expect(dom.root.querySelector(".pin-note")?.textContent).toContain("Drag the pin");
    show(<PacedQuestionScreen question={pin} view={{ ...view, phase: "reveal", correct: [0], answerCounts: [0, 0] }} send={send} nextLabel="Next question" />);
    expect(dom.root.querySelector(".side-label")?.textContent).toBe("Time's up");
    expect(dom.root.querySelector(".pin-note.right")?.textContent).toBe("✓ Spot One");
    expect(dom.root.querySelector(".pin-spot.is-correct")?.getAttribute("aria-label")).toBe("Spot One");

    const text: QuestionView = { ...question, type: "text", options: [] };
    show(<PacedQuestionScreen question={text} view={{ ...view, phase: "open" }} send={send} nextLabel="Next question" />);
    expect(dom.root.querySelector(".typing-note")?.textContent).toBe("Type your answer on your phone");
    show(
      <PacedQuestionScreen question={{ ...text, options: ["One"] }} view={{ ...view, phase: "reveal", correct: [0] }} send={send} nextLabel="Next question" />,
    );
    expect(dom.root.querySelector(".tile.right")?.textContent).toContain("One");
    expect(dom.root.querySelector(".bars")).toBeNull();
  });

  test("offers pacing and confirms End only while game controls are present", () => {
    const send = mock((_message: HostMsg) => {});
    const confirmEnd = spyOn(globalThis, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
    show(
      <PacedStageHeader
        title="Christmas Quiz"
        questionLabel="Question 1 / 3"
        connectedCount={1}
        totalPlayerCount={2}
        join={join}
        gameControls={{ pacing: "manual", autoAdvanceTitle: "Advance after reveal" }}
        send={send}
      />,
    );
    expect(dom.root.querySelector(".title")?.textContent).toBe("Christmas Quiz");
    expect(dom.root.querySelector(".dim")?.textContent).toContain("/ 2");
    const pacing = dom.root.querySelector<HTMLInputElement>(".pacing-toggle input")!;
    expect(pacing.checked).toBe(false);
    act(() => pacing.click());
    const end = dom.root.querySelector<HTMLButtonElement>("button.btn.small")!;
    act(() => end.click());
    expect(send.mock.calls).toEqual([[{ type: "host.setPacing", pacing: "auto" }]]);
    act(() => end.click());
    expect(confirmEnd).toHaveBeenCalledTimes(2);
    expect(send.mock.calls).toEqual([[{ type: "host.setPacing", pacing: "auto" }], [{ type: "host.end" }]]);
    show(<PacedStageHeader title="Christmas Quiz" connectedCount={1} join={join} send={send} />);
    expect(dom.root.querySelector(".pacing-toggle")).toBeNull();
    expect(dom.root.querySelector("button.btn.small")).toBeNull();
    expect(dom.root.querySelector('[aria-label="Show join QR code"]')).not.toBeNull();
  });

  test("dispatches advance, skip and fullscreen independently and removes its handler", () => {
    const send = mock((_message: HostMsg) => {});
    const fullscreen = spyOn(document.documentElement, "requestFullscreen").mockResolvedValue();
    function Shortcuts() {
      usePacedShortcuts({ advance: "send", canSkip: true }, send);
      return <input />;
    }
    show(<Shortcuts />);
    expect(key(" ", dom.root.querySelector("input")!)).toBe(false);
    expect(key("s", dom.root.querySelector("input")!)).toBe(false);
    expect(key(" ")).toBe(true);
    expect(key("ArrowRight")).toBe(true);
    key("S");
    key("F");
    expect(fullscreen).toHaveBeenCalledTimes(1);
    act(() => render(null, dom.root));
    expect(key("ArrowRight")).toBe(false);
    expect(send.mock.calls).toEqual([[{ type: "host.next" }], [{ type: "host.next" }], [{ type: "host.skip" }]]);
  });

  test("can suppress advance without sending, ignore it entirely, or defer it to a focused button", () => {
    const send = mock((_message: HostMsg) => {});
    function Shortcuts(settings: Parameters<typeof usePacedShortcuts>[0]) {
      usePacedShortcuts(settings, send);
      return <button type="button">A control</button>;
    }

    show(<Shortcuts advance="prevent-default" canSkip={false} />);
    expect(key(" ")).toBe(true);
    expect(send).not.toHaveBeenCalled();

    show(<Shortcuts advance="ignore" canSkip={true} />);
    expect(key(" ")).toBe(false);
    key("s");
    expect(send.mock.calls).toEqual([[{ type: "host.skip" }]]);

    show(<Shortcuts advance="send" canSkip={true} ignoreButtons />);
    const button = dom.root.querySelector("button")!;
    expect(key(" ", button)).toBe(false);
    key("s", button);
    expect(send).toHaveBeenCalledTimes(1);
    expect(key("ArrowRight")).toBe(true);
    expect(send.mock.calls).toEqual([[{ type: "host.skip" }], [{ type: "host.next" }]]);
  });
});

describe("Paced question through the projector mode entries", () => {
  const quiz = { id: "quiz", title: "Christmas Quiz", questionCount: 3 };
  const person = { id: "noel", nickname: "Noel", avatar, connected: true };
  const common = { join, quiz, question, pacing: "manual", answeredCount: 0, answerCounts: [0, 0], correct: [1] } as const;

  test("Classic keeps the final-results route and existing keyboard guard", () => {
    const send = mock((_message: HostMsg) => {});
    const view: Extract<HostView, { kind: "classic" }> = {
      ...common,
      answerCounts: [0, 0],
      correct: [1],
      kind: "classic",
      phase: "reveal",
      players: [{ ...person, score: 0 }],
      answerAvatars: null,
      leaderboard: [],
      errors: null,
    };
    const Stage = stageOf(view);
    show(<Stage view={view} send={send} enteredFromLobby={false} />);
    expect(dom.root.textContent).toContain("Question 3 / 3");
    const next = dom.root.querySelector("button.next")!;
    expect(next.textContent).toBe("Final results →");
    expect(key("ArrowRight", next)).toBe(true);
    key("S");
    show(<Stage view={{ ...view, phase: "podium" }} send={send} enteredFromLobby={false} />);
    expect(key(" ")).toBe(true);
    expect(send.mock.calls).toEqual([[{ type: "host.next" }]]);
  });

  test("Memory Game reads the next step from the projector view and protects focused controls", () => {
    const send = mock((_message: HostMsg) => {});
    const view: Extract<HostView, { kind: "memory" }> = {
      ...common,
      answerCounts: [0, 0],
      correct: [1],
      kind: "memory",
      phase: "reveal",
      players: [{ ...person, chips: 1, pairs: 0 }],
      podium: null,
      boardSize: 6,
      board: [],
      turn: null,
      feedback: null,
      phaseRemainingMs: 0,
      revealTurnsNext: false,
    };
    const Stage = stageOf(view);
    show(<Stage view={view} send={send} enteredFromLobby={false} />);
    expect(dom.root.textContent).toContain("Question 3 / 3 this phase");
    expect(dom.root.querySelector("button.next")?.textContent).toBe("Next question →");
    show(<Stage view={{ ...view, revealTurnsNext: true }} send={send} enteredFromLobby={false} />);
    const next = dom.root.querySelector<HTMLButtonElement>("button.next")!;
    expect(next.textContent).toBe("Reveal turns →");
    expect(key(" ", next)).toBe(false);
    expect(key("ArrowRight")).toBe(true);
    show(<Stage view={{ ...view, phase: "turn", question: null, revealTurnsNext: false }} send={send} enteredFromLobby={false} />);
    expect(key("ArrowRight")).toBe(false);
    expect(dom.root.querySelector(".pacing-toggle")).not.toBeNull();
    expect(send.mock.calls).toEqual([[{ type: "host.next" }]]);
  });
});

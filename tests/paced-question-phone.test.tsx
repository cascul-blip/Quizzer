import { describe, expect, mock, test } from "bun:test";
import type { VNode } from "preact";
import { render } from "preact";
import { act } from "preact/test-utils";
import { PhoneModeScreen } from "../src/client/player/modes.tsx";
import { PacedQuestionAnswering, PacedQuestionFeedback, PacedQuestionIntro } from "../src/client/player/paced-question.tsx";
import type { QuestionView } from "../src/shared/mode-views.ts";
import type { ClassicView } from "../src/shared/modes/classic.ts";
import type { ClientMsg } from "../src/shared/protocol.ts";
import { usePhoneDom } from "./phone-dom.ts";

const dom = usePhoneDom();
const question: QuestionView = {
  index: 2,
  total: 5,
  type: "multiple_choice",
  text: "How many?",
  options: ["One", "Two"],
  timeLimitSec: 15,
  remainingMs: 15_000,
};
const unanswered = { myChoice: null, myText: null };

function show(screen: VNode) {
  act(() => render(screen, dom.root));
}

function click(selector: string) {
  act(() => dom.root.querySelector<HTMLButtonElement>(selector)!.click());
}

describe("Paced question on the phone", () => {
  test("introduces the question before offering any answers", () => {
    show(<PacedQuestionIntro question={question} label="Question 3" />);
    expect(dom.root.querySelector("h1")?.textContent).toBe("How many?");
    expect(dom.root.textContent).toContain("Question 3");
    expect(dom.root.textContent).toContain("Get ready");
    expect(dom.root.querySelector("button")).toBeNull();
  });

  test("shows the question clock, locks a local choice and resets for a different question", () => {
    const submit = mock((_option: number, _text?: string) => {});
    show(<PacedQuestionAnswering question={question} view={unanswered} submit={submit} />);
    expect(dom.root.querySelector(".timer")?.textContent).toBe("15");
    dom.advance(10_005);
    expect(dom.root.querySelector(".timer.urgent")?.textContent).toBe("5");
    click(".answer:last-child");
    expect(dom.root.textContent).toContain("Answer locked in");
    expect(dom.root.textContent).toContain("Two");
    expect(dom.vibrate.mock.calls).toEqual([[30]]);
    expect(submit.mock.calls).toEqual([[1]]);

    const next = { ...question, index: 3, text: "How many now?" };
    show(<PacedQuestionAnswering question={next} view={unanswered} submit={submit} />);
    expect(dom.root.querySelector(".q-text")?.textContent).toBe("How many now?");
    expect(dom.root.querySelector(".timer")?.textContent).toBe("15");
    show(<PacedQuestionAnswering question={next} view={{ ...unanswered, myChoice: 0 }} submit={submit} />);
    expect(dom.root.textContent).toContain("Answer locked in");
    expect(dom.root.textContent).toContain("One");
    expect(submit).toHaveBeenCalledTimes(1);
  });

  test("locks trimmed typed answers until the question changes and accepts the server's locked text", () => {
    const submit = mock((_option: number, _text?: string) => {});
    const text: QuestionView = { ...question, type: "text", options: [], image: "image.png" };
    show(<PacedQuestionAnswering question={text} view={unanswered} submit={submit} />);
    expect(dom.root.querySelector(".q-img")?.getAttribute("src")).toBe("/image.png");
    const input = dom.root.querySelector("input")!;
    act(() => {
      input.value = "  holly  ";
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    act(() => {
      dom.root.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    expect(submit.mock.calls).toEqual([[0, "holly"]]);
    expect(dom.root.querySelector(".locked-text")?.textContent).toBe("holly");
    show(<PacedQuestionAnswering question={text} view={{ ...unanswered, myText: "Holly" }} submit={submit} />);
    expect(dom.root.querySelector(".locked-text")?.textContent).toBe("Holly");
    show(<PacedQuestionAnswering question={{ ...text, index: 3 }} view={unanswered} submit={submit} />);
    expect(dom.root.querySelector("input")?.value).toBe("");
    expect(dom.root.querySelector(".locked-text")).toBeNull();
  });

  test("sets the pin without answering, then submits the chosen spot", () => {
    const submit = mock((_option: number, _text?: string) => {});
    const pin: QuestionView = {
      ...question,
      type: "pin",
      image: "locations.png",
      spots: [
        { x: 0.2, y: 0.4 },
        { x: 0.7, y: 0.2 },
      ],
    };
    show(<PacedQuestionAnswering question={pin} view={unanswered} submit={submit} />);
    expect(dom.root.querySelector(".pin-img")?.getAttribute("src")).toBe("/locations.png");
    expect(dom.root.querySelector<HTMLButtonElement>(".pin-submit")!.disabled).toBe(true);
    click('[aria-label="Spot Two"]');
    expect(dom.root.querySelector<HTMLButtonElement>(".pin-submit")!.disabled).toBe(false);
    expect(submit).not.toHaveBeenCalled();
    click(".pin-submit");
    expect(submit.mock.calls).toEqual([[1]]);
    expect(dom.root.textContent).toContain("Answer locked in");
  });

  test("shows the verdict, right answers, wrong pick, typed answer, reward and standing", () => {
    show(
      <PacedQuestionFeedback question={question} result={{ choice: 0, correct: [1], wasCorrect: false }} myText={null} reward="+0 chips">
        1 chip
      </PacedQuestionFeedback>,
    );
    expect(dom.root.querySelector("h1")?.textContent).toBe("Wrong");
    expect(dom.root.querySelector(".is-wrong-pick")?.textContent).toContain("One");
    expect(dom.root.querySelector(".is-correct")?.textContent).toContain("Two");
    expect(dom.root.querySelector(".points")?.textContent).toBe("+0 chips");
    expect(dom.root.querySelector(".standing")?.textContent).toBe("1 chip");

    show(
      <PacedQuestionFeedback
        question={{ ...question, type: "text" }}
        result={{ choice: null, correct: [0], wasCorrect: true }}
        myText="one"
        reward="+1,000"
        streak={3}
      >
        3,000 points
      </PacedQuestionFeedback>,
    );
    expect(dom.root.querySelector("h1")?.textContent).toBe("Correct!");
    expect(dom.root.textContent).toContain("You typed: one");
    expect(dom.root.querySelector(".streak-note")?.textContent).toContain("3 in a row!");

    show(
      <PacedQuestionFeedback question={question} result={{ choice: null, correct: [0, 1], wasCorrect: false }} myText={null} reward="+0">
        0 points
      </PacedQuestionFeedback>,
    );
    expect(dom.root.querySelector("h1")?.textContent).toBe("Time's up!");
    expect(dom.root.querySelectorAll(".is-correct")).toHaveLength(2);
  });

  test("shows the pin at the player's wrong spot and marks the right spot", () => {
    const pin: QuestionView = {
      ...question,
      type: "pin",
      image: "locations.png",
      spots: [
        { x: 0.2, y: 0.4 },
        { x: 0.7, y: 0.2 },
      ],
    };
    show(
      <PacedQuestionFeedback question={pin} result={{ choice: 0, correct: [1], wasCorrect: false }} myText={null} reward="+0 chips">
        1 chip
      </PacedQuestionFeedback>,
    );
    expect(dom.root.querySelector(".has-pin.is-wrong")?.getAttribute("aria-label")).toBe("Spot One");
    expect(dom.root.querySelector(".pin-spot.is-correct")?.getAttribute("aria-label")).toBe("Spot Two");
  });
});

test("Classic sends its paced answer message and shows its score and streak through the phone mode entry", () => {
  const send = mock((_message: ClientMsg) => {});
  const view: ClassicView = {
    kind: "classic",
    title: "Christmas Quiz",
    phase: "intro",
    me: { id: "noel", avatar: { avatar: "santaclaus", accessory: "none" }, nickname: "Noel", score: 3_000, rank: 1, streak: 5 },
    playerCount: 4,
    question,
    ...unanswered,
    result: null,
    podium: null,
  };
  show(<PhoneModeScreen view={view} send={send} resumeVersion={0} />);
  expect(dom.root.textContent).toContain("Question 3 of 5");
  show(<PhoneModeScreen view={{ ...view, phase: "open" }} send={send} resumeVersion={0} />);
  click(".answer:last-child");
  expect(send.mock.calls).toEqual([[{ type: "answer", qIndex: 2, option: 1, text: undefined }]]);
  show(
    <PhoneModeScreen
      view={{ ...view, phase: "leaderboard", result: { choice: 1, correct: [1], wasCorrect: true, points: 1_000 } }}
      send={send}
      resumeVersion={0}
    />,
  );
  expect(dom.root.querySelector(".points")?.textContent).toBe("+1,000");
  expect(dom.root.querySelector(".standing")?.textContent).toBe("3,000 points · 1st of 4");
  expect(dom.root.querySelector(".streak-note")?.textContent).toContain("5 in a row!");
});

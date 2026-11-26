import { describe, expect, mock, test } from "bun:test";
import { render } from "preact";
import { act } from "preact/test-utils";
import { PhoneModeScreen } from "../src/client/player/modes.tsx";
import { PhoneSession } from "../src/client/player/session.ts";
import type { ClientMsg } from "../src/shared/protocol.ts";
import { claimView } from "./land-claim-fixture.ts";
import { usePhoneDom } from "./phone-dom.ts";

const dom = usePhoneDom();
const waiting = "Claim or Steal available in";

function phone() {
  const send = mock((_message: ClientMsg) => {});
  const session = new PhoneSession({
    send,
    saveToken: () => {},
    preloadImages: () => {},
    show: ({ view, resumeVersion }) => {
      act(() => render(view?.kind === "land" ? <PhoneModeScreen view={view} send={send} resumeVersion={resumeVersion} /> : null, dom.root));
    },
  });
  const showActivity = (activityKey: number, remainingMs: number) =>
    session.receive({ type: "player.state", view: { ...claimView, claimWait: { activityKey, remainingMs } } });
  const reconnect = () => {
    session.open("resume-token");
    expect(send).toHaveBeenLastCalledWith({ type: "resume", token: "resume-token" });
    session.receive({ type: "player.state", view: { kind: "none", game: null } });
    session.receive({ type: "joined", token: "resume-token", playerId: "settler" });
  };
  session.open(null);
  return { session, showActivity, reconnect };
}

describe("After-answer wait", () => {
  test.each([
    { when: "before", elapsed: 399, stillWaiting: true },
    { when: "after", elapsed: 401, stillWaiting: false },
  ])("accepts a later deadline on the resumed view $when cached expiry without restarting on patches", ({ elapsed, stillWaiting }) => {
    const { session, showActivity, reconnect } = phone();
    showActivity(3, 400);
    const mounted = dom.root.querySelector(".land-claim");
    expect(mounted).not.toBeNull();

    dom.advance(300);
    session.receive({ type: "player.patch", ops: [[["teamTiles"], 2]] });
    reconnect();
    dom.advance(elapsed - 300);
    // why: The stale patch and pre-resume frames leave the cached countdown alone.
    expect(dom.root.textContent?.includes(waiting)).toBe(stillWaiting);
    expect(dom.root.querySelector(".land-claim")).toBe(mounted);

    // why: The host's clock moved back; the fresh view has more time than the cached one.
    showActivity(3, 1200);
    expect(dom.root.querySelector(".land-claim")).toBe(mounted);
    expect(dom.root.textContent).toContain(`${waiting} 2s`);
    dom.advance(200);
    expect(dom.root.textContent).toContain(`${waiting} 1s`);
    dom.advance(100);
    session.receive({ type: "player.patch", ops: [[["teamTiles"], 3]] });
    dom.advance(899);
    expect(dom.root.textContent).toContain(`${waiting} 1s`);
    dom.advance(1);
    expect(dom.root.textContent).not.toContain(waiting);
  });

  test("a fresh ready resume clears the old deadline and a later activity starts its own wait", () => {
    const { showActivity, reconnect } = phone();
    showActivity(3, 1000);
    dom.advance(200);
    reconnect();
    showActivity(3, 0);
    expect(dom.root.textContent).not.toContain(waiting);

    // why: A phone can miss the intervening question views; a different key still starts a new wait.
    showActivity(6, 200);
    expect(dom.root.textContent).toContain(`${waiting} 1s`);
    dom.advance(200);
    expect(dom.root.textContent).not.toContain(waiting);
  });
});

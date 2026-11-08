/** Actual phone UI with deterministic Christmas pictures; serve.ts --symbols. */
import { render } from "preact";
import { useState } from "preact/hooks";
import { SubPlayer } from "../../src/client/player/submarine.tsx";
import { CHRISTMAS_GLYPHS, glyphId } from "../../src/shared/glyphs.ts";
import type { PlayerSubView } from "../../src/shared/protocol.ts";
import "../../src/client/shared/theme.css";
import "../../src/client/player/player.css";

function Preview() {
  const query = new URLSearchParams(location.search);
  const index = Number(query.get("symbol") || 0) % CHRISTMAS_GLYPHS.length;
  const symbol = CHRISTMAS_GLYPHS[index]!;
  const target = glyphId(symbol);
  const [done, setDone] = useState(false);
  const [locked, setLocked] = useState(false);
  const timer = { index: 0, total: 5, symbolRemainingMs: 8000, symbolMs: 8000 };
  const same = CHRISTMAS_GLYPHS.filter((g) => g.family === symbol.family && glyphId(g) !== target).slice(0, 3);
  const other = CHRISTMAS_GLYPHS.filter((g) => g.family !== symbol.family).slice(0, 2);
  const grid = [glyphId(same[0]!), glyphId(other[0]!), target, glyphId(same[1]!), glyphId(other[1]!), glyphId(same[2]!)];
  const view: PlayerSubView = {
    kind: "sub", phase: "dive", title: "Christmas symbols", level: 1, depth: 100,
    phaseRemainingMs: 100000, me: { id: "preview", nickname: "Holly", avatar: { avatar: "fox", accessory: "scarf" }, correct: 4, boosts: 1, diveHits: 0 },
    state: "waiting", towardBoost: 0, question: null, feedback: null, result: null,
    dive: query.has("instructor")
      ? { role: "instructor", symbol: target, found: 1, groupSize: 3, ...timer }
      : { role: "diver", grid, done, lockedMs: locked ? 1000 : 0, hint: query.has("solo") ? target : null, ...timer },
  };
  return <SubPlayer view={view} send={(message) => {
    if (message.type !== "sub.tap") return;
    if (message.symbol === target) setDone(true);
    else { setLocked(true); setTimeout(() => setLocked(false), 1000); }
  }} />;
}
render(<Preview />, document.getElementById("app")!);

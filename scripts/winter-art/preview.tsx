/** Interactive art review fixture: bun scripts/winter-art/serve.ts */
import { render } from "preact";
import { useEffect, useState } from "preact/hooks";
import type { HostView, SubPhase } from "../../src/shared/protocol.ts";
import { ChristmasGoblin, DogSled, WinterBackdrop } from "../../src/client/shared/winter-art.tsx";
import { SubStage } from "../../src/client/host/submarine.tsx";
import "../../src/client/shared/theme.css";
import "../../src/client/host/host.css";


function AnimationStudy({ subject }: { subject: string }) {
  const [reach, setReach] = useState(0);
  useEffect(() => {
    const start = performance.now();
    const timer = setInterval(() => setReach(Math.min(1, (performance.now() - start) / 6500)), 40);
    return () => clearInterval(timer);
  }, []);
  return <div style={{ height: "100vh", position: "relative", overflow: "hidden" }}>
    <WinterBackdrop paceRef={{ current: 1 }} />
    <div style={{ position: "absolute", top: 30, left: 40, color: "#fff0d0", background: "#264b47dd", padding: "12px 24px", borderRadius: 8, fontSize: 24 }}>
      {subject === "goblin" ? "Christmas goblin · supplied animation" : "Sled dogs · running cycle"}
    </div>
    <div style={subject === "goblin" ? { position: "absolute", bottom: "10%", left: "35%", width: "30%" } : { position: "absolute", bottom: "16%", left: "3%", width: "94%" }}>
      {subject === "goblin" ? <ChristmasGoblin closeness={reach} /> : <DogSled riders={[{ key: "fox", choice: { avatar: "fox", accessory: "scarf" } }, { key: "bear", choice: { avatar: "polarbear", accessory: "scarf" } }]} />}
    </div>
  </div>;
}

function Preview() {
  const [phase, setPhase] = useState<SubPhase>("chase");
  const [gap, setGap] = useState(9);
  const [seq, setSeq] = useState(0);
  const avatars = ["polarbear", "fox", "bunny"] as const;
  const view: Extract<HostView, { kind: "sub" }> = {
    kind: "sub", phase, quiz: { id: "art", title: "The Christmas countryside", questionCount: 10 },
    level: 1, depth: 240, phaseRemainingMs: 10000, gap, maxGap: 20, speed: new URLSearchParams(location.search).has("live") ? .2 : 0,
    boosts: 3, required: 8, lastBoost: seq ? { seq, nickname: "Holly", avatar: { avatar: "fox", accessory: "scarf" } } : null,
    dive: { instructors: [{ nickname: "Holly", index: 2, total: 5, found: 2, groupSize: 3, done: false }] },
    players: avatars.map((avatar, i) => ({ id: `${i}`, nickname: `Rider ${i}`, avatar: { avatar, accessory: "scarf" }, connected: true, state: "question" })),
    playerCount: 3, awards: null, errors: null, hasResults: false,
    join: { url: "http://localhost:8080", qrSvg: "", address: "localhost", addresses: [], port: 8080 },
  };
  return <><SubStage view={view} send={() => {}} /><nav style={{ position: "fixed", bottom: 8, left: 12, zIndex: 50, display: "flex", gap: 8 }}>
    {(["chase", "countdown", "dive", "caught", "escaped", "podium"] as const).map(p => <button onClick={() => setPhase(p)}>{p}</button>)}
    <button onClick={() => setSeq(seq + 1)}>Boost</button>
    <label>Goblin distance <input aria-label="Goblin distance" type="range" min="0" max="20" value={gap} onInput={e => setGap(Number(e.currentTarget.value))} /></label>
  </nav></>;
}
const subject = new URLSearchParams(location.search).get("subject");
render(subject ? <AnimationStudy subject={subject} /> : <Preview />, document.getElementById("app")!);

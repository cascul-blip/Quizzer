import { render } from "preact";
import { useState } from "preact/hooks";
import type { HostDuelState, HostView, PlayerDuelView, DuelPhase } from "../../src/shared/protocol.ts";
import type { DuelTheme } from "../../src/shared/duel-theme.ts";
import { DuelStage } from "../../src/client/host/duel.tsx";
import { DuelPlayer } from "../../src/client/player/duel.tsx";
import { SnowballLobbyPreview } from "../../src/client/shared/duel-christmas.tsx";
import { setPhoneArt } from "../../src/client/shared/phone-art.ts";

type Fixture = Record<DuelPhase, { host: HostDuelState; phone: PlayerDuelView }>;
function Review({ fixture, phone }: { fixture: Fixture; phone: boolean }) {
  const query = new URLSearchParams(location.search);
  const [phase, setPhase] = useState<DuelPhase>((query.get("phase") as DuelPhase) || "reveal");
  const [theme, setTheme] = useState<DuelTheme>(query.get("theme") === "classic" ? "classic" : "christmas");
  const [draw, setDraw] = useState(false);
  const [swap, setSwap] = useState(false);
  const [seq, setSeq] = useState(0);
  const elapsed = seq === 0 ? Number(query.get("elapsed") || 0) : 0;
  const host: Extract<HostView, { kind: "duel" }> = { ...fixture[phase].host, theme, revealElapsedMs: elapsed, join: { url: "http://127.0.0.1:8102/phone", qrSvg: "", address: "127.0.0.1", addresses: [], port: 8102 } };
  if (host.lastRound && (draw || swap)) host.lastRound = { ...host.lastRound, arenas: host.lastRound.arenas.map(a => ({ ...a, draw, duelists: a.duelists.map(p => ({ ...p, outcome: draw ? "stay" : swap ? p.outcome === "win" ? "lose" : p.outcome === "lose" ? "win" : "stay" : p.outcome })) })) };
  const player = { ...fixture[phase].phone, theme, revealElapsedMs: elapsed };
  if (draw || swap) player.myDuel = host.lastRound?.arenas.find(a => a.duelists.some(p => p.id === player.me.id)) ?? null;
  return <>
    <nav style={{ position: "fixed", bottom: 0, left: 0, zIndex: 100, background: "#102039ee", color: "white", padding: "6px", display: "flex", gap: "8px", flexWrap: "wrap", fontSize: "12px" }}>
      <label>Theme <select aria-label="Theme" value={theme} onChange={e => setTheme(e.currentTarget.value as DuelTheme)}><option value="christmas">Christmas</option><option value="classic">Classic</option></select></label>
      <label>Phase <select aria-label="Phase" value={phase} onChange={e => setPhase(e.currentTarget.value as DuelPhase)}>{["intro", "open", "reveal", "podium"].map(p => <option value={p}>{p}</option>)}</select></label>
      <label><input aria-label="Draw" type="checkbox" checked={draw} onChange={e => { setDraw(e.currentTarget.checked); setSeq(seq + 1); }} />Draw</label>
      <label><input aria-label="Reverse winner" type="checkbox" checked={swap} onChange={e => { setSwap(e.currentTarget.checked); setSeq(seq + 1); }} />Reverse winner</label>
      <button onClick={() => setSeq(seq + 1)}>Replay</button>
    </nav>
    {query.has("lobby") ? <SnowballLobbyPreview /> : phone ? <DuelPlayer key={`${phase}-${theme}-${seq}`} view={player} send={() => {}} /> : <DuelStage key={`${phase}-${theme}-${seq}`} view={host} send={() => {}} />}
  </>;
}
export async function mountGameReview(phone: boolean) {
  if (phone) setPhoneArt();
  const fixture = await fetch("/fixture").then(r => r.json()) as Fixture;
  render(<Review fixture={fixture} phone={phone} />, document.getElementById("app")!);
}

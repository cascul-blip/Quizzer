import { render } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { Avatar } from "../../src/client/shared/avatar-art.tsx";
import type { AvatarId } from "../../src/shared/avatars.ts";
import "./preview.css";

// Coordinates use the generated sheet's uniform square cells. Head points are
// measured individually so avatar attachment follows the collar during the throw.
const HEAD = [[53, 13], [55, 19], [53, 13], [53, 15], [56, 14], [53, 15], [53, 14], [46, 13]];
const RELEASE = 480, IMPACT = 1000, END = 1900;
function throwFrame(t: number) {
  if (t < 140) return 0;
  if (t < 260) return 1;
  if (t < 390) return 2;
  if (t < RELEASE) return 3;
  if (t < 610) return 4;
  if (t < 770) return 5;
  return 6;
}
function Elf({ frame, avatar, right, hit }: { frame: number; avatar: AvatarId; right: boolean; hit: number }) {
  const [x, y] = HEAD[frame]!;
  return <div class={`elf ${right ? "right" : "left"}`} data-frame={frame} style={{ transform: `translateX(${(right ? 1 : -1) * Math.sin(hit * Math.PI) * 12}px)` }}>
    <div class="shadow" />
    <div class="head" style={{ left: `${(right ? 100 - x! : x!) - 19}%`, top: `${y! - 21.28}%` }}>
      <Avatar choice={{ avatar, accessory: "santahat" }} />
    </div>
    <div class={`body ${right ? "mirror" : ""}`} style={{ backgroundPosition: `${(frame % 4) * 100 / 3}% ${Math.floor(frame / 4) * 100}%` }} />
  </div>;
}
function App() {
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [winner, setWinner] = useState("left");
  const [avatar, setAvatar] = useState<AvatarId>("penguin");
  const [slow, setSlow] = useState(false);
  const [reduced, setReduced] = useState(false);
  const origin = useRef(0);
  useEffect(() => {
    const query = matchMedia("(prefers-reduced-motion: reduce)");
    const change = () => setReduced(query.matches);
    change(); query.addEventListener("change", change);
    return () => query.removeEventListener("change", change);
  }, []);
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(END, (now - origin.current) / (slow ? 2 : 1));
      setTime(t);
      if (t < END) raf = requestAnimationFrame(tick);
      else setPlaying(false);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, slow]);
  const play = () => { setPlaying(false); setTime(0); origin.current = performance.now(); requestAnimationFrame(() => setPlaying(true)); };
  const flight = time >= RELEASE && time < IMPACT;
  const u = (time - RELEASE) / (IMPACT - RELEASE);
  const burst = Math.max(0, Math.min(1, (time - IMPACT) / 650));
  const impactVisible = time >= IMPACT && time < IMPACT + 650;
  const hitX = winner === "left" ? 75 : 25;
  const ballX = winner === "left" ? 34 + 41 * u : 66 - 41 * u;
  const ballY = 54 + 4 * u - 18 * 4 * u * (1 - u);
  const phase = time < RELEASE ? "Wind-up" : time < IMPACT ? "Snowball in flight" : time < 1650 ? "Snow puff on loser" : "Settled";
  return <main>
    <header><p>ART & MOTION PROTOTYPE</p><h1>North Pole Snowball Showdown</h1><span>Player avatars · pose animation · snowball impact</span></header>
    <div class="scene" data-phase={phase}>
      <Elf avatar={avatar} frame={reduced ? 0 : winner === "left" ? throwFrame(time) : time >= IMPACT && time < 1500 ? 7 : 0} right={false} hit={!reduced && winner === "right" ? burst : 0} />
      <Elf avatar="polarbear" frame={reduced ? 0 : winner === "right" ? throwFrame(time) : time >= IMPACT && time < 1500 ? 7 : 0} right={true} hit={!reduced && winner === "left" ? burst : 0} />
      {flight && !reduced && <div class="snowball" style={{ left: `${ballX}%`, top: `${ballY}%` }} />}
      {impactVisible && <div class="impact" data-target={winner === "left" ? "right" : "left"} style={{ left: `${hitX}%`, top: "58%", opacity: reduced ? .8 : Math.sin(Math.PI * Math.pow(burst, .55)), transform: `translate(-50%,-50%) scale(${reduced ? 1 : .45 + burst * 1.3})` }}><img src="/art/puff.png" alt="Snow puff hitting the losing player" /></div>}
      <div class="name left-name">Your avatar{time >= IMPACT && winner === "left" ? " · Winner!" : ""}</div>
      <div class="name right-name">Polar Bear{time >= IMPACT && winner === "right" ? " · Winner!" : ""}</div>
    </div>
    <section class="controls" aria-label="Animation controls">
      <button onClick={play}>Replay throw</button>
      <label>Winner <select aria-label="Winner" value={winner} onChange={e => { setWinner(e.currentTarget.value); setPlaying(false); setTime(0); }}><option value="left">Left player</option><option value="right">Right player</option></select></label>
      <label>Avatar <select aria-label="Avatar" value={avatar} onChange={e => setAvatar(e.currentTarget.value as AvatarId)}>{["penguin", "cat", "reindeer", "robot", "snowman", "kid1"].map(a => <option value={a}>{a}</option>)}</select></label>
      <label><input type="checkbox" checked={slow} onChange={e => { setSlow(e.currentTarget.checked); setPlaying(false); }} /> Half speed</label>
      <label class="scrubber">Timeline <input aria-label="Timeline" type="range" min="0" max={END} value={time} onInput={e => { setPlaying(false); setTime(Number(e.currentTarget.value)); }} /></label>
      <output>{phase} · {Math.round(time)} ms</output>
    </section>
    <p class="note">Prototype for reviewing avatar attachment, throw timing, and a snow puff on the loser. The live lobby and game are unchanged.</p>
  </main>;
}
render(<App />, document.getElementById("app")!);

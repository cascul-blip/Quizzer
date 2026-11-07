/** Articulated, profile-view Christmas chase art. Game rules keep the submarine protocol. */
import { useEffect, useRef, useState } from "preact/hooks";
import type { RefObject } from "preact";
import type { AvatarChoice } from "../../shared/avatars.ts";
import { Avatar } from "./avatar-art.tsx";
import countryside from "./winter/countryside.webp";
import snowFloor from "./winter/snow-floor.webp";
import woodenFence from "./winter/wooden-fence-tile.svg";
import dogSheet from "./winter/dogs-pair-sheet.webp";
import sledBack from "./winter/sleigh/sleigh-back.webp";
import sledFront from "./winter/sleigh/sleigh-front.webp";
import tree from "./winter/sleigh/tree.webp";
import ornamentRed from "./winter/sleigh/ornament-red-1.webp";
import ornamentGold from "./winter/sleigh/ornament-gold-1.webp";
import ornamentBlue from "./winter/sleigh/ornament-blue-1.webp";
import goblinSheet from "./winter/goblin-sheet.webp";
import "./winter-art.css";

export const winterGradient = () => "linear-gradient(#274e52, #416b69 65%, #748d81)";
export interface SledRider { key: string; choice: AvatarChoice }

/** Scroll distance follows the live chase pace, including boosts and stops. */
export function WinterBackdrop({ paceRef }: { paceRef: RefObject<number> }) {
  const world = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let frame = 0, last = performance.now(), distance = 0;
    const step = (now: number) => {
      distance += Math.min(64, now - last) * (paceRef.current ?? 0) * .003;
      last = now;
      world.current?.style.setProperty("--travel", `${distance}`);
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, []);
  return <div ref={world} class="winter-world" aria-hidden="true">
    <div class="winter-panorama" style={{ backgroundImage: `url(${countryside})` }} />
    <div class="winter-track" style={{ backgroundImage: `url(${snowFloor})` }} />
    <div class="winter-path" style={{ backgroundImage: `url(${snowFloor})` }} />
    <div class="winter-fence" style={{ backgroundImage: `url(${woodenFence})` }} />
    <div class="winter-snow">{Array.from({ length: 36 }, (_, i) => <i key={i} style={{ left: `${i * 37 % 100}%`, animationDelay: `-${i * .71}s`, animationDuration: `${7 + i % 5}s` }} />)}</div>
  </div>;
}

/** A local animation clock; reduced-motion users see a still painted pose. */
function useArtClock(moving = true, rate = 1) {
  const [time, setTime] = useState(0);
  const elapsed = useRef(0);
  // Chase distance changes every frame. Read its latest speed without restarting
  // the effect: repeated restarts can prevent the throttled clock from advancing.
  const rateRef = useRef(rate);
  rateRef.current = rate;
  useEffect(() => {
    if (!moving || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let frame = 0, last = performance.now(), rendered = last;
    const step = (now: number) => {
      elapsed.current += Math.min(64, now - last) / 1000 * rateRef.current;
      last = now;
      if (now - rendered >= 1000 / 24) { setTime(elapsed.current); rendered = now; }
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [moving]);
  return time;
}

const hooks = [[.35, .35], [.62, .42], [.30, .55], [.55, .58], [.72, .66], [.40, .72], [.62, .80]];
const ornamentArt = [ornamentRed, ornamentGold, ornamentBlue];
// Tree pivot and hooks share the same world transform; strings remain vertical.
const hookPositions = hooks.map(([x, y]) => {
  const angle = -48 * Math.PI / 180;
  const dx = (x! - .5) * 436 * .32, dy = (y! - .97) * 640 * .32;
  return { x: 165 + dx * Math.cos(angle) - dy * Math.sin(angle), y: 142 + dx * Math.sin(angle) + dy * Math.cos(angle) };
});

export function DogSled({ riders = [], moving = true, boosting = false }: { riders?: SledRider[]; moving?: boolean; boosting?: boolean }) {
  const time = useArtClock(moving, boosting ? 1.8 : 1);
  const [drops, setDrops] = useState<{ id: number; slot: number }[]>([]);
  const [missing, setMissing] = useState(-1);
  const sequence = useRef(0);
  useEffect(() => {
    if (!moving) return;
    const timer = setInterval(() => {
      const id = ++sequence.current, slot = (id - 1) % hooks.length;
      setMissing(slot);
      setDrops(old => [...old.filter(d => d.id > id - 4), { id, slot }]);
    }, 2400);
    return () => clearInterval(timer);
  }, [moving]);
  const frame = Math.floor(time * 12) % 36;
  return <div class={`dog-sled ${moving ? "moving" : "resting"}`} role="img" aria-label="Painted red sled carrying the squad and a trailing Christmas tree, pulled by two running huskies">
    <svg viewBox="0 0 780 300" class="sled-art" aria-hidden="true">
      <ellipse cx="410" cy="280" rx="355" ry="9" fill="#698783" opacity=".13" />
      <g class="sled-carriage">
        <image href={sledBack} x="55" y="90" width="360" height="180" preserveAspectRatio="none" />
        <g transform="translate(165 142) rotate(-48) scale(.32) translate(-218 -620.8)"><image href={tree} width="436" height="640" /></g>
        {hookPositions.map((o, i) => <g key={i} class="tree-ornament" style={{ transformOrigin: `${o.x}px ${o.y}px`, animationDelay: `${i * -.23}s`, opacity: i === missing ? 0 : 1 }}>
          <path d={`M${o.x} ${o.y} v9`} stroke="#c6aa68" stroke-width="1" />
          <image href={ornamentArt[i % 3]} x={o.x - 7} y={o.y + 7} width="14" height="18" />
        </g>)}
        {riders.slice(0, 3).map((r, i) => <g key={r.key} transform={`translate(${159 + i * 61} 137)`}>
          <foreignObject x="-32" y="-22" width="64" height="64"><Avatar choice={r.choice} /></foreignObject>
        </g>)}
        <image href={sledFront} x="55" y="90" width="360" height="180" preserveAspectRatio="none" />
      </g>
      <path d="M400 222 L742 214" fill="none" stroke="#8d5140" stroke-width="2" />
    </svg>
    <div class="painted-dog-pair" data-frame={frame} style={{ backgroundImage: `url(${dogSheet})`, backgroundPosition: `${frame % 6 * 20}% ${Math.floor(frame / 6) * 20}%` }} />
    {drops.map(d => <img key={d.id} src={ornamentArt[d.slot % 3]} alt="" class="fallen-ornament" style={{ "--drop-start": `${hookPositions[d.slot]!.x / 780 * 100}%`, "--drop-top": `${(hookPositions[d.slot]!.y + 8) / 300 * 100}%` }} />)}
  </div>;
}

/** The supplied goblin, flipped and keyed from magenta into a transparent frame sheet. */
export function ChristmasGoblin({ closeness = 0, caught = false }: { closeness?: number; caught?: boolean }) {
  const reach = Math.max(0, Math.min(1, closeness));
  const time = useArtClock(!caught, .8 + reach * .4);
  const frame = Math.floor(time * 12) % 72;
  return <div class={`christmas-goblin ${caught ? "grabbing" : ""}`} role="img"
    aria-label="Green Christmas goblin tiptoeing toward the sled with a sack over his shoulder"
    data-lean={reach * 4} style={{ transform: `rotate(${reach * 4}deg)` }}>
    <div class="goblin-video-sprite" data-frame={frame} style={{ backgroundImage: `url(${goblinSheet})`, backgroundPosition: `${frame % 8 / 7 * 100}% ${Math.floor(frame / 8) / 8 * 100}%` }} />
  </div>;
}

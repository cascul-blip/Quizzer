import { useEffect, useRef, useState } from "preact/hooks";
import type { AvatarChoice } from "../../shared/avatars.ts";
import { SNOW_END_MS, SNOW_IMPACT_MS, SNOW_PUFF_MS, SNOW_RELEASE_MS, snowballFrame, snowballShots } from "../../shared/duel-snowball.ts";
import type { DuelArenaResult, DuelPlayerRef } from "../../shared/modes/duel.ts";
import { Avatar } from "./avatar-art.tsx";
import sheet from "./duel/christmas/elf-sheet.webp";
import phoneSheet from "./duel/christmas/phone/elf-sheet.webp";
import phonePlaza from "./duel/christmas/phone/plaza.webp";
import phonePuff from "./duel/christmas/phone/snow-puff.webp";
import phoneMarket from "./duel/christmas/phone/street-1.webp";
import phoneStable from "./duel/christmas/phone/street-2.webp";
import phoneCanal from "./duel/christmas/phone/street-3.webp";
import plaza from "./duel/christmas/plaza.webp";
import puff from "./duel/christmas/snow-puff.webp";
import market from "./duel/christmas/street-1.webp";
import stable from "./duel/christmas/street-2.webp";
import canal from "./duel/christmas/street-3.webp";
import { isPhoneArt } from "./phone-art.ts";
import { play } from "./sounds.ts";

const HOST = [plaza, market, stable, canal];
const PHONE = [phonePlaza, phoneMarket, phoneStable, phoneCanal];
export function snowballBackground(arena: number, phone = isPhoneArt()): string {
  const index = arena <= 1 ? 0 : 1 + (Math.max(0, Math.floor(arena) - 2) % 3);
  return (phone ? PHONE : HOST)[index]!;
}
// why: the Image objects are held so the browser keeps them decoded.
const warmed = new Set<string>();
const held: HTMLImageElement[] = [];

// why: one file at a time, so a whole class doesn't hit the Wi-Fi at once.
function warmInOrder(srcs: string[], i = 0): void {
  const src = srcs[i];
  if (src === undefined) return;
  if (warmed.has(src)) return warmInOrder(srcs, i + 1);
  warmed.add(src);
  const image = new Image();
  image.src = src;
  held.push(image);
  image
    .decode()
    .catch(() => {})
    .then(() => warmInOrder(srcs, i + 1));
}

// why: a phone only ever shows its own arena, so call again when the arena changes.
export function preloadSnowballArt(phone = isPhoneArt(), arena?: number) {
  if (!phone) return warmInOrder([...HOST, sheet, puff]);
  warmInOrder([...(arena === undefined ? [] : [snowballBackground(arena, true)]), phoneSheet, phonePuff]);
}

const HEAD_CENTER_PCT_OF_CELL = [
  [53, 13],
  [55, 19],
  [53, 13],
  [53, 15],
  [56, 14],
  [53, 15],
  [53, 14],
  [46, 13],
];
const BOX = [
  { left: 7, top: 39, width: 28 },
  { left: 65, top: 39, width: 28 },
  { left: 40, top: 24, width: 20 },
];
type Person = DuelPlayerRef & { answered?: boolean; connected?: boolean };

function useReducedMotion() {
  const [reduced, setReduced] = useState(() => matchMedia("(prefers-reduced-motion: reduce)").matches);
  useEffect(() => {
    const query = matchMedia("(prefers-reduced-motion: reduce)");
    const change = () => setReduced(query.matches);
    change();
    query.addEventListener("change", change);
    return () => query.removeEventListener("change", change);
  }, []);
  return reduced;
}

// why: elapsed is read only when the round changes, so snapshots never restart the clock.
function useSnowballTime(round: number, active: boolean, elapsed: number) {
  const [time, setTime] = useState(active ? elapsed : 0);
  const offset = useRef(elapsed);
  offset.current = elapsed;
  useEffect(() => {
    const initial = active ? offset.current : 0;
    setTime(initial);
    if (!active || initial >= SNOW_END_MS) return;
    const start = performance.now() - initial;
    let raf = 0;
    const tick = () => {
      const t = Math.min(SNOW_END_MS, performance.now() - start);
      setTime(t);
      if (t < SNOW_END_MS) raf = requestAnimationFrame(tick);
    };
    // why: runs under reduced motion too, to advance the static result and clear the puff.
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [round, active]);
  return time;
}

function Elf({ avatar, frame, right, phone }: { avatar: AvatarChoice; frame: number; right: boolean; phone: boolean }) {
  const [x, y] = HEAD_CENTER_PCT_OF_CELL[frame]!;
  return (
    <>
      <div class="snowball-shadow" />
      <div class="snowball-head" style={{ left: `${(right ? 100 - x! : x!) - 19}%`, top: `${y! - 21.28}%` }}>
        <Avatar choice={{ ...avatar, accessory: avatar.accessory === "none" ? "santahat" : avatar.accessory }} />
      </div>
      <div
        class={`snowball-body ${right ? "mirrored" : ""}`}
        style={{ backgroundImage: `url(${phone ? phoneSheet : sheet})`, backgroundPosition: `${((frame % 4) * 100) / 3}% ${Math.floor(frame / 4) * 100}%` }}
      />
    </>
  );
}

export function SnowballScene({
  arena,
  people,
  result = null,
  round,
  elapsedMs = 0,
  phone = isPhoneArt(),
  labels = true,
  sound = false,
  leaving = false,
}: {
  arena: number;
  people: Person[];
  result?: DuelArenaResult | null;
  round: number;
  elapsedMs?: number;
  phone?: boolean;
  labels?: boolean;
  sound?: boolean;
  leaving?: boolean;
}) {
  const reduced = useReducedMotion();
  const time = useSnowballTime(round, !!result, elapsedMs);
  const rendered = result?.duelists ?? people;
  const shots = result ? snowballShots(result.duelists, result.draw) : [];
  const soundOffset = useRef(elapsedMs);
  soundOffset.current = elapsedMs;
  useEffect(() => {
    if (!sound || !result || !shots.length) return;
    const delay = SNOW_IMPACT_MS - soundOffset.current;
    if (delay <= 0) return;
    const timer = setTimeout(() => play("thud"), delay);
    return () => clearTimeout(timer);
  }, [round, !!result, sound]);
  return (
    <div class="snowball-scene" data-arena={arena} data-time={Math.round(time)}>
      <img class="snowball-backdrop" src={snowballBackground(arena, phone)} alt="" draggable={false} />
      <div class="snowball-world">
        {rendered.map((person, slot) => {
          const box = BOX[slot]!;
          const incoming = shots.find((s) => s.to === slot && !s.miss);
          const outgoing = shots.find((s) => s.from === slot);
          const right = slot === 1 || (slot === 2 && (outgoing?.to ?? incoming?.from ?? 1) === 0);
          const hit = !!incoming && time >= SNOW_IMPACT_MS && time < SNOW_IMPACT_MS + 500;
          const frame = reduced ? 0 : hit ? 7 : outgoing ? snowballFrame(time) : 0;
          const live = people.find((p) => p.id === person.id);
          const moving = leaving && result && result.duelists[slot]!.nextArena !== arena;
          return (
            <div
              key={person.id}
              class={`snowball-elf slot${slot} ${live?.connected === false ? "away" : ""} ${moving ? "departed" : ""}`}
              data-player={person.id}
              data-frame={frame}
              style={{ left: `${box.left}%`, top: `${box.top}%`, width: `${box.width}%`, zIndex: slot === 2 ? 1 : 2 }}
            >
              <Elf avatar={person.avatar} frame={frame} right={right} phone={phone} />
              {live?.answered && !result && (
                <span class="snowball-ready" aria-label="Answered">
                  ✓
                </span>
              )}
            </div>
          );
        })}
        {shots.map((shot, i) => {
          const from = BOX[shot.from]!,
            to = BOX[shot.to]!;
          const facesLeft = shot.from === 1 || (shot.from === 2 && shot.to === 0);
          const x0 = from.left + from.width * (facesLeft ? 0.16 : 0.84);
          const y0 = from.top + ((from.width * 16) / 9) * 0.29;
          const x1 = to.left + to.width * 0.5;
          const y1 = shot.miss ? 86 : to.top + ((to.width * 16) / 9) * 0.39;
          const u = Math.max(0, Math.min(1, (time - SNOW_RELEASE_MS) / (SNOW_IMPACT_MS - SNOW_RELEASE_MS)));
          const age = (time - SNOW_IMPACT_MS) / SNOW_PUFF_MS;
          return (
            <div key={i} class="snowball-shot" data-from={rendered[shot.from]!.id} data-target={shot.miss ? "ground" : rendered[shot.to]!.id}>
              {!reduced && time >= SNOW_RELEASE_MS && time < SNOW_IMPACT_MS && (
                <div class="snowball-projectile" style={{ left: `${x0 + (x1 - x0) * u}%`, top: `${y0 + (y1 - y0) * u - 72 * u * (1 - u)}%` }} />
              )}
              {age >= 0 && age < 1 && (
                <img
                  class={`snowball-impact ${shot.miss ? "miss" : "hit"}`}
                  src={phone ? phonePuff : puff}
                  alt={shot.miss ? "Snowball misses" : "Snowball hits the losing player"}
                  style={{
                    left: `${x1}%`,
                    top: `${y1}%`,
                    opacity: reduced ? 0.85 : Math.sin(Math.PI * Math.pow(age, 0.55)),
                    transform: `translate(-50%, -50%) scale(${reduced ? 1 : 0.45 + age * 1.3})`,
                  }}
                />
              )}
            </div>
          );
        })}
        {labels &&
          rendered.map((p, i) => (
            <span class={`snowball-label slot${i}`} style={{ left: `${BOX[i]!.left + BOX[i]!.width / 2}%` }} key={p.id}>
              {p.nickname}
            </span>
          ))}
      </div>
    </div>
  );
}

export function SnowballLobbyPreview() {
  return (
    <div class="snowball-lobby-preview">
      <SnowballScene
        arena={1}
        round={0}
        people={[
          { id: "preview-left", nickname: "Snowball", avatar: { avatar: "penguin", accessory: "none" } },
          { id: "preview-right", nickname: "Showdown", avatar: { avatar: "polarbear", accessory: "none" } },
        ]}
      />
      <span>❄️ North Pole Snowball Showdown</span>
    </div>
  );
}

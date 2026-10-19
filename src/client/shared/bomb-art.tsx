/**
 * Bomb Squad art. The painted files live in ./bomb/ (phone copies in ./bomb/phone/).
 * Artist drops replacements in by filename; BOMB_ART_SLOTS is the only map from a slot
 * to those files. scripts/bomb-art.py and scripts/bomb-art/ are the source pipeline.
 * The clock digits, the white flash and the screen shake are drawn in code.
 */
import type { CSSProperties } from "preact";
import type { BombPanel, BombWireColor, HostBombModule } from "../../shared/protocol.ts";
import { isPhoneArt, pickArt } from "./phone-art.ts";
import benchImg from "./bomb/bench.webp";
import benchScorchedImg from "./bomb/bench-scorched.webp";
import casingImg from "./bomb/casing.webp";
import confettiImg from "./bomb/confetti.webp";
import explosionDebrisImg from "./bomb/explosion-debris.webp";
import explosionFireballImg from "./bomb/explosion-fireball.webp";
import explosionSmokeImg from "./bomb/explosion-smoke.webp";
import lightGreenImg from "./bomb/light-green.webp";
import lightOffImg from "./bomb/light-off.webp";
import lightRedImg from "./bomb/light-red.webp";
import moduleKeypadImg from "./bomb/module-keypad.webp";
import modulePictureImg from "./bomb/module-picture.webp";
import moduleWireImg from "./bomb/module-wire.webp";
import sparksImg from "./bomb/sparks.webp";
import wireImg from "./bomb/wire.webp";
import wireCutImg from "./bomb/wire-cut.webp";
import wireTintImg from "./bomb/wire-tint.webp";
import wireCutTintImg from "./bomb/wire-cut-tint.webp";
import phoneCasingImg from "./bomb/phone/casing.webp";
import phoneConfettiImg from "./bomb/phone/confetti.webp";
import phoneCuttersImg from "./bomb/phone/cutters.webp";
import phoneLightGreenImg from "./bomb/phone/light-green.webp";
import phoneLightOffImg from "./bomb/phone/light-off.webp";
import phoneLightRedImg from "./bomb/phone/light-red.webp";
import phoneModuleKeypadImg from "./bomb/phone/module-keypad.webp";
import phoneModuleWireImg from "./bomb/phone/module-wire.webp";
import phoneSparksImg from "./bomb/phone/sparks.webp";
import phoneWireImg from "./bomb/phone/wire.webp";
import phoneWireCutImg from "./bomb/phone/wire-cut.webp";
import phoneWireTintImg from "./bomb/phone/wire-tint.webp";
import phoneWireCutTintImg from "./bomb/phone/wire-cut-tint.webp";

export interface BombArtSlot {
  id: string;
  /** Projector file under bomb/. Null when the picture is phone-only. */
  projector: { w: number; h: number } | null;
  /** Phone file under bomb/phone/. Null when phones never draw it. */
  phone: { w: number; h: number } | null;
  /** False only for the two opaque benches. */
  alpha: boolean;
  note: string;
}

/** Slot id is the file name without ".webp". Change a size here when a replacement file changes. */
export const BOMB_ART_SLOTS: readonly BombArtSlot[] = [
  { id: "bench", projector: { w: 1344, h: 768 }, phone: null, alpha: false, note: "The room and the empty bench. Opaque. Back layer." },
  { id: "bench-scorched", projector: { w: 1344, h: 768 }, phone: null, alpha: false, note: "Same framing after the explosion. The lamp sits slightly differently; crossfade under the flash." },
  { id: "casing", projector: { w: 760, h: 486 }, phone: { w: 380, h: 243 }, alpha: true, note: "The bomb. Blank clock, module bay, contact shadow. Phone copy is for a small Race bomb." },
  { id: "module-wire", projector: { w: 360, h: 372 }, phone: { w: 180, h: 186 }, alpha: true, note: "Wire panel. LEDs and wires are drawn on top." },
  { id: "module-keypad", projector: { w: 360, h: 372 }, phone: { w: 180, h: 186 }, alpha: true, note: "Keypad panel. The keys are decorative; typing happens on the phones." },
  { id: "module-picture", projector: { w: 360, h: 372 }, phone: null, alpha: true, note: "Picture panel. The question photo goes in the window. No phone copy." },
  { id: "wire", projector: { w: 81, h: 640 }, phone: { w: 40, h: 320 }, alpha: true, note: "One whole wire. Tint the insulation with wire-tint." },
  { id: "wire-cut", projector: { w: 81, h: 640 }, phone: { w: 40, h: 320 }, alpha: true, note: "The same wire, cut. Same canvas as wire." },
  { id: "wire-tint", projector: { w: 81, h: 640 }, phone: { w: 40, h: 320 }, alpha: true, note: "Mask: white where the insulation is. Drawn under wire." },
  { id: "wire-cut-tint", projector: { w: 81, h: 640 }, phone: { w: 40, h: 320 }, alpha: true, note: "Mask for the cut wire." },
  { id: "light-off", projector: { w: 96, h: 96 }, phone: { w: 48, h: 48 }, alpha: true, note: "LED, off." },
  { id: "light-green", projector: { w: 96, h: 96 }, phone: { w: 48, h: 48 }, alpha: true, note: "LED, green: that question is cleared." },
  { id: "light-red", projector: { w: 96, h: 96 }, phone: { w: 48, h: 48 }, alpha: true, note: "LED, red: flash on a wrong cut." },
  { id: "sparks", projector: { w: 512, h: 512 }, phone: { w: 256, h: 256 }, alpha: true, note: "Burst at the wire. Screen blend looks a little brighter." },
  { id: "explosion-smoke", projector: { w: 1100, h: 923 }, phone: null, alpha: true, note: "Dark smoke behind the fireball. Normal blend. Grows and fades over about 3s." },
  { id: "explosion-fireball", projector: { w: 1024, h: 1024 }, phone: null, alpha: true, note: "Fireball. Scale 0.2 to 1.4 over 0.6s, fade out by 1.2s. Screen blend." },
  { id: "explosion-debris", projector: { w: 1344, h: 768 }, phone: null, alpha: true, note: "Full-frame ring of pieces. Scale outward from the centre." },
  { id: "confetti", projector: { w: 1344, h: 768 }, phone: { w: 672, h: 384 }, alpha: true, note: "Defused. Full frame, drift down." },
  { id: "cutters", projector: null, phone: { w: 320, h: 263 }, alpha: true, note: "Phone only, on the Cut button." },
];

const PROJECTOR_ART: Record<string, string> = {
  bench: benchImg,
  "bench-scorched": benchScorchedImg,
  casing: casingImg,
  "module-wire": moduleWireImg,
  "module-keypad": moduleKeypadImg,
  "module-picture": modulePictureImg,
  wire: wireImg,
  "wire-cut": wireCutImg,
  "wire-tint": wireTintImg,
  "wire-cut-tint": wireCutTintImg,
  "light-off": lightOffImg,
  "light-green": lightGreenImg,
  "light-red": lightRedImg,
  sparks: sparksImg,
  "explosion-smoke": explosionSmokeImg,
  "explosion-fireball": explosionFireballImg,
  "explosion-debris": explosionDebrisImg,
  confetti: confettiImg,
};

const PHONE_ART: Record<string, string> = {
  casing: phoneCasingImg,
  "module-wire": phoneModuleWireImg,
  "module-keypad": phoneModuleKeypadImg,
  wire: phoneWireImg,
  "wire-cut": phoneWireCutImg,
  "wire-tint": phoneWireTintImg,
  "wire-cut-tint": phoneWireCutTintImg,
  "light-off": phoneLightOffImg,
  "light-green": phoneLightGreenImg,
  "light-red": phoneLightRedImg,
  sparks: phoneSparksImg,
  confetti: phoneConfettiImg,
  cutters: phoneCuttersImg,
};

export function bombArt(id: string): string {
  if (isPhoneArt() && PHONE_ART[id]) return PHONE_ART[id];
  return PROJECTOR_ART[id] ?? PHONE_ART[id] ?? "";
}

/** Used by the art test to confirm every imported file is a slot. */
export const BOMB_PROJECTOR_ART = PROJECTOR_ART;
export const BOMB_PHONE_ART = PHONE_ART;

export const WIRE_FILL: Record<BombWireColor, string> = {
  red: "#d10f0f",
  blue: "#1c56d8",
  yellow: "#e0ae00",
  green: "#1e9a38",
  white: "#f2f2f2",
  black: "#2b2b2b",
};

/** Percent boxes on casing.webp. */
export const CLOCK_FACE = { left: 28.3, top: 18.5, width: 27.4, height: 19.5 };
export const MODULE_BAY = { left: 28.2, top: 49.2, width: 63.7, height: 25.9 };
/** Casing drawn 740px wide on the 1344-wide bench, base line on bench (672, 640). */
export const CASING_WIDTH = (740 / 1344) * 100;
export const CASING_TOP = 26.9;
/** Explosion origin on the bench, near the casing centre. */
export const BOOM_CENTER = { x: 50, y: (423 / 768) * 100 };

const LEDS: Record<BombPanel, readonly (readonly [number, number])[]> = {
  wire: [[22.8, 10.2], [40.8, 10.2], [58.3, 10.2], [75.0, 10.2]],
  keypad: [[22.8, 10.2], [40.3, 10.2], [57.8, 10.2], [75.3, 10.2]],
  picture: [[22.2, 10.2], [39.7, 10.2], [57.2, 10.2], [75.0, 10.2]],
};
const WIRE_TOP: readonly (readonly [number, number])[] = [[22.8, 37.6], [39.7, 37.6], [57.2, 37.6], [75.0, 37.6]];
const WIRE_BOTTOM: readonly (readonly [number, number])[] = [[23.1, 65.6], [39.7, 65.6], [57.5, 65.6], [75.0, 65.6]];
export const PICTURE_WINDOW = { left: 18.9, top: 23.9, width: 61.7, height: 58.6 };

const PANEL_ASPECT = 372 / 360;

function box(left: number, top: number, width: number, height: number): CSSProperties {
  return { left: `${left}%`, top: `${top}%`, width: `${width}%`, height: `${height}%` };
}

/** A tinted wire (or its cut twin). The box is filled by the graphic. */
export function WireGraphic({ color, cut = false, class: cls = "" }: { color: BombWireColor | string; cut?: boolean; class?: string }) {
  const tint = bombArt(cut ? "wire-cut-tint" : "wire-tint");
  const fill = WIRE_FILL[color as BombWireColor] ?? color;
  return (
    <span class={`bw-wire ${cls}`}>
      <span class="bw-ink" style={{ background: fill, maskImage: `url(${tint})`, WebkitMaskImage: `url(${tint})` }} />
      <img src={bombArt(cut ? "wire-cut" : "wire")} alt="" draggable={false} />
    </span>
  );
}

export function CuttersIcon() {
  return <img class="bw-cutters" src={bombArt("cutters")} alt="" draggable={false} />;
}

function ledStyle(x: number, y: number): CSSProperties {
  const w = 9.6;
  const h = w / PANEL_ASPECT;
  return { left: `${x}%`, top: `${y}%`, width: `${w}%`, height: `${h}%` };
}

function wireStyle(i: number): CSSProperties {
  const top = WIRE_TOP[i] ?? WIRE_TOP[0]!;
  const bot = WIRE_BOTTOM[i] ?? WIRE_BOTTOM[0]!;
  const span = bot[1] - top[1];
  const height = span / 0.909;
  const topY = top[1] - height * 0.044;
  const width = height * PANEL_ASPECT * (81 / 640);
  return { left: `${top[0] - width / 2}%`, top: `${topY}%`, width: `${width}%`, height: `${height}%` };
}

export function ModuleFace({
  mod,
  image,
  spark,
  redLed = false,
}: {
  mod: HostBombModule;
  /** Question photo, single-squad picture modules only. */
  image?: string;
  spark?: boolean;
  redLed?: boolean;
}) {
  const panel = mod.panel;
  return (
    <div class={`bw-mod ${mod.cleared ? "cleared" : ""} ${mod.active ? "active" : ""} ${spark ? "sparking" : ""}`}>
      <img class="bw-panel" src={bombArt(panel === "keypad" ? "module-keypad" : panel === "picture" ? "module-picture" : "module-wire")} alt="" draggable={false} />
      {panel === "picture" && image && <img class="bw-photo" src={`/${image}`} alt="" style={box(PICTURE_WINDOW.left, PICTURE_WINDOW.top, PICTURE_WINDOW.width, PICTURE_WINDOW.height)} draggable={false} />}
      {panel === "wire" &&
        Array.from({ length: mod.total }, (_, i) => (
          <span key={i} class="bw-hang" style={wireStyle(i)}>
            <WireGraphic color={(["red", "blue", "yellow", "green"] as const)[i] ?? "red"} cut={i < mod.lights} />
          </span>
        ))}
      {Array.from({ length: mod.total }, (_, i) => {
        const socket = LEDS[panel][i] ?? LEDS.wire[i]!;
        const on = i < mod.lights;
        const red = redLed && mod.active && i === mod.lights;
        return <img key={i} class="bw-led" src={bombArt(red ? "light-red" : on ? "light-green" : "light-off")} alt="" style={ledStyle(socket[0], socket[1])} draggable={false} />;
      })}
      {spark && <img class="bw-sparks" src={bombArt("sparks")} alt="" draggable={false} />}
    </div>
  );
}

export interface BayModule {
  mod: HostBombModule;
  color?: string;
  image?: string;
  spark?: boolean;
  redLed?: boolean;
}

/** One casing. `wide` is the together bomb; Race passes a smaller one per squad. */
export function Casing({
  modules,
  clock,
  urgent = false,
  pop = null,
  name,
}: {
  modules: BayModule[];
  clock: string;
  urgent?: boolean;
  pop?: string | null;
  name?: string;
}) {
  const rows = modules.length > 4 ? [modules.slice(0, Math.ceil(modules.length / 2)), modules.slice(Math.ceil(modules.length / 2))] : [modules];
  return (
    <div class="bw-casing">
      <img class="bw-case" src={bombArt("casing")} alt="" draggable={false} />
      <div class={`bw-clock ${urgent ? "urgent" : ""}`} style={box(CLOCK_FACE.left, CLOCK_FACE.top, CLOCK_FACE.width, CLOCK_FACE.height)}>
        <span class="bw-digits">{clock}</span>
      </div>
      <div class="bw-bay" style={box(MODULE_BAY.left, MODULE_BAY.top, MODULE_BAY.width, MODULE_BAY.height)}>
        {rows.map((row, r) => (
          <div key={r} class="bw-bay-row" style={{ "--n": String(row.length) }}>
            {row.map((item, i) => (
              <div key={i} class="bw-slot" style={item.color ? { boxShadow: `inset 0 0 0 2px ${item.color}` } : undefined}>
                <ModuleFace mod={item.mod} image={item.image} spark={item.spark} redLed={item.redLed} />
              </div>
            ))}
          </div>
        ))}
      </div>
      {name && <div class="bw-squad-name">{name}</div>}
      {pop && <div class="bw-pop">{pop}</div>}
    </div>
  );
}

export function BombRoom({ exploded, shake, children }: { exploded: boolean; shake: boolean; children: preact.ComponentChildren }) {
  return (
    <div class={`bw-room ${exploded ? "is-exploded" : ""} ${shake ? "is-shaking" : ""}`}>
      <img class="bw-bench live" src={bombArt("bench")} alt="" draggable={false} />
      <img class="bw-bench scorched" src={bombArt("bench-scorched")} alt="" draggable={false} />
      <div class="bw-on-bench">{children}</div>
      {exploded && (
        <>
          <img class="bw-boom smoke" src={bombArt("explosion-smoke")} alt="" draggable={false} />
          <img class="bw-boom fireball" src={bombArt("explosion-fireball")} alt="" draggable={false} />
          <img class="bw-boom debris" src={bombArt("explosion-debris")} alt="" draggable={false} />
          <div class="bw-boom flash" />
        </>
      )}
    </div>
  );
}

export function Confetti({ class: cls = "" }: { class?: string }) {
  return <img class={`bw-confetti ${cls}`} src={pickArt(confettiImg, phoneConfettiImg)} alt="" draggable={false} />;
}

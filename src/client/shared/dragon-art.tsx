/**
 * Dragon's Hoard art: a deep mountain cave, a huge red-and-gold dragon on its hoard, the
 * team piles and banners, the chests and what comes out of them.
 *
 * The pictures are painted: scripts/dragon-art.py (the cave and the dragon) and
 * scripts/dragon-hoard-art.py (everything else) turn the sources in scripts/dragon-art/ into
 * the WebPs in ./dragon/ and the phone copies in ./dragon/phone/. The fire breath, the Zzz
 * and the glows are drawn here in code.
 *
 * DRAGON_ART_SLOTS lists every file with its size; tests/dragon.test.ts checks it against the
 * WebPs on disk. Phones only ever load PHONE_ART (chests, loot icons, the rune shield, the
 * banner and a small dragon head); the big dragon and the cave are projector only.
 */
import type { ComponentChildren, JSX } from "preact";
import type { DragonLoot } from "../../shared/protocol.ts";
import bannerClothImg from "./dragon/banner-cloth.webp";
import bannerImg from "./dragon/banner.webp";
import caveImg from "./dragon/cave.webp";
import chestClosedImg from "./dragon/chest-closed.webp";
import chestOpenImg from "./dragon/chest-open.webp";
import dragonAsleepImg from "./dragon/dragon-asleep.webp";
import dragonBadlyWoundedImg from "./dragon/dragon-badly-wounded.webp";
import dragonHeadImg from "./dragon/dragon-head.webp";
import dragonHealthyImg from "./dragon/dragon-healthy.webp";
import dragonJawBadlyWoundedImg from "./dragon/dragon-jaw-badly-wounded.webp";
import dragonJawImg from "./dragon/dragon-jaw.webp";
import dragonSlainImg from "./dragon/dragon-slain.webp";
import dragonWoundedImg from "./dragon/dragon-wounded.webp";
import hoardFullImg from "./dragon/hoard-full.webp";
import hoardHalfImg from "./dragon/hoard-half.webp";
import hoardScatteredImg from "./dragon/hoard-scattered.webp";
import jackpotPileImg from "./dragon/jackpot-pile.webp";
import lootBatsImg from "./dragon/loot-bats.webp";
import lootBigPileImg from "./dragon/loot-big-pile.webp";
import lootCoinsImg from "./dragon/loot-coins.webp";
import lootDragonScaleImg from "./dragon/loot-dragon-scale.webp";
import lootGrabImg from "./dragon/loot-grab.webp";
import lootJackpotImg from "./dragon/loot-jackpot.webp";
import lootLuckyCharmImg from "./dragon/loot-lucky-charm.webp";
import lootTrapImg from "./dragon/loot-trap.webp";
import phoneBannerClothImg from "./dragon/phone/banner-cloth.webp";
import phoneBannerImg from "./dragon/phone/banner.webp";
import phoneChestClosedImg from "./dragon/phone/chest-closed.webp";
import phoneChestOpenImg from "./dragon/phone/chest-open.webp";
import phoneDragonHeadImg from "./dragon/phone/dragon-head.webp";
import phoneLootBatsImg from "./dragon/phone/loot-bats.webp";
import phoneLootBigPileImg from "./dragon/phone/loot-big-pile.webp";
import phoneLootCoinsImg from "./dragon/phone/loot-coins.webp";
import phoneLootDragonScaleImg from "./dragon/phone/loot-dragon-scale.webp";
import phoneLootGrabImg from "./dragon/phone/loot-grab.webp";
import phoneLootJackpotImg from "./dragon/phone/loot-jackpot.webp";
import phoneLootLuckyCharmImg from "./dragon/phone/loot-lucky-charm.webp";
import phoneLootTrapImg from "./dragon/phone/loot-trap.webp";
import phoneRuneShieldImg from "./dragon/phone/rune-shield.webp";
import runeShieldImg from "./dragon/rune-shield.webp";
import teamPileClothImg from "./dragon/team-pile-cloth.webp";
import teamPileImg from "./dragon/team-pile.webp";
import { isPhoneArt } from "./phone-art.ts";
import { teamVars } from "./ui.tsx";

type DragonArtId =
  | "cave"
  | "dragon-healthy"
  | "dragon-wounded"
  | "dragon-badly-wounded"
  | "dragon-slain"
  | "dragon-asleep"
  | "dragon-jaw"
  | "dragon-jaw-badly-wounded"
  | "dragon-head"
  | "rune-shield"
  | "hoard-full"
  | "hoard-half"
  | "hoard-scattered"
  | "team-pile"
  | "team-pile-cloth"
  | "banner"
  | "banner-cloth"
  | "chest-closed"
  | "chest-open"
  | "loot-coins"
  | "loot-big-pile"
  | "loot-lucky-charm"
  | "loot-grab"
  | "loot-trap"
  | "loot-dragon-scale"
  | "loot-bats"
  | "loot-jackpot"
  | "jackpot-pile";

interface DragonArtSlot {
  id: DragonArtId;
  /** src/client/shared/dragon/<id>.webp, width × height. */
  projector: { w: number; h: number };
  /** src/client/shared/dragon/phone/<id>.webp; null if phones don't use it. */
  phone: { w: number; h: number } | null;
  /** What the picture shows and how it must line up. */
  note: string;
}

/** The dragon canvas, shared by every dragon-* picture so the stages swap in place and the jaw lines up. */
const DRAGON = { w: 1122, h: 686 };
const HOARD = { w: 996, h: 434 };
const loot = (id: DragonArtId, what: string): DragonArtSlot => ({
  id,
  projector: { w: 256, h: 256 },
  phone: { w: 128, h: 128 },
  note: `Loot icon: ${what}. Transparent, centered.`,
});

export const DRAGON_ART_SLOTS: readonly DragonArtSlot[] = [
  { id: "cave", projector: { w: 1344, h: 768 }, phone: null, note: "Cave background, lit by a golden glow from the empty floor. Opaque." },
  { id: "dragon-healthy", projector: DRAGON, phone: null, note: "Curled round its hoard, facing left, with the jaw cut out (drawn under it)." },
  { id: "dragon-wounded", projector: DRAGON, phone: null, note: "As healthy, with cracks, scorch marks and wing holes." },
  { id: "dragon-badly-wounded", projector: DRAGON, phone: null, note: "As healthy, battered and sooty, orange eye." },
  { id: "dragon-slain", projector: DRAGON, phone: null, note: "Collapsed flat on the gold, knocked out (dizzy swirls). No jaw layer." },
  { id: "dragon-asleep", projector: DRAGON, phone: null, note: "The slain picture without the swirls: the lobby's sleeping dragon. No jaw layer." },
  { id: "dragon-jaw", projector: DRAGON, phone: null, note: "Lower jaw plus the dark inner mouth, for healthy and wounded. Hinges at JAW_HINGE." },
  { id: "dragon-jaw-badly-wounded", projector: DRAGON, phone: null, note: "The same jaw, darkened to match the badly wounded body." },
  { id: "dragon-head", projector: { w: 320, h: 402 }, phone: { w: 160, h: 201 }, note: "The head alone, mouth shut, for the phone's health bar." },
  { id: "rune-shield", projector: { w: 640, h: 640 }, phone: { w: 320, h: 320 }, note: "The Shield of Faith: a gold shield with a glowing cross. Transparent." },
  { id: "hoard-full", projector: HOARD, phone: null, note: "The whole hoard. All hoard-* share this canvas, bottom-centred." },
  { id: "hoard-half", projector: HOARD, phone: null, note: "What's left after the dragon escaped with the rest." },
  { id: "hoard-scattered", projector: HOARD, phone: null, note: "The hoard burst across the floor (Act 2)." },
  { id: "team-pile", projector: { w: 640, h: 527 }, phone: null, note: "Coins on a cloth with a pennant; the cloth is see-through shading over the team color." },
  { id: "team-pile-cloth", projector: { w: 640, h: 527 }, phone: null, note: "Mask: where the team color goes under team-pile." },
  { id: "banner", projector: { w: 419, h: 640 }, phone: { w: 210, h: 320 }, note: "A hanging banner with a gold dragon emblem; the cloth is shading over the team color." },
  { id: "banner-cloth", projector: { w: 419, h: 640 }, phone: { w: 210, h: 320 }, note: "Mask: where the team color goes under banner." },
  { id: "chest-closed", projector: { w: 512, h: 505 }, phone: { w: 256, h: 252 }, note: "A closed treasure chest. Same canvas as chest-open." },
  { id: "chest-open", projector: { w: 512, h: 505 }, phone: { w: 256, h: 252 }, note: "The same chest, lid open, full of gold. The base lines up with chest-closed." },
  loot("loot-coins", "a small stack of coins"),
  loot("loot-big-pile", "a big pile of coins"),
  loot("loot-lucky-charm", "a golden horseshoe with a ruby"),
  loot("loot-grab", "a gauntlet snatching coins (Grab 10% and 25%, with the % written over it)"),
  loot("loot-trap", "the dragon's last breath: a fireball with blackened coins"),
  loot("loot-dragon-scale", "a red dragon scale with a golden rim"),
  loot("loot-bats", "three sooty bats"),
  loot("loot-jackpot", "an overflowing chest with a crown"),
  { id: "jackpot-pile", projector: { w: 676, h: 640 }, phone: null, note: "The Jackpot heap. Glow it in CSS." },
];

/** Projector pictures, by slot. */
export const PROJECTOR_ART: Record<DragonArtId, string> = {
  cave: caveImg,
  "dragon-healthy": dragonHealthyImg,
  "dragon-wounded": dragonWoundedImg,
  "dragon-badly-wounded": dragonBadlyWoundedImg,
  "dragon-slain": dragonSlainImg,
  "dragon-asleep": dragonAsleepImg,
  "dragon-jaw": dragonJawImg,
  "dragon-jaw-badly-wounded": dragonJawBadlyWoundedImg,
  "dragon-head": dragonHeadImg,
  "rune-shield": runeShieldImg,
  "hoard-full": hoardFullImg,
  "hoard-half": hoardHalfImg,
  "hoard-scattered": hoardScatteredImg,
  "team-pile": teamPileImg,
  "team-pile-cloth": teamPileClothImg,
  banner: bannerImg,
  "banner-cloth": bannerClothImg,
  "chest-closed": chestClosedImg,
  "chest-open": chestOpenImg,
  "loot-coins": lootCoinsImg,
  "loot-big-pile": lootBigPileImg,
  "loot-lucky-charm": lootLuckyCharmImg,
  "loot-grab": lootGrabImg,
  "loot-trap": lootTrapImg,
  "loot-dragon-scale": lootDragonScaleImg,
  "loot-bats": lootBatsImg,
  "loot-jackpot": lootJackpotImg,
  "jackpot-pile": jackpotPileImg,
};

/** Phone copies, by slot. */
export const PHONE_ART: Partial<Record<DragonArtId, string>> = {
  "dragon-head": phoneDragonHeadImg,
  "rune-shield": phoneRuneShieldImg,
  banner: phoneBannerImg,
  "banner-cloth": phoneBannerClothImg,
  "chest-closed": phoneChestClosedImg,
  "chest-open": phoneChestOpenImg,
  "loot-coins": phoneLootCoinsImg,
  "loot-big-pile": phoneLootBigPileImg,
  "loot-lucky-charm": phoneLootLuckyCharmImg,
  "loot-grab": phoneLootGrabImg,
  "loot-trap": phoneLootTrapImg,
  "loot-dragon-scale": phoneLootDragonScaleImg,
  "loot-bats": phoneLootBatsImg,
  "loot-jackpot": phoneLootJackpotImg,
};

/** The picture for a slot on this page: the phone copy on phones when there is one. */
function dragonArt(id: DragonArtId): string {
  return (isPhoneArt() ? PHONE_ART[id] : undefined) ?? PROJECTOR_ART[id];
}

function Img({ id, class: cls }: { id: DragonArtId; class?: string }) {
  return <img class={`dragon-art ${cls ?? ""}`} src={dragonArt(id)} alt="" draggable={false} />;
}

/** A picture over its *-cloth mask filled with the team color, both in the same box. */
function Tinted({ id, cloth, color, class: cls }: { id: DragonArtId; cloth: DragonArtId; color: string; class?: string }) {
  const mask = `url(${dragonArt(cloth)})`;
  return (
    <span class={`dragon-art tinted ${cls ?? ""}`}>
      <span class="tint" style={{ background: color, maskImage: mask, WebkitMaskImage: mask }} />
      <img src={dragonArt(id)} alt="" draggable={false} />
    </span>
  );
}

// ---------- the cave ----------

export function CaveBackdrop({ scattered = false, escaped = false }: { scattered?: boolean; escaped?: boolean }) {
  return (
    <div class="dragon-cave" style={{ backgroundImage: `url(${dragonArt("cave")})` }}>
      {scattered && <Img id="hoard-scattered" class="hoard-scattered" />}
      {escaped && <div class="cave-escaped" aria-hidden="true" />}
    </div>
  );
}

// ---------- the hoard ----------

/** The hoard on its own (the dragon's pictures have their own gold under it). Bottom-centred. */
export function Hoard({ size }: { size: "full" | "half" }) {
  return <Img id={size === "full" ? "hoard-full" : "hoard-half"} class={`hoard ${size}`} />;
}

// ---------- the dragon ----------

/** Where the jaw hinges, as percentages of the dragon canvas. The snout tip, where the fire comes out, is at (13.6%, 40.7%): host.css places the fire there. */
const JAW_HINGE = { x: 26.8, y: 33.5 };
/** How far the jaw turns when wide open; negative opens this left-facing jaw. */
const JAW_OPEN_DEG = -25;

const STAGE_ART: Record<0 | 1 | 2, { body: DragonArtId; jaw: DragonArtId }> = {
  0: { body: "dragon-healthy", jaw: "dragon-jaw" },
  1: { body: "dragon-wounded", jaw: "dragon-jaw" },
  2: { body: "dragon-badly-wounded", jaw: "dragon-jaw-badly-wounded" },
};

interface DragonProps {
  stage: 0 | 1 | 2;
  slain?: boolean;
  /** Lying on the gold asleep, with a Zzz (the lobby and countdown). */
  asleep?: boolean;
  /** 0 = shut, 1 = wide open (breathing in for fire, or roaring). */
  mouth?: number;
}

/**
 * The dragon facing left. `class` adds the animation states (rearing, flinch, glow, fly-away,
 * crash); `children` are drawn in the dragon's box and move with it (the fire, which host.css puts at the snout tip).
 */
export function Dragon({
  stage,
  slain = false,
  asleep = false,
  mouth = 0,
  class: cls = "",
  children,
}: DragonProps & { class?: string; children?: ComponentChildren }) {
  if (slain || asleep) {
    return (
      <div class={`dragon ${cls}`}>
        <Img id={slain ? "dragon-slain" : "dragon-asleep"} class="dragon-body" />
        {asleep && !slain && (
          <span class="dragon-zzz" aria-hidden="true">
            <i>Z</i>
            <i>z</i>
            <i>z</i>
          </span>
        )}
        {children}
      </div>
    );
  }
  const art = STAGE_ART[stage];
  const angle = Math.max(0, Math.min(1, mouth)) * JAW_OPEN_DEG;
  return (
    <div class={`dragon ${cls}`}>
      {/* The jaw goes under the body: the head hides its inner-mouth flap until it opens. */}
      <img
        class="dragon-art dragon-jaw"
        src={dragonArt(art.jaw)}
        alt=""
        draggable={false}
        style={{ transform: `rotate(${angle}deg)`, transformOrigin: `${JAW_HINGE.x}% ${JAW_HINGE.y}%` }}
      />
      <Img id={art.body} class="dragon-body" />
      {children}
    </div>
  );
}

/** The blast of fire, drawn in code: it starts narrow at its right edge (the snout) and spreads left. */
export function FireBreath({ class: cls = "" }: { class?: string }) {
  return (
    <div class={`fire-breath ${cls}`}>
      <svg viewBox="0 0 1200 480" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <linearGradient id="fire-grad" x1="1" x2="0">
            <stop offset="0" stop-color="#fff6c2" />
            <stop offset="0.25" stop-color="#ffb02e" />
            <stop offset="0.72" stop-color="#e8410f" />
            <stop offset="0.92" stop-color="#c4320c" />
            <stop offset="1" stop-color="#7a1205" stop-opacity="0" />
          </linearGradient>
        </defs>
        <path d="M1200 220Q900 60 0 0V480Q900 420 1200 260Z" fill="url(#fire-grad)" />
        <path class="fire-core" d="M1200 230Q940 150 300 120Q600 240 300 360Q940 330 1200 250Z" fill="#fff6c2" opacity={0.6} />
      </svg>
    </div>
  );
}

/** The Shield of Faith (the file is still rune-shield.webp). */
export function RuneShield({ class: cls = "" }: { class?: string }) {
  return (
    <div class={`rune-shield ${cls}`}>
      <Img id="rune-shield" class="rune-img" />
    </div>
  );
}

// ---------- Act 2: teams, chests and loot ----------

export function TeamBanner({ color, name, class: cls = "" }: { color: string; name?: string; class?: string }) {
  return (
    <div class={`team-banner ${cls}`} style={teamVars(color)}>
      <Tinted id="banner" cloth="banner-cloth" color={color} class="banner-img" />
      {name && <span class="team-banner-name">{name}</span>}
    </div>
  );
}

/** A team's pile of gold, bigger the more it holds. */
export function TeamPile({ color, gold, class: cls = "" }: { color: string; gold: number; class?: string }) {
  // 0 gold is a few coins; 1000+ is a full pile.
  const grow = 0.35 + 0.65 * Math.min(1, Math.sqrt(Math.max(0, gold) / 1000));
  return (
    <div class={`team-pile ${cls}`} style={{ "--team": color, "--grow": String(grow) }}>
      <Tinted id="team-pile" cloth="team-pile-cloth" color={color} class="pile-img" />
    </div>
  );
}

export function JackpotPile({ class: cls = "" }: { class?: string }) {
  return (
    <div class={`jackpot-pile ${cls}`}>
      <Img id="jackpot-pile" class="jackpot-img" />
    </div>
  );
}

/** A treasure chest, closed or open. */
export function Chest({ open = false, class: cls = "" }: { open?: boolean; class?: string }) {
  return (
    <span class={`chest ${open ? "open" : ""} ${cls}`}>
      <Img id={open ? "chest-open" : "chest-closed"} class="chest-img" />
    </span>
  );
}

export const LOOT_LABEL: Record<DragonLoot, string> = {
  coins: "Coins",
  bigPile: "Big pile",
  charm: "Lucky charm",
  grab10: "Grab 10%",
  grab25: "Grab 25%",
  trap: "Dragon's last breath",
  scale: "Dragon scale",
  bats: "Bats",
  jackpot: "Jackpot",
};

/** The icon for each kind of loot, and the text written over it (both grabs share one picture). */
const LOOT_ART: Record<DragonLoot, { id: DragonArtId; badge?: string }> = {
  coins: { id: "loot-coins" },
  bigPile: { id: "loot-big-pile" },
  charm: { id: "loot-lucky-charm" },
  grab10: { id: "loot-grab", badge: "10%" },
  grab25: { id: "loot-grab", badge: "25%" },
  trap: { id: "loot-trap" },
  scale: { id: "loot-dragon-scale" },
  bats: { id: "loot-bats" },
  jackpot: { id: "loot-jackpot" },
};

export function LootIcon({ kind, class: cls = "" }: { kind: DragonLoot; class?: string }) {
  const art = LOOT_ART[kind];
  return (
    <span class={`loot-icon ${cls}`}>
      <Img id={art.id} class="loot-img" />
      {art.badge && <span class="loot-badge">{art.badge}</span>}
    </span>
  );
}

/** The small dragon head by the phone's health bar; it darkens when badly wounded. */
export function DragonHead({ stage, class: cls = "" }: { stage: 0 | 1 | 2; class?: string }): JSX.Element {
  return (
    <span class={`dragon-head stage-${stage} ${cls}`}>
      <Img id="dragon-head" class="head-img" />
    </span>
  );
}

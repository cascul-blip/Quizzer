import type { AvatarChoice } from "../avatars.ts";
import type { QuestionError, StreamAnswerMsg, StreamFeedbackView, StreamQuestionView, SubAward } from "../mode-views.ts";
import type { ModeProtocol } from "../shared-mode-entry.ts";
import { MOST_CORRECT_LABEL, sharedModeEntry } from "../shared-mode-entry.ts";
import type { SiegeDefenderType, SiegeMonsterType, SiegeWaves } from "../siege-rules.ts";
import type { SeasonTheme } from "../themed-modes.ts";
import { modeTheme } from "../themed-modes.ts";

/** why: "build" covers the opening break and the breaks between waves; stands / fallen are ending cinematics. */
export type SiegePhase = "countdown" | "build" | "wave" | "stands" | "fallen" | "podium";

export interface SiegeSettings {
  theme?: SeasonTheme;
  waves: SiegeWaves;
}

/** why: topArcher counts kills by the player's archers; masterMason counts walls placed plus wall upgrades. */
export type SiegeAwardKey = "topArcher" | "masterMason" | "mostCorrect";
export type SiegeAwards = Record<SiegeAwardKey, SubAward | null>;

/** why: saved on the host computer, per quiz. */
export interface SiegeRecord {
  waves: number;
  /** why: percent; persisted, so not renamed. */
  avgScale: number;
  /** why: ISO date string. */
  date: string;
}

export interface SiegeResult {
  /** why: "ended" means the host pressed End game. */
  outcome: "stands" | "fallen" | "ended";
  wave: number;
  waves: SiegeWaves;
  wavesSurvived: number;
  hearts: number;
  headline: string;
  /** why: null outside Endless. */
  avgScale: number | null;
  /** why: Endless only; the best run before this one. */
  record: SiegeRecord | null;
  newRecord: boolean;
}

export interface HostSiegeDefender {
  id: number;
  type: SiegeDefenderType;
  /** why: 0-based, top first. */
  lane: number;
  square: number;
  level: number;
  health: number;
  maxHealth: number;
  /** why: counters that bump so the projector replays the flash or lunge. */
  hitSeq: number;
  attackSeq: number;
}

export interface HostSiegeMonster {
  id: number;
  type: SiegeMonsterType;
  lane: number;
  /** why: in squares at view time; square k's centre is k, the wall face is 0.5. */
  x: number;
  /** why: moveRemainingMs 0 means standing still. */
  toX: number;
  moveRemainingMs: number;
  state: "wait" | "walk" | "attack" | "leap";
  health: number;
  maxHealth: number;
  hitSeq: number;
  attackSeq: number;
}

export interface SiegeShot {
  seq: number;
  lane: number;
  /** why: the archer's square. */
  square: number;
  toX: number;
}

/** why: also covers monsters that reached the wall. */
export interface SiegeFallen {
  seq: number;
  id: number;
  type: SiegeMonsterType;
  lane: number;
  x: number;
  reachedWall: boolean;
}

export interface SiegeEvent {
  seq: number;
  nickname: string;
  text: string;
}

export interface HostSiegeState {
  kind: "siege";
  phase: SiegePhase;
  quiz: { id: string; title: string; questionCount: number };
  settings: SiegeSettings;
  /** why: the next wave during a build break; 0 before the countdown ends. */
  wave: number;
  /** why: the sum of every player's unspent purse. */
  gold: number;
  hearts: number;
  maxHearts: number;
  phaseRemainingMs: number;
  phaseDurationMs: number;
  defenders: HostSiegeDefender[];
  monsters: HostSiegeMonster[];
  /** why: newest last. */
  shots: SiegeShot[];
  fallen: SiegeFallen[];
  events: SiegeEvent[];
  warnings: { lane: number; ms: number }[];
  danger: number[];
  giant: { lane: number; ms: number } | null;
  /** why: counters that bump on every horn and every heart lost. */
  giantSeq: number;
  wallHitSeq: number;
  /** why: the music reads it. */
  monsterCount: number;
  players: { id: string; nickname: string; avatar: AvatarChoice; connected: boolean }[];
  playerCount: number;
  connectedCount: number;
  result: SiegeResult | null;
  awards: SiegeAwards | null;
  errors: QuestionError[] | null;
}

export interface SiegeMapView {
  defenders: { lane: number; square: number; type: SiegeDefenderType; level: number }[];
  /** why: refreshed once a second; square 8 is the entry square. */
  monsters: { lane: number; square: number }[];
}

export interface PlayerSiegeView {
  kind: "siege";
  theme?: SeasonTheme;
  phase: SiegePhase;
  title: string;
  phaseRemainingMs: number;
  phaseDurationMs: number;
  wave: number;
  waves: SiegeWaves;
  hearts: number;
  /** why: this player's own purse, not the class total. */
  gold: number;
  danger: number[];
  me: { id: string; nickname: string; avatar: AvatarChoice; correct: number; goldEarned: number };
  question: StreamQuestionView | null;
  feedback: StreamFeedbackView | null;
  /** why: pre-selected on the map. */
  lastPlaced: SiegeDefenderType | null;
  /** why: shown once per seq. */
  alert: { seq: number; kind: "giant" | "wall" } | null;
  /** why: only sent while this phone's map is open. */
  map: SiegeMapView | null;
  result: {
    outcome: SiegeResult["outcome"];
    headline: string;
    goldEarned: number;
    goldSpent: number;
    placed: Record<SiegeDefenderType, number>;
    upgrades: number;
    defeated: number;
    awards: string[];
  } | null;
}

export type SiegeMsg =
  | StreamAnswerMsg<"siege">
  /** why: lane is 0-based top first; square 1 is next to the castle wall. */
  | { type: "siege.place"; defender: SiegeDefenderType; lane: number; square: number }
  | { type: "siege.upgrade"; lane: number; square: number }
  /** why: the server only sends map contents while it is open. */
  | { type: "siege.map"; open: boolean };

export const siegeShared = sharedModeEntry<ModeProtocol<SiegeMsg, SiegeSettings, HostSiegeState, PlayerSiegeView>>()({
  name: "Kingdom Siege",
  flags: { paced: false, protect: true },
  lobbyBanner: true,
  msgTypes: ["siege.answer", "siege.place", "siege.upgrade", "siege.map"],
  get awards() {
    return siegeAwardLabels();
  },
});

const DEFENDER_LABELS: Record<SeasonTheme, Record<SiegeDefenderType, string>> = {
  christmas: { archer: "Elf archer", knight: "Nutcracker", wall: "Present barricade" },
  classic: { archer: "Archer", knight: "Knight", wall: "Stone wall" },
};

export function siegeDefenderLabel(type: SiegeDefenderType, theme?: SeasonTheme) {
  return DEFENDER_LABELS[modeTheme("siege", theme)][type];
}

export function siegeDefenderPhrase(type: SiegeDefenderType, theme?: SeasonTheme) {
  const label = siegeDefenderLabel(type, theme).toLowerCase();
  return `${/^[aeiou]/.test(label) ? "an" : "a"} ${label}`;
}

const SIEGE_WORDS = {
  christmas: { home: "toybox", fallen: "toybox", topArcher: "Top Elf Captain", archers: "elf archers", masterMason: "Master Wrapper", wall: "barricade" },
  classic: { home: "kingdom", fallen: "castle", topArcher: "Top Archer Captain", archers: "archers", masterMason: "Master Mason", wall: "wall" },
} satisfies Record<SeasonTheme, Record<string, string>>;

export function siegeWords(theme?: SeasonTheme) {
  return SIEGE_WORDS[modeTheme("siege", theme)];
}

export function siegeAwardLabels(theme?: SeasonTheme): Record<SiegeAwardKey, string> {
  const words = siegeWords(theme);
  return { topArcher: words.topArcher, masterMason: words.masterMason, mostCorrect: MOST_CORRECT_LABEL };
}

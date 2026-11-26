import type { AvatarChoice } from "../avatars.ts";
import type { QuestionError, StreamAnswerMsg, StreamFeedbackView, StreamQuestionView, SubAward } from "../mode-views.ts";
import type { ModeProtocol } from "../shared-mode-entry.ts";
import { MOST_CORRECT_LABEL, sharedModeEntry } from "../shared-mode-entry.ts";
import type { SiegeDefenderType, SiegeMonsterType, SiegeWaves } from "../siege-rules.ts";
import type { SeasonTheme } from "../themed-modes.ts";
import { modeTheme } from "../themed-modes.ts";

export type SiegePhase = "countdown" | "build" | "wave" | "stands" | "fallen" | "podium";

export interface SiegeSettings {
  theme?: SeasonTheme;
  waves: SiegeWaves;
}

export type SiegeAwardKey = "topArcher" | "masterMason" | "mostCorrect";
export type SiegeAwards = Record<SiegeAwardKey, SubAward | null>;

export interface SiegeRecord {
  waves: number;
  /** why: The value is a percentage. Existing Endless records use the scale key. */
  avgScale: number;
  date: string;
}

export interface SiegeResult {
  outcome: "stands" | "fallen" | "ended";
  wave: number;
  waves: SiegeWaves;
  wavesSurvived: number;
  hearts: number;
  headline: string;
  avgScale: number | null;
  record: SiegeRecord | null;
  newRecord: boolean;
}

export interface HostSiegeDefender {
  id: number;
  type: SiegeDefenderType;
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
  /** why: The projector places a monster at the wall face at 0.5, between the castle and the center of square 1. */
  x: number;
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
  square: number;
  toX: number;
}

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
  wave: number;
  gold: number;
  hearts: number;
  maxHearts: number;
  phaseRemainingMs: number;
  phaseDurationMs: number;
  defenders: HostSiegeDefender[];
  monsters: HostSiegeMonster[];
  shots: SiegeShot[];
  fallen: SiegeFallen[];
  events: SiegeEvent[];
  warnings: { lane: number; ms: number }[];
  danger: number[];
  giant: { lane: number; ms: number } | null;
  /** why: Consecutive horn and heart-loss events must each replay their cues. */
  giantSeq: number;
  wallHitSeq: number;
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
  gold: number;
  danger: number[];
  me: { id: string; nickname: string; avatar: AvatarChoice; correct: number; goldEarned: number };
  question: StreamQuestionView | null;
  feedback: StreamFeedbackView | null;
  lastPlaced: SiegeDefenderType | null;
  /** why: shown once per seq. */
  alert: { seq: number; kind: "giant" | "wall" } | null;
  /** why: Closed maps omit their contents so inactive phones do not receive battlefield updates. */
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

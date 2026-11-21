import type { AvatarChoice } from "../avatars.ts";
import type { QuestionError, StreamAnswerMsg, StreamFeedbackView, StreamQuestionView, SubAward } from "../mode-views.ts";
import type { SiegeDefenderType, SiegeMonsterType, SiegeWaves } from "../siege-rules.ts";
import type { SiegeTheme } from "../siege-theme.ts";

// Kingdom Siege protocol types.

/**
 * Kingdom Siege. countdown: 3, 2, 1. build: the opening build break and the breaks between
 * waves. wave: monsters are marching. stands / fallen: the ending cinematic, then podium.
 */
export type SiegePhase = "countdown" | "build" | "wave" | "stands" | "fallen" | "podium";

export interface SiegeSettings {
  theme?: SiegeTheme;
  /** 5, 10 or "endless". */
  waves: SiegeWaves;
}

export interface SiegeAwards {
  /** Most monsters defeated by archers the player placed (ties: most archer upgrades). */
  topArcher: SubAward | null;
  /** Most stone walls placed plus wall upgrades. */
  masterMason: SubAward | null;
  mostCorrect: SubAward | null;
}

/** The class's best Endless run on this quiz, saved on the host computer. */
export interface SiegeRecord {
  waves: number;
  /** Average difficulty scale over the run, in %. */
  avgScale: number;
  /** ISO date of the run. */
  date: string;
}

export interface SiegeResult {
  /** ended: the host pressed End game. */
  outcome: "stands" | "fallen" | "ended";
  /** The wave the game ended on. */
  wave: number;
  waves: SiegeWaves;
  wavesSurvived: number;
  hearts: number;
  /** "The kingdom stands with 7 of 10 hearts!", "The castle fell on wave 4 of 5.", "Survived 12 waves", … */
  headline: string;
  /** Endless only. */
  avgScale: number | null;
  /** Endless only: the best run before this one, and whether this one beat it. */
  record: SiegeRecord | null;
  newRecord: boolean;
}

export interface HostSiegeDefender {
  id: number;
  type: SiegeDefenderType;
  /** 0-based, top first. */
  lane: number;
  /** 1–7. */
  square: number;
  level: number;
  health: number;
  maxHealth: number;
  /** Bumps on every hit taken (white flash) and every attack made (lunge or shot). */
  hitSeq: number;
  attackSeq: number;
}

export interface HostSiegeMonster {
  id: number;
  type: SiegeMonsterType;
  lane: number;
  /** Position in squares when the view was made: square k's centre is k, the wall face is 0.5. */
  x: number;
  /** Where it is walking to and how long it takes to get there (0 = standing still). */
  toX: number;
  moveMs: number;
  state: "wait" | "walk" | "attack" | "leap";
  health: number;
  maxHealth: number;
  hitSeq: number;
  attackSeq: number;
}

export interface SiegeShot {
  seq: number;
  lane: number;
  /** The archer's square. */
  square: number;
  /** Where the arrow lands. */
  toX: number;
}

/** A monster defeated (tips over and fades) or one that reached the wall. */
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
  /** "placed an archer", "upgraded a knight to Lv 2". */
  text: string;
}

export interface HostSiegeState {
  kind: "siege";
  phase: SiegePhase;
  quiz: { id: string; title: string; questionCount: number };
  settings: SiegeSettings;
  /** The wave being fought, or the next one during a build break (0 before the countdown ends). */
  wave: number;
  /** All the players' unspent gold added up. */
  gold: number;
  hearts: number;
  maxHearts: number;
  /** Countdown, build break or ending time left. */
  phaseRemainingMs: number;
  phaseDurationMs: number;
  defenders: HostSiegeDefender[];
  monsters: HostSiegeMonster[];
  /** Newest last. */
  shots: SiegeShot[];
  fallen: SiegeFallen[];
  events: SiegeEvent[];
  /** Lanes where a monster comes on soon, with the time left. */
  warnings: { lane: number; ms: number }[];
  /** Lanes with a monster within SIEGE_DANGER_SQUARES of the wall. */
  danger: number[];
  /** A giant waiting on its entry square (horn and lane flash). */
  giant: { lane: number; ms: number } | null;
  /** Bumps on every horn, and on every heart lost. */
  giantSeq: number;
  wallHitSeq: number;
  /** Monsters on the board, for the music. */
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
  /** Monster dots, refreshed once a second. Square 8 is the entry square. */
  monsters: { lane: number; square: number }[];
}

export interface PlayerSiegeView {
  kind: "siege";
  theme?: SiegeTheme;
  phase: SiegePhase;
  title: string;
  phaseRemainingMs: number;
  phaseDurationMs: number;
  wave: number;
  waves: SiegeWaves;
  hearts: number;
  /** This player's own purse. */
  gold: number;
  danger: number[];
  me: { id: string; nickname: string; avatar: AvatarChoice; correct: number; goldEarned: number };
  question: StreamQuestionView | null;
  feedback: StreamFeedbackView | null;
  /** The defender this player placed last, pre-selected on the map. */
  lastPlaced: SiegeDefenderType | null;
  /** The latest banner: a giant approaches, or the wall was hit. Shown once per seq. */
  alert: { seq: number; kind: "giant" | "wall" } | null;
  /** Only while this phone's map is open. */
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

/** What a phone sends during Kingdom Siege games. */
export type SiegeMsg =
  | StreamAnswerMsg<"siege">
  /** Place a defender. lane 0–4 (top first), square 1–7 (1 = next to the castle wall). */
  | { type: "siege.place"; defender: SiegeDefenderType; lane: number; square: number }
  /** Upgrade the defender on that square one level. */
  | { type: "siege.upgrade"; lane: number; square: number }
  /** The lane map opened or closed, so the server only sends its contents while it is open. */
  | { type: "siege.map"; open: boolean };

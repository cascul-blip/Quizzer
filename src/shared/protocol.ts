import type { GiftItem, GiftPower } from "./gift-rules.ts";
import type { SiegeTheme } from "./siege-theme.ts";
import type { AvatarChoice } from "./avatars.ts";
import type { RacerConfidence } from "./racer-rules.ts";
import type { SiegeDefenderType, SiegeMonsterType, SiegeWaves } from "./siege-rules.ts";
import type { PatchOp } from "./view-patch.ts";
import type { Pacing, QuestionError, QuestionView, StreamFeedbackView, StreamQuestionView, SubAward, TeamInfo } from "./mode-views.ts";
import type { CupPhase, CupSettings, HostCupState, PlayerCupView } from "./modes/cup.ts";
import type { DuelPhase, DuelSettings, HostDuelState, PlayerDuelView } from "./modes/duel.ts";
import type { FightPhase, FightSettings, HostFightState, PlayerFightView } from "./modes/fight.ts";
import type { HostLandState, LandPhase, LandSettings, PlayerLandView } from "./modes/land.ts";
import type { HostRacerState, PlayerRacerView, RacerPhase, RacerSettings } from "./modes/racer.ts";
import type { HostRobotState, PlayerRobotView, RobotDir, RobotPhase } from "./modes/robot.ts";
import type { HostSubState, PlayerSubView, SubPhase } from "./modes/submarine.ts";
import type { HostTowerState, PlayerTowerView, TowerPhase, TowerSettings } from "./modes/tower.ts";

export type Phase = "lobby" | "intro" | "open" | "reveal" | "leaderboard" | "podium";

/** Consecutive correct answers needed before a 🔥 streak badge shows. */
export const STREAK_MIN = 4;

export interface ShuffleOptions {
  questions: boolean;
  answers: boolean;
}

// ---------- Game modes and team colours ----------

export type GameMode = "classic" | "tower" | "submarine" | "fight" | "robot" | "land" | "racer" | "cup" | "siege" | "duel" | "gift";

/** Each team also has a shape, so teams can be told apart without relying on colour. */
type TeamShape = "circle" | "square" | "triangle" | "diamond" | "star" | "heart";

export const TEAMS = [
  { name: "Red", color: "#d81e3a", shape: "circle" },
  { name: "Blue", color: "#1f5ee0", shape: "square" },
  { name: "Yellow", color: "#f5c400", shape: "triangle" },
  { name: "Cyan", color: "#12b5cb", shape: "diamond" },
  { name: "Purple", color: "#7d3cc8", shape: "star" },
  { name: "Pink", color: "#f0559e", shape: "heart" },
] as const satisfies readonly { name: string; color: string; shape: TeamShape }[];
export const MAX_TEAMS = TEAMS.length;

// ---------- client → server ----------

export type PlayerMsg =
  /** avatar/accessory: the player's last pick, remembered on the phone (optional). */
  | { type: "join"; nickname: string; avatar?: string; accessory?: string }
  | { type: "setAvatar"; avatar: string; accessory: string }
  | { type: "resume"; token: string }
  /** Typed questions send `text` (the typed answer) and ignore `option`. */
  | { type: "answer"; qIndex: number; option: number; text?: string }
  | { type: "tower.answer"; seq: number; option: number; text?: string }
  | { type: "tower.drop"; zone: number }
  | { type: "sub.answer"; seq: number; option: number; text?: string }
  | { type: "sub.boost" }
  | { type: "sub.tap"; symbol: string }
  | { type: "fight.answer"; seq: number; option: number; text?: string }
  | { type: "fight.choose"; action: "attack" | "rebuild" }
  /** The slingshot pull in field units (y up); the shot flies the opposite way. */
  | { type: "fight.fire"; dx: number; dy: number }
  | { type: "robot.answer"; seq: number; option: number; text?: string }
  | { type: "robot.move"; dir: RobotDir }
  | { type: "gift.answer"; seq: number; option: number; text?: string }
  | { type: "gift.tap"; round: number; item: number }
  | { type: "land.answer"; seq: number; option: number; text?: string }
  | { type: "land.place"; tile: number }
  /** Leave the land early; unused claims are kept for next time. */
  | { type: "land.done" }
  /** Racer, driver only, confidence phase only: move the lever (everyone sees it move). */
  | { type: "racer.lever"; level: RacerConfidence }
  /** Racer, driver only, confidence phase only: lock the lever where it is and open the question. */
  | { type: "racer.go" }
  /** Racer, open phase: `index` is the question's index (QuestionView.index), as `qIndex` in the classic "answer". One answer per player per question. */
  | { type: "racer.answer"; index: number; option: number; text?: string }
  /** Showdown, open phase: `index` is the question's index (QuestionView.index), as in racer.answer. One answer per player per round. */
  | { type: "duel.answer"; index: number; option: number; text?: string }
  | { type: "cup.answer"; seq: number; option: number; text?: string }
  /** Cup of Death, drink phase, drinkers only: pick one of your remaining cups (0-based, left to right). Final once sent. */
  | { type: "cup.pick"; cup: number }
  | { type: "siege.answer"; seq: number; option: number; text?: string }
  /** Kingdom Siege: place a defender. lane 0–4 (top first), square 1–7 (1 = next to the castle wall). */
  | { type: "siege.place"; defender: SiegeDefenderType; lane: number; square: number }
  /** Kingdom Siege: upgrade the defender on that square one level. */
  | { type: "siege.upgrade"; lane: number; square: number }
  /** Kingdom Siege: the lane map opened or closed, so the server only sends its contents while it is open. */
  | { type: "siege.map"; open: boolean };

/** A game mode without mode settings. */
export type NoSettings = Record<string, never>;

/** The mode settings of every game mode, as the lobby holds them. */
export interface ModeSettingsMap {
  classic: NoSettings;
  tower: TowerSettings;
  submarine: NoSettings;
  fight: FightSettings;
  robot: NoSettings;
  land: LandSettings;
  racer: RacerSettings;
  cup: CupSettings;
  siege: SiegeSettings;
  duel: DuelSettings;
  gift: GiftSettings;
}

/** What the host sends to change one mode's settings: Tower Fight takes any subset, Tallest Tower may leave out the monster. */
export interface ModeSettingsInput extends Omit<ModeSettingsMap, "tower" | "fight"> {
  tower: Omit<TowerSettings, "monster"> & { monster?: boolean };
  fight: Partial<FightSettings>;
}

export type ModeSettingsMsg = { [M in GameMode]: { type: "host.setModeSettings"; mode: M; settings: ModeSettingsInput[M] } }[GameMode];

export type HostMsg =
  | { type: "host.hello" }
  | { type: "host.open"; quizId: string }
  | { type: "host.start"; pacing: Pacing }
  | { type: "host.setPacing"; pacing: Pacing }
  | { type: "host.setShuffle"; questions: boolean; answers: boolean }
  | { type: "host.setProtect"; on: boolean }
  | { type: "host.setMode"; mode: GameMode }
  | ModeSettingsMsg
  | { type: "host.next" }
  | { type: "host.skip" }
  | { type: "host.kick"; playerId: string }
  | { type: "host.setTeam"; playerId: string; team: number }
  | { type: "host.end" }
  | { type: "host.close" }
  | { type: "host.setAddress"; address: string };

export type ClientMsg = PlayerMsg | HostMsg;

// ---------- server → client ----------

/** How many errors the final screen's "Show errors" table lists (rows are QuestionError, in mode-views.ts). */
export const ERRORS_SHOWN = 10;

export interface RankedEntry {
  id: string;
  nickname: string;
  avatar: AvatarChoice;
  score: number;
  rank: number;
  /** Points gained on the most recent question. */
  delta: number;
  /** Current run of consecutive correct answers. */
  streak: number;
}

export interface PlayerResult {
  choice: number | null;
  correct: number[];
  wasCorrect: boolean;
  points: number;
}

export type PlayerView =
  | { kind: "none"; game: null }
  | { kind: "none"; game: { title: string; phase: Phase | TowerPhase | SubPhase | FightPhase | RobotPhase | LandPhase | RacerPhase | CupPhase | SiegePhase | DuelPhase | GiftPhase } }
  | {
      kind: "classic";
      phase: Phase;
      title: string;
      me: { id: string; nickname: string; avatar: AvatarChoice; score: number; rank: number; streak: number };
      playerCount: number;
      question: QuestionView | null;
      /** The option chosen for the current question, if any. */
      myChoice: number | null;
      /** What was typed for the current question, if it is a typed one and answered. */
      myText: string | null;
      result: PlayerResult | null;
      podium: RankedEntry[] | null;
      /** In the lobby with a team mode selected: the team this player will be on. */
      team: TeamInfo | null;
      /** In the lobby of a mode whose phones show its banner: that mode (Kingdom Siege shows the castle banner). */
      banner?: GameMode;
    }
  | PlayerTowerView
  | PlayerSubView
  | PlayerFightView
  | PlayerRobotView
  | PlayerLandView
  | PlayerRacerView
  | PlayerCupView
  | PlayerSiegeView
  | PlayerDuelView
  | PlayerGiftView;

export interface HostPlayer {
  id: string;
  nickname: string;
  avatar: AvatarChoice;
  score: number;
  connected: boolean;
}

export interface JoinInfo {
  url: string;
  qrSvg: string;
  address: string;
  addresses: { address: string; iface: string }[];
  port: number;
}

/** Everything the projector needs about a live game, except join info. */
export interface HostGameState {
  kind: "classic";
  phase: Phase;
  /** Lobby choice; anything but "classic" hands the players over to that mode's game on start. */
  mode: GameMode;
  /** Mode settings of every game mode, kept while the host switches between modes. */
  settings: ModeSettingsMap;
  /** Team preview while the lobby is in a team mode (Tallest Tower, Tower Fight, Land Grab). */
  teams: (TeamInfo & { members: HostPlayer[] })[] | null;
  quiz: { id: string; title: string; questionCount: number };
  pacing: Pacing;
  /** Chosen in the lobby; applied when the game starts. */
  shuffle: ShuffleOptions;
  /** "Protect from abuse": wrong answers in a row make the player wait longer (Tallest Tower, Submarine Squad, Tower Fight, Robot Attack). */
  protect: boolean;
  players: HostPlayer[];
  question: QuestionView | null;
  /** Revealed only once answering has closed. */
  correct: number[] | null;
  answeredCount: number;
  answerCounts: number[] | null;
  /** Revealed only: per option, the avatars of the players who picked it, fastest first. */
  answerAvatars: AvatarChoice[][] | null;
  leaderboard: RankedEntry[];
  /** The questions answered wrongly most often (podium only). */
  errors: QuestionError[] | null;
}

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

export type HostView =
  | { kind: "idle"; phase: "idle"; join: JoinInfo }
  | (HostGameState & { join: JoinInfo })
  | (HostTowerState & { join: JoinInfo })
  | (HostSubState & { join: JoinInfo })
  | (HostFightState & { join: JoinInfo })
  | (HostRobotState & { join: JoinInfo })
  | (HostLandState & { join: JoinInfo })
  | (HostRacerState & { join: JoinInfo })
  | (HostCupState & { join: JoinInfo })
  | (HostSiegeState & { join: JoinInfo })
  | (HostDuelState & { join: JoinInfo })
  | (HostGiftState & { join: JoinInfo });

export type ServerMsg =
  /** First message on every connection. A new serverId means the server restarted (maybe with new code). */
  | { type: "hello"; serverId: string }
  | { type: "player.state"; view: PlayerView }
  /** Changes to the last player.state (see view-patch.ts), sent when smaller than a new snapshot. */
  | { type: "player.patch"; ops: PatchOp[] }
  | { type: "host.state"; view: HostView }
  | { type: "joined"; token: string; playerId: string; /** Question images of the quiz, to preload. */ images?: string[] }
  | { type: "kicked" }
  | { type: "resumeFailed" }
  | { type: "error"; message: string };

// ---------- Gift Grab ----------

export type GiftPhase = "countdown" | "playing" | "finishing" | "podium";

export interface GiftSettings {
  minutes: number;
}

export interface GiftStanding {
  id: string;
  nickname: string;
  avatar: AvatarChoice;
  rank: number;
  score: number;
  correct: number;
  connected: boolean;
  inBonus: boolean;
}

export interface HostGiftState {
  kind: "gift";
  phase: GiftPhase;
  quiz: { id: string; title: string; questionCount: number };
  remainingMs: number;
  standings: GiftStanding[];
  mostCorrect: { value: number; nicknames: string[] } | null;
  errors: QuestionError[];
}

export interface GiftHit {
  item: number;
  delta: number;
  effect: GiftPower | "blocked" | null;
}

export interface PlayerGiftView {
  kind: "gift";
  phase: GiftPhase;
  remainingMs: number;
  progress: number;
  score: number;
  correct: number;
  rank: number | null;
  question: StreamQuestionView | null;
  feedback: StreamFeedbackView | null;
  bonus: {
    round: number;
    remainingMs: number;
    multiplier: number;
    items: GiftItem[];
    hits: GiftHit[];
    power: GiftPower | null;
  } | null;
}

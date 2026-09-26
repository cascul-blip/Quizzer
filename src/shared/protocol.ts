import type { AvatarChoice } from "./avatars.ts";
import type { HillHeight, ShotImpact } from "./fight-physics.ts";
import type { QuestionType } from "./quiz-schema.ts";

export type Phase = "lobby" | "intro" | "open" | "reveal" | "leaderboard" | "podium";
export type Pacing = "manual" | "auto";

/** Consecutive correct answers needed before a 🔥 streak badge shows. */
export const STREAK_MIN = 4;

export interface ShuffleOptions {
  questions: boolean;
  answers: boolean;
}

// ---------- Tallest Tower ----------

export type GameMode = "classic" | "tower" | "submarine" | "fight";
export type TowerPhase = "countdown" | "playing" | "podium";

export const TEAMS = [
  { name: "Red", color: "#e21b3c" },
  { name: "Blue", color: "#1368ce" },
  { name: "Yellow", color: "#c98a00" },
  { name: "Green", color: "#26890c" },
  { name: "Purple", color: "#864cbf" },
  { name: "Orange", color: "#e8710a" },
] as const;
export const MAX_TEAMS = TEAMS.length;
export const TOWER_MINUTES = [2, 3, 5, 7, 10] as const;
/** Correct answers (blocks) needed before a player switches to build mode. */
export const BLOCKS_PER_BUILD = 4;
/** Drop zones across the build screen: miss · left · center · right · miss. */
export const DROP_ZONES = 5;

export interface TowerSettings {
  teams: number;
  minutes: number;
  /** Monster eggs at 1/3 and 2/3 of the game (needs 2+ teams). */
  monster: boolean;
}

/** Floors the monster knocks off the tower it attacks. */
export const MONSTER_DAMAGE = 2;

/** How many levels above a tower's highest complete floor its egg is placed. */
export const EGG_LEVELS_ABOVE = 4;

/** One team's monster egg: the first block landing on it hatches the monster. */
export interface MonsterEgg {
  seq: number;
  col: number;
  /** 0-based row: level (row + 1). */
  row: number;
}

/** Every team's egg from one announcement; cells[i] belongs to team i. */
export interface MonsterEggs {
  seq: number;
  cells: { col: number; row: number }[];
}

export interface MonsterAttack {
  seq: number;
  byTeam: number;
  byNickname: string;
  target: number;
  /** Target's columns before and after the attack (for the smash animation). */
  before: number[];
  after: number[];
}

export interface TeamInfo {
  index: number;
  name: string;
  color: string;
}

// ---------- client → server ----------

export type PlayerMsg =
  /** avatar/accessory: the player's last pick, remembered on the phone (optional). */
  | { type: "join"; nickname: string; avatar?: string; accessory?: string }
  | { type: "setAvatar"; avatar: string; accessory: string }
  | { type: "resume"; token: string }
  | { type: "answer"; qIndex: number; option: number }
  | { type: "tower.answer"; seq: number; option: number }
  | { type: "tower.drop"; zone: number }
  | { type: "sub.answer"; seq: number; option: number }
  | { type: "sub.boost" }
  | { type: "sub.tap"; symbol: string }
  | { type: "fight.answer"; seq: number; option: number }
  | { type: "fight.choose"; action: "attack" | "rebuild" }
  /** The slingshot pull in field units (y up); the shot flies the opposite way. */
  | { type: "fight.fire"; dx: number; dy: number };

export type HostMsg =
  | { type: "host.hello" }
  | { type: "host.open"; quizId: string }
  | { type: "host.start"; pacing: Pacing }
  | { type: "host.setPacing"; pacing: Pacing }
  | { type: "host.setShuffle"; questions: boolean; answers: boolean }
  | { type: "host.setMode"; mode: GameMode }
  | { type: "host.setTower"; teams: number; minutes: number; monster?: boolean }
  | { type: "host.setFight"; hill: HillSetting }
  | { type: "host.next" }
  | { type: "host.skip" }
  | { type: "host.kick"; playerId: string }
  | { type: "host.end" }
  | { type: "host.close" }
  | { type: "host.setAddress"; address: string };

export type ClientMsg = PlayerMsg | HostMsg;

// ---------- server → client ----------

export interface QuestionView {
  index: number;
  total: number;
  type: QuestionType;
  text: string;
  image?: string;
  timeLimitSec: number;
  /** Empty during the intro phase so phones can't answer early. */
  options: string[];
  /** Milliseconds left when the message was sent (clients add it to their own clock). */
  remainingMs: number;
}

export interface RankedEntry {
  id: string;
  nickname: string;
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
  | { kind: "none"; game: { title: string; phase: Phase | TowerPhase | SubPhase | FightPhase } }
  | {
      kind: "player";
      phase: Phase;
      title: string;
      me: { id: string; nickname: string; avatar: AvatarChoice; score: number; rank: number; streak: number };
      playerCount: number;
      question: QuestionView | null;
      /** The option chosen for the current question, if any. */
      myChoice: number | null;
      result: PlayerResult | null;
      podium: RankedEntry[] | null;
      /** In the lobby with a team mode selected: the team this player will be on. */
      team: TeamInfo | null;
    }
  | PlayerTowerView
  | PlayerSubView
  | PlayerFightView;

export interface TowerAwards {
  mostCorrect: { value: number; nicknames: string[] } | null;
  masterBuilder: { value: number; nicknames: string[] } | null;
}

export interface PlayerTowerView {
  kind: "tower";
  phase: TowerPhase;
  title: string;
  /** Countdown to play (countdown phase) or to the end of the game (playing). */
  remainingMs: number;
  me: { id: string; nickname: string; avatar: AvatarChoice; correct: number; placed: number };
  team: TeamInfo;
  state: "question" | "build";
  blocksHeld: number;
  question: { seq: number; type: QuestionType; text: string; image?: string; options: string[] } | null;
  /** Result of the last answer while its 1 s flash is still showing. */
  feedback: { seq: number; correct: boolean; remainingMs: number; answers: string[] } | null;
  egg: MonsterEgg | null;
  /** Latest monster news for this player (shown once per seq). */
  monsterEvent: { seq: number; kind: "egg" | "hatched" | "smashed"; byTeam: string | null; target: string | null } | null;
  /** The team tower, while this player is building. */
  build: { columns: number[]; floors: number; sweepMs: number } | null;
  result: {
    teamRank: number;
    teamCount: number;
    floors: number;
    placed: number;
    awards: string[];
  } | null;
}

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
  /** Lobby choice; "tower" hands the players over to a Tallest Tower game on start. */
  mode: GameMode;
  tower: TowerSettings;
  fight: FightSettings;
  /** Team preview while the lobby is in a team mode (Tallest Tower, Tower Fight). */
  teams: (TeamInfo & { members: HostPlayer[] })[] | null;
  quiz: { id: string; title: string; questionCount: number };
  pacing: Pacing;
  /** Chosen in the lobby; applied when the game starts. */
  shuffle: ShuffleOptions;
  players: HostPlayer[];
  question: QuestionView | null;
  /** Revealed only once answering has closed. */
  correct: number[] | null;
  answeredCount: number;
  answerCounts: number[] | null;
  leaderboard: RankedEntry[];
  hasResults: boolean;
}

export interface HostTowerTeam extends TeamInfo {
  columns: number[];
  floors: number;
  placed: number;
  rank: number;
  members: { id: string; nickname: string; avatar: AvatarChoice; connected: boolean; building: boolean }[];
}

export interface HostTowerState {
  kind: "tower";
  phase: TowerPhase;
  quiz: { id: string; title: string; questionCount: number };
  remainingMs: number;
  teams: HostTowerTeam[];
  playerCount: number;
  /** Increments with every drop so screens can animate/sound new blocks. */
  dropCount: number;
  monster: boolean;
  egg: MonsterEggs | null;
  lastAttack: MonsterAttack | null;
  /** Time until the next egg announcement, or null if none is coming. */
  nextMonsterMs: number | null;
  awards: TowerAwards | null;
  hasResults: boolean;
}

// ---------- Submarine Squad ----------

export type SubPhase = "countdown" | "chase" | "escaped" | "dive" | "caught" | "podium";
/** Correct answers needed to earn one boost. */
export const CORRECT_PER_BOOST = 4;

export interface SubAward {
  value: number;
  nicknames: string[];
}

export interface SubAwards {
  topBooster: SubAward | null;
  sharpestEyes: SubAward | null;
  mostCorrect: SubAward | null;
}

export interface HostSubState {
  kind: "sub";
  phase: SubPhase;
  quiz: { id: string; title: string; questionCount: number };
  level: number;
  /** Meters below the surface; the final score. */
  depth: number;
  /** Time left in the countdown / cut-scene / dive. */
  phaseRemainingMs: number;
  /** Distance to the fish in seconds of fish travel, as of when this was sent. */
  gap: number;
  /** How fast the gap closes (gap-seconds per second). */
  speed: number;
  maxGap: number;
  boosts: number;
  required: number;
  lastBoost: { seq: number; nickname: string } | null;
  dive: {
    instructors: { nickname: string; index: number; total: number; found: number; groupSize: number; done: boolean }[];
  } | null;
  players: { id: string; nickname: string; avatar: AvatarChoice; connected: boolean; state: "question" | "boost" | "waiting" }[];
  playerCount: number;
  awards: SubAwards | null;
  hasResults: boolean;
}

export interface PlayerSubView {
  kind: "sub";
  phase: SubPhase;
  title: string;
  level: number;
  depth: number;
  phaseRemainingMs: number;
  me: { id: string; nickname: string; avatar: AvatarChoice; correct: number; boosts: number; diveHits: number };
  state: "question" | "boost" | "waiting";
  /** Correct answers toward the next boost (0 … CORRECT_PER_BOOST-1). */
  towardBoost: number;
  question: { seq: number; type: QuestionType; text: string; image?: string; options: string[] } | null;
  feedback: { seq: number; correct: boolean; remainingMs: number; answers: string[] } | null;
  dive:
    | { role: "instructor"; symbol: string; index: number; total: number; found: number; groupSize: number }
    | { role: "diver"; grid: string[]; index: number; total: number; lockedMs: number; done: boolean; hint: string | null }
    | { role: "waiting" }
    | null;
  result: { depth: number; level: number; awards: string[] } | null;
}

// ---------- Tower Fight ----------

export type FightPhase = "countdown" | "playing" | "collapse" | "podium";
export type HillSetting = HillHeight | "random";
export const HILL_SETTINGS: readonly HillSetting[] = ["random", "low", "medium", "high"];
/** Correct answers needed to earn one attack-or-rebuild decision. */
export const CORRECT_PER_DECISION = 4;
/** Hits a tower can take; the last one brings it down. */
export const TOWER_MAX_DAMAGE = 5;
/** Time to choose attack or rebuild before the move is forfeited (aiming has no time limit). */
export const DECISION_MS = 10_000;
/** How long a rebuild takes; the tower is repaired when it finishes. */
export const REPAIR_MS = 4000;

export interface FightSettings {
  hill: HillSetting;
}

export type FightState = "question" | "decide" | "aim" | "watch" | "repair";

export interface FightShot {
  id: number;
  playerId: string;
  nickname: string;
  avatar: AvatarChoice;
  team: number;
  vx: number;
  vy: number;
  durationMs: number;
  /** How long ago it was fired when this was sent (clients add it to their own clock). */
  elapsedMs: number;
  impact: ShotImpact;
}

export interface FightEvent {
  seq: number;
  kind: "hit" | "friendly" | "miss" | "rebuild";
  nickname: string;
  team: number;
}

export interface FightAwards {
  topGunner: SubAward | null;
  masterBuilder: SubAward | null;
  mostCorrect: SubAward | null;
}

export interface FightOutcome {
  /** Winning team, or null for a draw. */
  winner: number | null;
  reason: "destroyed" | "damage" | "correct" | "draw";
}

export interface HostFightTeam extends TeamInfo {
  damage: number;
  /** Someone on the team is repairing the tower right now. */
  repairing: boolean;
  correct: number;
  members: { id: string; nickname: string; avatar: AvatarChoice; connected: boolean; state: FightState; hits: number; rebuilds: number }[];
}

export interface HostFightState {
  kind: "fight";
  phase: FightPhase;
  quiz: { id: string; title: string; questionCount: number };
  phaseRemainingMs: number;
  hill: HillHeight;
  terrain: number[];
  teams: HostFightTeam[];
  /** Shots still flying, or landed moments ago. */
  shots: FightShot[];
  /** Newest last. */
  events: FightEvent[];
  outcome: FightOutcome | null;
  playerCount: number;
  awards: FightAwards | null;
  hasResults: boolean;
}

export interface PlayerFightView {
  kind: "fight";
  phase: FightPhase;
  title: string;
  phaseRemainingMs: number;
  me: { id: string; nickname: string; avatar: AvatarChoice; correct: number; hits: number; rebuilds: number };
  team: TeamInfo;
  teams: TeamInfo[];
  state: FightState;
  /** Correct answers toward the next decision (0 … CORRECT_PER_DECISION-1). */
  towardDecision: number;
  /** Time left to choose attack or rebuild (decide state). */
  decisionMs: number;
  /** Time left on this player's repair (repair state). */
  repairMs: number;
  /** This player's most recently finished repair; repaired is false if teammates had already fixed the tower. */
  lastRepair: { seq: number; repaired: boolean } | null;
  question: { seq: number; type: QuestionType; text: string; image?: string; options: string[] } | null;
  feedback: { seq: number; correct: boolean; remainingMs: number; answers: string[] } | null;
  /** Damage per team. */
  damage: number[];
  terrain: number[];
  /** This player's shot while watching it fly. */
  shot: FightShot | null;
  result: { outcome: FightOutcome; awards: string[] } | null;
}

export type HostView =
  | { kind: "idle"; phase: "idle"; join: JoinInfo }
  | (HostGameState & { join: JoinInfo })
  | (HostTowerState & { join: JoinInfo })
  | (HostSubState & { join: JoinInfo })
  | (HostFightState & { join: JoinInfo });

export type ServerMsg =
  /** First message on every connection. A new serverId means the server restarted (maybe with new code). */
  | { type: "hello"; serverId: string }
  | { type: "player.state"; view: PlayerView }
  | { type: "host.state"; view: HostView }
  | { type: "joined"; token: string; playerId: string }
  | { type: "kicked" }
  | { type: "resumeFailed" }
  | { type: "error"; message: string };

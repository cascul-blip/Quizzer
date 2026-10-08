import type { AvatarChoice } from "./avatars.ts";
import type { HillHeight, ShotImpact } from "./fight-physics.ts";
import type { LandStart } from "./land-board.ts";
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

export type GameMode = "classic" | "tower" | "submarine" | "fight" | "robot" | "land";
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
  /** Monster eggs 4 times per game, evenly spaced (needs 2+ teams). */
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
  | { type: "fight.fire"; dx: number; dy: number }
  | { type: "robot.answer"; seq: number; option: number }
  | { type: "robot.move"; dir: RobotDir }
  | { type: "land.answer"; seq: number; option: number }
  | { type: "land.place"; tile: number }
  /** Leave the land early; unused claims are kept for next time. */
  | { type: "land.done" };

export type HostMsg =
  | { type: "host.hello" }
  | { type: "host.open"; quizId: string }
  | { type: "host.start"; pacing: Pacing }
  | { type: "host.setPacing"; pacing: Pacing }
  | { type: "host.setShuffle"; questions: boolean; answers: boolean }
  | { type: "host.setMode"; mode: GameMode }
  | { type: "host.setTower"; teams: number; minutes: number; monster?: boolean }
  | { type: "host.setFight"; hill: HillSetting }
  | { type: "host.setLand"; teams: number; minutes: number }
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

/** How many errors the final screen's "Show errors" table lists. */
export const ERRORS_SHOWN = 10;

/** One row of that table. */
export interface QuestionError {
  wrong: number;
  text: string;
  /** Text of the correct option(s). */
  answers: string[];
}

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
  | { kind: "none"; game: { title: string; phase: Phase | TowerPhase | SubPhase | FightPhase | RobotPhase | LandPhase } }
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
  | PlayerFightView
  | PlayerRobotView
  | PlayerLandView;

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
  land: LandSettings;
  /** Team preview while the lobby is in a team mode (Tallest Tower, Tower Fight, Land Grab). */
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
  /** Revealed only: per option, the avatars of the players who picked it, fastest first. */
  answerAvatars: AvatarChoice[][] | null;
  leaderboard: RankedEntry[];
  /** The questions answered wrongly most often (podium only). */
  errors: QuestionError[] | null;
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
  /** The questions answered wrongly most often (podium only). */
  errors: QuestionError[] | null;
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
  lastBoost: { seq: number; nickname: string; avatar: AvatarChoice } | null;
  dive: {
    instructors: { nickname: string; index: number; total: number; found: number; groupSize: number; done: boolean }[];
  } | null;
  players: { id: string; nickname: string; avatar: AvatarChoice; connected: boolean; state: "question" | "boost" | "waiting" }[];
  playerCount: number;
  awards: SubAwards | null;
  /** The questions answered wrongly most often (podium only). */
  errors: QuestionError[] | null;
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
    // symbolRemainingMs of symbolMs: time left to find the current symbol before the instructor moves on.
    | { role: "instructor"; symbol: string; index: number; total: number; found: number; groupSize: number; symbolRemainingMs: number; symbolMs: number }
    | { role: "diver"; grid: string[]; index: number; total: number; lockedMs: number; done: boolean; hint: string | null; symbolRemainingMs: number; symbolMs: number }
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
  /** The questions answered wrongly most often (podium only). */
  errors: QuestionError[] | null;
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

// ---------- Robot Attack ----------

export type RobotPhase = "countdown" | "quiz" | "move" | "attack" | "podium";
export type RobotDir = "up" | "down" | "left" | "right";
export const ROBOT_DIRS: readonly RobotDir[] = ["up", "down", "left", "right"];
/** The board is ROBOT_BOARD × ROBOT_BOARD tiles; tile index = y * ROBOT_BOARD + x, with y = 0 the row nearest the robot. */
export const ROBOT_BOARD = 12;
export const ROBOT_LIVES = 3;
/** The first quiz phase is this long; each round is ROBOT_QUIZ_STEP_MS shorter, down to ROBOT_QUIZ_MIN_MS. */
export const ROBOT_QUIZ_START_MS = 30_000;
export const ROBOT_QUIZ_STEP_MS = 2000;
export const ROBOT_QUIZ_MIN_MS = 5000;
/** The red Xs appear this long before the quiz phase ends. */
export const ROBOT_WARN_MS = 5000;
export const ROBOT_MOVE_MS = 7000;
/** The laser attack plays this long before the next quiz phase. */
export const ROBOT_ATTACK_MS = 3000;
/** Share of the playable board the robot targets (plus every occupied tile). */
export const ROBOT_HAZARD_FRACTION = 0.75;
/** Every this many rounds, the outer ring of the board is destroyed, until the board is ROBOT_MIN_BOARD wide. */
export const ROBOT_SHRINK_EVERY = 4;
export const ROBOT_MIN_BOARD = 2;

/** Length of round n's quiz phase (n starts at 1). */
export function robotQuizMs(round: number): number {
  return Math.max(ROBOT_QUIZ_MIN_MS, ROBOT_QUIZ_START_MS - ROBOT_QUIZ_STEP_MS * (round - 1));
}

/** Which ring a tile is in: 0 for the outer edge of the full board, counting inward. */
export function robotRing(tile: number): number {
  const x = tile % ROBOT_BOARD;
  const y = Math.floor(tile / ROBOT_BOARD);
  return Math.min(x, y, ROBOT_BOARD - 1 - x, ROBOT_BOARD - 1 - y);
}

/** Whether (x, y) is still on the board once `inset` rings are gone. */
export function robotInBounds(x: number, y: number, inset: number): boolean {
  return x >= inset && y >= inset && x < ROBOT_BOARD - inset && y < ROBOT_BOARD - inset;
}

export interface RobotAwards {
  mostCorrect: SubAward | null;
  mostMoves: SubAward | null;
}

/** The latest laser blast: who got hit and who was knocked out by it. */
export interface RobotAttack {
  seq: number;
  round: number;
  hit: string[];
  eliminated: string[];
}

export interface HostRobotPlayer {
  id: string;
  nickname: string;
  avatar: AvatarChoice;
  connected: boolean;
  x: number;
  y: number;
  lives: number;
  out: boolean;
  points: number;
}

export interface RobotStanding {
  id: string;
  nickname: string;
  avatar: AvatarChoice;
  rank: number;
  lives: number;
  /** Round the player was knocked out in, or null for a survivor. */
  outRound: number | null;
  correct: number;
}

export interface HostRobotState {
  kind: "robot";
  phase: RobotPhase;
  quiz: { id: string; title: string; questionCount: number };
  round: number;
  phaseRemainingMs: number;
  /** Full length of the current phase, for the progress bar. */
  phaseDurationMs: number;
  /** Targeted tile indices; empty until the warning. */
  marked: number[];
  /** Rings of tiles destroyed so far. */
  inset: number;
  /** The ring being destroyed this round (all of it targeted); empty in other rounds. Stays up through the attack. */
  collapsing: number[];
  players: HostRobotPlayer[];
  lastAttack: RobotAttack | null;
  playerCount: number;
  /** Final standings, best first (podium only). */
  standings: RobotStanding[] | null;
  awards: RobotAwards | null;
  /** The questions answered wrongly most often (podium only). */
  errors: QuestionError[] | null;
  hasResults: boolean;
}

export interface PlayerRobotView {
  kind: "robot";
  phase: RobotPhase;
  title: string;
  round: number;
  phaseRemainingMs: number;
  me: { id: string; nickname: string; avatar: AvatarChoice; lives: number; out: boolean; points: number; correct: number; x: number; y: number };
  question: { seq: number; type: QuestionType; text: string; image?: string; options: string[] } | null;
  feedback: { seq: number; correct: boolean; remainingMs: number; answers: string[] } | null;
  /** The board, during movement and the attack only (quiz time is for questions). */
  board: { marked: number[]; inset: number; collapsing: number[]; others: { x: number; y: number }[] } | null;
  /** This player's part in the latest attack. */
  lastAttack: { seq: number; hit: boolean; eliminated: boolean } | null;
  result: { rank: number; playerCount: number; won: boolean; outRound: number | null; awards: string[] } | null;
}

// ---------- Land Grab ----------

export type LandPhase = "countdown" | "playing" | "conquered" | "podium";
export const LAND_MINUTES = [3, 5, 7, 10] as const;
export const LAND_MIN_TEAMS = 2;
/** Answers (right or wrong) before a player goes to the land. */
export const LAND_QUESTIONS_PER_ROUND = 3;
/** Claims it takes to steal a tile from another team; grass costs 1. */
export const LAND_STEAL_COST = 2;
/** Claims it takes to claim a tile 2 steps from another team's starting point (grass or stolen: the two don't add up). */
export const LAND_GUARD_COST = 2;
/** How long "You have no tiles to place!" shows before the questions come back. */
export const LAND_EMPTY_MS = 4000;

export interface LandSettings {
  teams: number;
  minutes: number;
}

/** question = answering; claim = placing tiles; empty = the "no tiles to place" message. */
export type LandState = "question" | "claim" | "empty";

/** The board as the screens draw it: owners[tile] is a team index or -1 for grass. */
export interface LandBoard {
  size: number;
  owners: number[];
  starts: LandStart[];
}

/** The latest tile a player placed. */
export interface LandPlace {
  seq: number;
  tile: number;
  team: number;
  stolen: boolean;
}

/** The latest surround: the tiles that changed hands, and any teams knocked out by it. */
export interface LandCapture {
  seq: number;
  team: number;
  nickname: string;
  tiles: number[];
  knockedOut: number[];
}

export interface LandAwards {
  mostCorrect: SubAward | null;
  topSettler: SubAward | null;
  topSurrounder: SubAward | null;
}

export interface HostLandTeam extends TeamInfo {
  tiles: number;
  correct: number;
  rank: number;
  out: boolean;
  /** The team that surrounded this one's starting point. */
  conqueredBy: number | null;
  members: { id: string; nickname: string; avatar: AvatarChoice; connected: boolean; claiming: boolean }[];
}

export interface HostLandState {
  kind: "land";
  phase: LandPhase;
  quiz: { id: string; title: string; questionCount: number };
  remainingMs: number;
  board: LandBoard;
  teams: HostLandTeam[];
  lastPlace: LandPlace | null;
  lastCapture: LandCapture | null;
  playerCount: number;
  awards: LandAwards | null;
  /** The questions answered wrongly most often (podium only). */
  errors: QuestionError[] | null;
  hasResults: boolean;
}

export interface PlayerLandView {
  kind: "land";
  phase: LandPhase;
  title: string;
  remainingMs: number;
  me: { id: string; nickname: string; avatar: AvatarChoice; correct: number; placed: number; stolen: number };
  /** The team this player is on now (it changes if their team is conquered). */
  team: TeamInfo;
  teamTiles: number;
  state: LandState;
  claims: number;
  /** Answers given in this round of questions (0 … LAND_QUESTIONS_PER_ROUND-1). */
  answered: number;
  /** Time left on the "no tiles to place" message (empty state). */
  emptyMs: number;
  question: { seq: number; type: QuestionType; text: string; image?: string; options: string[] } | null;
  feedback: { seq: number; correct: boolean; remainingMs: number; answers: string[] } | null;
  /** The land, while this player is placing tiles. */
  board: LandBoard | null;
  /** Set once this player's first team was surrounded and they joined the conquerors. */
  conquered: { seq: number; from: string; by: string } | null;
  result: { teamRank: number; teamCount: number; tiles: number; won: boolean; awards: string[] } | null;
}

export type HostView =
  | { kind: "idle"; phase: "idle"; join: JoinInfo }
  | (HostGameState & { join: JoinInfo })
  | (HostTowerState & { join: JoinInfo })
  | (HostSubState & { join: JoinInfo })
  | (HostFightState & { join: JoinInfo })
  | (HostRobotState & { join: JoinInfo })
  | (HostLandState & { join: JoinInfo });

export type ServerMsg =
  /** First message on every connection. A new serverId means the server restarted (maybe with new code). */
  | { type: "hello"; serverId: string }
  | { type: "player.state"; view: PlayerView }
  | { type: "host.state"; view: HostView }
  | { type: "joined"; token: string; playerId: string }
  | { type: "kicked" }
  | { type: "resumeFailed" }
  | { type: "error"; message: string };

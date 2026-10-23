import type { AvatarChoice } from "./avatars.ts";
import type { HillHeight, ShotImpact } from "./fight-physics.ts";
import type { LandStart } from "./land-board.ts";
import type { PinSpot, QuestionType } from "./quiz-schema.ts";
import type { RacerCar, RacerConfidence, RacerTurnResult } from "./racer-rules.ts";
import type { SiegeDefenderType, SiegeMonsterType, SiegeWaves } from "./siege-rules.ts";
import type { PatchOp } from "./view-patch.ts";

export type Phase = "lobby" | "intro" | "open" | "reveal" | "leaderboard" | "podium";
export type Pacing = "manual" | "auto";

/** Consecutive correct answers needed before a 🔥 streak badge shows. */
export const STREAK_MIN = 4;

export interface ShuffleOptions {
  questions: boolean;
  answers: boolean;
}

// ---------- Tallest Tower ----------

export type GameMode = "classic" | "tower" | "submarine" | "fight" | "robot" | "land" | "racer" | "cup" | "dragon" | "bomb" | "siege";
export type TowerPhase = "countdown" | "playing" | "podium";

/** Each team also has a shape, so teams can be told apart without relying on colour. */
export type TeamShape = "circle" | "square" | "triangle" | "diamond" | "star" | "heart";

export const TEAMS = [
  { name: "Red", color: "#d81e3a", shape: "circle" },
  { name: "Blue", color: "#1f5ee0", shape: "square" },
  { name: "Yellow", color: "#f5c400", shape: "triangle" },
  { name: "Cyan", color: "#12b5cb", shape: "diamond" },
  { name: "Purple", color: "#7d3cc8", shape: "star" },
  { name: "Pink", color: "#f0559e", shape: "heart" },
] as const satisfies readonly { name: string; color: string; shape: TeamShape }[];
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
  | { type: "cup.answer"; seq: number; option: number; text?: string }
  /** Cup of Death, drink phase, drinkers only: pick one of your remaining cups (0-based, left to right). Final once sent. */
  | { type: "cup.pick"; cup: number }
  /** Dragon's Hoard: `rune` answers the class-wide rune question (seq = fire.seq) instead of the player's own question. */
  | { type: "dragon.answer"; seq: number; option: number; text?: string; rune?: boolean }
  /** Dragon's Hoard, chest state: open one of the DRAGON_CHESTS chests (0-based). */
  | { type: "dragon.chest"; chest: number }
  /** Dragon's Hoard, grab state: the team to steal from. */
  | { type: "dragon.grab"; team: number }
  /** Bomb Squad: start or stop holding a wire (or pin spot) you hold. The cut lands only after BOMB_HOLD_MS. */
  | { type: "bomb.hold"; wireId: string; holding: boolean }
  /** Bomb Squad: the hold finished. The server checks the wire, the holder and the time. */
  | { type: "bomb.cut"; wireId: string }
  /** Bomb Squad keypad module: a typed answer. Checked like every other mode. */
  | { type: "bomb.type"; text: string }
  | { type: "siege.answer"; seq: number; option: number; text?: string }
  /** Kingdom Siege: place a defender. lane 0–4 (top first), square 1–7 (1 = next to the castle wall). */
  | { type: "siege.place"; defender: SiegeDefenderType; lane: number; square: number }
  /** Kingdom Siege: upgrade the defender on that square one level. */
  | { type: "siege.upgrade"; lane: number; square: number }
  /** Kingdom Siege: the lane map opened or closed, so the server only sends its contents while it is open. */
  | { type: "siege.map"; open: boolean };

export type HostMsg =
  | { type: "host.hello" }
  | { type: "host.open"; quizId: string }
  | { type: "host.start"; pacing: Pacing }
  | { type: "host.setPacing"; pacing: Pacing }
  | { type: "host.setShuffle"; questions: boolean; answers: boolean }
  | { type: "host.setProtect"; on: boolean }
  | { type: "host.setMode"; mode: GameMode }
  | { type: "host.setTower"; teams: number; minutes: number; monster?: boolean }
  | { type: "host.setFight"; hill: HillSetting }
  | { type: "host.setLand"; teams: number; minutes: number }
  | { type: "host.setCup"; cups: number }
  | ({ type: "host.setDragon" } & DragonSettings)
  | ({ type: "host.setBomb" } & BombSettings)
  | ({ type: "host.setSiege" } & SiegeSettings)
  | { type: "host.next" }
  | { type: "host.skip" }
  | { type: "host.kick"; playerId: string }
  | { type: "host.setTeam"; playerId: string; team: number }
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
  /** Pin questions: where each option's spot sits on the image (sent together with options). */
  spots?: PinSpot[];
  /** Milliseconds left when the message was sent (clients add it to their own clock). */
  remainingMs: number;
}

/** A self-paced mode's current question for one player. */
export interface StreamQuestionView {
  seq: number;
  type: QuestionType;
  text: string;
  image?: string;
  options: string[];
  spots?: PinSpot[];
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
  | { kind: "none"; game: { title: string; phase: Phase | TowerPhase | SubPhase | FightPhase | RobotPhase | LandPhase | RacerPhase | CupPhase | DragonPhase | BombPhase | SiegePhase } }
  | {
      kind: "player";
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
      /** In the lobby with Kingdom Siege selected (the phone shows the castle banner). */
      siege?: true;
    }
  | PlayerTowerView
  | PlayerSubView
  | PlayerFightView
  | PlayerRobotView
  | PlayerLandView
  | PlayerRacerView
  | PlayerCupView
  | PlayerDragonView
  | PlayerBombView
  | PlayerSiegeView;

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
  question: StreamQuestionView | null;
  /** Result of the last answer while its 1 s flash is still showing. */
  feedback: { seq: number; correct: boolean; remainingMs: number; answers: string[]; penaltyMs: number } | null;
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
  /** Lobby choice; anything but "classic" hands the players over to that mode's game on start. */
  mode: GameMode;
  tower: TowerSettings;
  fight: FightSettings;
  land: LandSettings;
  cup: CupSettings;
  dragon: DragonSettings;
  bomb: BombSettings;
  siege: SiegeSettings;
  /** Team preview while the lobby is in a team mode (Tallest Tower, Tower Fight, Land Grab, Dragon's Hoard, Bomb Squad). */
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
  question: StreamQuestionView | null;
  feedback: { seq: number; correct: boolean; remainingMs: number; answers: string[]; penaltyMs: number } | null;
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
  question: StreamQuestionView | null;
  feedback: { seq: number; correct: boolean; remainingMs: number; answers: string[]; penaltyMs: number } | null;
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
export const ROBOT_QUIZ_MIN_MS = 7000;
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
  question: StreamQuestionView | null;
  feedback: { seq: number; correct: boolean; remainingMs: number; answers: string[]; penaltyMs: number } | null;
  /** The board, during movement and the attack only (quiz time is for questions). */
  board: { marked: number[]; inset: number; collapsing: number[]; others: { x: number; y: number }[] } | null;
  /** This player's part in the latest attack. */
  lastAttack: { seq: number; hit: boolean; eliminated: boolean } | null;
  result: { rank: number; playerCount: number; won: boolean; outRound: number | null; awards: string[] } | null;
}

// ---------- Cup of Death ----------

export type CupPhase = "countdown" | "roll" | "quiz" | "drink" | "reveal" | "podium";
/** Cups in front of each player at the start (a lobby setting); one is drunk (and gone) each time they survive a drink. */
export const CUP_MIN_CUPS = 1;
export const CUP_MAX_CUPS = 6;
export const CUP_DEFAULT_CUPS = 3;

export interface CupSettings {
  cups: number;
}
export const CUP_DIE_SIDES = 6;
/** The dice tumble this long before the quiz timer starts. */
export const CUP_ROLL_MS = 2500;
/** The first quiz phase is this long; each round is CUP_QUIZ_STEP_MS shorter, down to CUP_QUIZ_MIN_MS. */
export const CUP_QUIZ_START_MS = 30_000;
export const CUP_QUIZ_STEP_MS = 2000;
export const CUP_QUIZ_MIN_MS = 10_000;
/** Time to pick a cup; anyone who hasn't picked by then gets a random one. */
export const CUP_DRINK_MS = 10_000;
/** In the reveal, each drinker raises the cup and gulps for CUP_SIP_MS, then the verdict shows for CUP_VERDICT_MS. */
export const CUP_SIP_MS = 1800;
export const CUP_VERDICT_MS = 1800;
/** How long "Everyone's safe!" shows when nobody has to drink. */
export const CUP_ALL_SAFE_MS = 2500;

/** Length of round n's quiz phase (n starts at 1). */
export function cupQuizMs(round: number): number {
  return Math.max(CUP_QUIZ_MIN_MS, CUP_QUIZ_START_MS - CUP_QUIZ_STEP_MS * (round - 1));
}

export interface CupAwards {
  mostCorrect: SubAward | null;
  /** Most drinks survived. */
  luckiest: SubAward | null;
  /** Most rounds made safe without drinking. */
  neverThirsty: SubAward | null;
  /** Poisoned by the first cup they ever drank (a 1-in-N chance, N = the starting cups), earliest round; value = that round. */
  unluckiest: SubAward | null;
}

/** One drinker in the reveal, in the order they are revealed. */
export interface CupDrinkView {
  id: string;
  /** The cup they drank (0-based among the cupsBefore cups in front of them). */
  cup: number;
  cupsBefore: number;
  /** The cup was picked for them (time ran out, or it was their last cup). */
  auto: boolean;
  /** Null until this drinker's verdict is shown. */
  verdict: "poison" | "safe" | null;
}

export interface CupRevealView {
  seq: number;
  round: number;
  drinks: CupDrinkView[];
  /** Index of the drinker in the spotlight, or -1 before the first and after the last. */
  current: number;
}

export interface HostCupPlayer {
  id: string;
  nickname: string;
  avatar: AvatarChoice;
  connected: boolean;
  /** Cups still in front of them. */
  cups: number;
  out: boolean;
  /** This round's dice roll: correct answers needed (0 before the first roll). */
  target: number;
  /** Correct answers so far this round. */
  progress: number;
  safe: boolean;
  /** Drink phase: has to drink this round. */
  drinker: boolean;
  /** Drink phase: has picked a cup. */
  picked: boolean;
}

export interface CupStanding {
  id: string;
  nickname: string;
  avatar: AvatarChoice;
  rank: number;
  cups: number;
  /** Round the player was poisoned in, or null for a survivor. */
  outRound: number | null;
  correct: number;
}

export interface HostCupState {
  kind: "cup";
  phase: CupPhase;
  quiz: { id: string; title: string; questionCount: number };
  round: number;
  phaseRemainingMs: number;
  /** Full length of the current phase, for the progress bar. */
  phaseDurationMs: number;
  players: HostCupPlayer[];
  /** Cups each player started with. */
  startCups: number;
  /** The drinks of the current round (reveal phase), or null. */
  reveal: CupRevealView | null;
  playerCount: number;
  standings: CupStanding[] | null;
  awards: CupAwards | null;
  errors: QuestionError[] | null;
  hasResults: boolean;
}

export interface PlayerCupView {
  kind: "cup";
  phase: CupPhase;
  title: string;
  round: number;
  phaseRemainingMs: number;
  phaseDurationMs: number;
  me: { id: string; nickname: string; avatar: AvatarChoice; cups: number; out: boolean; target: number; progress: number; safe: boolean; correct: number };
  /** Cups each player started with. */
  startCups: number;
  /** Questions to answer: living players during the quiz until safe; poisoned players any time, for practice. */
  question: StreamQuestionView | null;
  feedback: { seq: number; correct: boolean; remainingMs: number; answers: string[]; penaltyMs: number } | null;
  /** Drink phase, drinkers only: their pick so far (null until they pick). */
  drink: { picked: number | null } | null;
  /** Reveal phase, drinkers only: this player's own drink. `turn` is true while they are in the spotlight. */
  myDrink: (CupDrinkView & { seq: number; turn: boolean; waiting: boolean }) | null;
  /** Players still alive. */
  alive: number;
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
  question: StreamQuestionView | null;
  feedback: { seq: number; correct: boolean; remainingMs: number; answers: string[]; penaltyMs: number } | null;
  /** The land, while this player is placing tiles. */
  board: LandBoard | null;
  /** Set once this player's first team was surrounded and they joined the conquerors. */
  conquered: { seq: number; from: string; by: string } | null;
  result: { teamRank: number; teamCount: number; tiles: number; won: boolean; awards: string[] } | null;
}

// ---------- Racer ----------
//
// Co-op, paced like Classic: one shared question per turn, every question once, then the podium.
// The whole class shares one car. The rules (speeds, gains, fails, crash, repair) live in racer-rules.ts.
//
// A turn is "confidence" → "open" → "reveal" when the car is running (a driver sets the lever, then everyone answers),
// or "intro" → "open" → "reveal" when there is no driver (the car is crashed, or nobody is connected).
// There is no lobby phase: the lobby is the classic game (HostGameState with mode "racer").

/**
 * intro: 3 s look at the question on a turn without a driver; options hidden.
 * confidence: the driver sets the lever (20 s at most); everyone sees the question, options hidden.
 * open: options visible, everyone answers once, the driver too.
 * reveal: correct answers, counts and what the turn did to the car (`lastTurn`).
 * podium: the game is over.
 */
export type RacerPhase = "intro" | "confidence" | "open" | "reveal" | "podium";

export type { RacerCar, RacerConfidence, RacerTurnResult } from "./racer-rules.ts";

/** The player at the wheel this turn. Kept as it was when the turn started, even if they leave or are removed. */
export interface RacerDriver {
  id: string;
  nickname: string;
  avatar: AvatarChoice;
}

/**
 * Summary of the most recently finished turn: confidence, correct, total, gain, fails, speedBefore,
 * speedAfter, crashed, repaired and distanceAdded come from RacerTurnResult.
 */
export interface RacerTurn extends RacerTurnResult {
  /** Index of the question this turn was about (QuestionView.index); use it to play the turn's animation once. */
  index: number;
  /** Null when the turn had no driver. */
  driver: RacerDriver | null;
}

/** The shared final result. */
export interface RacerResult {
  /** Miles. */
  distance: number;
  /** Mph. */
  topSpeed: number;
  crashes: number;
  /** Turns played to the end (fewer than the quiz has questions if the host ended the game early). */
  turns: number;
}

export interface RacerAwards {
  mostCorrect: SubAward | null;
  /** Most mph gained while driving. */
  bestDriver: SubAward | null;
}

export interface HostRacerPlayer {
  id: string;
  nickname: string;
  avatar: AvatarChoice;
  connected: boolean;
  /** Has answered the current question. */
  answered: boolean;
  /** Totals over the questions closed so far. A question left unanswered counts as neither. */
  correct: number;
  wrong: number;
  turnsDriven: number;
  /** Mph gained on the turns this player drove. */
  mphGained: number;
  /** Fail points on the turns this player drove. */
  failsAsDriver: number;
}

export interface HostRacerState {
  kind: "racer";
  phase: RacerPhase;
  quiz: { id: string; title: string; questionCount: number };
  /** Manual waits for host.next on the reveal; auto moves on after 5 s. host.setPacing works mid-game. */
  pacing: Pacing;
  /** The current question (null at the podium). `options` is empty during intro and confidence; `remainingMs` is the time left in intro, confidence or open, 0 on the reveal. */
  question: QuestionView | null;
  /** This turn's driver; null on a turn without one and at the podium. */
  driver: RacerDriver | null;
  /** Where the lever is: live during confidence, then where it was locked. Null without a driver. */
  lever: RacerConfidence | null;
  /** The locked lever, from the open phase on; null before that and without a driver. */
  confidence: RacerConfidence | null;
  /** Players who have answered the current question. */
  answeredCount: number;
  playerCount: number;
  players: HostRacerPlayer[];
  /** Reveal only: indices of the correct option(s). */
  correct: number[] | null;
  /** Reveal only: how many players picked each option. */
  answerCounts: number[] | null;
  /** The car as it is now; on the reveal the turn has already been applied (lastTurn.speedBefore has the old speed). */
  car: RacerCar;
  /** The latest finished turn: this question's on the reveal, the previous question's before that. Null until the first question closes. */
  lastTurn: RacerTurn | null;
  /** Reveal only: the players who got this question wrong or didn't answer it; they fall out of the car. */
  ejected: { id: string; avatar: AvatarChoice }[] | null;
  /** Time left in the current phase; 0 when it has no timer (reveal with manual pacing, podium). */
  phaseRemainingMs: number;
  /** Full length of the current phase, for a progress bar; 0 when it has no timer. */
  phaseDurationMs: number;
  /** Podium only. */
  result: RacerResult | null;
  awards: RacerAwards | null;
  /** The questions answered wrongly most often (podium only). */
  errors: QuestionError[] | null;
  hasResults: boolean;
}

/** A phone's complete snapshot: enough to redraw from scratch after a reconnect in any phase. */
export interface PlayerRacerView {
  kind: "racer";
  phase: RacerPhase;
  title: string;
  /** Totals over the questions closed so far (they don't move while a question is open). */
  me: { id: string; nickname: string; avatar: AvatarChoice; correct: number; wrong: number; turnsDriven: number; mphGained: number; failsAsDriver: number };
  playerCount: number;
  /** As HostRacerState.question. */
  question: QuestionView | null;
  phaseRemainingMs: number;
  phaseDurationMs: number;
  /** This player is at the wheel this turn: in the confidence phase they send racer.lever and racer.go. */
  isDriver: boolean;
  driver: RacerDriver | null;
  /** As HostRacerState.lever; the driver's own lever follows it too. */
  lever: RacerConfidence | null;
  /** As HostRacerState.confidence. */
  confidence: RacerConfidence | null;
  /** The option this player picked for the current question (open and reveal), if any. */
  myChoice: number | null;
  /** What this player typed, for a typed question (open and reveal), if they answered. */
  myText: string | null;
  /** Reveal only: how this player did on the question. */
  reveal: { choice: number | null; correct: number[]; wasCorrect: boolean } | null;
  car: RacerCar;
  /** As HostRacerState.lastTurn. */
  lastTurn: RacerTurn | null;
  /** Podium only: the shared result and the titles of the awards this player won. Their own numbers are in `me`. */
  result: (RacerResult & { awards: string[] }) | null;
}

// ---------- Dragon's Hoard ----------
//
// Two acts. Act 1 (battle, with fire-breath rune rounds) is whole-class co-op against one dragon;
// Act 2 (scramble) is teams racing to collect the spilled hoard from chests.

/**
 * countdown: 3 s before the battle.
 * battle: everyone answers at their own pace; each correct answer is one hit on the dragon.
 * fire: a rune round (warning → question → reveal; see DragonFireStep); self-paced questions pause.
 * transition: the dragon falls (or flies off) and the teams are shown.
 * scramble: correct answers open chests for the team's gold pile.
 * podium: the game is over.
 */
export type DragonPhase = "countdown" | "battle" | "fire" | "transition" | "scramble" | "podium";
export type DragonFireStep = "warning" | "question" | "reveal";
export type DragonToughness = "easy" | "normal" | "hard";
export const DRAGON_TOUGHNESS: readonly DragonToughness[] = ["easy", "normal", "hard"];
/** Hits the dragon takes per player. */
export const DRAGON_HITS_PER_PLAYER: Record<DragonToughness, number> = { easy: 6, normal: 10, hard: 15 };
/** The dragon never has less health than this, however small the class. */
export const DRAGON_MIN_HEALTH = 30;
export const DRAGON_MIN_TEAMS = 2;
export const DRAGON_BATTLE_MINUTES = [3, 5, 7] as const;
export const DRAGON_FIRE_SECONDS = [30, 45, 60] as const;
export const DRAGON_SCRAMBLE_MINUTES = [2, 3, 4, 5] as const;

export interface DragonSettings {
  /** Teams for Act 2 (DRAGON_MIN_TEAMS … MAX_TEAMS), capped at the number of players when the game starts. */
  teams: number;
  toughness: DragonToughness;
  battleMinutes: number;
  fireSec: number;
  scrambleMinutes: number;
}

/** The dragon is "wounded" under this share of its health and "badly wounded" under the next. */
export const DRAGON_WOUNDED_AT = 0.66;
export const DRAGON_BADLY_AT = 0.33;
/** Each new wounded stage brings fire breath this much sooner, down to DRAGON_FIRE_MIN_SEC. */
export const DRAGON_FIRE_STEP_SEC = 10;
export const DRAGON_FIRE_MIN_SEC = 20;
export const DRAGON_FIRE_WARN_MS = 3000;
/** The rune question's time: its own time limit, kept within these bounds. */
export const DRAGON_RUNE_MAX_MS = 20_000;
export const DRAGON_RUNE_MIN_MS = 10_000;
export const DRAGON_RUNE_REVEAL_MS = 4000;
/** Share of the connected players who must get the rune question right for the shield to hold. */
export const DRAGON_SHIELD_SHARE = 2 / 3;
/** Shield held: bonus damage, as a share of the dragon's full health. Shield broken: the dragon heals this share. */
export const DRAGON_SHIELD_BONUS = 0.05;
export const DRAGON_FIRE_HEAL = 0.1;
export const DRAGON_TRANSITION_MS = 8000;
/** Chests offered per correct answer in Act 2, and the time to pick one before one is opened at random. */
export const DRAGON_CHESTS = 3;
export const DRAGON_CHEST_MS = 10_000;
/** How long the phone shows what came out of a chest. */
export const DRAGON_LOOT_MS = 2500;
/** Time to pick a team to grab from; after that the richest team that can be picked is chosen. */
export const DRAGON_GRAB_MS = 8000;
/** A team can only be grabbed from once in this long. */
export const DRAGON_GRAB_COOLDOWN_MS = 5000;
export const DRAGON_JACKPOT_START = 100;
export const DRAGON_JACKPOT_PER_PLAYER = 10;
/** The Jackpot chest can't come up this early in the scramble. */
export const DRAGON_JACKPOT_LOCK_MS = 60_000;
/** Coin chests a Lucky charm doubles. */
export const DRAGON_CHARM_CHESTS = 3;
/** Share of a team's gold a trap sends to the Jackpot. */
export const DRAGON_TRAP_SHARE = 0.1;
/** Recent hits the projector shows, and Act 2 events it keeps. */
export const DRAGON_HITS_SHOWN = 12;
export const DRAGON_EVENTS_SHOWN = 4;

export type DragonLoot = "coins" | "bigPile" | "charm" | "grab10" | "grab25" | "trap" | "scale" | "bats" | "jackpot";

/** The loot table: chance per chest in percent (they add up to 100). */
export const DRAGON_LOOT_TABLE: readonly { kind: DragonLoot; chance: number }[] = [
  { kind: "coins", chance: 35 },
  { kind: "bigPile", chance: 20 },
  { kind: "charm", chance: 8 },
  { kind: "grab10", chance: 10 },
  { kind: "grab25", chance: 4 },
  { kind: "trap", chance: 10 },
  { kind: "scale", chance: 4 },
  { kind: "bats", chance: 8 },
  { kind: "jackpot", chance: 1 },
];
/** Gold in a Coins and a Big pile chest; half (rounded up) if the dragon escaped. */
export const DRAGON_COINS = 25;
export const DRAGON_BIG_PILE = 60;
export const DRAGON_GRAB_SHARE: Partial<Record<DragonLoot, number>> = { grab10: 0.1, grab25: 0.25 };

export function dragonCoinValue(kind: "coins" | "bigPile", escaped: boolean): number {
  const full = kind === "coins" ? DRAGON_COINS : DRAGON_BIG_PILE;
  return escaped ? Math.ceil(full / 2) : full;
}

/** Fire breath interval in seconds once the dragon has reached `stage` (0 healthy, 1 wounded, 2 badly wounded). */
export function dragonFireSec(fireSec: number, stage: number): number {
  return Math.max(DRAGON_FIRE_MIN_SEC, fireSec - DRAGON_FIRE_STEP_SEC * stage);
}

/** 0 healthy, 1 wounded, 2 badly wounded. */
export function dragonStage(health: number, maxHealth: number): 0 | 1 | 2 {
  const share = maxHealth > 0 ? health / maxHealth : 0;
  return share < DRAGON_BADLY_AT ? 2 : share < DRAGON_WOUNDED_AT ? 1 : 0;
}

export interface DragonAwards {
  /** Most hits on the dragon. */
  dragonSlayer: SubAward | null;
  runeMaster: SubAward | null;
  /** Most gold grabbed from other teams. */
  masterThief: SubAward | null;
  mostCorrect: SubAward | null;
}

/** One correct answer landing on the dragon. */
export interface DragonHit {
  seq: number;
  nickname: string;
  avatar: AvatarChoice;
}

/** The rune question as everyone sees it. Options are empty during the warning. */
export interface DragonRuneQuestion {
  type: QuestionType;
  text: string;
  image?: string;
  options: string[];
  spots?: PinSpot[];
}

export interface HostDragonFire {
  seq: number;
  step: DragonFireStep;
  /** Null during the warning. */
  question: DragonRuneQuestion | null;
  answered: number;
  /** Players taking part (those in the game when the fire started). */
  total: number;
  /** Reveal only. */
  correct: number[] | null;
  answerCounts: number[] | null;
  right: number | null;
  /** Connected players the 2/3 is counted from. */
  needed: number | null;
  held: boolean | null;
  /** Health taken (shield held) or healed (fire got through). */
  amount: number | null;
}

/** Act 2 news for the projector's pop-ups. */
export interface DragonEvent {
  seq: number;
  kind: "grab" | "blocked" | "trap" | "jackpot";
  nickname: string;
  team: number;
  /** The team grabbed from (grab, blocked). */
  target: number | null;
  gold: number;
}

export interface HostDragonTeam extends TeamInfo {
  gold: number;
  rank: number;
  /** Correct answers in Act 2 (the tie-break). */
  correct: number;
  /** Dragon scales waiting to block grabs. */
  scales: number;
  /** Time until the team can be grabbed from again. */
  protectedMs: number;
  members: { id: string; nickname: string; avatar: AvatarChoice; connected: boolean }[];
}

export interface DragonResult {
  slain: boolean;
  /** Time from the start of the battle to the last hit. */
  slainMs: number | null;
  runeHeld: number;
  runeFailed: number;
}

export interface HostDragonState {
  kind: "dragon";
  phase: DragonPhase;
  quiz: { id: string; title: string; questionCount: number };
  settings: DragonSettings;
  /** The act's clock: battle time left (battle, fire) or scramble time left; the step's time in countdown and transition. */
  remainingMs: number;
  /** Time left in the current step (countdown, fire step, transition). */
  phaseRemainingMs: number;
  phaseDurationMs: number;
  health: number;
  maxHealth: number;
  /** The art stage for the current health. */
  stage: 0 | 1 | 2;
  /** The worst stage reached; it goes up once per roar and sets the fire interval. */
  maxStage: number;
  slain: boolean;
  escaped: boolean;
  /** Time to the next fire breath (battle only). */
  nextFireMs: number | null;
  /** The most recent hits, oldest first (at most DRAGON_HITS_SHOWN). */
  hits: DragonHit[];
  fire: HostDragonFire | null;
  teams: HostDragonTeam[];
  jackpot: number;
  /** The Jackpot chest can't come up yet. */
  jackpotLocked: boolean;
  /** Newest last (at most DRAGON_EVENTS_SHOWN). */
  events: DragonEvent[];
  playerCount: number;
  connectedCount: number;
  result: DragonResult | null;
  awards: DragonAwards | null;
  errors: QuestionError[] | null;
  hasResults: boolean;
}

/** question = answering; chest = picking a chest; grab = picking a team to steal from; loot = what came out; waiting = joined during a fire breath. */
export type DragonPlayerState = "question" | "chest" | "grab" | "loot" | "waiting";

export interface DragonLootView {
  seq: number;
  kind: DragonLoot;
  /** Gold gained (coins, big pile, jackpot, grab) or lost (trap). */
  gold: number;
  /** A Lucky charm doubled this chest. */
  doubled: boolean;
  /** A grab with nobody to grab from paid as coins instead. */
  asCoins: boolean;
  /** Grab: the team picked. */
  target: TeamInfo | null;
  /** Grab: stopped by that team's dragon scale. */
  blocked: boolean;
  remainingMs: number;
}

export interface PlayerDragonView {
  kind: "dragon";
  phase: DragonPhase;
  title: string;
  /** As HostDragonState.remainingMs. */
  remainingMs: number;
  phaseRemainingMs: number;
  phaseDurationMs: number;
  me: { id: string; nickname: string; avatar: AvatarChoice; correct: number; hits: number; runeRight: number; charm: number };
  /** Dragon health in whole percent (rounded up), so other players' hits only send an update when it changes. */
  healthPct: number;
  stage: 0 | 1 | 2;
  slain: boolean;
  escaped: boolean;
  /** Null during Act 1: the teams only matter from the transition on. */
  team: TeamInfo | null;
  /** This player's team's gold (transition onwards). */
  teamGold: number | null;
  state: DragonPlayerState;
  question: StreamQuestionView | null;
  feedback: { seq: number; correct: boolean; remainingMs: number; answers: string[]; penaltyMs: number } | null;
  /** The rune round, for players taking part in it. */
  fire: {
    seq: number;
    step: DragonFireStep;
    question: DragonRuneQuestion | null;
    myChoice: number | null;
    myText: string | null;
    /** Reveal only. */
    result: { correct: number[]; answers: string[]; wasCorrect: boolean; right: number; needed: number; held: boolean } | null;
  } | null;
  chest: { seq: number; remainingMs: number } | null;
  /** The other teams' gold, only while picking a team to grab from. */
  grab: { seq: number; share: number; remainingMs: number; teams: { index: number; name: string; color: string; gold: number; protectedMs: number }[] } | null;
  loot: DragonLootView | null;
  result: { teamRank: number; teamCount: number; teamGold: number; won: boolean; slain: boolean; slainMs: number | null; awards: string[] } | null;
}

/**
 * Bomb Squad. countdown: 3, 2, 1. defuse: the squads are cutting wires.
 * defused / exploded: the bomb's ending, then podium.
 */
export type BombPhase = "countdown" | "defuse" | "defused" | "exploded" | "podium";
export type BombStyle = "together" | "race";

export const BOMB_MODULES = [2, 3, 4] as const;
export const BOMB_WIRES = [2, 3, 4] as const;
export const BOMB_MINUTES = [3, 5, 7, 10] as const;
export const BOMB_PENALTIES = [10, 15, 20, 30, 40] as const;
/** Squads in the lobby setting. A squad of 1 is allowed and plays like a normal quiz. */
export const BOMB_MAX_SQUADS = 6;
/** The default split keeps every squad at or under this many players. */
export const BOMB_MAX_PER_SQUAD = 6;
/** Hold the Cut button this long. Letting go early cancels it. */
export const BOMB_HOLD_MS = 1500;
/** A cut that arrives this early is still accepted (a phone's clock runs a little fast). */
export const BOMB_HOLD_GRACE_MS = 250;
/** Disconnected this long: their wires are dealt to the squad again. */
export const BOMB_REDEAL_MS = 5000;
/** After a right cut, the answer stays up this long before the next wire. */
export const BOMB_NEXT_MS = 2000;
export const BOMB_COUNTDOWN_MS = 3000;
/** How long the defused or exploded screen stays up before the podium. */
export const BOMB_RESULT_MS = 7000;

export interface BombSettings {
  /** Together: one bomb for the class. Race: one bomb per squad. */
  game: BombStyle;
  /** Squads (1–BOMB_MAX_SQUADS). Race needs at least 2 once the game starts. */
  squads: number;
  /** Modules each squad has to clear. */
  modules: number;
  /** Wires (questions) in each module. */
  wires: number;
  /** Bomb timer. */
  minutes: number;
  /** Seconds a wrong cut or wrong keypad entry takes off the timer. */
  penaltySec: number;
}

/** The six wire colors. One grey wire picture is tinted to these in the client. */
export const BOMB_WIRE_COLORS = ["red", "blue", "yellow", "green", "white", "black"] as const;
export type BombWireColor = (typeof BOMB_WIRE_COLORS)[number];

export interface BombAwards {
  /** Most right cuts. */
  steadyHands: SubAward | null;
  /** Fewest wrong cuts, among players with at least 2 right cuts. */
  carefulCutter: SubAward | null;
  /** Most right wires the squad cut on the first try. */
  teamPlayer: SubAward | null;
}

export type BombPanel = "wire" | "keypad" | "picture";

export interface HostBombModule {
  lights: number;
  total: number;
  cleared: boolean;
  active: boolean;
  /** Which painted panel to show. Pending modules use the wire panel. */
  panel: BombPanel;
}

export interface HostBombSquad {
  index: number;
  name: string;
  color: string;
  remainingMs: number;
  /** Bumps when a wrong cut moves this squad's timer, so phones restart their countdown. */
  timerRev: number;
  modules: HostBombModule[];
  modulesCleared: number;
  finished: boolean;
  exploded: boolean;
  wrongCuts: number;
  /** Race only; null until the podium. */
  rank: number | null;
  /** The question text, and only when the class is a single squad. Never the answers, until reveal. */
  question: { text: string; image?: string; reveal: string[] | null } | null;
  /** Latest pop on this squad: a wrong cut, a snip, or a cleared module. */
  flash: { seq: number; kind: "wrong" | "snip" | "module"; penaltySec: number | null } | null;
}

export interface HostBombState {
  kind: "bomb";
  phase: BombPhase;
  quiz: { id: string; title: string; questionCount: number };
  settings: BombSettings;
  /** Together: the shared timer. Race: the soonest squad still playing. */
  remainingMs: number;
  timerRev: number;
  durationMs: number;
  /** Countdown or the defused/exploded hold. */
  phaseRemainingMs: number;
  squads: HostBombSquad[];
  outcome: "defused" | "exploded" | null;
  /** Frozen time left once the bomb is defused (Together, or the winner in Race). */
  timeLeftMs: number | null;
  /** "Defused with 1:42 left" or "Exploded with 9 of 12 modules cleared". Null while defusing. */
  headline: string | null;
  modulesCleared: number;
  modulesTotal: number;
  playerCount: number;
  connectedCount: number;
  awards: BombAwards | null;
  errors: QuestionError[] | null;
  hasResults: boolean;
}

export interface PlayerBombWire {
  id: string;
  label: string;
  color: BombWireColor;
  /** Pin questions: this wire's spot on the picture. */
  spot?: PinSpot;
}

export interface PlayerBombView {
  kind: "bomb";
  phase: BombPhase;
  title: string;
  game: BombStyle;
  remainingMs: number;
  timerRev: number;
  durationMs: number;
  me: { id: string; nickname: string; avatar: AvatarChoice };
  squad: TeamInfo | null;
  /** cheer: Together, your modules are done and the class is still going. waiting: no squad yet (or the podium is all that's left). */
  squadState: "playing" | "cheer" | "defused" | "exploded" | "waiting";
  question: { seq: number; type: QuestionType; text: string; image?: string } | null;
  /** Only the wires this phone holds. Nothing here says which one is right. */
  wires: PlayerBombWire[];
  keypad: boolean;
  /** A teammate (or you) is holding Cut. */
  cutting: { name: string; detail: string; mine: boolean } | null;
  /** Someone else is holding, so this phone's Cut button waits. */
  cutLocked: boolean;
  status: string | null;
  /** The right answer, shown for a moment after the squad clears the wire. */
  reveal: string[] | null;
  result: {
    outcome: "defused" | "exploded";
    headline: string;
    rank: number | null;
    squads: number;
    awards: string[];
  } | null;
}

/**
 * Kingdom Siege. countdown: 3, 2, 1. build: the opening build break and the breaks between
 * waves. wave: monsters are marching. stands / fallen: the ending cinematic, then podium.
 */
export type SiegePhase = "countdown" | "build" | "wave" | "stands" | "fallen" | "podium";

export interface SiegeSettings {
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
  hasResults: boolean;
}

export interface SiegeMapView {
  defenders: { lane: number; square: number; type: SiegeDefenderType; level: number }[];
  /** Monster dots, refreshed once a second. Square 8 is the entry square. */
  monsters: { lane: number; square: number }[];
}

export interface PlayerSiegeView {
  kind: "siege";
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
  feedback: { seq: number; correct: boolean; remainingMs: number; answers: string[]; penaltyMs: number } | null;
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
  | (HostDragonState & { join: JoinInfo })
  | (HostBombState & { join: JoinInfo })
  | (HostSiegeState & { join: JoinInfo });

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

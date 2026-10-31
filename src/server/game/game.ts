import {
  BOMB_MAX_SQUADS,
  BOMB_MINUTES,
  BOMB_MODULES,
  BOMB_PENALTIES,
  BOMB_WIRES,
  CUP_DEFAULT_CUPS,
  CUP_MAX_CUPS,
  CUP_MIN_CUPS,
  DRAGON_BATTLE_MINUTES,
  DUEL_DEFAULT_ROUNDS,
  DUEL_ROUNDS,
  DRAGON_FIRE_SECONDS,
  DRAGON_MIN_TEAMS,
  DRAGON_SCRAMBLE_MINUTES,
  DRAGON_TOUGHNESS,
  HILL_SETTINGS,
  LAND_MINUTES,
  LAND_MIN_TEAMS,
  MAX_TEAMS,
  TOWER_MINUTES,
  type BombSettings,
  type CupSettings,
  type DragonSettings,
  type DuelSettings,
  type FightSettings,
  type GameMode,
  type HillSetting,
  type HostGameState,
  type LandSettings,
  type Pacing,
  type Phase,
  type PlayerView,
  type QuestionError,
  type QuestionView,
  type RankedEntry,
  type ShuffleOptions,
  type SiegeSettings,
  type TowerSettings,
} from "../../shared/protocol.ts";
import { SIEGE_WAVE_CHOICES, type SiegeWaves } from "../../shared/siege-rules.ts";
import { cleanAvatar, randomAvatar, type AvatarChoice } from "../../shared/avatars.ts";
import { MAX_TYPED_ANSWER, checkAnswer, type AnswerValue } from "../../shared/answer-match.ts";
import type { Question, Quiz } from "../../shared/quiz-schema.ts";
import { BombGame } from "./bomb.ts";
import { GameError, assignTeams, realClock, shuffle, shuffleOptions, teamInfo, topErrors, type Clock } from "./common.ts";
import { Roster, type BasePlayer } from "./roster.ts";
import { rankScores, scoreAnswer } from "./scoring.ts";

export { GameError, type Clock } from "./common.ts";

export const INTRO_MS = 3000;
export const AUTO_REVEAL_MS = 5000;
export const AUTO_LEADERBOARD_MS = 5000;
/** Answers sent just before the deadline may arrive slightly after it. */
export const GRACE_MS = 500;
const LEADERBOARD_SIZE = 10;
export const DEFAULT_TOWER: TowerSettings = { teams: 2, minutes: 5, monster: true };
export const DEFAULT_FIGHT: FightSettings = { hill: "random" };
export const DEFAULT_LAND: LandSettings = { teams: 2, minutes: 5 };
export const DEFAULT_CUP: CupSettings = { cups: CUP_DEFAULT_CUPS };
export const DEFAULT_DRAGON: DragonSettings = { teams: 2, toughness: "normal", battleMinutes: 5, fireSec: 45, scrambleMinutes: 3 };
export const DEFAULT_BOMB: BombSettings = { game: "together", squads: 1, modules: 3, wires: 3, minutes: 5, penaltySec: 15 };
export const DEFAULT_SIEGE: SiegeSettings = { waves: 5 };
export const DEFAULT_DUEL: DuelSettings = { rounds: DUEL_DEFAULT_ROUNDS };

interface Answer {
  /** Chosen option index; -1 for a typed answer. */
  option: number;
  /** What the player typed, for a typed question. */
  text?: string;
  correct: boolean;
  points: number;
  ms: number;
}

interface Player extends BasePlayer {
  score: number;
  /** Points gained on the most recently closed question. */
  lastDelta: number;
  /** Consecutive correct answers up to the most recently closed question. */
  streak: number;
  answers: (Answer | undefined)[];
}

/** Shuffle once per game (same order for everyone); correct indices are remapped. */
export function preparePlayOrder(source: Question[], opts: ShuffleOptions, rng: () => number = Math.random): Question[] {
  let questions = source.map((q) => ({ ...q, options: [...q.options], correct: [...q.correct] }));
  if (opts.questions) questions = shuffle(questions, rng);
  if (opts.answers) questions = questions.map((q) => shuffleOptions(q, rng));
  return questions;
}

interface GameOptions {
  clock?: Clock;
  rng?: () => number;
  pacing?: Pacing;
  onChange?: () => void;
  onFinish?: (game: Game) => void;
  /** Initial lobby choices (e.g. carried over from the previous game). */
  mode?: GameMode;
  tower?: TowerSettings;
  fight?: FightSettings;
  land?: LandSettings;
  cup?: CupSettings;
  dragon?: DragonSettings;
  bomb?: BombSettings;
  siege?: SiegeSettings;
  duel?: DuelSettings;
  protect?: boolean;
}

/**
 * A Classic game: lobby → (intro → open → reveal → leaderboard)* → podium.
 * It also serves as the lobby for every mode; in the other modes the hub
 * hands its players to that mode's game (TowerGame, SubGame, FightGame, RobotGame, LandGame, RacerGame, CupGame, DragonGame, BombGame, SiegeGame, DuelGame) on start.
 */
export class Game {
  readonly quiz: Quiz;
  readonly quizId: string;
  readonly title: string;
  /** Play order; fixed (and shuffled if chosen) when the game starts. */
  questions: Question[];
  phase: Phase = "lobby";
  qIndex = -1;
  pacing: Pacing;
  shuffle: ShuffleOptions;
  /** "Protect from abuse": Tallest Tower, Submarine Squad, Tower Fight, Robot Attack, Cup of Death, Dragon's Hoard and Kingdom Siege slow down players who keep answering wrong. Bomb Squad does not use it. */
  protect: boolean;
  mode: GameMode;
  tower: TowerSettings;
  fight: FightSettings;
  land: LandSettings;
  cup: CupSettings;
  dragon: DragonSettings;
  bomb: BombSettings;
  siege: SiegeSettings;
  duel: DuelSettings;
  /** When the current phase's countdown ends (intro/open), for views. */
  phaseEndsAt = 0;
  openedAt = 0;
  readonly roster = new Roster<Player>();

  private readonly clock: Clock;
  private readonly rng: () => number;
  private readonly source: Question[];
  private timer: unknown = null;
  /** Team per player id once the host has dragged someone in the lobby; null = round-robin by join order. */
  private manualTeams: Map<string, number> | null = null;
  /** The host picked a squad count. Until then it follows the class size. */
  private bombSquadsManual = false;
  private readonly onChange: () => void;
  private readonly onFinish: (game: Game) => void;

  constructor(quiz: Quiz, opts: GameOptions = {}) {
    this.quiz = quiz;
    this.quizId = quiz.id;
    this.title = quiz.title;
    this.source = quiz.questions;
    this.questions = preparePlayOrder(quiz.questions, { questions: false, answers: false });
    this.shuffle = { questions: quiz.settings.shuffleQuestions, answers: quiz.settings.shuffleAnswers };
    this.rng = opts.rng ?? Math.random;
    this.clock = opts.clock ?? realClock;
    this.pacing = opts.pacing ?? "manual";
    this.onChange = opts.onChange ?? (() => {});
    this.onFinish = opts.onFinish ?? (() => {});
    this.mode = opts.mode ?? "classic";
    this.tower = { ...(opts.tower ?? DEFAULT_TOWER) };
    this.fight = { ...(opts.fight ?? DEFAULT_FIGHT) };
    this.land = { ...(opts.land ?? DEFAULT_LAND) };
    this.cup = { ...(opts.cup ?? DEFAULT_CUP) };
    this.dragon = { ...(opts.dragon ?? DEFAULT_DRAGON) };
    this.bomb = { ...(opts.bomb ?? DEFAULT_BOMB) };
    this.siege = { ...(opts.siege ?? DEFAULT_SIEGE) };
    this.duel = { ...(opts.duel ?? DEFAULT_DUEL) };
    this.protect = opts.protect ?? true;
  }

  get players(): Map<string, Player> {
    return this.roster.players;
  }

  get currentQuestion(): Question | null {
    return this.questions[this.qIndex] ?? null;
  }

  // ---------- players ----------

  /** `avatar` is the player's previous pick (if any); otherwise they get a random one to change in the lobby. */
  join(rawNickname: unknown, avatar?: AvatarChoice | null): Player {
    if (this.phase === "podium") throw new GameError("This game has finished");
    const player = this.roster.add(rawNickname, avatar ?? randomAvatar(this.rng), (base) => ({ ...base, score: 0, lastDelta: 0, streak: 0, answers: [] }));
    this.refreshBombSquads();
    this.onChange();
    return player;
  }

  byToken(token: unknown): Player | null {
    return this.roster.byToken(token);
  }

  /** Change a player's character/accessory; only while waiting in the lobby. */
  setAvatar(playerId: string, avatar: unknown, accessory: unknown): void {
    const p = this.players.get(playerId);
    if (!p) return;
    if (this.phase !== "lobby") throw new GameError("The game has already started");
    const choice = cleanAvatar(avatar, accessory);
    if (!choice) throw new GameError("Unknown avatar");
    p.avatar = choice;
    this.onChange();
  }

  setConnected(playerId: string, connected: boolean): void {
    const p = this.players.get(playerId);
    if (!p || p.connected === connected) return;
    p.connected = connected;
    this.onChange();
    if (!connected) this.maybeCloseEarly();
  }

  kick(playerId: string): Player | null {
    const p = this.roster.remove(playerId);
    if (!p) return null;
    this.refreshBombSquads();
    this.onChange();
    this.maybeCloseEarly();
    return p;
  }

  answer(playerId: string, qIndex: number, answer: AnswerValue): boolean {
    const p = this.players.get(playerId);
    const q = this.currentQuestion;
    if (!p || !q || this.phase !== "open" || qIndex !== this.qIndex) return false;
    if (p.answers[qIndex]) return false;
    const correct = checkAnswer(q, answer);
    if (correct === null) return false;
    const now = this.clock.now();
    if (now > this.phaseEndsAt + GRACE_MS) return false;
    const ms = Math.max(0, now - this.openedAt);
    const choice = typeof answer === "string" ? { option: -1, text: answer.slice(0, MAX_TYPED_ANSWER) } : { option: answer };
    p.answers[qIndex] = { ...choice, correct, points: scoreAnswer(correct, ms, q.timeLimitSec), ms };
    this.onChange();
    this.maybeCloseEarly();
    return true;
  }

  // ---------- host controls ----------

  start(pacing?: Pacing): void {
    if (this.phase !== "lobby") throw new GameError("The game has already started");
    if (this.questions.length === 0) throw new GameError("This quiz has no questions");
    if (this.players.size === 0) throw new GameError("Wait for at least one player to join");
    if (pacing) this.pacing = pacing;
    this.questions = preparePlayOrder(this.source, this.shuffle, this.rng);
    this.enterIntro(0);
  }

  setShuffle(opts: ShuffleOptions): void {
    if (this.phase !== "lobby") throw new GameError("Shuffle can only be changed before the game starts");
    this.shuffle = { questions: !!opts.questions, answers: !!opts.answers };
    this.onChange();
  }

  setProtect(on: boolean): void {
    if (this.phase !== "lobby") throw new GameError("Protect from abuse can only be changed before the game starts");
    this.protect = !!on;
    this.onChange();
  }

  setMode(mode: GameMode): void {
    if (this.phase !== "lobby") throw new GameError("The game mode can only be changed before the game starts");
    if (mode !== "classic" && mode !== "tower" && mode !== "submarine" && mode !== "fight" && mode !== "robot" && mode !== "land" && mode !== "racer" && mode !== "cup" && mode !== "dragon" && mode !== "bomb" && mode !== "siege" && mode !== "duel") throw new GameError("Unknown game mode");
    this.mode = mode;
    if (mode === "bomb") {
      this.bombSquadsManual = false;
      this.bomb = { ...this.bomb, squads: BombGame.recommendSquads(this.players.size, this.bomb.game) };
    }
    this.onChange();
  }

  setTower(settings: Omit<TowerSettings, "monster"> & { monster?: boolean }): void {
    if (this.phase !== "lobby") throw new GameError("Tower settings can only be changed before the game starts");
    const teams = Math.trunc(Number(settings.teams));
    const minutes = Number(settings.minutes);
    if (!(teams >= 1 && teams <= MAX_TEAMS)) throw new GameError(`Teams must be between 1 and ${MAX_TEAMS}`);
    if (!(TOWER_MINUTES as readonly number[]).includes(minutes)) throw new GameError("Unsupported game length");
    this.tower = { teams, minutes, monster: settings.monster === undefined ? this.tower.monster : !!settings.monster };
    this.onChange();
  }

  setFight(settings: { hill: HillSetting }): void {
    if (this.phase !== "lobby") throw new GameError("Tower Fight settings can only be changed before the game starts");
    if (!HILL_SETTINGS.includes(settings.hill)) throw new GameError("Unknown hill height");
    this.fight = { hill: settings.hill };
    this.onChange();
  }

  setLand(settings: LandSettings): void {
    if (this.phase !== "lobby") throw new GameError("Land Grab settings can only be changed before the game starts");
    const teams = Math.trunc(Number(settings.teams));
    const minutes = Number(settings.minutes);
    if (!(teams >= LAND_MIN_TEAMS && teams <= MAX_TEAMS)) throw new GameError(`Teams must be between ${LAND_MIN_TEAMS} and ${MAX_TEAMS}`);
    if (!(LAND_MINUTES as readonly number[]).includes(minutes)) throw new GameError("Unsupported game length");
    this.land = { teams, minutes };
    this.onChange();
  }

  setCup(settings: CupSettings): void {
    if (this.phase !== "lobby") throw new GameError("Cup of Death settings can only be changed before the game starts");
    const cups = Number(settings.cups);
    if (!(Number.isInteger(cups) && cups >= CUP_MIN_CUPS && cups <= CUP_MAX_CUPS)) throw new GameError(`Cups must be between ${CUP_MIN_CUPS} and ${CUP_MAX_CUPS}`);
    this.cup = { cups };
    this.onChange();
  }

  setDragon(settings: DragonSettings): void {
    if (this.phase !== "lobby") throw new GameError("Dragon's Hoard settings can only be changed before the game starts");
    const teams = Math.trunc(Number(settings.teams));
    const battleMinutes = Number(settings.battleMinutes);
    const fireSec = Number(settings.fireSec);
    const scrambleMinutes = Number(settings.scrambleMinutes);
    if (!(teams >= DRAGON_MIN_TEAMS && teams <= MAX_TEAMS)) throw new GameError(`Teams must be between ${DRAGON_MIN_TEAMS} and ${MAX_TEAMS}`);
    if (!DRAGON_TOUGHNESS.includes(settings.toughness)) throw new GameError("Unknown dragon toughness");
    if (!(DRAGON_BATTLE_MINUTES as readonly number[]).includes(battleMinutes)) throw new GameError("Unsupported battle time");
    if (!(DRAGON_FIRE_SECONDS as readonly number[]).includes(fireSec)) throw new GameError("Unsupported fire breath interval");
    if (!(DRAGON_SCRAMBLE_MINUTES as readonly number[]).includes(scrambleMinutes)) throw new GameError("Unsupported scramble time");
    this.dragon = { teams, toughness: settings.toughness, battleMinutes, fireSec, scrambleMinutes };
    this.onChange();
  }

  setBomb(settings: BombSettings): void {
    if (this.phase !== "lobby") throw new GameError("Bomb Squad settings can only be changed before the game starts");
    if (settings.game !== "together" && settings.game !== "race") throw new GameError("Unknown Bomb Squad game");
    const requested = Math.trunc(Number(settings.squads));
    const modules = Number(settings.modules);
    const wires = Number(settings.wires);
    const minutes = Number(settings.minutes);
    const penaltySec = Number(settings.penaltySec);
    if (!(requested >= 1 && requested <= BOMB_MAX_SQUADS)) throw new GameError(`Squads must be between 1 and ${BOMB_MAX_SQUADS}`);
    if (!(BOMB_MODULES as readonly number[]).includes(modules)) throw new GameError("Unsupported modules per squad");
    if (!(BOMB_WIRES as readonly number[]).includes(wires)) throw new GameError("Unsupported wires per module");
    if (!(BOMB_MINUTES as readonly number[]).includes(minutes)) throw new GameError("Unsupported bomb timer");
    if (!(BOMB_PENALTIES as readonly number[]).includes(penaltySec)) throw new GameError("Unsupported wrong-cut penalty");
    // Only a change to the Squads control itself counts as picking a number: switching to Race
    // raises a single squad to 2 without turning off auto-sizing.
    const touched = requested !== this.bomb.squads;
    const squads = settings.game === "race" && requested < 2 ? 2 : requested;
    this.bomb = { game: settings.game, squads, modules, wires, minutes, penaltySec };
    if (touched) this.bombSquadsManual = true;
    this.refreshBombSquads();
    this.onChange();
  }

  setSiege(settings: SiegeSettings): void {
    if (this.phase !== "lobby") throw new GameError("Kingdom Siege settings can only be changed before the game starts");
    const waves = settings.waves === "endless" ? "endless" : Number(settings.waves);
    if (!(SIEGE_WAVE_CHOICES as readonly unknown[]).includes(waves)) throw new GameError("Unsupported number of waves");
    this.siege = { waves: waves as SiegeWaves };
    this.onChange();
  }

  setDuel(settings: DuelSettings): void {
    if (this.phase !== "lobby") throw new GameError("Showdown settings can only be changed before the game starts");
    const rounds = Number(settings.rounds);
    if (!(DUEL_ROUNDS as readonly number[]).includes(rounds)) throw new GameError("Unsupported number of rounds");
    this.duel = { rounds };
    this.onChange();
  }

  /** Until the host picks a number, use the fewest squads that keep everyone at 6 or under. */
  private refreshBombSquads(): void {
    if (this.bombSquadsManual || this.mode !== "bomb" || this.phase !== "lobby") return;
    const squads = BombGame.recommendSquads(this.players.size, this.bomb.game);
    if (squads !== this.bomb.squads) this.bomb = { ...this.bomb, squads };
  }

  /**
   * Teams in the lobby preview: the Tallest Tower or Land Grab setting, Red vs Blue for Tower Fight,
   * the Dragon's Hoard setting, or Bomb Squad's squads (never more than players); null in solo modes.
   */
  teamCount(): number | null {
    if (this.mode === "bomb") return Math.max(1, Math.min(this.bomb.squads, Math.max(this.players.size, 1)));
    if (this.mode === "dragon") return Math.max(1, Math.min(this.dragon.teams, this.players.size));
    return this.mode === "tower" ? this.tower.teams : this.mode === "land" ? this.land.teams : this.mode === "fight" ? 2 : null;
  }

  /** Team index per player: round-robin by join order until the host moves someone, then the host's arrangement (newcomers join the smallest team). */
  teamAssignment(): Map<string, number> {
    const ids = [...this.players.keys()];
    const count = this.teamCount() ?? 1;
    const manual = this.manualTeams;
    if (!manual) {
      const teams = assignTeams(ids.length, count);
      return new Map(ids.map((id, i) => [id, teams[i]!]));
    }
    // Solo modes have no teams: leave the arrangement alone for when a team mode comes back.
    if (this.teamCount() === null) return new Map(ids.map((id) => [id, 0]));
    for (const id of [...manual.keys()]) if (!this.players.has(id)) manual.delete(id);
    const fits = (id: string) => (manual.get(id) ?? count) < count;
    const sizes = Array<number>(count).fill(0);
    for (const id of ids) if (fits(id)) sizes[manual.get(id)!]!++;
    for (const id of ids) {
      if (fits(id)) continue;
      const team = sizes.indexOf(Math.min(...sizes));
      sizes[team]!++;
      manual.set(id, team);
    }
    return new Map(ids.map((id) => [id, manual.get(id)!]));
  }

  /** Move one player to another team in the lobby; everyone else stays where they are shown. */
  setTeam(playerId: string, team: number): void {
    if (this.phase !== "lobby") throw new GameError("Teams can only be changed before the game starts");
    const count = this.teamCount();
    if (count === null) throw new GameError("This game mode has no teams");
    if (!Number.isInteger(team) || team < 0 || team >= count) throw new GameError("Unknown team");
    if (!this.players.has(playerId)) throw new GameError("Unknown player");
    this.manualTeams ??= this.teamAssignment();
    this.manualTeams.set(playerId, team);
    this.onChange();
  }

  setPacing(pacing: Pacing): void {
    this.pacing = pacing;
    if (this.phase === "reveal" || this.phase === "leaderboard") {
      this.clearTimer();
      this.scheduleAuto();
    }
    this.onChange();
  }

  /** Advance to whatever comes next from the current phase. */
  next(): void {
    switch (this.phase) {
      case "lobby":
        return this.start();
      case "intro":
        return this.openQuestion();
      case "open":
        return this.closeQuestion();
      case "reveal":
        return this.afterReveal();
      case "leaderboard":
        return this.enterIntro(this.qIndex + 1);
      case "podium":
        return;
    }
  }

  skip(): void {
    if (this.phase === "intro") this.openQuestion();
    if (this.phase === "open") this.closeQuestion();
  }

  end(): void {
    if (this.phase === "podium") return;
    if (this.phase === "open") this.closeQuestion();
    this.finish();
  }

  dispose(): void {
    this.clearTimer();
  }

  // ---------- state machine ----------

  private enterIntro(index: number): void {
    this.clearTimer();
    this.phase = "intro";
    this.qIndex = index;
    this.phaseEndsAt = this.clock.now() + INTRO_MS;
    this.timer = this.clock.setTimeout(() => this.openQuestion(), INTRO_MS);
    this.onChange();
  }

  private openQuestion(): void {
    const q = this.currentQuestion;
    if (this.phase !== "intro" || !q) return;
    this.clearTimer();
    this.phase = "open";
    this.openedAt = this.clock.now();
    this.phaseEndsAt = this.openedAt + q.timeLimitSec * 1000;
    this.timer = this.clock.setTimeout(() => this.closeQuestion(), q.timeLimitSec * 1000 + GRACE_MS);
    this.onChange();
  }

  private maybeCloseEarly(): void {
    if (this.phase !== "open") return;
    const connected = [...this.players.values()].filter((p) => p.connected);
    if (connected.length > 0 && connected.every((p) => p.answers[this.qIndex])) this.closeQuestion();
  }

  private closeQuestion(): void {
    if (this.phase !== "open") return;
    this.clearTimer();
    for (const p of this.players.values()) {
      const ans = p.answers[this.qIndex];
      p.score += ans?.points ?? 0;
      p.lastDelta = ans?.points ?? 0;
      p.streak = ans?.correct ? p.streak + 1 : 0;
    }
    this.phase = "reveal";
    this.phaseEndsAt = 0;
    this.scheduleAuto();
    this.onChange();
  }

  private afterReveal(): void {
    this.clearTimer();
    if (this.qIndex >= this.questions.length - 1) return this.finish();
    this.phase = "leaderboard";
    this.scheduleAuto();
    this.onChange();
  }

  private finish(): void {
    this.clearTimer();
    this.phase = "podium";
    this.phaseEndsAt = 0;
    this.onFinish(this);
    this.onChange();
  }

  private scheduleAuto(): void {
    if (this.pacing !== "auto") return;
    if (this.phase === "reveal") this.timer = this.clock.setTimeout(() => this.afterReveal(), AUTO_REVEAL_MS);
    else if (this.phase === "leaderboard") this.timer = this.clock.setTimeout(() => this.enterIntro(this.qIndex + 1), AUTO_LEADERBOARD_MS);
  }

  private clearTimer(): void {
    if (this.timer !== null) this.clock.clearTimeout(this.timer);
    this.timer = null;
  }

  // ---------- views ----------

  ranked(): (Player & { rank: number })[] {
    return rankScores([...this.players.values()]);
  }

  /** Per option, who picked it on the current question (fastest first). */
  private answerAvatars(optionCount: number): HostGameState["answerAvatars"] {
    const picks = [...this.players.values()]
      .map((p) => ({ p, a: p.answers[this.qIndex] }))
      .filter((x): x is { p: Player; a: Answer } => !!x.a)
      .sort((x, y) => x.a.ms - y.a.ms);
    return Array.from({ length: optionCount }, (_, i) => picks.filter((x) => x.a.option === i).map((x) => x.p.avatar));
  }

  leaderboard(limit = LEADERBOARD_SIZE): RankedEntry[] {
    return this.ranked()
      .slice(0, limit)
      .map((p) => ({ id: p.id, nickname: p.nickname, avatar: p.avatar, score: p.score, rank: p.rank, delta: p.lastDelta, streak: p.streak }));
  }

  /** The most-missed questions: wrong answers only, a question left unanswered doesn't count. */
  errors(): QuestionError[] {
    const wrong = this.questions.map((_, i) => [...this.players.values()].filter((p) => p.answers[i] && !p.answers[i]!.correct).length);
    return topErrors(this.questions, wrong);
  }

  private questionView(): QuestionView | null {
    const q = this.currentQuestion;
    if (!q || this.phase === "lobby" || this.phase === "podium") return null;
    return {
      index: this.qIndex,
      total: this.questions.length,
      type: q.type,
      text: q.text,
      ...(q.image ? { image: q.image } : {}),
      timeLimitSec: q.timeLimitSec,
      // A typed question's accepted answers stay hidden until the reveal.
      options: this.phase === "intro" || (q.type === "text" && !this.revealed) ? [] : q.options,
      ...(q.spots && this.phase !== "intro" ? { spots: q.spots } : {}),
      remainingMs: this.phaseEndsAt ? Math.max(0, this.phaseEndsAt - this.clock.now()) : 0,
    };
  }

  private get revealed(): boolean {
    return this.phase === "reveal" || this.phase === "leaderboard";
  }

  hostView(): HostGameState {
    const q = this.currentQuestion;
    const answered = [...this.players.values()].map((p) => p.answers[this.qIndex]).filter((a): a is Answer => !!a);
    const hostPlayer = (p: Player) => ({ id: p.id, nickname: p.nickname, avatar: p.avatar, score: p.score, connected: p.connected });
    let teams: HostGameState["teams"] = null;
    const teamCount = this.teamCount();
    if (this.phase === "lobby" && teamCount !== null) {
      const preview = this.teamAssignment();
      teams = Array.from({ length: teamCount }, (_, i) => ({
        ...teamInfo(i),
        members: [...this.players.values()].filter((p) => preview.get(p.id) === i).map(hostPlayer),
      }));
    }
    return {
      kind: "classic",
      phase: this.phase,
      mode: this.mode,
      tower: this.tower,
      fight: this.fight,
      land: this.land,
      cup: this.cup,
      dragon: this.dragon,
      bomb: this.bomb,
      siege: this.siege,
      duel: this.duel,
      teams,
      quiz: { id: this.quizId, title: this.title, questionCount: this.questions.length },
      pacing: this.pacing,
      shuffle: this.shuffle,
      protect: this.protect,
      players: [...this.players.values()].map(hostPlayer),
      question: this.questionView(),
      correct: this.revealed && q ? q.correct : null,
      answeredCount: this.phase === "lobby" ? 0 : answered.length,
      answerCounts: this.revealed && q ? q.options.map((_, i) => answered.filter((a) => a.option === i).length) : null,
      answerAvatars: this.revealed && q ? this.answerAvatars(q.options.length) : null,
      leaderboard: this.phase === "lobby" ? [] : this.leaderboard(),
      errors: this.phase === "podium" ? this.errors() : null,
      hasResults: this.phase === "podium",
    };
  }

  playerView(playerId: string): PlayerView {
    const p = this.players.get(playerId);
    if (!p) return { kind: "none", game: { title: this.title, phase: this.phase } };
    const q = this.currentQuestion;
    const me = this.ranked().find((r) => r.id === p.id)!;
    const ans = this.qIndex >= 0 ? p.answers[this.qIndex] : undefined;
    return {
      kind: "player",
      phase: this.phase,
      title: this.title,
      me: { id: p.id, nickname: p.nickname, avatar: p.avatar, score: p.score, rank: me.rank, streak: p.streak },
      playerCount: this.players.size,
      question: this.questionView(),
      myChoice: this.phase === "open" || this.revealed ? (ans && ans.option >= 0 ? ans.option : null) : null,
      myText: this.phase === "open" || this.revealed ? (ans?.text ?? null) : null,
      result:
        this.revealed && q
          ? { choice: ans && ans.option >= 0 ? ans.option : null, correct: q.correct, wasCorrect: !!ans?.correct, points: ans?.points ?? 0 }
          : null,
      podium: this.phase === "podium" ? this.leaderboard(5) : null,
      team: this.phase === "lobby" && this.teamCount() !== null ? teamInfo(this.teamAssignment().get(p.id) ?? 0) : null,
      ...(this.phase === "lobby" && this.mode === "siege" ? { siege: true as const } : {}),
    };
  }
}

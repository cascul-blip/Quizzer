import { DEFAULT_DUEL_THEME, duelTheme } from "../../shared/duel-theme.ts";
import { DEFAULT_LAND_THEME, landTheme } from "../../shared/land-theme.ts";
import { DEFAULT_SIEGE_THEME, siegeTheme } from "../../shared/siege-theme.ts";
import { DEFAULT_RACER_THEME, racerTheme } from "../../shared/racer-theme.ts";
import { DEFAULT_CUP_THEME, cupTheme } from "../../shared/cup-theme.ts";
import { DEFAULT_TOWER_THEME, towerTheme } from "../../shared/tower-theme.ts";
import { DEFAULT_FIGHT_THEME, fightTheme } from "../../shared/fight-theme.ts";
import { isSeasonTheme, type SeasonTheme } from "../../shared/season-theme.ts";
import {
  CUP_DEFAULT_CUPS,
  CUP_MAX_CUPS,
  CUP_MIN_CUPS,
  DUEL_DEFAULT_ROUNDS,
  DUEL_ROUNDS,
  HILL_SETTINGS,
  LAND_MINUTES,
  LAND_MIN_TEAMS,
  MAX_TEAMS,
  TOWER_MINUTES,
  type GameMode,
  type CupSettings,
  type DuelSettings,
  type FightSettings,
  type GiftSettings,
  type LandSettings,
  type RacerSettings,
  type SiegeSettings,
  type TowerSettings,
  type HostGameState,
  type ModeSettingsMap,
  type Pacing,
  type Phase,
  type PlayerView,
  type QuestionError,
  type QuestionView,
  type RankedEntry,
  type ShuffleOptions,
} from "../../shared/protocol.ts";
import { SIEGE_WAVE_CHOICES, type SiegeWaves } from "../../shared/siege-rules.ts";
import { GIFT_DEFAULT_MINUTES, GIFT_MINUTES } from "../../shared/gift-rules.ts";
import { cleanAvatar, randomAvatar, type AvatarChoice } from "../../shared/avatars.ts";
import { MAX_TYPED_ANSWER, checkAnswer, type AnswerValue } from "../../shared/answer-match.ts";
import type { Question, Quiz } from "../../shared/quiz-schema.ts";
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

/** A lobby setter's theme: kept as it is when not given, refused when it isn't a known look. */
function pickTheme(value: unknown, current: SeasonTheme, mode: string): SeasonTheme {
  if (value === undefined) return current;
  if (!isSeasonTheme(value)) throw new GameError(`Unknown ${mode} theme`);
  return value;
}

/** Raw mode settings from the host, read by the mode's readSettings. */
type RawSettings = Readonly<Record<string, unknown>>;

interface ModeSettingsRules<M extends GameMode> {
  /** Names the mode in "… settings can only be changed before the game starts". */
  label: string;
  defaultSettings: ModeSettingsMap[M];
  /** The host's change applied to the current settings; throws GameError when it isn't valid. */
  readSettings(raw: RawSettings, current: ModeSettingsMap[M]): ModeSettingsMap[M];
}

const noSettings = <M extends GameMode>(label: string): ModeSettingsRules<M> => ({ label, defaultSettings: {} as ModeSettingsMap[M], readSettings: () => ({}) as ModeSettingsMap[M] });

const MODE_SETTINGS: { [M in GameMode]: ModeSettingsRules<M> } = {
  classic: noSettings("Classic"),
  submarine: noSettings("Sled Squad"),
  robot: noSettings("Robot Attack"),
  racer: {
    label: "Racer",
    defaultSettings: { theme: DEFAULT_RACER_THEME },
    readSettings: (raw, current) => ({ theme: pickTheme(raw.theme, racerTheme(current.theme), "racer") }),
  },
  tower: {
    label: "Tower",
    defaultSettings: { teams: 2, minutes: 5, monster: true, theme: DEFAULT_TOWER_THEME },
    readSettings(raw, current) {
      const teams = Math.trunc(Number(raw.teams));
      const minutes = Number(raw.minutes);
      if (!(teams >= 1 && teams <= MAX_TEAMS)) throw new GameError(`Teams must be between 1 and ${MAX_TEAMS}`);
      if (!(TOWER_MINUTES as readonly number[]).includes(minutes)) throw new GameError("Unsupported game length");
      const theme = pickTheme(raw.theme, towerTheme(current.theme), "tower");
      return { teams, minutes, monster: raw.monster === undefined ? current.monster : !!raw.monster, theme };
    },
  },
  fight: {
    label: "Tower Fight",
    defaultSettings: { hill: "random", theme: DEFAULT_FIGHT_THEME },
    readSettings(raw, current) {
      const hill = raw.hill as FightSettings["hill"] | undefined;
      if (hill !== undefined && !HILL_SETTINGS.includes(hill)) throw new GameError("Unknown hill height");
      const theme = pickTheme(raw.theme, fightTheme(current.theme), "fight");
      return { ...current, hill: hill ?? current.hill, theme };
    },
  },
  land: {
    label: "Land Grab",
    defaultSettings: { teams: 2, minutes: 5, theme: DEFAULT_LAND_THEME },
    readSettings(raw, current) {
      const teams = Math.trunc(Number(raw.teams));
      const minutes = Number(raw.minutes);
      if (!(teams >= LAND_MIN_TEAMS && teams <= MAX_TEAMS)) throw new GameError(`Teams must be between ${LAND_MIN_TEAMS} and ${MAX_TEAMS}`);
      if (!(LAND_MINUTES as readonly number[]).includes(minutes)) throw new GameError("Unsupported game length");
      return { teams, minutes, theme: pickTheme(raw.theme, landTheme(current.theme), "Land Grab") };
    },
  },
  cup: {
    label: "Cup of Death",
    defaultSettings: { cups: CUP_DEFAULT_CUPS, theme: DEFAULT_CUP_THEME },
    readSettings(raw, current) {
      const cups = Number(raw.cups);
      if (!(Number.isInteger(cups) && cups >= CUP_MIN_CUPS && cups <= CUP_MAX_CUPS)) throw new GameError(`Cups must be between ${CUP_MIN_CUPS} and ${CUP_MAX_CUPS}`);
      return { cups, theme: pickTheme(raw.theme, cupTheme(current.theme), "cup") };
    },
  },
  siege: {
    label: "Kingdom Siege",
    defaultSettings: { waves: 5, theme: DEFAULT_SIEGE_THEME },
    readSettings(raw, current) {
      const waves = raw.waves === "endless" ? "endless" : Number(raw.waves);
      if (!(SIEGE_WAVE_CHOICES as readonly unknown[]).includes(waves)) throw new GameError("Unsupported number of waves");
      return { waves: waves as SiegeWaves, theme: pickTheme(raw.theme, siegeTheme(current.theme), "Kingdom Siege") };
    },
  },
  duel: {
    label: "Showdown",
    defaultSettings: { rounds: DUEL_DEFAULT_ROUNDS, theme: DEFAULT_DUEL_THEME },
    readSettings(raw, current) {
      const rounds = Number(raw.rounds);
      if (!(DUEL_ROUNDS as readonly number[]).includes(rounds)) throw new GameError("Unsupported number of rounds");
      return { rounds, theme: pickTheme(raw.theme, duelTheme(current.theme), "Showdown") };
    },
  },
  gift: {
    label: "Gift Grab",
    defaultSettings: { minutes: GIFT_DEFAULT_MINUTES },
    readSettings(raw) {
      const minutes = Number(raw.minutes);
      if (!(GIFT_MINUTES as readonly number[]).includes(minutes)) throw new GameError("Unsupported game length");
      return { minutes };
    },
  },
};

/** Every mode's settings: the given ones where there are any (carried over, so already valid), else the defaults. */
function initialSettings(given: InitialSettings = {}): ModeSettingsMap {
  const read = <M extends GameMode>(mode: M): ModeSettingsMap[M] => {
    const rules: ModeSettingsRules<M> = MODE_SETTINGS[mode];
    return rules.readSettings({ ...rules.defaultSettings, ...given[mode] }, rules.defaultSettings);
  };
  return {
    classic: read("classic"),
    tower: read("tower"),
    submarine: read("submarine"),
    fight: read("fight"),
    robot: read("robot"),
    land: read("land"),
    racer: read("racer"),
    cup: read("cup"),
    siege: read("siege"),
    duel: read("duel"),
    gift: read("gift"),
  };
}

type InitialSettings = { [M in GameMode]?: Partial<ModeSettingsMap[M]> };

interface GameOptions {
  clock?: Clock;
  rng?: () => number;
  pacing?: Pacing;
  onChange?: () => void;
  /** A player answered: the hub updates that phone at once and everyone else a moment later. Defaults to onChange. */
  onActivity?: (playerId: string) => void;
  onFinish?: (game: Game) => void;
  /** Initial lobby choices (e.g. carried over from the previous game). */
  mode?: GameMode;
  settings?: InitialSettings;
  protect?: boolean;
}

/**
 * A Classic game: lobby → (intro → open → reveal → leaderboard)* → podium.
 * It also serves as the lobby for every mode; in the other modes the hub
 * hands its players to that mode's game (TowerGame, SubGame, FightGame, RobotGame, LandGame, RacerGame, CupGame, SiegeGame, DuelGame, GiftGame) on start.
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
  /** "Protect from abuse": Tallest Tower, Submarine Squad, Tower Fight, Robot Attack, Cup of Death, Kingdom Siege and Gift Grab slow down players who keep answering wrong. */
  protect: boolean;
  mode: GameMode;
  /** The lobby's mode settings for every game mode, so switching modes keeps each one's choices. */
  settings: ModeSettingsMap;
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
  private readonly onChange: () => void;
  private readonly onActivity: (playerId: string) => void;
  private readonly onFinish: (game: Game) => void;
  /** Set while views are built in a batch: what every phone's view shares, computed once. */
  private batch: { ranked?: (Player & { rank: number })[]; rankById?: Map<string, number>; podium?: RankedEntry[]; teams?: Map<string, number> } | null = null;

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
    this.onActivity = opts.onActivity ?? (() => this.onChange());
    this.onFinish = opts.onFinish ?? (() => {});
    this.mode = opts.mode ?? "classic";
    // Carried-over settings may predate a mode's themes: every theme starts as a real one.
    this.settings = initialSettings(opts.settings);
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
    this.onActivity(playerId);
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
    if (!Object.hasOwn(MODE_SETTINGS, mode)) throw new GameError("Unknown game mode");
    this.mode = mode;
    this.onChange();
  }

  /** Change one mode's settings in the lobby; a partial change keeps the rest (and the theme) as they are. */
  setModeSettings(mode: GameMode, raw: unknown): void {
    if (!Object.hasOwn(MODE_SETTINGS, mode)) throw new GameError("Unknown game mode");
    this.applySettings(mode, raw && typeof raw === "object" ? (raw as RawSettings) : {});
  }

  private applySettings<M extends GameMode>(mode: M, raw: RawSettings): void {
    const rules: ModeSettingsRules<M> = MODE_SETTINGS[mode];
    if (this.phase !== "lobby") throw new GameError(`${rules.label} settings can only be changed before the game starts`);
    this.settings[mode] = rules.readSettings(raw, this.settings[mode]);
    this.onChange();
  }

  /**
   * Teams in the lobby preview: the Tallest Tower or Land Grab setting, or Red vs Blue for Tower Fight;
   * null in solo modes.
   */
  teamCount(): number | null {
    return this.mode === "tower" ? this.settings.tower.teams : this.mode === "land" ? this.settings.land.teams : this.mode === "fight" ? 2 : null;
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
    else if (this.phase === "open") this.closeQuestion();
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
    return this.rankedNow()
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
      settings: this.settings,
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
    };
  }

  /**
   * Build many views in one go (a broadcast). Nothing changes in between, so the ranking,
   * the podium and the team map are worked out once instead of once per phone.
   */
  viewBatch<T>(build: () => T): T {
    if (this.batch) return build();
    this.batch = {};
    try {
      return build();
    } finally {
      this.batch = null;
    }
  }

  /** ranked(), shared by every view in a batch. */
  private rankedNow(): (Player & { rank: number })[] {
    return this.batch ? (this.batch.ranked ??= this.ranked()) : this.ranked();
  }

  private rankOf(playerId: string): number {
    if (!this.batch) return this.ranked().find((r) => r.id === playerId)!.rank;
    this.batch.rankById ??= new Map(this.rankedNow().map((r) => [r.id, r.rank]));
    return this.batch.rankById.get(playerId)!;
  }

  playerView(playerId: string): PlayerView {
    const p = this.players.get(playerId);
    if (!p) return { kind: "none", game: { title: this.title, phase: this.phase } };
    const q = this.currentQuestion;
    const ans = this.qIndex >= 0 ? p.answers[this.qIndex] : undefined;
    return {
      kind: "player",
      phase: this.phase,
      title: this.title,
      me: { id: p.id, nickname: p.nickname, avatar: p.avatar, score: p.score, rank: this.rankOf(p.id), streak: p.streak },
      playerCount: this.players.size,
      question: this.questionView(),
      myChoice: this.phase === "open" || this.revealed ? (ans && ans.option >= 0 ? ans.option : null) : null,
      myText: this.phase === "open" || this.revealed ? (ans?.text ?? null) : null,
      result:
        this.revealed && q
          ? { choice: ans && ans.option >= 0 ? ans.option : null, correct: q.correct, wasCorrect: !!ans?.correct, points: ans?.points ?? 0 }
          : null,
      podium: this.phase === "podium" ? (this.batch ? (this.batch.podium ??= this.leaderboard(5)) : this.leaderboard(5)) : null,
      team: this.phase === "lobby" && this.teamCount() !== null ? teamInfo((this.batch ? (this.batch.teams ??= this.teamAssignment()) : this.teamAssignment()).get(p.id) ?? 0) : null,
      ...(this.phase === "lobby" && this.mode === "siege" ? { siege: true as const } : {}),
    };
  }
}

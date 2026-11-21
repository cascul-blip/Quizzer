import { siegeDefenderPhrase, siegeTheme, siegeWords, DEFAULT_SIEGE_THEME } from "../../shared/siege-theme.ts";
import type { AnswerValue } from "../../shared/answer-match.ts";
import {
  type HostSiegeState,
  type PlayerSiegeView,
  type SiegeAwards,
  type SiegeEvent,
  type SiegePhase,
  type SiegeRecord,
  type SiegeResult,
  type SiegeSettings,
} from "../../shared/protocol.ts";
import {
  SIEGE_BREAK_MS,
  SIEGE_COUNTDOWN_MS,
  SIEGE_DEFENDERS,
  SIEGE_ENDING_MS,
  SIEGE_EVENTS_SHOWN,
  SIEGE_GOLD_PER_CORRECT,
  SIEGE_HEARTS,
  SIEGE_OPENING_MS,
  SIEGE_START_GOLD,
  SIEGE_TICK_MS,
  siegeNextScale,
  siegeUpgradeCost,
  siegeWaveBudget,
  siegeWaveStrength,
  siegeGiantPace,
  type SiegeDefenderType,
  SIEGE_WAVE_CHOICES,
  type SiegeWaves,
} from "../../shared/siege-rules.ts";
import { randomAvatar, type AvatarChoice } from "../../shared/avatars.ts";
import type { Question, Quiz } from "../../shared/quiz-schema.ts";
import { GameError, realClock, type Clock } from "./common.ts";
import type { LobbyFacts } from "./lobby-facts.ts";
import { Roster, type BasePlayer } from "./roster.ts";
import { QuestionStream, type AnswerTotals } from "./stream.ts";
import { loadSiegeRecord, saveSiegeRecord } from "../siege-records.ts";
import { answerOf } from "../../shared/answer-match.ts";
import { MODE_NAMES } from "../../shared/mode-names.ts";
import { handoffOptions, pickTheme, unhandled, type ModeEntry } from "./mode-entry.ts";
import { toCsv } from "./results.ts";
import { SiegeBattlefield } from "./siege-battlefield.ts";

export type { SiegeMonster } from "./siege-battlefield.ts";

export { FEEDBACK_MS } from "./stream.ts";

/** The message a phone shows when the player's purse can't pay. */
export const SIEGE_NO_GOLD = "Not enough gold.";

export interface SiegePlayer extends BasePlayer, AnswerTotals {
  /** This player's own purse: only they earn it and only they can spend it. */
  gold: number;
  goldEarned: number;
  goldSpent: number;
  placed: Record<SiegeDefenderType, number>;
  upgrades: number;
  archerUpgrades: number;
  wallUpgrades: number;
  /** Monsters defeated by the defenders this player placed. */
  defeated: number;
  archerKills: number;
  lastPlaced: SiegeDefenderType | null;
  mapOpen: boolean;
}

interface SiegeWaveLog {
  wave: number;
  /** Difficulty scale in %. */
  scale: number;
  /** The board's worth in gold when the wave began (defenders by health left, plus unspent gold). */
  defense: number;
  /** How much stronger than usual a strong board made this wave (1 = not at all). */
  boost: number;
  /** The usual budget, raised by the boost. */
  budget: number;
  /** Monster health multiplier for a strong board (1 = none). */
  toughness: number;
  sent: number;
  /** Answers given from the wave's start to the next wave's start (or the end of the game). */
  correct: number;
  answered: number;
  heartsLost: number;
}

interface SiegeOptions {
  clock?: Clock;
  rng?: () => number;
  /** The class's best Endless run on this quiz so far. */
  record?: SiegeRecord | null;
  onChange?: () => void;
  onActivity?: (playerId: string) => void;
  /** A battle tick changed only what the projector shows (shots, monsters, defender hits). Defaults to onChange. */
  onTick?: () => void;
  onFinish?: (game: SiegeGame) => void;
}

interface SiegeGameSettings extends SiegeSettings {
  shuffleAnswers: boolean;
  /** Longer waits for wrong answers in a row (the lobby's "Protect from abuse"). */
  protect?: boolean;
}


/**
 * Kingdom Siege: the whole class defends one castle wall against waves of monsters marching
 * down 5 lanes. Each player earns gold with correct answers and spends their own purse on defenders.
 * The battle runs in fixed SIEGE_TICK_MS steps on the game clock.
 */
export class SiegeGame {
  readonly runningMode = "siege" as const;
  readonly quizId: string;
  readonly title: string;
  readonly questions: Question[];
  readonly settings: SiegeGameSettings;
  readonly roster = new Roster<SiegePlayer>();
  /** Kicked players: their stats stay in the results. */
  readonly kicked: SiegePlayer[] = [];
  phase: SiegePhase = "countdown";
  phaseEndsAt = 0;
  phaseDurationMs = SIEGE_COUNTDOWN_MS;

  /** The wave being fought, or the next one during a build break. */
  wave = 0;
  /** Difficulty scale for the current wave, in %. */
  scale = 100;
  outcome: SiegeResult["outcome"] | null = null;
  readonly waveLog: SiegeWaveLog[] = [];
  events: SiegeEvent[] = [];
  /** The lanes, defenders, monsters and hearts. */
  readonly battlefield: SiegeBattlefield<SiegePlayer>;
  readonly previousRecord: SiegeRecord | null;

  private periodCorrect = 0;
  private periodAnswered = 0;
  private seq = 0;
  private finishedResult: SiegeResult | null = null;

  private readonly clock: Clock;
  private readonly rng: () => number;
  private readonly stream: QuestionStream;
  private timer: unknown = null;
  private tickTimer: unknown = null;
  private readonly onChange: () => void;
  private readonly onActivity: (playerId: string) => void;
  private readonly onTick: () => void;
  private readonly onFinish: (game: SiegeGame) => void;

  private defenderName(type: SiegeDefenderType): string {
    return siegeDefenderPhrase(type, this.settings.theme);
  }

  constructor(quiz: Quiz, settings: SiegeGameSettings, opts: SiegeOptions = {}) {
    if (quiz.questions.length === 0) throw new GameError("This quiz has no questions");
    this.quizId = quiz.id;
    this.title = quiz.title;
    this.questions = quiz.questions;
    this.settings = settings;
    this.clock = opts.clock ?? realClock;
    this.rng = opts.rng ?? Math.random;
    this.previousRecord = opts.record ?? null;
    this.stream = new QuestionStream(quiz.questions, settings.shuffleAnswers, this.rng, this.clock, settings.protect);
    this.onChange = opts.onChange ?? (() => {});
    this.onActivity = opts.onActivity ?? (() => this.onChange());
    this.onTick = opts.onTick ?? (() => this.onChange());
    this.onFinish = opts.onFinish ?? (() => {});
    this.battlefield = new SiegeBattlefield<SiegePlayer>({
      clock: this.clock,
      rng: this.rng,
      endless: settings.waves === "endless",
      wave: () => this.wave,
      classSize: () => this.connectedCount(),
      onDefeat: (owner, by) => {
        owner.defeated++;
        if (by === "archer") owner.archerKills++;
      },
    });
  }

  get hearts(): number {
    return this.battlefield.hearts;
  }

  /** Take over a lobby's players (same ids and tokens). */
  static fromLobby(lobby: LobbyFacts<"siege">, opts: SiegeOptions = {}): SiegeGame {
    const game = new SiegeGame(lobby.quiz, { ...lobby.settings, shuffleAnswers: lobby.shuffle.answers, protect: lobby.protect }, opts);
    game.roster.adoptFrom(lobby.players, (base) => game.newPlayer(base));
    return game;
  }

  get players(): Map<string, SiegePlayer> {
    return this.roster.players;
  }

  /** Everyone who played, kicked players included. */
  get everyone(): SiegePlayer[] {
    return [...this.players.values(), ...this.kicked];
  }

  get endless(): boolean {
    return this.settings.waves === "endless";
  }

  private newPlayer(base: BasePlayer): SiegePlayer {
    return this.stream.registerPlayer({
      ...base,
      gold: SIEGE_START_GOLD,
      goldEarned: 0,
      goldSpent: 0,
      placed: { archer: 0, knight: 0, wall: 0 },
      upgrades: 0,
      archerUpgrades: 0,
      wallUpgrades: 0,
      defeated: 0,
      archerKills: 0,
      lastPlaced: null,
      mapOpen: false,
    });
  }

  private get playing(): boolean {
    return this.phase === "build" || this.phase === "wave";
  }

  private connectedCount(): number {
    return [...this.players.values()].filter((p) => p.connected).length;
  }

  // ---------- lifecycle ----------

  start(): void {
    if (this.players.size === 0) throw new GameError("Wait for at least one player to join");
    this.setPhase("countdown", SIEGE_COUNTDOWN_MS, () => this.beginOpening());
    this.onChange();
  }

  private setPhase(phase: SiegePhase, ms: number, then: () => void): void {
    if (this.timer !== null) this.clock.clearTimeout(this.timer);
    this.phase = phase;
    this.phaseDurationMs = ms;
    this.phaseEndsAt = this.clock.now() + ms;
    this.timer = this.clock.setTimeout(() => {
      this.timer = null;
      then();
    }, ms);
  }

  /** The opening build break: questions start and the class places its first defenders. */
  private beginOpening(): void {
    this.wave = 1;
    for (const p of this.players.values()) this.stream.open(p);
    this.setPhase("build", SIEGE_OPENING_MS, () => this.beginWave(1));
    this.scheduleTick();
    this.onChange();
  }

  private beginWave(wave: number): void {
    // The wave just gone (and the break after it) sets this wave's difficulty.
    this.recordBattle();
    const prev = this.waveLog[this.waveLog.length - 1];
    if (prev) {
      prev.correct = this.periodCorrect;
      prev.answered = this.periodAnswered;
      this.scale = siegeNextScale(this.scale, this.periodCorrect, this.periodAnswered);
    }
    this.periodCorrect = 0;
    this.periodAnswered = 0;
    this.wave = wave;
    const defense = Math.round(this.defenseGold());
    // A board stronger than par makes the wave stronger; the boost only climbs after a wave that cost no hearts.
    const { boost, budget, toughness } = siegeWaveStrength(siegeWaveBudget(wave, this.connectedCount(), this.scale), defense, prev?.boost ?? 1, !prev || prev.heartsLost === 0);
    this.battlefield.beginWave({ wave, budget, toughness, giantPace: siegeGiantPace(boost) });
    this.waveLog.push({ wave, scale: this.scale, defense, boost, budget, toughness, sent: 0, correct: 0, answered: 0, heartsLost: 0 });
    if (this.timer !== null) this.clock.clearTimeout(this.timer);
    this.timer = null;
    this.phase = "wave";
    this.phaseEndsAt = 0;
    this.phaseDurationMs = 0;
    this.onChange();
  }

  /** What the board is worth: the defenders (by health left) plus the gold the players haven't spent yet. */
  defenseGold(): number {
    return this.battlefield.boardGold() + [...this.players.values()].reduce((sum, p) => sum + p.gold, 0);
  }

  private scheduleTick(): void {
    if (this.tickTimer !== null) this.clock.clearTimeout(this.tickTimer);
    this.tickTimer = this.clock.setTimeout(() => {
      this.tickTimer = null;
      this.tick();
    }, SIEGE_TICK_MS);
  }

  // ---------- the battle ----------

  private tick(): void {
    if (!this.playing) return;
    const { changed, phones, map } = this.battlefield.tick(this.clock.now());
    this.recordBattle();
    if (this.hearts <= 0) return this.fall();
    if (this.phase === "wave" && this.battlefield.waveCleared) return this.endWave();
    this.scheduleTick();
    // Shots, monster moves and defender hits are only on the projector: don't rebuild every phone's view for them.
    if (phones || (map && [...this.players.values()].some((p) => p.mapOpen))) this.onChange();
    else if (changed) this.onTick();
  }

  /** Copy the wave's monsters sent and hearts lost into its log. */
  private recordBattle(): void {
    const log = this.waveLog[this.waveLog.length - 1];
    if (!log) return;
    log.sent = this.battlefield.sent;
    log.heartsLost = this.battlefield.heartsLost;
  }

  private endWave(): void {
    if (this.settings.waves !== "endless" && this.wave >= this.settings.waves) return this.stand();
    this.battlefield.endWave();
    const next = this.wave + 1;
    this.wave = next;
    this.setPhase("build", SIEGE_BREAK_MS, () => this.beginWave(next));
    this.scheduleTick();
    this.onChange();
  }

  // ---------- building ----------

  /** Place a defender, paid from the player's own purse. Returns null, or why it couldn't be placed. */
  place(playerId: string, type: unknown, lane: unknown, square: unknown): string | null {
    const p = this.players.get(playerId);
    if (!p) return "You're not in this game.";
    if (!this.playing) return "You can't build right now.";
    const err = this.battlefield.placementError(type, lane, square);
    if (err) return err;
    const t = type as SiegeDefenderType;
    const cost = SIEGE_DEFENDERS[t].cost[0];
    if (p.gold < cost) return SIEGE_NO_GOLD;
    p.gold -= cost;
    p.goldSpent += cost;
    p.placed[t]++;
    p.lastPlaced = t;
    this.battlefield.place(t, Number(lane), Number(square), p);
    this.addEvent(p, `placed ${this.defenderName(t)}`);
    this.onChange();
    return null;
  }

  /** Upgrade the defender on a square one level. The extra health is added to what it has left. */
  upgrade(playerId: string, lane: unknown, square: unknown): string | null {
    const p = this.players.get(playerId);
    if (!p) return "You're not in this game.";
    if (!this.playing) return "You can't build right now.";
    const d = this.battlefield.defenderAt(Number(lane), Number(square));
    if (!d) return "That defender is gone.";
    const cost = siegeUpgradeCost(d.type, d.level);
    if (cost === null) return "Already at max level.";
    if (p.gold < cost) return SIEGE_NO_GOLD;
    p.gold -= cost;
    p.goldSpent += cost;
    p.upgrades++;
    if (d.type === "archer") p.archerUpgrades++;
    if (d.type === "wall") p.wallUpgrades++;
    this.battlefield.upgrade(d);
    this.addEvent(p, `upgraded ${this.defenderName(d.type)} to Lv ${d.level}`);
    this.onChange();
    return null;
  }

  /** The phone's lane map opened or closed. */
  setMap(playerId: string, open: boolean): void {
    const p = this.players.get(playerId);
    if (!p || p.mapOpen === open) return;
    p.mapOpen = open && this.playing;
    this.onActivity(p.id);
  }

  private addEvent(p: SiegePlayer, text: string): void {
    this.events.push({ seq: ++this.seq, nickname: p.nickname, text });
    if (this.events.length > SIEGE_EVENTS_SHOWN) this.events.splice(0, this.events.length - SIEGE_EVENTS_SHOWN);
  }

  // ---------- the end ----------

  private stand(): void {
    this.closePeriod();
    this.outcome = "stands";
    this.stopBattle();
    this.setPhase("stands", SIEGE_ENDING_MS, () => this.finish());
    this.onChange();
  }

  private fall(): void {
    this.closePeriod();
    this.outcome = "fallen";
    this.stopBattle();
    this.setPhase("fallen", SIEGE_ENDING_MS, () => this.finish());
    this.onChange();
  }

  /** Host ends the game now: straight to the podium, without a cinematic. */
  end(): void {
    if (this.phase === "podium") return;
    if (!this.outcome) {
      this.closePeriod();
      this.outcome = "ended";
    }
    this.finish();
  }

  private closePeriod(): void {
    this.recordBattle();
    const log = this.waveLog[this.waveLog.length - 1];
    if (log && this.outcome === null) {
      log.correct = this.periodCorrect;
      log.answered = this.periodAnswered;
    }
  }

  private stopBattle(): void {
    if (this.tickTimer !== null) this.clock.clearTimeout(this.tickTimer);
    this.tickTimer = null;
    this.battlefield.stop();
    for (const p of this.players.values()) p.mapOpen = false;
  }

  private finish(): void {
    if (this.phase === "podium") return;
    this.stopBattle();
    if (this.timer !== null) this.clock.clearTimeout(this.timer);
    this.timer = null;
    this.phase = "podium";
    this.phaseEndsAt = 0;
    this.phaseDurationMs = 0;
    this.finishedResult = this.computeResult();
    this.onFinish(this);
    this.onChange();
  }

  dispose(): void {
    if (this.timer !== null) this.clock.clearTimeout(this.timer);
    this.timer = null;
    this.stopBattle();
  }

  // ---------- players ----------

  join(rawNickname: unknown, avatar?: AvatarChoice | null): SiegePlayer {
    if (this.phase === "podium") throw new GameError("This game has finished");
    const player = this.roster.add(rawNickname, avatar ?? randomAvatar(this.rng), (base) => this.newPlayer(base));
    if (this.playing) this.stream.open(player);
    this.onChange();
    return player;
  }

  byToken(token: unknown): SiegePlayer | null {
    return this.roster.byToken(token);
  }

  setConnected(playerId: string, connected: boolean): void {
    const p = this.players.get(playerId);
    if (!p || p.connected === connected) return;
    p.connected = connected;
    if (!connected) p.mapOpen = false;
    this.onChange();
  }

  /** The player's defenders stay on the board; their unspent gold goes with them. */
  kick(playerId: string): SiegePlayer | null {
    const p = this.roster.remove(playerId);
    if (!p) return null;
    p.connected = false;
    p.mapOpen = false;
    this.kicked.push(p);
    this.onChange();
    return p;
  }

  // ---------- answers ----------

  answer(playerId: string, seq: number, answer: AnswerValue): boolean {
    const p = this.players.get(playerId);
    if (!p || !this.playing) return false;
    const correct = this.stream.answer(p, seq, answer);
    if (correct === null) return false;
    this.periodAnswered++;
    if (correct) {
      this.periodCorrect++;
      p.gold += SIEGE_GOLD_PER_CORRECT;
      p.goldEarned += SIEGE_GOLD_PER_CORRECT;
    }
    // The projector's gold total changes on a correct answer; only the answerer's screen otherwise.
    if (correct) this.onChange();
    else this.onActivity(p.id);
    return true;
  }

  // ---------- results ----------

  awards(): SiegeAwards {
    const players = this.everyone;
    const best = (value: (p: SiegePlayer) => number, tie?: (p: SiegePlayer) => number) => {
      const top = Math.max(0, ...players.map(value));
      if (top <= 0) return null;
      let winners = players.filter((p) => value(p) === top);
      if (tie) {
        const t = Math.max(...winners.map(tie));
        winners = winners.filter((p) => tie(p) === t);
      }
      return { value: top, nicknames: winners.map((p) => p.nickname) };
    };
    return {
      topArcher: best((p) => p.archerKills, (p) => p.archerUpgrades),
      masterMason: best((p) => p.placed.wall + p.wallUpgrades),
      mostCorrect: best((p) => p.correct),
    };
  }

  /** Waves fully beaten. */
  wavesSurvived(): number {
    if (this.outcome === "stands") return this.wave;
    return Math.max(0, this.wave - 1);
  }

  /** Average difficulty scale over the waves played, in %. */
  avgScale(): number {
    if (this.waveLog.length === 0) return 100;
    return Math.round(this.waveLog.reduce((n, w) => n + w.scale, 0) / this.waveLog.length);
  }

  result(): SiegeResult {
    return this.finishedResult ?? this.computeResult();
  }

  private computeResult(): SiegeResult {
    const outcome = this.outcome ?? "ended";
    const survived = this.wavesSurvived();
    const waves = this.settings.waves;
    const avg = this.avgScale();
    const words = siegeWords(this.settings.theme);
    let headline: string;
    if (outcome === "ended") headline = `Ended on wave ${Math.max(1, this.wave)} with ${this.hearts} ${this.hearts === 1 ? "heart" : "hearts"} left.`;
    else if (outcome === "stands") headline = `The ${words.home} stands with ${this.hearts} of ${SIEGE_HEARTS} hearts!`;
    else if (waves === "endless") headline = `Survived ${survived} ${survived === 1 ? "wave" : "waves"}`;
    else headline = `The ${words.fallen} fell on wave ${this.wave} of ${waves}.`;
    let record: SiegeRecord | null = null;
    let newRecord = false;
    if (waves === "endless") {
      const prev = this.previousRecord;
      newRecord = survived > 0 && (!prev || survived > prev.waves || (survived === prev.waves && avg > prev.avgScale));
      record = newRecord ? { waves: survived, avgScale: avg, date: new Date(this.clock.now()).toISOString() } : prev;
    }
    return { outcome, wave: Math.max(1, this.wave), waves, wavesSurvived: survived, hearts: this.hearts, headline, avgScale: waves === "endless" ? avg : null, record, newRecord };
  }

  // ---------- views ----------

  private remaining(at: number): number {
    return at ? Math.max(0, at - this.clock.now()) : 0;
  }

  hostView(): HostSiegeState {
    const podium = this.phase === "podium";
    const players = [...this.players.values()];
    const ending = this.phase === "stands" || this.phase === "fallen" || podium;
    return {
      kind: "siege",
      phase: this.phase,
      quiz: { id: this.quizId, title: this.title, questionCount: this.questions.length },
      settings: { waves: this.settings.waves, theme: siegeTheme(this.settings.theme) },
      wave: this.wave,
      gold: players.reduce((sum, p) => sum + p.gold, 0),
      hearts: this.hearts,
      maxHearts: SIEGE_HEARTS,
      phaseRemainingMs: this.phase === "wave" || podium ? 0 : this.remaining(this.phaseEndsAt),
      phaseDurationMs: this.phaseDurationMs,
      ...this.battlefield.hostBoard(this.playing, ending),
      events: this.events,
      players: players.map((p) => ({ id: p.id, nickname: p.nickname, avatar: p.avatar, connected: p.connected })),
      playerCount: players.length,
      connectedCount: players.filter((p) => p.connected).length,
      result: ending && this.outcome ? this.result() : null,
      awards: podium ? this.awards() : null,
      errors: podium ? this.stream.errors() : null,
    };
  }

  playerView(playerId: string): PlayerSiegeView | null {
    const p = this.players.get(playerId);
    if (!p) return null;
    const podium = this.phase === "podium";
    let result: PlayerSiegeView["result"] = null;
    if ((podium || this.phase === "stands" || this.phase === "fallen") && this.outcome) {
      const r = this.result();
      const a = this.awards();
      const won = (x: { nicknames: string[] } | null) => !!x?.nicknames.includes(p.nickname);
      const words = siegeWords(this.settings.theme);
      result = {
        outcome: r.outcome,
        headline: r.headline,
        goldEarned: p.goldEarned,
        goldSpent: p.goldSpent,
        placed: { ...p.placed },
        upgrades: p.upgrades,
        defeated: p.defeated,
        awards: podium ? [...(won(a.topArcher) ? [words.topArcher] : []), ...(won(a.masterMason) ? [words.masterMason] : []), ...(won(a.mostCorrect) ? ["Most correct answers"] : [])] : [],
      };
    }
    return {
      kind: "siege",
      phase: this.phase,
      title: this.title,
      phaseRemainingMs: this.phase === "wave" || podium ? 0 : this.remaining(this.phaseEndsAt),
      theme: siegeTheme(this.settings.theme),
      phaseDurationMs: this.phaseDurationMs,
      wave: this.wave,
      waves: this.settings.waves,
      hearts: this.hearts,
      gold: p.gold,
      danger: this.playing ? this.battlefield.danger : [],
      me: { id: p.id, nickname: p.nickname, avatar: p.avatar, correct: p.correct, goldEarned: p.goldEarned },
      question: this.playing ? this.stream.questionView(p) : null,
      feedback: this.playing ? this.stream.feedbackView(p) : null,
      lastPlaced: p.lastPlaced,
      alert: this.playing ? this.battlefield.alert : null,
      map: p.mapOpen && this.playing ? this.battlefield.mapView() : null,
      result,
    };
  }
}

/**
 * Kingdom Siege: one row per player (kicked players included), each with the class result,
 * then a wave log with one row per wave.
 */
export function buildSiegeResultsCsv(game: SiegeGame): string {
  const header = [
    "Nickname",
    "Correct",
    "Wrong",
    "Accuracy %",
    "Gold earned",
    "Gold spent",
    "Archers placed",
    "Knights placed",
    "Walls placed",
    "Upgrades bought",
    "Monsters defeated",
    "Class result",
    "Waves survived",
    "Hearts left",
    "Endless record",
  ];
  const r = game.result();
  const result = r.outcome === "stands" ? "Stood" : r.outcome === "fallen" ? "Fell" : "Ended";
  const record = r.record ? `${r.record.waves} waves, ${r.record.avgScale}% difficulty${r.newRecord ? " (new record)" : ""}` : "";
  const rows: (string | number)[][] = game.everyone
    .sort((a, b) => b.goldEarned - a.goldEarned || b.correct - a.correct)
    .map((p) => {
      const answered = p.correct + p.wrong;
      return [
        p.nickname,
        p.correct,
        p.wrong,
        answered ? Math.round((p.correct / answered) * 100) : "",
        p.goldEarned,
        p.goldSpent,
        p.placed.archer,
        p.placed.knight,
        p.placed.wall,
        p.upgrades,
        p.defeated,
        result,
        r.wavesSurvived,
        r.hearts,
        record,
      ];
    });
  const log: (string | number)[][] = [
    [],
    ["Wave", "Difficulty scale %", "Defense gold", "Strength boost", "Monster budget", "Monster health ×", "Monsters sent", "Class accuracy %", "Hearts lost"],
    ...game.waveLog.map((w) => [w.wave, w.scale, w.defense, w.boost, w.budget, w.toughness, w.sent, w.answered ? Math.round((w.correct / w.answered) * 100) : "", w.heartsLost]),
  ];
  return toCsv([header, ...rows, ...log]);
}

export const siegeMode: ModeEntry<"siege"> = {
  name: MODE_NAMES.siege,
  defaultSettings: { waves: 5, theme: DEFAULT_SIEGE_THEME },
  readSettings(raw, current) {
    const waves = raw.waves === "endless" ? "endless" : Number(raw.waves);
    if (!(SIEGE_WAVE_CHOICES as readonly unknown[]).includes(waves)) throw new GameError("Unsupported number of waves");
    return { waves: waves as SiegeWaves, theme: pickTheme(raw.theme, siegeTheme(current.theme), "Kingdom Siege") };
  },
  start(lobby, ctx) {
    const game = SiegeGame.fromLobby(lobby, {
      ...handoffOptions(ctx),
      onTick: ctx.onTick,
      record: lobby.settings.waves === "endless" ? loadSiegeRecord(ctx.dataDir, lobby.quiz.id) : null,
    });
    const waves = game.settings.waves;
    return { game, log: `${this.name} started with ${game.players.size} player(s), ${waves === "endless" ? "Endless" : `${waves} waves`}` };
  },
  pacing: null,
  teams: () => null,
  lobbyBanner: true,
  resultsCsv: buildSiegeResultsCsv,
  finished(game, ctx) {
    const r = game.result();
    if (!r.newRecord || !r.record) return;
    try {
      saveSiegeRecord(ctx.dataDir, game.quizId, r.record);
    } catch (e) {
      ctx.log(`Could not save the ${this.name} record: ${(e as Error).message}`);
    }
  },
  handle(game, playerId, msg) {
    switch (msg.type) {
      case "siege.answer":
        return game.answer(playerId, Number(msg.seq), answerOf(msg)) ? undefined : "resend";
      case "siege.place": {
        const err = game.place(playerId, msg.defender, msg.lane, msg.square);
        if (err) throw new GameError(err);
        return;
      }
      case "siege.upgrade": {
        const err = game.upgrade(playerId, msg.lane, msg.square);
        if (err) throw new GameError(err);
        return;
      }
      case "siege.map":
        game.setMap(playerId, msg.open === true);
        return;
      default:
        return unhandled(msg);
    }
  },
};

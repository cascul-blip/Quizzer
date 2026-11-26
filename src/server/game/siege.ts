import type { AnswerValue } from "../../shared/answer-match.ts";
import { answerOf } from "../../shared/answer-match.ts";
import type { AvatarChoice } from "../../shared/avatars.ts";
import type {
  HostSiegeState,
  PlayerSiegeView,
  SiegeAwardKey,
  SiegeEvent,
  SiegePhase,
  SiegeRecord,
  SiegeResult,
  SiegeSettings,
} from "../../shared/modes/siege.ts";
import { siegeAwardLabels, siegeDefenderPhrase, siegeShared, siegeWords } from "../../shared/modes/siege.ts";
import type { Question, Quiz } from "../../shared/quiz-schema.ts";
import type { SiegeDefenderType, SiegeWaves } from "../../shared/siege-rules.ts";
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
  SIEGE_WAVE_CHOICES,
  siegeGiantPace,
  siegeNextScale,
  siegeUpgradeCost,
  siegeWaveBudget,
  siegeWaveStrength,
} from "../../shared/siege-rules.ts";
import { modeTheme, THEMED_MODES } from "../../shared/themed-modes.ts";
import { loadSiegeRecord, saveSiegeRecord } from "../siege-records.ts";
import type { Clock } from "./common.ts";
import { GameError } from "./common.ts";
import type { LobbyChoices, LobbyFacts } from "./lobby-facts.ts";
import type { ModeEntry } from "./mode-entry.ts";
import { handoffOptions, pickTheme, unhandled } from "./mode-entry.ts";
import type { Podium } from "./podium.ts";
import { buildPodium, emptyPodium } from "./podium.ts";
import type { Column, ResultsSheet } from "./results.ts";
import { accuracy, sheet } from "./results.ts";
import type { BasePlayer } from "./roster.ts";
import { SiegeBattlefield } from "./siege-battlefield.ts";
import { most } from "./standings.ts";
import type { AnswerTotals } from "./stream.ts";
import { StreamedSession } from "./streamed-session.ts";

export type { SiegeMonster } from "./siege-battlefield.ts";

export { FEEDBACK_MS } from "./stream.ts";

export const SIEGE_NO_GOLD = "Not enough gold.";

export interface SiegePlayer extends BasePlayer, AnswerTotals {
  gold: number;
  goldEarned: number;
  goldSpent: number;
  placed: Record<SiegeDefenderType, number>;
  upgrades: number;
  archerUpgrades: number;
  wallUpgrades: number;
  defeated: number;
  archerKills: number;
  lastPlaced: SiegeDefenderType | null;
  mapOpen: boolean;
}

interface SiegeWaveLog {
  wave: number;
  scale: number;
  defense: number;
  boost: number;
  budget: number;
  toughness: number;
  sent: number;
  /** why: counts run from this wave's start to the next one's (or game end). */
  correct: number;
  answered: number;
  heartsLost: number;
}

interface SiegeOptions {
  clock?: Clock;
  rng?: () => number;
  record?: SiegeRecord | null;
  onChange?: () => void;
  onActivity?: (playerId: string) => void;
  onTick?: () => void;
  onFinish?: (game: SiegeGame) => void;
}

interface SiegeGameSettings extends SiegeSettings {
  shuffleAnswers: boolean;
  protect?: boolean;
}

const SIEGE_AWARD_VALUES: Record<SiegeAwardKey, (p: SiegePlayer) => number> = {
  topArcher: (p) => p.archerKills,
  masterMason: (p) => p.placed.wall + p.wallUpgrades,
  mostCorrect: (p) => p.correct,
};

export class SiegeGame {
  readonly runningMode = "siege" as const;
  readonly quizId: string;
  readonly title: string;
  readonly questions: Question[];
  readonly settings: SiegeGameSettings;
  /** why: kept so their stats stay in the results. */
  readonly kicked: SiegePlayer[] = [];

  wave = 0;
  scale = 100;
  outcome: SiegeResult["outcome"] | null = null;
  readonly waveLog: SiegeWaveLog[] = [];
  events: SiegeEvent[] = [];
  readonly battlefield: SiegeBattlefield<SiegePlayer>;
  readonly previousRecord: SiegeRecord | null;

  private periodCorrect = 0;
  private periodAnswered = 0;
  private seq = 0;
  private finishedResult: SiegeResult | null = null;

  private readonly onTick: () => void;
  private readonly session: StreamedSession<SiegePlayer, SiegePhase, Podium<SiegePlayer, SiegePlayer, SiegeAwardKey>>;

  private defenderName(type: SiegeDefenderType): string {
    return siegeDefenderPhrase(type, this.settings.theme);
  }

  constructor(quiz: Quiz, settings: SiegeGameSettings, opts: SiegeOptions = {}) {
    if (quiz.questions.length === 0) throw new GameError("This quiz has no questions");
    this.quizId = quiz.id;
    this.title = quiz.title;
    this.questions = quiz.questions;
    this.settings = settings;
    this.previousRecord = opts.record ?? null;
    this.session = new StreamedSession({
      questions: quiz.questions,
      shuffleAnswers: settings.shuffleAnswers,
      protect: settings.protect,
      clock: opts.clock,
      rng: opts.rng,
      countdownMs: SIEGE_COUNTDOWN_MS,
      inPlay: () => this.playing,
      canAnswer: () => this.playing,
      cleanup: () => {
        this.stopBattle();
        this.finishedResult = this.computeResult();
      },
      podium: { build: () => this.buildPodium(), empty: () => emptyPodium(siegeAwardLabels(this.settings.theme)) },
      hub: { onChange: opts.onChange, onActivity: opts.onActivity, onFinish: () => opts.onFinish?.(this) },
    });
    this.onTick = opts.onTick ?? (() => this.session.changed());
    this.battlefield = new SiegeBattlefield<SiegePlayer>({
      clock: this.session.clock,
      rng: this.session.rng,
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

  get choices(): LobbyChoices {
    return this.session.choices;
  }

  static fromLobby(lobby: LobbyFacts<"siege">, opts: SiegeOptions = {}): SiegeGame {
    const game = new SiegeGame(lobby.quiz, { ...lobby.settings, shuffleAnswers: lobby.shuffle.answers, protect: lobby.protect }, opts);
    game.session.adoptLobby(lobby, (base) => game.newPlayer(base));
    return game;
  }

  get players(): Map<string, SiegePlayer> {
    return this.session.players;
  }

  get everyone(): SiegePlayer[] {
    return [...this.players.values(), ...this.kicked];
  }

  get endless(): boolean {
    return this.settings.waves === "endless";
  }

  private newPlayer(base: BasePlayer): Omit<SiegePlayer, keyof AnswerTotals> {
    return {
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
    };
  }

  get phase(): SiegePhase {
    return this.session.phase;
  }

  get phaseDurationMs(): number {
    return this.session.phases.durationMs;
  }

  private get playing(): boolean {
    return this.phase === "build" || this.phase === "wave";
  }

  private connectedCount(): number {
    return [...this.players.values()].filter((p) => p.connected).length;
  }

  start(): void {
    this.session.start(() => this.beginOpening());
  }

  private beginOpening(): void {
    this.wave = 1;
    for (const p of this.players.values()) this.session.stream.open(p);
    this.session.phases.set("build", SIEGE_OPENING_MS, () => this.beginWave(1));
    this.scheduleTick();
    this.session.changed();
  }

  private closePreviousWave(): (typeof this.waveLog)[number] | undefined {
    this.recordBattle();
    const prev = this.waveLog[this.waveLog.length - 1];
    if (prev) {
      prev.correct = this.periodCorrect;
      prev.answered = this.periodAnswered;
      this.scale = siegeNextScale(this.scale, this.periodCorrect, this.periodAnswered);
    }
    this.periodCorrect = 0;
    this.periodAnswered = 0;
    return prev;
  }

  private beginWave(wave: number): void {
    const prev = this.closePreviousWave();
    this.wave = wave;
    const defense = Math.round(this.defenseGold());
    // why: a strong board makes the wave stronger; the boost only climbs after a wave that cost no hearts.
    const { boost, budget, toughness } = siegeWaveStrength(
      siegeWaveBudget(wave, this.connectedCount(), this.scale),
      defense,
      prev?.boost ?? 1,
      !prev || prev.heartsLost === 0,
    );
    this.battlefield.beginWave({ wave, budget, toughness, giantPace: siegeGiantPace(boost) });
    this.waveLog.push({ wave, scale: this.scale, defense, boost, budget, toughness, sent: 0, correct: 0, answered: 0, heartsLost: 0 });
    this.session.phases.enter("wave");
    this.session.changed();
  }

  defenseGold(): number {
    return this.battlefield.boardGold() + [...this.players.values()].reduce((sum, p) => sum + p.gold, 0);
  }

  private scheduleTick(): void {
    this.session.phases.after("tick", SIEGE_TICK_MS, () => this.tick());
  }

  private tick(): void {
    if (!this.playing) return;
    const { changed, phones, map } = this.battlefield.tick(this.session.clock.now());
    this.recordBattle();
    if (this.hearts <= 0) return this.fall();
    if (this.phase === "wave" && this.battlefield.waveCleared) return this.endWave();
    this.scheduleTick();
    // why: shots, monster moves and defender hits are projector-only; don't rebuild every phone's view.
    if (phones || (map && [...this.players.values()].some((p) => p.mapOpen))) this.session.changed();
    else if (changed) this.onTick();
  }

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
    this.session.phases.set("build", SIEGE_BREAK_MS, () => this.beginWave(next));
    this.scheduleTick();
    this.session.changed();
  }

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
    this.session.changed();
    return null;
  }

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
    this.session.changed();
    return null;
  }

  setMap(playerId: string, open: boolean): void {
    const p = this.players.get(playerId);
    if (!p || p.mapOpen === open) return;
    p.mapOpen = open && this.playing;
    this.session.activity(p.id);
  }

  private addEvent(p: SiegePlayer, text: string): void {
    this.events.push({ seq: ++this.seq, nickname: p.nickname, text });
    if (this.events.length > SIEGE_EVENTS_SHOWN) this.events.splice(0, this.events.length - SIEGE_EVENTS_SHOWN);
  }

  private stand(): void {
    this.closePeriod();
    this.outcome = "stands";
    this.stopBattle();
    this.session.phases.set("stands", SIEGE_ENDING_MS, () => this.session.end());
    this.session.changed();
  }

  private fall(): void {
    this.closePeriod();
    this.outcome = "fallen";
    this.stopBattle();
    this.session.phases.set("fallen", SIEGE_ENDING_MS, () => this.session.end());
    this.session.changed();
  }

  end(): void {
    if (this.session.finished) return;
    if (!this.outcome) {
      this.closePeriod();
      this.outcome = "ended";
    }
    this.session.end();
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
    this.session.phases.cancel("tick");
    this.battlefield.stop();
    for (const p of this.players.values()) p.mapOpen = false;
  }

  dispose(): void {
    this.session.dispose();
    this.stopBattle();
  }

  join(rawNickname: unknown, avatar?: AvatarChoice | null): SiegePlayer {
    const player = this.session.addPlayer(rawNickname, avatar, (base) => this.newPlayer(base));
    this.session.changed();
    return player;
  }

  byToken(token: unknown): SiegePlayer | null {
    return this.session.byToken(token);
  }

  setConnected(playerId: string, connected: boolean): void {
    const p = this.players.get(playerId);
    if (p && !connected) p.mapOpen = false;
    this.session.setConnected(playerId, connected);
  }

  /** why: the player's defenders stay on the board; their unspent gold goes with them. */
  kick(playerId: string): SiegePlayer | null {
    const p = this.session.removePlayer(playerId);
    if (!p) return null;
    p.connected = false;
    p.mapOpen = false;
    this.kicked.push(p);
    this.session.changed();
    return p;
  }

  answer(playerId: string, seq: number, answer: AnswerValue): boolean {
    const answered = this.session.answer(playerId, seq, answer);
    if (!answered) return false;
    const { player: p, correct } = answered;
    this.periodAnswered++;
    if (correct) {
      this.periodCorrect++;
      p.gold += SIEGE_GOLD_PER_CORRECT;
      p.goldEarned += SIEGE_GOLD_PER_CORRECT;
    }
    // why: the projector's gold total changes on a correct answer; otherwise only the answerer's screen.
    if (correct) this.session.changed();
    else this.session.activity(p.id);
    return true;
  }

  private buildPodium(): Podium<SiegePlayer, SiegePlayer, SiegeAwardKey> {
    const players = this.everyone;
    return buildPodium({
      entries: players,
      order: [most((p) => p.goldEarned), most((p) => p.correct)],
      players,
      entryOf: (p) => p,
      awards: { labels: siegeAwardLabels(this.settings.theme), values: SIEGE_AWARD_VALUES },
    });
  }

  get podium(): Podium<SiegePlayer, SiegePlayer, SiegeAwardKey> {
    return this.session.podium;
  }

  wavesSurvived(): number {
    if (this.outcome === "stands") return this.wave;
    return Math.max(0, this.wave - 1);
  }

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
      record = newRecord ? { waves: survived, avgScale: avg, date: new Date(this.session.clock.now()).toISOString() } : prev;
    }
    return {
      outcome,
      wave: Math.max(1, this.wave),
      waves,
      wavesSurvived: survived,
      hearts: this.hearts,
      headline,
      avgScale: waves === "endless" ? avg : null,
      record,
      newRecord,
    };
  }

  hostView(): HostSiegeState {
    const podium = this.phase === "podium";
    const players = [...this.players.values()];
    const ending = this.phase === "stands" || this.phase === "fallen" || podium;
    return {
      kind: "siege",
      phase: this.phase,
      quiz: { id: this.quizId, title: this.title, questionCount: this.questions.length },
      settings: { waves: this.settings.waves, theme: modeTheme("siege", this.settings.theme) },
      wave: this.wave,
      gold: players.reduce((sum, p) => sum + p.gold, 0),
      hearts: this.hearts,
      maxHearts: SIEGE_HEARTS,
      phaseRemainingMs: this.phase === "wave" || podium ? 0 : this.session.phases.remainingMs(),
      phaseDurationMs: this.phaseDurationMs,
      ...this.battlefield.hostBoard(this.playing, ending),
      events: this.events,
      players: players.map((p) => ({ id: p.id, nickname: p.nickname, avatar: p.avatar, connected: p.connected })),
      playerCount: players.length,
      connectedCount: players.filter((p) => p.connected).length,
      result: ending && this.outcome ? this.result() : null,
      awards: podium ? this.podium.awards : null,
      errors: this.session.stream.errorsWhen(podium),
    };
  }

  playerView(playerId: string): PlayerSiegeView | null {
    const p = this.players.get(playerId);
    if (!p) return null;
    const podium = this.phase === "podium";
    let result: PlayerSiegeView["result"] = null;
    if ((podium || this.phase === "stands" || this.phase === "fallen") && this.outcome) {
      const r = this.result();
      result = {
        outcome: r.outcome,
        headline: r.headline,
        goldEarned: p.goldEarned,
        goldSpent: p.goldSpent,
        placed: { ...p.placed },
        upgrades: p.upgrades,
        defeated: p.defeated,
        awards: podium ? (this.podium.result(p.id)?.awards ?? []) : [],
      };
    }
    return {
      kind: "siege",
      phase: this.phase,
      title: this.title,
      phaseRemainingMs: this.phase === "wave" || podium ? 0 : this.session.phases.remainingMs(),
      theme: modeTheme("siege", this.settings.theme),
      phaseDurationMs: this.phaseDurationMs,
      wave: this.wave,
      waves: this.settings.waves,
      hearts: this.hearts,
      gold: p.gold,
      danger: this.playing ? this.battlefield.danger : [],
      me: { id: p.id, nickname: p.nickname, avatar: p.avatar, correct: p.correct, goldEarned: p.goldEarned },
      ...this.session.stream.fragment(p),
      lastPlaced: p.lastPlaced,
      alert: this.playing ? this.battlefield.alert : null,
      map: p.mapOpen && this.playing ? this.battlefield.mapView() : null,
      result,
    };
  }
}

function siegeColumns(game: SiegeGame): Column<SiegePlayer>[] {
  const r = game.result();
  const result = r.outcome === "stands" ? "Stood" : r.outcome === "fallen" ? "Fell" : "Ended";
  const record = r.record ? `${r.record.waves} waves, ${r.record.avgScale}% difficulty${r.newRecord ? " (new record)" : ""}` : "";
  return [
    { header: "Nickname", value: (p) => p.nickname },
    { header: "Correct", value: (p) => p.correct },
    { header: "Wrong", value: (p) => p.wrong },
    { header: "Accuracy %", value: (p) => accuracy(p) },
    { header: "Gold earned", value: (p) => p.goldEarned },
    { header: "Gold spent", value: (p) => p.goldSpent },
    { header: "Archers placed", value: (p) => p.placed.archer },
    { header: "Knights placed", value: (p) => p.placed.knight },
    { header: "Walls placed", value: (p) => p.placed.wall },
    { header: "Upgrades bought", value: (p) => p.upgrades },
    { header: "Monsters defeated", value: (p) => p.defeated },
    { header: "Class result", value: () => result },
    { header: "Waves survived", value: () => r.wavesSurvived },
    { header: "Hearts left", value: () => r.hearts },
    { header: "Endless record", value: () => record },
  ];
}

export function buildSiegeResults(game: SiegeGame): ResultsSheet {
  const players = game.podium.rows.map((r) => r.player);
  const waves = sheet(SIEGE_WAVE_COLUMNS, game.waveLog);
  return sheet(siegeColumns(game), players, [waves.header, ...waves.rows]);
}

const SIEGE_WAVE_COLUMNS: Column<SiegeGame["waveLog"][number]>[] = [
  { header: "Wave", value: (w) => w.wave },
  { header: "Difficulty scale %", value: (w) => w.scale },
  { header: "Defense gold", value: (w) => w.defense },
  { header: "Strength boost", value: (w) => w.boost },
  { header: "Monster budget", value: (w) => w.budget },
  { header: "Monster health ×", value: (w) => w.toughness },
  { header: "Monsters sent", value: (w) => w.sent },
  { header: "Class accuracy %", value: (w) => (w.answered ? Math.round((w.correct / w.answered) * 100) : "") },
  { header: "Hearts lost", value: (w) => w.heartsLost },
];

export const siegeMode: ModeEntry<"siege"> = {
  ...siegeShared,
  defaultSettings: { waves: 5, theme: THEMED_MODES.siege.default },
  readSettings(raw, current) {
    const waves = raw.waves === "endless" ? "endless" : Number(raw.waves);
    if (!(SIEGE_WAVE_CHOICES as readonly unknown[]).includes(waves)) throw new GameError("Unsupported number of waves");
    // checked: the line above refuses waves that are not one of SIEGE_WAVE_CHOICES
    return { waves: waves as SiegeWaves, theme: pickTheme(raw.theme, modeTheme("siege", current.theme), "Kingdom Siege") };
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
  results: buildSiegeResults,
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

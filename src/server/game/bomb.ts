import { MAX_TYPED_ANSWER, checkAnswer } from "../../shared/answer-match.ts";
import {
  BOMB_COUNTDOWN_MS,
  BOMB_HOLD_GRACE_MS,
  BOMB_HOLD_MS,
  BOMB_MAX_PER_SQUAD,
  BOMB_MAX_SQUADS,
  BOMB_MINUTES,
  BOMB_MODULES,
  BOMB_NEXT_MS,
  BOMB_PENALTIES,
  BOMB_REDEAL_MS,
  BOMB_RESULT_MS,
  BOMB_WIRE_COLORS,
  BOMB_WIRES,
  type BombAwards,
  type BombPanel,
  type BombPhase,
  type BombSettings,
  type BombWireColor,
  type HostBombModule,
  type HostBombSquad,
  type HostBombState,
  type PlayerBombView,
  type PlayerBombWire,
} from "../../shared/protocol.ts";
import { randomAvatar, type AvatarChoice } from "../../shared/avatars.ts";
import type { PinSpot } from "../../shared/quiz-constants.ts";
import type { Question, QuestionType, Quiz } from "../../shared/quiz-schema.ts";
import { GameError, realClock, shuffle, shuffleOptions, teamInfo, topErrors, type Clock } from "./common.ts";
import type { Game } from "./game.ts";
import { Roster, type BasePlayer } from "./roster.ts";

/** Extra wait after a wrong keypad entry so one slip isn't counted twice. */
export const BOMB_KEYPAD_LOCK_MS = 800;

interface BombOptions {
  clock?: Clock;
  rng?: () => number;
  onChange?: () => void;
  onActivity?: (playerId: string) => void;
  onFinish?: (game: BombGame) => void;
}

interface BombGameSettings extends BombSettings {
  shuffleAnswers: boolean;
}

interface DealPlayer {
  id: string;
  rightHolds: number;
  extras: number;
}

interface DealOption {
  index: number;
  label: string;
  correct: boolean;
  spot?: PinSpot;
}

interface DealtWire {
  playerId: string;
  optionIndex: number;
  label: string;
  correct: boolean;
  /** A wrong answer borrowed from another question. */
  decoy: boolean;
  /** A second copy of a wire already in this deal. */
  copy: boolean;
  color: BombWireColor;
  spot?: PinSpot;
}

interface LiveWire extends DealtWire {
  id: string;
  cut: boolean;
}

interface SquadQuestion {
  seq: number;
  qIndex: number;
  type: QuestionType;
  text: string;
  image?: string;
  answers: string[];
  wires: LiveWire[];
  wrongOnThis: number;
  keypadLockUntil: number;
}

interface Squad {
  index: number;
  name: string;
  color: string;
  deck: number[];
  lastQ: number;
  question: SquadQuestion | null;
  /** Wires cleared in the module currently open. */
  clearedInModule: number;
  modulesCleared: number;
  finished: boolean;
  exploded: boolean;
  /** Elapsed ms from the start of defusing to when this squad finished. */
  finishMs: number | null;
  /** Time left when this squad finished, or 0 if it exploded. */
  timeLeftMs: number;
  endsAt: number;
  timerRev: number;
  wrongCuts: number;
  timeLostMs: number;
  hold: { playerId: string; wireId: string; startedAt: number } | null;
  pauseUntil: number;
  afterPause: "next" | "finish" | null;
  status: string | null;
  statusUntil: number;
  reveal: string[] | null;
  flash: HostBombSquad["flash"];
  flashSeq: number;
}

interface BombPlayer extends BasePlayer {
  squad: number;
  /** Skip the question already on screen; dealt in on the next wire. */
  satOut: boolean;
  disconnectedAt: number;
  wiresHeld: number;
  rightHeld: number;
  /** Times this player was given a second wire on one question. */
  extras: number;
  rightCuts: number;
  wrongCuts: number;
  keypadRight: number;
  keypadWrong: number;
  /** Right wires this player held on a question the squad cleared with no wrong cut first. */
  firstTry: number;
  timeLostMs: number;
}

/**
 * Hand each wire to one phone.
 *
 * Fewer players than choices: extras go to whoever holds the fewest wires this question,
 * and (on a tie) whoever has been given the extra least often.
 * More players than choices: extras get decoys, or a copy of a wrong answer when the decoy list runs out.
 * True/False: every phone gets True or False, split as evenly as possible. On an odd squad the extra
 * wire is the wrong one, so the right wire stays with the smaller half.
 * The right wire goes to whoever has held it the fewest times (ties follow `rng`), and with several
 * right answers each one goes to a phone that has no wire yet while there is one.
 */
export function dealBombWires(opts: {
  players: DealPlayer[];
  options: DealOption[];
  kind: "multiple_choice" | "true_false" | "pin";
  decoys: string[];
  rng: () => number;
}): DealtWire[] {
  const players = opts.players;
  if (players.length === 0 || opts.options.length === 0) return [];
  const wires: DealtWire[] = [];
  const assigned = new Map<string, number>();
  const liveRight = new Map(players.map((p) => [p.id, p.rightHolds]));

  const give = (p: DealPlayer, wire: Omit<DealtWire, "playerId">) => {
    assigned.set(p.id, (assigned.get(p.id) ?? 0) + 1);
    if (wire.correct) liveRight.set(p.id, (liveRight.get(p.id) ?? 0) + 1);
    wires.push({ ...wire, playerId: p.id });
  };
  const pick = (pool: DealPlayer[], score: (p: DealPlayer) => number): DealPlayer => {
    let best = Infinity;
    for (const p of pool) best = Math.min(best, score(p));
    const tied = pool.filter((p) => score(p) === best);
    return tied[Math.floor(opts.rng() * tied.length)]!;
  };
  const fewestRight = (pool: DealPlayer[]) => pick(pool, (p) => liveRight.get(p.id) ?? 0);
  const fewestWires = (pool: DealPlayer[]) => pick(pool, (p) => (assigned.get(p.id) ?? 0) * 1000 + p.extras);

  const colorOf = (opt: DealOption): BombWireColor => {
    if (opts.kind === "true_false") return /^true$/i.test(opt.label) ? "green" : "red";
    return BOMB_WIRE_COLORS[opt.index % BOMB_WIRE_COLORS.length]!;
  };
  const fromOption = (opt: DealOption, decoy = false, copy = false): Omit<DealtWire, "playerId"> => ({
    optionIndex: opt.index,
    label: opt.label,
    correct: decoy ? false : opt.correct,
    decoy,
    copy,
    color: colorOf(opt),
    ...(opt.spot ? { spot: opt.spot } : {}),
  });

  if (opts.kind === "true_false") {
    const correct = opts.options.find((o) => o.correct) ?? opts.options[0]!;
    const wrong = opts.options.find((o) => !o.correct) ?? opts.options[1] ?? correct;
    if (players.length === 1) {
      give(players[0]!, fromOption(correct));
      give(players[0]!, fromOption(wrong));
      return wires;
    }
    const pool = [...players];
    const rightSlots = Math.floor(players.length / 2);
    for (let i = 0; i < rightSlots; i++) {
      const p = fewestRight(pool);
      pool.splice(pool.indexOf(p), 1);
      give(p, fromOption(correct));
    }
    for (const p of pool) give(p, fromOption(wrong));
    return wires;
  }

  const correct = opts.options.filter((o) => o.correct);
  const wrong = opts.options.filter((o) => !o.correct);

  if (players.length <= opts.options.length) {
    // Right wires go to empty hands first, so several right answers can't all land on one phone.
    for (const opt of correct) {
      const bare = players.filter((p) => !assigned.has(p.id));
      give(fewestRight(bare.length > 0 ? bare : players), fromOption(opt));
    }
    for (const opt of wrong) give(fewestWires(players), fromOption(opt));
    return wires;
  }

  const remaining = [...players];
  const take = (p: DealPlayer) => remaining.splice(remaining.indexOf(p), 1);
  for (const opt of correct) {
    const p = fewestRight(remaining);
    take(p);
    give(p, fromOption(opt));
  }
  for (const opt of wrong) {
    const p = fewestWires(remaining);
    take(p);
    give(p, fromOption(opt));
  }

  if (opts.kind === "pin") {
    const source = wrong.length > 0 ? wrong : opts.options;
    remaining.forEach((p, i) => give(p, fromOption(source[i % source.length]!, false, true)));
    return wires;
  }

  const used = new Set(opts.options.map((o) => o.label.toLowerCase()));
  const decoys: string[] = [];
  for (const label of opts.decoys) {
    const key = label.toLowerCase();
    if (used.has(key)) continue;
    used.add(key);
    decoys.push(label);
  }
  const copies = wrong.length > 0 ? wrong : opts.options;
  remaining.forEach((p, i) => {
    if (i < decoys.length) {
      const n = opts.options.length + i;
      give(p, {
        optionIndex: -1,
        label: decoys[i]!,
        correct: false,
        decoy: true,
        copy: false,
        color: BOMB_WIRE_COLORS[n % BOMB_WIRE_COLORS.length]!,
      });
    } else {
      const opt = copies[(i - decoys.length) % copies.length]!;
      give(p, fromOption(opt, false, true));
    }
  });
  return wires;
}

/**
 * Bomb Squad: one question at a time, the answers split across the squad's phones.
 * The server deals every wire and checks every cut.
 */
export class BombGame {
  readonly kind = "bomb";
  readonly quizId: string;
  readonly title: string;
  readonly questions: Question[];
  readonly settings: BombGameSettings;
  squads: Squad[] = [];
  readonly roster = new Roster<BombPlayer>();
  readonly startedAt = new Date();
  phase: BombPhase = "countdown";

  outcome: "defused" | "exploded" | null = null;
  timeLeftMs: number | null = null;
  endedByHost = false;

  private endsAt = 0;
  private timerRev = 0;
  private defuseStartedAt = 0;
  private phaseEndsAt = 0;
  private readonly wrongCounts: number[];
  private readonly clock: Clock;
  private readonly rng: () => number;
  private timer: unknown = null;
  private wireSeq = 0;
  private readonly onChange: () => void;
  private readonly onActivity: (playerId: string) => void;
  private readonly onFinish: (game: BombGame) => void;
  private readonly disconnectTimers = new Map<string, unknown>();

  constructor(quiz: Quiz, settings: BombGameSettings, opts: BombOptions = {}) {
    if (quiz.questions.length === 0) throw new GameError("This quiz has no questions");
    if (settings.game !== "together" && settings.game !== "race") throw new GameError("Unknown Bomb Squad game");
    if (!(BOMB_MODULES as readonly number[]).includes(settings.modules)) throw new GameError("Unsupported modules per squad");
    if (!(BOMB_WIRES as readonly number[]).includes(settings.wires)) throw new GameError("Unsupported wires per module");
    if (!(BOMB_MINUTES as readonly number[]).includes(settings.minutes)) throw new GameError("Unsupported bomb timer");
    if (!(BOMB_PENALTIES as readonly number[]).includes(settings.penaltySec)) throw new GameError("Unsupported wrong-cut penalty");
    this.quizId = quiz.id;
    this.title = quiz.title;
    this.questions = quiz.questions;
    this.settings = settings;
    this.wrongCounts = quiz.questions.map(() => 0);
    this.clock = opts.clock ?? realClock;
    this.rng = opts.rng ?? Math.random;
    this.onChange = opts.onChange ?? (() => {});
    this.onActivity = opts.onActivity ?? (() => this.onChange());
    this.onFinish = opts.onFinish ?? (() => {});
  }

  static fromLobby(lobby: Game, opts: BombOptions = {}): BombGame {
    const game = new BombGame(lobby.quiz, { ...lobby.bomb, squads: lobby.teamCount() ?? 1, shuffleAnswers: lobby.shuffle.answers }, opts);
    const teams = lobby.teamAssignment();
    for (const p of lobby.players.values()) {
      game.roster.adopt(game.newPlayer({ id: p.id, nickname: p.nickname, token: p.token, connected: p.connected, avatar: p.avatar }, teams.get(p.id) ?? 0));
    }
    return game;
  }

  get players(): Map<string, BombPlayer> {
    return this.roster.players;
  }

  /** The fewest squads that keep a class of `players` at BOMB_MAX_PER_SQUAD or under (at least 2 in Race). */
  static recommendSquads(players: number, game: BombSettings["game"]): number {
    const fewest = Math.max(1, Math.ceil(Math.max(0, players) / BOMB_MAX_PER_SQUAD));
    const squads = game === "race" ? Math.max(2, fewest) : fewest;
    return Math.min(BOMB_MAX_SQUADS, squads);
  }

  // ---------- lifecycle ----------

  start(): void {
    if (this.players.size === 0) throw new GameError("Wait for at least one player to join");
    if (this.phase !== "countdown") throw new GameError("The game has already started");
    const count = Math.max(1, Math.min(this.settings.squads, this.players.size));
    if (this.settings.game === "race" && count < 2) throw new GameError("Race needs at least 2 squads");
    this.settings.squads = count;
    this.squads = Array.from({ length: count }, (_, i) => this.newSquad(i));
    for (const p of this.players.values()) if (p.squad >= count) p.squad = this.smallestOpenSquad();
    this.phaseEndsAt = this.clock.now() + BOMB_COUNTDOWN_MS;
    this.arm(BOMB_COUNTDOWN_MS, () => this.beginDefuse());
    this.onChange();
  }

  /** Host ends the game now. Unfinished squads count as exploded, without the explosion cinematic. */
  end(): void {
    if (this.phase === "podium") return;
    this.endedByHost = true;
    for (const s of this.squads) if (!s.finished && !s.exploded) this.markExploded(s);
    if (this.outcome === null) {
      const finished = this.squads.filter((s) => s.finished).length;
      this.outcome = this.settings.game === "together" ? (finished === this.squads.length && finished > 0 ? "defused" : "exploded") : finished > 0 ? "defused" : "exploded";
    }
    this.enterPodium();
  }

  dispose(): void {
    this.clearTimer();
    for (const handle of this.disconnectTimers.values()) this.clock.clearTimeout(handle);
    this.disconnectTimers.clear();
  }

  private newSquad(index: number): Squad {
    const info = teamInfo(index);
    return {
      index,
      name: info.name,
      color: info.color,
      deck: [],
      lastQ: -1,
      question: null,
      clearedInModule: 0,
      modulesCleared: 0,
      finished: false,
      exploded: false,
      finishMs: null,
      timeLeftMs: 0,
      endsAt: 0,
      timerRev: 0,
      wrongCuts: 0,
      timeLostMs: 0,
      hold: null,
      pauseUntil: 0,
      afterPause: null,
      status: null,
      statusUntil: 0,
      reveal: null,
      flash: null,
      flashSeq: 0,
    };
  }

  private newPlayer(base: BasePlayer, squad: number): BombPlayer {
    return {
      ...base,
      squad,
      satOut: false,
      disconnectedAt: 0,
      wiresHeld: 0,
      rightHeld: 0,
      extras: 0,
      rightCuts: 0,
      wrongCuts: 0,
      keypadRight: 0,
      keypadWrong: 0,
      firstTry: 0,
      timeLostMs: 0,
    };
  }

  private beginDefuse(): void {
    const now = this.clock.now();
    this.phase = "defuse";
    this.defuseStartedAt = now;
    this.endsAt = now + this.settings.minutes * 60_000;
    this.timerRev = 1;
    for (const s of this.squads) {
      s.endsAt = this.endsAt;
      s.timerRev = 1;
      this.dealNext(s);
    }
    this.armDefuse();
    this.onChange();
  }

  private arm(ms: number, then: () => void): void {
    this.clearTimer();
    this.timer = this.clock.setTimeout(then, Math.max(0, ms));
  }

  private clearTimer(): void {
    if (this.timer !== null) this.clock.clearTimeout(this.timer);
    this.timer = null;
  }

  /** One clock for the next thing that happens: a squad's pause, a re-deal, or a bomb timer. */
  private armDefuse(): void {
    if (this.phase !== "defuse") return;
    const now = this.clock.now();
    let next = Infinity;
    const consider = (t: number) => {
      if (t > now && t < next) next = t;
    };
    if (this.settings.game === "together") {
      if (this.squads.some((s) => !s.finished && !s.exploded)) consider(this.endsAt);
    }
    for (const s of this.squads) {
      if (s.pauseUntil) consider(s.pauseUntil);
      if (s.statusUntil) consider(s.statusUntil);
      if (this.settings.game === "race" && !s.finished && !s.exploded) consider(s.endsAt);
    }
    if (next === Infinity) return;
    this.arm(next - now, () => this.onTick());
  }

  private onTick(): void {
    this.timer = null;
    if (this.phase !== "defuse") return;
    const now = this.clock.now();
    if (this.settings.game === "together") {
      if (this.squads.some((s) => !s.finished && !s.exploded) && now >= this.endsAt) {
        this.enterExploded();
        return;
      }
    } else {
      for (const s of this.squads) {
        if (!s.finished && !s.exploded && now >= s.endsAt) this.markExploded(s);
      }
      if (this.squads.every((s) => s.finished || s.exploded)) {
        this.enterEnding();
        return;
      }
    }
    for (const s of this.squads) {
      if (s.statusUntil && now >= s.statusUntil) {
        s.statusUntil = 0;
        if (!s.finished && !s.exploded && !s.pauseUntil) s.status = null;
      }
      if (s.pauseUntil && now >= s.pauseUntil) {
        const next = s.afterPause;
        s.pauseUntil = 0;
        s.afterPause = null;
        s.reveal = null;
        if (next === "finish") this.finishSquad(s);
        else if (next === "next") this.dealNext(s);
      }
    }
    if (this.phase === "defuse") this.armDefuse();
    this.onChange();
  }

  // ---------- questions ----------

  private squadPlayers(squad: Squad): BombPlayer[] {
    return [...this.players.values()].filter((p) => p.squad === squad.index);
  }

  private dealNext(squad: Squad): void {
    if (squad.finished || squad.exploded || this.phase === "podium") return;
    for (const p of this.squadPlayers(squad)) p.satOut = false;
    const q = this.takeQuestion(squad);
    const shown = this.settings.shuffleAnswers && q.type === "multiple_choice" ? shuffleOptions(q, this.rng) : q;
    squad.question = {
      seq: ++this.wireSeq,
      qIndex: this.questions.indexOf(q),
      type: q.type,
      text: q.text,
      ...(q.image ? { image: q.image } : {}),
      answers: shown.correct.map((i) => shown.options[i]!),
      wires: [],
      wrongOnThis: 0,
      keypadLockUntil: 0,
    };
    // indexOf fails if shuffle copied the question. Find by id.
    squad.question.qIndex = this.questions.findIndex((item) => item.id === q.id);
    squad.reveal = null;
    squad.status = null;
    squad.statusUntil = 0;
    squad.hold = null;
    if (q.type !== "text") this.layWires(squad, shown);
  }

  private takeQuestion(squad: Squad): Question {
    if (squad.deck.length === 0) {
      squad.deck = shuffle(this.questions.map((_, i) => i), this.rng);
      if (squad.deck.length > 1 && squad.deck[0] === squad.lastQ) squad.deck.push(squad.deck.shift()!);
    }
    const qIndex = squad.deck.shift()!;
    squad.lastQ = qIndex;
    return this.questions[qIndex]!;
  }

  private layWires(squad: Squad, q: Question): void {
    const question = squad.question!;
    const players = this.holders(squad);
    const kind = q.type === "true_false" ? "true_false" : q.type === "pin" ? "pin" : "multiple_choice";
    const options: DealOption[] = q.options.map((label, index) => ({
      index,
      label,
      correct: q.correct.includes(index),
      ...(q.spots?.[index] ? { spot: q.spots[index] } : {}),
    }));
    const dealt = dealBombWires({
      players,
      options,
      kind,
      decoys: kind === "multiple_choice" ? this.decoyLabels(question.qIndex, q.options) : [],
      rng: this.rng,
    });
    question.wires = dealt.map((w) => ({ ...w, id: `w${question.seq}-${this.wireSeq}-${w.playerId}-${w.optionIndex}-${w.label}`, cut: false }));
    // wire ids must be unique even when two copies share a label.
    question.wires.forEach((w, i) => {
      w.id = `w${question.seq}-${i}`;
    });
    this.noteHeld(question.wires);
  }

  private holders(squad: Squad): DealPlayer[] {
    return this.squadPlayers(squad)
      .filter((p) => p.connected && !p.satOut)
      .map((p) => ({ id: p.id, rightHolds: p.rightHeld, extras: p.extras }));
  }

  private noteHeld(wires: LiveWire[]): void {
    const counts = new Map<string, number>();
    for (const w of wires) {
      if (w.cut) continue;
      const p = this.players.get(w.playerId);
      if (!p) continue;
      p.wiresHeld++;
      if (w.correct) p.rightHeld++;
      counts.set(p.id, (counts.get(p.id) ?? 0) + 1);
    }
    for (const [id, n] of counts) if (n > 1) this.players.get(id)!.extras += n - 1;
  }

  private undoHeld(wires: LiveWire[]): void {
    const counts = new Map<string, number>();
    for (const w of wires) {
      if (w.cut) continue;
      const p = this.players.get(w.playerId);
      if (!p) continue;
      p.wiresHeld = Math.max(0, p.wiresHeld - 1);
      if (w.correct) p.rightHeld = Math.max(0, p.rightHeld - 1);
      counts.set(p.id, (counts.get(p.id) ?? 0) + 1);
    }
    for (const [id, n] of counts) if (n > 1) {
      const p = this.players.get(id)!;
      p.extras = Math.max(0, p.extras - (n - 1));
    }
  }

  /** Wrong answers from other questions, for decoy wires. Typed answers and pin labels are left out. */
  private decoyLabels(qIndex: number, current: string[]): string[] {
    const skip = new Set(current.map((s) => s.toLowerCase()));
    const out: string[] = [];
    this.questions.forEach((q, i) => {
      if (i === qIndex || q.type === "text" || q.type === "pin") return;
      q.options.forEach((label, oi) => {
        if (q.correct.includes(oi)) return;
        const key = label.toLowerCase();
        if (skip.has(key)) return;
        skip.add(key);
        out.push(label);
      });
    });
    return out;
  }

  /**
   * Move stranded wires (held by players gone for BOMB_REDEAL_MS, or kicked) to connected teammates,
   * and give a copy of a wrong wire to any connected player left with none. Everyone else keeps their wires.
   */
  private redealSquad(squad: Squad | undefined): void {
    if (!squad || this.phase !== "defuse" || squad.finished || squad.exploded) return;
    const q = squad.question;
    if (!q || q.type === "text" || squad.pauseUntil) return;
    const now = this.clock.now();
    const gone = (id: string) => {
      const p = this.players.get(id);
      return !p || (!p.connected && now - p.disconnectedAt >= BOMB_REDEAL_MS);
    };
    let players = this.holders(squad);
    if (players.length === 0) {
      const anyone = this.squadPlayers(squad).filter((p) => p.connected);
      if (anyone.length === 0) return;
      for (const p of anyone) p.satOut = false;
      players = this.holders(squad);
    }
    const held = new Map<string, number>();
    for (const w of q.wires) if (!w.cut && !gone(w.playerId)) held.set(w.playerId, (held.get(w.playerId) ?? 0) + 1);
    const before = new Map(held);
    const stranded = q.wires.filter((w) => !w.cut && gone(w.playerId));
    const bareBefore = players.some((p) => !held.get(p.id));
    if (stranded.length === 0 && !bareBefore) return;
    this.undoHeld(stranded);

    const liveRight = new Map(players.map((p) => [p.id, p.rightHolds]));
    const pick = (score: (p: DealPlayer) => number) => {
      let best = Infinity;
      for (const p of players) best = Math.min(best, score(p));
      const tied = players.filter((p) => score(p) === best);
      return tied[Math.floor(this.rng() * tied.length)]!;
    };
    const given: LiveWire[] = [];
    const hand = (w: LiveWire, id: string) => {
      w.playerId = id;
      held.set(id, (held.get(id) ?? 0) + 1);
      if (w.correct) liveRight.set(id, (liveRight.get(id) ?? 0) + 1);
      given.push(w);
    };
    for (const w of stranded) if (w.correct) hand(w, pick((p) => liveRight.get(p.id) ?? 0).id);
    for (const w of stranded) if (!w.correct) hand(w, pick((p) => (held.get(p.id) ?? 0) * 1000 + p.extras).id);

    const uncut = q.wires.filter((w) => !w.cut);
    const wrongs = uncut.filter((w) => !w.correct);
    const source = wrongs.length > 0 ? wrongs : uncut;
    players
      .filter((p) => !held.get(p.id))
      .forEach((p, i) => {
        const src = source[i % Math.max(1, source.length)];
        if (!src) return;
        const copy: LiveWire = { ...src, id: `w${q.seq}-x${q.wires.length}`, copy: true, cut: false };
        q.wires.push(copy);
        hand(copy, p.id);
      });

    for (const w of given) {
      const p = this.players.get(w.playerId)!;
      p.wiresHeld++;
      if (w.correct) p.rightHeld++;
    }
    for (const [id, n] of held) {
      const was = before.get(id) ?? 0;
      if (n === was) continue;
      const p = this.players.get(id);
      if (p) p.extras += Math.max(0, n - 1) - Math.max(0, was - 1);
    }
    if (squad.hold && !q.wires.some((w) => w.id === squad.hold!.wireId && !w.cut && w.playerId === squad.hold!.playerId)) squad.hold = null;
  }

  // ---------- cuts ----------

  hold(playerId: string, wireId: string, holding: boolean): boolean {
    const p = this.players.get(playerId);
    const squad = p && this.squads[p.squad];
    if (!p || !squad || this.phase !== "defuse" || squad.finished || squad.exploded || squad.pauseUntil) return false;
    if (!holding) {
      if (squad.hold?.playerId === playerId) {
        squad.hold = null;
        this.onChange();
      }
      return true;
    }
    if (squad.hold && squad.hold.playerId !== playerId) return false;
    const wire = squad.question?.wires.find((w) => w.id === wireId && !w.cut && w.playerId === playerId);
    if (!wire) return false;
    squad.hold = { playerId, wireId, startedAt: this.clock.now() };
    this.onActivity(playerId);
    this.onChange();
    return true;
  }

  cut(playerId: string, wireId: string): boolean {
    const p = this.players.get(playerId);
    const squad = p && this.squads[p.squad];
    if (!p || !squad || this.phase !== "defuse") return false;
    const hold = squad.hold;
    if (!hold || hold.playerId !== playerId || hold.wireId !== wireId) return false;
    if (this.clock.now() < hold.startedAt + BOMB_HOLD_MS - BOMB_HOLD_GRACE_MS) return false;
    const wire = squad.question?.wires.find((w) => w.id === wireId && !w.cut && w.playerId === playerId);
    squad.hold = null;
    if (!wire || !squad.question || squad.pauseUntil || squad.finished || squad.exploded) {
      this.onChange();
      return false;
    }
    if (wire.correct) this.clearQuestion(squad, p, "cut");
    else this.wrongWire(squad, p, wire);
    return true;
  }

  type(playerId: string, text: string): boolean {
    const p = this.players.get(playerId);
    const squad = p && this.squads[p.squad];
    const q = squad?.question;
    if (!p || !squad || !q || q.type !== "text" || this.phase !== "defuse" || squad.pauseUntil || squad.finished || squad.exploded) return false;
    if (this.clock.now() < q.keypadLockUntil) return false;
    const source = this.questions[q.qIndex]!;
    const correct = checkAnswer(source, text.slice(0, MAX_TYPED_ANSWER));
    if (correct === null) return false;
    if (correct) this.clearQuestion(squad, p, "keypad");
    else {
      p.keypadWrong++;
      p.wrongCuts++;
      squad.wrongCuts++;
      q.wrongOnThis++;
      this.wrongCounts[q.qIndex]!++;
      q.keypadLockUntil = this.clock.now() + BOMB_KEYPAD_LOCK_MS;
      squad.status = `Wrong answer! −${this.settings.penaltySec} s`;
      squad.statusUntil = this.clock.now() + 2000;
      this.flash(squad, "wrong", this.settings.penaltySec);
      const exploded = this.applyPenalty(squad, p);
      if (!exploded) {
        this.armDefuse();
        this.onChange();
      }
    }
    return true;
  }

  private clearQuestion(squad: Squad, p: BombPlayer, via: "cut" | "keypad"): void {
    const q = squad.question!;
    if (via === "cut") p.rightCuts++;
    else p.keypadRight++;
    if (q.wrongOnThis === 0) {
      for (const w of q.wires) if (w.correct) this.players.get(w.playerId)!.firstTry++;
    }
    squad.clearedInModule++;
    let clearedModule = false;
    if (squad.clearedInModule >= this.settings.wires) {
      squad.clearedInModule = 0;
      squad.modulesCleared++;
      clearedModule = true;
    }
    const done = squad.modulesCleared >= this.settings.modules;
    squad.reveal = q.answers;
    squad.status = clearedModule ? "Module clear!" : "Snip! ✓";
    squad.statusUntil = 0;
    squad.pauseUntil = this.clock.now() + BOMB_NEXT_MS;
    squad.afterPause = done ? "finish" : "next";
    squad.hold = null;
    this.flash(squad, clearedModule ? "module" : "snip", null);
    this.armDefuse();
    this.onChange();
  }

  private wrongWire(squad: Squad, p: BombPlayer, wire: LiveWire): void {
    const q = squad.question!;
    wire.cut = true;
    // Copies of the same wrong answer go too, so one slip can't cost time twice.
    for (const w of q.wires) {
      if (!w.cut && !w.correct && w.optionIndex === wire.optionIndex && (w.optionIndex >= 0 || w.label === wire.label)) w.cut = true;
    }
    p.wrongCuts++;
    squad.wrongCuts++;
    q.wrongOnThis++;
    this.wrongCounts[q.qIndex]!++;
    squad.status = `Wrong wire! −${this.settings.penaltySec} s`;
    squad.statusUntil = this.clock.now() + 2000;
    this.flash(squad, "wrong", this.settings.penaltySec);
    const exploded = this.applyPenalty(squad, p);
    if (!exploded) {
      this.armDefuse();
      this.onChange();
    }
  }

  private flash(squad: Squad, kind: "wrong" | "snip" | "module", penaltySec: number | null): void {
    squad.flash = { seq: ++squad.flashSeq, kind, penaltySec };
  }

  /** @returns true when the bomb (or this squad's bomb) just exploded. */
  private applyPenalty(squad: Squad, p: BombPlayer): boolean {
    const pen = this.settings.penaltySec * 1000;
    p.timeLostMs += pen;
    squad.timeLostMs += pen;
    if (this.settings.game === "together") {
      this.endsAt -= pen;
      this.timerRev++;
      for (const s of this.squads) {
        s.endsAt = this.endsAt;
        s.timerRev = this.timerRev;
      }
      if (this.endsAt <= this.clock.now()) {
        this.enterExploded();
        return true;
      }
    } else {
      squad.endsAt -= pen;
      squad.timerRev++;
      // The projector's ticks follow the soonest squad, so they re-sync on any squad's penalty.
      this.timerRev++;
      if (squad.endsAt <= this.clock.now()) {
        this.markExploded(squad);
        if (this.squads.every((s) => s.finished || s.exploded)) this.enterEnding();
        else {
          this.armDefuse();
          this.onChange();
        }
        return true;
      }
    }
    return false;
  }

  private finishSquad(squad: Squad): void {
    if (squad.finished || squad.exploded) return;
    squad.finished = true;
    squad.finishMs = Math.max(0, this.clock.now() - this.defuseStartedAt);
    squad.timeLeftMs = Math.max(0, (this.settings.game === "together" ? this.endsAt : squad.endsAt) - this.clock.now());
    squad.question = null;
    squad.hold = null;
    squad.reveal = null;
    squad.status = this.settings.game === "together" ? "Your modules are done! Cheer on the others." : "You defused your bomb!";
    if (this.settings.game === "together") {
      if (this.squads.every((s) => s.finished)) this.enterDefused();
    } else if (this.squads.every((s) => s.finished || s.exploded)) {
      this.enterEnding();
    }
  }

  private markExploded(squad: Squad): void {
    if (squad.exploded) return;
    squad.exploded = true;
    squad.finished = false;
    squad.timeLeftMs = 0;
    squad.question = null;
    squad.hold = null;
    squad.pauseUntil = 0;
    squad.afterPause = null;
    squad.reveal = null;
    squad.status = "BOOM! The bomb exploded.";
  }

  private enterDefused(): void {
    if (this.phase === "defused" || this.phase === "exploded" || this.phase === "podium") return;
    this.outcome = "defused";
    if (this.settings.game === "race") {
      const winner = this.squads.filter((s) => s.finished).sort((a, b) => (a.finishMs ?? 0) - (b.finishMs ?? 0))[0];
      this.timeLeftMs = winner?.timeLeftMs ?? 0;
    } else {
      this.timeLeftMs = Math.max(0, this.endsAt - this.clock.now());
      for (const s of this.squads) if (s.finished) s.timeLeftMs = this.timeLeftMs;
    }
    this.phase = "defused";
    this.phaseEndsAt = this.clock.now() + BOMB_RESULT_MS;
    this.arm(BOMB_RESULT_MS, () => this.enterPodium());
    this.onChange();
  }

  private enterExploded(): void {
    if (this.phase === "defused" || this.phase === "exploded" || this.phase === "podium") return;
    for (const s of this.squads) if (!s.finished) this.markExploded(s);
    this.outcome = "exploded";
    this.timeLeftMs = 0;
    this.phase = "exploded";
    this.phaseEndsAt = this.clock.now() + BOMB_RESULT_MS;
    this.arm(BOMB_RESULT_MS, () => this.enterPodium());
    this.onChange();
  }

  /** Race: someone won, or every bomb is done. */
  private enterEnding(): void {
    if (this.squads.some((s) => s.finished)) this.enterDefused();
    else this.enterExploded();
  }

  private enterPodium(): void {
    if (this.phase === "podium") return;
    if (this.outcome === null) this.outcome = this.squads.every((s) => s.finished) ? "defused" : "exploded";
    this.clearTimer();
    for (const handle of this.disconnectTimers.values()) this.clock.clearTimeout(handle);
    this.disconnectTimers.clear();
    for (const s of this.squads) s.hold = null;
    this.phase = "podium";
    this.phaseEndsAt = 0;
    this.onFinish(this);
    this.onChange();
  }

  // ---------- players ----------

  join(rawNickname: unknown, avatar?: AvatarChoice | null): BombPlayer {
    const open = this.squads.some((s) => !s.finished && !s.exploded);
    const squad = this.phase === "countdown" || (this.phase === "defuse" && open) ? this.smallestOpenSquad() : -1;
    const player = this.roster.add(rawNickname, avatar ?? randomAvatar(this.rng), (base) => this.newPlayer(base, squad));
    if (squad >= 0 && this.phase === "defuse") {
      const s = this.squads[squad]!;
      if (s.question && !s.pauseUntil) player.satOut = true;
    }
    this.onChange();
    return player;
  }

  private smallestOpenSquad(): number {
    const open = this.squads.filter((s) => !s.finished && !s.exploded);
    const pool = open.length > 0 ? open : this.squads;
    if (pool.length === 0) return 0;
    let best = pool[0]!.index;
    let size = Infinity;
    for (const s of pool) {
      const n = this.squadPlayers(s).length;
      if (n < size) {
        size = n;
        best = s.index;
      }
    }
    return best;
  }

  byToken(token: unknown): BombPlayer | null {
    return this.roster.byToken(token);
  }

  setConnected(playerId: string, connected: boolean): void {
    const p = this.players.get(playerId);
    if (!p || p.connected === connected) return;
    p.connected = connected;
    const squad = this.squads[p.squad];
    if (!connected) {
      p.disconnectedAt = this.clock.now();
      if (squad?.hold?.playerId === playerId) squad.hold = null;
      const prev = this.disconnectTimers.get(playerId);
      if (prev) this.clock.clearTimeout(prev);
      const handle = this.clock.setTimeout(() => {
        this.disconnectTimers.delete(playerId);
        if (!p.connected) this.redealSquad(squad);
        if (this.phase === "defuse") this.armDefuse();
        this.onChange();
      }, BOMB_REDEAL_MS);
      this.disconnectTimers.set(playerId, handle);
    } else {
      p.disconnectedAt = 0;
      const prev = this.disconnectTimers.get(playerId);
      if (prev) this.clock.clearTimeout(prev);
      this.disconnectTimers.delete(playerId);
      if (squad) this.redealSquad(squad);
    }
    if (this.phase === "defuse") this.armDefuse();
    this.onChange();
  }

  kick(playerId: string): BombPlayer | null {
    const p = this.roster.remove(playerId);
    if (!p) return null;
    const prev = this.disconnectTimers.get(playerId);
    if (prev) this.clock.clearTimeout(prev);
    this.disconnectTimers.delete(playerId);
    const squad = this.squads[p.squad];
    if (squad?.hold?.playerId === playerId) squad.hold = null;
    if (squad) this.redealSquad(squad);
    this.onChange();
    return p;
  }

  // ---------- results ----------

  rankedSquads(): (Squad & { rank: number })[] {
    const ranked = [...this.squads].sort((a, b) => {
      if (a.finished !== b.finished) return a.finished ? -1 : 1;
      if (a.finished && b.finished && a.finishMs !== b.finishMs) return (a.finishMs ?? 0) - (b.finishMs ?? 0);
      if (a.modulesCleared !== b.modulesCleared) return b.modulesCleared - a.modulesCleared;
      if (a.wrongCuts !== b.wrongCuts) return a.wrongCuts - b.wrongCuts;
      return a.index - b.index;
    });
    let rank = 0;
    let prev = "";
    return ranked.map((s, i) => {
      const key = `${s.finished ? 1 : 0}:${s.finishMs ?? ""}:${s.modulesCleared}:${s.wrongCuts}`;
      if (key !== prev) {
        rank = i + 1;
        prev = key;
      }
      return { ...s, rank };
    });
  }

  awards(): BombAwards {
    const players = [...this.players.values()];
    const named = (pool: BombPlayer[], value: number): BombAwards["steadyHands"] =>
      value == null ? null : { value, nicknames: pool.map((p) => p.nickname) };
    const most = (score: (p: BombPlayer) => number): BombAwards["steadyHands"] => {
      if (players.length === 0) return null;
      const value = Math.max(...players.map(score));
      if (value <= 0) return null;
      return named(players.filter((p) => score(p) === value), value);
    };
    const carefulPool = players.filter((p) => p.rightCuts >= 2);
    let careful: BombAwards["carefulCutter"] = null;
    if (carefulPool.length > 0) {
      const value = Math.min(...carefulPool.map((p) => p.wrongCuts));
      careful = { value, nicknames: carefulPool.filter((p) => p.wrongCuts === value).map((p) => p.nickname) };
    }
    return { steadyHands: most((p) => p.rightCuts), carefulCutter: careful, teamPlayer: most((p) => p.firstTry) };
  }

  errors() {
    return topErrors(this.questions, this.wrongCounts);
  }

  headline(): string {
    const cleared = this.squads.reduce((n, s) => n + s.modulesCleared, 0);
    const total = this.squads.length * this.settings.modules;
    if (this.settings.game === "race" && this.squads.some((s) => s.finished)) {
      const winner = this.rankedSquads()[0];
      return winner ? `${winner.name} defused their bomb!` : "Bomb defused!";
    }
    if (this.outcome === "defused") return `Defused with ${formatClock(this.timeLeftMs ?? 0)} left`;
    return `Exploded with ${cleared} of ${total} modules cleared`;
  }

  // ---------- views ----------

  hostView(): HostBombState {
    const now = this.clock.now();
    const podium = this.phase === "podium";
    const ranks = new Map(this.rankedSquads().map((s) => [s.index, s.rank]));
    const single = this.squads.length === 1;
    const squadView = (s: Squad): HostBombSquad => {
      const q = s.question;
      const showQ = single && q && !s.finished && !s.exploded;
      return {
        index: s.index,
        name: s.name,
        color: s.color,
        remainingMs: this.remaining(s, now),
        timerRev: s.timerRev,
        modules: this.moduleViews(s),
        modulesCleared: s.modulesCleared,
        finished: s.finished,
        exploded: s.exploded,
        wrongCuts: s.wrongCuts,
        rank: podium && this.settings.game === "race" ? (ranks.get(s.index) ?? null) : null,
        question: showQ
          ? { text: q.text, ...(q.image ? { image: q.image } : {}), reveal: s.reveal }
          : null,
        flash: s.flash,
      };
    };
    const active = this.squads.filter((s) => !s.finished && !s.exploded);
    const soonest = active.length > 0 ? Math.min(...active.map((s) => this.remaining(s, now))) : this.timeLeftMs ?? 0;
    return {
      kind: "bomb",
      phase: this.phase,
      quiz: { id: this.quizId, title: this.title, questionCount: this.questions.length },
      settings: { game: this.settings.game, squads: this.squads.length || this.settings.squads, modules: this.settings.modules, wires: this.settings.wires, minutes: this.settings.minutes, penaltySec: this.settings.penaltySec },
      remainingMs: this.phase === "countdown" ? Math.max(0, this.phaseEndsAt - now) : soonest,
      timerRev: this.timerRev,
      durationMs: this.settings.minutes * 60_000,
      phaseRemainingMs: this.phaseEndsAt ? Math.max(0, this.phaseEndsAt - now) : 0,
      squads: this.squads.map(squadView),
      outcome: this.outcome,
      timeLeftMs: this.timeLeftMs,
      headline: this.outcome ? this.headline() : null,
      modulesCleared: this.squads.reduce((n, s) => n + s.modulesCleared, 0),
      modulesTotal: this.squads.length * this.settings.modules,
      playerCount: this.players.size,
      connectedCount: [...this.players.values()].filter((p) => p.connected).length,
      awards: podium ? this.awards() : null,
      errors: podium ? this.errors() : null,
      hasResults: podium,
    };
  }

  playerView(playerId: string): PlayerBombView {
    const p = this.players.get(playerId);
    const now = this.clock.now();
    const squad = p && p.squad >= 0 ? this.squads[p.squad] : undefined;
    const podium = this.phase === "podium";
    const base = {
      kind: "bomb" as const,
      phase: this.phase,
      title: this.title,
      game: this.settings.game,
      durationMs: this.settings.minutes * 60_000,
      me: { id: p?.id ?? "", nickname: p?.nickname ?? "", avatar: p?.avatar ?? { avatar: "cat", accessory: "none" } },
    };
    if (!p || !squad) {
      return {
        ...base,
        remainingMs: 0,
        timerRev: 0,
        me: { id: p?.id ?? "", nickname: p?.nickname ?? "", avatar: p?.avatar ?? base.me.avatar },
        squad: null,
        squadState: "waiting",
        question: null,
        wires: [],
        keypad: false,
        cutting: null,
        cutLocked: false,
        status: p ? "The squads are already finished. Watch for the results." : null,
        reveal: null,
        result: podium && this.outcome ? { outcome: this.outcome, headline: this.headline(), rank: null, squads: this.squads.length, awards: [] } : null,
      };
    }
    const q = squad.question;
    const mine = (q?.wires ?? []).filter((w) => w.playerId === p.id && !w.cut);
    const wires: PlayerBombWire[] = mine.map((w) => ({ id: w.id, label: w.label, color: w.color, ...(w.spot ? { spot: w.spot } : {}) }));
    const hold = squad.hold;
    const holder = hold ? this.players.get(hold.playerId) : undefined;
    const heldWire = hold && q ? q.wires.find((w) => w.id === hold.wireId) : undefined;
    const cutting = holder && heldWire ? { name: holder.nickname, detail: this.cutDetail(heldWire), mine: holder.id === p.id } : null;
    const showQuestion = q && !squad.finished && !squad.exploded && this.phase === "defuse";
    let squadState: PlayerBombView["squadState"] = "playing";
    if (squad.exploded || this.phase === "exploded") squadState = "exploded";
    else if (this.phase === "defused" || (squad.finished && this.settings.game === "race")) squadState = "defused";
    else if (squad.finished) squadState = "cheer";
    const awards = podium ? this.awardNames(p) : [];
    const rank = podium && this.settings.game === "race" ? (this.rankedSquads().find((s) => s.index === squad.index)?.rank ?? null) : null;
    return {
      ...base,
      remainingMs: this.remaining(squad, now),
      timerRev: squad.timerRev,
      squad: { index: squad.index, name: squad.name, color: squad.color },
      squadState,
      question: showQuestion ? { seq: q.seq, type: q.type, text: q.text, ...(q.image ? { image: q.image } : {}) } : null,
      wires: showQuestion && q.type !== "text" ? wires : [],
      keypad: !!showQuestion && q.type === "text" && !squad.reveal,
      cutting: this.phase === "defuse" ? cutting : null,
      cutLocked: !!cutting && !cutting.mine,
      status: squad.status,
      reveal: squad.reveal,
      result:
        this.outcome && (podium || this.phase === "defused" || this.phase === "exploded" || squad.exploded)
          ? { outcome: squad.exploded && this.settings.game === "race" ? "exploded" : this.outcome, headline: this.headline(), rank, squads: this.squads.length, awards }
          : null,
    };
  }

  private awardNames(p: BombPlayer): string[] {
    const a = this.awards();
    const names: string[] = [];
    if (a.steadyHands?.nicknames.includes(p.nickname)) names.push("Steady Hands");
    if (a.carefulCutter?.nicknames.includes(p.nickname)) names.push("Careful Cutter");
    if (a.teamPlayer?.nicknames.includes(p.nickname)) names.push("Team Player");
    return names;
  }

  private cutDetail(wire: LiveWire): string {
    if (wire.spot) return wire.label;
    return `the ${wire.color} wire`;
  }

  private remaining(squad: Squad, now: number): number {
    if (this.phase === "countdown") return Math.max(0, this.phaseEndsAt - now);
    if (this.phase === "defused") return this.settings.game === "race" ? squad.timeLeftMs : (this.timeLeftMs ?? 0);
    if (this.phase === "exploded" || this.phase === "podium") return squad.exploded ? 0 : squad.timeLeftMs;
    if (squad.exploded) return 0;
    if (squad.finished && this.settings.game === "race") return squad.timeLeftMs;
    return Math.max(0, (this.settings.game === "together" ? this.endsAt : squad.endsAt) - now);
  }

  private moduleViews(squad: Squad): HostBombModule[] {
    const panel: BombPanel = squad.question?.type === "text" ? "keypad" : squad.question?.type === "pin" ? "picture" : "wire";
    return Array.from({ length: this.settings.modules }, (_, i) => {
      const cleared = i < squad.modulesCleared;
      const active = i === squad.modulesCleared && !squad.finished && !squad.exploded && !!squad.question;
      return {
        lights: cleared ? this.settings.wires : active ? squad.clearedInModule : 0,
        total: this.settings.wires,
        cleared,
        active,
        panel: active ? panel : "wire",
      };
    });
  }
}

function formatClock(ms: number): string {
  const secs = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
}

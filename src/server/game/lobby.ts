import { cleanAvatar, randomAvatar, type AvatarChoice } from "../../shared/avatars.ts";
import { MODE_FLAGS } from "../../shared/mode-flags.ts";
import type { GameMode, HostGameState, ModeSettingsMap, Pacing, PlayerView, ShuffleOptions } from "../../shared/protocol.ts";
import type { Quiz } from "../../shared/quiz-schema.ts";
import { isSeasonTheme } from "../../shared/season-theme.ts";
import { assignTeams, GameError, teamInfo } from "./common.ts";
import type { LobbyFacts } from "./lobby-facts.ts";
import type { LiveGame, ModeEntry, ModeGame, RawSettings, StartContext } from "./mode-entry.ts";
import { entryOf, MODES } from "./modes.ts";
import { Roster, type BasePlayer } from "./roster.ts";

export interface LobbyChoices {
  mode: GameMode;
  settings: InitialSettings;
  protect: boolean;
  pacing: Pacing;
}

interface LobbyOptions extends Partial<LobbyChoices> {
  rng?: () => number;
  onChange?: () => void;
}

interface HandoffOptions extends StartContext {
  install: (game: LiveGame, activate: () => void) => void;
  log: (message: string) => void;
}

/** Owns the waiting players, host choices, team previews and transition into a game. */
export class Lobby {
  readonly phase = "lobby";
  readonly quizId: string;
  readonly title: string;
  private readonly roster = new Roster<BasePlayer>();
  private readonly rng: () => number;
  private readonly onChange: () => void;
  private manualTeams: Map<string, number> | null = null;
  private batch: { teams?: Map<string, number> } | null = null;
  mode: GameMode;
  settings: ModeSettingsMap;
  pacing: Pacing;
  shuffle: ShuffleOptions;
  protect: boolean;

  constructor(readonly quiz: Quiz, opts: LobbyOptions = {}) {
    this.quizId = quiz.id;
    this.title = quiz.title;
    this.rng = opts.rng ?? Math.random;
    this.onChange = opts.onChange ?? (() => {});
    this.mode = opts.mode ?? "classic";
    this.settings = initialSettings(opts.settings);
    this.pacing = opts.pacing ?? "manual";
    this.protect = opts.protect ?? true;
    this.shuffle = { questions: quiz.settings.shuffleQuestions, answers: quiz.settings.shuffleAnswers };
  }

  get players(): ReadonlyMap<string, BasePlayer> {
    return this.roster.players;
  }

  join(nickname: unknown, avatar?: AvatarChoice | null): BasePlayer {
    const player = this.roster.add(nickname, avatar ?? randomAvatar(this.rng), (base) => base);
    this.onChange();
    return player;
  }

  byToken(token: unknown): BasePlayer | null {
    return this.roster.byToken(token);
  }

  setConnected(playerId: string, connected: boolean): void {
    if (this.roster.setConnected(playerId, connected)) this.onChange();
  }

  kick(playerId: string): BasePlayer | null {
    const player = this.roster.remove(playerId);
    if (player) this.onChange();
    return player;
  }

  /** Change a player's character/accessory; only while waiting in the lobby. */
  setAvatar(playerId: string, avatar: unknown, accessory: unknown): void {
    const p = this.players.get(playerId);
    if (!p) return;
    const choice = cleanAvatar(avatar, accessory);
    if (!choice) throw new GameError("Unknown avatar");
    p.avatar = choice;
    this.onChange();
  }

  setShuffle(opts: ShuffleOptions): void {
    this.shuffle = { questions: !!opts.questions, answers: !!opts.answers };
    this.onChange();
  }

  setProtect(on: boolean): void {
    this.protect = !!on;
    this.onChange();
  }

  setMode(mode: GameMode): void {
    if (!Object.hasOwn(MODES, mode)) throw new GameError("Unknown game mode");
    this.mode = mode;
    this.onChange();
  }

  /** Change one mode's settings in the lobby; a partial change keeps the rest (and the theme) as they are. */
  setModeSettings(mode: GameMode, raw: unknown): void {
    if (!Object.hasOwn(MODES, mode)) throw new GameError("Unknown game mode");
    this.applySettings(mode, raw && typeof raw === "object" ? (raw as RawSettings) : {});
  }

  private applySettings<M extends GameMode>(mode: M, raw: RawSettings): void {
    const entry: ModeEntry<M> = MODES[mode];
    this.settings[mode] = entry.readSettings(raw, this.settings[mode]);
    this.onChange();
  }

  /** Teams in the lobby preview, as the selected mode's entry gives them for its settings; null in solo modes. */
  teamCount(): number | null {
    return this.teamsIn(this.mode);
  }

  /** Team index per player: round-robin by join order until the host moves someone, then the host's arrangement (newcomers join the smallest team). */
  teamAssignment(): Map<string, number> {
    const ids = [...this.players.keys()];
    const teamCount = this.teamCount();
    const count = teamCount ?? 1;
    const manual = this.manualTeams;
    if (!manual) {
      const teams = assignTeams(ids.length, count);
      return new Map(ids.map((id, i) => [id, teams[i]!]));
    }
    // Solo modes have no teams: leave the arrangement alone for when a team mode comes back.
    if (teamCount === null) return new Map(ids.map((id) => [id, 0]));
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
    const count = this.teamCount();
    if (count === null) throw new GameError("This game mode has no teams");
    if (!Number.isInteger(team) || team < 0 || team >= count) throw new GameError("Unknown team");
    if (!this.players.has(playerId)) throw new GameError("Unknown player");
    this.manualTeams ??= this.teamAssignment();
    this.manualTeams.set(playerId, team);
    this.onChange();
  }

  private teamsIn<M extends GameMode>(mode: M): number | null {
    const entry: ModeEntry<M> = MODES[mode];
    return entry.teams(this.settings[mode]);
  }

  setPacing(pacing: Pacing): void {
    this.pacing = pacing;
    this.onChange();
  }

  get choices(): LobbyChoices {
    return { mode: this.mode, settings: { ...this.settings }, protect: this.protect, pacing: this.pacing };
  }

  handoffFacts<M extends GameMode>(mode: M): LobbyFacts<M> {
    return {
      quiz: this.quiz,
      settings: this.settings[mode],
      lobbyView: { mode: this.mode, settings: { ...this.settings }, protect: this.protect },
      shuffle: { ...this.shuffle },
      protect: MODE_FLAGS[mode].protect && this.protect,
      pacing: this.pacing,
      players: [...this.players.values()],
      teams: this.teamAssignment(),
    };
  }

  start(pacing: Pacing | undefined, opts: HandoffOptions): void {
    if (this.players.size === 0) throw new GameError("Wait for at least one player to join");
    const game = this.installGame(this.mode, (game) => game.start(pacing), opts);
    this.pacing = entryOf(game).pacing?.(game).pacing ?? this.pacing;
  }

  /** The lobby's paced controls historically address Classic, even with another mode selected. */
  advanceClassic(action: "next" | "end", opts: HandoffOptions): void {
    if (action === "next" && this.players.size === 0) throw new GameError("Wait for at least one player to join");
    this.installGame("classic", (game) => game[action](), opts);
  }

  private installGame<M extends GameMode>(mode: M, activate: (game: ModeGame[M]) => void, { install, log, ...ctx }: HandoffOptions) {
    const entry: ModeEntry<M> = MODES[mode];
    const { game, log: line } = entry.start(this.handoffFacts(mode), ctx);
    // Starting a game can notify the hub immediately.
    install(game, () => activate(game));
    if (line) log(line);
    return game;
  }

  hostView(): HostGameState {
    const players = [...this.players.values()].map(({ id, nickname, avatar, connected }) => ({ id, nickname, avatar, score: 0, connected }));
    const count = this.teamCount();
    const assignment = count === null ? null : this.teamsNow();
    return {
      kind: "classic",
      phase: this.phase,
      mode: this.mode,
      settings: this.settings,
      teams: count === null ? null : Array.from({ length: count }, (_, i) => ({
        ...teamInfo(i),
        members: players.filter((player) => assignment?.get(player.id) === i),
      })),
      quiz: { id: this.quizId, title: this.title, questionCount: this.quiz.questions.length },
      pacing: this.pacing,
      shuffle: this.shuffle,
      protect: this.protect,
      players,
      question: null,
      correct: null,
      answeredCount: 0,
      answerCounts: null,
      answerAvatars: null,
      leaderboard: [],
      errors: null,
    };
  }

  playerView(playerId: string): PlayerView {
    const player = this.players.get(playerId);
    if (!player) return { kind: "none", game: { title: this.title, phase: this.phase } };
    const { id, nickname, avatar } = player;
    return {
      kind: "classic",
      phase: this.phase,
      title: this.title,
      me: { id, nickname, avatar, score: 0, rank: 1, streak: 0 },
      playerCount: this.players.size,
      question: null,
      myChoice: null,
      myText: null,
      result: null,
      podium: null,
      team: this.teamCount() === null ? null : teamInfo(this.teamsNow().get(id) ?? 0),
      ...(MODES[this.mode].lobbyBanner ? { banner: this.mode } : {}),
    };
  }

  viewBatch<T>(build: () => T): T {
    if (this.batch) return build();
    this.batch = {};
    try {
      return build();
    } finally {
      this.batch = null;
    }
  }

  private teamsNow(): Map<string, number> {
    return this.batch ? (this.batch.teams ??= this.teamAssignment()) : this.teamAssignment();
  }
}

type InitialSettings = {
  [M in GameMode]?: Partial<Omit<ModeSettingsMap[M], "theme">> &
    ("theme" extends keyof ModeSettingsMap[M] ? { theme?: string } : object);
};

/**
 * Every mode's settings: the given ones where there are any (carried over from the last lobby), else the defaults.
 * They are taken as they are, except that a theme the server no longer knows becomes the mode's default theme.
 */
function initialSettings(given: InitialSettings = {}): ModeSettingsMap {
  const read = <M extends GameMode>(mode: M): ModeSettingsMap[M] => {
    const defaults = MODES[mode].defaultSettings;
    return knownTheme(Object.assign({ ...defaults }, given[mode]), defaults);
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

/** The settings with an unknown theme replaced by the default one; settings without a theme stay as they are. */
function knownTheme<S extends object>(settings: S, defaults: S): S {
  if (!("theme" in settings) || isSeasonTheme(settings.theme) || !("theme" in defaults)) return settings;
  return { ...settings, theme: defaults.theme };
}


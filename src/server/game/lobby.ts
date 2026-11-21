import type { AvatarChoice } from "../../shared/avatars.ts";
import { cleanAvatar, randomAvatar } from "../../shared/avatars.ts";
import type { GameMode } from "../../shared/mode-entries.ts";
import type { Pacing } from "../../shared/mode-views.ts";
import type { HostLobbyView, ModeSettingsMap, PlayerView, ShuffleOptions } from "../../shared/protocol.ts";
import type { Quiz } from "../../shared/quiz-schema.ts";
import { isSeasonTheme } from "../../shared/themed-modes.ts";
import { assignTeams, GameError, teamInfo } from "./common.ts";
import type { LobbyFacts } from "./lobby-facts.ts";
import type { ModeEntry, RawSettings } from "./mode-entry.ts";
import { MODES } from "./modes.ts";
import type { BasePlayer } from "./roster.ts";
import { Roster } from "./roster.ts";

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

/** Owns the waiting players, host choices and team previews. */
export class Lobby {
  readonly phase = "lobby";
  readonly quizId: string;
  readonly title: string;
  private readonly roster = new Roster<BasePlayer>();
  private readonly rng: () => number;
  private readonly onChange: () => void;
  private readonly teams = new Map<string, number>();
  private hasManualTeams = false;
  private mode: GameMode;
  private readonly modeSettings: ModeSettingsMap;
  pacing: Pacing;
  shuffle: ShuffleOptions;
  protect: boolean;

  constructor(
    readonly quiz: Quiz,
    opts: LobbyOptions = {},
  ) {
    this.quizId = quiz.id;
    this.title = quiz.title;
    this.rng = opts.rng ?? Math.random;
    this.onChange = opts.onChange ?? (() => {});
    this.mode = opts.mode ?? "classic";
    this.modeSettings = initialSettings(opts.settings);
    this.pacing = opts.pacing ?? "manual";
    this.protect = opts.protect ?? true;
    this.shuffle = { questions: quiz.settings.shuffleQuestions, answers: quiz.settings.shuffleAnswers };
  }

  get players(): ReadonlyMap<string, BasePlayer> {
    return this.roster.players;
  }

  get settings(): { readonly [M in GameMode]: Readonly<ModeSettingsMap[M]> } {
    return this.modeSettings;
  }

  join(nickname: unknown, avatar?: AvatarChoice | null): BasePlayer {
    const player = this.roster.add(nickname, avatar ?? randomAvatar(this.rng), (base) => base);
    this.reconcileTeams();
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
    if (player) {
      this.teams.delete(playerId);
      this.reconcileTeams();
      this.onChange();
    }
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
    this.reconcileTeams();
    this.onChange();
  }

  /** Change one mode's settings in the lobby; a partial change keeps the rest (and the theme) as they are. */
  setModeSettings(mode: GameMode, raw: unknown): void {
    if (!Object.hasOwn(MODES, mode)) throw new GameError("Unknown game mode");
    this.applySettings(mode, raw && typeof raw === "object" ? (raw as RawSettings) : {});
  }

  private applySettings<M extends GameMode>(mode: M, raw: RawSettings): void {
    const entry: ModeEntry<M> = MODES[mode];
    this.modeSettings[mode] = entry.readSettings(raw, this.modeSettings[mode]);
    if (mode === this.mode) this.reconcileTeams();
    this.onChange();
  }

  /** Teams in the lobby preview, as the selected mode's entry gives them for its settings; null in solo modes. */
  teamCount(): number | null {
    return this.teamsIn(this.mode);
  }

  /** Round-robin until the first manual move; then keep every assignment that still fits. */
  private reconcileTeams(): void {
    const count = this.teamCount();
    // Solo modes hide the arrangement without changing it.
    if (count === null) return;
    const ids = [...this.players.keys()];
    if (!this.hasManualTeams) {
      const indices = assignTeams(ids.length, count);
      ids.forEach((id, i) => this.teams.set(id, indices[i]!));
      return;
    }
    const sizes = Array<number>(count).fill(0);
    const unassigned: string[] = [];
    for (const id of ids) {
      const team = this.teams.get(id);
      if (team === undefined || team >= count) unassigned.push(id);
      else sizes[team]!++;
    }
    for (const id of unassigned) {
      const team = sizes.indexOf(Math.min(...sizes));
      sizes[team]!++;
      this.teams.set(id, team);
    }
  }

  /** Move one player to another team in the lobby; everyone else stays where they are shown. */
  setTeam(playerId: string, team: number): void {
    const count = this.teamCount();
    if (count === null) throw new GameError("This game mode has no teams");
    if (!Number.isInteger(team) || team < 0 || team >= count) throw new GameError("Unknown team");
    if (!this.players.has(playerId)) throw new GameError("Unknown player");
    this.hasManualTeams = true;
    this.teams.set(playerId, team);
    this.onChange();
  }

  private teamsIn<M extends GameMode>(mode: M): number | null {
    const entry: ModeEntry<M> = MODES[mode];
    return entry.teams(this.modeSettings[mode]);
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
      settings: this.modeSettings[mode],
      shuffle: { ...this.shuffle },
      protect: MODES[mode].flags.protect && this.protect,
      pacing: this.pacing,
      players: [...this.players.values()],
      teams: this.teamCount() === null ? new Map([...this.players.keys()].map((id) => [id, 0])) : new Map(this.teams),
    };
  }

  hostView(): HostLobbyView {
    const players = [...this.players.values()].map(({ id, nickname, avatar, connected }) => ({ id, nickname, avatar, score: 0, connected }));
    const count = this.teamCount();
    return {
      kind: "lobby",
      phase: this.phase,
      mode: this.mode,
      settings: this.settings,
      teams:
        count === null
          ? null
          : Array.from({ length: count }, (_, i) => ({
              ...teamInfo(i),
              members: players.filter((player) => this.teams.get(player.id) === i),
            })),
      quiz: { id: this.quizId, title: this.title, questionCount: this.quiz.questions.length },
      pacing: this.pacing,
      shuffle: this.shuffle,
      protect: this.protect,
      players,
    };
  }

  playerView(playerId: string): PlayerView {
    const player = this.players.get(playerId);
    if (!player) return { kind: "none", game: { title: this.title, phase: this.phase } };
    const { id, nickname, avatar } = player;
    return {
      kind: "lobby",
      phase: this.phase,
      title: this.title,
      me: { id, nickname, avatar },
      playerCount: this.players.size,
      mode: this.mode,
      team: this.teamCount() === null ? null : teamInfo(this.teams.get(id) ?? 0),
    };
  }
}

type InitialSettings = {
  [M in GameMode]?: Partial<Omit<ModeSettingsMap[M], "theme">> & ("theme" extends keyof ModeSettingsMap[M] ? { theme?: string } : object);
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

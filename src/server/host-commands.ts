import type { Pacing } from "../shared/mode-views.ts";
import type { ClientMsg } from "../shared/protocol.ts";
import type { Quiz } from "../shared/quiz-schema.ts";
import { GameError } from "./game/common.ts";
import type { HandoffOptions, LobbyChoices } from "./game/lobby.ts";
import { Lobby } from "./game/lobby.ts";
import type { LiveGame } from "./game/mode-entry.ts";
import { entryOf, MODES } from "./game/modes.ts";

const PACINGS = new Set<Pacing>(["manual", "auto"]);

/** What a host command can reach beyond the lobby or live game itself; the hub provides it. */
export interface HostCommandContext {
  /** The open lobby or live game, if any. */
  readonly game: Lobby | LiveGame | null;
  /** The sending socket becomes the projector. */
  becomeHost(): void;
  loadQuiz(quizId: string): Quiz;
  /** Close the current game and open a lobby for this quiz. */
  openLobby(quiz: Quiz): void;
  closeGame(): void;
  setAddress(address: string): void;
  /** A player was removed: drop their phones. */
  kicked(player: { id: string; nickname: string }): void;
  handoffOptions(): HandoffOptions;
  /** Carry these choices over to the next lobby ("Play again"). */
  rememberSetup(setup: Partial<LobbyChoices>): void;
}

/** Applies one Host command to the lobby or the live game. Throws GameError when the command doesn't apply. */
export function applyHostCommand(msg: ClientMsg, ctx: HostCommandContext): void {
  const game = () => {
    if (!ctx.game) throw new GameError("No game is open");
    return ctx.game;
  };
  const lobby = (closedMessage: string | (() => string)) => {
    const current = game();
    if (current instanceof Lobby) return current;
    const entry = entryOf(current);
    throw new GameError(entry.lobbyControlError?.(typeof closedMessage === "string" ? closedMessage : closedMessage()) ?? `Not available in ${entry.name}`);
  };
  /** Paced games go question by question. */
  const paced = (g: LiveGame) => {
    const entry = entryOf(g);
    if (!entry.pacing) throw new GameError(`Not available in ${entry.name}`);
    return entry.pacing(g);
  };
  switch (msg.type) {
    case "host.hello":
      return ctx.becomeHost();
    case "host.open": {
      const quiz = ctx.loadQuiz(String(msg.quizId));
      if (quiz.questions.length === 0) throw new GameError("This quiz has no questions yet");
      return ctx.openLobby(quiz);
    }
    case "host.start": {
      const pacing = PACINGS.has(msg.pacing) ? msg.pacing : undefined;
      const current = lobby("The game has already started");
      current.start(pacing, ctx.handoffOptions());
      return ctx.rememberSetup(current.choices);
    }
    case "host.setPacing": {
      if (!PACINGS.has(msg.pacing)) throw new GameError("Unknown pacing");
      const current = game();
      if (current instanceof Lobby) return current.setPacing(msg.pacing);
      paced(current).setPacing(msg.pacing);
      return ctx.rememberSetup({ pacing: msg.pacing });
    }
    case "host.setShuffle":
      return lobby("Shuffle can only be changed before the game starts").setShuffle({ questions: !!msg.questions, answers: !!msg.answers });
    case "host.setProtect":
      return lobby("Protect from abuse can only be changed before the game starts").setProtect(!!msg.on);
    case "host.setMode":
      return lobby("The game mode can only be changed before the game starts").setMode(msg.mode);
    case "host.setModeSettings":
      return lobby(() => {
        if (!Object.hasOwn(MODES, msg.mode)) return "Unknown game mode";
        return `${MODES[msg.mode].name} settings can only be changed before the game starts`;
      }).setModeSettings(msg.mode, msg.settings);
    case "host.next":
    case "host.end": {
      const current = game();
      const action = msg.type === "host.next" ? "next" : "end";
      if (current instanceof Lobby) {
        current.advanceClassic(action, ctx.handoffOptions());
        return ctx.rememberSetup(current.choices);
      }
      if (action === "next") paced(current).next();
      else current.end();
      return;
    }
    case "host.skip": {
      const current = game();
      if (!(current instanceof Lobby)) paced(current).skip();
      return;
    }
    case "host.setTeam":
      return lobby("Teams can only be changed before the game starts").setTeam(String(msg.playerId), Number(msg.team));
    case "host.kick": {
      const p = game().kick(String(msg.playerId));
      if (p) ctx.kicked(p);
      return;
    }
    case "host.close":
      return ctx.closeGame();
    case "host.setAddress":
      return ctx.setAddress(String(msg.address));
    default:
      throw new GameError(`Unknown message ${(msg as { type: string }).type}`);
  }
}

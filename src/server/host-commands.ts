import type { Pacing } from "../shared/mode-views.ts";
import type { ClientMsg } from "../shared/protocol.ts";
import type { Quiz } from "../shared/quiz-schema.ts";
import { GameError } from "./game/common.ts";
import { Lobby } from "./game/lobby.ts";
import type { LiveGame } from "./game/mode-entry.ts";
import { entryOf, MODES } from "./game/modes.ts";

export type HandoffAction = { type: "start"; pacing?: Pacing } | { type: "next" | "end" };

const PACINGS = new Set<Pacing>(["manual", "auto"]);

export interface HostCommandContext {
  readonly game: Lobby | LiveGame | null;
  promoteAndSendHostSnapshot(): void;
  loadQuiz(quizId: string): Quiz;
  openLobby(quiz: Quiz): void;
  closeGame(): void;
  setAddress(address: string): void;
  kicked(player: { id: string; nickname: string }): void;
  handoff(lobby: Lobby, action: HandoffAction): void;
}

// why: GameError messages are sent verbatim to the host by the hub.
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
  const paced = (g: LiveGame) => {
    const entry = entryOf(g);
    if (!entry.pacing) throw new GameError(`Not available in ${entry.name}`);
    return entry.pacing(g);
  };
  switch (msg.type) {
    case "host.hello":
      return ctx.promoteAndSendHostSnapshot();
    case "host.open": {
      const quiz = ctx.loadQuiz(String(msg.quizId));
      if (quiz.questions.length === 0) throw new GameError("This quiz has no questions yet");
      return ctx.openLobby(quiz);
    }
    case "host.start": {
      const pacing = PACINGS.has(msg.pacing) ? msg.pacing : undefined;
      return ctx.handoff(lobby("The game has already started"), { type: "start", pacing });
    }
    case "host.setPacing": {
      if (!PACINGS.has(msg.pacing)) throw new GameError("Unknown pacing");
      const current = game();
      if (current instanceof Lobby) return current.setPacing(msg.pacing);
      return paced(current).setPacing(msg.pacing);
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
      if (current instanceof Lobby) return ctx.handoff(current, { type: action });
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

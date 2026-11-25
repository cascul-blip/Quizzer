import type { ServerWebSocket } from "bun";
import { cleanAvatar } from "../shared/avatars.ts";
import type { GameMode } from "../shared/mode-entries.ts";
import type { ClientMsg, HostView, PlayerView } from "../shared/protocol.ts";
import { ValidationError } from "../shared/quiz-schema.ts";
import type { Clock } from "./game/common.ts";
import { GameError, realClock } from "./game/common.ts";
import { Lobby } from "./game/lobby.ts";
import type { LobbyChoices } from "./game/lobby-facts.ts";
import type { LiveGame, ModeGame, StartContext } from "./game/mode-entry.ts";
import { entryOf, MODES } from "./game/modes.ts";
import { dispatchPhoneMessage } from "./game/phone-message-dispatch.ts";
import { saveResults } from "./game/results.ts";
import type { HandoffAction, HostCommandContext } from "./host-commands.ts";
import { applyHostCommand } from "./host-commands.ts";
import { JoinInformation } from "./join-info.ts";
import type { LanAddress } from "./network.ts";
import { PhoneAttachments } from "./phone-attachments.ts";
import type { QuizStore } from "./quiz/store.ts";
import { NotFoundError } from "./quiz/store.ts";
import { ViewDelivery } from "./view-delivery.ts";

export interface SocketData {
  /** Request came from this machine to a loopback hostname; may use host controls. */
  admin: boolean;
  /** Remote address, for the per-device caps. */
  ip: string;
  role: "player" | "host";
}

type WS = Pick<ServerWebSocket<SocketData>, "data" | "send" | "getBufferedAmount">;

interface HubOptions {
  /** Forced join address (--host). */
  address?: string;
  discoverAddresses?: () => LanAddress[];
  clock?: Clock;
  rng?: () => number;
  log?: (msg: string) => void;
}

interface LastResults {
  quizId: string;
  title: string;
  csv: string;
  /** Where the CSV was saved, or null if writing failed. */
  file: string | null;
}

/** Owns the single live game and every connected socket; pushes each phone its view (or a patch of it) on every change. */
export class GameHub {
  game: Lobby | LiveGame | null = null;
  lastResults: LastResults | null = null;
  /** Changes on every server start; pages that reconnect to a different one reload to pick up new code. */
  readonly serverId = crypto.randomUUID();

  private readonly phoneAttachments = new PhoneAttachments<WS>((id, connected) => this.game?.setConnected(id, connected));
  readonly join: JoinInformation;
  /** Image refs of the open quiz, sent to phones on join so they can preload them. */
  private images: string[] = [];
  private readonly views: ViewDelivery<WS>;
  /** Mode, mode settings and pacing carry over to the next lobby ("Play again"). */
  private lastSetup: Partial<LobbyChoices> = {};
  private readonly log: (msg: string) => void;

  constructor(
    private readonly store: QuizStore,
    private readonly opts: HubOptions = {},
  ) {
    this.views = new ViewDelivery(
      this.phoneAttachments,
      () => this.hostView(),
      (ws) => this.playerView(ws),
      opts.clock ?? realClock,
      (send) => {
        const game = this.game;
        if (!game || game instanceof Lobby) return send();
        const { viewBatch } = entryOf(game);
        if (viewBatch) viewBatch(game, send);
        else send();
      },
    );
    this.join = new JoinInformation({
      address: opts.address,
      discoverAddresses: opts.discoverAddresses,
      now: opts.clock ? () => opts.clock!.now() : undefined,
      log: opts.log,
      onQrReady: () => this.views.scheduleBroadcast(),
    });
    this.log = opts.log ?? (() => {});
  }

  setAddress(address: string): void {
    if (!this.join.select(address)) throw new GameError(`${address} is not an address of this computer`);
    this.views.scheduleBroadcast();
  }

  hostView(): HostView {
    const join = this.join.info();
    return this.game ? { ...this.game.hostView(), join } : { kind: "idle", phase: "idle", join };
  }

  playerView(ws: WS): PlayerView {
    if (!this.game) return { kind: "none", game: null };
    const none: PlayerView = { kind: "none", game: { title: this.game.title, phase: this.game.phase } };
    const playerId = this.phoneAttachments.playerId(ws);
    return playerId ? (this.game.playerView(playerId) ?? none) : none;
  }

  onDrain(ws: WS): void {
    this.views.onDrain(ws);
  }

  broadcast(): void {
    this.views.broadcast();
  }

  socketLimitReached(ip: string): boolean {
    return this.phoneAttachments.socketLimitReached(ip);
  }

  onOpen(ws: WS): void {
    this.phoneAttachments.open(ws);
    this.views.send(ws, { type: "hello", serverId: this.serverId });
    this.views.refresh(ws);
  }

  onClose(ws: WS): void {
    this.phoneAttachments.close(ws);
  }

  onMessage(ws: WS, raw: string | Buffer): void {
    let msg: ClientMsg;
    try {
      msg = JSON.parse(typeof raw === "string" ? raw : raw.toString());
      if (!msg || typeof msg !== "object" || typeof msg.type !== "string") throw new Error();
    } catch {
      return this.views.send(ws, { type: "error", message: "Malformed message" });
    }
    try {
      if (msg.type.startsWith("host.")) {
        if (!ws.data.admin) throw new GameError("Host controls are only available on the host computer (http://localhost)");
        applyHostCommand(msg, this.hostCommandContext(ws));
      } else {
        this.handlePlayer(ws, msg);
      }
    } catch (e) {
      if (e instanceof GameError || e instanceof ValidationError || e instanceof NotFoundError) {
        this.views.send(ws, { type: "error", message: e.message });
      } else {
        this.log(`Error handling ${msg.type}: ${(e as Error).stack ?? e}`);
        this.views.send(ws, { type: "error", message: "Something went wrong" });
      }
    }
  }

  private handlePlayer(ws: WS, msg: ClientMsg): void {
    switch (msg.type) {
      case "join": {
        if (!this.game) throw new GameError("No game is open yet. Wait for the host.");
        const playerId = this.phoneAttachments.playerId(ws);
        if (playerId && this.game.players.has(playerId)) return this.views.refresh(ws);
        if (this.phoneAttachments.joinLimitReached(ws, this.game.players)) throw new GameError("Too many players from this device");
        const p = this.game.join(msg.nickname, cleanAvatar(msg.avatar, msg.accessory));
        this.phoneAttachments.attach(ws, p.id);
        this.views.send(ws, { type: "joined", token: p.token, playerId: p.id, images: this.images });
        this.log(`Player joined: ${p.nickname}`);
        return;
      }
      case "resume": {
        const p = this.game?.byToken(msg.token);
        if (!p) {
          this.views.send(ws, { type: "resumeFailed" });
          return this.views.refresh(ws);
        }
        this.phoneAttachments.attach(ws, p.id);
        this.views.send(ws, { type: "joined", token: p.token, playerId: p.id, images: this.images });
        return this.views.refresh(ws);
      }
      default:
        if (dispatchPhoneMessage(this.game, this.phoneAttachments.playerId(ws), msg) === "resend") this.views.refresh(ws);
    }
  }

  private hostCommandContext(ws: WS): HostCommandContext {
    const hub = this;
    return {
      get game() {
        return hub.game;
      },
      promoteAndSendHostSnapshot: () => this.views.promoteAndSendHostSnapshot(ws),
      loadQuiz: (quizId) => this.store.get(quizId),
      openLobby: (quiz) => {
        this.closeGame();
        this.images = [...new Set(quiz.questions.flatMap((q) => (q.image ? [q.image] : [])))];
        this.game = new Lobby(quiz, { ...this.lastSetup, onChange: () => this.views.scheduleBroadcast() });
        this.log(`Game opened: ${quiz.title}. Players join at ${this.join.url()}`);
        this.views.scheduleBroadcast();
      },
      closeGame: () => {
        this.closeGame();
        this.views.scheduleBroadcast();
      },
      setAddress: (address) => this.setAddress(address),
      kicked: (p) => {
        for (const s of this.phoneAttachments.detachPlayer(p.id)) this.views.send(s, { type: "kicked" });
        this.log(`Player removed: ${p.nickname}`);
      },
      handoff: (lobby, action) => this.handoff(lobby, action),
    };
  }

  private handoff(lobby: Lobby, action: HandoffAction): void {
    if (action.type !== "end" && lobby.players.size === 0) throw new GameError("Wait for at least one player to join");

    const context: StartContext = {
      clock: this.opts.clock,
      rng: this.opts.rng,
      dataDir: this.store.dataDir,
      onChange: () => this.views.scheduleBroadcast(),
      onActivity: (id) => this.views.onActivity(id),
      onTick: () => this.views.pushHost(),
      onFinish: (game) => this.onFinish(game),
    };

    const installAndActivate = <M extends GameMode>(mode: M, activate: (game: ModeGame[M]) => void) => {
      const { game, log } = MODES[mode].start(lobby.handoffFacts(mode), context);
      this.game = game;
      try {
        activate(game);
      } catch (error) {
        this.game = lobby;
        game.dispose();
        throw error;
      }
      if (log) this.log(log);
      return game;
    };

    if (action.type === "start") {
      installAndActivate(lobby.choices.mode, (game) => game.start(action.pacing));
    } else {
      // The lobby's legacy Next and End commands always target Classic.
      installAndActivate("classic", (game) => game[action.type]());
    }
  }

  closeGame(): void {
    this.views.cancelPending();
    if (!this.game) return;
    this.lastSetup = this.game.choices;
    this.game.dispose();
    this.game = null;
    this.phoneAttachments.detachAll();
    this.views.refreshOnNextUpdate();
  }

  private onFinish(game: LiveGame): void {
    const entry = entryOf(game);
    try {
      const { csv, file } = saveResults(game, entry.results(game), this.store.resultsDir, this.log);
      this.lastResults = { quizId: game.quizId, title: game.title, csv, file };
    } catch (error) {
      this.log(`Could not prepare the ${entry.name} results: ${error}`);
    }
    try {
      entry.finished?.(game, { dataDir: this.store.dataDir, log: this.log });
    } catch (error) {
      this.log(`Could not finish ${entry.name}: ${error}`);
    }
  }
}

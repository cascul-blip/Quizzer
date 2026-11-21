import type { ServerWebSocket } from "bun";
import type { ClientMsg, HostView, PlayerView, ServerMsg } from "../shared/protocol.ts";
import { cleanAvatar } from "../shared/avatars.ts";
import { ValidationError } from "../shared/quiz-schema.ts";
import { Lobby, type HandoffOptions, type LobbyChoices } from "./game/lobby.ts";
import { MSG_MODE, isModeMsg, type LiveGame } from "./game/mode-entry.ts";
import { entryOf } from "./game/modes.ts";
import { applyHostCommand, type HostCommandContext } from "./host-commands.ts";
import { writeResultsFile } from "./game/results.ts";
import { GameError, type Clock } from "./game/common.ts";
import { JoinInformation } from "./join-info.ts";
import type { LanAddress } from "./network.ts";
import { PhoneAttachments } from "./phone-attachments.ts";
import { PhoneViewDelivery } from "./phone-view-delivery.ts";
import { ViewUpdateScheduler } from "./view-update-scheduler.ts";
import { NotFoundError, type QuizStore } from "./quiz/store.ts";

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
  log?: (msg: string) => void;
}

interface LastResults {
  quizId: string;
  title: string;
  csv: string;
  /** Where the CSV was saved, or null if writing failed. */
  file: string | null;
}

/** Compress what goes to phones over Wi-Fi; the host screen is on this machine, so it isn't worth the CPU. */
const compressFor = (ws: WS) => ws.data.role !== "host";

/** Owns the single live game and every connected socket; pushes each phone its view (or a patch of it) on every change. */
export class GameHub {
  game: Lobby | LiveGame | null = null;
  lastResults: LastResults | null = null;
  /** Changes on every server start; pages that reconnect to a different one reload to pick up new code. */
  readonly serverId = crypto.randomUUID();

  private readonly phoneAttachments = new PhoneAttachments<WS>((id, connected) => this.game?.setConnected(id, connected));
  private readonly phoneViews: PhoneViewDelivery;
  /** Where players join: address, URL and QR code. */
  readonly join: JoinInformation;
  /** Image refs of the open quiz, sent to phones on join so they can preload them. */
  private images: string[] = [];
  private readonly viewUpdates = new ViewUpdateScheduler(
    this.phoneAttachments,
    () => this.hostView(),
    (ws, force) => this.sendState(ws, force),
    (send) => {
      // Games that can share work between the views of one broadcast (Classic, Showdown).
      const game = this.game;
      if (game && "viewBatch" in game) game.viewBatch(send);
      else send();
    },
  );
  /** Mode, mode settings and pacing carry over to the next lobby ("Play again"). */
  private lastSetup: Partial<LobbyChoices> = {};
  private readonly log: (msg: string) => void;

  constructor(
    private readonly store: QuizStore,
    private readonly opts: HubOptions = {},
  ) {
    this.phoneViews = new PhoneViewDelivery(() => opts.clock?.now() ?? Date.now());
    this.join = new JoinInformation({
      address: opts.address,
      discoverAddresses: opts.discoverAddresses,
      now: opts.clock ? () => opts.clock!.now() : undefined,
      log: opts.log,
      onQrReady: () => this.viewUpdates.scheduleBroadcast(),
    });
    this.log = opts.log ?? (() => {});
  }

  // ---------- join info ----------

  setAddress(address: string): void {
    if (!this.join.select(address)) throw new GameError(`${address} is not an address of this computer`);
    this.viewUpdates.scheduleBroadcast();
  }

  // ---------- views ----------

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

  private send(ws: WS, msg: ServerMsg): void {
    // The page may change what it shows on any other message: make sure the next snapshot goes out.
    if (msg.type !== "player.state") this.phoneViews.requestRefresh(ws);
    ws.send(JSON.stringify(msg), compressFor(ws));
  }

  private sendState(ws: WS, force = true): void {
    if (ws.data.role === "host") return this.send(ws, { type: "host.state", view: this.hostView() });
    this.phoneViews.push(ws, () => this.playerView(ws), force);
  }

  onDrain(ws: WS): void {
    if (ws.data.role === "host") {
      if (this.phoneViews.takePendingDrain(ws)) this.sendState(ws);
      return;
    }
    this.phoneViews.onDrain(ws, () => this.playerView(ws));
  }

  broadcast(): void {
    this.viewUpdates.broadcast();
  }

  // ---------- socket lifecycle ----------

  /** Another socket from this address would go over the per-device cap. */
  socketLimitReached(ip: string): boolean {
    return this.phoneAttachments.socketLimitReached(ip);
  }

  onOpen(ws: WS): void {
    this.phoneAttachments.open(ws);
    this.send(ws, { type: "hello", serverId: this.serverId });
    this.sendState(ws);
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
      return this.send(ws, { type: "error", message: "Malformed message" });
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
        this.send(ws, { type: "error", message: e.message });
      } else {
        this.log(`Error handling ${msg.type}: ${(e as Error).stack ?? e}`);
        this.send(ws, { type: "error", message: "Something went wrong" });
      }
    }
  }

  private handlePlayer(ws: WS, msg: ClientMsg): void {
    switch (msg.type) {
      case "join": {
        if (!this.game) throw new GameError("No game is open yet. Wait for the host.");
        const playerId = this.phoneAttachments.playerId(ws);
        if (playerId && this.game.players.has(playerId)) return this.sendState(ws);
        if (this.phoneAttachments.joinLimitReached(ws, this.game.players)) throw new GameError("Too many players from this device");
        const p = this.game.join(msg.nickname, cleanAvatar(msg.avatar, msg.accessory));
        this.phoneAttachments.attach(ws, p.id);
        this.send(ws, { type: "joined", token: p.token, playerId: p.id, images: this.images });
        this.log(`Player joined: ${p.nickname}`);
        return;
      }
      case "resume": {
        const p = this.game?.byToken(msg.token);
        if (!p) {
          this.send(ws, { type: "resumeFailed" });
          return this.sendState(ws);
        }
        this.phoneAttachments.attach(ws, p.id);
        this.send(ws, { type: "joined", token: p.token, playerId: p.id, images: this.images });
        return this.sendState(ws);
      }
      default: {
        if (!isModeMsg(msg)) throw new GameError(`Unknown message ${(msg as { type: string }).type}`);
        const game = this.game;
        const playerId = this.phoneAttachments.playerId(ws);
        // A message for a mode that isn't running (say, a late tap from the last game) is ignored.
        if (!game || !playerId) return;
        if (game instanceof Lobby) {
          if (msg.type === "setAvatar") game.setAvatar(playerId, msg.avatar, msg.accessory);
          return;
        }
        if (game.runningMode !== MSG_MODE[msg.type]) return;
        if (entryOf(game).handle(game, playerId, msg) === "resend") this.sendState(ws);
        return;
      }
    }
  }

  /** What a Host command from this socket reaches beyond the game itself. */
  private hostCommandContext(ws: WS): HostCommandContext {
    const hub = this;
    return {
      get game() {
        return hub.game;
      },
      becomeHost: () => {
        ws.data.role = "host";
        this.sendState(ws);
      },
      loadQuiz: (quizId) => this.store.get(quizId),
      openLobby: (quiz) => {
        this.closeGame();
        this.images = [...new Set(quiz.questions.flatMap((q) => (q.image ? [q.image] : [])))];
        this.game = new Lobby(quiz, { ...this.lastSetup, onChange: () => this.viewUpdates.scheduleBroadcast() });
        this.log(`Game opened: ${quiz.title}. Players join at ${this.join.url()}`);
        this.viewUpdates.scheduleBroadcast();
      },
      closeGame: () => {
        this.closeGame();
        this.viewUpdates.scheduleBroadcast();
      },
      setAddress: (address) => this.setAddress(address),
      kicked: (p) => {
        for (const s of this.phoneAttachments.detachPlayer(p.id)) this.send(s, { type: "kicked" });
        this.log(`Player removed: ${p.nickname}`);
      },
      handoffOptions: () => this.handoffOptions(),
      rememberSetup: (setup) => {
        this.lastSetup = { ...this.lastSetup, ...setup };
      },
    };
  }

  private handoffOptions(): HandoffOptions {
    return {
      clock: this.opts.clock,
      dataDir: this.store.dataDir,
      onChange: () => this.viewUpdates.scheduleBroadcast(),
      onActivity: (id: string) => this.viewUpdates.onActivity(id),
      onTick: () => this.viewUpdates.pushHost(),
      onFinish: (game: LiveGame) => this.onFinish(game),
      install: (game: LiveGame, activate: () => void) => {
        const lobby = this.game;
        this.game = game;
        try {
          activate();
        } catch (error) {
          this.game = lobby;
          game.dispose();
          throw error;
        }
      },
      log: this.log,
    };
  }

  closeGame(): void {
    this.viewUpdates.cancelPending();
    if (!this.game) return;
    if (this.game instanceof Lobby) this.lastSetup = this.game.choices;
    else this.game.dispose();
    this.game = null;
    this.phoneAttachments.detachAll();
    for (const s of this.phoneAttachments) this.phoneViews.requestRefresh(s);
  }

  private onFinish(game: LiveGame): void {
    const entry = entryOf(game);
    const csv = entry.resultsCsv(game);
    let file: string | null = null;
    try {
      file = writeResultsFile(game, csv, this.store.resultsDir);
      this.log(`Results saved to ${file}`);
    } catch (e) {
      this.log(`Could not save results: ${(e as Error).message}`);
    }
    this.lastResults = { quizId: game.quizId, title: game.title, csv, file };
    entry.finished?.(game, { dataDir: this.store.dataDir, log: this.log });
  }
}

import type { ServerWebSocket } from "bun";
import QRCode from "qrcode";
import type { ClientMsg, HostView, JoinInfo, Pacing, PlayerView, ServerMsg } from "../shared/protocol.ts";
import { cleanAvatar } from "../shared/avatars.ts";
import { ValidationError } from "../shared/quiz-schema.ts";
import { Lobby, type LobbyChoices } from "./game/lobby.ts";
import { MSG_MODE, isModeMsg, type LiveGame } from "./game/mode-entry.ts";
import { entryOf, MODES } from "./game/modes.ts";
import { writeResultsFile } from "./game/results.ts";
import { GameError, type Clock } from "./game/common.ts";
import { lanAddresses, type LanAddress } from "./network.ts";
import { PhoneAttachments } from "./phone-attachments.ts";
import { PhoneViewDelivery } from "./phone-view-delivery.ts";
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

const PACINGS = new Set<Pacing>(["manual", "auto"]);
/** Answers can arrive from every phone at once: the acting player is updated at once, everyone else at most this often. */
const ACTIVITY_THROTTLE_MS = 100;
/** Compress what goes to phones over Wi-Fi; the host screen is on this machine, so it isn't worth the CPU. */
const compressFor = (ws: WS) => ws.data.role !== "host";

/** Owns the single live game and every connected socket; pushes each phone its view (or a patch of it) on every change. */
export class GameHub {
  game: Lobby | LiveGame | null = null;
  lastResults: LastResults | null = null;
  port = 0;
  /** Changes on every server start; pages that reconnect to a different one reload to pick up new code. */
  readonly serverId = crypto.randomUUID();

  private readonly phoneAttachments = new PhoneAttachments<WS>((id, connected) => this.game?.setConnected(id, connected));
  private readonly phoneViews: PhoneViewDelivery;
  private selected: string | null;
  private addressCache: { at: number; list: LanAddress[] } | null = null;
  private qrCache = new Map<string, string>();
  /** Image refs of the open quiz, sent to phones on join so they can preload them. */
  private images: string[] = [];
  private broadcastQueued = false;
  private activityTimer: ReturnType<typeof setTimeout> | null = null;
  /** Mode, mode settings and pacing carry over to the next lobby ("Play again"). */
  private lastSetup: Partial<LobbyChoices> = {};
  private readonly log: (msg: string) => void;

  constructor(
    private readonly store: QuizStore,
    private readonly opts: HubOptions = {},
  ) {
    this.phoneViews = new PhoneViewDelivery(() => opts.clock?.now() ?? Date.now());
    this.selected = opts.address ?? null;
    this.log = opts.log ?? (() => {});
  }

  // ---------- join info ----------

  addresses(): LanAddress[] {
    const now = Date.now();
    if (!this.addressCache || now - this.addressCache.at > 5000) {
      const discover = this.opts.discoverAddresses ?? lanAddresses;
      this.addressCache = { at: now, list: discover() };
    }
    return this.addressCache.list;
  }

  get address(): string {
    const list = this.addresses();
    if (this.selected && (this.opts.address === this.selected || list.some((a) => a.address === this.selected))) return this.selected;
    return list[0]?.address ?? "localhost";
  }

  setAddress(address: string): void {
    if (!this.addresses().some((a) => a.address === address) && address !== this.opts.address) {
      throw new GameError(`${address} is not an address of this computer`);
    }
    this.selected = address;
    this.scheduleBroadcast();
  }

  joinUrl(): string {
    return `http://${this.address}:${this.port}/`;
  }

  joinInfo(): JoinInfo {
    const url = this.joinUrl();
    let qrSvg = this.qrCache.get(url);
    if (qrSvg === undefined) {
      this.qrCache.set(url, "");
      QRCode.toString(url, { type: "svg", margin: 1, errorCorrectionLevel: "M" })
        .then((svg) => {
          this.qrCache.set(url, svg);
          this.scheduleBroadcast();
        })
        .catch((e) => this.log(`QR code generation failed: ${e}`));
      qrSvg = "";
    }
    const addresses = this.addresses().map(({ address, iface }) => ({ address, iface }));
    if (this.opts.address && !addresses.some((a) => a.address === this.opts.address)) addresses.unshift({ address: this.opts.address, iface: "--host" });
    return { url, qrSvg, address: this.address, addresses, port: this.port };
  }

  // ---------- views ----------

  hostView(): HostView {
    const join = this.joinInfo();
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

  /** Coalesce bursts of changes (e.g. many answers) into one push per tick. */
  scheduleBroadcast(): void {
    if (this.broadcastQueued) return;
    this.broadcastQueued = true;
    queueMicrotask(() => {
      this.broadcastQueued = false;
      this.broadcast();
    });
  }

  /** One player acted (Tallest Tower): update them now and everyone else shortly. */
  private onActivity(playerId: string): void {
    for (const ws of this.phoneAttachments.forPlayer(playerId)) this.sendState(ws);
    this.activityTimer ??= setTimeout(() => {
      this.activityTimer = null;
      this.broadcast();
    }, ACTIVITY_THROTTLE_MS);
  }

  /** Refresh only the projector for high-frequency game ticks. */
  private pushHost(): void {
    let hostMsg: string | null = null;
    for (const ws of this.phoneAttachments) if (ws.data.role === "host") ws.send((hostMsg ??= JSON.stringify({ type: "host.state", view: this.hostView() } satisfies ServerMsg)));
  }

  broadcast(): void {
    const send = () => {
      let hostMsg: string | null = null;
      for (const ws of this.phoneAttachments) {
        if (ws.data.role === "host") ws.send((hostMsg ??= JSON.stringify({ type: "host.state", view: this.hostView() } satisfies ServerMsg)));
        else this.sendState(ws, false);
      }
    };
    // Games that can share work between the views of one broadcast (Classic, Showdown).
    const game = this.game;
    if (game && "viewBatch" in game) game.viewBatch(send);
    else send();
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
        this.handleHost(ws, msg);
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

  private handleHost(ws: WS, msg: ClientMsg): void {
    const game = () => {
      if (!this.game) throw new GameError("No game is open");
      return this.game;
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
        ws.data.role = "host";
        return this.sendState(ws);
      case "host.open": {
        const quiz = this.store.get(String(msg.quizId));
        if (quiz.questions.length === 0) throw new GameError("This quiz has no questions yet");
        this.closeGame();
        this.images = [...new Set(quiz.questions.flatMap((q) => (q.image ? [q.image] : [])))];
        this.game = new Lobby(quiz, { ...this.lastSetup, onChange: () => this.scheduleBroadcast() });
        this.log(`Game opened: ${quiz.title}. Players join at ${this.joinUrl()}`);
        this.scheduleBroadcast();
        return;
      }
      case "host.start": {
        const pacing = PACINGS.has(msg.pacing) ? msg.pacing : undefined;
        const current = lobby("The game has already started");
        current.start(pacing, this.handoffOptions());
        this.lastSetup = current.choices;
        return;
      }
      case "host.setPacing": {
        if (!PACINGS.has(msg.pacing)) throw new GameError("Unknown pacing");
        const current = game();
        if (current instanceof Lobby) current.setPacing(msg.pacing);
        else {
          paced(current).setPacing(msg.pacing);
          this.lastSetup.pacing = msg.pacing;
        }
        return;
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
          current.advanceClassic(action, this.handoffOptions());
          this.lastSetup = current.choices;
        } else if (action === "next") paced(current).next();
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
        if (!p) return;
        for (const s of this.phoneAttachments.detachPlayer(p.id)) this.send(s, { type: "kicked" });
        this.log(`Player removed: ${p.nickname}`);
        return;
      }
      case "host.close":
        this.closeGame();
        this.scheduleBroadcast();
        return;
      case "host.setAddress":
        return this.setAddress(String(msg.address));
      default:
        throw new GameError(`Unknown message ${(msg as { type: string }).type}`);
    }
  }

  private handoffOptions() {
    return {
      clock: this.opts.clock,
      dataDir: this.store.dataDir,
      onChange: () => this.scheduleBroadcast(),
      onActivity: (id: string) => this.onActivity(id),
      onTick: () => this.pushHost(),
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
    if (this.activityTimer) clearTimeout(this.activityTimer);
    this.activityTimer = null;
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

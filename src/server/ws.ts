import type { ServerWebSocket } from "bun";
import QRCode from "qrcode";
import type { ClientMsg, GameMode, HostView, JoinInfo, ModeSettingsMap, Pacing, PlayerView, ServerMsg } from "../shared/protocol.ts";
import { cleanAvatar } from "../shared/avatars.ts";
import { ValidationError } from "../shared/quiz-schema.ts";
import { Game, GameError, type Clock } from "./game/game.ts";
import { startLobbyGame, type LiveGame } from "./game/lobby-handoff.ts";
import { MSG_MODE, isModeMsg } from "./game/mode-entry.ts";
import { entryOf } from "./game/modes.ts";
import { writeResultsFile } from "./game/results.ts";
import { MAX_JOINS_PER_ADDRESS, MAX_SOCKETS_PER_ADDRESS } from "./game/common.ts";
import { isLoopbackAddress, lanAddresses, type LanAddress } from "./network.ts";
import { PhoneViewDelivery } from "./phone-view-delivery.ts";
import { NotFoundError, type QuizStore } from "./quiz/store.ts";

export interface SocketData {
  /** Request came from this machine to a loopback hostname; may use host controls. */
  admin: boolean;
  /** Remote address, for the per-device caps. */
  ip: string;
  role: "player" | "host";
  playerId: string | null;
}

type WS = ServerWebSocket<SocketData>;

interface HubOptions {
  /** Forced join address (--host). */
  address?: string;
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
  game: LiveGame | null = null;
  /** The Game the host opened, while it is still the live game: Classic and the lobby's controls work on it until another mode takes its players. */
  private lobby: Game | null = null;
  lastResults: LastResults | null = null;
  port = 0;
  /** Changes on every server start; pages that reconnect to a different one reload to pick up new code. */
  readonly serverId = crypto.randomUUID();

  private readonly sockets = new Set<WS>();
  private readonly phoneViews: PhoneViewDelivery;
  private selected: string | null;
  private addressCache: { at: number; list: LanAddress[] } | null = null;
  private qrCache = new Map<string, string>();
  /** Image refs of the open quiz, sent to phones on join so they can preload them. */
  private images: string[] = [];
  private broadcastQueued = false;
  private activityTimer: ReturnType<typeof setTimeout> | null = null;
  /** Mode, mode settings and pacing carry over to the next lobby ("Play again"). */
  private lastSetup: { mode: GameMode; settings: Partial<ModeSettingsMap>; protect: boolean; pacing: Pacing } = {
    mode: "classic",
    settings: {},
    protect: true,
    pacing: "manual",
  };
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
    if (!this.addressCache || now - this.addressCache.at > 5000) this.addressCache = { at: now, list: lanAddresses() };
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
    if (!ws.data.playerId) return none;
    return this.game.playerView(ws.data.playerId) ?? none;
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
    this.phoneViews.onDrain(ws, () => this.sendState(ws));
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
    for (const ws of this.sockets) if (ws.data.playerId === playerId) this.sendState(ws);
    this.activityTimer ??= setTimeout(() => {
      this.activityTimer = null;
      this.broadcast();
    }, ACTIVITY_THROTTLE_MS);
  }

  /** Refresh only the projector for high-frequency game ticks. */
  private pushHost(): void {
    let hostMsg: string | null = null;
    for (const ws of this.sockets) if (ws.data.role === "host") ws.send((hostMsg ??= JSON.stringify({ type: "host.state", view: this.hostView() } satisfies ServerMsg)));
  }

  broadcast(): void {
    const send = () => {
      let hostMsg: string | null = null;
      for (const ws of this.sockets) {
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
    if (isLoopbackAddress(ip)) return false;
    let n = 0;
    for (const s of this.sockets) if (s.data.ip === ip) n++;
    return n >= MAX_SOCKETS_PER_ADDRESS;
  }

  onOpen(ws: WS): void {
    this.sockets.add(ws);
    this.send(ws, { type: "hello", serverId: this.serverId });
    this.sendState(ws);
  }

  onClose(ws: WS): void {
    this.sockets.delete(ws);
    const pid = ws.data.playerId;
    if (pid && this.game && ![...this.sockets].some((s) => s.data.playerId === pid)) this.game.setConnected(pid, false);
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
        if (ws.data.playerId && this.game.players.has(ws.data.playerId)) return this.sendState(ws);
        if (!isLoopbackAddress(ws.data.ip)) {
          const game = this.game;
          const mine = new Set([...this.sockets].filter((s) => s.data.ip === ws.data.ip && s.data.playerId && game.players.has(s.data.playerId)).map((s) => s.data.playerId));
          if (mine.size >= MAX_JOINS_PER_ADDRESS) throw new GameError("Too many players from this device");
        }
        const p = this.game.join(msg.nickname, cleanAvatar(msg.avatar, msg.accessory));
        ws.data.playerId = p.id;
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
        ws.data.playerId = p.id;
        this.send(ws, { type: "joined", token: p.token, playerId: p.id, images: this.images });
        this.game!.setConnected(p.id, true);
        return this.sendState(ws);
      }
      default: {
        if (!isModeMsg(msg)) throw new GameError(`Unknown message ${(msg as { type: string }).type}`);
        const game = this.game;
        const playerId = ws.data.playerId;
        // A message for a mode that isn't running (say, a late tap from the last game) is ignored.
        if (!game || !playerId || game.runningMode !== MSG_MODE[msg.type]) return;
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
    const classic = () => {
      const g = game();
      if (g !== this.lobby) throw new GameError(`Not available in ${entryOf(g).name}`);
      return this.lobby;
    };
    /** Paced modes (Classic, Racer, Showdown) go question by question: next, skip and pacing work in each. */
    const paced = () => {
      const g = game();
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
        this.game = this.lobby = new Game(quiz, {
          clock: this.opts.clock,
          onChange: () => this.scheduleBroadcast(),
          onActivity: (pid) => this.onActivity(pid),
          onFinish: (g) => this.onFinish(g),
          ...this.lastSetup,
        });
        this.log(`Game opened: ${quiz.title}. Players join at ${this.joinUrl()}`);
        this.scheduleBroadcast();
        return;
      }
      case "host.start": {
        const pacing = PACINGS.has(msg.pacing) ? msg.pacing : undefined;
        const startedPacing = startLobbyGame(classic(), pacing, {
          clock: this.opts.clock,
          dataDir: this.store.dataDir,
          onChange: () => this.scheduleBroadcast(),
          onActivity: (id) => this.onActivity(id),
          onTick: () => this.pushHost(),
          onFinish: (game) => this.onFinish(game),
          install: (game) => { this.game = game; },
          log: this.log,
        });
        if (startedPacing !== undefined) this.lastSetup.pacing = startedPacing;
        return;
      }
      case "host.setPacing":
        if (!PACINGS.has(msg.pacing)) throw new GameError("Unknown pacing");
        paced().setPacing(msg.pacing);
        this.lastSetup.pacing = msg.pacing;
        return;
      case "host.setShuffle":
        return classic().setShuffle({ questions: !!msg.questions, answers: !!msg.answers });
      case "host.setProtect":
        classic().setProtect(!!msg.on);
        this.lastSetup.protect = classic().protect;
        return;
      case "host.setMode":
        classic().setMode(msg.mode);
        this.lastSetup.mode = classic().mode;
        return;
      case "host.setModeSettings": {
        const lobby = classic();
        lobby.setModeSettings(msg.mode, msg.settings);
        this.lastSetup.settings = { ...lobby.settings };
        return;
      }
      case "host.next":
        return paced().next();
      case "host.skip":
        return paced().skip();
      case "host.end":
        return game().end();
      case "host.setTeam":
        return classic().setTeam(String(msg.playerId), Number(msg.team));
      case "host.kick": {
        const p = game().kick(String(msg.playerId));
        if (!p) return;
        for (const s of this.sockets) {
          if (s.data.playerId === p.id) {
            s.data.playerId = null;
            this.send(s, { type: "kicked" });
          }
        }
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

  private closeGame(): void {
    if (this.activityTimer) clearTimeout(this.activityTimer);
    this.activityTimer = null;
    if (!this.game) return;
    this.game.dispose();
    this.game = this.lobby = null;
    for (const s of this.sockets) {
      s.data.playerId = null;
      this.phoneViews.requestRefresh(s);
    }
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

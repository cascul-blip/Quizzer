import { render } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { cleanAvatar, type AvatarChoice } from "../../shared/avatars.ts";
import type { ClientMsg, PlayerView, ServerMsg } from "../../shared/protocol.ts";
import { shownView } from "./resume.ts";
import { applyPatch } from "../../shared/view-patch.ts";
import { Avatar } from "../shared/avatar-art.tsx";
import { setPhoneArt } from "../shared/phone-art.ts";
import { connect, type ConnStatus } from "../shared/ws.ts";
import { ConnBanner, ErrorBoundary, Toast, teamInk } from "../shared/ui.tsx";
import { AvatarPicker } from "./avatar-picker.tsx";
import { Bar, Center, type Joined, type Send } from "./common.tsx";
import { PLAYER_MODES, screenOf } from "./modes.tsx";

const TOKEN_KEY = "quizzer.token";
const NAME_KEY = "quizzer.nickname";
const AVATAR_KEY = "quizzer.avatar";

const storage = {
  get(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string | null): void {
    try {
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    } catch {
      // Private mode etc.: reconnect-after-refresh won't work, everything else does.
    }
  },
};

let preloadRun = 0;

/**
 * Fetch images one after another, in quiz order, so a room of phones joining together doesn't
 * start every download at once. A newer call (e.g. after a reconnect) stops the older one.
 */
function preloadImages(refs: string[]): void {
  const run = ++preloadRun;
  const next = (i: number) => {
    if (run !== preloadRun || i >= refs.length) return;
    const img = new Image();
    img.onload = img.onerror = () => next(i + 1);
    img.src = `/${refs[i]}`;
  };
  next(0);
}

/** The look this phone picked last time, so returning players keep it. */
function savedAvatar(): AvatarChoice | null {
  try {
    const raw = JSON.parse(storage.get(AVATAR_KEY) ?? "null");
    return cleanAvatar(raw?.avatar, raw?.accessory);
  } catch {
    return null;
  }
}

function App() {
  const [status, setStatus] = useState<ConnStatus>("connecting");
  const [serverView, setView] = useState<PlayerView | null>(null);
  /** A resume is on its way: the server's first snapshot on a new socket is "not joined" until it's answered. */
  const [resuming, setResuming] = useState(false);
  const lastJoined = useRef<PlayerView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [kicked, setKicked] = useState(false);
  const [joining, setJoining] = useState(false);
  const conn = useRef<{ send(m: ClientMsg): void } | null>(null);

  useEffect(() => {
    const c = connect({
      onStatus: setStatus,
      onOpen: (send) => {
        const token = storage.get(TOKEN_KEY);
        if (!token) return;
        setResuming(true);
        send({ type: "resume", token });
      },
      onMessage: (msg: ServerMsg) => {
        switch (msg.type) {
          case "player.state":
            setView(msg.view);
            setJoining(false);
            break;
          case "player.patch":
            setView((v) => (v ? applyPatch(v, msg.ops) : v));
            setJoining(false);
            break;
          case "joined":
            storage.set(TOKEN_KEY, msg.token);
            // Fetch the question images now so none has to load mid-game (they're cached as immutable).
            preloadImages(msg.images ?? []);
            break;
          case "resumeFailed":
            storage.set(TOKEN_KEY, null);
            setResuming(false);
            break;
          case "kicked":
            storage.set(TOKEN_KEY, null);
            setKicked(true);
            break;
          case "error":
            setError(msg.message);
            setJoining(false);
            break;
        }
      },
    });
    conn.current = c;
    return () => c.close();
  }, []);

  useEffect(() => {
    if (serverView && serverView.kind !== "none") setResuming(false);
  }, [serverView]);

  const send = (m: ClientMsg) => conn.current?.send(m);
  if (serverView && serverView.kind !== "none") lastJoined.current = serverView;
  const view = shownView(serverView, resuming, lastJoined.current);

  let body;
  if (kicked) {
    body = (
      <Center>
        <h1>You were removed from the game</h1>
        <button class="btn primary" onClick={() => setKicked(false)}>
          OK
        </button>
      </Center>
    );
  } else if (!view) {
    body = (
      <Center>
        <div class="spinner" />
      </Center>
    );
  } else if (view.kind === "none") {
    if (!view.game) {
      body = (
        <Center>
          <Logo />
          <p class="muted">Waiting for the host to open a game…</p>
          <div class="spinner" />
        </Center>
      );
    } else if (view.game.phase === "podium") {
      body = (
        <Center>
          <Logo />
          <p class="muted">This game has finished. Wait for the host to start the next one.</p>
        </Center>
      );
    } else {
      body = (
        <JoinForm
          title={view.game.title}
          busy={joining}
          onJoin={(nickname) => {
            setJoining(true);
            storage.set(NAME_KEY, nickname);
            send({ type: "join", nickname, ...savedAvatar() });
          }}
        />
      );
    }
  } else if (view.kind === "player" && view.phase === "lobby") {
    body = <LobbyScreen view={view} send={send} />;
  } else {
    const Screen = screenOf(view);
    body = <Screen view={view} send={send} />;
  }

  return (
    <>
      <ConnBanner status={view ? status : "open"} />
      {body}
      <Toast message={error} onDone={() => setError(null)} />
    </>
  );
}

function Logo() {
  return <div class="logo">Quizzer</div>;
}

function JoinForm({ title, busy, onJoin }: { title: string; busy: boolean; onJoin: (name: string) => void }) {
  const [name, setName] = useState(() => storage.get(NAME_KEY) ?? "");
  return (
    <Center>
      <Logo />
      <form
        class="card join"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) onJoin(name.trim());
        }}
      >
        <div class="join-title">{title}</div>
        <label for="nick">Your nickname</label>
        <input
          id="nick"
          value={name}
          onInput={(e) => setName(e.currentTarget.value)}
          maxLength={20}
          autoComplete="nickname"
          autoCapitalize="words"
          enterKeyHint="go"
          placeholder="e.g. Sam"
        />
        <button class="btn primary big" disabled={!name.trim() || busy}>
          {busy ? "Joining…" : "Join"}
        </button>
      </form>
    </Center>
  );
}

/** The lobby, in every game mode: Classic's view in its first phase, with the mode's banner if it has one. */
function LobbyScreen({ view, send }: { view: Joined; send: Send }) {
  return (
    <div class="game">
      <Bar view={view} />
      <Lobby view={view} send={send} />
    </div>
  );
}

function Lobby({ view, send }: { view: Joined; send: Send }) {
  // Show a pick straight away; the next snapshot from the server confirms it.
  const [picked, setPicked] = useState<AvatarChoice | null>(null);
  const server = view.me.avatar;
  useEffect(() => setPicked(null), [server.avatar, server.accessory]);
  const look = picked ?? server;
  const banner = view.banner ? PLAYER_MODES[view.banner].banner : null;
  return (
    <main class="center lobby-wait">
      <div class={`me-avatar ${banner ? banner.avatarClass : ""}`}>
        <Avatar choice={look} />
      </div>
      <h1>You're in!</h1>
      {banner && <banner.Line />}
      {view.team && (
        <div class="team-badge" style={{ background: view.team.color, color: teamInk(view.team.color) }}>
          Team {view.team.name}
        </div>
      )}
      <p class="muted">Pick your look while you wait. It shows on the big screen!</p>
      <AvatarPicker
        value={look}
        onPick={(choice) => {
          setPicked(choice);
          storage.set(AVATAR_KEY, JSON.stringify(choice));
          send({ type: "setAvatar", ...choice });
        }}
      />
      <p class="muted small">{view.playerCount} player{view.playerCount === 1 ? "" : "s"} joined</p>
    </main>
  );
}

setPhoneArt();
render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
  document.getElementById("app")!,
);

import { render } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import type { AvatarChoice } from "../../shared/avatars.ts";
import { cleanAvatar } from "../../shared/avatars.ts";
import type { ClientMsg } from "../../shared/protocol.ts";
import { setPhoneArt } from "../shared/phone-art.ts";
import { ConnBanner, ErrorBoundary, Toast } from "../shared/ui.tsx";
import type { ConnStatus } from "../shared/ws.ts";
import { connect } from "../shared/ws.ts";
import { Center } from "./common.tsx";
import { LobbyScreen } from "./lobby.tsx";
import { PhoneModeScreen } from "./modes.tsx";
import { initialPhoneScreen, PhoneSession } from "./session.ts";

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
  const [{ view, resumeVersion, joining, kicked, error }, show] = useState(initialPhoneScreen);
  const conn = useRef<{ send(m: ClientMsg): void } | null>(null);
  const send = (message: ClientMsg) => conn.current?.send(message);
  const [session] = useState(
    () =>
      new PhoneSession({
        send,
        saveToken: (token) => storage.set(TOKEN_KEY, token),
        preloadImages,
        show,
      }),
  );

  useEffect(() => {
    const c = connect({
      onStatus: setStatus,
      onOpen: () => session.open(storage.get(TOKEN_KEY)),
      onMessage: (message) => session.receive(message),
    });
    conn.current = c;
    return () => c.close();
  }, [session]);

  let body;
  if (kicked) {
    body = (
      <Center>
        <h1>You were removed from the game</h1>
        <button class="btn primary" onClick={() => session.dismissKick()}>
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
            storage.set(NAME_KEY, nickname);
            session.join({ type: "join", nickname, ...savedAvatar() });
          }}
        />
      );
    }
  } else if (view.kind === "lobby") {
    body = (
      <LobbyScreen
        view={view}
        onAvatarPick={(choice) => {
          storage.set(AVATAR_KEY, JSON.stringify(choice));
          send({ type: "setAvatar", ...choice });
        }}
      />
    );
  } else {
    body = <PhoneModeScreen view={view} send={send} resumeVersion={resumeVersion} />;
  }

  return (
    <>
      <ConnBanner status={view ? status : "open"} />
      {body}
      <Toast message={error} onDone={() => session.dismissError()} />
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

setPhoneArt();
render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
  document.getElementById("app")!,
);

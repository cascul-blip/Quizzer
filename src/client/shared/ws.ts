import type { ClientMsg, ServerMsg } from "../../shared/protocol.ts";

export type ConnStatus = "connecting" | "open" | "closed";

const INITIAL_RETRY_DELAY_MS = 500;
const MAX_RETRY_DELAY_MS = 5000;

interface Connection {
  send(msg: ClientMsg): void;
  close(): void;
}

export function connect(handlers: {
  onOpen: (send: (msg: ClientMsg) => void) => void;
  onMessage: (msg: ServerMsg) => void;
  onStatus: (status: ConnStatus) => void;
}): Connection {
  let ws: WebSocket | null = null;
  let retryDelayMs = INITIAL_RETRY_DELAY_MS;
  let retry: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;
  let serverId: string | null = null;

  const url = `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`;

  const send = (msg: ClientMsg) => {
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  };

  function open() {
    if (stopped) return;
    if (retry) clearTimeout(retry);
    retry = null;
    handlers.onStatus("connecting");
    const sock = new WebSocket(url);
    ws = sock;
    sock.onopen = () => {
      retryDelayMs = INITIAL_RETRY_DELAY_MS;
      handlers.onStatus("open");
      handlers.onOpen(send);
    };
    sock.onmessage = (ev) => {
      let msg: ServerMsg;
      try {
        msg = JSON.parse(ev.data);
      } catch (e) {
        return console.error("Bad message", e);
      }
      if (msg.type === "hello") {
        // why: a restarted server means this page may be running outdated code, so reload it.
        if (serverId && serverId !== msg.serverId) {
          stopped = true;
          location.reload();
        }
        serverId = msg.serverId;
        return;
      }
      handlers.onMessage(msg);
    };
    sock.onclose = () => {
      if (ws !== sock) return;
      ws = null;
      handlers.onStatus("closed");
      if (stopped) return;
      retry = setTimeout(open, retryDelayMs);
      retryDelayMs = Math.min(retryDelayMs * 2, MAX_RETRY_DELAY_MS);
    };
    sock.onerror = () => sock.close();
  }

  const reconnectWhenVisibleAndDisconnected = () => {
    if (document.visibilityState === "visible" && !ws) open();
  };
  document.addEventListener("visibilitychange", reconnectWhenVisibleAndDisconnected);
  window.addEventListener("online", reconnectWhenVisibleAndDisconnected);

  open();

  return {
    send,
    close() {
      stopped = true;
      document.removeEventListener("visibilitychange", reconnectWhenVisibleAndDisconnected);
      window.removeEventListener("online", reconnectWhenVisibleAndDisconnected);
      ws?.close();
    },
  };
}

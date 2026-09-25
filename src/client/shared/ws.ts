import type { ClientMsg, ServerMsg } from "../../shared/protocol.ts";

export type ConnStatus = "connecting" | "open" | "closed";

export interface Connection {
  send(msg: ClientMsg): void;
  close(): void;
}

/** WebSocket with automatic reconnect (backoff up to 5s, immediate retry when the tab becomes visible). */
export function connect(handlers: {
  onOpen: (send: (msg: ClientMsg) => void) => void;
  onMessage: (msg: ServerMsg) => void;
  onStatus: (status: ConnStatus) => void;
}): Connection {
  let ws: WebSocket | null = null;
  let delay = 500;
  let retry: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;

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
      delay = 500;
      handlers.onStatus("open");
      handlers.onOpen(send);
    };
    sock.onmessage = (ev) => {
      try {
        handlers.onMessage(JSON.parse(ev.data));
      } catch (e) {
        console.error("Bad message", e);
      }
    };
    sock.onclose = () => {
      if (ws !== sock) return;
      ws = null;
      handlers.onStatus("closed");
      if (stopped) return;
      retry = setTimeout(open, delay);
      delay = Math.min(delay * 2, 5000);
    };
    sock.onerror = () => sock.close();
  }

  const onVisible = () => {
    if (document.visibilityState === "visible" && !ws) open();
  };
  document.addEventListener("visibilitychange", onVisible);
  window.addEventListener("online", onVisible);

  open();

  return {
    send,
    close() {
      stopped = true;
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onVisible);
      ws?.close();
    },
  };
}

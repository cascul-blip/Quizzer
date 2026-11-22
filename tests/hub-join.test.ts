import { afterEach, beforeEach, expect, test } from "bun:test";
import { QuizStore } from "../src/server/quiz/store.ts";
import { GameHub } from "../src/server/ws.ts";
import { FakeClock, tempDir } from "./helpers.ts";
import { HubSocket } from "./hub-harness.ts";

// Join information as the projector sees it, through the hub's host view.

let t: ReturnType<typeof tempDir>;
let hub: GameHub;
let host: HubSocket;

beforeEach(() => {
  t = tempDir();
  hub = new GameHub(new QuizStore(t.dir), {
    discoverAddresses: () => [
      { address: "192.168.1.5", iface: "wlan0" },
      { address: "10.0.0.7", iface: "eth0" },
    ],
    clock: new FakeClock(),
  });
  hub.join.port = 4321;
  host = new HubSocket(hub, { admin: true, role: "host" });
});

afterEach(() => {
  hub.closeGame();
  t.cleanup();
});

test("the projector shows the best address, port and a QR code that arrives in a later broadcast", async () => {
  const first = await host.hostState((v) => v.kind === "idle");
  expect(first.view.join).toMatchObject({ url: "http://192.168.1.5:4321/", address: "192.168.1.5", port: 4321, qrSvg: "" });
  expect(first.view.join.addresses.map((a) => a.address)).toEqual(["192.168.1.5", "10.0.0.7"]);
  const ready = await host.hostState((v) => !!v.join.qrSvg);
  expect(ready.view.join.qrSvg).toContain("<svg");
});

test("choosing an address updates the URL and broadcasts it to the projector", async () => {
  await host.hostState((v) => !!v.join.qrSvg);
  host.msgs = [];
  host.sendMsg({ type: "host.setAddress", address: "10.0.0.7" });
  const changed = await host.hostState((v) => v.join.address === "10.0.0.7");
  expect(changed.view.join.url).toBe("http://10.0.0.7:4321/");
  expect(hub.join.url()).toBe("http://10.0.0.7:4321/");
});

test("an address that is not on this computer is rejected with an error and changes nothing", async () => {
  host.sendMsg({ type: "host.setAddress", address: "8.8.8.8" });
  await host.waitFor((m) => m.type === "error" && m.message.includes("not an address of this computer"));
  expect(hub.join.url()).toBe("http://192.168.1.5:4321/");
});

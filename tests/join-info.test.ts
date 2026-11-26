import { expect, test } from "bun:test";
import { JoinInformation } from "../src/server/join-info.ts";
import type { LanAddress } from "../src/server/network.ts";

const wifi: LanAddress = { address: "192.168.1.5", iface: "wlan0" };
const eth: LanAddress = { address: "10.0.0.7", iface: "eth0" };

function make(list: () => LanAddress[], extra: { forcedAddress?: string; now?: () => number; onQrReady?: () => void } = {}) {
  const j = new JoinInformation({ discoverAddresses: list, ...extra });
  j.port = 4321;
  return j;
}

test("falls back to the first discovered address, then to localhost", () => {
  expect(make(() => [wifi, eth]).url()).toBe("http://192.168.1.5:4321/");
  expect(make(() => []).url()).toBe("http://localhost:4321/");
});

test("a selected address is used until it disappears", () => {
  let list = [wifi, eth];
  let now = 0;
  const j = make(() => list, { now: () => now });
  j.select("10.0.0.7");
  expect(j.address).toBe("10.0.0.7");
  list = [wifi];
  const PAST_DISCOVERY_CACHE_MS = 10_000;
  now = PAST_DISCOVERY_CACHE_MS;
  expect(j.address).toBe("192.168.1.5");
});

test("rejects addresses that are not on this computer", () => {
  const j = make(() => [wifi]);
  expect(j.select("8.8.8.8")).toBe(false);
  expect(j.address).toBe("192.168.1.5");
  expect(j.select("192.168.1.5")).toBe(true);
});

test("a forced --host address is selected, listed first and survives discovery", () => {
  const j = make(() => [wifi], { forcedAddress: "example.lan" });
  expect(j.address).toBe("example.lan");
  const info = j.info();
  expect(info.addresses[0]).toEqual({ address: "example.lan", iface: "--host" });
  expect(info.url).toBe("http://example.lan:4321/");
});

test("discovery is cached for a few seconds", () => {
  let calls = 0;
  let now = 0;
  const j = make(() => (calls++, [wifi]), { now: () => now });
  j.addresses();
  now = 4000;
  j.addresses();
  expect(calls).toBe(1);
  now = 6000;
  j.addresses();
  expect(calls).toBe(2);
});

function withQrSignals(list: () => LanAddress[]) {
  let waiter = Promise.withResolvers<void>();
  const j = make(list, { onQrReady: () => waiter.resolve() });
  return {
    j,
    async nextQr() {
      await waiter.promise;
      waiter = Promise.withResolvers<void>();
    },
  };
}

test("the QR code stays empty while pending and is available once ready", async () => {
  const { j, nextQr } = withQrSignals(() => [wifi]);
  expect(j.info().qrSvg).toBe("");
  expect(j.info().qrSvg).toBe("");
  await nextQr();
  expect(j.info().qrSvg).toContain("<svg");
});

test("a new address gets its own QR code", async () => {
  const { j, nextQr } = withQrSignals(() => [wifi, eth]);
  j.info();
  await nextQr();
  j.select("10.0.0.7");
  expect(j.info().qrSvg).toBe("");
  await nextQr();
  expect(j.info().qrSvg).toContain("<svg");
});

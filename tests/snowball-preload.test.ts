import { afterAll, expect, test } from "bun:test";

// A stand-in Image that records each fetch and lets the test finish decodes one at a time.
const fetched: string[] = [];
const pending: (() => void)[] = [];
class FakeImage {
  set src(v: string) {
    fetched.push(v);
  }
  decode() {
    return new Promise<void>((resolve) => pending.push(resolve));
  }
}
const realImage = globalThis.Image;
(globalThis as { Image: unknown }).Image = FakeImage;
afterAll(() => {
  (globalThis as { Image: unknown }).Image = realImage;
});

const { preloadSnowballArt, snowballBackground } = await import("../src/client/shared/duel-christmas.tsx");

const settle = async () => {
  pending.shift()?.();
  await new Promise((r) => setTimeout(r, 0));
};

test("a phone loads only its own arena's backdrop, one file at a time, then the next arena when it moves", async () => {
  preloadSnowballArt(true, 3);
  expect(fetched).toEqual([snowballBackground(3, true)]);
  await settle();
  expect(fetched).toHaveLength(2);
  await settle();
  await settle();
  expect(fetched).toHaveLength(3);
  for (let a = 1; a <= 4; a++) if (a !== 3) expect(fetched).not.toContain(snowballBackground(a, true));

  // Moving arena fetches just that backdrop; the sheet and puff are already held.
  preloadSnowballArt(true, 2);
  await settle();
  expect(fetched).toHaveLength(4);
  expect(fetched.at(-1)).toBe(snowballBackground(2, true));
});

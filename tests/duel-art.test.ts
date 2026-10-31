import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import {
  DUEL_ASPECT,
  DUEL_FEET_Y,
  DUEL_FILES,
  DUEL_HEAD,
  DUEL_MUZZLE,
  DUEL_PHONE_ART,
  DUEL_PROJECTOR_ART,
  duelHead,
  duelMuzzle,
  duelStreetId,
} from "../src/client/shared/duel-art.tsx";
import { DUEL_CLIPS, DUEL_OBJECTS } from "../src/client/shared/duel/meta.ts";

const dir = new URL("../src/client/shared/duel/", import.meta.url);

/** Width and height from a WebP file's header (lossy, lossless or extended). */
function webpSize(b: Buffer): [number, number] {
  expect(b.toString("latin1", 0, 4) + b.toString("latin1", 8, 12)).toBe("RIFFWEBP");
  const chunk = b.toString("latin1", 12, 16);
  if (chunk === "VP8X") return [1 + b.readUIntLE(24, 3), 1 + b.readUIntLE(27, 3)];
  if (chunk === "VP8L") {
    const v = b.readUInt32LE(21);
    return [(v & 0x3fff) + 1, ((v >>> 14) & 0x3fff) + 1];
  }
  return [b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff];
}

const onDisk = (sub: string) =>
  readdirSync(new URL(sub, dir))
    .filter((f) => f.endsWith(".webp"))
    .map((f) => f.replace(/\.webp$/, ""))
    .sort();

describe("showdown art files", () => {
  test("meta.ts lists exactly the WebPs in duel/ and duel/phone/, at their real sizes", () => {
    const ids = Object.keys(DUEL_FILES);
    expect(ids.filter((i) => DUEL_FILES[i]!.projector).sort()).toEqual(onDisk("./"));
    expect(ids.filter((i) => DUEL_FILES[i]!.phone).sort()).toEqual(onDisk("phone/"));
    expect(Object.keys(DUEL_PROJECTOR_ART).sort()).toEqual(onDisk("./"));
    expect(Object.keys(DUEL_PHONE_ART).sort()).toEqual(onDisk("phone/"));
    for (const [id, f] of Object.entries(DUEL_FILES)) {
      for (const [sub, size] of [["", f.projector], ["phone/", f.phone]] as const) {
        if (!size) continue;
        const b = readFileSync(new URL(`${sub}${id}.webp`, dir));
        expect([id, ...webpSize(b)]).toEqual([id, ...size]);
        const alpha = b.toString("latin1", 12, 16) === "VP8X" && (b[20]! & 0x10) !== 0;
        expect([id, alpha]).toEqual([id, !f.opaque]);
      }
    }
  });

  test("the clips are projector only and the total stays modest", () => {
    expect(onDisk("phone/").some((f) => f.startsWith("clip-"))).toBe(false);
    const bytes = [...onDisk("./"), ...onDisk("phone/").map((f) => `phone/${f}`)].reduce((n, f) => n + statSync(new URL(`${f}.webp`, dir)).size, 0);
    expect(bytes).toBeLessThan(4 * 1024 * 1024);
  });

  test("every pose has a body (and a phone copy), every clip a sheet", () => {
    for (const pose of Object.keys(DUEL_HEAD)) {
      expect(DUEL_FILES[`body-${pose}`]?.phone).toBeTruthy();
    }
    expect(DUEL_FILES["body-tip-hand"]?.phone).toBeTruthy();
    for (const hat of ["brown", "black", "white", "sheriff"]) expect(DUEL_FILES[`hat-${hat}`]?.phone).toBeTruthy();
    for (const [clip, m] of Object.entries(DUEL_CLIPS)) {
      expect(DUEL_FILES[`clip-${clip}`]?.projector).toEqual([m.w, m.h]);
      expect(m.head.length).toBe(m.frames);
      expect(m.cols * m.rows).toBeGreaterThanOrEqual(m.frames);
    }
    for (const [clip, m] of Object.entries(DUEL_OBJECTS)) {
      expect(DUEL_FILES[`clip-${clip}`]?.projector).toEqual([m.w, m.h]);
      expect(m.w as number).toBe(m.cellW * m.frames);
    }
    expect(DUEL_OBJECTS["hat-fly"].track.length).toBe(DUEL_OBJECTS["hat-fly"].frames);
  });
});

describe("showdown geometry", () => {
  test("the Duelist box is the 16:9 canvas; the head is where the art was drawn (600, 177)", () => {
    expect(DUEL_ASPECT).toBeCloseTo(16 / 9, 5);
    for (const h of Object.values(DUEL_HEAD)) {
      expect(Math.abs(h.x - (600 / 1280) * 100)).toBeLessThan(0.3);
      expect(Math.abs(h.y - (177 / 720) * 100)).toBeLessThan(0.5);
    }
    expect(DUEL_FEET_Y).toBeGreaterThan(89);
    expect(DUEL_FEET_Y).toBeLessThan(91);
  });

  test("the muzzle is out in front, at shoulder height, and mirrors", () => {
    expect(DUEL_MUZZLE.x).toBeGreaterThan(DUEL_HEAD.fire.x + 5);
    expect(DUEL_MUZZLE.y).toBeGreaterThan(DUEL_HEAD.fire.y);
    expect(DUEL_MUZZLE.y).toBeLessThan(40);
    expect(duelMuzzle("left").x).toBeCloseTo(100 - DUEL_MUZZLE.x, 5);
    expect(duelHead("idle", "left").x).toBeCloseTo(100 - DUEL_HEAD.idle.x, 5);
  });

  test("arena 1 is High Noon; the rest cycle the three streets", () => {
    expect([1, 2, 3, 4, 5, 6, 7].map(duelStreetId)).toEqual(["high-noon", "street-1", "street-2", "street-3", "street-1", "street-2", "street-3"]);
  });
});

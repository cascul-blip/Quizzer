import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { ROBOT_BOARD } from "../src/shared/protocol.ts";
import { tileBox } from "../src/client/shared/robot-art.tsx";
import { TILE_ART } from "../src/client/shared/robot/tiles.ts";
import { TILE_ART as SNOW_TILE_ART } from "../src/client/shared/snowman/tiles.ts";
import { POSE, RS, armForTip, boardPt, contactTime, layout, planAttack } from "../src/client/shared/snowman-art.tsx";

const dir = new URL("../src/client/shared/robot/", import.meta.url);
const tilesDir = new URL("tiles/", dir);
const snowTilesDir = new URL("../src/client/shared/snowman/tiles/", import.meta.url);

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

const tileFile = (i: number) => `t-${String(i).padStart(3, "0")}.webp`;

describe("robot arena art", () => {
  test("there is one granite tile per board index, imported in order", () => {
    const onDisk = readdirSync(tilesDir)
      .filter((f) => f.endsWith(".webp"))
      .sort();
    const n = ROBOT_BOARD * ROBOT_BOARD;
    expect(onDisk).toEqual(Array.from({ length: n }, (_, i) => tileFile(i)));
    expect(TILE_ART.length).toBe(n);
    TILE_ART.forEach((url, i) => expect(url.endsWith(tileFile(i))).toBe(true));
  });

  test("each tile goes where the art was baked for, at 2 px per arena unit", () => {
    // tiles.json is the art build's record of where it rendered each tile; a change to the board's
    // perspective constants without re-rendering the tiles shows up here.
    const baked: Record<string, [number, number, number, number]> = JSON.parse(readFileSync(new URL("tiles.json", tilesDir), "utf8"));
    for (let i = 0; i < ROBOT_BOARD * ROBOT_BOARD; i++) {
      const b = tileBox(i % ROBOT_BOARD, Math.floor(i / ROBOT_BOARD));
      expect([i, b.x, b.y, b.width, b.height]).toEqual([i, ...baked[i]!]);
      expect([i, ...webpSize(readFileSync(new URL(tileFile(i), tilesDir)))]).toEqual([i, 2 * b.width, 2 * b.height]);
    }
  });

  test("the retired arm and joint pieces are gone", () => {
    expect(existsSync(new URL("arm.webp", dir))).toBe(false);
    expect(existsSync(new URL("joint.webp", dir))).toBe(false);
  });
});

describe("evil snowman art (seasonal Robot Attack skin)", () => {
  test("there is one snow/ice tile per board index, imported in order, baked for the same boxes as the granite", () => {
    const n = ROBOT_BOARD * ROBOT_BOARD;
    const onDisk = readdirSync(snowTilesDir).filter((f) => f.startsWith("t-")).sort();
    expect(onDisk).toEqual(Array.from({ length: n }, (_, i) => tileFile(i)));
    expect(SNOW_TILE_ART.length).toBe(n);
    SNOW_TILE_ART.forEach((url, i) => expect(url.endsWith(`snowman/tiles/${tileFile(i)}`)).toBe(true));
    const baked: Record<string, [number, number, number, number]> = JSON.parse(readFileSync(new URL("tiles.json", snowTilesDir), "utf8"));
    for (let i = 0; i < n; i++) {
      const b = tileBox(i % ROBOT_BOARD, Math.floor(i / ROBOT_BOARD));
      expect([i, b.x, b.y, b.width, b.height]).toEqual([i, ...baked[i]!]);
      expect([i, ...webpSize(readFileSync(new URL(tileFile(i), snowTilesDir)))]).toEqual([i, 2 * b.width, 2 * b.height]);
    }
  });

  test("the robot's original art is kept, for when the season is over", () => {
    for (const f of ["body.webp", "backdrop.webp", "arm-segment.webp", "emitter.webp", "reticle.webp"]) expect(existsSync(new URL(f, dir))).toBe(true);
  });

  test("the claw tip lands where the rake asks (IK, rigid twigs)", () => {
    for (const [u, v] of [[11.9, 4], [8, 4.15], [5.7, 4], [9, 2]] as const) {
      const P = boardPt(u, v);
      const tip = layout(RS, armForTip(P, 108, POSE.open)).tip;
      expect(Math.hypot(tip.x - P.x, tip.y - P.y)).toBeLessThan(0.01);
    }
  });

  test("contact times match the art's reference sweep (rows 3–4, columns 11 → 6)", () => {
    const r = { u0: 11.9, u1: 5.7, v: 4 };
    const want: Record<number, number> = { 11: 0.94, 10: 1.08, 9: 1.18, 8: 1.28, 7: 1.38, 6: 1.5 };
    for (const [u, t] of Object.entries(want)) expect(Math.abs(contactTime(r, Number(u)) - t)).toBeLessThan(0.006);
  });

  test("each hand rakes its own half, and every marked tile gets a contact time during the sweep", () => {
    const marked = [0, 5, 6, 11, 13 * 5, 140, 143];
    const plan = planAttack(marked, [{ id: "a", avatar: { avatar: "cat", accessory: "none" } as never, x: 11, y: 11 }], new Set(["a"]));
    expect(Object.keys(plan.rakes).sort()).toEqual(["L", "R"]);
    for (const i of marked) {
      const t = plan.contact.get(i)!;
      expect(t).toBeGreaterThanOrEqual(0.8);
      expect(t).toBeLessThanOrEqual(1.7);
    }
    expect(planAttack([6, 7], [], new Set()).rakes.L).toBeUndefined();
  });
});

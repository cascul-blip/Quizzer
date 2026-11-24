import type { PlayerLandView } from "../src/shared/modes/land.ts";

export const claimView: PlayerLandView = {
  kind: "land",
  theme: "classic",
  phase: "playing",
  title: "Land Grab",
  remainingMs: 100_000,
  me: { id: "settler", nickname: "Settler", avatar: { avatar: "fox", accessory: "none" }, correct: 2, placed: 0, stolen: 0 },
  team: { index: 0, name: "Red", color: "#d81e3a" },
  teamTiles: 1,
  state: "claim",
  claims: 2,
  answered: 0,
  emptyMs: 0,
  question: null,
  feedback: null,
  board: {
    size: 10,
    owners: Array.from({ length: 100 }, (_, i) => (i === 1 || i === 47 ? 1 : i === 42 ? 0 : -1)),
    starts: [
      { tile: 42, team: 0, out: false },
      { tile: 47, team: 1, out: false },
    ],
  },
  claimWait: { activityKey: 3, remainingMs: 1000 },
  conquered: null,
  result: null,
};

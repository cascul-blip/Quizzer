import profiles from "./fight-ground-profiles.json";
import type { HillHeight } from "./fight-physics.ts";

/** why: generated from the painted silhouettes, so collision and rendering share one profile. */
export const gingerbreadGround = (hill: HillHeight) => profiles[hill];
/** why: a copy, because games carve their terrain and the pristine profile must stay intact. */
export const gingerbreadTerrain = (hill: HillHeight): number[] => [...profiles[hill].terrain];

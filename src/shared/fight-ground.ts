import profiles from "./fight-ground-profiles.json";
import type { HillHeight } from "./fight-physics.ts";

/** Generated from the three painted silhouettes. Shared by collision physics and rendering. */
export const gingerbreadGround = (hill: HillHeight) => profiles[hill];
/** Games own their mutable terrain; artwork and the pristine collision profile remain fixed. */
export const gingerbreadTerrain = (hill: HillHeight): number[] => [...profiles[hill].terrain];

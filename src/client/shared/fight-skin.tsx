import { createContext, type ComponentChildren } from "preact";
import { useContext } from "preact/hooks";
import { fightTheme, type FightTheme } from "../../shared/fight-theme.ts";
import castle0 from "./fight/christmas/castle-0.webp";
import castle1 from "./fight/christmas/castle-1.webp";
import castle2 from "./fight/christmas/castle-2.webp";
import castle3 from "./fight/christmas/castle-3.webp";
import castle4 from "./fight/christmas/castle-4.webp";
import base from "./fight/christmas/catapult-base.webp";
import arm from "./fight/christmas/catapult-arm.webp";
import sky from "./fight/christmas/sky.webp";
import earth from "./fight/christmas/earth.webp";
import phoneCastle0 from "./fight/christmas/phone/castle-0.webp";
import phoneCastle1 from "./fight/christmas/phone/castle-1.webp";
import phoneCastle2 from "./fight/christmas/phone/castle-2.webp";
import phoneCastle3 from "./fight/christmas/phone/castle-3.webp";
import phoneCastle4 from "./fight/christmas/phone/castle-4.webp";
import phoneBase from "./fight/christmas/phone/catapult-base.webp";
import phoneArm from "./fight/christmas/phone/catapult-arm.webp";
import phoneSky from "./fight/christmas/phone/sky.webp";
import phoneEarth from "./fight/christmas/phone/earth.webp";
import { isPhoneArt } from "./phone-art.ts";
import groundLow from "./fight/christmas/ground-low.webp";
import groundMedium from "./fight/christmas/ground-medium.webp";
import groundHigh from "./fight/christmas/ground-high.webp";
import phoneGroundLow from "./fight/christmas/phone/ground-low.webp";
import phoneGroundMedium from "./fight/christmas/phone/ground-medium.webp";
import phoneGroundHigh from "./fight/christmas/phone/ground-high.webp";
import flagRed from "./fight/christmas/flag-red.webp";
import flagBlue from "./fight/christmas/flag-blue.webp";
import phoneFlagRed from "./fight/christmas/phone/flag-red.webp";
import phoneFlagBlue from "./fight/christmas/phone/flag-blue.webp";
const Theme = createContext<FightTheme>("classic");
export function FightThemeProvider({ theme, children }: { theme?: FightTheme; children: ComponentChildren }) {
  return <Theme.Provider value={fightTheme(theme)}>{children}</Theme.Provider>;
}
export const useGingerbread = () => useContext(Theme) === "christmas";
export const gingerbreadArt = { castles: [castle0, castle1, castle2, castle3, castle4], base, arm, sky, earth, flags: [flagRed, flagBlue], grounds: { low: groundLow, medium: groundMedium, high: groundHigh } };
const phoneArt = { castles: [phoneCastle0, phoneCastle1, phoneCastle2, phoneCastle3, phoneCastle4], base: phoneBase, arm: phoneArm, sky: phoneSky, earth: phoneEarth, flags: [phoneFlagRed, phoneFlagBlue], grounds: { low: phoneGroundLow, medium: phoneGroundMedium, high: phoneGroundHigh } };
export const fightChristmasArt = () => isPhoneArt() ? phoneArt : gingerbreadArt;

/** Release starts immediately with the authoritative shot; late snapshots resume rather than replay. */
export function catapultAngle(ageMs: number): number {
  if (ageMs < 0 || ageMs >= 700) return 24;
  if (ageMs < 130) return 24 + 106 * (1 - (1 - ageMs / 130) ** 3);
  if (ageMs < 240) return 130 - 12 * ((ageMs - 130) / 110);
  const t = (ageMs - 240) / 460;
  return 118 - 94 * (t * t * (3 - 2 * t));
}

import type { RobotAttack } from "../../shared/protocol.ts";
import type { VoiceLineId } from "../../shared/voice-lines.ts";
import type { RobotSkin } from "./robot-skin.ts";

/** Warning delivered after the target-lock alarm, before movement and the attack. */
export function warningVoiceLine(skin: RobotSkin): VoiceLineId {
  return skin === "snowman" ? "lookwarm" : "targets-acquired";
}

/** Clips needed for the selected attacker, downloaded before play. */
export function attackerVoiceLines(skin: RobotSkin): VoiceLineId[] {
  return skin === "snowman"
    ? ["lookwarm", "frostyaim", "coldispatient", "thawout"]
    : ["targets-acquired", "cannot-evade", "flesh-is-weak", "only-metal-endures"];
}

/** One verdict per attack: eliminations take priority over surviving hits. */
export function attackVoiceLine(attack: RobotAttack | null, skin: RobotSkin): VoiceLineId | null {
  if (!attack) return null;
  if (attack.eliminated.length > 0) return skin === "snowman" ? "thawout" : "only-metal-endures";
  if (attack.hit.length > 0) return skin === "snowman" ? "coldispatient" : "flesh-is-weak";
  return skin === "snowman" ? "frostyaim" : "cannot-evade";
}

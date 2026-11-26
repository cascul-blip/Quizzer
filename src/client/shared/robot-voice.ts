import type { RobotAttack } from "../../shared/modes/robot.ts";
import type { VoiceLineId } from "../../shared/voice-lines.ts";
import type { RobotSkin } from "./robot-skin.ts";

// why: plays after the target-lock alarm, before movement and the attack.
export function warningVoiceLine(skin: RobotSkin): VoiceLineId {
  return skin === "snowman" ? "lookwarm" : "targets-acquired";
}

export function attackerVoiceLines(skin: RobotSkin): VoiceLineId[] {
  return skin === "snowman"
    ? ["lookwarm", "frostyaim", "coldispatient", "thawout"]
    : ["targets-acquired", "cannot-evade", "flesh-is-weak", "only-metal-endures"];
}

// why: one verdict per attack; eliminations take priority over surviving hits.
export function attackVoiceLine(attack: RobotAttack | null, skin: RobotSkin): VoiceLineId | null {
  if (!attack) return null;
  if (attack.eliminated.length > 0) return skin === "snowman" ? "thawout" : "only-metal-endures";
  if (attack.hit.length > 0) return skin === "snowman" ? "coldispatient" : "flesh-is-weak";
  return skin === "snowman" ? "frostyaim" : "cannot-evade";
}

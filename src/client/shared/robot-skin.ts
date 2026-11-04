/**
 * Which look Robot Attack plays with. The game itself is the same either way.
 * - "robot": the robed machine priest in the forge, with laser arms (the original art, in robot/).
 * - "snowman": the seasonal Evil Snowman in a snowy forest, who rakes the board with a twig claw (snowman/).
 * Change back to "robot" when the season is over.
 */
export type RobotSkin = "robot" | "snowman";

export const ROBOT_SKIN = "snowman" as RobotSkin;

/** Words and emoji that name the attacker on the projector and the phones. */
export const SKIN_TEXT = ROBOT_SKIN === "snowman"
  ? { emoji: "⛄", attacker: "the snowman", Attacker: "The snowman", attack: "sweeps", banner: "❄️ SWEEP!", knockedOut: "Swept away!" }
  : { emoji: "🤖", attacker: "the robot", Attacker: "The robot", attack: "fires", banner: "🔥 FIRE!", knockedOut: "Zapped!" };

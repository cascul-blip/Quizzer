export type RobotSkin = "robot" | "snowman";

// why: "snowman" is the seasonal look; change back to "robot" when the season is over.
export const ROBOT_SKIN = "snowman" as RobotSkin;

export const SKIN_TEXT =
  ROBOT_SKIN === "snowman"
    ? { emoji: "⛄", attacker: "the snowman", Attacker: "The snowman", attack: "sweeps", banner: "❄️ SWEEP!", knockedOut: "Swept away!" }
    : { emoji: "🤖", attacker: "the robot", Attacker: "The robot", attack: "fires", banner: "🔥 FIRE!", knockedOut: "Zapped!" };

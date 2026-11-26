export type RobotSkin = "robot" | "snowman";

export const ROBOT_SKIN = "snowman" as RobotSkin;

export const SKIN_TEXT =
  ROBOT_SKIN === "snowman"
    ? { emoji: "⛄", attacker: "the snowman", Attacker: "The snowman", attack: "sweeps", banner: "❄️ SWEEP!", knockedOut: "Swept away!" }
    : { emoji: "🤖", attacker: "the robot", Attacker: "The robot", attack: "fires", banner: "🔥 FIRE!", knockedOut: "Zapped!" };

import { TEAMS, type TeamShape } from "../../shared/protocol.ts";

// Every team has a shape as well as a colour, so teams can be told apart without relying on colour alone.

/** Outlines centred on (0, 0), about 1 unit from the centre to the edge. */
const SHAPE_PATHS: Record<TeamShape, string> = {
  circle: "M0 -0.9A0.9 0.9 0 1 1 0 0.9A0.9 0.9 0 1 1 0 -0.9Z",
  square: "M-0.78 -0.78H0.78V0.78H-0.78Z",
  triangle: "M0 -0.95L0.95 0.72H-0.95Z",
  diamond: "M0 -1L0.85 0L0 1L-0.85 0Z",
  star: "M0 -1L0.235 -0.324L0.951 -0.309L0.38 0.124L0.588 0.809L0 0.4L-0.588 0.809L-0.38 0.124L-0.951 -0.309L-0.235 -0.324Z",
  heart: "M0 0.9C-0.35 0.6 -1 0.15 -1 -0.35C-1 -0.75 -0.65 -0.95 -0.4 -0.95C-0.2 -0.95 -0.05 -0.82 0 -0.65C0.05 -0.82 0.2 -0.95 0.4 -0.95C0.65 -0.95 1 -0.75 1 -0.35C1 0.15 0.35 0.6 0 0.9Z",
};

export const teamShape = (team: number): TeamShape => TEAMS[team % TEAMS.length]!.shape;

/** A team's shape as SVG, for inside another SVG: `r` is the distance from the centre to the edge. */
export function ShapePath({ team, r, class: cls, style }: { team: number; r: number; class?: string; style?: Record<string, string> }) {
  return <path class={cls} d={SHAPE_PATHS[teamShape(team)]} transform={`scale(${r})`} style={style} />;
}

/** A team's shape as an inline icon in its colour, sized to the surrounding text. */
export function TeamShapeIcon({ team, color }: { team: number; color?: string }) {
  return (
    <svg class="team-shape" viewBox="-1.15 -1.15 2.3 2.3" aria-label={teamShape(team)} role="img">
      <path d={SHAPE_PATHS[teamShape(team)]} style={{ fill: color ?? TEAMS[team % TEAMS.length]!.color }} />
    </svg>
  );
}

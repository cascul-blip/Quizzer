import { useEffect, useState } from "preact/hooks";
import { EMPTY, borderEdges, boardExtent, hexCenter, isProtected, placementCost } from "../../shared/land-board.ts";
import { LAND_GUARD_COST, LAND_STEAL_COST, TEAMS, type LandBoard, type LandCapture, type LandPlace } from "../../shared/protocol.ts";
import backgroundImg from "./land/background.webp";
import bannerImg from "./land/banner.webp";
import bannerTintImg from "./land/banner-tint.webp";
import captureFlashImg from "./land/capture-flash.webp";
import claimed1Img from "./land/claimed-1.webp";
import claimed2Img from "./land/claimed-2.webp";
import claimed3Img from "./land/claimed-3.webp";
import compassRoseImg from "./land/compass-rose.webp";
import cost2Img from "./land/cost-2.webp";
import costBlankImg from "./land/cost-blank.webp";
import feltTileImg from "./land/felt-tile.webp";
import grass1Img from "./land/grass-1.webp";
import grass2Img from "./land/grass-2.webp";
import grass3Img from "./land/grass-3.webp";
import grass4Img from "./land/grass-4.webp";
import keepBlueImg from "./land/keep-blue.webp";
import keepCyanImg from "./land/keep-cyan.webp";
import keepOutImg from "./land/keep-out.webp";
import keepPinkImg from "./land/keep-pink.webp";
import keepPurpleImg from "./land/keep-purple.webp";
import keepRedImg from "./land/keep-red.webp";
import keepYellowImg from "./land/keep-yellow.webp";
import placePopImg from "./land/place-pop.webp";
import podiumFirstImg from "./land/podium-1st.webp";
import podiumFirstTintImg from "./land/podium-1st-tint.webp";
import podiumSecondImg from "./land/podium-2nd.webp";
import podiumSecondTintImg from "./land/podium-2nd-tint.webp";
import podiumThirdImg from "./land/podium-3rd.webp";
import podiumThirdTintImg from "./land/podium-3rd-tint.webp";
import shapeCircleImg from "./land/shape-circle.webp";
import shapeDiamondImg from "./land/shape-diamond.webp";
import shapeHeartImg from "./land/shape-heart.webp";
import shapeSquareImg from "./land/shape-square.webp";
import shapeStarImg from "./land/shape-star.webp";
import shapeTriangleImg from "./land/shape-triangle.webp";
import stateBlockedImg from "./land/state-blocked.webp";
import stateGuardedImg from "./land/state-guarded.webp";
import stateSelectedImg from "./land/state-selected.webp";
import teamCardImg from "./land/team-card.webp";
import teamCardTintImg from "./land/team-card-tint.webp";
import trayWoodImg from "./land/tray-wood.webp";
import phoneBackgroundImg from "./land/phone/background.webp";
import phoneCaptureFlashImg from "./land/phone/capture-flash.webp";
import phoneClaimed1Img from "./land/phone/claimed-1.webp";
import phoneClaimed2Img from "./land/phone/claimed-2.webp";
import phoneClaimed3Img from "./land/phone/claimed-3.webp";
import phoneCompassRoseImg from "./land/phone/compass-rose.webp";
import phoneCost2Img from "./land/phone/cost-2.webp";
import phoneCostBlankImg from "./land/phone/cost-blank.webp";
import phoneFeltTileImg from "./land/phone/felt-tile.webp";
import phoneGrass1Img from "./land/phone/grass-1.webp";
import phoneGrass2Img from "./land/phone/grass-2.webp";
import phoneGrass3Img from "./land/phone/grass-3.webp";
import phoneGrass4Img from "./land/phone/grass-4.webp";
import phoneKeepBlueImg from "./land/phone/keep-blue.webp";
import phoneKeepCyanImg from "./land/phone/keep-cyan.webp";
import phoneKeepOutImg from "./land/phone/keep-out.webp";
import phoneKeepPinkImg from "./land/phone/keep-pink.webp";
import phoneKeepPurpleImg from "./land/phone/keep-purple.webp";
import phoneKeepRedImg from "./land/phone/keep-red.webp";
import phoneKeepYellowImg from "./land/phone/keep-yellow.webp";
import phoneMap10Img from "./land/phone/map-10.webp";
import phoneMap12Img from "./land/phone/map-12.webp";
import phoneMap14Img from "./land/phone/map-14.webp";
import phonePlacePopImg from "./land/phone/place-pop.webp";
import phoneShapeCircleImg from "./land/phone/shape-circle.webp";
import phoneShapeDiamondImg from "./land/phone/shape-diamond.webp";
import phoneShapeHeartImg from "./land/phone/shape-heart.webp";
import phoneShapeSquareImg from "./land/phone/shape-square.webp";
import phoneShapeStarImg from "./land/phone/shape-star.webp";
import phoneShapeTriangleImg from "./land/phone/shape-triangle.webp";
import phoneStateBlockedImg from "./land/phone/state-blocked.webp";
import phoneStateGuardedImg from "./land/phone/state-guarded.webp";
import phoneStateSelectedImg from "./land/phone/state-selected.webp";
import phoneTrayWoodImg from "./land/phone/tray-wood.webp";
import { pickArt } from "./phone-art.ts";
import { teamInk } from "./ui.tsx";

/*
 * Land Grab's board and its art, shared by the projector and the phones. The art is the
 * storybook parchment map in ./land/; ./land/manifest.md says where each piece goes, how big it is
 * and how it is tinted. Phones get the half-size copies in ./land/phone/. The card, banner
 * and plinths are projector only.
 */

/** Projector picture and phone copy for each piece. */
const ART = {
  "background": [backgroundImg, phoneBackgroundImg],
  "felt-tile": [feltTileImg, phoneFeltTileImg],
  "tray-wood": [trayWoodImg, phoneTrayWoodImg],
  "grass-1": [grass1Img, phoneGrass1Img],
  "grass-2": [grass2Img, phoneGrass2Img],
  "grass-3": [grass3Img, phoneGrass3Img],
  "grass-4": [grass4Img, phoneGrass4Img],
  "claimed-1": [claimed1Img, phoneClaimed1Img],
  "claimed-2": [claimed2Img, phoneClaimed2Img],
  "claimed-3": [claimed3Img, phoneClaimed3Img],
  // The maps are big, and even the phone copies (about 112 px per R) are twice what a 1080p projector needs, so both use them.
  "map-10": [phoneMap10Img, phoneMap10Img],
  "map-12": [phoneMap12Img, phoneMap12Img],
  "map-14": [phoneMap14Img, phoneMap14Img],
  "compass-rose": [compassRoseImg, phoneCompassRoseImg],
  "state-blocked": [stateBlockedImg, phoneStateBlockedImg],
  "state-guarded": [stateGuardedImg, phoneStateGuardedImg],
  "state-selected": [stateSelectedImg, phoneStateSelectedImg],
  "cost-2": [cost2Img, phoneCost2Img],
  "cost-blank": [costBlankImg, phoneCostBlankImg],
  "keep-red": [keepRedImg, phoneKeepRedImg],
  "keep-blue": [keepBlueImg, phoneKeepBlueImg],
  "keep-yellow": [keepYellowImg, phoneKeepYellowImg],
  "keep-cyan": [keepCyanImg, phoneKeepCyanImg],
  "keep-purple": [keepPurpleImg, phoneKeepPurpleImg],
  "keep-pink": [keepPinkImg, phoneKeepPinkImg],
  "keep-out": [keepOutImg, phoneKeepOutImg],
  "place-pop": [placePopImg, phonePlacePopImg],
  "capture-flash": [captureFlashImg, phoneCaptureFlashImg],
  "shape-circle": [shapeCircleImg, phoneShapeCircleImg],
  "shape-square": [shapeSquareImg, phoneShapeSquareImg],
  "shape-triangle": [shapeTriangleImg, phoneShapeTriangleImg],
  "shape-diamond": [shapeDiamondImg, phoneShapeDiamondImg],
  "shape-star": [shapeStarImg, phoneShapeStarImg],
  "shape-heart": [shapeHeartImg, phoneShapeHeartImg],
  "team-card": [teamCardImg, teamCardImg],
  "team-card-tint": [teamCardTintImg, teamCardTintImg],
  "banner": [bannerImg, bannerImg],
  "banner-tint": [bannerTintImg, bannerTintImg],
  "podium-1st": [podiumFirstImg, podiumFirstImg],
  "podium-1st-tint": [podiumFirstTintImg, podiumFirstTintImg],
  "podium-2nd": [podiumSecondImg, podiumSecondImg],
  "podium-2nd-tint": [podiumSecondTintImg, podiumSecondTintImg],
  "podium-3rd": [podiumThirdImg, podiumThirdImg],
  "podium-3rd-tint": [podiumThirdTintImg, podiumThirdTintImg],
} as const satisfies Record<string, readonly [string, string]>;

export type LandArtId = keyof typeof ART;

export const landArt = (id: LandArtId): string => pickArt(ART[id][0], ART[id][1]);

/** Corner radius of one hex in SVG units. */
const R = 10;
/** The manifest gives the board's offsets in tenths of R. */
const D = R / 10;
/** Tiles are drawn a little smaller than their cell, so the parchment edge shows between them as ink lines. */
const TILE_R = R * 0.95;
const TILE_W = TILE_R * Math.sqrt(3);
const hexCorners = (r: number) =>
  Array.from({ length: 6 }, (_, k) => {
    const a = (Math.PI / 180) * (60 * k - 90);
    return { x: Math.cos(a) * r, y: Math.sin(a) * r };
  });
const hexPoints = (r: number, x = 0, y = 0) =>
  hexCorners(r)
    .map((c) => `${(x + c.x).toFixed(2)},${(y + c.y).toFixed(2)}`)
    .join(" ");
const TILE = hexPoints(TILE_R);

/** The ink line where land changes hands, on the tile's edge. */
const BORDER_CORNERS = hexCorners(TILE_R);
/** The parchment edge: every cell a little bigger, an ink outline under a darker paper band, so its outline follows the board. */
const EDGE_INK_R = 1.17 * R;
const EDGE_R = 1.12 * R;
const INK = "#3a2412";
/** Size of one repeat of the edge paper. */
const WOOD = 40;
/** Room around the board for the edge and its shadow. */
const MARGIN = 5 * D;
/** The keep is 1.24 tiles wide; its anchor (the middle of its base) goes on the tile centre. */
const KEEP_W = 1.24 * TILE_W;
const KEEP_H = (KEEP_W * 801) / 552;
const KEEP_ANCHOR = { x: 0.496, y: 0.85 };
/** The cost badge's disc is 0.27 tiles high and fills 80% of its picture. */
const BADGE = (0.27 * 2 * TILE_R) / 0.8;
/** The selection and the capture flash are pictures 1.2 and 1.3 times the tile; the placing pop is square, 2 tiles wide. */
const SELECTED = 1.2;
/** The selected tile is also hatched in the map's own ink, so it reads at a glance on a phone. */
const HATCH_INK = "#1c130a";
const HATCH = 1.6;
const FLASH = 1.3;
const POP = 2 * TILE_W;

const GRASS: LandArtId[] = ["grass-1", "grass-2", "grass-3", "grass-4"];
const CLAIMED: LandArtId[] = ["claimed-1", "claimed-2", "claimed-3"];
/** The keep with its flag in each team's colour, in TEAMS order. */
const KEEPS: LandArtId[] = ["keep-red", "keep-blue", "keep-yellow", "keep-cyan", "keep-purple", "keep-pink"];
/** One continuous map per board size, covering boardExtent exactly. Other sizes fall back to grass-N and claimed-N per tile. */
const MAPS: Partial<Record<number, LandArtId>> = { 10: "map-10", 12: "map-12", 14: "map-14" };
/** Claimed tiles show the map lightened toward paper, then multiplied by the team colour; yellow, blue and purple get more lighten. */
const CLAIM_PAPER = "#fffaf0";
const CLAIM_LIGHTEN: Record<string, number> = { "#d81e3a": 0.35, "#1f5ee0": 0.4, "#f5c400": 0.45, "#12b5cb": 0.35, "#7d3cc8": 0.4, "#f0559e": 0.35 };

const CLIP_ID = "hex-clip";
const WOOD_ID = "hex-wood";
const SHADOW_ID = "hex-tray-shadow";
const MAP_CLIP_ID = "hex-map-clip";
const HATCH_ID = "hex-hatch";

export const teamColor = (team: number) => TEAMS[team % TEAMS.length]!.color;

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const toHex = (c: number[]) => `#${c.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;
/** A colour scaled toward black: 0.5 is half as bright. */
export const shade = (hex: string, f: number) => toHex(rgb(hex).map((v) => v * f));

/** A picture drawn over the tile's whole box (`scale` times the tile), centred on (x, y). */
function TileImage({ id, x, y, scale = 1, class: cls, style }: { id: LandArtId; x: number; y: number; scale?: number; class?: string; style?: Record<string, string> }) {
  const w = TILE_W * scale;
  const h = TILE_R * 2 * scale;
  return <image class={cls} href={landArt(id)} x={(x - w / 2).toFixed(2)} y={(y - h / 2).toFixed(2)} width={w.toFixed(2)} height={h.toFixed(2)} preserveAspectRatio="none" style={style} />;
}

export interface HexBoardProps {
  board: LandBoard;
  /** The team looking at the board: tiles it can't take are hatched, tiles that cost extra are marked. */
  viewer?: number;
  selected?: number | null;
  /** Just placed: pops in. */
  placed?: LandPlace | null;
  /** Just surrounded: these tiles flip over to their new colour. */
  capture?: LandCapture | null;
  label?: string;
}

/**
 * The whole board, back to front: parchment edge, the map, tiles (claimed ones tinted), borders,
 * keeps, then the viewer's tile states and the effects. Each tile carries data-tile, so a tap can be
 * traced back to it; everything drawn after the tiles lets taps through.
 */
export function HexBoard({ board, viewer, selected, placed, capture, label }: HexBoardProps) {
  const { size, owners, starts } = board;
  const { width, height } = boardExtent(size);
  const centres = owners.map((_, tile) => {
    const c = hexCenter(size, tile);
    return { x: c.x * R, y: c.y * R };
  });
  const top = (tile: number) => centres[tile]!;
  const [mapFailed, setMapFailed] = useState<string | null>(null);
  const mapId = MAPS[size];
  const map = mapId !== undefined && mapFailed !== mapId ? landArt(mapId) : null;
  const mapW = (width * R).toFixed(2);
  const mapH = (height * R).toFixed(2);
  const flipped = capture ? new Map(capture.tiles.map((t, i) => [t, i])) : null;
  const flipDelay = (i: number) => ({ animationDelay: `${Math.min(i * 25, 600)}ms` });

  const edge = (r: number) => centres.map((c, tile) => <polygon key={tile} points={hexPoints(r, c.x, c.y)} />);

  const tiles = owners.map((owner, tile) => {
    const c = centres[tile]!;
    const row = Math.floor(tile / size);
    const flipIndex = flipped?.get(tile);
    const grass = owner === EMPTY;
    const color = grass ? "" : teamColor(owner);
    const cls = ["hex", grass ? "grass" : "owned", placed?.tile === tile ? "placed" : "", flipIndex !== undefined ? "flipped" : ""].join(" ");
    // With a map, grass is the board-wide map showing through the transparent fill (which still takes the tap).
    // A claimed tile carries its own copy of the map inside .hex-body, so the multiply tint pops and flips with it.
    let face;
    if (map && grass) face = <polygon class="hex-fill" points={TILE} style={{ fill: "transparent" }} />;
    else if (map)
      face = (
        <>
          <polygon class="hex-fill" points={TILE} style={{ fill: "transparent" }} />
          <g class="hex-claim">
            <image href={map} x={(-c.x).toFixed(2)} y={(-c.y).toFixed(2)} width={mapW} height={mapH} preserveAspectRatio="none" clip-path={`url(#${CLIP_ID})`} />
            <polygon points={TILE} fill={CLAIM_PAPER} fill-opacity={CLAIM_LIGHTEN[color.toLowerCase()] ?? 0.4} />
            <polygon points={TILE} fill={color} style={{ mixBlendMode: "multiply" }} />
          </g>
        </>
      );
    else
      face = (
        <>
          <polygon class="hex-fill" points={TILE} style={grass ? undefined : { fill: color }} />
          <image
            href={landArt(grass ? GRASS[(tile * 7 + row * 3) % GRASS.length]! : CLAIMED[(tile * 5 + row) % CLAIMED.length]!)}
            x={-TILE_W / 2}
            y={-TILE_R}
            width={TILE_W}
            height={TILE_R * 2}
            preserveAspectRatio="none"
            clip-path={`url(#${CLIP_ID})`}
          />
        </>
      );
    return (
      <g key={tile} data-tile={tile} class={cls} transform={`translate(${c.x.toFixed(2)} ${c.y.toFixed(2)})`}>
        <g class="hex-body" style={flipIndex !== undefined ? flipDelay(flipIndex) : undefined}>
          {face}
          <polygon class="hex-edge" points={TILE} />
        </g>
      </g>
    );
  });

  const borders = borderEdges(owners, size).map(({ tile, side, owner }) => {
    const c = centres[tile]!;
    const a = BORDER_CORNERS[side]!;
    const b = BORDER_CORNERS[(side + 1) % 6]!;
    return (
      <line
        key={`${tile}-${side}`}
        x1={(c.x + a.x).toFixed(2)}
        y1={(c.y + a.y).toFixed(2)}
        x2={(c.x + b.x).toFixed(2)}
        y2={(c.y + b.y).toFixed(2)}
        style={{ stroke: shade(teamColor(owner), 0.55) }}
      />
    );
  });

  // Sorted by row, so a keep overlaps the tiles and keeps above it.
  const keeps = [...starts]
    .sort((a, b) => a.tile - b.tile)
    .map((s) => {
      const t = top(s.tile);
      return (
        <image
          key={s.team}
          href={landArt(s.out ? "keep-out" : KEEPS[s.team % KEEPS.length]!)}
          x={(t.x - KEEP_W * KEEP_ANCHOR.x).toFixed(2)}
          y={(t.y - KEEP_H * KEEP_ANCHOR.y).toFixed(2)}
          width={KEEP_W.toFixed(2)}
          height={KEEP_H.toFixed(2)}
        />
      );
    });

  const states =
    viewer === undefined
      ? []
      : owners.flatMap((owner, tile) => {
          if (owner === viewer) return [];
          const t = top(tile);
          if (isProtected(size, starts, viewer, tile)) return [<TileImage key={tile} id="state-blocked" x={t.x} y={t.y} />];
          // Takeable, but for more than one claim: another team's land, or the ring around its start.
          const cost = placementCost(owners, size, starts, viewer, tile, LAND_STEAL_COST, LAND_GUARD_COST);
          if (cost === null || cost <= 1) return [];
          return [
            <g key={tile}>
              <TileImage id="state-guarded" x={t.x} y={t.y} />
              <image href={landArt(cost === 2 ? "cost-2" : "cost-blank")} x={(t.x - BADGE / 2).toFixed(2)} y={(t.y - BADGE / 2).toFixed(2)} width={BADGE.toFixed(2)} height={BADGE.toFixed(2)} />
              {cost !== 2 && (
                <text class="hex-cost" x={t.x.toFixed(2)} y={(t.y + BADGE * 0.17).toFixed(2)}>
                  {cost}
                </text>
              )}
            </g>,
          ];
        });
  const sel = selected != null && selected < owners.length ? top(selected) : null;

  const pop = placed && placed.tile < owners.length ? top(placed.tile) : null;
  const flashes = capture?.tiles.filter((t) => t < owners.length).map((t, i) => {
    const c = top(t);
    return <TileImage key={`${capture.seq}-${t}`} id="capture-flash" x={c.x} y={c.y} scale={FLASH} class="fx-flash" style={flipDelay(i)} />;
  });

  return (
    <svg
      class="hex-board"
      viewBox={`${-MARGIN} ${-MARGIN} ${(width * R + 2 * MARGIN).toFixed(2)} ${(height * R + 2 * MARGIN).toFixed(2)}`}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label={label ?? "The land"}
    >
      <defs>
        <clipPath id={CLIP_ID}>
          <polygon points={TILE} />
        </clipPath>
        <pattern id={WOOD_ID} width={WOOD} height={WOOD} patternUnits="userSpaceOnUse">
          <image href={landArt("tray-wood")} width={WOOD} height={WOOD} />
        </pattern>
        <filter id={SHADOW_ID} x="-10%" y="-10%" width="125%" height="125%">
          <feDropShadow dx={0.6 * D} dy={0.8 * D} stdDeviation={D} flood-color="rgb(60,35,12)" flood-opacity="0.35" />
        </filter>
        <pattern id={HATCH_ID} width={HATCH} height={HATCH} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1={HATCH / 2} y1="0" x2={HATCH / 2} y2={HATCH} stroke={HATCH_INK} stroke-width={HATCH * 0.4} />
        </pattern>
        {map && (
          <clipPath id={MAP_CLIP_ID}>
            {centres.map((c, tile) => (
              <polygon key={tile} points={hexPoints(TILE_R, c.x, c.y)} />
            ))}
          </clipPath>
        )}
      </defs>
      <g class="hex-tray">
        <g filter={`url(#${SHADOW_ID})`} style={{ fill: INK }}>
          {edge(EDGE_INK_R)}
        </g>
        <g style={{ fill: `url(#${WOOD_ID})` }}>{edge(EDGE_R)}</g>
      </g>
      {map && <image class="hex-map" href={map} x="0" y="0" width={mapW} height={mapH} preserveAspectRatio="none" clip-path={`url(#${MAP_CLIP_ID})`} onError={() => setMapFailed(mapId!)} />}
      {tiles}
      <g class="hex-borders">{borders}</g>
      <g class="hex-overlay">{keeps}</g>
      <g class="hex-overlay">
        {states}
        {sel && <polygon class="hex-hatch" points={hexPoints(TILE_R, sel.x, sel.y)} style={{ fill: `url(#${HATCH_ID})` }} />}
        {sel && <TileImage id="state-selected" x={sel.x} y={sel.y} scale={SELECTED} class="hex-selected" />}
      </g>
      <g class="hex-overlay hex-fx">
        {pop && <image key={placed!.seq} class="fx-pop" href={landArt("place-pop")} x={(pop.x - POP / 2).toFixed(2)} y={(pop.y - POP / 2).toFixed(2)} width={POP.toFixed(2)} height={POP.toFixed(2)} />}
        {flashes}
      </g>
    </svg>
  );
}

// ---------- the projector's HUD: shapes, team cards, banners, plinths ----------

/** A team's painted shape token (white, outlined): the second cue besides colour. */
export function LandShape({ team, class: cls = "" }: { team: number; class?: string }) {
  const shape = TEAMS[team % TEAMS.length]!.shape;
  return <img class={`land-shape ${cls}`} src={landArt(`shape-${shape}`)} alt={shape} draggable={false} />;
}

const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });

const tinted = new Map<string, Promise<string>>();

/** `base` with `color` multiplied in where the greyscale `mask` is white, as an object URL. Made once per picture and colour. */
function tint(base: string, mask: string, color: string): Promise<string> {
  const key = `${base} ${color}`;
  let url = tinted.get(key);
  if (!url) {
    url = Promise.all([loadImage(base), loadImage(mask)])
      .then(([b, m]) => {
        const canvas = document.createElement("canvas");
        const [w, h] = [b.naturalWidth, b.naturalHeight];
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(m, 0, 0, w, h);
        const k = ctx.getImageData(0, 0, w, h).data;
        ctx.clearRect(0, 0, w, h);
        ctx.drawImage(b, 0, 0);
        const pic = ctx.getImageData(0, 0, w, h);
        const px = pic.data;
        const c = rgb(color).map((v) => v / 255);
        for (let i = 0; i < px.length; i += 4) {
          const m = k[i]! / 255;
          for (let j = 0; j < 3; j++) px[i + j] = px[i + j]! * (1 - m + m * c[j]!);
        }
        ctx.putImageData(pic, 0, 0);
        return new Promise<string>((resolve) => canvas.toBlob((blob) => resolve(blob ? URL.createObjectURL(blob) : base), "image/webp"));
      })
      .catch(() => base);
    tinted.set(key, url);
  }
  return url;
}

/** The tinted picture once it's ready; the untinted one until then. */
function useTinted(base: LandArtId, mask: LandArtId, color: string): string {
  const [url, setUrl] = useState(landArt(base));
  useEffect(() => {
    let live = true;
    void tint(landArt(base), landArt(mask), color).then((u) => live && setUrl(u));
    return () => {
      live = false;
    };
  }, [base, mask, color]);
  return url;
}

/** The team card plaque with its ribbon in the team colour, for a 9-slice border-image. */
export const useTeamCard = (color: string) => `url(${useTinted("team-card", "team-card-tint", color)})`;

/** Event banner colours: a ring closed, a team knocked out; the conquest uses the winner's colour. */
export const BANNER_CAPTURE = "#3d8a34";
export const BANNER_KNOCKOUT = "#8e1330";

/** The ribbon banner in `color`, for a 3-slice border-image. */
export const useBanner = (color: string) => `url(${useTinted("banner", "banner-tint", color)})`;

const PLINTHS = {
  first: ["podium-1st", "podium-1st-tint"],
  second: ["podium-2nd", "podium-2nd-tint"],
  third: ["podium-3rd", "podium-3rd-tint"],
} as const satisfies Record<string, readonly [LandArtId, LandArtId]>;

/** A podium plinth with its drape in the team colour, and the team's shape and rank on the drape. */
export function Plinth({ place, team, color, rank }: { place: keyof typeof PLINTHS; team: number; color: string; rank: string }) {
  const [base, mask] = PLINTHS[place];
  return (
    <div class={`land-plinth ${place}`}>
      <img src={useTinted(base, mask, color)} alt="" draggable={false} />
      <div class="land-plinth-label" style={{ color: teamInk(color) }}>
        <LandShape team={team} />
        <span>{rank}</span>
      </div>
    </div>
  );
}

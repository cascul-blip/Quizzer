/**
 * Player avatars, drawn so they look the same on every phone and projector.
 *
 * Every character shares one layout (viewBox 0 0 100 100) so any accessory fits any character:
 *   head centered near (50,56), top of the head at y≈26, sides at x≈20/80, chin at y≈86;
 *   eyes at (40,52) and (60,52); mouth around y≈66.
 * Hats sit on the head top, glasses on the eye line, the bow tie under the chin.
 *
 * Each character and accessory is a painted picture seated on that viewBox by
 * scripts/avatar-art.py, so a hat still lands on every head.
 */
import type { JSX } from "preact";
import { ACCESSORIES, AVATARS, type AccessoryId, type AvatarChoice, type AvatarId } from "../../shared/avatars.ts";
import { isPhoneArt } from "./phone-art.ts";
import alienImg from "./avatar/alien.webp";
import antlersImg from "./avatar/antlers.webp";
import axolotlImg from "./avatar/axolotl.webp";
import bearImg from "./avatar/bear.webp";
import beeImg from "./avatar/bee.webp";
import beanieImg from "./avatar/beanie.webp";
import beretImg from "./avatar/beret.webp";
import bowImg from "./avatar/bow.webp";
import bowtieImg from "./avatar/bowtie.webp";
import bunnyImg from "./avatar/bunny.webp";
import capImg from "./avatar/cap.webp";
import capybaraImg from "./avatar/capybara.webp";
import catImg from "./avatar/cat.webp";
import chickImg from "./avatar/chick.webp";
import cowImg from "./avatar/cow.webp";
import cowboyImg from "./avatar/cowboy.webp";
import crownImg from "./avatar/crown.webp";
import curlyImg from "./avatar/curly.webp";
import dinoImg from "./avatar/dino.webp";
import dogImg from "./avatar/dog.webp";
import dragonImg from "./avatar/dragon.webp";
import eyepatchImg from "./avatar/eyepatch.webp";
import flowersImg from "./avatar/flowers.webp";
import foxImg from "./avatar/fox.webp";
import frogImg from "./avatar/frog.webp";
import ghostImg from "./avatar/ghost.webp";
import gogglesImg from "./avatar/goggles.webp";
import heartsImg from "./avatar/hearts.webp";
import hedgehogImg from "./avatar/hedgehog.webp";
import headphonesImg from "./avatar/headphones.webp";
import kid1Img from "./avatar/kid1.webp";
import kid2Img from "./avatar/kid2.webp";
import kid3Img from "./avatar/kid3.webp";
import kid4Img from "./avatar/kid4.webp";
import koalaImg from "./avatar/koala.webp";
import lionImg from "./avatar/lion.webp";
import monkeyImg from "./avatar/monkey.webp";
import monocleImg from "./avatar/monocle.webp";
import monsterImg from "./avatar/monster.webp";
import mouseImg from "./avatar/mouse.webp";
import mustacheImg from "./avatar/mustache.webp";
import nerdImg from "./avatar/nerd.webp";
import octopusImg from "./avatar/octopus.webp";
import owlImg from "./avatar/owl.webp";
import pandaImg from "./avatar/panda.webp";
import parrotImg from "./avatar/parrot.webp";
import partyhatImg from "./avatar/partyhat.webp";
import penguinImg from "./avatar/penguin.webp";
import facesSheet from "./avatar/phone-faces.webp";
import gearSheet from "./avatar/phone-gear.webp";
import pigImg from "./avatar/pig.webp";
import pigtailsImg from "./avatar/pigtails.webp";
import pirateImg from "./avatar/pirate.webp";
import propellerImg from "./avatar/propeller.webp";
import raccoonImg from "./avatar/raccoon.webp";
import robotImg from "./avatar/robot.webp";
import scarfImg from "./avatar/scarf.webp";
import sharkImg from "./avatar/shark.webp";
import snorkelImg from "./avatar/snorkel.webp";
import spikyImg from "./avatar/spiky.webp";
import sunglassesImg from "./avatar/sunglasses.webp";
import tiaraImg from "./avatar/tiara.webp";
import tigerImg from "./avatar/tiger.webp";
import tophatImg from "./avatar/tophat.webp";
import turtleImg from "./avatar/turtle.webp";
import unicornImg from "./avatar/unicorn.webp";
import vikingImg from "./avatar/viking.webp";
import wizardImg from "./avatar/wizard.webp";

/** Layout of the phone sheets, as written by scripts/phone-art.py. */
const CELL = 192;
const GUTTER = 2;
const SHEET_COLS = 8;
const STEP = CELL + 2 * GUTTER;

/**
 * A painted face or accessory, already seated on the shared viewBox. The projector draws its
 * own picture; the phone draws cell `index` of one sheet, so the lobby picker is one download.
 */
function painted(src: string, sheet: string, index: number, count: number): () => JSX.Element {
  const box = `${(index % SHEET_COLS) * STEP + GUTTER} ${Math.floor(index / SHEET_COLS) * STEP + GUTTER} ${CELL} ${CELL}`;
  const size = { width: SHEET_COLS * STEP, height: Math.ceil(count / SHEET_COLS) * STEP };
  return () =>
    isPhoneArt() ? (
      <svg x="0" y="0" width="100" height="100" viewBox={box}>
        <image href={sheet} {...size} />
      </svg>
    ) : (
      <image href={src} x="0" y="0" width="100" height="100" />
    );
}

const FACE_IMG: Record<AvatarId, string> = {
  cat: catImg,
  dog: dogImg,
  fox: foxImg,
  panda: pandaImg,
  bear: bearImg,
  bunny: bunnyImg,
  frog: frogImg,
  owl: owlImg,
  penguin: penguinImg,
  lion: lionImg,
  tiger: tigerImg,
  koala: koalaImg,
  monkey: monkeyImg,
  pig: pigImg,
  cow: cowImg,
  mouse: mouseImg,
  unicorn: unicornImg,
  dragon: dragonImg,
  dino: dinoImg,
  octopus: octopusImg,
  chick: chickImg,
  robot: robotImg,
  alien: alienImg,
  ghost: ghostImg,
  monster: monsterImg,
  kid1: kid1Img,
  kid2: kid2Img,
  kid3: kid3Img,
  kid4: kid4Img,
  shark: sharkImg,
  raccoon: raccoonImg,
  parrot: parrotImg,
  axolotl: axolotlImg,
  turtle: turtleImg,
  hedgehog: hedgehogImg,
  bee: beeImg,
  capybara: capybaraImg,
};

const GEAR_IMG: Record<Exclude<AccessoryId, "none">, string> = {
  tophat: tophatImg,
  cap: capImg,
  crown: crownImg,
  beanie: beanieImg,
  partyhat: partyhatImg,
  cowboy: cowboyImg,
  wizard: wizardImg,
  pirate: pirateImg,
  viking: vikingImg,
  headphones: headphonesImg,
  flowers: flowersImg,
  bow: bowImg,
  curly: curlyImg,
  spiky: spikyImg,
  pigtails: pigtailsImg,
  sunglasses: sunglassesImg,
  hearts: heartsImg,
  nerd: nerdImg,
  monocle: monocleImg,
  mustache: mustacheImg,
  bowtie: bowtieImg,
  snorkel: snorkelImg,
  eyepatch: eyepatchImg,
  goggles: gogglesImg,
  antlers: antlersImg,
  propeller: propellerImg,
  beret: beretImg,
  scarf: scarfImg,
  tiara: tiaraImg,
};

export const AVATAR_ART = Object.fromEntries(AVATARS.map((a, i) => [a.id, painted(FACE_IMG[a.id], facesSheet, i, AVATARS.length)])) as Record<AvatarId, () => JSX.Element>;

const GEAR = ACCESSORIES.filter((a): a is Exclude<(typeof ACCESSORIES)[number], { id: "none" }> => a.id !== "none");
export const ACCESSORY_ART = {
  none: () => null,
  ...Object.fromEntries(GEAR.map((a, i) => [a.id, painted(GEAR_IMG[a.id], gearSheet, i, GEAR.length)])),
} as Record<AccessoryId, () => JSX.Element | null>;

/** A character with its accessory on top. Unknown ids (e.g. from an older page) fall back gracefully. */
export function Avatar({ choice, class: cls, title }: { choice: AvatarChoice; class?: string; title?: string }) {
  const body = AVATAR_ART[choice.avatar] ?? AVATAR_ART.cat;
  const extra = ACCESSORY_ART[choice.accessory] ?? ACCESSORY_ART.none;
  return (
    <svg class={`avatar ${cls ?? ""}`} viewBox="0 0 100 100" role={title ? "img" : undefined} aria-label={title} aria-hidden={title ? undefined : "true"}>
      {body()}
      {extra()}
    </svg>
  );
}

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
import type { AccessoryId, AvatarChoice, AvatarId } from "../../shared/avatars.ts";
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

/** A painted face or accessory, already seated on the shared viewBox. */
function painted(src: string): () => JSX.Element {
  return () => <image href={src} x="0" y="0" width="100" height="100" />;
}

export const AVATAR_ART: Record<AvatarId, () => JSX.Element> = {
  cat: painted(catImg),
  dog: painted(dogImg),
  fox: painted(foxImg),
  panda: painted(pandaImg),
  bear: painted(bearImg),
  bunny: painted(bunnyImg),
  frog: painted(frogImg),
  owl: painted(owlImg),
  penguin: painted(penguinImg),
  lion: painted(lionImg),
  tiger: painted(tigerImg),
  koala: painted(koalaImg),
  monkey: painted(monkeyImg),
  pig: painted(pigImg),
  cow: painted(cowImg),
  mouse: painted(mouseImg),
  unicorn: painted(unicornImg),
  dragon: painted(dragonImg),
  dino: painted(dinoImg),
  octopus: painted(octopusImg),
  chick: painted(chickImg),
  robot: painted(robotImg),
  alien: painted(alienImg),
  ghost: painted(ghostImg),
  monster: painted(monsterImg),
  kid1: painted(kid1Img),
  kid2: painted(kid2Img),
  kid3: painted(kid3Img),
  kid4: painted(kid4Img),
  shark: painted(sharkImg),
  raccoon: painted(raccoonImg),
  parrot: painted(parrotImg),
  axolotl: painted(axolotlImg),
  turtle: painted(turtleImg),
  hedgehog: painted(hedgehogImg),
  bee: painted(beeImg),
  capybara: painted(capybaraImg),
};

export const ACCESSORY_ART: Record<AccessoryId, () => JSX.Element | null> = {
  none: () => null,
  tophat: painted(tophatImg),
  cap: painted(capImg),
  crown: painted(crownImg),
  beanie: painted(beanieImg),
  partyhat: painted(partyhatImg),
  cowboy: painted(cowboyImg),
  wizard: painted(wizardImg),
  pirate: painted(pirateImg),
  viking: painted(vikingImg),
  headphones: painted(headphonesImg),
  flowers: painted(flowersImg),
  bow: painted(bowImg),
  curly: painted(curlyImg),
  spiky: painted(spikyImg),
  pigtails: painted(pigtailsImg),
  sunglasses: painted(sunglassesImg),
  hearts: painted(heartsImg),
  nerd: painted(nerdImg),
  monocle: painted(monocleImg),
  mustache: painted(mustacheImg),
  bowtie: painted(bowtieImg),
  snorkel: painted(snorkelImg),
  eyepatch: painted(eyepatchImg),
  goggles: painted(gogglesImg),
  antlers: painted(antlersImg),
  propeller: painted(propellerImg),
  beret: painted(beretImg),
  scarf: painted(scarfImg),
  tiara: painted(tiaraImg),
};

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

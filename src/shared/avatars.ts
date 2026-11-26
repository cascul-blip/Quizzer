// why: the full catalogue of every set, so any id can still be drawn; AVATAR_SET picks what is offered.
export const AVATARS = [
  { id: "cat", name: "Cat" },
  { id: "dog", name: "Dog" },
  { id: "fox", name: "Fox" },
  { id: "panda", name: "Panda" },
  { id: "bear", name: "Bear" },
  { id: "bunny", name: "Bunny" },
  { id: "frog", name: "Frog" },
  { id: "owl", name: "Owl" },
  { id: "penguin", name: "Penguin" },
  { id: "lion", name: "Lion" },
  { id: "tiger", name: "Tiger" },
  { id: "koala", name: "Koala" },
  { id: "monkey", name: "Monkey" },
  { id: "pig", name: "Pig" },
  { id: "cow", name: "Cow" },
  { id: "mouse", name: "Mouse" },
  { id: "unicorn", name: "Unicorn" },
  { id: "dragon", name: "Dragon" },
  { id: "dino", name: "Dino" },
  { id: "octopus", name: "Octopus" },
  { id: "chick", name: "Chick" },
  { id: "robot", name: "Robot" },
  { id: "alien", name: "Alien" },
  { id: "ghost", name: "Ghost" },
  { id: "monster", name: "Monster" },
  { id: "kid1", name: "Kid 1" },
  { id: "kid2", name: "Kid 2" },
  { id: "kid3", name: "Kid 3" },
  { id: "kid4", name: "Kid 4" },
  { id: "shark", name: "Shark" },
  { id: "raccoon", name: "Raccoon" },
  { id: "parrot", name: "Parrot" },
  { id: "axolotl", name: "Axolotl" },
  { id: "turtle", name: "Turtle" },
  { id: "hedgehog", name: "Hedgehog" },
  { id: "bee", name: "Bee" },
  { id: "capybara", name: "Capybara" },
  // why: keep the Christmas set at the end; the phone sheets follow this order.
  { id: "snowman", name: "Snowman" },
  { id: "reindeer", name: "Reindeer" },
  { id: "polarbear", name: "Polar Bear" },
  { id: "gingerbread", name: "Gingerbread" },
  { id: "elf", name: "Elf" },
  { id: "nutcracker", name: "Nutcracker" },
  { id: "snowyowl", name: "Snowy Owl" },
  { id: "arcticfox", name: "Arctic Fox" },
  { id: "emperorchick", name: "Penguin Chick" },
  { id: "seal", name: "Harp Seal Pup" },
  { id: "husky", name: "Husky" },
  { id: "snowbunny", name: "Snowshoe Hare" },
  { id: "moose", name: "Moose" },
  { id: "sheep", name: "Lamb" },
  { id: "angelkid", name: "Angel Child" },
  { id: "santaclaus", name: "Santa Claus" },
  { id: "mrsclaus", name: "Mrs. Claus" },
  { id: "yeticub", name: "Yeti Cub" },
  { id: "robin", name: "Winter Robin" },
  { id: "walrus", name: "Walrus" },
] as const;

export const ACCESSORIES = [
  { id: "none", name: "None" },
  { id: "tophat", name: "Top hat" },
  { id: "cap", name: "Cap" },
  { id: "crown", name: "Crown" },
  { id: "beanie", name: "Beanie" },
  { id: "partyhat", name: "Party hat" },
  { id: "cowboy", name: "Cowboy hat" },
  { id: "wizard", name: "Wizard hat" },
  { id: "pirate", name: "Pirate hat" },
  { id: "viking", name: "Viking helmet" },
  { id: "headphones", name: "Headphones" },
  { id: "flowers", name: "Flower crown" },
  { id: "bow", name: "Bow" },
  { id: "curly", name: "Curly hair" },
  { id: "spiky", name: "Spiky hair" },
  { id: "pigtails", name: "Pigtails" },
  { id: "sunglasses", name: "Sunglasses" },
  { id: "hearts", name: "Heart glasses" },
  { id: "nerd", name: "Nerd glasses" },
  { id: "monocle", name: "Monocle" },
  { id: "mustache", name: "Mustache" },
  { id: "bowtie", name: "Bow tie" },
  { id: "snorkel", name: "Snorkel" },
  { id: "eyepatch", name: "Eyepatch" },
  { id: "goggles", name: "Goggles" },
  { id: "antlers", name: "Antlers" },
  { id: "propeller", name: "Propeller hat" },
  { id: "beret", name: "Beret" },
  { id: "scarf", name: "Scarf" },
  { id: "tiara", name: "Tiara" },
  { id: "santahat", name: "Santa Hat" },
  { id: "elfhat", name: "Elf Hat" },
  { id: "bobble", name: "Bobble Beanie" },
  { id: "earmuffs", name: "Earmuffs" },
  { id: "xmasscarf", name: "Christmas Scarf" },
  { id: "holly", name: "Holly Sprig" },
  { id: "mistletoe", name: "Mistletoe Sprig" },
  { id: "stars", name: "Star Glasses" },
  { id: "snowflakes", name: "Snowflake Glasses" },
  { id: "reindeerband", name: "Reindeer Antler Headband" },
  { id: "star", name: "Nativity Star" },
  { id: "bellcollar", name: "Jingle Bell Bow" },
  { id: "candycane", name: "Candy Cane" },
  { id: "mittens", name: "Mitten Wave" },
  { id: "crownwreath", name: "Wreath Crown" },
  { id: "snowgoggles", name: "Snow Goggles" },
  { id: "giftbow", name: "Gift Bow" },
  { id: "wintercrown", name: "Winter Crown" },
  { id: "puddinghat", name: "Pudding Hat" },
  { id: "festivebowtie", name: "Festive Bow Tie" },
] as const;

export type AvatarId = (typeof AVATARS)[number]["id"];
export type AccessoryId = (typeof ACCESSORIES)[number]["id"];

export interface AvatarChoice {
  avatar: AvatarId;
  accessory: AccessoryId;
}

export type AvatarSet = "classic" | "christmas";

/** why: the set the lobby offers; "classic" brings the original characters back. */
export const AVATAR_SET = "christmas" as AvatarSet;

const CHRISTMAS_AVATARS = new Set<string>([
  "snowman",
  "reindeer",
  "polarbear",
  "gingerbread",
  "elf",
  "nutcracker",
  "snowyowl",
  "arcticfox",
  "emperorchick",
  "seal",
  "husky",
  "snowbunny",
  "moose",
  "sheep",
  "angelkid",
  "santaclaus",
  "mrsclaus",
  "yeticub",
  "robin",
  "walrus",
]);
const CHRISTMAS_ACCESSORIES = new Set<string>([
  "santahat",
  "elfhat",
  "bobble",
  "earmuffs",
  "xmasscarf",
  "holly",
  "mistletoe",
  "stars",
  "snowflakes",
  "reindeerband",
  "star",
  "bellcollar",
  "candycane",
  "mittens",
  "crownwreath",
  "snowgoggles",
  "giftbow",
  "wintercrown",
  "puddinghat",
  "festivebowtie",
]);

const inSet = (christmas: Set<string>) => (item: { id: string }) => item.id === "none" || christmas.has(item.id) === (AVATAR_SET === "christmas");

/** why: "none" is always offered. */
export const OFFERED_AVATARS = AVATARS.filter(inSet(CHRISTMAS_AVATARS));
export const OFFERED_ACCESSORIES = ACCESSORIES.filter(inSet(CHRISTMAS_ACCESSORIES));

const avatarIds = new Set<string>(OFFERED_AVATARS.map((a) => a.id));
const accessoryIds = new Set<string>(OFFERED_ACCESSORIES.map((a) => a.id));

const isAvatarId = (id: unknown): id is AvatarId => typeof id === "string" && avatarIds.has(id);
const isAccessoryId = (id: unknown): id is AccessoryId => typeof id === "string" && accessoryIds.has(id);

/** why: null for ids outside the offered set, so a phone remembering an old look gets a fresh one. */
export function cleanAvatar(avatar: unknown, accessory: unknown): AvatarChoice | null {
  return isAvatarId(avatar) && isAccessoryId(accessory) ? { avatar, accessory } : null;
}

/** why: no accessory, so players see there's more to pick. */
export function randomAvatar(rng: () => number = Math.random): AvatarChoice {
  return { avatar: OFFERED_AVATARS[Math.floor(rng() * OFFERED_AVATARS.length) % OFFERED_AVATARS.length]!.id, accessory: "none" };
}

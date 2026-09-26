// Player avatars: a character plus one accessory drawn on top (see src/client/shared/avatar-art.tsx).

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
  { id: "halo", name: "Halo" },
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
] as const;

export type AvatarId = (typeof AVATARS)[number]["id"];
export type AccessoryId = (typeof ACCESSORIES)[number]["id"];

export interface AvatarChoice {
  avatar: AvatarId;
  accessory: AccessoryId;
}

const avatarIds = new Set<string>(AVATARS.map((a) => a.id));
const accessoryIds = new Set<string>(ACCESSORIES.map((a) => a.id));

export const isAvatarId = (id: unknown): id is AvatarId => typeof id === "string" && avatarIds.has(id);
export const isAccessoryId = (id: unknown): id is AccessoryId => typeof id === "string" && accessoryIds.has(id);

/** A valid choice, or null if either id is unknown. */
export function cleanAvatar(avatar: unknown, accessory: unknown): AvatarChoice | null {
  return isAvatarId(avatar) && isAccessoryId(accessory) ? { avatar, accessory } : null;
}

/** A random character with no accessory, so players see there's more to pick. */
export function randomAvatar(rng: () => number = Math.random): AvatarChoice {
  return { avatar: AVATARS[Math.floor(rng() * AVATARS.length) % AVATARS.length]!.id, accessory: "none" };
}

export const avatarName = (id: string) => AVATARS.find((a) => a.id === id)?.name ?? id;
export const accessoryName = (id: string) => ACCESSORIES.find((a) => a.id === id)?.name ?? id;

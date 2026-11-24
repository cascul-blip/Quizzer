let phone = false;

/** Called once by the player page, before it renders. */
export function setPhoneArt(): void {
  phone = true;
}

export const isPhoneArt = (): boolean => phone;

/** The projector picture, or its phone copy on the player page. */
export const pickArt = (projector: string, phoneCopy: string): string => (phone ? phoneCopy : projector);

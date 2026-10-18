/**
 * Phones draw the shared art far smaller than the projector, and all of them download it
 * at once over the host's Wi-Fi, so the player page uses the small copies made by
 * scripts/phone-art.py. Both sets are bundled; only the one a page draws is fetched.
 */
let phone = false;

/** Called once by the player page, before it renders. */
export function setPhoneArt(): void {
  phone = true;
}

export const isPhoneArt = (): boolean => phone;

/** The projector picture, or its phone copy on the player page. */
export const pickArt = (projector: string, phoneCopy: string): string => (phone ? phoneCopy : projector);

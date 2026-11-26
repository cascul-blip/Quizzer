let phone = false;

/** why: set before the first phone render so it never requests projector-sized assets. */
export function setPhoneArt(): void {
  phone = true;
}

export const isPhoneArt = (): boolean => phone;

export const pickArt = (projector: string, phoneCopy: string): string => (phone ? phoneCopy : projector);

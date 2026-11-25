const COUNTDOWN_FIELD = /^(?:r|\w+R)emainingMs$/;
const ELAPSED_FIELD = /^(?:e|\w+E)lapsedMs$/;
const DURATION_FIELD = /^(?:d|\w+D)urationMs$/;

export const isCountdownField = (name: string): boolean => COUNTDOWN_FIELD.test(name);
export const isElapsedField = (name: string): boolean => ELAPSED_FIELD.test(name);
export const isNamedTimeField = (name: string): boolean => isCountdownField(name) || isElapsedField(name) || DURATION_FIELD.test(name);

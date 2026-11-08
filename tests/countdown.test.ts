import { expect, test } from "bun:test";
import { nextSecondIn } from "../src/client/shared/ui.tsx";

test("a countdown wakes just after the seconds shown change, not 5 times a second", () => {
  const shown = (left: number) => Math.max(0, Math.ceil(left / 1000));
  for (const left of [3400, 3000, 2999, 1001, 999, 1]) {
    const wait = nextSecondIn(left);
    // Nothing changes before the wake-up, and it has changed by then.
    expect(shown(left - wait + 6)).toBe(shown(left));
    expect(shown(left - wait)).toBe(shown(left) - 1);
    expect(wait).toBeLessThanOrEqual(1005);
  }
});

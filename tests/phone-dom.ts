import { afterAll, afterEach, beforeAll, beforeEach, jest, mock, spyOn } from "bun:test";
import { Window } from "happy-dom";
import { render } from "preact";
import { act } from "preact/test-utils";

/** Install a phone DOM with a monotonic clock we can advance separately from timer callbacks. */
export function usePhoneDom() {
  const window = new Window();
  const vibrate = mock((_ms: number) => true);
  const globals = {
    window,
    document: window.document,
    Event: window.Event,
    navigator: window.navigator,
    ResizeObserver: window.ResizeObserver,
    requestAnimationFrame: window.requestAnimationFrame.bind(window),
    cancelAnimationFrame: window.cancelAnimationFrame.bind(window),
  };
  const previous = Object.keys(globals).map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const);
  let root: HTMLDivElement;
  let extraMs: number;

  beforeAll(() => {
    for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { configurable: true, value });
    Object.defineProperty(window.navigator, "vibrate", { value: vibrate });
  });
  beforeEach(() => {
    jest.useFakeTimers();
    const start = Date.now();
    extraMs = 0;
    spyOn(performance, "now").mockImplementation(() => Date.now() - start + extraMs);
    vibrate.mockClear();
    root = document.createElement("div");
    document.body.appendChild(root);
  });
  afterEach(() => {
    act(() => render(null, root));
    root.remove();
    jest.restoreAllMocks();
    jest.useRealTimers();
  });
  afterAll(() => {
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
    window.close();
  });

  return {
    window,
    vibrate,
    get root() {
      return root;
    },
    advance(ms: number) {
      act(() => {
        jest.advanceTimersByTime(ms);
      });
    },
    elapseWithoutTimers(ms: number) {
      extraMs += ms;
    },
  };
}

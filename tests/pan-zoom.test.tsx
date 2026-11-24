import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { render } from "preact";
import { act } from "preact/test-utils";
import { usePanZoom } from "../src/client/player/pan-zoom.ts";
import { usePhoneDom } from "./phone-dom.ts";

const dom = usePhoneDom();

function setBounds(element: HTMLElement, bounds: { left: number; top: number; width: number; height: number }) {
  Object.defineProperties(element, {
    clientWidth: { get: () => bounds.width, configurable: true },
    clientHeight: { get: () => bounds.height, configurable: true },
  });
  element.getBoundingClientRect = () => new dom.window.DOMRect(bounds.left, bounds.top, bounds.width, bounds.height);
}

function dispatch(target: Element, type: string, fields: object = {}) {
  const event = Object.assign(new Event(type, { bubbles: true, cancelable: true }), fields);
  target.dispatchEvent(event);
  return event;
}

function surface(focus?: (inner: HTMLDivElement) => Element[]) {
  const bounds = { left: 100, top: 50, width: 200, height: 160 };
  const onTap = mock((_event: PointerEvent) => {});
  const activate = mock(() => {});
  function Surface() {
    const { box, inner, isTap, pointerHandlers, zoomIn, zoomOut } = usePanZoom({ focus, onTap });
    return (
      <div>
        <div
          data-viewport
          ref={(node) => {
            box.current = node;
            if (node) setBounds(node, bounds);
          }}
          {...pointerHandlers}
        >
          <div data-pan ref={inner}>
            <button
              data-target
              onClick={(event) => {
                if (isTap(event)) activate();
              }}
              ref={(node) => {
                if (node) setBounds(node, { left: 190, top: 110, width: 20, height: 20 });
              }}
            />
            <div
              ref={(node) => {
                if (node) setBounds(node, { left: 230, top: 130, width: 20, height: 20 });
              }}
            />
          </div>
        </div>
        <button data-zoom-in onClick={zoomIn} />
        <button data-zoom-out onClick={zoomOut} />
      </div>
    );
  }

  act(() => render(<Surface />, dom.root));
  const viewport = dom.root.querySelector<HTMLDivElement>("[data-viewport]")!;
  const pan = dom.root.querySelector<HTMLDivElement>("[data-pan]")!;
  const target = dom.root.querySelector<HTMLButtonElement>("[data-target]")!;
  const point = (type: string, clientX: number, clientY: number, pointerId = 1) => dispatch(target, `pointer${type}`, { clientX, clientY, pointerId });
  return { bounds, viewport, pan, target, point, onTap, activate };
}

describe("Pan and zoom", () => {
  let resize: () => void;
  const disconnect = mock(() => {});
  beforeEach(() => {
    disconnect.mockClear();
    Object.defineProperty(globalThis, "ResizeObserver", {
      configurable: true,
      value: class {
        constructor(callback: () => void) {
          resize = callback;
        }
        observe() {}
        disconnect = disconnect;
      },
    });
  });
  afterEach(() => {
    Object.defineProperty(globalThis, "ResizeObserver", { configurable: true, value: dom.window.ResizeObserver });
  });

  test("starts fully zoomed out without focus or when all focus targets are missing", () => {
    expect(surface().pan.style.transform).toBe("");
    act(() => render(null, dom.root));
    expect(surface(() => []).pan.style.transform).toBe("");
  });

  test("starts zoomed in on the centre of the focus targets", () => {
    const { pan } = surface((inner) => Array.from(inner.children));
    expect(pan.style.transform).toBe("translate(-80px, -40px) scale(1.5)");
  });

  test("uses local pointer coordinates to anchor wheel zoom in either direction and cleans up on unmount", () => {
    const { pan, viewport } = surface();
    const wheel = (deltaY: number) => dispatch(viewport, "wheel", { clientX: 200, clientY: 130, deltaY });

    expect(wheel(-1).defaultPrevented).toBe(true);
    expect(pan.style.transform).toBe("translate(-20px, -16px) scale(1.2)");
    expect(wheel(1).defaultPrevented).toBe(true);
    expect(pan.style.transform).toBe("");

    act(() => render(null, dom.root));
    expect(disconnect).toHaveBeenCalledTimes(1);
    expect(wheel(-1).defaultPrevented).toBe(false);
    expect(pan.style.transform).toBe("");
  });

  test("waits for more than eight pixels of travel and clamps panning and resizing to the viewport", () => {
    const { pan, point, bounds, onTap } = surface();
    dom.root.querySelector<HTMLButtonElement>("[data-zoom-in]")!.click();
    expect(pan.style.transform).toBe("translate(-50px, -40px) scale(1.5)");

    point("down", 150, 150);
    point("move", 145, 150);
    point("move", 148, 150);
    expect(pan.style.transform).toBe("translate(-50px, -40px) scale(1.5)");
    point("move", 147, 150);
    expect(pan.style.transform).toBe("translate(-51px, -40px) scale(1.5)");

    point("move", -400, -400);
    expect(pan.style.transform).toBe("translate(-100px, -80px) scale(1.5)");
    bounds.width = 120;
    bounds.height = 80;
    resize();
    expect(pan.style.transform).toBe("translate(-60px, -40px) scale(1.5)");
    point("move", 500, 500);
    expect(pan.style.transform).toBe("translate(0px, 0px) scale(1.5)");
    point("up", 500, 500);
    expect(onTap).not.toHaveBeenCalled();
  });

  test("keeps the zoom controls at the full view and four times magnification", () => {
    const { pan } = surface();
    const zoomIn = dom.root.querySelector<HTMLButtonElement>("[data-zoom-in]")!;
    const zoomOut = dom.root.querySelector<HTMLButtonElement>("[data-zoom-out]")!;
    for (let i = 0; i < 5; i++) zoomIn.click();
    expect(pan.style.transform).toBe("translate(-300px, -240px) scale(4)");
    for (let i = 0; i < 5; i++) zoomOut.click();
    expect(pan.style.transform).toBe("");
  });

  test("anchors a pinch at its moving midpoint and blocks pointer clicks until the next tap", () => {
    const { pan, point, target, onTap, activate } = surface();
    point("down", 160, 130);
    point("down", 210, 130, 2);
    point("move", 240, 190, 2);
    expect(pan.style.transform).toBe("translate(-70px, -50px) scale(2)");
    point("up", 240, 190, 2);
    point("up", 160, 130);
    dispatch(target, "click", { detail: 1 });
    expect(onTap).not.toHaveBeenCalled();
    expect(activate).not.toHaveBeenCalled();
    target.click();
    expect(activate).toHaveBeenCalledTimes(1);

    point("down", 160, 130, 3);
    point("up", 160, 130, 3);
    dispatch(target, "click", { detail: 1 });
    expect(onTap).toHaveBeenCalledTimes(1);
    expect(activate).toHaveBeenCalledTimes(2);
  });

  for (const type of ["cancel", "leave"]) {
    test(`discards the pointer on ${type}`, () => {
      const { point, viewport, target, onTap, activate } = surface();
      point("down", 160, 130);
      dispatch(viewport, `pointer${type}`, { pointerId: 1 });
      point("up", 160, 130);
      dispatch(target, "click", { detail: 1 });
      expect(onTap).not.toHaveBeenCalled();
      expect(activate).not.toHaveBeenCalled();

      point("down", 160, 130);
      point("up", 160, 130);
      expect(onTap).toHaveBeenCalledTimes(1);
    });
  }
});

/**
 * Player-colour art: the art build splits each piece painted in key cyan into a shading layer
 * and a paint mask (see scripts/sleigh-art.py). This fills the mask with a colour and draws the
 * shading over it, once per piece and colour, on a canvas, so a moving sprite is a plain image
 * (no SVG mask or blend mode to redo every frame).
 */
import { useEffect, useState } from "preact/hooks";

const done = new Map<string, string>();
const pending = new Map<string, Promise<string>>();

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/** A data URL of `base` with its paint in `color`. */
export function tinted(base: string, paint: string, color: string): Promise<string> {
  const key = `${base}|${paint}|${color}`;
  let p = pending.get(key);
  if (!p) {
    p = Promise.all([loadImage(base), loadImage(paint)]).then(([b, m]) => {
      const c = document.createElement("canvas");
      c.width = b.naturalWidth;
      c.height = b.naturalHeight;
      const g = c.getContext("2d")!;
      g.drawImage(m, 0, 0, c.width, c.height);
      g.globalCompositeOperation = "source-in";
      g.fillStyle = color;
      g.fillRect(0, 0, c.width, c.height);
      g.globalCompositeOperation = "source-over";
      g.drawImage(b, 0, 0, c.width, c.height);
      const url = c.toDataURL("image/png");
      done.set(key, url);
      return url;
    });
    pending.set(key, p);
  }
  return p;
}

/** The tinted picture, or the untinted shading layer until it is ready. */
export function useTinted(base: string, paint: string, color: string): string {
  const key = `${base}|${paint}|${color}`;
  const [, setReady] = useState("");
  useEffect(() => {
    if (done.has(key)) return;
    let live = true;
    tinted(base, paint, color).then(
      () => live && setReady(key),
      () => {},
    );
    return () => {
      live = false;
    };
  }, [key]);
  return done.get(key) ?? base;
}

// why: tint once per piece and colour on a canvas (art build gives shading + paint mask), so a
// moving sprite is a plain image with no SVG mask or blend mode to redo every frame.
import { useEffect, useState } from "preact/hooks";

const done = new Map<string, string>();
const pending = new Map<string, Promise<string>>();

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/** why: toBlob encodes off the main thread; `fallback` if the browser can't. */
export function canvasUrl(canvas: HTMLCanvasElement, type: "image/png" | "image/webp", fallback: string): Promise<string> {
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob ? URL.createObjectURL(blob) : fallback), type));
}

/** why: resolves to the untinted `base` if anything fails. */
export function tinted(base: string, paint: string, color: string): Promise<string> {
  const key = `${base}|${paint}|${color}`;
  let p = pending.get(key);
  if (!p) {
    p = Promise.all([loadImage(base), loadImage(paint)])
      .then(([b, m]) => {
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
        // why: PNG keeps lossless edges on the sprites.
        return canvasUrl(c, "image/png", base);
      })
      .catch(() => base)
      .then((url) => {
        done.set(key, url);
        return url;
      });
    pending.set(key, p);
  }
  return p;
}

/** why: returns the untinted shading layer until the tinted picture is ready. */
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

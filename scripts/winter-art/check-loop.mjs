/** Regression: run the preview server, then node scripts/winter-art/check-loop.mjs.
 * Optional QUIZZER_PLAYWRIGHT_MODULE and QUIZZER_CHROMIUM select existing installs.
 */
import assert from "node:assert/strict";
const { chromium } = await import(process.env.QUIZZER_PLAYWRIGHT_MODULE || "playwright");
const browser = await chromium.launch({ headless: true, executablePath: process.env.QUIZZER_CHROMIUM || undefined, args: ["--no-sandbox"] });
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  // The live fixture closes the gap continuously, just like the real game.
  await page.goto("http://127.0.0.1:8097/?live=1");
  const sample = duration => page.evaluate(async duration => {
    const frames = [], lean = [];
    const start = performance.now();
    while (performance.now() - start < duration) {
      frames.push(Number(document.querySelector(".goblin-video-sprite").dataset.frame));
      lean.push(Number(document.querySelector(".christmas-goblin").dataset.lean));
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    return { frames, lean };
  }, duration);
  const { frames, lean } = await sample(18000);
  assert(lean.at(-1) > lean[0], "The live chase must keep changing the goblin's speed");
  const wraps = frames.slice(1).filter((f, i) => f < frames[i]).length;
  assert(wraps >= 2, `Expected multiple full loops, saw ${wraps}`);
  for (let i = 0; i + 10 <= frames.length; i += 10) {
    assert(new Set(frames.slice(i, i + 10)).size > 2, `Animation froze near sample ${i}`);
  }
  await page.getByRole("button", { name: "Boost", exact: true }).click();
  assert(new Set((await sample(1500)).frames).size > 3, "Boost must not stop the goblin");
  await page.getByRole("button", { name: "caught", exact: true }).click();
  await page.waitForTimeout(300);
  assert.equal(new Set((await sample(700)).frames).size, 1, "Capture should pause the goblin");
  await page.getByRole("button", { name: "chase", exact: true }).click();
  assert(new Set((await sample(1500)).frames).size > 3, "A new chase must resume the goblin");
  assert.deepEqual(errors, []);
  console.log(`PASS: ${wraps} loop wraps during an 18-second moving chase; boost, capture, and resume verified`);
} finally { await browser.close(); }

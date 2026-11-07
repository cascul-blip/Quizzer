/** Run the preview server first. Requires Playwright and its Chromium/FFmpeg. */
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
const { chromium } = await import(process.env.QUIZZER_PLAYWRIGHT_MODULE || "playwright");
const out = resolve(import.meta.dirname, "captures");
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: process.env.QUIZZER_CHROMIUM || undefined, args: ["--no-sandbox"] });
const errors = [];
async function record(name, query, duration) {
  const context = await browser.newContext({ viewport: { width: 1600, height: 900 }, recordVideo: { dir: out, size: { width: 1600, height: 900 } } });
  const page = await context.newPage();
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:8097/${query}`);
  await page.evaluate(() => document.querySelector("nav")?.remove());
  await page.waitForTimeout(duration);
  await page.screenshot({ path: resolve(out, `${name}.png`) });
  await context.close();
  await page.video().saveAs(resolve(out, `${name}.webm`));
  // Remove Playwright's randomly named intermediate, preserving the named clip.
  await page.video().delete();
  console.log(`Captured ${name}`);
}
try {
  // Functional review of all host phases at projector and smaller display sizes.
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("http://127.0.0.1:8097/");
  const far = await page.locator(".goblin-video-sprite").count();
  if (!far || await page.locator(".painted-dog-pair").count() !== 1) throw new Error("Missing articulated characters");
  const goblinFrame = await page.locator(".goblin-video-sprite").getAttribute("data-frame");
  await page.waitForTimeout(300);
  if (goblinFrame === await page.locator(".goblin-video-sprite").getAttribute("data-frame")) throw new Error("Goblin animation did not advance");
  const before = await page.locator(".painted-dog-pair").getAttribute("data-frame");
  await page.waitForTimeout(300);
  if (before === await page.locator(".painted-dog-pair").getAttribute("data-frame")) throw new Error("Dog frames did not advance");
  const actor = page.locator(".christmas-goblin");
  const low = Number(await actor.getAttribute("data-lean"));
  await page.getByRole("slider", { name: "Goblin distance" }).fill("0");
  if (Number(await actor.getAttribute("data-lean")) <= low) throw new Error("Goblin did not lean toward the sled");
  await page.getByRole("slider", { name: "Goblin distance" }).fill("9");
  await page.waitForTimeout(5100);
  if (await page.locator(".fallen-ornament").count() < 2) throw new Error("Ornaments did not fall");
  for (const phase of ["countdown", "dive", "caught", "escaped", "podium", "chase"]) {
    await page.getByRole("button", { name: phase, exact: true }).click();
    await page.waitForTimeout(800);
    console.log(`Reviewed ${phase}`);
  }
  await page.getByRole("button", { name: "countdown", exact: true }).click();
  const still = await page.locator(".painted-dog-pair").getAttribute("data-frame");
  await page.waitForTimeout(300);
  if (still !== await page.locator(".painted-dog-pair").getAttribute("data-frame")) throw new Error("Dogs did not pause");
  await page.getByRole("button", { name: "chase", exact: true }).click();
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.waitForTimeout(200);
  const sled = await page.locator(".sub-pos").boundingBox();
  if (!sled || sled.x + sled.width > 1024) throw new Error("Sled clips at smaller size");
  await page.close();
  await record("sled-chase", "", 10000);
  await record("goblin-tiptoe", "?subject=goblin", 8000);
  await record("sled-dogs", "?subject=dogs", 8000);
  if (errors.length) throw new Error(errors.join("\n"));
} finally { await browser.close(); }

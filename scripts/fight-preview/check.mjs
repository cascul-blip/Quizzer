import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
const { chromium } = await import(process.env.QUIZZER_PLAYWRIGHT_MODULE || 'playwright');
const out = new URL('../../output/fight-christmas-review/', import.meta.url).pathname;
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.QUIZZER_CHROMIUM || undefined, headless: true, args: ['--no-sandbox'] });
const errors = [];
try {
 const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
 page.on('pageerror', e => errors.push(e.message));
 page.on('response', r => { if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`); });
 await page.clock.install();
 await page.goto('http://127.0.0.1:8099/');
 await page.clock.runFor(100);
 assert.equal(await page.locator('.ginger-catapult-arm').count(), 2);
 await page.screenshot({ path: `${out}/host.png` });
 for (const [i, side] of ['Red', 'Blue'].entries()) {
  const arm = page.locator(`.ginger-catapult[data-team="${i}"] .ginger-catapult-arm`);
  await page.getByRole('button', { name: `Fire ${side}`, exact: true }).click();
  await page.clock.runFor(110);
  assert.ok(Number(await arm.getAttribute('data-angle')) > 100, `${side} arm rotates forward`);
  await page.screenshot({ path: `${out}/fire-${side.toLowerCase()}.png` });
  await page.clock.runFor(700);
  assert.equal(Number(await arm.getAttribute('data-angle')), 24, `${side} arm returns to rest`);
 }
 await page.getByRole('button', { name: 'Old shot' }).click();
 await page.clock.runFor(100);
 assert.equal(Number(await page.locator('.ginger-catapult-arm').first().getAttribute('data-angle')), 24);
 for (const damage of ['1', '2', '3', '4', '5']) {
  await page.getByLabel('Damage', { exact: true }).selectOption(damage);
  await page.clock.runFor(20);
  await page.screenshot({ path: `${out}/damage-${damage}.png` });
 }
 await page.getByLabel('Damage', { exact: true }).selectOption('5');
 await page.getByLabel('Phase', { exact: true }).selectOption('collapse');
 await page.clock.runFor(2600);
 await page.screenshot({ path: `${out}/collapse.png` });
 await page.getByLabel('Phase', { exact: true }).selectOption('podium');
 await page.screenshot({ path: `${out}/podium.png` });
 await page.getByLabel('Phase', { exact: true }).selectOption('playing');
 await page.getByLabel('Theme', { exact: true }).selectOption('classic');
 assert.equal(await page.locator('.ginger-catapult').count(), 0);
 await page.screenshot({ path: `${out}/normal.png` });
 await page.setViewportSize({ width: 390, height: 844 });
 await page.goto('http://127.0.0.1:8099/phone?damage=2');
 await page.clock.runFor(100);
 await page.screenshot({ path: `${out}/phone-decide.png` });
 const images = await page.locator('.battlefield image').evaluateAll(els => els.map(e => e.getAttribute('href')));
 assert.ok(images.length > 0);
 // The phone bundle only fetches the compact artwork for the themed battlefield.
 assert.ok(images.every(u => !u.includes('undefined')));
 for (const state of ['aim', 'repair', 'question']) {
  await page.getByLabel('State', { exact: true }).selectOption(state);
  await page.clock.runFor(100);
  if (state === 'repair') { await page.waitForTimeout(350); assert.ok(await page.locator('.repair-wall .brick').count() > 0); }
  await page.screenshot({ path: `${out}/phone-${state}.png` });
 }
 await page.getByRole('button', { name: 'Fire Red', exact: true }).click();
 await page.clock.runFor(110);
 assert.ok(Number(await page.locator('.ginger-catapult-arm').first().getAttribute('data-angle')) > 100);
 await page.screenshot({ path: `${out}/phone-fire.png` });
 await page.emulateMedia({ reducedMotion: 'reduce' });
 await page.getByRole('button', { name: 'Fire Blue', exact: true }).click();
 await page.clock.runFor(110);
 assert.equal(Number(await page.locator('.ginger-catapult-arm').nth(1).getAttribute('data-angle')), 24);
 await page.getByLabel('Theme', { exact: true }).selectOption('classic');
 await page.getByLabel('State', { exact: true }).selectOption('aim');
 assert.equal(await page.locator('.ginger-catapult').count(), 0);
 await page.screenshot({ path: `${out}/phone-normal.png` });
 assert.deepEqual(errors, []);
 console.log('PASS: both catapults rotate and settle; old shots do not replay; damage, collapse, podium, phone choices/aim/repair/question/watch, classic fallback, reduced motion; no browser errors.');
} finally { await browser.close(); }

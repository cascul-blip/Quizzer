// Start serve.ts. Uses the actual MusicPlayer and browser sample renderer.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
const { chromium } = await import(process.env.QUIZZER_PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ executablePath: process.env.QUIZZER_CHROMIUM || undefined, headless: true, args: ['--no-sandbox'] });
const out = new URL('../../output/land-christmas-music/', import.meta.url).pathname;
await mkdir(out, { recursive: true });
const errors = [];
try {
 const p = await browser.newPage();
 p.on('pageerror', e => errors.push(e.message));
 p.on('response', r => { if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`); });
 await p.goto('http://127.0.0.1:8095/music');
 await p.waitForLoadState('networkidle');
 assert.equal(await p.evaluate(() => window.landMusicReview.info().bpm),60);
 await p.getByRole('button',{name:'Play',exact:true}).click();
 await p.waitForFunction(() => window.landMusicReview.player.current?.kind === 'synth');
 await p.evaluate(() => {window.firstPlaying = window.landMusicReview.player.current;});
 await p.getByRole('button',{name:'Capture close',exact:true}).click();
 await p.waitForFunction(() => window.landMusicReview.player.intensity > .99);
 assert.equal(await p.evaluate(() => window.landMusicReview.info().bpm),120);
 assert.equal(await p.evaluate(() => window.firstPlaying === window.landMusicReview.player.current),true);
 await p.getByRole('button',{name:'Ring broken',exact:true}).click();
 await p.waitForFunction(() => window.landMusicReview.player.intensity < .01);
 assert.equal(await p.evaluate(() => window.firstPlaying === window.landMusicReview.player.current),true);
 assert.equal(await p.evaluate(() => window.landMusicReview.info().bpm),60);
 // Exercise the live loop boundary without waiting for the full 72-second verse.
 await p.evaluate(() => { const review=window.landMusicReview; review.player.current.step=287; review.player.current.nextTime=review.context.currentTime; review.player.tick(); });
 assert.ok(await p.evaluate(() => window.landMusicReview.player.current.step < 4));
 await p.getByRole('button',{name:'Stop',exact:true}).click();
 const renders = [
  ['calm','land-christmas-play',72,0],
  ['near-capture','land-christmas-play',36,1],
  ['lobby','land-christmas-lobby',72,0],
  ['podium','land-christmas-results',72*60/68,0],
 ];
 const stats = [];
 for(const [name,id,seconds,intensity] of renders) {
  const result = await p.evaluate(async ({id,seconds,intensity}) => window.renderChristmasMusic(id,seconds,intensity), {id,seconds,intensity});
  assert.ok(Number.isFinite(result.rms) && result.rms > .0001, `${name}: audible sampled render`);
  assert.ok(result.peak < .99, `${name}: raw mix has headroom (${result.peak})`);
  await writeFile(out+name+'.wav',Buffer.from(result.wav,'base64'));
  stats.push({name,seconds,intensity,peak:result.peak,rms:result.rms});
 }
 assert.deepEqual(errors,[]);
 await writeFile(out+'render-stats.json',JSON.stringify(stats,null,2)+'\n');
 console.log('PASS: actual sampled playback, 60 -> 120 -> 60 BPM without restarting, live triple-meter loop, four complete verses with headroom, no browser/asset errors.');
 console.log(JSON.stringify(stats));
} finally { await browser.close(); }

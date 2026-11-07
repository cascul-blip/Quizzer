// Start music-serve.ts first. Render real sampled audio with Chromium's OfflineAudioContext.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
const { chromium }=await import(process.env.QUIZZER_PLAYWRIGHT_MODULE || 'playwright');
const out=new URL('../../output/siege-christmas-music/',import.meta.url).pathname;
await mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.QUIZZER_CHROMIUM || undefined,headless:true,args:['--no-sandbox']});
const errors=[];const report=[];
try {
  const page=await browser.newPage();
  page.on('pageerror',e=>errors.push(e.message));
  page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});
  await page.goto('http://127.0.0.1:8092/');
  await page.waitForFunction(()=>typeof window.renderChristmasMusic==='function');
  for(const [id,intensity,bpm,suffix] of [
    ['siege-christmas-lobby',0,96,'lobby'],
    ['siege-christmas-battle',0.05,112*1.0075,'build'],
    ['siege-christmas-battle',0.7,112*1.105,'battle'],
    ['siege-christmas-battle',0.95,112*1.1425,'giant'],
    ['siege-christmas-results',0.9,100,'victory'],
    ['siege-christmas-results',0.12,100,'fallen'],
  ]) {
    const seconds=12*4*60/bpm;
    const audio=await page.evaluate(async ([id,seconds,intensity])=>window.renderChristmasMusic(id,seconds,intensity),[id,seconds,intensity]);
    assert.ok(Number.isFinite(audio.peak) && Number.isFinite(audio.rms));
    assert.ok(audio.rms>0.003,`${suffix}: audible output`);
    assert.ok(audio.peak<1,`${suffix}: no clipping before preview encoding`);
    const wav=`${out}/patapan-${suffix}.wav`;const mp3=`${out}/patapan-${suffix}.mp3`;
    await writeFile(wav,Buffer.from(audio.wav,'base64'));
    execFileSync('ffmpeg',['-y','-loglevel','error','-i',wav,'-codec:a','libmp3lame','-q:a','3',mp3]);
    report.push({id,intensity,seconds,peak:audio.peak,rms:audio.rms,mp3});
  }
  assert.deepEqual(errors,[]);
  await writeFile(`${out}/render-report.json`,JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report.map(({id,intensity,peak,rms})=>({id,intensity,peak,rms})),null,2));
  console.log('PASS: six complete Patapan loops rendered with actual samples, audible output, no clipping or missing assets.');
} finally {await browser.close();}

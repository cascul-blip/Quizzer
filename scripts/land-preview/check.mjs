// Start serve.ts; override module/executable with the usual QUIZZER variables.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
const { chromium } = await import(process.env.QUIZZER_PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ executablePath: process.env.QUIZZER_CHROMIUM || undefined, headless: true, args: ['--no-sandbox'] });
const out = new URL('../../output/land-christmas-review/', import.meta.url).pathname;
await mkdir(out, { recursive: true });
const errors = [];
try {
 const p = await browser.newPage({viewport:{width:1600,height:900}});
 p.on('pageerror',e=>errors.push(e.message));
 p.on('response',r=>{if(r.status()>=400) errors.push(r.url());});
 await p.goto('http://127.0.0.1:8095/');
 await p.waitForLoadState('networkidle');
 assert.equal(await p.locator('.hex-north-pole .hex').count(),196);
 assert.equal(await p.locator('.land-side .land-team').count(),6);
 assert.equal(await p.locator('.hex-base').first().getAttribute('opacity'),'0.45');
 const [board,side] = await Promise.all([p.locator('.land-board').boundingBox(),p.locator('.land-side').boundingBox()]);
 assert.ok(side.x > board.x + board.width, 'Scoreboard stays right of map');
 assert.ok(board.x >= 1600*.15, 'Left table margin reserved for cocoa and cookie');
 await p.screenshot({path:out+'host-six-teams.png'});
 await p.getByRole('button',{name:'Territories',exact:true}).click();
 assert.ok(await p.locator('.hex.owned').count()>6);
 await p.screenshot({path:out+'host-territories.png'});
 await p.getByRole('button',{name:'Map details',exact:true}).click();
 await p.screenshot({path:out+'host-captured-cartography.png'});
 await p.getByRole('button',{name:'Map details',exact:true}).click();
 for(const n of [2,3,4,5,6]) {
  await p.getByLabel('Teams',{exact:true}).selectOption(String(n));
  assert.equal(await p.locator('.hex').count(),n<=2?100:n<=4?144:196);
 }
 await p.setViewportSize({width:1024,height:768});
 await p.screenshot({path:out+'host-small.png'});
 await p.getByLabel('Phase',{exact:true}).selectOption('podium');
 assert.equal(await p.locator('.land-podium').count(),1);
 await p.getByLabel('Phase',{exact:true}).selectOption('playing');
 await p.getByLabel('Theme',{exact:true}).selectOption('classic');
 assert.equal(await p.locator('.hex-north-pole').count(),0);
 assert.equal(await p.locator('.hex-base').first().getAttribute('opacity'),null);
 await p.screenshot({path:out+'classic.png'});
 await p.setViewportSize({width:390,height:844});
 await p.goto('http://127.0.0.1:8095/phone');
 await p.waitForLoadState('networkidle');
 assert.equal(await p.locator('.hex-north-pole').count(),1);
 await p.getByRole('button',{name:'Territories',exact:true}).click();
 await p.screenshot({path:out+'phone-claim.png'});
 // Tap an affordable visible hex; this exercises real pan/zoom hit testing.
 const cells=await p.locator('.hex.grass').evaluateAll(els=>els.map(el=>{const r=el.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};}));
 const area=await p.locator('.land-area').boundingBox();
 const target=cells.find(c=>c.x>area.x+15 && c.x<area.x+area.width-55 && c.y>area.y+15 && c.y<area.y+area.height-15);
 assert.ok(target);
 await p.mouse.click(target.x,target.y);
 assert.equal(await p.locator('.hex-selected').count(),1);
 await p.screenshot({path:out+'phone-selected.png'});
 await p.getByRole('button',{name:'Quiz',exact:true}).click();
 assert.ok((await p.locator('body').textContent()).includes('Where does Santa live?'));
 await p.screenshot({path:out+'phone-quiz.png'});
 assert.deepEqual(errors,[]);
 console.log('PASS: North Pole host, scoreboard right, left table margin, all five team counts, claimed tiles, podium, Classic, phone map, real tile selection, quiz, and no asset/browser errors.');
} finally { await browser.close(); }

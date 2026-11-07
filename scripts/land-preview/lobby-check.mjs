import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
const { chromium } = await import(process.env.QUIZZER_PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ executablePath: process.env.QUIZZER_CHROMIUM || undefined, headless: true, args: ['--no-sandbox'] });
const base=process.env.QUIZZER_REVIEW_URL || 'http://localhost:8094';
const out=new URL('../../output/land-christmas-review/',import.meta.url).pathname;
await mkdir(out,{recursive:true});
try {
 const context=await browser.newContext({viewport:{width:1600,height:900}});
 const response=await context.request.post(base+'/api/quizzes',{data:{title:'North Pole Land Grab',questions:[{type:'multiple_choice',text:'Where does Santa live?',options:['The North Pole','The South Pole'],correct:[0]}]}});
 assert.equal(response.status(),201);const quiz=await response.json();
 const host=await context.newPage();await host.goto(base+'/host?quiz='+quiz.id);
 await host.getByLabel('Game mode').selectOption('land');
 const selector=host.getByLabel('Land Grab theme',{exact:true});
 assert.equal(await selector.inputValue(),'christmas');
 await selector.selectOption('classic');await host.reload();assert.equal(await selector.inputValue(),'classic');
 await selector.selectOption('christmas');
 await host.screenshot({path:out+'lobby-selector.png'});
 const phone=await (await browser.newContext({viewport:{width:390,height:844}})).newPage();
 await phone.goto(base+'/');await phone.getByLabel('Your nickname').fill('Holly');
 await phone.getByRole('button',{name:'Join',exact:true}).click();
 await host.getByRole('button',{name:'Start',exact:true}).click();
 await phone.locator('.land-christmas').waitFor();
 for(let i=0;i<3;i++) { await phone.getByRole('button',{name:/The North Pole/}).click();await phone.waitForTimeout(1200); }
 await phone.locator('.land-claim').waitFor();
 await phone.screenshot({path:out+'live-phone.png'});
 await host.screenshot({path:out+'live-host.png'});
 await host.reload();await host.locator('.hex-north-pole').waitFor();
 host.on('dialog',d=>d.accept());await host.getByRole('button',{name:'End game',exact:true}).click();
 await host.getByRole('button',{name:/Play again/}).click();await selector.waitFor();
 assert.equal(await selector.inputValue(),'christmas');
 await selector.selectOption('classic');
 console.log('PASS: actual default lobby theme, Classic persists on reload, Christmas start, phone answers -> claim map, host reconnect, podium and replay retain theme.');
} finally {await browser.close();}

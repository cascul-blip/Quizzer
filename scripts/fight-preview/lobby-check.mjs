import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
const { chromium } = await import(process.env.QUIZZER_PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ executablePath: process.env.QUIZZER_CHROMIUM || undefined, headless: true, args: ['--no-sandbox'] });
const base='http://localhost:8097';
const out=new URL('../../output/fight-christmas-review/',import.meta.url).pathname;
await mkdir(out, { recursive: true });
try {
 const context=await browser.newContext({viewport:{width:1600,height:900}});
 const response=await context.request.post(base+'/api/quizzes',{data:{title:'Gingerbread Siege Review',questions:[{type:'multiple_choice',text:'Which spice goes in gingerbread?',options:['Ginger','Basil'],correct:[0]}]}});
 assert.equal(response.status(),201);
 const quiz=await response.json();

 const host=await context.newPage();
 await host.goto(base+'/host?quiz='+quiz.id);
 await host.waitForTimeout(1500);
 if(await host.getByRole('button',{name:'Keep current game',exact:true}).isVisible()) await host.getByRole('button',{name:'Keep current game',exact:true}).click();
 await host.getByLabel('Game mode').selectOption('fight');
 const selector=host.getByLabel('Tower Fight theme',{exact:true});
 await selector.selectOption('christmas');
 await host.getByLabel('Hill').selectOption('low');
 assert.equal(await selector.inputValue(),'christmas');
 await host.reload();
 assert.equal(await selector.inputValue(),'christmas');
 await host.screenshot({path:out+'lobby-selector.png'});
 const phoneContext=await browser.newContext({viewport:{width:390,height:844}});
 const phone=await phoneContext.newPage();
 await phone.goto(base+'/');
 await phone.getByLabel('Your nickname').fill('Cookie Captain');
 await phone.getByRole('button',{name:'Join',exact:true}).click();
 await host.getByRole('button',{name:'Start',exact:true}).click();
 await host.locator('.gingerbread-battlefield').waitFor();
 await phone.locator('.fight-game[data-theme="christmas"]').waitFor();
 for(let i=0;i<4;i++) {
  const answer=phone.getByRole('button',{name:/Ginger/});
  await answer.click();
  await phone.waitForTimeout(1200);
 }
 await phone.locator('.aim').waitFor();
 await phone.screenshot({path:out+'live-phone.png'});
 const area=await phone.locator('.aim').boundingBox();
 await phone.mouse.move(area.x+area.width*.6,area.y+area.height*.45);
 await phone.mouse.down();
 await phone.mouse.move(area.x+area.width*.3,area.y+area.height*.65,{steps:8});
 await phone.mouse.up();
 await host.locator('.shots .shot').waitFor();
 await host.screenshot({path:out+'live-host.png'});
 await host.reload();
 await host.locator('.gingerbread-battlefield').waitFor();
 host.on('dialog',d=>d.accept());
 await host.getByRole('button',{name:'End game',exact:true}).click();
 await host.getByRole('button',{name:/Play again/}).click();
 await selector.waitFor();
 assert.equal(await selector.inputValue(),'christmas');
 await selector.selectOption('classic');
 assert.equal(await host.getByLabel('Hill').inputValue(),'low');
 console.log('PASS: actual lobby theme/hill selection, host reload, phone join, quiz answers, aiming, live shot, reconnect, replay retains theme, normal switch.');
} finally {await browser.close();}

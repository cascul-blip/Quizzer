// Start serve.ts first. Uses production host/phone components and records review screenshots.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
const { chromium } = await import(process.env.QUIZZER_PLAYWRIGHT_MODULE || 'playwright');
const out = new URL('../../output/siege-christmas-review/', import.meta.url).pathname;
await mkdir(out,{recursive:true});
const browser = await chromium.launch({executablePath:process.env.QUIZZER_CHROMIUM || undefined,headless:true,args:['--no-sandbox']});
const errors=[];
const watch = page => {
  page.on('pageerror',e=>errors.push(e.message));
  page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});
};
try {
  const page=await browser.newPage({viewport:{width:1600,height:1000}});watch(page);
  await page.goto('http://127.0.0.1:8095/');await page.waitForLoadState('networkidle');
  assert.equal(await page.locator('.siege-stage.siege-christmas').count(),1);
  const rimClearance = () => page.locator('.siege-castle img').first().evaluate(async img=>{
    await img.decode();
    const canvas=document.createElement('canvas');canvas.width=img.naturalWidth;canvas.height=img.naturalHeight;
    const ctx=canvas.getContext('2d');ctx.drawImage(img,0,0);
    const {data}=ctx.getImageData(0,0,canvas.width,canvas.height);
    const leftAt=y=>{for(let x=0;x<canvas.width;x++)if(data[(y*canvas.width+x)*4+3]>128)return x;throw new Error('Missing castle footprint');};
    return {far:leftAt(58)-80,near:leftAt(650)-(664-650)*80/(664-58)};
  });
  const intactRim=await rimClearance();
  assert.ok(Math.abs(intactRim.far-intactRim.near)<=12,'Wall clearance must not widen toward the far left corner');
  const toyBoard=await page.locator('.siege-board-img').getAttribute('src');
  const toyArcher=await page.locator('.defender.archer img').first().getAttribute('src');
  const trollBase = () => page.locator('.monster.troll img').evaluate(async img => {
    await img.decode();
    const canvas=document.createElement('canvas');canvas.width=img.naturalWidth;canvas.height=img.naturalHeight;
    const ctx=canvas.getContext('2d');ctx.drawImage(img,0,0);
    const {data}=ctx.getImageData(0,0,canvas.width,canvas.height);
    let best={width:0,cx:0};let bottom=0;
    for(let y=Math.floor(canvas.height*.75);y<canvas.height;y++) {
      let start=-1;
      for(let x=0;x<=canvas.width;x++) {
        const opaque=x<canvas.width && data[(y*canvas.width+x)*4+3]>128;
        if(opaque)bottom=y;
        if(opaque && start<0)start=x;
        if(!opaque && start>=0) {
          if(x-start>best.width)best={width:x-start,cx:(start+x-1)/2};
          start=-1;
        }
      }
    }
    return {...best,bottom};
  });
  const walkingTrollBase=await trollBase();
  await page.screenshot({path:`${out}/host-toybox.png`});
  const boardBox=await page.locator('.siege-board').boundingBox();
  await page.screenshot({path:`${out}/castle-rim-alignment.png`,clip:{x:boardBox.x,y:boardBox.y,width:boardBox.width*.24,height:boardBox.height*.5}});
  await page.getByRole('button',{name:'Attack',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('.siege-arrow'));
  assert.notEqual(await page.locator('.defender.archer img').first().getAttribute('src'),toyArcher);
  const attackingTrollBase=await trollBase();
  assert.ok(Math.abs(attackingTrollBase.width-walkingTrollBase.width)<=2,'Troll must keep its physical scale when attacking');
  assert.ok(Math.abs(attackingTrollBase.cx-walkingTrollBase.cx)<=1,'Troll base must not shift horizontally');
  assert.ok(Math.abs(attackingTrollBase.bottom-walkingTrollBase.bottom)<=1,'Troll base must stay on the ground');
  for(const selector of ['.knight-sword','.giant-club']) {
    const info=await page.locator(selector).first().evaluate(el=>({name:getComputedStyle(el).animationName,origin:getComputedStyle(el).transformOrigin}));
    assert.notEqual(info.name,'none');assert.ok(info.origin);
  }
  await page.locator('.siege-board *').evaluateAll(els=>{for(const el of els)for(const a of el.getAnimations()){a.pause();a.currentTime=180;}});
  await page.screenshot({path:`${out}/host-attack.png`});
  await page.getByLabel('Scene',{exact:true}).selectOption('damaged');
  const crackedRim=await rimClearance();
  assert.ok(Math.abs(crackedRim.far-crackedRim.near)<=12,'Damaged wall must retain its alignment with the left rim');
  await page.screenshot({path:`${out}/host-damaged.png`});
  await page.getByLabel('Scene',{exact:true}).selectOption('fallen');
  await page.locator('.castle-crumbling').evaluate(el=>{for(const a of el.getAnimations()){a.finish();}});
  await page.screenshot({path:`${out}/host-fallen.png`});
  const ruinGround=await page.locator('.castle-fallen-under').evaluate(async img=>{
    await img.decode();
    const canvas=document.createElement('canvas');canvas.width=img.naturalWidth;canvas.height=img.naturalHeight;
    const ctx=canvas.getContext('2d');ctx.drawImage(img,0,0);
    const {data}=ctx.getImageData(0,0,canvas.width,canvas.height);const rows=[];
    for(let y=0;y<canvas.height;y++) {
      let count=0;for(let x=0;x<canvas.width;x++)if(data[(y*canvas.width+x)*4+3]>128)count++;
      if(count>=3)rows.push(y);
    }
    return {far:rows[0],near:rows.at(-1)};
  });
  assert.ok(Math.abs(ruinGround.far-58)<=2,'Far ruined base must reach the back board border');
  assert.ok(Math.abs(ruinGround.near-664)<=2,'Near ruined base must meet the front board border');
  assert.equal(await page.locator('.siege-castle').evaluate(el=>getComputedStyle(el).transform),'none','Castle camera must not be faked with a sideways skew');
  const clearEnding=await page.addStyleTag({content:'.siege-ending { visibility:hidden !important; }'});
  await page.locator('.siege-board').screenshot({path:`${out}/castle-ruins-depth.png`});
  await clearEnding.evaluate(el=>el.remove());
  await page.getByLabel('Scene',{exact:true}).selectOption('stands');
  await page.screenshot({path:`${out}/host-victory.png`});
  await page.getByLabel('Scene',{exact:true}).selectOption('podium');
  await page.screenshot({path:`${out}/host-podium.png`});
  await page.getByLabel('Scene',{exact:true}).selectOption('lobby');
  await page.screenshot({path:`${out}/lobby-toybox.png`});
  await page.getByLabel('Theme',{exact:true}).selectOption('classic');
  assert.notEqual(await page.locator('.siege-board-img').getAttribute('src'),toyBoard);
  assert.equal(await page.locator('.siege-christmas').count(),0);
  await page.getByLabel('Scene',{exact:true}).selectOption('wave');
  await page.screenshot({path:`${out}/host-classic.png`});
  await page.getByRole('button',{name:'Attack',exact:true}).click();
  assert.notEqual(await page.locator('.knight-sword').first().evaluate(el=>getComputedStyle(el).animationName),'none');

  const phone=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});watch(phone);
  await phone.goto('http://127.0.0.1:8095/phone');await phone.waitForLoadState('networkidle');
  await phone.screenshot({path:`${out}/phone-question.png`});
  await phone.getByRole('button',{name:/Build/}).click();
  assert.equal(await phone.getByRole('dialog',{name:'Lane map'}).count(),1);
  assert.match(await phone.locator('.siege-strip').textContent(),/Elf archer/);
  assert.match(await phone.locator('.siege-strip').textContent(),/Nutcracker/);
  assert.match(await phone.locator('.siege-strip').textContent(),/Present barricade/);
  await phone.getByRole('button',{name:'Lane 1 square 2',exact:true}).click();
  // Production closes the map after placing a defender.
  await phone.getByRole('button',{name:/Build/}).click();
  assert.equal(await phone.getByRole('button',{name:'Elf archer level 1, lane 1 square 2',exact:true}).count(),1);
  assert.ok(await phone.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await phone.locator('.siege-map').evaluate(el=>{for(const a of el.getAnimations())a.finish();});
  await phone.screenshot({path:`${out}/phone-map.png`});
  const toyIcon=await phone.locator('.siege-pick img').first().getAttribute('src');
  await phone.getByLabel('Theme',{exact:true}).selectOption('classic');
  assert.notEqual(await phone.locator('.siege-pick img').first().getAttribute('src'),toyIcon);
  assert.match(await phone.locator('.siege-strip').textContent(),/Stone wall/);
  await phone.emulateMedia({reducedMotion:'reduce'});
  await phone.screenshot({path:`${out}/phone-classic-map.png`});
  assert.deepEqual(errors,[]);
  console.log('Passed: projector and phone, both themes, pose swaps, weapon animation, arrows, damage, endings, lobby, phone placement, no missing assets or browser errors.');
} finally {await browser.close();}

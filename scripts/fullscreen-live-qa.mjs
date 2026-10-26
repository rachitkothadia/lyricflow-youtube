import {installNative} from './install-native.mjs';
import {chromium} from 'playwright';
import {mkdtemp,rm,writeFile,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
const profile=await mkdtemp(path.join(tmpdir(),'lyricflow-fullscreen-live-'));await installNative(profile);
const context=await chromium.launchPersistentContext(profile,{executablePath:chromium.executablePath(),headless:true,ignoreDefaultArgs:['--disable-extensions'],viewport:{width:1440,height:1000},args:[`--disable-extensions-except=${path.resolve('dist')}`,`--load-extension=${path.resolve('dist')}`]});
const results=[];
try {
 await mkdir('output/fullscreen',{recursive:true});
 const page=await context.newPage();page.setDefaultTimeout(30000);
 for(const [name,id] of [['Spring Day','xEeFrLSkMm8'],['Buzz','EtRDi6HhCfg']]){
  await page.goto('https://www.youtube.com/watch?v='+id,{waitUntil:'domcontentloaded',timeout:60000});
  await page.locator('#lyricflow-root .line').first().waitFor({timeout:60000});
  const root=page.locator('#lyricflow-root'),timed=await page.locator('button.line').count(),count=await page.locator('.line').count();
  if(name==='Spring Day')assert.ok(timed>20,'Live timestamps required');
  if(timed){
   await page.getByLabel('Lyrics options',{exact:true}).click();await page.getByLabel('Timing offset (seconds)',{exact:true}).fill('0.6');await page.getByLabel('Lyrics options',{exact:true}).click();
   const line=page.locator('button.line').nth(3),target=Number(await line.getAttribute('data-time'))+.6;
   await line.click();await page.waitForFunction(t=>Math.abs(document.querySelector('video').currentTime-t)<1,target);await page.evaluate(()=>document.querySelector('video').pause());
   console.log('LIVE_SEEK_STATE',JSON.stringify(await root.evaluate(e=>({time:document.querySelector('video').currentTime,offset:e.shadowRoot.querySelector('input[type=number]').value,active:e.shadowRoot.querySelector('.line.active')?.dataset.time,requested:e.shadowRoot.querySelectorAll('.line')[3].dataset.time}))));
   await page.waitForFunction(()=>document.querySelector('#lyricflow-root').shadowRoot.querySelectorAll('.line')[3].classList.contains('active'));
  }
  await page.locator('video').hover();await page.locator('.ytp-fullscreen-button').click();
  await page.waitForFunction(()=>document.fullscreenElement?.contains(document.querySelector('#lyricflow-root'))&&document.querySelector('#lyricflow-root').hasAttribute('fullscreen'));
  const geometry=()=>root.evaluate(e=>{const p=e.getBoundingClientRect(),v=document.querySelector('video').getBoundingClientRect(),c=document.querySelector('.ytp-chrome-bottom').getBoundingClientRect();return {panelWidth:p.width,panelLeft:p.left,videoRight:v.right,controlsRight:c.right,fullscreenElement:document.fullscreenElement.id,height:p.height,source:e.shadowRoot.querySelector('.source')?.href};});
  console.log('FULLSCREEN_WRAPPER',JSON.stringify(await page.evaluate(()=>({fullscreenTag:document.fullscreenElement.tagName,playerMode:document.querySelector('[data-lyricflow-player]')?.getAttribute('data-lyricflow-player')}))));
  const before=await geometry();assert.ok(before.videoRight<=before.panelLeft+1,JSON.stringify(before));assert.ok(before.controlsRight<=before.panelLeft+1,JSON.stringify(before));
  const divider=await page.getByRole('separator',{name:'Resize lyrics panel'}).boundingBox();await page.mouse.move(divider.x+divider.width/2,divider.y+divider.height/2);await page.mouse.down();await page.mouse.move(divider.x-140,divider.y+divider.height/2,{steps:10});await page.mouse.up();
  const after=await geometry();assert.ok(after.panelWidth>before.panelWidth+100);assert.ok(after.videoRight<=after.panelLeft+1);
  if(timed){const line=page.locator('button.line').nth(5),target=Number(await line.getAttribute('data-time'))+.6;await line.click();await page.waitForFunction(t=>Math.abs(document.querySelector('video').currentTime-t)<1,target);await page.evaluate(()=>document.querySelector('video').pause());}
  else {await page.getByLabel('Lyrics options',{exact:true}).click();assert.ok(await page.getByLabel('Timing offset (seconds)',{exact:true}).isDisabled());await page.getByLabel('Lyrics options',{exact:true}).click();}
  await page.screenshot({path:`output/fullscreen/live-${id}.png`});
  await page.evaluate(()=>document.exitFullscreen());await page.waitForFunction(()=>document.querySelector('#lyricflow-root')?.parentElement.id==='secondary');
  assert.equal(await page.locator('.line').count(),count);
  results.push({name,id,lines:count,timedLines:timed,before,after,fullscreenSeekVerified:!!timed,sidebarRestored:true});console.log('PASS',name,JSON.stringify(results.at(-1)));
 }
 await writeFile('output/fullscreen/live.json',JSON.stringify({scope:'Installed MV3, actual YouTube fullscreen control, real provider lyrics and actual video seek',passed:results.length,results},null,2));
} finally {await context.close();await rm(profile,{recursive:true,force:true});}

import "./qa-output.mjs";
import {installNative} from './install-native.mjs';
import {chromium} from 'playwright';
import {mkdtemp,readFile,writeFile,mkdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
const profile=await mkdtemp(path.join(tmpdir(),'lyricflow-provider-'));
await installNative(profile);
const context=await chromium.launchPersistentContext(profile,{executablePath:chromium.executablePath(),headless:true,ignoreDefaultArgs:['--disable-extensions'],args:[`--disable-extensions-except=${path.resolve('dist')}`,`--load-extension=${path.resolve('dist')}`]});
const results=[];
try {
 const page=await context.newPage();page.on("pageerror",e=>console.log("PAGEERROR",e.message));console.log("started");page.setDefaultTimeout(45000);
 const html=(await readFile('fixtures/watch.html','utf8')).replace('<script src="/content.js"></script>','');
 await page.route('https://www.youtube.com/**',route=>route.fulfill({contentType:'text/html',body:html}));
 await page.goto('https://www.youtube.com/watch?v=live-provider');
 await page.locator('#lyricflow-root').waitFor();
 for(const [language,query,override] of [['Hindi','Anuv Jain - Husn',''],['Korean','BTS - Spring Day','ko'],['Japanese','Goose house - Hikaru Nara','ja'],['Mandarin','Jay Chou - Mojito','zh'],['Spanish','Luis Fonsi - Despacito','']]) {
  await page.getByLabel('Lyrics options',{exact:true}).click();
  await page.getByRole('button',{name:'Correct song',exact:true}).click();
  await page.getByLabel('Romanization language').selectOption(override);
  await page.getByLabel('Search lyrics',{exact:true}).fill(query);
  await page.getByRole('button',{name:'Search',exact:true}).click();
  await page.waitForFunction(()=>{const s=document.querySelector('#lyricflow-root').shadowRoot;return s.querySelector('.line,.candidate')||/No matching|unavailable/.test(s.querySelector('[role=status]').textContent)});
  if(await page.locator('.candidate').count())await page.locator('.candidate').first().click();
  await page.waitForTimeout(2000);console.log('state',await page.locator('#lyricflow-root').evaluate(e=>({status:e.shadowRoot.querySelector('[role=status]').textContent,message:e.shadowRoot.querySelector('.message')?.textContent})));
  await page.locator('.line').first().waitFor();
  const result=await page.locator('#lyricflow-root').evaluate((root)=>{const s=root.shadowRoot;return {title:s.querySelector('h2').textContent,status:s.querySelector('[role=status]').textContent,lines:s.querySelectorAll('.line').length,nonLatin:[...s.querySelectorAll('.line')].some(p=>/(?:(?!\p{Script=Latin})\p{L})/u.test(p.textContent)),source:s.querySelector('.source')?.href}});
  assert.ok(result.lines>5,language);assert.equal(result.nonLatin,false,language);assert.ok(result.source.startsWith('https://lrclib.net/'));
  results.push({language,query,...result});console.log(JSON.stringify(results.at(-1)));
 }
 await mkdir('output/live',{recursive:true});await writeFile('output/live/provider-smoke.json',JSON.stringify({scope:'Installed MV3 on routed YouTube fixture, real LRCLIB responses and local Romanization, no lyric text saved',results},null,2));
 const live=await context.newPage();await live.goto('https://www.youtube.com/watch?v=xEeFrLSkMm8',{waitUntil:'domcontentloaded',timeout:60000});await live.locator('#lyricflow-root').waitFor();await live.waitForTimeout(15000);
 const state=await live.locator('#lyricflow-root').evaluate(root=>({title:root.shadowRoot.querySelector('h2').textContent,status:root.shadowRoot.querySelector('[role=status]').textContent,lines:root.shadowRoot.querySelectorAll('.line').length,candidates:root.shadowRoot.querySelectorAll('.candidate').length,parent:root.parentElement.id,videoDuration:document.querySelector('video')?.duration}));
 console.log('LIVE',state);await writeFile('output/live/youtube.json',JSON.stringify(state,null,2));
} finally {await context.close();await rm(profile,{recursive:true,force:true});}

import "./qa-output.mjs";
import {installNative} from './install-native.mjs';import {chromium} from 'playwright';import {mkdtemp,writeFile,rm,mkdir} from 'node:fs/promises';import {tmpdir} from 'node:os';import path from 'node:path';import assert from 'node:assert/strict';
// Test URLs only; the resolver receives live YouTube metadata.
const heldouts=[
 {title:'Die With A Smile',url:'https://www.youtube.com/watch?v=kPa7bsKwL-c'},
 {title:'APT.',url:'https://www.youtube.com/watch?v=ekr2nIex040'},
 {title:'No Church In The Wild',url:'https://www.youtube.com/watch?v=FJt7gNi3Nr4'},
];
const profile=await mkdtemp(path.join(tmpdir(),'lyricflow-collaborations-'));await installNative(profile);const c=await chromium.launchPersistentContext(profile,{executablePath:chromium.executablePath(),headless:true,ignoreDefaultArgs:['--disable-extensions'],viewport:{width:1440,height:1000},args:[`--disable-extensions-except=${path.resolve('dist')}`,`--load-extension=${path.resolve('dist')}`]});const results=[];
try{const page=await c.newPage();
for(const item of [{title:'Buzz',url:'https://www.youtube.com/watch?v=EtRDi6HhCfg',genius:'https://genius.com/Seedhe-maut-and-kr-na-buzz-lyrics'},...heldouts]){
 await page.goto(item.url,{waitUntil:'domcontentloaded',timeout:60000});await page.locator('#lyricflow-root').waitFor({timeout:25000});
 await page.waitForFunction(()=>{const s=document.querySelector('#lyricflow-root').shadowRoot;return s.querySelector('.line,.candidate,.message');},undefined,{timeout:45000});
 const data=await page.locator('#lyricflow-root').evaluate(root=>{const s=root.shadowRoot;return {title:s.querySelector('h2').textContent,lines:s.querySelectorAll('.line').length,candidates:[...s.querySelectorAll('.candidate')].map(e=>e.textContent),error:s.querySelector('.message')?.textContent,source:s.querySelector('.source')?.href,raw:document.querySelector('ytd-watch-metadata h1')?.textContent.trim()};});results.push({requested:item.title,url:item.url,...data});console.log(JSON.stringify(results.at(-1)));assert.ok(data.lines>10,item.title+': '+JSON.stringify(data));assert.equal(data.candidates.length,0,item.title);assert.equal(data.title.toLowerCase(),item.title.toLowerCase());
 if(item.title==='Buzz')assert.equal(data.source,item.genius);
}
await mkdir('output/matching',{recursive:true});await writeFile('output/matching/live-collaborations.json',JSON.stringify({scope:'Real YouTube pages, installed extension, live providers, no manual candidate selection',passed:results.length,results},null,2));
}finally{await c.close();await rm(profile,{recursive:true,force:true});}

import "./qa-output.mjs";
import {installNative} from './install-native.mjs';
import {chromium} from 'playwright';import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import path from 'node:path';
const profile=await mkdtemp(path.join(tmpdir(),'lyricflow-audio-'));
await installNative(profile);
const c=await chromium.launchPersistentContext(profile,{executablePath:chromium.executablePath(),headless:false,ignoreDefaultArgs:['--disable-extensions'],args:['--enable-unsafe-extension-debugging',`--disable-extensions-except=${path.resolve('dist')}`,`--load-extension=${path.resolve('dist')}`]});
try {const p=await c.newPage();await p.route('https://www.youtube.com/**',async r=>r.fulfill({contentType:'text/html',body:(await readFile('fixtures/watch.html','utf8')).replace('<script src="/content.js"></script>','')}));await p.goto('https://www.youtube.com/watch?v=audio-test');await p.locator('#lyricflow-root').waitFor();
await p.getByText('Sources & settings',{exact:true}).click();
// Manual acceptance: activate Command+Shift+Y in this isolated test window within 60 seconds.
// Official AudD example is streamed; no local audio download or personal audio.
await p.evaluate(async()=>{window.sample=new Audio('https://audd.tech/example.mp3');window.sample.loop=true;await window.sample.play();});
await p.bringToFront();
if (process.env.AUDIO_TEST_CANCEL) {
 const root=await c.browser().newBrowserCDPSession();const {targetInfos}=await root.send('Target.getTargets',{filter:[{type:'tab'}]});const targetInfo=targetInfos.find(t=>t.url===p.url());if(!targetInfo)throw new Error('Test tab target not found');const worker=c.serviceWorkers()[0];
 await root.send('Extensions.triggerAction',{id:new URL(worker.url()).host,targetId:targetInfo.targetId});
 await p.getByText('Recognizing audio: recording up to 10 seconds for AudD. Use Stop to cancel.',{exact:true}).waitFor();
 await p.getByRole('button',{name:'Stop audio recognition',exact:true}).click();
}
await writeFile('/tmp/lyricflow-audio-ready','ready');await p.waitForFunction(() => /Song identified from audio|Audio recognition stopped|No song match/.test(document.querySelector('#lyricflow-root').shadowRoot.textContent), undefined, {timeout:60000});
const messages=await p.locator('#lyricflow-root .provenance').allTextContents();const worker=c.serviceWorkers()[0];const contexts=await worker.evaluate(()=>chrome.runtime.getContexts({contextTypes:['OFFSCREEN_DOCUMENT']}));
const result={messages,offscreenContexts:contexts.length,title:await p.locator('#lyricflow-root h2').innerText(),scope:process.env.AUDIO_TEST_CANCEL ? 'Chrome browser-level action; real capture and Stop before upload' : 'Real native toolbar shortcut activated manually; official AudD example streamed in test tab, real capture/upload'};console.log(result);await writeFile(process.env.AUDIO_TEST_CANCEL ? 'output/live/audio-cancel.json' : 'output/live/audio-song.json',JSON.stringify(result,null,2));
}finally{await c.close();await rm(profile,{recursive:true,force:true});}

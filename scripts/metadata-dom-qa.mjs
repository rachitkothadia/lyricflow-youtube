import "./qa-output.mjs";
import {chromium} from 'playwright';import {build} from 'esbuild';import assert from 'node:assert/strict';import {writeFile,mkdir} from 'node:fs/promises';
const bundle=await build({stdin:{contents:"import {readMetadata} from './src/recognition/YouTubeMetadataRecognizer';window.readLyricsMetadata=readMetadata;",resolveDir:process.cwd()},bundle:true,write:false,format:'iife'});
const b=await chromium.launch({executablePath:chromium.executablePath(),headless:true});const results=[];
try{const p=await b.newPage();await p.route('https://fixture.test/**',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><body></body>'}));await p.goto('https://fixture.test/watch?v=current');await p.addScriptTag({content:bundle.outputFiles[0].text});
const cases=[
 ['underpressure','UNDERPRESSURE - KARMA X SIYAAHI - MAD DAWG 101| OFFICIAL AUDIO | 2026','KARMA','UNDERPRESSURE','KARMA'],
 ['101','101- KARMA X NAAM SUJAL | MAD DAWG 101| OFFICIAL AUDIO | 2026','KARMA','101','KARMA'],
 ['baby','Justin Bieber - Baby ft. Ludacris','Justin Bieber','Baby','Justin Bieber'],
 ['not-like-us','Kendrick Lamar - Not Like Us','Kendrick Lamar','Not Like Us','Kendrick Lamar'],
];
for(const [name,title,channel,expectedTitle,expectedArtist]of cases){for(const contamination of ['<button class="sponsorBlockCategoryPill">Sponsor</button>','<span class="categoryPill">Sponsor</span>','Sponsor ','Sponsor']){
 const result=await p.evaluate(({title,channel,contamination})=>{document.head.querySelectorAll('meta').forEach(e=>e.remove());const m=document.createElement('meta');m.name='title';m.content=title;document.head.append(m);document.body.innerHTML='<ytd-watch-flexy video-id="current"><ytd-watch-metadata><h1><yt-formatted-string></yt-formatted-string></h1></ytd-watch-metadata><ytd-video-owner-renderer><div id="channel-name"><a></a></div></ytd-video-owner-renderer></ytd-watch-flexy>';const h=document.querySelector('yt-formatted-string');h.innerHTML=contamination;h.append(document.createTextNode(title));document.querySelector('#channel-name a').textContent=channel;return window.readLyricsMetadata();},{title,channel,contamination});assert.equal(result.title,expectedTitle,name);assert.equal(result.artist,expectedArtist,name);results.push({name,contamination:contamination.startsWith('<')?'injected element':'plain label',...result});
}}
const stale=await p.evaluate(()=>{document.querySelector('ytd-watch-flexy').setAttribute('video-id','previous');return window.readLyricsMetadata();});assert.equal(stale,null);results.push({name:'stale recording ignored'});
const swapped=await p.evaluate(()=>{document.querySelector('ytd-watch-flexy').setAttribute('video-id','current');document.querySelector('meta[name=title]').content='Old Artist - Old Song';const canonical=document.createElement('link');canonical.rel='canonical';canonical.href='https://fixture.test/watch?v=previous';document.head.append(canonical);document.querySelector('yt-formatted-string').innerHTML='<button>Sponsor</button>New Artist - New Song';return window.readLyricsMetadata();});assert.equal(swapped.title,'New Song');assert.equal(swapped.artist,'New Artist');results.push({name:'stale canonical title ignored'});
await mkdir('output/fixes',{recursive:true});await writeFile('output/fixes/metadata-dom.json',JSON.stringify({passed:results.length,results},null,2));console.log({passed:results.length});
}finally{await b.close();}

import {build} from 'esbuild';
import {execFileSync} from 'node:child_process';
import {writeFile,mkdir,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
// Replay the shipped matcher and current source against the same live search response.
const temp=await mkdtemp(path.join(tmpdir(),'lyricflow-replay-'));
try {
 const baseline=execFileSync('unzip',['-p','LyricFlow-0.3.1.zip','dist/background.js'],{maxBuffer:4e6});
 await writeFile(path.join(temp,'old.mjs'),baseline+'\nexport {rankCandidates,parseGeniusResults,chooseCandidate};');
 const compiled=await build({stdin:{contents:"export {parseMetadata} from './src/recognition/YouTubeMetadataRecognizer';export {parseGeniusResults,rankCandidates,chooseCandidate} from './src/lyrics/GeniusProvider';export {searchQueries,evidence} from './src/matching/identity';export {GeniusWebProvider} from './src/lyrics/GeniusWebProvider';",resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',write:false});
 await writeFile(path.join(temp,'current.mjs'),compiled.outputFiles[0].text);
 const noop={addListener(){}};globalThis.chrome={runtime:{id:'diagnostic',onMessage:noop},action:{onClicked:noop},storage:{local:{setAccessLevel:async()=>{}}},tabs:{onUpdated:noop,onRemoved:noop}};
 const old=await import(pathToFileURL(path.join(temp,'old.mjs'))),current=await import(pathToFileURL(path.join(temp,'current.mjs')));
 const rawTitle='SEEDHE MAUT x KR$NA - BUZZ',song=current.parseMetadata(rawTitle,'');
 const queries=current.searchQueries(song),originalQuery=`${song.artist} ${song.title}`;
 const search=async q=>{const response=await fetch('https://genius.com/api/search?'+new URLSearchParams({q}));assert.ok(response.ok);return response.json();};
 const original=await search(originalQuery),data=await search(queries[0]);
 const before=old.parseGeniusResults(data),after=current.parseGeniusResults(data),selected=current.chooseCandidate(song,after);
 const resolved=await new current.GeniusWebProvider().resolve(song,new AbortController().signal);
 assert.equal(old.chooseCandidate(song,before),null);
 assert.equal(selected?.url,'https://genius.com/Seedhe-maut-and-kr-na-buzz-lyrics');assert.equal(resolved?.kind,'genius-page');
 const result={baseline:'LyricFlow-0.3.1.zip/dist/background.js',rawTitle,parsed:song,originalQuery,originalQueryHits:original.response?.hits?.length,normalizedQueries:queries,before:{top:old.rankCandidates(song,before).slice(0,3).map(({title,artist,score})=>({title,artist,score})),selected:null},after:{top:current.rankCandidates(song,after).slice(0,3).map(c=>({title:c.title,artist:c.artist,artists:c.artists,score:c.score,match:current.evidence(song,c)})),selected:selected.url,resolution:resolved.kind}};
 await mkdir('output/matching',{recursive:true});await writeFile('output/matching/replay.json',JSON.stringify(result,null,2));console.log('PASS shipped matcher rejects correct candidate; current matcher resolves automatically from live search');
}finally{await rm(temp,{recursive:true,force:true});}

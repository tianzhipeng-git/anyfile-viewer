import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
const runtime = process.argv[2];
const file = process.argv[3];
if (!runtime || !file) throw new Error('Pass a runtime directory and local INSV sample path');
const server = createServer(async(req,res)=>{try{
 res.setHeader('Cross-Origin-Opener-Policy','same-origin');res.setHeader('Cross-Origin-Embedder-Policy','require-corp');
 if(req.url==='/'){res.setHeader('Content-Type','text/html');res.end('<input type="file">');return;}
 if(!/^\/ffmpeg-playback\.(worker\.js|js|wasm)$/.test(req.url)){res.writeHead(404).end();return;}
 res.setHeader('Content-Type',req.url.endsWith('wasm')?'application/wasm':'text/javascript');res.end(await readFile(runtime+req.url));
}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({headless:true});const page=await browser.newPage();
page.on('console',m=>console.log(m.text()));
try{await page.goto(`http://127.0.0.1:${server.address().port}`);await page.locator('input').setInputFiles(file);
console.log(await page.evaluate(async()=>{
 const worker=new Worker('/ffmpeg-playback.worker.js',{type:'module'});let id=0;
 const request=(type,fields={})=>new Promise((resolve,reject)=>{worker.onmessage=({data})=>data.error?reject(new Error(JSON.stringify(data.error))):resolve(data.result);worker.onerror=reject;worker.postMessage({id:++id,type,...fields});});
 const t=performance.now();await request('init');const info=await request('open',{file:document.querySelector('input').files[0],video:true,panorama:true});console.log('OPEN',JSON.stringify(info),performance.now()-t);
 const start=performance.now();let front=0,back=0,audio=0,last=0;
 for(let i=0;i<120;i++){const f=await request('next');if(f.kind==='eof')break;if(f.kind==='audio')audio++;else{if(f.lens)back++;else front++;last=f.timestamp;} if(front>=12&&back>=12)break;}
 const result={front,back,audio,last,decodeMs:performance.now()-start,stats:await request('stats'),seeks:[]};
 for(const time of [1, 43.6, 0]) {const started=performance.now();await request('seek',{time});const found=new Set();let maxPts=0;for(let i=0;i<8192;i++){const f=await request('next');if(f.kind==='eof')break;if(f.timestamp+f.duration<=time)continue;found.add(f.kind==='audio'?'audio':`lens${f.lens}`);maxPts=Math.max(maxPts,f.timestamp);if(found.size===3)break;}if(found.size!==3)throw new Error('Seek lost a track');result.seeks.push({time,maxPts,ms:performance.now()-started,stats:await request('stats')});}
 worker.terminate();return result;
}));}finally{await browser.close();server.close();}

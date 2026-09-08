import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { chromium } from "playwright";
const file = process.argv[2];
if (!file) throw new Error("Pass a local X4 dual-track INSV sample path");
const browser = await chromium.launch({ headless: true, args: ["--enable-unsafe-swiftshader"] });
const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
const errors = [], report = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', m => { if(m.type()==='error') console.log(m.text()); });
await page.route('https://assets.anyfile.top/**', route => route.abort());
await page.addInitScript(() => {
  // Exercise the software path even on hosts with working native HEVC.
  Object.defineProperty(window, 'VideoDecoder', { value: undefined });
  window.__insv = { workers: new Set(), contexts: [], uploads: [], audio: [], analysers: [], peak: 0 };
  const W = window.Worker;
  window.Worker = class extends W {
    constructor(...args) {
      super(...args);
      if (String(args[0]).includes('ffmpeg-playback')) {
        window.__insv.workers.add(this);
        this.addEventListener('message', ({data}) => {
          if(data.error) console.log(JSON.stringify(data.error));
        });
      }
    }
    terminate() { window.__insv.workers.delete(this); super.terminate(); }
  };
  const A = window.AudioContext;
  window.AudioContext = class extends A {
    constructor(...args) {
      super(...args); window.__insv.contexts.push(this);
      const gain = this.createGain.bind(this), source = this.createBufferSource.bind(this);
      this.createGain = () => { const g=gain(),a=this.createAnalyser();g.connect(a);window.__insv.analysers.push(a);return g; };
      const sample = () => { if(this.state==='closed') return; for(const a of window.__insv.analysers){const values=new Float32Array(a.fftSize);a.getFloatTimeDomainData(values);for(const v of values) window.__insv.peak=Math.max(window.__insv.peak,Math.abs(v));} requestAnimationFrame(sample); }; requestAnimationFrame(sample);
      this.createBufferSource = () => { const s=source(),start=s.start.bind(s);s.start=(...args)=>{window.__insv.audio.push({when:args[0],duration:s.buffer?.duration});return start(...args);};return s; };
    }
  };
  for(const method of ['texImage2D','texSubImage2D']) {
    const original=WebGLRenderingContext.prototype[method];
    WebGLRenderingContext.prototype[method]=function(...args){
      const frame=args.at(-1);
      if(frame instanceof VideoFrame) window.__insv.uploads.push({timestamp:frame.timestamp/1e6,position:Number(document.querySelector('.anyfile-insta360-viewer input[type=range]')?.value),width:frame.codedWidth});
      return original.apply(this,args);
    };
  }
});
async function check(name, work) {const start=performance.now();await work();report.push({name,ms:performance.now()-start});console.log('PASS',name);}
const root=page.locator('.anyfile-insta360-viewer');
const seek=()=>root.locator('input[type=range]').first();
async function setSeek(position){await seek().evaluate((e,p)=>{e.value=String(p);e.dispatchEvent(new Event('input',{bubbles:true}));},position);}
try {
 await page.goto(`${process.env.INSV_TEST_URL ?? 'http://localhost:3000'}/en/view`);
 await check('silent first dual frame via software fallback', async()=>{
  await page.waitForFunction(() => { const input = document.querySelector('input[type=file]'); return input && Object.keys(input).some(key => key.startsWith('__reactProps$')); });
  await page.locator('input[type=file]').setInputFiles(file);
  await page.waitForFunction(()=>window.__insv.uploads.length>=2,{},{timeout:120000});
  assert.equal(await page.evaluate(()=>window.__insv.contexts.length),0);
  assert.equal(await page.evaluate(()=>window.__insv.workers.size),1);
  assert(await root.textContent().then(t=>t.includes('FFmpeg')));
 });
 await check('continuous paired frames, audio and buffering',async()=>{
  await root.getByRole('button',{name:'Play',exact:true}).click();
  await page.waitForFunction(()=>window.__insv.uploads.some(f=>f.timestamp>=1),{},{timeout:120000});
  assert(await page.evaluate(()=>window.__insv.audio.length>5));
  assert(await page.evaluate(()=>window.__insv.peak>0.001), 'decoded audio reaches the output graph');
  const uploads=await page.evaluate(()=>window.__insv.uploads);
  for(let i=0;i+1<uploads.length;i+=2) assert(Math.abs(uploads[i].timestamp-uploads[i+1].timestamp)<0.04,'both lenses stay aligned');
 });
 await check('pause and latest seek',async()=>{
  await root.getByRole('button',{name:'Pause',exact:true}).click();
  const before=await page.evaluate(()=>window.__insv.uploads.length);
  await setSeek(8);await setSeek(3);await setSeek(0.5);
  await page.waitForFunction(before=>window.__insv.uploads.length>before && window.__insv.uploads.at(-1)?.timestamp>=0.466 && window.__insv.uploads.at(-1)?.timestamp<=0.501 && document.querySelector('.anyfile-insta360-viewer__status').textContent.includes('FFmpeg'),before,{timeout:120000});
  assert.equal(await root.getByRole('button',{name:'Play',exact:true}).count(),1);
 });
 await page.screenshot({path:'/tmp/anyfile-insv-ffmpeg.png'});
 await check('narrow viewport retains reachable controls', async()=>{
  await page.setViewportSize({width:420,height:560});
  await root.getByRole('button',{name:'Play',exact:true}).scrollIntoViewIfNeeded();
  assert(await root.getByRole('button',{name:'Play',exact:true}).isVisible());
  await page.screenshot({path:'/tmp/anyfile-insv-narrow.png'});
  await page.setViewportSize({width:1200,height:800});
 });
 await check('near-end playback, EOF and replay',async()=>{
  await setSeek(43.6);
  await page.waitForFunction(()=>window.__insv.uploads.at(-1)?.timestamp>=43.5,{},{timeout:120000});
  await root.getByRole('button',{name:'Play',exact:true}).click();
  await root.getByRole('button',{name:'Replay',exact:true}).waitFor({timeout:120000});
  await root.getByRole('button',{name:'Replay',exact:true}).click();
  await page.waitForFunction(()=>window.__insv.uploads.at(-1)?.timestamp<1,{},{timeout:120000});
 });
 await check('file switch stops Worker and audio',async()=>{
  await page.locator('input[type=file]').setInputFiles({name:'replacement.txt',mimeType:'text/plain',buffer:Buffer.from('replacement')});
  await page.waitForFunction(()=>window.__insv.workers.size===0 && window.__insv.contexts.every(c=>c.state==='closed'));
 });
 assert.deepEqual(errors,[]);
 await writeFile('/tmp/anyfile-insv-browser-report.json',JSON.stringify({browser:browser.version(),report,errors},null,2));
} catch(error) {
 console.log(await page.locator('body').innerText());
 await page.screenshot({path:'/tmp/anyfile-insv-failure.png'});
 throw error;
} finally {await browser.close();}

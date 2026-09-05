import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";
const base = process.env.EBOOK_TEST_URL || "http://localhost:3107";
const output = resolve("docs/ebooks/evidence");
const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
const page = await browser.newPage({ viewport: { width: 1100, height: 760 } });
const results = [], attacks = [], errors = [], requests = [];
page.on("request", r => { requests.push(r.url()); if(r.url().includes("ebook.invalid")) attacks.push(r.url()); });
page.on("pageerror", e => errors.push(e.message));
await page.addInitScript(() => {
  window.__decodeMeasurements = []; window.__ebookAttack = 0; window.__bookUrls = new Set(); window.__workers = new Set();
  const create = URL.createObjectURL.bind(URL), revoke = URL.revokeObjectURL.bind(URL), OriginalWorker = Worker;
  URL.createObjectURL = blob => { const url = create(blob); window.__bookUrls.add(url); return url; };
  URL.revokeObjectURL = url => { window.__bookUrls.delete(url); return revoke(url); };
  window.Worker = class extends OriginalWorker {
    constructor(...args) { super(...args); window.__workers.add(this); this.addEventListener("message", ({data})=>{if(data.result?.heapBytes)window.__decodeMeasurements.push({heapBytes:data.result.heapBytes,encodedBytes:data.result.encodedBytes});}); }
    terminate() { window.__workers.delete(this); return super.terminate(); }
  };
});
async function check(name, fn) {
  const start = performance.now(); await fn();
  results.push({name,elapsedMs:Math.round(performance.now()-start),...await page.evaluate(()=>({workers:window.__workers.size,urls:window.__bookUrls.size,heapBytes:performance.memory?.usedJSHeapSize,decodeMeasurements:window.__decodeMeasurements}))});
  console.log("PASS",name);
}
async function open(name, selector) {
  await page.locator('input[type="file"]').setInputFiles(resolve("docs/ebooks/fixtures/phase45",name));
  await page.locator(selector).waitFor();
}
async function textReady(text) {
  await page.waitForFunction(text=>[...document.querySelectorAll('iframe')].some(f=>f.contentDocument?.body?.textContent?.includes(text)),text);
}
async function clear() {
  await page.locator('input[type="file"]').setInputFiles({name:"reset.bin",mimeType:"application/octet-stream",buffer:Buffer.from("reset")});
  await page.locator('.anyfile-hex-viewer').waitFor();
  await page.waitForFunction(()=>document.querySelectorAll('iframe').length===0 && window.__workers.size===0 && window.__bookUrls.size===0);
}
try {
  await page.goto(`${base}/en/view`); assert.equal(await page.evaluate(()=>crossOriginIsolated),true);
  for (const name of ["uncompressed.mobi","mobi7.mobi","huffman.mobi","kf8.azw3","joint.mobi"]) {
    await check(`MOBI text, images, contents and links: ${name}`, async()=>{
      await open(name,'.anyfile-mobi-reader'); await textReady("Chapter 1");
      await page.waitForFunction(()=>[...document.querySelectorAll('iframe')].some(f=>[...f.contentDocument.querySelectorAll('img')].some(i=>i.naturalWidth>0)));
      assert.equal(await page.getByLabel("Contents",{exact:true}).locator('option').count(),5);
      await page.getByLabel("Contents",{exact:true}).selectOption("4");await textReady("Chapter 5");
      await page.getByLabel("Font size",{exact:true}).selectOption("26");
      await page.getByLabel("Theme",{exact:true}).selectOption("dark");
      assert.ok(await page.locator('iframe').evaluateAll(fs=>fs.some(f=>getComputedStyle(f.contentDocument.body).fontSize==='26px')));
      assert.equal(await page.evaluate(()=>window.__workers.size),1);
      if(name==='joint.mobi') {
        assert.ok(await page.locator('iframe').count()>=2,"Joint file must select multi-section KF8");
        const text=await page.locator('iframe').evaluateAll(fs=>fs.map(f=>f.contentDocument.body.textContent).join(''));
        assert.equal((text.match(/Original local reading fixture\. Chapter 5\./g)||[]).length,1);
      }
      await clear();
    });
  }
  for(const name of ['palmdoc.pdb','palmdoc-compressed.prc']) await check(`PalmDOC encoding and text: ${name}`,async()=>{
    await open(name,'.anyfile-mobi-reader');await textReady('café');await clear();
  });
  await check('Narrow KF8 navigation and image resource lifecycle',async()=>{
    await page.setViewportSize({width:760,height:450});await open('kf8.azw3','.anyfile-mobi-reader');await textReady('Chapter 1');
    await page.getByLabel('Contents',{exact:true}).selectOption('3');await textReady('Chapter 4');
    assert.ok(await page.locator('.anyfile-publication-reader__viewport').evaluate(e=>e.scrollHeight>e.clientHeight));
    await page.screenshot({path:resolve(output,'mobi-narrow.png')});await clear();await page.setViewportSize({width:1100,height:760});
  });
  await check('Raw malicious MOBI: inert parse, no script/network/navigation',async()=>{
    await open('malicious-raw.mobi','.anyfile-mobi-reader');await textReady('Safe malicious fixture');
    assert.equal(await page.evaluate(()=>window.__ebookAttack),0);
    const active=await page.locator('iframe').evaluateAll(fs=>fs.flatMap(f=>[...f.contentDocument.querySelectorAll('script,form,iframe,object,[onclick],[onerror]')]));
    assert.equal(active.length,0);assert.equal(attacks.length,0);await clear();
  });
  await check('ZIP and TAR do not initialize comic WASM',async()=>{
    assert.equal(requests.filter(url=>url.includes('/vendor/comic-archive/')).length,0);
    await open('../pages.cbz','.anyfile-comic-reader');await page.waitForFunction(()=>document.querySelector('.anyfile-comic-reader img')?.naturalWidth>0);await clear();
    await open('pages.cbt','.anyfile-comic-reader');await page.waitForFunction(()=>document.querySelector('.anyfile-comic-reader img')?.naturalWidth>0);
    assert.equal(await page.evaluate(()=>window.__workers.size),0);assert.equal(requests.filter(url=>url.includes('/vendor/comic-archive/')).length,0);await clear();
  });
  for (const name of ['drm.azw','encrypted.cbr','encrypted-headers.cbr']) await check(`Protected content: ${name}`,async()=>{
    await open(name,name.endsWith('.azw')?'.anyfile-mobi-reader[role=status]':'.anyfile-comic-reader[role=status]');
    assert.match(await page.locator('[role=status]').last().innerText(),/DRM|Encrypted|encrypted/i);await clear();
  });
  for(const name of ['offset.mobi','bomb.mobi','cyclic-huffman.mobi','duplicate.cbr','damaged.cbr']) await check(`Malformed or resource-limited: ${name}`,async()=>{
    await page.locator('input[type=file]').setInputFiles(resolve('docs/ebooks/fixtures/phase45',name));
    await page.getByRole('alert').waitFor();await page.waitForFunction(()=>window.__workers.size===0);await clear();
  });
  for(const name of ['rar4.cbr','rar5.cbr','pages.cb7','pages.cbt','solid-rar5.cbr','solid-lzma2.cb7','copy.cb7']) await check(`Comic ordering, jump and release: ${name}`,async()=>{
    await open(name,'.anyfile-comic-reader');
    await page.waitForFunction(()=>document.querySelector('.anyfile-comic-reader img')?.naturalWidth>0);
    const total=Number(await page.locator('input[aria-label="Page"]').getAttribute('max'));
    assert.ok(total===5 || total===300);
    await page.locator('input[aria-label="Page"]').fill(String(total===300?250:5));await page.locator('input[aria-label="Page"]').dispatchEvent('change');
    await page.waitForFunction(()=>document.querySelector('.anyfile-comic-reader img')?.naturalWidth>0);
    assert.ok(await page.evaluate(()=>window.__bookUrls.size<=4));
    await page.getByLabel('Reading direction',{exact:true}).selectOption('rtl');
    await page.getByLabel('Reading mode',{exact:true}).selectOption('double');
    await page.locator('.anyfile-comic-reader__viewport').focus();await page.keyboard.press('ArrowLeft');
    if(name==='solid-rar5.cbr') {await page.setViewportSize({width:760,height:450});await page.screenshot({path:resolve(output,'solid-comic-narrow.png')});await page.setViewportSize({width:1100,height:760});}
    await clear();
  });
  await check('Opening abort terminates a Worker waiting for runtime initialization',async()=>{
    let blocked;
    await page.route('**/vendor/libmobi/**',route=>{blocked=route;});
    try {
      await page.locator('input[type=file]').setInputFiles(resolve('docs/ebooks/fixtures/phase45/joint.mobi'));
      await page.waitForFunction(()=>window.__workers.size===1);await clear();
      assert.equal(await page.evaluate(()=>window.__workers.size),0);
    } finally {if(blocked)await blocked.abort().catch(()=>{});await page.unroute('**/vendor/libmobi/**');}
  });
  await check('Rapid opening cancellation and repeated file switches',async()=>{
    for(let i=0;i<5;i++){
      await page.locator('input[type=file]').setInputFiles(resolve('docs/ebooks/fixtures/phase45',i%2?'solid-lzma2.cb7':'joint.mobi'));
      await clear();
    }
  });
  await check('Chinese protected state and reader controls',async()=>{
    await page.goto(`${base}/zh-CN/view`);await open('drm.azw','.anyfile-mobi-reader[role=status]');assert.match(await page.locator('.anyfile-mobi-reader').innerText(),/不支持/);
    await open('kf8.azw3','.anyfile-mobi-reader');await textReady('Chapter 1');assert.ok(await page.getByLabel('字号',{exact:true}).count());await clear();
  });
  await check('Runtime response headers and byte sizes',async()=>{
    for(const path of ['/vendor/libmobi/0.12-anyfile.1/mobi.wasm','/vendor/comic-archive/3.8.9-anyfile.1/comic-archive.wasm']) {
      const response=await page.request.get(base+path);assert.equal(response.status(),200);assert.match(response.headers()['content-type'],/application\/wasm/);assert.match(response.headers()['cache-control'],/immutable/);
    }
  });
  assert.deepEqual(attacks,[]);assert.deepEqual(errors,[]);
  const bundle=JSON.parse(await readFile('.next/diagnostics/viewer-bundle-report.json','utf8'));
  await writeFile(resolve(output,'phase45-browser.json'),JSON.stringify({browser:browser.version(),results,attacks,errors,runtimeRequests:[...new Set(requests.filter(url=>url.includes('/vendor/')))],bundle:{mobi:bundle.plugins['mobi-reader'],comic:bundle.plugins['comic-book-reader']}},null,2)+'\n');
} finally {await browser.close();}

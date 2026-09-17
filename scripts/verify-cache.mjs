// Isolated browser QA; no access to the user's existing browser profile.
// QA_PLAYWRIGHT_MODULE can point to an already installed Playwright module.
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.QA_PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ channel:'chrome', headless:true });
try {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:5173/?demo=1&view=profile');
  await page.locator('.pf-totals').waitFor();
  const result = await page.evaluate(async () => {
    const cache = await import('/src/savedCache.ts');
    const owner='isolated-cache-test';
    await cache.clearSaved(owner);
    const first=await cache.readSaved(owner,'profile');
    const data={purge:'0',profile:{tools:100},padding:'x'.repeat(24000)};
    const times=[];
    if (!await cache.writeSaved(owner,'profile',first.epoch,data)) throw Error('Initial write failed');
    for(let i=0;i<50;i++) {const start=performance.now(); const r=await cache.readSaved(owner,'profile'); if(r.data.profile.tools!==100) throw Error('Wrong snapshot'); times.push(performance.now()-start);}
    await cache.writeSaved(owner,'docs',first.epoch,{purge:'0',text:'old'});
    await cache.writeSaved(owner,'profile',first.epoch,{purge:'1',profile:{tools:0}});
    const stale=await cache.writeSaved(owner,'docs',first.epoch,{purge:'0',text:'must not return'});
    const purged=await cache.readSaved(owner,'docs');
    await cache.clearSaved(owner);
    const late=await cache.writeSaved(owner,'profile',first.epoch,data);
    const loggedOut=await cache.readSaved(owner,'profile');
    return {times,stale,purged:purged.data,late,loggedOut:loggedOut.data};
  });
  assert.equal(result.stale,false); assert.equal(result.purged,null);
  assert.equal(result.late,false); assert.equal(result.loggedOut,null);
  const times=result.times.sort((a,b)=>a-b);
  console.log(JSON.stringify({indexeddb_24kb_read_p50_ms:times[25],p95_ms:times[47],purge_and_logout_fences:true}));
  const other = await context.newPage();
  await other.goto('http://127.0.0.1:5173/?demo=1&view=profile');
  const staleEpoch = await other.evaluate(async () => {
    const c=await import('/src/savedCache.ts');
    return (await c.readSaved('cross-tab-test','profile')).epoch;
  });
  await page.evaluate(async()=>{
    const c=await import('/src/savedCache.ts');
    const old=await c.readSaved('cross-tab-test','profile');
    await c.writeSaved('cross-tab-test','profile',old.epoch,{purge:'2',profile:{tools:0}});
  });
  assert.equal(await other.evaluate(async epoch=>{
    const c=await import('/src/savedCache.ts');
    return c.writeSaved('cross-tab-test','docs',epoch,{purge:'1',text:'deleted'});
  },staleEpoch),false);
  await page.evaluate(async()=>{const c=await import('/src/savedCache.ts'); await c.clearSaved('cross-tab-test');});
  assert.equal(await other.evaluate(async epoch=>{
    const c=await import('/src/savedCache.ts');
    return c.writeSaved('cross-tab-test','docs',epoch,{purge:'2',text:'logged out'});
  },staleEpoch),false);
  await other.close();
  console.log(JSON.stringify({cross_tab_purge_and_logout_fences:true}));
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  for (const width of [1440,390]) for(const view of ['profile','projects']) {
    await page.setViewportSize({width,height:1000});
    await page.goto(`http://127.0.0.1:5173/?demo=1&view=${view}`);
    await page.locator(view==='profile'?'.pf-totals':'.pj-reader').waitFor();
    assert.equal(await page.locator('main').evaluate(e=>e.scrollWidth>e.clientWidth+1),false);
    if(view==='projects') { await page.getByRole('tab',{name:'SKILL.md',exact:true}).click(); await page.getByRole('button',{name:'Source',exact:true}).click(); assert.ok(await page.locator('.pj-source').textContent()); }
  }
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({desktop_mobile_profile_projects:true,page_errors:0}));
} finally { await browser.close(); }

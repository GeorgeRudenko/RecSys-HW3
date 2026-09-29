const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' in {} ? undefined : undefined });
  const p = await b.newPage({ viewport: { width: 1100, height: 1000 } });
  const errors = []; p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); }); p.on('pageerror', e => errors.push(String(e)));
  let t = Date.now(); await p.goto('http://localhost:8765/index.html');
  await p.waitForFunction(() => !document.getElementById('recommend-btn').disabled, null, { timeout: 30000 });
  console.log('ready in', Date.now() - t, 'ms; status:', await p.textContent('#status'));
  await p.selectOption('#user-select', '1'); await p.selectOption('#movie-select', '1');
  await p.click('#predict-btn'); console.log('prediction:', (await p.textContent('#prediction-result')).replace(/\s+/g, ' ').trim());
  t = Date.now(); await p.click('#recommend-btn'); console.log('recs click', Date.now() - t, 'ms');
  console.log('UB:', (await p.textContent('#user-based-result')).replace(/\s+/g, ' ').slice(0, 300));
  console.log('IB:', (await p.textContent('#item-based-result')).replace(/\s+/g, ' ').slice(0, 300));
  await p.screenshot({ path: 'shot_desktop.png', fullPage: true });
  await p.setViewportSize({ width: 390, height: 900 }); await p.screenshot({ path: 'shot_mobile.png', fullPage: true });
  const overflow = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth); console.log('mobile horizontal overflow:', overflow);
  // cold-start movie
  await p.setViewportSize({ width: 1100, height: 1000 });
  await p.selectOption('#user-select', '7'); await p.selectOption('#movie-select', '599'); await p.click('#predict-btn');
  console.log('cold movie:', (await p.textContent('#prediction-result')).replace(/\s+/g, ' ').trim());
  // file:// behaviour
  const q = await b.newPage(); await q.goto('file://' + require('path').resolve(__dirname, '../index.html')); await q.waitForTimeout(1500);
  console.log('file:// ->', (await q.textContent('#user-based-result')).replace(/\s+/g, ' ').trim());
  console.log('console errors (http run):', errors.length ? errors : 'none');
  await b.close();
})();

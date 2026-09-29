// Browser test of the search + slider pickers (headless Chromium, served over HTTP)
const { chromium } = require('playwright');
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log(c ? '  PASS' : '  FAIL', m); };
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1100, height: 1000 } });
  const errors = []; p.on('pageerror', e => errors.push(String(e))); p.on('console', m => m.type() === 'error' && errors.push(m.text()));
  await p.goto('http://localhost:8766/index.html'); await p.waitForFunction(() => !document.getElementById('recommend-btn').disabled);
  const val = id => p.$eval('#' + id, e => e.value);
  // user search by id
  await p.click('#user-select-search'); ok(await p.isVisible('.picker[data-noun=user] .combo-list'), 'focus opens the user list');
  ok(await p.$$eval('.picker[data-noun=user] .combo-list li', l => l.length) === 943, 'empty query lists all 943 users (scrollable)');
  await p.fill('#user-select-search', '40');
  const first = await p.$$eval('.picker[data-noun=user] .combo-list li', l => l.map(x => x.textContent));
  ok(first[0].startsWith('User 40 ') && first.length === 11, `"40" -> User 40 first, then 400-409 (${first.length} rows)`);
  await p.keyboard.press('ArrowDown'); await p.keyboard.press('Enter');
  ok(await val('user-select') === '400', 'ArrowDown + Enter chooses User 400');
  ok((await p.$eval('.picker[data-noun=user] .picker-slider', e => e.value)) === '399', 'slider follows the search choice');
  // user slider
  await p.$eval('.picker[data-noun=user] .picker-slider', e => { e.value = 0; e.dispatchEvent(new Event('input')); });
  ok(await val('user-select') === '1' && await val('user-select-search') === 'User 1 (272 ratings)', 'slider to start -> User 1, search box updated');
  await p.fill('#user-select-search', 'abc'); ok((await p.textContent('.picker[data-noun=user] .combo-list')).includes('No user matches'), 'non-numeric query -> "no matches"');
  await p.keyboard.press('Escape'); ok(await val('user-select-search') === 'User 1 (272 ratings)', 'Escape restores the chosen user');
  // movie search, tokens in any order, badges
  await p.click('#movie-select-search'); await p.fill('#movie-select-search', 'wars star');
  const mv = await p.$$eval('.picker[data-noun=movie] .combo-list li', l => l.map(x => x.textContent));
  ok(mv.some(t => t.startsWith('Star Wars (1977)')), `"wars star" finds Star Wars (1977) (${mv.length} rows)`);
  ok(mv.some(t => t.includes('User 1 rated 5')), 'movies already rated by the selected user carry a "rated" badge');
  await p.click('.picker[data-noun=movie] .combo-list li:has-text("Star Wars (1977)")');
  ok(await val('movie-select') === '50', 'clicking a row chooses Star Wars (id 50)');
  await p.fill('#movie-select-search', 'shawshank the'); await p.keyboard.press('Enter');
  ok(await val('movie-select') === '64', '"shawshank the" + Enter -> Shawshank Redemption, The (id 64)');
  await p.$eval('.picker[data-noun=movie] .picker-slider', e => { e.value = e.max; e.dispatchEvent(new Event('input')); });
  const last = await val('movie-select-search'); ok(/^Z/.test(last) && !last.includes('\ufffd'), `slider to the end -> last title A-Z: "${last}"`);
  await p.fill('#movie-select-search', 'miserables'); const mis = await p.$$eval('.picker[data-noun=movie] .combo-list li', l => l.map(x => x.textContent));
  ok(mis.some(t => t.startsWith('Misérables, Les (1995)')), `accent-insensitive search: "miserables" -> ${mis[0]}`);
  await p.keyboard.press('Escape');
  // end-to-end
  await p.fill('#user-select-search', '1'); await p.keyboard.press('Enter');
  await p.click('#movie-select-search'); await p.fill('#movie-select-search', 'toy story'); await p.keyboard.press('Enter');
  await p.click('#predict-btn'); const pr = await p.textContent('#prediction-result');
  ok(/3\.9[\s\S]*4\.1/.test(pr), 'Predict Rating via pickers: user 1 + Toy Story -> 3.9 / 4.1');
  await p.click('#recommend-btn'); ok((await p.textContent('#user-based-result')).includes('Casablanca'), 'Get Recommendations via pickers works');
  await p.click('#movie-select-search'); await p.fill('#movie-select-search', 'star');
  await p.screenshot({ path: 'shot_picker_desktop.png' });
  await p.keyboard.press('Escape');
  await p.setViewportSize({ width: 390, height: 900 });
  ok(!(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth)), 'no horizontal scroll at 390 px');
  await p.click('#user-select-search'); await p.fill('#user-select-search', '13'); await p.screenshot({ path: 'shot_picker_mobile.png' });
  ok(errors.length === 0, 'no console errors' + (errors.length ? ': ' + errors.join('; ') : ''));
  console.log(`${pass} passed, ${fail} failed`); await b.close(); process.exit(fail ? 1 : 0);
})();

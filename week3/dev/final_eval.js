// Evaluates the FINAL app code (data.js + script.js) on an 80/20 split.
// The app is loaded from a temp folder whose u.data contains only the training ratings.
const fs = require('fs'), path = require('path'), os = require('os');
const { load } = require('./harness');
const lines = fs.readFileSync(path.join(__dirname, '../u.data'), 'utf8').trim().split('\n');
let seed = 42; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32;
const train = [], test = [];
for (const l of lines) (rnd() < 0.2 ? test : train).push(l);
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-'));
fs.writeFileSync(path.join(dir, 'u.data'), train.join('\n') + '\n');
for (const f of ['u.item', 'data.js', 'script.js']) fs.copyFileSync(path.join(__dirname, '..', f), path.join(dir, f));
const testT = test.map(l => l.split('\t').map(Number));
(async () => {
  const out = {};
  for (const shrink of (process.argv[2] || '1,50').split(',').map(Number)) {
    const c = load(dir); const g = c.__get; await g('loadData')();
    g('CF_CONFIG').SHRINKAGE = shrink; c.__get('itemSimCache = new Float32Array((numMovies + 1) * (numMovies + 1)).fill(NaN); userSimCache = new Map()');
    const numUsers = g('numUsers'), R = g('ratingMatrix'), mean = g('userMeanRating');
    let se = [0, 0], ae = [0, 0], cov = [0, 0], n = 0, tp = [0, 0];
    for (const [u, i, r] of testT) {
      if (u > numUsers || !g('userRatedItems')[u] || g('userRatedItems')[u].length === 0) continue; n++;
      let t = performance.now(); const pu = g('predictUserBased')(u, i); tp[0] += performance.now() - t;
      t = performance.now(); const pi = g('predictItemBased')(u, i); tp[1] += performance.now() - t;
      [pu, pi].forEach((p, k) => { const v = p ? p.prediction : mean(u); if (p) cov[k]++; se[k] += (v - r) ** 2; ae[k] += Math.abs(v - r); });
    }
    const rel = new Map(); for (const [u, i, r] of testT) if (r >= 4) { if (!rel.has(u)) rel.set(u, new Set()); rel.get(u).add(i); }
    const users = [...rel.keys()].slice(0, 300); const hits = [0, 0], pop = [0, 0], cnt = [0, 0], tl = [0, 0]; const raters = g('itemRaters');
    const catalog = [new Set(), new Set()];
    for (const u of users) {
      let t = performance.now(); const ub = g('getUserBasedRecommendations')(u, 5); tl[0] += performance.now() - t;
      t = performance.now(); const ib = g('getItemBasedRecommendations')(u, 5); tl[1] += performance.now() - t;
      [ub, ib].forEach((list, k) => { for (const x of list) { if (rel.get(u).has(x.id)) hits[k]++; pop[k] += raters[x.id].length; catalog[k].add(x.id); } cnt[k] += 5; });
    }
    const res = {};
    ['user_based', 'item_based'].forEach((name, k) => res[name] = {
      rmse: +Math.sqrt(se[k] / n).toFixed(4), mae: +(ae[k] / n).toFixed(4), coverage_pct: +(cov[k] / n * 100).toFixed(1),
      precision_at_5: +(hits[k] / cnt[k]).toFixed(4), avg_ratings_of_recommended: +(pop[k] / cnt[k]).toFixed(0), distinct_items_in_top5: catalog[k].size,
      ms_per_prediction: +(tp[k] / n).toFixed(3), ms_per_top5_list: +(tl[k] / users.length).toFixed(1) });
    out[`shrinkage_${shrink}`] = res; console.log(`SHRINKAGE=${shrink}`, JSON.stringify(res, null, 1));
  }
  // popularity & mean baselines (same split)
  const cntI = new Map(), sumU = new Map(), cntU = new Map(), sumI = new Map(); let gs = 0;
  for (const l of train) { const [u, i, r] = l.split('\t').map(Number); cntI.set(i, (cntI.get(i) || 0) + 1); sumI.set(i, (sumI.get(i) || 0) + r); sumU.set(u, (sumU.get(u) || 0) + r); cntU.set(u, (cntU.get(u) || 0) + 1); gs += r; }
  const gm = gs / train.length; let a = 0, b = 0, c2 = 0;
  for (const [u, i, r] of testT) { a += (gm - r) ** 2; b += ((cntU.has(u) ? sumU.get(u) / cntU.get(u) : gm) - r) ** 2; c2 += ((cntI.has(i) ? sumI.get(i) / cntI.get(i) : gm) - r) ** 2; }
  const rel = new Map(); for (const [u, i, r] of testT) if (r >= 4) { if (!rel.has(u)) rel.set(u, new Set()); rel.get(u).add(i); }
  const trainSet = new Set(train.map(l => l.split('\t').slice(0, 2).join(':'))); const byPop = [...cntI.entries()].sort((x, y) => y[1] - x[1]).map(x => x[0]);
  let h = 0, nn = 0; for (const u of [...rel.keys()].slice(0, 300)) { const recs = byPop.filter(i => !trainSet.has(u + ':' + i)).slice(0, 5); for (const i of recs) if (rel.get(u).has(i)) h++; nn += 5; }
  out.baselines = { global_mean_rmse: +Math.sqrt(a / test.length).toFixed(4), user_mean_rmse: +Math.sqrt(b / test.length).toFixed(4), item_mean_rmse: +Math.sqrt(c2 / test.length).toFixed(4), most_popular_precision_at_5: +(h / nn).toFixed(4) };
  out.split = { train: train.length, test: test.length, seed: 42, ranking_users: 300, relevant: 'test rating >= 4' };
  console.log(JSON.stringify(out.baselines));
  fs.writeFileSync(path.join(__dirname, 'final_eval.json'), JSON.stringify(out, null, 2));
})();

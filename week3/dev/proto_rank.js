// Top-5 ranking experiment (the app's main output). Reuses proto_eval internals.
var fs = require('fs');
eval(fs.readFileSync('proto_eval.js', 'utf8').split('// baselines')[0].replace(/^(const|let) /gm, 'var '));
function rankEval(shrink, sample = 300) {
  itemCache.clear();
  const rel = new Map(); for (const [u, i, r] of test) if (r >= 4) { if (!rel.has(u)) rel.set(u, new Set()); rel.get(u).add(i); }
  const users = [...rel.keys()].slice(0, sample);
  const pop = i => D.iIdx[i].length;
  const variants = {};
  const add = (name, list, u) => { const v = variants[name] ||= { hit: 0, n: 0, pop: 0 };
    for (const i of list) { if (rel.get(u).has(i)) v.hit++; v.pop += pop(i); } v.n += 5; };
  for (const u of users) {
    const s = userSims(u, 'co', shrink);
    const all = []; for (let v = 1; v <= U; v++) if (s[v] > 0) all.push(v); all.sort((a, b) => s[b] - s[a]);
    const gNb = all.slice(0, 20);
    const cands = []; for (let i = 1; i <= M; i++) if (!D.R[u][i]) cands.push(i);
    const top = (arr) => arr.sort((a, b) => b[1] - a[1] || b[2] - a[2]).slice(0, 5).map(x => x[0]);
    // UB spec: global N=20, weighted avg; minSupport 1 and 3
    for (const ms of [1, 3]) { const arr = [];
      for (const i of cands) { let num = 0, den = 0, c = 0; for (const v of gNb) { const r = D.R[v][i]; if (r) { num += s[v] * r; den += s[v]; c++; } }
        if (c >= ms && den > 0) arr.push([i, num / den, den]); }
      add(`UB global N=20 wavg minSup=${ms}`, top(arr), u); }
    // UB per-item k=20 weighted avg, minSupport 3
    { const arr = []; for (const i of cands) { const nb = D.iIdx[i].filter(v => s[v] > 0).sort((a, b) => s[b] - s[a]).slice(0, 20);
        let num = 0, den = 0; for (const v of nb) { num += s[v] * D.R[v][i]; den += s[v]; } if (nb.length >= 3 && den > 0) arr.push([i, num / den, den]); }
      add('UB per-item k=20 wavg minSup=3', top(arr), u); }
    // IB variants
    const rated = D.uIdx[u];
    const arrSum = [], arrAvgK = [], arrSumK = [];
    for (const i of cands) {
      const sims = []; let sum = 0;
      for (const j of rated) { const sv = itemSim(i, j, 'co', shrink); if (sv > 0) { sims.push([sv, D.R[u][j]]); sum += sv * D.R[u][j]; } }
      arrSum.push([i, sum, 0]);
      sims.sort((a, b) => b[0] - a[0]); const k = sims.slice(0, 20); let num = 0, den = 0; for (const [sv, rv] of k) { num += sv * rv; den += sv; }
      if (k.length >= 3 && den > 0) arrAvgK.push([i, num / den, den]);
      arrSumK.push([i, num, den]);
    }
    add('IB sum(sim*r) all rated (spec literal)', top(arrSum), u);
    add('IB sum(sim*r) top-k=20', top(arrSumK), u);
    add('IB wavg top-k=20 minSup=3', top(arrAvgK), u);
    add('Most popular (baseline)', top(cands.map(i => [i, pop(i), 0])), u);
  }
  console.log(`\nshrink=${shrink} users=${users.length}`);
  for (const [k, v] of Object.entries(variants)) console.log(`${k.padEnd(40)} P@5 ${(v.hit / v.n).toFixed(4)}  avg #ratings of recs ${(v.pop / v.n).toFixed(0)}`);
}
for (const g of (process.argv[2] || '0,10,50').split(',').map(Number)) rankEval(g);

var fs = require('fs');
eval(fs.readFileSync('proto_eval.js', 'utf8').split('// baselines')[0].replace(/^(const|let) /gm, 'var '));
const shrink = 50; const rel = new Map(); for (const [u, i, r] of test) if (r >= 4) { if (!rel.has(u)) rel.set(u, new Set()); rel.get(u).add(i); }
const users = [...rel.keys()].slice(0, 300); const pop = i => D.iIdx[i].length; const V = {};
const add = (name, list, u, predFn) => { const v = V[name] ||= { hit: 0, n: 0, pop: 0, low: 0 }; for (const i of list) { if (rel.get(u).has(i)) v.hit++; v.pop += pop(i); if (predFn(i) < 3.5) v.low++; } v.n += 5; };
const top = arr => arr.sort((a, b) => b[1] - a[1]).slice(0, 5).map(x => x[0]);
for (const u of users) {
  const cands = []; for (let i = 1; i <= M; i++) if (!D.R[u][i] && D.iIdx[i].length) cands.push(i);
  const rated = D.uIdx[u], mu = D.uMean[u]; const sum = [], cen = [], sumK = [], cenK = []; const pred = new Map();
  for (const i of cands) { const nb = []; let s1 = 0, s2 = 0;
    for (const j of rated) { const sv = itemSim(i, j, 'co', shrink); if (sv > 0) { nb.push([sv, D.R[u][j]]); s1 += sv * D.R[u][j]; s2 += sv * (D.R[u][j] - mu); } }
    nb.sort((a, b) => b[0] - a[0]); const k = nb.slice(0, 20); let n = 0, d = 0, c = 0; for (const [sv, rv] of k) { n += sv * rv; d += sv; c += sv * (rv - mu); }
    pred.set(i, d ? n / d : mu); sum.push([i, s1]); cen.push([i, s2]); sumK.push([i, n]); cenK.push([i, c]); }
  const pf = i => pred.get(i);
  add('IB sum sim*r (all rated)', top(sum), u, pf); add('IB sum sim*(r-mean_u) (all rated)', top(cen), u, pf);
  add('IB sum sim*r (top-20)', top(sumK), u, pf); add('IB sum sim*(r-mean_u) (top-20)', top(cenK), u, pf);
  // UB variants
  const s = userSims(u, 'co', shrink); const all = []; for (let v = 1; v <= U; v++) if (s[v] > 0) all.push(v); all.sort((a, b) => s[b] - s[a]); const nb = all.slice(0, 20);
  const us = [], uc = []; for (const i of cands) { let a = 0, b = 0, c = 0; for (const v of nb) { const r = D.R[v][i]; if (r) { a += s[v] * r; b += s[v] * (r - D.uMean[v]); c++; } } if (c) { us.push([i, a]); uc.push([i, b]); } }
  add('UB N=20 sum sim*r', top(us), u, pf); add('UB N=20 sum sim*(r-mean_v)', top(uc), u, pf);
}
for (const [k, v] of Object.entries(V)) console.log(`${k.padEnd(36)} P@5 ${(v.hit / v.n).toFixed(4)} avg#ratings ${(v.pop / v.n).toFixed(0)} recs with IB-pred<3.5: ${(v.low / v.n * 100).toFixed(1)}%`);

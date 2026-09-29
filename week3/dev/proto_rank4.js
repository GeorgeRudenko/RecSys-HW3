var fs = require('fs');
eval(fs.readFileSync('proto_eval.js', 'utf8').split('// baselines')[0].replace(/^(const|let) /gm, 'var '));
const shrink = 50; const rel = new Map(); for (const [u, i, r] of test) if (r >= 4) { if (!rel.has(u)) rel.set(u, new Set()); rel.get(u).add(i); }
const users = [...rel.keys()].slice(0, 300); const V = {};
const add = (name, list, u) => { const v = V[name] ||= { hit: 0, n: 0 }; for (const i of list) if (rel.get(u).has(i)) v.hit++; v.n += 5; };
for (const u of users) {
  const cands = []; for (let i = 1; i <= M; i++) if (!D.R[u][i] && D.iIdx[i].length) cands.push(i);
  const rated = D.uIdx[u], mu = D.uMean[u]; const sum = [];
  const ipred = i => { const nb = []; for (const j of rated) { const sv = itemSim(i, j, 'co', shrink); if (sv > 0) nb.push([sv, D.R[u][j]]); } nb.sort((a, b) => b[0] - a[0]); let n = 0, d = 0; for (const [sv, rv] of nb.slice(0, 20)) { n += sv * rv; d += sv; } return d ? n / d : mu; };
  for (const i of cands) { let s1 = 0; for (const j of rated) { const sv = itemSim(i, j, 'co', shrink); if (sv > 0) s1 += sv * D.R[u][j]; } sum.push([i, s1]); }
  sum.sort((a, b) => b[1] - a[1]);
  add('IB sum', sum.slice(0, 5).map(x => x[0]), u);
  for (const thr of ['mu', 3.5]) { const out = []; for (const [i] of sum) { if (ipred(i) >= (thr === 'mu' ? mu : thr)) out.push(i); if (out.length === 5) break; } add(`IB sum, keep pred>=${thr}`, out, u); }
  const s = userSims(u, 'co', shrink); const all = []; for (let v = 1; v <= U; v++) if (s[v] > 0) all.push(v); all.sort((a, b) => s[b] - s[a]); const nb = all.slice(0, 20);
  const upred = i => { const nn = D.iIdx[i].filter(v => v !== u && s[v] > 0).sort((a, b) => s[b] - s[a]).slice(0, 20); let n = 0, d = 0; for (const v of nn) { n += s[v] * D.R[v][i]; d += s[v]; } return d ? n / d : mu; };
  const us = []; for (const i of cands) { let a = 0, c = 0; for (const v of nb) { const r = D.R[v][i]; if (r) { a += s[v] * r; c++; } } if (c) us.push([i, a]); }
  us.sort((a, b) => b[1] - a[1]); add('UB sum', us.slice(0, 5).map(x => x[0]), u);
  const out = []; for (const [i] of us) { if (upred(i) >= mu) out.push(i); if (out.length === 5) break; } add('UB sum, keep pred>=mu', out, u);
}
for (const [k, v] of Object.entries(V)) console.log(`${k.padEnd(28)} P@5 ${(v.hit / v.n).toFixed(4)}`);

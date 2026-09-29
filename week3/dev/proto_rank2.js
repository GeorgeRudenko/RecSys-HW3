var fs = require('fs');
eval(fs.readFileSync('proto_eval.js', 'utf8').split('// baselines')[0].replace(/^(const|let) /gm, 'var '));
function rankEval(shrink, sample = 300) {
  itemCache.clear();
  const rel = new Map(); for (const [u, i, r] of test) if (r >= 4) { if (!rel.has(u)) rel.set(u, new Set()); rel.get(u).add(i); }
  const users = [...rel.keys()].slice(0, sample); const pop = i => D.iIdx[i].length; const variants = {};
  const add = (name, list, u) => { const v = variants[name] ||= { hit: 0, n: 0, pop: 0 }; for (const i of list) { if (rel.get(u).has(i)) v.hit++; v.pop += pop(i); } v.n += 5; };
  const top = (arr) => arr.sort((a, b) => b[1] - a[1] || b[2] - a[2]).slice(0, 5).map(x => x[0]);
  for (const u of users) {
    const s = userSims(u, 'co', shrink); const all = []; for (let v = 1; v <= U; v++) if (s[v] > 0) all.push(v); all.sort((a, b) => s[b] - s[a]);
    const cands = []; for (let i = 1; i <= M; i++) if (!D.R[u][i]) cands.push(i);
    for (const N of [20, 50]) { const nb = all.slice(0, N);
      const sum = [], d1 = [], d3 = [];
      for (const i of cands) { let num = 0, den = 0; for (const v of nb) { const r = D.R[v][i]; if (r) { num += s[v] * r; den += s[v]; } }
        if (den > 0) { sum.push([i, num, den]); d1.push([i, (num + 1 * D.uMean[u]) / (den + 1), den]); d3.push([i, (num + 3 * D.uMean[u]) / (den + 3), den]); } }
      add(`UB N=${N} sum(sim*r)`, top(sum), u); add(`UB N=${N} damped avg lambda=1`, top(d1), u); add(`UB N=${N} damped avg lambda=3`, top(d3), u); }
    const rated = D.uIdx[u]; const sum = [], d1 = [], d3 = [];
    for (const i of cands) { let num = 0, den = 0; for (const j of rated) { const sv = itemSim(i, j, 'co', shrink); if (sv > 0) { num += sv * D.R[u][j]; den += sv; } }
      sum.push([i, num, den]); d1.push([i, (num + D.uMean[u]) / (den + 1), den]); d3.push([i, (num + 3 * D.uMean[u]) / (den + 3), den]); }
    add('IB sum(sim*r) all rated', top(sum), u); add('IB damped avg lambda=1 all rated', top(d1), u); add('IB damped avg lambda=3 all rated', top(d3), u);
  }
  console.log(`\nshrink=${shrink} users=${users.length}`);
  for (const [k, v] of Object.entries(variants)) console.log(`${k.padEnd(36)} P@5 ${(v.hit / v.n).toFixed(4)}  avg #ratings ${(v.pop / v.n).toFixed(0)}`);
}
for (const g of (process.argv[2] || '50').split(',').map(Number)) rankEval(g);

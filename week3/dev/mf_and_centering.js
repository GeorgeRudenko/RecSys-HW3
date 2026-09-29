var fs = require('fs');
eval(fs.readFileSync('proto_eval.js', 'utf8').split('// baselines')[0].replace(/^(const|let) /gm, 'var '));
// 1) mean-centred kNN prediction (same sims, gamma=50) for comparison
{ const shrink = 50; itemCache.clear(); let seU = 0, seI = 0, n = 0; const byUser = new Map(); for (const t of test) { if (!byUser.has(t[0])) byUser.set(t[0], []); byUser.get(t[0]).push(t); }
  for (const [u, ts] of byUser) { const s = userSims(u, 'co', shrink);
    for (const [, i, r] of ts) { const nb = D.iIdx[i].filter(v => s[v] > 0).sort((a, b) => s[b] - s[a]).slice(0, 20); let num = 0, den = 0; for (const v of nb) { num += s[v] * (D.R[v][i] - D.uMean[v]); den += s[v]; }
      let p = D.uMean[u] + (den ? num / den : 0); p = Math.min(5, Math.max(1, p)); seU += (p - r) ** 2;
      const nbi = D.uIdx[u].map(j => [itemSim(i, j, 'co', shrink), D.R[u][j] - D.iMean[j]]).filter(x => x[0] > 0).sort((a, b) => b[0] - a[0]).slice(0, 20);
      let n2 = 0, d2 = 0; for (const [sv, dv] of nbi) { n2 += sv * dv; d2 += sv; } let q = (D.iIdx[i].length ? D.iMean[i] : D.g) + (d2 ? n2 / d2 : 0); q = Math.min(5, Math.max(1, q)); seI += (q - r) ** 2; n++; } }
  console.log(`mean-centred kNN (gamma=50): UB RMSE ${Math.sqrt(seU / n).toFixed(4)}  IB RMSE ${Math.sqrt(seI / n).toFixed(4)}`); }
// 2) biased matrix factorisation, SGD
{ const k = 20, epochs = 30, lr = 0.01, reg = 0.05; let s2 = 7; const r2 = () => (s2 = (s2 * 1664525 + 1013904223) >>> 0) / 2 ** 32;
  const P = Array.from({ length: U + 1 }, () => Float64Array.from({ length: k }, () => (r2() - 0.5) * 0.1)), Q = Array.from({ length: M + 1 }, () => Float64Array.from({ length: k }, () => (r2() - 0.5) * 0.1));
  const bu = new Float64Array(U + 1), bi = new Float64Array(M + 1), mu = D.g; const t0 = Date.now(); const idx = trainL.map((_, i) => i);
  const pred = (u, i) => { let d = mu + bu[u] + bi[i]; for (let f = 0; f < k; f++) d += P[u][f] * Q[i][f]; return Math.min(5, Math.max(1, d)); };
  for (let e = 0; e < epochs; e++) { for (let a = idx.length - 1; a > 0; a--) { const b = Math.floor(r2() * (a + 1)); [idx[a], idx[b]] = [idx[b], idx[a]]; }
    for (const x of idx) { const [u, i, r] = trainL[x]; let d = mu + bu[u] + bi[i]; for (let f = 0; f < k; f++) d += P[u][f] * Q[i][f]; const err = r - d;
      bu[u] += lr * (err - reg * bu[u]); bi[i] += lr * (err - reg * bi[i]);
      for (let f = 0; f < k; f++) { const pu = P[u][f], qi = Q[i][f]; P[u][f] += lr * (err * qi - reg * pu); Q[i][f] += lr * (err * pu - reg * qi); } } }
  const tt = Date.now() - t0; let se = 0; for (const [u, i, r] of test) se += (pred(u, i) - r) ** 2;
  // P@5 for the same 300 users
  const rel = new Map(); for (const [u, i, r] of test) if (r >= 4) { if (!rel.has(u)) rel.set(u, new Set()); rel.get(u).add(i); }
  let h = 0, nn = 0, t1 = Date.now(); for (const u of [...rel.keys()].slice(0, 300)) { const c = []; for (let i = 1; i <= M; i++) if (!D.R[u][i] && D.iIdx[i].length) c.push([i, pred(u, i)]); c.sort((a, b) => b[1] - a[1]); for (const [i] of c.slice(0, 5)) if (rel.get(u).has(i)) h++; nn += 5; }
  console.log(`biased MF k=${k}, ${epochs} epochs: RMSE ${Math.sqrt(se / test.length).toFixed(4)}  P@5 ${(h / nn).toFixed(4)}  train ${tt} ms  top5 ${((Date.now() - t1) / 300).toFixed(2)} ms/user`); }

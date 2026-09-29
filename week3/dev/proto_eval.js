// Offline experiment: compare missing-value strategies & neighbourhood rules on an 80/20 split.
const fs = require('fs');
const lines = fs.readFileSync('../u.data', 'utf8').trim().split('\n').map(l => l.split('\t').map(Number));
const U = 943, M = 1682;
let seed = 42; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32;
const test = [], trainL = [];
for (const r of lines) (rnd() < 0.2 ? test : trainL).push(r);
function build(train) {
  const R = Array.from({ length: U + 1 }, () => new Float32Array(M + 1));
  const C = Array.from({ length: M + 1 }, () => new Float32Array(U + 1));
  const uIdx = Array.from({ length: U + 1 }, () => []), iIdx = Array.from({ length: M + 1 }, () => []);
  for (const [u, i, r] of train) { R[u][i] = r; C[i][u] = r; uIdx[u].push(i); iIdx[i].push(u); }
  const uMean = new Float32Array(U + 1), iMean = new Float32Array(M + 1);
  let g = 0; for (const [, , r] of train) g += r; g /= train.length;
  for (let u = 1; u <= U; u++) { let s = 0; for (const i of uIdx[u]) s += R[u][i]; uMean[u] = uIdx[u].length ? s / uIdx[u].length : g; }
  for (let i = 1; i <= M; i++) { let s = 0; for (const u of iIdx[i]) s += C[i][u]; iMean[i] = iIdx[i].length ? s / iIdx[i].length : g; }
  return { R, C, uIdx, iIdx, uMean, iMean, g };
}
const D = build(trainL);
// similarity variants
function cosCo(a, b, idxA, shrink) { let d = 0, na = 0, nb = 0, n = 0;
  for (const k of idxA) { const y = b[k]; if (y) { const x = a[k]; d += x * y; na += x * x; nb += y * y; n++; } }
  if (!n) return 0; const s = d / Math.sqrt(na * nb); return shrink ? s * Math.min(n, shrink) / shrink : s; }
// mean imputation (literal): missing -> row mean, cosine over all entries
function cosImp(a, b, ma, mb, len) { let d = 0, na = 0, nb = 0;
  for (let k = 1; k < len; k++) { const x = a[k] || ma, y = b[k] || mb; d += x * y; na += x * x; nb += y * y; }
  return d / Math.sqrt(na * nb); }
function userSims(u, mode, shrink) { const s = new Float32Array(U + 1);
  for (let v = 1; v <= U; v++) if (v !== u) s[v] = mode === 'imp' ? cosImp(D.R[u], D.R[v], D.uMean[u], D.uMean[v], M + 1) : cosCo(D.R[u], D.R[v], D.uIdx[u], shrink);
  return s; }
const itemCache = new Map();
function itemSim(i, j, mode, shrink) { const key = i < j ? i * 2000 + j : j * 2000 + i; let v = itemCache.get(key);
  if (v === undefined) { v = mode === 'imp' ? cosImp(D.C[i], D.C[j], D.iMean[i], D.iMean[j], U + 1)
    : (D.iIdx[i].length < D.iIdx[j].length ? cosCo(D.C[i], D.C[j], D.iIdx[i], shrink) : cosCo(D.C[j], D.C[i], D.iIdx[j], shrink));
    itemCache.set(key, v); } return v; }
function run(name, mode, shrink, ubRule, K = 20) {
  itemCache.clear(); const t0 = Date.now();
  const byUser = new Map(); for (const t of test) { if (!byUser.has(t[0])) byUser.set(t[0], []); byUser.get(t[0]).push(t); }
  let seU = 0, aeU = 0, nU = 0, covU = 0, seI = 0, aeI = 0, nI = 0, covI = 0; let tU = 0, tI = 0;
  for (const [u, ts] of byUser) {
    let t = Date.now(); const s = userSims(u, mode, shrink);
    let globalNb = null; if (ubRule === 'global') { globalNb = []; for (let v = 1; v <= U; v++) if (s[v] > 0) globalNb.push(v); globalNb.sort((a, b) => s[b] - s[a]); globalNb = globalNb.slice(0, K); }
    for (const [, i, r] of ts) {
      let cands = ubRule === 'global' ? globalNb.filter(v => D.R[v][i]) : D.iIdx[i].filter(v => s[v] > 0).sort((a, b) => s[b] - s[a]).slice(0, K);
      let num = 0, den = 0; for (const v of cands) { num += s[v] * D.R[v][i]; den += s[v]; }
      let p = den > 0 ? num / den : D.uMean[u]; if (den > 0) covU++;
      seU += (p - r) ** 2; aeU += Math.abs(p - r); nU++;
    }
    tU += Date.now() - t; t = Date.now();
    for (const [, i, r] of ts) {
      const nb = D.uIdx[u].map(j => [itemSim(i, j, mode, shrink), D.R[u][j]]).filter(x => x[0] > 0).sort((a, b) => b[0] - a[0]).slice(0, K);
      let num = 0, den = 0; for (const [sv, rv] of nb) { num += sv * rv; den += sv; }
      let p = den > 0 ? num / den : D.uMean[u]; if (den > 0) covI++;
      seI += (p - r) ** 2; aeI += Math.abs(p - r); nI++;
    }
    tI += Date.now() - t;
  }
  console.log(`${name.padEnd(34)} UB RMSE ${Math.sqrt(seU / nU).toFixed(4)} MAE ${(aeU / nU).toFixed(4)} cov ${(covU / nU * 100).toFixed(1)}% ${tU}ms | IB RMSE ${Math.sqrt(seI / nI).toFixed(4)} MAE ${(aeI / nI).toFixed(4)} cov ${(covI / nI * 100).toFixed(1)}% ${tI}ms`);
}
// baselines
{ let a = 0, b = 0, c = 0; for (const [u, i, r] of test) { a += (D.g - r) ** 2; b += (D.uMean[u] - r) ** 2; c += ((D.iIdx[i].length ? D.iMean[i] : D.g) - r) ** 2; }
  console.log('test', test.length, 'train', trainL.length);
  console.log(`baseline global mean RMSE ${Math.sqrt(a / test.length).toFixed(4)} | user mean ${Math.sqrt(b / test.length).toFixed(4)} | item mean ${Math.sqrt(c / test.length).toFixed(4)}`); }
const which = process.argv[2] || 'all';
if (which === 'all' || which === 'co') { run('co-rated only, global N=20', 'co', 0, 'global'); run('co-rated only, per-item k=20', 'co', 0, 'item'); }
if (which === 'all' || which === 'sw') for (const g of [10, 25, 50]) { run(`sig-weight g=${g}, global N=20`, 'co', g, 'global'); run(`sig-weight g=${g}, per-item k=20`, 'co', g, 'item'); }
if (which === 'imp') { run('mean imputation, global N=20', 'imp', 0, 'global'); run('mean imputation, per-item k=20', 'imp', 0, 'item'); }

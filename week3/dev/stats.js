const fs = require('fs'); const rows = fs.readFileSync('../u.data', 'utf8').trim().split('\n').map(l => l.split('\t').map(Number));
const U = 943, M = 1682; const R = Array.from({ length: U + 1 }, () => new Float32Array(M + 1)); const ui = Array.from({ length: U + 1 }, () => []); const ic = new Int32Array(M + 1);
for (const [u, i, r] of rows) { R[u][i] = r; ui[u].push(i); ic[i]++; }
const out = {}; out.density_pct = +(100000 / (U * M) * 100).toFixed(2);
const uc = ui.slice(1).map(x => x.length).sort((a, b) => a - b); out.user_ratings_min = uc[0]; out.user_ratings_median = uc[471]; out.user_ratings_max = uc[942];
const icc = [...ic.slice(1)].sort((a, b) => a - b); out.item_ratings_min = icc[0]; out.item_ratings_median = icc[841]; out.item_ratings_max = icc[1681];
out.items_with_lt5_ratings = icc.filter(x => x < 5).length; out.items_with_1_rating = icc.filter(x => x === 1).length;
let pairs = 0, zero = 0, lt5 = 0, one = 0, simOne = 0; const ov = [];
for (let a = 1; a <= U; a++) for (let b = a + 1; b <= U; b++) { let n = 0, d = 0, na = 0, nb = 0; for (const i of ui[a]) { const y = R[b][i]; if (y) { n++; const x = R[a][i]; d += x * y; na += x * x; nb += y * y; } }
  pairs++; ov.push(n); if (!n) zero++; if (n < 5) lt5++; if (n === 1) one++; if (n && d / Math.sqrt(na * nb) > 0.9999) simOne++; }
ov.sort((a, b) => a - b); out.user_pairs = pairs; out.user_pairs_no_overlap_pct = +(zero / pairs * 100).toFixed(1); out.user_pairs_overlap_lt5_pct = +(lt5 / pairs * 100).toFixed(1);
out.user_pairs_overlap_1 = one; out.user_pairs_cosine_exactly_1 = simOne; out.median_overlap = ov[Math.floor(pairs / 2)];
// raw co-rated cosine vs mean-imputed cosine distribution for user 1
const mean = u => ui[u].reduce((s, i) => s + R[u][i], 0) / ui[u].length; const sims = [], imp = [];
for (let v = 2; v <= U; v++) { let d = 0, na = 0, nb = 0; for (const i of ui[1]) { const y = R[v][i]; if (y) { const x = R[1][i]; d += x * y; na += x * x; nb += y * y; } } if (na) sims.push(d / Math.sqrt(na * nb));
  const m1 = mean(1), mv = mean(v); let d2 = 0, a2 = 0, b2 = 0; for (let i = 1; i <= M; i++) { const x = R[1][i] || m1, y = R[v][i] || mv; d2 += x * y; a2 += x * x; b2 += y * y; } imp.push(d2 / Math.sqrt(a2 * b2)); }
const q = (arr, p) => { const s = [...arr].sort((a, b) => a - b); return +s[Math.floor(p * (s.length - 1))].toFixed(3); };
out.user1_corated_cosine_p10_p50_p90 = [q(sims, .1), q(sims, .5), q(sims, .9)]; out.user1_mean_imputed_cosine_p10_p50_p90 = [q(imp, .1), q(imp, .5), q(imp, .9)];
console.log(JSON.stringify(out, null, 1)); fs.writeFileSync('stats.json', JSON.stringify(out, null, 2));

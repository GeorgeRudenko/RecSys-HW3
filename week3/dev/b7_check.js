// Re-run the corrected leakage test against the PRE-FIX predictItemBased to prove the test catches B6.
const { load } = require('./harness');
(async () => { const c = load(__dirname + '/..'); const g = c.__get; await g('loadData')();
  c.__get('itemSimCache = new Float32Array((numMovies + 1) * (numMovies + 1)).fill(NaN)');
  const old = c.__get(`(function(u, m){ const nb=[]; for (const j of userRatedItems[u]) { if (j===m) continue; const s=getItemSimilarity(m,j); if (s>0) nb.push({j,s}); }
    if (!nb.length) return null; nb.sort((a,b)=>b.s-a.s); const used=nb.slice(0,20); let n=0,d=0; for (const {j,s} of used){n+=s*ratingMatrix[u][j]; d+=s;} return {prediction:n/d}; })`);
  const R = g('ratingMatrix'), IV = g('itemVectors'); const fresh = () => c.__get('itemSimCache.fill(NaN)');
  const run = (fn, label) => { R[1][1] = 1; IV[1][1] = 1; fresh(); const a = fn(1, 1).prediction; R[1][1] = 5; IV[1][1] = 5; fresh(); const b = fn(1, 1).prediction; R[1][1] = 5; IV[1][1] = 5;
    console.log(label, a.toFixed(4), b.toFixed(4), Math.abs(a - b) < 1e-9 ? 'PASS' : 'FAIL'); };
  // old (buggy) test: only ratingMatrix changed
  { R[1][1] = 1; fresh(); const a = old(1, 1).prediction; R[1][1] = 5; fresh(); const b = old(1, 1).prediction; console.log('old test vs old code', a.toFixed(4), b.toFixed(4), Math.abs(a - b) < 1e-9 ? 'PASS (false pass)' : 'FAIL'); }
  run(old, 'corrected test vs old code'); run(g('predictItemBased'), 'corrected test vs fixed code');
  console.log('old code, user 7 movie 599:', old(7, 599)?.prediction.toFixed(2), ' fixed:', g('predictItemBased')(7, 599)); })();

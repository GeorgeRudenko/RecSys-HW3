// Unit + behaviour tests of the FINAL data.js/script.js (run in a VM with a fake DOM)
const { load } = require('./harness');
let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; console.log('  PASS', msg); } else { fail++; console.log('  FAIL', msg); } };
(async () => {
  const c = load(__dirname + '/..'); const g = c.__get;
  const t0 = performance.now(); await g('loadData')(); console.log(`load+parse+matrix ${(performance.now() - t0).toFixed(0)} ms`);
  g('populateUserDropdown')(); g('populateMovieDropdown')(); c.__get('itemSimCache = new Float32Array((numMovies + 1) * (numMovies + 1)).fill(NaN)');
  console.log('Data');
  ok(g('numUsers') === 943, 'numUsers = 943'); ok(g('numMovies') === 1682, 'numMovies = 1682'); ok(g('ratings').length === 100000, '100000 ratings');
  const R = g('ratingMatrix'); ok(R.length === 944 && R[1].length === 1683, 'matrix shape (944 x 1683)');
  ok(R[196][242] === 3 && R[186][302] === 3 && R[22][377] === 1, 'first u.data lines land in the matrix');
  let nz = 0; for (const row of R) for (const v of row) if (v) nz++; ok(nz === 100000, 'exactly 100000 non-zero cells (no duplicate pairs)');
  ok(JSON.stringify(g('movies')[0].genres) === JSON.stringify(['Animation', "Children's", 'Comedy']), 'Toy Story genres = Animation, Children\'s, Comedy (genre bug fixed)');
  ok(JSON.stringify(g('movies')[1].genres) === JSON.stringify(['Action', 'Adventure', 'Thriller']), 'GoldenEye genres = Action, Adventure, Thriller');
  ok(c.els['user-select'].options.length === 943, '943 user options'); ok(c.els['movie-select'].options.length === 1682, '1682 movie options');
  console.log('cosineSimilarity');
  const cos = g('cosineSimilarity'); const S = g('CF_CONFIG').SHRINKAGE;
  ok(cos([0, 0], [0, 0]) === 0, 'zero vectors -> 0 (no NaN)');
  ok(cos([5, 0, 0], [0, 3, 0]) === 0, 'no co-rated items -> 0');
  ok(Math.abs(cos([4, 0], [2, 0]) - 1 / S) < 1e-9, `one co-rated item -> 1 * 1/${S} (not 1.0)`);
  const a = Array.from({ length: 60 }, (_, i) => 1 + (i % 5)), b = a.map(x => 6 - x);
  let d = 0, na = 0, nb = 0; for (let i = 0; i < 60; i++) { d += a[i] * b[i]; na += a[i] ** 2; nb += b[i] ** 2; }
  ok(Math.abs(cos(a, b) - d / Math.sqrt(na * nb)) < 1e-9, '>= 50 co-rated -> plain cosine');
  const idx = []; a.forEach((v, i) => v && idx.push(i)); ok(Math.abs(cos(a, b, idx) - cos(a, b)) < 1e-9, 'sparse-index path == dense path');
  // random check sparse vs dense on real users
  let maxDiff = 0; for (let t = 0; t < 200; t++) { const u = 1 + (t * 37) % 943, v = 1 + (t * 101) % 943;
    maxDiff = Math.max(maxDiff, Math.abs(cos(R[u], R[v], g('userRatedItems')[u]) - cos(R[u], R[v]))); }
  ok(maxDiff < 1e-6, `sparse == dense on 200 real user pairs (max diff ${maxDiff.toExponential(1)})`);
  ok(Math.abs(cos(R[1], R[2]) - cos(R[2], R[1])) < 1e-9, 'symmetric');
  ok(Math.abs(g('getItemSimilarity')(1, 50) - cos(g('itemVectors')[1], g('itemVectors')[50])) < 1e-6, 'item similarity uses the rating columns');
  console.log('Recommendations');
  for (const uid of [1, 405, 166, 13]) {
    let t = performance.now(); const ub = g('getUserBasedRecommendations')(uid, 5); const tu = performance.now() - t;
    t = performance.now(); const ib = g('getItemBasedRecommendations')(uid, 5); const ti = performance.now() - t;
    const nb = g('getTopNeighbours')(uid, 3);
    console.log(`\n  user ${uid} (${g('userRatedItems')[uid].length} ratings)  UB ${tu.toFixed(0)} ms  IB ${ti.toFixed(0)} ms`);
    console.log('   neighbours', nb.map(n => `u${n.userId}:${n.similarity.toFixed(3)}`).join(' '));
    console.log('   UB', ub.map(x => `${x.title} ★${x.score?.toFixed(2)} r=${x.rankScore.toFixed(2)} sup=${x.support}`).join(' | '));
    console.log('   IB', ib.map(x => `${x.title} ★${x.score?.toFixed(2)} r=${x.rankScore.toFixed(1)} bc=${x.because}`).join(' | '));
    ok(ub.length === 5 && ib.length === 5, `user ${uid}: both lists have 5 items`);
    ok([...ub, ...ib].every(x => R[uid][x.id] === 0), `user ${uid}: no already-rated movie recommended`);
    ok(ub.every((x, i) => i === 0 || ub[i - 1].rankScore >= x.rankScore) && ib.every((x, i) => i === 0 || ib[i - 1].rankScore >= x.rankScore), `user ${uid}: sorted descending`);
    ok([...ub, ...ib].every(x => x.score === null || (x.score >= 1 && x.score <= 5)), `user ${uid}: predicted ratings within 1..5`);
    const mu = g('userMeanRating')(uid); ok([...ub, ...ib].every(x => x.score >= mu), `user ${uid}: every rec predicted >= user mean ${mu.toFixed(2)}`);
    ok(nb[0].similarity < 1, `user ${uid}: nearest neighbour is not a 1-overlap stranger (sim ${nb[0].similarity.toFixed(3)})`);
    const again = g('getUserBasedRecommendations')(uid, 5); ok(JSON.stringify(again) === JSON.stringify(ub), `user ${uid}: deterministic`);
  }
  console.log('\nPredict Rating');
  const pu = g('predictUserBased'), pi = g('predictItemBased');
  const p1 = pu(1, 1), p2 = pi(1, 1); console.log(`  user 1, Toy Story (actual ${R[1][1]}): UB ${p1.prediction.toFixed(2)} (k=${p1.support}), IB ${p2.prediction.toFixed(2)} (k=${p2.support})`);
  ok(p1 && p2, 'both predictions available for a popular movie');
  // leakage test: item-based must not use the target's own rating
  const IV = g('itemVectors'); const setR = v => { R[1][1] = v; IV[1][1] = v; };
  const orig = R[1][1]; setR(1); const i1 = pi(1, 1).prediction, u1 = pu(1, 1).prediction; setR(5); const i5 = pi(1, 1).prediction, u5 = pu(1, 1).prediction; setR(orig);
  ok(Math.abs(i1 - i5) < 1e-9, 'item-based prediction of a rated movie does not depend on the user\'s own rating (leave-one-out)');
  ok(Math.abs(u1 - u5) < 1e-9, 'user-based prediction of a rated movie does not depend on the user\'s own rating (leave-one-out)');
  // cold item: find a movie with exactly 1 rating
  const raters = g('itemRaters'); const cold = raters.findIndex((r, i) => i > 0 && r.length === 1); const only = raters[cold][0];
  ok(pu(only, cold) === null, `movie ${cold} rated only by user ${only}: user-based returns null (no other rater)`);
  ok(pi(only, cold) === null, `movie ${cold} rated only by user ${only}: item-based returns null (was 3.9 before the fix)`);
  // UI calls
  c.els['user-select'].value = '1'; c.els['movie-select'].value = '1'; g('predictRating')(); ok(/User-Based CF:/.test(c.els['prediction-result'].innerHTML) && /actually rated/.test(c.els['prediction-result'].innerHTML), 'predictRating renders card + actual rating');
  c.els['movie-select'].value = String(cold); c.els['user-select'].value = String(only); g('predictRating')(); ok(/not enough data/.test(c.els['prediction-result'].innerHTML), 'cold movie shows "not enough data"');
  c.els['user-select'].value = ''; g('getRecommendations')(); ok(/select a user/.test(c.els['user-based-result'].innerHTML), 'no user selected -> message');
  c.els['user-select'].value = '1'; g('getRecommendations')(); ok(/<ol>/.test(c.els['user-based-result'].innerHTML) && /<ol>/.test(c.els['item-based-result'].innerHTML), 'getRecommendations renders both lists');
  // timing over all users (first run cold cache)
  let t = performance.now(); for (let u = 1; u <= 943; u += 1) g('getUserBasedRecommendations')(u, 5); const allU = performance.now() - t;
  t = performance.now(); for (let u = 1; u <= 943; u += 1) g('getItemBasedRecommendations')(u, 5); const allI = performance.now() - t;
  console.log(`\n  all 943 users: UB total ${allU.toFixed(0)} ms (${(allU / 943).toFixed(1)} ms/user), IB total ${allI.toFixed(0)} ms (${(allI / 943).toFixed(1)} ms/user)`);
  console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})();

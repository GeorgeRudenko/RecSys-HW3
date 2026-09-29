// ---------------------------------------------------------------------------
// HW3 — Collaborative Filtering core (script.js: UI + recommendation logic)
//
// Missing-value strategy (week3/readme.md section 6) — EXACTLY ONE is used:
//
//   [x] weight similarity by the number of co-rated items
//
// How it works: an unrated entry (0 in ratingMatrix) is treated as UNKNOWN,
// never as a rating of 0. Cosine similarity is computed on the co-rated
// entries, and then multiplied by min(n, SHRINKAGE) / SHRINKAGE, where n is
// the number of co-rated items (users). This is "significance weighting"
// (Herlocker et al., 1999).
//
// Why: with co-rated entries alone, two users who share ONE movie always get
// similarity 1.0 (a 1-D vector is always parallel to itself). In the first
// draft of this app every "nearest neighbour" of user 1 was such a stranger
// with a single common movie, and all Top-5 scores were a meaningless 5.00.
// Weighting by overlap keeps the cheap co-rated cosine but lets similarity
// grow only as evidence (common ratings) accumulates. Mean imputation was
// also measured offline (see the report); it hides sparsity behind invented
// values and makes every pair look similar.
// ---------------------------------------------------------------------------

// Tunable parameters (values chosen by an offline 80/20 experiment, see report)
const CF_CONFIG = {
    SHRINKAGE: 50,          // overlap at which a similarity gets full weight
    USER_NEIGHBOURS: 20,    // N most similar users used for the Top-5 list (spec: N = 20)
    PREDICT_NEIGHBOURS: 20, // k neighbours used to predict ONE (user, movie) rating
    MIN_SUPPORT: 1          // min. contributing neighbours for a prediction to be shown
};

// Caches: similarities are symmetric and the data never changes after load
let userSimCache = new Map();   // activeUserId -> Float32Array of sims to every user
let itemSimCache = null;        // flat Float32Array (numMovies+1)^2, NaN = not computed yet

// Initialize the application when the window loads
window.onload = async function() {
    const userBased = document.getElementById('user-based-result');
    const itemBased = document.getElementById('item-based-result');

    try {
        userBased.innerHTML = '<p>Loading movie data...</p>';
        itemBased.innerHTML = '<p>Loading movie data...</p>';

        await loadData();

        populateUserDropdown();
        populateMovieDropdown();

        itemSimCache = new Float32Array((numMovies + 1) * (numMovies + 1)).fill(NaN);

        document.getElementById('recommend-btn').disabled = false;
        document.getElementById('predict-btn').disabled = false;

        setStatus(`Loaded ${ratings.length.toLocaleString('en-US')} ratings from ${numUsers} users on ${numMovies} movies.`);
        userBased.innerHTML = '<p>Data loaded. Select a user and click "Get Recommendations".</p>';
        itemBased.innerHTML = '<p>Data loaded. Select a user and click "Get Recommendations".</p>';
    } catch (error) {
        console.error('Initialization error:', error);
        setStatus('Could not load the dataset.', true);
        // The detailed error message is already shown by data.js
    }
};

// Populate the user dropdown with one option per user id found in u.data
function populateUserDropdown() {
    const selectElement = document.getElementById('user-select');

    // Clear existing options except the first placeholder
    while (selectElement.options.length > 1) {
        selectElement.remove(1);
    }

    for (let userId = 1; userId <= numUsers; userId++) {
        const option = document.createElement('option');
        option.value = userId;
        option.textContent = `User ${userId} (${userRatedItems[userId].length} ratings)`;
        selectElement.appendChild(option);
    }
}

// Populate the movie dropdown (used by "Predict Rating"), sorted by title
function populateMovieDropdown() {
    const selectElement = document.getElementById('movie-select');

    while (selectElement.options.length > 1) {
        selectElement.remove(1);
    }

    const sorted = movies.slice().sort((a, b) => a.title.localeCompare(b.title));
    for (const movie of sorted) {
        const option = document.createElement('option');
        option.value = movie.id;
        option.textContent = `${movie.title} (${itemRaters[movie.id].length} ratings)`;
        selectElement.appendChild(option);
    }
}

// ---------------------------------------------------------------------------
// Cosine similarity between two rating vectors (0 = not rated).
//
// Only CO-RATED entries (both non-zero) enter the dot product and the norms;
// the result is then weighted by the overlap size (strategy note at the top):
//
//     sim(a, b) = cos_corated(a, b) * min(n, SHRINKAGE) / SHRINKAGE
//
// Returns 0 when the denominator is 0 (no co-rated entries).
// Ratings are 1..5, so the result is in [0, 1].
//
// Optional `nonZeroIdxA`: the indices where `a` is non-zero. A co-rated entry
// must be non-zero in `a`, so looping over those indices gives exactly the
// same result as the full loop, just much faster on sparse data
// (~106 ratings per user instead of 1682 columns).
// ---------------------------------------------------------------------------
function cosineSimilarity(a, b, nonZeroIdxA) {
    let dot = 0, normA = 0, normB = 0, coRated = 0;

    if (nonZeroIdxA) {
        for (let t = 0, n = nonZeroIdxA.length; t < n; t++) {
            const k = nonZeroIdxA[t];
            const y = b[k];
            if (y !== 0) {
                const x = a[k];
                dot += x * y; normA += x * x; normB += y * y; coRated++;
            }
        }
    } else {
        const len = Math.min(a.length, b.length);
        for (let k = 0; k < len; k++) {
            const x = a[k], y = b[k];
            if (x !== 0 && y !== 0) {
                dot += x * y; normA += x * x; normB += y * y; coRated++;
            }
        }
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    if (denominator === 0) return 0; // zero-denominator guard

    const cosine = dot / denominator;
    return cosine * (Math.min(coRated, CF_CONFIG.SHRINKAGE) / CF_CONFIG.SHRINKAGE);
}

// Similarity of the active user to every user (index = user id), cached
function getUserSimilarities(activeUserId) {
    if (userSimCache.has(activeUserId)) return userSimCache.get(activeUserId);

    const me = ratingMatrix[activeUserId];
    const myItems = userRatedItems[activeUserId];
    const sims = new Float32Array(numUsers + 1);
    for (let u = 1; u <= numUsers; u++) {
        if (u !== activeUserId) sims[u] = cosineSimilarity(me, ratingMatrix[u], myItems);
    }

    if (userSimCache.size > 50) userSimCache.clear(); // keep memory bounded
    userSimCache.set(activeUserId, sims);
    return sims;
}

// Item-item similarity between the rating COLUMNS of two movies, cached
function getItemSimilarity(i, j) {
    if (i === j) return 1;
    const key = i * (numMovies + 1) + j;
    let s = itemSimCache[key];
    if (Number.isNaN(s)) {
        // iterate over the raters of the less popular movie (fewer entries)
        s = itemRaters[i].length <= itemRaters[j].length
            ? cosineSimilarity(itemVectors[i], itemVectors[j], itemRaters[i])
            : cosineSimilarity(itemVectors[j], itemVectors[i], itemRaters[j]);
        itemSimCache[key] = s;
        itemSimCache[j * (numMovies + 1) + i] = s; // symmetric
    }
    return s;
}

// ---------------------------------------------------------------------------
// Rating prediction for ONE (user, movie) pair — used by "Predict Rating" and
// for the predicted rating shown next to each Top-5 recommendation.
// Both return null when there is no evidence at all (cold start).
// ---------------------------------------------------------------------------

// User-based: similarity-weighted average of the ratings given to `movieId`
// by the k users most similar to the active user among those who rated it.
// If the active user already rated the movie, the similarities are computed
// leave-one-out (that rating hidden), so the prediction can be compared
// fairly with the real rating instead of partly "seeing" it.
function predictUserBased(activeUserId, movieId) {
    let sims;
    if (ratingMatrix[activeUserId][movieId] !== 0) {
        const me = ratingMatrix[activeUserId];
        const others = userRatedItems[activeUserId].filter(m => m !== movieId);
        sims = new Float32Array(numUsers + 1);
        for (let u = 1; u <= numUsers; u++) {
            if (u !== activeUserId) sims[u] = cosineSimilarity(me, ratingMatrix[u], others);
        }
    } else {
        sims = getUserSimilarities(activeUserId);
    }

    const neighbours = [];
    for (const u of itemRaters[movieId]) {
        if (u !== activeUserId && sims[u] > 0) neighbours.push(u);
    }
    if (neighbours.length < CF_CONFIG.MIN_SUPPORT) return null;

    neighbours.sort((a, b) => sims[b] - sims[a] || a - b);
    const used = neighbours.slice(0, CF_CONFIG.PREDICT_NEIGHBOURS);

    let num = 0, den = 0;
    for (const u of used) { num += sims[u] * ratingMatrix[u][movieId]; den += sims[u]; }
    if (den === 0) return null;
    return { prediction: num / den, support: used.length, candidates: neighbours.length };
}

// Item-based: similarity-weighted average of the active user's own ratings of
// the k movies most similar to `movieId`. The target movie itself is never
// its own neighbour, and if the user already rated it, the item-item
// similarities are computed without the user's entries (leave-one-out) —
// otherwise the user's own rating would leak into the similarity. Without
// this, a movie rated ONLY by this user still got a confident-looking 3.9.
function predictItemBased(activeUserId, movieId) {
    const alreadyRated = ratingMatrix[activeUserId][movieId] !== 0;
    const targetRaters = alreadyRated
        ? itemRaters[movieId].filter(u => u !== activeUserId)
        : null;

    const neighbours = [];
    for (const j of userRatedItems[activeUserId]) {
        if (j === movieId) continue;
        const s = alreadyRated
            ? cosineSimilarity(itemVectors[movieId], itemVectors[j], targetRaters)
            : getItemSimilarity(movieId, j);
        if (s > 0) neighbours.push({ j, s });
    }
    if (neighbours.length < CF_CONFIG.MIN_SUPPORT) return null;

    neighbours.sort((a, b) => b.s - a.s || a.j - b.j);
    const used = neighbours.slice(0, CF_CONFIG.PREDICT_NEIGHBOURS);

    let num = 0, den = 0;
    for (const { j, s } of used) { num += s * ratingMatrix[activeUserId][j]; den += s; }
    if (den === 0) return null;
    return { prediction: num / den, support: used.length, candidates: neighbours.length, top: used[0].j };
}

// ---------------------------------------------------------------------------
// User-Based CF — Top-K list.
//
//   1. similarity of the active user to every other user (cosineSimilarity)
//   2. keep the N = 20 most similar users with positive similarity
//   3. for every movie the active user has NOT rated, collect the
//      neighbours' ratings of it
//   4. sort and take the top K
//
// Ranking key: the evidence-weighted sum  sum(sim * rating)  over the N
// neighbours. The plain weighted AVERAGE (the first draft) ranks a movie that
// ONE neighbour gave 5 stars above a movie that 12 neighbours gave 4.5 —
// offline Precision@5 was 0.02 vs 0.23 (see report). The average is still
// reported as `score` (the predicted rating, same function as Predict Rating).
// Sanity filter: a movie is skipped if its predicted rating is below the
// user's own mean rating — the pure evidence sum is popularity-driven and
// otherwise sometimes put a movie predicted at 2.2 stars into the Top-5.
// Returns [{ id, title, score, rankScore, support }] sorted by rankScore.
// ---------------------------------------------------------------------------
function getUserBasedRecommendations(activeUserId, topK = 5) {
    const me = ratingMatrix[activeUserId];
    const sims = getUserSimilarities(activeUserId);

    // Step 2: N most similar users with positive similarity
    const neighbours = [];
    for (let u = 1; u <= numUsers; u++) {
        if (u !== activeUserId && sims[u] > 0) neighbours.push(u);
    }
    neighbours.sort((a, b) => sims[b] - sims[a] || a - b);
    const topNeighbours = neighbours.slice(0, CF_CONFIG.USER_NEIGHBOURS);
    if (topNeighbours.length === 0) return [];

    // Step 3: score every unrated movie from the neighbours' ratings
    const candidates = [];
    for (let m = 1; m <= numMovies; m++) {
        if (me[m] !== 0) continue; // already rated -> not a recommendation
        let weightedSum = 0, support = 0;
        for (const u of topNeighbours) {
            const r = ratingMatrix[u][m];
            if (r !== 0) { weightedSum += sims[u] * r; support++; }
        }
        if (support > 0) candidates.push({ id: m, rankScore: weightedSum, support });
    }

    // Step 4: sort (ties broken by support, then id, so results are deterministic)
    candidates.sort((a, b) => b.rankScore - a.rankScore || b.support - a.support || a.id - b.id);

    // Walk down the ranking and keep the first topK movies whose predicted
    // rating is at least the user's own average rating (sanity filter)
    const floor = userMeanRating(activeUserId);
    const result = [];
    for (const c of candidates) {
        const p = predictUserBased(activeUserId, c.id);
        if (!p || p.prediction < floor) continue;
        result.push({
            id: c.id,
            title: movieById[c.id].title,
            score: p.prediction,
            rankScore: c.rankScore,
            support: c.support
        });
        if (result.length === topK) break;
    }
    return result;
}

// The N neighbours used above (for the "because you are similar to..." text)
function getTopNeighbours(activeUserId, n = CF_CONFIG.USER_NEIGHBOURS) {
    const sims = getUserSimilarities(activeUserId);
    const list = [];
    for (let u = 1; u <= numUsers; u++) if (u !== activeUserId && sims[u] > 0) list.push(u);
    list.sort((a, b) => sims[b] - sims[a] || a - b);
    return list.slice(0, n).map(u => ({ userId: u, similarity: sims[u] }));
}

// ---------------------------------------------------------------------------
// Item-Based CF — Top-K list.
//
//   1. for each movie the active user HAS rated, item-item cosineSimilarity
//      between its rating column and every candidate's column
//   2. for each movie the user has NOT rated, aggregate the similarities of
//      the rated movies weighted by the user's rating:  sum(sim * rating)
//   3. sort and take the top K
//
// `score` shown next to each title is the predicted rating (weighted average
// of the k most similar rated movies — same function as Predict Rating).
// Movies predicted below the user's mean rating are skipped (same filter as
// the user-based list).
// Returns [{ id, title, score, rankScore, because }] sorted by rankScore.
// ---------------------------------------------------------------------------
function getItemBasedRecommendations(activeUserId, topK = 5) {
    const me = ratingMatrix[activeUserId];
    const rated = userRatedItems[activeUserId];
    if (rated.length === 0) return [];

    const candidates = [];
    for (let m = 1; m <= numMovies; m++) {
        if (me[m] !== 0) continue;
        if (itemRaters[m].length === 0) continue; // nobody rated it: no column to compare
        let score = 0, bestContribution = 0, because = null;
        for (const j of rated) {
            const s = getItemSimilarity(m, j);
            if (s > 0) {
                const contribution = s * me[j];
                score += contribution;
                if (contribution > bestContribution) { bestContribution = contribution; because = j; }
            }
        }
        if (score > 0) candidates.push({ id: m, rankScore: score, because });
    }

    candidates.sort((a, b) => b.rankScore - a.rankScore || a.id - b.id);

    // Same sanity filter as user-based: skip movies predicted below the
    // user's own average (see getUserBasedRecommendations)
    const floor = userMeanRating(activeUserId);
    const result = [];
    for (const c of candidates) {
        const p = predictItemBased(activeUserId, c.id);
        if (!p || p.prediction < floor) continue;
        result.push({
            id: c.id,
            title: movieById[c.id].title,
            score: p.prediction,
            rankScore: c.rankScore,
            because: c.because ? movieById[c.because].title : null
        });
        if (result.length === topK) break;
    }
    return result;
}

// Average rating the user has given (used as the recommendation floor)
function userMeanRating(userId) {
    const items = userRatedItems[userId];
    if (items.length === 0) return 0;
    let sum = 0;
    for (const m of items) sum += ratingMatrix[userId][m];
    return sum / items.length;
}

// ---------------------------------------------------------------------------
// UI: Top-5 lists for the selected user (button "Get Recommendations")
// ---------------------------------------------------------------------------
function getRecommendations() {
    const selectElement = document.getElementById('user-select');
    const userId = parseInt(selectElement.value, 10);

    if (isNaN(userId) || !ratingMatrix) {
        renderMessage('user-based-result', 'Please select a user first.');
        renderMessage('item-based-result', 'Please select a user first.');
        return;
    }

    const nRated = userRatedItems[userId].length;
    if (nRated === 0) {
        const msg = `User ${userId} has no ratings yet (cold start): collaborative filtering has nothing to compare. A popularity or content-based fallback would be needed.`;
        renderMessage('user-based-result', msg);
        renderMessage('item-based-result', msg);
        return;
    }

    let t0 = performance.now();
    const userBased = getUserBasedRecommendations(userId);
    const userMs = performance.now() - t0;

    t0 = performance.now();
    const itemBased = getItemBasedRecommendations(userId);
    const itemMs = performance.now() - t0;

    // User-based section
    const neighbours = getTopNeighbours(userId, 3)
        .map(n => `User ${n.userId} (sim ${n.similarity.toFixed(2)})`).join(', ');
    renderList('user-based-result', userBased,
        `Because you are similar to other users — e.g. ${neighbours} — we recommend:`,
        item => `${item.support} of your ${CF_CONFIG.USER_NEIGHBOURS} nearest neighbours rated it`,
        userMs);

    // Item-based section
    const favourite = userRatedItems[userId].slice()
        .sort((a, b) => ratingMatrix[userId][b] - ratingMatrix[userId][a] || itemRaters[b].length - itemRaters[a].length)[0];
    renderList('item-based-result', itemBased,
        `Because you liked ${escapeHtml(movieById[favourite].title)} and ${nRated - 1} other rated movies, we recommend:`,
        item => item.because ? `mostly because you rated <em>${escapeHtml(item.because)}</em>` : '',
        itemMs);

    if (userBased.length === 0 && itemBased.length === 0) {
        renderMessage('user-based-result', `User ${userId} has too few ratings overlapping with others to find neighbours.`);
    }
}

// ---------------------------------------------------------------------------
// UI: one (user, movie) rating prediction (button "Predict Rating")
// ---------------------------------------------------------------------------
function predictRating() {
    const userId = parseInt(document.getElementById('user-select').value, 10);
    const movieId = parseInt(document.getElementById('movie-select').value, 10);
    const box = document.getElementById('prediction-result');

    if (isNaN(userId) || isNaN(movieId) || !ratingMatrix) {
        box.hidden = false;
        box.innerHTML = '<p class="note">Please select both a user and a movie.</p>';
        return;
    }

    const ub = predictUserBased(userId, movieId);
    const ib = predictItemBased(userId, movieId);
    const actual = ratingMatrix[userId][movieId];
    const title = escapeHtml(movieById[movieId].title);

    const cell = (label, p, evidence) => `
        <div class="prediction-cell">
            <div class="prediction-label">${label}</div>
            <div class="prediction-value">${p ? p.prediction.toFixed(1) : '—'}</div>
            <div class="prediction-sub">${p ? 'predicted' : 'not enough data'}</div>
            <div class="prediction-evidence">${p ? evidence(p) : 'no similar ' + (label.startsWith('User') ? 'user rated this movie' : 'movie rated by this user')}</div>
        </div>`;

    box.hidden = false;
    box.innerHTML = `
        <p class="prediction-title">User ${userId} &middot; ${title}</p>
        <div class="prediction-grid">
            ${cell('User-Based CF:', ub, p => `from ${p.support} most similar users who rated it`)}
            ${cell('Item-Based CF:', ib, p => `from ${p.support} most similar movies you rated`)}
        </div>
        ${actual !== 0
            ? `<p class="note">User ${userId} actually rated this movie <strong>${actual}</strong>. Both predictions were computed with that rating hidden (leave-one-out), so they can be compared with it.</p>`
            : `<p class="note">User ${userId} has not rated this movie yet.</p>`}`;
}

// ---------------------------------------------------------------------------
// Rendering helpers
// ---------------------------------------------------------------------------
function renderList(elementId, items, intro, detail, ms) {
    const el = document.getElementById(elementId);

    if (!items || items.length === 0) {
        el.innerHTML = '<p>No recommendations: this user shares too few ratings with others.</p>';
        return;
    }

    const entries = items.map(item => `
        <li>
            <span class="rec-title">${escapeHtml(item.title)}</span>
            <span class="rec-score">${item.score === null ? '—' : item.score.toFixed(2) + ' &#9733;'}</span>
            <span class="rec-detail">${detail(item)} &middot; rank score ${item.rankScore.toFixed(2)}</span>
        </li>`).join('');

    el.innerHTML = `<p class="rec-intro">${intro}</p><ol>${entries}</ol>
        <p class="timing">Computed in ${ms.toFixed(0)} ms</p>`;
}

function renderMessage(elementId, message) {
    document.getElementById(elementId).innerHTML = `<p>${escapeHtml(message)}</p>`;
}

function setStatus(text, isError) {
    const el = document.getElementById('status');
    if (!el) return;
    el.textContent = text;
    el.className = isError ? 'status error' : 'status';
}

function escapeHtml(text) {
    return String(text)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

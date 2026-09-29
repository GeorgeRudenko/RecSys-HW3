// ===========================================================================
// data.js — data loading, parsing and rating structures (HW3)
//
// Responsibilities (and nothing else):
//   * fetch u.item / u.data (MovieLens 100K, byte-identical to Week 2)
//   * parse them into `movies` and `ratings`
//   * build the user x item rating matrix used by script.js
// ===========================================================================

// Global variables for storing movie and rating data
let movies = [];
let ratings = [];

// Collaborative filtering structures (populated by buildRatingMatrix)
let numUsers = 0;          // highest user id found in u.data
let numMovies = 0;         // number of parsed movies
let ratingMatrix = null;   // (numUsers + 1) x (numMovies + 1); 0 = "not rated"

// Helper structures derived from ratingMatrix (also built in buildRatingMatrix).
// They hold exactly the same numbers, only arranged for fast lookup:
let itemVectors = null;    // (numMovies + 1) x (numUsers + 1): the matrix columns
let userRatedItems = null; // userRatedItems[u] = ids of the movies user u rated
let itemRaters = null;     // itemRaters[m]     = ids of the users who rated movie m
let movieById = null;      // movieById[m]      = { id, title, genres }

// Genre names as defined in the u.item file (u.genre, ids 1..18).
// u.item also carries an "unknown" genre flag (id 0) BEFORE these 18 flags.
const genreNames = [
    "Action", "Adventure", "Animation", "Children's", "Comedy",
    "Crime", "Documentary", "Drama", "Fantasy", "Film-Noir",
    "Horror", "Musical", "Mystery", "Romance", "Sci-Fi",
    "Thriller", "War", "Western"
];

// Primary function to load data from files
async function loadData() {
    try {
        // Load and parse movie data (u.item first, as required)
        const moviesResponse = await fetch('u.item');
        if (!moviesResponse.ok) {
            throw new Error(`Failed to load movie data: ${moviesResponse.status}`);
        }
        const moviesText = await moviesResponse.text();
        parseItemData(moviesText);

        // Load and parse rating data
        const ratingsResponse = await fetch('u.data');
        if (!ratingsResponse.ok) {
            throw new Error(`Failed to load rating data: ${ratingsResponse.status}`);
        }
        const ratingsText = await ratingsResponse.text();
        parseRatingData(ratingsText);

        // Derive matrix dimensions, then build the rating matrix
        numUsers = ratings.reduce((max, r) => Math.max(max, r.userId), 0);
        numMovies = movies.length;
        buildRatingMatrix();
    } catch (error) {
        console.error('Error loading data:', error);
        const hint = location.protocol === 'file:'
            ? ' Browsers block fetch() on file:// pages — serve the folder over HTTP (e.g. GitHub Pages or "python -m http.server").'
            : ' Please make sure u.item and u.data are in the same folder as index.html.';
        for (const id of ['user-based-result', 'item-based-result']) {
            const target = document.getElementById(id);
            if (target) {
                target.innerHTML = `<p class="error">Error: ${error.message}.${hint}</p>`;
            }
        }
        throw error; // Re-throw so script.js can stop initialisation
    }
}

// Parse movie data from u.item format:
// id | title | release date | video release date | IMDb URL | unknown | Action | ... | Western
function parseItemData(text) {
    const lines = text.split('\n');

    for (const line of lines) {
        if (line.trim() === '') continue;

        const fields = line.split('|');
        if (fields.length < 24) continue; // Skip invalid lines (5 info fields + 19 genre flags)

        const id = parseInt(fields[0], 10);
        const title = fields[1];

        // The last 19 fields are genre flags: index 5 is "unknown", indices
        // 6..23 are the 18 named genres. BUG FIX: the starter code used
        // slice(5, 24), which paired "Action" with the "unknown" flag and
        // shifted every genre by one (Toy Story came out as "Crime").
        const genreFlags = fields.slice(6, 24);
        const genres = genreNames.filter((_, index) => genreFlags[index].trim() === '1');

        movies.push({ id, title, genres });
    }
}

// Parse rating data from u.data format: user id \t item id \t rating \t timestamp
function parseRatingData(text) {
    const lines = text.split('\n');

    for (const line of lines) {
        if (line.trim() === '') continue;

        const fields = line.split('\t');
        if (fields.length < 4) continue; // Skip invalid lines

        const userId = parseInt(fields[0], 10);
        const itemId = parseInt(fields[1], 10);
        const rating = parseFloat(fields[2]);
        const timestamp = parseInt(fields[3], 10);

        ratings.push({ userId, itemId, rating, timestamp });
    }
}

// ---------------------------------------------------------------------------
// Build the user-item rating matrix.
//
// Shape: (numUsers + 1) x (numMovies + 1), indexed by raw id, so that
//   ratingMatrix[userId][movieId] === rating
// Row 0 and column 0 are unused padding (MovieLens ids start at 1).
//
// Missing-value convention: a missing entry is stored as 0. MovieLens ratings
// are integers 1..5, so 0 can never be a real rating and "0 = not rated" is
// unambiguous — no separate boolean mask is needed. script.js treats 0 as
// "unknown" (never as a low rating); see the strategy note at its top.
//
// Rows are Float32Array (943 x 1683 floats ~ 6.3 MB) instead of nested plain
// arrays: same indexing, less memory, faster loops.
// ---------------------------------------------------------------------------
function buildRatingMatrix() {
    ratingMatrix = new Array(numUsers + 1);
    for (let u = 0; u <= numUsers; u++) {
        ratingMatrix[u] = new Float32Array(numMovies + 1); // filled with 0 = not rated
    }

    itemVectors = new Array(numMovies + 1);
    for (let m = 0; m <= numMovies; m++) {
        itemVectors[m] = new Float32Array(numUsers + 1);
    }

    userRatedItems = Array.from({ length: numUsers + 1 }, () => []);
    itemRaters = Array.from({ length: numMovies + 1 }, () => []);

    for (const { userId, itemId, rating } of ratings) {
        if (userId < 1 || userId > numUsers || itemId < 1 || itemId > numMovies) continue;
        if (ratingMatrix[userId][itemId] === 0) { // keep index lists free of duplicates
            userRatedItems[userId].push(itemId);
            itemRaters[itemId].push(userId);
        }
        ratingMatrix[userId][itemId] = rating;
        itemVectors[itemId][userId] = rating;
    }

    // Typed index lists: faster to iterate in the similarity loops
    userRatedItems = userRatedItems.map(list => Int32Array.from(list));
    itemRaters = itemRaters.map(list => Int32Array.from(list));

    movieById = new Array(numMovies + 1).fill(null);
    for (const movie of movies) {
        if (movie.id >= 1 && movie.id <= numMovies) movieById[movie.id] = movie;
    }
}

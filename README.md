# RecSys — HW3: Collaborative Filtering Movie Recommender

User-Based and Item-Based collaborative filtering on MovieLens 100K in vanilla HTML/CSS/JavaScript (no libraries, no build step).

- **App:** [`week3/`](week3/) — pick a user and a movie to predict the rating both ways, or get two Top-5 lists.
- **Missing values:** cosine on co-rated items, weighted by the number of co-rated items (`min(n, 50) / 50`).
- **Verification:** [`week3/dev/`](week3/dev/) — 55 automated checks and the offline evaluation behind the report.

Run locally: `cd week3 && python -m http.server` and open http://localhost:8000 (`file://` is blocked by browsers for `fetch`).

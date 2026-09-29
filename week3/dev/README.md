# Verification scripts (HW3)

Run from this folder with Node.js >= 18 (no dependencies except Playwright for the browser test).

| Script | What it checks |
|---|---|
| `test_app.js` | 56 unit/behaviour checks of the unchanged `data.js` + `script.js` (fake DOM via `harness.js`) |
| `b7_check.js` | proves the corrected leakage test catches the pre-fix item-based code (bug B7) |
| `final_eval.js` | RMSE / MAE / coverage / Precision@5 of the final app code on an 80/20 split (seed 42) |
| `proto_eval.js`, `proto_rank*.js` | offline experiments used to choose the missing-value strategy and ranking score |
| `mf_and_centering.js` | matrix-factorisation and mean-centred kNN baselines |
| `stats.js` | sparsity statistics of MovieLens 100K |
| `picker_test.js` | 18 browser checks of the search + slider pickers (needs Playwright and `python -m http.server 8766` in `week3/`) |
| `browser_test.js` | headless Chromium run (needs `npm i playwright` and `python -m http.server 8765` in `week3/`) |

```bash
node test_app.js
node final_eval.js 1,10,50
```

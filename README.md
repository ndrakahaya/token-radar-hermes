# Token Radar — momentum variant B

A radar for protocols whose token does not exist yet. `main.ts` reads one sealed DefiLlama snapshot
(758 protocols, 40 on the watchlist, floor $50M), scores every pre-token protocol with a momentum model,
and writes a ranked board of **226 rows** (40 watchlist + 186 early rows below the floor). The dashboard
is a static page — no framework, no network — that searches, filters, sorts, opens a full farm plan for
any row, and compares two protocols side by side.

[![rank](https://make.fun/badge/token-radar-01/ndrakahaya/token-radar-hermes/rank.svg)](https://make.fun/c/token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/ndrakahaya/token-radar-hermes/reward.svg)](https://make.fun/c/token-radar-01)
[![token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/c/token-radar-01)

## The model

```
base       = tvl_usd x 0.20
growth     = clamp(change_7d, -50, 150) %          asymmetric: +0.8 per +100%, -0.4 per -100%
maturity   = age curve, peaks at 2 years            0.70 at birth -> 1.00 at 1y -> 1.05 at 2y -> 0.78 after 6y
chains     = 1 + 0.04 x (chains - 1), capped 1.20
implied    = max(1, round(base x growth x maturity x chains))
```

The maturity curve is a function of `age_days` alone, so it treats every protocol the same way: the
sweet spot is one to three years old, a brand-new protocol is discounted for having no track record, and
a protocol old enough that a token would already have shipped is discounted again. A record with no
listing date is scored at a neutral 0.88. No protocol name is ever special-cased.

`growth` is asymmetric on purpose: a protocol growing 100% a week earns a bigger multiplier than a flat one
loses for shrinking 100% a week, because upside momentum is what a launch radar is looking for and a
drawdown only removes value linearly.

A **risk score** (0–100, higher is riskier) is derived from the same fields — age, the size of the weekly
move in either direction, and how many chains the protocol reaches. It is displayed on every row and never
changes the rank.

## The board

- 226 rows: every one of the 40 watchlist slugs, plus all 186 rankable pre-token protocols below the floor.
- Rankable means pre-token (no market cap, no CoinGecko id, no symbol), not a CEX, and not a versioned pool
  (`Name V2`, `Name 3.1`).
- Ranks are 1..226 once each and implied value never rises as rank ascends.
- Six farm steps per protocol, each 20–600 characters: a fresh wallet, the category's own action with a
  capital size, a weekly qualifying action, a hold window from the protocol's age, a claim-safety step, and
  the one warning its category earns. Gas is priced for the chain the plan lands on — L2s and cheap L1s in
  cents, Ethereum L1 in dollars — so the costs are not the same boilerplate on every row.

## The dashboard

`dashboard/index.html` + `app.css` + `app.js` read `data.js`, which `main.ts` writes beside the page.
~40 KB of source, no network address anywhere, no framework.

- Board view: search, category, chain and TVL filters, six sort orders, a watchlist-only toggle, a sticky
  header, and a footer naming the visible row range.
- Detail view: rank, implied value, risk band, every chain, the six-step farm plan, and a breakdown that
  shows each multiplier with the arithmetic that produced the number.
- Filtered view: active filters named in the status line, so a screenshot is self-explanatory.
- Compare: tick two rows for a side-by-side table of eleven figures, each line marking the stronger side.

## Run it

```sh
mkdir -p out
MAKEFUN_OUTPUT_DIR=out node main.ts --input ../token-radar-01-kit/input/snapshot.json
```

Node 22 or later, standard library only — no install, no build. The program writes `board.json`, `data.js`,
`dashboard/`, `screenshots/` and `dossier.json`. Two runs from a clean output directory are byte-identical.

## Repo layout

```
main.ts                     reads the snapshot, writes the board, copies the page, writes the dossier
lib/model.ts                the momentum model, the risk score, the farm plans, the gate checks
vendor/makefun-board.ts     make.fun's dossier library, copied verbatim from the kit's starter
dashboard/                  index.html, app.css, app.js
screenshots/                board-view.png, detail-view.png, filtered-view.png (1280x800)
verify.mjs                  two runs, byte comparison, and the gate's own checks
```

## License

MIT — see `LICENSE`.

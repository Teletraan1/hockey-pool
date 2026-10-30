# The Pool Room

A responsive NHL hockey pool dashboard generated from `HockeyDraft2627.xlsx`. The site ranks 10 poolies and their 160 drafted skaters using current regular-season NHL points (one pool point per goal or assist).

## What it does

- Refreshes official NHL statistics every three hours through GitHub Actions.
- Deploys a static, fast, mobile-friendly site to GitHub Pages.
- Shows the live leaderboard, interactive cumulative-points graph, full draft board, player search, team totals, and data freshness.
- Keeps prospects and unmatched picks visible instead of silently dropping them.
- Requires no API keys, backend, database, or paid hosting.

## Run locally

Requirements: Node.js 24 or newer.

```powershell
npm install
npm run update
npm start
```

Open <http://localhost:4173>. The committed `public/data/stats.json` lets the site run even before the first refresh.

## Quality checks

```powershell
npm run check
npm test
```

`npm run check` validates the draft, generated statistics, and required web assets. The tests cover name matching, season selection, scoring, and tied ranks.

## Publish on GitHub Pages

1. Create an empty GitHub repository.
2. Add it as the local `origin` and push the `main` branch.
3. In **Settings → Pages**, set **Source** to **GitHub Actions**.
4. Run **Refresh stats and deploy Pages** once, or wait for the push workflow.

The workflow also runs at 17 minutes past every third hour. GitHub may pause scheduled workflows in repositories with no activity for 60 days; a manual run or commit re-enables it.

## Updating the draft

The website reads `public/data/draft.json`. Keep the poolie names and pick order aligned with the source spreadsheet, then run:

```powershell
npm run update
npm run check
```

Name differences in NHL data belong in `PLAYER_ALIASES` in `scripts/lib.mjs`. The original workbook remains the source record and is not shipped in the Pages artifact.

## Data and scoring

Statistics come from the public NHL web API. Injury statuses come from ESPN's public site API and appear as a bandage beside affected players. `scripts/update-stats.mjs` searches for each player, retrieves current-season totals, game logs, and current injuries, then writes normalized standings and history snapshots. The chart is rebuilt from every skater's game log and checked against the leaderboard before deployment. The dashboard uses regular-season goals plus assists. This project is unofficial and is not affiliated with the NHL or ESPN.

## Project structure

```text
.
├── .github/workflows/pages.yml  # refresh, checks, and deployment
├── public/                      # GitHub Pages artifact
│   ├── data/                    # draft and generated stats
│   ├── app.js
│   ├── index.html
│   └── styles.css
├── scripts/                     # updater, local server, validation
├── test/                        # zero-dependency Node tests
└── HockeyDraft2627.xlsx         # original draft source
```

## License

[MIT](LICENSE)

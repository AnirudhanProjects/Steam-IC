# ExoRank: a data-driven classification system for exoplanet colonization

ICAC 2026 Astronomy Showcase · Team A37 · Aryan Thakrar and Anirudhan Illayaraja

ExoRank pulls real exoplanet data from NASA's Exoplanet Archive and scores each planet from 0 to 100 on eight colonization variables. A higher score means a better candidate for humanity's next home. The site also shows why today's telescopes miss Earth-like planets, and Google Gemini writes a short list of pros and cons for any planet you click.

## What's inside

| Feature | Where |
|---|---|
| An animated transit photometry demo that shows the size bias | top of the page, [`js/simulation.js`](js/simulation.js) |
| The 8-variable scoring algorithm | [`js/scoring.js`](js/scoring.js) |
| Live data from NASA, with an offline snapshot as a backup | [`js/nasa-api.js`](js/nasa-api.js), [`js/planet-data.js`](js/planet-data.js) |
| Pros and cons briefings from Gemini | [`js/gemini-api.js`](js/gemini-api.js) |
| A sortable, searchable ranking table | the Rankings section |
| A form to score your own planet | the Custom Planet section |
| Why the project has almost no environmental cost | the Sustainability section |

## Project structure

```
exorank/
├── index.html              ← the whole page layout (start reading here)
├── css/
│   └── styles.css          ← all the visual styling (space theme)
├── js/
│   ├── config.example.js   ← settings template (safe to share)
│   ├── config.js           ← your settings and API key (not in GitHub, see below)
│   ├── scoring.js          ← the 0 to 100 scoring algorithm
│   ├── planet-data.js      ← offline snapshot of real NASA values (56 planets)
│   ├── nasa-api.js         ← downloads live data from NASA
│   ├── gemini-api.js       ← asks Gemini for pros and cons
│   ├── simulation.js       ← the animated transit demo
│   └── app.js              ← builds the table, pop-up, form and starfield
├── tools/
│   ├── _gen_dataset.mjs    ← (optional) regenerates planet-data.js from NASA
│   └── _server.mjs         ← (optional) small local dev server
├── netlify.toml            ← Netlify settings, including the NASA proxy rule
├── .claude/launch.json     ← config for running the dev server
├── .gitignore
└── README.md
```

Each `.js` file is one module with a comment at the top that explains what it does. The files share data through five globals: `ExoRankScoring`, `ExoRankData`, `ExoRankNASA`, `ExoRankGemini` and `ExoRankSim`.

## Running it locally

The site is plain HTML, CSS and JavaScript, with no build step and nothing to install. You can open `index.html` in a browser, but the live NASA fetch and the AI calls work better from a local server. Run one of these in the project folder and open the address it prints:

```bash
python -m http.server 8000        # then open http://localhost:8000
npx serve                          # if you have Node.js
node tools/_server.mjs             # the project's own server, on port 4178
```

The Live Server extension in VS Code also works.

## Setting up the Gemini API key

The key lives in `js/config.js`, which is listed in `.gitignore`, so a fresh clone won't have it. To turn the AI on:

1. Copy `js/config.example.js` to `js/config.js`.
2. Paste your key into `geminiApiKey`. You can get a free key at <https://aistudio.google.com/app/apikey>.

Everything else on the site works without a key. The AI section just switches itself off.

## How the NASA data gets to the browser

NASA's archive answers queries through TAP, a SQL-like query service. ExoRank asks it things like:

```sql
SELECT pl_name, pl_rade, pl_eqt FROM pscomppars WHERE pl_rade < 2
```

NASA doesn't send an `Access-Control-Allow-Origin` header, so browsers block pages on other sites from reading its answers (a security rule called CORS). `nasa-api.js` tries three routes in order and uses the first one that works:

1. A same-site proxy at `/nasa/...`. On Netlify, the rule in `netlify.toml` forwards it to NASA, so CORS never comes up. This is the normal route once the site is deployed.
2. A direct request to NASA. Browsers block it, but it works outside a browser, for example in Node.
3. A free public proxy (`https://api.allorigins.win/...`, set in `config.js`), mostly for local testing.

If all three fail, the site falls back to the snapshot in `planet-data.js`, so the rankings still show during a demo with no internet.

## How the score works

| # | Variable | Points | Full points when |
|---|---|---|---|
| 1 | Equilibrium temperature | 20 | 240 to 380 K (lose 0.15 points per kelvin outside) |
| 2 | Planet radius | 20 | 0.8 to 1.5 Earth radii (lose 2 points per 0.1 outside) |
| 3 | Distance from Earth | 15 | within 30 light-years (lose 0.1 points per 10 light-years beyond) |
| 4 | Stellar type | 10 | K = 10, G = 8, F = 5, M = 2, A = 1, B and O = 0 |
| 5 | Tidal lock risk | 10 | orbital period of 20 days or more (lose 0.8 points per day under) |
| 6 | Planet mass | 10 | 0.5 to 5.0 Earth masses |
| 7 | Stellar flux | 10 | 0.35 to 1.75 times the light Earth gets (lose 1 point per 0.1 outside) |
| 8 | Biosignature potential | 5 | temperature, radius and mass all in range (0, 1, 3 or 5 points for 0 to 3 of them) |

When a value is missing, that variable gets a neutral half score. If 3 or more core values are missing, the planet gets a ⚑ red flag so nobody trusts the score too much. The full rules are in [`js/scoring.js`](js/scoring.js), and every threshold sits in one `CONFIG` object at the top so it's easy to change.

## Deploying

Netlify is the best fit, because the proxy rule in `netlify.toml` lets the live NASA fetch work on the public site. Connect the repo to Netlify and deploy the root folder; there is no build command.

GitHub Pages also works (Settings, then Pages, then deploy from the `main` branch root), but it can't run the proxy rule. On Pages the live fetch falls back to the public proxy, and then to the snapshot.

`js/config.js` is not uploaded, so the AI is off on a public site by default. To turn it on safely, add an HTTP referrer restriction to your key in [Google AI Studio](https://aistudio.google.com/app/apikey) so only your site's address can use it, then remove the `js/config.js` line from `.gitignore` and commit the file. Or keep the key on your own laptop and present from there.

⚠️ Never commit an unrestricted API key to a public repo. Google scans for leaked keys and disables them, and anyone could run up usage on your account.

## Credits and data

- [NASA Exoplanet Archive](https://exoplanetarchive.ipac.caltech.edu/) for the planetary data (the `pscomppars` table)
- Google Gemini for the colonization briefings
- The ExoRank algorithm, simulation and site were made by Team A37 for ICAC 2026

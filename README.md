# 🪐 ExoRank — A Data-Driven Classification System for Exoplanet Colonization

**ICAC 2026 Astronomy Showcase · Team A37 · Aryan Thakrar & Anirudhan Illayaraja**

ExoRank pulls real exoplanet data from **NASA's Exoplanet Archive** and scores each
world from **0–100** across **seven colonization variables**. The higher the score,
the more reliable the planet is as humanity's next home. It also shows *why* today's
telescopes miss Earth-like planets, and uses **Google Gemini** to write a plain-English
pros/cons briefing for any planet you click.

---

## ✨ What's inside

| Feature | Where |
|---|---|
| 🔭 Interactive **transit-photometry simulation** (proves the size bias) | top of the page |
| 🧮 The **7-variable scoring algorithm** | [`js/scoring.js`](js/scoring.js) |
| 🛰 **Live data from NASA** (via a CORS proxy) + offline snapshot | [`js/nasa-api.js`](js/nasa-api.js) |
| 🤖 **Gemini AI** pros/cons briefings | [`js/gemini-api.js`](js/gemini-api.js) |
| 📊 Sortable, searchable **ranking table** | the *Rankings* section |
| ✍️ **Score your own planet** form | the *Custom Planet* section |
| ♻️ **Sustainability** section | bottom of the page |

---

## 📁 Project structure

```
exorank/
├── index.html              ← the whole page layout (start reading here)
├── css/
│   └── styles.css          ← all the visual styling (space theme)
├── js/
│   ├── config.example.js   ← settings TEMPLATE (safe to share)
│   ├── config.js           ← YOUR settings + API key (NOT in GitHub — see below)
│   ├── scoring.js          ← the 0–100 scoring algorithm  ⭐ the "brain"
│   ├── planet-data.js      ← offline snapshot of real NASA values
│   ├── nasa-api.js         ← downloads live data from NASA
│   ├── gemini-api.js       ← asks Gemini for pros/cons summaries
│   ├── simulation.js       ← the animated transit demo
│   └── app.js              ← glue: builds the table, modal, forms, starfield
├── tools/
│   ├── _gen_dataset.mjs    ← (optional) regenerates planet-data.js from NASA
│   └── _server.mjs         ← (optional) tiny local dev server
├── netlify.toml            ← Netlify deploy + the NASA proxy rule
├── .claude/launch.json     ← "run the dev server" config
├── .gitignore
└── README.md
```

Each `.js` file is **one self-contained module** with a big comment at the top
explaining what it does. They share data through clearly named globals
(`ExoRankScoring`, `ExoRankData`, `ExoRankNASA`, `ExoRankGemini`, `ExoRankSim`).

---

## ▶️ Running it locally

The site is plain HTML/CSS/JS — **no build step, no install.**

**Easiest:** open `index.html` in your browser.

**Recommended** (so the live-NASA fetch and AI calls behave): run a tiny local
server from the project folder, then visit the URL it prints:

```bash
# Pick ONE of these:
python -m http.server 8000        # then open http://localhost:8000
npx serve                          # if you have Node.js
```
(VS Code users: the **Live Server** extension works great too.)

---

## 🔑 Setting up the Gemini API key

`js/config.js` holds the key, and it is **deliberately not in this repo** (it's
listed in `.gitignore`) — so a fresh clone won't have it. To switch the AI on:

1. Copy `js/config.example.js` → `js/config.js`
2. Paste your key into `geminiApiKey` (get a free one at
   <https://aistudio.google.com/app/apikey>)

On the original project laptop `js/config.js` already exists and is untouched by
the push, so the AI keeps working there with no setup.

> The rest of the site works perfectly even with **no** key — the AI section just
> turns itself off.

---

## 🛰 How the NASA "API" works (and the CORS catch)

NASA's archive speaks **TAP** (a SQL-like query service). We ask it things like:

```sql
SELECT pl_name, pl_rade, pl_eqt FROM pscomppars WHERE pl_rade < 2
```

**The catch:** NASA doesn't send a `Access-Control-Allow-Origin` header, so a web
browser **blocks** us from reading it directly (a security rule called **CORS**).
We get around it by routing the request through a free public proxy
(`https://api.allorigins.win/...`, set in `config.js`). If that ever fails, the
site automatically falls back to the bundled snapshot in `planet-data.js`, so it
**never breaks during a demo**.

---

## 🧮 How the score works (quick version)

| # | Variable | Max | Full points when… |
|---|---|---|---|
| 1 | Equilibrium Temperature | 25 | 273–373 K (liquid water) |
| 2 | Planet Radius | 20 | 0.8–1.5 Earth radii (rocky) |
| 3 | Distance from Earth | 15 | within 10 light-years |
| 4 | Stellar Type | 15 | K=15, G=12, F=8, M=3 |
| 5 | Tidal Lock Risk | 10 | orbital period > 20 days |
| 6 | Planet Mass | 10 | 1.0–5.0 Earth masses |
| 7 | Biosignature Potential | 5 | temp + radius + mass all habitable |

Missing data → a **neutral half score**, and a **⚑ red flag** appears if too much
is missing. Full rules and formulas live in [`js/scoring.js`](js/scoring.js).
Press **"Validate vs. Research Paper"** on the site to see ExoRank reproduce the
paper's Table 1.

---

## 🚀 Deploying to GitHub Pages

1. Create a repo and push these files.
2. Repo **Settings → Pages → Build from branch → `main` / root**.
3. Your site goes live at `https://<your-username>.github.io/<repo>/`.

**Want the AI to work on the public site?** By default `js/config.js` is in
`.gitignore`, so your key is **not** uploaded and the AI turns off online. To keep
it on, you have two safe options:

- **Recommended:** in [Google AI Studio](https://aistudio.google.com/app/apikey),
  add an **HTTP-referrer restriction** to your key (limit it to your Pages URL),
  then delete the `js/config.js` line from `.gitignore` and commit the file. Now
  only *your* site can use the key.
- Or keep the key local-only and just present from your own laptop.

> ⚠️ **Never** commit an unrestricted API key to a public repo — Google scans for
> leaked keys and will disable them, and others could run up usage on your account.

---

## 🙌 Credits & data

- **NASA Exoplanet Archive** — planetary data
  (<https://exoplanetarchive.ipac.caltech.edu/>)
- **Google Gemini** — AI colonization briefings
- ExoRank algorithm, simulation & site — **Team A37**, ICAC 2026

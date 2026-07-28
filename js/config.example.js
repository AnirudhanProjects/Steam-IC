/* =============================================================================
 * ExoRank  —  config.example.js  —  SETTINGS TEMPLATE
 * =============================================================================
 *
 * HOW TO USE THIS FILE
 * --------------------
 * 1. Make a COPY of this file in the same folder and name the copy "config.js".
 * 2. Open your new "config.js" and paste your real Gemini API key.
 * 3. That's it — index.html already loads "config.js".
 *
 * WHY A COPY?  Because "config.js" is listed in .gitignore, your secret API key
 * will NOT be uploaded to GitHub. This template (config.example.js) is safe to
 * share because it has no real key in it.
 *
 * Get a free Gemini key here:  https://aistudio.google.com/app/apikey
 * ========================================================================== */

window.EXORANK_CONFIG = {
  // ---- Google Gemini (AI pros/cons summaries) -----------------------------
  // Paste your key between the quotes. Leave it as "" to turn the AI off
  // (the rest of the website still works perfectly without it).
  geminiApiKey: "",

  // Which Gemini model to use. "gemini-2.5-flash" is fast and high quality.
  geminiModel: "gemini-2.5-flash",

  // ---- NASA Exoplanet Archive (live data) ---------------------------------
  // Browsers block direct downloads from NASA (no "CORS" header). The best fix
  // when hosting on Netlify is the same-origin proxy below: requests to
  // "/nasa/..." on your own site are forwarded to NASA by Netlify (see
  // netlify.toml), so there is no CORS problem at all.
  nasaProxyPath: "/nasa",

  // Last-resort public proxy, used only when the Netlify proxy isn't available
  // (e.g. local testing). Set to "" to always use the built-in offline snapshot.
  nasaCorsProxy: "https://api.allorigins.win/raw?url=",

  // Max number of planets to pull from NASA in one live fetch.
  nasaResultLimit: 300,
};

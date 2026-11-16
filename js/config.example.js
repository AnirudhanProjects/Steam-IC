/* =============================================================================
 * ExoRank · config.example.js · settings template
 * =============================================================================
 *
 * How to use it
 * -------------
 * 1. Copy this file into the same folder and name the copy "config.js".
 * 2. Paste your Gemini API key into config.js.
 * 3. index.html already loads config.js, so that's all.
 *
 * config.js is listed in .gitignore, so your key never gets uploaded to GitHub.
 * This template has no real key in it, so it is safe to share.
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

/* =============================================================================
 * ExoRank · nasa-api.js · live data from the NASA Exoplanet Archive
 * =============================================================================
 *
 * Downloads current exoplanet data from NASA and reshapes it into the format the
 * scoring algorithm expects. NASA serves the data through TAP (Table Access
 * Protocol), which takes queries in ADQL, a SQL-like language. For example:
 *
 *     SELECT pl_name, pl_rade, pl_eqt FROM pscomppars WHERE pl_rade < 2
 *
 * The CORS problem
 * ----------------
 * Browsers only let a page read data from another site if that site sends an
 * "Access-Control-Allow-Origin" header (the CORS rule). NASA's archive doesn't
 * send it, so fetchLivePlanets() tries three routes in order:
 *   1. our own site at /nasa/..., which Netlify forwards to NASA (netlify.toml)
 *   2. NASA directly, which only works outside a browser (for example in Node)
 *   3. a public CORS proxy (nasaCorsProxy in config.js), mainly for local testing
 *
 * If all three fail, the app falls back to the offline snapshot in
 * planet-data.js, so the site always has data to show.
 * ========================================================================== */

const ExoRankNASA = (function () {
  "use strict";

  const TAP_BASE = "https://exoplanetarchive.ipac.caltech.edu"; // NASA's server
  const TAP_PATH = "/TAP/sync";                                  // the query endpoint
  const TAP_URL = TAP_BASE + TAP_PATH;                           // full direct URL
  const PC_TO_LY = 3.26156; // 1 parsec = 3.26156 light-years

  // The columns we ask NASA for. Each maps to one input of the scoring algorithm.
  //   pl_name=name  hostname=star  pl_rade=radius  pl_bmasse=mass
  //   pl_eqt=temperature  pl_orbper=orbital period  sy_dist=distance(parsecs)
  //   st_spectype=star type
  const COLUMNS = "pl_name,hostname,pl_rade,pl_bmasse,pl_eqt,pl_orbper,pl_insol,sy_dist,st_spectype";

  // Read settings from config.js (with safe defaults if it is missing).
  function cfg() {
    return window.EXORANK_CONFIG || {};
  }

  /* ---------------------------------------------------------------------------
   * buildQuery: assemble the ADQL question we send to NASA.
   * We grab nearby planets that have a measured radius (so they are at least
   * partly characterized), smallest-distance first. `limit` caps the count.
   * ------------------------------------------------------------------------- */
  function buildQuery(limit) {
    return (
      "select top " + limit + " " + COLUMNS +
      " from pscomppars" +
      " where pl_rade is not null" +
      " order by sy_dist asc nulls last"
    );
  }

  /* ---------------------------------------------------------------------------
   * normalize: turn one raw NASA row into our clean planet object.
   * The big job here is converting distance from parsecs into light-years.
   * ------------------------------------------------------------------------- */
  function normalize(row) {
  return {
    name: row.pl_name,
    hostname: row.hostname,
    radius: row.pl_rade,
    mass: row.pl_bmasse,
    temp: row.pl_eqt,
    period: row.pl_orbper,
    insolation: row.pl_insol,
    distance: row.sy_dist == null ? null : row.sy_dist * PC_TO_LY,
    spectralType: row.st_spectype || null,
    source: "live",
  };
}

  /* ---------------------------------------------------------------------------
   * tryFetch: attempt to download + parse JSON from a URL.
   * Throws if the network call fails or the response is not valid JSON.
   * ------------------------------------------------------------------------- */
  async function tryFetch(url) {
    const response = await fetch(url);
    if (!response.ok) throw new Error("NASA responded with HTTP " + response.status);
    const text = await response.text();
    return JSON.parse(text); // NASA returns a JSON array of rows
  }

  /* ---------------------------------------------------------------------------
   * fetchLivePlanets: the main function the app calls.
   *
   * Tries three routes in order and stops at the first one that works:
   *   1. the same-site Netlify proxy ("/nasa", see netlify.toml)
   *   2. a direct request to NASA (works outside a browser, e.g. Node)
   *   3. the public CORS proxy from config.js
   *
   * Returns: { ok, planets, source, error }
   *   ok      = true if we got data
   *   planets = array of normalized planet objects
   *   source  = "live-netlify", "live-direct" or "live-proxy"
   *   error   = a friendly message if ok is false
   * ------------------------------------------------------------------------- */
  async function fetchLivePlanets() {
    const limit = cfg().nasaResultLimit || 300;

    // The query string is the same no matter how we send it. We build it once.
    const queryString = "?query=" + encodeURIComponent(buildQuery(limit)) + "&format=json";
    const nasaUrl = TAP_URL + queryString;

    // --- Attempt 1: same-origin proxy (the Netlify rule in netlify.toml) -------
    // The browser requests our OWN site at "/nasa/TAP/sync?...", so there is NO
    // cross-origin check. Netlify fetches NASA server-side and hands it back.
    // This is the reliable path once the site is deployed on Netlify.
    const proxyPath = cfg().nasaProxyPath || "/nasa"; // must match netlify.toml
    try {
      const rows = await tryFetch(proxyPath + TAP_PATH + queryString);
      return { ok: true, planets: rows.map(normalize), source: "live-netlify" };
    } catch (netlifyError) {
      // Not deployed on Netlify yet (or the rule is missing), so try the other routes.
    }

    // --- Attempt 2: straight to NASA (works outside a browser, e.g. Node) ------
    try {
      const rows = await tryFetch(nasaUrl);
      return { ok: true, planets: rows.map(normalize), source: "live-direct" };
    } catch (directError) {
      // Expected to fail in a browser because of CORS. Fall through.
    }

    // --- Attempt 3: a public CORS proxy (last-resort fallback, e.g. local dev) -
    // allorigins is used by default; corsproxy.io now needs a paid plan.
    const proxy = cfg().nasaCorsProxy || "https://api.allorigins.win/raw?url=";
    if (proxy) {
      try {
        const rows = await tryFetch(proxy + encodeURIComponent(nasaUrl));
        return { ok: true, planets: rows.map(normalize), source: "live-proxy" };
      } catch (proxyError) {
        // fall through to the error below
      }
    }

    return {
      ok: false,
      planets: [],
      error: "Could not reach NASA (Netlify proxy, direct, and public proxy all failed). Showing the offline snapshot instead.",
    };
  }

  return {
    fetchLivePlanets: fetchLivePlanets,
    buildQuery: buildQuery,
    normalize: normalize,
  };
})();

if (typeof module !== "undefined" && module.exports) {
  module.exports = ExoRankNASA;
}

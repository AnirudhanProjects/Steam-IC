/* =============================================================================
 * ExoRank  —  nasa-api.js  —  LIVE DATA FROM THE NASA EXOPLANET ARCHIVE
 * =============================================================================
 *
 * WHAT THIS FILE DOES
 * -------------------
 * It downloads real, up-to-the-minute exoplanet data from NASA and reshapes it
 * into the simple format the scoring algorithm expects.
 *
 * NASA gives us data through a service called "TAP" (Table Access Protocol).
 * We ask it questions in a SQL-like language called ADQL. For example:
 *
 *     SELECT pl_name, pl_rade, pl_eqt FROM pscomppars WHERE pl_rade < 2
 *
 * THE CORS PROBLEM (read this — it's the tricky part!)
 * ----------------------------------------------------
 * For security, web browsers refuse to read data from another website unless
 * that website says "it's OK" by sending a special header called
 * "Access-Control-Allow-Origin" (this rule is called CORS). NASA's archive does
 * NOT send that header, so a browser blocks us from reading it directly.
 *
 * The fix: we send our request through a small public "proxy" server that DOES
 * send the header. The proxy fetches NASA's data for us and passes it back.
 * The proxy URL is set in config.js (nasaCorsProxy).
 *
 * If the live fetch fails for any reason (no internet, proxy down, etc.), the
 * app simply falls back to the offline snapshot in planet-data.js, so the
 * website never breaks.
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
   * buildQuery — assemble the ADQL question we send to NASA.
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
   * normalize — turn one raw NASA row into our clean planet object.
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
   * tryFetch — attempt to download + parse JSON from a URL.
   * Throws if the network call fails or the response is not valid JSON.
   * ------------------------------------------------------------------------- */
  async function tryFetch(url) {
    const response = await fetch(url);
    if (!response.ok) throw new Error("NASA responded with HTTP " + response.status);
    const text = await response.text();
    return JSON.parse(text); // NASA returns a JSON array of rows
  }

  /* ---------------------------------------------------------------------------
   * fetchLivePlanets — the main function the app calls.
   *
   * Strategy (tries in order, stops at the first that works):
   *   1. Direct request to NASA   (works only outside a browser, e.g. Node)
   *   2. Request through the CORS proxy from config.js   (the browser path)
   *
   * Returns: { ok, planets, source, error }
   *   ok      = true if we got data
   *   planets = array of normalized planet objects
   *   source  = "live-direct" or "live-proxy"
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
      // Not deployed on Netlify yet (or the rule is missing) — try other routes.
    }

    // --- Attempt 2: straight to NASA (works outside a browser, e.g. Node) ------
    try {
      const rows = await tryFetch(nasaUrl);
      return { ok: true, planets: rows.map(normalize), source: "live-direct" };
    } catch (directError) {
      // Expected to fail in a browser due to CORS — fall through.
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

// Throwaway generator: fetches real NASA values and writes ../js/planet-data.js
// (Not shipped as part of the website. Run with: node tools/_gen_dataset.mjs)
import { writeFileSync } from "node:fs";

const BASE = "https://exoplanetarchive.ipac.caltech.edu/TAP/sync";
const COLS = "pl_name,hostname,pl_rade,pl_bmasse,pl_eqt,pl_orbper,sy_dist,st_spectype";
const PC_TO_LY = 3.26156;

async function q(adql) {
  const url = BASE + "?query=" + encodeURIComponent(adql) + "&format=json";
  const r = await fetch(url);
  if (!r.ok) throw new Error("HTTP " + r.status);
  return r.json();
}

const names = [
  // The 5 ExoRank validation candidates + TRAPPIST family
  "TRAPPIST-1 e", "TRAPPIST-1 d", "TRAPPIST-1 f", "TRAPPIST-1 g", "TRAPPIST-1 b", "TRAPPIST-1 c", "TRAPPIST-1 h",
  "Kepler-442 b", "Wolf-1069 b", "LHS 1140 b", "Proxima Cen b",
  // The 5 gas giants from Table 2 (should score LOW — proves the point)
  "WASP-17 b", "HAT-P-32 b", "Kepler-12 b", "TrES-4 b", "WASP-79 b",
  // Other famous habitable-zone worlds
  "Kepler-186 f", "Kepler-452 b", "Kepler-62 f", "Kepler-62 e", "Kepler-1649 c",
  "TOI-700 d", "TOI-700 e", "Kepler-22 b", "Ross 128 b", "GJ 667 C c",
  "Teegarden's Star b", "Teegarden's Star c", "K2-18 b", "GJ 357 d", "Wolf 1061 c",
  "55 Cnc e", "GJ 273 b", "Kepler-69 c", "Kepler-1229 b", "Gliese 12 b",
];

const inList = names.map((n) => "'" + n.replace(/'/g, "''") + "'").join(",");
const named = await q(`select ${COLS} from pscomppars where pl_name in (${inList})`);
const broad = await q(
  `select ${COLS} from pscomppars where pl_rade is not null and pl_rade < 2.0 ` +
  `and pl_eqt between 170 and 360 and sy_dist < 40 order by sy_dist`
);

// Merge + dedupe (named first so paper planets win any tie)
const map = new Map();
for (const row of [...named, ...broad]) map.set(row.pl_name, row);

const round = (x, d) => (x == null ? null : Math.round(x * 10 ** d) / 10 ** d);

const planets = [...map.values()]
  .map((r) => ({
    name: r.pl_name,
    hostname: r.hostname,
    radius: round(r.pl_rade, 2),
    mass: round(r.pl_bmasse, 2),
    temp: round(r.pl_eqt, 0),
    period: round(r.pl_orbper, 2),
    distance: r.sy_dist == null ? null : round(r.sy_dist * PC_TO_LY, 2), // parsecs -> light-years
    spectralType: r.st_spectype || null,
  }))
  .sort((a, b) => (a.distance ?? 1e9) - (b.distance ?? 1e9));

// Format each planet on one tidy line so the file stays human-readable.
const lines = planets.map((p) => "  " + JSON.stringify(p)).join(",\n");

const header = `/* =============================================================================
 * ExoRank  —  planet-data.js  —  BUNDLED EXOPLANET DATASET (offline fallback)
 * =============================================================================
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * NASA's live Exoplanet Archive does not send "CORS" headers, which means a web
 * browser is normally BLOCKED from downloading it directly (a browser security
 * rule). nasa-api.js works around that with a proxy, but proxies can be slow or
 * down. So we keep this snapshot of REAL NASA values baked in. The website
 * ALWAYS has data to show, even with no internet — perfect for a live demo.
 *
 * WHERE THE NUMBERS CAME FROM
 * ---------------------------
 * Every value below was pulled straight from the NASA Exoplanet Archive
 * "pscomppars" table. Distances were converted from parsecs to light-years
 * (1 parsec = 3.26156 light-years). A value of null means NASA has not measured
 * it yet — the scoring algorithm handles that with a neutral score.
 *
 * FIELDS:  name, hostname, radius (Earth radii), mass (Earth masses),
 *          temp (Kelvin), period (days), distance (light-years), spectralType
 * Snapshot date: ${new Date().toISOString().slice(0, 10)}   |   ${planets.length} planets
 * ========================================================================== */

const ExoRankData = (function () {
  "use strict";

  // Earth is included as a REFERENCE row (not a colonization target) so you can
  // see how a "perfect" home world scores under the same algorithm.
  const EARTH = {
    name: "Earth", hostname: "Sun", radius: 1.0, mass: 1.0, temp: 255,
    period: 365.25, distance: 0, spectralType: "G2 V", reference: true,
  };

  const PLANETS = [
${lines}
  ];

  return { PLANETS: PLANETS, EARTH: EARTH };
})();

if (typeof module !== "undefined" && module.exports) {
  module.exports = ExoRankData;
}
`;

writeFileSync(new URL("../js/planet-data.js", import.meta.url), header);
console.log("Wrote js/planet-data.js with " + planets.length + " planets.");
console.log("Sample:", JSON.stringify(planets[0]));

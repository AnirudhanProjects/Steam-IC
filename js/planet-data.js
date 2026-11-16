/* =============================================================================
 * ExoRank · planet-data.js · bundled exoplanet dataset (offline fallback)
 * =============================================================================
 *
 * Why this file exists
 * --------------------
 * NASA's archive doesn't send CORS headers, so browsers can't download it
 * directly. nasa-api.js works around that with proxies, but proxies can be slow
 * or down, so this file keeps a snapshot of real NASA values. The site always has
 * data to show, even with no internet, which matters for a live demo.
 *
 * Where the numbers came from
 * ---------------------------
 * Every value comes from the NASA Exoplanet Archive "pscomppars" table.
 * Distances were converted from parsecs to light-years (1 parsec = 3.26156
 * light-years). A value of null means NASA hasn't measured it yet, and the
 * scoring algorithm gives it a neutral score.
 *
 * FIELDS:  name, hostname, radius (Earth radii), mass (Earth masses),
 *          temp (Kelvin), period (days), distance (light-years), spectralType
 * Snapshot date: 2026-05-21   |   56 planets
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
  {"name":"Proxima Cen b","hostname":"Proxima Cen","radius":1.02,"mass":1.06,"temp":218,"period":11.18,"distance":4.24,"spectralType":"M5.5 V"},
  {"name":"Proxima Cen d","hostname":"Proxima Cen","radius":0.69,"mass":0.26,"temp":282,"period":5.12,"distance":4.24,"spectralType":"M5.5 V"},
  {"name":"Barnard e","hostname":"Barnard's star","radius":0.64,"mass":0.19,"temp":340,"period":6.74,"distance":5.96,"spectralType":"M3.5-4 V"},
  {"name":"Ross 128 b","hostname":"Ross 128","radius":1.11,"mass":1.4,"temp":301,"period":9.87,"distance":11.01,"spectralType":"M4"},
  {"name":"YZ Cet d","hostname":"YZ Cet","radius":1.03,"mass":1.09,"temp":357,"period":4.66,"distance":12.11,"spectralType":"M4.5 V"},
  {"name":"Teegarden's Star b","hostname":"Teegarden's Star","radius":1.05,"mass":1.16,"temp":277,"period":4.91,"distance":12.49,"spectralType":"M7.0 V"},
  {"name":"Teegarden's Star c","hostname":"Teegarden's Star","radius":1.02,"mass":1.05,"temp":209,"period":11.42,"distance":12.49,"spectralType":"M7.0 V"},
  {"name":"Wolf 1061 c","hostname":"Wolf 1061","radius":1.66,"mass":3.41,"temp":null,"period":17.87,"distance":14.04,"spectralType":"M3.5"},
  {"name":"GJ 1002 b","hostname":"GJ 1002","radius":1.03,"mass":1.08,"temp":231,"period":10.35,"distance":15.81,"spectralType":"M5.5 V"},
  {"name":"GJ 1002 c","hostname":"GJ 1002","radius":1.1,"mass":1.36,"temp":182,"period":21.2,"distance":15.81,"spectralType":"M5.5 V"},
  {"name":"GJ 251 b","hostname":"GJ 251","radius":1.79,"mass":3.85,"temp":336,"period":14.24,"distance":18.2,"spectralType":"M3.0 V"},
  {"name":"GJ 251 c","hostname":"GJ 251","radius":1.8,"mass":3.88,"temp":216,"period":53.65,"distance":18.2,"spectralType":"M3.0 V"},
  {"name":"GJ 411 b","hostname":"GJ 411","radius":1.45,"mass":2.69,"temp":350,"period":12.94,"distance":18.51,"spectralType":"M1.5 V"},
  {"name":"GJ 273 b","hostname":"GJ 273","radius":1.51,"mass":2.89,"temp":null,"period":18.65,"distance":19.31,"spectralType":"M3.5"},
  {"name":"GJ 667 C c","hostname":"GJ 667 C","radius":1.77,"mass":3.8,"temp":null,"period":28.14,"distance":23.63,"spectralType":"M1.5 V"},
  {"name":"GJ 357 d","hostname":"GJ 357","radius":2.34,"mass":6.1,"temp":220,"period":55.66,"distance":30.8,"spectralType":"M2.5 V"},
  {"name":"Wolf 1069 b","hostname":"Wolf 1069","radius":1.08,"mass":1.26,"temp":250,"period":15.56,"distance":31.26,"spectralType":"M5.0 V"},
  {"name":"GJ 3988 b","hostname":"GJ 3988","radius":1.74,"mass":3.69,"temp":348,"period":6.94,"distance":32.32,"spectralType":"M4.5 V"},
  {"name":"L 98-59 e","hostname":"L 98-59","radius":1.49,"mass":2.82,"temp":347,"period":12.83,"distance":34.64,"spectralType":"M3 V"},
  {"name":"L 98-59 f","hostname":"L 98-59","radius":1.48,"mass":2.8,"temp":285,"period":23.06,"distance":34.64,"spectralType":"M3 V"},
  {"name":"G 261-6 b","hostname":"G 261-6","radius":1.1,"mass":1.37,"temp":322,"period":5.45,"distance":34.66,"spectralType":"M5.5 V"},
  {"name":"Gliese 12 b","hostname":"Gliese 12","radius":0.93,"mass":0.95,"temp":315,"period":12.76,"distance":39.82,"spectralType":"M3.0 V"},
  {"name":"TRAPPIST-1 b","hostname":"TRAPPIST-1","radius":1.12,"mass":1.37,"temp":398,"period":1.51,"distance":40.54,"spectralType":"M8.0 V"},
  {"name":"TRAPPIST-1 c","hostname":"TRAPPIST-1","radius":1.1,"mass":1.31,"temp":340,"period":2.42,"distance":40.54,"spectralType":"M8.0 V"},
  {"name":"TRAPPIST-1 d","hostname":"TRAPPIST-1","radius":0.79,"mass":0.39,"temp":286,"period":4.05,"distance":40.54,"spectralType":"M8.0 V"},
  {"name":"TRAPPIST-1 e","hostname":"TRAPPIST-1","radius":0.92,"mass":0.69,"temp":250,"period":6.1,"distance":40.54,"spectralType":"M8.0 V"},
  {"name":"TRAPPIST-1 f","hostname":"TRAPPIST-1","radius":1.05,"mass":1.04,"temp":218,"period":9.21,"distance":40.54,"spectralType":"M8.0 V"},
  {"name":"TRAPPIST-1 g","hostname":"TRAPPIST-1","radius":1.13,"mass":1.32,"temp":197,"period":12.35,"distance":40.54,"spectralType":"M8.0 V"},
  {"name":"TRAPPIST-1 h","hostname":"TRAPPIST-1","radius":0.76,"mass":0.33,"temp":172,"period":18.77,"distance":40.54,"spectralType":"M8.0 V"},
  {"name":"55 Cnc e","hostname":"55 Cnc","radius":1.88,"mass":7.99,"temp":1958,"period":0.74,"distance":41.05,"spectralType":"G8 V"},
  {"name":"GJ 1132 c","hostname":"GJ 1132","radius":1.52,"mass":2.91,"temp":300,"period":8.93,"distance":41.14,"spectralType":"M4.5 V"},
  {"name":"LHS 1140 b","hostname":"LHS 1140","radius":1.73,"mass":5.6,"temp":226,"period":24.74,"distance":48.88,"spectralType":"M4.5 V"},
  {"name":"TOI-5799 c","hostname":"TOI-5799","radius":1.76,"mass":3.75,"temp":337,"period":14.01,"distance":90.71,"spectralType":"M2 V"},
  {"name":"TOI-1452 b","hostname":"TOI-1452","radius":1.67,"mass":4.82,"temp":326,"period":11.06,"distance":99.55,"spectralType":"M4 +/- 0.5 V"},
  {"name":"TOI-700 d","hostname":"TOI-700","radius":1.07,"mass":1.25,"temp":269,"period":37.42,"distance":101.52,"spectralType":"M2.5 V"},
  {"name":"TOI-700 e","hostname":"TOI-700","radius":0.95,"mass":0.82,"temp":273,"period":27.81,"distance":101.52,"spectralType":"M2.5 V"},
  {"name":"TOI-6002 b","hostname":"TOI-6002","radius":1.65,"mass":3.36,"temp":321,"period":10.9,"distance":104.46,"spectralType":"M3.5+/-0.5"},
  {"name":"LP 890-9 c","hostname":"LP 890-9","radius":1.37,"mass":25.3,"temp":272,"period":8.46,"distance":105.77,"spectralType":"M6 V"},
  {"name":"LHS 1903 e","hostname":"LHS 1903","radius":1.73,"mass":5.79,"temp":333,"period":29.32,"distance":116.41,"spectralType":"M"},
  {"name":"TOI-1266 d","hostname":"TOI-1266","radius":1.74,"mass":3.68,"temp":288,"period":32.51,"distance":117.45,"spectralType":"M2"},
  {"name":"TOI-1266 c","hostname":"TOI-1266","radius":1.98,"mass":3.17,"temp":346,"period":18.8,"distance":117.45,"spectralType":"M2"},
  {"name":"K2-18 b","hostname":"K2-18","radius":2.37,"mass":8.92,"temp":284,"period":32.94,"distance":124.03,"spectralType":"M2.5 V"},
  {"name":"Kepler-1649 c","hostname":"Kepler-1649","radius":1.06,"mass":1.2,"temp":234,"period":19.54,"distance":300.69,"spectralType":null},
  {"name":"Kepler-186 f","hostname":"Kepler-186","radius":1.17,"mass":1.71,"temp":177,"period":129.94,"distance":579.23,"spectralType":"M1"},
  {"name":"Kepler-22 b","hostname":"Kepler-22","radius":2.1,"mass":9.1,"temp":279,"period":289.86,"distance":634.84,"spectralType":"G5 V"},
  {"name":"WASP-79 b","hostname":"WASP-79","radius":17.15,"mass":270.15,"temp":1716,"period":3.66,"distance":804.59,"spectralType":"F5"},
  {"name":"Kepler-1229 b","hostname":"Kepler-1229","radius":1.4,"mass":2.54,"temp":212,"period":86.83,"distance":865.89,"spectralType":null},
  {"name":"HAT-P-32 b","hostname":"HAT-P-32","radius":22.19,"mass":216.12,"temp":1836,"period":2.15,"distance":943.26,"spectralType":null},
  {"name":"Kepler-62 e","hostname":"Kepler-62","radius":1.61,"mass":36,"temp":270,"period":122.39,"distance":981.32,"spectralType":"K2 V"},
  {"name":"Kepler-62 f","hostname":"Kepler-62","radius":1.41,"mass":35,"temp":208,"period":267.29,"distance":981.32,"spectralType":"K2 V"},
  {"name":"Kepler-442 b","hostname":"Kepler-442","radius":1.34,"mass":2.36,"temp":241,"period":112.31,"distance":1193.62,"spectralType":null},
  {"name":"WASP-17 b","hostname":"WASP-17","radius":20.96,"mass":247.91,"temp":1755,"period":3.74,"distance":1323.89,"spectralType":"F4"},
  {"name":"TrES-4 b","hostname":"TrES-4","radius":18.05,"mass":247.91,"temp":1778,"period":3.55,"distance":1682.9,"spectralType":"F8 V"},
  {"name":"Kepler-452 b","hostname":"Kepler-452","radius":1.63,"mass":3.29,"temp":265,"period":384.84,"distance":1799.49,"spectralType":"G2"},
  {"name":"Kepler-69 c","hostname":"Kepler-69","radius":1.71,"mass":3.57,"temp":299,"period":242.46,"distance":2382.98,"spectralType":"G4 V"},
  {"name":"Kepler-12 b","hostname":"Kepler-12","radius":19.66,"mass":137.3,"temp":1480,"period":4.44,"distance":2874.69,"spectralType":null}
  ];

  return { PLANETS: PLANETS, EARTH: EARTH };
})();

if (typeof module !== "undefined" && module.exports) {
  module.exports = ExoRankData;
}

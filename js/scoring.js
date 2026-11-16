/* =============================================================================
 * ExoRank · scoring.js · the scoring algorithm
 * =============================================================================
 *
 * Turns a planet's measurements (temperature, size, distance and so on) into one
 * colonization score from 0 to 100. The score is the sum of 8 variables, each
 * worth a fixed number of points:
 *
 *     Variable 1: Equilibrium Temperature .... 20 points
 *     Variable 2: Planet Radius ............... 20 points
 *     Variable 3: Distance from Earth ......... 15 points
 *     Variable 4: Stellar Type ................ 10 points
 *     Variable 5: Tidal Lock Risk ............. 10 points
 *     Variable 6: Planet Mass ................. 10 points
 *     Variable 7: Stellar Flux / Insolation ... 10 points
 *     Variable 8: Biosignature Potential ......  5 points
 *                                              -----------
 *                                       TOTAL = 100 points
 *
 * A higher score means a better candidate for human colonization.
 *
 * Missing data
 * ------------
 * Telescopes haven't measured every value for every planet. When a value is
 * missing, that variable gets a neutral score (half its maximum) and is marked
 * as a guess. If 3 or more core values are missing, the site shows a red flag so
 * nobody trusts the score too much.
 *
 * Layout
 * ------
 * - CONFIG ................. every number and threshold, in one place
 * - small helpers .......... full(), neutral(), clamp(), round1(), isMissing()
 * - one function per variable  scoreTemperature(), scoreRadius(), ...
 * - scorePlanet() .......... runs all 8 and adds them up
 *
 * This file never touches the page or the internet. It is only math, so it is
 * easy to read and test. It is wrapped in an IIFE (a function that runs once) so
 * its helpers stay private, and it shares one global: `ExoRankScoring`.
 * ========================================================================== */

const ExoRankScoring = (function () {
  "use strict";

  /* ---------------------------------------------------------------------------
   * CONFIG: every number you might want to tune lives here.
   * To change a rule (say, widen the temperature zone), edit this object
   * instead of hunting through the code.
   * ------------------------------------------------------------------------- */
  const CONFIG = {

    // Variable 1: Equilibrium Temperature (20 pts)
    // Habitable range is ~240–380 K; outside it we lose 0.15 pts per Kelvin.
    temperature: {
      max: 20,
      minK: 240,
      maxK: 380,
      penaltyPerK: 0.15,
    },

    // Variable 2: Planet Radius (20 pts)
    // Rocky sweet spot is 0.8–1.5 Earth radii; lose 2 pts per 0.1 Re outside.
    radius: {
      max: 20,
      minRe: 0.8,
      maxRe: 1.5,
      penaltyPer01: 2,        // points lost per 0.1 Earth radii outside range
    },

    // Variable 3: Distance from Earth (15 pts)
    // Within 30 light-years = full marks; lose 0.1 pts per 10 ly beyond that.
    distance: {
      max: 15,
      freeLy: 30,             // free zone (no penalty up to this distance)
      penaltyPer10Ly: 0.1,
    },

    // Variable 4: Stellar Type (10 pts)
    // The host star sets the radiation and stability environment.
    // K-type orange dwarfs score best; violent O/B stars score near zero.
    stellarType: {
      max: 10,
      K: 10,    // K-type: long-lived, stable, mild radiation, ideal
      G: 8,     // G-type: like our Sun, good but shorter-lived than K
      F: 5,     // F-type: hotter, shorter lifespan
      M: 2,     // M-type: red dwarf, frequent flares, tidal-lock risk
      A: 1,     // A-type: hot, bright, life would struggle
      B: 0,     // B-type: extreme radiation, very short lifespan
      O: 0,     // O-type: harshest stars in the galaxy
    },

    // Variable 5: Tidal Lock Risk (10 pts)
    // Very short orbital periods mean one face always points at the star.
    // Above 20 days = full marks; lose 0.8 pts per day below that threshold.
    tidalLock: {
      max: 10,
      freeDays: 20,           // periods at or above this earn full marks
      penaltyPerDay: 0.8,
    },

    // Variable 6: Planet Mass (10 pts)
    // Controls surface gravity and whether the planet can hold an atmosphere.
    // Sweet spot: 0.5–5.0 Earth masses.
    mass: {
      max: 10,
      minMe: 0.5,
      maxMe: 5.0,
      penaltyPer01Below: 1,   // pts lost per 0.1 Me below the minimum
      penaltyPer1Above: 1,    // pts lost per 1.0 Me above the maximum
    },

    // Variable 7: Stellar Flux / Insolation (10 pts)
    // How much energy the planet receives vs Earth (in Earth-flux units, S_Earth).
    // Habitable range: 0.35–1.75 S_Earth. Lose 1 pt per 0.1 S_Earth outside.
    stellarFlux: {
      max: 10,
      minFlux: 0.35,          // too little flux → permanent ice age
      maxFlux: 1.75,          // too much flux → runaway greenhouse effect
      penaltyPer01: 1,        // pts lost per 0.1 S_Earth outside range
    },

    // Variable 8: Biosignature Potential (5 pts)
    // Estimates life-hosting likelihood by counting how many of
    // {temperature, radius, mass} fall inside their habitable ranges.
    biosignature: {
      max: 5,
      // Points by number of checks passed (0, 1, 2, or all 3).
      pointsByCriteriaMet: [0, 1, 3, 5],
    },

    // Red-flag threshold: show a warning if this many CORE variables are missing.
    redFlagWhenDefaultsAtLeast: 3,

  }; // end of CONFIG

  /* ---------------------------------------------------------------------------
   * TINY HELPERS (functions, so they live outside CONFIG)
   * ------------------------------------------------------------------------- */

  // A value counts as "missing" if it is null, undefined, or not a real number.
  function isMissing(value) {
    return value === null || value === undefined || Number.isNaN(Number(value));
  }

  // Keep a number between a low and high bound (so scores never go below 0).
  function clamp(value, low, high) {
    return Math.max(low, Math.min(high, value));
  }

  // Round to 1 decimal place so the UI shows tidy numbers like 19.6 not 19.5999.
  function round1(value) {
    return Math.round(value * 10) / 10;
  }

  // Build the result object for a variable that earned FULL points.
  function full(max, note) {
    return { points: max, max: max, defaulted: false, note: note };
  }

  // Build the result for a variable whose data was MISSING (neutral half score).
  function neutral(max, note) {
    return {
      points: max / 2,
      max: max,
      defaulted: true,
      note: note || "No data available, so a neutral half score was used.",
    };
  }

  // Build the result for a variable that earned a PARTIAL score.
  function partial(points, max, note) {
    return { points: round1(clamp(points, 0, max)), max: max, defaulted: false, note: note };
  }

  /* ===========================================================================
   * VARIABLE 1: EQUILIBRIUM TEMPERATURE (20 pts)
   * Goal: keep water liquid (240 K to 380 K). Lose 0.15 pts per Kelvin outside.
   * ========================================================================= */
  function scoreTemperature(tempK) {
    const c = CONFIG.temperature;
    if (isMissing(tempK)) return neutral(c.max, "No temperature data: neutral score.");

    if (tempK >= c.minK && tempK <= c.maxK) {
      return full(c.max, `Inside the liquid-water zone (${c.minK}–${c.maxK} K).`);
    }
    // How many Kelvin are we outside the comfortable zone?
    const kelvinsOut = tempK < c.minK ? c.minK - tempK : tempK - c.maxK;
    const points = c.max - c.penaltyPerK * kelvinsOut;
    const direction = tempK < c.minK ? "too cold" : "too hot";
    return partial(points, c.max, `${Math.round(kelvinsOut)} K ${direction} for liquid water.`);
  }

  /* ===========================================================================
   * VARIABLE 2: PLANET RADIUS (20 pts)
   * Goal: rocky world (0.8–1.5 Earth radii). Lose 2 pts per 0.1 Re outside.
   * ========================================================================= */
  function scoreRadius(radiusRe) {
    const c = CONFIG.radius;
    if (isMissing(radiusRe)) return neutral(c.max, "No radius data: neutral score.");

    if (radiusRe >= c.minRe && radiusRe <= c.maxRe) {
      return full(c.max, "Likely rocky with survivable gravity.");
    }
    const reOut = radiusRe < c.minRe ? c.minRe - radiusRe : radiusRe - c.maxRe;
    // (reOut / 0.1) = how many "0.1-radius steps" we are outside the range.
    // FIX: use c.penaltyPer01 (was accidentally written as c.penaltyPer01Re before)
    const points = c.max - c.penaltyPer01 * (reOut / 0.1);
    const reason = radiusRe < c.minRe ? "too small to hold an atmosphere" : "likely a gassy mini-Neptune";
    return partial(points, c.max, `${radiusRe.toFixed(2)} Earth radii: ${reason}.`);
  }

  /* ===========================================================================
   * VARIABLE 3: DISTANCE FROM EARTH (15 pts)
   * Goal: close = cheap & feasible. Within 30 ly = full. Lose 0.1 pt per 10 ly.
   * NOTE: distance must already be in LIGHT-YEARS (nasa-api.js converts parsecs).
   * ========================================================================= */
  function scoreDistance(distanceLy) {
    const c = CONFIG.distance;
    if (isMissing(distanceLy)) return neutral(c.max, "No distance data: neutral score.");

    if (distanceLy <= c.freeLy) {
      return full(c.max, `Only ${distanceLy.toFixed(1)} light-years away: very reachable.`);
    }
    const extraLy = distanceLy - c.freeLy;
    const points = c.max - c.penaltyPer10Ly * (extraLy / 10);
    return partial(points, c.max, `${Math.round(distanceLy)} light-years away: a costly journey.`);
  }

  /* ===========================================================================
   * VARIABLE 4: STELLAR TYPE (10 pts)
   * The host star sets the radiation environment. K=10, G=8, F=5, M=2, etc.
   * Spectral types look like "M3.5 V", "K5 V", "G2 V". We read the first letter.
   *
   * FIX: was referencing CONFIG.stellar (old name) and c.scores[starClass] (old
   * structure). Now uses CONFIG.stellarType and reads c[starClass] directly.
   * ========================================================================= */
  function parseSpectralClass(spectralType) {
    if (!spectralType) return null;
    // Find the first character that is one of the main star classes O B A F G K M.
    const match = String(spectralType).toUpperCase().match(/[OBAFGKM]/);
    return match ? match[0] : null;
  }

  function scoreStellar(spectralType) {
    // FIX: renamed from CONFIG.stellar → CONFIG.stellarType
    const c = CONFIG.stellarType;
    const starClass = parseSpectralClass(spectralType);
    if (!starClass) return neutral(c.max, "No stellar type data: neutral score.");

    // FIX: scores are now direct properties on c (e.g. c.K, c.G) not c.scores[x]
    const points = c[starClass];
    if (points === undefined) return neutral(c.max, "Unrecognized star type: neutral score.");

    const blurbs = {
      K: "K-type orange dwarf: long-lived and stable (ideal).",
      G: "G-type star like our Sun: good but shorter-lived than K.",
      F: "F-type star: hotter with a shorter lifespan.",
      M: "M-type red dwarf: frequent flares and tidal-lock risk.",
      A: "A-type star: hot, bright, hostile to complex life.",
      B: "B-type star: extreme radiation, very short-lived.",
      O: "O-type star: the harshest, shortest-lived stars.",
    };
    return { points: points, max: c.max, defaulted: false, note: blurbs[starClass] };
  }

  /* ===========================================================================
   * VARIABLE 5: TIDAL LOCK RISK (10 pts)
   * Short orbital period = planet hugs its star = one side roasts, one freezes.
   * Period above 20 days = full. Lose 0.8 pts per day below 20.
   *
   * FIX: was referencing CONFIG.tidal (old name) and c.safePeriodDays (old key).
   * Now uses CONFIG.tidalLock and c.freeDays.
   * ========================================================================= */
  function scoreTidal(periodDays) {
    // FIX: renamed from CONFIG.tidal → CONFIG.tidalLock
    const c = CONFIG.tidalLock;
    if (isMissing(periodDays)) return neutral(c.max, "No orbital-period data: neutral score.");

    // FIX: renamed from c.safePeriodDays → c.freeDays
    if (periodDays >= c.freeDays) {
      return full(c.max, `${Math.round(periodDays)}-day orbit: low tidal-lock risk.`);
    }
    const daysBelow = c.freeDays - periodDays;
    const points = c.max - c.penaltyPerDay * daysBelow;
    return partial(points, c.max, `${periodDays.toFixed(1)}-day orbit: high tidal-lock risk.`);
  }

  /* ===========================================================================
   * VARIABLE 6: PLANET MASS (10 pts)
   * Mass controls gravity + whether the planet can hold onto an atmosphere.
   * Sweet spot 0.5–5.0 Earth masses.
   *   - Below 0.5: lose 1 pt per 0.1 Me (air leaks into space).
   *   - Above 5.0: lose 1 pt per 1.0 Me (gravity gets crushing).
   * ========================================================================= */
  function scoreMass(massMe) {
    const c = CONFIG.mass;
    if (isMissing(massMe)) return neutral(c.max, "No mass data: neutral score.");

    if (massMe >= c.minMe && massMe <= c.maxMe) {
      return full(c.max, "Earth-like gravity and good atmosphere retention.");
    }
    let points;
    let note;
    if (massMe < c.minMe) {
      points = c.max - c.penaltyPer01Below * ((c.minMe - massMe) / 0.1);
      note = `${massMe.toFixed(2)} Earth masses: too light to keep an atmosphere.`;
    } else {
      points = c.max - c.penaltyPer1Above * (massMe - c.maxMe);
      note = `${massMe.toFixed(1)} Earth masses: gravity may be crushing.`;
    }
    return partial(points, c.max, note);
  }

  /* ===========================================================================
   * VARIABLE 7: STELLAR FLUX / INSOLATION (10 pts)
   * Measures how much energy the planet receives compared to Earth.
   * Units: S_Earth (Earth = 1.0). Habitable range: 0.35–1.75 S_Earth.
   * Outside that range: lose 1 pt per 0.1 S_Earth deviation.
   *
   * The raw value (pl_insol) comes from nasa-api.js which already fetches it.
   * ========================================================================= */
  function scoreStellarFlux(insolation) {
    const c = CONFIG.stellarFlux;
    // Use isMissing() for consistent null/undefined/NaN handling
    if (isMissing(insolation)) return neutral(c.max, "No insolation data: neutral score.");

    if (insolation >= c.minFlux && insolation <= c.maxFlux) {
      return full(c.max, `${insolation.toFixed(2)} S_Earth: inside the habitable flux range.`);
    }

    // How far outside the habitable band are we (in S_Earth units)?
    const fluxOut = insolation < c.minFlux
      ? c.minFlux - insolation
      : insolation - c.maxFlux;

    // Convert to "0.1 S_Earth steps" then apply per-step penalty.
    const points = c.max - c.penaltyPer01 * (fluxOut / 0.1);
    const direction = insolation < c.minFlux ? "too little" : "too much";
    return partial(points, c.max, `${insolation.toFixed(2)} S_Earth: ${direction} stellar flux.`);
  }

  /* ===========================================================================
   * VARIABLE 8: BIOSIGNATURE POTENTIAL (5 pts)
   * This is an ESTIMATE: it counts how many of {temperature, radius, mass} fall
   * inside their habitable ranges. 3 checks = 5 pts, 2 = 3, 1 = 1, 0 = 0.
   * ========================================================================= */
  function scoreBiosignature(tempK, radiusRe, massMe) {
    const c = CONFIG.biosignature;

    // A missing value simply can't "pass" its check.
    const tempOK   = !isMissing(tempK)   && tempK   >= CONFIG.temperature.minK && tempK   <= CONFIG.temperature.maxK;
    const radiusOK = !isMissing(radiusRe) && radiusRe >= CONFIG.radius.minRe    && radiusRe <= CONFIG.radius.maxRe;
    const massOK   = !isMissing(massMe)  && massMe  >= CONFIG.mass.minMe       && massMe  <= CONFIG.mass.maxMe;

    const criteriaMet = (tempOK ? 1 : 0) + (radiusOK ? 1 : 0) + (massOK ? 1 : 0);
    // FIX: c.pointsByCriteriaMet now exists in CONFIG.biosignature (was missing before)
    const points = c.pointsByCriteriaMet[criteriaMet];

    // We flag this as "defaulted" only if one of its inputs was missing, so the
    // estimate is known to be shaky (this does NOT count toward the red flag).
    const anyInputMissing = isMissing(tempK) || isMissing(radiusRe) || isMissing(massMe);

    return {
      points: points,
      max: c.max,
      defaulted: anyInputMissing,
      note: `${criteriaMet} of 3 habitability checks passed (temperature, radius, mass).`,
    };
  }

  /* ===========================================================================
   * CLASSIFY: turn a 0–100 score into a friendly tier + color name.
   * Used by the UI to color-code planets.
   * ========================================================================= */
  function classify(total) {
    if (total >= 70) return { tier: "Top Candidate",  level: "prime" };
    if (total >= 50) return { tier: "Good",           level: "promising" };
    if (total >= 30) return { tier: "Satisfactory",   level: "marginal" };
    return              { tier: "Very Unlikely",      level: "hostile" };
  }

  /* ===========================================================================
   * scorePlanet(planet): the main function
   * ---------------------------------------------------------------------------
   * Input: a "planet" object with these fields (any may be missing/null):
   *     {
   *       name, hostname,        // text labels
   *       temp,                  // equilibrium temperature in Kelvin
   *       radius,                // planet radius in Earth radii
   *       distance,              // distance from Earth in LIGHT-YEARS
   *       spectralType,          // host-star type, e.g. "M3 V"
   *       period,                // orbital period in days
   *       mass,                  // planet mass in Earth masses
   *       insolation,            // stellar flux in Earth-flux units (S_Earth)
   *     }
   *
   * Output: a result object the rest of the website can render:
   *     {
   *       name, hostname,
   *       total,                 // final score 0–100
   *       tier, level,           // e.g. "Good" / "promising"
   *       breakdown: [ ... ],    // one entry per variable (points, max, note, ...)
   *       coreDefaults,          // how many core variables were missing
   *       redFlag,               // true if too much data was missing
   *       completeness           // % of core data actually available (0–100)
   *     }
   * ========================================================================= */
  function scorePlanet(planet) {
    // Run every variable. The order here matches the paper (Variables 1–8).
    const v1    = scoreTemperature(planet.temp);
    const v2    = scoreRadius(planet.radius);
    const v3    = scoreDistance(planet.distance);
    const v4    = scoreStellar(planet.spectralType);
    const v5    = scoreTidal(planet.period);
    const v6    = scoreMass(planet.mass);
    // Variable 7: stellar flux
    const vFlux = scoreStellarFlux(planet.insolation);
    const v7    = scoreBiosignature(planet.temp, planet.radius, planet.mass);

    // A labeled list makes it easy for the UI to draw 8 progress bars.
    const breakdown = [
      Object.assign({ key: "temp",     label: "Equilibrium Temperature"    }, v1),
      Object.assign({ key: "radius",   label: "Planet Radius"              }, v2),
      Object.assign({ key: "distance", label: "Distance from Earth"        }, v3),
      Object.assign({ key: "stellar",  label: "Stellar Type"               }, v4),
      Object.assign({ key: "tidal",    label: "Tidal Lock Risk"            }, v5),
      Object.assign({ key: "mass",     label: "Planet Mass"                }, v6),
      Object.assign({ key: "flux",     label: "Stellar Flux / Insolation"  }, vFlux),
      Object.assign({ key: "biosig",   label: "Biosignature Potential"     }, v7),
    ];

    // Add up all the points and round to a whole number for the headline score.
    const rawTotal = breakdown.reduce(function (sum, v) { return sum + v.points; }, 0);
    const total = Math.round(rawTotal);

    // Count how many of the 7 CORE (directly-measured) variables were guessed.
    // Biosignature is excluded because it is always an estimate.
    // FIX: added vFlux to the core-variable list (was missing before)
    const coreVariables = [v1, v2, v3, v4, v5, v6, vFlux];
    const coreDefaults  = coreVariables.filter(function (v) { return v.defaulted; }).length;
    // FIX: CONFIG.redFlagWhenDefaultsAtLeast now exists in CONFIG (was undefined before)
    const redFlag       = coreDefaults >= CONFIG.redFlagWhenDefaultsAtLeast;
    const completeness  = Math.round(((coreVariables.length - coreDefaults) / coreVariables.length) * 100);

    const tierInfo = classify(total);

    return {
      name:        planet.name,
      hostname:    planet.hostname,
      total:       total,
      tier:        tierInfo.tier,
      level:       tierInfo.level,
      breakdown:   breakdown,
      coreDefaults: coreDefaults,
      redFlag:     redFlag,
      completeness: completeness,
    };
  }

  /* ---------------------------------------------------------------------------
   * PUBLIC API: the only things other files are allowed to use.
   * ------------------------------------------------------------------------- */
  return {
    scorePlanet: scorePlanet,
    classify:    classify,
    CONFIG:      CONFIG,
  };
})();

// Make it usable from Node.js too (handy if you ever want to write tests).
if (typeof module !== "undefined" && module.exports) {
  module.exports = ExoRankScoring;
}

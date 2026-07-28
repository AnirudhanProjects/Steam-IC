/* =============================================================================
 * ExoRank  —  gemini-api.js  —  AI COLONIZATION SUMMARY (Google Gemini)
 * =============================================================================
 *
 * WHAT THIS FILE DOES
 * -------------------
 * When you click a planet, this asks Google's Gemini AI to write a short, plain
 * English summary of that planet's colonization PROS and CONS, plus a one line
 * verdict. We feed Gemini both the raw NASA numbers AND the ExoRank score so its
 * answer is grounded in our data.
 *
 * HOW IT TALKS TO GEMINI
 * ----------------------
 * We send a POST request to the Generative Language API. We use a feature called
 * "structured output" (responseSchema) which forces Gemini to reply with clean
 * JSON shaped exactly like { verdict, pros[], cons[] } — no messy text parsing.
 *
 * Unlike NASA, Gemini DOES send CORS headers, so the browser can call it
 * directly (no proxy needed). The API key comes from config.js.
 *
 * We also keep a small cache so clicking the same planet twice doesn't waste a
 * second API call.
 * ========================================================================== */

const ExoRankGemini = (function () {
  "use strict";

  const API_ROOT = "https://generativelanguage.googleapis.com/v1beta/models/";
  const cache = {}; // planet name -> result, so we don't re-ask Gemini

  function cfg() {
    return window.EXORANK_CONFIG || {};
  }

  // Is a usable API key present? (Empty string or the placeholder = no.)
  function isEnabled() {
    const key = cfg().geminiApiKey;
    return typeof key === "string" && key.trim().length > 10;
  }

  /* ---------------------------------------------------------------------------
   * buildPrompt — write the instructions we send to Gemini.
   * We include the measured data and the ExoRank breakdown so the AI's pros/cons
   * line up with the score the user is looking at.
   * ------------------------------------------------------------------------- */
  function buildPrompt(planet, scoreResult) {
    const fmt = function (value, unit) {
      return value === null || value === undefined ? "unknown" : value + (unit || "");
    };

    // A compact list of how each variable scored, e.g. "Equilibrium Temperature: 20/25".
    const breakdownText = scoreResult.breakdown
      .map(function (v) { return "- " + v.label + ": " + v.points + "/" + v.max + " (" + v.note + ")"; })
      .join("\n");

    return (
      "You are an expert astrobiologist advising on human colonization of exoplanets. " +
      "Using ONLY the data below, write a short, factual, high-school-friendly assessment.\n\n" +
      "PLANET: " + planet.name + " (orbiting " + planet.hostname + ")\n" +
      "Measured data:\n" +
      "- Radius: " + fmt(planet.radius, " Earth radii") + "\n" +
      "- Mass: " + fmt(planet.mass, " Earth masses") + "\n" +
      "- Equilibrium temperature: " + fmt(planet.temp, " K") + "\n" +
      "- Orbital period: " + fmt(planet.period, " days") + "\n" +
      "- Distance from Earth: " + fmt(planet.distance ? planet.distance.toFixed(1) : null, " light-years") + "\n" +
      "- Host star type: " + fmt(planet.spectralType) + "\n\n" +
      "ExoRank colonization score: " + scoreResult.total + "/100 (" + scoreResult.tier + ")\n" +
      "Score breakdown:\n" + breakdownText + "\n\n" +
      "Write: (1) a one-sentence verdict, (2) 3-4 pros, (3) 3-4 cons. " +
      "If a value is 'unknown', you may note the uncertainty. Keep each point to one sentence."
    );
  }

  /* ---------------------------------------------------------------------------
   * summarizePlanet — main function the app calls. Returns:
   *   { ok: true,  verdict, pros: [...], cons: [...] }
   *   { ok: false, error: "..." }
   * ------------------------------------------------------------------------- */
  async function summarizePlanet(planet, scoreResult) {
    if (!isEnabled()) {
      return { ok: false, error: "No Gemini API key set in config.js — AI summary is off." };
    }

    // Return the cached answer if we already asked about this planet.
    if (cache[planet.name]) return cache[planet.name];

    const model = cfg().geminiModel || "gemini-2.5-flash";
    const url = API_ROOT + model + ":generateContent?key=" + encodeURIComponent(cfg().geminiApiKey);

    // The request body. responseSchema = force clean JSON back.
    const body = {
      contents: [{ parts: [{ text: buildPrompt(planet, scoreResult) }] }],
      generationConfig: {
        temperature: 0.7,
        responseMimeType: "application/json",
        responseSchema: {
          type: "object",
          properties: {
            verdict: { type: "string" },
            pros: { type: "array", items: { type: "string" } },
            cons: { type: "array", items: { type: "string" } },
          },
          required: ["verdict", "pros", "cons"],
        },
        // thinkingBudget 0 = answer immediately (faster, no "thinking" delay).
        thinkingConfig: { thinkingBudget: 0 },
      },
    };

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const detail = await response.text();
        throw new Error("Gemini HTTP " + response.status + ": " + detail.slice(0, 120));
      }

      const data = await response.json();
      // Dig the text out of Gemini's response envelope, then parse the JSON.
      const text = data.candidates[0].content.parts[0].text;
      const parsed = JSON.parse(text);

      const result = {
        ok: true,
        verdict: parsed.verdict || "",
        pros: parsed.pros || [],
        cons: parsed.cons || [],
      };
      cache[planet.name] = result; // remember it
      return result;
    } catch (err) {
      return { ok: false, error: "AI summary failed: " + err.message };
    }
  }

  return {
    summarizePlanet: summarizePlanet,
    isEnabled: isEnabled,
  };
})();

if (typeof module !== "undefined" && module.exports) {
  module.exports = ExoRankGemini;
}

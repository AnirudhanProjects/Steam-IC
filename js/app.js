/* =============================================================================
 * ExoRank · app.js · runs the website
 * =============================================================================
 *
 * This file connects the other modules:
 *   - draws the twinkling starfield background
 *   - starts the transit simulation (simulation.js)
 *   - scores every planet (scoring.js) and draws the ranking table
 *   - handles the "Fetch Live from NASA" button (nasa-api.js)
 *   - opens the planet pop-up with an AI briefing (gemini-api.js)
 *   - runs the "Score your own planet" form
 *
 * It is the last <script> in index.html, so the other modules (ExoRankScoring,
 * ExoRankData and so on) are already loaded when it runs.
 * ========================================================================== */

(function () {
  "use strict";

  /* ---------------------------------------------------------------------------
   * SHARED STATE: the current list of planets shown in the table.
   * Each item is { planet, score } where score comes from ExoRankScoring.
   * ------------------------------------------------------------------------- */
  const state = {
    rows: [],            // [{ planet, score }]
    source: "snapshot",  // "snapshot" or "live"
    sortBy: "score",
    search: "",
    pageSize: 30,        // how many rows to reveal per "See more" click
    visible: 30,         // how many rows are currently shown
  };

  // ---- tiny helpers --------------------------------------------------------
  const $ = function (sel, root) { return (root || document).querySelector(sel); };
  const $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  // Escape text before putting it into innerHTML (prevents broken/injected markup).
  function esc(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  // Squash a planet name to letters+digits so "Wolf 1069 b" matches "wolf1069b".
  // Used to match a planet from the URL hash even if spacing/case differs.
  function normName(name) { return String(name || "").toLowerCase().replace(/[^a-z0-9]/g, ""); }

  function fmtLy(d) { return d == null ? "—" : (d < 100 ? d.toFixed(1) : Math.round(d)) + " ly"; }
  function fmtRe(r) { return r == null ? "—" : r.toFixed(2) + " R⊕"; }

  // Turn a raw planet object into { planet, score }.
  function scoreAll(planetList) {
    return planetList.map(function (p) { return { planet: p, score: ExoRankScoring.scorePlanet(p) }; });
  }

  /* ===========================================================================
   * 1) STARFIELD BACKGROUND
   * ========================================================================= */
  function initStarfield() {
    const canvas = $("#starfield");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    let stars = [];

    function resize() {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // Spread stars across the viewport; density scales with screen size.
      const count = Math.min(180, Math.round((window.innerWidth * window.innerHeight) / 9000));
      stars = [];
      for (let i = 0; i < count; i++) {
        stars.push({
          x: Math.random() * window.innerWidth,
          y: Math.random() * window.innerHeight,
          r: Math.random() * 1.4 + 0.3,
          phase: Math.random() * Math.PI * 2,
          speed: Math.random() * 1.5 + 0.4,
        });
      }
    }

    function draw(t) {
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      for (const s of stars) {
        const twinkle = 0.5 + 0.5 * Math.sin(t / 1000 * s.speed + s.phase);
        ctx.globalAlpha = 0.25 + twinkle * 0.6;
        ctx.fillStyle = s.r > 1.1 ? "#bcd4ff" : "#ffffff";
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      requestAnimationFrame(draw);
    }

    window.addEventListener("resize", resize);
    resize();
    requestAnimationFrame(draw);
  }

  /* ===========================================================================
   * 2) RANKING TABLE
   * ========================================================================= */
  function getVisibleRows() {
    let rows = state.rows.slice();

    // Filter by the search box (matches planet name or host star).
    const term = state.search.trim().toLowerCase();
    if (term) {
      rows = rows.filter(function (r) {
        return (r.planet.name || "").toLowerCase().indexOf(term) !== -1 ||
               (r.planet.hostname || "").toLowerCase().indexOf(term) !== -1;
      });
    }

    // Sort.
    rows.sort(function (a, b) {
      if (state.sortBy === "name") return (a.planet.name || "").localeCompare(b.planet.name || "");
      if (state.sortBy === "distance") {
        return (a.planet.distance == null ? 1e9 : a.planet.distance) - (b.planet.distance == null ? 1e9 : b.planet.distance);
      }
      return b.score.total - a.score.total; // default: best score first
    });
    return rows;
  }

  function rowHTML(item, rank) {
    const p = item.planet, s = item.score;
    const refBadge = p.reference ? '<span class="ref">REF</span>' : "";
    const flag = s.redFlag
      ? '<span class="flag" title="Several values were missing from the archive, so this score is less reliable.">⚑</span>'
      : "";
    return (
      '<tr class="prow" data-name="' + esc(p.name) + '">' +
        '<td class="prow__rank">' + rank + "</td>" +
        '<td class="prow__name">' + esc(p.name) + refBadge + flag + "</td>" +
        '<td class="prow__host">' + esc(p.hostname || "—") + "</td>" +
        '<td class="prow__num">' + fmtLy(p.distance) + "</td>" +
        '<td class="prow__num">' + fmtRe(p.radius) + "</td>" +
        '<td>' +
          '<div class="scorecell">' +
            '<div class="scorecell__top">' +
              '<span class="scorecell__tier" data-level="' + s.level + '">' + esc(s.tier) + "</span>" +
              '<span class="scorecell__val" data-level="' + s.level + '">' + s.total + "</span>" +
            "</div>" +
            '<div class="scorebar"><div class="scorebar__fill" data-level="' + s.level + '" style="width:' + s.total + '%"></div></div>' +
          "</div>" +
        "</td>" +
      "</tr>"
    );
  }

  function renderTable() {
    const tbody = $("#planet-rows");
    const rows = getVisibleRows();
    if (!rows.length) {
      // Empty state: shown before any NASA data has been fetched.
      const msg = state.rows.length
        ? "No planets match your search."
        : 'No data loaded yet. Click <b>“⤓ Fetch Live from NASA”</b> above to pull exoplanets from the archive.';
      tbody.innerHTML = '<tr class="prow prow--empty"><td colspan="6" class="prow__empty">' + msg + "</td></tr>";
      updateSeeMore(0, 0);
      return;
    }
    // Only draw the first `state.visible` rows; the rest wait behind "See more".
    const shown = rows.slice(0, state.visible);
    tbody.innerHTML = shown.map(function (item, i) { return rowHTML(item, i + 1); }).join("");
    updateSeeMore(shown.length, rows.length);
  }

  // Show/update the "See more" button based on how many rows are hidden.
  function updateSeeMore(shownCount, totalCount) {
    const btn = $("#see-more");
    if (!btn) return;
    if (totalCount > shownCount) {
      const next = Math.min(state.pageSize, totalCount - shownCount);
      btn.hidden = false;
      btn.textContent = "See " + next + " more  ·  showing " + shownCount + " of " + totalCount;
    } else {
      btn.hidden = true;
    }
  }

  /* ===========================================================================
   * 3) SCORE BREAKDOWN (one bar per variable), used by both the pop-up and the manual form.
   * ========================================================================= */
  function breakdownHTML(score) {
    const bars = score.breakdown.map(function (v) {
      const pct = (v.points / v.max) * 100;
      return (
        '<div class="bd-row' + (v.defaulted ? " is-default" : "") + '">' +
          '<div class="bd-row__head">' +
            '<span class="bd-row__label">' + esc(v.label) + "</span>" +
            '<span class="bd-row__val">' + v.points + " / " + v.max + "</span>" +
          "</div>" +
          '<div class="bd-row__bar"><div class="bd-row__fill" style="width:' + pct + '%"></div></div>' +
        "</div>"
      );
    }).join("");
    return '<div class="breakdown">' + bars + "</div>";
  }

  /* ===========================================================================
   * 4) PLANET DETAIL MODAL (with AI briefing)
   * ========================================================================= */
  const modal = $("#planet-modal");
  const modalContent = $("#modal-content");

  function openModal(html) {
    modalContent.innerHTML = html;
    modal.hidden = false;
    document.body.style.overflow = "hidden";
  }
  // Just hide the modal box (no URL changes). Used by the hash sync below.
  function closeModalRaw() {
    modal.hidden = true;
    document.body.style.overflow = "";
  }
  // Close from the UI (× / backdrop / Esc): also strip the planet from the URL
  // so the address bar matches what's on screen.
  function closeModal() {
    if (planetNameFromHash()) {
      // Remove "#planet=..." (and any bare "#") without reloading the page.
      history.replaceState(null, "", window.location.pathname + window.location.search);
    }
    closeModalRaw();
  }
  $$("[data-close]", modal).forEach(function (el) { el.addEventListener("click", closeModal); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeModal(); });

  // "Copy link" button (inside the detail view): copies this planet's shareable
  // URL to the clipboard so you can drop it straight into a QR-code generator.
  modalContent.addEventListener("click", function (e) {
    const btn = e.target.closest("[data-copy-link]");
    if (!btn) return;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(window.location.href).then(function () {
        const label = btn.textContent;
        btn.textContent = "Copied!";
        setTimeout(function () { btn.textContent = label; }, 1500);
      });
    }
  });

  function detailHeaderHTML(item) {
    const p = item.planet, s = item.score;
    const flag = s.redFlag
      ? '<div class="detail__flag">⚑ ' + s.coreDefaults + ' of 7 core values were missing from the archive, so this score is an estimate. Data completeness: ' + s.completeness + '%.</div>'
      : "";
    return (
      '<p class="detail__host">' + esc(p.hostname || "Unknown star") + (p.reference ? " · REFERENCE WORLD" : "") + "</p>" +
      '<h2 class="detail__name" id="modal-name">' + esc(p.name) + "</h2>" +
      '<div class="detail__scorewrap">' +
        '<span class="detail__score" data-level="' + s.level + '">' + s.total + "</span>" +
        '<span class="detail__outof">/ 100</span>' +
        '<span class="detail__tier" data-level="' + s.level + '">' + esc(s.tier) + "</span>" +
      "</div>" +
      '<p class="detail__meta">' +
        "Radius " + fmtRe(p.radius) + " · Mass " + (p.mass == null ? "—" : p.mass + " M⊕") +
        " · Temp " + (p.temp == null ? "—" : p.temp + " K") + " · " + fmtLy(p.distance) +
      "</p>" +
      '<button class="btn btn--ghost btn--small" data-copy-link>Copy link</button>' +
      flag
    );
  }

  function aiSectionHTML(inner) {
    return '<div class="ai"><p class="ai__title">◈ AI COLONIZATION BRIEFING · GEMINI</p>' + inner + "</div>";
  }
  function aiResultHTML(ai) {
    const list = function (arr) { return arr.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join(""); };
    return (
      '<p class="ai__verdict">"' + esc(ai.verdict) + '"</p>' +
      '<div class="ai__cols">' +
        '<div class="ai__group pros"><h4>✓ Pros</h4><ul>' + list(ai.pros) + "</ul></div>" +
        '<div class="ai__group cons"><h4>✕ Cons</h4><ul>' + list(ai.cons) + "</ul></div>" +
      "</div>"
    );
  }

  async function openPlanetDetail(item) {
    const initialAI = ExoRankGemini.isEnabled()
      ? '<p class="ai__loading">Generating briefing</p>'
      : '<p class="ai__err">AI summary is off. Add a Gemini key in config.js to turn it on.</p>';
    openModal(detailHeaderHTML(item) + breakdownHTML(item.score) + aiSectionHTML(initialAI));

    if (!ExoRankGemini.isEnabled()) return;

    const ai = await ExoRankGemini.summarizePlanet(item.planet, item.score);
    const aiBox = $(".ai", modalContent);
    if (!aiBox) return; // user closed the modal before it finished
    aiBox.innerHTML = '<p class="ai__title">◈ AI COLONIZATION BRIEFING · GEMINI</p>' +
      (ai.ok ? aiResultHTML(ai) : '<p class="ai__err">' + esc(ai.error) + "</p>");
  }

  /* ===========================================================================
   * 4b) URL DEEP-LINKING  (shareable / QR-code-able planet links)
   * ---------------------------------------------------------------------------
   * The address bar is the single source of truth for which planet is open:
   *   - Clicking a planet writes "#planet=<name>" into the URL.
   *   - The "hashchange" listener notices and opens the matching planet.
   *   - Closing the modal removes the hash again.
   * So every planet has its own link. Put that link in a QR code and scanning it
   * reopens that exact planet (the data is loaded first, see boot()).
   * ========================================================================= */

  // Read the planet name out of the URL hash (or null if there isn't one).
  function planetNameFromHash() {
    const match = (window.location.hash || "").match(/planet=([^&]+)/);
    return match ? decodeURIComponent(match[1]) : null;
  }

  // Write a planet into the URL. Changing the hash triggers "hashchange" below.
  function setPlanetHash(name) {
    window.location.hash = "planet=" + encodeURIComponent(name);
  }

  // Find a scored row by name (loose match so "Wolf 1069 b" == "wolf1069b").
  function findRowByName(name) {
    const key = normName(name);
    return state.rows.find(function (r) { return normName(r.planet.name) === key; }) || null;
  }

  // Open whatever planet the URL points at, or close the modal if none.
  function syncModalToHash() {
    const name = planetNameFromHash();
    if (!name) { closeModalRaw(); return; }
    const item = findRowByName(name);
    if (item) openPlanetDetail(item);
    else $("#status-line").textContent =
      'Could not find "' + name + '" in the loaded data. Try "Fetch Live from NASA".';
  }

  function initDeepLinking() {
    // React to the address bar changing: planet clicks, Back/Forward, scanned QR.
    window.addEventListener("hashchange", syncModalToHash);
  }

  // Click a table row -> put that planet in the URL (which opens it via hashchange).
  $("#planet-rows").addEventListener("click", function (e) {
    const tr = e.target.closest(".prow");
    if (!tr || tr.classList.contains("prow--empty")) return; // ignore the placeholder row
    setPlanetHash(tr.getAttribute("data-name"));
  });

  /* ===========================================================================
   * 5) LIVE NASA FETCH
   * ========================================================================= */
  // Fetch planets from NASA into the table, falling back to the bundled snapshot
  // if the live request fails. Resolves once the table has been re-rendered, so
  // callers can safely open a planet afterward (used by the deep-link path).
  async function loadFromNasa() {
    const badge = $("#source-badge");
    const status = $("#status-line");
    const result = await ExoRankNASA.fetchLivePlanets();

    if (result.ok && result.planets.length) {
      state.rows = scoreAll(result.planets);
      state.visible = state.pageSize; // start fresh at the first page of 30
      state.source = "live";
      badge.dataset.source = "live";
      badge.textContent = "LIVE · NASA";
      status.textContent = "Loaded " + result.planets.length + " planets live from NASA (" + result.source + "). Click any planet for details.";
    } else {
      // Live fetch failed (no internet / proxy down). Fall back to the bundled
      // snapshot so the table is never left blank during a live demo.
      const snapshot = [ExoRankData.EARTH].concat(ExoRankData.PLANETS);
      state.rows = scoreAll(snapshot);
      state.visible = state.pageSize; // start fresh at the first page of 30
      state.source = "snapshot";
      badge.dataset.source = "snapshot";
      badge.textContent = "ARCHIVE SNAPSHOT";
      status.textContent = (result.error || "Live fetch failed.") +
        " Showing the built-in archive snapshot (" + ExoRankData.PLANETS.length + " planets) instead.";
    }
    renderTable();
  }

  function initNasaButton() {
    const btn = $("#fetch-nasa");
    btn.addEventListener("click", async function () {
      btn.disabled = true;
      const original = btn.textContent;
      btn.textContent = "Contacting NASA…";
      $("#status-line").textContent = "Requesting live data from the NASA Exoplanet Archive…";
      await loadFromNasa();
      btn.disabled = false;
      btn.textContent = original;
    });
  }

  /* ===========================================================================
   * 6) MANUAL "SCORE YOUR OWN PLANET" FORM
   * ========================================================================= */
  function initManualForm() {
    const form = $("#manual-form");
    const out = $("#manual-result");

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      const data = new FormData(form);
      // Empty input -> undefined, so scoring.js treats it as "missing data".
      const num = function (key) {
        const v = data.get(key);
        return v === "" || v == null ? undefined : Number(v);
      };
      const planet = {
        name: data.get("name") || "Custom Planet",
        hostname: "Custom system",
        temp: num("temp"),
        radius: num("radius"),
        mass: num("mass"),
        distance: num("distance"),
        period: num("period"),
        insolation: num("insolation"),   // stellar flux, scored by scoreStellarFlux()
        spectralType: data.get("spectralType") || null,
      };
      const score = ExoRankScoring.scorePlanet(planet);
      const item = { planet: planet, score: score };

      out.innerHTML =
        '<div class="detail__scorewrap">' +
          '<span class="detail__score" data-level="' + score.level + '">' + score.total + "</span>" +
          '<span class="detail__outof">/ 100</span>' +
          '<span class="detail__tier" data-level="' + score.level + '">' + esc(score.tier) + "</span>" +
        "</div>" +
        (score.redFlag ? '<div class="detail__flag">⚑ ' + score.coreDefaults + " of 7 core values were left blank, so neutral scores were used.</div>" : "") +
        breakdownHTML(score) +
        (ExoRankGemini.isEnabled() ? '<button class="btn btn--ghost btn--small" id="manual-ai">◈ Generate AI Briefing</button>' : "");

      const aiBtn = $("#manual-ai", out);
      if (aiBtn) {
        aiBtn.addEventListener("click", async function () {
          aiBtn.outerHTML = aiSectionHTML('<p class="ai__loading">Generating briefing</p>');
          const ai = await ExoRankGemini.summarizePlanet(planet, score);
          const aiBox = $(".ai", out);
          if (aiBox) {
            aiBox.innerHTML = '<p class="ai__title">◈ AI COLONIZATION BRIEFING · GEMINI</p>' +
              (ai.ok ? aiResultHTML(ai) : '<p class="ai__err">' + esc(ai.error) + "</p>");
          }
        });
      }
    });
  }

  /* ===========================================================================
   * 8) WIRE UP CONTROLS + BOOT
   * ========================================================================= */
  function initControls() {
    // Searching narrows the list, so jump back to the first page of 30.
    $("#search").addEventListener("input", function (e) {
      state.search = e.target.value;
      state.visible = state.pageSize;
      renderTable();
    });
    $("#sort").addEventListener("change", function (e) { state.sortBy = e.target.value; renderTable(); });
    // "See more" reveals the next 30 rows each click.
    const seeMore = $("#see-more");
    if (seeMore) seeMore.addEventListener("click", function () {
      state.visible += state.pageSize;
      renderTable();
    });
  }

  async function boot() {
    initStarfield();

    // Start the transit simulation if its container is present.
    const simRoot = $("#transit-sim");
    if (simRoot && typeof ExoRankSim !== "undefined") ExoRankSim.init(simRoot);

    // Start with an empty table: nothing shows until the user pulls data
    // from NASA. (renderTable draws a friendly "click Fetch" placeholder.)
    state.rows = [];
    renderTable();

    initControls();
    initNasaButton();
    initManualForm();
    initDeepLinking();

    // If the page was opened with a shared/QR link (e.g. "#planet=Wolf%201069%20b"),
    // load the data automatically and pop that planet open. Otherwise just wait
    // for the user to press "Fetch Live from NASA".
    if (planetNameFromHash()) {
      const btn = $("#fetch-nasa");
      const original = btn.textContent;
      btn.disabled = true;
      btn.textContent = "Contacting NASA…";
      $("#status-line").textContent = "Opening a shared planet link, loading data…";
      await loadFromNasa();
      btn.disabled = false;
      btn.textContent = original;
      syncModalToHash(); // data is ready, now open the planet named in the URL
    } else {
      $("#status-line").textContent =
        'Click "Fetch Live from NASA" to load the latest exoplanet data.';
    }
  }

  // Run once the page's HTML is ready.
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();

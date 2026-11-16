/* =============================================================================
 * ExoRank · simulation.js · the transit photometry demo
 * =============================================================================
 *
 * What it shows
 * -------------
 * Transit photometry finds planets by watching a star dim as a planet crosses in
 * front of it. Big planets block a lot of light and are easy to detect.
 * Earth-sized planets block almost none, so today's instruments often miss them.
 * That size bias is why ExoRank leans on four other detection methods.
 *
 * How the animation works
 * -----------------------
 * A rotating arm spins around the star, with the two planets 180° apart:
 *
 *        Hot Jupiter ----------[ STAR ]---------- Earth-like
 *
 * Whichever planet is on the right passes between the star and the sensor (a
 * "transit"). Because the planets sit on opposite ends of the arm, the demo
 * cycles through three states:
 *
 *     1. BASELINE ........ arm vertical, nobody in front  -> signal 100%, WAITING
 *     2. JUPITER PASSES .. big planet on the right         -> signal ~30%, DETECTED
 *     3. EARTH PASSES .... tiny planet on the right        -> signal ~99%, MISSED
 *
 * The dip comes from each planet's real position (how centered it is on the
 * beam), so the light curve follows the geometry. The visual dip is exaggerated
 * so you can see it; the real numbers (1.02% vs 0.0084%) are in the math box on
 * the page.
 *
 * It draws on two <canvas> elements from index.html:
 *     .sim__stage  -> the star, arm, planets and sensor
 *     .sim__curve  -> the scrolling light-curve graph
 * and updates two LCD readouts ([data-signal] and [data-status]).
 * ========================================================================== */

const ExoRankSim = (function () {
  "use strict";

  // ---- Tunable look & behavior --------------------------------------------
  const DETECTION_THRESHOLD = 0.05; // a dip bigger than 5% counts as "detected"
  const ORBIT_SECONDS = 9;          // seconds for the arm to complete one spin

  // The two planets riding the arm. maxDip = how much light each blocks at the
  // deepest point of its transit (exaggerated for visibility).
  const JUPITER = { label: "Hot Jupiter", color: "#ff9d3c", glow: "#ff7b00", radius: 30, maxDip: 0.70 };
  const EARTH   = { label: "Earth-like planet", color: "#54b9ff", glow: "#1e90ff", radius: 6, maxDip: 0.01 };

  const COLORS = {
    bg: "#05070f",
    star: "#fff4d6",
    starGlow: "#ffd76a",
    beam: "#ffe89c",
    orbit: "rgba(120,150,210,0.20)",
    arm: "rgba(160,185,235,0.55)",
    sensorBody: "#0e1626",
    sensorEdge: "#33476b",
    eyeOn: "#39f08a",
    eyeOff: "#5a1620",
    curveLine: "#54b9ff",
    curveGrid: "rgba(120,150,210,0.15)",
    text: "#cdd8f0",
  };

  // ---- Internal state ------------------------------------------------------
  let root, stage, curve, stageCtx, curveCtx;
  let signalEl, statusEl, passEl, mathJ, mathE;
  let angle = -Math.PI / 2;     // start with the arm vertical (baseline)
  let lastTime = 0;
  let running = true;
  const curveBuf = [];          // rolling history of signal values for the graph
  const CURVE_MAX = 240;

  // Crisp rendering on high-DPI screens: size the backing store to devicePixelRatio.
  function fitCanvas(canvas, ctx) {
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); // 1 unit = 1 CSS pixel
    return { w: w, h: h };
  }

  /* ---------------------------------------------------------------------------
   * planetState: given the arm angle for ONE planet, work out where it is and
   * how much light it is currently blocking.
   * ------------------------------------------------------------------------- */
  function planetState(angleP, planet, geo) {
    const px = geo.starX + geo.rOrbit * Math.cos(angleP);
    const py = geo.starY + geo.rOrbit * Math.sin(angleP);
    const inFront = px > geo.starX;                 // between the star and the sensor?
    const yOff = Math.abs(py - geo.starY);          // distance from the beam line
    const span = geo.starR + planet.radius;         // how wide the crossing window is

    let profile = 0; // 0 = not crossing, 1 = perfectly centered on the beam
    if (inFront && yOff < span) {
      const t = 1 - yOff / span;
      profile = t * t * (3 - 2 * t); // smoothstep -> a nice rounded U-dip
    }
    return { px: px, py: py, inFront: inFront, profile: profile, drop: planet.maxDip * profile };
  }

  /* ---------------------------------------------------------------------------
   * computeFrame: the physics for this moment: positions, signal %, status.
   * ------------------------------------------------------------------------- */
  function computeFrame(geo) {
    const jup = planetState(angle, JUPITER, geo);            // Jupiter on one end...
    const ear = planetState(angle + Math.PI, EARTH, geo);    // ...Earth on the other

    const drop = jup.drop + ear.drop; // only one is ever in front, so this is safe
    const signal = (1 - drop) * 100;

    const jupCrossing = jup.inFront && jup.profile > 0.02;
    const earCrossing = ear.inFront && ear.profile > 0.02;

    let status = "WAITING";
    let passing = null;
    if (jupCrossing || earCrossing) {
      status = drop >= DETECTION_THRESHOLD ? "DETECTED" : "MISSED";
      passing = jupCrossing ? JUPITER.label : EARTH.label;
    }
    const eyeOn = drop < DETECTION_THRESHOLD; // sensor "blinded" only by a big dip

    return { jup: jup, ear: ear, drop: drop, signal: signal, status: status, passing: passing, eyeOn: eyeOn };
  }

  // ---- Drawing helpers -----------------------------------------------------

  function drawBackground(ctx, w, h) {
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, w, h);
    // A sprinkle of faint background stars (deterministic so they don't flicker).
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    for (let i = 0; i < 60; i++) {
      const x = (i * 137.5) % w;
      const y = (i * 89.3) % h;
      const s = (i % 3 === 0) ? 1.4 : 0.7;
      ctx.fillRect(x, y, s, s);
    }
  }

  function drawStar(ctx, geo, time) {
    // Gentle pulse so the star feels alive.
    const pulse = 1 + Math.sin(time * 2.5) * 0.04;
    const r = geo.starR * pulse;
    const glow = ctx.createRadialGradient(geo.starX, geo.starY, r * 0.2, geo.starX, geo.starY, r * 2.6);
    glow.addColorStop(0, COLORS.starGlow);
    glow.addColorStop(1, "rgba(255,215,106,0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(geo.starX, geo.starY, r * 2.6, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = COLORS.star;
    ctx.beginPath();
    ctx.arc(geo.starX, geo.starY, r, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawBeam(ctx, geo, frame) {
    // Light beam from the star to the sensor. If a planet is in front, the part
    // of the beam BEYOND it dims by the same fraction the signal dropped.
    const y = geo.starY;
    const startX = geo.starX + geo.starR;
    const endX = geo.sensorX - geo.sensorW / 2;
    const front = frame.jup.inFront ? frame.jup : (frame.ear.inFront ? frame.ear : null);
    const splitX = front ? front.px : endX;

    ctx.lineWidth = 4;
    ctx.lineCap = "round";
    // Bright segment: star -> planet
    ctx.strokeStyle = "rgba(255,232,156,0.9)";
    ctx.beginPath();
    ctx.moveTo(startX, y);
    ctx.lineTo(Math.min(splitX, endX), y);
    ctx.stroke();
    // Dimmed segment: planet -> sensor
    if (front && splitX < endX) {
      ctx.strokeStyle = "rgba(255,232,156," + (0.9 * (1 - frame.drop)) + ")";
      ctx.beginPath();
      ctx.moveTo(splitX, y);
      ctx.lineTo(endX, y);
      ctx.stroke();
    }
  }

  function drawOrbitAndArm(ctx, geo, frame) {
    // Faint orbit circle.
    ctx.strokeStyle = COLORS.orbit;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(geo.starX, geo.starY, geo.rOrbit, 0, Math.PI * 2);
    ctx.stroke();

    // The arm: a straight line through the star connecting the two planets.
    ctx.strokeStyle = COLORS.arm;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(frame.jup.px, frame.jup.py);
    ctx.lineTo(frame.ear.px, frame.ear.py);
    ctx.stroke();
  }

  function drawPlanet(ctx, x, y, planet, behindStar) {
    // Planets behind the star (left side) are drawn faded, as if occulted.
    ctx.globalAlpha = behindStar ? 0.25 : 1;
    const g = ctx.createRadialGradient(x - planet.radius * 0.3, y - planet.radius * 0.3, 1, x, y, planet.radius);
    g.addColorStop(0, planet.color);
    g.addColorStop(1, planet.glow);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, planet.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  function drawSensor(ctx, geo, frame) {
    const x = geo.sensorX, y = geo.sensorY, w = geo.sensorW, h = geo.sensorW * 1.4;
    ctx.fillStyle = COLORS.sensorBody;
    ctx.strokeStyle = COLORS.sensorEdge;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.rect(x - w / 2, y - h / 2, w, h);
    ctx.fill();
    ctx.stroke();

    // The "eye" LED: green when it sees light, dark-red when blocked.
    const eyeColor = frame.eyeOn ? COLORS.eyeOn : COLORS.eyeOff;
    if (frame.eyeOn) {
      ctx.shadowColor = COLORS.eyeOn;
      ctx.shadowBlur = 14;
    }
    ctx.fillStyle = eyeColor;
    ctx.beginPath();
    ctx.arc(x, y, w * 0.22, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.fillStyle = COLORS.text;
    ctx.font = "11px ui-monospace, monospace";
    ctx.textAlign = "center";
    ctx.fillText("SENSOR", x, y + h / 2 + 16);
  }

  function renderStage(time) {
    const { w, h } = fitCanvas(stage, stageCtx);
    const geo = {
      starX: w * 0.17, starY: h * 0.44,
      starR: Math.min(h * 0.15, 60),
      sensorX: w * 0.9, sensorY: h * 0.44, sensorW: Math.min(w * 0.05, 34),
    };
    geo.rOrbit = (geo.sensorX - geo.starX) * 0.5;

    const frame = computeFrame(geo);

    drawBackground(stageCtx, w, h);
    drawOrbitAndArm(stageCtx, geo, frame);
    drawBeam(stageCtx, geo, frame);
    // Draw the back planet first, then the star, then the front planet on top.
    if (frame.jup.inFront) {
      drawPlanet(stageCtx, frame.ear.px, frame.ear.py, EARTH, true);
      drawStar(stageCtx, geo, time);
      drawPlanet(stageCtx, frame.jup.px, frame.jup.py, JUPITER, false);
    } else {
      drawPlanet(stageCtx, frame.jup.px, frame.jup.py, JUPITER, true);
      drawStar(stageCtx, geo, time);
      drawPlanet(stageCtx, frame.ear.px, frame.ear.py, EARTH, false);
    }
    drawBeam(stageCtx, geo, frame); // redraw beam over star edge for a clean exit
    drawSensor(stageCtx, geo, frame);

    return frame;
  }

  function renderCurve() {
    const { w, h } = fitCanvas(curve, curveCtx);
    curveCtx.fillStyle = "rgba(5,7,15,0.9)";
    curveCtx.fillRect(0, 0, w, h);

    // Horizontal grid lines at 0%, 50%, 100% of brightness.
    curveCtx.strokeStyle = COLORS.curveGrid;
    curveCtx.lineWidth = 1;
    [0.0, 0.5, 1.0].forEach(function (frac) {
      const y = 6 + frac * (h - 12);
      curveCtx.beginPath();
      curveCtx.moveTo(0, y);
      curveCtx.lineTo(w, y);
      curveCtx.stroke();
    });

    // Plot the rolling signal history. 100% near the top, dips go downward.
    curveCtx.strokeStyle = COLORS.curveLine;
    curveCtx.lineWidth = 2;
    curveCtx.beginPath();
    for (let i = 0; i < curveBuf.length; i++) {
      const x = (i / (CURVE_MAX - 1)) * w;
      const signalFrac = curveBuf[i] / 100;          // 1.0 = full brightness
      const y = 6 + (1 - signalFrac) * (h - 12);
      if (i === 0) curveCtx.moveTo(x, y);
      else curveCtx.lineTo(x, y);
    }
    curveCtx.stroke();
  }

  function updateReadouts(frame) {
    if (signalEl) signalEl.textContent = frame.signal.toFixed(1) + "%";
    if (statusEl) {
      statusEl.textContent = frame.status;
      statusEl.dataset.state = frame.status.toLowerCase(); // CSS colors by state
    }
    if (passEl) passEl.textContent = frame.passing ? "NOW PASSING: " + frame.passing : " ";
    // Highlight the matching row in the math box.
    if (mathJ) mathJ.classList.toggle("is-active", frame.passing === JUPITER.label);
    if (mathE) mathE.classList.toggle("is-active", frame.passing === EARTH.label);
  }

  // ---- Main loop -----------------------------------------------------------
  function tick(timestampMs) {
    const time = timestampMs / 1000;
    if (!lastTime) lastTime = time;
    const dt = Math.min(time - lastTime, 0.05); // clamp so tab-switches don't jump
    lastTime = time;

    if (running) {
      angle += (dt / ORBIT_SECONDS) * Math.PI * 2;
      if (angle > Math.PI * 4) angle -= Math.PI * 4; // keep the number small
    }

    const frame = renderStage(time);

    // Record the signal for the graph (only advance the trace while running).
    if (running) {
      curveBuf.push(frame.signal);
      if (curveBuf.length > CURVE_MAX) curveBuf.shift();
    }
    renderCurve();
    updateReadouts(frame);

    requestAnimationFrame(tick);
  }

  /* ---------------------------------------------------------------------------
   * init: wire the simulation to the page. Pass the container element that
   * holds .sim__stage, .sim__curve, [data-signal], [data-status], etc.
   * ------------------------------------------------------------------------- */
  function init(rootEl) {
    root = rootEl;
    stage = root.querySelector(".sim__stage");
    curve = root.querySelector(".sim__curve");
    if (!stage || !curve) return; // the page has no simulation, so do nothing
    stageCtx = stage.getContext("2d");
    curveCtx = curve.getContext("2d");
    signalEl = root.querySelector("[data-signal]");
    statusEl = root.querySelector("[data-status]");
    passEl = root.querySelector("[data-passing]");
    mathJ = root.querySelector('[data-math="jupiter"]');
    mathE = root.querySelector('[data-math="earth"]');

    // Pre-fill the graph with a flat 100% baseline so it looks settled at start.
    for (let i = 0; i < CURVE_MAX; i++) curveBuf.push(100);

    // Optional play/pause button.
    const toggle = root.querySelector("[data-sim-toggle]");
    if (toggle) {
      toggle.addEventListener("click", function () {
        running = !running;
        toggle.textContent = running ? "Pause" : "Play";
        toggle.setAttribute("aria-pressed", String(!running));
      });
    }

    // Redraw immediately on resize so it stays sharp and correctly laid out.
    window.addEventListener("resize", function () { renderStage(lastTime); renderCurve(); });

    requestAnimationFrame(tick);
  }

  return { init: init };
})();

if (typeof module !== "undefined" && module.exports) {
  module.exports = ExoRankSim;
}

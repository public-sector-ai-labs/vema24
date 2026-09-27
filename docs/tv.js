/* R/V Vema · Voyage 24 · 1967 — TV mode behaviour.
   Loaded only in TV mode (?tv, which the Fire TV app opens); the website never loads this file.
   index.html calls the functions in TVX at a few marked places ("TV hook"); everything else is shared.

   - Home view: the whole chart sheet, printed title included, filling a 16:9 screen, standing still.
   - ▲ ▼ zoom in steps from the whole sheet to a close-up; zoomed in, the view follows the ship but
     never runs past the paper.
   - One ship: the chart prints 60°E–100°E at both ends. The ship and her track use the left copy as
     she comes in from Australia; at the chart's 60°E edge she reappears at the right-hand 60°E line.
   - The card sits inside the chart border, in the top corner away from the ship.
   - Controls slide up on any remote button and hide again after 8 seconds.
   - 4K: tiles are fetched to match the real screen pixels (a 4K Fire TV draws 4 pixels per CSS pixel). */
"use strict";

TVX = (function () {
  /* The home view, measured on the chart (frame longitude: 60 = 60°E ... 460 = 100°E):
     the title, the border, the degree scales and a little paper round them, cropped to exactly 16:9. */
  const HOME = { lonW: 32, lonE: 481.321, latN: 81.467, latS: -71.509 };
  const BORDER = { lonW: 60, lonE: 460, latN: 78, latS: -69 };   // the printed frame lines
  const EDGE = 60;          // one ship: frame longitude runs EDGE .. EDGE+360
  const UI_MS = 8000;

  let levels = [], li = 0, homeB = null, flying = false, lastCopy = null, side = "right", uiTimer = 0;

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const dpr = devicePixelRatio || 1;

  function computeLevels() {
    homeB = L.latLngBounds(ll(HOME.lonW, HOME.latS), ll(HOME.lonE, HOME.latN));
    const home = map.getBoundsZoom(homeB, true);          // the sheet covers the whole screen
    const zMax = NZ - HD + 1;                              // at most 2 screen pixels per chart pixel
    levels = [home];
    for (let z = home + 1; z < zMax - 0.3; z += 1) levels.push(z);
    if (zMax > home + 0.3) levels.push(zMax);
    // set the limits directly: setMinZoom() would start a zoom animation that overrides the view set next
    map.options.minZoom = home - 0.01; map.options.maxZoom = zMax + 0.01;
    li = clamp(li, 0, levels.length - 1);
    placeCard();
  }

  /* keep a view centre inside the home sheet at zoom z */
  function inside(latlng, z) {
    const p = map.project(latlng, z), a = map.project(homeB.getNorthWest(), z), b = map.project(homeB.getSouthEast(), z);
    const h = map.getSize().divideBy(2);
    const x = b.x - a.x <= 2 * h.x ? (a.x + b.x) / 2 : clamp(p.x, a.x + h.x, b.x - h.x);
    const y = b.y - a.y <= 2 * h.y ? (a.y + b.y) / 2 : clamp(p.y, a.y + h.y, b.y - h.y);
    return map.unproject([x, y], z);
  }
  const shipLL = () => { const s = state(ui.t); return ll(copies(s.lon)[0], s.lat); };
  function go(z, animate) {
    const c = li === 0 ? homeB.getCenter() : inside(shipLL(), z);
    if (!animate) { map.setView(c, z, { animate: false }); return; }
    flying = true;
    map.flyTo(c, z, { duration: .9 });
    map.once("moveend", () => { flying = false; });
  }

  /* the card goes just inside the printed border (measured at the home view) */
  function placeCard() {
    const z = levels[0], o = map.project(homeB.getNorthWest(), z);
    const tl = map.project(ll(BORDER.lonW, BORDER.latN), z).subtract(o), br = map.project(ll(BORDER.lonE, BORDER.latS), z).subtract(o);
    const W = innerWidth, g = W * 0.012;
    const r = document.documentElement.style;
    r.setProperty("--card-top", `${Math.round(tl.y + g)}px`);
    r.setProperty("--card-side", `${Math.round(Math.max(tl.x, W - br.x) + g)}px`);
  }
  function setSide(want, instant) {
    if (want === side) return;
    side = want;
    if (instant) { document.body.classList.toggle("card-left", side === "left"); return; }
    document.body.classList.add("card-moving");                        // fade out, move, fade in
    setTimeout(() => { document.body.classList.toggle("card-left", side === "left"); document.body.classList.remove("card-moving"); }, 600);
  }

  function copies(Lc) { return [((Lc - EDGE) % 360 + 360) % 360 + EDGE]; }

  function showUI(ms) {
    document.body.classList.add("show-ui"); clearTimeout(uiTimer);
    uiTimer = setTimeout(() => document.body.classList.remove("show-ui"), ms || UI_MS);
  }
  function measureUI() { document.body.style.setProperty("--tl-h", `${$("timeline").offsetHeight}px`); }

  return {
    /* 4K: fetch tiles 2 levels up when the screen has 4 pixels per CSS pixel (?sd turns it off) */
    tileBoost: Q.has("sd") ? 0 : clamp(Math.round(Math.log2(dpr)), 0, 2),
    mapOptions: { zoomSnap: 0, zoomDelta: 1, inertia: false },
    tileOptions: { keepBuffer: 1 },
    trackFrame: [EDGE, EDGE + 360],
    copies,
    showUI,

    setupMap() {
      document.documentElement.style.background = CT.background || "#e8c88e";   // behind the burn-in nudge
      computeLevels();
    },
    start() {
      ui.follow = true;
      li = clamp(store.get("tvlevel", 0), 0, levels.length - 1);
      go(levels[li], false);
    },
    ready() {
      $("scr").textContent = ` · screen ${Math.round(innerWidth * dpr)}×${Math.round(innerHeight * dpr)}`;
      measureUI(); showUI(10000);
      document.addEventListener("pointermove", () => showUI());
      // nudge everything a few pixels every minute so nothing burns into the screen
      setInterval(() => { const a = Date.now() / 60000;
        document.body.style.transform = `translate(${Math.round(Math.sin(a) * 4)}px, ${Math.round(Math.cos(a * .7) * 3)}px)`; }, 60000);
    },
    onResize() { measureUI(); computeLevels(); go(levels[li], false); },

    /* called for every frame with the ship's frame longitude */
    onShip(s, Lx) {
      if (Lx == null) return;
      const first = lastCopy == null, here = ll(Lx, s.lat), jumped = !first && Math.abs(Lx - lastCopy) > 180;
      lastCopy = Lx;
      if (jumped) {
        const el = shipMarkers[0].getElement();
        if (el && el.animate) el.animate([{ opacity: 0 }, { opacity: 0 }, { opacity: 1 }], { duration: 1400 });
      }
      if (li > 0 && !flying) {
        const target = inside(here, map.getZoom()), d = map.latLngToContainerPoint(target).distanceTo(map.latLngToContainerPoint(map.getCenter()));
        if (jumped || d > innerWidth * .6) { flying = true; map.flyTo(target, map.getZoom(), { duration: 1.4 }); map.once("moveend", () => { flying = false; }); }
        else if (d > 1.5) map.panTo(target, { animate: false });
      }
      // card in the top corner away from the ship (with a margin so it doesn't flip back and forth)
      const fx = map.latLngToContainerPoint(here).x / innerWidth;
      if (first) setSide(fx > .5 ? "left" : "right", true);
      else if (fx > .58) setSide("left"); else if (fx < .42) setSide("right");
    },

    zoom(dz) {
      const n = clamp(li + dz, 0, levels.length - 1);
      if (n === li) return;
      li = n; store.set("tvlevel", li);
      go(levels[li], true);
      toast(li === 0 ? "<b>The whole chart</b>" : `Zoom <b>${li}</b> of ${levels.length - 1}`, 1400);
    }
  };
})();

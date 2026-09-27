/* R/V Vema · Voyage 24 · 1967 — the Scientific Log and the narration.
   Loaded by index.html on the website and the TV. Everything here is optional: without data/log.json
   there are no station marks, and without audio/clips.json no narration; the rest of the page is unchanged.

   Station marks: every usable log entry is a small dot on the track at the moment it was logged, and
     appears as the ship reaches it (coloured by kind of work; the day's notable ones a little larger).
   Captions: log entries and narration show as a caption at the bottom of the map.
   Narration (audio/clips.json, made by clipmaker) plays to suit the speed:
     real time          everything, at the moment it happened
     1 hour per second  the morning and evening lines, departures and arrivals, events, the best entries
     1 day / 1 week     departures and arrivals, events (and at 1 day/s the best entries), and the
                        time-lapse waits while each one plays, like a guided tour
   Sound: on by default on the TV; on the website a speaker button turns it on (browsers need a tap). */
"use strict";

LOG = (function () {
  const TYPE_COLOR = {
    "core": "#8b4a2b", "core camera": "#8b4a2b", "dredge": "#8b4a2b",
    "t-grad": "#c0392b", "camera": "#5b4bb7",
    "water barrel": "#1f6f8c", "nephelometer": "#1f6f8c", "millipore": "#1f6f8c", "bt": "#1f6f8c", "current meter": "#1f6f8c",
    "bio": "#2e7d4f", "jet net": "#2e7d4f",
    "sonobuoy": "#a0740b", "srp": "#a0740b", "other": "#5a5a5a"};
  const TYPE_NAME = {"core": "Piston core", "core camera": "Camera on the corer", "dredge": "Dredge", "t-grad": "Heat flow",
    "camera": "Bottom camera", "water barrel": "Water sampler", "nephelometer": "Nephelometer", "millipore": "Filter sample",
    "bt": "Bathythermograph", "current meter": "Current meter", "bio": "Plankton tow", "jet net": "Jet net",
    "sonobuoy": "Sonobuoy", "srp": "Seismic refraction", "other": "Station"};
  const KIND_LABEL = {daily: "Good morning", daysum: "The day's work", leg: "From the voyage log", event: "",
    highlight: "From the Scientific Log", intro: ""};
  const PRIORITY = {leg: 5, event: 4, intro: 4, daysum: 3, daily: 2, highlight: 1};

  let entries = [], times = [], dots = [], shown = 0;          // log entries and their map marks
  let clips = [], clipTimes = [];                               // narration
  let queue = [], cur = null, holding = false, sound = false, lastPanel = 0, capTimer = 0;
  const audio = new Audio();
  audio.preload = "auto";

  const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  async function getOpt(p) { try { const r = await fetch(p, { cache: "no-cache" }); return r.ok ? r.json() : null; } catch { return null; } }
  const byTime = (arr, t) => upper(arr, t);     // number of items at or before t

  /* ------------------------------------------------------------ station marks */
  function buildDots() {
    const R = L.canvas({ padding: 0.3 });
    const k = TV ? K : 1;
    dots = entries.map(e => {
      const p = rawPos(e.tm), big = (e.lvl || 0) >= 2;
      return copiesOf(p.lon).map(Lx => {
        const m = L.circleMarker(ll(Lx, p.lat), { renderer: R, radius: (big ? 3.4 : 2.3) * k, weight: big ? 1.2 * k : 0,
          color: "#f3ead8", opacity: 0.9, fillColor: TYPE_COLOR[e.type] || TYPE_COLOR.other, fillOpacity: 0.9,
          interactive: !TV, bubblingMouseEvents: false });
        if (!TV) {
          m.bindTooltip(`<b>${esc(e.label)}</b> · ${esc(fdate(e.tm, { month: "short", day: "numeric" }))}` +
                        (e.text ? `<br>${esc(e.text.length > 140 ? e.text.slice(0, 140) + "…" : e.text)}` : ""),
                        { className: "evtip logtip", direction: "top", offset: [0, -4] });
          m.on("click", () => seek(e.tm));
        }
        return m;
      });
    });
  }
  function updateDots() {
    const n = byTime(times, ui.t);
    if (n === shown) return;
    if (n > shown) for (let i = shown; i < n; i++) dots[i].forEach(m => m.addTo(map));
    else for (let i = n; i < shown; i++) dots[i].forEach(m => m.remove());
    shown = n;
  }

  /* ------------------------------------------------------------ captions */
  function caption(label, head, text, ms) {
    const c = $("caption");
    if (!c) return;
    c.innerHTML = (label ? `<div class="cl">${esc(label)}</div>` : "") + (head ? `<div class="ch">${esc(head)}</div>` : "") +
                  (text ? `<div class="ct">${esc(text)}</div>` : "");
    c.classList.add("show");
    clearTimeout(capTimer);
    if (ms) capTimer = setTimeout(() => c.classList.remove("show"), ms);
  }
  function hideCaption(delay) { clearTimeout(capTimer); capTimer = setTimeout(() => $("caption") && $("caption").classList.remove("show"), delay || 0); }

  function clipCaption(c) {
    if (c.kind === "highlight") {
      const e = entries.find(x => x.id === c.id);
      if (e) return [KIND_LABEL.highlight, `${e.label} · ${shipClock(e.tm, e.z)}`, e.text || c.caption];
    }
    if (c.kind === "event") { const i = c.caption.indexOf(". "); return ["", i > 0 ? c.caption.slice(0, i) : c.caption, i > 0 ? c.caption.slice(i + 2) : ""]; }
    return [KIND_LABEL[c.kind] || "", "", c.caption];
  }
  /* the ship's clock: from the log sheet's own time zone (GMT = ship's time + zone) when we have it */
  function shipClock(t, z) {
    const off = z != null ? -z : Math.round(wrap(rawPos(t).lon) / 15);
    return f12(t + off * HOUR) + " ship's time";
  }

  /* ------------------------------------------------------------ narration */
  function allowed(c, rate) {
    if (rate <= 60) return true;
    if (rate <= 3600) return c.kind !== "highlight" || (c.lvl || 0) >= 3;
    if (rate <= 86400) return c.kind === "leg" || c.kind === "event" || (c.kind === "highlight" && (c.lvl || 0) >= 3);
    return c.kind === "leg" || c.kind === "event";
  }
  function enqueue(c) {
    if (queue.includes(c) || cur === c) return;
    queue.push(Object.assign(c, { queuedAt: performance.now(), greet: false }));
    queue.sort((a, b) => (PRIORITY[b.kind] || 0) - (PRIORITY[a.kind] || 0) || a.t - b.t);
    queue.length = Math.min(queue.length, 3);
  }
  function playNext() {
    if (cur || !queue.length) return;
    // a clip that has waited more than 20 seconds belongs to a moment already past
    queue = queue.filter(c => c.greet || performance.now() - c.queuedAt < 20000);
    const c = queue.shift();
    if (!c) return;
    cur = c;
    holding = ui.rate >= 86400 && ui.playing;               // time-lapse waits for the story
    const [label, head, text] = clipCaption(c);
    caption(label, head, text, 0);
    audio.src = "audio/" + c.file;
    const done = () => { if (cur !== c) return; cur = null; holding = false; hideCaption(1500); setTimeout(playNext, 700); };
    audio.onended = done;
    audio.onerror = done;
    const p = audio.play();
    if (p && p.catch) p.catch(() => { blocked(); done(); });
    // never hold the time-lapse for longer than the clip should take
    setTimeout(() => { if (cur === c && holding) holding = false; }, (c.dur || 10) * 1000 + 4000);
  }
  function stop() { audio.pause(); cur = null; queue = []; holding = false; }
  /* browsers refuse sound until the page has been tapped or clicked: wait for that, keep the setting */
  let waiting = false;
  function blocked() {
    stop(); hideCaption(0);
    const b = $("sound");
    if (b) { b.textContent = "🔇"; b.classList.remove("on"); b.title = "Tap to hear the narration"; }
    if (waiting) return;
    waiting = true;
    const go = ev => {
      if (ev && ev.target && ev.target.id === "sound") return;     // the button handles itself
      removeEventListener("pointerdown", go, true); removeEventListener("keydown", go, true);
      waiting = false;
      if (sound) setSound(true, true);
    };
    addEventListener("pointerdown", go, true); addEventListener("keydown", go, true);
  }
  function setSound(on, quiet) {
    sound = on; store.set("sound", on);
    const b = $("sound");
    if (b) { b.textContent = on ? "🔊" : "🔇"; b.classList.toggle("on", on); b.title = on ? "Narration on (N)" : "Narration off (N)"; }
    if (!on) { stop(); hideCaption(0); }
    if (!quiet && clips.length) toast(on ? "Narration <b>on</b>" : "Narration <b>off</b>", 1400);
    if (on) greet();
  }
  function greet() {
    // when the TV starts or the sound is turned on: the voyage introduction (the very first time only),
    // this morning's line, then the current leg from the voyage log - its departure clip with the log's
    // summary of the leg, or the arrival clip when she's in port
    if (!sound || !clips.length) return;
    const now = performance.now(), order = [];
    const intro = clips.find(c => c.kind === "intro");
    if (intro && !store.get("introHeard", false)) { store.set("introHeard", true); order.push(intro); }
    const i = byTime(clipTimes, ui.t) - 1;
    if (ui.rate <= 3600)
      for (let j = i; j >= 0 && ui.t - clips[j].t < 16 * HOUR; j--) if (clips[j].kind === "daily") { order.push(clips[j]); break; }
    for (let j = i; j >= 0; j--) if (clips[j].kind === "leg") { order.push(clips[j]); break; }
    stop();
    queue = order.map(c => Object.assign(c, { queuedAt: now, greet: true }));      // played in this order, however long
    playNext();
  }

  /* ------------------------------------------------------------ the website's side panel */
  function updatePanelLog() {
    const card = $("logCard");
    if (!card || !entries.length) return;
    const i = byTime(times, ui.t) - 1;
    card.classList.toggle("hide", i < 0);
    if (i < 0) return;
    const e = entries[i];
    const day0 = ui.t - DAY;
    let today = 0;
    for (let j = i; j >= 0 && entries[j].tm > day0; j--) today++;
    $("logHead").innerHTML = `<span class="dot" style="background:${TYPE_COLOR[e.type] || TYPE_COLOR.other}"></span>${esc(e.label)}` +
                             ` <span class="meta">· ${esc(TYPE_NAME[e.type] || "")}</span>`;
    $("logText").textContent = e.text || "—";
    $("logMeta").textContent = `${fdate(e.tm, { month: "long", day: "numeric" })}, ${shipClock(e.tm, e.z)}` +
                               (today > 1 ? ` · ${today} stations in the last 24 hours` : "");
  }

  return {
    async init() {
      const [lg, cj] = await Promise.all([getOpt("data/log.json"), getOpt("audio/clips.json")]);
      if (lg && lg.entries) {
        entries = lg.entries.map(e => Object.assign(e, { tm: Date.parse(e.t) })).filter(e => !isNaN(e.tm)).sort((a, b) => a.tm - b.tm);
        times = entries.map(e => e.tm);
        buildDots();
      }
      if (cj && cj.clips) {
        const lvl = Object.fromEntries(entries.map(e => [e.id, e.lvl]));
        clips = Object.entries(cj.clips).map(([id, c]) => Object.assign({ id }, c, { t: c.when ? Date.parse(c.when) : NaN, lvl: lvl[id] }))
          .filter(c => c.file).sort((a, b) => (a.t || 0) - (b.t || 0));
        const timed = clips.filter(c => !isNaN(c.t));
        clipTimes = timed.map(c => c.t);
        clips = timed.concat(clips.filter(c => isNaN(c.t)));      // untimed (the intro) at the end
        clipTimes.length = timed.length;
      }
      const b = $("sound");
      if (b) {
        b.classList.toggle("hide", !clips.length);
        b.onclick = () => setSound(!sound);
      }
      if (clips.length) setSound(Q.has("mute") ? false : store.get("sound", TV), true);
    },
    speaking: () => sound && clips.length > 0,
    holding: () => holding,
    toggleSound: () => clips.length && setSound(!sound),

    /* every frame: marks, captions, narration */
    tick(s, prevT) {
      if (entries.length) updateDots();
      const now = performance.now();
      if (now - lastPanel > 250) { updatePanelLog(); lastPanel = now; }
      if (!ui.playing || prevT == null || ui.t <= prevT || ui.t - prevT > 2 * DAY) return;
      if (sound) {
        const a = byTime(clipTimes, prevT), b = byTime(clipTimes, ui.t);
        for (let i = a; i < b; i++) if (allowed(clips[i], ui.rate)) enqueue(clips[i]);
        playNext();
      }
      // at real time, entries that aren't narrated still get a caption as they happen
      if (ui.rate <= 60 && entries.length && !cur) {
        const a = byTime(times, prevT), b = byTime(times, ui.t);
        if (b > a) {
          const e = entries[b - 1];
          caption("From the Scientific Log", `${e.label} · ${shipClock(e.tm, e.z)}`, e.text || TYPE_NAME[e.type] || "", 15000);
        }
      }
    },
    onSeek() { stop(); hideCaption(0); }
  };
})();

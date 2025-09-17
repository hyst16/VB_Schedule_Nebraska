// docs/assets/app.js
(async function () {
  const $ = (sel, el = document) => el.querySelector(sel);
  const fmtDay = (iso) =>
    new Date(iso + "T00:00:00").toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });

  // from index.html we set these with cache-busting
  const DATA_URL = window.DATA_URL || "data/vb_schedule_normalized.json";
  const MANIFEST_URL = window.MANIFEST_URL || "data/arena_manifest.json";
  const UI = window.UI || { rotateSeconds: 15, showDividerLiteral: true, showCityOnly: true };

  // fetch data
  const sched = await fetch(DATA_URL).then((r) => r.json()).then((d) => d.items || []);
  const manifest = await fetch(MANIFEST_URL).then((r) => r.json()).catch(() => ({}));
  const arenas = Object.fromEntries(((manifest && manifest.arenas) || []).map((a) => [a.arena_key, a]));

  // helpers
  const dividerFor = (han) => (han === "A" ? "at" : "vs.");
  const homeClass = (han) => (han === "H" ? "is-home" : "is-away");
  const rowResult = (g) => (g.result ? g.result.split(" ")[0] : ""); // "W" / "L" / "T"

  // choose "next" game: first scheduled in the future; fallback to last final
  const today = new Date();
  const upcoming = sched.filter((g) => g.status !== "final").sort((a, b) => a.date.localeCompare(b.date));
  const nextGame = upcoming[0] || sched[sched.length - 1];

  // ----- HERO (next game) -----
  const viewNext = $("#view-next");
  const nextBg = $("#next-bg");
  const neLogo = $("#ne-logo");
  const oppLogo = $("#opp-logo");
  const nextOpp = $("#next-opponent");
  const nextDT = $("#next-datetime");
  const nextVenue = $("#next-venue");
  const nextTV = $("#next-tv");

  if (nextGame) {
    // background by arena_key (optional image; harmless if missing)
    if (nextGame.arena_key) {
      nextBg.style.backgroundImage = `url(images/arenas/${nextGame.arena_key}.jpg)`;
    }
    // logos
    if (nextGame.nu_logo) neLogo.src = nextGame.nu_logo;
    if (nextGame.opp_logo) oppLogo.src = nextGame.opp_logo;

    // divider + opponent
    const divider = dividerFor(nextGame["home_away"]);
    $("#divider").textContent = UI.showDividerLiteral ? (divider + ".") : "";
    nextOpp.textContent = `${nextGame.title || nextGame.opponent}`;

    // date/time
    const dateStr = nextGame.date ? fmtDay(nextGame.date) : "";
    const timeStr = nextGame.time_local ? ` · ${nextGame.time_local}` : "";
    nextDT.textContent = `${dateStr}${timeStr}`;

    // venue
    const city = nextGame.city || "";
    const arena = nextGame.arena || "";
    nextVenue.textContent = UI.showCityOnly || !arena ? city : `${city} • ${arena}`;

    // tv
    nextTV.innerHTML = "";
    if (nextGame.tv_logo) {
      const wrap = document.createElement("span");
      wrap.className = "tv-chip";
      const img = new Image();
      img.src = nextGame.tv_logo;
      img.alt = "TV";
      wrap.appendChild(img);
      nextTV.appendChild(wrap);
    } else if (Array.isArray(nextGame.tv) && nextGame.tv.length) {
      nextTV.textContent = nextGame.tv.join(" • ");
    }
  }

  // ----- COMPACT 2-COL VIEW -----
  const wrap = $("#view-all .all-wrap");
  const cols = document.createElement("div");
  cols.className = "cols";
  const colA = document.createElement("div");
  const colB = document.createElement("div");
  colA.className = "col";
  colB.className = "col";
  cols.appendChild(colA);
  cols.appendChild(colB);
  wrap.appendChild(cols);

  const makeRow = (g) => {
    const row = document.createElement("div");
    row.className = `game-row ${homeClass(g.home_away)}`;

    // left date stack
    const when = document.createElement("div");
    when.className = "when";
    when.innerHTML = `<div class="date">${g.date ? fmtDay(g.date).split(", ")[1] : ""}</div>
                      <div class="dow">${g.date ? fmtDay(g.date).split(", ")[0] : ""}</div>`;

    // main sentence line with tiny marks
    const line = document.createElement("div");
    line.className = "line";

    const neMark = new Image();
    neMark.className = "mark";
    neMark.src = g.nu_logo || "";
    neMark.alt = "Nebraska";

    const oppMark = new Image();
    oppMark.className = "mark";
    oppMark.src = g.opp_logo || "";
    oppMark.alt = g.opponent || "Opponent";

    const divEl = document.createElement("span");
    divEl.className = "divider";
    divEl.textContent = UI.showDividerLiteral ? dividerFor(g.home_away) : "";

    const oppSpan = document.createElement("span");
    oppSpan.className = "opp-name";
    oppSpan.textContent = g.title || g.opponent || "";

    line.appendChild(neMark);
    line.appendChild(divEl);
    line.appendChild(oppSpan);
    line.appendChild(oppMark);

    // chips: city/arena
    const chips = document.createElement("div");
    const city = g.city || "";
    const arena = g.arena || "";
    if (city) {
      const c = document.createElement("span");
      c.className = "chip city";
      c.textContent = UI.showCityOnly || !arena ? city : `${city} • ${arena}`;
      chips.appendChild(c);
    }

    // time chip (optional)
    if (g.time_local) {
      const t = document.createElement("span");
      t.className = "chip";
      t.textContent = g.time_local;
      chips.appendChild(t);
    }

    // TV chip (logo preferred)
    if (g.tv_logo) {
      const tv = document.createElement("span");
      tv.className = "chip tv";
      const img = new Image();
      img.src = g.tv_logo;
      img.alt = "TV";
      tv.appendChild(img);
      chips.appendChild(tv);
    } else if (Array.isArray(g.tv) && g.tv.length) {
      const tv = document.createElement("span");
      tv.className = "chip";
      tv.textContent = g.tv.join(" • ");
      chips.appendChild(tv);
    }

    // result pill (if final)
    if (g.status === "final" && g.result) {
      const res = document.createElement("span");
      res.className = `result ${rowResult(g)}`;
      res.textContent = g.result;
      chips.insertBefore(res, chips.firstChild);
    }

    row.appendChild(when);
    row.appendChild(line);
    row.appendChild(chips);
    return row;
  };

  // split into two columns, alternating
  sched.forEach((g, i) => (i % 2 === 0 ? colA : colB).appendChild(makeRow(g)));

  // ----- view switching / rotation -----
  const vNext = $("#view-next");
  const vAll = $("#view-all");
  const dbg = $("#debug");
  const params = new URLSearchParams(location.search);
  const lockView = params.get("view"); // "next" | "all" | null
  const debug = params.get("debug") === "1";

  function show(which) {
    vNext.classList.toggle("hidden", which !== "next");
    vAll.classList.toggle("hidden", which !== "all");
  }

  if (lockView === "next") show("next");
  else if (lockView === "all") show("all");
  else {
    // rotate automatically
    let mode = "next";
    show(mode);
    setInterval(() => {
      mode = mode === "next" ? "all" : "next";
      show(mode);
    }, (UI.rotateSeconds || 15) * 1000);
  }

  if (debug) {
    dbg.classList.remove("hidden");
    dbg.textContent = `games: ${sched.length} • next: ${nextGame ? (nextGame.opponent || "") : "n/a"}`;
  }
})();

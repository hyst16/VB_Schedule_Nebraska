/**
 * Volleyball schedule UI (hero + two-column compact list).
 * - Dense layout is ON by default (pass ?dense=0 to turn off).
 * - TV chips are fixed-size pills; logos scale to fit inside.
 * - Tiny rank dots appear on the mini logos in the schedule list.
 * - Hero logos show rank pills (if ranks exist).
 */
(async function () {
  const $ = (sel, el = document) => el.querySelector(sel);

  // -------- Config and inputs --------
  // Data endpoints (set in index.html with cache-busting query strings)
  const DATA_URL = window.DATA_URL || "data/vb_schedule_normalized.json";
  const MANIFEST_URL = window.MANIFEST_URL || "data/arena_manifest.json";
  const UI = window.UI || { rotateSeconds: 15, showDividerLiteral: true, showCityOnly: true };

  // URL params (debug, view lock, rotation, dense override)
  const params = new URLSearchParams(location.search);
  const rot = parseInt(params.get("rot"), 10);
  if (!isNaN(rot) && rot > 0) UI.rotateSeconds = rot;
  const lockView = params.get("view"); // "next" | "all"
  const debug = params.get("debug") === "1";

  // Dense mode: default ON. Use ?dense=0 to disable.
  const dense = params.get("dense") !== "0";
  if (dense) document.body.classList.add("dense");

  // -------- Data fetch --------
  const sched = await fetch(DATA_URL).then(r => r.json()).then(d => d.items || []).catch(() => []);
  const manifest = await fetch(MANIFEST_URL).then(r => r.json()).catch(() => ({}));
  const arenas = Object.fromEntries(((manifest && manifest.arenas) || []).map(a => [a.arena_key, a]));

  // -------- Small helpers --------
  const dividerFor = (han) => (han === "A" ? "at" : "vs"); // we add the dot in CSS/strings if wanted
  const homeClass = (han) => (han === "H" ? "is-home" : "is-away");
  const rowResult = (g) => (g.result ? (g.result.split(" ")[0] || "") : ""); // "W"/"L"/"T"

  // Abbreviate time strings for the tighter chips
  function abbrevTime(s) {
    if (!s || typeof s !== "string") return s;
    s = s.replace(/\s+/g, " ").trim();

    // "8:00 OR 9:00 PM CST" -> "8 or 9 PM CST"
    const orMatch = s.match(/^(\d{1,2})(?::00)?\s*OR\s*(\d{1,2})(?::00)?\s*(AM|PM)\s+([A-Z]{3})$/i);
    if (orMatch) {
      const h1 = String(+orMatch[1]);
      const h2 = String(+orMatch[2]);
      const ampm = orMatch[3].toUpperCase();
      const tz = orMatch[4].toUpperCase();
      return `${h1} or ${h2} ${ampm} ${tz}`;
    }

    // "6:00 PM CDT" -> "6 PM CDT" (drop :00)
    const fullMatch = s.match(/^(\d{1,2})(?::(\d{2}))\s*(AM|PM)\s+([A-Z]{3})$/i);
    if (fullMatch) {
      const hour = String(+fullMatch[1]);
      const mins = fullMatch[2];
      const ampm = fullMatch[3].toUpperCase();
      const tz = fullMatch[4].toUpperCase();
      return mins === "00" ? `${hour} ${ampm} ${tz}` : `${hour}:${mins} ${ampm} ${tz}`;
    }

    // "6:00 PM" (no TZ) -> "6 PM"
    const noTZ = s.match(/^(\d{1,2})(?::(\d{2}))\s*(AM|PM)$/i);
    if (noTZ) {
      const hour = String(+noTZ[1]);
      const mins = noTZ[2];
      const ampm = noTZ[3].toUpperCase();
      return mins === "00" ? `${hour} ${ampm}` : `${hour}:${mins} ${ampm}`;
    }

    // TBA or unknown → leave
    return s;
  }

  // Nice hero date line: "SATURDAY • Sep 20 • 8 PM CDT"
  const fmtHero = (iso, time) => {
    if (!iso) return time ? abbrevTime(time) : "";
    const d = new Date(iso + "T00:00:00");
    const weekday = d.toLocaleDateString("en-US", { weekday: "long" }).toUpperCase();
    const mon = d.toLocaleDateString("en-US", { month: "short" });
    const day = d.getDate();
    return [weekday, `${mon} ${day}`, abbrevTime(time || "")].filter(Boolean).join(" • ");
  };

  // Short date for the schedule rows (left stack)
  const fmtDay = (iso) =>
    new Date(iso + "T00:00:00").toLocaleDateString("en-US", {
      weekday: "short", month: "short", day: "numeric",
    });

  // Choose "next" game: first non-final with a date; otherwise last item as fallback
  const upcoming = sched.filter(g => g.status !== "final" && g.date).sort((a,b) => a.date.localeCompare(b.date));
  const nextGame = upcoming[0] || sched[sched.length - 1];

  // -------- HERO WIRING --------
  const nextBg = $("#next-bg");
  const neLogo = $("#ne-logo");
  const oppLogo = $("#opp-logo");
  const nextOpp = $("#next-opponent");
  const nextDT  = $("#next-datetime");
  const nextVenue = $("#next-venue");
  const nextTV  = $("#next-tv");

  if (nextGame) {
    // Background arena image if we have a key
    if (nextGame.arena_key) {
      nextBg.style.backgroundImage = `url(images/arenas/${nextGame.arena_key}.jpg)`;
    }

    // Logos
    if (nextGame.nu_logo) neLogo.src  = nextGame.nu_logo;
    if (nextGame.opp_logo) oppLogo.src = nextGame.opp_logo;

    // Divider text ("vs."/"at")
    const divider = dividerFor(nextGame.home_away);
    $("#divider").textContent = UI.showDividerLiteral ? (divider + ".") : "";

    // "Nebraska vs. Stanford"
    const headline =
      (nextGame.home_away === "A" ? "Nebraska at " : "Nebraska vs. ") +
      (nextGame.title || nextGame.opponent || "");
    nextOpp.textContent = headline;

    // Date/time + venue line
    nextDT.textContent = fmtHero(nextGame.date, nextGame.time_local);
    const city = nextGame.city || "";
    const arena = nextGame.arena || "";
    nextVenue.textContent = UI.showCityOnly || !arena ? city : `${city} • ${arena}`;

    // TV chip — fixed footprint; remove if logo fails to load
    nextTV.innerHTML = "";
    if (nextGame.tv_logo) {
      const chip = document.createElement("span");
      chip.className = "tv-chip";
      const img = new Image();
      img.src = nextGame.tv_logo; img.alt = "TV";
      img.onerror = () => chip.remove();
      chip.appendChild(img);
      nextTV.appendChild(chip);
    } else if (Array.isArray(nextGame.tv) && nextGame.tv.length) {
      const chip = document.createElement("span");
      chip.className = "tv-chip";
      chip.textContent = nextGame.tv.join(" • ");
      nextTV.appendChild(chip);
    }

    // Rank pills on the hero logos
    const neRankEl  = $("#ne-rank");
    const oppRankEl = $("#opp-rank");
    const setRank = (el, rank, isNeb = false) => {
      if (rank && Number(rank) > 0) {
        el.textContent = `#${rank}`;
        el.classList.toggle("ne", !!isNeb);
        el.classList.remove("hidden");
      } else {
        el.classList.add("hidden");
      }
    };
    setRank(neRankEl, nextGame.nu_rank, true);
    setRank(oppRankEl, nextGame.opp_rank, false);
  }

  // -------- COMPACT TWO-COLUMN SCHEDULE --------
  const wrap = $("#view-all .all-wrap");
  const cols = document.createElement("div");
  cols.className = "cols";
  const colA = document.createElement("div");
  const colB = document.createElement("div");
  colA.className = "col"; colB.className = "col";
  cols.appendChild(colA); cols.appendChild(colB);
  wrap.appendChild(cols);

  // Build one schedule row (tight, but readable)
  const makeRow = (g) => {
    const row = document.createElement("div");
    row.className = `game-row ${homeClass(g.home_away)}`;

    // Left date stack (MMM DD + DOW)
    const when = document.createElement("div");
    when.className = "when";
    const dayStr = g.date ? fmtDay(g.date) : "";
    const parts = dayStr ? dayStr.split(", ") : [];
    const dow = parts[0] || "";
    const mmmdd = parts[1] || "";
    when.innerHTML = `<div class="date">${mmmdd}</div><div class="dow">${dow}</div>`;

    // Sentence line: tiny NU mark + divider + opponent name + tiny Opp mark
    const line = document.createElement("div");
    line.className = "line";

    // Tiny NU mark with rank dot
    const neWrap = document.createElement("span");
    neWrap.className = "mark-wrap";
    const neMark = new Image();
    neMark.className = "mark"; neMark.src = g.nu_logo || ""; neMark.alt = "Nebraska";
    neWrap.appendChild(neMark);
    if (g.nu_rank && Number(g.nu_rank) > 0) {
      const dot = document.createElement("span");
      dot.className = "rank-dot ne";
      dot.textContent = `#${g.nu_rank}`;
      neWrap.appendChild(dot);
    }

    // Divider text
    const divEl = document.createElement("span");
    divEl.className = "divider";
    divEl.textContent = UI.showDividerLiteral ? dividerFor(g.home_away) : "";

    // Opponent text (may include "#N ..." already baked into 'title')
    const oppSpan = document.createElement("span");
    oppSpan.className = "opp-name";
    oppSpan.textContent = g.title || g.opponent || "";

    // Tiny opponent mark with rank dot
    const oppWrap = document.createElement("span");
    oppWrap.className = "mark-wrap";
    const oppMark = new Image();
    oppMark.className = "mark"; oppMark.src = g.opp_logo || ""; oppMark.alt = g.opponent || "Opponent";
    oppWrap.appendChild(oppMark);
    if (g.opp_rank && Number(g.opp_rank) > 0) {
      const dot = document.createElement("span");
      dot.className = "rank-dot";
      dot.textContent = `#${g.opp_rank}`;
      oppWrap.appendChild(dot);
    }

    line.appendChild(neWrap);
    line.appendChild(divEl);
    line.appendChild(oppSpan);
    line.appendChild(oppWrap);

    // Chips cluster on the right (result, time, city/arena, TV)
    const chips = document.createElement("div");

    // Result pill if final
    if (g.status === "final" && g.result) {
      const res = document.createElement("span");
      res.className = `result ${rowResult(g)}`;
      res.textContent = g.result;
      chips.appendChild(res);
    }

    // Time chip (abbreviated)
    if (g.time_local) {
      const t = document.createElement("span");
      t.className = "chip";
      t.textContent = abbrevTime(g.time_local);
      chips.appendChild(t);
    }

    // City/arena chip (respect UI.showCityOnly)
    const city = g.city || "";
    const arena = g.arena || "";
    if (city) {
      const c = document.createElement("span");
      c.className = "chip city";
      c.textContent = UI.showCityOnly || !arena ? city : `${city} • ${arena}`;
      chips.appendChild(c);
    }

    // TV chip — fixed pill, prefer logo; fallback to short text
    if (g.tv_logo) {
      const tv = document.createElement("span");
      tv.className = "chip tv";
      const img = new Image();
      img.src = g.tv_logo; img.alt = "TV";
      img.onerror = () => tv.remove();
      tv.appendChild(img);
      chips.appendChild(tv);
    } else if (Array.isArray(g.tv) && g.tv.length) {
      const tv = document.createElement("span");
      tv.className = "chip tv";
      tv.textContent = g.tv[0]; // keep short in dense layout
      chips.appendChild(tv);
    }

    row.appendChild(when);
    row.appendChild(line);
    row.appendChild(chips);
    return row;
  };

  // Alternate rows into two columns
  sched.forEach((g, i) => (i % 2 === 0 ? colA : colB).appendChild(makeRow(g)));

  // -------- View rotation + debug badge --------
  const vNext = $("#view-next");
  const vAll  = $("#view-all");
  const dbg   = $("#debug");

  function show(which) {
    vNext.classList.toggle("hidden", which !== "next");
    vAll.classList.toggle("hidden", which !== "all");
  }

  if (lockView === "next") show("next");
  else if (lockView === "all") show("all");
  else {
    let mode = "next"; show(mode);
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

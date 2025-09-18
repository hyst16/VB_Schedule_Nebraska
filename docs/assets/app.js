// assets/app.js
// Compact two-column Husker Volleyball schedule + hero.
// Features:
// - "Sequential" column fill (first half left, second half right)
// - Global scale knob (?scale=0.95) that scales the schedule view
// - Optional column width override (?colw=640)
// - Dense mode (?dense=1)
// - Optional flow toggle (?colflow=alternate) for even/odd fill
// - Opponent logo + tiny rank dot placed just right of "vs/at" and left of opponent name
// - TV chips are fixed-size pills with logos fit inside

(async function () {
  const $ = (sel, el = document) => el.querySelector(sel);

  // -------- Config from index.html (with cache-bust applied there) --------
  const DATA_URL     = window.DATA_URL     || "data/vb_schedule_normalized.json";
  const MANIFEST_URL = window.MANIFEST_URL || "data/arena_manifest.json";
  const UI = window.UI || {
    rotateSeconds: 15,
    showDividerLiteral: true,
    showCityOnly: true,
  };

  // -------- URL params --------
  const params = new URLSearchParams(location.search);

  // Global schedule scale: scales the *schedule view container* (not the entire page)
  const scaleParam  = parseFloat(params.get("scale"));
  const globalScale = !isNaN(scaleParam) && scaleParam > 0 ? scaleParam : 1;

  // Manual column width override (px). Works in addition to scale.
  const colwParam = parseInt(params.get("colw"), 10);
  if (!isNaN(colwParam) && colwParam > 300) {
    document.documentElement.style.setProperty("--col-width", `${colwParam}px`);
  }

  // Dense mode compacts vertical spacing.
  const dense = params.get("dense") === "1";
  if (dense) document.body.classList.add("dense");

  // View rotation + lock
  const rot = parseInt(params.get("rot"), 10);
  if (!isNaN(rot) && rot > 0) UI.rotateSeconds = rot;
  const lockView = params.get("view"); // "next" | "all"

  // Column flow (default: sequential). You can pass ?colflow=alternate for even/odd.
  const colFlow = (params.get("colflow") || "sequential").toLowerCase();

  // Debug HUD
  const debug = params.get("debug") === "1";

  // -------- Fetch data --------
  const sched = await fetch(DATA_URL).then(r => r.json()).then(d => d.items || []).catch(() => []);
  const manifest = await fetch(MANIFEST_URL).then(r => r.json()).catch(() => ({}));
  const arenas = Object.fromEntries(((manifest && manifest.arenas) || []).map(a => [a.arena_key, a]));

  // -------- Helpers --------
  const dividerFor = (han) => (han === "A" ? "at" : "vs"); // no dot here
  const homeClass  = (han) => (han === "H" ? "is-home" : "is-away");
  const rowResult  = (g) => (g.result ? (g.result.split(" ")[0] || "") : ""); // "W"/"L"/"T"

  // Abbreviate time strings for chips (e.g., "6:00 PM CDT" -> "6 PM CDT")
  function abbrevTime(s) {
    if (!s || typeof s !== "string") return s;
    s = s.replace(/\s+/g, " ").trim();

    // "8:00 OR 9:00 PM CST" -> "8 or 9 PM CST"
    const orMatch = s.match(/^(\d{1,2})(?::00)?\s*OR\s*(\d{1,2})(?::00)?\s*(AM|PM)\s+([A-Z]{3})$/i);
    if (orMatch) {
      const h1 = String(+orMatch[1]);
      const h2 = String(+orMatch[2]);
      return `${h1} or ${h2} ${orMatch[3].toUpperCase()} ${orMatch[4].toUpperCase()}`;
    }

    // "6:00 PM CDT" -> "6 PM CDT"
    const fullMatch = s.match(/^(\d{1,2})(?::(\d{2}))\s*(AM|PM)\s+([A-Z]{3})$/i);
    if (fullMatch) {
      const hour  = String(+fullMatch[1]);
      const mins  = fullMatch[2];
      const ampm  = fullMatch[3].toUpperCase();
      const tz    = fullMatch[4].toUpperCase();
      return mins === "00" ? `${hour} ${ampm} ${tz}` : `${hour}:${mins} ${ampm} ${tz}`;
    }

    // "6:00 PM" (no TZ)
    const noTZ = s.match(/^(\d{1,2})(?::(\d{2}))\s*(AM|PM)$/i);
    if (noTZ) {
      const hour = String(+noTZ[1]);
      const mins = noTZ[2];
      const ampm = noTZ[3].toUpperCase();
      return mins === "00" ? `${hour} ${ampm}` : `${hour}:${mins} ${ampm}`;
    }

    return s; // TBA, etc.
  }

  const fmtHero = (iso, time) => {
    if (!iso) return time ? abbrevTime(time) : "";
    const d = new Date(iso + "T00:00:00");
    const weekday = d.toLocaleDateString("en-US", { weekday: "long" }).toUpperCase();
    const mon = d.toLocaleDateString("en-US", { month: "short" });
    const day = d.getDate();
    return [weekday, `${mon} ${day}`, abbrevTime(time || "")].filter(Boolean).join(" • ");
  };
  const fmtDay = (iso) =>
    new Date(iso + "T00:00:00").toLocaleDateString("en-US", {
      weekday: "short", month: "short", day: "numeric",
    });

  // -------- Choose "next" game: first not-final with a date; else last item --------
  const upcoming = sched
    .filter(g => g.status !== "final" && g.date)
    .sort((a,b) => a.date.localeCompare(b.date));
  const nextGame = upcoming[0] || sched[sched.length - 1];

  // ===================== HERO (next game) =====================
  const nextBg    = $("#next-bg");
  const neLogo    = $("#ne-logo");
  const oppLogo   = $("#opp-logo");
  const nextOpp   = $("#next-opponent");
  const nextDT    = $("#next-datetime");
  const nextVenue = $("#next-venue");
  const nextTV    = $("#next-tv");

  if (nextGame) {
    if (nextGame.arena_key) {
      nextBg.style.backgroundImage = `url(images/arenas/${nextGame.arena_key}.jpg)`;
    }
    if (nextGame.nu_logo)  neLogo.src  = nextGame.nu_logo;
    if (nextGame.opp_logo) oppLogo.src = nextGame.opp_logo;

    const divider = dividerFor(nextGame.home_away);
    $("#divider").textContent = UI.showDividerLiteral ? (divider + ".") : "";

    const headline =
      (nextGame.home_away === "A" ? "Nebraska at " : "Nebraska vs. ") +
      (nextGame.title || nextGame.opponent || "");
    nextOpp.textContent = headline;

    nextDT.textContent = fmtHero(nextGame.date, nextGame.time_local);
    const city = nextGame.city || "";
    const arena = nextGame.arena || "";
    nextVenue.textContent = UI.showCityOnly || !arena ? city : `${city} • ${arena}`;

    // TV chip — fixed pill size; remove if image fails
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

    // Rank pills (white for both)
    const setRank = (sel, rank) => {
      const el = $(sel);
      if (!el) return;
      if (rank && Number(rank) > 0) {
        el.textContent = `#${rank}`;
        el.classList.remove("hidden");
      } else {
        el.classList.add("hidden");
      }
    };
    setRank("#ne-rank",  nextGame.nu_rank);
    setRank("#opp-rank", nextGame.opp_rank);
  }

  // ===================== COMPACT SCHEDULE (two columns) =====================
  const wrap = $("#view-all .all-wrap");
  wrap.style.transform = `scale(${globalScale})`; // global scale knob

  const cols = document.createElement("div");
  cols.className = "cols";
  const colA = document.createElement("div");
  const colB = document.createElement("div");
  colA.className = "col"; colB.className = "col";
  cols.appendChild(colA); cols.appendChild(colB);
  wrap.appendChild(cols);

  // --- Build a team mark (logo + tiny rank dot) ---
  function buildMark(url, rank) {
    const wrap = document.createElement("span");
    wrap.className = "mark-wrap";
    const img = new Image();
    img.className = "mark";
    img.src = url || "";
    img.alt = "";
    wrap.appendChild(img);

    if (rank && Number(rank) > 0) {
      const dot = document.createElement("span");
      dot.className = "rank-dot";
      dot.textContent = `#${rank}`;
      wrap.appendChild(dot);
    }
    return wrap;
  }

  // --- Build one schedule row ---
  const makeRow = (g) => {
    const row = document.createElement("div");
    row.className = `game-row ${homeClass(g.home_away)}`;

    // Left date stack
    const when = document.createElement("div");
    when.className = "when";
    const dayStr = g.date ? fmtDay(g.date) : "";
    const [dow, mmmdd] = dayStr ? [dayStr.split(", ")[0], dayStr.split(", ")[1]] : ["",""];
    when.innerHTML = `<div class="date">${mmmdd || ""}</div><div class="dow">${dow || ""}</div>`;

    // Sentence line
    const line = document.createElement("div");
    line.className = "line";

    // Nebraska mark (logo+rank) on the far left
    const neWrap = buildMark(g.nu_logo, g.nu_rank);

    // "vs"/"at"
    const divEl = document.createElement("span");
    divEl.className = "divider";
    divEl.textContent = UI.showDividerLiteral ? dividerFor(g.home_away) : "";

    // Opponent logo+rank immediately after divider, then opponent name
    const oppWrap = buildMark(g.opp_logo, g.opp_rank);

    const oppSpan = document.createElement("span");
    oppSpan.className = "opp-name";
    // Use plain opponent name; rankings appear only in the tiny dot
    oppSpan.textContent = g.opponent || g.title || "";

    // Assemble the sentence
    line.appendChild(neWrap);
    line.appendChild(divEl);
    line.appendChild(oppWrap);
    line.appendChild(oppSpan);

    // Chips cluster (result, time, city, TV)
    const chips = document.createElement("div");

    if (g.status === "final" && g.result) {
      const res = document.createElement("span");
      res.className = `result ${rowResult(g)}`;
      res.textContent = g.result;
      chips.appendChild(res);
    }

    if (g.time_local) {
      const t = document.createElement("span");
      t.className = "chip";
      t.textContent = abbrevTime(g.time_local);
      chips.appendChild(t);
    }

    const city = g.city || "";
    const arena = g.arena || "";
    if (city) {
      const c = document.createElement("span");
      c.className = "chip city";
      c.textContent = UI.showCityOnly || !arena ? city : `${city} • ${arena}`;
      chips.appendChild(c);
    }

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
      tv.textContent = g.tv[0]; // keep short; logo is preferred
      chips.appendChild(tv);
    }

    row.appendChild(when);
    row.appendChild(line);
    row.appendChild(chips);
    return row;
  };

  // Chronological order safeguard (normalized file is sorted, but enforce anyway)
  const sorted = [...sched].sort((a, b) =>
    (a.date || "").localeCompare(b.date || "") ||
    (a.time_local || "").localeCompare(b.time_local || "")
  );

  // Column fill
  if (colFlow === "alternate") {
    // Even/odd alternation (for comparison / legacy behavior)
    sorted.forEach((g, i) => (i % 2 === 0 ? colA : colB).appendChild(makeRow(g)));
  } else {
    // Default: sequential — first half fills left, second half fills right (both top-down)
    const splitIndex = Math.ceil(sorted.length / 2);
    sorted.slice(0,  splitIndex).forEach(g => colA.appendChild(makeRow(g)));
    sorted.slice(splitIndex).forEach(g => colB.appendChild(makeRow(g)));
  }

  // -------- View rotation / debug HUD --------
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
    dbg.textContent =
      `games: ${sorted.length} • next: ${nextGame ? (nextGame.opponent || "") : "n/a"} ` +
      `• scale: ${globalScale} • colw: ${isNaN(colwParam) ? "default" : colwParam + "px"} ` +
      `• flow: ${colFlow}`;
  }
})();

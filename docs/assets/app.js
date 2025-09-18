(async function () {
  const $ = (sel, el = document) => el.querySelector(sel);

  // Data endpoints set in index.html (with cache-bust)
  const DATA_URL = window.DATA_URL || "data/vb_schedule_normalized.json";
  const MANIFEST_URL = window.MANIFEST_URL || "data/arena_manifest.json";
  const UI = window.UI || { rotateSeconds: 15, showDividerLiteral: true, showCityOnly: true };

  // -------- URL params / switches ----------
  const params = new URLSearchParams(location.search);

  // Rotate view seconds
  const rot = parseInt(params.get("rot"), 10);
  if (!isNaN(rot) && rot > 0) UI.rotateSeconds = rot;

  // Lock to "next" or "all"
  const lockView = params.get("view"); // "next" | "all"

  // Debug overlay
  const debug = params.get("debug") === "1";

  // Dense mode: default ON; pass ?dense=0 to disable
  const denseParam = params.get("dense");
  if (denseParam === "1" || denseParam === null) document.body.classList.add("dense");

  // NEW: Global scale knob (uniformly scales the entire schedule view)
  // Example: ?scale=0.88  (clamped to 0.6–1.3)
  const scaleParam = parseFloat(params.get("scale"));
  if (!isNaN(scaleParam)) {
    const s = Math.max(0.6, Math.min(1.3, scaleParam));
    document.documentElement.style.setProperty("--ui-scale", String(s));
  }

  // -------- Fetch data ----------
  const sched = await fetch(DATA_URL).then(r => r.json()).then(d => d.items || []).catch(() => []);
  const manifest = await fetch(MANIFEST_URL).then(r => r.json()).catch(() => ({}));
  const arenas = Object.fromEntries(((manifest && manifest.arenas) || []).map(a => [a.arena_key, a]));

  // -------- Helpers ----------
  const dividerFor = (han) => (han === "A" ? "at" : "vs"); // no dot here
  const homeClass = (han) => (han === "H" ? "is-home" : "is-away");
  const rowResult = (g) => (g.result ? (g.result.split(" ")[0] || "") : ""); // "W"/"L"/"T"

  // Abbreviate time strings for chips
  function abbrevTime(s) {
    if (!s || typeof s !== "string") return s;
    s = s.replace(/\s+/g, " ").trim();
    const orMatch = s.match(/^(\d{1,2})(?::00)?\s*OR\s*(\d{1,2})(?::00)?\s*(AM|PM)\s+([A-Z]{3})$/i);
    if (orMatch) {
      const h1 = String(+orMatch[1]);
      const h2 = String(+orMatch[2]);
      const ampm = orMatch[3].toUpperCase();
      const tz = orMatch[4].toUpperCase();
      return `${h1} or ${h2} ${ampm} ${tz}`;
    }
    const fullMatch = s.match(/^(\d{1,2})(?::(\d{2}))\s*(AM|PM)\s+([A-Z]{3})$/i);
    if (fullMatch) {
      const hour = String(+fullMatch[1]);
      const mins = fullMatch[2];
      const ampm = fullMatch[3].toUpperCase();
      const tz = fullMatch[4].toUpperCase();
      return mins === "00" ? `${hour} ${ampm} ${tz}` : `${hour}:${mins} ${ampm} ${tz}`;
    }
    const noTZ = s.match(/^(\d{1,2})(?::(\d{2}))\s*(AM|PM)$/i);
    if (noTZ) {
      const hour = String(+noTZ[1]);
      const mins = noTZ[2];
      const ampm = noTZ[3].toUpperCase();
      return mins === "00" ? `${hour} ${ampm}` : `${hour}:${mins} ${ampm}`;
    }
    return s;
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

  // Choose "next" game: first not-final with a date; else last item
  const upcoming = sched.filter(g => g.status !== "final" && g.date).sort((a,b) => a.date.localeCompare(b.date));
  const nextGame = upcoming[0] || sched[sched.length - 1];

  // ----- HERO (next game) -----
  const nextBg = $("#next-bg");
  const neLogo = $("#ne-logo");
  const oppLogo = $("#opp-logo");
  const nextOpp = $("#next-opponent");
  const nextDT  = $("#next-datetime");
  const nextVenue = $("#next-venue");
  const nextTV  = $("#next-tv");

  if (nextGame) {
    if (nextGame.arena_key) nextBg.style.backgroundImage = `url(images/arenas/${nextGame.arena_key}.jpg)`;
    if (nextGame.nu_logo) neLogo.src  = nextGame.nu_logo;
    if (nextGame.opp_logo) oppLogo.src = nextGame.opp_logo;

    const divider = dividerFor(nextGame.home_away);
    $("#divider").textContent = UI.showDividerLiteral ? (divider + ".") : "";

    // Use opponent name only (no "#rank")
    const headline =
      (nextGame.home_away === "A" ? "Nebraska at " : "Nebraska vs. ") +
      (nextGame.opponent || nextGame.title || "");
    nextOpp.textContent = headline;

    nextDT.textContent = fmtHero(nextGame.date, nextGame.time_local);
    const city = nextGame.city || "";
    const arena = nextGame.arena || "";
    nextVenue.textContent = UI.showCityOnly || !arena ? city : `${city} • ${arena}`;

    // TV chip
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

    // Rank pills (hero)
    const neRankEl  = $("#ne-rank");
    const oppRankEl = $("#opp-rank");
    const setRank = (el, rank) => {
      if (rank && Number(rank) > 0) { el.textContent = `#${rank}`; el.classList.remove("hidden"); }
      else el.classList.add("hidden");
    };
    setRank(neRankEl, nextGame.nu_rank);
    setRank(oppRankEl, nextGame.opp_rank);
  }

  // ----- COMPACT TWO-COLUMN VIEW -----
  const wrap = $("#view-all .all-wrap");
  const cols = document.createElement("div");
  cols.className = "cols";
  const colA = document.createElement("div");
  const colB = document.createElement("div");
  colA.className = "col"; colB.className = "col";
  cols.appendChild(colA); cols.appendChild(colB);
  wrap.appendChild(cols);

  // Helper: create a logo with optional tiny rank dot
  function createLogoWithRank(src, alt, rank) {
    const box = document.createElement("span");
    box.className = "logo-badge";
    const img = new Image();
    img.className = "mark";
    img.src = src || "";
    img.alt = alt || "";
    box.appendChild(img);
    if (rank && Number(rank) > 0) {
      const dot = document.createElement("span");
      dot.className = "rank-dot";
      dot.textContent = `#${rank}`;
      box.appendChild(dot);
    }
    return box;
  }

  // Build one schedule row
  const makeRow = (g) => {
    const row = document.createElement("div");
    row.className = `game-row ${homeClass(g.home_away)}`;

    // left date stack
    const when = document.createElement("div");
    when.className = "when";
    const dayStr = g.date ? fmtDay(g.date) : "";
    const [dow, mmmdd] = dayStr ? [dayStr.split(", ")[0], dayStr.split(", ")[1]] : ["",""];
    when.innerHTML = `<div class="date">${mmmdd || ""}</div><div class="dow">${dow || ""}</div>`;

    // sentence line
    const line = document.createElement("div");
    line.className = "line";

    // Nebraska logo + rank
    line.appendChild(createLogoWithRank(g.nu_logo || "", "Nebraska", g.nu_rank));

    // divider
    const divEl = document.createElement("span");
    divEl.className = "divider";
    divEl.textContent = UI.showDividerLiteral ? dividerFor(g.home_away) : "";
    line.appendChild(divEl);

    // opponent name (no rank in text)
    const oppSpan = document.createElement("span");
    oppSpan.className = "opp-name";
    oppSpan.textContent = g.opponent || g.title || "";
    line.appendChild(oppSpan);

    // opponent logo + rank
    line.appendChild(createLogoWithRank(g.opp_logo || "", g.opponent || "Opponent", g.opp_rank));

    // chips cluster
    const chips = document.createElement("div");

    // result pill
    if (g.status === "final" && g.result) {
      const res = document.createElement("span");
      res.className = `result ${rowResult(g)}`;
      res.textContent = g.result;
      chips.appendChild(res);
    }

    // time chip (abbreviated)
    if (g.time_local) {
      const t = document.createElement("span");
      t.className = "chip";
      t.textContent = abbrevTime(g.time_local);
      chips.appendChild(t);
    }

    // city/arena chip
    const city = g.city || "";
    const arena = g.arena || "";
    if (city) {
      const c = document.createElement("span");
      c.className = "chip city";
      c.textContent = UI.showCityOnly || !arena ? city : `${city} • ${arena}`;
      chips.appendChild(c);
    }

    // TV chip — fixed pill size; remove if logo fails
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
      tv.textContent = g.tv[0];
      chips.appendChild(tv);
    }

    row.appendChild(when);
    row.appendChild(line);
    row.appendChild(chips);
    return row;
  };

  // Fill FIRST column top-down, then SECOND column (top-down)
  const half = Math.ceil(sched.length / 2);
  const firstColGames = sched.slice(0, half);
  const secondColGames = sched.slice(half);

  firstColGames.forEach(g => colA.appendChild(makeRow(g)));
  secondColGames.forEach(g => colB.appendChild(makeRow(g)));

  // ----- view rotation / debug -----
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

(async function () {
  const $ = (sel, el = document) => el.querySelector(sel);

  // Data endpoints (cache-busted in index.html)
  const DATA_URL     = window.DATA_URL     || "data/vb_schedule_normalized.json";
  const MANIFEST_URL = window.MANIFEST_URL || "data/arena_manifest.json";
  const UI = window.UI || { rotateSeconds: 15, showDividerLiteral: true, showCityOnly: true };

  // --------------- URL params ---------------
  const params = new URLSearchParams(location.search);

  // Core knobs
  const lockView    = params.get("view"); // "next" | "all" | null -> rotate
  const rot         = parseInt(params.get("rot"), 10);
  if (!Number.isNaN(rot) && rot > 0) UI.rotateSeconds = rot;

  // Global manual scale (applied AFTER auto-fit; 1 means unchanged)
  const scaleParam  = parseFloat(params.get("scale"));
  const manualScale = (!Number.isNaN(scaleParam) && scaleParam > 0) ? scaleParam : 1;

  // Column gap (default 5px as requested)
  const gapParam = parseInt(params.get("gap") || "5", 10);
  document.documentElement.style.setProperty("--cols-gap", `${Math.max(0, gapParam)}px`);

  // Optional max width per column (px); otherwise columns are fluid via 1fr
  const colwParam = parseInt(params.get("colw") || "", 10);
  if (!Number.isNaN(colwParam) && colwParam > 320) {
    document.documentElement.style.setProperty("--col-max", `${colwParam}px`);
  } else {
    document.documentElement.style.setProperty("--col-max", `9999px`);
  }

  // Dense + auto-dense
  const dense    = params.get("dense") === "1";
  const autodense = params.get("autodense") === "1";
  if (dense) document.body.classList.add("dense");

  // 16:9 stage (fit=16x9 enables stage safe padding calculation; the stage box always exists)
  const fitParam = (params.get("fit") || "").toLowerCase();
  const useStage = fitParam === "16x9" || fitParam === "16:9" || fitParam === "tv";
  const safePct  = Math.max(0, parseFloat(params.get("safe") || "0")) || 0; // percent of width/height

  // Debug HUD
  const debug = params.get("debug") === "1";

  // --------------- Fetch Data ---------------
  const sched    = await fetch(DATA_URL).then(r => r.json()).then(d => d.items || []).catch(() => []);
  const manifest = await fetch(MANIFEST_URL).then(r => r.json()).catch(() => ({}));
  const arenas   = Object.fromEntries(((manifest && manifest.arenas) || []).map(a => [a.arena_key, a]));

  // Helpers
  const dividerFor = (han) => (han === "A" ? "at" : "vs");
  const homeClass  = (han) => (han === "H" ? "is-home" : "is-away");
  const rowResult  = (g) => (g.result ? (g.result.split(" ")[0] || "") : ""); // "W"/"L"/"T"

  // Time abbreviation helper (unchanged from earlier)
  function abbrevTime(s) {
    if (!s || typeof s !== "string") return s;
    s = s.replace(/\s+/g, " ").trim();
    const orMatch = s.match(/^(\d{1,2})(?::00)?\s*OR\s*(\d{1,2})(?::00)?\s*(AM|PM)\s+([A-Z]{3})$/i);
    if (orMatch) return `${+orMatch[1]} or ${+orMatch[2]} ${orMatch[3].toUpperCase()} ${orMatch[4].toUpperCase()}`;
    const fullMatch = s.match(/^(\d{1,2})(?::(\d{2}))\s*(AM|PM)\s+([A-Z]{3})$/i);
    if (fullMatch) return (fullMatch[2] === "00")
      ? `${+fullMatch[1]} ${fullMatch[3].toUpperCase()} ${fullMatch[4].toUpperCase()}`
      : `${+fullMatch[1]}:${fullMatch[2]} ${fullMatch[3].toUpperCase()} ${fullMatch[4].toUpperCase()}`;
    const noTZ = s.match(/^(\d{1,2})(?::(\d{2}))\s*(AM|PM)$/i);
    if (noTZ) return (noTZ[2] === "00") ? `${+noTZ[1]} ${noTZ[3].toUpperCase()}` : `${+noTZ[1]}:${noTZ[2]} ${noTZ[3].toUpperCase()}`;
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
    new Date(iso + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

  // Choose “next” game: first not-final with a date; else last item
  const upcoming = sched.filter(g => g.status !== "final" && g.date).sort((a,b) => a.date.localeCompare(b.date));
  const nextGame = upcoming[0] || sched[sched.length - 1];

  // --------------- HERO (next game) ---------------
  {
    const nextBg    = $("#next-bg");
    const neLogo    = $("#ne-logo");
    const oppLogo   = $("#opp-logo");
    const nextOpp   = $("#next-opponent");
    const nextDT    = $("#next-datetime");
    const nextVenue = $("#next-venue");
    const nextTV    = $("#next-tv");

    if (nextGame) {
      if (nextGame.arena_key) nextBg.style.backgroundImage = `url(images/arenas/${nextGame.arena_key}.jpg)`;
      if (nextGame.nu_logo)  neLogo.src  = nextGame.nu_logo;
      if (nextGame.opp_logo) oppLogo.src = nextGame.opp_logo;

      const divider = dividerFor(nextGame.home_away);
      $("#divider").textContent = UI.showDividerLiteral ? (divider + ".") : "";

      const headline = (nextGame.home_away === "A" ? "Nebraska at " : "Nebraska vs. ") + (nextGame.opponent || nextGame.title || "");
      nextOpp.textContent = headline;

      nextDT.textContent = fmtHero(nextGame.date, nextGame.time_local);
      const city = nextGame.city || "";
      const arena = nextGame.arena || "";
      nextVenue.textContent = UI.showCityOnly || !arena ? city : `${city} • ${arena}`;

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

      // Rank pills (white)
      const setRank = (el, rank) => {
        if (rank && Number(rank) > 0) { el.textContent = `#${rank}`; el.classList.remove("hidden"); }
        else el.classList.add("hidden");
      };
      setRank($("#ne-rank"),  nextGame.nu_rank);
      setRank($("#opp-rank"), nextGame.opp_rank);
    }
  }

  // --------------- SCHEDULE GRID RENDER ---------------
  const stage       = $("#stage");
  const stageBox    = $("#stage-box");
  const stageCont   = $("#stage-content");
  const wrap        = $("#view-all .all-wrap");

  // Helper: build a small logo box with optional rank dot
  function buildMark(url, rank) {
    const w = document.createElement("span");
    w.className = "mark-wrap";
    const img = new Image();
    img.className = "mark";
    img.src = url || ""; img.alt = "";
    w.appendChild(img);
    if (rank && Number(rank) > 0) {
      const dot = document.createElement("span");
      dot.className = "rank-dot";
      dot.textContent = `#${rank}`;
      w.appendChild(dot);
    }
    return w;
  }

  // Make a single row
  function makeRow(g) {
    const row = document.createElement("div");
    row.className = `game-row ${homeClass(g.home_away)}`;

    // left date stack
    const when = document.createElement("div");
    when.className = "when";
    const dayStr = g.date ? fmtDay(g.date) : "";
    const [dow, mmmdd] = dayStr ? [dayStr.split(", ")[0], dayStr.split(", ")[1]] : ["",""];
    when.innerHTML = `<div class="date">${mmmdd || ""}</div><div class="dow">${dow || ""}</div>`;

    // sentence line: NE mark, divider, OPP mark, OPP name
    const line = document.createElement("div");
    line.className = "line";

    const neWrap  = buildMark(g.nu_logo, g.nu_rank);
    const divEl   = document.createElement("span");
    divEl.className = "divider";
    divEl.textContent = UI.showDividerLiteral ? dividerFor(g.home_away) : "";

    const oppWrap = buildMark(g.opp_logo, g.opp_rank);
    const oppSpan = document.createElement("span");
    oppSpan.className = "opp-name";
    oppSpan.textContent = g.opponent || g.title || "";

    line.appendChild(neWrap);
    line.appendChild(divEl);
    line.appendChild(oppWrap);
    line.appendChild(oppSpan);

    // chips cluster (result, time, city, tv)
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

    const city = g.city || ""; const arena = g.arena || "";
    if (city) {
      const c = document.createElement("span");
      c.className = "chip city";
      c.textContent = UI.showCityOnly || !arena ? city : `${city} • ${arena}`;
      chips.appendChild(c);
    }

    if (g.tv_logo) {
      const tv = document.createElement("span");
      tv.className = "chip tv";
      const img = new Image(); img.src = g.tv_logo; img.alt = "TV";
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
  }

  // Create two columns container
  const cols = document.createElement("div");
  cols.className = "cols";
  const colA = document.createElement("div");
  const colB = document.createElement("div");
  colA.className = "col"; colB.className = "col";
  cols.appendChild(colA); cols.appendChild(colB);
  wrap.innerHTML = ""; wrap.appendChild(cols);

  // Fill Column 1 completely (top-down), then Column 2 (top-down)
  const split = Math.ceil(sched.length / 2);
  sched.slice(0, split).forEach(g => colA.appendChild(makeRow(g)));
  sched.slice(split).forEach(g => colB.appendChild(makeRow(g)));

  // --------------- Stage Safe padding (for TVs with overscan) ---------------
  if (useStage && safePct > 0) {
    // Convert % into px against the stage box current size
    // This gets refined again after the first fit pass if viewport changes.
    const w = stageBox.clientWidth;
    const h = stageBox.clientHeight;
    document.documentElement.style.setProperty("--stage-safe-x", `${(w * safePct) | 0}px`);
    document.documentElement.style.setProperty("--stage-safe-y", `${(h * safePct) | 0}px`);
  }

  // --------------- Auto-fit routine (measure -> densify -> scale) ---------------
  function fitToStage() {
    // Reset scale so measurements are natural
    stageCont.style.transform = "translateX(-50%) scale(1)";

    // Optional auto-dense: try 'dense', then 'xdense' before scaling
    if (autodense) {
      document.body.classList.remove("xdense");
      // First check without extra compression; if it overflows, enable dense/xdense progressively
    }

    const boxRect = stageBox.getBoundingClientRect();
    const usableW = boxRect.width  - (parseFloat(getComputedStyle(stageBox).paddingLeft) + parseFloat(getComputedStyle(stageBox).paddingRight));
    const usableH = boxRect.height - (parseFloat(getComputedStyle(stageBox).paddingTop)  + parseFloat(getComputedStyle(stageBox).paddingBottom));

    // Measure once
    let contentRect = stageCont.getBoundingClientRect();
    let scale = Math.min(usableW / contentRect.width, usableH / contentRect.height, 1);

    // If overflow vertically and autodense allowed, step down density and re-measure
    function overflowY() { return contentRect.height > usableH; }

    if (autodense && overflowY()) {
      // Turn on 'dense' if not already present
      if (!document.body.classList.contains("dense")) {
        document.body.classList.add("dense");
        contentRect = stageCont.getBoundingClientRect();
      }
      if (overflowY()) {
        // Add extra compression
        document.body.classList.add("xdense");
        contentRect = stageCont.getBoundingClientRect();
      }
      scale = Math.min(usableW / contentRect.width, usableH / contentRect.height, 1);
    }

    // Apply final scale (include manual multiplier)
    const finalScale = Math.max(0.01, scale * manualScale);
    stageCont.style.transform = `translateX(-50%) scale(${finalScale})`;
    return { finalScale, usableW, usableH, contentW: contentRect.width, contentH: contentRect.height };
  }

  // Initial fit
  const fit1 = fitToStage();

  // Refit on resize/orientation changes (players sometimes resize viewport)
  let rAF;
  window.addEventListener("resize", () => {
    cancelAnimationFrame(rAF);
    rAF = requestAnimationFrame(() => fitToStage());
  });

  // --------------- View rotation / debug ---------------
  const vNext = $("#view-next");
  const vAll  = $("#view-all");
  const dbg   = $("#debug");

  function show(which) {
    vNext.classList.toggle("hidden", which !== "next");
    vAll.classList .toggle("hidden", which !== "all");
  }

  if (lockView === "next") show("next");
  else if (lockView === "all") show("all");
  else {
    let mode = "next"; show(mode);
    setInterval(() => {
      mode = mode === "next" ? "all" : "next";
      show(mode);
      // Refit stage when switching to schedule view
      if (mode === "all") fitToStage();
    }, (UI.rotateSeconds || 15) * 1000);
  }

  if (debug) {
    dbg.classList.remove("hidden");
    dbg.textContent = `games:${sched.length} • scale:${fit1.finalScale.toFixed(3)} • gap:${gapParam}px • colw:${!Number.isNaN(colwParam)? colwParam+"px":"fluid"} • dense:${document.body.classList.contains("dense")?"1":"0"} • xdense:${document.body.classList.contains("xdense")?"1":"0"}`;
  }
})();

/**
 * Schedule app bootstrap:
 * - Keeps your existing hero + schedule rendering
 * - Forces schedule grid to 2 columns that fill the 16:9 stage width
 * - Preserves rank dots and logo order (opp logo + rank placed before team name)
 * - Adds robust handling for ?colw= to cap TOTAL content width (both columns + gap)
 * - Defaults gap=5 unless overridden
 */

(async function () {
  const $ = (sel, el = document) => el.querySelector(sel);

  // -------- Config wires from index.html --------
  const DATA_URL = window.DATA_URL || "data/vb_schedule_normalized.json";
  const MANIFEST_URL = window.MANIFEST_URL || "data/arena_manifest.json";
  const UI = window.UI || { rotateSeconds: 15, showDividerLiteral: true, showCityOnly: true };

  // -------- URL params --------
  const params = new URLSearchParams(location.search);

  // 16:9 stage fit (default on). You can pass ?fit=off to disable scaling logic if you want.
  const fitParam = (params.get("fit") || "16x9").toLowerCase(); // "16x9" | "off"
  const fitEnabled = fitParam !== "off";

  // Global scale knob (still supported): ?scale=0.95 etc — applied after stage fit
  const scaleParam = parseFloat(params.get("scale"));
  const globalScale = !isNaN(scaleParam) && scaleParam > 0 ? scaleParam : 1;

  // Column gap (px). We’ll default this to 5 unless overridden.
  const gapParam = params.get("gap");
  const gap = !isNaN(parseInt(gapParam,10)) ? Math.max(0, parseInt(gapParam,10)) : 5;
  document.documentElement.style.setProperty("--cols-gap", `${gap}px`);

  // Optional: cap TOTAL content width by column width: ?colw=720  => max width = 720*2 + gap
  const colwParam = parseInt(params.get("colw") || "", 10);
  if (!Number.isNaN(colwParam) && colwParam > 320) {
    const total = (colwParam * 2) + gap;
    document.documentElement.style.setProperty("--cols-total-max", total + "px");
  } else {
    document.documentElement.style.setProperty("--cols-total-max", "none");
  }

  // Dense mode toggle (?dense=1)
  const dense = params.get("dense") === "1";
  if (dense) document.body.classList.add("dense");

  // Lock view (?view=next|all) + rotation seconds override
  const rot = parseInt(params.get("rot") || "", 10);
  if (!isNaN(rot) && rot > 0) UI.rotateSeconds = rot;
  const lockView = params.get("view"); // "next" | "all"

  // Debug HUD
  const debug = params.get("debug") === "1";

  // -------- Data fetch --------
  const sched = await fetch(DATA_URL).then(r => r.json()).then(d => d.items || []).catch(() => []);
  const manifest = await fetch(MANIFEST_URL).then(r => r.json()).catch(() => ({}));
  const arenas = Object.fromEntries(((manifest && manifest.arenas) || []).map(a => [a.arena_key, a]));

  // -------- Helpers --------

  const dividerFor = (han) => (han === "A" ? "at" : "vs"); // no dot here
  const homeClass = (han) => (han === "H" ? "is-home" : "is-away");
  const rowResult = (g) => (g.result ? (g.result.split(" ")[0] || "") : ""); // "W"/"L"/"T"

  // Abbreviate time strings for chips
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
      const hour = String(+fullMatch[1]);
      const mins = fullMatch[2];
      const ampm = fullMatch[3].toUpperCase();
      const tz = fullMatch[4].toUpperCase();
      return mins === "00" ? `${hour} ${ampm} ${tz}` : `${hour}:${mins} ${ampm} ${tz}`;
    }

    // "6:00 PM"
    const noTZ = s.match(/^(\d{1,2})(?::(\d{2}))\s*(AM|PM)$/i);
    if (noTZ) {
      const hour = String(+noTZ[1]);
      const mins = noTZ[2];
      const ampm = noTZ[3].toUpperCase();
      return mins === "00" ? `${hour} ${ampm}` : `${hour}:${mins} ${ampm}`;
    }

    return s; // TBA etc
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
  const upcoming = sched.filter(g => g.status !== "final" && g.date).sort((a, b) => a.date.localeCompare(b.date));
  const nextGame = upcoming[0] || sched[sched.length - 1];

  // -------- HERO (next game) --------
  const nextBg = $("#next-bg");
  const neLogo = $("#ne-logo");
  const oppLogo = $("#opp-logo");
  const nextOpp = $("#next-opponent");
  const nextDT  = $("#next-datetime");
  const nextVenue = $("#next-venue");
  const nextTV  = $("#next-tv");

  if (nextGame) {
    if (nextGame.arena_key) {
      nextBg.style.backgroundImage = `url(images/arenas/${nextGame.arena_key}.jpg)`;
    }

    if (nextGame.nu_logo) neLogo.src  = nextGame.nu_logo;
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

    // TV chip — logo preferred, fallback to text
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

    // rank pills (white for both per your preference)
    const neRankEl  = $("#ne-rank");
    const oppRankEl = $("#opp-rank");
    const setRank = (el, rank) => {
      if (rank && Number(rank) > 0) {
        el.textContent = `#${rank}`;
        el.classList.remove("hidden");
      } else {
        el.classList.add("hidden");
      }
    };
    setRank(neRankEl, nextGame.nu_rank);
    setRank(oppRankEl, nextGame.opp_rank);
  }

  // -------- SCHEDULE: 2-column grid (fill col 1 top-down, then col 2) --------

  // Find stage nodes
  const stage = $("#stage");
  const stageContent = $("#stage-content");

  // Apply stage scale for 16:9 fit + your manual scale
  if (fitEnabled && stage && stageContent) {
    // Compute the scale to fit the 16:9 content into the available area while respecting safe padding.
    // We treat the content’s “natural” size as its CSS size; scale is applied via transform below.
    const applyFit = () => {
      // Available pixels for the stage-content (inside stage-inner). We measure the real box.
      const inner = $(".stage-inner");
      if (!inner) return;

      const innerRect = inner.getBoundingClientRect();

      // We want a 16:9 box that fits inside innerRect. Compute scale factor against current content width/height.
      // The content has aspect-ratio: 16/9 and width:100%, so we consider width as limiting dimension.
      const targetW = innerRect.width;
      const targetH = innerRect.height;
      const ar = 16 / 9;

      // Compute the maximum content size that fits in innerRect respecting aspect ratio.
      let fitW = targetW;
      let fitH = fitW / ar;
      if (fitH > targetH) {
        fitH = targetH;
        fitW = fitH * ar;
      }

      // The stage-content is width:100% of its container. We simulate scale by comparing its current CSS pixel box.
      // Measure current unscaled content box:
      const contentRect = stageContent.getBoundingClientRect();
      const curW = contentRect.width || 1;
      const curH = contentRect.height || 1;

      // Scale to match the fit size, then multiply by your manual globalScale.
      const scaleToFit = Math.min(fitW / curW, fitH / curH);
      const finalScale = scaleToFit * globalScale;

      stageContent.style.transform = `translateX(-50%) scale(${finalScale})`;
    };

    // Prepare transform baseline
    stageContent.style.position = "absolute";
    stageContent.style.left = "50%";
    stageContent.style.top = "0";
    stageContent.style.transform = "translateX(-50%) scale(1)";

    // Initial fit + on resize
    applyFit();
    window.addEventListener("resize", applyFit);
  } else if (stageContent) {
    // If fit=off, still honor manual scale
    stageContent.style.position = "absolute";
    stageContent.style.left = "50%";
    stageContent.style.top = "0";
    stageContent.style.transformOrigin = "top center";
    stageContent.style.transform = `translateX(-50%) scale(${globalScale})`;
  }

  // Build the schedule DOM inside the stage-content
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

  // Small builder for a logo with an optional rank dot
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

  // Single row (card)
  const makeRow = (g) => {
    const row = document.createElement("div");
    row.className = `game-row ${homeClass(g.home_away)}`;

    // Left date stack
    const when = document.createElement("div");
    when.className = "when";
    const dayStr = g.date ? fmtDay(g.date) : "";
    const [dow, mmmdd] = dayStr ? [dayStr.split(", ")[0], dayStr.split(", ")[1]] : ["", ""];
    when.innerHTML = `<div class="date">${mmmdd || ""}</div><div class="dow">${dow || ""}</div>`;

    // Sentence line: NU logo • vs/at • OPP logo • Opponent Name
    const line = document.createElement("div");
    line.className = "line";

    const neWrap = buildMark(g.nu_logo, g.nu_rank);

    const divEl = document.createElement("span");
    divEl.className = "divider";
    divEl.textContent = UI.showDividerLiteral ? dividerFor(g.home_away) : "";

    const oppWrap = buildMark(g.opp_logo, g.opp_rank);

    const oppSpan = document.createElement("span");
    oppSpan.className = "opp-name";
    // Use plain team name (ranking stays only in the dot)
    oppSpan.textContent = g.opponent || g.title || "";

    line.appendChild(neWrap);
    line.appendChild(divEl);
    line.appendChild(oppWrap);
    line.appendChild(oppSpan);

    // Chips (result • time • city/arena • TV)
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
      tv.textContent = g.tv[0];
      chips.appendChild(tv);
    }

    row.appendChild(when);
    row.appendChild(line);
    row.appendChild(chips);
    return row;
  };

  // Order: fill Column 1 entirely (top-down) with the first half of games,
  // then Column 2 (top-down) with the second half.
  const split = Math.ceil(sched.length / 2);
  sched.slice(0, split).forEach(g => colA.appendChild(makeRow(g)));
  sched.slice(split).forEach(g => colB.appendChild(makeRow(g)));

  // -------- View rotation / debug --------
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
      `games: ${sched.length} • next: ${nextGame ? (nextGame.opponent || "") : "n/a"} • colw-total: ${getComputedStyle(document.documentElement).getPropertyValue("--cols-total-max") || "none"} • gap: ${gap}px`;
  }
})();

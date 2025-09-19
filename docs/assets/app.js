(async function () {
  const $ = (sel, el = document) => el.querySelector(sel);

  // Data endpoints (cache-busted in index.html)
  const DATA_URL = window.DATA_URL || "data/vb_schedule_normalized.json";
  const MANIFEST_URL = window.MANIFEST_URL || "data/arena_manifest.json";
  const UI = window.UI || { rotateSeconds: 15, showDividerLiteral: true, showCityOnly: true };

  // -----------------------
  // URL PARAMS / UI toggles
  // -----------------------
  const params = new URLSearchParams(location.search);

  // Global scale: scales the WHOLE schedule area (not the page)
  const scaleParam = parseFloat(params.get("scale"));
  const globalScale = !isNaN(scaleParam) && scaleParam > 0 ? scaleParam : 1;

  // 16:9 fit mode flag (fit=16x9 to enable); default is ON here
  const fitParam = (params.get("fit") || "").toLowerCase();
  const fit169 = (fitParam === "16x9" || fitParam === "1" || fitParam === "");

  // Optional column width override (pixels) – if not provided, columns are fluid 1fr each
  const colwParam = parseInt(params.get("colw"), 10);
  if (!isNaN(colwParam) && colwParam > 300) {
    document.documentElement.style.setProperty("--col-width", `${colwParam}px`);
  }

  // Optional center gap override (pixels)
  const gapParam = parseInt(params.get("gap"), 10);
  if (!isNaN(gapParam) && gapParam >= 0) {
    document.documentElement.style.setProperty("--cols-gap", `${gapParam}px`);
  }

  // Dense mode
  const dense = params.get("dense") === "1";
  if (dense) document.body.classList.add("dense");

  // Lock view + rotation seconds
  const rot = parseInt(params.get("rot"), 10);
  if (!isNaN(rot) && rot > 0) UI.rotateSeconds = rot;
  const lockView = params.get("view"); // "next" | "all"

  // Debug HUD
  const debug = params.get("debug") === "1";

  // -------------
  // Fetch content
  // -------------
  const sched = await fetch(DATA_URL).then(r => r.json()).then(d => d.items || []).catch(() => []);
  const manifest = await fetch(MANIFEST_URL).then(r => r.json()).catch(() => ({}));
  const arenas = Object.fromEntries(((manifest && manifest.arenas) || []).map(a => [a.arena_key, a]));

  // -----------------
  // Small text helpers
  // -----------------
  const dividerFor = han => (han === "A" ? "at" : "vs");
  const homeClass = han => (han === "H" ? "is-home" : "is-away");
  const rowResult = g => (g.result ? (g.result.split(" ")[0] || "") : ""); // "W"/"L"/"T"

  function abbrevTime(s){
    if(!s || typeof s!=="string") return s;
    s = s.replace(/\s+/g," ").trim();

    const orMatch = s.match(/^(\d{1,2})(?::00)?\s*OR\s*(\d{1,2})(?::00)?\s*(AM|PM)\s+([A-Z]{3})$/i);
    if(orMatch){
      const [_,h1,h2,ampm,tz] = orMatch;
      return `${+h1} or ${+h2} ${ampm.toUpperCase()} ${tz.toUpperCase()}`;
    }
    const full = s.match(/^(\d{1,2})(?::(\d{2}))\s*(AM|PM)\s+([A-Z]{3})$/i);
    if(full){
      const hour = String(+full[1]); const mins = full[2]; const ampm = full[3].toUpperCase(); const tz = full[4].toUpperCase();
      return mins==="00" ? `${hour} ${ampm} ${tz}` : `${hour}:${mins} ${ampm} ${tz}`;
    }
    const noTZ = s.match(/^(\d{1,2})(?::(\d{2}))\s*(AM|PM)$/i);
    if(noTZ){
      const hour = String(+noTZ[1]); const mins = noTZ[2]; const ampm = noTZ[3].toUpperCase();
      return mins==="00" ? `${hour} ${ampm}` : `${hour}:${mins} ${ampm}`;
    }
    return s;
  }
  const fmtHero = (iso,time)=>{
    if(!iso) return time ? abbrevTime(time) : "";
    const d = new Date(iso+"T00:00:00");
    const weekday = d.toLocaleDateString("en-US",{weekday:"long"}).toUpperCase();
    const mon = d.toLocaleDateString("en-US",{month:"short"});
    const day = d.getDate();
    return [weekday, `${mon} ${day}`, abbrevTime(time||"")].filter(Boolean).join(" • ");
  };
  const fmtDay = iso => new Date(iso+"T00:00:00").toLocaleDateString("en-US",{weekday:"short", month:"short", day:"numeric"});

  // -------------------------------
  // Choose “next” game for the hero
  // -------------------------------
  const upcoming = sched.filter(g => g.status !== "final" && g.date).sort((a,b) => a.date.localeCompare(b.date));
  const nextGame = upcoming[0] || sched[sched.length-1];

  // ------------
  // HERO wiring
  // ------------
  {
    const nextBg = $("#next-bg");
    const neLogo = $("#ne-logo");
    const oppLogo = $("#opp-logo");
    const nextOpp = $("#next-opponent");
    const nextDT  = $("#next-datetime");
    const nextVenue = $("#next-venue");
    const nextTV  = $("#next-tv");

    if (nextGame) {
      if (nextGame.arena_key) nextBg.style.backgroundImage = `url(images/arenas/${nextGame.arena_key}.jpg)`;
      if (nextGame.nu_logo) neLogo.src = nextGame.nu_logo;
      if (nextGame.opp_logo) oppLogo.src = nextGame.opp_logo;

      $("#divider").textContent = UI.showDividerLiteral ? (dividerFor(nextGame.home_away) + ".") : "";

      nextOpp.textContent =
        (nextGame.home_away === "A" ? "Nebraska at " : "Nebraska vs. ") +
        (nextGame.title || nextGame.opponent || "");

      nextDT.textContent = fmtHero(nextGame.date, nextGame.time_local);
      const city = nextGame.city || "", arena = nextGame.arena || "";
      nextVenue.textContent = UI.showCityOnly || !arena ? city : `${city} • ${arena}`;

      nextTV.innerHTML = "";
      if (nextGame.tv_logo){
        const chip = document.createElement("span"); chip.className = "tv-chip";
        const img = new Image(); img.src = nextGame.tv_logo; img.alt = "TV";
        img.onerror = () => chip.remove(); chip.appendChild(img); nextTV.appendChild(chip);
      } else if (Array.isArray(nextGame.tv) && nextGame.tv.length){
        const chip = document.createElement("span"); chip.className="tv-chip"; chip.textContent = nextGame.tv.join(" • ");
        nextTV.appendChild(chip);
      }

      const neRank = $("#ne-rank"), oppRank = $("#opp-rank");
      const setRank = (el,rank)=>{ if(rank>0){ el.textContent = `#${rank}`; el.classList.remove("hidden"); } else el.classList.add("hidden"); };
      setRank(neRank, nextGame.nu_rank); setRank(oppRank, nextGame.opp_rank);
    }
  }

  // --------------------------------------------
  // SCHEDULE GRID inside the 16:9 stage container
  // --------------------------------------------
  const stage = $("#stage");
  const allWrap = $("#view-all .all-wrap");

  // Apply the global scale to the stage (so everything inside scales uniformly)
  stage.style.transform = `scale(${globalScale})`;
  stage.style.transformOrigin = "center center";

  // Build the two columns container
  const cols = document.createElement("div");
  cols.className = "cols";
  const colA = document.createElement("div"); colA.className = "col";
  const colB = document.createElement("div"); colB.className = "col";
  cols.appendChild(colA); cols.appendChild(colB);
  allWrap.appendChild(cols);

  // Small helper: logo + tiny rank dot wrapper
  function buildMark(url, rank){
    const wrap = document.createElement("span");
    wrap.className = "mark-wrap";
    const img = new Image();
    img.className = "mark"; img.src = url || ""; img.alt = "";
    wrap.appendChild(img);
    if (rank && Number(rank) > 0){
      const dot = document.createElement("span");
      dot.className = "rank-dot";
      dot.textContent = `#${rank}`;
      wrap.appendChild(dot);
    }
    return wrap;
  }

  // Compose a single schedule row
  function makeRow(g){
    const row = document.createElement("div");
    row.className = `game-row ${homeClass(g.home_away)}`;

    // left date stack
    const when = document.createElement("div"); when.className = "when";
    const dayStr = g.date ? fmtDay(g.date) : "";
    const [dow, mmmdd] = dayStr ? [dayStr.split(", ")[0], dayStr.split(", ")[1]] : ["",""];
    when.innerHTML = `<div class="date">${mmmdd || ""}</div><div class="dow">${dow || ""}</div>`;

    // sentence line
    const line = document.createElement("div"); line.className = "line";

    // Nebraska mark on the far left, then “vs/at”, then opponent mark + name
    const neWrap  = buildMark(g.nu_logo,  g.nu_rank);
    const divEl   = document.createElement("span");
    divEl.className = "divider"; divEl.textContent = UI.showDividerLiteral ? dividerFor(g.home_away) : "";
    const oppWrap = buildMark(g.opp_logo, g.opp_rank);
    const oppSpan = document.createElement("span"); oppSpan.className = "opp-name";
    oppSpan.textContent = g.opponent || g.title || "";

    line.appendChild(neWrap);
    line.appendChild(divEl);
    line.appendChild(oppWrap);   // opponent logo (with rank) sits BEFORE the name
    line.appendChild(oppSpan);

    // right-side chips
    const chips = document.createElement("div");

    if (g.status === "final" && g.result){
      const res = document.createElement("span");
      res.className = `result ${rowResult(g)}`; res.textContent = g.result;
      chips.appendChild(res);
    }
    if (g.time_local){
      const t = document.createElement("span"); t.className = "chip";
      t.textContent = abbrevTime(g.time_local); chips.appendChild(t);
    }
    const city = g.city || "", arena = g.arena || "";
    if (city){
      const c = document.createElement("span"); c.className = "chip city";
      c.textContent = UI.showCityOnly || !arena ? city : `${city} • ${arena}`;
      chips.appendChild(c);
    }
    if (g.tv_logo){
      const tv = document.createElement("span"); tv.className = "chip tv";
      const img = new Image(); img.src = g.tv_logo; img.alt = "TV";
      img.onerror = () => tv.remove(); tv.appendChild(img); chips.appendChild(tv);
    } else if (Array.isArray(g.tv) && g.tv.length){
      const tv = document.createElement("span"); tv.className = "chip tv";
      tv.textContent = g.tv[0]; chips.appendChild(tv);
    }

    row.appendChild(when);
    row.appendChild(line);
    row.appendChild(chips);
    return row;
  }

  // -----------------------------
  // COLUMN ORDERING (top-down)
  // -----------------------------
  // We want: first half of the season in column 1 (top→down),
  // then the remaining games start at the top of column 2 (top→down).
  const split = Math.ceil(sched.length / 2);
  sched.slice(0, split).forEach(g => colA.appendChild(makeRow(g)));
  sched.slice(split).forEach(g => colB.appendChild(makeRow(g)));

  // ----------------------
  // View rotation / debug
  // ----------------------
  const vNext = $("#view-next"), vAll = $("#view-all"), dbg = $("#debug");

  function show(which){
    vNext.classList.toggle("hidden", which !== "next");
    vAll.classList.toggle("hidden", which !== "all");
  }

  if (lockView === "next") show("next");
  else if (lockView === "all") show("all");
  else { let mode="next"; show(mode); setInterval(()=>{ mode = (mode==="next")? "all" : "next"; show(mode); }, (UI.rotateSeconds||15)*1000); }

  if (debug){
    dbg.classList.remove("hidden");
    dbg.textContent = `games: ${sched.length} • next: ${nextGame ? (nextGame.opponent || "") : "n/a"} • scale:${globalScale} • fit:${fit169 ? "16:9" : "off"}`;
  }
})();

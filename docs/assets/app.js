(async function(){
  const $ = (sel, el=document)=>el.querySelector(sel);

  const fmtDate = (iso)=>{
    if(!iso) return "TBA";
    const d = new Date(iso+"T00:00:00");
    return d.toLocaleDateString('en-US',{weekday:'short', month:'short', day:'numeric'});
  };

  const rows   = await fetch('data/vb_schedule_normalized.json').then(r=>r.json()).then(d=>d.items||[]);
  const arenas = await fetch('data/arena_manifest.json').then(r=>r.json()).catch(()=>({}));
  const arenaMap = Object.fromEntries((arenas.arenas||[]).map(a=>[a.arena_key,a]));

  const host = $('#schedule');
  const colA = document.createElement('div');
  const colB = document.createElement('div');
  host.appendChild(colA); host.appendChild(colB);

  const imgEl = (src, cls="")=>{
    if(!src) return null;
    const i = new Image();
    i.src = src; i.alt = ""; i.className = cls;
    i.decoding = "async"; i.loading = "lazy";
    return i;
  };

  const mkChip = (text)=>{
    const span = document.createElement('span');
    span.className = 'chip';
    span.appendChild(document.createTextNode(text));
    return span;
  };

  const mkLogoChip = (logoUrl, label){
    const span = document.createElement('span');
    span.className = 'chip logo';
    const icon = imgEl(logoUrl);
    if(icon){ icon.style.height = "14px"; span.appendChild(icon); }
    if(label){ span.appendChild(document.createTextNode(" " + label)); }
    return span;
  };

  rows.forEach((g,i)=>{
    const card = document.createElement('article');
    card.className = 'card';
    if(g.arena_key && arenaMap[g.arena_key]){
      card.dataset.arena = g.arena_key;
      // optional bg:
      // card.style.backgroundImage = `url(../images/arenas/${g.arena_key}.jpg)`;
    }

    const left = document.createElement('div');
    left.className = 'datebox';
    left.innerHTML = `<div class="dow">${fmtDate(g.date)}</div><div>${g.time_local || ''}</div>`;

    const right = document.createElement('div');

    // Title row: NU logo, #NU (if present), Opponent title, Opp logo
    const title = document.createElement('div');
    title.className = 'title';

    const nuLogo = imgEl(g.nu_logo, 'teamlogo');
    if(nuLogo){ nuLogo.style.height = "18px"; nuLogo.style.marginRight = "6px"; title.appendChild(nuLogo); }

    if(g.nu_rank){
      const b = document.createElement('span'); b.className='badge'; b.textContent = `#${g.nu_rank}`; title.appendChild(b);
    }

    const t = document.createElement('span');
    t.textContent = g.title || g.opponent;
    t.style.marginRight = "6px";
    title.appendChild(t);

    const oppLogo = imgEl(g.opp_logo, 'teamlogo');
    if(oppLogo){ oppLogo.style.height = "18px"; title.appendChild(oppLogo); }

    right.appendChild(title);

    // Meta pills under the title
    const meta = document.createElement('div');
    meta.className = 'meta';
    if(g.home_away){ meta.appendChild(mkChip({H:'Home',A:'Away',N:'Neutral'}[g.home_away])); }
    if(g.city){ meta.appendChild(mkChip(g.city)); }
    if(g.arena){ meta.appendChild(mkChip(g.arena)); }

    // TV: prefer a scraped logo (BTN/FS1/etc.). Fallback to text chips if provided.
    if(g.tv_logo){
      meta.appendChild(mkLogoChip(g.tv_logo));
    } else if(Array.isArray(g.tv) && g.tv.length){
      g.tv.forEach(n => meta.appendChild(mkChip(n)));
    }

    if(g.result){
      const r = document.createElement('span'); r.className = `result ${g.result_css||''}`; r.textContent = g.result; meta.appendChild(r);
    }

    right.appendChild(meta);

    card.appendChild(left); card.appendChild(right);
    (i%2?colB:colA).appendChild(card);
  });
})();

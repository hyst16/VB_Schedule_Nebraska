(async function(){
  const $ = (sel, el=document)=>el.querySelector(sel);
  const $$ = (sel, el=document)=>[...el.querySelectorAll(sel)];

  const fmtDate = (iso)=>{
    if(!iso) return "TBA";
    const d = new Date(iso+"T00:00:00");
    return d.toLocaleDateString('en-US',{weekday:'short', month:'short', day:'numeric'});
  };

  const rows = await fetch(window.VB_JSON).then(r=>r.json()).then(d=>d.items||[]);
  const arenas = await fetch(window.ARENA_JSON).then(r=>r.json()).catch(()=>({}));
  const arenaMap = Object.fromEntries((arenas.arenas||[]).map(a=>[a.arena_key,a]));

  const host = $('#schedule');

  const mkChip = (text, img)=>{
    const span = document.createElement('span');
    span.className = 'chip';
    if(img){
      const i = new Image(); i.src = img; i.alt = '';
      span.appendChild(i);
    }
    span.appendChild(document.createTextNode(text));
    return span;
  };

  const mkCard = (g)=>{
    const card = document.createElement('article');
    card.className = 'card';
    if(g.arena_key && arenaMap[g.arena_key]){
      card.dataset.arena = g.arena_key;
      // Optional: if you drop images/arenas/<slug>.jpg, uncomment below to set bg
      // card.style.backgroundImage = `url(../images/arenas/${g.arena_key}.jpg)`;
    }

    const left = document.createElement('div');
    left.className = 'datebox';
    left.innerHTML = `<div class="dow">${fmtDate(g.date)}</div><div>${g.time_local || ''}</div>`;

    const right = document.createElement('div');

    const title = document.createElement('div');
    title.className = 'title';
    if(g.nu_rank){
      const b = document.createElement('span'); b.className='badge'; b.textContent = `#${g.nu_rank}`; title.appendChild(b);
    }
    const t = document.createElement('span'); t.textContent = g.title || g.opponent; title.appendChild(t);
    right.appendChild(title);

    const meta = document.createElement('div');
    meta.className = 'meta';

    if(g.home_away){ meta.appendChild(mkChip({H:'Home',A:'Away',N:'Neutral'}[g.home_away])); }
    if(g.city){ meta.appendChild(mkChip(g.city)); }
    if(g.arena){ meta.appendChild(mkChip(g.arena)); }

    if(g.result){
      const r = document.createElement('span'); r.className = `result ${g.result_css||''}`; r.textContent = g.result; meta.appendChild(r);
    }

    right.appendChild(meta);

    card.appendChild(left); card.appendChild(right);
    return card;
  };

  // Render in two columns by alternating
  const colA = document.createElement('div');
  const colB = document.createElement('div');
  host.appendChild(colA); host.appendChild(colB);

  rows.forEach((g,i)=> (i%2?colB:colA).appendChild(mkCard(g)) );
})();

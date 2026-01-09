import { Store } from "./store.js";
import { saveTeamsToHistory } from "./supabaseApi.js";

(function () {
  const $ = (id) => document.getElementById(id);
  function esc(s){return String(s||"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");}
  function avg(arr){ return arr?.length ? arr.reduce((s,p)=>s+(Number(p.rating)||0),0)/arr.length : 0; }
  function counts(arr){
    const d = (arr||[]).filter(p=>p.side==="D").length;
    const r = (arr||[]).filter(p=>p.side==="R").length;
    return { d, r };
  }

  function poolPlayers(){
    const set = new Set(Store.state?.pool || []);
    return (Store.players||[]).filter(p=>set.has(p.id));
  }

  function validPool(players){
    if (!players.length) return {ok:false,msg:"Selecciona jugadores al pool."};
    if (players.length%4!==0) return {ok:false,msg:"Pool debe ser múltiplo de 4."};
    const d = players.filter(p=>p.side==="D").length;
    const r = players.filter(p=>p.side==="R").length;
    if (d!==r) return {ok:false,msg:"Debe haber igual cantidad de D y R."};
    return {ok:true,msg:""};
  }

  function mini(p){ return {id:p.id,name:p.name,side:p.side,rating:p.rating}; }

  // ---------- AUTOARMAR (random controlado + balanceado) ----------
  function autoBalanceSmart(pool){
    const rights = pool.filter(p=>p.side==="D").slice().sort((a,b)=>b.rating-a.rating);
    const lefts  = pool.filter(p=>p.side==="R").slice().sort((a,b)=>b.rating-a.rating);

    const targetSize = pool.length / 2;
    const targetPerSide = pool.length / 4;

    const A=[], B=[];
    const sum = (t)=>t.reduce((s,p)=>s+(p.rating||0),0);
    const countSide = (t,side)=>t.filter(p=>p.side===side).length;

    const rand = () => Math.random();
    const shuffle = (arr) => {
      const a = arr.slice();
      for (let i=a.length-1;i>0;i--){
        const j = Math.floor(Math.random()*(i+1));
        [a[i],a[j]] = [a[j],a[i]];
      }
      return a;
    };

    const topL = lefts.slice(0,4);
    const topR = rights.slice(0,4);

    function bestSplitTop4(list){
      if (list.length < 4) {
        const a=[], b=[];
        list.forEach((p,i)=>(i%2===0?a:b).push(p));
        return {a,b};
      }
      const c1a=[list[0],list[2]], c1b=[list[1],list[3]];
      const c2a=[list[0],list[3]], c2b=[list[1],list[2]];
      const d1 = Math.abs(c1a.reduce((s,p)=>s+p.rating,0) - c1b.reduce((s,p)=>s+p.rating,0));
      const d2 = Math.abs(c2a.reduce((s,p)=>s+p.rating,0) - c2b.reduce((s,p)=>s+p.rating,0));
      if (d1 === d2) return rand() < 0.5 ? {a:c1a,b:c1b} : {a:c2a,b:c2b};
      return d1 < d2 ? {a:c1a,b:c1b} : {a:c2a,b:c2b};
    }

    // 1) Reves top4 -> 2 y 2
    const splitL = bestSplitTop4(topL);
    splitL.a.forEach(p=>A.push(p));
    splitL.b.forEach(p=>B.push(p));

    // 2) Derecha top4 -> 2 y 2 pero considerando el estado (A/B ya tiene reves)
    function bestSplitTop4ConsideringState(list){
      if (list.length < 4) {
        const a=[], b=[];
        list.forEach((p,i)=>(i%2===0?a:b).push(p));
        return {a,b};
      }
      const options = [
        { a:[list[0],list[2]], b:[list[1],list[3]] },
        { a:[list[0],list[3]], b:[list[1],list[2]] }
      ];

      const spread = Math.abs((list[0]?.rating||0) - (list[3]?.rating||0));
      const useRandomBias = spread <= 1;

      let best = null;
      let bestDiff = Infinity;

      for (const opt of options) {
        const aSum = sum(A) + opt.a.reduce((s,p)=>s+p.rating,0);
        const bSum = sum(B) + opt.b.reduce((s,p)=>s+p.rating,0);
        const diff = Math.abs(aSum - bSum);
        if (diff < bestDiff) { bestDiff = diff; best = opt; }
        else if (diff === bestDiff && useRandomBias) { if (rand() < 0.5) best = opt; }
      }

      if (useRandomBias && rand() < 0.35) best = options[Math.floor(rand()*options.length)];
      return best;
    }

    const splitR = bestSplitTop4ConsideringState(topR);
    splitR.a.forEach(p=>A.push(p));
    splitR.b.forEach(p=>B.push(p));

    const used = new Set([...A,...B].map(p=>p.id));
    const rest = shuffle(pool.filter(p=>!used.has(p.id)));

    for (const p of rest) {
      if (A.length >= targetSize && B.length >= targetSize) break;

      const aOk = A.length < targetSize && countSide(A,p.side) < targetPerSide;
      const bOk = B.length < targetSize && countSide(B,p.side) < targetPerSide;

      if (aOk && !bOk) { A.push(p); continue; }
      if (!aOk && bOk) { B.push(p); continue; }
      if (!aOk && !bOk) continue;

      const aSum = sum(A), bSum = sum(B);
      const diffIfA = Math.abs((aSum + p.rating) - bSum);
      const diffIfB = Math.abs(aSum - (bSum + p.rating));

      const jitter = (rand() - 0.5) * 0.2;
      const scoreA = diffIfA + jitter;
      const scoreB = diffIfB - jitter;

      (scoreA <= scoreB ? A : B).push(p);
    }

    return { A, B };
  }

  function render(){
    const mount = $("teamsMount");
    if (!mount) return;
    if (!Store.ready){
      mount.innerHTML = `<div class="card" style="margin-top:10px;"><div class="hint muted">Inicia sesión para usar Equipos.</div></div>`;
      return;
    }

    const s = Store.state || {};
    if (!s.session_date) Store.setState({ session_date: new Date().toISOString().slice(0,10) });

    const pool = poolPlayers();
    const val = validPool(pool);

    const A = (s.team_a||[]);
    const B = (s.team_b||[]);
    const avgA = avg(A), avgB = avg(B);

    const cPool = counts(pool);
    const cA = counts(A);
    const cB = counts(B);

    mount.innerHTML = `
      <div class="card" style="margin-top:10px;">
        <div style="display:flex; gap:10px; justify-content:space-between; flex-wrap:wrap; align-items:end;">
          <div>
            <label>Fecha</label>
            <input id="sessionDate" type="date" value="${esc(Store.state?.session_date)}" />
            <div class="hint ${val.ok?"ok":"warn"}" style="margin-top:6px;">
              ${val.ok ? "✅ Pool válido" : ("⚠️ " + val.msg)}
            </div>
          </div>
          <div class="btns">
            <button class="ghost" id="clearTeams">Limpiar equipos</button>
            <button class="primary" id="autoTeams" ${val.ok?"":"disabled"}>Autoarmar (balanceado)</button>
            <button class="ghost" id="saveTeams" ${A.length && B.length ? "" : "disabled"}>Guardar equipos</button>
          </div>
        </div>

        <div class="hint muted" style="margin-top:10px;">
          Pool: <b>${pool.length}</b> (D:${cPool.d} • R:${cPool.r}) •
          A: Prom <b>${avgA.toFixed(2)}</b> (D:${cA.d} • R:${cA.r}) •
          B: Prom <b>${avgB.toFixed(2)}</b> (D:${cB.d} • R:${cB.r}) •
          Δ: <b>${Math.abs(avgA-avgB).toFixed(2)}</b>
        </div>
      </div>

      <div class="card" style="margin-top:12px;">
        <h3 style="margin:0 0 10px;">Pool (${pool.length})</h3>
        <div class="hint muted" style="margin-bottom:10px;">Selecciona el pool en Base. Aquí se ve en vivo.</div>
        <div id="poolList" style="display:grid; gap:10px;"></div>
      </div>

      <div class="card" style="margin-top:12px;">
        <h3 style="margin:0 0 10px;">Equipos</h3>
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:12px;">
          <div class="card" style="background: rgba(0,0,0,.18);">
            <h4 style="margin:0 0 10px;">Equipo A</h4>
            <div class="hint muted" style="margin-bottom:10px;">D:${cA.d} • R:${cA.r}</div>
            <div id="teamA" style="display:grid; gap:8px;"></div>
          </div>
          <div class="card" style="background: rgba(0,0,0,.18);">
            <h4 style="margin:0 0 10px;">Equipo B</h4>
            <div class="hint muted" style="margin-bottom:10px;">D:${cB.d} • R:${cB.r}</div>
            <div id="teamB" style="display:grid; gap:8px;"></div>
          </div>
        </div>
      </div>

      <div id="teamsStatus" class="hint" style="margin-top:10px;"></div>
    `;

    const status = $("teamsStatus");
    const setStatus = (m,k="")=>{ if(!status) return; status.textContent=m||""; status.className="hint "+k; };

    $("sessionDate")?.addEventListener("change", (e)=>{
      Store.setState({ session_date: e.target.value });
    });

    const poolEl = $("poolList");
    if (poolEl){
      poolEl.innerHTML = pool.length ? pool.map(p=>`
        <div class="card" style="background: rgba(0,0,0,.18); padding:10px; display:flex; justify-content:space-between; align-items:center;">
          <div><b>${esc(p.name)}</b><div class="hint muted">${p.side==="D"?"D":"R"} • ${p.rating}</div></div>
          <div class="btns">
            <button class="ghost" data-to="A" data-id="${p.id}">→ A</button>
            <button class="ghost" data-to="B" data-id="${p.id}">→ B</button>
          </div>
        </div>
      `).join("") : `<div class="hint muted">No hay pool.</div>`;
    }

    function renderTeam(elId, team){
      const el = $(elId);
      if (!el) return;
      el.innerHTML = team.length ? team.map(p=>`
        <div class="card" style="background: rgba(0,0,0,.12); padding:10px; display:flex; justify-content:space-between; align-items:center;">
          <div><b>${esc(p.name)}</b><div class="hint muted">${p.side} • ${p.rating}</div></div>
          <button class="ghost" data-remove="${p.id}">Quitar</button>
        </div>
      `).join("") : `<div class="hint muted">Vacío</div>`;
    }
    renderTeam("teamA", A);
    renderTeam("teamB", B);

    function setTeams(newA,newB){
      Store.setState({ team_a: newA.map(mini), team_b: newB.map(mini) });
    }

    mount.querySelectorAll('[data-to]').forEach(btn=>{
      btn.addEventListener("click", ()=>{
        const id = btn.getAttribute("data-id");
        const to = btn.getAttribute("data-to");
        if (A.some(x=>x.id===id) || B.some(x=>x.id===id)) return;
        const p = pool.find(x=>x.id===id);
        if (!p) return;
        if (to==="A") setTeams([...A,p],[...B]);
        else setTeams([...A],[...B,p]);
      });
    });

    mount.querySelectorAll('[data-remove]').forEach(btn=>{
      btn.addEventListener("click", ()=>{
        const id = btn.getAttribute("data-remove");
        setTeams(A.filter(x=>x.id!==id), B.filter(x=>x.id!==id));
      });
    });

    $("clearTeams")?.addEventListener("click", ()=> Store.setState({ team_a: [], team_b: [] }));

    $("autoTeams")?.addEventListener("click", ()=>{
      if (!val.ok) return;
      const {A:AA,B:BB} = autoBalanceSmart(pool);
      setTeams(AA,BB);
    });

    $("saveTeams")?.addEventListener("click", async ()=>{
      try{
        setStatus("Guardando equipos…","muted");
        const date = Store.state?.session_date || new Date().toISOString().slice(0,10);
        const total = pool.length;
        await saveTeamsToHistory(date, total, Store.state.team_a || [], Store.state.team_b || []);
        setStatus("✅ Equipos guardados en Historial.","ok");
      }catch(e){ console.error(e); setStatus("❌ Error al guardar equipos.","error"); }
    });
  }

  window.OP = window.OP || {};
  const prev = window.OP.refresh;
  window.OP.refresh = (view)=>{ if(typeof prev==="function") prev(view); if(view==="teams") render(); };

  window.addEventListener("op:storeReady", render);
  window.addEventListener("op:playersChanged", render);
  window.addEventListener("op:stateChanged", render);
  document.addEventListener("DOMContentLoaded", render);
})();

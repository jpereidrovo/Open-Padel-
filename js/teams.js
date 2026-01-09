import { Store } from "./store.js";
import { saveTeamsToHistory } from "./supabaseApi.js";

(function () {
  const $ = (id) => document.getElementById(id);
  function esc(s){return String(s||"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");}
  function avg(arr){ return arr?.length ? arr.reduce((s,p)=>s+(Number(p.rating)||0),0)/arr.length : 0; }

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

  // auto-balance simple + robusto
  function autoBalance(pool){
    const D = pool.filter(p=>p.side==="D").sort((a,b)=>b.rating-a.rating);
    const R = pool.filter(p=>p.side==="R").sort((a,b)=>b.rating-a.rating);
    const A=[],B=[];
    if (D[0]) A.push(D[0]); if (D[1]) B.push(D[1]);
    if (R[0]) A.push(R[0]); if (R[1]) B.push(R[1]);
    const used = new Set([...A,...B].map(x=>x.id));
    const rest = pool.filter(p=>!used.has(p.id)).sort((a,b)=>b.rating-a.rating);

    const target = pool.length/2;
    const targetSide = pool.length/4;

    const countSide = (t,side)=>t.filter(p=>p.side===side).length;
    const sum = (t)=>t.reduce((s,p)=>s+(p.rating||0),0);

    for (const p of rest){
      const aOk = A.length<target && countSide(A,p.side)<targetSide;
      const bOk = B.length<target && countSide(B,p.side)<targetSide;
      if (aOk && !bOk){ A.push(p); continue; }
      if (!aOk && bOk){ B.push(p); continue; }
      const diffA = Math.abs((sum(A)+p.rating) - sum(B));
      const diffB = Math.abs(sum(A) - (sum(B)+p.rating));
      (diffA<=diffB?A:B).push(p);
    }
    return {A,B};
  }

  function render(){
    const mount = $("teamsMount");
    if (!mount) return;
    if (!Store.ready){ mount.innerHTML = `<div class="card" style="margin-top:10px;"><div class="hint muted">Inicia sesión para usar Equipos.</div></div>`; return; }

    const s = Store.state || {};
    if (!s.session_date) Store.setState({ session_date: new Date().toISOString().slice(0,10) });

    const pool = poolPlayers();
    const val = validPool(pool);

    const A = (s.team_a||[]);
    const B = (s.team_b||[]);
    const avgA = avg(A), avgB = avg(B);

    mount.innerHTML = `
      <div class="card" style="margin-top:10px;">
        <div style="display:flex; gap:10px; justify-content:space-between; flex-wrap:wrap; align-items:end;">
          <div>
            <label>Fecha</label>
            <input id="sessionDate" type="date" value="${esc(Store.state?.session_date)}" />
            <div class="hint ${val.ok?"ok":"warn"}" style="margin-top:6px;">${val.ok?"✅ Pool válido":("⚠️ "+val.msg)}</div>
          </div>
          <div class="btns">
            <button class="ghost" id="clearTeams">Limpiar equipos</button>
            <button class="primary" id="autoTeams" ${val.ok?"":"disabled"}>Autoarmar (balanceado)</button>
            <button class="ghost" id="saveTeams" ${A.length && B.length ? "" : "disabled"}>Guardar equipos</button>
          </div>
        </div>
        <div class="hint muted" style="margin-top:10px;">Pool: <b>${pool.length}</b> jugadores • Prom A: <b>${avgA.toFixed(2)}</b> • Prom B: <b>${avgB.toFixed(2)}</b> • Δ: <b>${Math.abs(avgA-avgB).toFixed(2)}</b></div>
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
            <div id="teamA" style="display:grid; gap:8px;"></div>
          </div>
          <div class="card" style="background: rgba(0,0,0,.18);">
            <h4 style="margin:0 0 10px;">Equipo B</h4>
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

    // pool list
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
      const {A:AA,B:BB} = autoBalance(pool);
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

// teams.js — Equipos A/B con Autoarmado balanceado
(function () {
  const KEY_PLAYERS = "op_players_v1";
  const KEY_POOL = "op_pool_v1";
  const KEY_TOTAL = "op_totalPlayers_v1";
  const KEY_TEAM_A = "op_teamA_v1";
  const KEY_TEAM_B = "op_teamB_v1";

  const $ = (id) => document.getElementById(id);
  const loadJSON = (k, fb) => { try { const r = localStorage.getItem(k); return r ? JSON.parse(r) : fb; } catch { return fb; } };
  const saveJSON = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

  function getPlayers() { return loadJSON(KEY_PLAYERS, []); }
  function getPool() { return new Set(loadJSON(KEY_POOL, [])); }
  function getTeamA() { return new Set(loadJSON(KEY_TEAM_A, [])); }
  function getTeamB() { return new Set(loadJSON(KEY_TEAM_B, [])); }
  function setTeamA(s) { saveJSON(KEY_TEAM_A, [...s]); }
  function setTeamB(s) { saveJSON(KEY_TEAM_B, [...s]); }
  function setPool(s) { saveJSON(KEY_POOL, [...s]); }

  function getTotalPlayers() {
    const v = Number(localStorage.getItem(KEY_TOTAL) || 16);
    return [4, 8, 12, 16, 20, 24].includes(v) ? v : 16;
  }

  function avg(set, players) {
    const arr = [...set].map(id => players.find(p => p.id === id)).filter(Boolean);
    if (!arr.length) return 0;
    return arr.reduce((s,p)=>s+p.rating,0) / arr.length;
  }

  function autoBuild(players, poolSet) {
    const total = getTotalPlayers();
    const size = total / 2;
    const need = size / 2;

    const pool = [...poolSet].map(id => players.find(p => p.id === id)).filter(Boolean);
    if (pool.length !== total) {
      return { ok:false, msg:`El pool debe tener ${total} jugadores.` };
    }

    const Ds = pool.filter(p=>p.side==="D").sort((a,b)=>b.rating-a.rating);
    const Rs = pool.filter(p=>p.side==="R").sort((a,b)=>b.rating-a.rating);

    if (Ds.length !== total/2 || Rs.length !== total/2) {
      return { ok:false, msg:"El pool debe estar balanceado D/R." };
    }

    const A = new Set(), B = new Set();

    // semillas: mejores D y R
    const seeds = [Ds.shift(), Rs.shift(), Ds.shift(), Rs.shift()].filter(Boolean);
    let sumA = 0, sumB = 0;

    for (const p of seeds) {
      if (sumA <= sumB) { A.add(p.id); sumA += p.rating; }
      else { B.add(p.id); sumB += p.rating; }
    }

    function countSide(set, side) {
      let c = 0;
      for (const id of set) {
        const p = pool.find(x=>x.id===id);
        if (p && p.side===side) c++;
      }
      return c;
    }

    function canAdd(set, p) {
      if (set.size >= size) return false;
      if (p.side==="D" && countSide(set,"D")>=need) return false;
      if (p.side==="R" && countSide(set,"R")>=need) return false;
      return true;
    }

    const rest = [...Ds, ...Rs].sort((a,b)=>b.rating-a.rating);

    for (const p of rest) {
      const first = avg(A,pool)<=avg(B,pool) ? A : B;
      const second = first===A ? B : A;
      if (!canAdd(first,p)) {
        if (!canAdd(second,p)) return { ok:false, msg:"No se pudo balancear." };
        second.add(p.id);
      } else {
        first.add(p.id);
      }
    }

    return {
      ok:true,
      A, B,
      msg:`Autoarmado OK • Promedios A=${avg(A,pool).toFixed(2)} B=${avg(B,pool).toFixed(2)}`
    };
  }

  function render() {
    const mount = $("teamsMount");
    if (!mount) return;

    const players = getPlayers();
    let pool = getPool();
    let A = getTeamA();
    let B = getTeamB();

    // limpieza
    for (const id of A) B.delete(id);
    for (const id of A) pool.delete(id);
    for (const id of B) pool.delete(id);

    setPool(pool); setTeamA(A); setTeamB(B);

    const list = (ids) => [...ids].map(id=>players.find(p=>p.id===id)).filter(Boolean);

    mount.innerHTML = `
      <div class="btns" style="margin-bottom:10px;">
        <button class="primary" id="autoBtn">Autoarmar (balanceado)</button>
        <button class="ghost" id="clearBtn">Limpiar equipos</button>
      </div>

      <div class="hint" id="statusTeams"></div>

      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-top:10px;">
        <div class="card"><h3>Pool</h3>${list(pool).map(p=>row(p,"A","B")).join("")}</div>
        <div class="card"><h3>Equipo A</h3>${list(A).map(p=>row(p,"POOL")).join("")}</div>
        <div class="card"><h3>Equipo B</h3>${list(B).map(p=>row(p,"POOL")).join("")}</div>
      </div>
    `;

    function row(p,a,b) {
      return `
        <div class="card" style="padding:8px;margin:6px 0;">
          <b>${p.name}</b> (${p.side}) ${p.rating}
          <div class="btns" style="margin-top:4px;">
            ${a?`<button class="ghost small" data-m="${a}" data-id="${p.id}">→ ${a}</button>`:""}
            ${b?`<button class="ghost small" data-m="${b}" data-id="${p.id}">→ ${b}</button>`:""}
          </div>
        </div>`;
    }

    mount.querySelectorAll("[data-m]").forEach(btn=>{
      btn.onclick=()=>{
        const id=btn.dataset.id;
        const m=btn.dataset.m;
        A.delete(id); B.delete(id); pool.delete(id);
        if (m==="A") A.add(id);
        else if (m==="B") B.add(id);
        else pool.add(id);
        setTeamA(A); setTeamB(B); setPool(pool);
        render();
      };
    });

    $("clearBtn").onclick=()=>{
      const p=new Set([...pool,...A,...B]);
      setPool(p); setTeamA(new Set()); setTeamB(new Set());
      render();
    };

    $("autoBtn").onclick=()=>{
      const res=autoBuild(players,pool);
      const st=$("statusTeams");
      if(!res.ok){st.textContent=res.msg;st.className="hint error";return;}
      setTeamA(res.A); setTeamB(res.B); setPool(new Set());
      st.textContent=res.msg+" (puedes repetir)";
      st.className="hint ok";
      render();
    };
  }

  document.addEventListener("DOMContentLoaded", render);
  window.addEventListener("focus", render);
})();

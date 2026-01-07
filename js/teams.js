// teams.js — Equipos A/B con Autoarmado balanceado (FIX: normaliza pool a N)
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

  function avg(set, playersArr) {
    const arr = [...set].map(id => playersArr.find(p => p.id === id)).filter(Boolean);
    if (!arr.length) return 0;
    return arr.reduce((s,p)=>s+p.rating,0) / arr.length;
  }

  function normalizeState(players, pool, A, B) {
    const total = getTotalPlayers();

    // 1) solo IDs válidos
    const valid = new Set(players.map(p => p.id));
    const clean = (set) => new Set([...set].filter(id => valid.has(id)));

    pool = clean(pool);
    A = clean(A);
    B = clean(B);

    // 2) evita duplicados A/B
    for (const id of A) B.delete(id);

    // 3) si alguien está en A/B, NO debe estar en pool
    for (const id of A) pool.delete(id);
    for (const id of B) pool.delete(id);

    // 4) IMPORTANTÍSIMO: pool nunca puede tener más que N
    if (pool.size > total) {
      // recorta manteniendo el orden guardado
      const arr = [...pool].slice(0, total);
      pool = new Set(arr);
    }

    // persiste
    setPool(pool);
    setTeamA(A);
    setTeamB(B);

    return { pool, A, B };
  }

  function autoBuild(players, poolSet) {
    const total = getTotalPlayers();
    const size = total / 2;
    const need = size / 2;

    // pool EXACTO
    const pool = [...poolSet].map(id => players.find(p => p.id === id)).filter(Boolean);
    if (pool.length !== total) {
      return { ok:false, msg:`El pool debe tener exactamente ${total} jugadores (ahora: ${pool.length}).` };
    }

    const Ds = pool.filter(p=>p.side==="D").sort((a,b)=>b.rating-a.rating);
    const Rs = pool.filter(p=>p.side==="R").sort((a,b)=>b.rating-a.rating);

    if (Ds.length !== total/2 || Rs.length !== total/2) {
      return { ok:false, msg:`El pool debe estar balanceado: D=${total/2} y R=${total/2} (ahora D=${Ds.length}, R=${Rs.length}).` };
    }

    const A = new Set(), B = new Set();

    // semillas: top 2 de cada lado (si existen)
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

      if (canAdd(first,p)) first.add(p.id);
      else if (canAdd(second,p)) second.add(p.id);
      else return { ok:false, msg:"No se pudo balancear (revisa D/R y N)." };
    }

    const msg = `✅ Autoarmado OK • Promedios A=${avg(A,pool).toFixed(2)} B=${avg(B,pool).toFixed(2)} • N=${total}`;
    return { ok:true, A, B, msg };
  }

  function render() {
    const mount = $("teamsMount");
    if (!mount) return;

    const players = getPlayers();
    let pool = getPool();
    let A = getTeamA();
    let B = getTeamB();

    ({ pool, A, B } = normalizeState(players, pool, A, B));

    const total = getTotalPlayers();
    const size = total / 2;
    const need = size / 2;

    const list = (ids) => [...ids].map(id=>players.find(p=>p.id===id)).filter(Boolean);
    const count = (ids, side) => list(ids).filter(p => p.side === side).length;

    const aD = count(A,"D"), aR = count(A,"R");
    const bD = count(B,"D"), bR = count(B,"R");

    mount.innerHTML = `
      <div class="card" style="margin-top:10px;">
        <div class="btns">
          <button class="primary" id="autoBtn">Autoarmar (balanceado)</button>
          <button class="ghost" id="clearBtn">Limpiar equipos</button>
        </div>
        <div class="hint muted" style="margin-top:8px;">
          Requisitos: pool con <b>${total}</b> jugadores y mix <b>D=${total/2}</b> / <b>R=${total/2}</b>.
          Cada equipo: <b>${size}</b> jugadores con <b>${need}D</b> y <b>${need}R</b>.
        </div>
        <div class="hint" id="statusTeams" style="margin-top:8px;"></div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-top:10px;">
        <div class="card">
          <h3 style="margin:0 0 10px;">Pool (${pool.size}/${total})</h3>
          ${list(pool).map(p=>row(p,"A","B")).join("") || `<div class="hint muted">Vacío</div>`}
        </div>

        <div class="card">
          <h3 style="margin:0 0 10px;">Equipo A (${A.size}/${size}) • D:${aD} R:${aR}</h3>
          ${list(A).map(p=>row(p,"POOL")).join("") || `<div class="hint muted">Vacío</div>`}
        </div>

        <div class="card">
          <h3 style="margin:0 0 10px;">Equipo B (${B.size}/${size}) • D:${bD} R:${bR}</h3>
          ${list(B).map(p=>row(p,"POOL")).join("") || `<div class="hint muted">Vacío</div>`}
        </div>
      </div>
    `;

    function row(p, a, b) {
      return `
        <div class="card" style="padding:8px 10px;margin:6px 0;background: rgba(0,0,0,.18);">
          <b>${p.name}</b> <span class="pill">${p.side}</span> <span class="pill">${p.rating}</span>
          <div class="btns" style="margin-top:6px;">
            ${a ? `<button class="ghost small" data-m="${a}" data-id="${p.id}">→ ${a}</button>` : ""}
            ${b ? `<button class="ghost small" data-m="${b}" data-id="${p.id}">→ ${b}</button>` : ""}
          </div>
        </div>
      `;
    }

    mount.querySelectorAll("[data-m]").forEach(btn=>{
      btn.onclick=()=>{
        const id = btn.dataset.id;
        const m = btn.dataset.m;
        let pool2 = getPool();
        let A2 = getTeamA();
        let B2 = getTeamB();

        A2.delete(id); B2.delete(id); pool2.delete(id);
        if (m==="A") A2.add(id);
        else if (m==="B") B2.add(id);
        else pool2.add(id);

        ({ pool: pool2, A: A2, B: B2 } = normalizeState(players, pool2, A2, B2));
        render();
      };
    });

    $("clearBtn").onclick=()=>{
      const pool2 = new Set([...getPool(), ...getTeamA(), ...getTeamB()]);
      setPool(pool2); setTeamA(new Set()); setTeamB(new Set());
      render();
    };

    $("autoBtn").onclick=()=>{
      const res = autoBuild(players, getPool());
      const st = $("statusTeams");
      if (!res.ok) { st.textContent = res.msg; st.className = "hint error"; return; }

      setTeamA(res.A);
      setTeamB(res.B);
      setPool(new Set());

      st.textContent = res.msg + " (puedes repetir para otra alternativa)";
      st.className = "hint ok";
      render();
    };
  }

  document.addEventListener("DOMContentLoaded", render);
  window.addEventListener("focus", render);
})();

// teams.js — Equipos A/B con Autoarmado balanceado (N dinámico + bloqueo D/R manual)
(function () {
  const KEY_PLAYERS = "op_players_v1";
  const KEY_POOL = "op_pool_v1";
  const KEY_TOTAL = "op_totalPlayers_v1";
  const KEY_TEAM_A = "op_teamA_v1";
  const KEY_TEAM_B = "op_teamB_v1";

  const $ = (id) => document.getElementById(id);
  const loadJSON = (k, fb) => { try { const r = localStorage.getItem(k); return r ? JSON.parse(r) : fb; } catch { return fb; } };
  const saveJSON = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

  const ALLOWED_TOTALS = [4, 8, 12, 16, 20, 24];

  function getPlayers() { return loadJSON(KEY_PLAYERS, []); }
  function getPool() { return new Set(loadJSON(KEY_POOL, [])); }
  function getTeamA() { return new Set(loadJSON(KEY_TEAM_A, [])); }
  function getTeamB() { return new Set(loadJSON(KEY_TEAM_B, [])); }
  function setTeamA(s) { saveJSON(KEY_TEAM_A, [...s]); }
  function setTeamB(s) { saveJSON(KEY_TEAM_B, [...s]); }
  function setPool(s) { saveJSON(KEY_POOL, [...s]); }

  function getTotalPlayers() {
    const v = Number(localStorage.getItem(KEY_TOTAL) || 16);
    return ALLOWED_TOTALS.includes(v) ? v : 16;
  }
  function setTotalPlayers(v) {
    const n = Number(v);
    if (!ALLOWED_TOTALS.includes(n)) return;
    localStorage.setItem(KEY_TOTAL, String(n));
  }

  function teamSize(total) { return total / 2; }         // jugadores por equipo
  function perTeamSide(total) { return teamSize(total) / 2; } // D y R por equipo

  function normalizeState(players, pool, A, B) {
    const total = getTotalPlayers();

    // 1) solo IDs válidos
    const valid = new Set(players.map(p => p.id));
    const clean = (set) => new Set([...set].filter(id => valid.has(id)));

    pool = clean(pool);
    A = clean(A);
    B = clean(B);

    // 2) no duplicar entre A y B
    for (const id of A) B.delete(id);

    // 3) si está en A/B, no puede estar en pool
    for (const id of A) pool.delete(id);
    for (const id of B) pool.delete(id);

    // 4) pool nunca puede tener más que N
    if (pool.size > total) pool = new Set([...pool].slice(0, total));

    setPool(pool); setTeamA(A); setTeamB(B);
    return { pool, A, B };
  }

  function listFromIds(ids, players) {
    return [...ids].map(id => players.find(p => p.id === id)).filter(Boolean);
  }

  function countSide(ids, players, side) {
    return listFromIds(ids, players).filter(p => p.side === side).length;
  }

  function avg(set, playersArr) {
    const arr = [...set].map(id => playersArr.find(p => p.id === id)).filter(Boolean);
    if (!arr.length) return 0;
    return arr.reduce((s,p)=>s+p.rating,0) / arr.length;
  }

  function autoBuild(players, poolSet) {
    const total = getTotalPlayers();
    const size = teamSize(total);
    const need = perTeamSide(total);

    const pool = [...poolSet].map(id => players.find(p => p.id === id)).filter(Boolean);
    if (pool.length !== total) {
      return { ok:false, msg:`El pool debe tener exactamente ${total} jugadores (ahora: ${pool.length}).` };
    }

    const Ds = pool.filter(p=>p.side==="D").sort((a,b)=>b.rating-a.rating);
    const Rs = pool.filter(p=>p.side==="R").sort((a,b)=>b.rating-a.rating);

    if (Ds.length !== total/2 || Rs.length !== total/2) {
      return { ok:false, msg:`Pool debe estar balanceado: D=${total/2} y R=${total/2} (ahora D=${Ds.length}, R=${Rs.length}).` };
    }

    const A = new Set(), B = new Set();

    // Semillas: top 2 D + top 2 R, repartidos alternando sumas
    const seeds = [Ds.shift(), Rs.shift(), Ds.shift(), Rs.shift()].filter(Boolean);
    let sumA = 0, sumB = 0;
    for (const p of seeds) {
      if (sumA <= sumB) { A.add(p.id); sumA += p.rating; }
      else { B.add(p.id); sumB += p.rating; }
    }

    function countTeamSide(set, side) {
      let c = 0;
      for (const id of set) {
        const p = pool.find(x=>x.id===id);
        if (p && p.side===side) c++;
      }
      return c;
    }
    function canAdd(set, p) {
      if (set.size >= size) return false;
      if (p.side==="D" && countTeamSide(set,"D") >= need) return false;
      if (p.side==="R" && countTeamSide(set,"R") >= need) return false;
      return true;
    }

    const rest = [...Ds, ...Rs].sort((a,b)=>b.rating-a.rating);
    for (const p of rest) {
      const first = avg(A,pool) <= avg(B,pool) ? A : B;
      const second = first === A ? B : A;

      if (canAdd(first,p)) first.add(p.id);
      else if (canAdd(second,p)) second.add(p.id);
      else return { ok:false, msg:"No se pudo balancear (revisa D/R y N)." };
    }

    return {
      ok:true,
      A, B,
      msg:`✅ Autoarmado OK • N=${total} • Promedios A=${avg(A,pool).toFixed(2)} B=${avg(B,pool).toFixed(2)}`
    };
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
    const size = teamSize(total);
    const need = perTeamSide(total);

    const poolArr = listFromIds(pool, players).sort((a,b)=>a.side.localeCompare(b.side) || b.rating-a.rating || a.name.localeCompare(b.name));
    const aArr = listFromIds(A, players).sort((a,b)=>a.side.localeCompare(b.side) || b.rating-a.rating || a.name.localeCompare(b.name));
    const bArr = listFromIds(B, players).sort((a,b)=>a.side.localeCompare(b.side) || b.rating-a.rating || a.name.localeCompare(b.name));

    const aD = countSide(A, players, "D"), aR = countSide(A, players, "R");
    const bD = countSide(B, players, "D"), bR = countSide(B, players, "R");

    mount.innerHTML = `
      <div class="card" style="margin-top:10px;">
        <div style="display:grid; grid-template-columns: 1fr auto; gap:10px; align-items:end;">
          <div>
            <label>Cantidad de jugadores (N)</label>
            <select id="teamsTotalSel">
              ${ALLOWED_TOTALS.map(n => `<option value="${n}" ${n===total ? "selected":""}>${n}</option>`).join("")}
            </select>
            <div class="hint muted" style="margin-top:6px;">
              Reglas: pool con <b>${total}</b> (D=${total/2}, R=${total/2}) • cada equipo <b>${size}</b> (D=${need}, R=${need})
            </div>
          </div>
          <div class="btns">
            <button class="primary" id="autoBtn">Autoarmar (balanceado)</button>
            <button class="ghost" id="clearBtn">Limpiar equipos</button>
          </div>
        </div>
        <div class="hint" id="statusTeams" style="margin-top:8px;"></div>
      </div>

      <div style="display:grid; grid-template-columns: 1fr 1fr 1fr; gap:12px; margin-top:12px;">
        <div class="card">
          <h3 style="margin:0 0 10px;">Pool (${poolArr.length}/${total})</h3>
          <div id="poolList" style="display:grid; gap:8px;"></div>
        </div>

        <div class="card">
          <h3 style="margin:0 0 10px;">Equipo A (${aArr.length}/${size}) • D:${aD}/${need} R:${aR}/${need}</h3>
          <div id="aList" style="display:grid; gap:8px;"></div>
        </div>

        <div class="card">
          <h3 style="margin:0 0 10px;">Equipo B (${bArr.length}/${size}) • D:${bD}/${need} R:${bR}/${need}</h3>
          <div id="bList" style="display:grid; gap:8px;"></div>
        </div>
      </div>
    `;

    const st = $("statusTeams");
    const setStatus = (msg, kind) => {
      st.textContent = msg;
      st.className = "hint " + (kind || "");
    };

    // Selector N dentro de Equipos (para que N SIEMPRE sea el correcto)
    $("teamsTotalSel").addEventListener("change", (e) => {
      setTotalPlayers(e.target.value);
      // al cambiar N, limpiamos equipos y pool para evitar inconsistencias
      setTeamA(new Set());
      setTeamB(new Set());
      setPool(new Set());
      setStatus(`N cambiado a ${getTotalPlayers()}. Selecciona el pool nuevamente en Base.`, "warn");
      render();
    });

    function cardRow(p, actionsHtml) {
      return `
        <div class="card" style="padding:10px 12px; background: rgba(0,0,0,.18);">
          <div style="display:flex; justify-content:space-between; gap:10px; align-items:center;">
            <div><b>${p.name}</b> <span class="pill">${p.side}</span> <span class="pill">${p.rating}</span></div>
            <div class="btns">${actionsHtml}</div>
          </div>
        </div>
      `;
    }

    // Reglas para mover manualmente (bloquea si rompe cupo o D/R)
    function canMoveToTeam(teamSet, p) {
      const totalNow = getTotalPlayers();
      const sizeNow = teamSize(totalNow);
      const needNow = perTeamSide(totalNow);

      if (teamSet.size >= sizeNow) return false;

      const d = countSide(teamSet, players, "D");
      const r = countSide(teamSet, players, "R");

      if (p.side === "D" && d >= needNow) return false;
      if (p.side === "R" && r >= needNow) return false;

      return true;
    }

    // Render Pool
    const poolList = $("poolList");
    poolList.innerHTML = poolArr.map(p => {
      const disA = !canMoveToTeam(A, p);
      const disB = !canMoveToTeam(B, p);
      return cardRow(p, `
        <button class="ghost small" data-m="A" data-id="${p.id}" ${disA ? "disabled":""}>→ A</button>
        <button class="ghost small" data-m="B" data-id="${p.id}" ${disB ? "disabled":""}>→ B</button>
      `);
    }).join("") || `<div class="hint muted">Vacío. Selecciona jugadores en Base.</div>`;

    // Render A/B (volver al pool)
    $("aList").innerHTML = aArr.map(p => cardRow(p, `
      <button class="ghost small" data-m="POOL" data-id="${p.id}">← Pool</button>
    `)).join("") || `<div class="hint muted">Vacío.</div>`;

    $("bList").innerHTML = bArr.map(p => cardRow(p, `
      <button class="ghost small" data-m="POOL" data-id="${p.id}">← Pool</button>
    `)).join("") || `<div class="hint muted">Vacío.</div>`;

    // Bind mover
    mount.querySelectorAll("[data-m]").forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-id");
        const move = btn.getAttribute("data-m");
        if (!id || !move) return;

        let pool2 = getPool();
        let A2 = getTeamA();
        let B2 = getTeamB();

        const p = players.find(x => x.id === id);
        if (!p) return;

        // quita de todos
        pool2.delete(id); A2.delete(id); B2.delete(id);

        if (move === "A") {
          if (!canMoveToTeam(A2, p)) return;
          A2.add(id);
        } else if (move === "B") {
          if (!canMoveToTeam(B2, p)) return;
          B2.add(id);
        } else {
          pool2.add(id);
        }

        ({ pool: pool2, A: A2, B: B2 } = normalizeState(players, pool2, A2, B2));
        render();
      });
    });

    // Limpiar equipos
    $("clearBtn").addEventListener("click", () => {
      const pool2 = new Set([...getPool(), ...getTeamA(), ...getTeamB()]);
      setPool(pool2);
      setTeamA(new Set());
      setTeamB(new Set());
      setStatus("Equipos limpiados (devueltos al pool).", "ok");
      render();
    });

    // Autoarmar
    $("autoBtn").addEventListener("click", () => {
      const res = autoBuild(players, getPool());
      if (!res.ok) return setStatus(res.msg, "error");

      setTeamA(res.A);
      setTeamB(res.B);
      setPool(new Set());

      setStatus(res.msg + " (puedes repetir cambiando el pool o volviendo a Base)", "ok");
      render();
    });
  }

  document.addEventListener("DOMContentLoaded", render);
  window.addEventListener("focus", render);
})();

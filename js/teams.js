// teams.js — Equipos A/B + fecha editable + botón Grabar a Historial
(function () {
  const KEY_PLAYERS = "op_players_v1";
  const KEY_POOL = "op_pool_v1";
  const KEY_TOTAL = "op_totalPlayers_v1";
  const KEY_TEAM_A = "op_teamA_v1";
  const KEY_TEAM_B = "op_teamB_v1";
  const KEY_SESSION_DATE = "op_sessionDate_v1";
  const KEY_HISTORY = "op_history_v1";

  const ALLOWED_TOTALS = [4, 8, 12, 16, 20, 24];

  const $ = (id) => document.getElementById(id);
  const loadJSON = (k, fb) => { try { const r = localStorage.getItem(k); return r ? JSON.parse(r) : fb; } catch { return fb; } };
  const saveJSON = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

  function emitTeamsChanged() {
    try { window.dispatchEvent(new CustomEvent("op:teamsChanged")); } catch {}
  }

  function todayISO() {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth()+1).padStart(2,"0");
    const dd = String(d.getDate()).padStart(2,"0");
    return `${yyyy}-${mm}-${dd}`;
  }

  function getPlayers() { return loadJSON(KEY_PLAYERS, []); }
  function getPool() { return new Set(loadJSON(KEY_POOL, [])); }
  function getTeamA() { return new Set(loadJSON(KEY_TEAM_A, [])); }
  function getTeamB() { return new Set(loadJSON(KEY_TEAM_B, [])); }
  function setPool(s) { saveJSON(KEY_POOL, [...s]); }

  function getTotalPlayers() {
    const v = Number(localStorage.getItem(KEY_TOTAL) || 16);
    return ALLOWED_TOTALS.includes(v) ? v : 16;
  }
  function teamSize(total) { return total / 2; }
  function perTeamSide(total) { return teamSize(total) / 2; }

  function listFromIds(ids, players) {
    return [...ids].map(id => players.find(p => p.id === id)).filter(Boolean);
  }
  function countSide(ids, players, side) {
    return listFromIds(ids, players).filter(p => p.side === side).length;
  }
  function avgTeam(idsSet, players) {
    const arr = listFromIds(idsSet, players);
    if (!arr.length) return 0;
    return arr.reduce((s,p)=>s+p.rating,0) / arr.length;
  }

  function pairKey(dId, rId) { return `${dId}|${rId}`; }

  function autoBuild(players, poolSet) {
    const total = getTotalPlayers();
    const size = teamSize(total);
    const need = perTeamSide(total);

    const pool = [...poolSet].map(id => players.find(p => p.id === id)).filter(Boolean);
    if (pool.length !== total) return { ok:false, msg:`El pool debe tener exactamente ${total} jugadores (ahora: ${pool.length}).` };

    const Ds = pool.filter(p=>p.side==="D").sort((a,b)=>b.rating-a.rating);
    const Rs = pool.filter(p=>p.side==="R").sort((a,b)=>b.rating-a.rating);
    if (Ds.length !== total/2 || Rs.length !== total/2) {
      return { ok:false, msg:`Pool debe estar balanceado: D=${total/2} y R=${total/2} (ahora D=${Ds.length}, R=${Rs.length}).` };
    }

    const A = new Set(), B = new Set();
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
    const avg = (set) => {
      const arr = [...set].map(id => pool.find(x=>x.id===id)).filter(Boolean);
      if (!arr.length) return 0;
      return arr.reduce((s,p)=>s+p.rating,0)/arr.length;
    };

    const rest = [...Ds, ...Rs].sort((a,b)=>b.rating-a.rating);
    for (const p of rest) {
      const first = avg(A) <= avg(B) ? A : B;
      const second = first === A ? B : A;
      if (canAdd(first,p)) first.add(p.id);
      else if (canAdd(second,p)) second.add(p.id);
      else return { ok:false, msg:"No se pudo balancear." };
    }

    return { ok:true, A, B, msg:`✅ Autoarmado OK • Prom A=${avg(A).toFixed(2)} B=${avg(B).toFixed(2)}` };
  }

  function normalize(players, pool, A, B) {
    const total = getTotalPlayers();
    const valid = new Set(players.map(p => p.id));
    const clean = (set) => new Set([...set].filter(id => valid.has(id)));

    pool = clean(pool);
    A = clean(A);
    B = clean(B);

    for (const id of A) B.delete(id);
    if (pool.size > total) pool = new Set([...pool].slice(0, total));

    saveJSON(KEY_POOL, [...pool]);
    saveJSON(KEY_TEAM_A, [...A]);
    saveJSON(KEY_TEAM_B, [...B]);

    return { pool, A, B };
  }

  function getSessionDate() {
    return localStorage.getItem(KEY_SESSION_DATE) || todayISO();
  }
  function setSessionDate(v) {
    localStorage.setItem(KEY_SESSION_DATE, v);
  }

  function saveToHistory(dateISO, players, Aset, Bset) {
    const A = listFromIds(Aset, players).map(p => ({ id:p.id, name:p.name, side:p.side, rating:p.rating }));
    const B = listFromIds(Bset, players).map(p => ({ id:p.id, name:p.name, side:p.side, rating:p.rating }));

    // Tomar snapshot de turnos si existe
    const turnsSnap = (window.OP && typeof window.OP.getTurnsSnapshot === "function")
      ? window.OP.getTurnsSnapshot()
      : null;

    const entry = {
      id: "h_" + Date.now(),
      date: dateISO,
      createdAt: new Date().toISOString(),
      totalPlayers: getTotalPlayers(),
      teamA: A,
      teamB: B,
      turns: turnsSnap, // incluye turns, scores, summary
    };

    const hist = loadJSON(KEY_HISTORY, []);
    hist.unshift(entry);
    saveJSON(KEY_HISTORY, hist);
  }

  function render() {
    const mount = $("teamsMount");
    if (!mount) return;

    const players = getPlayers();
    let pool = getPool();
    let A = getTeamA();
    let B = getTeamB();

    ({ pool, A, B } = normalize(players, pool, A, B));

    const total = getTotalPlayers();
    const size = teamSize(total);
    const need = perTeamSide(total);

    const poolArr = listFromIds(pool, players).sort((a,b)=>a.side.localeCompare(b.side) || b.rating-a.rating || a.name.localeCompare(b.name));
    const aArr = listFromIds(A, players).sort((a,b)=>a.side.localeCompare(b.side) || b.rating-a.rating || a.name.localeCompare(b.name));
    const bArr = listFromIds(B, players).sort((a,b)=>a.side.localeCompare(b.side) || b.rating-a.rating || a.name.localeCompare(b.name));

    const aD = countSide(A, players, "D"), aR = countSide(A, players, "R");
    const bD = countSide(B, players, "D"), bR = countSide(B, players, "R");

    const avgA = avgTeam(A, players);
    const avgB = avgTeam(B, players);

    const inTeams = new Set([...A, ...B]);

    const sessionDate = getSessionDate();

    mount.innerHTML = `
      <div class="card" style="margin-top:10px;">
        <div style="display:grid; grid-template-columns: 1fr auto; gap:12px; align-items:end;">
          <div>
            <label>Fecha (para grabar)</label>
            <input id="sessionDate" type="date" value="${sessionDate}">
            <div class="hint muted" style="margin-top:6px;">
              N: <b>${total}</b> • Cada equipo: <b>${size}</b> (D=${need}, R=${need})
            </div>
          </div>
          <div class="btns" style="justify-content:end;">
            <button class="primary" id="autoBtn">Autoarmar</button>
            <button class="ghost" id="saveBtn">Grabar</button>
            <button class="ghost" id="clearBtn">Limpiar equipos</button>
          </div>
        </div>
        <div class="hint" id="statusTeams" style="margin-top:10px;"></div>
      </div>

      <div style="display:grid; grid-template-columns: 1fr 1fr 1fr; gap:12px; margin-top:12px;">
        <div class="card">
          <h3 style="margin:0 0 10px;">Pool (${poolArr.length}/${total})</h3>
          <div id="poolList" style="display:grid; gap:8px;"></div>
        </div>
        <div class="card">
          <h3 style="margin:0 0 10px;">
            Equipo A (${aArr.length}/${size}) • D:${aD}/${need} R:${aR}/${need} • Prom: ${avgA ? avgA.toFixed(2) : "—"}
          </h3>
          <div id="aList" style="display:grid; gap:8px;"></div>
        </div>
        <div class="card">
          <h3 style="margin:0 0 10px;">
            Equipo B (${bArr.length}/${size}) • D:${bD}/${need} R:${bR}/${need} • Prom: ${avgB ? avgB.toFixed(2) : "—"}
          </h3>
          <div id="bList" style="display:grid; gap:8px;"></div>
        </div>
      </div>
    `;

    const st = $("statusTeams");
    const setStatus = (msg, kind) => { st.textContent = msg; st.className = "hint " + (kind || ""); };

    function canMoveToTeam(teamSet, p) {
      if (teamSet.size >= size) return false;
      const d = countSide(teamSet, players, "D");
      const r = countSide(teamSet, players, "R");
      if (p.side === "D" && d >= need) return false;
      if (p.side === "R" && r >= need) return false;
      return true;
    }

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

    $("poolList").innerHTML = poolArr.map(p => {
      const already = inTeams.has(p.id);
      const disA = !canMoveToTeam(A, p) || already;
      const disB = !canMoveToTeam(B, p) || already;

      return cardRow(p, `
        <button class="ghost small" data-m="A" data-id="${p.id}" ${disA ? "disabled":""}>→ A</button>
        <button class="ghost small" data-m="B" data-id="${p.id}" ${disB ? "disabled":""}>→ B</button>
      `);
    }).join("") || `<div class="hint muted">Vacío</div>`;

    $("aList").innerHTML = aArr.map(p => cardRow(p, `
      <button class="ghost small" data-m="POOL" data-id="${p.id}">← Pool</button>
    `)).join("") || `<div class="hint muted">Vacío</div>`;

    $("bList").innerHTML = bArr.map(p => cardRow(p, `
      <button class="ghost small" data-m="POOL" data-id="${p.id}">← Pool</button>
    `)).join("") || `<div class="hint muted">Vacío</div>`;

    // fecha editable
    $("sessionDate").addEventListener("change", (e) => {
      setSessionDate(e.target.value || todayISO());
      setStatus("Fecha actualizada.", "ok");
    });

    // mover jugadores
    mount.querySelectorAll("[data-m]").forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-id");
        const move = btn.getAttribute("data-m");
        if (!id || !move) return;

        const p = players.find(x => x.id === id);
        if (!p) return;

        let pool2 = getPool();
        let A2 = getTeamA();
        let B2 = getTeamB();

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

        saveJSON(KEY_POOL, [...pool2]);
        saveJSON(KEY_TEAM_A, [...A2]);
        saveJSON(KEY_TEAM_B, [...B2]);
        emitTeamsChanged();
        render();
      });
    });

    // Autoarmar
    $("autoBtn").addEventListener("click", () => {
      const res = autoBuild(players, getPool());
      if (!res.ok) return setStatus(res.msg, "error");

      saveJSON(KEY_TEAM_A, [...res.A]);
      saveJSON(KEY_TEAM_B, [...res.B]);
      setPool(new Set()); // vacía pool al autoarmar
      emitTeamsChanged();
      setStatus(res.msg, "ok");
      render();
    });

    // Limpiar equipos
    $("clearBtn").addEventListener("click", () => {
      const pool2 = new Set([...getPool(), ...getTeamA(), ...getTeamB()]);
      saveJSON(KEY_POOL, [...pool2]);
      saveJSON(KEY_TEAM_A, []);
      saveJSON(KEY_TEAM_B, []);
      emitTeamsChanged();
      setStatus("Equipos limpiados (devueltos al pool).", "ok");
      render();
    });

    // Grabar a historial
    $("saveBtn").addEventListener("click", () => {
      const date = $("sessionDate").value || todayISO();

      // validación básica
      if (aArr.length !== size || bArr.length !== size) {
        return setStatus("No se puede grabar: equipos incompletos.", "warn");
      }
      if (aD !== need || aR !== need || bD !== need || bR !== need) {
        return setStatus("No se puede grabar: equipos no están balanceados D/R.", "warn");
      }

      setSessionDate(date);
      saveToHistory(date, players, getTeamA(), getTeamB());
      setStatus("✅ Grabado en Historial.", "ok");
    });
  }

  window.OP = window.OP || {};
  const prevRefresh = window.OP.refresh;
  window.OP.refresh = (view) => {
    if (typeof prevRefresh === "function") prevRefresh(view);
    if (view === "teams") render();
  };

  window.addEventListener("op:poolChanged", () => render());
  document.addEventListener("DOMContentLoaded", render);
})();

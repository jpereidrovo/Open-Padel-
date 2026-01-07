// teams.js — Equipos A/B (modo local estable)
// Lee el pool de db.js desde localStorage y permite mover a A/B

(function () {
  const KEY_PLAYERS = "op_players_v1";
  const KEY_POOL = "op_pool_v1";
  const KEY_TOTAL = "op_totalPlayers_v1";
  const KEY_TEAM_A = "op_teamA_v1";
  const KEY_TEAM_B = "op_teamB_v1";

  const $ = (id) => document.getElementById(id);
  const norm = (s) => String(s ?? "").trim().replace(/\s+/g, " ");
  const loadJSON = (k, fb) => { try { const r = localStorage.getItem(k); return r ? JSON.parse(r) : fb; } catch { return fb; } };
  const saveJSON = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

  function getTotalPlayers() {
    const v = Number(localStorage.getItem(KEY_TOTAL) || 16);
    return [4, 8, 12, 16, 20, 24].includes(v) ? v : 16;
  }
  function teamSize() { return getTotalPlayers() / 2; }
  function perTeamSide() { return teamSize() / 2; }

  function getPlayers() { return loadJSON(KEY_PLAYERS, []); }
  function getPool() { return new Set(loadJSON(KEY_POOL, [])); }
  function getTeamA() { return new Set(loadJSON(KEY_TEAM_A, [])); }
  function getTeamB() { return new Set(loadJSON(KEY_TEAM_B, [])); }

  function setTeamA(set) { saveJSON(KEY_TEAM_A, [...set]); }
  function setTeamB(set) { saveJSON(KEY_TEAM_B, [...set]); }
  function setPool(set) { saveJSON(KEY_POOL, [...set]); }

  function countSide(ids, side, players) {
    let c = 0;
    for (const id of ids) {
      const p = players.find(x => x.id === id);
      if (p && p.side === side) c++;
    }
    return c;
  }

  function pill(text) {
    return `<span class="pill">${text}</span>`;
  }

  function renderTeams() {
    const mount = $("teamsMount");
    if (!mount) return;

    const players = getPlayers();
    const pool = getPool();
    let A = getTeamA();
    let B = getTeamB();

    // Limpieza: si alguien ya no existe, fuera
    const valid = new Set(players.map(p => p.id));
    const clean = (set) => new Set([...set].filter(id => valid.has(id)));
    const poolC = clean(pool);
    A = clean(A);
    B = clean(B);

    // Evita duplicados entre A y B: si está en A, lo quita de B
    for (const id of A) B.delete(id);
    // Evita que estén en A/B sin estar en selección original: si está en A/B, lo quita del pool
    for (const id of A) poolC.delete(id);
    for (const id of B) poolC.delete(id);

    setPool(poolC); setTeamA(A); setTeamB(B);

    const size = teamSize();
    const need = perTeamSide();

    const poolPlayers = [...poolC].map(id => players.find(p => p.id === id)).filter(Boolean)
      .sort((a,b) => a.side.localeCompare(b.side) || b.rating-a.rating || norm(a.name).localeCompare(norm(b.name)));

    const aPlayers = [...A].map(id => players.find(p => p.id === id)).filter(Boolean)
      .sort((a,b)=>a.side.localeCompare(b.side) || b.rating-a.rating || norm(a.name).localeCompare(norm(b.name)));

    const bPlayers = [...B].map(id => players.find(p => p.id === id)).filter(Boolean)
      .sort((a,b)=>a.side.localeCompare(b.side) || b.rating-a.rating || norm(b.name).localeCompare(norm(a.name)));

    const aD = countSide(A, "D", players), aR = countSide(A, "R", players);
    const bD = countSide(B, "D", players), bR = countSide(B, "R", players);

    mount.innerHTML = `
      <div class="card" style="margin-top:10px;">
        <div class="hint muted">
          Selecciona el pool en <b>Base</b>. Aquí los asignas a <b>Equipo A</b> y <b>Equipo B</b>.
        </div>
        <div style="margin-top:10px; display:flex; gap:10px; flex-wrap:wrap;">
          ${pill(`Equipo A: <b>${A.size}/${size}</b> • D:<b>${aD}</b> R:<b>${aR}</b> (req ${need}/${need})`)}
          ${pill(`Equipo B: <b>${B.size}/${size}</b> • D:<b>${bD}</b> R:<b>${bR}</b> (req ${need}/${need})`)}
          ${pill(`Pool disponible: <b>${poolC.size}</b>`)}
        </div>

        <div class="btns" style="margin-top:10px;">
          <button class="ghost" id="opClearTeams">Limpiar Equipos</button>
        </div>

        <div id="opTeamsStatus" class="hint" style="margin-top:8px;"></div>
      </div>

      <div style="display:grid; grid-template-columns: 1fr 1fr 1fr; gap:14px; margin-top:14px;">
        <div class="card">
          <h3 style="margin:0 0 10px;">Pool</h3>
          <div id="opPoolList" style="display:grid; gap:8px;"></div>
        </div>

        <div class="card">
          <h3 style="margin:0 0 10px;">Equipo A</h3>
          <div id="opAList" style="display:grid; gap:8px;"></div>
        </div>

        <div class="card">
          <h3 style="margin:0 0 10px;">Equipo B</h3>
          <div id="opBList" style="display:grid; gap:8px;"></div>
        </div>
      </div>
    `;

    const status = $("opTeamsStatus");
    const setStatus = (msg, kind) => {
      status.textContent = msg;
      status.className = "hint " + (kind || "");
    };

    $("opClearTeams").addEventListener("click", () => {
      // Devuelve A/B al pool
      const pool2 = new Set(loadJSON(KEY_POOL, []));
      for (const id of A) pool2.add(id);
      for (const id of B) pool2.add(id);
      setTeamA(new Set());
      setTeamB(new Set());
      setPool(pool2);
      setStatus("Equipos limpiados (devueltos al pool).", "ok");
      renderTeams();
    });

    const renderPerson = (p, actionsHtml) => `
      <div class="card" style="padding:10px 12px; background: rgba(0,0,0,.18);">
        <div style="display:flex; justify-content:space-between; gap:10px; align-items:center;">
          <div>
            <b>${p.name}</b> <span class="pill">${p.side}</span> <span class="pill">${p.rating}</span>
          </div>
          <div class="btns">${actionsHtml}</div>
        </div>
      </div>
    `;

    // Pool list
    const poolList = $("opPoolList");
    poolList.innerHTML = poolPlayers.map(p => {
      const disableA = (A.size >= size);
      const disableB = (B.size >= size);
      return renderPerson(p, `
        <button class="ghost small" data-move="A" data-id="${p.id}" ${disableA ? "disabled":""}>→ A</button>
        <button class="ghost small" data-move="B" data-id="${p.id}" ${disableB ? "disabled":""}>→ B</button>
      `);
    }).join("") || `<div class="hint muted">No hay jugadores en pool.</div>`;

    // A list
    const aList = $("opAList");
    aList.innerHTML = aPlayers.map(p => renderPerson(p, `
      <button class="ghost small" data-move="POOL" data-id="${p.id}">← Pool</button>
    `)).join("") || `<div class="hint muted">Vacío.</div>`;

    // B list
    const bList = $("opBList");
    bList.innerHTML = bPlayers.map(p => renderPerson(p, `
      <button class="ghost small" data-move="POOL" data-id="${p.id}">← Pool</button>
    `)).join("") || `<div class="hint muted">Vacío.</div>`;

    // Bind moves
    mount.querySelectorAll("[data-move]").forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-id");
        const move = btn.getAttribute("data-move");
        if (!id || !move) return;

        const poolNow = getPool();
        let A2 = getTeamA();
        let B2 = getTeamB();

        // Limpia duplicados
        A2.delete(id); B2.delete(id); poolNow.delete(id);

        if (move === "A") A2.add(id);
        else if (move === "B") B2.add(id);
        else poolNow.add(id);

        setTeamA(A2); setTeamB(B2); setPool(poolNow);
        renderTeams();
      });
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    renderTeams();
    console.log("✅ teams.js listo (local)");
  });

  // Si cambias el pool en Base y luego vienes a Equipos, se refresca al entrar
  window.addEventListener("focus", () => {
    const mount = document.getElementB
  });
})();

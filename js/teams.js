// teams.js — Pool + Equipos sincronizados en vivo (Supabase state)
// Reglas:
// - Pool: jugadores seleccionados para jugar hoy
// - Equipos A/B: se arman manual o auto-balanceado
// - Todo se guarda en Store.state -> Supabase (debounced)

import { Store } from "./store.js";

(function () {
  const $ = (id) => document.getElementById(id);

  function escapeHtml(str) {
    return String(str || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function avg(arr) {
    if (!arr?.length) return 0;
    return arr.reduce((s, x) => s + (Number(x.rating) || 0), 0) / arr.length;
  }

  function getSelectedPlayersFromPoolIds(poolIds) {
    const set = new Set(poolIds || []);
    return (Store.players || []).filter(p => set.has(p.id));
  }

  function toPlayerMini(p) {
    return { id: p.id, name: p.name, side: p.side, rating: p.rating };
  }

  function ensureStateDefaults() {
    if (!Store.state) return;
    const s = Store.state;
    if (!Array.isArray(s.pool)) s.pool = [];
    if (!Array.isArray(s.team_a)) s.team_a = [];
    if (!Array.isArray(s.team_b)) s.team_b = [];
    if (typeof s.total_players !== "number") s.total_players = 16;
    if (!s.session_date) s.session_date = new Date().toISOString().slice(0, 10);
  }

  function canPlaySelection(players) {
    if (!players?.length) return { ok: false, msg: "Selecciona jugadores al pool." };
    if (players.length % 4 !== 0) return { ok: false, msg: "El pool debe ser múltiplo de 4 (4,8,12,16...)."};
    const d = players.filter(p => p.side === "D").length;
    const r = players.filter(p => p.side === "R").length;
    if (d !== r) return { ok: false, msg: "Debe haber igual cantidad de Derechas (D) y Revés (R)."};
    return { ok: true, msg: "" };
  }

  // Auto-balance: idea que pediste
  // 1) toma top2 D y top2 R
  // 2) reparte 1 y 1 en cada equipo
  // 3) el resto lo asigna con greedy por promedio total (manteniendo igual D/R)
  function autoBalanceTeams(poolPlayers) {
    const rights = poolPlayers.filter(p => p.side === "D").sort((a,b)=>b.rating-a.rating);
    const lefts  = poolPlayers.filter(p => p.side === "R").sort((a,b)=>b.rating-a.rating);

    const A = [];
    const B = [];

    // seed: top2 de cada lado
    const seedR = rights.slice(0, 2);
    const seedL = lefts.slice(0, 2);

    if (seedR.length >= 2) { A.push(seedR[0]); B.push(seedR[1]); }
    else if (seedR.length === 1) { A.push(seedR[0]); }

    if (seedL.length >= 2) { A.push(seedL[0]); B.push(seedL[1]); }
    else if (seedL.length === 1) { A.push(seedL[0]); }

    const used = new Set([...A, ...B].map(p => p.id));
    const restR = rights.filter(p => !used.has(p.id));
    const restL = lefts.filter(p => !used.has(p.id));

    const targetSize = poolPlayers.length / 2;
    const targetPerSide = poolPlayers.length / 4; // por equipo

    function countSide(team, side) { return team.filter(p => p.side === side).length; }
    function teamSum(team) { return team.reduce((s,p)=>s+(p.rating||0),0); }

    // greedy intercalado: siempre intenta minimizar diferencia
    const combined = [];
    // Mezcla altos a bajos para estabilizar
    for (let i=0; i<Math.max(restR.length, restL.length); i++) {
      if (i < restR.length) combined.push(restR[i]);
      if (i < restL.length) combined.push(restL[i]);
    }

    for (const p of combined) {
      if (A.length >= targetSize && B.length >= targetSize) break;

      const aSideOk = countSide(A, p.side) < targetPerSide && A.length < targetSize;
      const bSideOk = countSide(B, p.side) < targetPerSide && B.length < targetSize;

      // si solo uno puede, va ahí
      if (aSideOk && !bSideOk) { A.push(p); continue; }
      if (!aSideOk && bSideOk) { B.push(p); continue; }

      // ambos pueden: va al que deje menor diferencia
      const aSum = teamSum(A), bSum = teamSum(B);
      const diffIfA = Math.abs((aSum + p.rating) - bSum);
      const diffIfB = Math.abs(aSum - (bSum + p.rating));
      if (diffIfA <= diffIfB) A.push(p); else B.push(p);
    }

    return { A, B };
  }

  function render() {
    const mount = $("teamsMount");
    if (!mount) return;

    if (!Store.ready) {
      mount.innerHTML = `
        <div class="card" style="margin-top:10px;">
          <div class="hint muted">Inicia sesión para usar Equipos.</div>
        </div>
      `;
      return;
    }

    ensureStateDefaults();

    const s = Store.state;
    const poolPlayers = getSelectedPlayersFromPoolIds(s.pool);
    const teamA = (s.team_a || []).slice();
    const teamB = (s.team_b || []).slice();

    const val = canPlaySelection(poolPlayers);

    const avgA = avg(teamA);
    const avgB = avg(teamB);

    mount.innerHTML = `
      <div class="card" style="margin-top:10px;">
        <div style="display:flex; gap:10px; justify-content:space-between; flex-wrap:wrap; align-items:center;">
          <div>
            <div class="hint muted">Selecciona jugadores para el pool y arma equipos (sincronizado en vivo).</div>
            <div class="hint ${val.ok ? "ok" : "warn"}">${val.ok ? "✅ Pool válido" : "⚠️ " + val.msg}</div>
          </div>
          <div class="btns">
            <button class="ghost" id="btnClearTeams">Limpiar equipos</button>
            <button class="primary" id="btnAutoTeams" ${val.ok ? "" : "disabled"}>Autoarmar (balanceado)</button>
          </div>
        </div>
      </div>

      <div class="card" style="margin-top:12px;">
        <h3 style="margin:0 0 10px;">Pool de jugadores (${poolPlayers.length})</h3>
        <div class="hint muted" style="margin-bottom:10px;">Marca jugadores en la Base y aquí se sincroniza el pool.</div>
        <div id="poolList" style="display:grid; gap:10px;"></div>
      </div>

      <div class="card" style="margin-top:12px;">
        <h3 style="margin:0 0 10px;">Equipos</h3>
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:12px;">
          <div class="card" style="background: rgba(0,0,0,.18);">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <h4 style="margin:0;">Equipo A</h4>
              <div class="hint ${Math.abs(avgA-avgB) <= 0.35 ? "ok" : "muted"}">Prom: ${avgA.toFixed(2)}</div>
            </div>
            <div id="teamAList" style="display:grid; gap:8px; margin-top:10px;"></div>
          </div>

          <div class="card" style="background: rgba(0,0,0,.18);">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <h4 style="margin:0;">Equipo B</h4>
              <div class="hint ${Math.abs(avgA-avgB) <= 0.35 ? "ok" : "muted"}">Prom: ${avgB.toFixed(2)}</div>
            </div>
            <div id="teamBList" style="display:grid; gap:8px; margin-top:10px;"></div>
          </div>
        </div>

        <div class="hint muted" style="margin-top:10px;">
          Diferencia de promedios: <b>${Math.abs(avgA-avgB).toFixed(2)}</b>
        </div>
      </div>
    `;

    // Render Pool list
    const poolEl = $("poolList");
    if (poolEl) {
      if (!poolPlayers.length) {
        poolEl.innerHTML = `<div class="hint muted">No hay jugadores en el pool. Ve a Base y selecciónalos para jugar.</div>`;
      } else {
        poolEl.innerHTML = poolPlayers.map(p => `
          <div class="card" style="background: rgba(0,0,0,.18); padding:10px; display:flex; justify-content:space-between; gap:10px; align-items:center;">
            <div>
              <div><b>${escapeHtml(p.name)}</b></div>
              <div class="hint muted">${p.side === "D" ? "Derecha" : "Revés"} • Nivel ${p.rating}</div>
            </div>
            <div class="btns">
              <button class="ghost" data-to-a="${p.id}">→ A</button>
              <button class="ghost" data-to-b="${p.id}">→ B</button>
            </div>
          </div>
        `).join("");
      }
    }

    // Render team lists
    function renderTeam(elId, team, other) {
      const el = $(elId);
      if (!el) return;

      if (!team.length) {
        el.innerHTML = `<div class="hint muted">Vacío</div>`;
        return;
      }

      el.innerHTML = team.map(p => `
        <div class="card" style="background: rgba(0,0,0,.12); padding:10px; display:flex; justify-content:space-between; gap:10px; align-items:center;">
          <div>
            <div><b>${escapeHtml(p.name)}</b></div>
            <div class="hint muted">${p.side === "D" ? "D" : "R"} • ${p.rating}</div>
          </div>
          <div class="btns">
            <button class="ghost" data-remove="${p.id}">Quitar</button>
          </div>
        </div>
      `).join("");
    }

    renderTeam("teamAList", teamA, teamB);
    renderTeam("teamBList", teamB, teamA);

    // Helpers to set state
    function setTeams(newA, newB) {
      Store.setState({
        team_a: newA.map(toPlayerMini),
        team_b: newB.map(toPlayerMini)
      });
    }

    function removeFromTeams(pid) {
      const newA = teamA.filter(p => p.id !== pid);
      const newB = teamB.filter(p => p.id !== pid);
      setTeams(newA, newB);
    }

    function addToTeam(pid, teamName) {
      const p = poolPlayers.find(x => x.id === pid);
      if (!p) return;

      // Evitar duplicados
      const inA = teamA.some(x => x.id === pid);
      const inB = teamB.some(x => x.id === pid);
      if (inA || inB) return;

      const newA = teamA.slice();
      const newB = teamB.slice();
      if (teamName === "A") newA.push(p);
      else newB.push(p);

      setTeams(newA, newB);
    }

    // Click handlers pool -> teams
    mount.querySelectorAll("[data-to-a]").forEach(btn => {
      btn.addEventListener("click", () => addToTeam(btn.getAttribute("data-to-a"), "A"));
    });
    mount.querySelectorAll("[data-to-b]").forEach(btn => {
      btn.addEventListener("click", () => addToTeam(btn.getAttribute("data-to-b"), "B"));
    });

    // Remove buttons in both teams
    mount.querySelectorAll("[data-remove]").forEach(btn => {
      btn.addEventListener("click", () => removeFromTeams(btn.getAttribute("data-remove")));
    });

    // Clear teams
    $("btnClearTeams")?.addEventListener("click", () => {
      Store.setState({ team_a: [], team_b: [] });
    });

    // Auto-balance
    $("btnAutoTeams")?.addEventListener("click", () => {
      if (!val.ok) return;
      const { A, B } = autoBalanceTeams(poolPlayers);
      setTeams(A, B);
    });
  }

  // Vincular selección del pool desde Base:
  // asumimos que la Base marcará el pool actualizando Store.state.pool
  // Aquí solo renderizamos cuando cambie state o players.
  window.OP = window.OP || {};
  const prevRefresh = window.OP.refresh;
  window.OP.refresh = (view) => {
    if (typeof prevRefresh === "function") prevRefresh(view);
    if (view === "teams") render();
  };

  window.addEventListener("op:storeReady", render);
  window.addEventListener("op:playersChanged", render);
  window.addEventListener("op:stateChanged", render);
  document.addEventListener("DOMContentLoaded", render);
})();

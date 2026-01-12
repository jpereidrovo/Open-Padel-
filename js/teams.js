// teams.js — Equipos (pool -> A/B) + guardar a historial (sessions) multi-sesión

import { Store } from "./store.js";
import { saveTeamsToHistory } from "./supabaseApi.js";

(function () {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

  function todayISO() {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }

  function avgRating(players) {
    if (!players.length) return 0;
    const sum = players.reduce((a, p) => a + Number(p.rating || 0), 0);
    return sum / players.length;
  }

  function countSide(players, side) {
    return players.filter(p => p.side === side).length;
  }

  function getPoolPlayers() {
    const poolIds = new Set(Store.state?.pool || []);
    return (Store.players || []).filter(p => poolIds.has(p.id));
  }

  function splitBySide(list) {
    const D = list.filter(p => p.side === "D").sort((a,b)=>Number(b.rating)-Number(a.rating));
    const R = list.filter(p => p.side === "R").sort((a,b)=>Number(b.rating)-Number(a.rating));
    return { D, R };
  }

  function autoBalanceTeams(poolPlayers) {
    const { D, R } = splitBySide(poolPlayers);

    if (poolPlayers.length % 4 !== 0) throw new Error("El pool debe ser múltiplo de 4.");
    if (D.length !== R.length) throw new Error("El pool debe tener igual cantidad de Derecha (D) y Revés (R).");

    const A = [];
    const B = [];

    for (let i = 0; i < R.length; i++) (i % 2 === 0 ? A : B).push(R[i]);
    for (let i = 0; i < D.length; i++) (i % 2 === 0 ? B : A).push(D[i]);

    let tries = 0;
    while (tries < 20) {
      tries++;
      const diff = avgRating(A) - avgRating(B);
      if (Math.abs(diff) <= 0.15) break;

      const src = diff > 0 ? A : B;
      const dst = diff > 0 ? B : A;

      const srcD = src.filter(p => p.side === "D");
      const dstD = dst.filter(p => p.side === "D");
      const srcR = src.filter(p => p.side === "R");
      const dstR = dst.filter(p => p.side === "R");

      const swapSide = (srcD.length && dstD.length) ? "D" : ((srcR.length && dstR.length) ? "R" : null);
      if (!swapSide) break;

      const sList = src.filter(p => p.side === swapSide).sort((a,b)=>Number(a.rating)-Number(b.rating));
      const dList = dst.filter(p => p.side === swapSide).sort((a,b)=>Number(a.rating)-Number(b.rating));

      const s = sList[Math.floor(sList.length/2)];
      const d = dList[Math.floor(dList.length/2)];
      if (!s || !d) break;

      const si = src.findIndex(p => p.id === s.id);
      const di = dst.findIndex(p => p.id === d.id);
      src[si] = d;
      dst[di] = s;
    }

    return { teamA: A, teamB: B };
  }

  function render() {
    const mount = $("teamsMount");
    if (!mount) return;

    if (!Store.ready) {
      mount.innerHTML = `<div class="card" style="margin-top:10px;"><div class="hint muted">Inicia sesión para usar Equipos.</div></div>`;
      return;
    }

    const poolPlayers = getPoolPlayers();
    const session_date = Store.state?.session_date || todayISO();
    const teamA = Array.isArray(Store.state?.team_a) ? Store.state.team_a : [];
    const teamB = Array.isArray(Store.state?.team_b) ? Store.state.team_b : [];

    const aAvg = avgRating(teamA).toFixed(2);
    const bAvg = avgRating(teamB).toFixed(2);

    const aD = countSide(teamA, "D"), aR = countSide(teamA, "R");
    const bD = countSide(teamB, "D"), bR = countSide(teamB, "R");

    const labelKey = Store.state?.session_key ? `Sesión: ${Store.state.session_key}` : `Sesión: ${session_date}`;

    mount.innerHTML = `
      <div class="card" style="margin-top:10px;">
        <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:end; justify-content:space-between;">
          <div>
            <label>Fecha</label>
            <input id="teamsDate" type="date" value="${esc(session_date)}" />
            <div class="hint muted" style="margin-top:6px;">${esc(labelKey)}</div>
          </div>

          <div class="btns">
            <button class="ghost" id="btnAutoTeams">Autoarmar</button>
            <button class="ghost" id="btnClearTeams">Limpiar equipos</button>
            <button class="primary" id="btnSaveTeams">Guardar (nueva sesión)</button>
          </div>
        </div>

        <div id="teamsStatus" class="hint muted" style="margin-top:10px;"></div>
      </div>

      <div class="card" style="margin-top:12px;">
        <h3 style="margin:0 0 10px;">Pool (${poolPlayers.length})</h3>
        <div class="hint muted">Debe ser múltiplo de 4 y con igual cantidad D/R.</div>
        <div style="max-height:260px; overflow:auto; margin-top:10px;">
          ${poolPlayers.length ? poolPlayers.map(p => `
            <div class="hint muted">• ${esc(p.name)} — ${esc(p.side)} — ${Number(p.rating||0).toFixed(1)}</div>
          `).join("") : `<div class="hint muted">No hay jugadores en el pool. Selecciónalos en Base.</div>`}
        </div>
      </div>

      <div class="card" style="margin-top:12px;">
        <h3 style="margin:0 0 10px;">Equipos</h3>

        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:12px;">
          <div class="card" style="background: rgba(0,0,0,.12);">
            <h4 style="margin:0 0 8px;">Equipo A</h4>
            <div class="hint muted">Promedio: <b>${esc(aAvg)}</b> • D:${esc(aD)} R:${esc(aR)}</div>
            <div style="margin-top:10px;">
              ${teamA.length ? teamA.map(p => `<div class="hint muted">${esc(p.name)} • ${esc(p.side)} • ${Number(p.rating||0).toFixed(1)}</div>`).join("") : `<div class="hint muted">—</div>`}
            </div>
          </div>

          <div class="card" style="background: rgba(0,0,0,.12);">
            <h4 style="margin:0 0 8px;">Equipo B</h4>
            <div class="hint muted">Promedio: <b>${esc(bAvg)}</b> • D:${esc(bD)} R:${esc(bR)}</div>
            <div style="margin-top:10px;">
              ${teamB.length ? teamB.map(p => `<div class="hint muted">${esc(p.name)} • ${esc(p.side)} • ${Number(p.rating||0).toFixed(1)}</div>`).join("") : `<div class="hint muted">—</div>`}
            </div>
          </div>
        </div>
      </div>
    `;

    const statusEl = $("teamsStatus");
    const setStatus = (msg, cls="muted") => {
      if (!statusEl) return;
      statusEl.textContent = msg || "";
      statusEl.className = "hint " + cls;
    };

    $("teamsDate")?.addEventListener("change", (e) => {
      const v = e.target.value;
      Store.setState({
        session_date: v,
        session_seq: 1,
        session_key: null,
        turns: null,
        courts: 0,
        summary: null,
      });
    });

    $("btnAutoTeams")?.addEventListener("click", () => {
      try {
        const pool = getPoolPlayers();
        const { teamA, teamB } = autoBalanceTeams(pool);

        Store.setState({ team_a: teamA, team_b: teamB });
        setStatus("✅ Equipos autoarmados.", "ok");
        render();
      } catch (e) {
        setStatus(`❌ ${e?.message || e}`, "error");
      }
    });

    $("btnClearTeams")?.addEventListener("click", () => {
      Store.setState({ team_a: [], team_b: [] });
      setStatus("Listo. Equipos limpiados.", "muted");
      render();
    });

    // ✅ Guardar como nueva sesión (auto-increment)
    $("btnSaveTeams")?.addEventListener("click", async () => {
      try {
        const date = $("teamsDate")?.value || Store.state?.session_date || todayISO();
        const A = Store.state?.team_a || [];
        const B = Store.state?.team_b || [];

        if (!A.length || !B.length) throw new Error("Primero arma los equipos A/B.");
        if ((A.length + B.length) % 4 !== 0) throw new Error("Total de jugadores debe ser múltiplo de 4.");

        setStatus("Guardando equipos (nueva sesión)…", "muted");

        const saved = await saveTeamsToHistory(date, A.length + B.length, A, B);

        // ✅ fijamos la sesión actual (clave para NO mezclar)
        Store.setState({
          session_date: saved.session_date,
          session_seq: saved.session_seq,
          session_key: saved.session_key,
          turns: null,
          courts: 0,
          summary: null,
        });

        setStatus(`✅ Guardado. Sesión: ${saved.session_key}`, "ok");

        window.OP = window.OP || {};
        window.OP.refresh?.("history");
      } catch (e) {
        console.error(e);
        setStatus(`❌ Error al guardar equipos: ${e?.message || e}`, "error");
      }
    });
  }

  // Integración con navegación
  window.OP = window.OP || {};
  const prev = window.OP.refresh;
  window.OP.refresh = (view) => {
    if (typeof prev === "function") prev(view);
    if (view === "teams") render();
  };

  window.addEventListener("op:storeReady", render);
  window.addEventListener("op:stateChanged", () => {
    const teamsView = document.getElementById("viewTeams");
    if (teamsView && teamsView.style.display !== "none") render();
  });
  document.addEventListener("DOMContentLoaded", render);
})();

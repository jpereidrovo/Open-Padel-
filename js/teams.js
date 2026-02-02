// teams.js — Equipos (pool -> A/B) + mover manualmente + guardar a historial (sessions)
// ✅ Fondo estable (sin “cambios de color” por rgba anidado)
// ✅ Autoarmar ahora random en cada click (mantiene reglas)

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

  function uniqById(list) {
    const out = [];
    const seen = new Set();
    for (const p of (list || [])) {
      if (!p || !p.id) continue;
      const id = String(p.id);
      if (seen.has(id)) continue;
      seen.add(id);
      out.push(p);
    }
    return out;
  }

  function removeById(list, id) {
    return (list || []).filter(p => String(p.id) !== String(id));
  }

  function findById(list, id) {
    return (list || []).find(p => String(p.id) === String(id)) || null;
  }

  function computeUnassigned(poolPlayers, teamA, teamB) {
    const used = new Set([...(teamA||[]), ...(teamB||[])].map(p => String(p.id)));
    return poolPlayers.filter(p => !used.has(String(p.id)));
  }

  function splitBySide(list) {
    const D = list.filter(p => p.side === "D").sort((a,b)=>Number(b.rating)-Number(a.rating));
    const R = list.filter(p => p.side === "R").sort((a,b)=>Number(b.rating)-Number(a.rating));
    return { D, R };
  }

  // Shuffle “suave” para que cada click sea distinto pero mantenga balance por rating
  function softRandomizeByPairs(sortedList) {
    const a = sortedList.slice();
    for (let i = 0; i < a.length - 1; i += 2) {
      if (Math.random() < 0.5) {
        [a[i], a[i+1]] = [a[i+1], a[i]];
      }
    }
    // además, un par de swaps aleatorios locales
    for (let k = 0; k < 3; k++) {
      const i = Math.floor(Math.random() * Math.max(1, a.length - 1));
      const j = Math.min(a.length - 1, i + 1);
      if (a[i] && a[j] && Math.random() < 0.35) {
        [a[i], a[j]] = [a[j], a[i]];
      }
    }
    return a;
  }

  // Autoarmar: random controlado + ajuste para promedios
  function autoBalanceTeams(poolPlayers) {
    const { D: D0, R: R0 } = splitBySide(poolPlayers);

    if (poolPlayers.length % 4 !== 0) {
      throw new Error("El pool debe ser múltiplo de 4.");
    }
    if (D0.length !== R0.length) {
      throw new Error("El pool debe tener igual cantidad de Derecha (D) y Revés (R).");
    }

    // ✅ aquí la diferencia: random suave cada click
    const D = softRandomizeByPairs(D0);
    const R = softRandomizeByPairs(R0);

    const A = [];
    const B = [];

    // Reparte revés alternando
    for (let i = 0; i < R.length; i++) {
      (i % 2 === 0 ? A : B).push(R[i]);
    }
    // Reparte derecha cruzado para compensar
    for (let i = 0; i < D.length; i++) {
      (i % 2 === 0 ? B : A).push(D[i]);
    }

    // Ajuste para acercar promedios (swap del mismo lado)
    let tries = 0;
    while (tries < 30) {
      tries++;
      const diff = avgRating(A) - avgRating(B);
      if (Math.abs(diff) <= 0.15) break;

      const src = diff > 0 ? A : B;
      const dst = diff > 0 ? B : A;

      const pickSide = () => {
        const canD = src.some(p => p.side === "D") && dst.some(p => p.side === "D");
        const canR = src.some(p => p.side === "R") && dst.some(p => p.side === "R");
        if (canD && canR) return Math.random() < 0.5 ? "D" : "R";
        if (canD) return "D";
        if (canR) return "R";
        return null;
      };

      const side = pickSide();
      if (!side) break;

      const sList = src.filter(p => p.side === side).sort((a,b)=>Number(a.rating)-Number(b.rating));
      const dList = dst.filter(p => p.side === side).sort((a,b)=>Number(a.rating)-Number(b.rating));

      // swap de medianos (estable) o aleatorio (para variar)
      const siPick = Math.random() < 0.6 ? Math.floor(sList.length/2) : Math.floor(Math.random()*sList.length);
      const diPick = Math.random() < 0.6 ? Math.floor(dList.length/2) : Math.floor(Math.random()*dList.length);

      const s = sList[siPick];
      const d = dList[diPick];
      if (!s || !d) break;

      const si = src.findIndex(p => p.id === s.id);
      const di = dst.findIndex(p => p.id === d.id);
      src[si] = d;
      dst[di] = s;
    }

    return { teamA: A, teamB: B };
  }

  function renderWarning(teamA, teamB, poolPlayers) {
    const total = teamA.length + teamB.length;
    const okMultiple = total % 4 === 0 && total > 0;

    const aD = countSide(teamA, "D"), aR = countSide(teamA, "R");
    const bD = countSide(teamB, "D"), bR = countSide(teamB, "R");

    const msg = [];
    if (!poolPlayers.length) msg.push("No hay jugadores en el pool (selecciónalos en Base).");
    if (poolPlayers.length && poolPlayers.length % 4 !== 0) msg.push("Pool: debe ser múltiplo de 4 (Base).");
    if (poolPlayers.length) {
      const { D, R } = splitBySide(poolPlayers);
      if (D.length !== R.length) msg.push("Pool: D y R deben ser iguales (Base).");
    }

    if (!okMultiple) msg.push("Equipos: total debe ser múltiplo de 4 para jugar.");
    if (aD !== aR) msg.push("Equipo A: D/R desbalanceado.");
    if (bD !== bR) msg.push("Equipo B: D/R desbalanceado.");

    return msg.length ? ("⚠️ " + msg.join(" • ")) : "✅ Listo.";
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
    const teamA = uniqById(Array.isArray(Store.state?.team_a) ? Store.state.team_a : []);
    const teamB = uniqById(Array.isArray(Store.state?.team_b) ? Store.state.team_b : []);

    const unassigned = computeUnassigned(poolPlayers, teamA, teamB);

    const aAvg = avgRating(teamA).toFixed(2);
    const bAvg = avgRating(teamB).toFixed(2);

    const aD = countSide(teamA, "D"), aR = countSide(teamA, "R");
    const bD = countSide(teamB, "D"), bR = countSide(teamB, "R");

    // ✅ estilos inline para evitar “fondo cambiante” por rgba anidado
    const panelStyle = `
      border:1px solid rgba(255,255,255,.10);
      background: rgba(0,0,0,.06);
      border-radius: 14px;
      padding: 12px;
    `;

    mount.innerHTML = `
      <div class="card" style="margin-top:10px;">
        <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:end; justify-content:space-between;">
          <div>
            <label>Fecha</label>
            <input id="teamsDate" type="date" value="${esc(session_date)}" />
            <div class="hint muted" style="margin-top:6px;">
              ${esc(renderWarning(teamA, teamB, poolPlayers))}
            </div>
          </div>

          <div class="btns">
            <button class="ghost" id="btnAutoTeams" type="button">Autoarmar (random)</button>
            <button class="ghost" id="btnClearTeams" type="button">Limpiar equipos</button>
            <button class="primary" id="btnSaveTeams" type="button">Guardar equipos</button>
          </div>
        </div>

        <div id="teamsStatus" class="hint muted" style="margin-top:10px;"></div>
      </div>

      <div class="card" style="margin-top:12px;">
        <h3 style="margin:0 0 10px;">Pool (${poolPlayers.length})</h3>
        <div class="hint muted">Seleccionados en Base. Aquí puedes asignarlos a A/B manualmente.</div>

        <div style="display:grid; grid-template-columns: 1fr 1fr 1fr; gap:12px; margin-top:10px;">
          <div style="${panelStyle}">
            <h4 style="margin:0 0 10px;">Sin asignar (${unassigned.length})</h4>
            <div style="display:grid; gap:8px;">
              ${unassigned.length ? unassigned.map(p => `
                <div style="display:flex; justify-content:space-between; gap:10px; align-items:center;">
                  <div class="hint muted"><b>${esc(p.name)}</b> • ${esc(p.side)} • ${Number(p.rating||0).toFixed(1)}</div>
                  <div class="btns">
                    <button class="ghost" data-add-a="${esc(p.id)}" type="button">+A</button>
                    <button class="ghost" data-add-b="${esc(p.id)}" type="button">+B</button>
                  </div>
                </div>
              `).join("") : `<div class="hint muted">—</div>`}
            </div>
          </div>

          <div style="${panelStyle}">
            <h4 style="margin:0 0 10px;">Equipo A (${teamA.length})</h4>
            <div class="hint muted">Promedio: <b>${esc(aAvg)}</b> • D:${esc(aD)} R:${esc(aR)}</div>
            <div style="display:grid; gap:8px; margin-top:10px;">
              ${teamA.length ? teamA.map(p => `
                <div style="display:flex; justify-content:space-between; gap:10px; align-items:center;">
                  <div class="hint muted"><b>${esc(p.name)}</b> • ${esc(p.side)} • ${Number(p.rating||0).toFixed(1)}</div>
                  <div class="btns">
                    <button class="ghost" data-move-a-b="${esc(p.id)}" type="button">→B</button>
                    <button class="ghost" data-rem-a="${esc(p.id)}" type="button">Quitar</button>
                  </div>
                </div>
              `).join("") : `<div class="hint muted">—</div>`}
            </div>
          </div>

          <div style="${panelStyle}">
            <h4 style="margin:0 0 10px;">Equipo B (${teamB.length})</h4>
            <div class="hint muted">Promedio: <b>${esc(bAvg)}</b> • D:${esc(bD)} R:${esc(bR)}</div>
            <div style="display:grid; gap:8px; margin-top:10px;">
              ${teamB.length ? teamB.map(p => `
                <div style="display:flex; justify-content:space-between; gap:10px; align-items:center;">
                  <div class="hint muted"><b>${esc(p.name)}</b> • ${esc(p.side)} • ${Number(p.rating||0).toFixed(1)}</div>
                  <div class="btns">
                    <button class="ghost" data-move-b-a="${esc(p.id)}" type="button">←A</button>
                    <button class="ghost" data-rem-b="${esc(p.id)}" type="button">Quitar</button>
                  </div>
                </div>
              `).join("") : `<div class="hint muted">—</div>`}
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
      Store.setState({ session_date: e.target.value });
    });

    function commitTeams(nextA, nextB) {
      Store.setState({ team_a: uniqById(nextA), team_b: uniqById(nextB) });
      render();
    }

    $("btnAutoTeams")?.addEventListener("click", () => {
      try {
        const pool = getPoolPlayers();
        const { teamA: A, teamB: B } = autoBalanceTeams(pool);
        Store.setState({ team_a: A, team_b: B });
        setStatus("✅ Equipos autoarmados (random).", "ok");
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

    mount.querySelectorAll("[data-add-a]").forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-add-a");
        const p = findById(poolPlayers, id);
        if (!p) return;
        commitTeams([...teamA, p], teamB);
        setStatus("Jugador asignado a Equipo A.", "muted");
      });
    });

    mount.querySelectorAll("[data-add-b]").forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-add-b");
        const p = findById(poolPlayers, id);
        if (!p) return;
        commitTeams(teamA, [...teamB, p]);
        setStatus("Jugador asignado a Equipo B.", "muted");
      });
    });

    mount.querySelectorAll("[data-move-a-b]").forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-move-a-b");
        const p = findById(teamA, id);
        if (!p) return;
        commitTeams(removeById(teamA, id), [...teamB, p]);
        setStatus("Jugador movido A → B.", "muted");
      });
    });

    mount.querySelectorAll("[data-move-b-a]").forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-move-b-a");
        const p = findById(teamB, id);
        if (!p) return;
        commitTeams([...teamA, p], removeById(teamB, id));
        setStatus("Jugador movido B → A.", "muted");
      });
    });

    mount.querySelectorAll("[data-rem-a]").forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-rem-a");
        commitTeams(removeById(teamA, id), teamB);
        setStatus("Jugador quitado de Equipo A.", "muted");
      });
    });

    mount.querySelectorAll("[data-rem-b]").forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-rem-b");
        commitTeams(teamA, removeById(teamB, id));
        setStatus("Jugador quitado de Equipo B.", "muted");
      });
    });

    $("btnSaveTeams")?.addEventListener("click", async () => {
      try {
        const date = $("teamsDate")?.value || Store.state?.session_date || todayISO();
        const A = Store.state?.team_a || [];
        const B = Store.state?.team_b || [];

        if (!A.length || !B.length) throw new Error("Primero arma los equipos A/B.");
        if ((A.length + B.length) % 4 !== 0) throw new Error("Total de jugadores debe ser múltiplo de 4.");

        setStatus("Guardando equipos en historial…", "muted");
        await saveTeamsToHistory(date, A.length + B.length, A, B);

        setStatus("✅ Equipos guardados. Ve a Historial y recarga.", "ok");
        window.OP = window.OP || {};
        window.OP.refresh?.("history");
      } catch (e) {
        console.error(e);
        setStatus(`❌ Error al guardar equipos: ${e?.message || e}`, "error");
      }
    });
  }

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

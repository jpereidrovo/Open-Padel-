// teams.js — Equipos (pool -> A/B) + edición manual + guardar a historial (sessions) con multi-sesión

import { Store } from "./store.js";
import { saveTeamsToHistory } from "./supabaseApi.js";

(function () {
  const $ = (id) => document.getElementById(id);
  const esc = (s) =>
    String(s ?? "")
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
    return players.filter((p) => p.side === side).length;
  }

  function getPoolPlayers() {
    const poolIds = new Set(Store.state?.pool || []);
    return (Store.players || []).filter((p) => poolIds.has(p.id));
  }

  function byRatingDesc(a, b) {
    return Number(b.rating || 0) - Number(a.rating || 0);
  }

  function uniqById(list) {
    const seen = new Set();
    const out = [];
    for (const p of list || []) {
      if (!p?.id) continue;
      if (seen.has(p.id)) continue;
      seen.add(p.id);
      out.push(p);
    }
    return out;
  }

  function setTeams(teamA, teamB) {
    const A = uniqById(teamA || []);
    const B = uniqById(teamB || []);

    // Evitar que un jugador exista en ambos equipos
    const aIds = new Set(A.map((p) => p.id));
    const Bclean = B.filter((p) => !aIds.has(p.id));

    Store.setState({ team_a: A, team_b: Bclean });
  }

  function splitBySide(list) {
    const D = list.filter((p) => p.side === "D").sort(byRatingDesc);
    const R = list.filter((p) => p.side === "R").sort(byRatingDesc);
    return { D, R };
  }

  // Auto-balance simple (igual que antes)
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

      const srcD = src.filter((p) => p.side === "D");
      const dstD = dst.filter((p) => p.side === "D");
      const srcR = src.filter((p) => p.side === "R");
      const dstR = dst.filter((p) => p.side === "R");

      const swapSide = srcD.length && dstD.length ? "D" : srcR.length && dstR.length ? "R" : null;
      if (!swapSide) break;

      const sList = src.filter((p) => p.side === swapSide).sort((a, b) => Number(a.rating) - Number(b.rating));
      const dList = dst.filter((p) => p.side === swapSide).sort((a, b) => Number(a.rating) - Number(b.rating));

      const s = sList[Math.floor(sList.length / 2)];
      const d = dList[Math.floor(dList.length / 2)];
      if (!s || !d) break;

      const si = src.findIndex((p) => p.id === s.id);
      const di = dst.findIndex((p) => p.id === d.id);
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

    const poolPlayers = getPoolPlayers().slice().sort(byRatingDesc);

    const session_date = Store.state?.session_date || todayISO();
    const session_seq = Store.state?.session_seq || null;
    const session_key = Store.state?.session_key || null;

    const teamA = Array.isArray(Store.state?.team_a) ? Store.state.team_a : [];
    const teamB = Array.isArray(Store.state?.team_b) ? Store.state.team_b : [];

    const A = uniqById(teamA).slice().sort(byRatingDesc);
    const B = uniqById(teamB).slice().sort(byRatingDesc);

    // disponibles = pool - (A∪B)
    const used = new Set([...A, ...B].map((p) => p.id));
    const available = poolPlayers.filter((p) => !used.has(p.id));

    const aAvg = avgRating(A).toFixed(2);
    const bAvg = avgRating(B).toFixed(2);

    const aD = countSide(A, "D"),
      aR = countSide(A, "R");
    const bD = countSide(B, "D"),
      bR = countSide(B, "R");

    const sessionLabel = session_key
      ? `Sesión actual: ${esc(session_date)} - ${esc(session_seq || session_key.split("-").pop())}`
      : "Sesión actual: — (aún no guardada)";

    const rowSmall = (p) =>
      `<span class="hint muted">${esc(p.side)} • ${Number(p.rating || 0).toFixed(1)}</span>`;

    mount.innerHTML = `
      <div class="card" style="margin-top:10px;">
        <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:end; justify-content:space-between;">
          <div>
            <label>Fecha</label>
            <input id="teamsDate" type="date" value="${esc(session_date)}" />
            <div class="hint muted" style="margin-top:6px;">${sessionLabel}</div>
          </div>

          <div class="btns">
            <button class="ghost" id="btnAutoTeams" type="button">Autoarmar</button>
            <button class="ghost" id="btnClearTeams" type="button">Limpiar equipos</button>
            <button class="primary" id="btnSaveTeams" type="button">Guardar equipos (nueva sesión)</button>
          </div>
        </div>

        <div id="teamsStatus" class="hint muted" style="margin-top:10px;"></div>
      </div>

      <div class="card" style="margin-top:12px;">
        <h3 style="margin:0 0 10px;">Edición manual</h3>
        <div class="hint muted">Agrega/quita jugadores desde el pool y mueve entre A ↔ B.</div>

        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:12px; margin-top:10px;">
          <div class="card" style="background: rgba(0,0,0,.12);">
            <h4 style="margin:0 0 8px;">Pool disponible (${available.length})</h4>
            <div class="hint muted">Son los del pool que todavía no están en A/B.</div>
            <div style="max-height:260px; overflow:auto; margin-top:10px; display:grid; gap:6px;">
              ${
                available.length
                  ? available
                      .map(
                        (p) => `
                <div style="display:flex; align-items:center; justify-content:space-between; gap:10px;">
                  <div>
                    <b>${esc(p.name)}</b> ${rowSmall(p)}
                  </div>
                  <div class="btns">
                    <button class="ghost" type="button" data-add="A:${esc(p.id)}">+A</button>
                    <button class="ghost" type="button" data-add="B:${esc(p.id)}">+B</button>
                  </div>
                </div>`
                      )
                      .join("")
                  : `<div class="hint muted">—</div>`
              }
            </div>
          </div>

          <div class="card" style="background: rgba(0,0,0,.12);">
            <h4 style="margin:0 0 8px;">Pool seleccionado (${poolPlayers.length})</h4>
            <div style="max-height:260px; overflow:auto; margin-top:10px;">
              ${
                poolPlayers.length
                  ? poolPlayers
                      .map(
                        (p) => `<div class="hint muted">• ${esc(p.name)} — ${esc(p.side)} — ${Number(p.rating || 0).toFixed(1)}</div>`
                      )
                      .join("")
                  : `<div class="hint muted">No hay jugadores en el pool. Selecciónalos en Base.</div>`
              }
            </div>
          </div>
        </div>
      </div>

      <div class="card" style="margin-top:12px;">
        <h3 style="margin:0 0 10px;">Equipos</h3>

        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:12px;">
          <div class="card" style="background: rgba(0,0,0,.12);">
            <h4 style="margin:0 0 8px;">Equipo A</h4>
            <div class="hint muted">Promedio: <b>${esc(aAvg)}</b> • D:${esc(aD)} R:${esc(aR)} • Total:${esc(A.length)}</div>

            <div style="margin-top:10px; display:grid; gap:6px;">
              ${
                A.length
                  ? A
                      .map(
                        (p) => `
                <div style="display:flex; align-items:center; justify-content:space-between; gap:10px;">
                  <div>
                    <b>${esc(p.name)}</b> ${rowSmall(p)}
                  </div>
                  <div class="btns">
                    <button class="ghost" type="button" data-move="AtoB:${esc(p.id)}">→B</button>
                    <button class="ghost" type="button" data-remove="A:${esc(p.id)}">Quitar</button>
                  </div>
                </div>`
                      )
                      .join("")
                  : `<div class="hint muted">—</div>`
              }
            </div>
          </div>

          <div class="card" style="background: rgba(0,0,0,.12);">
            <h4 style="margin:0 0 8px;">Equipo B</h4>
            <div class="hint muted">Promedio: <b>${esc(bAvg)}</b> • D:${esc(bD)} R:${esc(bR)} • Total:${esc(B.length)}</div>

            <div style="margin-top:10px; display:grid; gap:6px;">
              ${
                B.length
                  ? B
                      .map(
                        (p) => `
                <div style="display:flex; align-items:center; justify-content:space-between; gap:10px;">
                  <div>
                    <b>${esc(p.name)}</b> ${rowSmall(p)}
                  </div>
                  <div class="btns">
                    <button class="ghost" type="button" data-move="BtoA:${esc(p.id)}">←A</button>
                    <button class="ghost" type="button" data-remove="B:${esc(p.id)}">Quitar</button>
                  </div>
                </div>`
                      )
                      .join("")
                  : `<div class="hint muted">—</div>`
              }
            </div>
          </div>
        </div>
      </div>
    `;

    const statusEl = $("teamsStatus");
    const setStatus = (msg, cls = "muted") => {
      if (!statusEl) return;
      statusEl.textContent = msg || "";
      statusEl.className = "hint " + cls;
    };

    // Fecha
    $("teamsDate")?.addEventListener("change", (e) => {
      Store.setState({
        session_date: e.target.value,
        session_key: null,
        session_seq: null,
      });
      render();
    });

    // Autoarmar
    $("btnAutoTeams")?.addEventListener("click", () => {
      try {
        if (!poolPlayers.length) throw new Error("No hay jugadores en el pool. Selecciónalos en Base.");
        const { teamA: AA, teamB: BB } = autoBalanceTeams(poolPlayers);
        setTeams(AA, BB);
        setStatus("✅ Equipos autoarmados. Puedes ajustar manualmente.", "ok");
        render();
      } catch (e) {
        setStatus(`❌ ${e?.message || e}`, "error");
      }
    });

    // Limpiar
    $("btnClearTeams")?.addEventListener("click", () => {
      Store.setState({ team_a: [], team_b: [], session_key: null, session_seq: null });
      setStatus("Listo. Equipos limpiados.", "muted");
      render();
    });

    // Guardar (siempre crea nueva sesión)
    $("btnSaveTeams")?.addEventListener("click", async () => {
      try {
        const date = $("teamsDate")?.value || Store.state?.session_date || todayISO();
        const AA = Store.state?.team_a || [];
        const BB = Store.state?.team_b || [];

        if (!AA.length || !BB.length) throw new Error("Primero arma los equipos A/B.");
        if ((AA.length + BB.length) % 4 !== 0) throw new Error("Total de jugadores debe ser múltiplo de 4.");

        setStatus("Guardando equipos (nueva sesión)…", "muted");

        const saved = await saveTeamsToHistory(date, AA.length + BB.length, AA, BB);

        Store.setState({
          session_date: date,
          session_key: saved.session_key,
          session_seq: saved.session_seq,
        });

        setStatus(`✅ Equipos guardados como ${saved.session_key}`, "ok");
        render();
      } catch (e) {
        console.error(e);
        setStatus(`❌ Error al guardar equipos: ${e?.message || e}`, "error");
      }
    });

    // ------- Handlers edición manual -------
    // Add from available -> A/B
    mount.querySelectorAll("[data-add]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const val = btn.getAttribute("data-add") || "";
        const [team, id] = val.split(":");
        const p = poolPlayers.find((x) => x.id === id);
        if (!p) return;

        const curA = uniqById(Store.state?.team_a || []);
        const curB = uniqById(Store.state?.team_b || []);

        // Si ya está en alguno, no duplicar
        const inA = curA.some((x) => x.id === id);
        const inB = curB.some((x) => x.id === id);
        if (inA || inB) return;

        if (team === "A") curA.push(p);
        else curB.push(p);

        setTeams(curA, curB);
        render();
      });
    });

    // Remove from team -> vuelve a disponible (solo lo quita del equipo)
    mount.querySelectorAll("[data-remove]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const val = btn.getAttribute("data-remove") || "";
        const [team, id] = val.split(":");

        const curA = uniqById(Store.state?.team_a || []);
        const curB = uniqById(Store.state?.team_b || []);

        if (team === "A") setTeams(curA.filter((x) => x.id !== id), curB);
        else setTeams(curA, curB.filter((x) => x.id !== id));

        render();
      });
    });

    // Move A <-> B
    mount.querySelectorAll("[data-move]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const val = btn.getAttribute("data-move") || "";
        const [dir, id] = val.split(":");

        const curA = uniqById(Store.state?.team_a || []);
        const curB = uniqById(Store.state?.team_b || []);

        if (dir === "AtoB") {
          const p = curA.find((x) => x.id === id);
          if (!p) return;
          const newA = curA.filter((x) => x.id !== id);
          const newB = curB.some((x) => x.id === id) ? curB : [...curB, p];
          setTeams(newA, newB);
        } else if (dir === "BtoA") {
          const p = curB.find((x) => x.id === id);
          if (!p) return;
          const newB = curB.filter((x) => x.id !== id);
          const newA = curA.some((x) => x.id === id) ? curA : [...curA, p];
          setTeams(newA, newB);
        }

        render();
      });
    });

    setStatus("✅ Teams listo. Autoarmar o ajusta manualmente.", "muted");
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
    const view = document.getElementById("viewTeams");
    if (view && view.style.display !== "none") render();
  });
  document.addEventListener("DOMContentLoaded", render);
})();

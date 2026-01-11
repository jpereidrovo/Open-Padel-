// turns.js — Generar turnos + ingresar marcadores + guardar a historial (results)

import { Store } from "./store.js";
import { getHistoryDetail, saveResultsToHistory } from "./supabaseApi.js";

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

  function formatScoreDigits(raw) {
    const digits = String(raw || "").replace(/\D/g, "").slice(0, 2);
    if (digits.length === 0) return "";
    if (digits.length === 1) return digits;
    return `${digits[0]}-${digits[1]}`;
  }

  function parseScore(raw) {
    const digits = String(raw || "").replace(/\D/g, "").slice(0, 2);
    if (digits.length !== 2) return null;
    const a = Number(digits[0]);
    const b = Number(digits[1]);
    if (Number.isNaN(a) || Number.isNaN(b)) return null;
    if (a < 0 || a > 7 || b < 0 || b > 7) return null;
    if (a === b) return null; // no empates
    return { a, b, digits };
  }

  function winnerFromScore(scoreObj) {
    if (!scoreObj) return null;
    return scoreObj.a > scoreObj.b ? "TOP" : "BOTTOM";
  }

  // Crea parejas dentro de un equipo: siempre 1 D + 1 R
  function buildPairs(teamPlayers) {
    const D = teamPlayers.filter(p => p.side === "D").sort((a,b)=>Number(b.rating)-Number(a.rating));
    const R = teamPlayers.filter(p => p.side === "R").sort((a,b)=>Number(b.rating)-Number(a.rating));
    const pairs = [];
    const n = Math.min(D.length, R.length);
    for (let i = 0; i < n; i++) {
      pairs.push([D[i], R[i]]);
    }
    return pairs;
  }

  // Genera cruces A vs B por canchas para un turno, intentando evitar repetir parejas A o B entre turnos
  function generateTurns(teamA, teamB, numTurns) {
    const pairsA = buildPairs(teamA);
    const pairsB = buildPairs(teamB);

    const courts = Math.min(pairsA.length, pairsB.length);
    if (courts <= 0) throw new Error("Equipos incompletos para armar parejas.");

    // helper shuffle
    const shuffle = (arr) => {
      const a = arr.slice();
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    };

    // para evitar repeticiones exactas de parejas dentro del mismo equipo en turnos
    // (siempre serán las mismas parejas si buildPairs es fijo; por eso hacemos “re-parejas” por turno)
    // estrategia: remezclar D y R dentro de cada equipo por turno
    const turns = [];
    const usedPairsA = new Set(); // "id1-id2"
    const usedPairsB = new Set();

    const pairKey = (p) => {
      const ids = [p[0].id, p[1].id].sort();
      return ids.join("-");
    };

    for (let t = 1; t <= numTurns; t++) {
      // intentar varias veces para no repetir parejas internas
      let best = null;

      for (let attempt = 0; attempt < 40; attempt++) {
        const AD = shuffle(teamA.filter(p => p.side === "D"));
        const AR = shuffle(teamA.filter(p => p.side === "R"));
        const BD = shuffle(teamB.filter(p => p.side === "D"));
        const BR = shuffle(teamB.filter(p => p.side === "R"));

        const nA = Math.min(AD.length, AR.length);
        const nB = Math.min(BD.length, BR.length);

        const candPairsA = [];
        const candPairsB = [];

        for (let i = 0; i < nA; i++) candPairsA.push([AD[i], AR[i]]);
        for (let i = 0; i < nB; i++) candPairsB.push([BD[i], BR[i]]);

        // recorta al número de canchas
        const Ause = candPairsA.slice(0, courts);
        const Buse = candPairsB.slice(0, courts);

        // score attempt: cuántas parejas nuevas logra
        let newCount = 0;
        for (const p of Ause) if (!usedPairsA.has(pairKey(p))) newCount++;
        for (const p of Buse) if (!usedPairsB.has(pairKey(p))) newCount++;

        if (!best || newCount > best.newCount) {
          best = { Ause, Buse, newCount };
          if (newCount === courts * 2) break;
        }
      }

      const Ause = best.Ause;
      const Buse = best.Buse;

      // guarda como usadas
      for (const p of Ause) usedPairsA.add(pairKey(p));
      for (const p of Buse) usedPairsB.add(pairKey(p));

      // arma matches (cancha i): pareja A vs pareja B
      const matches = [];
      for (let i = 0; i < courts; i++) {
        matches.push({
          court: i + 1,
          top: { team: "A", pair: Ause[i] },     // arriba = equipo A
          bottom: { team: "B", pair: Buse[i] },  // abajo = equipo B
          scoreRaw: "",
        });
      }

      turns.push({ turnIndex: t, matches });
    }

    return { courts, turns };
  }

  function allScoresComplete(turns) {
    for (const t of turns) {
      for (const m of t.matches) {
        if (!parseScore(m.scoreRaw)) return false;
      }
    }
    return true;
  }

  function computeSummary(turns) {
    // puntos por turno: 1,2,3...
    let totalA = 0;
    let totalB = 0;
    const perTurn = [];

    for (const t of turns) {
      const pts = Number(t.turnIndex || 1);
      let aPts = 0;
      let bPts = 0;

      for (const m of t.matches) {
        const sc = parseScore(m.scoreRaw);
        const win = winnerFromScore(sc);
        if (!win) continue;
        if (win === "TOP") aPts += pts;
        else bPts += pts;
      }

      totalA += aPts;
      totalB += bPts;
      perTurn.push({ turn: t.turnIndex, aPts, bPts });
    }

    return { totalA, totalB, perTurn };
  }

  async function ensureTeamsLoaded(dateISO) {
    // Si ya hay equipos en memoria, usar
    const A = Store.state?.team_a || [];
    const B = Store.state?.team_b || [];
    if (A.length && B.length) return { A, B };

    // si no, buscar en sessions por fecha (history detail)
    const detail = await getHistoryDetail(dateISO);
    const session = detail?.session;
    if (!session) throw new Error("No hay equipos guardados en esta fecha. Ve a Equipos y guarda primero.");
    return { A: session.team_a || [], B: session.team_b || [] };
  }

  function render() {
    const mount = $("turnsMount");
    if (!mount) return;

    if (!Store.ready) {
      mount.innerHTML = `<div class="card" style="margin-top:10px;"><div class="hint muted">Inicia sesión para usar Turnos.</div></div>`;
      return;
    }

    const date = Store.state?.session_date || todayISO();
    const turnsState = Array.isArray(Store.state?.turns) ? Store.state.turns : [];
    const courts = Store.state?.courts || 0;

    mount.innerHTML = `
      <div class="card" style="margin-top:10px;">
        <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:end; justify-content:space-between;">
          <div>
            <label>Fecha</label>
            <input id="turnsDate" type="date" value="${esc(date)}" />
          </div>

          <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:end;">
            <div>
              <label>Turnos</label>
              <select id="turnCount">
                ${[1,2,3,4].map(n => `<option value="${n}" ${n===3?"selected":""}>${n}</option>`).join("")}
              </select>
            </div>

            <div class="btns">
              <button class="ghost" id="btnGenTurns">Generar turnos</button>
              <button class="primary" id="btnSaveTurns" disabled>Guardar resultados</button>
            </div>
          </div>
        </div>

        <div id="turnsStatus" class="hint muted" style="margin-top:10px;"></div>
      </div>

      <div id="turnsTable"></div>

      <div id="turnsResults"></div>
    `;

    const statusEl = $("turnsStatus");
    const setStatus = (msg, cls="muted") => {
      statusEl.textContent = msg || "";
      statusEl.className = "hint " + cls;
    };

    $("turnsDate")?.addEventListener("change", (e) => {
      Store.setState({ session_date: e.target.value });
    });

    const drawTurns = () => {
      const table = $("turnsTable");
      const results = $("turnsResults");
      const btnSave = $("btnSaveTurns");

      if (!turnsState.length) {
        table.innerHTML = `<div class="card" style="margin-top:12px;"><div class="hint muted">Aún no hay turnos generados.</div></div>`;
        results.innerHTML = "";
        btnSave.disabled = true;
        return;
      }

      // tabla por turno
      table.innerHTML = turnsState.map(t => `
        <div class="card" style="margin-top:12px;">
          <h3 style="margin:0 0 10px;">Turno ${esc(t.turnIndex)} (${esc(courts)} canchas)</h3>

          <div style="overflow:auto;">
            <table style="width:100%; border-collapse:collapse;">
              <thead>
                <tr class="hint muted">
                  <th style="text-align:left; padding:8px;">Cancha</th>
                  <th style="text-align:left; padding:8px;">Equipo A (arriba)</th>
                  <th style="text-align:left; padding:8px;">Equipo B (abajo)</th>
                  <th style="text-align:left; padding:8px;">Marcador</th>
                  <th style="text-align:left; padding:8px;">Ganador</th>
                </tr>
              </thead>
              <tbody>
                ${t.matches.map((m, idx) => {
                  const top = m.top.pair;
                  const bot = m.bottom.pair;
                  const scoreFmt = formatScoreDigits(m.scoreRaw);
                  const sc = parseScore(m.scoreRaw);
                  const win = winnerFromScore(sc);
                  const winnerTxt = win ? (win === "TOP" ? "Ganador: Equipo A" : "Ganador: Equipo B") : "—";

                  return `
                    <tr>
                      <td style="padding:8px; border-top:1px solid rgba(255,255,255,.08);">#${esc(m.court)}</td>
                      <td style="padding:8px; border-top:1px solid rgba(255,255,255,.08);">
                        ${esc(top[0]?.name)} / ${esc(top[1]?.name)}
                      </td>
                      <td style="padding:8px; border-top:1px solid rgba(255,255,255,.08);">
                        ${esc(bot[0]?.name)} / ${esc(bot[1]?.name)}
                      </td>

                      <td style="padding:8px; border-top:1px solid rgba(255,255,255,.08);">
                        <input
                          inputmode="numeric"
                          maxlength="2"
                          data-score="${esc(t.turnIndex)}:${esc(idx)}"
                          value="${esc(scoreFmt.replace("-", ""))}"
                          style="width:64px;"
                          placeholder="63"
                        />
                        <span class="hint muted" style="margin-left:8px;">${esc(scoreFmt)}</span>
                      </td>

                      <td style="padding:8px; border-top:1px solid rgba(255,255,255,.08);">
                        <span class="hint ${win ? "ok" : "muted"}">${esc(winnerTxt)}</span>
                      </td>
                    </tr>
                  `;
                }).join("")}
              </tbody>
            </table>
          </div>
        </div>
      `).join("");

      // input handling (63 -> 6-3, backspace simple)
      table.querySelectorAll("[data-score]").forEach(inp => {
        inp.addEventListener("input", () => {
          // mantener solo dígitos y máximo 2
          const digits = String(inp.value || "").replace(/\D/g, "").slice(0, 2);
          inp.value = digits;

          const [tStr, mStr] = inp.getAttribute("data-score").split(":");
          const tIndex = Number(tStr);
          const mIndex = Number(mStr);

          const turn = turnsState.find(x => Number(x.turnIndex) === tIndex);
          if (!turn) return;

          turn.matches[mIndex].scoreRaw = digits; // guardamos dígitos, formateamos al mostrar

          Store.setState({ turns: turnsState }); // dispara re-render parcial
          render(); // simple y estable: re-render completo
        });

        inp.addEventListener("keydown", (e) => {
          // evitar que Enter mueva pantalla
          if (e.key === "Enter") e.preventDefault();
        });
      });

      // resultados abajo (tabla limpia)
      const summary = computeSummary(turnsState);

      results.innerHTML = `
        <div class="card" style="margin-top:12px;">
          <h3 style="margin:0 0 10px;">Resultados</h3>

          <div class="hint ok" style="margin-bottom:8px;">
            <b>Equipo A ${esc(summary.totalA)} puntos</b> • <b>Equipo B ${esc(summary.totalB)} puntos</b>
          </div>

          <div style="display:grid; gap:6px;">
            ${summary.perTurn.map(pt => `
              <div class="hint muted">Turno ${esc(pt.turn)}: A ${esc(pt.aPts)} • B ${esc(pt.bPts)}</div>
            `).join("")}
          </div>
        </div>
      `;

      // habilitar guardar si todo completo
      btnSave.disabled = !allScoresComplete(turnsState);
    };

    drawTurns();

    $("btnGenTurns")?.addEventListener("click", async () => {
      try {
        setStatus("Generando turnos…", "muted");

        const dateISO = $("turnsDate")?.value || Store.state?.session_date || todayISO();
        const numTurns = Number($("turnCount")?.value || 3);

        const { A, B } = await ensureTeamsLoaded(dateISO);

        const gen = generateTurns(A, B, numTurns);

        Store.setState({
          session_date: dateISO,
          courts: gen.courts,
          turns: gen.turns
        });

        setStatus("✅ Turnos generados. Completa marcadores para guardar.", "ok");
        render();
      } catch (e) {
        console.error(e);
        setStatus(`❌ ${e?.message || e}`, "error");
      }
    });

    $("btnSaveTurns")?.addEventListener("click", async () => {
      try {
        const dateISO = $("turnsDate")?.value || Store.state?.session_date || todayISO();
        const t = Array.isArray(Store.state?.turns) ? Store.state.turns : [];
        if (!t.length) throw new Error("No hay turnos para guardar.");
        if (!allScoresComplete(t)) throw new Error("Completa todos los marcadores (2 dígitos 0–7, sin empates).");

        setStatus("Guardando resultados en historial…", "muted");

        // payload para historial: turns + summary
        const summary = computeSummary(t);

        // Guardamos "turns" con score como "63" (digits) y en history se formatea
        const turnsPayload = t.map(turn => ({
          turnIndex: turn.turnIndex,
          matches: turn.matches.map(m => ({
            court: m.court,
            top: { team: "A", pair: m.top.pair },
            bottom: { team: "B", pair: m.bottom.pair },
            score: String(m.scoreRaw || "").replace(/\D/g, "").slice(0, 2)
          }))
        }));

        // scores opcional (por si luego lo usas)
        const scoresPayload = { generatedAt: new Date().toISOString() };

        // summary esperado por history.js
        const summaryPayload = {
          totalA: summary.totalA,
          totalB: summary.totalB,
          perTurn: summary.perTurn
        };

        await saveResultsToHistory(dateISO, turnsPayload, scoresPayload, summaryPayload);

        setStatus("✅ Resultados guardados. Ve a Historial.", "ok");

        // refrescar historial si estás ahí
        window.OP = window.OP || {};
        if (typeof window.OP.refresh === "function") window.OP.refresh("turns");
      } catch (e) {
        console.error(e);
        setStatus(`❌ Error al guardar resultados: ${e?.message || e}`, "error");
      }
    });
  }

  // Integración con navegación modular
  window.OP = window.OP || {};
  const prev = window.OP.refresh;
  window.OP.refresh = (view) => {
    if (typeof prev === "function") prev(view);
    if (view === "turns") render();
  };

  window.addEventListener("op:storeReady", render);
  document.addEventListener("DOMContentLoaded", render);
})();

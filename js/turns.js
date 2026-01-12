// turns.js — Generar turnos + ingresar marcadores + guardar a historial (results) con multi-sesión

import { Store } from "./store.js";
import { getHistoryDetailByKey, getLatestSessionKeyByDate, saveResultsToHistory } from "./supabaseApi.js";

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

  function scoreDigits(raw) {
    return String(raw || "").replace(/\D/g, "").slice(0, 2);
  }

  function formatScore(raw) {
    const digits = scoreDigits(raw);
    if (digits.length === 0) return "";
    if (digits.length === 1) return digits;
    return `${digits[0]}-${digits[1]}`;
  }

  function parseScore(raw) {
    const digits = scoreDigits(raw);
    if (digits.length !== 2) return null;
    const a = Number(digits[0]);
    const b = Number(digits[1]);
    if (Number.isNaN(a) || Number.isNaN(b)) return null;
    if (a < 0 || a > 7 || b < 0 || b > 7) return null;
    if (a === b) return null;
    return { a, b, digits };
  }

  function winnerFromScore(sc) {
    if (!sc) return null;
    return sc.a > sc.b ? "A" : "B";
  }

  function buildPairs(teamPlayers) {
    const D = teamPlayers.filter((p) => p.side === "D").sort((a, b) => Number(b.rating) - Number(a.rating));
    const R = teamPlayers.filter((p) => p.side === "R").sort((a, b) => Number(b.rating) - Number(a.rating));
    const pairs = [];
    const n = Math.min(D.length, R.length);
    for (let i = 0; i < n; i++) pairs.push([D[i], R[i]]);
    return pairs;
  }

  function generateTurns(teamA, teamB, numTurns) {
    const courts = Math.min(buildPairs(teamA).length, buildPairs(teamB).length);
    if (courts <= 0) throw new Error("Equipos incompletos para armar parejas.");

    const shuffle = (arr) => {
      const a = arr.slice();
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    };

    const usedA = new Set();
    const usedB = new Set();
    const pairKey = (p) => [p[0].id, p[1].id].sort().join("-");

    const turns = [];

    for (let t = 1; t <= numTurns; t++) {
      let best = null;

      for (let attempt = 0; attempt < 40; attempt++) {
        const AD = shuffle(teamA.filter((p) => p.side === "D"));
        const AR = shuffle(teamA.filter((p) => p.side === "R"));
        const BD = shuffle(teamB.filter((p) => p.side === "D"));
        const BR = shuffle(teamB.filter((p) => p.side === "R"));

        const nA = Math.min(AD.length, AR.length);
        const nB = Math.min(BD.length, BR.length);

        const Ause = [];
        const Buse = [];

        for (let i = 0; i < nA && Ause.length < courts; i++) Ause.push([AD[i], AR[i]]);
        for (let i = 0; i < nB && Buse.length < courts; i++) Buse.push([BD[i], BR[i]]);

        let newCount = 0;
        for (const p of Ause) if (!usedA.has(pairKey(p))) newCount++;
        for (const p of Buse) if (!usedB.has(pairKey(p))) newCount++;

        if (!best || newCount > best.newCount) {
          best = { Ause, Buse, newCount };
          if (newCount === courts * 2) break;
        }
      }

      for (const p of best.Ause) usedA.add(pairKey(p));
      for (const p of best.Buse) usedB.add(pairKey(p));

      const matches = [];
      for (let i = 0; i < courts; i++) {
        matches.push({
          court: i + 1,
          top: { team: "A", pair: best.Ause[i] },
          bottom: { team: "B", pair: best.Buse[i] },
          scoreRaw: "",
        });
      }

      turns.push({ turnIndex: t, matches });
    }

    return { courts, turns };
  }

  function allScoresComplete(turns) {
    for (const t of turns) for (const m of t.matches) if (!parseScore(m.scoreRaw)) return false;
    return true;
  }

  function computeSummary(turns) {
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
        if (win === "A") aPts += pts;
        else bPts += pts;
      }

      totalA += aPts;
      totalB += bPts;
      perTurn.push({ turn: t.turnIndex, aPts, bPts });
    }

    return { totalA, totalB, perTurn };
  }

  async function ensureSessionLoaded(dateISO) {
    // 1) si ya hay una sesión seleccionada en Store, úsala
    if (Store.state?.session_key) return { session_key: Store.state.session_key, session_seq: Store.state.session_seq };

    // 2) si no, intenta tomar la más reciente de esa fecha
    const latest = await getLatestSessionKeyByDate(dateISO);
    if (!latest?.session_key) {
      throw new Error("No hay equipos guardados en esta fecha. Ve a Equipos y guarda primero.");
    }

    Store.setState({
      session_key: latest.session_key,
      session_seq: latest.session_seq,
      session_date: dateISO,
    });

    return latest;
  }

  async function ensureTeamsLoadedForSession(session_key) {
    // Primero busca en Store
    const A = Store.state?.team_a || [];
    const B = Store.state?.team_b || [];
    if (A.length && B.length) return { A, B };

    // Si no hay en Store, trae del historial por session_key
    const detail = await getHistoryDetailByKey(session_key);
    const session = detail?.session;
    if (!session) throw new Error("No se encontraron equipos en esa sesión.");
    return { A: session.team_a || [], B: session.team_b || [] };
  }

  function render() {
    const mount = $("turnsMount");
    if (!mount) return;

    if (!Store.ready && Store.status !== "loading") {
      mount.innerHTML = `<div class="card" style="margin-top:10px;"><div class="hint muted">Inicia sesión para usar Turnos.</div></div>`;
      return;
    }
    if (Store.status === "loading") {
      mount.innerHTML = `<div class="card" style="margin-top:10px;"><div class="hint muted">Cargando…</div></div>`;
      return;
    }
    if (Store.status === "error") {
      const msg = Store.error?.message || "Ocurrió un error.";
      mount.innerHTML = `<div class="card" style="margin-top:10px;"><div class="hint error">${esc(msg)}</div></div>`;
      return;
    }

    const date = Store.state?.session_date || todayISO();
    const turnsState = Array.isArray(Store.state?.turns) ? Store.state.turns : [];
    const courts = Store.state?.courts || 0;

    const session_key = Store.state?.session_key || null;
    const session_seq = Store.state?.session_seq || null;

    const sessionLabel = session_key
      ? `Sesión actual: ${esc(date)} - ${esc(session_seq || session_key.split("-").pop())}`
      : "Sesión actual: — (elige una fecha y genera desde equipos guardados)";

    mount.innerHTML = `
      <div class="card" style="margin-top:10px;">
        <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:end; justify-content:space-between;">
          <div>
            <label>Fecha</label>
            <input id="turnsDate" type="date" value="${esc(date)}" />
            <div class="hint muted" style="margin-top:6px;">${sessionLabel}</div>
          </div>

          <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:end;">
            <div>
              <label>Turnos</label>
              <select id="turnCount">
                ${[1,2,3,4].map(n => `<option value="${n}" ${n === (Store.state?.turnCount || 3) ? "selected" : ""}>${n}</option>`).join("")}
              </select>
            </div>

            <div class="btns">
              <button class="ghost" id="btnGenTurns" type="button">Generar turnos</button>
              <button class="primary" id="btnSaveTurns" type="button" disabled>Guardar resultados</button>
            </div>
          </div>
        </div>

        <div id="turnsStatus" class="hint muted" style="margin-top:10px;"></div>
      </div>

      <div id="turnsTable"></div>
      <div id="turnsResults"></div>
    `;

    const statusEl = $("turnsStatus");
    const setStatus = (msg, cls = "muted") => {
      statusEl.textContent = msg || "";
      statusEl.className = "hint " + cls;
    };

    $("turnsDate")?.addEventListener("change", (e) => {
      // al cambiar fecha, resetea la sesión seleccionada (porque cambia el contexto)
      Store.setState({
        session_date: e.target.value,
        session_key: null,
        session_seq: null,
        turns: [],
        courts: 0,
        summary: null,
      });
      render();
    });

    $("turnCount")?.addEventListener("change", (e) => {
      Store.setState({ turnCount: Number(e.target.value || 3) });
    });

    const table = $("turnsTable");
    const results = $("turnsResults");
    const btnSave = $("btnSaveTurns");

    function updateResultsUI() {
      if (!turnsState.length) {
        results.innerHTML = "";
        btnSave.disabled = true;
        return;
      }
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
      btnSave.disabled = !allScoresComplete(turnsState);
    }

    function drawTurnsUI() {
      if (!turnsState.length) {
        table.innerHTML = `<div class="card" style="margin-top:12px;"><div class="hint muted">Aún no hay turnos generados.</div></div>`;
        results.innerHTML = "";
        btnSave.disabled = true;
        return;
      }

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
                  const sc = parseScore(m.scoreRaw);
                  const win = winnerFromScore(sc);
                  const winnerTxt = win ? (win === "A" ? "Ganador: Equipo A" : "Ganador: Equipo B") : "—";
                  const key = `${t.turnIndex}:${idx}`;

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
                          data-score="${esc(key)}"
                          value="${esc(scoreDigits(m.scoreRaw))}"
                          style="width:64px;"
                          placeholder="63"
                        />
                        <span class="hint muted" data-scorefmt="${esc(key)}" style="margin-left:8px;">
                          ${esc(formatScore(m.scoreRaw))}
                        </span>
                      </td>
                      <td style="padding:8px; border-top:1px solid rgba(255,255,255,.08);">
                        <span class="hint ${win ? "ok" : "muted"}" data-winner="${esc(key)}">
                          ${esc(winnerTxt)}
                        </span>
                      </td>
                    </tr>
                  `;
                }).join("")}
              </tbody>
            </table>
          </div>
        </div>
      `).join("");

      table.querySelectorAll("[data-score]").forEach(inp => {
        inp.addEventListener("input", () => {
          const digits = scoreDigits(inp.value);
          inp.value = digits;

          const key = inp.getAttribute("data-score");
          const [tStr, mStr] = String(key || "").split(":");
          const tIndex = Number(tStr);
          const mIndex = Number(mStr);

          const turn = turnsState.find(x => Number(x.turnIndex) === tIndex);
          if (!turn || !turn.matches?.[mIndex]) return;

          turn.matches[mIndex].scoreRaw = digits;

          const fmtEl = table.querySelector(`[data-scorefmt="${CSS.escape(key)}"]`);
          if (fmtEl) fmtEl.textContent = formatScore(digits);

          const sc = parseScore(digits);
          const win = winnerFromScore(sc);
          const winEl = table.querySelector(`[data-winner="${CSS.escape(key)}"]`);
          if (winEl) {
            winEl.textContent = win ? (win === "A" ? "Ganador: Equipo A" : "Ganador: Equipo B") : "—";
            winEl.className = "hint " + (win ? "ok" : "muted");
          }

          updateResultsUI();
        });

        inp.addEventListener("keydown", (e) => {
          if (e.key === "Enter") e.preventDefault();
        });
      });

      updateResultsUI();
    }

    drawTurnsUI();

    $("btnGenTurns")?.addEventListener("click", async () => {
      try {
        setStatus("Generando turnos…", "muted");

        const dateISO = $("turnsDate")?.value || Store.state?.session_date || todayISO();
        const numTurns = Number($("turnCount")?.value || Store.state?.turnCount || 3);

        const sessionInfo = await ensureSessionLoaded(dateISO);
        const detail = await getHistoryDetailByKey(sessionInfo.session_key);

        const A = detail?.session?.team_a || Store.state?.team_a || [];
        const B = detail?.session?.team_b || Store.state?.team_b || [];

        if (!A.length || !B.length) throw new Error("No se encontraron equipos en esa sesión.");

        // Mantén Store con equipos para que todo sea consistente
        Store.setState({ team_a: A, team_b: B });

        const gen = generateTurns(A, B, numTurns);

        Store.setState({
          session_date: dateISO,
          session_key: sessionInfo.session_key,
          session_seq: sessionInfo.session_seq,
          turnCount: numTurns,
          courts: gen.courts,
          turns: gen.turns,
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

        const key = Store.state?.session_key;
        const seq = Store.state?.session_seq;

        if (!key && !seq) throw new Error("No hay sesión seleccionada. Guarda equipos o genera turnos desde una sesión.");

        setStatus("Guardando resultados en historial…", "muted");

        const summary = computeSummary(t);

        const turnsPayload = t.map(turn => ({
          turnIndex: turn.turnIndex,
          matches: turn.matches.map(m => ({
            court: m.court,
            top: { team: "A", pair: m.top.pair },
            bottom: { team: "B", pair: m.bottom.pair },
            score: scoreDigits(m.scoreRaw),
          })),
        }));

        const scoresPayload = { generatedAt: new Date().toISOString() };
        const summaryPayload = { totalA: summary.totalA, totalB: summary.totalB, perTurn: summary.perTurn };

        await saveResultsToHistory(dateISO, turnsPayload, scoresPayload, summaryPayload, {
          session_key: key || null,
          session_seq: seq || null,
        });

        setStatus(`✅ Resultados guardados en ${key || `${dateISO}-${seq}`}. Ve a Historial.`, "ok");
      } catch (e) {
        console.error(e);
        setStatus(`❌ Error al guardar resultados: ${e?.message || e}`, "error");
      }
    });
  }

  window.OP = window.OP || {};
  const prev = window.OP.refresh;
  window.OP.refresh = (view) => {
    if (typeof prev === "function") prev(view);
    if (view === "turns") render();
  };

  window.addEventListener("op:storeReady", render);
  document.addEventListener("DOMContentLoaded", render);
})();

// turns.js — Generar turnos + ingresar marcadores (fluido) + guardar a historial (results)
//
// ✅ Mejora de lógica:
// 1) Evita repetir parejas dentro de cada equipo entre turnos CUANDO ES POSIBLE.
// 2) Minimiza rivales repetidos (enfrentamientos jugador vs jugador).
//
// Nota importante (realidad matemática):
// - Si un equipo tiene k parejas posibles por turno (k = min(#D,#R)) y k=2 (4 jugadores por equipo),
//   solo existen 2 emparejamientos perfectos posibles. Con 3 turnos, alguna pareja debe repetirse.
// - En esos casos, este generador minimiza repeticiones, pero no puede hacer magia.

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

  // ---------- Score helpers ----------
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

  // ---------- Turn summary ----------
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

  // ---------- Load teams ----------
  async function ensureTeamsLoaded(dateISO) {
    const A = Store.state?.team_a || [];
    const B = Store.state?.team_b || [];
    if (A.length && B.length) return { A, B };

    const detail = await getHistoryDetail(dateISO);
    const session = detail?.session;
    if (!session) throw new Error("No hay equipos guardados en esta fecha. Ve a Equipos y guarda primero.");
    return { A: session.team_a || [], B: session.team_b || [] };
  }

  // ============================================================
  // ✅ NUEVO GENERADOR (no repetir parejas si es posible + minimiza rivales)
  // ============================================================

  function shuffleCopy(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function pairKey(p) {
    // p = [player1, player2]
    const ids = [String(p?.[0]?.id || ""), String(p?.[1]?.id || "")].sort();
    return ids.join("-");
  }

  function oppKey(aId, bId) {
    // orderless key so A vs B same as B vs A
    const ids = [String(aId), String(bId)].sort();
    return ids.join("|");
  }

  function splitBySide(players) {
    const D = players.filter(p => p.side === "D");
    const R = players.filter(p => p.side === "R");
    return { D, R };
  }

  // Número máximo de turnos SIN repetir parejas dentro de un equipo (límite realista)
  function maxTurnsWithoutPairRepeats(k) {
    // k = min(#D,#R) del equipo (cuántas parejas simultáneas se pueden formar por turno)
    // - k=1 => 1 solo emparejamiento posible
    // - k=2 => existen 2 emparejamientos perfectos posibles (no puedes hacer 3 turnos sin repetir)
    // - k>=3 => puedes hacer al menos k turnos con rotaciones tipo latin, sin repetir parejas (en general)
    if (k <= 1) return 1;
    if (k === 2) return 2;
    return k;
  }

  // Construye parejas disjuntas D-R, a partir de listas ya seleccionadas (mismo tamaño = courts)
  function makePairs(Dsel, Rsel, shift) {
    const n = Math.min(Dsel.length, Rsel.length);
    const pairs = [];
    for (let i = 0; i < n; i++) {
      pairs.push([Dsel[i], Rsel[(i + shift) % n]]);
    }
    return pairs;
  }

  function buildMatchesFromPairs(Apairs, Bpairs, matchupShift) {
    const courts = Math.min(Apairs.length, Bpairs.length);
    const matches = [];
    for (let i = 0; i < courts; i++) {
      const bp = Bpairs[(i + matchupShift) % courts];
      matches.push({
        court: i + 1,
        top: { team: "A", pair: Apairs[i] },
        bottom: { team: "B", pair: bp },
        scoreRaw: ""
      });
    }
    return matches;
  }

  // Evalúa un calendario completo (turns) con penalidades:
  // - Repetición de parejas (muy alta)
  // - Repetición de enfrentamientos jugador vs jugador (alta)
  // - Repetición de matchup pareja-vs-pareja (media)
  function scoreSchedule(turns) {
    const pairSeenA = new Map();
    const pairSeenB = new Map();
    const oppSeen = new Map();
    const matchupSeen = new Map();

    let penalty = 0;

    for (const t of turns) {
      for (const m of t.matches) {
        const aPair = m.top.pair;
        const bPair = m.bottom.pair;

        const aPk = "A:" + pairKey(aPair);
        const bPk = "B:" + pairKey(bPair);

        // pareja repetida (peso muy alto)
        pairSeenA.set(aPk, (pairSeenA.get(aPk) || 0) + 1);
        pairSeenB.set(bPk, (pairSeenB.get(bPk) || 0) + 1);

        // matchup pareja vs pareja (peso medio)
        const mk = aPk + "||" + bPk;
        matchupSeen.set(mk, (matchupSeen.get(mk) || 0) + 1);

        // rivales: cada jugador enfrenta 2 jugadores del otro lado
        const aIds = [String(aPair[0].id), String(aPair[1].id)];
        const bIds = [String(bPair[0].id), String(bPair[1].id)];
        for (const ai of aIds) for (const bi of bIds) {
          const ok = oppKey(ai, bi);
          oppSeen.set(ok, (oppSeen.get(ok) || 0) + 1);
        }
      }
    }

    // Penaliza repeticiones: count=1 ok, count=2 pequeño, count=3 grande, etc.
    for (const [, c] of pairSeenA) if (c > 1) penalty += (c - 1) * 10000;
    for (const [, c] of pairSeenB) if (c > 1) penalty += (c - 1) * 10000;

    for (const [, c] of matchupSeen) if (c > 1) penalty += (c - 1) * 1200;

    // Oponentes repetidos: queremos minimizar
    for (const [, c] of oppSeen) {
      if (c > 1) {
        // 2 veces: penalidad; 3 veces: penalidad mayor
        penalty += (c - 1) * (c === 2 ? 150 : 600);
      }
    }

    return penalty;
  }

  // Genera turnos con búsqueda aleatoria guiada.
  function generateTurns(teamA, teamB, numTurns) {
    const { D: AD, R: AR } = splitBySide(teamA);
    const { D: BD, R: BR } = splitBySide(teamB);

    const courts = Math.min(AD.length, AR.length, BD.length, BR.length);
    if (courts <= 0) throw new Error("Equipos incompletos para armar parejas (faltan D o R).");

    // Límite real de no repetir parejas (por equipo)
    const maxNoRepeatA = maxTurnsWithoutPairRepeats(courts);
    const maxNoRepeatB = maxTurnsWithoutPairRepeats(courts);
    const hardMaxNoRepeat = Math.min(maxNoRepeatA, maxNoRepeatB);

    // Si el usuario pide 3 turnos pero solo hay 2 parejas por lado (4 jugadores por equipo),
    // no existe solución sin repetir parejas.
    if (numTurns > hardMaxNoRepeat) {
      throw new Error(
        `Con ${courts} parejas por equipo, no se puede generar ${numTurns} turnos sin repetir parejas. ` +
        `Máximo sin repetir: ${hardMaxNoRepeat}. ` +
        `Solución: reduce turnos o aumenta jugadores (mínimo 6 por equipo para 3 turnos).`
      );
    }

    // Búsqueda: intentamos muchas combinaciones de shifts para minimizar rivales repetidos.
    // Como ya garantizamos que exista solución sin repetir parejas, apuntamos a penalty 0 en parejas,
    // y minimizamos rival repeats.
    const MAX_TRIES = 3000;

    let bestTurns = null;
    let bestScore = Infinity;

    for (let attempt = 0; attempt < MAX_TRIES; attempt++) {
      // Partimos de listas aleatorizadas por intento
      const ADs = shuffleCopy(AD);
      const ARs = shuffleCopy(AR);
      const BDs = shuffleCopy(BD);
      const BRs = shuffleCopy(BR);

      const turns = [];
      const usedPairsA = new Set();
      const usedPairsB = new Set();

      let ok = true;

      for (let t = 1; t <= numTurns; t++) {
        // shifts para variar parejas por turno
        const aShift = Math.floor(Math.random() * courts);
        const bShift = Math.floor(Math.random() * courts);

        // Para evitar repetición, probamos algunos shifts candidatos (pequeño loop)
        let Apairs = null;
        let Bpairs = null;

        for (let saTry = 0; saTry < courts; saTry++) {
          const sa = (aShift + saTry) % courts;
          const candA = makePairs(ADs.slice(0, courts), ARs.slice(0, courts), (sa + (t - 1)) % courts);
          const hasRepeatA = candA.some(p => usedPairsA.has(pairKey(p)));
          if (!hasRepeatA) { Apairs = candA; break; }
        }

        for (let sbTry = 0; sbTry < courts; sbTry++) {
          const sb = (bShift + sbTry) % courts;
          const candB = makePairs(BDs.slice(0, courts), BRs.slice(0, courts), (sb + (t - 1)) % courts);
          const hasRepeatB = candB.some(p => usedPairsB.has(pairKey(p)));
          if (!hasRepeatB) { Bpairs = candB; break; }
        }

        if (!Apairs || !Bpairs) { ok = false; break; }

        // matchup shift para bajar rivales repetidos
        const matchupShift = (t - 1) % courts;

        const matches = buildMatchesFromPairs(Apairs, Bpairs, matchupShift);
        turns.push({ turnIndex: t, matches });

        // marcar parejas usadas
        for (const p of Apairs) usedPairsA.add(pairKey(p));
        for (const p of Bpairs) usedPairsB.add(pairKey(p));
      }

      if (!ok) continue;

      const s = scoreSchedule(turns);
      if (s < bestScore) {
        bestScore = s;
        bestTurns = turns;
        if (bestScore === 0) break; // perfecto
      }
    }

    if (!bestTurns) {
      throw new Error("No se pudo generar turnos válidos sin repetir parejas. Revisa balance D/R o reduce turnos.");
    }

    return { courts, turns: bestTurns };
  }

  // ---------- UI render ----------
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
    const setStatus = (msg, cls="muted") => {
      statusEl.textContent = msg || "";
      statusEl.className = "hint " + cls;
    };

    $("turnsDate")?.addEventListener("change", (e) => {
      Store.setState({ session_date: e.target.value });
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
                          value="${esc(scoreDigits(m.scoreRaw))}"
                          style="width:64px;"
                          placeholder="63"
                        />
                        <span class="hint muted" data-scorefmt="${esc(t.turnIndex)}:${esc(idx)}" style="margin-left:8px;">
                          ${esc(formatScore(m.scoreRaw))}
                        </span>
                      </td>
                      <td style="padding:8px; border-top:1px solid rgba(255,255,255,.08);">
                        <span class="hint ${win ? "ok" : "muted"}" data-winner="${esc(t.turnIndex)}:${esc(idx)}">
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
          const [tStr, mStr] = key.split(":");
          const tIndex = Number(tStr);
          const mIndex = Number(mStr);

          const turn = turnsState.find(x => Number(x.turnIndex) === tIndex);
          if (!turn) return;

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

        const summary = computeSummary(t);

        const turnsPayload = t.map(turn => ({
          turnIndex: turn.turnIndex,
          matches: turn.matches.map(m => ({
            court: m.court,
            top: { team: "A", pair: m.top.pair },
            bottom: { team: "B", pair: m.bottom.pair },
            score: scoreDigits(m.scoreRaw)
          }))
        }));

        const scoresPayload = { generatedAt: new Date().toISOString() };

        const summaryPayload = {
          totalA: summary.totalA,
          totalB: summary.totalB,
          perTurn: summary.perTurn
        };

        await saveResultsToHistory(dateISO, turnsPayload, scoresPayload, summaryPayload);

        setStatus("✅ Resultados guardados. Ve a Historial.", "ok");
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

// turns.js — Generar turnos + ingresar marcadores (fluido) + guardar a historial (results)
// ✅ Auto-reintentos: busca calendario PERFECTO (0 parejas repetidas, 0 rivales repetidos) cuando sea posible.
// ✅ Si NO existe/NO se encuentra, deja el mejor y lo reporta.
// ✅ Auditoría: lista automáticamente qué se repite (parejas y rivales).

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
  // ✅ Auditoría (parejas y rivales)
  // ============================================================

  function pName(p) {
    return String(p?.name || "").trim() || String(p?.id || "");
  }

  function pairIdKey(pair) {
    const a = String(pair?.[0]?.id || "");
    const b = String(pair?.[1]?.id || "");
    return [a, b].sort().join("-");
  }

  function pairPretty(pair) {
    return `${pName(pair?.[0])} / ${pName(pair?.[1])}`;
  }

  function oppKey(aId, bId) {
    return [String(aId), String(bId)].sort().join("|");
  }

  function auditTurns(turns) {
    const pairOccA = new Map(); // key -> [{turn,court,pretty}]
    const pairOccB = new Map();
    const oppOcc = new Map();   // key -> {count, aName, bName, samples[]}
    const oppNames = new Map(); // id -> name

    const addOcc = (map, key, occ) => {
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(occ);
    };

    for (const t of (turns || [])) {
      for (const m of (t.matches || [])) {
        const aPair = m?.top?.pair || [];
        const bPair = m?.bottom?.pair || [];

        const aKey = pairIdKey(aPair);
        const bKey = pairIdKey(bPair);

        addOcc(pairOccA, aKey, { turn: t.turnIndex, court: m.court, pretty: pairPretty(aPair) });
        addOcc(pairOccB, bKey, { turn: t.turnIndex, court: m.court, pretty: pairPretty(bPair) });

        const aIds = [aPair?.[0]?.id, aPair?.[1]?.id].map(String);
        const bIds = [bPair?.[0]?.id, bPair?.[1]?.id].map(String);

        oppNames.set(aIds[0], pName(aPair?.[0]));
        oppNames.set(aIds[1], pName(aPair?.[1]));
        oppNames.set(bIds[0], pName(bPair?.[0]));
        oppNames.set(bIds[1], pName(bPair?.[1]));

        for (const ai of aIds) for (const bi of bIds) {
          const ok = oppKey(ai, bi);
          if (!oppOcc.has(ok)) {
            oppOcc.set(ok, { count: 0, aId: ai, bId: bi, samples: [] });
          }
          const obj = oppOcc.get(ok);
          obj.count += 1;
          if (obj.samples.length < 6) obj.samples.push({ turn: t.turnIndex, court: m.court });
        }
      }
    }

    const repeatedPairsA = [];
    const repeatedPairsB = [];

    for (const [k, occ] of pairOccA.entries()) {
      if (occ.length > 1) repeatedPairsA.push({ key: k, count: occ.length, occ });
    }
    for (const [k, occ] of pairOccB.entries()) {
      if (occ.length > 1) repeatedPairsB.push({ key: k, count: occ.length, occ });
    }

    const repeatedOpponents = [];
    for (const [k, obj] of oppOcc.entries()) {
      if (obj.count > 1) {
        const aName = oppNames.get(obj.aId) || obj.aId;
        const bName = oppNames.get(obj.bId) || obj.bId;
        repeatedOpponents.push({
          key: k,
          count: obj.count,
          aName,
          bName,
          samples: obj.samples
        });
      }
    }

    repeatedPairsA.sort((x,y)=> y.count - x.count);
    repeatedPairsB.sort((x,y)=> y.count - x.count);
    repeatedOpponents.sort((x,y)=> y.count - x.count);

    const okPairs = repeatedPairsA.length === 0 && repeatedPairsB.length === 0;
    const okOpp = repeatedOpponents.length === 0;

    const pairRepeatCount =
      repeatedPairsA.reduce((a,it)=>a + (it.count - 1), 0) +
      repeatedPairsB.reduce((a,it)=>a + (it.count - 1), 0);

    const oppRepeatCount = repeatedOpponents.reduce((a,it)=>a + (it.count - 1), 0);
    const oppMax = repeatedOpponents.length ? Math.max(...repeatedOpponents.map(x=>x.count)) : 1;

    return {
      okPairs,
      okOpp,
      repeatedPairsA,
      repeatedPairsB,
      repeatedOpponents,
      pairRepeatCount,
      oppRepeatCount,
      oppMax
    };
  }

  function renderAuditPanel(turns) {
    if (!turns || !turns.length) return "";

    const audit = auditTurns(turns);

    const badge = (ok) =>
      ok
        ? `<span class="hint ok"><b>OK</b></span>`
        : `<span class="hint error"><b>WARN</b></span>`;

    const listPairs = (items) => {
      if (!items.length) return `<div class="hint muted">Sin repeticiones.</div>`;
      return items.slice(0, 30).map(it => {
        const label = it.occ?.[0]?.pretty || it.key;
        const where = it.occ.map(o => `T${o.turn}-C${o.court}`).join(", ");
        return `<div class="hint muted">• <b>${esc(label)}</b> — ${esc(it.count)} veces (${esc(where)})</div>`;
      }).join("");
    };

    const listOpp = (items) => {
      if (!items.length) return `<div class="hint muted">Sin rivales repetidos.</div>`;
      return items.slice(0, 40).map(it => {
        const where = (it.samples || []).map(s => `T${s.turn}-C${s.court}`).join(", ");
        return `<div class="hint muted">• <b>${esc(it.aName)}</b> vs <b>${esc(it.bName)}</b> — ${esc(it.count)} veces (${esc(where)})</div>`;
      }).join("");
    };

    return `
      <div class="card" style="margin-top:12px;">
        <h3 style="margin:0 0 10px;">Auditoría automática</h3>

        <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:center;">
          <div class="hint muted">Parejas repetidas:</div>
          ${badge(audit.okPairs)}
          <div class="hint muted" style="margin-left:8px;">Rivales repetidos:</div>
          ${badge(audit.okOpp)}
        </div>

        <div class="hint muted" style="margin-top:8px;">
          Métricas: <b>${esc(audit.pairRepeatCount)}</b> repeticiones de parejas •
          <b>${esc(audit.oppRepeatCount)}</b> repeticiones de rivales •
          Máximo enfrentamiento repetido: <b>${esc(audit.oppMax)}x</b>
        </div>

        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:12px; margin-top:10px;">
          <div class="card" style="background: rgba(0,0,0,.12);">
            <h4 style="margin:0 0 8px;">Parejas repetidas — Equipo A</h4>
            ${listPairs(audit.repeatedPairsA)}
          </div>
          <div class="card" style="background: rgba(0,0,0,.12);">
            <h4 style="margin:0 0 8px;">Parejas repetidas — Equipo B</h4>
            ${listPairs(audit.repeatedPairsB)}
          </div>
        </div>

        <div class="card" style="background: rgba(0,0,0,.12); margin-top:12px;">
          <h4 style="margin:0 0 8px;">Rivales repetidos (Jugador vs Jugador)</h4>
          <div class="hint muted">Si ves “3 veces”, esos dos jugadores se enfrentaron 3 veces en todos los turnos.</div>
          <div style="margin-top:8px;">
            ${listOpp(audit.repeatedOpponents)}
          </div>
        </div>
      </div>
    `;
  }

  // ============================================================
  // ✅ Generación con auto-reintentos (busca PERFECTO)
  // ============================================================

  function shuffleCopy(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function splitBySide(players) {
    return {
      D: (players || []).filter(p => p.side === "D"),
      R: (players || []).filter(p => p.side === "R")
    };
  }

  // genera un candidato random
  function generateCandidate(teamA, teamB, numTurns) {
    const { D: AD0, R: AR0 } = splitBySide(teamA);
    const { D: BD0, R: BR0 } = splitBySide(teamB);

    const courts = Math.min(AD0.length, AR0.length, BD0.length, BR0.length);
    if (courts <= 0) throw new Error("Equipos incompletos para armar parejas (faltan D o R).");

    const AD = shuffleCopy(AD0).slice(0, courts);
    const AR = shuffleCopy(AR0).slice(0, courts);
    const BD = shuffleCopy(BD0).slice(0, courts);
    const BR = shuffleCopy(BR0).slice(0, courts);

    const turns = [];

    for (let t = 1; t <= numTurns; t++) {
      const aShift = Math.floor(Math.random() * courts);
      const bShift = Math.floor(Math.random() * courts);
      const mShift = Math.floor(Math.random() * courts);

      const Apairs = [];
      const Bpairs = [];

      for (let i = 0; i < courts; i++) {
        // rotación distinta por turno
        Apairs.push([AD[i], AR[(i + aShift + t) % courts]]);
        Bpairs.push([BD[i], BR[(i + bShift + t) % courts]]);
      }

      const matches = [];
      for (let i = 0; i < courts; i++) {
        const bp = Bpairs[(i + mShift) % courts];
        matches.push({
          court: i + 1,
          top: { team: "A", pair: Apairs[i] },
          bottom: { team: "B", pair: bp },
          scoreRaw: ""
        });
      }

      turns.push({ turnIndex: t, matches });
    }

    return { courts, turns };
  }

  // score: minimiza repeticiones (parejas súper alto, rivales alto, luego evitar max>2)
  function scoreCandidate(turns) {
    const a = auditTurns(turns);
    const pairsPenalty = a.pairRepeatCount * 100000; // dominante
    const oppPenalty = a.oppRepeatCount * 2000;
    const oppMaxPenalty = Math.max(0, a.oppMax - 2) * 5000;
    return pairsPenalty + oppPenalty + oppMaxPenalty;
  }

  // busca perfecto; si no encuentra, devuelve mejor
  function generateTurnsSmart(teamA, teamB, numTurns, tries = 5000) {
    let best = null;
    let bestScore = Infinity;
    let bestAudit = null;

    for (let i = 0; i < tries; i++) {
      const cand = generateCandidate(teamA, teamB, numTurns);
      const a = auditTurns(cand.turns);

      // ✅ perfecto = 0 parejas repetidas y 0 rivales repetidos
      if (a.okPairs && a.okOpp) {
        return {
          courts: cand.courts,
          turns: cand.turns,
          audit: a,
          perfect: true,
          triesUsed: i + 1
        };
      }

      const s = scoreCandidate(cand.turns);
      if (s < bestScore) {
        bestScore = s;
        best = cand;
        bestAudit = a;
      }
    }

    if (!best) throw new Error("No se pudo generar turnos. Revisa D/R y equipos.");

    return {
      courts: best.courts,
      turns: best.turns,
      audit: bestAudit || auditTurns(best.turns),
      perfect: false,
      triesUsed: tries
    };
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
              <button class="ghost" id="btnAudit" type="button" ${turnsState.length ? "" : "disabled"}>Auditar</button>
              <button class="ghost" id="btnGenTurns" type="button">Generar turnos</button>
              <button class="primary" id="btnSaveTurns" type="button" disabled>Guardar resultados</button>
            </div>
          </div>
        </div>

        <div id="turnsStatus" class="hint muted" style="margin-top:10px;"></div>
      </div>

      <div id="turnsTable"></div>
      <div id="turnsResults"></div>
      <div id="turnsAudit"></div>
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
    const auditMount = $("turnsAudit");
    const btnSave = $("btnSaveTurns");

    function updateResultsUI() {
      if (!turnsState.length) {
        results.innerHTML = "";
        if (auditMount) auditMount.innerHTML = "";
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

      if (auditMount) auditMount.innerHTML = renderAuditPanel(turnsState);
    }

    function drawTurnsUI() {
      if (!turnsState.length) {
        table.innerHTML = `<div class="card" style="margin-top:12px;"><div class="hint muted">Aún no hay turnos generados.</div></div>`;
        results.innerHTML = "";
        if (auditMount) auditMount.innerHTML = "";
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

    $("btnAudit")?.addEventListener("click", () => {
      if (auditMount) auditMount.innerHTML = renderAuditPanel(turnsState);
      setStatus("Auditoría actualizada.", "muted");
    });

    $("btnGenTurns")?.addEventListener("click", async () => {
      try {
        setStatus("Generando turnos (buscando perfecto)…", "muted");

        const dateISO = $("turnsDate")?.value || Store.state?.session_date || todayISO();
        const numTurns = Number($("turnCount")?.value || 3);

        const { A, B } = await ensureTeamsLoaded(dateISO);

        const gen = generateTurnsSmart(A, B, numTurns, 8000);

        Store.setState({
          session_date: dateISO,
          courts: gen.courts,
          turns: gen.turns
        });

        if (gen.perfect) {
          // ✅ EXACTO como lo pediste
          setStatus("Perfecto: 0 parejas repetidas, 0 rivales repetidos", "ok");
        } else {
          const a = gen.audit;
          setStatus(
            `⚠️ No se encontró perfecto en ${gen.triesUsed} intentos. Generé la mejor combinación posible (parejas rep: ${a.pairRepeatCount}, rivales rep: ${a.oppRepeatCount}, max rival: ${a.oppMax}x). Mira auditoría abajo.`,
            "error"
          );
        }

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

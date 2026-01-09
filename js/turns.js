// turns.js — Turnos + marcador 63→6-3 + puntos + guardar a Historial (FIX estado viejo)
import { Store } from "./store.js";
import { saveResultsToHistory } from "./supabaseApi.js";

(function () {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

  const MAX_TURNS = 6;

  function getTeams() {
    const A = (Store.state?.team_a || []).slice();
    const B = (Store.state?.team_b || []).slice();
    return { A, B };
  }

  function validateTeams(A, B) {
    const nA = A.length, nB = B.length;
    if (!nA || !nB) return { ok: false, msg: "Arma Equipos A/B primero." };
    if (nA !== nB) return { ok: false, msg: "Equipos deben tener el mismo número de jugadores." };
    if ((nA + nB) % 4 !== 0) return { ok: false, msg: "Total de jugadores debe ser múltiplo de 4." };

    const aD = A.filter(p => p.side === "D").length;
    const aR = A.filter(p => p.side === "R").length;
    const bD = B.filter(p => p.side === "D").length;
    const bR = B.filter(p => p.side === "R").length;
    if (aD !== aR) return { ok: false, msg: "Equipo A debe tener igual D y R." };
    if (bD !== bR) return { ok: false, msg: "Equipo B debe tener igual D y R." };

    return { ok: true, msg: "" };
  }

  function makePairs(team, shift) {
    const rights = team.filter(p => p.side === "D").slice().sort((a,b)=> (b.rating||0)-(a.rating||0));
    const lefts  = team.filter(p => p.side === "R").slice().sort((a,b)=> (b.rating||0)-(a.rating||0));
    const m = Math.min(rights.length, lefts.length);
    const pairs = [];
    for (let i=0; i<m; i++) {
      pairs.push({ r: rights[i], l: lefts[(i + shift) % m] });
    }
    return pairs;
  }

  function generateTurns(turnCount) {
    const { A, B } = getTeams();
    const m = A.length / 2; // canchas
    const turns = [];

    for (let t=0; t<turnCount; t++) {
      const pairsA = makePairs(A, t);
      const pairsB = makePairs(B, t);

      const matches = [];
      for (let c=0; c<m; c++) {
        const a = pairsA[c];
        const b = pairsB[c];
        matches.push({
          court: c + 1,
          top: { team: "A", pair: [mini(a.r), mini(a.l)] },
          bottom: { team: "B", pair: [mini(b.r), mini(b.l)] },
          score: "" // raw "63"
        });
      }

      turns.push({ turnIndex: t + 1, pointsPerWin: t + 1, matches });
    }

    return turns;

    function mini(p){ return { id:p.id, name:p.name, side:p.side, rating:p.rating }; }
  }

  // ✅ acepta "63" y también tolera que alguien haya guardado "6-3"
  function normalizeScore(raw) {
    if (!raw) return "";
    const d = String(raw).replace(/\D/g, "").slice(0,2);
    return d;
  }

  function isCompleteScore(raw) {
    const d = normalizeScore(raw);
    return /^[0-7]{2}$/.test(d);
  }

  function formatScore(raw) {
    const d = normalizeScore(raw);
    if (!d) return "";
    if (d.length === 1) return d;
    return `${d[0]}-${d[1]}`;
  }

  function winnerFromScore(raw) {
    const d = normalizeScore(raw);
    if (!/^[0-7]{2}$/.test(d)) return null;
    const a = Number(d[0]);
    const b = Number(d[1]);
    if (a === b) return null;
    return a > b ? "A" : "B";
  }

  function computeSummary(turns) {
    const perTurn = [];
    let totalA = 0, totalB = 0;

    for (const t of turns) {
      let aPts = 0, bPts = 0;
      for (const m of t.matches) {
        const w = winnerFromScore(m.score);
        if (!w) continue;
        if (w === "A") aPts += t.pointsPerWin;
        else bPts += t.pointsPerWin;
      }
      totalA += aPts;
      totalB += bPts;
      perTurn.push({ turn: t.turnIndex, aPts, bPts });
    }

    return { perTurn, totalA, totalB };
  }

  function allScoresFilled(turns) {
    for (const t of turns) {
      for (const m of t.matches) {
        if (!isCompleteScore(m.score)) return false;
      }
    }
    return true;
  }

  function shouldSkipRenderBecauseTyping() {
    const el = document.activeElement;
    return el && el.classList && el.classList.contains("score-input");
  }

  function render() {
    const mount = $("turnsMount");
    if (!mount) return;

    if (!Store.ready) {
      mount.innerHTML = `<div class="card" style="margin-top:10px;"><div class="hint muted">Inicia sesión para usar Turnos.</div></div>`;
      return;
    }

    const { A, B } = getTeams();
    const v = validateTeams(A, B);

    const turnCount = Math.min(Number(Store.state?.turnCount || 3), MAX_TURNS);

    const turns = Array.isArray(Store.state?.turns) ? Store.state.turns : null;
    const summary = turns ? computeSummary(turns) : null;

    mount.innerHTML = `
      <div class="card" style="margin-top:10px;">
        <div style="display:flex; gap:10px; justify-content:space-between; flex-wrap:wrap; align-items:end;">
          <div>
            <div class="hint ${v.ok ? "ok" : "warn"}">${v.ok ? "✅ Equipos listos para generar turnos" : "⚠️ " + v.msg}</div>
            <div class="hint muted" style="margin-top:6px;">
              Canchas: <b>${v.ok ? (A.length/2) : 0}</b> • Jugadores: <b>${v.ok ? (A.length+B.length) : 0}</b>
            </div>
          </div>
          <div class="btns">
            <label class="hint muted" style="margin-right:6px;">Turnos</label>
            <select id="turnCountSel">
              ${Array.from({length:MAX_TURNS},(_,i)=>i+1).map(n => `<option value="${n}" ${n===turnCount?"selected":""}>${n}</option>`).join("")}
            </select>
            <button class="primary" id="genTurns" ${v.ok ? "" : "disabled"}>Generar</button>
            <button class="ghost" id="clearTurns" ${turns ? "" : "disabled"}>Limpiar</button>
            <button class="ghost" id="saveTurns" ${turns && allScoresFilled(turns) ? "" : "disabled"}>Guardar resultados</button>
          </div>
        </div>
        <div id="turnsStatus" class="hint" style="margin-top:10px;"></div>
      </div>

      ${turns ? renderTurnsTable(turns) : `
        <div class="card" style="margin-top:12px;">
          <div class="hint muted">Genera turnos para ver los cruces.</div>
        </div>
      `}

      ${turns ? renderResults(summary) : ""}
    `;

    const statusEl = $("turnsStatus");
    const setStatus = (m,k="") => { if(!statusEl) return; statusEl.textContent=m||""; statusEl.className="hint "+k; };

    $("turnCountSel")?.addEventListener("change", (e) => {
      const n = Math.min(Number(e.target.value || 3), MAX_TURNS);
      Store.setState({ turnCount: n });
      if (!shouldSkipRenderBecauseTyping()) render();
    });

    $("genTurns")?.addEventListener("click", () => {
      const n = Math.min(Number($("turnCountSel")?.value || 3), MAX_TURNS);
      const newTurns = generateTurns(n);
      Store.setState({ turns: newTurns, summary: null, turnCount: n });
      setStatus("✅ Turnos generados. Ingresa marcadores.", "ok");
      render();
    });

    $("clearTurns")?.addEventListener("click", () => {
      Store.setState({ turns: null, summary: null });
      setStatus("✅ Turnos limpiados.", "ok");
      render();
    });

    // Inputs
    mount.querySelectorAll(".score-input").forEach((inp) => {
      const tIdx = Number(inp.getAttribute("data-t"));
      const mIdx = Number(inp.getAttribute("data-m"));

      // sincroniza dataset.raw con lo que hay en estado
      inp.dataset.raw = normalizeScore(inp.value);

      inp.addEventListener("keydown", (ev) => {
        const raw = inp.dataset.raw || "";

        if (ev.key === "Backspace") {
          ev.preventDefault();
          const next = raw.slice(0, -1);
          inp.dataset.raw = next;
          inp.value = formatScore(next);
          updateScoreInState(tIdx, mIdx, next);
          updateLiveUI();
          return;
        }

        if (ev.key === "Tab" || ev.key.startsWith("Arrow")) return;

        if (/^[0-7]$/.test(ev.key)) {
          ev.preventDefault();
          if (raw.length >= 2) return;
          const next = raw + ev.key;
          inp.dataset.raw = next;
          inp.value = formatScore(next);
          updateScoreInState(tIdx, mIdx, next);
          updateLiveUI();
          return;
        }

        if (ev.key.length === 1) ev.preventDefault();
      });

      inp.addEventListener("paste", (ev) => {
        ev.preventDefault();
        const text = (ev.clipboardData || window.clipboardData).getData("text");
        const digits = normalizeScore(text).replace(/[8-9]/g,"").slice(0,2);
        inp.dataset.raw = digits;
        inp.value = formatScore(digits);
        updateScoreInState(tIdx, mIdx, digits);
        updateLiveUI();
      });
    });

    // ✅ FIX: al guardar, leer SIEMPRE el estado actual (no el `turns` del render)
    $("saveTurns")?.addEventListener("click", async () => {
      try {
        const latestTurns = Array.isArray(Store.state?.turns) ? Store.state.turns : null;
        if (!latestTurns) return;

        if (!allScoresFilled(latestTurns)) {
          setStatus("⚠️ Completa todos los marcadores antes de guardar.", "warn");
          return;
        }

        const date = Store.state?.session_date || new Date().toISOString().slice(0,10);
        const summaryNow = computeSummary(latestTurns);

        Store.setState({ summary: summaryNow });

        await saveResultsToHistory(date, latestTurns, null, summaryNow);

        setStatus("✅ Resultados guardados en Historial.", "ok");
      } catch (e) {
        console.error(e);
        setStatus("❌ Error al guardar resultados.", "error");
      }
    });

    function updateScoreInState(turnIndex1based, matchIndex0, raw) {
      const cur = Array.isArray(Store.state?.turns) ? Store.state.turns : null;
      if (!cur) return;

      const next = cur.map(t => ({
        ...t,
        matches: t.matches.map(m => ({ ...m }))
      }));

      const t = next.find(x => x.turnIndex === turnIndex1based);
      if (!t) return;
      const m = t.matches[matchIndex0];
      if (!m) return;
      m.score = normalizeScore(raw);

      Store.setState({ turns: next });
    }

    function updateLiveUI() {
      const cur = Array.isArray(Store.state?.turns) ? Store.state.turns : null;
      if (!cur) return;

      cur.forEach((t) => {
        t.matches.forEach((m, mi) => {
          const w = winnerFromScore(m.score);
          const badge = mount.querySelector(`[data-win="${t.turnIndex}-${mi}"]`);
          if (badge) {
            badge.textContent = w ? `Ganador: Equipo ${w}` : "";
            badge.className = "hint " + (w ? "ok" : "muted");
          }
        });
      });

      const saveBtn = $("saveTurns");
      if (saveBtn) saveBtn.disabled = !allScoresFilled(cur);

      const summaryNow = computeSummary(cur);
      const totalEl = $("overallTotals");
      if (totalEl) totalEl.textContent = `Equipo A ${summaryNow.totalA} puntos • Equipo B ${summaryNow.totalB} puntos`;

      summaryNow.perTurn.forEach((pt) => {
        const row = mount.querySelector(`[data-pt="${pt.turn}"]`);
        if (row) row.textContent = `Turno ${pt.turn}: A ${pt.aPts} • B ${pt.bPts}`;
      });
    }
  }

  function renderTurnsTable(turns) {
    return `
      <div class="card" style="margin-top:12px;">
        ${turns.map(t => `
          <div class="card" style="background: rgba(0,0,0,.12); margin-bottom:10px;">
            <h3 style="margin:0;">Turno ${t.turnIndex} <span class="hint muted">(cada victoria vale ${t.pointsPerWin} punto${t.pointsPerWin>1?"s":""})</span></h3>

            <div style="overflow:auto; margin-top:10px;">
              <table style="width:100%; border-collapse:collapse;">
                <thead>
                  <tr class="hint muted">
                    <th style="text-align:left; padding:8px;">Cancha</th>
                    <th style="text-align:left; padding:8px;">Equipo A</th>
                    <th style="text-align:left; padding:8px;">Equipo B</th>
                    <th style="text-align:left; padding:8px;">Marcador</th>
                    <th style="text-align:left; padding:8px;">Resultado</th>
                  </tr>
                </thead>
                <tbody>
                  ${t.matches.map((m, mi) => `
                    <tr>
                      <td style="padding:8px; border-top:1px solid rgba(255,255,255,.08);">#${m.court}</td>
                      <td style="padding:8px; border-top:1px solid rgba(255,255,255,.08);">
                        ${esc(m.top.pair[0].name)} / ${esc(m.top.pair[1].name)}
                      </td>
                      <td style="padding:8px; border-top:1px solid rgba(255,255,255,.08);">
                        ${esc(m.bottom.pair[0].name)} / ${esc(m.bottom.pair[1].name)}
                      </td>
                      <td style="padding:8px; border-top:1px solid rgba(255,255,255,.08);">
                        <input class="score-input"
                          inputmode="numeric"
                          placeholder="63"
                          data-t="${t.turnIndex}"
                          data-m="${mi}"
                          value="${esc(formatScore(m.score))}"
                          style="width:90px; padding:8px; border-radius:10px; border:1px solid rgba(255,255,255,.18); background:rgba(0,0,0,.25); color:#eef2ff;">
                      </td>
                      <td style="padding:8px; border-top:1px solid rgba(255,255,255,.08);">
                        <span class="hint muted" data-win="${t.turnIndex}-${mi}"></span>
                      </td>
                    </tr>
                  `).join("")}
                </tbody>
              </table>
            </div>
          </div>
        `).join("")}
      </div>
    `;
  }

  function renderResults(summary) {
    if (!summary) summary = { perTurn: [], totalA: 0, totalB: 0 };
    return `
      <div class="card" style="margin-top:12px;">
        <h3 style="margin:0 0 10px;">Resultados</h3>
        <div id="overallTotals" class="hint ok"><b>Equipo A ${summary.totalA} puntos</b> • <b>Equipo B ${summary.totalB} puntos</b></div>
        <div style="margin-top:10px; display:grid; gap:6px;">
          ${summary.perTurn.map(pt => `
            <div class="hint muted" data-pt="${pt.turn}">Turno ${pt.turn}: A ${pt.aPts} • B ${pt.bPts}</div>
          `).join("")}
        </div>
      </div>
    `;
  }

  window.OP = window.OP || {};
  const prev = window.OP.refresh;
  window.OP.refresh = (view) => {
    if (typeof prev === "function") prev(view);
    if (view === "turns") render();
  };

  window.addEventListener("op:storeReady", render);
  window.addEventListener("op:playersChanged", () => { if (!document.hidden && !document.activeElement?.classList?.contains("score-input")) render(); });
  window.addEventListener("op:stateChanged", () => { if (!document.hidden && !document.activeElement?.classList?.contains("score-input")) render(); });
  document.addEventListener("DOMContentLoaded", render);
})();

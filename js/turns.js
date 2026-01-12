// turns.js — Generar turnos + ingresar marcadores + PDFs (fixture y resultados) + guardar historial multi-sesión

import { Store } from "./store.js";
import { getHistoryDetailByKey, saveResultsToHistory } from "./supabaseApi.js";

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
    return { a, b };
  }
  function winnerFromScore(sc) {
    if (!sc) return null;
    return sc.a > sc.b ? "A" : "B";
  }

  function buildPairs(teamPlayers) {
    const D = teamPlayers.filter(p => p.side === "D").sort((a,b)=>Number(b.rating)-Number(a.rating));
    const R = teamPlayers.filter(p => p.side === "R").sort((a,b)=>Number(b.rating)-Number(a.rating));
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
        const AD = shuffle(teamA.filter(p => p.side === "D"));
        const AR = shuffle(teamA.filter(p => p.side === "R"));
        const BD = shuffle(teamB.filter(p => p.side === "D"));
        const BR = shuffle(teamB.filter(p => p.side === "R"));

        const Ause = [];
        const Buse = [];

        for (let i = 0; i < Math.min(AD.length, AR.length) && Ause.length < courts; i++) Ause.push([AD[i], AR[i]]);
        for (let i = 0; i < Math.min(BD.length, BR.length) && Buse.length < courts; i++) Buse.push([BD[i], BR[i]]);

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
          scoreRaw: ""
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

  async function ensureSessionLoaded() {
    // ✅ si ya viene de Equipos guardado, usamos session_key
    const key = Store.state?.session_key;
    if (!key) throw new Error("Primero guarda Equipos para crear una sesión (Ej: 2026-01-12-1).");
    const detail = await getHistoryDetailByKey(key);
    if (!detail?.session) throw new Error("No encontré la sesión. Ve a Equipos y guarda de nuevo.");
    return detail;
  }

  // ---------------- PDF (jsPDF UMD global) ----------------
  function getJsPDF() {
    const jspdf = window.jspdf;
    if (!jspdf || !jspdf.jsPDF) throw new Error("jsPDF no está cargado. Agrega el script de jsPDF en index.html.");
    return jspdf.jsPDF;
  }

  function pdfNiceDate(dateISO) {
    const d = new Date(String(dateISO).slice(0,10) + "T00:00:00");
    if (Number.isNaN(d.getTime())) return String(dateISO).slice(0,10);
    return d.toLocaleDateString("es-EC", { year: "numeric", month: "short", day: "2-digit" });
  }

  function makePdf({ mode, session, turns, summary }) {
    const jsPDF = getJsPDF();
    const doc = new jsPDF({ unit: "mm", format: "a4" });

    const pageW = 210, pageH = 297;
    const margin = 12;

    const line = (x1,y1,x2,y2) => doc.line(x1,y1,x2,y2);

    function box(x, y, w, h, title) {
      doc.setDrawColor(40);
      doc.setLineWidth(0.2);
      doc.rect(x, y, w, h);
      if (title) {
        doc.setFontSize(10);
        doc.setFont("helvetica", "bold");
        doc.text(title, x + 3, y + 6);
        doc.setFont("helvetica", "normal");
      }
    }

    function text(x, y, s, size=10, bold=false) {
      doc.setFontSize(size);
      doc.setFont("helvetica", bold ? "bold" : "normal");
      doc.text(String(s || ""), x, y);
      doc.setFont("helvetica", "normal");
    }

    const dateISO = session?.session_date || Store.state?.session_date || todayISO();
    const key = session?.session_key || Store.state?.session_key || dateISO;
    const seq = session?.session_seq || Store.state?.session_seq || 1;

    // Header
    text(margin, 14, "Open Padel — Resumen", 14, true);
    text(margin, 20, `Fecha: ${pdfNiceDate(dateISO)}   |   Sesión: ${String(dateISO)} - ${seq}`, 10, false);
    text(margin, 25, `Key: ${key}`, 9, false);

    // Teams box
    const teamY = 30;
    box(margin, teamY, pageW - margin*2, 46, "Equipos");
    const A = session?.team_a || [];
    const B = session?.team_b || [];

    text(margin + 3, teamY + 14, `Equipo A (${A.length})`, 10, true);
    text(margin + 100, teamY + 14, `Equipo B (${B.length})`, 10, true);

    const row = (p) => `${p?.name || ""} (${p?.side || ""} ${Number(p?.rating||0).toFixed(1)})`;
    for (let i = 0; i < 6; i++) {
      if (A[i]) text(margin + 3, teamY + 20 + i*5, row(A[i]), 9);
      if (B[i]) text(margin + 100, teamY + 20 + i*5, row(B[i]), 9);
    }
    if (A.length > 6) text(margin + 3, teamY + 20 + 6*5, `+${A.length-6} más…`, 9);
    if (B.length > 6) text(margin + 100, teamY + 20 + 6*5, `+${B.length-6} más…`, 9);

    // Turns
    let y = teamY + 52;

    const turnsTitle = mode === "fixture" ? "Turnos (Fixture)" : "Turnos (Resultados)";
    box(margin, y, pageW - margin*2, 10, turnsTitle);
    y += 14;

    const maxW = pageW - margin*2;

    for (const t of (turns || [])) {
      // salto de página si no entra
      if (y > pageH - 35) {
        doc.addPage();
        y = 16;
      }

      box(margin, y, maxW, 8, `Turno ${t.turnIndex}`);
      y += 12;

      // table header
      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      text(margin + 3, y, "Cancha", 9, true);
      text(margin + 22, y, "Equipo A (arriba)", 9, true);
      text(margin + 110, y, "Equipo B (abajo)", 9, true);
      text(margin + 182, y, "Score", 9, true);
      doc.setFont("helvetica", "normal");
      y += 5;
      line(margin, y, margin + maxW, y);
      y += 5;

      for (const m of (t.matches || [])) {
        const top = m?.top?.pair || [];
        const bot = m?.bottom?.pair || [];
        const topTxt = `${top?.[0]?.name || ""} / ${top?.[1]?.name || ""}`;
        const botTxt = `${bot?.[0]?.name || ""} / ${bot?.[1]?.name || ""}`;

        const sc = mode === "results" ? formatScore(m.scoreRaw || m.score) : "";
        const scShow = sc || "—";

        text(margin + 3, y, `#${m.court}`, 9);
        text(margin + 22, y, topTxt, 9);
        text(margin + 110, y, botTxt, 9);
        text(margin + 182, y, scShow, 9, mode === "results");

        y += 6;

        if (y > pageH - 25) {
          doc.addPage();
          y = 16;
        }
      }

      y += 4;
    }

    // Summary box
    if (mode === "results") {
      if (y > pageH - 40) {
        doc.addPage();
        y = 16;
      }

      const sum = summary || { totalA: 0, totalB: 0, perTurn: [] };
      box(margin, y, maxW, 34, "Resumen Global");
      text(margin + 3, y + 14, `Equipo A: ${sum.totalA} puntos`, 11, true);
      text(margin + 3, y + 20, `Equipo B: ${sum.totalB} puntos`, 11, true);

      const per = Array.isArray(sum.perTurn) ? sum.perTurn : [];
      const lines = per.slice(0, 4).map(pt => `Turno ${pt.turn}: A ${pt.aPts} • B ${pt.bPts}`);
      for (let i=0;i<lines.length;i++) text(margin + 100, y + 14 + i*6, lines[i], 9);
    }

    const filename =
      mode === "fixture"
        ? `OpenPadel_${String(dateISO)}-${seq}_fixture.pdf`
        : `OpenPadel_${String(dateISO)}-${seq}_resultados.pdf`;

    doc.save(filename);
  }

  // ---------------- UI ----------------
  function render() {
    const mount = $("turnsMount");
    if (!mount) return;

    if (!Store.ready) {
      mount.innerHTML = `<div class="card" style="margin-top:10px;"><div class="hint muted">Inicia sesión para usar Turnos.</div></div>`;
      return;
    }

    const key = Store.state?.session_key || null;
    const date = Store.state?.session_date || todayISO();
    const seq = Store.state?.session_seq || 1;

    const turnsState = Array.isArray(Store.state?.turns) ? Store.state.turns : [];
    const courts = Store.state?.courts || 0;

    mount.innerHTML = `
      <div class="card" style="margin-top:10px;">
        <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:end; justify-content:space-between;">
          <div>
            <label>Sesión</label>
            <div class="hint muted" style="margin-top:6px;">
              ${key ? `Activa: <b>${esc(String(date))} - ${esc(String(seq))}</b> (${esc(String(key))})` : "No hay sesión activa. Ve a Equipos y guarda una sesión."}
            </div>
          </div>

          <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:end;">
            <div>
              <label>Turnos</label>
              <select id="turnCount">
                ${[1,2,3,4].map(n => `<option value="${n}" ${n===3?"selected":""}>${n}</option>`).join("")}
              </select>
            </div>

            <div class="btns">
              <button class="ghost" id="btnGenTurns" ${key ? "" : "disabled"}>Generar turnos</button>
              <button class="ghost" id="btnPdfFixture" ${turnsState.length ? "" : "disabled"}>PDF (fixture)</button>
              <button class="ghost" id="btnPdfResults" ${allScoresComplete(turnsState) ? "" : "disabled"}>PDF (resultados)</button>
              <button class="primary" id="btnSaveTurns" ${allScoresComplete(turnsState) ? "" : "disabled"}>Guardar resultados</button>
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

    const table = $("turnsTable");
    const results = $("turnsResults");
    const btnSave = $("btnSaveTurns");
    const btnPdfFixture = $("btnPdfFixture");
    const btnPdfResults = $("btnPdfResults");

    function updateResultsUI() {
      if (!turnsState.length) {
        results.innerHTML = "";
        btnSave.disabled = true;
        if (btnPdfFixture) btnPdfFixture.disabled = true;
        if (btnPdfResults) btnPdfResults.disabled = true;
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

      const complete = allScoresComplete(turnsState);
      btnSave.disabled = !complete;
      if (btnPdfFixture) btnPdfFixture.disabled = false;
      if (btnPdfResults) btnPdfResults.disabled = !complete;
    }

    function drawTurnsUI() {
      if (!turnsState.length) {
        table.innerHTML = `<div class="card" style="margin-top:12px;"><div class="hint muted">Aún no hay turnos generados.</div></div>`;
        results.innerHTML = "";
        btnSave.disabled = true;
        if (btnPdfFixture) btnPdfFixture.disabled = true;
        if (btnPdfResults) btnPdfResults.disabled = true;
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

        const numTurns = Number($("turnCount")?.value || 3);

        // trae sesión por key (no mezcla)
        const detail = await ensureSessionLoaded();
        const session = detail.session;

        const A = session.team_a || [];
        const B = session.team_b || [];
        const gen = generateTurns(A, B, numTurns);

        Store.setState({
          session_date: session.session_date || date,
          session_seq: session.session_seq || seq,
          session_key: session.session_key || key,
          courts: gen.courts,
          turns: gen.turns,
          summary: null,
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
        const t = Array.isArray(Store.state?.turns) ? Store.state.turns : [];
        if (!t.length) throw new Error("No hay turnos para guardar.");
        if (!allScoresComplete(t)) throw new Error("Completa todos los marcadores (2 dígitos 0–7, sin empates).");

        const session_key = Store.state?.session_key;
        const session_date = Store.state?.session_date || todayISO();
        const session_seq = Store.state?.session_seq || 1;

        if (!session_key) throw new Error("No hay sesión activa. Ve a Equipos y guarda una sesión.");

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

        await saveResultsToHistory(session_key, session_date, session_seq, turnsPayload, scoresPayload, summaryPayload);

        Store.setState({ summary: summaryPayload });

        setStatus("✅ Resultados guardados. (Sesión estable, sin mezclar)", "ok");
        updateResultsUI();
      } catch (e) {
        console.error(e);
        setStatus(`❌ Error al guardar resultados: ${e?.message || e}`, "error");
      }
    });

    $("btnPdfFixture")?.addEventListener("click", async () => {
      try {
        const key = Store.state?.session_key;
        if (!key) throw new Error("No hay sesión activa. Ve a Equipos y guarda una sesión.");

        const detail = await getHistoryDetailByKey(key);
        const session = detail.session;
        const turns = Array.isArray(Store.state?.turns) ? Store.state.turns : [];
        if (!turns.length) throw new Error("Primero genera turnos.");

        makePdf({ mode: "fixture", session, turns, summary: null });
      } catch (e) {
        console.error(e);
        setStatus(`❌ PDF: ${e?.message || e}`, "error");
      }
    });

    $("btnPdfResults")?.addEventListener("click", async () => {
      try {
        const key = Store.state?.session_key;
        if (!key) throw new Error("No hay sesión activa. Ve a Equipos y guarda una sesión.");

        const detail = await getHistoryDetailByKey(key);
        const session = detail.session;
        const turns = Array.isArray(Store.state?.turns) ? Store.state.turns : [];
        if (!turns.length) throw new Error("Primero genera turnos.");
        if (!allScoresComplete(turns)) throw new Error("Completa todos los marcadores para PDF de resultados.");

        const summary = computeSummary(turns);
        makePdf({ mode: "results", session, turns, summary });

      } catch (e) {
        console.error(e);
        setStatus(`❌ PDF: ${e?.message || e}`, "error");
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

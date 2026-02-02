// turns.js — Generar turnos + ingresar marcadores + guardar + PDFs
// ✅ Botón "Limpiar turnos" para borrar lo de la sesión anterior

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

  async function ensureTeamsLoaded(dateISO) {
    const A = Store.state?.team_a || [];
    const B = Store.state?.team_b || [];
    if (A.length && B.length) return { A, B };

    const detail = await getHistoryDetail(dateISO);
    const session = detail?.session;
    if (!session) throw new Error("No hay equipos guardados en esta fecha. Ve a Equipos y guarda primero.");
    return { A: session.team_a || [], B: session.team_b || [] };
  }

  // ---------------- PDF helpers (jsPDF) ----------------
  function getJsPDF() {
    const jspdf = window.jspdf;
    if (!jspdf || !jspdf.jsPDF) throw new Error("jsPDF no está cargado (falta el script en index.html).");
    return jspdf.jsPDF;
  }

  function pdfNiceDate(dateISO) {
    const d = new Date(String(dateISO).slice(0,10) + "T00:00:00");
    if (Number.isNaN(d.getTime())) return String(dateISO).slice(0,10);
    return d.toLocaleDateString("es-EC", { year: "numeric", month: "short", day: "2-digit" });
  }

  function drawTeamsAll(doc, session, pageW, pageH, margin, startY) {
    const A = session?.team_a || [];
    const B = session?.team_b || [];

    const maxW = pageW - margin*2;
    const boxH = 14 + (Math.max(A.length, B.length) * 5.2) + 10;
    const minH = 46;
    let h = Math.max(minH, Math.min(boxH, 150));
    let y = startY;

    if (y + h > pageH - 18) {
      doc.addPage();
      y = 14;
    }

    doc.setDrawColor(40);
    doc.setLineWidth(0.2);
    doc.rect(margin, y, maxW, h);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("Equipos", margin + 3, y + 6);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);

    doc.setFont("helvetica", "bold");
    doc.text(`Equipo A (${A.length})`, margin + 3, y + 14);
    doc.text(`Equipo B (${B.length})`, margin + (maxW/2) + 3, y + 14);
    doc.setFont("helvetica", "normal");

    const row = (p) => `${p?.name || ""} (${p?.side || ""} ${Number(p?.rating||0).toFixed(1)})`;

    const maxRowsPerPage = Math.floor((h - 20) / 5.2);
    const rowsToShow = Math.max(A.length, B.length);

    let offset = 0;
    let firstBlock = true;

    while (offset < rowsToShow) {
      if (!firstBlock) {
        doc.addPage();
        y = 14;
        doc.setDrawColor(40);
        doc.setLineWidth(0.2);
        doc.rect(margin, y, maxW, h);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(10);
        doc.text("Equipos (continuación)", margin + 3, y + 6);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        doc.setFont("helvetica", "bold");
        doc.text(`Equipo A (${A.length})`, margin + 3, y + 14);
        doc.text(`Equipo B (${B.length})`, margin + (maxW/2) + 3, y + 14);
        doc.setFont("helvetica", "normal");
      }

      for (let i = 0; i < maxRowsPerPage; i++) {
        const idx = offset + i;
        const yy = y + 20 + i*5.2;
        if (A[idx]) doc.text(row(A[idx]), margin + 3, yy);
        if (B[idx]) doc.text(row(B[idx]), margin + (maxW/2) + 3, yy);
      }

      offset += maxRowsPerPage;
      firstBlock = false;
    }

    return startY + h + 6;
  }

  function makePdf({ mode, session, turns, summary, dateISO }) {
    const jsPDF = getJsPDF();
    const doc = new jsPDF({ unit: "mm", format: "a4" });

    const pageW = 210, pageH = 297;
    const margin = 12;

    const date = String(dateISO || session?.session_date || "").slice(0,10) || todayISO();

    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text("Open Padel — Resumen", margin, 14);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(`Fecha: ${pdfNiceDate(date)}`, margin, 20);
    doc.text(mode === "results" ? "Tipo: Resultados" : "Tipo: Fixture", margin, 25);

    let y = 30;
    y = drawTeamsAll(doc, session, pageW, pageH, margin, y);

    const maxW = pageW - margin*2;

    doc.setDrawColor(40);
    doc.setLineWidth(0.2);
    doc.rect(margin, y, maxW, 10);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text(mode === "results" ? "Turnos (Resultados)" : "Turnos (Fixture)", margin + 3, y + 6);
    doc.setFont("helvetica", "normal");
    y += 14;

    for (const t of (turns || [])) {
      if (y > pageH - 40) { doc.addPage(); y = 14; }

      doc.setDrawColor(40);
      doc.setLineWidth(0.2);
      doc.rect(margin, y, maxW, 8);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.text(`Turno ${t.turnIndex}`, margin + 3, y + 6);
      doc.setFont("helvetica", "normal");

      y += 12;

      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      doc.text("Cancha", margin + 3, y);
      doc.text("Equipo A (arriba)", margin + 22, y);
      doc.text("Equipo B (abajo)", margin + 110, y);
      doc.text("Score", margin + 182, y);
      doc.setFont("helvetica", "normal");

      y += 5;
      doc.line(margin, y, margin + maxW, y);
      y += 5;

      for (const m of (t.matches || [])) {
        if (y > pageH - 20) { doc.addPage(); y = 14; }

        const top = m?.top?.pair || [];
        const bot = m?.bottom?.pair || [];

        const topTxt = `${top?.[0]?.name || ""} / ${top?.[1]?.name || ""}`;
        const botTxt = `${bot?.[0]?.name || ""} / ${bot?.[1]?.name || ""}`;

        const sc = mode === "results" ? formatScore(m.scoreRaw || m.score) : "";
        const scShow = sc || "—";

        doc.text(`#${String(m.court)}`, margin + 3, y);
        doc.text(topTxt, margin + 22, y);
        doc.text(botTxt, margin + 110, y);
        doc.text(scShow, margin + 182, y);

        y += 6;
      }

      y += 4;
    }

    if (mode === "results") {
      if (y > pageH - 45) { doc.addPage(); y = 14; }

      const sum = summary || { totalA: 0, totalB: 0, perTurn: [] };

      doc.setDrawColor(40);
      doc.setLineWidth(0.2);
      doc.rect(margin, y, maxW, 34);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.text("Resumen Global", margin + 3, y + 6);

      doc.setFontSize(11);
      doc.text(`Equipo A: ${sum.totalA} puntos`, margin + 3, y + 14);
      doc.text(`Equipo B: ${sum.totalB} puntos`, margin + 3, y + 20);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);

      const per = Array.isArray(sum.perTurn) ? sum.perTurn : [];
      const lines = per.slice(0, 5).map(pt => `Turno ${pt.turn}: A ${pt.aPts} • B ${pt.bPts}`);
      for (let i = 0; i < lines.length; i++) doc.text(lines[i], margin + 90, y + 14 + i*6);
    }

    const filename =
      mode === "results"
        ? `OpenPadel_${date}_resultados.pdf`
        : `OpenPadel_${date}_fixture.pdf`;

    doc.save(filename);
  }

  function clearTurnsState() {
    Store.setState({
      courts: 0,
      turns: [],
      summary: null
    });
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
              <button class="ghost" id="btnClearTurns" type="button" ${turnsState.length ? "" : "disabled"}>Limpiar turnos</button>
              <button class="ghost" id="btnGenTurns" type="button">Generar turnos</button>
              <button class="ghost" id="btnPdfFixture" type="button" ${turnsState.length ? "" : "disabled"}>PDF (fixture)</button>
              <button class="ghost" id="btnPdfResults" type="button" ${allScoresComplete(turnsState) ? "" : "disabled"}>PDF (resultados)</button>
              <button class="primary" id="btnSaveTurns" type="button" ${allScoresComplete(turnsState) ? "" : "disabled"}>Guardar resultados</button>
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
    const btnPdfFixture = $("btnPdfFixture");
    const btnPdfResults = $("btnPdfResults");

    function updateResultsUI() {
      if (!turnsState.length) {
        results.innerHTML = "";
        btnSave.disabled = true;
        btnPdfFixture.disabled = true;
        btnPdfResults.disabled = true;
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
      btnPdfFixture.disabled = false;
      btnPdfResults.disabled = !complete;
    }

    function drawTurnsUI() {
      if (!turnsState.length) {
        table.innerHTML = `<div class="card" style="margin-top:12px;"><div class="hint muted">Aún no hay turnos generados.</div></div>`;
        results.innerHTML = "";
        btnSave.disabled = true;
        btnPdfFixture.disabled = true;
        btnPdfResults.disabled = true;
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

    $("btnClearTurns")?.addEventListener("click", () => {
      clearTurnsState();
      setStatus("Listo. Turnos limpiados.", "muted");
      render();
    });

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

        setStatus("✅ Turnos generados. Completa marcadores para PDF/guardar.", "ok");
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

    $("btnPdfFixture")?.addEventListener("click", async () => {
      try {
        const dateISO = $("turnsDate")?.value || Store.state?.session_date || todayISO();
        const detail = await getHistoryDetail(dateISO);
        if (!detail?.session) throw new Error("No hay equipos guardados para esta fecha (guarda equipos primero).");
        const t = Array.isArray(Store.state?.turns) ? Store.state.turns : [];
        if (!t.length) throw new Error("Primero genera turnos.");

        makePdf({ mode: "fixture", session: detail.session, turns: t, summary: null, dateISO });
      } catch (e) {
        console.error(e);
        setStatus(`❌ PDF: ${e?.message || e}`, "error");
      }
    });

    $("btnPdfResults")?.addEventListener("click", async () => {
      try {
        const dateISO = $("turnsDate")?.value || Store.state?.session_date || todayISO();
        const detail = await getHistoryDetail(dateISO);
        if (!detail?.session) throw new Error("No hay equipos guardados para esta fecha (guarda equipos primero).");

        const t = Array.isArray(Store.state?.turns) ? Store.state.turns : [];
        if (!t.length) throw new Error("Primero genera turnos.");
        if (!allScoresComplete(t)) throw new Error("Completa todos los marcadores para PDF de resultados.");

        const summary = computeSummary(t);
        makePdf({ mode: "results", session: detail.session, turns: t, summary, dateISO });
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

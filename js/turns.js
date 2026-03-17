// turns.js — Generar turnos + auditoría + PDF fixture/resultados + guardar historial
// ✅ Parejas internas sin repetir cuando es posible
// ✅ Rivales repetidos minimizados por asignación óptima de canchas
// ✅ Mantiene PDF fixture, PDF resultados y guardar
// ✅ No toca auth

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
    return { a, b, digits };
  }

  function winnerFromScore(sc) {
    if (!sc) return null;
    return sc.a > sc.b ? "A" : "B";
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

    const detail = await apiGetHistoryDetail(dateISO);
    const session = detail?.session;
    if (!session) throw new Error("No hay equipos guardados en esta fecha. Ve a Equipos y guarda primero.");
    return { A: session.team_a || [], B: session.team_b || [] };
  }

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
    const pairOccA = new Map();
    const pairOccB = new Map();
    const oppOcc = new Map();
    const oppNames = new Map();

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

        for (const ai of aIds) {
          for (const bi of bIds) {
            const ok = oppKey(ai, bi);
            if (!oppOcc.has(ok)) {
              oppOcc.set(ok, { count: 0, aId: ai, bId: bi, samples: [] });
            }
            const obj = oppOcc.get(ok);
            obj.count += 1;
            if (obj.samples.length < 8) obj.samples.push({ turn: t.turnIndex, court: m.court });
          }
        }
      }
    }

    const repeatedPairsA = [];
    const repeatedPairsB = [];
    const repeatedOpponents = [];

    for (const [k, occ] of pairOccA.entries()) {
      if (occ.length > 1) repeatedPairsA.push({ key: k, count: occ.length, occ });
    }
    for (const [k, occ] of pairOccB.entries()) {
      if (occ.length > 1) repeatedPairsB.push({ key: k, count: occ.length, occ });
    }
    for (const [, obj] of oppOcc.entries()) {
      if (obj.count > 1) {
        repeatedOpponents.push({
          count: obj.count,
          aName: oppNames.get(obj.aId) || obj.aId,
          bName: oppNames.get(obj.bId) || obj.bId,
          samples: obj.samples
        });
      }
    }

    repeatedPairsA.sort((x, y) => y.count - x.count);
    repeatedPairsB.sort((x, y) => y.count - x.count);
    repeatedOpponents.sort((x, y) => y.count - x.count);

    const okPairs = repeatedPairsA.length === 0 && repeatedPairsB.length === 0;
    const okOpp = repeatedOpponents.length === 0;

    const pairRepeatCount =
      repeatedPairsA.reduce((a, it) => a + (it.count - 1), 0) +
      repeatedPairsB.reduce((a, it) => a + (it.count - 1), 0);

    const oppRepeatCount = repeatedOpponents.reduce((a, it) => a + (it.count - 1), 0);
    const oppMax = repeatedOpponents.length ? Math.max(...repeatedOpponents.map(x => x.count)) : 1;

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
          <div style="margin-top:8px;">
            ${listOpp(audit.repeatedOpponents)}
          </div>
        </div>
      </div>
    `;
  }

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

  function getCourts(teamA, teamB) {
    const A = splitBySide(teamA);
    const B = splitBySide(teamB);
    return Math.min(A.D.length, A.R.length, B.D.length, B.R.length);
  }

  function buildTeamPairingsNoRepeat(teamPlayers, numTurns) {
    const { D, R } = splitBySide(teamPlayers);
    const k = Math.min(D.length, R.length);
    if (k <= 0) throw new Error("Equipo incompleto para armar parejas.");

    const Dsel = shuffleCopy(D).slice(0, k);
    const Rsel = shuffleCopy(R).slice(0, k);

    const pairingsByTurn = [];

    // Si numTurns <= k, rotación garantiza 0 repeticiones
    // Si numTurns > k, empezará a repetir a partir de k
    for (let t = 0; t < numTurns; t++) {
      const shift = t % k;
      const pairs = [];
      for (let i = 0; i < k; i++) {
        pairs.push([Dsel[i], Rsel[(i + shift) % k]]);
      }
      pairingsByTurn.push(pairs);
    }

    return { k, pairingsByTurn };
  }

  function getIncrementalOpponentPenalty(aPair, bPair, oppCountMap) {
    const aIds = [String(aPair[0].id), String(aPair[1].id)];
    const bIds = [String(bPair[0].id), String(bPair[1].id)];

    let penalty = 0;

    for (const ai of aIds) {
      for (const bi of bIds) {
        const key = oppKey(ai, bi);
        const prev = oppCountMap.get(key) || 0;

        // 0 -> 1 = ideal
        // 1 -> 2 = penaliza
        // 2 -> 3 = penaliza mucho más
        if (prev === 0) penalty += 0;
        else if (prev === 1) penalty += 10;
        else penalty += 100 + prev * 50;
      }
    }

    return penalty;
  }

  function addOpponentsToMap(aPair, bPair, oppCountMap) {
    const aIds = [String(aPair[0].id), String(aPair[1].id)];
    const bIds = [String(bPair[0].id), String(bPair[1].id)];

    for (const ai of aIds) {
      for (const bi of bIds) {
        const key = oppKey(ai, bi);
        oppCountMap.set(key, (oppCountMap.get(key) || 0) + 1);
      }
    }
  }

  function permutations(arr) {
    if (arr.length <= 1) return [arr.slice()];
    const out = [];
    for (let i = 0; i < arr.length; i++) {
      const head = arr[i];
      const rest = arr.slice(0, i).concat(arr.slice(i + 1));
      for (const p of permutations(rest)) {
        out.push([head, ...p]);
      }
    }
    return out;
  }

  function bestMatchupForTurn(aPairs, bPairs, oppCountMap) {
    const idx = bPairs.map((_, i) => i);
    const perms = permutations(idx);

    let best = null;
    let bestPenalty = Infinity;

    for (const perm of perms) {
      let penalty = 0;
      for (let i = 0; i < aPairs.length; i++) {
        penalty += getIncrementalOpponentPenalty(aPairs[i], bPairs[perm[i]], oppCountMap);
      }
      if (penalty < bestPenalty) {
        bestPenalty = penalty;
        best = perm;
        if (penalty === 0) break;
      }
    }

    return { perm: best, penalty: bestPenalty };
  }

  function buildTurnsFromPairings(aByTurn, bByTurn) {
    const oppCountMap = new Map();
    const turns = [];

    for (let t = 0; t < aByTurn.length; t++) {
      const aPairs = aByTurn[t];
      const bPairs = bByTurn[t];

      const { perm } = bestMatchupForTurn(aPairs, bPairs, oppCountMap);
      const matches = [];

      for (let i = 0; i < aPairs.length; i++) {
        const bp = bPairs[perm[i]];
        matches.push({
          court: i + 1,
          top: { team: "A", pair: aPairs[i] },
          bottom: { team: "B", pair: bp },
          scoreRaw: ""
        });
        addOpponentsToMap(aPairs[i], bp, oppCountMap);
      }

      turns.push({ turnIndex: t + 1, matches });
    }

    return turns;
  }

  function scoreCandidate(turns) {
    const a = auditTurns(turns);
    const pairsPenalty = a.pairRepeatCount * 1000000;
    const oppPenalty = a.oppRepeatCount * 3000;
    const oppMaxPenalty = Math.max(0, a.oppMax - 1) * 10000;
    return pairsPenalty + oppPenalty + oppMaxPenalty;
  }

  function generateTurnsSmart(teamA, teamB, numTurns, tries = 2000) {
    const courts = getCourts(teamA, teamB);
    if (courts <= 0) throw new Error("Equipos incompletos para armar parejas.");

    let bestTurns = null;
    let bestAudit = null;
    let bestScore = Infinity;

    for (let i = 0; i < tries; i++) {
      const A = buildTeamPairingsNoRepeat(teamA, numTurns);
      const B = buildTeamPairingsNoRepeat(teamB, numTurns);

      const turns = buildTurnsFromPairings(A.pairingsByTurn, B.pairingsByTurn);
      const audit = auditTurns(turns);
      const score = scoreCandidate(turns);

      if (score < bestScore) {
        bestScore = score;
        bestTurns = turns;
        bestAudit = audit;
      }

      if (audit.okPairs && audit.okOpp) {
        return {
          courts,
          turns,
          audit,
          perfect: true,
          triesUsed: i + 1
        };
      }
    }

    return {
      courts,
      turns: bestTurns,
      audit: bestAudit,
      perfect: !!(bestAudit?.okPairs && bestAudit?.okOpp),
      triesUsed: tries
    };
  }

  async function apiGetHistoryDetail(dateISO) {
    const sessionNo = Number(Store.state?.session_no || 1);
    if (typeof getHistoryDetail === "function" && getHistoryDetail.length >= 2) {
      return await getHistoryDetail(dateISO, sessionNo);
    }
    return await getHistoryDetail(dateISO);
  }

  async function apiSaveResults(dateISO, turnsPayload, scoresPayload, summaryPayload) {
    const sessionNo = Number(Store.state?.session_no || 1);
    if (typeof saveResultsToHistory === "function" && saveResultsToHistory.length >= 5) {
      return await saveResultsToHistory(dateISO, sessionNo, turnsPayload, scoresPayload, summaryPayload);
    }
    return await saveResultsToHistory(dateISO, turnsPayload, scoresPayload, summaryPayload);
  }

  function getSessionForPdfFromStore(dateISO) {
    const A = Array.isArray(Store.state?.team_a) ? Store.state.team_a : [];
    const B = Array.isArray(Store.state?.team_b) ? Store.state.team_b : [];
    if (!A.length && !B.length) return null;

    return {
      session_date: dateISO,
      totalPlayers: A.length + B.length,
      team_a: A,
      team_b: B
    };
  }

  async function getSessionForPdf(dateISO) {
    const fromStore = getSessionForPdfFromStore(dateISO);
    if (fromStore) return fromStore;

    const detail = await apiGetHistoryDetail(dateISO);
    return detail?.session || null;
  }

  function getJsPDF() {
    const jspdf = window.jspdf;
    if (!jspdf || !jspdf.jsPDF) {
      throw new Error("jsPDF no está cargado en index.html.");
    }
    return jspdf.jsPDF;
  }

  function pdfNiceDate(dateISO) {
    const d = new Date(String(dateISO).slice(0, 10) + "T00:00:00");
    if (Number.isNaN(d.getTime())) return String(dateISO).slice(0, 10);
    return d.toLocaleDateString("es-EC", { year: "numeric", month: "short", day: "2-digit" });
  }

  function drawTeamsAll(doc, session, pageW, pageH, margin, startY) {
    const A = session?.team_a || [];
    const B = session?.team_b || [];

    const maxW = pageW - margin * 2;
    const boxH = 14 + (Math.max(A.length, B.length) * 5.2) + 10;
    const minH = 46;
    const h = Math.max(minH, Math.min(boxH, 150));
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
    doc.text(`Equipo B (${B.length})`, margin + (maxW / 2) + 3, y + 14);
    doc.setFont("helvetica", "normal");

    const row = (p) => `${p?.name || ""} (${p?.side || ""} ${Number(p?.rating || 0).toFixed(1)})`;

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
        doc.text(`Equipo B (${B.length})`, margin + (maxW / 2) + 3, y + 14);
        doc.setFont("helvetica", "normal");
      }

      for (let i = 0; i < maxRowsPerPage; i++) {
        const idx = offset + i;
        const yy = y + 20 + i * 5.2;
        if (A[idx]) doc.text(row(A[idx]), margin + 3, yy);
        if (B[idx]) doc.text(row(B[idx]), margin + (maxW / 2) + 3, yy);
      }

      offset += maxRowsPerPage;
      firstBlock = false;
    }

    return startY + h + 6;
  }

  function makePdf({ mode, session, turns, summary, dateISO }) {
    const jsPDF = getJsPDF();
    const doc = new jsPDF({ unit: "mm", format: "a4" });

    const pageW = 210;
    const pageH = 297;
    const margin = 12;
    const date = String(dateISO || session?.session_date || "").slice(0, 10) || todayISO();

    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text("Open Padel — Resumen", margin, 14);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(`Fecha: ${pdfNiceDate(date)}`, margin, 20);
    doc.text(mode === "results" ? "Tipo: Resultados" : "Tipo: Fixture", margin, 25);

    let y = 30;
    y = drawTeamsAll(doc, session, pageW, pageH, margin, y);

    const maxW = pageW - margin * 2;

    doc.setDrawColor(40);
    doc.setLineWidth(0.2);
    doc.rect(margin, y, maxW, 10);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text(mode === "results" ? "Turnos (Resultados)" : "Turnos (Fixture)", margin + 3, y + 6);
    doc.setFont("helvetica", "normal");
    y += 14;

    for (const t of (turns || [])) {
      if (y > pageH - 40) {
        doc.addPage();
        y = 14;
      }

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
        if (y > pageH - 20) {
          doc.addPage();
          y = 14;
        }

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
      if (y > pageH - 45) {
        doc.addPage();
        y = 14;
      }

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
      for (let i = 0; i < lines.length; i++) {
        doc.text(lines[i], margin + 90, y + 14 + i * 6);
      }
    }

    const filename =
      mode === "results"
        ? `OpenPadel_${date}_resultados.pdf`
        : `OpenPadel_${date}_fixture.pdf`;

    doc.save(filename);
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
                ${[1,2,3,4].map(n => `<option value="${n}" ${n===3 ? "selected" : ""}>${n}</option>`).join("")}
              </select>
            </div>

            <div class="btns">
              <button class="ghost" id="btnAudit" type="button" ${turnsState.length ? "" : "disabled"}>Auditar</button>
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
      <div id="turnsAudit"></div>
    `;

    const statusEl = $("turnsStatus");
    const setStatus = (msg, cls = "muted") => {
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
    const btnPdfFixture = $("btnPdfFixture");
    const btnPdfResults = $("btnPdfResults");

    function updateResultsUI() {
      if (!turnsState.length) {
        results.innerHTML = "";
        if (auditMount) auditMount.innerHTML = "";
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

      btnSave.disabled = !allScoresComplete(turnsState);
      btnPdfFixture.disabled = false;
      btnPdfResults.disabled = !allScoresComplete(turnsState);

      if (auditMount) auditMount.innerHTML = renderAuditPanel(turnsState);
    }

    function drawTurnsUI() {
      if (!turnsState.length) {
        table.innerHTML = `<div class="card" style="margin-top:12px;"><div class="hint muted">Aún no hay turnos generados.</div></div>`;
        results.innerHTML = "";
        if (auditMount) auditMount.innerHTML = "";
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

    $("btnAudit")?.addEventListener("click", () => {
      if (auditMount) auditMount.innerHTML = renderAuditPanel(turnsState);
      setStatus("Auditoría actualizada.", "muted");
    });

    $("btnGenTurns")?.addEventListener("click", async () => {
      try {
        setStatus("Generando turnos (sin repetir parejas y minimizando rivales)…", "muted");

        const dateISO = $("turnsDate")?.value || Store.state?.session_date || todayISO();
        const numTurns = Number($("turnCount")?.value || 3);

        const { A, B } = await ensureTeamsLoaded(dateISO);
        const gen = generateTurnsSmart(A, B, numTurns, 2000);

        Store.setState({
          session_date: dateISO,
          courts: gen.courts,
          turns: gen.turns
        });

        if (gen.perfect) {
          setStatus("Perfecto: 0 parejas repetidas, 0 rivales repetidos", "ok");
        } else {
          const a = gen.audit;
          setStatus(
            `⚠️ Mejor combinación encontrada: parejas rep ${a.pairRepeatCount}, rivales rep ${a.oppRepeatCount}, máximo rival ${a.oppMax}x. Revisa auditoría abajo.`,
            "error"
          );
        }

        render();
      } catch (e) {
        console.error(e);
        setStatus(`❌ ${e?.message || e}`, "error");
      }
    });

    $("btnPdfFixture")?.addEventListener("click", async () => {
      try {
        const dateISO = $("turnsDate")?.value || Store.state?.session_date || todayISO();
        const session = await getSessionForPdf(dateISO);
        if (!session) throw new Error("No hay equipos disponibles para el fixture.");

        const t = Array.isArray(Store.state?.turns) ? Store.state.turns : [];
        if (!t.length) throw new Error("Primero genera turnos.");

        makePdf({
          mode: "fixture",
          session,
          turns: t,
          summary: null,
          dateISO
        });

        setStatus("✅ Fixture exportado en PDF.", "ok");
      } catch (e) {
        console.error(e);
        setStatus(`❌ PDF fixture: ${e?.message || e}`, "error");
      }
    });

    $("btnPdfResults")?.addEventListener("click", async () => {
      try {
        const dateISO = $("turnsDate")?.value || Store.state?.session_date || todayISO();
        const session = await getSessionForPdf(dateISO);
        if (!session) throw new Error("No hay equipos disponibles para el PDF.");

        const t = Array.isArray(Store.state?.turns) ? Store.state.turns : [];
        if (!t.length) throw new Error("Primero genera turnos.");
        if (!allScoresComplete(t)) throw new Error("Completa todos los marcadores para exportar resultados.");

        const summary = computeSummary(t);

        makePdf({
          mode: "results",
          session,
          turns: t,
          summary,
          dateISO
        });

        setStatus("✅ Resultados exportados en PDF.", "ok");
      } catch (e) {
        console.error(e);
        setStatus(`❌ PDF resultados: ${e?.message || e}`, "error");
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

        await apiSaveResults(dateISO, turnsPayload, scoresPayload, summaryPayload);

        setStatus("✅ Resultados guardados. Ya puedes sacar PDF de resultados.", "ok");
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

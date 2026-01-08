// turns.js — Turnos + marcador 2 dígitos + Guardar resultados a Historial SOLO si todo está completo
(function () {
  const KEY_PLAYERS = "op_players_v1";
  const KEY_TOTAL = "op_totalPlayers_v1";
  const KEY_TEAM_A = "op_teamA_v1";
  const KEY_TEAM_B = "op_teamB_v1";
  const KEY_SESSION_DATE = "op_sessionDate_v1";
  const KEY_HISTORY = "op_history_v2";

  const $ = (id) => document.getElementById(id);
  const loadJSON = (k, fb) => { try { const r = localStorage.getItem(k); return r ? JSON.parse(r) : fb; } catch { return fb; } };
  const saveJSON = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

  const ALLOWED_TOTALS = [4, 8, 12, 16, 20, 24];

  function todayISO() {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }
  function getSessionDate() {
    return localStorage.getItem(KEY_SESSION_DATE) || todayISO();
  }

  function getPlayers() { return loadJSON(KEY_PLAYERS, []); }
  function getTeamA() { return new Set(loadJSON(KEY_TEAM_A, [])); }
  function getTeamB() { return new Set(loadJSON(KEY_TEAM_B, [])); }
  function getTotalPlayers() {
    const v = Number(localStorage.getItem(KEY_TOTAL) || 16);
    return ALLOWED_TOTALS.includes(v) ? v : 16;
  }
  function listFromIds(ids, players) {
    return [...ids].map(id => players.find(p => p.id === id)).filter(Boolean);
  }

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  function pairKey(dId, rId) { return `${dId}|${rId}`; }

  function buildPairs(Ds, Rs, usedPairs, maxTries = 4000) {
    const dIds = Ds.map(p => p.id);
    const rIds = Rs.map(p => p.id);

    for (let t = 0; t < maxTries; t++) {
      const dOrder = shuffle(dIds);
      const rOrder = shuffle(rIds);

      const usedR = new Set();
      const pairs = [];
      let ok = true;

      for (const dId of dOrder) {
        const candidates = rOrder.filter(rId => !usedR.has(rId) && !usedPairs.has(pairKey(dId, rId)));
        if (!candidates.length) { ok = false; break; }
        const rId = candidates[Math.floor(Math.random() * candidates.length)];
        usedR.add(rId);
        pairs.push({ dId, rId });
      }
      if (ok) return pairs;
    }
    return null;
  }

  function namePair(pair, playersAll) {
    const d = playersAll.find(p => p.id === pair.dId);
    const r = playersAll.find(p => p.id === pair.rId);
    return `${(d?.name||"D?")} + ${(r?.name||"R?")}`;
  }

  function fmtScore(raw) {
    if (!raw || raw.length !== 2) return "—";
    return `${raw[0]}-${raw[1]}`;
  }

  function scoreWinner(raw) {
    if (!raw || raw.length !== 2) return "";
    const a = Number(raw[0]), b = Number(raw[1]);
    if (a === b) return "";
    return a > b ? "Equipo A" : "Equipo B";
  }

  let lastState = null;

  function computeSummary(players) {
    if (!lastState) return null;

    const perTurn = [];
    let totalA = 0, totalB = 0;

    for (let ti = 0; ti < lastState.turns.length; ti++) {
      const weight = ti + 1;
      const turn = lastState.turns[ti];
      let turnA = 0, turnB = 0;

      for (let mi = 0; mi < turn.matches.length; mi++) {
        const key = `${ti}-${mi}`;
        const raw = lastState.scores[key] || "";
        const w = scoreWinner(raw);
        if (w === "Equipo A") { turnA += weight; totalA += weight; }
        if (w === "Equipo B") { turnB += weight; totalB += weight; }
      }
      perTurn.push({ turn: ti + 1, weight, A: turnA, B: turnB });
    }

    const winner = totalA === totalB ? "Empate" : (totalA > totalB ? "Equipo A" : "Equipo B");
    return { perTurn, totalA, totalB, winner };
  }

  function allScoresComplete(courts) {
    if (!lastState) return false;
    for (let ti = 0; ti < lastState.turns.length; ti++) {
      for (let mi = 0; mi < courts; mi++) {
        const key = `${ti}-${mi}`;
        const raw = lastState.scores[key] || "";
        if (raw.length !== 2) return false;
      }
    }
    return true;
  }

  function snapshotTeams(players) {
    const A = listFromIds(getTeamA(), players).map(p => ({ id: p.id, name: p.name, side: p.side, rating: p.rating }));
    const B = listFromIds(getTeamB(), players).map(p => ({ id: p.id, name: p.name, side: p.side, rating: p.rating }));
    return { A, B };
  }

  function upsertHistoryTurns(dateISO, totalPlayers, teamsSnap, turnsSnap) {
    const hist = loadJSON(KEY_HISTORY, []);
    const idx = hist.findIndex(x => x.date === dateISO);

    const nowISO = new Date().toISOString();

    if (idx >= 0) {
      hist[idx] = {
        ...hist[idx],
        date: dateISO,
        totalPlayers,
        teams: hist[idx].teams || teamsSnap,
        turns: turnsSnap,
        updatedAt: nowISO,
        createdAt: hist[idx].createdAt || nowISO,
      };
    } else {
      hist.unshift({
        date: dateISO,
        totalPlayers,
        teams: teamsSnap,
        turns: turnsSnap,
        createdAt: nowISO,
        updatedAt: nowISO,
      });
    }
    saveJSON(KEY_HISTORY, hist);
  }

  function renderTurns() {
    const mount = $("turnsMount");
    if (!mount) return;

    const players = getPlayers();
    const total = getTotalPlayers();
    const courts = total / 4;

    const A = listFromIds(getTeamA(), players);
    const B = listFromIds(getTeamB(), players);

    const size = total / 2;
    const perSide = size / 2;

    const err = [];
    if (A.length !== size || B.length !== size) {
      err.push(`Equipos incompletos: A=${A.length}/${size}, B=${B.length}/${size}.`);
    } else {
      const aD = A.filter(p=>p.side==="D").length;
      const aR = A.filter(p=>p.side==="R").length;
      const bD = B.filter(p=>p.side==="D").length;
      const bR = B.filter(p=>p.side==="R").length;
      if (aD !== perSide || aR !== perSide) err.push(`Equipo A debe tener ${perSide}D y ${perSide}R.`);
      if (bD !== perSide || bR !== perSide) err.push(`Equipo B debe tener ${perSide}D y ${perSide}R.`);
    }

    const dateISO = getSessionDate();

    mount.innerHTML = `
      <div class="card" style="margin-top:10px;">
        <div class="hint muted">Turnos: ${courts} canchas por turno • Parejas 1D+1R • A vs B • Fecha: <b>${dateISO}</b></div>

        <div id="turnsStatus" class="hint" style="margin-top:10px;"></div>

        <div style="display:grid; grid-template-columns: 1fr 1fr auto; gap:10px; margin-top:10px; align-items:end;">
          <div>
            <label>Turnos</label>
            <select id="turnsCount">
              ${[1,2,3,4,5,6].map(n=>`<option value="${n}" ${n===3?"selected":""}>${n}</option>`).join("")}
            </select>
          </div>
          <div>
            <label>No repetir parejas</label>
            <select id="avoidPairs">
              <option value="yes" selected>Sí</option>
              <option value="no">No</option>
            </select>
          </div>
          <div class="btns">
            <button class="primary" id="genTurns" ${err.length ? "disabled":""}>Generar</button>
            <button class="ghost" id="regenTurns" disabled>Otra opción</button>
            <button class="ghost" id="saveTurns" disabled>Guardar resultados</button>
          </div>
        </div>
      </div>

      <div id="turnsOut" style="margin-top:14px; display:grid; gap:12px;"></div>

      <div class="card" style="margin-top:14px;">
        <h3 style="margin:0 0 10px;">Resultados</h3>
        <div id="resultsOut"></div>
      </div>
    `;

    const turnsOut = $("turnsOut");
    const resultsOut = $("resultsOut");
    const status = $("turnsStatus");
    const btnRegen = $("regenTurns");
    const btnGen = $("genTurns");
    const btnSave = $("saveTurns");

    function setStatus(msg, kind) {
      status.textContent = msg;
      status.className = "hint " + (kind || "");
    }

    if (err.length) setStatus("No se puede generar: " + err.join(" | "), "warn");
    else setStatus(`Listo para generar • Equipos completos • A=${A.length} B=${B.length}`, "ok");

    function renderResults() {
      if (!lastState) { resultsOut.innerHTML = ""; btnSave.disabled = true; return; }

      const summary = computeSummary(players);
      const perTurn = summary.perTurn;

      const resumenRows = perTurn.map(t => `
        <tr>
          <td style="padding:10px 8px; border-bottom:1px solid rgba(255,255,255,.08); font-weight:800;">Turno ${t.turn}</td>
          <td style="padding:10px 8px; border-bottom:1px solid rgba(255,255,255,.08);">x${t.weight}</td>
          <td style="padding:10px 8px; border-bottom:1px solid rgba(255,255,255,.08); font-weight:900;">${t.A}</td>
          <td style="padding:10px 8px; border-bottom:1px solid rgba(255,255,255,.08); font-weight:900;">${t.B}</td>
        </tr>
      `).join("");

      resultsOut.innerHTML = `
        <div class="card" style="margin-bottom:12px;">
          <div style="display:flex; justify-content:space-between; gap:10px; align-items:center;">
            <h3 style="margin:0;">Resumen (suma de turnos)</h3>
            <div class="pill">${summary.winner === "Empate" ? "Empate" : `Gana ${summary.winner}`}</div>
          </div>

          <div style="margin-top:10px; overflow:auto;">
            <table style="width:100%; border-collapse:collapse;">
              <thead>
                <tr>
                  <th style="text-align:left; padding:10px 8px; border-bottom:1px solid rgba(255,255,255,.12);">Turno</th>
                  <th style="text-align:left; padding:10px 8px; border-bottom:1px solid rgba(255,255,255,.12);">Valor</th>
                  <th style="text-align:left; padding:10px 8px; border-bottom:1px solid rgba(255,255,255,.12);">Puntos A</th>
                  <th style="text-align:left; padding:10px 8px; border-bottom:1px solid rgba(255,255,255,.12);">Puntos B</th>
                </tr>
              </thead>
              <tbody>
                ${resumenRows}
                <tr>
                  <td style="padding:10px 8px; font-weight:900;">TOTAL</td>
                  <td style="padding:10px 8px; font-weight:900;">—</td>
                  <td style="padding:10px 8px; font-weight:900; font-size:16px;">${summary.totalA}</td>
                  <td style="padding:10px 8px; font-weight:900; font-size:16px;">${summary.totalB}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      `;

      btnSave.disabled = !allScoresComplete(courts);
      if (!btnSave.disabled) {
        btnSave.textContent = `Guardar resultados (${dateISO})`;
      } else {
        btnSave.textContent = "Guardar resultados";
      }
    }

    function renderAll() {
      if (!lastState) { turnsOut.innerHTML = ""; renderResults(); return; }

      turnsOut.innerHTML = lastState.turns.map((turn, ti) => {
        return `
          <div class="card">
            <div style="display:flex; justify-content:space-between; gap:10px; align-items:center;">
              <h3 style="margin:0;">Turno ${ti+1}</h3>
              <div class="pill">${courts} canchas</div>
            </div>

            <div style="display:grid; gap:10px; margin-top:12px;">
              ${turn.matches.map((m, mi) => {
                const key = `${ti}-${mi}`;
                const raw = lastState.scores[key] || "";
                const winner = scoreWinner(raw);

                return `
                  <div class="card" style="background: rgba(0,0,0,.18); padding:12px;">
                    <div class="hint muted" style="margin-bottom:8px;"><b>Cancha ${mi+1}</b></div>

                    <div style="display:grid; grid-template-columns: 1fr auto; gap:12px; align-items:center;">
                      <div>
                        <div><b>A:</b> ${namePair(m.A, players)}</div>
                        <div style="margin-top:6px;"><b>B:</b> ${namePair(m.B, players)}</div>
                      </div>

                      <div style="display:grid; gap:6px; justify-items:end;">
                        <label style="margin:0;">Marcador</label>
                        <input data-score="${key}" inputmode="numeric" maxlength="2" placeholder="63" value="${raw}"
                               style="width:90px; text-align:center; font-weight:900;" />
                        <div class="pill" data-visual="${key}" style="font-size:14px; font-weight:900;">${fmtScore(raw)}</div>
                        <div class="hint ${winner ? "ok" : "muted"}" data-winner="${key}">${winner ? `Gana ${winner}` : ""}</div>
                      </div>
                    </div>
                  </div>
                `;
              }).join("")}
            </div>
          </div>
        `;
      }).join("");

      turnsOut.querySelectorAll("input[data-score]").forEach(inp => {
        inp.addEventListener("input", () => {
          let v = (inp.value || "").replace(/\D/g, "");
          v = v.split("").filter(ch => ch >= "0" && ch <= "7").join("").slice(0, 2);
          inp.value = v;
          lastState.scores[inp.dataset.score] = v;

          const visualEl = turnsOut.querySelector(`[data-visual="${inp.dataset.score}"]`);
          if (visualEl) visualEl.textContent = fmtScore(v);

          const winnerEl = turnsOut.querySelector(`[data-winner="${inp.dataset.score}"]`);
          if (winnerEl) {
            const w = scoreWinner(v);
            winnerEl.textContent = w ? `Gana ${w}` : "";
            winnerEl.className = "hint " + (w ? "ok" : "muted");
          }

          renderResults();
        });
      });

      renderResults();
    }

    function generate(turnCount, avoidRepeats) {
      const Aplayers = listFromIds(getTeamA(), players);
      const Bplayers = listFromIds(getTeamB(), players);

      const AD = Aplayers.filter(p => p.side === "D");
      const AR = Aplayers.filter(p => p.side === "R");
      const BD = Bplayers.filter(p => p.side === "D");
      const BR = Bplayers.filter(p => p.side === "R");

      const usedA = new Set();
      const usedB = new Set();
      const turns = [];

      for (let t = 0; t < turnCount; t++) {
        const pairsA = buildPairs(AD, AR, avoidRepeats ? usedA : new Set(), 4000);
        const pairsB = buildPairs(BD, BR, avoidRepeats ? usedB : new Set(), 4000);

        if (!pairsA || !pairsB) {
          return { ok: false, msg: `No pude generar Turno ${t + 1} sin repetir parejas. Desactiva “No repetir parejas” o reduce turnos.` };
        }

        if (avoidRepeats) {
          for (const p of pairsA) usedA.add(pairKey(p.dId, p.rId));
          for (const p of pairsB) usedB.add(pairKey(p.dId, p.rId));
        }

        const matches = [];
        const aSh = shuffle(pairsA);
        const bSh = shuffle(pairsB);
        for (let c = 0; c < courts; c++) matches.push({ A: aSh[c], B: bSh[c] });
        turns.push({ matches });
      }

      return { ok: true, turns };
    }

    btnGen?.addEventListener("click", () => {
      const turnCount = Number($("turnsCount").value || 3);
      const avoid = $("avoidPairs").value === "yes";

      const res = generate(turnCount, avoid);
      if (!res.ok) {
        lastState = null;
        turnsOut.innerHTML = "";
        resultsOut.innerHTML = "";
        btnRegen.disabled = true;
        btnSave.disabled = true;
        setStatus(res.msg, "error");
        return;
      }

      lastState = { turns: res.turns, scores: {} };
      btnRegen.disabled = false;
      btnSave.disabled = true;

      setStatus("✅ Turnos generados. Ingresa todos los marcadores para poder guardar.", "ok");
      renderAll();
    });

    btnRegen?.addEventListener("click", () => {
      if (btnGen && !btnGen.disabled) btnGen.click();
    });

    // Guardar resultados (solo si completo)
    btnSave?.addEventListener("click", () => {
      if (!lastState) return;

      if (!allScoresComplete(courts)) {
        setStatus("❌ Faltan marcadores. Completa todos los partidos para guardar.", "warn");
        return;
      }

      const teamsSnap = snapshotTeams(players);
      const summary = computeSummary(players);

      // Guardamos solo lo necesario: matches + scores + summary
      const turnsSnap = {
        turnsCount: lastState.turns.length,
        courts,
        turns: lastState.turns,
        scores: lastState.scores,
        summary
      };

      upsertHistoryTurns(dateISO, getTotalPlayers(), teamsSnap, turnsSnap);
      setStatus(`✅ Resultados guardados en Historial (${dateISO}).`, "ok");
    });
  }

  window.addEventListener("op:poolChanged", () => renderTurns());
  window.addEventListener("op:teamsChanged", () => renderTurns());

  window.OP = window.OP || {};
  const prevRefresh = window.OP.refresh;
  window.OP.refresh = (view) => {
    if (typeof prevRefresh === "function") prevRefresh(view);
    if (view === "turns") renderTurns();
  };

  document.addEventListener("DOMContentLoaded", renderTurns);
})();

// turns.js — Turnos A vs B + marcador "63" + resultados por turno (1/2/3)
(function () {
  const KEY_PLAYERS = "op_players_v1";
  const KEY_TOTAL = "op_totalPlayers_v1";
  const KEY_TEAM_A = "op_teamA_v1";
  const KEY_TEAM_B = "op_teamB_v1";

  const $ = (id) => document.getElementById(id);
  const loadJSON = (k, fb) => { try { const r = localStorage.getItem(k); return r ? JSON.parse(r) : fb; } catch { return fb; } };

  const ALLOWED_TOTALS = [4, 8, 12, 16, 20, 24];

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

  function pairKey(dId, rId) { return `${dId}|${rId}`; }

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function buildPairs(Ds, Rs, usedPairs, maxTries = 3000) {
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
    return `${(d?.name||"D?")} (D) + ${(r?.name||"R?")} (R)`;
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

    mount.innerHTML = `
      <div class="card" style="margin-top:10px;">
        <div class="hint muted">Cada cancha: 1 pareja A vs 1 pareja B. Cada pareja: 1D + 1R.</div>
        ${err.length ? `<div class="hint error" style="margin-top:10px;">${err.join("<br/>")}</div>` : ""}

        <div style="display:grid; grid-template-columns: 1fr 1fr auto; gap:10px; margin-top:10px; align-items:end;">
          <div>
            <label>Cantidad de turnos</label>
            <select id="turnsCount">
              ${[1,2,3,4,5,6].map(n=>`<option value="${n}" ${n===3?"selected":""}>${n}</option>`).join("")}
            </select>
          </div>
          <div>
            <label>Evitar repetir parejas</label>
            <select id="avoidPairs">
              <option value="yes" selected>Sí</option>
              <option value="no">No</option>
            </select>
          </div>
          <div class="btns">
            <button class="primary" id="genTurns" ${err.length ? "disabled":""}>Generar</button>
            <button class="ghost" id="regenTurns" disabled>Re-random</button>
          </div>
        </div>

        <div id="turnsStatus" class="hint" style="margin-top:10px;"></div>
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

    let lastState = null;

    function setStatus(msg, kind) {
      status.textContent = msg;
      status.className = "hint " + (kind || "");
    }

    function renderResults() {
      if (!lastState) { resultsOut.innerHTML = ""; return; }

      let totalA = 0, totalB = 0;
      const rows = [];

      lastState.turns.forEach((turn, ti) => {
        const weight = ti + 1;
        let turnA = 0, turnB = 0;

        turn.matches.forEach((m, mi) => {
          const key = `${ti}-${mi}`;
          const raw = lastState.scores[key] || "";
          if (raw.length !== 2) return;

          const a = Number(raw[0]);
          const b = Number(raw[1]);
          if (a === b) return;

          const winA = a > b;
          if (winA) { turnA += weight; totalA += weight; }
          else { turnB += weight; totalB += weight; }

          rows.push({ turno: ti+1, cancha: mi+1, marcador: `${a}-${b}`, ganador: winA ? "Equipo A" : "Equipo B", puntos: weight });
        });

        rows.push({ turno: ti+1, cancha: "—", marcador: "—", ganador: `Subtotal Turno ${ti+1}`, puntos: `A: ${turnA} • B: ${turnB}` });
      });

      const winner = totalA === totalB ? "Empate" : (totalA > totalB ? "Gana Equipo A" : "Gana Equipo B");

      resultsOut.innerHTML = `
        <div class="pill" style="margin-bottom:10px;">
          Total A: <b>${totalA}</b> • Total B: <b>${totalB}</b> • <b>${winner}</b>
        </div>

        <div style="overflow:auto;">
          <table style="width:100%; border-collapse:collapse;">
            <thead>
              <tr>
                <th style="text-align:left; padding:8px; border-bottom:1px solid rgba(255,255,255,.12);">Turno</th>
                <th style="text-align:left; padding:8px; border-bottom:1px solid rgba(255,255,255,.12);">Cancha</th>
                <th style="text-align:left; padding:8px; border-bottom:1px solid rgba(255,255,255,.12);">Marcador</th>
                <th style="text-align:left; padding:8px; border-bottom:1px solid rgba(255,255,255,.12);">Ganador</th>
                <th style="text-align:left; padding:8px; border-bottom:1px solid rgba(255,255,255,.12);">Puntos</th>
              </tr>
            </thead>
            <tbody>
              ${rows.map(r => `
                <tr>
                  <td style="padding:8px; border-bottom:1px solid rgba(255,255,255,.08);">${r.turno}</td>
                  <td style="padding:8px; border-bottom:1px solid rgba(255,255,255,.08);">${r.cancha}</td>
                  <td style="padding:8px; border-bottom:1px solid rgba(255,255,255,.08);">${r.marcador}</td>
                  <td style="padding:8px; border-bottom:1px solid rgba(255,255,255,.08);">${r.ganador}</td>
                  <td style="padding:8px; border-bottom:1px solid rgba(255,255,255,.08);">${r.puntos}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      `;
    }

    function renderAll() {
      if (!lastState) return;

      turnsOut.innerHTML = lastState.turns.map((turn, ti) => {
        const weight = ti + 1;
        return `
          <div class="card">
            <h3 style="margin:0 0 10px;">Turno ${ti+1} (victoria vale ${weight})</h3>
            <div style="display:grid; gap:10px;">
              ${turn.matches.map((m, mi) => {
                const key = `${ti}-${mi}`;
                const raw = lastState.scores[key] || "";
                const a = raw[0] ?? "";
                const b = raw[1] ?? "";
                const display = raw.length === 2 ? `${a}-${b}` : "";
                const winner = (raw.length===2 && a!==b) ? (a>b ? "Ganador: Equipo A" : "Ganador: Equipo B") : "";

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
                        <input
                          data-score="${key}"
                          inputmode="numeric"
                          maxlength="2"
                          placeholder="63"
                          value="${raw}"
                          style="width:90px; text-align:center; font-weight:800;"
                        />
                        <div class="hint muted">${display || "Escribe 2 dígitos (0–7), ej: 63"}</div>
                        <div class="hint ${winner ? "ok" : "muted"}">${winner || ""}</div>
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
          renderResults();
        });
      });

      renderResults();
    }

    function generate(turnCount, avoidRepeats) {
      const Aplayers = listFromIds(getTeamA(), players);
      const Bplayers = listFromIds(getTeamB(), players);

      const AD = Aplayers.filter(p=>p.side==="D");
      const AR = Aplayers.filter(p=>p.side==="R");
      const BD = Bplayers.filter(p=>p.side==="D");
      const BR = Bplayers.filter(p=>p.side==="R");

      const usedA = new Set();
      const usedB = new Set();

      const turns = [];

      for (let t = 0; t < turnCount; t++) {
        const pairsA = buildPairs(AD, AR, avoidRepeats ? usedA : new Set(), 4000);
        const pairsB = buildPairs(BD, BR, avoidRepeats ? usedB : new Set(), 4000);

        if (!pairsA || !pairsB) {
          return { ok:false, msg:`No pude generar Turno ${t+1} sin repetir parejas. Prueba desactivar “Evitar repetir parejas” o reduce turnos.` };
        }

        if (avoidRepeats) {
          for (const p of pairsA) usedA.add(pairKey(p.dId, p.rId));
          for (const p of pairsB) usedB.add(pairKey(p.dId, p.rId));
        }

        const aSh = shuffle(pairsA);
        const bSh = shuffle(pairsB);

        const matches = [];
        for (let c = 0; c < courts; c++) matches.push({ A: aSh[c], B: bSh[c] });

        turns.push({ matches });
      }

      return { ok:true, turns };
    }

    $("genTurns").addEventListener("click", () => {
      const turnCount = Number($("turnsCount").value || 3);
      const avoid = $("avoidPairs").value === "yes";

      const res = generate(turnCount, avoid);
      if (!res.ok) {
        lastState = null;
        turnsOut.innerHTML = "";
        resultsOut.innerHTML = "";
        btnRegen.disabled = true;
        return setStatus(res.msg, "error");
      }

      lastState = { turns: res.turns, scores: {} };
      btnRegen.disabled = false;
      setStatus("✅ Turnos generados. Ingresa marcadores para ver resultados.", "ok");
      renderAll();
    });

    $("regenTurns").addEventListener("click", () => {
      $("genTurns").click();
    });
  }

  // refresco al entrar a Turnos y cuando cambie el pool
  window.addEventListener("op:poolChanged", () => renderTurns());

  window.OP = window.OP || {};
  const prevRefresh = window.OP.refresh;
  window.OP.refresh = (view) => {
    if (typeof prevRefresh === "function") prevRefresh(view);
    if (view === "turns") renderTurns();
  };

  document.addEventListener("DOMContentLoaded", renderTurns);
})();

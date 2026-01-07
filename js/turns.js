// turns.js — Turnos A vs B + marcador 2 dígitos (63) + vista 6-3 + resultados limpios
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
    if (!raw || raw.length !== 2) return "";
    return `${raw[0]}-${raw[1]}`;
  }

  function scoreWinner(raw) {
    if (!raw || raw.length !== 2) return "";
    const a = Number(raw[0]), b = Number(raw[1]);
    if (a === b) return "";
    return a > b ? "Equipo A" : "Equipo B";
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
        <div class="hint muted">Turnos: ${courts} canchas por turno • Parejas 1D+1R • A vs B</div>

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

    function setStatus(msg, kind) {
      status.textContent = msg;
      status.className = "hint " + (kind || "");
    }

    if (err.length) setStatus("No se puede generar: " + err.join(" | "), "warn");
    else setStatus(`Listo para generar • Equipos completos • A=${A.length} B=${B.length}`, "ok");

    let lastState = null;

    function renderResults() {
      if (!lastState) { resultsOut.innerHTML = ""; return; }

      const turnBlocks = [];
      let totalA = 0, totalB = 0;

      for (let ti = 0; ti < lastState.turns.length; ti++) {
        const weight = ti + 1;
        const turn = lastState.turns[ti];

        let turnA = 0, turnB = 0;

        const rows = turn.matches.map((m, mi) => {
          const key = `${ti}-${mi}`;
          const raw = lastState.scores[key] || "";
          const winner = scoreWinner(raw);
          const puntos = winner ? weight : 0;

          if (winner === "Equipo A") { turnA += puntos; totalA += puntos; }
          if (winner === "Equipo B") { turnB += puntos; totalB += puntos; }

          return `
            <div style="display:grid; grid-template-columns: 70px 1fr 80px 110px; gap:10px; align-items:center; padding:8px 0; border-bottom:1px solid rgba(255,255,255,.08);">
              <div class="pill">Cancha ${mi+1}</div>
              <div class="hint muted">
                <b>A:</b> ${namePair(m.A, players)} &nbsp; vs &nbsp; <b>B:</b> ${namePair(m.B, players)}
              </div>
              <div style="font-weight:900; text-align:center;">${fmtScore(raw) || "—"}</div>
              <div class="hint">${winner ? `Gana ${winner} (+${weight})` : "—"}</div>
            </div>
          `;
        }).join("");

        turnBlocks.push(`
          <div class="card" style="background: rgba(0,0,0,.18);">
            <div style="display:flex; justify-content:space-between; gap:10px; align-items:center;">
              <h3 style="margin:0;">Turno ${ti+1}</h3>
              <div class="pill">Valor: ${weight}</div>
            </div>
            <div style="margin-top:10px;">${rows}</div>
            <div style="margin-top:10px; font-weight:800;">
              Subtotal Turno ${ti+1}: A <b>${turnA}</b> • B <b>${turnB}</b>
            </div>
          </div>
        `);
      }

      const winner = totalA === totalB ? "Empate" : (totalA > totalB ? "Gana Equipo A" : "Gana Equipo B");

      resultsOut.innerHTML = `
        <div class="card" style="margin-bottom:12px;">
          <div style="display:flex; justify-content:space-between; gap:10px; align-items:center;">
            <h3 style="margin:0;">Resultado general</h3>
            <div class="pill">${winner}</div>
          </div>
          <div style="margin-top:10px; font-size:18px; font-weight:900;">
            A: ${totalA} &nbsp; • &nbsp; B: ${totalB}
          </div>
        </div>
        <div style="display:grid; gap:12px;">
          ${turnBlocks.join("")}
        </div>
      `;
    }

    function renderAll() {
      if (!lastState) return;

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
                const visual = fmtScore(raw);
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

                        <!-- Input SOLO 2 dígitos: nunca se bloquea el backspace -->
                        <input
                          data-score="${key}"
                          inputmode="numeric"
                          maxlength="2"
                          placeholder="63"
                          value="${raw}"
                          style="width:90px; text-align:center; font-weight:900;"
                        />

                        <div style="font-size:18px; font-weight:900;">${visual || "—"}</div>
                        <div class="hint ${winner ? "ok" : "muted"}">${winner ? `Gana ${winner}` : ""}</div>
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
          renderAll(); // refresca visual “6-3” inmediato
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
          return { ok:false, msg:`No pude generar Turno ${t+1} sin repetir parejas. Desactiva “No repetir parejas” o reduce turnos.` };
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

      return { ok:true, turns };
    }

    if (btnGen) {
      btnGen.addEventListener("click", () => {
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
    }

    if (btnRegen) {
      btnRegen.addEventListener("click", () => {
        if (btnGen && !btnGen.disabled) btnGen.click();
      });
    }
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

// history.js — Historial por fecha (equipos + resultados si existen)
(function () {
  const KEY_HISTORY = "op_history_v2";
  const $ = (id) => document.getElementById(id);

  const loadJSON = (k, fb) => { try { const r = localStorage.getItem(k); return r ? JSON.parse(r) : fb; } catch { return fb; } };
  const saveJSON = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

  function fmtDateButton(iso) {
    // iso: YYYY-MM-DD
    const [y, m, d] = String(iso || "").split("-");
    if (!y || !m || !d) return iso || "Sin fecha";
    const months = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
    const mm = Number(m);
    return `${months[mm-1] || m} ${d} ${y}`;
  }

  function renderTeamsTables(teams) {
    const A = teams?.A || [];
    const B = teams?.B || [];
    const aRows = A.map(p => `<tr><td>${p.name}</td><td>${p.side}</td><td style="font-weight:900;">${p.rating}</td></tr>`).join("");
    const bRows = B.map(p => `<tr><td>${p.name}</td><td>${p.side}</td><td style="font-weight:900;">${p.rating}</td></tr>`).join("");

    return `
      <div style="display:grid; grid-template-columns: 1fr 1fr; gap:12px; margin-top:12px;">
        <div class="card" style="background: rgba(0,0,0,.18);">
          <h3 style="margin:0 0 10px;">Equipo A</h3>
          <table style="width:100%; border-collapse:collapse;">
            <thead>
              <tr>
                <th style="text-align:left; padding:10px 8px; border-bottom:1px solid rgba(255,255,255,.12);">Jugador</th>
                <th style="text-align:left; padding:10px 8px; border-bottom:1px solid rgba(255,255,255,.12);">Lado</th>
                <th style="text-align:left; padding:10px 8px; border-bottom:1px solid rgba(255,255,255,.12);">Nivel</th>
              </tr>
            </thead>
            <tbody>${aRows || `<tr><td colspan="3" class="hint muted" style="padding:10px 8px;">—</td></tr>`}</tbody>
          </table>
        </div>

        <div class="card" style="background: rgba(0,0,0,.18);">
          <h3 style="margin:0 0 10px;">Equipo B</h3>
          <table style="width:100%; border-collapse:collapse;">
            <thead>
              <tr>
                <th style="text-align:left; padding:10px 8px; border-bottom:1px solid rgba(255,255,255,.12);">Jugador</th>
                <th style="text-align:left; padding:10px 8px; border-bottom:1px solid rgba(255,255,255,.12);">Lado</th>
                <th style="text-align:left; padding:10px 8px; border-bottom:1px solid rgba(255,255,255,.12);">Nivel</th>
              </tr>
            </thead>
            <tbody>${bRows || `<tr><td colspan="3" class="hint muted" style="padding:10px 8px;">—</td></tr>`}</tbody>
          </table>
        </div>
      </div>
    `;
  }

  function pairLabel(pair, teams) {
    // buscamos nombre por id dentro de teams
    const all = [...(teams?.A||[]), ...(teams?.B||[])];
    const d = all.find(x => x.id === pair.dId);
    const r = all.find(x => x.id === pair.rId);
    return `${(d?.name||"D?")} + ${(r?.name||"R?")}`;
  }

  function renderTurnsTables(turns, teams) {
    if (!turns) {
      return `<div class="card" style="margin-top:12px; background: rgba(0,0,0,.18);"><div class="hint muted">Aún no hay resultados guardados para esta fecha.</div></div>`;
    }

    const summary = turns.summary;
    const resumen = `
      <div class="card" style="margin-top:12px; background: rgba(0,0,0,.18);">
        <div style="display:flex; justify-content:space-between; gap:10px; align-items:center;">
          <h3 style="margin:0;">Resultado general</h3>
          <div class="pill">${summary?.winner === "Empate" ? "Empate" : `Gana ${summary?.winner}`}</div>
        </div>
        <div style="margin-top:10px; font-size:18px; font-weight:900;">
          Equipo A: ${summary?.totalA ?? "—"} • Equipo B: ${summary?.totalB ?? "—"}
        </div>
      </div>
    `;

    const perTurnRows = (summary?.perTurn || []).map(t => `
      <tr>
        <td style="padding:10px 8px; border-bottom:1px solid rgba(255,255,255,.08); font-weight:800;">Turno ${t.turn}</td>
        <td style="padding:10px 8px; border-bottom:1px solid rgba(255,255,255,.08);">x${t.weight}</td>
        <td style="padding:10px 8px; border-bottom:1px solid rgba(255,255,255,.08); font-weight:900;">${t.A}</td>
        <td style="padding:10px 8px; border-bottom:1px solid rgba(255,255,255,.08); font-weight:900;">${t.B}</td>
      </tr>
    `).join("");

    const resumenTurnos = `
      <div class="card" style="margin-top:12px; background: rgba(0,0,0,.18); overflow:auto;">
        <h3 style="margin:0 0 10px;">Resumen por turno</h3>
        <table style="width:100%; border-collapse:collapse;">
          <thead>
            <tr>
              <th style="text-align:left; padding:10px 8px; border-bottom:1px solid rgba(255,255,255,.12);">Turno</th>
              <th style="text-align:left; padding:10px 8px; border-bottom:1px solid rgba(255,255,255,.12);">Valor</th>
              <th style="text-align:left; padding:10px 8px; border-bottom:1px solid rgba(255,255,255,.12);">A</th>
              <th style="text-align:left; padding:10px 8px; border-bottom:1px solid rgba(255,255,255,.12);">B</th>
            </tr>
          </thead>
          <tbody>
            ${perTurnRows || `<tr><td colspan="4" class="hint muted" style="padding:10px 8px;">—</td></tr>`}
          </tbody>
        </table>
      </div>
    `;

    // Detalle turnos
    const detail = (turns.turns || []).map((turn, ti) => {
      const matches = (turn.matches || []).map((m, mi) => {
        const key = `${ti}-${mi}`;
        const raw = turns.scores?.[key] || "";
        const score = raw.length === 2 ? `${raw[0]}-${raw[1]}` : "—";
        return `
          <tr>
            <td style="padding:10px 8px; border-bottom:1px solid rgba(255,255,255,.08);">Cancha ${mi+1}</td>
            <td style="padding:10px 8px; border-bottom:1px solid rgba(255,255,255,.08);"><b>A:</b> ${pairLabel(m.A, teams)}</td>
            <td style="padding:10px 8px; border-bottom:1px solid rgba(255,255,255,.08);"><b>B:</b> ${pairLabel(m.B, teams)}</td>
            <td style="padding:10px 8px; border-bottom:1px solid rgba(255,255,255,.08); font-weight:900; text-align:center;">${score}</td>
          </tr>
        `;
      }).join("");

      return `
        <div class="card" style="margin-top:12px; background: rgba(0,0,0,.18); overflow:auto;">
          <h3 style="margin:0 0 10px;">Turno ${ti+1}</h3>
          <table style="width:100%; border-collapse:collapse;">
            <thead>
              <tr>
                <th style="text-align:left; padding:10px 8px; border-bottom:1px solid rgba(255,255,255,.12);">Cancha</th>
                <th style="text-align:left; padding:10px 8px; border-bottom:1px solid rgba(255,255,255,.12);">Pareja A</th>
                <th style="text-align:left; padding:10px 8px; border-bottom:1px solid rgba(255,255,255,.12);">Pareja B</th>
                <th style="text-align:center; padding:10px 8px; border-bottom:1px solid rgba(255,255,255,.12);">Score</th>
              </tr>
            </thead>
            <tbody>${matches}</tbody>
          </table>
        </div>
      `;
    }).join("");

    return resumen + resumenTurnos + detail;
  }

  function render() {
    const mount = $("historyMount");
    if (!mount) return;

    const hist = loadJSON(KEY_HISTORY, []);

    if (!hist.length) {
      mount.innerHTML = `
        <div class="card" style="margin-top:10px;">
          <div class="hint muted">Aún no hay historial. Graba equipos en “Equipos” y luego guarda resultados en “Turnos”.</div>
        </div>
      `;
      return;
    }

    // Vista: lista o detalle
    const state = loadJSON("op_history_ui_state", { mode: "list", date: null });

    function renderList() {
      mount.innerHTML = `
        <div class="card" style="margin-top:10px;">
          <div style="display:flex; justify-content:space-between; gap:10px; align-items:center;">
            <div>
              <h3 style="margin:0;">Historial</h3>
              <div class="hint muted">Toca una fecha para ver equipos + turnos + resultado.</div>
            </div>
            <div class="btns">
              <button class="ghost" id="clearHistory">Borrar historial</button>
            </div>
          </div>
        </div>

        <div style="display:grid; gap:10px; margin-top:12px;" id="histList"></div>
      `;

      $("clearHistory").addEventListener("click", () => {
        saveJSON(KEY_HISTORY, []);
        saveJSON("op_history_ui_state", { mode: "list", date: null });
        render();
      });

      const list = $("histList");
      list.innerHTML = hist.map(entry => {
        const hasTeams = !!entry.teams;
        const hasTurns = !!entry.turns;

        const subtitle = hasTurns
          ? `✅ Resultados: A ${entry.turns.summary?.totalA ?? "—"} • B ${entry.turns.summary?.totalB ?? "—"}`
          : hasTeams
            ? "📝 Equipos grabados (sin resultados)"
            : "—";

        return `
          <button class="nav-btn" style="text-align:left;" data-open="${entry.date}">
            <div>
              <div style="font-weight:900;">${fmtDateButton(entry.date)}</div>
              <div class="hint muted">${subtitle}</div>
            </div>
            <span class="badge">${hasTurns ? "R" : "E"}</span>
          </button>
        `;
      }).join("");

      list.querySelectorAll("[data-open]").forEach(btn => {
        btn.addEventListener("click", () => {
          const date = btn.getAttribute("data-open");
          saveJSON("op_history_ui_state", { mode: "detail", date });
          render();
        });
      });
    }

    function renderDetail(dateISO) {
      const entry = hist.find(x => x.date === dateISO);
      if (!entry) {
        saveJSON("op_history_ui_state", { mode: "list", date: null });
        return render();
      }

      mount.innerHTML = `
        <div class="card" style="margin-top:10px;">
          <div style="display:flex; justify-content:space-between; gap:10px; align-items:center;">
            <div>
              <h3 style="margin:0;">${fmtDateButton(entry.date)}</h3>
              <div class="hint muted">N: ${entry.totalPlayers ?? "—"}</div>
            </div>
            <div class="btns">
              <button class="ghost" id="backHist">Volver</button>
              <button class="ghost" id="delEntry">Borrar</button>
            </div>
          </div>
        </div>

        ${entry.teams ? renderTeamsTables(entry.teams) : `
          <div class="card" style="margin-top:12px; background: rgba(0,0,0,.18);">
            <div class="hint muted">No hay equipos guardados para esta fecha.</div>
          </div>
        `}

        ${renderTurnsTables(entry.turns, entry.teams)}
      `;

      $("backHist").addEventListener("click", () => {
        saveJSON("op_history_ui_state", { mode: "list", date: null });
        render();
      });

      $("delEntry").addEventListener("click", () => {
        const hist2 = hist.filter(x => x.date !== dateISO);
        saveJSON(KEY_HISTORY, hist2);
        saveJSON("op_history_ui_state", { mode: "list", date: null });
        render();
      });
    }

    if (state.mode === "detail" && state.date) renderDetail(state.date);
    else renderList();
  }

  window.OP = window.OP || {};
  const prevRefresh = window.OP.refresh;
  window.OP.refresh = (view) => {
    if (typeof prevRefresh === "function") prevRefresh(view);
    if (view === "history") render();
  };

  document.addEventListener("DOMContentLoaded", render);
})();

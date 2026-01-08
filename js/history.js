// history.js — Pantalla Historial (snapshots grabados desde Equipos)
(function () {
  const KEY_HISTORY = "op_history_v1";
  const $ = (id) => document.getElementById(id);

  const loadJSON = (k, fb) => { try { const r = localStorage.getItem(k); return r ? JSON.parse(r) : fb; } catch { return fb; } };
  const saveJSON = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

  function render() {
    const mount = $("historyMount");
    if (!mount) return;

    const hist = loadJSON(KEY_HISTORY, []);

    if (!hist.length) {
      mount.innerHTML = `
        <div class="card" style="margin-top:10px;">
          <div class="hint muted">Aún no hay registros. Ve a “Equipos” y presiona “Grabar”.</div>
        </div>
      `;
      return;
    }

    mount.innerHTML = `
      <div class="card" style="margin-top:10px;">
        <div style="display:flex; justify-content:space-between; gap:10px; align-items:center;">
          <div>
            <h3 style="margin:0;">Registros</h3>
            <div class="hint muted">Se guardan en este dispositivo/navegador.</div>
          </div>
          <div class="btns">
            <button class="ghost" id="clearHistory">Borrar historial</button>
          </div>
        </div>
      </div>

      <div style="display:grid; gap:12px; margin-top:12px;" id="historyList"></div>
    `;

    $("clearHistory").addEventListener("click", () => {
      saveJSON(KEY_HISTORY, []);
      render();
    });

    const list = $("historyList");

    list.innerHTML = hist.map(entry => {
      const aNames = (entry.teamA || []).map(p => `${p.name} (${p.side})`).join(", ");
      const bNames = (entry.teamB || []).map(p => `${p.name} (${p.side})`).join(", ");

      const hasTurns = !!(entry.turns && entry.turns.summary);
      const sum = hasTurns ? entry.turns.summary : null;

      const headline = hasTurns
        ? `Resultado: A ${sum.totalA} • B ${sum.totalB} (${sum.winner === "Empate" ? "Empate" : "Gana " + sum.winner})`
        : "Sin turnos grabados (solo equipos)";

      const perTurnTable = hasTurns ? `
        <div style="margin-top:10px; overflow:auto;">
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
              ${(sum.perTurn || []).map(t => `
                <tr>
                  <td style="padding:10px 8px; border-bottom:1px solid rgba(255,255,255,.08);">Turno ${t.turn}</td>
                  <td style="padding:10px 8px; border-bottom:1px solid rgba(255,255,255,.08);">x${t.weight}</td>
                  <td style="padding:10px 8px; border-bottom:1px solid rgba(255,255,255,.08); font-weight:900;">${t.A}</td>
                  <td style="padding:10px 8px; border-bottom:1px solid rgba(255,255,255,.08); font-weight:900;">${t.B}</td>
                </tr>
              `).join("")}
              <tr>
                <td style="padding:10px 8px; font-weight:900;">TOTAL</td>
                <td style="padding:10px 8px; font-weight:900;">—</td>
                <td style="padding:10px 8px; font-weight:900;">${sum.totalA}</td>
                <td style="padding:10px 8px; font-weight:900;">${sum.totalB}</td>
              </tr>
            </tbody>
          </table>
        </div>
      ` : "";

      return `
        <div class="card">
          <details>
            <summary style="cursor:pointer; display:flex; justify-content:space-between; gap:10px; align-items:center;">
              <div>
                <div style="font-weight:900;">${entry.date || "(sin fecha)"}</div>
                <div class="hint muted">${headline}</div>
              </div>
              <div class="btns">
                <button class="ghost small" data-del="${entry.id}" type="button">Borrar</button>
              </div>
            </summary>

            <div style="margin-top:12px;">
              <div class="pill">N: ${entry.totalPlayers || "—"}</div>

              <div style="display:grid; grid-template-columns: 1fr 1fr; gap:12px; margin-top:12px;">
                <div class="card" style="background: rgba(0,0,0,.18);">
                  <h3 style="margin:0 0 8px;">Equipo A</h3>
                  <div class="hint muted">${aNames || "—"}</div>
                </div>
                <div class="card" style="background: rgba(0,0,0,.18);">
                  <h3 style="margin:0 0 8px;">Equipo B</h3>
                  <div class="hint muted">${bNames || "—"}</div>
                </div>
              </div>

              ${perTurnTable}

              <div class="hint muted" style="margin-top:10px;">
                Guardado: ${entry.createdAt ? new Date(entry.createdAt).toLocaleString() : "—"}
              </div>
            </div>
          </details>
        </div>
      `;
    }).join("");

    // borrar individual
    list.querySelectorAll("[data-del]").forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const id = btn.getAttribute("data-del");
        const hist2 = loadJSON(KEY_HISTORY, []).filter(x => x.id !== id);
        saveJSON(KEY_HISTORY, hist2);
        render();
      });
    });
  }

  window.OP = window.OP || {};
  const prevRefresh = window.OP.refresh;
  window.OP.refresh = (view) => {
    if (typeof prevRefresh === "function") prevRefresh(view);
    if (view === "history") render();
  };

  document.addEventListener("DOMContentLoaded", render);
})();

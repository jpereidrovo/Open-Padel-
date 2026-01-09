// history.js — Historial por fecha (equipos + resumen + turnos)
import { listHistoryDates, getHistoryDetail } from "./supabaseApi.js";
import { Store } from "./store.js";

(function () {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

  let selectedDate = null;

  function niceDate(yyyy_mm_dd) {
    // simple: YYYY-MM-DD -> DD Mon YYYY (es)
    const d = new Date(yyyy_mm_dd + "T00:00:00");
    if (Number.isNaN(d.getTime())) return yyyy_mm_dd;
    return d.toLocaleDateString("es-EC", { year:"numeric", month:"long", day:"2-digit" });
  }

  function renderTeamsBlock(teamA, teamB) {
    const A = teamA || [];
    const B = teamB || [];
    return `
      <div class="card" style="margin-top:12px;">
        <h3 style="margin:0 0 10px;">Equipos</h3>
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:12px;">
          <div class="card" style="background: rgba(0,0,0,.12);">
            <h4 style="margin:0 0 10px;">Equipo A (${A.length})</h4>
            ${A.length ? A.map(p => `<div class="hint muted">${esc(p.name)} • ${p.side} • ${p.rating}</div>`).join("") : `<div class="hint muted">Sin datos</div>`}
          </div>
          <div class="card" style="background: rgba(0,0,0,.12);">
            <h4 style="margin:0 0 10px;">Equipo B (${B.length})</h4>
            ${B.length ? B.map(p => `<div class="hint muted">${esc(p.name)} • ${p.side} • ${p.rating}</div>`).join("") : `<div class="hint muted">Sin datos</div>`}
          </div>
        </div>
      </div>
    `;
  }

  function renderResultsBlock(results) {
    if (!results) {
      return `
        <div class="card" style="margin-top:12px;">
          <h3 style="margin:0 0 10px;">Resultados</h3>
          <div class="hint muted">Aún no hay resultados guardados para esta fecha.</div>
        </div>
      `;
    }

    const summary = results.summary || { totalA:0, totalB:0, perTurn:[] };
    const turns = results.turns || [];

    return `
      <div class="card" style="margin-top:12px;">
        <h3 style="margin:0 0 10px;">Resultados</h3>
        <div class="hint ok"><b>Equipo A ${summary.totalA} puntos</b> • <b>Equipo B ${summary.totalB} puntos</b></div>

        <div style="margin-top:10px; display:grid; gap:6px;">
          ${(summary.perTurn || []).map(pt => `
            <div class="hint muted">Turno ${pt.turn}: A ${pt.aPts} • B ${pt.bPts}</div>
          `).join("")}
        </div>
      </div>

      <div class="card" style="margin-top:12px;">
        <h3 style="margin:0 0 10px;">Turnos</h3>
        ${turns.length ? turns.map(t => `
          <div class="card" style="background: rgba(0,0,0,.12); margin-bottom:10px;">
            <h4 style="margin:0 0 10px;">Turno ${t.turnIndex}</h4>
            <div style="overflow:auto;">
              <table style="width:100%; border-collapse:collapse;">
                <thead>
                  <tr class="hint muted">
                    <th style="text-align:left; padding:8px;">Cancha</th>
                    <th style="text-align:left; padding:8px;">Equipo A</th>
                    <th style="text-align:left; padding:8px;">Equipo B</th>
                    <th style="text-align:left; padding:8px;">Marcador</th>
                  </tr>
                </thead>
                <tbody>
                  ${t.matches.map(m => `
                    <tr>
                      <td style="padding:8px; border-top:1px solid rgba(255,255,255,.08);">#${m.court}</td>
                      <td style="padding:8px; border-top:1px solid rgba(255,255,255,.08);">${esc(m.top.pair[0].name)} / ${esc(m.top.pair[1].name)}</td>
                      <td style="padding:8px; border-top:1px solid rgba(255,255,255,.08);">${esc(m.bottom.pair[0].name)} / ${esc(m.bottom.pair[1].name)}</td>
                      <td style="padding:8px; border-top:1px solid rgba(255,255,255,.08);"><b>${esc(formatScore(m.score))}</b></td>
                    </tr>
                  `).join("")}
                </tbody>
              </table>
            </div>
          </div>
        `).join("") : `<div class="hint muted">No hay turnos guardados.</div>`}
      </div>
    `;

    function formatScore(raw) {
      if (!raw) return "";
      const digits = String(raw).replace(/\D/g, "").slice(0, 2);
      if (digits.length === 1) return digits;
      return `${digits[0]}-${digits[1]}`;
    }
  }

  async function loadDates() {
    const dates = await listHistoryDates();
    return dates.map(d => d.session_date);
  }

  async function render() {
    const mount = $("historyMount");
    if (!mount) return;

    if (!Store.ready) {
      mount.innerHTML = `<div class="card" style="margin-top:10px;"><div class="hint muted">Inicia sesión para ver Historial.</div></div>`;
      return;
    }

    mount.innerHTML = `
      <div class="card" style="margin-top:10px;">
        <div style="display:flex; justify-content:space-between; gap:10px; flex-wrap:wrap; align-items:center;">
          <div>
            <div class="hint muted">Historial por fecha (equipos + resultados).</div>
          </div>
          <div class="btns">
            <button class="ghost" id="reloadHistory">Recargar</button>
          </div>
        </div>
      </div>

      <div class="card" style="margin-top:12px;">
        <h3 style="margin:0 0 10px;">Fechas</h3>
        <div id="datesList" style="display:flex; gap:10px; flex-wrap:wrap;"></div>
      </div>

      <div id="historyDetail"></div>
    `;

    const datesEl = $("datesList");
    const detailEl = $("historyDetail");

    let dates = [];
    try {
      dates = await loadDates();
    } catch (e) {
      console.error(e);
      datesEl.innerHTML = `<div class="hint error">Error cargando historial.</div>`;
      return;
    }

    if (!dates.length) {
      datesEl.innerHTML = `<div class="hint muted">Aún no has guardado equipos/resultados.</div>`;
    } else {
      if (!selectedDate) selectedDate = dates[0];

      datesEl.innerHTML = dates.map(d => `
        <button class="ghost" data-date="${d}" style="${d===selectedDate ? "border-color: rgba(255,255,255,.35);" : ""}">
          ${esc(niceDate(d))}
        </button>
      `).join("");

      datesEl.querySelectorAll("[data-date]").forEach(btn => {
        btn.addEventListener("click", async () => {
          selectedDate = btn.getAttribute("data-date");
          await render();
        });
      });

      // detail
      detailEl.innerHTML = `<div class="card" style="margin-top:12px;"><div class="hint muted">Cargando…</div></div>`;

      try {
        const { session, results } = await getHistoryDetail(selectedDate);

        if (!session) {
          detailEl.innerHTML = `
            <div class="card" style="margin-top:12px;">
              <div class="hint muted">No hay equipos guardados para esta fecha.</div>
            </div>
          `;
        } else {
          detailEl.innerHTML = `
            <div class="card" style="margin-top:12px;">
              <h2 style="margin:0;">${esc(niceDate(selectedDate))}</h2>
              <div class="hint muted" style="margin-top:6px;">Jugadores: <b>${session.totalPlayers || ""}</b></div>
            </div>

            ${renderTeamsBlock(session.team_a, session.team_b)}
            ${renderResultsBlock(results)}
          `;
        }
      } catch (e) {
        console.error(e);
        detailEl.innerHTML = `<div class="card" style="margin-top:12px;"><div class="hint error">Error cargando detalle.</div></div>`;
      }
    }

    $("reloadHistory")?.addEventListener("click", async () => {
      selectedDate = null;
      await render();
    });
  }

  window.OP = window.OP || {};
  const prev = window.OP.refresh;
  window.OP.refresh = (view) => {
    if (typeof prev === "function") prev(view);
    if (view === "history") render();
  };

  window.addEventListener("op:storeReady", render);
  document.addEventListener("DOMContentLoaded", render);
})();

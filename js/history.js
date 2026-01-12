// history.js — Historial por fecha (Equipos + Turnos + Resumen)
// Compatible con supabaseApi.js "clásico": listHistoryDates(), getHistoryDetail(), deleteHistoryDate()

import { Store } from "./store.js";
import { listHistoryDates, getHistoryDetail, deleteHistoryDate } from "./supabaseApi.js";

(function () {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

  let selectedDate = null;

  function niceDate(yyyy_mm_dd) {
    const raw = String(yyyy_mm_dd || "").slice(0, 10);
    const d = new Date(raw + "T00:00:00");
    if (Number.isNaN(d.getTime())) return raw;
    return d.toLocaleDateString("es-EC", { year: "numeric", month: "long", day: "2-digit" });
  }

  function formatScore(raw) {
    if (!raw) return "";
    const digits = String(raw).replace(/\D/g, "").slice(0, 2);
    if (digits.length === 0) return "";
    if (digits.length === 1) return digits;
    return `${digits[0]}-${digits[1]}`;
  }

  function renderTeams(session) {
    const A = session?.team_a || [];
    const B = session?.team_b || [];

    const row = (p) =>
      `<div class="hint muted">${esc(p?.name)} • ${esc(p?.side)} • ${Number(p?.rating ?? 0).toFixed(1)}</div>`;

    return `
      <div class="card" style="margin-top:12px;">
        <h3 style="margin:0 0 10px;">Equipos</h3>
        <div class="hint muted" style="margin-bottom:10px;">Jugadores: <b>${esc(session?.totalPlayers ?? (A.length + B.length))}</b></div>
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:12px;">
          <div class="card" style="background: rgba(0,0,0,.12);">
            <h4 style="margin:0 0 10px;">Equipo A (${A.length})</h4>
            ${A.length ? A.map(row).join("") : `<div class="hint muted">Sin datos</div>`}
          </div>
          <div class="card" style="background: rgba(0,0,0,.12);">
            <h4 style="margin:0 0 10px;">Equipo B (${B.length})</h4>
            ${B.length ? B.map(row).join("") : `<div class="hint muted">Sin datos</div>`}
          </div>
        </div>
      </div>
    `;
  }

  function renderResults(results) {
    if (!results) {
      return `
        <div class="card" style="margin-top:12px;">
          <h3 style="margin:0 0 10px;">Resultados</h3>
          <div class="hint muted">Aún no hay resultados guardados para esta fecha.</div>
        </div>
      `;
    }

    const summary = results.summary || {};
    const totalA = summary.totalA ?? 0;
    const totalB = summary.totalB ?? 0;
    const perTurn = Array.isArray(summary.perTurn) ? summary.perTurn : [];

    return `
      <div class="card" style="margin-top:12px;">
        <h3 style="margin:0 0 10px;">Resumen general</h3>
        <div class="hint ok"><b>Equipo A ${esc(totalA)} puntos</b> • <b>Equipo B ${esc(totalB)} puntos</b></div>
        ${perTurn.length ? `
          <div style="margin-top:10px; display:grid; gap:6px;">
            ${perTurn.map(pt => `
              <div class="hint muted">Turno ${esc(pt.turn)}: A ${esc(pt.aPts)} • B ${esc(pt.bPts)}</div>
            `).join("")}
          </div>
        ` : ``}
      </div>
    `;
  }

  function renderTurns(results) {
    const turns = results?.turns || [];
    if (!turns || !turns.length) {
      return `
        <div class="card" style="margin-top:12px;">
          <h3 style="margin:0 0 10px;">Turnos</h3>
          <div class="hint muted">No hay turnos guardados.</div>
        </div>
      `;
    }

    const cell = (txt) => `<td style="padding:8px; border-top:1px solid rgba(255,255,255,.08);">${txt}</td>`;

    return `
      <div class="card" style="margin-top:12px;">
        <h3 style="margin:0 0 10px;">Turnos</h3>

        ${turns.map(t => `
          <div class="card" style="background: rgba(0,0,0,.12); margin-bottom:10px;">
            <h4 style="margin:0 0 10px;">Turno ${esc(t.turnIndex ?? t.turn ?? "")}</h4>

            <div style="overflow:auto;">
              <table style="width:100%; border-collapse:collapse;">
                <thead>
                  <tr class="hint muted">
                    <th style="text-align:left; padding:8px;">Cancha</th>
                    <th style="text-align:left; padding:8px;">Pareja A (arriba)</th>
                    <th style="text-align:left; padding:8px;">Pareja B (abajo)</th>
                    <th style="text-align:left; padding:8px;">Marcador</th>
                  </tr>
                </thead>
                <tbody>
                  ${(t.matches || []).map(m => {
                    const top = m?.top?.pair || [];
                    const bot = m?.bottom?.pair || [];
                    const topTxt = `${esc(top?.[0]?.name || "")} / ${esc(top?.[1]?.name || "")}`;
                    const botTxt = `${esc(bot?.[0]?.name || "")} / ${esc(bot?.[1]?.name || "")}`;
                    const scoreTxt = `<b>${esc(formatScore(m?.score))}</b>`;
                    return `
                      <tr>
                        ${cell(`#${esc(m?.court ?? "")}`)}
                        ${cell(topTxt)}
                        ${cell(botTxt)}
                        ${cell(scoreTxt)}
                      </tr>
                    `;
                  }).join("")}
                </tbody>
              </table>
            </div>
          </div>
        `).join("")}
      </div>
    `;
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
            <div class="hint muted">Historial por fecha (Equipos + Turnos + Resultados).</div>
          </div>
          <div class="btns">
            <button class="ghost" id="btnHistoryReload" type="button">Recargar</button>
          </div>
        </div>
      </div>

      <div class="card" style="margin-top:12px;">
        <h3 style="margin:0 0 10px;">Fechas</h3>
        <div id="historyDates" style="display:flex; gap:10px; flex-wrap:wrap;"></div>
      </div>

      <div id="historyDetail"></div>
    `;

    const datesEl = $("historyDates");
    const detailEl = $("historyDetail");

    let dates = [];
    try {
      const rows = await listHistoryDates();
      dates = (rows || []).map(r => String(r.session_date).slice(0, 10));
    } catch (e) {
      console.error(e);
      datesEl.innerHTML = `<div class="hint error">Error cargando fechas: ${esc(e?.message || e)}</div>`;
      detailEl.innerHTML = "";
      return;
    }

    if (!dates.length) {
      datesEl.innerHTML = `<div class="hint muted">Aún no hay historial. Guarda equipos para crear una fecha.</div>`;
      detailEl.innerHTML = "";
      return;
    }

    if (!selectedDate) selectedDate = dates[0];

    datesEl.innerHTML = dates.map(d => `
      <button class="ghost" type="button" data-date="${esc(d)}"
        style="${d === selectedDate ? "border-color: rgba(255,255,255,.35);" : ""}">
        ${esc(niceDate(d))}
      </button>
    `).join("");

    datesEl.querySelectorAll("[data-date]").forEach(btn => {
      btn.addEventListener("click", async () => {
        selectedDate = btn.getAttribute("data-date");
        await render();
      });
    });

    detailEl.innerHTML = `<div class="card" style="margin-top:12px;"><div class="hint muted">Cargando detalle…</div></div>`;

    try {
      const { session, results } = await getHistoryDetail(selectedDate);

      detailEl.innerHTML = `
        <div class="card" style="margin-top:12px;">
          <h2 style="margin:0;">${esc(niceDate(selectedDate))}</h2>

          <div class="btns" style="margin-top:10px; flex-wrap:wrap;">
            <button class="ghost" id="btnDeleteDate" type="button">Borrar TODA la fecha</button>
          </div>

          <div id="historyStatus" class="hint muted" style="margin-top:10px;"></div>
        </div>

        ${session ? renderTeams(session) : `
          <div class="card" style="margin-top:12px;">
            <div class="hint muted">No hay equipos guardados en esta fecha.</div>
          </div>
        `}
        ${renderResults(results)}
        ${results ? renderTurns(results) : ""}
      `;

      const statusEl = $("historyStatus");
      const setStatus = (m, cls="muted") => {
        if (!statusEl) return;
        statusEl.textContent = m || "";
        statusEl.className = "hint " + cls;
      };

      $("btnDeleteDate")?.addEventListener("click", async () => {
        const ok = confirm(`Esto borrará TODO del día ${selectedDate} (equipos + resultados). ¿Seguro?`);
        if (!ok) return;

        try {
          setStatus("Borrando fecha…", "muted");
          await deleteHistoryDate(selectedDate);
          setStatus("✅ Fecha borrada. Recargando…", "ok");
          selectedDate = null;
          await render();
        } catch (e) {
          console.error(e);
          setStatus(`❌ Error borrando: ${esc(e?.message || e)}`, "error");
        }
      });
    } catch (e) {
      console.error(e);
      detailEl.innerHTML = `
        <div class="card" style="margin-top:12px;">
          <div class="hint error">Error cargando detalle: ${esc(e?.message || e)}</div>
        </div>
      `;
    }

    $("btnHistoryReload")?.addEventListener("click", async () => {
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

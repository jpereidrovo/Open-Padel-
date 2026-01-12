// history.js — Historial por fecha (Equipos + Turnos + Resumen)
// Requiere: supabaseApi.js con listHistoryDates() y getHistoryDetail()

import { Store } from "./store.js";
import { listHistoryDates, getHistoryDetail } from "./supabaseApi.js";

(function () {
  const $ = (id) => document.getElementById(id);
  const esc = (s) =>
    String(s ?? "")
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

  /* -------------------- UX global: badges/pill -------------------- */
  function getPoolPlayers() {
    const poolIds = new Set(Store.state?.pool || []);
    return (Store.players || []).filter((p) => poolIds.has(p.id));
  }

  function computeCourtsCountFromPool() {
    const poolIds = Store.state?.pool || [];
    const poolPlayers = getPoolPlayers();
    const total = poolIds.length;
    if (!total) return 0;

    const d = poolPlayers.filter((p) => p.side === "D").length;
    const r = poolPlayers.filter((p) => p.side === "R").length;

    if (total % 4 === 0 && d === r) return total / 4;
    return 0;
  }

  function updateChrome() {
    const tagBase = $("tagBase");
    const tagTeams = $("tagTeams");
    const pillInfo = $("pillInfo");

    const playersCount =
      Store.getPlayersCount?.() ?? (Array.isArray(Store.players) ? Store.players.length : 0);

    const teamsCount =
      Store.getTeamsCount?.() ??
      ((Store.state?.team_a?.length || 0) + (Store.state?.team_b?.length || 0));

    const selected =
      Store.getPoolCount?.() ?? (Array.isArray(Store.state?.pool) ? Store.state.pool.length : 0);

    const courts = computeCourtsCountFromPool();

    if (tagBase) tagBase.textContent = String(playersCount);
    if (tagTeams) tagTeams.textContent = String(teamsCount);
    if (pillInfo) pillInfo.textContent = `N: ${selected} • Canchas: ${courts}`;
  }

  function renderTeams(session) {
    const A = session?.team_a || [];
    const B = session?.team_b || [];

    const row = (p) =>
      `<div class="hint muted">${esc(p?.name)} • ${esc(p?.side)} • ${Number(p?.rating ?? 0).toFixed(1)}</div>`;

    return `
      <div class="card" style="margin-top:12px;">
        <h3 style="margin:0 0 10px;">Equipos</h3>
        <div class="hint muted" style="margin-bottom:10px;">Jugadores: <b>${esc(
          session?.totalPlayers ?? (A.length + B.length)
        )}</b></div>
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
        ${
          perTurn.length
            ? `
          <div style="margin-top:10px; display:grid; gap:6px;">
            ${perTurn
              .map(
                (pt) =>
                  `<div class="hint muted">Turno ${esc(pt.turn)}: A ${esc(pt.aPts)} • B ${esc(pt.bPts)}</div>`
              )
              .join("")}
          </div>
        `
            : ``
        }
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

    const cell = (txt) =>
      `<td style="padding:8px; border-top:1px solid rgba(255,255,255,.08);">${txt}</td>`;

    return `
      <div class="card" style="margin-top:12px;">
        <h3 style="margin:0 0 10px;">Turnos</h3>

        ${turns
          .map(
            (t) => `
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
                  ${(t.matches || [])
                    .map((m) => {
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
                    })
                    .join("")}
                </tbody>
              </table>
            </div>
          </div>
        `
          )
          .join("")}
      </div>
    `;
  }

  async function render() {
    const mount = $("historyMount");
    if (!mount) return;

    updateChrome();

    // No sesión / no listo
    if (!Store.ready && Store.status !== "loading") {
      if (Store.status === "error") {
        const msg = Store.error?.message || "Ocurrió un error.";
        mount.innerHTML = `
          <div class="card" style="margin-top:10px;">
            <div class="hint" style="font-weight:700;">⚠️ Error</div>
            <div class="hint muted" style="margin-top:6px;">${esc(msg)}</div>
          </div>
        `;
        return;
      }

      mount.innerHTML = `
        <div class="card" style="margin-top:10px;">
          <div class="hint muted">Inicia sesión para ver Historial.</div>
        </div>
      `;
      return;
    }

    // Loading global
    if (Store.status === "loading") {
      mount.innerHTML = `
        <div class="card" style="margin-top:10px;">
          <div class="hint muted">Cargando…</div>
        </div>
      `;
      return;
    }

    // Error global
    if (Store.status === "error") {
      const msg = Store.error?.message || "Ocurrió un error.";
      mount.innerHTML = `
        <div class="card" style="margin-top:10px;">
          <div class="hint" style="font-weight:700;">⚠️ Error</div>
          <div class="hint muted" style="margin-top:6px;">${esc(msg)}</div>
        </div>
      `;
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

    datesEl.innerHTML = `<div class="hint muted">Cargando fechas…</div>`;
    detailEl.innerHTML = "";

    let dates = [];
    try {
      const rows = await listHistoryDates(); // viene de sessions
      dates = (rows || []).map((r) => String(r.session_date).slice(0, 10));
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

    datesEl.innerHTML = dates
      .map(
        (d) => `
      <button class="ghost" type="button" data-date="${esc(d)}" style="${
          d === selectedDate ? "border-color: rgba(255,255,255,.35);" : ""
        }">
        ${esc(niceDate(d))}
      </button>
    `
      )
      .join("");

    datesEl.querySelectorAll("[data-date]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        selectedDate = btn.getAttribute("data-date");
        await render();
      });
    });

    detailEl.innerHTML = `
      <div class="card" style="margin-top:12px;">
        <div class="hint muted">Cargando detalle…</div>
      </div>
    `;

    try {
      const { session, results } = await getHistoryDetail(selectedDate);

      if (!session) {
        detailEl.innerHTML = `
          <div class="card" style="margin-top:12px;">
            <h2 style="margin:0;">${esc(niceDate(selectedDate))}</h2>
            <div class="hint muted" style="margin-top:8px;">No hay equipos guardados en esta fecha.</div>
          </div>
        `;
        return;
      }

      detailEl.innerHTML = `
        <div class="card" style="margin-top:12px;">
          <h2 style="margin:0;">${esc(niceDate(selectedDate))}</h2>
          <div class="hint muted" style="margin-top:6px;">Guarda equipos y luego guarda turnos/resultados para completar el historial.</div>
        </div>

        ${renderTeams(session)}
        ${renderResults(results)}
        ${results ? renderTurns(results) : ""}
      `;
    } catch (e) {
      console.error(e);
      detailEl.innerHTML = `
        <div class="card" style="margin-top:12px;">
          <div class="hint error">Error cargando detalle: ${esc(e?.message || e)}</div>
          <div class="hint muted" style="margin-top:8px;">Tip: suele ser policy/RLS o que no exista el UNIQUE para upsert.</div>
        </div>
      `;
    }

    $("btnHistoryReload")?.addEventListener("click", async () => {
      selectedDate = null;
      await render();
    });
  }

  // Integración con navegación modular
  window.OP = window.OP || {};
  const prev = window.OP.refresh;
  window.OP.refresh = (view) => {
    if (typeof prev === "function") prev(view);
    if (view === "history") render();
  };

  window.addEventListener("op:storeReady", render);

  // Nuevo: refresco global solo si historial visible
  window.addEventListener("op:storeChanged", () => {
    updateChrome();
    const view = document.getElementById("viewHistory");
    if (view && view.style.display !== "none") render();
  });

  document.addEventListener("DOMContentLoaded", () => {
    updateChrome();
    render();
  });
})();

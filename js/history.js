// history.js — Historial multi-sesión (por session_key)
// Requiere: supabaseApi.js con listHistorySessions() y getHistoryDetailByKey()

import { Store } from "./store.js";
import { listHistorySessions, getHistoryDetailByKey } from "./supabaseApi.js";

(function () {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

  let selectedKey = null;

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
        <div class="hint muted" style="margin-bottom:10px;">
          Jugadores: <b>${esc(session?.totalPlayers ?? (A.length + B.length))}</b>
        </div>
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
          <div class="hint muted">Aún no hay resultados guardados para esta sesión.</div>
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
          <div class="hint muted">Historial por sesión (fecha + número).</div>
          <div class="btns">
            <button class="ghost" id="btnHistoryReload">Recargar</button>
          </div>
        </div>
      </div>

      <div class="card" style="margin-top:12px;">
        <h3 style="margin:0 0 10px;">Sesiones</h3>
        <div id="historySessions" style="display:flex; gap:10px; flex-wrap:wrap;"></div>
      </div>

      <div id="historyDetail"></div>
    `;

    const listEl = $("historySessions");
    const detailEl = $("historyDetail");

    let sessions = [];
    try {
      sessions = await listHistorySessions();
    } catch (e) {
      console.error(e);
      listEl.innerHTML = `<div class="hint error">Error cargando sesiones: ${esc(e?.message || e)}</div>`;
      detailEl.innerHTML = "";
      return;
    }

    if (!sessions.length) {
      listEl.innerHTML = `<div class="hint muted">Aún no hay historial. Guarda equipos para crear una sesión.</div>`;
      detailEl.innerHTML = "";
      return;
    }

    if (!selectedKey) selectedKey = sessions[0].session_key;

    listEl.innerHTML = sessions.map(s => {
      const label = `${niceDate(s.session_date)} - ${s.session_seq}`;
      const active = s.session_key === selectedKey;
      return `
        <button class="ghost" data-key="${esc(s.session_key)}" style="${active ? "border-color: rgba(255,255,255,.35);" : ""}">
          ${esc(label)}
        </button>
      `;
    }).join("");

    listEl.querySelectorAll("[data-key]").forEach(btn => {
      btn.addEventListener("click", async () => {
        selectedKey = btn.getAttribute("data-key");
        await render();
      });
    });

    detailEl.innerHTML = `<div class="card" style="margin-top:12px;"><div class="hint muted">Cargando detalle…</div></div>`;

    try {
      const { session, results } = await getHistoryDetailByKey(selectedKey);

      if (!session) {
        detailEl.innerHTML = `
          <div class="card" style="margin-top:12px;">
            <div class="hint muted">No hay datos para esta sesión.</div>
          </div>
        `;
        return;
      }

      const label = `${niceDate(session.session_date)} - ${session.session_seq || 1}`;

      detailEl.innerHTML = `
        <div class="card" style="margin-top:12px;">
          <h2 style="margin:0;">${esc(label)}</h2>
          <div class="hint muted" style="margin-top:6px;">Key: ${esc(session.session_key || selectedKey)}</div>
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
          <div class="hint muted" style="margin-top:8px;">Tip: revisa RLS/policies o columnas session_key/session_seq.</div>
        </div>
      `;
    }

    $("btnHistoryReload")?.addEventListener("click", async () => {
      selectedKey = null;
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

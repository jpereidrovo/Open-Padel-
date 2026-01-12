// history.js — Historial por sesión (fecha - n): Equipos + Turnos + Resumen
// Requiere: supabaseApi.js con listHistorySessions(), getHistoryDetailByKey(), deleteResultsByKey()

import { Store } from "./store.js";
import { listHistorySessions, getHistoryDetailByKey, deleteResultsByKey } from "./supabaseApi.js";

(function () {
  const $ = (id) => document.getElementById(id);
  const esc = (s) =>
    String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");

  let selectedSessionKey = null;

  function niceDate(yyyy_mm_dd) {
    const raw = String(yyyy_mm_dd || "").slice(0, 10);
    const d = new Date(raw + "T00:00:00");
    if (Number.isNaN(d.getTime())) return raw;
    return d.toLocaleDateString("es-EC", { year: "numeric", month: "long", day: "2-digit" });
  }

  function sessionLabel(row) {
    const d = String(row?.session_date || "").slice(0, 10);
    const n = Number(row?.session_seq || 1);
    return `${niceDate(d)} - ${n}`;
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
        ${
          perTurn.length
            ? `
          <div style="margin-top:10px; display:grid; gap:6px;">
            ${perTurn.map(pt => `
              <div class="hint muted">Turno ${esc(pt.turn)}: A ${esc(pt.aPts)} • B ${esc(pt.bPts)}</div>
            `).join("")}
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

    if (!Store.ready && Store.status !== "loading") {
      mount.innerHTML = `<div class="card" style="margin-top:10px;"><div class="hint muted">Inicia sesión para ver Historial.</div></div>`;
      return;
    }
    if (Store.status === "loading") {
      mount.innerHTML = `<div class="card" style="margin-top:10px;"><div class="hint muted">Cargando…</div></div>`;
      return;
    }
    if (Store.status === "error") {
      const msg = Store.error?.message || "Ocurrió un error.";
      mount.innerHTML = `<div class="card" style="margin-top:10px;"><div class="hint error">${esc(msg)}</div></div>`;
      return;
    }

    mount.innerHTML = `
      <div class="card" style="margin-top:10px;">
        <div style="display:flex; justify-content:space-between; gap:10px; flex-wrap:wrap; align-items:center;">
          <div>
            <div class="hint muted">Historial por sesión (fecha - n): Equipos + Turnos + Resultados.</div>
          </div>
          <div class="btns">
            <button class="ghost" id="btnHistoryReload" type="button">Recargar</button>
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

    listEl.innerHTML = `<div class="hint muted">Cargando sesiones…</div>`;
    detailEl.innerHTML = "";

    let rows = [];
    try {
      rows = await listHistorySessions();
    } catch (e) {
      console.error(e);
      listEl.innerHTML = `<div class="hint error">Error cargando sesiones: ${esc(e?.message || e)}</div>`;
      return;
    }

    if (!rows.length) {
      listEl.innerHTML = `<div class="hint muted">Aún no hay historial. Guarda equipos para crear una sesión.</div>`;
      detailEl.innerHTML = "";
      return;
    }

    if (!selectedSessionKey) selectedSessionKey = rows[0].session_key;

    listEl.innerHTML = rows
      .map((r) => {
        const active = r.session_key === selectedSessionKey;
        return `
          <button class="ghost" type="button" data-key="${esc(r.session_key)}"
            style="${active ? "border-color: rgba(255,255,255,.35);" : ""}">
            ${esc(sessionLabel(r))}
          </button>
        `;
      })
      .join("");

    listEl.querySelectorAll("[data-key]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        selectedSessionKey = btn.getAttribute("data-key");
        await render();
      });
    });

    detailEl.innerHTML = `<div class="card" style="margin-top:12px;"><div class="hint muted">Cargando detalle…</div></div>`;

    try {
      const { session, results } = await getHistoryDetailByKey(selectedSessionKey);

      if (!session) {
        detailEl.innerHTML = `
          <div class="card" style="margin-top:12px;">
            <div class="hint muted">No se encontró la sesión.</div>
          </div>
        `;
        return;
      }

      detailEl.innerHTML = `
        <div class="card" style="margin-top:12px;">
          <h2 style="margin:0;">${esc(sessionLabel(session))}</h2>
          <div class="hint muted" style="margin-top:6px;">session_key: <b>${esc(selectedSessionKey)}</b></div>

          <div class="btns" style="margin-top:10px;">
            <button class="ghost" id="btnDeleteResults" type="button">Borrar resultados (solo esta sesión)</button>
          </div>

          <div id="historyStatus" class="hint muted" style="margin-top:10px;"></div>
        </div>

        ${renderTeams(session)}
        ${renderResults(results)}
        ${results ? renderTurns(results) : ""}
      `;

      const statusEl = $("historyStatus");
      const setStatus = (m, cls = "muted") => {
        if (!statusEl) return;
        statusEl.textContent = m || "";
        statusEl.className = "hint " + cls;
      };

      $("btnDeleteResults")?.addEventListener("click", async () => {
        const ok = confirm("Esto borrará SOLO los resultados/turnos de esta sesión. Los equipos quedan intactos. ¿Seguro?");
        if (!ok) return;

        try {
          setStatus("Borrando resultados…", "muted");
          await deleteResultsByKey(selectedSessionKey);
          setStatus("✅ Resultados borrados. (Equipos intactos)", "ok");
          await render();
        } catch (e) {
          console.error(e);
          setStatus(`❌ Error borrando resultados: ${esc(e?.message || e)}`, "error");
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
      selectedSessionKey = null;
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
  document.addEventListener("DOMContentLoaded", render);
})();

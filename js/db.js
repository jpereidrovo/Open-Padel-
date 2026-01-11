// db.js — Base de jugadores (UI + CRUD Supabase + selección para pool)

import { Store } from "./store.js";
import {
  listPlayers,
  upsertPlayer,
  deletePlayer,
  deleteAllPlayers
} from "./supabaseApi.js";

(function () {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

  function getPoolSet() {
    return new Set(Store.state?.pool || []);
  }

  function setPoolFromSelection(selectedIds) {
    Store.setState({ pool: Array.from(selectedIds) });
  }

  function isMultipleOf4(n) { return n % 4 === 0; }

  function countSidesByIds(ids) {
    const idSet = new Set(ids);
    const sel = (Store.players || []).filter(p => idSet.has(p.id));
    const d = sel.filter(p => p.side === "D").length;
    const r = sel.filter(p => p.side === "R").length;
    return { d, r, total: sel.length };
  }

  function poolHintText(ids) {
    const { d, r, total } = countSidesByIds(ids);
    const okMultiple = isMultipleOf4(total);
    const okSides = d === r;

    let msg = `Seleccionados: ${total} (D:${d} • R:${r})`;
    if (total === 0) return msg;

    if (!okMultiple) msg += " • ⚠️ debe ser múltiplo de 4";
    if (!okSides) msg += " • ⚠️ D y R deben ser iguales";

    if (okMultiple && okSides) msg += " • ✅ listo para canchas";
    return msg;
  }

  // Seleccionar “faltantes” hasta completar múltiplo de 4 con D=R
  function autoCompleteSelection(currentIds) {
    const current = new Set(currentIds);
    const selected = (Store.players || []).filter(p => current.has(p.id));

    let d = selected.filter(p => p.side === "D").length;
    let r = selected.filter(p => p.side === "R").length;

    // objetivo: múltiplo de 4, con d=r
    let total = selected.length;
    let targetTotal = total;

    // si total=0, no hacemos nada
    if (total === 0) return current;

    // subimos targetTotal al siguiente múltiplo de 4
    while (targetTotal % 4 !== 0) targetTotal++;

    // si d!=r, también ajustamos targetTotal si es necesario
    // Queremos targetTotal = 2k y d=r=k
    let k = Math.ceil(targetTotal / 2);
    // asegurar que 2k sea múltiplo de 4 -> k múltiplo de 2
    if (k % 2 !== 0) k++;
    targetTotal = 2 * k;

    const needD = k - d;
    const needR = k - r;

    const availableD = (Store.players || []).filter(p => p.side === "D" && !current.has(p.id));
    const availableR = (Store.players || []).filter(p => p.side === "R" && !current.has(p.id));

    for (let i = 0; i < needD && i < availableD.length; i++) current.add(availableD[i].id);
    for (let i = 0; i < needR && i < availableR.length; i++) current.add(availableR[i].id);

    return current;
  }

  async function reloadPlayersUI(setStatus) {
    try {
      setStatus("Cargando jugadores…", "muted");
      const players = await listPlayers();
      Store.setPlayers(players);
      setStatus("✅ Base cargada.", "ok");
    } catch (e) {
      console.error(e);
      setStatus(`❌ Error cargando: ${e?.message || e}`, "error");
    }
  }

  function render() {
    const mount = $("baseMount");
    if (!mount) return;

    if (!Store.ready) {
      mount.innerHTML = `<div class="card" style="margin-top:10px;"><div class="hint muted">Inicia sesión para usar la Base.</div></div>`;
      return;
    }

    const poolSet = getPoolSet();
    const selectedIds = new Set(poolSet);

    mount.innerHTML = `
      <div class="card" style="margin-top:10px;">
        <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:end; justify-content:space-between;">
          <div style="min-width:220px;">
            <label>Buscar</label>
            <input id="searchPlayers" type="text" placeholder="Busca por nombre…" />
          </div>

          <div style="min-width:240px;">
            <div class="hint muted" id="selHint">${esc(poolHintText(selectedIds))}</div>
          </div>

          <div class="btns">
            <button class="ghost" id="btnSelectAll">Seleccionar todos</button>
            <button class="ghost" id="btnSelectFill">Completar faltantes</button>
            <button class="ghost" id="btnDeselectAll">Deseleccionar</button>
          </div>
        </div>
      </div>

      <div class="card" style="margin-top:12px;">
        <h3 style="margin:0 0 10px;">Nuevo jugador</h3>
        <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:end;">
          <div>
            <label>Nombre</label>
            <input id="newName" type="text" placeholder="Ej: Juan" />
          </div>

          <div>
            <label>Lado</label>
            <select id="newSide">
              <option value="D">Derecha (D)</option>
              <option value="R">Revés (R)</option>
            </select>
          </div>

          <div>
            <label>Rating</label>
            <input id="newRating" type="number" min="0" max="10" step="0.5" value="5" />
            <div class="hint muted">0–10 en pasos de 0.5</div>
          </div>

          <div class="btns">
            <button class="primary" id="btnAdd">Agregar</button>
            <button class="ghost" id="btnReload">Recargar</button>
            <button class="ghost" id="btnDeleteAll">Borrar todos</button>
          </div>
        </div>

        <div id="dbStatus" class="hint muted" style="margin-top:10px;"></div>
      </div>

      <div class="card" style="margin-top:12px;">
        <h3 style="margin:0 0 10px;">Jugadores</h3>
        <div id="playersList" style="display:grid; gap:10px;"></div>
      </div>
    `;

    const statusEl = $("dbStatus");
    const setStatus = (msg, cls="muted") => {
      if (!statusEl) return;
      statusEl.textContent = msg || "";
      statusEl.className = "hint " + cls;
    };

    const selHint = $("selHint");
    const refreshHint = () => {
      if (selHint) selHint.textContent = poolHintText(selectedIds);
    };

    // --- List rendering ---
    const playersList = $("playersList");
    const allPlayers = Store.players || [];

    function drawList(filterText = "") {
      const q = filterText.trim().toLowerCase();
      const list = q
        ? allPlayers.filter(p => String(p.name||"").toLowerCase().includes(q))
        : allPlayers;

      if (!playersList) return;

      playersList.innerHTML = list.length ? list.map(p => {
        const checked = selectedIds.has(p.id);
        return `
          <div class="card" style="background: rgba(0,0,0,.12); padding:12px;">
            <div style="display:flex; justify-content:space-between; gap:10px; flex-wrap:wrap; align-items:center;">
              <label style="display:flex; gap:10px; align-items:center; cursor:pointer;">
                <input type="checkbox" data-sel="${esc(p.id)}" ${checked ? "checked" : ""} />
                <b>${esc(p.name)}</b>
                <span class="hint muted">${esc(p.side)} • ${Number(p.rating).toFixed(1)}</span>
              </label>

              <div class="btns">
                <button class="ghost" data-edit="${esc(p.id)}">Editar</button>
                <button class="ghost" data-del="${esc(p.id)}">Borrar</button>
              </div>
            </div>

            <div id="edit_${esc(p.id)}" style="display:none; margin-top:10px;">
              <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:end;">
                <div>
                  <label>Nombre</label>
                  <input type="text" data-edit-name="${esc(p.id)}" value="${esc(p.name)}" />
                </div>
                <div>
                  <label>Lado</label>
                  <select data-edit-side="${esc(p.id)}">
                    <option value="D" ${p.side==="D"?"selected":""}>Derecha (D)</option>
                    <option value="R" ${p.side==="R"?"selected":""}>Revés (R)</option>
                  </select>
                </div>
                <div>
                  <label>Rating</label>
                  <input type="number" min="0" max="10" step="0.5" data-edit-rating="${esc(p.id)}" value="${Number(p.rating).toFixed(1)}" />
                </div>

                <div class="btns">
                  <button class="primary" data-save="${esc(p.id)}">Guardar</button>
                  <button class="ghost" data-cancel="${esc(p.id)}">Cancelar</button>
                </div>
              </div>
            </div>
          </div>
        `;
      }).join("") : `<div class="hint muted">No hay jugadores.</div>`;

      // Selection handlers
      playersList.querySelectorAll("[data-sel]").forEach(cb => {
        cb.addEventListener("change", () => {
          const id = cb.getAttribute("data-sel");
          if (!id) return;

          if (cb.checked) selectedIds.add(id);
          else selectedIds.delete(id);

          // sincroniza pool
          setPoolFromSelection(selectedIds);

          refreshHint();
        });
      });

      // Edit toggle
      playersList.querySelectorAll("[data-edit]").forEach(btn => {
        btn.addEventListener("click", () => {
          const id = btn.getAttribute("data-edit");
          const box = $("edit_" + id);
          if (box) box.style.display = box.style.display === "none" ? "" : "none";
        });
      });

      // Cancel edit
      playersList.querySelectorAll("[data-cancel]").forEach(btn => {
        btn.addEventListener("click", () => {
          const id = btn.getAttribute("data-cancel");
          const box = $("edit_" + id);
          if (box) box.style.display = "none";
        });
      });

      // Save edit
      playersList.querySelectorAll("[data-save]").forEach(btn => {
        btn.addEventListener("click", async () => {
          const id = btn.getAttribute("data-save");
          try {
            const nameEl = playersList.querySelector(`[data-edit-name="${id}"]`);
            const sideEl = playersList.querySelector(`[data-edit-side="${id}"]`);
            const ratingEl = playersList.querySelector(`[data-edit-rating="${id}"]`);

            const name = String(nameEl?.value || "").trim();
            const side = sideEl?.value === "R" ? "R" : "D";
            const rating = parseFloat(ratingEl?.value);

            if (!name) throw new Error("Nombre vacío.");
            if (Number.isNaN(rating)) throw new Error("Rating inválido.");
            if (rating < 0 || rating > 10) throw new Error("Rating fuera de rango 0-10.");

            setStatus("Guardando…", "muted");
            await upsertPlayer({ id, name, side, rating });

            await reloadPlayersUI(setStatus);

            // mantener selección: eliminar ids que ya no existan
            const newSet = new Set(selectedIds);
            const exists = new Set((Store.players||[]).map(p=>p.id));
            for (const x of newSet) if (!exists.has(x)) newSet.delete(x);
            selectedIds.clear(); for (const x of newSet) selectedIds.add(x);
            setPoolFromSelection(selectedIds);

            refreshHint();
            setStatus("✅ Guardado.", "ok");
          } catch (e) {
            console.error(e);
            setStatus(`❌ ${e?.message || e}`, "error");
          }
        });
      });

      // Delete one
      playersList.querySelectorAll("[data-del]").forEach(btn => {
        btn.addEventListener("click", async () => {
          const id = btn.getAttribute("data-del");
          if (!id) return;
          if (!confirm("¿Borrar este jugador?")) return;

          try {
            setStatus("Borrando…", "muted");
            await deletePlayer(id);
            selectedIds.delete(id);
            setPoolFromSelection(selectedIds);
            await reloadPlayersUI(setStatus);
            refreshHint();
            setStatus("✅ Borrado.", "ok");
          } catch (e) {
            console.error(e);
            setStatus(`❌ ${e?.message || e}`, "error");
          }
        });
      });
    }

    drawList("");

    // --- Search ---
    $("searchPlayers")?.addEventListener("input", (e) => {
      drawList(e.target.value || "");
    });

    // --- Add player ---
    $("btnAdd")?.addEventListener("click", async () => {
      try {
        const name = String($("newName")?.value || "").trim();
        const side = $("newSide")?.value === "R" ? "R" : "D";
        const rating = parseFloat($("newRating")?.value);

        if (!name) throw new Error("Escribe un nombre.");
        if (Number.isNaN(rating)) throw new Error("Rating inválido.");
        if (rating < 0 || rating > 10) throw new Error("Rating fuera de rango 0-10.");

        setStatus("Guardando…", "muted");
        await upsertPlayer({ name, side, rating });

        $("newName").value = "";
        $("newRating").value = "5";

        await reloadPlayersUI(setStatus);
        drawList($("searchPlayers")?.value || "");
        setStatus("✅ Jugador agregado.", "ok");
      } catch (e) {
        console.error(e);
        setStatus(`❌ ${e?.message || e}`, "error");
      }
    });

    // --- Reload ---
    $("btnReload")?.addEventListener("click", async () => {
      await reloadPlayersUI(setStatus);
      drawList($("searchPlayers")?.value || "");
      refreshHint();
    });

    // --- Delete all ---
    $("btnDeleteAll")?.addEventListener("click", async () => {
      const msg = "Esto borrará TODOS los jugadores de la base. ¿Seguro?";
      if (!confirm(msg)) return;
      try {
        setStatus("Borrando todos…", "muted");
        await deleteAllPlayers();
        selectedIds.clear();
        setPoolFromSelection(selectedIds);
        await reloadPlayersUI(setStatus);
        drawList("");
        refreshHint();
        setStatus("✅ Base reseteada.", "ok");
      } catch (e) {
        console.error(e);
        setStatus(`❌ ${e?.message || e}`, "error");
      }
    });

    // --- Select all / deselect all / fill ---
    $("btnSelectAll")?.addEventListener("click", () => {
      selectedIds.clear();
      (Store.players || []).forEach(p => selectedIds.add(p.id));
      setPoolFromSelection(selectedIds);
      refreshHint();
      drawList($("searchPlayers")?.value || "");
    });

    $("btnDeselectAll")?.addEventListener("click", () => {
      selectedIds.clear();
      setPoolFromSelection(selectedIds);
      refreshHint();
      drawList($("searchPlayers")?.value || "");
    });

    $("btnSelectFill")?.addEventListener("click", () => {
      const filled = autoCompleteSelection(selectedIds);
      selectedIds.clear();
      for (const x of filled) selectedIds.add(x);
      setPoolFromSelection(selectedIds);
      refreshHint();
      drawList($("searchPlayers")?.value || "");
    });

    // Inicial: status / hint
    setStatus("✅ db.js cargado", "muted");
    refreshHint();
  }

  // Integración con navegación modular
  window.OP = window.OP || {};
  const prev = window.OP.refresh;
  window.OP.refresh = (view) => {
    if (typeof prev === "function") prev(view);
    if (view === "base") render();
  };

  window.addEventListener("op:storeReady", render);
  window.addEventListener("op:playersChanged", render);
  document.addEventListener("DOMContentLoaded", render);
})();

// db.js — Base de jugadores (Supabase) + selección de Pool (sync state)
// - Checkbox "Pool" por jugador
// - Al desmarcar, sale del pool y también de Team A/B
// - Sin localStorage

import { Store } from "./store.js";
import {
  listPlayers,
  upsertPlayer,
  deletePlayer,
  deleteAllPlayers
} from "./supabaseApi.js";

(function () {
  const $ = (id) => document.getElementById(id);

  function escapeHtml(str) {
    return String(str || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function normalizeName(name) {
    return String(name || "").trim().replace(/\s+/g, " ");
  }

  function setBadgeCount() {
    const badge = $("tagBase");
    if (badge) badge.textContent = String(Store.players?.length || 0);
  }

  function getPoolSet() {
    const pool = Store.state?.pool || [];
    return new Set(pool);
  }

  function sortPlayers(players) {
    return (players || []).slice().sort((a, b) => {
      const an = (a.name || "").toLowerCase();
      const bn = (b.name || "").toLowerCase();
      if (an < bn) return -1;
      if (an > bn) return 1;
      // secundario: lado, luego rating desc
      const as = a.side || "";
      const bs = b.side || "";
      if (as < bs) return -1;
      if (as > bs) return 1;
      return (b.rating || 0) - (a.rating || 0);
    });
  }

  function removePlayerEverywhere(playerId) {
    const pool = (Store.state?.pool || []).filter(id => id !== playerId);
    const teamA = (Store.state?.team_a || []).filter(p => p.id !== playerId);
    const teamB = (Store.state?.team_b || []).filter(p => p.id !== playerId);

    Store.setState({
      pool,
      team_a: teamA,
      team_b: teamB
    });
  }

  function togglePlayerInPool(playerId, checked) {
    const pool = (Store.state?.pool || []).slice();
    const set = new Set(pool);

    if (checked) {
      set.add(playerId);
    } else {
      // al desmarcar, sale de pool y equipos
      removePlayerEverywhere(playerId);
      return;
    }

    Store.setState({ pool: Array.from(set) });
  }

  function render() {
    const mount = $("baseMount");
    if (!mount) return;

    if (!Store.ready) {
      mount.innerHTML = `
        <div class="card" style="margin-top:10px;">
          <div class="hint muted">Inicia sesión para cargar la base de jugadores.</div>
        </div>
      `;
      setBadgeCount();
      return;
    }

    const players = sortPlayers(Store.players || []);
    const poolSet = getPoolSet();

    mount.innerHTML = `
      <div class="card" style="margin-top:10px;">
        <div style="display:flex; justify-content:space-between; gap:10px; align-items:center; flex-wrap:wrap;">
          <div>
            <div class="hint muted">Jugadores guardados en la nube (Supabase).</div>
            <div class="hint muted">Total: <b>${players.length}</b></div>
            <div class="hint muted">En pool: <b>${poolSet.size}</b></div>
          </div>
          <div class="btns">
            <button class="ghost" id="reloadPlayers">Recargar</button>
            <button class="ghost" id="clearPoolBtn">Vaciar pool</button>
            <button class="ghost" id="deleteAllPlayersBtn">Borrar todos</button>
          </div>
        </div>
      </div>

      <div class="card" style="margin-top:12px;">
        <h3 style="margin:0 0 10px;">Agregar jugador</h3>

        <div style="display:grid; grid-template-columns: 1fr 140px 140px auto; gap:10px; align-items:end;">
          <div>
            <label>Nombre</label>
            <input id="newName" type="text" placeholder="Ej: Juan Pérez" />
          </div>
          <div>
            <label>Lado</label>
            <select id="newSide">
              <option value="D">Derecha (D)</option>
              <option value="R">Revés (R)</option>
            </select>
          </div>
          <div>
            <label>Nivel</label>
            <input id="newRating" type="number" min="1" max="10" value="5" />
          </div>
          <div class="btns">
            <button class="primary" id="addPlayerBtn">Agregar</button>
          </div>
        </div>

        <div id="baseStatus" class="hint" style="margin-top:10px;"></div>
      </div>

      <div class="card" style="margin-top:12px;">
        <h3 style="margin:0 0 10px;">Lista</h3>
        <div class="hint muted" style="margin-bottom:10px;">
          Marca <b>Pool</b> para seleccionar jugadores que van a jugar hoy.
        </div>
        <div id="playersList" style="display:grid; gap:10px;"></div>
      </div>
    `;

    const statusEl = $("baseStatus");
    const setStatus = (msg, kind) => {
      if (!statusEl) return;
      statusEl.textContent = msg || "";
      statusEl.className = "hint " + (kind || "");
    };

    const listEl = $("playersList");
    if (!listEl) return;

    if (!players.length) {
      listEl.innerHTML = `<div class="hint muted">No hay jugadores aún.</div>`;
    } else {
      listEl.innerHTML = players.map(p => {
        const inPool = poolSet.has(p.id);
        return `
          <div class="card" style="background: rgba(0,0,0,.18); padding:12px;">
            <div style="display:grid; grid-template-columns: 90px 1fr 120px 120px auto; gap:10px; align-items:center;">
              <div>
                <label style="margin:0;">Pool</label>
                <input type="checkbox" data-pool="${p.id}" ${inPool ? "checked" : ""} />
              </div>

              <div>
                <label style="margin:0;">Nombre</label>
                <input data-edit-name="${p.id}" type="text" value="${escapeHtml(p.name)}" />
              </div>

              <div>
                <label style="margin:0;">Lado</label>
                <select data-edit-side="${p.id}">
                  <option value="D" ${p.side === "D" ? "selected" : ""}>D</option>
                  <option value="R" ${p.side === "R" ? "selected" : ""}>R</option>
                </select>
              </div>

              <div>
                <label style="margin:0;">Nivel</label>
                <input data-edit-rating="${p.id}" type="number" min="1" max="10" value="${p.rating}" />
              </div>

              <div class="btns" style="justify-content:end;">
                <button class="ghost" data-save="${p.id}">Guardar</button>
                <button class="ghost" data-del="${p.id}">Borrar</button>
              </div>
            </div>
          </div>
        `;
      }).join("");
    }

    // -------- acciones --------

    $("reloadPlayers")?.addEventListener("click", async () => {
      try {
        setStatus("Recargando…", "muted");
        const fresh = await listPlayers();
        Store.setPlayers(fresh);
        setBadgeCount();
        setStatus("✅ Base recargada.", "ok");
        render();
      } catch (e) {
        console.error(e);
        setStatus("❌ Error al recargar.", "error");
      }
    });

    $("clearPoolBtn")?.addEventListener("click", () => {
      // vaciar pool y equipos
      Store.setState({ pool: [], team_a: [], team_b: [] });
      setStatus("✅ Pool vaciado.", "ok");
      render();
    });

    $("addPlayerBtn")?.addEventListener("click", async () => {
      const name = normalizeName($("newName")?.value);
      const side = $("newSide")?.value || "D";
      const rating = Number($("newRating")?.value || 5);

      if (!name) return setStatus("Escribe un nombre.", "warn");
      if (!["D", "R"].includes(side)) return setStatus("Lado inválido.", "warn");
      if (!(rating >= 1 && rating <= 10)) return setStatus("Nivel debe ser 1–10.", "warn");

      try {
        setStatus("Guardando…", "muted");
        await upsertPlayer({ name, side, rating });
        const fresh = await listPlayers();
        Store.setPlayers(fresh);
        setBadgeCount();
        $("newName").value = "";
        setStatus("✅ Jugador agregado.", "ok");
        render();
      } catch (e) {
        console.error(e);
        setStatus("❌ Error al guardar.", "error");
      }
    });

    // Pool checkbox handlers
    mount.querySelectorAll("[data-pool]").forEach(chk => {
      chk.addEventListener("change", () => {
        const id = chk.getAttribute("data-pool");
        togglePlayerInPool(id, chk.checked);
      });
    });

    // Guardar / Borrar individual
    mount.querySelectorAll("[data-save]").forEach(btn => {
      btn.addEventListener("click", async () => {
        const id = btn.getAttribute("data-save");
        const name = normalizeName(mount.querySelector(`[data-edit-name="${id}"]`)?.value);
        const side = mount.querySelector(`[data-edit-side="${id}"]`)?.value || "D";
        const rating = Number(mount.querySelector(`[data-edit-rating="${id}"]`)?.value || 5);

        if (!id) return;
        if (!name) return setStatus("Nombre vacío.", "warn");
        if (!["D", "R"].includes(side)) return setStatus("Lado inválido.", "warn");
        if (!(rating >= 1 && rating <= 10)) return setStatus("Nivel debe ser 1–10.", "warn");

        try {
          setStatus("Guardando cambios…", "muted");
          await upsertPlayer({ id, name, side, rating });
          const fresh = await listPlayers();
          Store.setPlayers(fresh);
          setBadgeCount();
          setStatus("✅ Cambios guardados.", "ok");
          render();
        } catch (e) {
          console.error(e);
          setStatus("❌ Error al guardar cambios.", "error");
        }
      });
    });

    mount.querySelectorAll("[data-del]").forEach(btn => {
      btn.addEventListener("click", async () => {
        const id = btn.getAttribute("data-del");
        if (!id) return;

        if (!confirm("¿Borrar este jugador?")) return;

        try {
          setStatus("Borrando…", "muted");
          await deletePlayer(id);

          // si estaba en pool/equipos, lo sacamos también
          removePlayerEverywhere(id);

          const fresh = await listPlayers();
          Store.setPlayers(fresh);
          setBadgeCount();
          setStatus("✅ Jugador borrado.", "ok");
          render();
        } catch (e) {
          console.error(e);
          setStatus("❌ Error al borrar.", "error");
        }
      });
    });

    // Borrar todos
    $("deleteAllPlayersBtn")?.addEventListener("click", async () => {
      if (!confirm("¿Seguro que quieres borrar TODOS los jugadores?")) return;
      try {
        setStatus("Borrando todo…", "muted");
        await deleteAllPlayers();

        // limpiar pool y equipos
        Store.setState({ pool: [], team_a: [], team_b: [] });

        const fresh = await listPlayers();
        Store.setPlayers(fresh);
        setBadgeCount();
        setStatus("✅ Base reseteada.", "ok");
        render();
      } catch (e) {
        console.error(e);
        setStatus("❌ Error al borrar todos.", "error");
      }
    });

    setBadgeCount();
  }

  // Hook de refresco al navegar a Base
  window.OP = window.OP || {};
  const prevRefresh = window.OP.refresh;
  window.OP.refresh = (view) => {
    if (typeof prevRefresh === "function") prevRefresh(view);
    if (view === "base") render();
  };

  window.addEventListener("op:storeReady", render);
  window.addEventListener("op:playersChanged", () => {
    setBadgeCount();
    render();
  });
  window.addEventListener("op:stateChanged", render);
  document.addEventListener("DOMContentLoaded", render);
})();

import { Store } from "./store.js";
import { listPlayers, upsertPlayer, deletePlayer, deleteAllPlayers } from "./supabaseApi.js";

(function () {
  const $ = (id) => document.getElementById(id);

  let q = "";

  function esc(s){return String(s||"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");}
  function normName(s){return String(s||"").trim().replace(/\s+/g," ");}

  function setBadge(){
    const b = $("tagBase");
    if (b) b.textContent = String(Store.players?.length || 0);
  }

  function poolSet(){ return new Set(Store.state?.pool || []); }

  function removeEverywhere(pid){
    const pool = (Store.state?.pool || []).filter(id => id !== pid);
    const A = (Store.state?.team_a || []).filter(p => p.id !== pid);
    const B = (Store.state?.team_b || []).filter(p => p.id !== pid);
    Store.setState({ pool, team_a: A, team_b: B });
  }

  function setPool(ids){
    // al cambiar pool, limpia equipos si hay jugadores fuera del pool
    const set = new Set(ids);
    const A = (Store.state?.team_a || []).filter(p => set.has(p.id));
    const B = (Store.state?.team_b || []).filter(p => set.has(p.id));
    Store.setState({ pool: Array.from(set), team_a: A, team_b: B });
  }

  function filtered(players){
    const t = q.trim().toLowerCase();
    if (!t) return players;
    return players.filter(p =>
      (p.name||"").toLowerCase().includes(t) ||
      (p.side||"").toLowerCase().includes(t) ||
      String(p.rating||"").includes(t)
    );
  }

  function render(){
    const mount = $("baseMount");
    if (!mount) return;

    if (!Store.ready){
      mount.innerHTML = `<div class="card" style="margin-top:10px;"><div class="hint muted">Inicia sesión para cargar la base.</div></div>`;
      setBadge();
      return;
    }

    const players = (Store.players||[]).slice().sort((a,b)=>(a.name||"").localeCompare(b.name||""));
    const pool = poolSet();
    const shown = filtered(players);

    mount.innerHTML = `
      <div class="card" style="margin-top:10px;">
        <div style="display:flex; gap:10px; justify-content:space-between; flex-wrap:wrap; align-items:center;">
          <div>
            <div class="hint muted">Total: <b>${players.length}</b> • En pool: <b>${pool.size}</b></div>
          </div>
          <div class="btns">
            <button class="ghost" id="reloadPlayers">Recargar</button>
            <button class="ghost" id="selectAll">Seleccionar todos</button>
            <button class="ghost" id="selectMissing">Seleccionar faltantes</button>
            <button class="ghost" id="deselectAll">Deseleccionar todos</button>
            <button class="ghost" id="deleteAll">Borrar todos</button>
          </div>
        </div>
      </div>

      <div class="card" style="margin-top:12px;">
        <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:end;">
          <div style="flex:1; min-width:240px;">
            <label>Buscar</label>
            <input id="searchBox" type="text" placeholder="Nombre / D / R / nivel…" value="${esc(q)}"/>
          </div>
        </div>
        <div id="baseStatus" class="hint" style="margin-top:10px;"></div>
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
            <button class="primary" id="addPlayer">Agregar</button>
          </div>
        </div>
      </div>

      <div class="card" style="margin-top:12px;">
        <h3 style="margin:0 0 10px;">Lista (${shown.length})</h3>
        <div class="hint muted" style="margin-bottom:10px;">Marca “Pool” para seleccionar quién juega hoy.</div>
        <div id="list" style="display:grid; gap:10px;"></div>
      </div>
    `;

    const statusEl = $("baseStatus");
    const setStatus = (m,k="") => { if(!statusEl) return; statusEl.textContent=m||""; statusEl.className="hint "+k; };

    $("searchBox")?.addEventListener("input", (e)=>{ q = e.target.value; render(); });

    // lista
    const listEl = $("list");
    if (listEl){
      if (!shown.length) listEl.innerHTML = `<div class="hint muted">Sin resultados.</div>`;
      else listEl.innerHTML = shown.map(p=>{
        const inPool = pool.has(p.id);
        return `
          <div class="card" style="background: rgba(0,0,0,.18); padding:12px;">
            <div style="display:grid; grid-template-columns: 90px 1fr 120px 120px auto; gap:10px; align-items:center;">
              <div>
                <label style="margin:0;">Pool</label>
                <input type="checkbox" data-pool="${p.id}" ${inPool?"checked":""}/>
              </div>
              <div>
                <label style="margin:0;">Nombre</label>
                <input data-name="${p.id}" type="text" value="${esc(p.name)}"/>
              </div>
              <div>
                <label style="margin:0;">Lado</label>
                <select data-side="${p.id}">
                  <option value="D" ${p.side==="D"?"selected":""}>D</option>
                  <option value="R" ${p.side==="R"?"selected":""}>R</option>
                </select>
              </div>
              <div>
                <label style="margin:0;">Nivel</label>
                <input data-rating="${p.id}" type="number" min="1" max="10" value="${p.rating}"/>
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

    // handlers pool
    mount.querySelectorAll("[data-pool]").forEach(chk=>{
      chk.addEventListener("change", ()=>{
        const id = chk.getAttribute("data-pool");
        if (chk.checked){
          const ids = new Set(Store.state?.pool || []);
          ids.add(id);
          setPool(Array.from(ids));
        } else {
          removeEverywhere(id);
        }
      });
    });

    // acciones top
    $("reloadPlayers")?.addEventListener("click", async ()=>{
      try{
        setStatus("Recargando…","muted");
        Store.setPlayers(await listPlayers());
        setStatus("✅ Recargado.","ok");
        render();
      }catch(e){ console.error(e); setStatus("❌ Error al recargar.","error");}
    });

    $("selectAll")?.addEventListener("click", ()=>{
      setPool(players.map(p=>p.id));
      setStatus("✅ Seleccionados todos.","ok");
      render();
    });

    $("selectMissing")?.addEventListener("click", ()=>{
      const ids = new Set(Store.state?.pool || []);
      players.forEach(p=>ids.add(p.id));
      setPool(Array.from(ids));
      setStatus("✅ Seleccionados faltantes.","ok");
      render();
    });

    $("deselectAll")?.addEventListener("click", ()=>{
      Store.setState({ pool: [], team_a: [], team_b: [] });
      setStatus("✅ Pool vacío.","ok");
      render();
    });

    $("deleteAll")?.addEventListener("click", async ()=>{
      if (!confirm("¿Borrar TODOS los jugadores?")) return;
      try{
        setStatus("Borrando…","muted");
        await deleteAllPlayers();
        Store.setPlayers(await listPlayers());
        Store.setState({ pool: [], team_a: [], team_b: [] });
        setStatus("✅ Base reseteada.","ok");
        render();
      }catch(e){ console.error(e); setStatus("❌ Error al borrar.","error");}
    });

    // add player
    $("addPlayer")?.addEventListener("click", async ()=>{
      const name = normName($("newName")?.value);
      const side = $("newSide")?.value || "D";
      const rating = Number($("newRating")?.value || 5);
      if (!name) return setStatus("Escribe un nombre.","warn");
      if (!(rating>=1 && rating<=10)) return setStatus("Nivel 1–10.","warn");
      try{
        setStatus("Guardando…","muted");
        await upsertPlayer({ name, side, rating });
        Store.setPlayers(await listPlayers());
        $("newName").value="";
        setStatus("✅ Jugador agregado.","ok");
        render();
      }catch(e){ console.error(e); setStatus("❌ Error al guardar.","error");}
    });

    // save / delete
    mount.querySelectorAll("[data-save]").forEach(btn=>{
      btn.addEventListener("click", async ()=>{
        const id = btn.getAttribute("data-save");
        const name = normName(mount.querySelector(`[data-name="${id}"]`)?.value);
        const side = mount.querySelector(`[data-side="${id}"]`)?.value || "D";
        const rating = Number(mount.querySelector(`[data-rating="${id}"]`)?.value || 5);
        if (!name) return setStatus("Nombre vacío.","warn");
        if (!(rating>=1 && rating<=10)) return setStatus("Nivel 1–10.","warn");
        try{
          setStatus("Guardando…","muted");
          await upsertPlayer({ id, name, side, rating });
          Store.setPlayers(await listPlayers());
          setStatus("✅ Cambios guardados.","ok");
          render();
        }catch(e){ console.error(e); setStatus("❌ Error al guardar.","error");}
      });
    });

    mount.querySelectorAll("[data-del]").forEach(btn=>{
      btn.addEventListener("click", async ()=>{
        const id = btn.getAttribute("data-del");
        if (!confirm("¿Borrar jugador?")) return;
        try{
          setStatus("Borrando…","muted");
          await deletePlayer(id);
          removeEverywhere(id);
          Store.setPlayers(await listPlayers());
          setStatus("✅ Borrado.","ok");
          render();
        }catch(e){ console.error(e); setStatus("❌ Error al borrar.","error");}
      });
    });

    setBadge();
  }

  window.OP = window.OP || {};
  const prev = window.OP.refresh;
  window.OP.refresh = (view)=>{ if (typeof prev==="function") prev(view); if (view==="base") render(); };

  window.addEventListener("op:storeReady", render);
  window.addEventListener("op:playersChanged", render);
  window.addEventListener("op:stateChanged", render);
  document.addEventListener("DOMContentLoaded", render);
})();

// db.js — Base de jugadores + Pool con N automático (múltiplos de 4)
// Dispara evento op:poolChanged para sincronizar Equipos/Turnos en la misma pestaña

(function () {
  const KEY_PLAYERS = "op_players_v1";
  const KEY_POOL = "op_pool_v1";
  const KEY_TOTAL = "op_totalPlayers_v1";
  const KEY_POOL_VER = "op_pool_ver_v1";

  const $ = (id) => document.getElementById(id);
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const norm = (s) => String(s ?? "").trim().replace(/\s+/g, " ");
  const uid = () => "p_" + Math.random().toString(16).slice(2) + Date.now().toString(16);
  const ALLOWED_TOTALS = [4, 8, 12, 16, 20, 24];

  function loadJSON(key, fallback) {
    try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; }
    catch { return fallback; }
  }
  function saveJSON(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} }

  function getTotalPlayers() {
    const v = Number(localStorage.getItem(KEY_TOTAL) || 16);
    return ALLOWED_TOTALS.includes(v) ? v : 16;
  }
  function setTotalPlayers(v) {
    const n = Number(v);
    if (!ALLOWED_TOTALS.includes(n)) return;
    localStorage.setItem(KEY_TOTAL, String(n));
  }
  function deriveNFromPoolCount(poolCount) {
    if (poolCount <= 0) return getTotalPlayers();
    const n = Math.max(4, Math.floor(poolCount / 4) * 4);
    return ALLOWED_TOTALS.includes(n) ? n : 24;
  }

  function notifyPoolChanged() {
    try { localStorage.setItem(KEY_POOL_VER, String(Date.now())); } catch {}
    try { window.dispatchEvent(new CustomEvent("op:poolChanged")); } catch {}
  }

  function perSide(n) { return n / 2; }

  function escapeHtml(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  let players = loadJSON(KEY_PLAYERS, []);
  let poolIds = new Set(loadJSON(KEY_POOL, []));

  // Demo si vacío
  if (!Array.isArray(players) || players.length === 0) {
    players = [
      { id: uid(), name: "Juan", side: "D", rating: 7 },
      { id: uid(), name: "Pedro", side: "R", rating: 7 },
      { id: uid(), name: "Luis", side: "D", rating: 6 },
      { id: uid(), name: "Carlos", side: "R", rating: 6 },
      { id: uid(), name: "Andrés", side: "D", rating: 5 },
      { id: uid(), name: "Mateo", side: "R", rating: 5 },
    ];
    saveJSON(KEY_PLAYERS, players);
  }

  function ensurePoolValidity() {
    const validIds = new Set(players.map(p => p.id));
    poolIds = new Set([...poolIds].filter(id => validIds.has(id)));
    if (poolIds.size > 24) poolIds = new Set([...poolIds].slice(0, 24));
    saveJSON(KEY_POOL, [...poolIds]);
  }

  function countPoolSides() {
    let d = 0, r = 0;
    for (const id of poolIds) {
      const p = players.find(x => x.id === id);
      if (!p) continue;
      if (p.side === "D") d++;
      if (p.side === "R") r++;
    }
    return { d, r };
  }

  function setStatus(el, msg, kind) {
    el.textContent = msg;
    el.className = "hint " + (kind || "");
  }

  function updateBadges() {
    const tagBase = $("tagBase");
    const tagTeams = $("tagTeams");
    const pillInfo = $("pillInfo");

    const n = getTotalPlayers();
    const courts = n / 4;

    if (tagBase) tagBase.textContent = String(players.length);
    if (tagTeams) tagTeams.textContent = `${poolIds.size}/${n}`;
    if (pillInfo) pillInfo.innerHTML = `N: <b>${n}</b> • Canchas: <b>${courts}</b>`;
  }

  function persistPoolAndAutoN() {
    saveJSON(KEY_POOL, [...poolIds]);
    const newN = deriveNFromPoolCount(poolIds.size);
    if (newN !== getTotalPlayers()) setTotalPlayers(newN);
    notifyPoolChanged();
    updateBadges();
  }

  function renderBase() {
    const mount = $("baseMount");
    if (!mount) return;

    ensurePoolValidity();

    const n = getTotalPlayers();
    const needSide = perSide(n);
    const { d, r } = countPoolSides();

    mount.innerHTML = `
      <div class="card" style="margin-top:10px;">
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px;">
          <div>
            <label>N automático</label>
            <div class="pill">N actual: <b>${n}</b> (múltiplos de 4)</div>
            <div class="hint muted" style="margin-top:6px;">Objetivo pool: D=<b>${needSide}</b> y R=<b>${needSide}</b></div>
          </div>
          <div>
            <label>Pool</label>
            <div class="pill">Seleccionados: <b>${poolIds.size}</b> • D:<b>${d}</b> R:<b>${r}</b></div>
            <div id="opPoolHint" class="hint" style="margin-top:6px;"></div>
          </div>
        </div>

        <div style="height:10px"></div>

        <div style="display:grid; grid-template-columns: 1.2fr .8fr .8fr auto; gap:10px; align-items:end;">
          <div><label>Nombre</label><input id="opName" placeholder="Ej: Santi" /></div>
          <div>
            <label>Lado</label>
            <select id="opSide">
              <option value="D">Derecha (D)</option>
              <option value="R">Revés (R)</option>
            </select>
          </div>
          <div><label>Nivel (1–10)</label><input id="opRating" type="number" min="1" max="10" value="5" /></div>
          <div><button class="primary" id="opAdd">Agregar</button></div>
        </div>

        <div class="btns" style="margin-top:10px;">
          <button class="ghost" id="opClearPool">Limpiar pool</button>
        </div>

        <div id="opStatus" class="hint" style="margin-top:8px;"></div>
      </div>

      <div class="card" style="margin-top:14px;">
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px;">
          <div><label>Buscar</label><input id="opSearch" placeholder="Filtrar por nombre..." /></div>
          <div>
            <label>Ordenar</label>
            <select id="opSort">
              <option value="name">Nombre</option>
              <option value="ratingDesc">Nivel (mayor→menor)</option>
              <option value="ratingAsc">Nivel (menor→mayor)</option>
              <option value="side">Lado (D/R)</option>
            </select>
          </div>
        </div>

        <div id="opList" style="margin-top:12px; display:grid; gap:8px;"></div>
        <div class="hint muted" style="margin-top:10px;">
          Selecciona con checkbox. Cambios sincronizan Equipos/Turnos al instante.
        </div>
      </div>
    `;

    const poolHint = $("opPoolHint");
    const status = $("opStatus");

    if (poolIds.size < n) setStatus(poolHint, `Faltan ${n - poolIds.size} para completar N=${n}.`, "warn");
    else if (poolIds.size === n && d === needSide && r === needSide) setStatus(poolHint, "✅ Pool completo y balanceado.", "ok");
    else if (poolIds.size === n) setStatus(poolHint, `❌ Pool completo pero mix incorrecto. D=${d} R=${r}`, "error");
    else setStatus(poolHint, "Ajusta selección: N se adapta a múltiplos de 4.", "warn");

    $("opAdd").addEventListener("click", () => {
      const name = norm($("opName").value);
      const side = $("opSide").value === "R" ? "R" : "D";
      const rating = clamp(Number($("opRating").value || 5), 1, 10);

      if (!name) return setStatus(status, "Escribe un nombre.", "error");
      const exists = players.some(p => norm(p.name).toLowerCase() === name.toLowerCase());
      if (exists) return setStatus(status, "Ese nombre ya existe.", "error");

      players.push({ id: uid(), name, side, rating });
      saveJSON(KEY_PLAYERS, players);
      $("opName").value = "";
      $("opRating").value = "5";
      setStatus(status, "✅ Jugador agregado.", "ok");
      renderBase();
      updateBadges();
    });

    $("opClearPool").addEventListener("click", () => {
      poolIds.clear();
      persistPoolAndAutoN();
      setStatus(status, "Pool limpiado.", "ok");
      renderBase();
    });

    const listEl = $("opList");
    const searchEl = $("opSearch");
    const sortEl = $("opSort");

    function renderList() {
      const q = norm(searchEl.value).toLowerCase();
      const sort = sortEl.value;

      let items = players.filter(p => norm(p.name).toLowerCase().includes(q));
      if (sort === "name") items.sort((a,b)=>norm(a.name).localeCompare(norm(b.name)));
      if (sort === "ratingDesc") items.sort((a,b)=>b.rating-a.rating || norm(a.name).localeCompare(norm(b.name)));
      if (sort === "ratingAsc") items.sort((a,b)=>a.rating-b.rating || norm(a.name).localeCompare(norm(b.name)));
      if (sort === "side") items.sort((a,b)=>a.side.localeCompare(b.side) || norm(a.name).localeCompare(norm(b.name)));

      const disableMore = (poolIds.size >= 24);

      listEl.innerHTML = items.map(p => {
        const checked = poolIds.has(p.id);
        const disabled = (!checked && disableMore);
        return `
          <div class="card" style="padding:10px 12px; background: rgba(0,0,0,.18);">
            <div style="display:grid; grid-template-columns: auto 1fr .6fr .6fr auto; gap:10px; align-items:center;">
              <input type="checkbox" data-act="pick" data-id="${p.id}" ${checked ? "checked":""} ${disabled ? "disabled":""} />
              <input data-act="name" data-id="${p.id}" value="${escapeHtml(p.name)}" style="font-weight:800;" />
              <select data-act="side" data-id="${p.id}">
                <option value="D" ${p.side==="D"?"selected":""}>D</option>
                <option value="R" ${p.side==="R"?"selected":""}>R</option>
              </select>
              <input data-act="rating" data-id="${p.id}" type="number" min="1" max="10" value="${p.rating}" />
              <button class="ghost small" data-act="del" data-id="${p.id}">Borrar</button>
            </div>
          </div>
        `;
      }).join("");

      listEl.querySelectorAll("[data-act='pick']").forEach(cb => {
        cb.addEventListener("change", () => {
          const id = cb.getAttribute("data-id");
          if (!id) return;
          if (cb.checked) poolIds.add(id);
          else poolIds.delete(id);
          persistPoolAndAutoN();
          renderBase();
        });
      });

      listEl.querySelectorAll("[data-act='name']").forEach(inp => {
        inp.addEventListener("blur", () => {
          const id = inp.getAttribute("data-id");
          const p = players.find(x => x.id === id);
          if (!p) return;
          const newName = norm(inp.value);
          if (!newName) { inp.value = p.name; return; }
          const exists = players.some(x => x.id !== id && norm(x.name).toLowerCase() === newName.toLowerCase());
          if (exists) { inp.value = p.name; return; }
          p.name = newName;
          saveJSON(KEY_PLAYERS, players);
          updateBadges();
          notifyPoolChanged();
        });
      });

      listEl.querySelectorAll("[data-act='side']").forEach(sel => {
        sel.addEventListener("change", () => {
          const id = sel.getAttribute("data-id");
          const p = players.find(x => x.id === id);
          if (!p) return;
          p.side = (sel.value === "R") ? "R" : "D";
          saveJSON(KEY_PLAYERS, players);
          if (poolIds.has(id)) persistPoolAndAutoN();
          renderBase();
        });
      });

      listEl.querySelectorAll("[data-act='rating']").forEach(inp => {
        inp.addEventListener("change", () => {
          const id = inp.getAttribute("data-id");
          const p = players.find(x => x.id === id);
          if (!p) return;
          p.rating = clamp(Number(inp.value || 5), 1, 10);
          inp.value = String(p.rating);
          saveJSON(KEY_PLAYERS, players);
          notifyPoolChanged();
        });
      });

      listEl.querySelectorAll("[data-act='del']").forEach(btn => {
        btn.addEventListener("click", () => {
          const id = btn.getAttribute("data-id");
          if (!id) return;
          players = players.filter(p => p.id !== id);
          poolIds.delete(id);
          saveJSON(KEY_PLAYERS, players);
          persistPoolAndAutoN();
          renderBase();
        });
      });
    }

    searchEl.addEventListener("input", renderList);
    sortEl.addEventListener("change", renderList);
    renderList();

    updateBadges();
  }

  document.addEventListener("DOMContentLoaded", () => {
    renderBase();
    updateBadges();
    console.log("✅ db.js cargado");
  });
})();

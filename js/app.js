// app.js — bootstrap + auth + navegación (robusto)
import { supabase } from "./supabaseClient.js";
import { Store } from "./store.js";
import { listPlayers, signInWithGoogle, signOut, getSessionUser } from "./supabaseApi.js";

(function () {
  const $ = (id) => document.getElementById(id);

  function show(el, yes) {
    if (!el) return;
    el.style.display = yes ? "" : "none";
  }

  function setText(id, text) {
    const el = $(id);
    if (el) el.textContent = text;
  }

  function setAuthStatus(msg) {
    const pill = $("authStatus");
    if (pill) pill.textContent = msg;
  }

  function updatePillInfo() {
    const pill = $("pillInfo");
    if (!pill) return;

    const pool = Store.state?.pool || [];
    const n = pool.length || 0;
    const courts = n ? Math.floor(n / 4) : 0;
    pill.textContent = `N: ${n} • Canchas: ${courts}`;
  }

  function setActiveNav(activeId) {
    ["navBase", "navTeams", "navTurns", "navHistory"].forEach((id) => {
      const btn = $(id);
      if (!btn) return;
      btn.classList.toggle("active", id === activeId);
    });
  }

  function showView(which) {
    const views = {
      base: $("viewBase"),
      teams: $("viewTeams"),
      turns: $("viewTurns"),
      history: $("viewHistory"),
    };

    Object.entries(views).forEach(([k, el]) => show(el, k === which));

    setActiveNav(
      which === "base" ? "navBase" :
      which === "teams" ? "navTeams" :
      which === "turns" ? "navTurns" : "navHistory"
    );

    // avisa a los módulos
    window.OP = window.OP || {};
    if (typeof window.OP.refresh === "function") window.OP.refresh(which);
  }

  async function initAuthUI() {
    const loginBtn = $("loginGoogle");
    const logoutBtn = $("logoutBtn");
    const authCard = $("authCard"); // si existe
    const authStatus = $("authStatusText");

    // Si no existen, no rompe
    const setAuthCardText = (t) => { if (authStatus) authStatus.textContent = t; };

    // Estado inicial: que NO se quede clavado
    if (loginBtn) loginBtn.disabled = true;
    if (logoutBtn) logoutBtn.disabled = true;
    setAuthCardText("Cargando sesión…");
    setAuthStatus("Cargando…");

    // handlers
    if (loginBtn) {
      loginBtn.addEventListener("click", async () => {
        try {
          loginBtn.disabled = true;
          setAuthCardText("Abriendo Google…");
          await signInWithGoogle();
        } catch (e) {
          console.error("❌ signInWithGoogle", e);
          setAuthCardText("Error al iniciar sesión (mira consola).");
          loginBtn.disabled = false;
        }
      });
    }

    if (logoutBtn) {
      logoutBtn.addEventListener("click", async () => {
        try {
          await signOut();
          // al cerrar sesión, recargamos para limpiar estado
          location.reload();
        } catch (e) {
          console.error("❌ signOut", e);
        }
      });
    }

    // escucha cambios de auth
    supabase.auth.onAuthStateChange(async (_event, _session) => {
      await refreshSessionUI();
    });

    await refreshSessionUI();

    async function refreshSessionUI() {
      try {
        // ✅ chequeo sesión (no se queda colgado)
        const user = await getSessionUser();

        if (!user) {
          // No hay sesión
          setAuthCardText("Inicia sesión para usar la app.");
          setAuthStatus("No conectado");
          if (loginBtn) loginBtn.disabled = false;
          if (logoutBtn) logoutBtn.disabled = true;

          // no marcamos ready (módulos muestran “inicia sesión”)
          Store.ready = false;

          return;
        }

        // Hay sesión
        setAuthCardText(`✅ Conectado: ${user.email || user.id}`);
        setAuthStatus("Conectado ✅");
        if (loginBtn) loginBtn.disabled = true;
        if (logoutBtn) logoutBtn.disabled = false;

        // Cargar players
        const players = await listPlayers();
        Store.setPlayers(players);

        // Set ready
        Store.setReady();

        // Actualiza pill
        updatePillInfo();
      } catch (e) {
        console.error("❌ refreshSessionUI", e);

        // ✅ importantísimo: salir del “Cargando…”
        setAuthCardText(`Error de sesión: ${e?.message || e}`);
        setAuthStatus("Error sesión ❌");
        if (loginBtn) loginBtn.disabled = false;
        if (logoutBtn) logoutBtn.disabled = true;
        Store.ready = false;
      }
    }
  }

  function initNav() {
    $("navBase")?.addEventListener("click", () => showView("base"));
    $("navTeams")?.addEventListener("click", () => showView("teams"));
    $("navTurns")?.addEventListener("click", () => showView("turns"));
    $("navHistory")?.addEventListener("click", () => showView("history"));

    // view default
    showView("base");

    console.log("✅ app.js navegación lista");
  }

  function wireStateUI() {
    window.addEventListener("op:stateChanged", () => {
      updatePillInfo();
      // badges si existen
      const tagTeams = $("tagTeams");
      if (tagTeams) {
        const a = (Store.state?.team_a || []).length;
        const b = (Store.state?.team_b || []).length;
        tagTeams.textContent = String(a + b);
      }
    });
  }

  document.addEventListener("DOMContentLoaded", async () => {
    initNav();
    wireStateUI();

    // Si tu index no tiene estos elementos, no rompe.
    await initAuthUI();
  });
})();

// app.js — bootstrap robusto + diagnóstico visible
import { supabase } from "./supabaseClient.js";
import { Store } from "./store.js";
import { listPlayers, signInWithGoogle, signOut, getSessionUser } from "./supabaseApi.js";

window.__OP_APP_LOADED__ = true;

(function () {
  const $ = (id) => document.getElementById(id);

  function setUI(msgTop, msgBottom) {
    const top = $("authStatusText");
    const bottom = $("authStatus");
    if (top && msgTop !== undefined) top.textContent = msgTop;
    if (bottom && msgBottom !== undefined) bottom.textContent = msgBottom;
  }

  function show(el, yes) { if (el) el.style.display = yes ? "" : "none"; }

  function updatePillInfo() {
    const pill = $("pillInfo");
    if (!pill) return;
    const n = (Store.state?.pool || []).length;
    const courts = n ? Math.floor(n / 4) : 0;
    pill.textContent = `N: ${n} • Canchas: ${courts}`;
  }

  function setActiveNav(activeId) {
    ["navBase","navTeams","navTurns","navHistory"].forEach(id=>{
      const b = $(id);
      if (b) b.classList.toggle("active", id === activeId);
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
    setActiveNav(which==="base"?"navBase":which==="teams"?"navTeams":which==="turns"?"navTurns":"navHistory");
    window.OP = window.OP || {};
    if (typeof window.OP.refresh === "function") window.OP.refresh(which);
  }

  async function refreshSessionUI() {
    const loginBtn = $("loginGoogle");
    const logoutBtn = $("logoutBtn");

    try {
      setUI("Verificando sesión…", "Conectando…");

      // Siempre habilitar botones para que no quede “muerto”
      if (loginBtn) loginBtn.disabled = false;
      if (logoutBtn) logoutBtn.disabled = false;

      const user = await getSessionUser();

      if (!user) {
        setUI("Inicia sesión para usar la app.", "No conectado");
        if (logoutBtn) logoutBtn.disabled = true;
        Store.ready = false;
        return;
      }

      setUI(`✅ Conectado: ${user.email || user.id}`, "Conectado ✅");

      // cargar jugadores
      const players = await listPlayers();
      Store.setPlayers(players);

      // listo
      Store.setReady();
      updatePillInfo();

      if (loginBtn) loginBtn.disabled = true;
      if (logoutBtn) logoutBtn.disabled = false;

    } catch (e) {
      console.error("❌ refreshSessionUI", e);
      setUI("Error verificando sesión.", `❌ ${e?.message || e}`);
      // dejar login habilitado para intentar
      const loginBtn = $("loginGoogle");
      const logoutBtn = $("logoutBtn");
      if (loginBtn) loginBtn.disabled = false;
      if (logoutBtn) logoutBtn.disabled = true;
      Store.ready = false;
    }
  }

  function wireAuthButtons() {
    const loginBtn = $("loginGoogle");
    const logoutBtn = $("logoutBtn");

    if (loginBtn) {
      loginBtn.disabled = false;
      loginBtn.addEventListener("click", async () => {
        try {
          setUI("Abriendo Google…", "Espera…");
          await signInWithGoogle();
        } catch (e) {
          console.error("❌ signInWithGoogle", e);
          setUI("Error al iniciar sesión.", `❌ ${e?.message || e}`);
        }
      });
    }

    if (logoutBtn) {
      logoutBtn.addEventListener("click", async () => {
        try {
          setUI("Cerrando sesión…", "");
          await signOut();
          location.reload();
        } catch (e) {
          console.error("❌ signOut", e);
          setUI("Error al cerrar sesión.", `❌ ${e?.message || e}`);
        }
      });
    }
  }

  function initNav() {
    $("navBase")?.addEventListener("click", () => showView("base"));
    $("navTeams")?.addEventListener("click", () => showView("teams"));
    $("navTurns")?.addEventListener("click", () => showView("turns"));
    $("navHistory")?.addEventListener("click", () => showView("history"));
    showView("base");
  }

  document.addEventListener("DOMContentLoaded", async () => {
    try {
      setUI("Cargando app…", "Inicializando…");

      initNav();
      wireAuthButtons();

      // escuchar cambios auth
      supabase.auth.onAuthStateChange(async () => {
        await refreshSessionUI();
      });

      await refreshSessionUI();

      console.log("✅ app.js listo");
    } catch (e) {
      console.error("❌ app init", e);
      setUI("Error cargando app.", `❌ ${e?.message || e}`);
    }
  });
})();

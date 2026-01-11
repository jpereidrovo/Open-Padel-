// app.js — Bootstrap principal Open Padel (estable y robusto)

import { supabase } from "./supabaseClient.js";
import { Store } from "./store.js";
import {
  signInWithGoogle,
  signOut,
  getSessionUser,
  listPlayers
} from "./supabaseApi.js";

// Flag visible para debug
window.__OP_APP_LOADED__ = true;

(function () {
  const $ = (id) => document.getElementById(id);

  /* ================= UTILIDADES ================= */

  function show(el, yes) {
    if (!el) return;
    el.style.display = yes ? "" : "none";
  }

  function setText(id, text) {
    const el = $(id);
    if (el) el.textContent = text;
  }

  function updatePillInfo() {
    const pill = $("pillInfo");
    if (!pill) return;
    const n = (Store.state?.pool || []).length;
    const courts = n ? Math.floor(n / 4) : 0;
    pill.textContent = `N: ${n} • Canchas: ${courts}`;
  }

  /* ================= NAVEGACIÓN ================= */

  function setActiveNav(activeId) {
    ["navBase", "navTeams", "navTurns", "navHistory"].forEach((id) => {
      const btn = $(id);
      if (!btn) return;
      btn.classList.toggle("active", id === activeId);
    });
  }

  function showView(view) {
    const views = {
      base: $("viewBase"),
      teams: $("viewTeams"),
      turns: $("viewTurns"),
      history: $("viewHistory"),
    };

    Object.entries(views).forEach(([k, el]) => show(el, k === view));

    setActiveNav(
      view === "base" ? "navBase" :
      view === "teams" ? "navTeams" :
      view === "turns" ? "navTurns" : "navHistory"
    );

    // Avisar a los módulos
    window.OP = window.OP || {};
    if (typeof window.OP.refresh === "function") {
      window.OP.refresh(view);
    }
  }

  function initNavigation() {
    $("navBase")?.addEventListener("click", () => showView("base"));
    $("navTeams")?.addEventListener("click", () => showView("teams"));
    $("navTurns")?.addEventListener("click", () => showView("turns"));
    $("navHistory")?.addEventListener("click", () => showView("history"));

    showView("base");
  }

  /* ================= AUTH ================= */

  async function refreshSessionUI() {
    const loginBtn = $("loginGoogle");
    const logoutBtn = $("logoutBtn");

    try {
      setText("authStatusText", "Verificando sesión…");
      setText("authStatus", "Conectando…");

      if (loginBtn) loginBtn.disabled = false;
      if (logoutBtn) logoutBtn.disabled = false;

      const user = await getSessionUser();

      if (!user) {
        setText("authStatusText", "Inicia sesión para usar la app.");
        setText("authStatus", "No conectado");
        if (logoutBtn) logoutBtn.disabled = true;
        Store.ready = false;
        return;
      }

      // Usuario conectado
      setText("authStatusText", `✅ Conectado: ${user.email || user.id}`);
      setText("authStatus", "Conectado ✅");

      // Cargar jugadores
      const players = await listPlayers();
      Store.setPlayers(players);

      Store.setReady();
      updatePillInfo();

      if (loginBtn) loginBtn.disabled = true;
      if (logoutBtn) logoutBtn.disabled = false;

    } catch (e) {
      console.error("❌ refreshSessionUI", e);
      setText("authStatusText", "Error verificando sesión.");
      setText("authStatus", `❌ ${e?.message || e}`);
      if (loginBtn) loginBtn.disabled = false;
      if (logoutBtn) logoutBtn.disabled = true;
      Store.ready = false;
    }
  }

  function wireAuthButtons() {
    const loginBtn = $("loginGoogle");
    const logoutBtn = $("logoutBtn");

    if (loginBtn) {
      // Clonar para limpiar listeners viejos
      const cleanBtn = loginBtn.cloneNode(true);
      loginBtn.parentNode.replaceChild(cleanBtn, loginBtn);

      cleanBtn.disabled = false;
      cleanBtn.addEventListener("click", async () => {
        try {
          setText("authStatusText", "Abriendo Google…");
          setText("authStatus", "Espera…");
          await signInWithGoogle();
        } catch (e) {
          console.error("❌ signInWithGoogle", e);
          setText("authStatusText", "Error al iniciar sesión.");
          setText("authStatus", `❌ ${e?.message || e}`);
        }
      });
    }

    if (logoutBtn) {
      logoutBtn.disabled = false;
      logoutBtn.addEventListener("click", async () => {
        try {
          setText("authStatusText", "Cerrando sesión…");
          setText("authStatus", "");
          await signOut();
          location.reload();
        } catch (e) {
          console.error("❌ signOut", e);
        }
      });
    }
  }

  /* ================= EVENTOS ================= */

  function wireStoreEvents() {
    window.addEventListener("op:stateChanged", () => {
      updatePillInfo();
      const tagTeams = $("tagTeams");
      if (tagTeams) {
        const a = (Store.state?.team_a || []).length;
        const b = (Store.state?.team_b || []).length;
        tagTeams.textContent = String(a + b);
      }
    });
  }

  /* ================= INIT ================= */

  document.addEventListener("DOMContentLoaded", async () => {
    try {
      setText("authStatusText", "Cargando app…");
      setText("authStatus", "Inicializando…");

      initNavigation();
      wireAuthButtons();
      wireStoreEvents();

      // Escuchar cambios de auth (login / logout)
      supabase.auth.onAuthStateChange(async () => {
        await refreshSessionUI();
      });

      await refreshSessionUI();

      console.log("✅ app.js listo");
    } catch (e) {
      console.error("❌ app init", e);
      setText("authStatusText", "Error cargando app.");
      setText("authStatus", `❌ ${e?.message || e}`);
    }
  });
})();

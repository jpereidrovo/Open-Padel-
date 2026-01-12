// app.js — Open Padel bootstrap (PKCE robusto para GitHub Pages)

import { supabase } from "./supabaseClient.js";
import { Store } from "./store.js";
import { signInWithGoogle, signOut, getSessionUser, listPlayers } from "./supabaseApi.js";

import "./db.js";
import "./teams.js";
import "./turns.js";
import "./history.js";

(function () {
  const $ = (id) => document.getElementById(id);

  function setText(id, text) {
    const el = $(id);
    if (el) el.textContent = text;
  }

  function show(el, yes) {
    if (el) el.style.display = yes ? "" : "none";
  }

  function setActiveNav(activeId) {
    ["navBase", "navTeams", "navTurns", "navHistory"].forEach((id) => {
      const btn = $(id);
      if (!btn) return;
      btn.classList.toggle("active", id === activeId);
    });
  }

  function showView(view) {
    show($("viewBase"), view === "base");
    show($("viewTeams"), view === "teams");
    show($("viewTurns"), view === "turns");
    show($("viewHistory"), view === "history");

    setActiveNav(
      view === "base" ? "navBase" :
      view === "teams" ? "navTeams" :
      view === "turns" ? "navTurns" : "navHistory"
    );

    window.OP = window.OP || {};
    if (typeof window.OP.refresh === "function") window.OP.refresh(view);
  }

  function initNavigation() {
    $("navBase")?.addEventListener("click", () => showView("base"));
    $("navTeams")?.addEventListener("click", () => showView("teams"));
    $("navTurns")?.addEventListener("click", () => showView("turns"));
    $("navHistory")?.addEventListener("click", () => showView("history"));
    showView("base");
  }

  function wireAuthButtons() {
    const loginBtn = $("loginGoogle");
    const logoutBtn = $("logoutBtn");

    if (loginBtn) {
      // evita listeners duplicados
      const clean = loginBtn.cloneNode(true);
      loginBtn.parentNode.replaceChild(clean, loginBtn);

      clean.disabled = false;
      clean.addEventListener("click", async () => {
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
      const clean2 = logoutBtn.cloneNode(true);
      logoutBtn.parentNode.replaceChild(clean2, logoutBtn);

      clean2.disabled = false;
      clean2.addEventListener("click", async () => {
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

  // ✅ Extra: forzar intercambio del code por sesión lo antes posible
  async function exchangeCodeIfPresent() {
    const url = new URL(window.location.href);
    const code = url.searchParams.get("code");

    if (!code) return false;

    try {
      setText("authStatusText", "Finalizando login…");
      setText("authStatus", "Procesando…");

      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) throw error;

      // limpiar URL
      url.searchParams.delete("code");
      url.searchParams.delete("state");
      window.history.replaceState({}, document.title, url.toString());

      return true;
    } catch (e) {
      console.error("❌ exchangeCodeForSession", e);
      setText("authStatusText", "Error finalizando login.");
      setText("authStatus", `❌ ${e?.message || e}`);
      return false;
    }
  }

  let lastUserId = null;

  async function refreshSessionUI(source = "") {
    const loginBtn = $("loginGoogle");
    const logoutBtn = $("logoutBtn");

    try {
      setText("authStatusText", source ? `Verificando sesión… (${source})` : "Verificando sesión…");
      setText("authStatus", "Conectando…");

      const user = await getSessionUser();

      if (!user) {
        Store.ready = false;
        lastUserId = null;
        if (loginBtn) loginBtn.disabled = false;
        if (logoutBtn) logoutBtn.disabled = true;
        setText("authStatusText", "Inicia sesión para usar la app.");
        setText("authStatus", "No conectado");
        return;
      }

      if (Store.ready && lastUserId === user.id) {
        if (loginBtn) loginBtn.disabled = true;
        if (logoutBtn) logoutBtn.disabled = false;
        setText("authStatusText", `✅ Conectado: ${user.email || user.id}`);
        setText("authStatus", "Conectado ✅");
        return;
      }

      lastUserId = user.id;

      const players = await listPlayers();
      Store.setPlayers(players);
      Store.setReady();

      if (loginBtn) loginBtn.disabled = true;
      if (logoutBtn) logoutBtn.disabled = false;

      setText("authStatusText", `✅ Conectado: ${user.email || user.id}`);
      setText("authStatus", "Conectado ✅");

      window.dispatchEvent(new Event("op:storeReady"));
    } catch (e) {
      console.error("❌ refreshSessionUI", e);
      Store.ready = false;
      if (loginBtn) loginBtn.disabled = false;
      if (logoutBtn) logoutBtn.disabled = true;
      setText("authStatusText", "Error verificando sesión.");
      setText("authStatus", `❌ ${e?.message || e}`);
    }
  }

  function wireTabChecks() {
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") refreshSessionUI("tab visible");
    });
    window.addEventListener("focus", () => refreshSessionUI("focus"));
  }

  let started = false;

  async function start() {
    if (started) return;
    started = true;

    initNavigation();
    wireAuthButtons();
    wireTabChecks();

    // 1) Consumir ?code=... si existe
    await exchangeCodeIfPresent();

    // 2) Luego refrescar sesión normal
    await refreshSessionUI("init");

    // 3) Cambios de auth reales
    supabase.auth.onAuthStateChange(() => refreshSessionUI("auth"));

    console.log("✅ app.js listo");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();

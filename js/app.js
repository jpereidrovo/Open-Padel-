// app.js — Open Padel bootstrap (PKCE robusto + logout confiable)

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
  function show(el, yes) { if (el) el.style.display = yes ? "" : "none"; }

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
    window.OP.refresh?.(view);
  }

  function initNavigation() {
    $("navBase")?.addEventListener("click", () => showView("base"));
    $("navTeams")?.addEventListener("click", () => showView("teams"));
    $("navTurns")?.addEventListener("click", () => showView("turns"));
    $("navHistory")?.addEventListener("click", () => showView("history"));
    showView("base");
  }

  // ✅ Intercambia code PKCE si está en URL
  async function exchangeCodeIfPresent() {
    const url = new URL(window.location.href);
    const code = url.searchParams.get("code");
    if (!code) return;

    setText("authStatusText", "Finalizando login…");
    setText("authStatus", "Procesando…");

    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) throw error;

    url.searchParams.delete("code");
    url.searchParams.delete("state");
    window.history.replaceState({}, document.title, url.toString());
  }

  let lastUserId = null;

  async function refreshSessionUI(source = "") {
    const loginBtn = $("loginGoogle");
    const logoutBtn = $("logoutBtn");

    setText("authStatusText", source ? `Verificando sesión… (${source})` : "Verificando sesión…");
    setText("authStatus", "Conectando…");

    const user = await getSessionUser();

    if (!user) {
      // UI logged-out
      Store.ready = false;
      lastUserId = null;

      if (loginBtn) loginBtn.disabled = false;
      if (logoutBtn) logoutBtn.disabled = true;

      setText("authStatusText", "Inicia sesión para usar la app.");
      setText("authStatus", "No conectado");
      return;
    }

    // UI logged-in
    if (loginBtn) loginBtn.disabled = true;
    if (logoutBtn) logoutBtn.disabled = false;

    setText("authStatusText", `✅ Conectado: ${user.email || user.id}`);
    setText("authStatus", "Conectado ✅");

    if (!Store.ready || lastUserId !== user.id) {
      lastUserId = user.id;
      const players = await listPlayers();
      Store.setPlayers(players);
      Store.setReady();
      window.dispatchEvent(new Event("op:storeReady"));
    }
  }

  function wireAuthButtons() {
    const loginBtn = $("loginGoogle");
    const logoutBtn = $("logoutBtn");

    if (loginBtn) {
      loginBtn.onclick = async () => {
        try {
          setText("authStatusText", "Abriendo Google…");
          setText("authStatus", "Espera…");
          await signInWithGoogle();
        } catch (e) {
          console.error(e);
          setText("authStatusText", "Error al iniciar sesión.");
          setText("authStatus", `❌ ${e?.message || e}`);
        }
      };
    }

    if (logoutBtn) {
      logoutBtn.onclick = async () => {
        try {
          logoutBtn.disabled = true;
          setText("authStatusText", "Cerrando sesión…");
          setText("authStatus", "");

          await signOut();

          // limpiar UI/Store local
          Store.ready = false;
          Store.setPlayers?.([]);
          lastUserId = null;

          // refrescar estado real (debe quedar logged out)
          await refreshSessionUI("signed out");

          // recarga para limpiar vistas/cache (opcional, pero deja todo limpio)
          setTimeout(() => location.reload(), 50);
        } catch (e) {
          console.error("❌ logout", e);
          setText("authStatusText", "Error cerrando sesión.");
          setText("authStatus", `❌ ${e?.message || e}`);
          logoutBtn.disabled = false;
        }
      };
    }
  }

  function wireTabChecks() {
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") refreshSessionUI("tab visible").catch(console.error);
    });
    window.addEventListener("focus", () => refreshSessionUI("focus").catch(console.error));
  }

  let started = false;
  async function start() {
    if (started) return;
    started = true;

    initNavigation();
    wireAuthButtons();
    wireTabChecks();

    try {
      await exchangeCodeIfPresent();
    } catch (e) {
      console.error("❌ exchange", e);
      setText("authStatusText", "Error finalizando login.");
      setText("authStatus", `❌ ${e?.message || e}`);
    }

    // escuchar cambios reales de auth
    supabase.auth.onAuthStateChange(() => {
      refreshSessionUI("auth").catch(console.error);
    });

    await refreshSessionUI("init");
    console.log("✅ app.js listo");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();

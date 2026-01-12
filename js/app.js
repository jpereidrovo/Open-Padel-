// app.js — Open Padel bootstrap
// OBJETIVO: Auth SIEMPRE funciona aunque fallen módulos (db/teams/turns/history)

import { supabase } from "./supabaseClient.js";
import { Store } from "./store.js";
import { signInWithGoogle, signOut, getSessionUser, listPlayers } from "./supabaseApi.js";

(function () {
  const $ = (id) => document.getElementById(id);

  function setText(id, text) {
    const el = $(id);
    if (el) el.textContent = text;
  }
  function show(el, yes) { if (el) el.style.display = yes ? "" : "none"; }

  function setDot(state) {
    const dot = $("authDot");
    if (!dot) return;
    dot.classList.remove("ok", "bad");
    if (state === "ok") dot.classList.add("ok");
    if (state === "bad") dot.classList.add("bad");
  }
  function setSpinner(on) {
    const sp = $("authSpinner");
    if (!sp) return;
    sp.classList.toggle("on", !!on);
  }

  function setUserUI(user) {
    const nameEl = $("userName");
    const mailEl = $("userEmail");
    const avatarEl = $("userAvatar");

    if (!user) {
      if (nameEl) nameEl.textContent = "No has iniciado sesión";
      if (mailEl) mailEl.textContent = "—";
      if (avatarEl) avatarEl.innerHTML = "";
      return;
    }

    const meta = user.user_metadata || {};
    const fullName = meta.full_name || meta.name || user.email || user.id;
    const email = user.email || "—";
    const pic = meta.avatar_url || meta.picture || "";

    if (nameEl) nameEl.textContent = fullName;
    if (mailEl) mailEl.textContent = email;

    if (avatarEl) {
      avatarEl.innerHTML = pic
        ? `<img src="${pic}" alt="" referrerpolicy="no-referrer" />`
        : `<span style="font-size:12px; opacity:.8;">OP</span>`;
    }
  }

  // ✅ AUTH blindado: funciones globales (botones siempre sirven)
  window.OP_LOGIN = async () => {
    try {
      setSpinner(true);
      setDot(null);
      setText("authStatusText", "Abriendo Google…");
      setText("authStatus", "Espera…");
      await signInWithGoogle();
    } catch (e) {
      console.error("❌ OP_LOGIN", e);
      setSpinner(false);
      setDot("bad");
      setText("authStatusText", "Error al iniciar sesión.");
      setText("authStatus", e?.message || String(e));
    }
  };

  window.OP_LOGOUT = async () => {
    try {
      const logoutBtn = $("logoutBtn");
      if (logoutBtn) logoutBtn.disabled = true;

      setSpinner(true);
      setDot(null);
      setText("authStatusText", "Cerrando sesión…");
      setText("authStatus", "");

      await signOut();

      Store.ready = false;
      Store.setPlayers?.([]);

      setSpinner(false);
      setDot("bad");
      setUserUI(null);
      setText("authStatusText", "Sesión cerrada.");
      setText("authStatus", "No conectado");

      setTimeout(() => location.reload(), 50);
    } catch (e) {
      console.error("❌ OP_LOGOUT", e);
      setSpinner(false);
      setDot("bad");
      setText("authStatusText", "Error cerrando sesión.");
      setText("authStatus", e?.message || String(e));
      const logoutBtn = $("logoutBtn");
      if (logoutBtn) logoutBtn.disabled = false;
    }
  };

  // ---- Nav ----
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

  // ✅ exchange PKCE solo si hay ?code=
  async function exchangeCodeIfPresent() {
    const url = new URL(window.location.href);
    const code = url.searchParams.get("code");
    if (!code) return;

    setSpinner(true);
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

    try {
      setSpinner(true);
      setDot(null);
      setText("authStatusText", source ? `Verificando sesión… (${source})` : "Verificando sesión…");
      setText("authStatus", "…");

      const user = await getSessionUser();

      if (!user) {
        Store.ready = false;
        lastUserId = null;

        setUserUI(null);
        if (loginBtn) loginBtn.disabled = false;
        if (logoutBtn) logoutBtn.disabled = true;

        setSpinner(false);
        setDot("bad");
        setText("authStatusText", "Inicia sesión para usar la app.");
        setText("authStatus", "No conectado");
        return;
      }

      setUserUI(user);
      if (loginBtn) loginBtn.disabled = true;
      if (logoutBtn) logoutBtn.disabled = false;

      setSpinner(false);
      setDot("ok");
      setText("authStatusText", `✅ Conectado: ${user.email || user.id}`);
      setText("authStatus", "Conectado ✅");

      // carga players solo si cambió usuario o aún no está listo
      if (!Store.ready || lastUserId !== user.id) {
        lastUserId = user.id;
        const players = await listPlayers();
        Store.setPlayers(players);
        Store.setReady();
        window.dispatchEvent(new Event("op:storeReady"));
      }
    } catch (e) {
      console.error("❌ refreshSessionUI", e);
      setSpinner(false);
      setDot("bad");
      setText("authStatusText", "❌ Error verificando sesión.");
      setText("authStatus", e?.message || String(e));

      Store.ready = false;
      lastUserId = null;
      setUserUI(null);

      if (loginBtn) loginBtn.disabled = false;
      if (logoutBtn) logoutBtn.disabled = true;
    }
  }

  // ✅ IMPORTS SEGUROS: si un módulo falla, NO tumba el login
  async function safeImport(path) {
    try { await import(path); }
    catch (e) { console.error("❌ import failed:", path, e); }
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
    wireTabChecks();

    try {
      await exchangeCodeIfPresent();
    } catch (e) {
      console.error("❌ exchange", e);
      setSpinner(false);
      setDot("bad");
      setText("authStatusText", "Error finalizando login.");
      setText("authStatus", e?.message || String(e));
    }

    // Módulos (no pueden romper auth)
    await safeImport("./db.js");
    await safeImport("./teams.js");
    await safeImport("./turns.js");
    await safeImport("./history.js");

    // cambios reales de sesión
    supabase.auth.onAuthStateChange((event) => {
      refreshSessionUI(`auth:${event}`).catch(console.error);
    });

    await refreshSessionUI("init");
    console.log("✅ app.js listo (auth blindado)");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();

// app.js — Open Padel bootstrap (robusto: auth/navegación primero, módulos por import() con fallback)

import { supabase } from "./supabaseClient.js";
import { Store } from "./store.js";
import { signInWithGoogle, signOut, getSessionUser, listPlayers } from "./supabaseApi.js";

(function () {
  const $ = (id) => document.getElementById(id);

  function setText(id, text) {
    const el = $(id);
    if (el) el.textContent = text;
  }

  function show(el, yes) {
    if (el) el.style.display = yes ? "" : "none";
  }

  // ---- Debug visible (si algo explota, lo verás arriba) ----
  function showFatal(err, where = "app") {
    console.error(`❌ ${where}`, err);
    const msg = err?.message ? String(err.message) : String(err);
    setText("authStatusText", `❌ Error cargando (${where}).`);
    setText("authStatus", msg);
  }

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

  // ---- Auth UI helpers (por si luego quieres avatar/nombre) ----
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

  // ✅ PKCE: si está el code, se intercambia. (Tu supabaseApi.js ya NO hace exchange aquí)
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
      Store.ready = false;
      lastUserId = null;

      setUserUI(null);

      if (loginBtn) loginBtn.disabled = false;
      if (logoutBtn) logoutBtn.disabled = true;

      setText("authStatusText", "Inicia sesión para usar la app.");
      setText("authStatus", "No conectado");
      return;
    }

    setUserUI(user);

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

    // 🔒 Si app.js está vivo, esto SIEMPRE debe existir.
    if (!loginBtn) {
      showFatal(new Error("No existe #loginGoogle en el DOM"), "wireAuthButtons");
      return;
    }

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

    if (logoutBtn) {
      logoutBtn.onclick = async () => {
        try {
          logoutBtn.disabled = true;
          setText("authStatusText", "Cerrando sesión…");
          setText("authStatus", "");

          await signOut();

          Store.ready = false;
          Store.setPlayers?.([]);
          lastUserId = null;

          await refreshSessionUI("signed out");

          setTimeout(() => location.reload(), 50);
        } catch (e) {
          console.error("❌ logout", e);
          setText("authStatusText", "Error cerrando sesión.");
          setText("authStatus", `❌ ${e?.message || e}`);
          logoutBtn.disabled = false;
        }
      };
    }

    // para diagnosticar: confirmamos en consola
    console.log("✅ Auth buttons wired (loginGoogle onclick set)");
  }

  function wireTabChecks() {
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") refreshSessionUI("tab visible").catch(console.error);
    });
    window.addEventListener("focus", () => refreshSessionUI("focus").catch(console.error));
  }

  // ✅ Carga módulos sin romper el bootstrap
  async function safeImport(path, tag) {
    try {
      await import(path);
      console.log(`✅ módulo cargado: ${tag}`);
    } catch (e) {
      // No rompemos auth. Solo reportamos.
      console.error(`❌ fallo import ${tag} (${path})`, e);
      // mostramos una pista arriba (pero no bloquea login)
      setText("authStatusText", `⚠️ Módulo con error: ${tag}. Login sigue activo.`);
      setText("authStatus", e?.message || String(e));
    }
  }

  let started = false;
  async function start() {
    if (started) return;
    started = true;

    // Captura errores globales de módulos para que se vean arriba
    window.addEventListener("error", (ev) => {
      // no sobreescribimos si es ruido de extensiones, pero sí logeamos
      console.error("❌ window.error", ev?.message, ev?.error);
    });
    window.addEventListener("unhandledrejection", (ev) => {
      console.error("❌ unhandledrejection", ev?.reason);
    });

    initNavigation();

    // 🔥 Lo más importante: auth primero
    wireAuthButtons();
    wireTabChecks();

    try {
      await exchangeCodeIfPresent();
    } catch (e) {
      console.error("❌ exchange", e);
      setText("authStatusText", "Error finalizando login.");
      setText("authStatus", `❌ ${e?.message || e}`);
    }

    // auth changes
    supabase.auth.onAuthStateChange(() => {
      refreshSessionUI("auth").catch(console.error);
    });

    await refreshSessionUI("init");

    // ✅ Ahora cargamos módulos UI (si uno falla, no mata login)
    await safeImport("./db.js", "db");
    await safeImport("./teams.js", "teams");
    await safeImport("./turns.js", "turns");
    await safeImport("./history.js", "history");

    console.log("✅ app.js listo (bootstrap robusto)");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();

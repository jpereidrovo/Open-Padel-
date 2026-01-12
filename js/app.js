// app.js — Open Padel bootstrap (FIX: importar módulos ANTES de disparar op:storeReady)

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

  // ---- Nav ----
  function setActiveNav(activeId) {
    ["navBase", "navTeams", "navTurns", "navHistory"].forEach((id) => {
      const btn = $(id);
      if (!btn) return;
      btn.classList.toggle("active", id === activeId);
    });
  }

  function currentViewKey() {
    const vb = $("viewBase");
    const vt = $("viewTeams");
    const vtu = $("viewTurns");
    const vh = $("viewHistory");
    if (vb && vb.style.display !== "none") return "base";
    if (vt && vt.style.display !== "none") return "teams";
    if (vtu && vtu.style.display !== "none") return "turns";
    if (vh && vh.style.display !== "none") return "history";
    return "base";
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

  // ✅ PKCE exchange (solo aquí)
  async function exchangeCodeIfPresent() {
    const url = new URL(window.location.href);
    const code = url.searchParams.get("code");
    if (!code) return;

    setSpinner(true);
    setDot(null);
    setText("authStatusText", "Finalizando login…");
    setText("authStatus", "Procesando…");

    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) throw error;

    url.searchParams.delete("code");
    url.searchParams.delete("state");
    window.history.replaceState({}, document.title, url.toString());
  }

  // ---- timeout helper ----
  function withTimeout(promise, ms, label = "timeout") {
    let t;
    const timeout = new Promise((_, rej) => {
      t = setTimeout(() => rej(new Error(`${label}: ${ms}ms`)), ms);
    });
    return Promise.race([
      promise.finally(() => clearTimeout(t)),
      timeout
    ]);
  }

  let lastUserId = null;
  let refreshInFlight = null;

  async function refreshSessionUI(source = "") {
    if (refreshInFlight) return refreshInFlight;

    const run = (async () => {
      const loginBtn = $("loginGoogle");
      const logoutBtn = $("logoutBtn");

      try {
        setSpinner(true);
        setDot(null);
        setText("authStatusText", source ? `Verificando sesión… (${source})` : "Verificando sesión…");
        setText("authStatus", "Conectando…");

        const user = await withTimeout(getSessionUser(), 8000, "getSessionUser");

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

        // logged-in
        setUserUI(user);
        if (loginBtn) loginBtn.disabled = true;
        if (logoutBtn) logoutBtn.disabled = false;

        setDot("ok");
        setText("authStatusText", `✅ Conectado: ${user.email || user.id}`);
        setText("authStatus", "Conectado ✅");

        // cargar players si primera vez o cambió usuario
        if (!Store.ready || lastUserId !== user.id) {
          lastUserId = user.id;
          const players = await withTimeout(listPlayers(), 12000, "listPlayers");
          Store.setPlayers(players);
          Store.setReady();
          window.dispatchEvent(new Event("op:storeReady"));
        }

        setSpinner(false);
      } catch (e) {
        console.error("❌ refreshSessionUI", e);

        setSpinner(false);
        setDot("bad");
        if ($("loginGoogle")) $("loginGoogle").disabled = false;
        if ($("logoutBtn")) $("logoutBtn").disabled = true;

        setText("authStatusText", "❌ Error verificando sesión.");
        setText("authStatus", e?.message || String(e));

        Store.ready = false;
        lastUserId = null;
        setUserUI(null);
      }
    })();

    refreshInFlight = run.finally(() => { refreshInFlight = null; });
    return refreshInFlight;
  }

  function wireAuthButtons() {
    const loginBtn = $("loginGoogle");
    const logoutBtn = $("logoutBtn");

    if (loginBtn) {
      loginBtn.onclick = async () => {
        try {
          setSpinner(true);
          setDot(null);
          setText("authStatusText", "Abriendo Google…");
          setText("authStatus", "Espera…");
          await signInWithGoogle();
        } catch (e) {
          console.error(e);
          setSpinner(false);
          setDot("bad");
          setText("authStatusText", "Error al iniciar sesión.");
          setText("authStatus", `❌ ${e?.message || e}`);
        }
      };
    }

    if (logoutBtn) {
      logoutBtn.onclick = async () => {
        try {
          logoutBtn.disabled = true;
          setSpinner(true);
          setDot(null);
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
          setSpinner(false);
          setDot("bad");
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

  async function safeImport(path, tag) {
    try {
      await import(path);
      console.log(`✅ módulo cargado: ${tag}`);
      return true;
    } catch (e) {
      console.error(`❌ fallo import ${tag} (${path})`, e);
      // no romper auth
      return false;
    }
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
      setSpinner(false);
      setDot("bad");
      setText("authStatusText", "Error finalizando login.");
      setText("authStatus", `❌ ${e?.message || e}`);
    }

    // escuchar cambios reales de auth
    supabase.auth.onAuthStateChange(() => {
      refreshSessionUI("auth").catch(console.error);
    });

    // ✅ CLAVE: cargar módulos ANTES del refresh init
    await safeImport("./db.js", "db");
    await safeImport("./teams.js", "teams");
    await safeImport("./turns.js", "turns");
    await safeImport("./history.js", "history");

    // Ahora sí: init de sesión (dispara op:storeReady cuando corresponde)
    await refreshSessionUI("init");

    // y forzamos render de la vista actual por si el store ya estaba listo
    const v = currentViewKey();
    window.OP = window.OP || {};
    window.OP.refresh?.(v);

    console.log("✅ app.js listo (módulos antes de storeReady)");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();

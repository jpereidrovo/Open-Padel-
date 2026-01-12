// app.js — Open Padel bootstrap (PKCE robusto + logout confiable + UX sesión)

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
    if (el) el.textContent = text ?? "—";
  }
  function show(el, yes) {
    if (el) el.style.display = yes ? "" : "none";
  }

  /* ------------------------- Toasts (UI) ------------------------- */
  function escapeHtml(s) {
    return String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function toast(title, body = "", type = "info", ttlMs = 3200) {
    const host = $("toasts");
    if (!host) return;

    const icon = type === "ok" ? "✅" : type === "bad" ? "⚠️" : "ℹ️";

    const el = document.createElement("div");
    el.className = "toast";
    el.setAttribute("role", "status");
    el.innerHTML = `
      <div aria-hidden="true">${icon}</div>
      <div>
        <div class="t-title">${escapeHtml(title)}</div>
        ${body ? `<div class="t-body">${escapeHtml(body)}</div>` : ""}
      </div>
      <button class="t-x" type="button" aria-label="Cerrar">×</button>
    `;

    el.querySelector(".t-x")?.addEventListener("click", () => el.remove());
    host.appendChild(el);

    window.setTimeout(() => {
      if (el.isConnected) el.remove();
    }, ttlMs);
  }

  /* ------------------------- Auth UX helpers ------------------------- */
  let busy = false;
  let lastUserId = null;

  function setBusy(on) {
    busy = !!on;
    const sp = $("authSpinner");
    if (sp) sp.classList.toggle("on", busy);

    const loginBtn = $("loginGoogle");
    const logoutBtn = $("logoutBtn");

    // No bloquea todo: solo evita doble click durante operaciones
    if (loginBtn) loginBtn.disabled = busy || !!lastUserId;
    if (logoutBtn) logoutBtn.disabled = busy || !lastUserId;
  }

  function setDot(state) {
    const dot = $("authDot");
    if (!dot) return;
    dot.classList.remove("ok", "bad");
    if (state === "ok") dot.classList.add("ok");
    if (state === "bad") dot.classList.add("bad");
  }

  function setUserCard(user) {
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
    const fullName = meta.full_name || meta.name || user.email || "Usuario";
    const email = user.email || "—";
    const pic = meta.avatar_url || meta.picture || "";

    if (nameEl) nameEl.textContent = fullName;
    if (mailEl) mailEl.textContent = email;

    if (avatarEl) {
      if (pic) {
        avatarEl.innerHTML = `<img src="${pic}" alt="" />`;
      } else {
        const initial = String(fullName).trim().slice(0, 1).toUpperCase() || "U";
        avatarEl.innerHTML = `<span style="color:#fff;font-weight:700;">${escapeHtml(initial)}</span>`;
      }
    }
  }

  /* ------------------------- Navigation ------------------------- */
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
      view === "base"
        ? "navBase"
        : view === "teams"
        ? "navTeams"
        : view === "turns"
        ? "navTurns"
        : "navHistory"
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

  /* ------------------------- PKCE exchange ------------------------- */
  async function exchangeCodeIfPresent() {
    const url = new URL(window.location.href);
    const code = url.searchParams.get("code");
    if (!code) return;

    setBusy(true);
    setText("authStatusText", "Finalizando login…");
    setText("authStatus", "Procesando…");

    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) throw error;

    url.searchParams.delete("code");
    url.searchParams.delete("state");
    window.history.replaceState({}, document.title, url.toString());
  }

  /* ------------------------- Logout hardening ------------------------- */
  function clearSupabaseStorage() {
    // Limpieza conservadora: solo keys típicas de Supabase/Auth de este site
    const shouldDelete = (k) =>
      k.startsWith("sb-") ||
      k.includes("supabase") ||
      k.includes("openpadel-auth") ||
      k.includes("open-padel") ||
      k.includes("token") && k.includes("auth");

    try {
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (k && shouldDelete(k)) localStorage.removeItem(k);
      }
    } catch (_) {}

    try {
      for (let i = sessionStorage.length - 1; i >= 0; i--) {
        const k = sessionStorage.key(i);
        if (k && shouldDelete(k)) sessionStorage.removeItem(k);
      }
    } catch (_) {}
  }

  async function signOutHard() {
    const logoutBtn = $("logoutBtn");
    try {
      setBusy(true);
      if (logoutBtn) logoutBtn.disabled = true;

      setText("authStatusText", "Cerrando sesión…");
      setText("authStatus", "");

      // 1) Tu signOut del API (mantiene compatibilidad con tu arquitectura)
      try {
        await signOut();
      } catch (e) {
        console.warn("[logout] signOut() del API falló, aplicando fallback:", e);
      }

      // 2) Fallback: supabase signOut local (no depende de supabaseApi.js)
      try {
        await supabase.auth.signOut({ scope: "local" });
      } catch (e) {
        console.warn("[logout] supabase.auth.signOut fallback falló:", e);
      }

      // 3) Limpieza storage para evitar "sesión fantasma" en GitHub Pages
      clearSupabaseStorage();

      // 4) Limpieza Store/UI
      Store.ready = false;
      Store.setPlayers?.([]);
      lastUserId = null;
      setUserCard(null);
      setDot(); // neutro

      toast("Sesión cerrada", "Se limpió la sesión local.", "ok");

      // 5) Revalidar estado real (debe quedar logged out)
      await refreshSessionUI("signed out");

      // 6) Opción: recargar ligero para limpiar módulos/vistas (mantengo tu enfoque, pero un poco más seguro)
      // Si no quieres recarga, comenta estas 2 líneas:
      setTimeout(() => location.reload(), 50);
    } catch (e) {
      console.error("❌ logout", e);
      toast("Error cerrando sesión", e?.message || String(e), "bad");
      setText("authStatusText", "Error cerrando sesión.");
      setText("authStatus", `❌ ${e?.message || e}`);
      if (logoutBtn) logoutBtn.disabled = false;
    } finally {
      setBusy(false);
    }
  }

  /* ------------------------- Session refresh ------------------------- */
  async function refreshSessionUI(source = "") {
    const loginBtn = $("loginGoogle");
    const logoutBtn = $("logoutBtn");

    setText(
      "authStatusText",
      source ? `Verificando sesión… (${source})` : "Verificando sesión…"
    );
    setText("authStatus", "Conectando…");

    setBusy(true);

    let user = null;
    try {
      user = await getSessionUser();
    } catch (e) {
      console.warn("[auth] getSessionUser error:", e);
      user = null;
    }

    if (!user) {
      // UI logged-out
      Store.ready = false;
      lastUserId = null;

      if (loginBtn) loginBtn.disabled = false;
      if (logoutBtn) logoutBtn.disabled = true;

      setUserCard(null);
      setDot(); // neutro
      setText("authStatusText", "Inicia sesión para usar la app.");
      setText("authStatus", "No conectado");
      setBusy(false);
      return;
    }

    // UI logged-in
    lastUserId = user.id;

    if (loginBtn) loginBtn.disabled = true;
    if (logoutBtn) logoutBtn.disabled = false;

    setUserCard(user);
    setDot("ok");
    setText("authStatusText", `✅ Conectado: ${user.email || user.id}`);
    setText("authStatus", "Conectado ✅");

    // Carga base solo si cambia usuario o no estaba listo
    if (!Store.ready) {
      try {
        const players = await listPlayers();
        Store.setPlayers(players);
        Store.setReady();
        window.dispatchEvent(new Event("op:storeReady"));
      } catch (e) {
        console.error("[players] error:", e);
        toast("No se pudo cargar jugadores", e?.message || String(e), "bad");
        setDot("bad");
        setText("authStatus", `⚠️ ${e?.message || e}`);
      }
    }

    setBusy(false);
  }

  /* ------------------------- Wire buttons / checks ------------------------- */
  function wireAuthButtons() {
    const loginBtn = $("loginGoogle");
    const logoutBtn = $("logoutBtn");

    if (loginBtn) {
      loginBtn.onclick = async () => {
        try {
          setBusy(true);
          setDot(); // neutro mientras abre proveedor
          setText("authStatusText", "Abriendo Google…");
          setText("authStatus", "Espera…");
          await signInWithGoogle();
          // El flujo vuelve con ?code= y se procesa en exchangeCodeIfPresent()
        } catch (e) {
          console.error(e);
          toast("Error al iniciar sesión", e?.message || String(e), "bad");
          setDot("bad");
          setText("authStatusText", "Error al iniciar sesión.");
          setText("authStatus", `❌ ${e?.message || e}`);
        } finally {
          setBusy(false);
        }
      };
    }

    if (logoutBtn) {
      logoutBtn.onclick = async () => {
        await signOutHard();
      };
    }
  }

  function wireTabChecks() {
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") {
        refreshSessionUI("tab visible").catch(console.error);
      }
    });
    window.addEventListener("focus", () => refreshSessionUI("focus").catch(console.error));
  }

  /* ------------------------- Start ------------------------- */
  let started = false;
  let authUnsub = null;

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
      toast("Error finalizando login", e?.message || String(e), "bad");
      setDot("bad");
      setText("authStatusText", "Error finalizando login.");
      setText("authStatus", `❌ ${e?.message || e}`);
    } finally {
      setBusy(false);
    }

    // Listener único (evita duplicados si por algo se llama start dos veces)
    if (!authUnsub) {
      const { data } = supabase.auth.onAuthStateChange(() => {
        refreshSessionUI("auth").catch(console.error);
      });
      authUnsub = data?.subscription || null;
    }

    await refreshSessionUI("init");
    console.log("✅ app.js listo");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();

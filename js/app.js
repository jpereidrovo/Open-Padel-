// app.js — navegación + login + inicializa Store (sin saltar a Base solo)
import { signInWithGoogle, signOut, getSession } from "./supabaseApi.js";
import { Store } from "./store.js";

import "./db.js";
import "./teams.js";
import "./turns.js";
import "./history.js";

(function () {
  const $ = (id) => document.getElementById(id);

  let currentView = "base"; // mantiene la vista actual

  function setActive(navId) {
    ["navBase", "navTeams", "navTurns", "navHistory"].forEach(id => {
      const el = $(id);
      if (!el) return;
      el.classList.toggle("active", id === navId);
    });
  }

  function show(view) {
    currentView = view;

    const map = { base:"viewBase", teams:"viewTeams", turns:"viewTurns", history:"viewHistory" };
    Object.values(map).forEach(id => { const el = $(id); if (el) el.style.display = "none"; });
    const target = $(map[view]);
    if (target) target.style.display = "";

    setActive(view==="base"?"navBase":view==="teams"?"navTeams":view==="turns"?"navTurns":"navHistory");

    window.OP = window.OP || {};
    if (typeof window.OP.refresh === "function") window.OP.refresh(view);
  }

  function setAppEnabled(enabled) {
    const gate = $("authGate");
    const views = ["viewBase","viewTeams","viewTurns","viewHistory"];
    const navs = ["navBase","navTeams","navTurns","navHistory"];
    if (gate) gate.style.display = enabled ? "none" : "";
    views.forEach(id => { const el=$(id); if (el) el.style.display = enabled ? "" : "none"; });
    navs.forEach(id => { const el=$(id); if (el) el.disabled = !enabled; });
  }

  async function refreshAuthUI({ preserveView = true } = {}) {
    const status = $("authStatus");
    const loginBtn = $("loginGoogle");
    const logoutBtn = $("logoutGoogle");
    if (!status || !loginBtn || !logoutBtn) return;

    status.textContent = "Cargando sesión…";
    status.className = "hint muted";

    try {
      const session = await getSession();

      if (session?.user) {
        const email = session.user.email || "usuario";
        status.textContent = `✅ Conectado: ${email}`;
        status.className = "hint ok";
        loginBtn.style.display = "none";
        logoutBtn.style.display = "";
        setAppEnabled(true);

        if (!Store.ready) await Store.init();

        // ✅ clave: NO forzar base; mantener la vista
        if (preserveView) show(currentView);
        else show("base");
      } else {
        status.textContent = "No has iniciado sesión.";
        status.className = "hint muted";
        loginBtn.style.display = "";
        logoutBtn.style.display = "none";
        setAppEnabled(false);
      }
    } catch (e) {
      console.error(e);
      status.textContent = "Error de sesión. Reintenta.";
      status.className = "hint error";
      loginBtn.style.display = "";
      logoutBtn.style.display = "none";
      setAppEnabled(false);
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    $("navBase")?.addEventListener("click", () => show("base"));
    $("navTeams")?.addEventListener("click", () => show("teams"));
    $("navTurns")?.addEventListener("click", () => show("turns"));
    $("navHistory")?.addEventListener("click", () => show("history"));

    $("loginGoogle")?.addEventListener("click", async () => {
      try { await signInWithGoogle(); } catch (e) { console.error(e); alert("No se pudo iniciar sesión."); }
    });

    $("logoutGoogle")?.addEventListener("click", async () => {
      await signOut();
      location.reload();
    });

    setAppEnabled(false);
    show("base");
    refreshAuthUI({ preserveView: false });
  });

  window.OP = window.OP || {};
  window.OP.show = show;

  // cuando vuelves a la pestaña, refresca sesión pero manteniendo vista
  window.addEventListener("focus", () => refreshAuthUI({ preserveView: true }));
})();

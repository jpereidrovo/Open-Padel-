// app.js — Bootstrap principal Open Padel (sesión estable)

import { supabase } from "./supabaseClient.js";
import { Store } from "./store.js";
import { signInWithGoogle, signOut, getSessionUser, listPlayers } from "./supabaseApi.js";

import "./db.js";
import "./teams.js";
import "./turns.js";
import "./history.js";

(function () {
  const $ = (id) => document.getElementById(id);

  function show(el, yes) {
    if (el) el.style.display = yes ? "" : "none";
  }

  function showView(view) {
    show($("viewBase"), view === "base");
    show($("viewTeams"), view === "teams");
    show($("viewTurns"), view === "turns");
    show($("viewHistory"), view === "history");

    ["navBase","navTeams","navTurns","navHistory"].forEach(id => {
      $(id)?.classList.toggle("active", id === "nav" + view.charAt(0).toUpperCase() + view.slice(1));
    });

    window.OP?.refresh?.(view);
  }

  async function refreshSession(origin) {
    const loginBtn = $("loginGoogle");
    const logoutBtn = $("logoutBtn");

    try {
      const user = await getSessionUser();

      if (!user) {
        Store.ready = false;
        loginBtn && (loginBtn.disabled = false);
        logoutBtn && (logoutBtn.disabled = true);
        return;
      }

      if (!Store.ready) {
        const players = await listPlayers();
        Store.setPlayers(players);
        Store.setReady();
      }

      loginBtn && (loginBtn.disabled = true);
      logoutBtn && (logoutBtn.disabled = false);
    } catch (e) {
      console.error("session error", e);
    }
  }

  async function start() {
    $("navBase")?.addEventListener("click", () => showView("base"));
    $("navTeams")?.addEventListener("click", () => showView("teams"));
    $("navTurns")?.addEventListener("click", () => showView("turns"));
    $("navHistory")?.addEventListener("click", () => showView("history"));

    $("loginGoogle")?.addEventListener("click", signInWithGoogle);
    $("logoutBtn")?.addEventListener("click", signOut);

    supabase.auth.onAuthStateChange(() => refreshSession("auth"));
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") refreshSession("tab");
    });
    window.addEventListener("focus", () => refreshSession("focus"));

    await refreshSession("init");
    showView("base");
  }

  document.readyState === "loading"
    ? document.addEventListener("DOMContentLoaded", start)
    : start();
})();

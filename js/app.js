alert("app.js cargó");
// app.js (module) — navegación + login Google + carga módulos de la app

import { signInWithGoogle } from "./supabaseApi.js";

// Importa el resto de tu app (para que se ejecuten sus IIFE igual que antes)
import "./db.js";
import "./teams.js";
import "./turns.js";
import "./history.js";

(function () {
  const $ = (id) => document.getElementById(id);

  function setActive(navId) {
    ["navBase", "navTeams", "navTurns", "navHistory"].forEach(id => {
      const el = $(id);
      if (!el) return;
      el.classList.toggle("active", id === navId);
    });
  }

  function show(view) {
    const map = {
      base: "viewBase",
      teams: "viewTeams",
      turns: "viewTurns",
      history: "viewHistory",
    };

    Object.values(map).forEach(id => {
      const el = $(id);
      if (el) el.style.display = "none";
    });

    const target = $(map[view]);
    if (target) target.style.display = "";

    setActive(
      view === "base" ? "navBase" :
      view === "teams" ? "navTeams" :
      view === "turns" ? "navTurns" : "navHistory"
    );

    window.OP = window.OP || {};
    if (typeof window.OP.refresh === "function") window.OP.refresh(view);
  }

  document.addEventListener("DOMContentLoaded", () => {
    $("navBase")?.addEventListener("click", () => show("base"));
    $("navTeams")?.addEventListener("click", () => show("teams"));
    $("navTurns")?.addEventListener("click", () => show("turns"));
    $("navHistory")?.addEventListener("click", () => show("history"));

    // Login Google
    $("loginGoogle")?.addEventListener("click", () => signInWithGoogle());

    show("base");
    console.log("✅ app.js navegación + módulos listos");
  });

  window.OP = window.OP || {};
  window.OP.show = show;
})();

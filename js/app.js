// app.js — navegación entre vistas (Base, Equipos, Turnos, Historial)
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

    show("base");
    console.log("✅ app.js navegación lista");
  });

  window.OP = window.OP || {};
  window.OP.show = show;
})();

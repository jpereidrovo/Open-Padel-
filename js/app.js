// app.js – núcleo (navegación modular)
document.addEventListener("DOMContentLoaded", () => {
  const $ = (id) => document.getElementById(id);

  const viewBase = $("viewBase");
  const viewTeams = $("viewTeams");
  const viewTurns = $("viewTurns");

  const navBase = $("navBase");
  const navTeams = $("navTeams");
  const navTurns = $("navTurns");

  function setView(v) {
    viewBase.style.display = (v === "base") ? "block" : "none";
    viewTeams.style.display = (v === "teams") ? "block" : "none";
    viewTurns.style.display = (v === "turns") ? "block" : "none";

    navBase.classList.toggle("active", v === "base");
    navTeams.classList.toggle("active", v === "teams");
    navTurns.classList.toggle("active", v === "turns");
  }

  navBase.addEventListener("click", () => setView("base"));
  navTeams.addEventListener("click", () => setView("teams"));
  navTurns.addEventListener("click", () => setView("turns"));

  // vista inicial
  setView("base");

  console.log("✅ app.js navegación lista");
});

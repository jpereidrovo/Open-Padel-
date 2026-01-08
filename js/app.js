// app.js (module) — modo diagnóstico robusto: NUNCA se cae por imports

async function safeImport(path) {
  try {
    await import(path);
    console.log("✅ import OK:", path);
  } catch (e) {
    console.error("❌ import FAIL:", path, e);
  }
}

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

  document.addEventListener("DOMContentLoaded", async () => {
    console.log("✅ DOM listo, app.js ejecutando");

    // Prueba visual: cambia texto del botón
    const loginBtn = $("loginGoogle");
    if (loginBtn) loginBtn.textContent = "Login listo ✅ (haz click)";

    // Conecta navegación
    $("navBase")?.addEventListener("click", () => show("base"));
    $("navTeams")?.addEventListener("click", () => show("teams"));
    $("navTurns")?.addEventListener("click", () => show("turns"));
    $("navHistory")?.addEventListener("click", () => show("history"));

    // Conecta click del login (primero prueba simple)
    $("loginGoogle")?.addEventListener("click", async () => {
      alert("Click detectado ✅ Ahora intento abrir Google...");
      try {
        const mod = await import("./supabaseApi.js");
        await mod.signInWithGoogle();
      } catch (e) {
        console.error("❌ Error en signInWithGoogle()", e);
        alert("Error al iniciar sesión. Abre consola (F12) y mira el error rojo.");
      }
    });

    // Importa el resto sin bloquear (si algo falla, igual funciona el login)
    await safeImport("./db.js");
    await safeImport("./teams.js");
    await safeImport("./turns.js");
    await safeImport("./history.js");

    show("base");
  });

  window.OP = window.OP || {};
  window.OP.show = show;
})();

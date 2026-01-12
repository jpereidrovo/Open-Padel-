// store.js — estado central de la app (NO depende de supabaseApi)

export const Store = {
  // Estado global de datos (para UX consistente)
  // idle: recién cargó la app
  // loading: cargando datos principales (players, etc.)
  // ready: datos disponibles
  // error: hubo error (y puede mostrar mensaje)
  status: "idle", // "idle" | "loading" | "ready" | "error"
  error: null,

  // Compatibilidad con tu flag existente
  ready: false,

  // jugadores desde Supabase
  players: [],

  // estado de la sesión actual
  state: {
    pool: [],
    team_a: [],
    team_b: [],
    turns: null,
    summary: null,
    turnCount: 3,
    session_date: null,
  },

  // ---------- util ----------
  _emit(name) {
    window.dispatchEvent(new Event(name));
  },

  _emitAll() {
    // Mantiene eventos existentes + agrega evento global
    this._emit("op:storeChanged");
  },

  // ---------- estado global (UX) ----------
  setLoading(message = null) {
    this.status = "loading";
    this.error = message ? { message } : null;

    // si está cargando, no lo consideramos ready todavía
    this.ready = false;

    this._emitAll();
  },

  setError(err) {
    const normalized =
      typeof err === "string"
        ? { message: err }
        : err && typeof err === "object"
        ? {
            message: err.message || "Error desconocido",
            code: err.code,
            details: err.details,
            hint: err.hint,
          }
        : { message: "Error desconocido" };

    this.status = "error";
    this.error = normalized;
    this.ready = false;

    this._emitAll();
  },

  clearError() {
    this.error = null;
    if (this.status === "error") this.status = "idle";
    this._emitAll();
  },

  // Limpia datos “de sesión” (no borra estructura)
  clearData() {
    this.players = [];
    this.resetState();

    this.status = "idle";
    this.error = null;
    this.ready = false;

    // eventos compatibles + global
    this._emit("op:playersChanged");
    this._emit("op:stateChanged");
    this._emitAll();
  },

  // ---------- jugadores ----------
  setPlayers(players) {
    this.players = Array.isArray(players) ? players : [];

    // evento existente
    this._emit("op:playersChanged");
    // evento global (para refrescar vistas / badges / pill)
    this._emitAll();
  },

  getPlayersCount() {
    return Array.isArray(this.players) ? this.players.length : 0;
  },

  // ---------- estado (equipos/turnos) ----------
  setState(partial) {
    this.state = { ...this.state, ...(partial || {}) };

    // evento existente
    this._emit("op:stateChanged");
    // evento global
    this._emitAll();
  },

  resetState() {
    this.state = {
      pool: [],
      team_a: [],
      team_b: [],
      turns: null,
      summary: null,
      turnCount: 3,
      session_date: null,
    };

    // evento existente
    this._emit("op:stateChanged");
    // evento global
    this._emitAll();
  },

  // Helpers útiles para UX/logic
  getPoolCount() {
    return Array.isArray(this.state.pool) ? this.state.pool.length : 0;
  },
  getTeamsCount() {
    const a = Array.isArray(this.state.team_a) ? this.state.team_a.length : 0;
    const b = Array.isArray(this.state.team_b) ? this.state.team_b.length : 0;
    return a + b;
  },

  // ---------- sesión ----------
  // Mantengo tu método existente, pero ahora también setea status
  setReady() {
    this.ready = true;
    this.status = "ready";
    this.error = null;

    // evento existente
    this._emit("op:storeReady");
    // evento global
    this._emitAll();
  },
};

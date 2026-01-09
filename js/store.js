// store.js — estado central de la app (NO depende de supabaseApi)

export const Store = {
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
    session_date: null
  },

  // ===== jugadores =====
  setPlayers(players) {
    this.players = players || [];
    window.dispatchEvent(new Event("op:playersChanged"));
  },

  // ===== estado =====
  setState(partial) {
    this.state = { ...this.state, ...partial };
    window.dispatchEvent(new Event("op:stateChanged"));
  },

  resetState() {
    this.state = {
      pool: [],
      team_a: [],
      team_b: [],
      turns: null,
      summary: null,
      turnCount: 3,
      session_date: null
    };
    window.dispatchEvent(new Event("op:stateChanged"));
  },

  // ===== sesión =====
  setReady() {
    this.ready = true;
    window.dispatchEvent(new Event("op:storeReady"));
  }
};

// store.js — estado global en memoria + sync con Supabase (Opción 2)
import { listPlayers, getState, saveState } from "./supabaseApi.js";

function deepClone(x) {
  return JSON.parse(JSON.stringify(x));
}

function debounce(fn, ms) {
  let t = null;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

export const Store = {
  ready: false,
  players: [],
  state: null, // { pool, team_a, team_b, turns, scores, summary, session_date, total_players }

  async init() {
    // carga data desde Supabase
    this.players = await listPlayers();
    this.state = await getState();
    this.ready = true;

    window.dispatchEvent(new CustomEvent("op:storeReady"));
    window.dispatchEvent(new CustomEvent("op:playersChanged"));
    window.dispatchEvent(new CustomEvent("op:stateChanged"));
  },

  setPlayers(players) {
    this.players = players || [];
    window.dispatchEvent(new CustomEvent("op:playersChanged"));
  },

  setState(partial) {
    if (!this.state) this.state = {};
    Object.assign(this.state, partial);
    window.dispatchEvent(new CustomEvent("op:stateChanged"));
    this._saveDebounced();
  },

  // Guardado debounced para no spamear la DB
  _saveDebounced: debounce(async function () {
    if (!Store.ready || !Store.state) return;
    try {
      await saveState(deepClone(Store.state));
      // opcional: console.log("✅ State guardado");
    } catch (e) {
      console.error("❌ saveState error:", e);
    }
  }, 350)
};

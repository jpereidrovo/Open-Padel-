// supabaseApi.js — API única para Open Padel (Supabase)
// Multi-sesión por día: session_seq + session_key (YYYY-MM-DD-<n>)

import { supabase } from "./supabaseClient.js";

export const GROUP_CODE = "open-padel";

// ---------------- Helpers ----------------
function cleanDate(d) {
  return String(d || "").slice(0, 10);
}
function makeSessionKey(dateISO, seq) {
  return `${cleanDate(dateISO)}-${Number(seq || 1)}`;
}

// ---------------- AUTH ----------------
export async function getSessionUser() {
  const url = new URL(window.location.href);
  const code = url.searchParams.get("code");

  if (code) {
    try {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) console.warn("exchangeCodeForSession error:", error);

      url.searchParams.delete("code");
      url.searchParams.delete("state");
      window.history.replaceState({}, document.title, url.toString());
    } catch (e) {
      console.warn("exchangeCodeForSession throw:", e);
    }
  }

  const { data: s1, error: e1 } = await supabase.auth.getSession();
  if (e1) throw e1;
  if (s1?.session?.user) return s1.session.user;

  const { data: u, error: e2 } = await supabase.auth.getUser();
  if (e2) return null;
  return u?.user || null;
}

export async function requireSession() {
  const user = await getSessionUser();
  if (!user) throw new Error("No hay sesión. Inicia sesión con Google.");
  return user;
}

export async function signInWithGoogle() {
  const redirectTo = window.location.origin + window.location.pathname;

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo,
      queryParams: { access_type: "offline", prompt: "consent" },
    },
  });

  if (error) throw error;
  return data;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

// ---------------- PLAYERS ----------------
export async function listPlayers() {
  await requireSession();

  const { data, error } = await supabase
    .from("players")
    .select("*")
    .eq("group_code", GROUP_CODE)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return data || [];
}

export async function upsertPlayer(player) {
  await requireSession();

  const payload = {
    id: player.id,
    name: String(player.name || "").trim(),
    side: player.side === "R" ? "R" : "D",
    rating: Number(player.rating),
    group_code: GROUP_CODE,
    updated_at: new Date().toISOString(),
  };

  if (!payload.id) delete payload.id;

  const { error } = await supabase.from("players").upsert(payload, { onConflict: "id" });
  if (error) throw error;
}

export async function deletePlayer(id) {
  await requireSession();

  const { error } = await supabase.from("players").delete().eq("group_code", GROUP_CODE).eq("id", id);
  if (error) throw error;
}

export async function deleteAllPlayers() {
  await requireSession();

  const { error } = await supabase.from("players").delete().eq("group_code", GROUP_CODE);
  if (error) throw error;
}

// ---------------- SESSIONS (Equipos) ----------------

async function getNextSessionSeq(dateISO) {
  const date = cleanDate(dateISO);

  // trae el max seq del día
  const { data, error } = await supabase
    .from("sessions")
    .select("session_seq")
    .eq("group_code", GROUP_CODE)
    .eq("session_date", date)
    .order("session_seq", { ascending: false })
    .limit(1);

  if (error) throw error;
  const maxSeq = data?.[0]?.session_seq ? Number(data[0].session_seq) : 0;
  return maxSeq + 1;
}

/**
 * Guarda equipos como una NUEVA sesión del día (default).
 * Devuelve: { session_key, session_seq }
 *
 * Si quieres sobrescribir una sesión existente, pasa options.session_seq
 */
export async function saveTeamsToHistory(session_date, totalPlayers, teamA, teamB, options = {}) {
  await requireSession();

  const date = cleanDate(session_date);
  const seq = options.session_seq ? Number(options.session_seq) : await getNextSessionSeq(date);
  const session_key = makeSessionKey(date, seq);

  const payload = {
    group_code: GROUP_CODE,
    session_date: date,
    session_seq: seq,
    session_key,
    totalPlayers: Number(totalPlayers || 0),
    team_a: teamA || [],
    team_b: teamB || [],
    updated_at: new Date().toISOString(),
  };

  // ahora el conflicto es (group_code, session_date, session_seq)
  const { error } = await supabase
    .from("sessions")
    .upsert(payload, { onConflict: "group_code,session_date,session_seq" });

  if (error) throw error;

  return { session_key, session_seq: seq };
}

// ---------------- RESULTS (Turnos + Summary) ----------------
/**
 * Guarda resultados en la sesión específica.
 * Puedes pasar:
 *  - session_key (recomendado)
 *  - o { session_date, session_seq }
 */
export async function saveResultsToHistory(session_date, turns, scores, summary, options = {}) {
  await requireSession();

  const date = cleanDate(session_date);

  let seq = options.session_seq ? Number(options.session_seq) : null;
  let session_key = options.session_key || null;

  if (!session_key) {
    if (!seq) throw new Error("Falta session_key o session_seq para guardar resultados.");
    session_key = makeSessionKey(date, seq);
  } else {
    const parts = String(session_key).split("-");
    seq = Number(parts[parts.length - 1]) || seq || 1;
  }

  const payload = {
    group_code: GROUP_CODE,
    session_date: date,
    session_seq: seq,
    session_key,
    turns: turns || [],
    scores: scores || {},
    summary: summary || {},
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from("results")
    .upsert(payload, { onConflict: "group_code,session_date,session_seq" });

  if (error) throw error;
}

// ---------------- HISTORY ----------------

/**
 * Lista sesiones (no solo fechas).
 * Devuelve: [{ session_date, session_seq, session_key }]
 */
export async function listHistorySessions() {
  await requireSession();

  const { data, error } = await supabase
    .from("sessions")
    .select("session_date, session_seq, session_key")
    .eq("group_code", GROUP_CODE)
    .order("session_date", { ascending: false })
    .order("session_seq", { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function getHistoryDetailByKey(session_key) {
  await requireSession();

  const key = String(session_key || "").trim();
  if (!key) throw new Error("session_key vacío.");

  const { data: sessions, error: e1 } = await supabase
    .from("sessions")
    .select("*")
    .eq("group_code", GROUP_CODE)
    .eq("session_key", key)
    .limit(1);

  if (e1) throw e1;
  const session = sessions?.[0] || null;

  const { data: resultsRows, error: e2 } = await supabase
    .from("results")
    .select("*")
    .eq("group_code", GROUP_CODE)
    .eq("session_key", key)
    .limit(1);

  if (e2) throw e2;
  const results = resultsRows?.[0] || null;

  return { session, results };
}

/**
 * Compat: si todavía llamas por fecha, toma la sesión más reciente de esa fecha (seq mayor).
 */
export async function getHistoryDetail(session_date) {
  await requireSession();

  const date = cleanDate(session_date);

  const { data: sessions, error: e1 } = await supabase
    .from("sessions")
    .select("session_key")
    .eq("group_code", GROUP_CODE)
    .eq("session_date", date)
    .order("session_seq", { ascending: false })
    .limit(1);

  if (e1) throw e1;
  const key = sessions?.[0]?.session_key;
  if (!key) return { session: null, results: null };
  return getHistoryDetailByKey(key);
}

/**
 * Borra SOLO resultados de una sesión (para pruebas).
 */
export async function deleteResultsByKey(session_key) {
  await requireSession();

  const key = String(session_key || "").trim();
  if (!key) throw new Error("session_key vacío.");

  const { error } = await supabase
    .from("results")
    .delete()
    .eq("group_code", GROUP_CODE)
    .eq("session_key", key);

  if (error) throw error;
}

/**
 * Borra TODO de una sesión (equipos + resultados).
 */
export async function deleteSessionByKey(session_key) {
  await requireSession();

  const key = String(session_key || "").trim();
  if (!key) throw new Error("session_key vacío.");

  const { error: e1 } = await supabase
    .from("results")
    .delete()
    .eq("group_code", GROUP_CODE)
    .eq("session_key", key);
  if (e1) throw e1;

  const { error: e2 } = await supabase
    .from("sessions")
    .delete()
    .eq("group_code", GROUP_CODE)
    .eq("session_key", key);
  if (e2) throw e2;
}

/**
 * Compat vieja: borrar por fecha (borra todas las sesiones de esa fecha).
 */
export async function deleteHistoryDate(session_date) {
  await requireSession();

  const date = cleanDate(session_date);

  const { error: e1 } = await supabase
    .from("results")
    .delete()
    .eq("group_code", GROUP_CODE)
    .eq("session_date", date);
  if (e1) throw e1;

  const { error: e2 } = await supabase
    .from("sessions")
    .delete()
    .eq("group_code", GROUP_CODE)
    .eq("session_date", date);
  if (e2) throw e2;
}

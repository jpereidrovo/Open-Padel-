// supabaseApi.js — API única para Open Padel (Supabase)
// Compatible con módulos viejos (por fecha) + compatible con multi-sesión.
// IMPORTANTE: NO hace exchangeCodeForSession aquí; eso lo hace app.js.

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

  const { error } = await supabase
    .from("players")
    .delete()
    .eq("group_code", GROUP_CODE)
    .eq("id", id);

  if (error) throw error;
}

export async function deleteAllPlayers() {
  await requireSession();

  const { error } = await supabase.from("players").delete().eq("group_code", GROUP_CODE);
  if (error) throw error;
}

// ---------------- SESSIONS (Equipos) ----------------
// Modo "clásico": por fecha única (si tu tabla tiene UNIQUE(group_code, session_date) funciona)
// Modo multi-sesión: si tu tabla tiene columnas session_seq + UNIQUE(group_code, session_date, session_seq)
// Este save intenta multi-sesión si existen columnas; si no, igual funciona por fecha.

async function sessionsHasColumn(columnName) {
  // Heurística sin introspección: hacemos select limitado del campo; si falla, asumimos que no existe.
  try {
    const { error } = await supabase
      .from("sessions")
      .select(columnName)
      .eq("group_code", GROUP_CODE)
      .limit(1);
    return !error;
  } catch {
    return false;
  }
}

async function getNextSessionSeq(dateISO) {
  const date = cleanDate(dateISO);
  const hasSeq = await sessionsHasColumn("session_seq");
  if (!hasSeq) return 1;

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
 * Guarda equipos.
 * - Si existe session_seq -> crea NUEVA sesión (por defecto) y upsert por (group_code, session_date, session_seq)
 * - Si NO existe session_seq -> upsert por (group_code, session_date)
 */
export async function saveTeamsToHistory(session_date, totalPlayers, teamA, teamB, options = {}) {
  await requireSession();

  const date = cleanDate(session_date);
  const hasSeq = await sessionsHasColumn("session_seq");

  if (!hasSeq) {
    const payload = {
      group_code: GROUP_CODE,
      session_date: date,
      totalPlayers: Number(totalPlayers || 0),
      team_a: teamA || [],
      team_b: teamB || [],
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from("sessions")
      .upsert(payload, { onConflict: "group_code,session_date" });

    if (error) throw error;
    return { session_key: date, session_seq: 1 };
  }

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

  const { error } = await supabase
    .from("sessions")
    .upsert(payload, { onConflict: "group_code,session_date,session_seq" });

  if (error) throw error;
  return { session_key, session_seq: seq };
}

// ---------------- RESULTS (Turnos + Summary) ----------------
async function resultsHasColumn(columnName) {
  try {
    const { error } = await supabase
      .from("results")
      .select(columnName)
      .eq("group_code", GROUP_CODE)
      .limit(1);
    return !error;
  } catch {
    return false;
  }
}

/**
 * Guarda resultados.
 * - Si tu tabla results tiene session_seq/session_key -> guarda por sesión
 * - Si no -> guarda por fecha (clásico)
 *
 * Firma compatible con tu turns.js actual: saveResultsToHistory(dateISO, turns, scores, summary)
 */
export async function saveResultsToHistory(session_date, turns, scores, summary, options = {}) {
  await requireSession();

  const date = cleanDate(session_date);
  const hasSeq = await resultsHasColumn("session_seq");

  if (!hasSeq) {
    const payload = {
      group_code: GROUP_CODE,
      session_date: date,
      turns: turns || [],
      scores: scores || {},
      summary: summary || {},
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from("results")
      .upsert(payload, { onConflict: "group_code,session_date" });

    if (error) throw error;
    return;
  }

  // si hay columnas multi-sesión, intentamos amarrar a la sesión (si se pasa)
  let seq = options.session_seq ? Number(options.session_seq) : null;
  let session_key = options.session_key || null;

  if (!session_key && seq) session_key = makeSessionKey(date, seq);
  if (!seq && session_key) {
    const parts = String(session_key).split("-");
    const last = parts[parts.length - 1];
    const parsed = Number(last);
    if (!Number.isNaN(parsed)) seq = parsed;
  }

  // Si no especifican sesión, guardamos como "1" para mantener compatibilidad
  if (!seq) seq = 1;
  if (!session_key) session_key = makeSessionKey(date, seq);

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

// ---------------- HISTORY (clásico por fecha) ----------------
export async function listHistoryDates() {
  await requireSession();

  const { data, error } = await supabase
    .from("sessions")
    .select("session_date")
    .eq("group_code", GROUP_CODE)
    .order("session_date", { ascending: false });

  if (error) throw error;
  return data || [];
}

/**
 * getHistoryDetail(date) — compatible con tu turns.js y history.js viejos:
 * devuelve { session, results } del día.
 * Si hay multi-sesión, devuelve la última sesión del día (seq más alto).
 */
export async function getHistoryDetail(session_date) {
  await requireSession();

  const date = cleanDate(session_date);

  const hasSeq = await sessionsHasColumn("session_seq");

  let session = null;

  if (!hasSeq) {
    const { data: sessions, error: e1 } = await supabase
      .from("sessions")
      .select("*")
      .eq("group_code", GROUP_CODE)
      .eq("session_date", date)
      .limit(1);

    if (e1) throw e1;
    session = sessions?.[0] || null;
  } else {
    const { data: sessions, error: e1 } = await supabase
      .from("sessions")
      .select("*")
      .eq("group_code", GROUP_CODE)
      .eq("session_date", date)
      .order("session_seq", { ascending: false })
      .limit(1);

    if (e1) throw e1;
    session = sessions?.[0] || null;
  }

  const resultsHasSeq = await resultsHasColumn("session_seq");
  let results = null;

  if (!resultsHasSeq) {
    const { data: resultsRows, error: e2 } = await supabase
      .from("results")
      .select("*")
      .eq("group_code", GROUP_CODE)
      .eq("session_date", date)
      .limit(1);

    if (e2) throw e2;
    results = resultsRows?.[0] || null;
  } else {
    const seq = session?.session_seq ? Number(session.session_seq) : 1;
    const { data: resultsRows, error: e2 } = await supabase
      .from("results")
      .select("*")
      .eq("group_code", GROUP_CODE)
      .eq("session_date", date)
      .eq("session_seq", seq)
      .limit(1);

    if (e2) throw e2;
    results = resultsRows?.[0] || null;
  }

  return { session, results };
}

/**
 * Borra TODA la fecha: results + sessions
 * (si hay multi-sesión, borra todas las sesiones/seq del día)
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

// ---------------- HISTORY (multi-sesión opcional, para después) ----------------
export async function listHistorySessions() {
  await requireSession();

  const hasSeq = await sessionsHasColumn("session_seq");
  if (!hasSeq) {
    const rows = await listHistoryDates();
    return (rows || []).map((r) => ({
      session_date: String(r.session_date).slice(0, 10),
      session_seq: 1,
      session_key: String(r.session_date).slice(0, 10),
    }));
  }

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

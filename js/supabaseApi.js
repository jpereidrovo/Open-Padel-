// supabaseApi.js — API única para Open Padel (Supabase)
// Incluye: Auth, Players, Sessions (equipos), Results (turnos), History multi-sesión

import { supabase } from "./supabaseClient.js";

export const GROUP_CODE = "open-padel";

// ---------------- Helpers ----------------
function cleanDate(d) {
  return String(d || "").slice(0, 10);
}
function mkKey(dateISO, seq) {
  return `${cleanDate(dateISO)}-${Number(seq || 1)}`;
}

// ---------------- AUTH ----------------
export async function getSessionUser() {
  // solo local (estable)
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data?.session?.user || null;
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

// ---------------- Schema detection helpers ----------------
async function tableHasColumn(table, columnName) {
  // Intento “select column” con limit 1: si falla, no existe o no hay permiso
  const { error } = await supabase.from(table).select(columnName).limit(1);
  return !error;
}

async function getNextSeqForDate(dateISO) {
  const date = cleanDate(dateISO);

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

// ---------------- SESSIONS (Equipos) ----------------
export async function saveTeamsToHistory(session_date, totalPlayers, teamA, teamB, options = {}) {
  await requireSession();

  const date = cleanDate(session_date);
  const hasSeq = await tableHasColumn("sessions", "session_seq");
  const hasKey = await tableHasColumn("sessions", "session_key");

  // Modo viejo (solo fecha) si no existe schema multi
  if (!hasSeq || !hasKey) {
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

    return { session_date: date, session_seq: 1, session_key: date };
  }

  // Modo multi
  const seq = options.session_seq ? Number(options.session_seq) : await getNextSeqForDate(date);
  const key = mkKey(date, seq);

  const payload = {
    group_code: GROUP_CODE,
    session_date: date,
    session_seq: seq,
    session_key: key,
    totalPlayers: Number(totalPlayers || 0),
    team_a: teamA || [],
    team_b: teamB || [],
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from("sessions")
    .upsert(payload, { onConflict: "group_code,session_date,session_seq" });

  if (error) throw error;

  return { session_date: date, session_seq: seq, session_key: key };
}

// ---------------- RESULTS (Turnos + Summary) ----------------
export async function saveResultsToHistory(session_key, session_date, session_seq, turns, scores, summary) {
  await requireSession();

  const date = cleanDate(session_date);
  const hasSeq = await tableHasColumn("results", "session_seq");
  const hasKey = await tableHasColumn("results", "session_key");

  // Modo viejo (solo fecha)
  if (!hasSeq || !hasKey) {
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

  const seq = Number(session_seq || 1);
  const key = String(session_key || mkKey(date, seq));

  const payload = {
    group_code: GROUP_CODE,
    session_date: date,
    session_seq: seq,
    session_key: key,
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

// ---------------- HISTORY (multi-sesión) ----------------
export async function listHistorySessions() {
  await requireSession();

  const hasSeq = await tableHasColumn("sessions", "session_seq");
  const hasKey = await tableHasColumn("sessions", "session_key");

  // Modo viejo: lista por fecha
  if (!hasSeq || !hasKey) {
    const { data, error } = await supabase
      .from("sessions")
      .select("session_date")
      .eq("group_code", GROUP_CODE)
      .order("session_date", { ascending: false });

    if (error) throw error;

    return (data || []).map((r) => ({
      session_date: String(r.session_date).slice(0, 10),
      session_seq: 1,
      session_key: String(r.session_date).slice(0, 10),
    }));
  }

  // Modo multi: lista por fecha y seq
  const { data, error } = await supabase
    .from("sessions")
    .select("session_date, session_seq, session_key")
    .eq("group_code", GROUP_CODE)
    .order("session_date", { ascending: false })
    .order("session_seq", { ascending: false });

  if (error) throw error;

  return (data || []).map((r) => ({
    session_date: String(r.session_date).slice(0, 10),
    session_seq: Number(r.session_seq || 1),
    session_key: String(r.session_key || mkKey(r.session_date, r.session_seq)),
  }));
}

export async function getHistoryDetailByKey(session_key) {
  await requireSession();

  const key = String(session_key || "").trim();
  if (!key) throw new Error("session_key vacío.");

  // session
  const { data: sessions, error: e1 } = await supabase
    .from("sessions")
    .select("*")
    .eq("group_code", GROUP_CODE)
    .eq("session_key", key)
    .limit(1);

  if (e1) throw e1;
  const session = sessions?.[0] || null;

  // results
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

export async function deleteHistoryByKey(session_key) {
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

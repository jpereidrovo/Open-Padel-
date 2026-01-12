// supabaseApi.js — API única para Open Padel (Supabase)
// Auth, Players, Sessions, Results, History + Delete
// ✅ IMPORTANTE: guardado "upsert manual" (sin ON CONFLICT) para evitar error de UNIQUE

import { supabase } from "./supabaseClient.js";

export const GROUP_CODE = "open-padel";

function cleanDate(d) {
  return String(d || "").slice(0, 10);
}

// ---------------- AUTH ----------------
export async function getSessionUser() {
  const { data: s1, error: e1 } = await supabase.auth.getSession();
  if (e1) throw e1;
  return s1?.session?.user || null;
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
      queryParams: { access_type: "offline", prompt: "consent" }
    }
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
    updated_at: new Date().toISOString()
  };

  if (!payload.id) delete payload.id;

  const { error } = await supabase
    .from("players")
    .upsert(payload, { onConflict: "id" });

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

  const { error } = await supabase
    .from("players")
    .delete()
    .eq("group_code", GROUP_CODE);

  if (error) throw error;
}

// ---------------- SESSIONS (Equipos) ----------------
// ✅ guardado sin ON CONFLICT (update si existe, insert si no)
export async function saveTeamsToHistory(session_date, totalPlayers, teamA, teamB) {
  await requireSession();

  const date = cleanDate(session_date);

  const payload = {
    group_code: GROUP_CODE,
    session_date: date,
    totalPlayers: Number(totalPlayers || 0),
    team_a: teamA || [],
    team_b: teamB || [],
    updated_at: new Date().toISOString()
  };

  // 1) buscar existente
  const { data: existing, error: e0 } = await supabase
    .from("sessions")
    .select("id")
    .eq("group_code", GROUP_CODE)
    .eq("session_date", date)
    .maybeSingle();

  if (e0) throw e0;

  if (existing?.id) {
    // 2) update
    const { error: e1 } = await supabase
      .from("sessions")
      .update(payload)
      .eq("id", existing.id);
    if (e1) throw e1;
    return;
  }

  // 3) insert
  const { error: e2 } = await supabase
    .from("sessions")
    .insert(payload);

  if (e2) throw e2;
}

// ---------------- RESULTS (Turnos + Summary) ----------------
// ✅ guardado sin ON CONFLICT (update si existe, insert si no)
export async function saveResultsToHistory(session_date, turns, scores, summary) {
  await requireSession();

  const date = cleanDate(session_date);

  const payload = {
    group_code: GROUP_CODE,
    session_date: date,
    turns: turns || [],
    scores: scores || {},
    summary: summary || {},
    updated_at: new Date().toISOString()
  };

  // 1) buscar existente
  const { data: existing, error: e0 } = await supabase
    .from("results")
    .select("id")
    .eq("group_code", GROUP_CODE)
    .eq("session_date", date)
    .maybeSingle();

  if (e0) throw e0;

  if (existing?.id) {
    // 2) update
    const { error: e1 } = await supabase
      .from("results")
      .update(payload)
      .eq("id", existing.id);
    if (e1) throw e1;
    return;
  }

  // 3) insert
  const { error: e2 } = await supabase
    .from("results")
    .insert(payload);

  if (e2) throw e2;
}

// ---------------- HISTORY ----------------
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

export async function getHistoryDetail(session_date) {
  await requireSession();

  const date = cleanDate(session_date);

  const { data: sessions, error: e1 } = await supabase
    .from("sessions")
    .select("*")
    .eq("group_code", GROUP_CODE)
    .eq("session_date", date)
    .limit(1);

  if (e1) throw e1;

  const session = sessions?.[0] || null;

  const { data: resultsRows, error: e2 } = await supabase
    .from("results")
    .select("*")
    .eq("group_code", GROUP_CODE)
    .eq("session_date", date)
    .limit(1);

  if (e2) throw e2;

  const results = resultsRows?.[0] || null;

  return { session, results };
}

// ✅ BORRAR COMPLETO: results + sessions
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
// supabaseApi.js — API única para Open Padel (Supabase)
// Auth, Players, Sessions, Results, History + Delete

import { supabase } from "./supabaseClient.js";

export const GROUP_CODE = "open-padel";

function cleanDate(d) {
  return String(d || "").slice(0, 10);
}

// ---------------- AUTH ----------------
export async function getSessionUser() {
  const { data: s1, error: e1 } = await supabase.auth.getSession();
  if (e1) throw e1;
  return s1?.session?.user || null;
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
      queryParams: { access_type: "offline", prompt: "consent" }
    }
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
    updated_at: new Date().toISOString()
  };

  if (!payload.id) delete payload.id;

  const { error } = await supabase
    .from("players")
    .upsert(payload, { onConflict: "id" });

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

  const { error } = await supabase
    .from("players")
    .delete()
    .eq("group_code", GROUP_CODE);

  if (error) throw error;
}

// ---------------- SESSIONS (Equipos) ----------------
export async function saveTeamsToHistory(session_date, totalPlayers, teamA, teamB) {
  await requireSession();

  const date = cleanDate(session_date);

  const payload = {
    group_code: GROUP_CODE,
    session_date: date,
    totalPlayers: Number(totalPlayers || 0),
    team_a: teamA || [],
    team_b: teamB || [],
    updated_at: new Date().toISOString()
  };

  const { error } = await supabase
    .from("sessions")
    .upsert(payload, { onConflict: "group_code,session_date" });

  if (error) throw error;
}

// ---------------- RESULTS (Turnos + Summary) ----------------
export async function saveResultsToHistory(session_date, turns, scores, summary) {
  await requireSession();

  const date = cleanDate(session_date);

  const payload = {
    group_code: GROUP_CODE,
    session_date: date,
    turns: turns || [],
    scores: scores || {},
    summary: summary || {},
    updated_at: new Date().toISOString()
  };

  const { error } = await supabase
    .from("results")
    .upsert(payload, { onConflict: "group_code,session_date" });

  if (error) throw error;
}

// ---------------- HISTORY ----------------
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

export async function getHistoryDetail(session_date) {
  await requireSession();

  const date = cleanDate(session_date);

  const { data: sessions, error: e1 } = await supabase
    .from("sessions")
    .select("*")
    .eq("group_code", GROUP_CODE)
    .eq("session_date", date)
    .limit(1);

  if (e1) throw e1;

  const session = sessions?.[0] || null;

  const { data: resultsRows, error: e2 } = await supabase
    .from("results")
    .select("*")
    .eq("group_code", GROUP_CODE)
    .eq("session_date", date)
    .limit(1);

  if (e2) throw e2;

  const results = resultsRows?.[0] || null;

  return { session, results };
}

// ✅ BORRAR COMPLETO: results + sessions (y debe desaparecer la fecha)
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

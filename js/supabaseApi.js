// supabaseApi.js — API única para Open Padel (Supabase)
// Incluye: Auth Google (redirect GitHub Pages), Players CRUD, Sessions (equipos), Results (turnos), History + delete

import { supabase } from "./supabaseClient.js";

export const GROUP_CODE = "open-padel";

// ---- Helpers ----
function cleanDate(d) {
  return String(d || "").slice(0, 10);
}

export async function getSessionUser() {
  // Siempre intentar leer sesión local primero
  const { data: s1, error: e1 } = await supabase.auth.getSession();
  if (e1) throw e1;
  if (s1?.session?.user) return s1.session.user;

  // Si no hay, pedir user (a veces se resuelve aquí)
  const { data: u, error: e2 } = await supabase.auth.getUser();
  if (e2) return null;
  return u?.user || null;
}

export async function requireSession() {
  const user = await getSessionUser();
  if (!user) throw new Error("No hay sesión. Inicia sesión con Google.");
  return user;
}

// ---- AUTH ----
export async function signInWithGoogle() {
  // ✅ Muy importante en GitHub Pages:
  // window.location.origin + window.location.pathname => https://usuario.github.io/repo/
  // Esto evita errores por rutas y hace que vuelva a tu app
  const redirectTo = window.location.origin + window.location.pathname;

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo,
      queryParams: {
        access_type: "offline",
        prompt: "consent"
      }
    }
  });

  if (error) throw error;

  // Nota: en redirect flow, normalmente navegará automáticamente.
  // data.url existe si quieres redirigir manualmente, pero supabase lo hace.
  return data;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

// ---- PLAYERS ----
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
    // rating puede ser 0.5, 1.0, 1.5...
    rating: Number(player.rating),
    group_code: GROUP_CODE,
    updated_at: new Date().toISOString()
  };

  // No mandar id si es nuevo
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

// ---- SESSIONS (Equipos) ----
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

  // upsert por unique(group_code, session_date)
  const { error } = await supabase
    .from("sessions")
    .upsert(payload, { onConflict: "group_code,session_date" });

  if (error) throw error;
}

// ---- RESULTS (Turnos + Summary) ----
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

  // upsert por unique(group_code, session_date)
  const { error } = await supabase
    .from("results")
    .upsert(payload, { onConflict: "group_code,session_date" });

  if (error) throw error;
}

// ---- HISTORY ----
export async function listHistoryDates() {
  await requireSession();

  // Tomamos fechas desde sessions (es la “base” del historial)
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

  const session = (sessions && sessions[0]) ? sessions[0] : null;

  const { data: resultsRows, error: e2 } = await supabase
    .from("results")
    .select("*")
    .eq("group_code", GROUP_CODE)
    .eq("session_date", date)
    .limit(1);

  if (e2) throw e2;

  const results = (resultsRows && resultsRows[0]) ? resultsRows[0] : null;

  return { session, results };
}

// ---- DELETE HISTORY DATE ----
export async function deleteHistoryDate(session_date) {
  await requireSession();

  const date = cleanDate(session_date);

  // borrar results primero
  const { error: e1 } = await supabase
    .from("results")
    .delete()
    .eq("group_code", GROUP_CODE)
    .eq("session_date", date);

  if (e1) throw e1;

  // borrar sessions (esto elimina la fecha del historial)
  const { error: e2 } = await supabase
    .from("sessions")
    .delete()
    .eq("group_code", GROUP_CODE)
    .eq("session_date", date);

  if (e2) throw e2;
}
